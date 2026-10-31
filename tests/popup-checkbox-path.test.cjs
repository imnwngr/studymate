'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../popup.js'),'utf8');
function setup(change=()=>{}){
 const labels=['Option 1','Option 2','Option 3'];
 const answer={id:'q1',answer:'Option 1 | Option 3',selectedIds:['C0_0','C0_2'],choiceOptions:labels,source:'qti',confidence:'high'};
 const state={frameId:2498,title:'1e | Writing | 1',questions:[{id:'q1',kind:'checkbox',applyable:true,options:labels,choiceIds:['C0_0','C0_1','C0_2']}],answers:new Map()};
 const replies=[answer],messages=[],logs=[],nodes=new Map();change({answer,state,replies});
 const context={state,$:id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',classList:{add(){},remove(){}}});return nodes.get(id);},I:{language:'en'},t:()=>'',normalized:x=>String(x).trim().toLowerCase(),progress(){},status(){},render(){},updateAnswers(){},errString:e=>e.message,solveDiagnostic:(stage,data)=>logs.push({stage,data}),document:{querySelector:()=>null},chrome:{runtime:{sendMessage:()=>{throw Error('Checkbox must not invoke AI');}}},sendFrame:async(frame,message)=>{messages.push({frame,message});return message.type==='SPARK_QTI'?{ok:true,result:{reason:replies.length?'complete':'noQti',answers:replies}}:{ok:true,result:[{id:'q1',status:'filled'}]};}};
 vm.runInNewContext(source.slice(source.indexOf('async function solve()'),source.indexOf('// Copy the complete current exercise'))+source.slice(source.indexOf('async function applyAnswers()'),source.indexOf('async function autoSolveAndFill()'))+';globalThis.runSolve=solve;globalThis.runApply=applyAnswers;',context);
 return {context,state,messages,logs};
}
test('QTI complete -> verified checkbox -> eligible -> apply -> verify, repeat safely',async()=>{
 const h=setup();for(let i=0;i<2;i++){
 assert.equal(await h.context.runSolve(),true);assert.equal(h.state.verifiedQti,true);
 assert.equal(await h.context.runApply(),true);assert.equal(h.state.lastApplyVerified,true);
 }
 assert.deepEqual(h.messages.map(x=>x.message.type),['SPARK_QTI','SPARK_APPLY','SPARK_QTI','SPARK_APPLY']);
 assert.deepEqual(Array.from(h.messages[1].message.answers[0].selectedIds),['C0_0','C0_2']);
 assert.equal(h.logs.some(x=>x.data.reason==='noEligibleAnswers'),false);
});
for(const [name,change] of [
 ['question ID mismatch',({answer})=>answer.id='other'],
 ['missing QTI',({replies})=>replies.length=0],
 ['missing selectedIds',({answer})=>delete answer.selectedIds],
 ['invalid selectedIds shape',({answer})=>answer.selectedIds='C0_0'],
 ['unknown selected ID',({answer})=>answer.selectedIds=['C0_9']],
 ['missing choice mapping',({answer})=>delete answer.choiceOptions],
 ['untrusted source',({answer})=>answer.source='ai']
])test('checkbox safely rejects '+name,async()=>{
 const h=setup(change);await h.context.runSolve();assert.equal(await h.context.runApply(),false);
 assert.equal(h.messages.some(x=>x.message.type==='SPARK_APPLY'),false);
 assert.equal(h.state.lastApplyVerified,false);
});
test('single-choice labels still require exact membership',async()=>{
 const h=setup(({state})=>state.questions[0].kind='choice');await h.context.runSolve();assert.equal(await h.context.runApply(),false);
 assert.equal(h.messages.some(x=>x.message.type==='SPARK_APPLY'),false);
});
test('checkbox diagnostics omit answer text and arbitrary DOM result details',async()=>{
 const h=setup();await h.context.runSolve();const secret='synthetic-private-marker';
 h.context.sendFrame=async()=>({ok:true,result:[{id:'q1',status:'uncertain',reason:'VERIFY_FAILED',detail:secret,observed:secret,answer:secret}]});
 assert.equal(await h.context.runApply(),false);assert.equal(JSON.stringify(h.logs).includes(secret),false);
});
