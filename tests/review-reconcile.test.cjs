'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../solvers/interactions.js'),'utf8'),context);
const solver=context.SparkSolvers;

test('Review retains the native reset barrier for reset-dependent ports',async()=>{
  const state=['wrong','wrong'],calls=[];
  const port={count:2,inspectHidden:true,phase:p=>calls.push(p),preflight:async()=>null,
    reset:async()=>{calls.push('native-reset');state.fill('');return null;},empty:i=>state[i]==='',
    activate:async()=>true,check:()=>true,verify:i=>state[i]==='correct',
    solveGroup:async i=>{assert.ok(state.every((v,j)=>j<i?v==='correct':v===''));state[i]='correct';return null;},
    failure:(reason,phase,index)=>({status:'uncertain',reason,phase,index})};
  const result=await solver.solve('review',port,{});
  assert.equal(result.status,'filled');assert.equal(result.resetVerified,2);
  assert.deepEqual(calls,['preflight','reset','native-reset','verify-empty','solve','verify-final']);
});

test('Review reconciliation does not call reset and returns section outcomes',async()=>{
  const state=['correct','wrong'];let resetCalls=0,actions=0;
  const port={count:2,reconcile:true,inspectHidden:true,preflight:async()=>null,
    reset:async()=>{resetCalls++;throw Error('unexpected reset');},activate:async()=>true,check:()=>true,
    verify:i=>state[i]==='correct',solveGroup:async i=>{if(state[i]!=='correct'){state[i]='correct';actions++;}return null;},
    completed:i=>({index:i,status:i===0?'AlreadyCorrect':'Corrected'}),
    failure:(reason,phase,index)=>({status:'uncertain',reason,phase,index})};
  const result=await solver.solve('review',port,{});
  assert.equal(result.status,'filled');assert.equal(resetCalls,0);assert.equal(actions,1);
  assert.equal(result.sectionResults[0].status,'AlreadyCorrect');assert.equal(result.sectionResults[1].status,'Corrected');
});

test('per-question reconciliation preserves, fills, replaces and verifies',async()=>{
  assert.equal(typeof solver.checkAndReconcile,'function');
  for(const [initial,expected,status,actions] of [['right','right','AlreadyCorrect',0],['','right','Corrected',1],['wrong','right','Corrected',1]]){
    let value=initial,clicks=0;
    const result=await solver.checkAndReconcile(initial,expected,{replace:true},{matches:(a,b)=>a===b,isEmpty:a=>a==='',
      apply:async v=>{clicks++;value=v;return {status:'filled'};},read:()=>value});
    assert.equal(result.status,status);assert.equal(clicks,actions);
  }
  const failed=await solver.checkAndReconcile('','right',{replace:true},{matches:(a,b)=>a===b,isEmpty:a=>a==='',apply:async()=>({status:'filled'}),read:()=>''});
  assert.equal(failed.status,'Failed');
  const interaction={matches:(a,b)=>a===b,isEmpty:a=>a===''};
  assert.equal((await solver.checkAndReconcile('wrong','right',{replace:false,scopedReset:true,globalReset:true},interaction)).scope,'section');
  assert.equal((await solver.checkAndReconcile('wrong','right',{replace:false,globalReset:true},interaction)).scope,'all');
  assert.equal((await solver.checkAndReconcile('wrong','right',{replace:false},interaction)).reason,'RESET_UNAVAILABLE');
});

test('repeated global recovery is bounded and cannot report success',async()=>{
  const state=['wrong','wrong'];let resets=0;
  const port={count:2,reconcile:true,inspectHidden:true,preflight:async()=>null,phase(){},activate:async()=>true,
    check:()=>true,empty:i=>state[i]==='',verify:i=>state[i]==='correct',
    solveGroup:async i=>{if(i===1)return {status:'recovery',scope:'all'};state[i]='correct';return null;},
    recover:async()=>{resets++;state.fill('');return null;},failure:(reason,phase,index)=>({status:'uncertain',reason,phase,index})};
  const result=await solver.solve('review',port,{});
  assert.equal(result.status,'uncertain');assert.equal(result.reason,'RESET_RECOVERY_UNAVAILABLE');assert.equal(resets,1);
});

for(const scope of ['section','all'])test('non-replaceable Review response recovers through '+scope+' reset',async()=>{
  const state=['wrong','wrong','wrong'],calls=[],attempts=[0,0,0];let resets=0;
  const port={count:3,reconcile:true,inspectHidden:true,preflight:async()=>{calls.push('preflight');return null;},
    phase:p=>calls.push(p),activate:async()=>true,check:()=>true,empty:i=>state[i]==='',verify:i=>state[i]==='correct',
    solveGroup:async i=>{attempts[i]++;if(i===1&&resets===0)return {status:'recovery',scope};state[i]='correct';return null;},
    recover:async(mode,i)=>{assert.equal(mode,scope);resets++;calls.push('recover:'+mode);if(mode==='all')state.fill('');else state[i]='';return null;},
    completed:i=>({index:i,status:'Corrected'}),failure:(reason,phase,index)=>({status:'uncertain',reason,phase,index})};
  const result=await solver.solve('review',port,{});
  assert.equal(result.status,'filled');assert.equal(resets,1);assert.deepEqual(state,['correct','correct','correct']);
  assert.equal(attempts[0],scope==='all'?2:1);assert.equal(attempts[1],2);assert.equal(attempts[2],1);
});
