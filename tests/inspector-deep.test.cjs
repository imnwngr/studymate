'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),os=require('node:os'),path=require('node:path');
const {compare,diagnostics}=require('../tools/inspector-deep.cjs');
const {analyzeExercises,promptFor,run}=require('../tools/inspector-intelligence.cjs');
const widget=(filled=false,selected=false,node='root-1')=>({root:{id:'root',locator:{nodeId:node}},identity:{title:'1d | Real life | 1',interactiveId:'abc'},sources:[{id:'s1',text:'alpha',selected},{id:'s2',text:'alpha',selected:false}],destinations:[{id:'g1',text:filled?'alpha':'',occupancy:{hasText:filled,occupantIds:filled?['s1']:[]}}]});
const frame=(title='1d | Real life | 1',interactiveId='abc',frameId=9)=>({frameId,parentFrameId:5,title,url:'https://learn.eltngl.com/cdn_proxy/'+interactiveId+'/index.html',frame:{instanceId:'instance-'+interactiveId,ancestry:[{title},{title:'wrapper'},{title:'Dashboard'}],complete:true},interactions:[{classes:'interaction om-text-gap',id:'root',children:[]}],events:[{type:'initial',state:{deepInteractions:[widget()]}},{type:'action-before',actionId:'a',trigger:'click',beforeState:[widget()]},{type:'click',actionId:'a'},{type:'dom-mutation',actionId:'a',changes:[{kind:'childList'}]},{type:'action-after',actionId:'a',afterState:[widget(true)],targetConnected:false,rootConnected:true},{type:'final',state:{deepInteractions:[widget(true)]}}]});
test('word pool comparison separates selection, occupancy, source movement and replacement',()=>{
 assert.equal(compare([widget()],[widget(false,true)]).selectionChanged,true);
 const placed=widget(true);placed.sources.shift();assert.equal(compare([widget()],[placed]).occupancyChanged,true);assert.equal(compare([widget()],[placed]).changes[0].sourceChanged,true);
 assert.equal(compare([widget()],[widget(true,false,'root-2')]).subtreeReplaced,true);
});
test('action reports use exact original pointers, mutations and connectivity',()=>{
 const d=diagnostics(frame(),'/recordings/2/frames/0');assert.equal(d.actions[0].beforeRef,'/recordings/2/frames/0/events/1');assert.equal(d.actions[0].afterRef,'/recordings/2/frames/0/events/4');assert.deepEqual(d.actions[0].mutationRefs,['/recordings/2/frames/0/events/3']);assert.equal(d.actions[0].targetConnected,false);assert.equal(d.actions[0].expectedTransitionObserved,true);assert.ok(d.issues.includes('duplicate-source-labels'));
});
test('failed automated attempt remains a hypothesis without observable events',()=>{
 const f=frame();f.events=[{type:'initial',state:{deepInteractions:[widget()]}},{type:'final',state:{deepInteractions:[widget()]}}];
 const r=analyzeExercises({recordings:[{phase:'automated-attempt',sessionId:'solve',frames:[f]}]},'hash')[0];assert.equal(r.isolation.phase,'automated-attempt');assert.match(r.diagnostics[0].likelyFailingStage,/instrumentation incomplete/);assert.equal(r.diagnostics[0].coverage.actionObservation,'no-action-observed');assert.ok(r.missingEvidence.includes('unobserved-target-occupancy-change'));assert.equal(r.events.recordings[0].meaningfulInteractionObserved,false);
});
test('incomplete recordings request before, after, sequences, frame identity and async evidence',()=>{
 const d=diagnostics({events:[{type:'click'},{type:'final',pendingAsyncSamples:4}],truncated:true},'/x');for(const issue of ['missing-before-state','missing-after-state','incomplete-recording','incomplete-event-sequence','ambiguous-frame-identity','pending-asynchronous-samples'])assert.ok(d.issues.includes(issue),issue);
});
test('multiple exercises and sessions produce isolated English prompts without dashboard identity or shared mappings',()=>{
 const a=frame(),b=frame('1e | Writing skill | 2','def',10);b.events.forEach(e=>{for(const w of [...(e.state?.deepInteractions||[]),...(e.beforeState||[]),...(e.afterState||[])])w.identity={title:b.title,interactiveId:'def'};});
 const data={framesLastSeen:[{frameId:0,parentFrameId:-1,title:'Dashboard'},{frameId:5,parentFrameId:0}],qtiMappings:[{responseId:'shared',correctValues:['unsafe']}],recordings:[{sessionId:'manual',frames:[a,b]},{sessionId:'solve',frames:[a]}]};
 const reports=analyzeExercises(data,'hash');assert.equal(reports.length,3);
 for(const r of reports){const prompt=promptFor(r);assert.equal(r.exercise.titles.length,1);assert.equal(r.qti.declaredMappingCount,0);assert.doesNotMatch(prompt,/Dashboard|unsafe/);assert.match(prompt,/Evidence JSON Pointers/);assert.ok(r.frameHierarchy.some(f=>f.frameId===5&&f.parentFrameId===0));}
 assert.doesNotMatch(promptFor(reports[0]),/Writing skill/);assert.doesNotMatch(promptFor(reports[1]),/Real life/);
});
test('QTI references remain unverified; conflicting explicit frame declarations are reported',()=>{
 const f=frame();f.qtiNodes=[{srcPath:'https://learn.eltngl.com/cdn_proxy/abc/data.js'}];let r=analyzeExercises({recordings:[{frames:[f]}]},'hash')[0];assert.equal(r.qti.declaredMappingCount,0);assert.match(r.qti.mappingStatus,/unverified/);
 f.responseDeclarations=[{responseId:'R',correctValues:['A'],evidenceKind:'inline-responseDeclaration'},{responseId:'R',correctValues:['B'],evidenceKind:'inline-responseDeclaration'}];r=analyzeExercises({recordings:[{frames:[f]}]},'hash')[0];assert.deepEqual(r.qti.ambiguous,['R']);
});
test('CLI pipeline writes separate reports and preserves exact export bytes',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'deep-inspector-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const dir=path.join(root,'inspector-data/exports');fs.mkdirSync(dir,{recursive:true});const bytes=JSON.stringify({recordings:[{frames:[frame(),frame('Writing skill','def',10)]}]});const file=path.join(dir,'original.json');fs.writeFileSync(file,bytes);const result=run({root});assert.equal(result.uniqueValidReports,2);assert.equal(result.duplicateCount,0);assert.equal(fs.readFileSync(file,'utf8'),bytes);
});
function harness(options={}){
 const listeners={},timers=[],observers=[];let handler;let now=0;class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 class El{
 constructor(tag,id,cls,text=''){this.nodeType=1;this.tagName=tag.toUpperCase();this.id=id;this.className=cls;this.textContent=text;this.children=[];this.parentElement=null;this.isConnected=true;this.attrs={};this.classList=cls.split(' ');}
 add(n){this.children.push(n);n.parentElement=this;return n;}
 getAttribute(k){return k==='id'?this.id:k==='class'?this.className:this.attrs[k]??null;}
 getClientRects(){return [{}];}
 closest(sel){let n=this;while(n){if(n.matches(sel))return n;n=n.parentElement;}return null;}
 contains(node){let n=node;while(n){if(n===this)return true;n=n.parentElement;}return false;}
 matches(sel){return sel.split(',').some(part=>{part=part.trim();if(part==='*')return true;if(part.startsWith('.'))return part.slice(1).split('.').every(c=>this.className.split(' ').includes(c));if(part==='[data-model-id]')return this.attrs['data-model-id']!=null;if(part==='[draggable="true"]')return this.attrs.draggable==='true';return false;});}
 querySelectorAll(sel){const all=this.children.flatMap(n=>[n,...n.querySelectorAll('*')]);return all.filter(n=>n.matches(sel));}
 querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
 }
 const html=new El('html','html',''),root=html.add(new El('div','root','interaction om-text-gap')),source=root.add(new El('span','s1','om-text-gap__pool-item','alpha')),gap=root.add(new El('span','g1','om-text-gap__target-item empty'));
 source.add(new El('span','handle','om-text-gap__draggable','alpha'));
 const document={documentElement:html,title:'1d | Real life | 1',readyState:'complete',querySelectorAll(sel){return html.querySelectorAll(sel);},querySelector(sel){return html.querySelector(sel);},addEventListener(type,fn){listeners[type]=fn;},removeEventListener(type){delete listeners[type];}};
 const top={location:{origin:'https://learn.eltngl.com',pathname:'/dashboard'},document:{title:'Dashboard'},frameElement:null};top.parent=top;
 const win={location:{origin:'https://learn.eltngl.com',pathname:'/cdn_proxy/abc/index.html'},document,frameElement:new El('iframe','exercise',''),parent:top};
 const context={Date:Clock,document,window:win,location:win.location,chrome:{runtime:{onMessage:{addListener(fn){handler=fn;}}}},getComputedStyle:()=>({visibility:'visible'}),setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},clearTimeout(){},MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){if(options.failObserve)throw Error("synthetic observer failure");}disconnect(){}takeRecords(){return [];}}};
 let recorder=fs.readFileSync(path.join(__dirname,'../inspector-content.js'),'utf8');
 if(options.legacyInventory){const begin=recorder.indexOf('    if(compact)return (onlyRoot?');const end=recorder.indexOf('    const state=',begin);recorder=recorder.slice(0,begin)+recorder.slice(end);}
 vm.runInNewContext(recorder,context);
 const send=(type,extra={})=>{let result;handler({type:'SPARK_INSPECT_'+type,...extra},{},x=>result=x);return result;};
 return {send,listeners,timers,observers,source,gap,root,html,El,advance:ms=>{now+=ms;}};
}
test('content capture records nested accessible frames, bounded structured pool/target state and no raw HTML',()=>{
 const h=harness(),c=h.send('CAPTURE').result;assert.equal(c.deepSchema,1);assert.equal(c.frame.ancestry.length,2);assert.equal(c.frame.complete,true);assert.equal(c.deepInteractions[0].sources[0].text,'alpha');assert.equal(c.deepInteractions[0].destinations[0].occupancy.emptyClass,true);assert.equal(c.interactions[0].html,null);assert.equal(c.controls.length,0);
});
test('recorder captures before/async-after, class mutations, removed sources and replacement connectivity',()=>{
 const h=harness();h.send('TRACE_START');h.listeners.click({type:'click',target:h.source,isTrusted:false});h.gap.textContent='alpha';h.gap.className='om-text-gap__target-item filled';h.source.isConnected=false;
 h.observers[0].fn([{type:'childList',target:h.root,addedNodes:[],removedNodes:[h.source],attributeName:null,oldValue:null}]);
 for(const timer of [...h.timers].filter(t=>t.ms<2000))timer.fn();h.send('TRACE_STOP');const trace=h.send('TRACE_GET').result;
 const before=trace.events.find(e=>e.type==='action-before'),after=trace.events.findLast(e=>e.type==='action-after');assert.equal(before.beforeState[0].destinations[0].text,'');assert.equal(after.afterState[0].destinations[0].text,'alpha');assert.equal(after.targetConnected,false);assert.equal(trace.events.find(e=>e.type==='click').isTrusted,false);assert.equal(trace.events.find(e=>e.type==='dom-mutation').changes[0].removed[0].connected,false);assert.ok(trace.events.find(e=>e.type==='final').state.deepInteractions.length);
});

