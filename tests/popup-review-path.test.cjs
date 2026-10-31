'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../popup.js'),'utf8');
for(const scenario of ['verified','missing QTI','partial result'])test('popup mixed Review: '+scenario,async()=>{
 const messages=[],nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',classList:{add(){},remove(){}}});return nodes.get(id);};
 const state={frameId:64,title:'Synthetic | Review',architecture:{adapterId:'ngl',capabilities:['review','verified-submit']},questions:[{id:'q1',kind:'review',applyable:true,options:[]}],answers:new Map()};
 const context={state,$:node,I:{language:'en'},t:()=>'',normalized:x=>String(x).toLowerCase(),progress(){},status(){},render(){},updateAnswers(){},errString:e=>e.message,solveDiagnostic(){},document:{querySelector:()=>null},
  chrome:{runtime:{sendMessage:()=>{throw Error('Review must not invoke AI fallback');}}},
  sendFrame:async(frame,message)=>{messages.push({frame,message});return message.type==='SPARK_QTI'?
   {ok:true,result:{reason:scenario==='missing QTI'?'UNSUPPORTED':'complete',answers:scenario==='missing QTI'?[]:[{id:'q1',answer:'36 trusted responses',source:'qti',confidence:'high',reviewVerified:true}]}}:
   {ok:true,result:[{id:'q1',status:scenario==='verified'?'filled':'uncertain',detail:'Review verification'}]};}};
 const solve=source.slice(source.indexOf('async function solve()'),source.indexOf('// Copy the complete current exercise'));
 const apply=source.slice(source.indexOf('async function applyAnswers()'),source.indexOf('async function autoSolveAndFill()'));
 vm.runInNewContext(solve+apply+';globalThis.runSolve=solve;globalThis.runApply=applyAnswers;',context);
 await context.runSolve();assert.equal(await context.runApply(),scenario==='verified');
 assert.deepEqual(messages.map(x=>[x.frame,x.message.type]),scenario==='missing QTI'?[[64,'SPARK_QTI']]:[[64,'SPARK_QTI'],[64,'SPARK_APPLY']]);
 assert.equal(state.lastApplyVerified,scenario==='verified');
 assert.equal(node('submitNext').disabled,true,'Review verification must not authorize assignment submission');
});
test('popup auto Solve delegates the complete Review once without forwarding or restarting',async()=>{
 const state={tabId:1,frameId:64,questions:[{kind:'review'}],screenIndex:0,screenCount:null,verifiedQti:true};
 let scans=0,solves=0,applies=0;const button={disabled:false};
 const context={state,chrome:{tabs:{query:async()=>[]}},$:()=>button,scanPage:async()=>{scans++;return true;},solve:async()=>{solves++;return true;},
  applyAnswers:async()=>{applies++;state.lastApplyVerified=true;return true;},status(){},solveDiagnostic(){},
  sendFrame:()=>{throw Error('Aggregate Review must not request popup navigation');}};
 const auto=source.slice(source.indexOf('async function autoSolveAndFill()'),source.indexOf('async function submitAndNext()'));
 vm.runInNewContext(auto+';globalThis.run=autoSolveAndFill;',context);await context.run();
 assert.deepEqual([scans,solves,applies],[1,1,1]);assert.equal(button.disabled,false);
});
test('popup does not log Review response contents by default',async()=>{
 const logs=[],nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',classList:{add(){},remove(){}}});return nodes.get(id);};
 const state={frameId:64,architecture:{adapterId:'ngl',capabilities:['review']},questions:[{id:'q1',kind:'review',applyable:true,options:[]}],
  answers:new Map([['q1',{answer:'trusted',source:'qti',confidence:'high',reviewVerified:true}]])};
 const context={state,$:node,t:()=>'',normalized:x=>String(x).toLowerCase(),progress(){},status(){},errString:e=>e.message,
  solveDiagnostic:(stage,data)=>logs.push({stage,data}),document:{querySelector:()=>null},
  sendFrame:async()=>({ok:true,result:[{id:'q1',status:'uncertain',reason:'SECTION_SOLVE_FAILED',detail:'private entered text',observed:['private entered text']}]})};
 const apply=source.slice(source.indexOf('async function applyAnswers()'),source.indexOf('async function autoSolveAndFill()'));
 vm.runInNewContext(apply+';globalThis.run=applyAnswers;',context);assert.equal(await context.run(),false);
 assert.equal(JSON.stringify(logs).includes('private entered text'),false);
});
