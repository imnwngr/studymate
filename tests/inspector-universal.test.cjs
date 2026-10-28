'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../inspector.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
async function harness(options={}){
  const nodes=new Map(),actions=[],handlers={},lifecycle={},injected=new Set();let exported,poll;
  const state={url:options.url||'https://unknown.example/quiz',activeTab:99,generation:1,closed:false,denied:false,granted:new Set(options.grantedOrigins||[])};
  const frames=options.frames||[{frameId:0,parentFrameId:-1,url:state.url}];
  const frameOrigin=id=>{try{return new URL(frames.find(f=>f.frameId===id)?.url||state.url).origin+'/*';}catch{return null;}};
  const blocked=id=>state.denied||(options.deniedFrames?.includes(id)&&!state.granted.has(frameOrigin(id)));
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',value:'',disabled:false,addEventListener(t,f){handlers[id]=f;},append(){},replaceChildren(){}});return nodes.get(id);};
  const chrome={tabs:{async get(id){if(state.closed)throw Error('Tab closed');return {id,url:state.url};},async query(){return [{id:state.activeTab,url:state.url}];},
    onRemoved:{addListener(f){lifecycle.closed=f;}},async sendMessage(tab,message,{frameId}){
      actions.push({tab,frameId,type:message.type});
      if(blocked(frameId))throw Error('Missing host permission');
      if(options.nonresponsiveFrames?.includes(frameId))return null;
      if(options.requireInjection?.includes(frameId)&&!injected.has(frameId))throw Error('Receiving end does not exist');
      const instanceId='document-'+frameId+'-'+state.generation;
      if(message.type==='SPARK_INSPECT_PROBE')return {ok:true,result:{instanceId,adapter:options.adapters?.[frameId]||options.adapter||'generic',interactionCount:options.interactionsByFrame?.[frameId]??options.interactions??0}};
      if(message.type==='SPARK_INSPECT_TRACE_START'&&options.alreadyActive)return {ok:true,alreadyActive:true};
      if(message.type==='SPARK_INSPECT_TRACE_GET')return {ok:true,result:{instanceId,...(options.foreignSession?{context:{sessionId:'another-session'}}:{}),eventCount:2,events:[{type:'initial'},{type:'click'}]}};
      if(message.type==='SPARK_INSPECT_CAPTURE')return {ok:true,result:{summary:{interactionCount:0,types:[]}}};
      return {ok:true};
    }},webNavigation:{async getAllFrames(){return frames;},onCommitted:{addListener(f){lifecycle.navigation=f;}}},
    scripting:{async executeScript(args){actions.push({injection:plain(args)});if(blocked(args.target.frameIds[0]))throw Error('Missing host permission');injected.add(args.target.frameIds[0]);}},
    permissions:{async contains(args){return state.granted.has(args.origins[0]);},async request(args){actions.push({grant:plain(args)});if(state.denied||options.rejectPermissions)return false;for(const origin of args.origins)state.granted.add(origin);return true;}}};
  const context={chrome,URL,URLSearchParams,Blob,console,location:{search:options.search??'?tabId=42'},
    document:{getElementById:node,createElement:()=>node('li')},navigator:options.navigator||{},
    addEventListener(){},setTimeout(){return 1;},clearTimeout(){},setInterval(f){poll=f;return 1;},clearInterval(){poll=null;},
    SparkInspectorExport:{initialized:Promise.resolve(),currentDirectory:()=>null,prepareDestination:async()=>({}),writeJSON:async(_d,data)=>{exported=plain(data);return {kind:'save-as',name:'fixture.json'};}}};
  vm.createContext(context);vm.runInContext(code,context);await new Promise(setImmediate);
  return {state,actions,lifecycle,node,handlers,poll:()=>poll?vm.runInContext('pollFrameCoverage()',context):undefined,exported:()=>exported,context,
    async flushPermission(){for(let i=0;i<8;i++)await new Promise(setImmediate);}};
}
test('unknown HTTP(S) site records without requiring interaction classes',async()=>{
  const h=await harness();await h.handlers.startTrace();assert.ok(h.actions.some(a=>a.type==='SPARK_INSPECT_TRACE_START'));
  await h.handlers.stopTrace();await h.handlers.export();assert.equal(h.exported().site.adapter,'generic');
});
test('NGL diagnostics remain selected by adapter without loading Solve',async()=>{
  const h=await harness({url:'https://learn.eltngl.com/exercise',adapter:'ngl',interactions:2});
  await h.handlers.startTrace();await h.handlers.stopTrace();await h.handlers.export();assert.equal(h.exported().site.adapter,'ngl');
  assert.ok(h.actions.every(a=>!a.type||a.type.startsWith('SPARK_INSPECT_')));
});
test('generic same-URL nested documents remain distinct by frame and parent IDs',async()=>{
  const url='https://nested.example/quiz';
  const h=await harness({adapter:'generic',frames:[{frameId:0,parentFrameId:-1,url:'https://unknown.example/'},{frameId:12,parentFrameId:0,url},{frameId:13,parentFrameId:12,url}]});
  await h.handlers.startTrace();await h.handlers.stopTrace();await h.handlers.export();
  assert.deepEqual(h.exported().frames.map(f=>[f.frameId,f.parentFrameId]),[[0,-1],[12,0],[13,12]]);
  assert.equal(h.exported().site.adapter,'generic');
});
test('cross-origin denial isolates accessible sibling frames and requests exact HTTPS origins',async()=>{
  const h=await harness({frames:[{frameId:0,url:'https://unknown.example/'},{frameId:4,url:'https://blocked.example/path?token=SECRET'}],deniedFrames:[4]});
  await h.handlers.capture();
  assert.equal(vm.runInContext('lastInventory.find(f=>f.frameId===4).accessible',h.context),false);
  h.handlers.grantFrames();await h.flushPermission();await h.handlers.export();
  assert.equal(h.exported().frames[0].accessible,true);assert.equal(h.exported().frames[1].accessible,true);
  assert.deepEqual(h.actions.find(a=>a.grant).grant.origins,['https://blocked.example/*']);assert.ok(!JSON.stringify(h.exported()).includes('SECRET'));
});
test('switching active tabs cannot redirect a running recording',async()=>{
  const h=await harness();await h.handlers.startTrace();h.state.activeTab=777;await h.poll();await h.handlers.stopTrace();
  assert.ok(h.actions.filter(a=>a.tab).every(a=>a.tab===42));
});
test('top-level navigation stops rather than migrating the recording',async()=>{
  const h=await harness();await h.handlers.startTrace();const captures=h.actions.filter(a=>a.type==='SPARK_INSPECT_CAPTURE').length;
  h.state.generation++;h.lifecycle.navigation({tabId:42,frameId:0});await new Promise(setImmediate);
  assert.equal(h.poll(),undefined);assert.equal(h.node('recordState').textContent,'Stopped');
  assert.equal(h.actions.filter(a=>a.type==='SPARK_INSPECT_CAPTURE').length,captures);
});
test('child frame reload retains old document evidence separately',async()=>{
  const h=await harness();await h.handlers.startTrace();h.state.generation++;await h.poll();await h.handlers.stopTrace();await h.handlers.export();
  assert.equal(h.exported().recordings[0].frames.length,2);assert.ok(h.exported().recordings[0].frames.some(f=>f.lostOnReload));
});
test('closing source tab retains cached events',async()=>{
  const h=await harness();await h.handlers.startTrace();h.state.closed=true;h.lifecycle.closed(42);await new Promise(setImmediate);await h.handlers.export();
  assert.equal(h.exported().session.tabId,42);assert.ok(h.exported().events.length);
});
test('Start Stop Start produces distinct recording session IDs',async()=>{
  const h=await harness();await h.handlers.startTrace();await h.handlers.stopTrace();await h.handlers.startTrace();await h.handlers.stopTrace();await h.handlers.export();
  const r=h.exported().recordings;assert.equal(r.length,2);assert.notEqual(r[0].sessionId,r[1].sessionId);
});
test('duplicate Start does not restart a running frame',async()=>{
  const h=await harness();await h.handlers.startTrace();await h.handlers.startTrace();
  // The DOM button is disabled; direct duplicate handler invocation must also be harmless.
  assert.equal(h.actions.filter(a=>a.type==='SPARK_INSPECT_TRACE_START').length,1);
});
test('another Inspector window holding the session lock blocks recording',async()=>{
  const h=await harness({navigator:{locks:{request:async(_name,_opts,fn)=>fn(null)}}});await h.handlers.startTrace();
  assert.match(h.node('status').textContent,/already recording/);assert.ok(!h.actions.some(a=>a.type==='SPARK_INSPECT_TRACE_START'));
});
test('invalid explicit source never falls back to an unrelated tab',async()=>{
  const h=await harness({url:'chrome://settings/'});await h.handlers.startTrace();assert.equal(h.actions.length,0);assert.match(h.node('status').textContent,/Error/);
});
test('schema 2 is additive and keeps legacy captures and recordings',async()=>{
  const h=await harness();await h.handlers.startTrace();await h.handlers.stopTrace();await h.handlers.export();const d=h.exported();
  assert.equal(d.schemaVersion,'2.0');assert.equal(d.version,'3.4.0');assert.equal(d.session.tabId,42);
  for(const key of ['captures','recordings','frames','events','diagnostics','warnings'])assert.ok(Array.isArray(d[key]));
});
test('generic recorder is bounded, read-only and does not read application variables',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../inspector-generic.js'),'utf8');
  assert.doesNotMatch(source,/\.click\(|dispatchEvent\(|fetch\(|eval\(|innerHTML|currentQuestions/);
  assert.match(source,/MAX_EVENTS=600/);assert.match(source,/MAX_BYTES=300000/);assert.match(source,/valueRedacted/);
});
test('already-active content recorder is not adopted or stopped by another session',async()=>{
  const h=await harness({alreadyActive:true});await h.handlers.startTrace();
  assert.match(h.node('status').textContent,/another recording/);
  assert.ok(!h.actions.some(a=>a.type==='SPARK_INSPECT_TRACE_STOP'));
});
test('foreign session trace is rejected before entering this export',async()=>{
  const h=await harness({foreignSession:true});await h.handlers.startTrace();await h.handlers.export();
  assert.equal(h.exported().events.length,0);assert.match(h.node('recordState').textContent,/Error/);
});
test('schema 2 generic exports are accepted conservatively by offline analyzer',async()=>{
  const h=await harness();await h.handlers.startTrace();await h.handlers.stopTrace();await h.handlers.export();
  const {analyze}=require('../tools/inspector-intelligence.cjs');
  const report=analyze(h.exported());assert.ok(report.missingEvidence.length>0);
});
test('Clear does not erase another recording session in a content frame',async()=>{
  const h=await harness({foreignSession:true});await h.handlers.clear();
  assert.ok(!h.actions.some(a=>a.type==='SPARK_INSPECT_TRACE_CLEAR'));
});
test('a wildcard-looking frame URL cannot broaden an exact-origin permission request',async()=>{
  const h=await harness({frames:[{frameId:4,url:'https://*.example.com/'}],deniedFrames:[4]});
  await h.handlers.capture();await h.handlers.grantFrames();assert.ok(!h.actions.some(a=>a.grant));
});

test('rejected runtime permission preserves failure export and skips inaccessible captures',async()=>{
  const h=await harness({frames:[{frameId:0,url:'https://unknown.example/'},{frameId:4,url:'https://blocked.example/'}],deniedFrames:[4],rejectPermissions:true});
  await h.handlers.capture();assert.ok(!h.actions.some(a=>a.frameId===4&&a.type==='SPARK_INSPECT_CAPTURE'));
  h.handlers.grantFrames();await h.flushPermission();assert.match(h.node('status').textContent,/Access denied/);
  await h.handlers.export();assert.equal(h.exported().frames.find(f=>f.frameId===4).accessible,false);
  assert.equal(h.exported().captures[0].frames.find(f=>f.frameId===4).reason,'permissionDenied');
});