test('same iframe exercise navigation splits timelines and keeps original event indexes',()=>{
 const f=frame(),next=widget();next.identity={title:'1e | Writing skill | 2',interactiveId:'def'};
 f.events.push({type:'dom-mutation',state:{deepInteractions:[next]}},{type:'click'},{type:'final',state:{deepInteractions:[next]}});
 const result=analyzeExercises({recordings:[{frames:[f]}]},'hash');assert.equal(result.length,2);assert.equal(result[1].exercise.titles[0],'1e | Writing skill | 2');assert.equal(result[1].events.recordings[0].sequence.length,3);assert.ok(result[1].missingEvidence.includes('missing-before-state'));assert.doesNotMatch(promptFor(result[1]),/Real life/);
});
test('dashboard title never becomes exercise identity',()=>{
 const f=frame('Dashboard');f.events=[];const r=analyzeExercises({recordings:[{frames:[f]}]},'hash')[0];assert.deepEqual(r.exercise.titles,[]);assert.doesNotMatch(promptFor(r),/Dashboard/);
});

test('deep occupancy change is reflected in legacy state summary as well as transition diagnostics',()=>{
 const r=analyzeExercises({recordings:[{frames:[frame()]}]},'hash')[0];assert.equal(r.events.recordings[0].visibleStateChanged,true);assert.equal(r.diagnostics[0].overall.occupancyChanged,true);
});
test('same-frame segments never inherit frame-wide answer declarations from another exercise',()=>{
 const f=frame();f.responseDeclarations=[{responseId:'old',correctValues:['alpha']}];const next=widget();next.identity={title:'Writing skill',interactiveId:'def'};f.events.push({type:'final',state:{deepInteractions:[next]}});
 const reports=analyzeExercises({recordings:[{frames:[f]}]},'hash');assert.equal(reports.length,2);for(const r of reports){assert.equal(r.qti.declaredMappingCount,0);assert.deepEqual(r.qti.evidenceReferences,[]);}
});

