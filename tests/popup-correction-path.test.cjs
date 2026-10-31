'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../popup.js'),'utf8');
for(const scenario of ['verified','missing QTI','failed commit'])test('popup correction routing: '+scenario,async()=>{
 const messages=[],nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',classList:{add(){},remove(){}}});return nodes.get(id);};
 const state={frameId:64,title:'Synthetic | Grammar | 2',architecture:{adapterId:'ngl',capabilities:['verified-submit']},questions:[{id:'q1',kind:'textCorrection',applyable:true,options:[]}],answers:new Map()};
 const corrections=[{from:'wrong',to:'right',tokenIndex:2,sentence:0,sentenceTokenIndex:2,anchorVerified:true}];
 const context={state,$:node,I:{language:'en'},t:()=>'',normalized:x=>String(x).toLowerCase(),progress(){},status(){},render(){},updateAnswers(){},errString:e=>e.message,solveDiagnostic(){},document:{querySelector:()=>null},
  chrome:{runtime:{sendMessage:()=>{throw Error('Correction must not invoke AI fallback');}}},
  sendFrame:async(frame,message)=>{messages.push({frame,message});return message.type==='SPARK_QTI'?
   {ok:true,result:{reason:scenario==='missing QTI'?'UNSUPPORTED':'complete',answers:scenario==='missing QTI'?[]:[{id:'q1',answer:'wrong → right',source:'qti',confidence:'high',corrections}]}}:
   {ok:true,result:[{id:'q1',status:scenario==='verified'?'filled':'uncertain',detail:'commit result'}]};}};
 const solve=source.slice(source.indexOf('async function solve()'),source.indexOf('// Copy the complete current exercise'));
 const apply=source.slice(source.indexOf('async function applyAnswers()'),source.indexOf('async function autoSolveAndFill()'));
 vm.runInNewContext(solve+apply+';globalThis.runSolve=solve;globalThis.runApply=applyAnswers;',context);
 await context.runSolve();await context.runApply();
 assert.deepEqual(messages.map(x=>[x.frame,x.message.type]),scenario==='missing QTI'?[[64,'SPARK_QTI']]:[[64,'SPARK_QTI'],[64,'SPARK_APPLY']]);
 if(scenario!=='missing QTI')assert.deepEqual(messages[1].message.answers[0].corrections,corrections);
 assert.equal(state.lastApplyVerified,false,'correction completion must not authorize gradebook submission');
 assert.equal(node('submitNext').disabled,true);
});
