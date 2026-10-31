(function(root){
  'use strict';
  if(root.SparkSolvers)return;
  const fail=detail=>({status:'uncertain',detail});
  const registry=new Map();
  function register(kind,run){registry.set(kind,run);}
  async function solve(kind,port,answer){
    const run=registry.get(kind);
    if(!run)return {status:'manual',detail:'INTERACTION_UNSUPPORTED'};
    return run(port,answer);
  }
  async function checkAndReconcile(current,expected,capabilities,interaction){
    const matches=value=>interaction.matches(value,expected);
    const classification=matches(current)?'Correct':interaction.isEmpty(current)?'Empty':'Wrong';
    const strategy=classification==='Correct'?'Preserve':classification==='Empty'?'Fill':capabilities.replace?'Replace':'Reset';
    interaction.onStage?.('QUESTION_CHECK',{classification,strategy,replacement:Boolean(capabilities.replace)});
    if(classification==='Correct'){
      interaction.onStage?.('QUESTION_ALREADY_CORRECT',{classification,strategy});
      interaction.onStage?.('QUESTION_VERIFY_PASS',{classification,strategy});
      return {status:'AlreadyCorrect',classification,strategy};
    }
    if(strategy==='Reset'){
      const scope=capabilities.scopedReset?'section':capabilities.globalReset?'all':null;
      if(scope)return {status:'ResetRequired',scope,classification,strategy};
      interaction.onStage?.('QUESTION_VERIFY_FAIL',{classification,strategy,reason:'RESET_UNAVAILABLE'});
      return {status:'Failed',classification,strategy,reason:'RESET_UNAVAILABLE'};
    }
    interaction.onStage?.(strategy==='Fill'?'QUESTION_FILL':'QUESTION_REPLACE',{classification,strategy});
    try{
      const result=await interaction.apply(expected);
      if(result?.status!=='filled'){
        interaction.onStage?.('QUESTION_VERIFY_FAIL',{classification,strategy,reason:result?.detail||'ACTION_FAILED'});
        return {status:'Failed',classification,strategy,reason:result?.detail||'ACTION_FAILED'};
      }
      const observed=await interaction.read();
      if(!matches(observed)){
        interaction.onStage?.('QUESTION_VERIFY_FAIL',{classification,strategy,reason:'QUESTION_MISMATCH'});
        return {status:'Failed',classification,strategy,reason:'QUESTION_MISMATCH'};
      }
      interaction.onStage?.('QUESTION_COMMIT',{classification,strategy});
      interaction.onStage?.('QUESTION_VERIFY_PASS',{classification,strategy});
      return {status:'Corrected',classification,strategy};
    }catch(error){
      interaction.onStage?.('QUESTION_VERIFY_FAIL',{classification,strategy,reason:'ACTION_EXCEPTION'});
      return {status:'Failed',classification,strategy,reason:'ACTION_EXCEPTION',error:String(error?.message||error)};
    }
  }
  register('text',async(p,a)=>{
    await p.write(a.answer);
    return await p.matches(a.answer)?{status:'filled',detail:'Text field verified.'}:fail('TEXT_NOT_VERIFIED');
  });
  register('dropdown',async(p,a)=>{
    if(!p.hasOption(a.answer))return {status:'skipped',detail:'OPTION_NOT_UNIQUE'};
    await p.select(a.answer);
    return await p.matches(a.answer)?{status:'filled',detail:'Selection verified.'}:fail('SELECTION_NOT_VERIFIED');
  });
  const choices=async(p,a)=>{
    const ids=a.selectedIds;
    if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||
      ids.some(id=>!p.ids.includes(id))||(p.single&&ids.length!==1))
      return {status:'skipped',detail:'CHOICE_MAPPING_UNVERIFIED'};
    if(p.single){
      if(!await p.checked(ids[0]))await p.activate(ids[0]);
    }else for(const id of p.ids){
      if(await p.checked(id)!==ids.includes(id))await p.activate(id);
    }
    for(const id of p.ids)if(await p.checked(id)!==ids.includes(id))return fail('CHOICE_STATE_UNVERIFIED');
    return {status:'filled',detail:'Choice state verified.'};
  };
  register('choice',choices);register('multi',choices);
  register('checkbox',async(p,a)=>{
    const ids=a.selectedIds;
    if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!p.ids.includes(id)))
      return {status:'skipped',detail:'Unverified QTI checkbox identifiers.'};
    for(let attempt=0;attempt<=p.ids.length;attempt++){
      const before=p.read();
      if(!before)return fail('Checkbox identity or checked state cannot be verified.');
      const wrong=p.ids.find(id=>before.get(id)!==ids.includes(id));
      if(!wrong){p.accept?.();return {status:'filled',detail:'Exact QTI checkbox set verified.'};}
      if(attempt===p.ids.length)return fail('Checkbox reconciliation did not converge.');
      await p.activate(wrong);
      let after;
      for(let retry=0;retry<6;retry++){
        await p.wait(50);after=p.read();
        if(after&&after.get(wrong)!==before.get(wrong))break;
      }
      if(!after||after.get(wrong)===before.get(wrong)||p.ids.some(id=>id!==wrong&&after.get(id)!==before.get(id)))
        return fail('Checkbox click did not produce an isolated verified transition.');
    }
    return fail('Checkbox state unverified.');
  });
  register('gapWordPool',async(p,a)=>{
    const block=reason=>p.blocked?p.blocked(reason):fail(reason);
    const prepared=await p.prepare();
    if(prepared?.status)return prepared;
    const initial=p.read();
    if(initial.reason||initial.occupied.length>60)return block(initial.reason||'RESET_INCOMPLETE');
    const count=initial.occupied.length;
    for(let step=0;step<count;step++){
      const state=p.read();
      if(state.reason||state.occupied.length!==count-step)return block(state.reason||'RESET_STATE_CHANGED');
      const result=await p.returnToPool(state.occupied[0],step,count);
      if(result?.status)return result;
    }
    const reset=await p.resetComplete();
    if(reset?.status)return reset;
    if(!await p.empty())return block('RESET_INCOMPLETE');
    const plan=await p.plan(a);
    if(!Array.isArray(plan))return plan;
    if(plan.length>60)return block('REFILL_PLAN_TOO_LARGE');
    for(const pair of plan){
      const placement=await p.place(pair);
      if(placement?.status)return placement;
    }
    const result=await p.finish(a);
    if(result.status!=='filled')return result;
    return await p.verify(a)?result:fail('FINAL_MAPPING_MISMATCH');
  });
  register('pronunciation',async(p,a)=>{
    const unsupported=()=>({status:'skipped',detail:'UNSUPPORTED: trusted marking mapping or controls unavailable.'});
    if(!Array.isArray(a.targets)||!a.targets.length||!p.preflight(a))return unsupported();
    const initial=p.read();
    if(!initial)return unsupported();
    if(!await p.mode('erase'))return fail('ERASER_NOT_ACTIVATED');
    for(let count=0;count<=initial.length;count++){
      const state=p.read();
      if(!state)return fail('RESET_IDENTITY_CHANGED');
      const index=state.findIndex(value=>value!==null);
      if(index<0)break;
      if(count===initial.length)return fail('RESET_INCOMPLETE');
      const transition=await p.click(index,'erase');
      if(transition?.status)return transition;
      if(!transition)return fail('ERASER_CLEAR_FAILED');
      const after=p.read();
      if(!after||after[index]!==null||after.some((value,i)=>i!==index&&value!==state[i]))
        return fail('ERASER_CLEAR_FAILED');
    }
    const empty=p.read();
    if(!empty||empty.some(value=>value!==null))return fail('RESET_INCOMPLETE');
    if(!await p.mode('mark'))return fail('MARKING_OPTION_NOT_ACTIVATED');
    const expected=empty.slice();
    for(const target of a.targets){
      const index=p.index(target),state=p.read();
      if(index<0||!state||state.some((value,i)=>value!==expected[i])||expected[index]!==null)
        return fail('MARKING_STATE_CHANGED');
      const transition=await p.click(index,'mark');
      if(transition?.status)return transition;
      if(!transition)return fail('MARKING_TRANSITION_FAILED');
      expected[index]=target.color;
      const after=p.read();
      if(!after||after.some((value,i)=>value!==expected[i]))return {
        ...fail('MARKING_SET_MISMATCH group='+(target.group+1)+' segment='+(target.segment+1)+' observed='+JSON.stringify(after)),
        reason:'MARKING_SET_MISMATCH',group:target.group+1,segment:target.segment+1,observed:after};
    }
    return p.verify(a)?{status:'filled',detail:'SUCCESS: reset and exact QTI marking set verified.'}:
      fail('FINAL_MARKING_MISMATCH');
  });
  register('linkingLines',async(p,a)=>{
    let connected=0;
    for(let index=0;index<a.pairs.length;index++){
      if(!p.current())return {...fail('Screen changed during linking.'),connected};
      const endpoints=p.resolve(index);
      if(!endpoints)return {...fail('Link endpoint labels changed or controls are unavailable.'),connected};
      // The adapter connects directly; the application replaces old links.
      await p.connect(endpoints);connected++;await p.wait(120);
    }
    const verified=p.verify?await p.verify(a):false;
    return {status:verified?'filled':'uncertain',connected,detail:verified?'Link mapping verified.':
      'Connection gestures sent for all QTI pairs. Final pair identities are not observable; verify in Spark.'};
  });
  register('review',async p=>{
    const events=[];
    const sectionResults=[];
    const block=(reason,phase,index)=>{const failure=p.failure(reason,phase,index);return {...failure,
      ...(p.reconcile?{sectionResults:[...sectionResults,{index,status:'Failed',...failure.questionCounts}]}:{}),events};};
    p.phase?.('preflight');
    let result=await p.preflight();if(result)return {...result,events};events.push({phase:'preflight-all',groups:p.count});
    if(!p.reconcile){
      p.phase?.('reset');
      result=await p.reset();if(result)return {...result,events};events.push({phase:'reset-all'});
      p.phase?.('verify-empty');
      for(let index=0;index<p.count;index++){
        if((!p.inspectHidden&&!await p.activate(index))||!p.empty(index))return block('RESET_GROUP_UNVERIFIED','reset',index);
        events.push({phase:'reset-verified',group:index});
      }
      for(let index=0;index<p.count;index++)if(!p.empty(index))return block('RESET_BARRIER_FAILED','reset',index);
      events.push({phase:'reset-barrier',groups:p.count});
    }else events.push({phase:'state-read',groups:p.count});
    p.phase?.('solve');
    let globalRecoveries=0;const sectionRecoveries=new Set();
    for(let index=0;index<p.count;index++){
      if(!await p.activate(index))return block('REVIEW_NAVIGATION_FAILED','solve',index);
      if(index>0&&!p.verify(index-1))return block('GROUP_FINAL_MISMATCH','verify',index-1);
      events.push({phase:'solve-group',group:index});
      result=await p.solveGroup(index);
      if(result?.status==='recovery'){
        const scope=result.scope;
        if(!p.reconcile||!p.recover||!['section','all'].includes(scope)||
          (scope==='all'?globalRecoveries>=1:sectionRecoveries.has(index)))return block('RESET_RECOVERY_UNAVAILABLE','reset',index);
        if(scope==='all')globalRecoveries++;else sectionRecoveries.add(index);
        p.phase?.('reset');const recovery=await p.recover(scope,index);if(recovery)return {...recovery,recoveryRequestedBy:index,
          sectionResults:[...sectionResults,{index,status:'Failed',question:result.question}],events};
        const indices=scope==='all'?Array.from({length:p.count},(_,i)=>i):[index];
        if(indices.some(i=>!p.empty(i)))return block('RESET_RECOVERY_UNVERIFIED','reset',index);
        events.push({phase:'recovery-verified',scope,group:index});
        if(scope==='all'){
          sectionResults.length=0;p.phase?.('preflight');result=await p.preflight();if(result)return {...result,events};index=-1;
        }else index--;
        p.phase?.('solve');continue;
      }
      if(result)return {...result,...(p.reconcile?{sectionResults:[...sectionResults,{index,status:'Failed',...result.questionCounts}]}:{}),events};
      if(p.check&&!p.check(index))return block('ACTIVE_SCREEN_MISMATCH','solve',index);
      if(!p.verify(index))return block('GROUP_FINAL_MISMATCH','verify',index);
      const section=p.completed?.(index);if(section)sectionResults.push(section);
    }
    p.phase?.('verify-final');
    for(let index=0;index<p.count;index++){
      if((!p.inspectHidden&&!await p.activate(index))||(p.check&&!p.check(p.count-1))||!p.verify(index))return block('REVIEW_FINAL_MISMATCH','verify',index);
      events.push({phase:'final-verified',group:index});
    }
    for(let index=0;index<p.count;index++)if(!p.verify(index))return block('REVIEW_FINAL_MISMATCH','verify',index);
    return {status:'filled',detail:p.reconcile?'SUCCESS: all Review groups reconciled and verified.':'SUCCESS: all Review groups reset and verified, solved and verified.',
      groupsVerified:p.count,...(!p.reconcile?{resetVerified:p.count}:{sectionResults}),events};
  });
  register('order',async(p,a)=>root.SparkSequenceSolver.solve(p,a));
  register('textCorrection',async(p,a)=>root.SparkCorrectionSolver.solve(p,a));
  root.SparkSolvers=Object.freeze({solve,checkAndReconcile,kinds:()=>[...registry.keys()]});
  if(typeof module!=='undefined')module.exports=root.SparkSolvers;
})(globalThis);