const privateFixture=path.join(__dirname,'fixtures/inspector-253dedff.min.json');
const realEvidence=fs.existsSync(privateFixture)?JSON.parse(fs.readFileSync(privateFixture,'utf8')):null;
test('real manual evidence: id-less root, unchanged action snapshots, changed session endpoints and truncated trace',{skip:!realEvidence},()=>{
 const r=analyzeExercises(realEvidence,realEvidence.fixtureOrigin.sha256)[0],d=r.diagnostics[0];assert.equal(d.actions.length,3);assert.equal(d.overall.occupancyChanged,true);assert.equal(d.outcome,'instrumentation-incomplete');assert.match(d.likelyFailingStage,/session-level target occupancy change/);assert.doesNotMatch(d.likelyFailingStage,/placement observed/);
 for(const a of d.actions){assert.ok(a.transition.changes[0].root.endsWith(':node-1'));assert.equal(a.transition.occupancyChanged,false);assert.deepEqual(a.mutationRefs,[]);}
 const gaps=d.overall.changes[0].destinations.filter(x=>x.occupancyChanged);assert.equal(gaps.length,2);assert.deepEqual(gaps[0].afterOccupants,['1792178623616007']);assert.deepEqual(gaps[1].beforeOccupants,['1792178623616007']);
 const f=realEvidence.fixtureOrigin;assert.ok(f.manualStoredCharsBeforeFinal+f.nextSnapshotApproxChars>f.nonFinalBudget);assert.match(promptFor(r),/individual action causality/);
});
test('real automated evidence: listener activity in correct frame, zero actions, no net state change, legacy observer health unknown',{skip:!realEvidence},()=>{
 const r=analyzeExercises(realEvidence,'hash')[1],d=r.diagnostics[0];assert.equal(r.isolation.frameId,145);assert.equal(d.actions.length,0);assert.equal(d.coverage.eventListenerEvidence,true);assert.equal(d.coverage.actionObservation,'no-action-observed');assert.equal(d.coverage.netStateObservation,'no-net-change-in-compared-snapshots');assert.equal(d.coverage.observerAttachment,'unknown-in-legacy-export');assert.equal(d.coverage.mutationObservation,'unknown-incomplete-instrumentation');assert.equal(d.outcome,'instrumentation-incomplete');assert.doesNotMatch(promptFor(r),/placement observed/);
});
const healthyObservation=()=>({observerAttached:true,rootCountAtStart:1,rootCount:1,documentConnected:true,relevantMutations:0,attributeFilter:['class'],truncationReasons:[]});
test('zero actions with known observer coverage differs from observer missing and legacy uncertainty',()=>{
 const f=frame();f.events=[f.events[0],{type:'final',state:{deepInteractions:[widget()]}}];f.observation=healthyObservation();assert.equal(diagnostics(f,'/x').outcome,'no-action-observed');assert.equal(diagnostics(f,'/x').coverage.mutationObservation,'no-relevant-mutations-observed-under-filter');
 f.observation.observerAttached=false;assert.equal(diagnostics(f,'/x').outcome,'observer-not-attached');delete f.observation;assert.equal(diagnostics(f,'/x').outcome,'instrumentation-incomplete');
});
test('unchanged flags and accessibility placeholder changes cannot establish occupancy',()=>{
 const b=widget(),a=widget();a.destinations[0].text='Gap 2 of 5';assert.equal(compare([b],[a]).occupancyChanged,false);
 const f=frame();f.events[f.events.length-1].state.deepInteractions=[widget()];f.events[4].afterState=[widget()];f.observation=healthyObservation();const d=diagnostics(f,'/x');assert.equal(d.overall.occupancyChanged,false);assert.doesNotMatch(d.likelyFailingStage,/placement observed|^session-level target occupancy change/);
});
test('observer frame mismatch and snapshot budget cutoff are reported explicitly',()=>{
 const f=frame();f.observation={...healthyObservation(),truncationReasons:['snapshot-budget'],firstDroppedMs:1254};f.truncated=true;f.context={frameId:999};const d=diagnostics(f,'/x');assert.equal(d.coverage.frameIdentityMismatch,true);assert.deepEqual(d.coverage.truncationReasons,['snapshot-budget']);assert.equal(d.coverage.firstDroppedMs,1254);assert.equal(d.outcome,'instrumentation-incomplete');
});
test('nested child handles resolve to id-less wordpool root with source/destination attribution',()=>{
 const h=harness();h.root.id='';const child=h.source.children[0].add(new h.El('span','','om-text-gap__draggable-handle'));h.source.attrs['data-model-id']='source';h.gap.attrs['data-model-id']='gap';
 h.send('TRACE_START',{context:{sessionId:'manual',frameId:145}});for(const type of ['pointerdown','mousedown','click'])h.listeners[type]({type,target:child,isTrusted:true});
 let trace=h.send('TRACE_GET').result;assert.equal(trace.events.filter(e=>e.type==='action-before').length,1);const action=trace.events.find(e=>e.type==='action-before');assert.equal(action.attribution.role,'source');assert.equal(action.attribution.sourceModelId,'source');assert.ok(action.interactionRoot.locator.nodeId);assert.equal(trace.context.frameId,145);
 const inner=h.gap.add(new h.El('div','','om-text-gap__droppable')).add(new h.El('span','','placeholder'));h.listeners.click({type:'click',target:inner,isTrusted:true});trace=h.send('TRACE_GET').result;assert.equal(trace.events.findLast(e=>e.type==='action-before').attribution.destinationModelId,'gap');assert.equal(trace.observation.observerAttached,true);assert.equal(trace.observation.rootCountAtStart,1);
});
test('selected draggable descendant propagates selection and scoped mutation correlation',()=>{
 const h=harness();h.send('TRACE_START');const handle=h.source.children[0];h.listeners.click({type:'click',target:handle});handle.className+=' selected';h.observers[0].fn([{type:'attributes',target:handle,attributeName:'class',oldValue:'om-text-gap__draggable',addedNodes:[],removedNodes:[]}]);for(const t of [...h.timers].filter(t=>t.ms<2000))t.fn();const trace=h.send('TRACE_GET').result;assert.equal(trace.events.findLast(e=>e.type==='action-after').afterState[0].sources[0].selected,true);assert.equal(trace.observation.relevantMutations,1);const mutation=trace.events.find(e=>e.type==='dom-mutation');assert.equal(mutation.actionId,trace.events.find(e=>e.type==='action-before').actionId);assert.ok(mutation.changes[0].attribution.root.nodeId);
});
test('compact action snapshots retain transitions without repeated selector and child trees',()=>{
 const h=harness();h.send('TRACE_START');h.listeners.click({type:'click',target:h.source});const events=h.send('TRACE_GET').result.events,before=events.find(e=>e.type==='action-before');assert.equal(before.beforeState[0].sources[0].children,undefined);assert.equal(before.beforeState[0].sources[0].locator.selector,undefined);assert.ok(events[0].state.deepInteractions[0].sources[0].locator.selector);assert.ok(JSON.stringify(before.beforeState).length<JSON.stringify(events[0].state.deepInteractions).length);
});

