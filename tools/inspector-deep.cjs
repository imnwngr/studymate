'use strict';
const arr=x=>Array.isArray(x)?x:[];
const text=x=>typeof x==='string'?x.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,180):'';
const exerciseTitle=x=>/^(?:Dashboard|NGL Spark|NGL|nullblank)$/i.test(text(x).trim())?'':text(x);
function identity(f){const d=arr(f.deepInteractions)[0]||arr(f.events).flatMap(e=>arr(e.state?.deepInteractions))[0];return {title:exerciseTitle(d?.identity?.title)||exerciseTitle(f.title)||null,interactiveId:text(d?.identity?.interactiveId)||text(f.interactiveId)||String(f.url||'').match(/\/(?:interactives|cdn_proxy)\/([^/]+)/)?.[1]||arr(f.qtiNodes).map(n=>String(n.srcPath||'').match(/\/cdn_proxy\/([^/]+)/)?.[1]).find(Boolean)||null,frameId:f.frameId??null,parentFrameId:f.parentFrameId??null,instanceId:text(f.instanceId||f.frame?.instanceId)||null};}
function ancestors(data,who) {
 const inventory=arr(data.framesLastSeen),byId=new Map(inventory.map(f=>[f.frameId,f])),result=[],seen=new Set();let current={...byId.get(who.frameId),...who};
 for(let depth=0;current&&depth<32&&!seen.has(current.frameId);depth++) {
  seen.add(current.frameId);result.push({frameId:current.frameId,parentFrameId:current.parentFrameId,title:current.title,url:current.url});
  if(current.parentFrameId===-1)break;current=byId.get(current.parentFrameId);
 }return result;
}
function split(data){
 const groups=[];
 const local=(captures,recordings)=>{const x={...data,captures,recordings,coverage:[],framesLastSeen:arr(data.framesLastSeen).map(f=>({frameId:f.frameId,parentFrameId:f.parentFrameId,title:f.title,url:f.url}))};for(const k of ['qtiMappings','qtiMapping','qtiAnswers','responseDeclarations'])delete x[k];return x;};
 arr(data.recordings).forEach((r,ri)=>arr(r.frames).forEach((f,fi)=>{
  const who=identity(f);
  const candidates=arr(data.captures).flatMap(c=>arr(c.frames)).filter(x=>x.frameId===who.frameId&&identity(x).title===who.title);
  const ids=[...new Set(candidates.map(x=>identity(x).interactiveId).filter(Boolean))];
  if(!who.interactiveId&&ids.length===1)who.interactiveId=ids[0];
  const compatible=x=>{const a=identity(x);return a.frameId===who.frameId&&(!a.title||!who.title||a.title===who.title)&&(!a.interactiveId||!who.interactiveId||a.interactiveId===who.interactiveId)&&(!a.instanceId||!who.instanceId||a.instanceId===who.instanceId);};
  const before=arr(r.screens?.before).filter(compatible),after=arr(r.screens?.after).filter(compatible),captures=arr(data.captures).flatMap(c=>arr(c.frames).filter(compatible).map(f=>({frames:[f]})));
  const x=local([...before,...after].map(f=>({frames:[f]})).concat(captures),[{...r,frames:[f],screens:{before,after}}]);
  x.framesLastSeen=ancestors(data,who);
  groups.push({data:x,identity:{...who,sessionId:text(r.sessionId)||'recording-'+ri,phase:text(r.phase)||'unspecified'},reference:'/recordings/'+ri+'/frames/'+fi,snapshotReferences:[...arr(data.captures).flatMap((c,ci)=>arr(c.frames).flatMap((f,fi)=>compatible(f)?['/captures/'+ci+'/frames/'+fi]:[])),...before.map(f=>'/recordings/'+ri+'/screens/before/'+r.screens.before.indexOf(f)),...after.map(f=>'/recordings/'+ri+'/screens/after/'+r.screens.after.indexOf(f))]});
 }));
 arr(data.captures).forEach((c,ci)=>arr(c.frames).forEach((f,fi)=>{
  if(!arr(f.interactions).length&&!arr(f.deepInteractions).length&&!Number(f.summary?.interactionCount))return;
  const who=identity(f);if(groups.some(g=>g.identity.title===who.title&&g.identity.frameId===who.frameId&&g.identity.interactiveId===who.interactiveId&&(!who.instanceId||who.instanceId===g.identity.instanceId)))return;
  const scoped=local([{...c,frames:[f]}],[]);scoped.framesLastSeen=ancestors(data,who);
  groups.push({data:scoped,identity:{...who,sessionId:'capture-'+ci,phase:text(c.phase)||'initial-capture'},reference:'/captures/'+ci+'/frames/'+fi,snapshotReferences:[]});
  }));
 return groups.flatMap(g=>{
  const f=g.data.recordings?.[0]?.frames?.[0];if(!f)return [g];
  const segments=[];let current=null;
  arr(f.events).forEach((event,index)=>{
   const w=arr(event.state?.deepInteractions)[0]||arr(event.beforeState)[0]||arr(event.afterState)[0];
   const who=w?.identity?{title:exerciseTitle(w.identity.title)||g.identity.title,interactiveId:text(w.identity.interactiveId)||g.identity.interactiveId}:current?.who||g.identity;
   const key=JSON.stringify([who.title,who.interactiveId]);
   if(!current||current.key!==key){current={who,key,events:[],indices:[]};segments.push(current);}
   current.events.push(event);current.indices.push(index);
  });
  if(segments.length<2)return [g];
  return segments.map((segment,segmentIndex)=>{
   const compatible=x=>{const who=identity(x);return who.title===segment.who.title&&(!who.interactiveId||!segment.who.interactiveId||who.interactiveId===segment.who.interactiveId);};
   const segmentFrame={...f,title:segment.who.title,interactiveId:segment.who.interactiveId,events:segment.events,_eventIndices:segment.indices,eventCount:segment.events.length};
   for(const key of ['interactions','deepInteractions','wordPools','responseDeclarations','qtiMappings','qtiMapping','qtiAnswers','qtiNodes','summary','counts','controls'])delete segmentFrame[key];
   const data={...g.data,captures:arr(g.data.captures).map(c=>({...c,frames:arr(c.frames).filter(compatible)})),recordings:[{...g.data.recordings[0],frames:[segmentFrame],screens:{before:arr(g.data.recordings[0].screens?.before).filter(compatible),after:arr(g.data.recordings[0].screens?.after).filter(compatible)}}]};
   return {...g,data,identity:{...g.identity,...segment.who,segmentIndex},snapshotReferences:[]};
  });
 });
}

