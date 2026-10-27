/* Read-only, isolated-world recorder. No page application state is accessed. */
(() => {
  'use strict';
  if (globalThis.SparkGenericInspector) return;
  const MAX_EVENTS=600, MAX_BYTES=300000, DURATION=180000, MAX_CONTROLS=100;
  const types=['click','dblclick','pointerdown','pointerup','change','input','focusin','focusout','dragstart','dragend','drop','submit'];
  const controls='input,textarea,select,button,[contenteditable="true"],[role="radio"],[role="checkbox"],[role="combobox"],[draggable="true"]';
  const instanceId=crypto.randomUUID(), ids=new WeakMap();
  let serial=0, active=false, startedAt=null, endedAt=null, context={}, events=[], bytes=0, dropped=0, timer, observer;
  let last='', lastAt=0, observedDocument=null, observerWasAttached=false;
  const roots=new Set(), previous=new WeakMap();
  const safeOrigin=()=>{try{return location.origin;}catch{return null;}};
  function adapter() {
    return 'generic';
  }
  function state(el) {
    const type=String(el.type||el.getAttribute?.('role')||el.tagName||'').slice(0,40).toLowerCase();
    const secret=/password|hidden|file/.test(type)||/cc-|password|one-time-code|email|tel|address|name|bday/.test(el.autocomplete||'')||
      /token|secret|credential|card.?number|cvc|cvv|password|payment/i.test((el.id||'')+' '+(el.name||''));
    if(secret)return {controlType:type,redacted:true};
    const result={controlType:type,disabled:!!el.disabled};
    if(['radio','checkbox'].includes(type)||['radio','checkbox'].includes(el.getAttribute?.('role')))
      result.checked=el.checked??(el.getAttribute('aria-checked')==='true');
    if(el.tagName==='SELECT'){
      const selected=[...el.options].map((o,i)=>o.selected?i:-1).filter(i=>i>=0);
      result.selectedIndexes=selected.slice(0,20);result.selectionClipped=selected.length>20;
    }
    if(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.isContentEditable)result.valueRedacted=true;
    return result;
  }
  function node(el) {
    if(!el||el.nodeType!==1)return null;
    if(!ids.has(el))ids.set(el,++serial);
    const out={nodeId:instanceId+':'+ids.get(el),tag:el.tagName.slice(0,30).toLowerCase(),role:el.getAttribute('role')?.slice(0,40)||null,...state(el)};
    const path=[];
    for(let cursor=el;cursor&&path.length<6;cursor=cursor.parentElement){
      const siblings=cursor.parentElement?[...cursor.parentElement.children].filter(n=>n.tagName===cursor.tagName):[cursor];
      path.unshift(cursor.tagName.slice(0,30).toLowerCase()+':nth-of-type('+(siblings.indexOf(cursor)+1)+')');
    }
    out.structuralPath=path.join(' > ');
    out.rootScope=el.getRootNode?.().host?'open-shadow':'document';
    return out;
  }
  function record(type,data={},final=false) {
    const entry={type,ms:Date.now()-startedAt,at:new Date().toISOString(),sessionId:context.sessionId||null,
      frameId:context.frameId??null,instanceId,evidence:'observed-dom; not answer correctness',...data};
    const size=new TextEncoder().encode(JSON.stringify(entry)).byteLength;
    if(events.length>=MAX_EVENTS-(final?0:1)||bytes+size>MAX_BYTES-(final?0:150000)){dropped++;return;}
    events.push(entry);bytes+=size;
  }
  function onEvent(e) {
    if(!active)return;
    const el=e.composedPath?.().find(n=>n?.nodeType===1)||e.target;
    if(!el||el.nodeType!==1)return;
    const after=state(el), before=previous.get(el)||null;
    const target=node(el), fingerprint=JSON.stringify([e.type,target]);
    if(fingerprint===last&&Date.now()-lastAt<40)return;
    last=fingerprint;lastAt=Date.now();previous.set(el,after);
    record(e.type,{target,before,after,transitionVerified:before!==null&&JSON.stringify(before)!==JSON.stringify(after)});
  }
  function attach(root) {
    if(roots.has(root)||roots.size>=32)return;
    roots.add(root);
    for(const type of types)root.addEventListener(type,onEvent,true);
    observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['checked','selected','disabled','aria-checked','aria-selected']});
    // Bounded discovery includes existing open shadow roots. Closed roots are inaccessible.
    for(const el of [...root.querySelectorAll('*')].slice(0,2500))if(el.shadowRoot)attach(el.shadowRoot);
    for(const el of [...root.querySelectorAll(controls)].slice(0,200))previous.set(el,state(el));
  }
  function capture() {
    const items=[];let total=0;
    for(const root of roots.size?roots:[document]){
      const found=[...root.querySelectorAll(controls)];total+=found.length;
      for(const el of found.slice(0,MAX_CONTROLS-items.length))items.push(node(el));
    }
    return {adapter:adapter(),captureKind:'structural-snapshot',exerciseSummary:null,url:safeOrigin(),controls:items,bounds:{maxControls:MAX_CONTROLS,total,controlsClipped:total>MAX_CONTROLS},
      summary:{interactionCount:document.querySelectorAll(controls).length,types:[adapter()],
        radioCount:document.querySelectorAll('input[type="radio"]').length,
        questionCount:null},
      privacy:'No literal text, input values, HTML, query strings or application JavaScript collected.'};
  }
  function stop() {
    if(!active)return {ok:true};
    const pending=observer?.takeRecords()||[];
    if(pending.length)record('dom-mutation',{count:pending.length,changes:pending.slice(0,12).map(m=>({kind:m.type,target:node(m.target)})),clipped:pending.length>12,source:'stop-drain'});
    record('final',{snapshot:capture()},true);active=false;endedAt=new Date().toISOString();
    clearTimeout(timer);observer?.disconnect();
    for(const root of roots)for(const type of types)root.removeEventListener(type,onEvent,true);
    roots.clear();return {ok:true};
  }
  function observation() {return {observerAttached:observerWasAttached,observerActive:active&&observedDocument===document.documentElement&&document.documentElement?.isConnected===true,
    closedShadowRoots:'inaccessible',shadowDiscoveryLimit:2500,shadowRootLimit:32,shadowCoverageLimited:roots.size>=32,truncationReasons:dropped?['event-or-byte-limit']:[],dropped,
    serializedBytesUpperBound:bytes,documentConnected:observedDocument===document.documentElement&&document.documentElement?.isConnected===true};}
  function start(message) {
    if(active)return {ok:true,alreadyActive:true};
    events=[];bytes=0;dropped=0;last='';observerWasAttached=false;context=message.context||{};startedAt=Date.now();endedAt=null;active=true;
    try {
      observer=new MutationObserver(mutations=>{
        if(!active)return;
        record('dom-mutation',{count:mutations.length,changes:mutations.slice(0,12).map(m=>({kind:m.type,target:node(m.target)})),clipped:mutations.length>12});
        for(const m of mutations.slice(0,60))for(const n of [...m.addedNodes].slice(0,20))if(n.nodeType===1){
          if(n.shadowRoot)attach(n.shadowRoot);
          for(const el of [...n.querySelectorAll('*')].slice(0,200))if(el.shadowRoot)attach(el.shadowRoot);
        }
      });
      observedDocument=document.documentElement;attach(document);observerWasAttached=true;record('initial',{snapshot:capture()});timer=setTimeout(stop,DURATION);
      return {ok:true,observation:observation()};
    } catch(error){stop();return {ok:false,error:'Generic observer attachment failed'};}
  }
  function install() {
    if(globalThis.__sparkInspectorListenerInstalled)return;
    globalThis.__sparkInspectorListenerInstalled=true;
    chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
      if(['SPARK_INSPECT_TRACE_STOP','SPARK_INSPECT_TRACE_CLEAR'].includes(message.type)&&
        message.expectedSessionId&&message.expectedSessionId!==context.sessionId){respond({ok:false,error:'Recording session ownership changed'});return;}
      switch(message.type){
        case 'SPARK_INSPECT_PROBE':respond({ok:true,result:{instanceId,adapter:adapter(),url:safeOrigin(),interactionCount:document.querySelectorAll(controls).length,interactionTypes:[adapter()],observation:observation()}});break;
        case 'SPARK_INSPECT_CAPTURE':respond({ok:true,result:capture()});break;
        case 'SPARK_INSPECT_TRACE_START':respond(start(message));break;
        case 'SPARK_INSPECT_TRACE_STOP':respond(stop());break;
        case 'SPARK_INSPECT_TRACE_GET':respond({ok:true,result:{instanceId,context,adapter:adapter(),active,startedAt:startedAt?new Date(startedAt).toISOString():null,endedAt,events:events.slice(),eventCount:events.length,truncated:dropped>0,observation:observation()}});break;
        case 'SPARK_INSPECT_TRACE_CLEAR':stop();events=[];bytes=0;respond({ok:true});break;
      }
    });
    addEventListener('pagehide',stop,{once:true});
  }
  globalThis.SparkGenericInspector={install};
})();