test('observer attachment failure cleans listeners and cannot masquerade as active recording',()=>{
 const h=harness({failObserve:true}),result=h.send('TRACE_START');assert.equal(result.ok,false);assert.equal(result.observation.observerAttached,false);assert.equal(h.send('TRACE_GET').result.active,false);assert.equal(Object.keys(h.listeners).length,0);
});
test('observer target disconnection and bounded mutation scanning remain explicit coverage gaps',()=>{
 const h=harness();h.send('TRACE_START');h.html.isConnected=false;assert.equal(h.send('TRACE_GET').result.observation.documentConnected,false);h.html.isConnected=true;
 const irrelevant={type:'attributes',target:h.html,addedNodes:[],removedNodes:[],attributeName:'class'};h.observers[0].fn(Array(125).fill(irrelevant));assert.equal(h.send('TRACE_GET').result.observation.mutationScanClipped,5);
});
test('wordpool-only roots are discovered and new timeline entries retain session/frame context',()=>{
 const h=harness();h.root.className='om-text-gap';const started=h.send('TRACE_START',{context:{sessionId:'s',phase:'automated-attempt',frameId:145}});assert.equal(started.observation.rootCountAtStart,1);h.listeners.click({type:'click',target:h.source});const action=h.send('TRACE_GET').result.events.find(e=>e.type==='action-before');assert.equal(action.sessionId,'s');assert.equal(action.frameId,145);assert.equal(action.attribution.role,'source');
});

