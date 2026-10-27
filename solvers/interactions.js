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
  register('order',async(p,a)=>root.SparkSequenceSolver.solve(p,a));
  register('textCorrection',async(p,a)=>root.SparkCorrectionSolver.solve(p,a));
  root.SparkSolvers=Object.freeze({solve,kinds:()=>[...registry.keys()]});
  if(typeof module!=='undefined')module.exports=root.SparkSolvers;
})(globalThis);
