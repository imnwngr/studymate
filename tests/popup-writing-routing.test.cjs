'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../popup.js'),'utf8');
const helper=source.slice(source.indexOf('async function solveWriting('),source.indexOf('async function solve()'));
const solve=source.slice(source.indexOf('async function solve()'),source.indexOf('// Copy the complete current exercise'));
const auto=source.slice(source.indexOf('async function autoSolveAndFill()'),source.indexOf('async function submitAndNext()'));
test('deferred QTI in frame 2270 routes exactly once to Writing and verifies editor',async()=>{
 const logs=[],messages=[],writes=[],nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:false});return nodes.get(id)};
 const state={tabId:4,sparkTab:true,frameId:null,questions:[],answers:new Map()};
 const writing={found:true,frameId:2270,rootId:'content_wrap_0',exercise:'Design a form.\nSample answer\nCHECK',videoUrl:''};
 const ctx={state,$:node,setTimeout,Date,Math,Set,Promise,I:{language:'en'},t:k=>k,normalized:s=>String(s).toLowerCase(),progress(){},status(){},render(){},updateAnswers(){},errString:e=>e.message,solveDiagnostic:(name,data)=>logs.push({name,data}),
  chrome:{tabs:{query:async()=>[{id:4,url:'https://learn.eltngl.com/'}]},runtime:{sendMessage:async msg=>{messages.push(msg);assert.equal(msg.type,'SPARK_TEXT_WRITING');return {ok:true,answer:'Name: ____\nLanguage: ____'}}}},
  SparkSites:{recognize:()=>({adapterId:'ngl'})},SparkTextWriting:{scan:async()=>({found:false,pending:false}),scanFrame:async(_chrome,tab,frame,options)=>{assert.equal(tab,4);assert.equal(frame,2270);assert.equal(options?.allowAuxRecording,undefined);return writing}},SparkVideoWriting:{capture:async()=>({contextToken:"synthetic-context"}),writeText:async(_chrome,tab,frame,answer)=>{writes.push({tab,frame,answer});return {written:true}}},
  scanPage:async()=>{Object.assign(state,{frameId:2270,title:'1e | Writing | 2',questions:[{id:'q1',kind:'text',context:'Design a form',applyable:true}],screenIndex:0,screenCount:null});return true},
  sendFrame:async(frame,msg)=>{assert.equal(frame,2270);assert.equal(msg.type,'SPARK_QTI');return {ok:true,result:{reason:'deferredCategory',answers:[]}}},
  applyAnswers:async()=>{throw Error('Writing must use CKEditor writer')},document:{querySelector:()=>null}};
 vm.runInNewContext(helper+solve+auto+';globalThis.run=autoSolveAndFill;',ctx);await ctx.run();
 assert.equal(messages.length,1);assert.equal(messages[0].type,'SPARK_TEXT_WRITING');assert.deepEqual(writes,[{tab:4,frame:2270,answer:'Name: ____\nLanguage: ____'}]);
 assert.ok(logs.some(x=>x.name==='qti'&&x.data.reason==='deferredCategory'&&x.data.answers===0));assert.equal(logs.some(x=>x.name==='APPLY_NOT_REQUESTED'),false);assert.ok(logs.some(x=>x.name==='SOLVE_COMPLETED'&&x.data.result==='writing-verified'));assert.equal(node('submitNext').disabled,true);
});
for(const video of [false,true])for(const phase of ['before AI returns','after popup recheck'])test((video?'video':'text')+' blocks stale answer '+phase,async()=>{
 const Writer=require('../video-writing.js'),f=require('./writing-context-fixture.cjs')({video}),mainWindow=window;
 const writing={found:true,frameId:71,exercise:'Write an answer.',...f.expected()},requests=[],logs=[];
 const chrome={scripting:{executeScript:async o=>{global.window=mainWindow;return [{frameId:71,documentId:'synthetic-document',result:await o.func(...o.args)}];}},runtime:{sendMessage:async m=>{requests.push(m);if(phase==='before AI returns')f.doc.URL='https://example.test/cdn_proxy/new-exercise/index';return {ok:true,answer:'Old answer'};}}};
 const ctx={state:{},chrome,SparkVideoWriting:Writer,SparkTextWriting:{scanFrame:async()=>{if(phase==='after popup recheck')f.doc.URL='https://example.test/cdn_proxy/new-exercise/index';return writing;}},$:()=>({}),status(){},errString:e=>e.message,solveDiagnostic:(...x)=>logs.push(x)};
 vm.runInNewContext(helper+';globalThis.run=solveWriting;',ctx);
 await assert.rejects(ctx.run(writing,1),/WRITING_CONTEXT_CHANGED/);
 assert.equal(requests.length,1);assert.equal(f.writes(),0);assert.equal(f.html(),'');assert.notEqual(ctx.state.writingCompleted,true);
 assert.equal(Object.hasOwn(requests[0],'contextToken'),false);assert.equal(JSON.stringify(logs).includes('Old answer'),false);
});
test('unknown exercise identity prevents AI request and write',async()=>{
 const Writer=require('../video-writing.js'),f=require('./writing-context-fixture.cjs')();f.doc.URL='about:blank';let requests=0;
 const chrome={scripting:{executeScript:async o=>[{frameId:71,result:await o.func(...o.args)}]},runtime:{sendMessage:async()=>{requests++;}}};
 const ctx={state:{},chrome,SparkVideoWriting:Writer,status(){},errString:e=>e.message};vm.runInNewContext(helper+';globalThis.run=solveWriting;',ctx);
 await assert.rejects(ctx.run({frameId:71,...f.expected()},1),/WRITING_CONTEXT_CHANGED/);assert.equal(requests,0);assert.equal(f.writes(),0);
});
function routingHarness({reason='noMapping',video=true,preMiss=true,kind='text',blocker='',noEditor=false,nested=false,title='Synthetic exercise',instructions,wrapper=false,recordingCase='',contentFrame=91,sparkTab=true}={}){
 const D=require('../text-writing.js'),Writer=require('../video-writing.js'),f=require('./writing-context-fixture.cjs')({video}),mainWindow=window;
 if(instructions!==undefined)f.setText(instructions);
 if(blocker){const query=f.scope.querySelectorAll;f.scope.querySelectorAll=s=>s==='video'?query(s):[{nodeType:1,tagName:'DIV',parentElement:f.scope,hidden:false,hasAttribute:()=>false,getAttribute:()=>null,closest:()=>null,matches:s=>s===blocker}];}
 if(wrapper){
  const classes=new Set(['interaction','ic-speaking-and-recording']);classes.contains=name=>classes.has(name);
  const ui={nodeType:1,tagName:'BUTTON',hidden:false,hasAttribute:()=>false,getAttribute:()=>null,closest:s=>s==='.cke,.cke_dialog'?{}:null};
  const widget={nodeType:1,tagName:'DIV',parentElement:f.scope,hidden:false,attributes:[],classList:classes,hasAttribute:()=>false,getAttribute:()=>null,closest:s=>s==='.content-wrap'?f.scope:null,contains:n=>n===f.frame,matches:s=>s==='.interaction.ic-speaking-and-recording'};
  const nodes=Array.from({length:7},()=>({...ui}));
  if(recordingCase==='button')nodes.push({...ui,closest:()=>null});
  if(recordingCase==='stream')nodes.push({...ui,tagName:'AUDIO',srcObject:{active:true,getTracks:()=>[{readyState:'live'}]}});
  if(recordingCase==='active')classes.add('is-recording');
  if(recordingCase==='unknown-state')widget.getAttribute=n=>n==='data-recording-state'?'unknown':null;
  if(recordingCase==='custom')nodes.push({...widget,tagName:'DIV',closest:()=>null,attributes:[{name:'data-event',value:'custom'}]});
  widget.querySelectorAll=()=>nodes;
  const query=f.scope.querySelectorAll;f.scope.querySelectorAll=s=>s==='video'?query(s):s==='.interaction.ic-speaking-and-recording'?[widget]:[widget];
 }
 if(noEditor){const query=f.doc.querySelectorAll;f.doc.querySelectorAll=s=>s.startsWith('iframe')?[]:query(s);}
 const contentId=contentFrame,selectedId=nested?contentFrame-1:contentId,empty={URL:'https://example.test/dashboard',querySelectorAll:()=>[]};
 const messages=[],writes=[],worlds=[],logs=[],nodes=new Map();let scans=0;
 const chrome={tabs:{query:async()=>[{id:4,url:'https://learn.eltngl.com/'}]},scripting:{executeScript:async o=>{
  worlds.push(o);const ids=o.target.allFrames?[0,selectedId,contentId,92].filter((v,i,a)=>a.indexOf(v)===i):o.target.frameIds||[contentId];
  const out=[];for(const frameId of ids){global.document=frameId===contentId?f.doc:empty;global.window=o.world==='MAIN'?mainWindow:{};out.push({frameId,documentId:frameId===contentId?'content-document':'other-document',result:await o.func(...(o.args||[]))});}return out;
 }},runtime:{sendMessage:async m=>{messages.push(m);if(m.type==='SPARK_SOLVE')return {ok:true,result:{answers:[]}};assert.equal(m.type,video?'SPARK_VIDEO_SOLVE':'SPARK_TEXT_WRITING');return {ok:true,answer:'A learner is writing.\nThey look focused.'};}}};
 const state={tabId:4,sparkTab,questions:[],answers:new Map()};
 const ctx={state,chrome,$:id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:false});return nodes.get(id)},I:{language:'en'},t:()=>'',normalized:s=>String(s).toLowerCase(),setTimeout,Date,Math,Set,Promise,progress(){},status(){},render(){},updateAnswers(){},errString:e=>e.message,solveDiagnostic:(stage,data)=>logs.push({stage,data}),document:{querySelector:()=>null},SparkSites:{recognize:()=>sparkTab?{adapterId:'ngl'}:null},
  SparkTextWriting:{scan:async(c,t)=>{scans++;return preMiss&&scans===1?{found:false,pending:false}:D.scan(c,t)},scanFrame:D.scanFrame},SparkVideoWriting:Writer,
  scanPage:async()=>{Object.assign(state,{frameId:selectedId,title,questions:[{id:'q1',kind,options:[],applyable:true}],screenIndex:0,screenCount:1});return true},
  sendFrame:async(frame,m)=>{messages.push(m);assert.equal(m.type,'SPARK_QTI');assert.equal(frame,selectedId);return {ok:true,result:{reason,answers:[]}}},applyAnswers:async()=>{throw Error('Must not apply missing QTI answers');}};
 vm.runInNewContext(helper+solve+auto+';globalThis.run=autoSolveAndFill;',ctx);
 return {run:ctx.run,f,state,messages,worlds,logs,contentId,scans:()=>scans};
}
for(const reason of ['noMapping','deferredCategory'])test('video plus editor routes after QTI '+reason+' without title gate',async()=>{
 const h=routingHarness({reason});await h.run();assert.equal(h.messages.filter(m=>m.type==='SPARK_VIDEO_SOLVE').length,1);assert.equal(h.messages.filter(m=>m.type==='SPARK_QTI').length,1);assert.equal(h.messages.some(m=>m.type==='SPARK_SOLVE'),false);assert.equal(h.f.writes(),1);assert.equal(h.state.writingCompleted,true);
});
test('pre-QTI video detection bypasses QTI and uses existing guarded writer',async()=>{const h=routingHarness({preMiss:false});await h.run();assert.deepEqual(h.messages.map(m=>m.type),['SPARK_VIDEO_SOLVE']);assert.equal(h.f.writes(),1)});
test('noMapping text Writing uses text API only',async()=>{const h=routingHarness({video:false});await h.run();assert.equal(h.messages.filter(m=>m.type==='SPARK_TEXT_WRITING').length,1);assert.equal(h.messages.some(m=>m.type==='SPARK_VIDEO_SOLVE'),false);assert.equal(h.f.writes(),1)});
test('noMapping without editor cannot invoke Writing',async()=>{const h=routingHarness({noEditor:true});await h.run();assert.equal(h.messages.some(m=>/WRITING|VIDEO_SOLVE/.test(m.type)),false);assert.equal(h.f.writes(),0);assert.notEqual(h.state.writingCompleted,true)});
for(const [kind,blocker]of [['checkbox','.interaction.is-checkbox'],['choice','.interaction.is-radiobutton'],['gapWordPool','.interaction.om-text-gap']])test(kind+' with auxiliary video stays outside Writing',async()=>{const h=routingHarness({kind,blocker,preMiss:false});await h.run();assert.equal(h.messages.some(m=>/WRITING|VIDEO_SOLVE/.test(m.type)),false);assert.equal(h.f.writes(),0)});
test('noMapping generic text scan cannot bypass DOM specialized guard',async()=>{const h=routingHarness({blocker:'.interaction.is-checkbox'});await h.run();assert.equal(h.messages.some(m=>m.type==='SPARK_VIDEO_SOLVE'),false);assert.equal(h.f.writes(),0)});
test('fallback discovers content parent through nested frames and writes only there',async()=>{const h=routingHarness({nested:true});await h.run();assert.equal(h.f.writes(),1);assert.equal(h.state.writingFrameId,h.contentId);assert.ok(h.worlds.some(o=>o.target.allFrames));assert.ok(h.worlds.filter(o=>o.world==='MAIN').every(o=>o.target.frameIds?.[0]===h.contentId||o.target.documentIds?.[0]==='content-document'));assert.equal(h.messages.filter(m=>m.type==='SPARK_VIDEO_SOLVE').length,1)});
for(const preMiss of [false,true])test('Visual literacy video answer instructions route '+(preMiss?'after noMapping':'before QTI'),async()=>{
 const h=routingHarness({title:'2f | Visual literacy | 2',preMiss,instructions:'Watch the video. Answer the questions in complete sentences.'});await h.run();assert.equal(h.messages.filter(m=>m.type==='SPARK_VIDEO_SOLVE').length,1);assert.equal(h.f.writes(),1);assert.equal(h.state.writingFrameId,h.contentId);
});
for(const reason of ['noMapping','deferredCategory'])test('arbitrary title video analysis uses DOM not category: '+reason,async()=>{
 const h=routingHarness({title:'Synthetic | Media lesson | 3',reason,instructions:'Watch the clip. Summarize the story and analyze the main character.'});await h.run();assert.equal(h.messages.filter(m=>m.type==='SPARK_VIDEO_SOLVE').length,1);assert.equal(h.f.writes(),1);
});
test('Writing title text-only keeps Text Writing route',async()=>{const h=routingHarness({title:'1e | Writing | 2',video:false});await h.run();assert.equal(h.messages.filter(m=>m.type==='SPARK_TEXT_WRITING').length,1);assert.equal(h.f.writes(),1)});
test('Writing title without editor is not Writing DOM',async()=>{const h=routingHarness({title:'1e | Writing | 2',noEditor:true});await h.run();assert.equal(h.messages.some(m=>/WRITING|VIDEO_SOLVE/.test(m.type)),false);assert.equal(h.f.writes(),0)});
for(const blocker of ['.interaction.ic-speaking-and-recording','[role="combobox"]','.interaction.om-text-gap'])test('Visual literacy with video rejects specialized '+blocker,async()=>{const h=routingHarness({title:'2f | Visual literacy | 2',blocker,instructions:'Watch the video. Answer the questions.'});await h.run();assert.equal(h.messages.some(m=>/WRITING|VIDEO_SOLVE/.test(m.type)),false);assert.equal(h.f.writes(),0)});
test('noMapping Writing title cannot authorize a recording widget exception',async()=>{const h=routingHarness({title:'1e | Writing | 2',blocker:'.interaction.ic-speaking-and-recording'});await h.run();assert.equal(h.messages.some(m=>/WRITING|VIDEO_SOLVE/.test(m.type)),false);assert.equal(h.f.writes(),0)});
test('video answer instructions in nested frames choose content frame',async()=>{const h=routingHarness({title:'2f | Visual literacy | 2',nested:true,instructions:'Watch the video. Answer the questions.'});await h.run();assert.equal(h.f.writes(),1);assert.equal(h.state.writingFrameId,h.contentId)});
test('unrelated video and editor without task instructions cannot invoke Writing',async()=>{const h=routingHarness({instructions:'Video player and recording settings.'});await h.run();assert.equal(h.messages.some(m=>/WRITING|VIDEO_SOLVE/.test(m.type)),false);assert.equal(h.f.writes(),0)});
for(const reason of ['noMapping','deferredCategory'])for(const preMiss of [false,true])test(reason+' editor-only Recording wrapper permits Video Writing '+(preMiss?'fallback':'pre-QTI'),async()=>{
 const h=routingHarness({wrapper:true,reason,preMiss,title:'2f | Visual literacy | 2',instructions:'Watch the video. Answer the questions.'});await h.run();assert.equal(h.messages.filter(m=>m.type==='SPARK_VIDEO_SOLVE').length,1);assert.equal(h.f.writes(),1);
});
test('Text Writing editor-only wrapper remains eligible',async()=>{const h=routingHarness({wrapper:true,video:false,reason:'deferredCategory',title:'1e | Writing | 2'});await h.run();assert.equal(h.messages.filter(m=>m.type==='SPARK_TEXT_WRITING').length,1);assert.equal(h.f.writes(),1)});
for(const recordingCase of ['button','stream','active','custom','unknown-state'])for(const reason of ['noMapping','deferredCategory'])test(reason+' refuses Recording '+recordingCase,async()=>{
 const h=routingHarness({wrapper:true,recordingCase,reason,title:'1e | Writing | 2',preMiss:false});await h.run();assert.equal(h.messages.some(m=>/WRITING|VIDEO_SOLVE/.test(m.type)),false);assert.equal(h.f.writes(),0);
});
for(const contentFrame of [121,407])test('editor-only wrapper in nested frames uses discovered frame '+contentFrame,async()=>{const h=routingHarness({wrapper:true,nested:true,contentFrame});await h.run();assert.equal(h.f.writes(),1);assert.equal(h.state.writingFrameId,contentFrame)});

test('a content frame without an editor does not switch to another frame', async () => {
 const h = routingHarness({noEditor:true});
 await h.run();
 assert.equal(h.scans(), 1);
 assert.equal(h.f.writes(), 0);
});

test('a generic site does not switch to Spark Writing after its scan', async () => {
 const h = routingHarness({sparkTab:false});
 await h.run();
 assert.equal(h.messages.some(message => /WRITING|VIDEO_SOLVE/.test(message.type)), false);
 assert.equal(h.f.writes(), 0);
});