test('recorder bounded cutoff reports its reason and retains a final boundary state',()=>{
 const h=harness();h.send('TRACE_START');for(let i=0;i<370;i++)h.listeners.pointerup({type:'pointerup',target:h.source});let trace=h.send('TRACE_GET').result;assert.equal(trace.truncated,true);assert.ok(trace.observation.truncationReasons.some(r=>['event-limit','snapshot-budget'].includes(r)));assert.ok(trace.observation.firstDroppedMs>=0);h.send('TRACE_STOP');trace=h.send('TRACE_GET').result;assert.equal(trace.events.at(-1).type,'final');assert.ok(trace.eventCount<=360);assert.equal(trace.observation.mutationCallbacks,0);assert.equal(trace.observation.mutationDrains,0); // Truncated traces intentionally skip mutation drains.
});

test('60 second repeated activation trace retains occupancy transfers and unchanged sample references',()=>{
 const h=harness();const card=h.source.children[0];card.attrs['data-model-id']='live-source';
 h.send('TRACE_START');
 const fire=type=>h.listeners[type]({type,target:card,isTrusted:false});
 const sample=()=>{for(const timer of h.timers.filter(t=>t.ms<2000&&!t.done)){timer.done=true;timer.fn();}};
 for(let i=0;i<30;i++){
  fire('pointerdown');fire('mousedown');fire('click');
  if(i===2){h.source.children=[];h.gap.add(card);}
  if(i===8){h.gap.children=[];h.source.add(card);}
  sample();h.advance(2000);
 }
 h.listeners.dblclick({type:'dblclick',target:card,isTrusted:false});sample();h.send('TRACE_STOP');
 const trace=h.send('TRACE_GET').result;
 assert.equal(trace.truncated,false);assert.ok(trace.events.some(e=>e.type==='action-sample'&&e.unchanged));
 assert.equal(trace.events.filter(e=>e.type==='action-before').length,31);
 const states=trace.events.filter(e=>e.afterState).map(e=>e.afterState[0]);
 assert.ok(states.some(w=>w.destinations[0].occupancy.occupantIds.includes('live-source')));
 assert.ok(states.some(w=>w.sources[0].occupancy.occupantIds.includes('live-source')));
 for(const e of trace.events.filter(e=>e.type==='action-sample'))assert.equal(trace.events[e.afterStateRef].type,'action-after');
 console.log('OPTIMIZED_60S',JSON.stringify({events:trace.events.length,chars:JSON.stringify(trace.events).length,truncated:trace.truncated,firstDroppedMs:trace.observation.firstDroppedMs??null}));
});
test('occupied-gap handle attribution retains destination and live draggable model ID',()=>{
 const h=harness(),card=h.source.children[0];card.attrs['data-model-id']='moved';h.source.children=[];h.gap.add(card);
 h.send('TRACE_START');h.listeners.dblclick({type:'dblclick',target:card,isTrusted:false});h.send('TRACE_STOP');
 const event=h.send('TRACE_GET').result.events.find(e=>e.type==='dblclick');
 assert.equal(event.attribution.role,'destination');assert.equal(event.attribution.draggableModelId,'moved');
});

