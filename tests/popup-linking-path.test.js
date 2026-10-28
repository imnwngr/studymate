'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../popup.js'),'utf8');
test('actual popup routes verified linking QTI to its frame and blocks submission of unverified final state',async()=>{
  const messages=[],logs=[],nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',classList:{add(){},remove(){}}});return nodes.get(id);};
  const answer={id:'q1',answer:'Alpha → Gap 1',source:'qti',confidence:'high',linkingVerified:true,
    pairs:[{sourceId:'T0',targetId:'G0',targetIndex:0,source:'Alpha'}]};
  const state={frameId:137,title:'1d | Real life | 1',questions:[{id:'q1',kind:'linkingLines',applyable:true,options:[]}],answers:new Map()};
  const context={state,$:node,I:{language:'en'},t:()=>'',normalized:x=>String(x).toLowerCase(),
    progress(){},status(){},render(){},updateAnswers(){},errString:e=>e.message,
    solveDiagnostic:(...args)=>logs.push(args),document:{querySelector:()=>null},
    sendFrame:async(frame,message)=>{messages.push({frame,message});return message.type==='SPARK_QTI'?
      {ok:true,result:{reason:'complete',answers:[answer]}}:
      {ok:true,result:[{id:'q1',status:'uncertain',detail:'Spark did not confirm placement.'}]};}};
  const solve=source.slice(source.indexOf('async function solve()'),source.indexOf('// Copy the complete current exercise'));
  const apply=source.slice(source.indexOf('async function applyAnswers()'),source.indexOf('async function autoSolveAndFill()'));
  vm.runInNewContext(solve+apply+';globalThis.runSolve=solve;globalThis.runApply=applyAnswers;',context);
  assert.equal(await context.runSolve(),true);
  assert.equal(await context.runApply(),false);
  assert.deepEqual(messages.map(x=>[x.frame,x.message.type]),[[137,'SPARK_QTI'],[137,'SPARK_APPLY']]);
  assert.equal(messages[1].message.answers[0].id,'q1');
  assert.equal(state.lastApplyVerified,false);
  assert.equal(node('submitNext').disabled,true);
  assert.match(node('fillReport').textContent,/did not confirm placement/);
  assert.deepEqual(logs.map(x=>x[0]),['qti','ANSWER_READY','APPLY_REQUESTED','apply','APPLY_BLOCKED']);
});
