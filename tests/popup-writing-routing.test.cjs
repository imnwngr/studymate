'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../popup.js'),'utf8');
const helper=source.slice(source.indexOf('async function solveWriting('),source.indexOf('async function solve()'));
const solve=source.slice(source.indexOf('async function solve()'),source.indexOf('// Copy the complete current exercise'));
const auto=source.slice(source.indexOf('async function autoSolveAndFill()'),source.indexOf('async function submitAndNext()'));
test('deferred QTI in frame 2270 routes exactly once to Writing and verifies editor',async()=>{
 const logs=[],messages=[],writes=[],nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:false});return nodes.get(id)};
 const state={tabId:4,frameId:null,questions:[],answers:new Map()};
 const writing={found:true,frameId:2270,rootId:'content_wrap_0',exercise:'Design a form.\nSample answer\nCHECK',videoUrl:'',allowAuxRecording:true};
 const ctx={state,$:node,setTimeout,Date,Math,Set,Promise,I:{language:'en'},t:k=>k,normalized:s=>String(s).toLowerCase(),progress(){},status(){},render(){},updateAnswers(){},errString:e=>e.message,solveDiagnostic:(name,data)=>logs.push({name,data}),
  chrome:{tabs:{query:async()=>[{id:4,url:'https://learn.eltngl.com/'}]},runtime:{sendMessage:async msg=>{messages.push(msg);assert.equal(msg.type,'SPARK_TEXT_WRITING');return {ok:true,answer:'Name: ____\nLanguage: ____'}}}},
  SparkSites:{recognize:()=>({adapterId:'ngl'})},SparkTextWriting:{scan:async()=>({found:false,pending:false}),scanFrame:async(_chrome,tab,frame,options)=>{assert.equal(tab,4);assert.equal(frame,2270);assert.equal(options.allowAuxRecording,true);return writing}},SparkVideoWriting:{capture:async()=>({contextToken:"synthetic-context"}),writeText:async(_chrome,tab,frame,answer)=>{writes.push({tab,frame,answer});return {written:true}}},
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