test('synthetic swap observation retains both occupant identities without asserting removal causality',()=>{
 const h=harness(),a=h.source.children[0],b=new h.El('div','b','om-text-gap__draggable','beta');
 a.attrs['data-model-id']='A';b.attrs['data-model-id']='B';
 const g2=h.root.add(new h.El('div','g2','om-text-gap__target-item'));
 h.source.children=[];h.gap.add(b);g2.add(a);h.send('TRACE_START');
 const move=(card,to)=>{card.parentElement.children=card.parentElement.children.filter(n=>n!==card);to.add(card);};
 h.listeners.dblclick({type:'dblclick',target:a,isTrusted:false});move(a,h.source);
 for(const timer of h.timers.filter(t=>t.ms<2000&&!t.done)){timer.done=true;timer.fn();}
 h.advance(1000);h.listeners.click({type:'click',target:b,isTrusted:false});move(b,g2);move(a,h.gap);
 for(const timer of h.timers.filter(t=>t.ms<2000&&!t.done)){timer.done=true;timer.fn();}
 h.send('TRACE_STOP');const trace=h.send('TRACE_GET').result;
 const before=trace.events[0].state.deepInteractions;
 const after=trace.events.findLast(e=>e.type==='final').state.deepInteractions;
 assert.equal(compare(before,after).occupancyChanged,true);
 assert.deepEqual(Array.from(after[0].destinations[0].occupancy.occupantIds),['A']);
 assert.deepEqual(Array.from(after[0].destinations[1].occupancy.occupantIds),['B']);
});

