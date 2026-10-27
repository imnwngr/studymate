(function(root){
  'use strict';
  if(root.SparkGenericAdapter)return;
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const norm=value=>clean(value).normalize('NFKC').toLowerCase();
  const visible=node=>node.isConnected&&!node.closest('[hidden],[inert]')&&
    getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden'&&node.getClientRects().length>0;
  const enabled=node=>visible(node)&&!node.disabled&&!node.readOnly&&!node.closest('fieldset[disabled]')&&node.getAttribute('aria-disabled')!=='true';
  const identity=controls=>JSON.stringify(controls.map(node=>({tag:node.tagName,type:node.type,name:node.name,
    choiceId:node.getAttribute('data-choice-id'),choice:node.matches('input[type="radio"],input[type="checkbox"]')?node.value:null,
    options:node.matches('select')?[...node.options].map(o=>[o.value,clean(o.textContent)]):null})));
  function create({document}){
    let questions=[],refs=new Map(),trusted=new Map();
    function scan(){
      refs=new Map();trusted=new Map();questions=[];
      const scopes=[...document.querySelectorAll('[data-response-identifier],fieldset')]
        .filter(node=>visible(node)&&!node.parentElement?.closest('[data-response-identifier],fieldset'));
      if(scopes.length>100)return {title:document.title,questions:[],reason:'tooManyExerciseGroups'};
      for(const scope of scopes){
        const controls=[...scope.querySelectorAll('input:not([type]),input[type="text"],textarea,select,input[type="radio"],input[type="checkbox"]')].filter(visible);
        if(!controls.length)continue;
        const responseId=scope.getAttribute('data-response-identifier')||'';
        const id='q'+(questions.length+1),single=controls.length===1;
        let kind='manual',node=controls[0],choiceIds=[],options=[];
        if(single&&node.matches('select')){
          kind='dropdown';options=[...node.options].map(o=>clean(o.textContent)).filter(Boolean);
        }else if(single&&node.matches('textarea,input:not([type]),input[type="text"]'))kind='text';
        else if(controls.every(c=>c.matches('input[type="radio"]'))&&new Set(controls.map(c=>c.name)).size===1&&controls[0].name)kind='choice';
        else if(controls.every(c=>c.matches('input[type="checkbox"]')))kind='multi';
        if(['choice','multi'].includes(kind)){
          choiceIds=controls.map(c=>c.getAttribute('data-choice-id')||c.value);
          options=controls.map(c=>clean([...c.labels||[]].map(l=>l.textContent).join(' ')));
          if(choiceIds.some(x=>!x||x==='on')||new Set(choiceIds).size!==choiceIds.length||options.some(x=>!x))kind='manual';
        }
        if(kind==='choice'&&[...document.querySelectorAll('input[type="radio"]')]
          .some(c=>c.name===node.name&&c.form===node.form&&!controls.includes(c)))kind='manual';
        const context=clean(scope.querySelector('legend,[data-question]')?.textContent||scope.getAttribute('aria-label')||'').slice(0,1200);
        const question={id,kind,responseId,context,localContext:context,options,choiceIds,
          choiceLabelsVerified:options.length>0,rubric:'',wordBank:'',position:questions.length+1,
          applyable:kind!=='manual'&&!!responseId&&controls.every(enabled),
          diagnostic:!responseId?'Explicit response identity missing.':kind==='manual'?'Interaction semantics unsupported.':null};
        questions.push(question);refs.set(id,{scope,node,controls,kind,responseId,question,identity:identity(controls)});
      }
      const ids=questions.map(q=>q.responseId).filter(Boolean);
      if(new Set(ids).size!==ids.length)for(const q of questions)q.applyable=false;
      return {title:clean(document.title),questions,hasExercise:questions.length>0,
        screenIndex:0,screenCount:null,frameUrl:location.origin+location.pathname,
        reason:questions.length?'discovered':'noRecognizedExercises'};
    }
    function current(ref){
      if(!ref.scope.isConnected||!ref.controls.every(enabled)||identity(ref.controls)!==ref.identity||
        ref.controls.some(c=>c.form&&c.form!==ref.controls[0].form))return false;
      const controls=[...ref.scope.querySelectorAll('input:not([type]),input[type="text"],textarea,select,input[type="radio"],input[type="checkbox"]')].filter(visible);
      if(controls.length!==ref.controls.length||controls.some((node,i)=>node!==ref.controls[i]))return false;
      if(ref.kind==='choice'&&[...document.querySelectorAll('input[type="radio"]')]
        .some(c=>c.name===ref.node.name&&c.form===ref.node.form&&!ref.controls.includes(c)))return false;
      const ids=[...document.querySelectorAll('[data-response-identifier]')].filter(s=>s.getAttribute('data-response-identifier')===ref.responseId);
      return ids.length===1&&ids[0]===ref.scope&&ref.controls.every(c=>ref.scope.contains(c));
    }
    function readQTI(ids){
      trusted=new Map();
      if(!Array.isArray(ids)||ids.length!==questions.length||questions.some((q,i)=>q.id!==ids[i]))return {answers:[],reason:'staleScan'};
      const source=root.SparkEmbeddedQTI.read(document,new DOMParser());
      if(source.assessments.length!==1)return {answers:[],reason:source.assessments.length?'ambiguousAnswerSource':source.reason};
      const xml=source.assessments[0];
      const interactions=[...xml.getElementsByTagName('*')].filter(n=>['textEntryInteraction','extendedTextInteraction','inlineChoiceInteraction','choiceInteraction'].includes(n.localName));
      if(interactions.length!==questions.length)return {answers:[],reason:'interactionCountMismatch'};
      const ordered=interactions.map(n=>questions.filter(q=>q.applyable&&q.responseId===n.getAttribute('responseIdentifier')));
      if(ordered.some(matches=>matches.length!==1)||new Set(ordered.map(x=>x[0].id)).size!==questions.length)
        return {answers:[],reason:'responseIdentityMismatch'};
      const result=root.SparkQTI.mapAssessment(xml,ordered.map(x=>x[0]));
      for(const answer of result.answers||[])trusted.set(answer.id,answer);
      return {...result,format:'QTI',answerSource:'embedded-qti'};
    }
    function port(ref){
      const {node,controls}=ref;
      const guard=()=>{if(!current(ref))throw Error('EXERCISE_CHANGED_OR_NOT_ACTIONABLE');};
      if(ref.kind==='text')return {
        write:value=>{guard();node.focus();const proto=node.matches('textarea')?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto,'value').set.call(node,value);
          node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));node.dispatchEvent(new Event('change',{bubbles:true}));node.blur();},
        matches:value=>current(ref)&&node.value===value
      };
      if(ref.kind==='dropdown')return {
        hasOption:value=>[...node.options].filter(o=>!o.disabled&&norm(o.textContent)===norm(value)).length===1,
        select:async value=>{guard();const option=[...node.options].find(o=>norm(o.textContent)===norm(value));
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(node,option.value);
          node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));},
        matches:value=>current(ref)&&norm(node.selectedOptions[0]?.textContent)===norm(value)
      };
      return {ids:ref.question.choiceIds,single:ref.kind==='choice',
        checked:id=>current(ref)&&controls[ref.question.choiceIds.indexOf(id)]?.checked===true,
        activate:async id=>{guard();controls[ref.question.choiceIds.indexOf(id)].click();await new Promise(r=>setTimeout(r,30));}};
    }
    async function apply(answers){
      const results=[];
      for(const answer of answers){
        const ref=refs.get(answer.id),key=trusted.get(answer.id);
        if(!ref||!ref.question.applyable||!key||key.answer!==answer.answer||
          JSON.stringify(key.selectedIds||[])!==JSON.stringify(answer.selectedIds||[])){
          results.push({id:answer.id,status:'skipped',detail:'GENERIC_MAPPING_UNVERIFIED'});continue;
        }
        try{
          const result=await root.SparkSolvers.solve(ref.kind,port(ref),answer);
          await new Promise(r=>setTimeout(r,100));
          const p=port(ref),verified=['choice','multi'].includes(ref.kind)?
            ref.question.choiceIds.every(id=>p.checked(id)===(answer.selectedIds||[]).includes(id)):await p.matches(answer.answer);
          results.push({id:answer.id,...result,...(!verified?{status:'uncertain',detail:'PLACEMENT_NOT_RETAINED'}:{})});
        }catch(error){results.push({id:answer.id,status:'uncertain',detail:String(error.message).slice(0,160)});}
      }
      return results;
    }
    return {capabilities:['native-text','native-select','native-radio','native-checkbox','embedded-qti'],
      async dispatch(message){
        switch(message.type){
          case 'SPARK_SCAN':return {ok:true,result:scan()};
          case 'SPARK_QTI':return {ok:true,result:readQTI(message.ids)};
          case 'SPARK_APPLY':return {ok:true,result:await apply(message.answers||[])};
          case 'SPARK_COPY_PROMPT':return {ok:true,result:{text:questions.map(q=>q.context+'\n'+q.options.join('\n')).join('\n\n')}};
          case 'SPARK_SUBMIT_NEXT':return {ok:true,result:{submitted:false,reason:'genericSubmitUnsupported'}};
          case 'SPARK_FORWARD_SCREEN':return {ok:true,result:{advanced:false,reason:'genericNavigationUnsupported'}};
          default:return {ok:false,error:'MESSAGE_UNSUPPORTED'};
        }
      }};
  }
  const adapter={id:'generic',answerSource:'embedded-qti',detect:()=>true,create};
  root.SparkGenericAdapter=adapter;root.SparkCore.register(adapter);
})(globalThis);
