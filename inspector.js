'use strict';
const $ = id => document.getElementById(id);
const captures = [];
const recordings = [];
const coverageHistory = [];
let tabId = null, busy = false, recording = false;
let recordedFrames = new Map();
let pollTimer = null, sessionTimeout = null, pollBusy = false, recordingStartedAt = null, recordingMode = 'idle';
let lastInventory = [], lastCoverageError = null, traceBefore = [];
const TRACE_VERSION = '3.4.0';
const DEEP_SCHEMA = 1;
let sessionPhase='manual-reference', sessionId=null;
const status = message => { $('status').textContent = message; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = (value, size = 110) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, size);

let sourceOrigin=null, recorderError=null, releaseLock=null, stopRequested=false, sourceLost=false, permissionPending=false;
const ordinaryUrl=url=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)&&u.hostname!=='chromewebstore.google.com'&&!(u.hostname==='chrome.google.com'&&u.pathname.startsWith('/webstore'));}catch{return false;}};
const permissionPattern=origin=>/^https:\/\/[^/*]+$/.test(origin||'')&&!origin.includes('*')?origin+'/*':
  /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin||'')?origin+'/*':null;
async function hasHostAccess(pattern) {
  if(!pattern)return null;
  try{return await chrome.permissions.contains({origins:[pattern]});}catch{return null;}
}
async function connect() {
  const raw=new URLSearchParams(location.search).get('tabId'), provided=Number(raw);
  const tab=raw ? (Number.isInteger(provided)&&provided>0?await chrome.tabs.get(provided):null) :
    (await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0];
  if(!tab||!ordinaryUrl(tab.url))throw Error('Select an ordinary HTTP(S) website and reopen Inspector from that tab.');
  tabId=tab.id;sourceOrigin=new URL(tab.url).origin;
  $('source').textContent='Tab #'+tabId+' · '+sourceOrigin;
  status('Idle. Bound to this tab. Start recording explicitly; switching tabs does not change the source.');
}
async function getFrames() {
  if(!tabId)await connected;
  if(!tabId)throw Error('No source tab selected. Reopen Inspector from the desired website.');
  const tab=await chrome.tabs.get(tabId);
  if(!ordinaryUrl(tab.url))throw Error('The source tab is now restricted.');
  return (await chrome.webNavigation.getAllFrames({tabId}))||[{frameId:0,parentFrameId:-1,url:tab.url}];
}
async function sendFrame(id, type, allowInject = true, extra = {}) {
  try {
    try {
      const response=await chrome.tabs.sendMessage(tabId, {type,...extra}, {frameId:id});
      if(response!==undefined&&response!==null)return response;
      if(!allowInject)return {ok:false,reason:'documentUnavailable',error:'Frame did not respond to the Inspector message.'};
    }
    catch (first) {
      if (!allowInject) throw first;
    }
    await chrome.scripting.executeScript({target:{tabId,frameIds:[id]},files:['inspector-generic.js','inspector-content.js']});
    const response=await chrome.tabs.sendMessage(tabId, {type,...extra}, {frameId:id});
    return response??{ok:false,reason:'documentUnavailable',error:'Frame did not respond after Inspector injection.'};
  } catch (error) {
    const text=String(error?.message||error);
    const reason=/permission|cannot access|not allowed|restricted|extensions gallery/i.test(text)?'permissionDenied':
      /no tab|no frame|frame.*removed|frame.*not found/i.test(text)?'documentUnavailable':'injectionOrMessagingFailed';
    return {ok:false,reason,error:reason==='permissionDenied'?'Chrome denied access to this document.':
      reason==='documentUnavailable'?'The frame or tab is no longer available.':'Recorder injection or messaging failed.'};
  }
}
function traceBelongs(result,instance){
  const observed=result?.instanceId||result?.frame?.instanceId;
  return !!result&&(!observed||observed===instance)&&
    (!result.context?.sessionId||result.context.sessionId===sessionId);
}
async function getInventory() {
  const discovered = await getFrames();
  const nav=discovered.slice(0,32);
  const mapped = new Map(nav.map(f => [f.frameId, {frameId:f.frameId,parentFrameId:f.parentFrameId ?? -1, fromNavigation:true}]));
  let injectionError=null;
  // Probe individually so one denied document cannot hide accessible siblings.
  await Promise.all([...mapped.values()].map(async frame=>{
    const navFrame=nav.find(f=>f.frameId===frame.frameId);
    try{const url=new URL(navFrame?.url);frame.origin=/^https?:$/.test(url.protocol)&&!url.hostname.includes('*')?url.origin:null;}catch{frame.origin=null;}
    if(frame.frameId===0&&!frame.origin)frame.origin=sourceOrigin;
    frame.documentId=navFrame?.documentId||null;
    frame.permissionPattern=permissionPattern(frame.origin);
    const explicitAccess=await hasHostAccess(frame.permissionPattern);
    frame.permission=explicitAccess===true?'granted':
      frame.frameId===0&&frame.origin===sourceOrigin?'activeTab':
      !frame.permissionPattern?'originUnavailable':'needsApproval';
    // An already installed content listener can reply without a fresh injection.
    // Inject cross-origin scripts only after Chrome confirms the explicit host grant.
    const probe=await sendFrame(frame.frameId,'SPARK_INSPECT_PROBE',
      frame.permission==='activeTab'||frame.permission==='granted'||frame.permission==='originUnavailable');
    if(probe?.ok)Object.assign(frame,probe.result,{accessible:true});
    else if(frame.permission==='needsApproval')Object.assign(frame,{accessible:false,reason:'permissionDenied',error:'Host permission required. Use Allow inaccessible frame origins.'});
    else {
      Object.assign(frame,{accessible:false,reason:probe?.reason||'documentUnavailable',error:probe?.error||'Document unavailable'});
      // activeTab is temporary. Offer an explicit source-origin grant if a
      // separately opened Inspector cannot contact the source document.
      if(frame.permission==='activeTab'&&explicitAccess===false&&frame.permissionPattern)
        frame.permission='needsApproval';
    }
  }));
  const result=[...mapped.values()].sort((a,b)=>a.frameId-b.frameId);
  const inaccessible=result.filter(f=>!f.accessible);
  injectionError=inaccessible.length?inaccessible.length+' frame(s) inaccessible; grant listed origins or inspect available frames.':null;
  if(discovered.length>32)injectionError=(injectionError||'')+' Frame discovery clipped at 32 of '+discovered.length+' documents.';
  lastInventory = result;
  lastCoverageError = injectionError;
  const widgets = result.reduce((sum,f) => sum+(f.correctionWidgets || 0),0);
  const interactions = result.reduce((sum,f) => sum+(f.interactionCount || 0),0);
  const applicationFrames=result.filter(f=>f.accessible&&(f.interactionCount>0||f.correctionWidgets>0));
  $('coverage').textContent = `${discovered.length} frame(s) · ${result.filter(f=>f.accessible).length} accessible · ${result.filter(f=>!f.accessible).length} inaccessible · ${applicationFrames.length} application frame(s) · ${interactions} interaction(s) · ${widgets} correction widget(s)`;
  $('source').textContent='Tab #'+tabId+' · '+sourceOrigin+' · Adapter: '+([...new Set(result.filter(f=>f.accessible).map(f=>f.adapter||'ngl'))].join(', ')||'unavailable');
  $('framePreview').textContent = JSON.stringify({tabId,frames:result,probeError:injectionError},null,2);
  const missing=[...new Set(result.filter(f=>!f.accessible&&f.permission==='needsApproval'&&f.permissionPattern).map(f=>f.permissionPattern))];
  if($('permissionStatus'))$('permissionStatus').textContent=missing.length?
    'Request access for these frame origins: '+missing.join(', ')+(result.some(f=>f.frameId===0&&f.permission==='needsApproval')?' (source document did not respond; this is a recovery attempt, not a confirmed permission cause).':'') :
    (inaccessible.length?'No requestable missing origin was identified; inspect frame errors.':'All discovered frames accessible.');
  return result;
}
function updateButtons() {
  $('startTrace').disabled = busy || recording;
  $('stopTrace').disabled = busy || !recording;
  $('capture').disabled = busy;
  $('export').disabled = busy;
  if ($('selectExports')) $('selectExports').disabled = busy;
  $('clear').disabled = busy;
  $('recordState').textContent = recording ?
    (recordingMode === 'active' ? `Recording in ${[...recordedFrames.values()].filter(f=>!f.lostOnReload).length} exercise iframe(s)` : 'Waiting for exercise iframe…') : (recorderError?'Error':recordings.length?'Stopped':'Idle');
  $('recordCount').textContent = String(recordings.length);
  if($('eventCount'))$('eventCount').textContent=String(recordings.reduce((n,r)=>n+r.frames.reduce((k,f)=>k+(f.eventCount||0),0),0)+[...recordedFrames.values()].reduce((n,f)=>n+(f.cachedTrace?.eventCount||0),0));
  $('clear').disabled=busy||recording;
  if($('grantFrames'))$('grantFrames').disabled=busy||recording||permissionPending||!lastInventory.some(f=>!f.accessible&&f.permission==='needsApproval'&&f.permissionPattern);
}
async function withBusy(task) {
  if (busy) return;
  busy = true; updateButtons();
  try {await task();} catch (error) {recorderError=clean(error.message,180);status(`Error: ${recorderError}`);}
  finally {busy=false;if(stopRequested&&recording)await finishRecording();updateButtons();}
}
function addCoverageRecord(event, inventory) {
  const record = {at:new Date().toISOString(),event,frameCount:inventory.length,
    accessibleCount:inventory.filter(f=>f.accessible).length,
    correctionFrames:inventory.filter(f=>f.correctionWidgets>0).map(f=>({frameId:f.frameId,title:f.title,url:f.url,correctionWidgets:f.correctionWidgets})),
    exerciseFrames:inventory.filter(f=>f.interactionCount>0).map(f=>({frameId:f.frameId,title:f.title,url:f.url,interactionCount:f.interactionCount,interactionTypes:f.interactionTypes||[]})),
    errors:lastCoverageError};
  // Preserve transitions only, not a repetitive polling log.
  const previous = coverageHistory[coverageHistory.length-1];
  if (event !== 'poll' || !previous || JSON.stringify({...previous,at:null}) !== JSON.stringify({...record,at:null})) {
    if (coverageHistory.length >= 50) coverageHistory.shift();
    coverageHistory.push(record);
  }
}
async function snapshotFrames(inventory) {
  return Promise.all(inventory.map(async frame => {
    const response=frame.accessible ? await sendFrame(frame.frameId,'SPARK_INSPECT_CAPTURE',false) :
      {ok:false,reason:frame.reason,error:frame.error||'Document inaccessible; capture not attempted.'};
    return {frameId:frame.frameId,parentFrameId:frame.parentFrameId ?? -1,
      ...(response?.ok ? response.result : {reason:response?.reason||'documentUnavailable',error:response?.error || 'No response'})};
  }));
}
async function capture() {
  await withBusy(async () => {
    const inventory = await getInventory();
    addCoverageRecord('capture',inventory);
    const inspected = await snapshotFrames(inventory);
    const captureData = {phase:$('capturePhase')?.value || 'initial-capture',label:`screen-${captures.length + 1}`,timestamp:new Date().toISOString(),frames:inspected};
    if(captures.length>=8)throw Error('Capture limit reached. Export and Clear before capturing more.');
    captures.push(captureData);
    $('count').textContent = String(captures.length);
    const li=document.createElement('li');
    const found=inspected.filter(f=>f.summary?.interactionCount);
    li.textContent=`${captureData.label} · ${found.map(f=>`${f.title}: ${f.summary.interactionCount} interactions [${f.summary.types.join(', ')}]`).join(' | ') || 'No interactions detected (check frame coverage)'}`;
    $('captures').append(li);
    $('preview').textContent=JSON.stringify({label:captureData.label,frames:inspected.map(f=>({frameId:f.frameId,title:f.title,summary:f.summary,error:f.error}))},null,2);
    status(found.length ? `Captured ${captures.length} screen(s). Change screen in Spark and capture again.` : 'Captured, but no exercise interactions were found. Check iframe coverage below.');
  });
}
async function pollFrameCoverage() {
  if (!recording || pollBusy) return;
  pollBusy=true;
  try {
    const inventory = await getInventory();
    if(!recording)return;
    addCoverageRecord('poll',inventory);
    const exerciseFrames = inventory.filter(f=>f.accessible && ((f.adapter&&f.adapter!=='ngl') || f.interactionCount>0));
    for (const frame of exerciseFrames) {
      const probe = await sendFrame(frame.frameId,'SPARK_INSPECT_PROBE');
      if (!probe?.ok) continue;
      const instance = probe.result.instanceId;
      const previous = recordedFrames.get(frame.frameId);
      if (!recording) break;
      if (previous?.instanceId === instance) {
        // Keep a rolling snapshot so a frame reload cannot erase an entire diagnostic trace.
        const latest = await sendFrame(frame.frameId,'SPARK_INSPECT_TRACE_GET',false);
        if (latest?.ok&&traceBelongs(latest.result,instance)){previous.cachedTrace=latest.result;previous.lastConfirmedActive=latest.result.active===true;previous.lastConfirmedAt=new Date().toISOString();}else previous.pollError='Trace unavailable or document/session identity changed';
        continue;
      }
      const started = await sendFrame(frame.frameId,'SPARK_INSPECT_TRACE_START',true,{context:{sessionId,phase:sessionPhase,frameId:frame.frameId}});
      if (!started?.ok) continue;
      if(started.alreadyActive){recorderError='Frame already belongs to another recording; stop that Inspector first.';stopRequested=true;break;}
      if(!recording){await sendFrame(frame.frameId,'SPARK_INSPECT_TRACE_STOP',false,{expectedSessionId:sessionId});break;}
      if (previous && previous.instanceId !== instance) {
        previous.lostOnReload = true;
        // Preserve old generation diagnostics. A later navigation cannot restore its trace.
        recordedFrames.set(`${frame.frameId}:old:${previous.instanceId}`,previous);
      }
      const firstTrace=await sendFrame(frame.frameId,'SPARK_INSPECT_TRACE_GET',false);
      if(firstTrace?.ok&&!traceBelongs(firstTrace.result,instance)){recorderError='Document/session identity changed while attaching.';stopRequested=true;break;}
      recordedFrames.set(frame.frameId,{
        frameId:frame.frameId,parentFrameId:frame.parentFrameId ?? -1,instanceId:instance,
        cachedTrace:firstTrace?.ok?firstTrace.result:null,observerStart:started.observation||null,title:frame.title,url:frame.url,interactionTypes:frame.interactionTypes||[],attachedAt:new Date().toISOString()
      });
      if(recordedFrames.size>=64){recorderError='Document generation limit reached; partial evidence retained.';stopRequested=true;break;}
    }
    const attached = [...recordedFrames.values()].filter(f=>!f.lostOnReload);
    if (attached.length) {
      recordingMode='active';
      status(`Recording in ${attached.length} exercise frame(s). Perform one normal answer interaction, then Stop recording.`);
    } else {
      recordingMode='waiting';
      status('Waiting: no accessible exercise interaction detected. Open the desired exercise and wait until coverage shows 1+ interaction before editing.');
    }
    updateButtons();
  } catch (error) {status(`Recorder coverage error: ${error.message}`);}
  finally {pollBusy=false;if(stopRequested&&recording&&!busy)await stopRecording();}
}
async function startRecording() {
  if(recording)return;
  await withBusy(async () => {
    const initialInventory=await getInventory();
    const noAccess=!initialInventory.some(f=>f.accessible);
    if(noAccess){
      addCoverageRecord('recording-unavailable',initialInventory);
      recorderError='Recording unavailable: 0 accessible frames. Allow the listed origins, then retry Start. Export JSON to share coverage diagnostics.';
      status(recorderError);
      return;
    }
    if(recordings.length>=8)throw Error('Session limit reached. Export and Clear before recording more.');
    if(globalThis.navigator?.locks){
      const acquired=await new Promise(resolve=>navigator.locks.request('spark-inspector-tab-'+tabId,{ifAvailable:true},async lock=>{
        if(!lock){resolve(false);return;}
        await new Promise(release=>{releaseLock=release;resolve(true);});
      }).catch(()=>resolve(false)));
      if(!acquired)throw Error('This tab is already recording in another Inspector window. Stop it first.');
    }
    recorderError=null;stopRequested=false;sourceLost=false;
    sourceOrigin=new URL((await chrome.tabs.get(tabId)).url).origin;
    recordedFrames = new Map();
    recordingStartedAt = new Date().toISOString();
    sessionPhase=$('phase')?.value || 'manual-reference';
    sessionId='session-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    recordingMode='waiting';
    recording=true;
    await pollFrameCoverage();
    traceBefore = await snapshotFrames(lastInventory);
    if(stopRequested){await finishRecording();return;}
    pollTimer=setInterval(() => {void pollFrameCoverage();},850);
    sessionTimeout=setTimeout(() => {if(recording) void stopRecording();},180000);
    updateButtons();
  });
}
async function finishRecording() {
  if (!recording) return;
  recording=false;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer=null;
  if (sessionTimeout) clearTimeout(sessionTimeout);
  sessionTimeout=null;
  // Let any in-progress coverage poll finish before collecting frames.
  for (let i=0;i<15 && pollBusy;i++) await sleep(40);
  const frames=[...recordedFrames.values()];
  const fetched=await Promise.all(frames.map(async f=>{
    const {cachedTrace,...meta}=f;
    if (f.lostOnReload || sourceLost) return {...meta,...(cachedTrace || {eventCount:0,events:[]}),warning:'Document changed or tab closed; recovered the last available partial trace.'};
    const probe=await sendFrame(f.frameId,'SPARK_INSPECT_PROBE',false);
    if(!probe?.ok||probe.result.instanceId!==f.instanceId)
      return {...meta,...(cachedTrace||{eventCount:0,events:[]}),warning:'Document generation changed; final boundary unavailable.'};
    await sendFrame(f.frameId,'SPARK_INSPECT_TRACE_STOP',false,{expectedSessionId:sessionId});
    const response=await sendFrame(f.frameId,'SPARK_INSPECT_TRACE_GET',false);
    return {...meta,...(response?.ok&&traceBelongs(response.result,f.instanceId) ? response.result : {...(cachedTrace||{eventCount:0,events:[]}),error:'Trace unavailable or document/session identity changed'})};
  }));
  const meaningful=fetched.filter(f=>{
    const events=f.events || [];
    // General trace means the user interacted, not that an answer was graded correct.
    return events.some(e=>['click','input','change','drop','dragend','pointerup','keydown','submit'].includes(e.type));
  });
  let traceAfter=[];
  if(!sourceLost)try {traceAfter = await snapshotFrames(await getInventory());} catch {}
  const total=meaningful.reduce((sum,f)=>sum+(f.eventCount||0),0);
  const saved={sessionId,phase:sessionPhase,phaseEvidence:'operator-declared; not actor attribution',label:`interaction-${recordings.length+1}`,timestamp:new Date().toISOString(),startedAt:recordingStartedAt,
    verified:meaningful.length>0,
    verificationScope:'interaction-events-observed-only; not answer correctness',
    warning:meaningful.length ? null : 'No exercise interaction events were recorded. Inspect the before/after snapshots and frame coverage; retry with the exercise visible.',
    frames:fetched,coverage:coverageHistory.slice(),screens:{before:traceBefore,after:traceAfter}};
  recordings.push(saved);
  releaseLock?.();releaseLock=null;
  recordedFrames=new Map();traceBefore=[];recordingMode='idle';
  if (meaningful.length) status(`Saved ${total} events from ${meaningful.length} exercise frame(s), plus before/after screen snapshots. Export JSON.`);
  else status('No exercise interaction recorded. Before/after screen snapshots were saved; check frame diagnostics and retry.');
  if(recorderError)status('Error: '+recorderError+' Partial evidence was retained.');
}
async function stopRecording() {stopRequested=true;if(!busy)await withBusy(finishRecording);}
async function exportJSON() {
  await withBusy(async () => {
    if (!captures.length && !recordings.length && !recording && !coverageHistory.length) {status('Capture a screen or check recording coverage before exporting.');return;}
    const exporter = globalThis.SparkInspectorExport;
    // Picker is invoked before any awaited recording work, while click activation remains.
    const destination = exporter ? await exporter.prepareDestination() : null;
    if (recording) await finishRecording();
    const appCoverage=lastInventory.filter(f=>f.accessible&&(f.interactionCount>0||f.correctionWidgets>0)).length;
    const data={schemaVersion:'2.0',session:{sessionId,tabId,startedAt:recordingStartedAt,endedAt:new Date().toISOString(),topLevelOrigin:sourceOrigin},site:{adapter:lastInventory.some(f=>f.adapter==='ngl')?'ngl':'generic',adapters:[...new Set(lastInventory.filter(f=>f.accessible).map(f=>f.adapter||'ngl'))],detectionConfidence:'DOM signals; not answer evidence'},frames:lastInventory,diagnostics:coverageHistory,warnings:lastInventory.filter(f=>!f.accessible).map(f=>({frameId:f.frameId,reason:f.reason})),summary:{recordings:recordings.length,captures:captures.length,accessibleApplicationFrames:appCoverage,observedEvents:recordings.reduce((n,r)=>n+r.frames.reduce((m,f)=>m+(f.eventCount||0),0),0),verifiedRecordingCount:recordings.filter(r=>r.verified).length},tool:'Spark Exercise Inspector',version:TRACE_VERSION,exportedAt:new Date().toISOString(),
      deepSchema:DEEP_SCHEMA,sourceTabId:tabId,framesLastSeen:lastInventory,frameProbeError:lastCoverageError,coverage:coverageHistory,captures,recordings};
    data.events=recordings.flatMap(r=>r.frames.flatMap(f=>(f.events||[]).map(e=>({...e,frameId:f.frameId,sessionId:r.sessionId}))));
    if(lastCoverageError)data.warnings.push({reason:'coverageWarning',detail:lastCoverageError});
    if(new Blob([JSON.stringify(data,null,2),'\n']).size>24000000)throw Error('Export exceeds 24 MB. Clear and record a shorter session with fewer frames.');
    if (exporter) {
      const result = await exporter.writeJSON(destination,data);
      const location = result.kind === 'directory' ? `Saved ${result.name} in the selected exports folder.` :
        result.kind === 'save-as' ? `Saved ${result.name} using Save As. Confirm its location is inspector-data/exports.` :
          `Downloaded ${result.name} using browser download settings. Move/import the file into inspector-data/exports before analysis.`;
      status(`${location} ${captures.length} screen(s), ${recordings.length} recording(s). Review values before sharing.`);
    } else {
      // Compatibility path for older test harnesses without the export module.
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=`spark-exercise-inspections-${Date.now()}.json`;
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      status('Browser download initiated. Move the JSON into inspector-data/exports for analysis.');
    }
  });
}
async function selectExports() {
  await withBusy(async () => {
    const exporter = globalThis.SparkInspectorExport;
    if (!exporter) throw Error('Inspector export support is not loaded.');
    const result = await exporter.chooseDirectory();
    $('folderStatus').textContent = `Selected folder: ${result.name}. ${result.storageWarning || 'Selection saved for later Inspector sessions when Chrome allows.'}`;
    status('Export JSON now writes directly into the chosen folder when write permission remains granted.');
  });
}
async function clearAll() {
  await withBusy(async () => {
    if (recording) await finishRecording();
    let frameIds=[];
    try {frameIds=(await getFrames()).map(f=>f.frameId);} catch {}
    const ownedSessions=new Set(recordings.map(r=>r.sessionId));
    await Promise.all([...new Set(frameIds)].map(async id=>{
      const trace=await sendFrame(id,'SPARK_INSPECT_TRACE_GET',false);
      if(trace?.ok&&ownedSessions.has(trace.result?.context?.sessionId))
        await sendFrame(id,'SPARK_INSPECT_TRACE_CLEAR',false,{expectedSessionId:trace.result.context.sessionId});
    }));
    captures.length=0;recordings.length=0;coverageHistory.length=0;recordedFrames=new Map();traceBefore=[];
    $('captures').replaceChildren();$('count').textContent='0';$('preview').textContent='No captures yet.';
    status('Captures and interaction recordings cleared.');
  });
}
$('capture').addEventListener('click',capture);
$('startTrace').addEventListener('click',startRecording);
$('stopTrace').addEventListener('click',stopRecording);
$('export').addEventListener('click',exportJSON);
$('selectExports')?.addEventListener('click',selectExports);
$('clear').addEventListener('click',clearAll);
updateButtons();
if (globalThis.SparkInspectorExport) {
  globalThis.SparkInspectorExport.initialized.then(() => {
    const selected = globalThis.SparkInspectorExport.currentDirectory();
    $('folderStatus').textContent = selected ? `Remembered folder: ${selected}. Chrome may request write permission again.` :
      'No export folder selected. Export JSON opens Save As (or a browser download fallback).';
  });
}
const connected=connect().catch(error=>{recorderError=clean(error.message,180);status('Error: '+recorderError);updateButtons();});
chrome.webNavigation.onCommitted?.addListener(details=>{
  if(details.tabId===tabId&&details.frameId===0&&recording){
    sourceLost=true;
    status('Source tab navigated/reloaded. Stopping; cached evidence is retained. Start a new recording explicitly.');
    void stopRecording();
  }
});
chrome.tabs.onRemoved?.addListener(id=>{if(id===tabId&&recording){sourceLost=true;void stopRecording();}});
if(globalThis.addEventListener)addEventListener('pagehide',()=>{for(const f of recordedFrames.values())if(!f.lostOnReload)void sendFrame(f.frameId,'SPARK_INSPECT_TRACE_STOP',false,{expectedSessionId:sessionId});releaseLock?.();},{once:true});
$('grantFrames')?.addEventListener('click',()=>{
  if(permissionPending||busy||recording)return;
  const origins=[...new Set(lastInventory.filter(f=>!f.accessible&&f.permission==='needsApproval'&&f.permissionPattern).map(f=>f.permissionPattern))];
  if(!origins.length){status('No requestable blocked origins. Inspect individual frame errors.');return;}
  permissionPending=true;updateButtons();
  // Call request directly in the button gesture to retain Chrome user activation.
  void chrome.permissions.request({origins}).then(async granted=>{
    if(!granted){status('Access denied for '+origins.join(', ')+'. Recording coverage is incomplete.');return;}
    await withBusy(async()=>{
      const inventory=await getInventory();
      addCoverageRecord('permission-recheck',inventory);
      const accessible=inventory.filter(f=>f.accessible).length;
      const applicationAccessible=accessible>0;
      recorderError=applicationAccessible?null:'Recording unavailable: 0 accessible frames. Inspect remaining frame errors.';
      status(`Permission granted; rescanned: ${accessible}/${inventory.length} frame(s) accessible. ${applicationAccessible?'Start recording and verify events are captured.':recorderError}`);
    });
  }).catch(error=>status('Permission request failed: '+clean(error.message,180)))
    .finally(()=>{permissionPending=false;updateButtons();});
});