const nodeKey=node=>node?.modelId||node?.id||node?.locator?.nodeId||null;
const rootKey=root=>root?.id||root?.locator?.nodeId||root?.modelId||null;
const signature=nodes=>JSON.stringify(arr(nodes).map(n=>({key:nodeKey(n),text:n.label??n.text,selected:n.selected,occupancy:n.occupancy,classes:n.classes})));
function occupantIds(node) {return arr(node?.occupancy?.occupantIds).filter(v=>typeof v==='string');}
function compare(before,after) {
 if(!before?.length||!after?.length)return {observed:false,reason:'missing deep before/after state'};
 const changes=before.map(b=>{
  const key=rootKey(b.root);
  const a=after.find(x=>(x.root?.locator?.nodeId&&x.root.locator.nodeId===b.root?.locator?.nodeId)||(x.root?.id&&x.root.id===b.root?.id)||(x.root?.modelId&&x.root.modelId===b.root?.modelId));
  if(!a)return {root:key,rootRef:b.root?.locator||null,rootRemoved:true,comparisonAvailable:false};
  const destinations=arr(b.destinations).map(old=>{
   const current=arr(a.destinations).find(n=>nodeKey(n)&&nodeKey(n)===nodeKey(old));
   if(!current)return {target:nodeKey(old),comparisonAvailable:false};
   const oldIds=occupantIds(old),newIds=occupantIds(current);
   const identityChange=JSON.stringify(oldIds)!==JSON.stringify(newIds);
   const oldHasDrag=old.occupancy?.hasDragClass??/(?:^| )has_drag(?:$| )/.test(old.classes||'');
   const newHasDrag=current.occupancy?.hasDragClass??/(?:^| )has_drag(?:$| )/.test(current.classes||'');
   // Accessibility prompts and width-measure text are not placed answers.
   return {target:nodeKey(old),comparisonAvailable:true,beforeOccupants:oldIds,afterOccupants:newIds,beforeHasDrag:oldHasDrag,afterHasDrag:newHasDrag,occupancyChanged:identityChange||oldHasDrag!==newHasDrag};
  });
  return {root:key,rootRef:b.root?.locator||null,comparisonAvailable:true,sourceChanged:signature(b.sources)!==signature(a.sources),targetChanged:signature(b.destinations)!==signature(a.destinations),selectedChanged:JSON.stringify(arr(b.sources).map(n=>({key:nodeKey(n),selected:n.selected})))!==JSON.stringify(arr(a.sources).map(n=>({key:nodeKey(n),selected:n.selected}))),occupancyChanged:destinations.some(d=>d.occupancyChanged),destinations,replaced:b.root?.locator?.nodeId!==a.root?.locator?.nodeId,feedbackChanged:signature(b.feedback)!==signature(a.feedback)};
 });
 return {observed:changes.some(c=>c.comparisonAvailable),changes,occupancyChanged:changes.some(c=>c.occupancyChanged),selectionChanged:changes.some(c=>c.selectedChanged),subtreeReplaced:changes.some(c=>c.replaced||c.rootRemoved)};
}
function coverageFor(f,events,overall) {
 const meta=f.observation,initial=events.find(e=>e.type==='initial'),final=events.findLast(e=>e.type==='final');
 const eventInstances=[...new Set(events.map(e=>text(e.instanceId)).filter(Boolean))];
 const frameInstance=text(f.frame?.instanceId||f.instanceId);
 const mismatch=eventInstances.some(id=>frameInstance&&id!==frameInstance)||(f.context?.frameId!=null&&f.frameId!==f.context.frameId);
 const attached=meta?.observerAttached===true;
 const rootsCovered=attached&&meta.rootCountAtStart>0&&meta.rootCount>0&&meta.documentConnected===true;
 const incomplete=meta?.mutationScanClipped>0||(meta?.snapshotRootLimit!=null&&meta.rootCount>meta.snapshotRootLimit)||f.truncated||f.warning||f.error||f.pollError||f.lastConfirmedActive===false||!initial?.state||!final?.state||!rootsCovered||mismatch;
 const actionable=events.some(e=>['click','pointerdown','mousedown','pointerup','keydown','input','change','drop','dragend'].includes(e.type));
 const stateChanged=overall.observed&&arr(overall.changes).some(c=>c.sourceChanged||c.targetChanged||c.selectedChanged||c.feedbackChanged||c.replaced);
 const outcome=meta?.observerAttached===false?'observer-not-attached':incomplete?'instrumentation-incomplete':stateChanged?'state-change-observed':!actionable?'no-action-observed':'actions-observed-no-net-state-change';
 return {outcome,actionObservation:actionable?'actions-recorded':'no-action-observed',stateChangeObserved:!!stateChanged,netStateObservation:overall.observed?(stateChanged?'changed':'no-net-change-in-compared-snapshots'):'unavailable',observerAttachment:attached?'confirmed-by-recorder':meta?.observerAttached===false?'not-attached':'unknown-in-legacy-export',eventListenerEvidence:events.some(e=>!['initial','final'].includes(e.type)),frameIdentityMismatch:mismatch,rootCoverageConfirmed:!!rootsCovered,mutationObservation:incomplete?'unknown-incomplete-instrumentation':meta.relevantMutations===0?'no-relevant-mutations-observed-under-filter':events.some(e=>e.type==='dom-mutation')?'relevant-mutations-recorded':'mutations-counted-but-records-unavailable',truncationReasons:arr(meta?.truncationReasons),firstDroppedMs:meta?.firstDroppedMs??null,mutationScanClipped:meta?.mutationScanClipped??null,budgetEvidence:{storedEventChars:JSON.stringify(events).length,maxEvents:f.limits?.maxEvents??null,maxSerializedChars:f.limits?.maxBytes??null},interval:{startedAt:f.startedAt||null,endedAt:f.endedAt||null,attachedAt:f.attachedAt||null},scope:meta?.observerTarget||'unknown in legacy export',attributeFilter:arr(meta?.attributeFilter)};
}
function diagnostics(f,reference){
 const eventRef=index=>reference+'/events/'+(f._eventIndices?.[index]??index);
 const events=arr(f.events),initial=events.find(e=>e.type==='initial'),final=events.findLast(e=>e.type==='final'),issues=[],collectionInstructions=[];
 const add=(code,instruction)=>{issues.push(code);collectionInstructions.push(instruction);};
 if(!initial?.state)add('missing-before-state','Start recording before touching the exercise; wait for attachment.');
 if(!final?.state)add('missing-after-state','Wait two seconds after the action, then Stop recording.');
 if(f.truncated||f.warning||f.error)add('incomplete-recording','Use a fresh recording of one action without navigation.');
 const actions=events.flatMap((e,i)=>{if(e.type!=='action-before')return [];
  const later=events.map((x,j)=>({x,j})).filter(({x,j})=>j>i&&x.actionId===e.actionId),after=later.filter(({x})=>x.type==='action-after').at(-1),next=events.findIndex((x,j)=>j>i&&x.type==='action-before'),overlapping=next>=0&&(!after||next<after.j);
  if(!after)add('missing-action-after-state','Wait two seconds before stopping; collect one activation.');
  const transition=compare(arr(e.beforeState),arr(after?.x.afterState));
  return [{actionId:text(e.actionId),trigger:text(e.trigger),root:rootKey(e.interactionRoot),attribution:e.attribution||null,beforeRef:eventRef(i),afterRef:after?eventRef(after.j):null,mutationRefs:later.filter(({x})=>x.type==='dom-mutation').map(({j})=>eventRef(j)),overlapping,transition,expectedTransitionObserved:overlapping?null:transition.observed?(transition.selectionChanged||transition.occupancyChanged):null,targetConnected:after?.x.targetConnected??null,rootConnected:after?.x.rootConnected??null}];
 });
 const overall=compare(arr(initial?.state?.deepInteractions),arr(final?.state?.deepInteractions));
 const coverage=coverageFor(f,events,overall);
 if(!coverage.rootCoverageConfirmed)add('observer-coverage-unverified','Recollect with explicit observer attachment, root coverage and frame/session context.');
 if(coverage.frameIdentityMismatch)add('frame-identity-mismatch','Attach to the intended exercise frame and verify identical frame instance IDs through the attempt.');
 if(arr(initial?.state?.deepInteractions).some(w=>w.bounds&&(w.bounds.sourceTotal>arr(w.sources).length||w.bounds.destinationTotal>arr(w.destinations).length)))add('bounded-state-clipped','Capture a smaller interaction or increase node limits up to the documented ceiling; report omitted nodes as unknown.');
 if(!overall.observed)add('missing-deep-state','Recollect using Deep Inspector; generic controls cannot establish pool occupancy.');
 if(!overall.occupancyChanged)add('unobserved-target-occupancy-change','Record a successful manual placement and a separate Solve attempt with full gap snapshots.');
 const labels=arr(initial?.state?.deepInteractions).flatMap(w=>arr(w.sources).map(n=>text(n.text))),duplicateLabels=[...new Set(labels.filter((x,i)=>x&&labels.indexOf(x)!==i))];
 if(duplicateLabels.length)add('duplicate-source-labels','Use source model IDs and locators to distinguish repeated labels.');
 if(f.frameId==null||f.parentFrameId==null||!f.frame?.instanceId||f.frame?.complete===false)add('ambiguous-frame-identity','Recollect frame inventory, instance IDs and accessible ancestry.');
 if(events.some(e=>['click','pointerup','mouseup'].includes(e.type))&&!events.some(e=>['pointerdown','mousedown','keydown'].includes(e.type)))add('incomplete-event-sequence','Begin recording before pointer down or keyboard activation.');
 if(final?.pendingAsyncSamples)add('pending-asynchronous-samples','Wait two seconds after the last action before stopping.');
 return {reference,actions,overall,duplicateLabels,issues:[...new Set(issues)],collectionInstructions:[...new Set(collectionInstructions)],coverage,outcome:coverage.outcome,overallEvidenceReferences:initial&&final?[eventRef(events.indexOf(initial))+'/state/deepInteractions',eventRef(events.indexOf(final))+'/state/deepInteractions']:[],likelyFailingStage:overall.occupancyChanged?'session-level target occupancy change observed; individual action causality, correctness and persistence unverified':coverage.outcome==='observer-not-attached'?'unknown: observer not attached':coverage.outcome==='instrumentation-incomplete'?'unknown: instrumentation incomplete; no failing interaction stage established':overall.selectionChanged?'selection changed without a net occupancy change; destination activation is a hypothesis':'no net occupancy change observed; execution or actionability gate is a hypothesis' };
}
module.exports={split,identity,compare,diagnostics,coverageFor};
