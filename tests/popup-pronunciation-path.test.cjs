'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../popup.js'),'utf8');
test('Solve stops before sending any requests on a screen with a recording prompt',async()=>{
 const submit={disabled:false},messages=[];
 const state={questions:[{kind:'text'},{kind:'audioRecording'}],lastApplyVerified:true};
 const context={state,$:()=>submit,t:key=>key,status:message=>messages.push(message)};
 const solve=source.slice(source.indexOf('async function solve()'),source.indexOf('// Copy the complete current exercise'));
 const run=vm.runInNewContext(solve+';solve',context);
 assert.equal(await run(),false);
 assert.equal(state.lastApplyVerified,false);
 assert.equal(submit.disabled,true);
 assert.deepEqual(messages,['recordOnSpark']);
});
for(const scenario of ['verified','missing QTI','unverified final state'])test('popup pronunciation: '+scenario,async()=>{
 const messages=[],nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',classList:{add(){},remove(){}}});return nodes.get(id);};
 const state={frameId:226,title:'Synthetic | Pronunciation | 1',architecture:{adapterId:'ngl',capabilities:['verified-submit']},questions:[{id:'q1',kind:'pronunciation',applyable:true,options:[]}],answers:new Map()};
 const answer={id:'q1',answer:'ba | nd',source:'qti',confidence:'high',markingVerified:true};
 const context={state,$:node,I:{language:'en'},t:()=>'',normalized:x=>String(x).toLowerCase(),progress(){},status(){},render(){},updateAnswers(){},errString:e=>e.message,solveDiagnostic(){},document:{querySelector:()=>null},
  chrome:{runtime:{sendMessage:()=>{throw Error('Pronunciation must not invoke AI fallback');}}},
  sendFrame:async(frame,message)=>{messages.push({frame,message});return message.type==='SPARK_QTI'?
   {ok:true,result:{reason:scenario==='missing QTI'?'noMapping':'complete',answers:scenario==='missing QTI'?[]:[answer]}}:
   {ok:true,result:[{id:'q1',status:scenario==='verified'?'filled':'uncertain',detail:'verification result'}]};}};
 const solve=source.slice(source.indexOf('async function solve()'),source.indexOf('// Copy the complete current exercise'));
 const apply=source.slice(source.indexOf('async function applyAnswers()'),source.indexOf('async function autoSolveAndFill()'));
 vm.runInNewContext(solve+apply+';globalThis.runSolve=solve;globalThis.runApply=applyAnswers;',context);
 await context.runSolve();
 assert.equal(await context.runApply(),scenario==='verified');
 assert.deepEqual(messages.map(x=>[x.frame,x.message.type]),scenario==='missing QTI'?[[226,'SPARK_QTI']]:[[226,'SPARK_QTI'],[226,'SPARK_APPLY']]);
 assert.equal(state.lastApplyVerified,scenario==='verified');
 assert.equal(node('submitNext').disabled,scenario!=='verified');
});