test('same five-source 60-second fixture compares legacy inventories with occupancy encoding',()=>{
 const results=[];
 for(const legacyInventory of [true,false]){
  const h=harness({legacyInventory});
  for(let i=2;i<=5;i++){
   const source=h.root.add(new h.El('div','s'+i,'om-text-gap__pool-item','phrase '+i));
   source.add(new h.El('div','c'+i,'om-text-gap__draggable','phrase '+i));
   h.root.add(new h.El('div','g'+i,'om-text-gap__target-item'));
  }
  h.send('TRACE_START');
  for(let i=0;i<30;i++){
   for(const type of ['pointerdown','mousedown','click'])h.listeners[type]({type,target:h.source,isTrusted:false});
   for(const timer of h.timers.filter(t=>t.ms<2000&&!t.done)){timer.done=true;timer.fn();}
   h.advance(2000);
  }
  h.send('TRACE_STOP');const trace=h.send('TRACE_GET').result;
  results.push({encoding:legacyInventory?'legacy inventories with unchanged-sample dedup':'occupancy-v1',chars:JSON.stringify(trace.events).length,events:trace.events.length,truncated:trace.truncated,firstDroppedMs:trace.observation.firstDroppedMs??null});
 }
 console.log('SAME_FIXTURE_SIZE',JSON.stringify(results));
 assert.equal(results[1].truncated,false);assert.ok(results[1].chars<results[0].chars);
});
