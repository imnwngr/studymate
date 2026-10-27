(function(root){
  'use strict';
  if(root.SparkCore)return;
  const adapters=new Map();
  function register(adapter){adapters.set(adapter.id,adapter);}
  function select(context){
    const registered=root.SparkSites.frameSite(context.url);
    const dedicated=registered&&adapters.get(registered.adapterId);
    if(dedicated?.detect(context))return {site:registered,adapter:dedicated};
    // A compatible embedded player can be used without registering its host.
    for(const adapter of adapters.values()){
      if(adapter.id!=='generic'&&adapter.detect(context))return {site:root.SparkSites.recognize(context.url),adapter};
    }
    return {site:root.SparkSites.recognize(context.url),adapter:adapters.get('generic')};
  }
  function create(context){
    let selected,session,diagnostics=null,applying=false;
    const choose=()=>{
      const next=select(context);
      if(!session||selected.adapter!==next.adapter){selected=next;session=next.adapter.create(context);}
      return session;
    };
    return {
      async dispatch(message){
        if(message.type==='SPARK_PING')return {ok:true,ready:true,architecture:'multisite-v1'};
        if(message.type==='SPARK_DIAGNOSTICS')return {ok:true,result:session?.execution?{...diagnostics,execution:session.execution()}:diagnostics};
        if(applying)return message.type==='SPARK_APPLY'?
          {ok:true,result:(message.answers||[]).map(a=>({id:a.id,status:'uncertain',detail:'SOLVE_ALREADY_RUNNING'}))}:
          {ok:false,reason:'solveRunning',error:'Solve is still applying this interaction.'};
        const active=message.type==='SPARK_SCAN'?choose():(session||choose());
        let response;
        if(message.type==='SPARK_APPLY')applying=true;
        try{response=await active.dispatch(message);}finally{applying=false;}
        if(response?.ok&&message.type==='SPARK_SCAN'){
          const result=response.result;
          result.architecture={version:1,registered:!!selected.site,siteId:selected.site?.id||null,
            adapterId:selected.adapter.id,answerSource:selected.adapter.answerSource,
            capabilities:active.capabilities||[],solvers:result.questions.map(q=>({id:q.id,kind:q.kind,
              solver:root.SparkSolvers.kinds().includes(q.kind)?q.kind:null,applyable:q.applyable===true}))};
          diagnostics={...result.architecture,stage:'scan',verification:'not-applied',failureReason:null};
        }
        if(diagnostics&&message.type==='SPARK_QTI')diagnostics={...diagnostics,stage:'answer-source',
          answerSource:response?.result?.answers?.length?selected.adapter.answerSource:null,
          failureReason:response?.result?.reason==='complete'?null:response?.result?.reason||response?.error||null};
        if(diagnostics&&message.type==='SPARK_APPLY'){
          const results=Array.isArray(response?.result)?response.result:[];
          diagnostics={...diagnostics,stage:'apply',verification:results.length&&results.every(r=>r.status==='filled')?'verified':'unverified',
            results:results.slice(0,60).map(r=>({id:r.id,status:r.status})),failureReason:response?.error||
              results.filter(r=>r.status!=='filled').map(r=>String(r.detail||r.status).split(':')[0].slice(0,100)).slice(0,8)};
        }
        return response;
      }
    };
  }
  root.SparkCore=Object.freeze({register,select,create});
})(globalThis);
