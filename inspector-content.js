/* studymate Inspector: opt-in, read-only captures and universal exercise interaction trace. */
(() => {
  'use strict';
  const nglFrame=/^(?:learn\.eltngl\.com|(?:[^.]+\.)*avallain\.net)$/.test(location.hostname||'') ||
    !!document.querySelector('.om-text-gap, .ic-text-correction');
  if (!nglFrame && globalThis.SparkGenericInspector) {globalThis.SparkGenericInspector.install();return;}
  if (globalThis.__sparkInspectorListenerInstalled) return;
  globalThis.__sparkInspectorListenerInstalled = true;

  const instanceId = String(Date.now()) + ':' + Math.random().toString(36).slice(2);
  const clean = (value, max = 260) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const attr = (el, name) => el?.getAttribute?.(name) ?? null;
  const safeUrl = () => { try { return location.origin + location.pathname; } catch { return null; } };
  const classes = el => typeof el?.className === 'string' ? el.className : '';
  const sensitive = el => ['password', 'hidden', 'file'].includes(String(el?.type || '').toLowerCase()) ||
    !!el?.matches?.('input,textarea,[contenteditable="true"]');
  function safeText(el,max=260){
    if(sensitive(el)||el?.closest?.('textarea,[contenteditable="true"]'))return null;
    if(el?.cloneNode&&el.querySelector?.('input,textarea,[contenteditable="true"]')){
      const copy=el.cloneNode(true);
      copy.querySelectorAll('input,textarea,[contenteditable="true"]').forEach(node=>node.remove());
      return clean(copy.textContent,max);
    }
    return clean(el?.textContent,max);
  }
  const describe = el => ({
    tag: el.tagName.toLowerCase(), id: clean(el.id, 120) || null,
    classes: clean(classes(el), 230), text: safeText(el),
    name: attr(el, 'name'), type: attr(el, 'type'), role: attr(el, 'role'),
    modelId: attr(el, 'data-model-id'), dataEvent: attr(el, 'data-event'),
    checked: 'checked' in el ? !!el.checked : null,
    selected: 'selected' in el ? !!el.selected : null,
    disabled: 'disabled' in el ? !!el.disabled : null,
    value: ('value' in el && !sensitive(el)) ? clean(el.value, 140) : null,
    // Avoid credentials and URL-bearing markup. Captures may still include exercise text.
    html: null
  });
  const selectors = ['.interaction', '[class*="interaction"]', '.os-sequence', '.os-match', '.os-choice', '.os-gap', '.os-text', '.is-dropdown', '.ic-text-correction', '[class*="is-"]', '[class*="ic-"]', '[class*="os-"]', '[role="listbox"]', '[role="option"]', '[role="combobox"]', 'audio', 'input', 'textarea', 'select', '[contenteditable="true"]', '[role="radio"]', '[role="checkbox"]', '[draggable="true"]'];

  const limits={roots:8,nodes:60,children:6};
  const nodeIds=new WeakMap(); let serial=0,actionSerial=0,pendingAction=null;
  const pendingTimers=new Set();
  function locator(el,compact=false) {
    if(!el || el.nodeType!==1) return null;
    if(!nodeIds.has(el)) nodeIds.set(el,++serial);
    if(compact)return {nodeId:instanceId+':node-'+nodeIds.get(el)};
    const parts=[];let cursor=el;
    for(let depth=0;cursor&&depth<16;depth++,cursor=cursor.parentElement) {
      const peers=cursor.parentElement?[...cursor.parentElement.children].filter(n=>n.tagName===cursor.tagName):[cursor];
      parts.unshift(cursor.tagName.toLowerCase()+':nth-of-type('+(peers.indexOf(cursor)+1)+')');
      if(cursor===document.documentElement)break;
    }
    const selector=parts.join(' > ');let unique=false;
    try{unique=document.querySelectorAll(selector).length===1&&document.querySelector(selector)===el;}catch{}
    return {nodeId:instanceId+':node-'+nodeIds.get(el),selector,unique,scope:'frame document; recapture after rerender'};
  }

  function interactionRoot(node) {
    const el=node?.nodeType===3?node.parentElement:node;
    return el?.closest?.('.om-text-gap') || el?.closest?.('.interaction') || null;
  }
  function interactionRoots() {
    const roots=[...document.querySelectorAll('.interaction, .om-text-gap')];
    return roots.filter(root=>!roots.some(other=>other!==root && classes(other).split(' ').includes('om-text-gap') && root.contains?.(other)));
  }
  function attribution(node) {
    const el=node?.nodeType===3?node.parentElement:node,root=interactionRoot(el);
    if(!root)return {draggableModelId:attr(el?.closest?.('.om-text-gap__draggable'),'data-model-id'),root:null,role:'unscoped'};
    const source=el.closest?.('.om-text-gap__pool-item'),destination=el.closest?.('.om-text-gap__target-item');
    const handle=el.closest?.('.om-text-gap__draggable, .om-text-gap__draggable-handle, .om-text-gap__droppable');
    return {draggableModelId:attr(el?.closest?.('.om-text-gap__draggable'),'data-model-id'),root:locator(root,true),role:source?'source':destination?'destination':el.closest?.('.pool, .wordpool')?'pool-background':'interaction-background',source:source?locator(source,true):null,destination:destination?locator(destination,true):null,sourceModelId:attr(source,'data-model-id'),destinationModelId:attr(destination,'data-model-id'),handle:handle?locator(handle,true):null};
  }
  function compactNode(node) {
    return {id:node.id,modelId:node.modelId,locator:{nodeId:node.locator?.nodeId},classes:node.classes,text:node.text,label:node.label,connected:node.connected,visible:node.visible,disabled:node.disabled,selected:node.selected,occupancy:node.occupancy};
  }

  function deepNode(el,children=false,compact=false) {
    if(!el || el.nodeType!==1)return {nodeType:el?.nodeType??null};
    const attributes={};
    for(const name of ['id','class','role','data-model-id','data-id','data-identifier','data-response-identifier','data-interactive-id','identifier','responseidentifier','aria-disabled','aria-selected','aria-checked','aria-label','draggable','tabindex','disabled']) {
      const value=attr(el,name);if(value!==null)attributes[name]=clean(value,220);
    }
    const text=safeText(el,160),disabled=!!el.disabled||attr(el,'aria-disabled')==='true';
    const occupants=[...el.querySelectorAll('.om-text-gap__draggable, [draggable="true"], [data-model-id]')].slice(0,limits.children);
    const liveWords=occupants.filter(n=>classes(n).split(' ').includes('om-text-gap__draggable') && !n.closest?.('.width-measure'));
    const result={label:liveWords.map(n=>clean(n.textContent,160)).join(' ')||null,locator:locator(el,compact),tag:el.tagName.toLowerCase(),id:clean(el.id,120)||null,modelId:attr(el,'data-model-id'),classes:clean(classes(el),230),text,attributes,
      connected:el.isConnected,visible:isVisible(el),disabled,enabled:!disabled,
      selected:/(?:^|[ _-])(selected|active)(?:$|[ _-])/.test(classes(el))||attr(el,'aria-selected')==='true'||[...el.querySelectorAll('.om-text-gap__draggable, .om-text-gap__draggable-handle')].slice(0,60).some(n=>/(?:^|[ _-])(selected|active)(?:$|[ _-])/.test(classes(n))||attr(n,'aria-selected')==='true'),
      occupancy:{hasText:!!text,childCount:el.children.length,occupantIds:liveWords.map(n=>attr(n,'data-model-id')||clean(n.id,120)||locator(n,true).nodeId),draggableCount:liveWords.length,hasDragClass:/(?:^| )has_drag(?:$| )/.test(classes(el)),emptyClass:/(?:^|[ _-])empty(?:$|[ _-])/.test(classes(el)),filledClass:/(?:^|[ _-])(filled|occupied)(?:$|[ _-])/.test(classes(el))}};
    if(children&&!compact)result.children=[...el.children].slice(0,limits.children).map(n=>deepNode(n));return result;
  }
  function frameEvidence() {
    const ancestry=[];let win=window,complete=true;
    for(let depth=0;depth<16;depth++) {
      try{ancestry.push({url:win.location.origin+win.location.pathname,title:clean(win.document.title,180),iframe:win.frameElement?{tag:'iframe',id:clean(win.frameElement.id,120),classes:clean(classes(win.frameElement),160)}:null});
        if(win===win.parent)break;win=win.parent;if(depth===15)complete=false;
      }catch{complete=false;ancestry.push({inaccessible:true});break;}
    }
    return {instanceId,ancestry,complete};
  }
  function occupancyNode(el){
    const node=deepNode(el,false,true);
    return {id:node.id,modelId:node.modelId,locator:node.locator,text:node.label||node.text||'',
      connected:node.connected,visible:node.visible,disabled:node.disabled,selected:node.selected,
      occupancy:{occupantIds:node.occupancy.occupantIds,draggableCount:node.occupancy.draggableCount,hasDragClass:node.occupancy.hasDragClass}};
  }
  function deepState(onlyRoot=null,compact=false) {
    if(compact)return (onlyRoot?[onlyRoot]:interactionRoots()).slice(0,limits.roots).map(root=>({
      root:{id:root.id||null,locator:locator(root,true)},
      identity:{title:clean(document.title,180),interactiveId:safeUrl()?.match(/\/(?:interactives|cdn_proxy)\/([^/]+)/)?.[1]||null},
      sources:[...root.querySelectorAll('.om-text-gap__pool-item')].slice(0,limits.nodes).map(occupancyNode),
      destinations:[...root.querySelectorAll('.om-text-gap__target-item')].slice(0,limits.nodes).map(occupancyNode),
      bounds:{sourceTotal:root.querySelectorAll('.om-text-gap__pool-item').length,destinationTotal:root.querySelectorAll('.om-text-gap__target-item').length}
    }));
    const state=(onlyRoot?[onlyRoot]:interactionRoots()).slice(0,limits.roots).map(root=>({
      root:deepNode(root,false,compact),identity:{title:clean(document.querySelector('[data-exercise-title], .exercise-title')?.textContent||document.title,180),titleSource:document.querySelector('[data-exercise-title], .exercise-title')?'exercise heading':'exercise frame title',interactiveId:attr(root,'data-interactive-id')||safeUrl()?.match(/\/(?:interactives|cdn_proxy)\/([^/]+)/)?.[1]||null},
      sources:[...root.querySelectorAll('.om-text-gap__pool-item')].slice(0,limits.nodes).map(n=>deepNode(n,!compact,compact)),
      destinations:[...root.querySelectorAll('.om-text-gap__target-item')].slice(0,limits.nodes).map(n=>deepNode(n,!compact,compact)),
      handles:[...root.querySelectorAll('[draggable="true"], button, [role="button"], .om-text-gap__draggable, .om-text-gap__droppable')].slice(0,limits.nodes).map(n=>deepNode(n,false,compact)),
      feedback:[...root.querySelectorAll('[role="alert"], [aria-live], .feedback, .validation')].slice(0,8).map(n=>deepNode(n,false,compact)),
      bounds:{...limits,sourceTotal:root.querySelectorAll('.om-text-gap__pool-item').length,destinationTotal:root.querySelectorAll('.om-text-gap__target-item').length}
    }));
    return compact?state.map(w=>({...w,root:compactNode(w.root),sources:w.sources.map(compactNode),destinations:w.destinations.map(compactNode),handles:w.handles.map(compactNode),feedback:w.feedback.map(compactNode)})):state;
  }
  function declarations() {
    const result=[];
    for(const script of [...document.querySelectorAll('script[type*="xml"], script[type*="qti"]')].slice(0,8)) {
      if((script.textContent||'').length>100000)continue;
      try{const xml=new DOMParser().parseFromString(script.textContent,'application/xml');if(xml.querySelector('parsererror'))continue;
        for(const declaration of [...xml.getElementsByTagNameNS('*','responseDeclaration')].slice(0,60)) {
          const correct=[...declaration.getElementsByTagNameNS('*','correctResponse')][0];if(!correct)continue;
          result.push({responseId:clean(declaration.getAttribute('identifier'),150),correctValues:[...correct.getElementsByTagNameNS('*','value')].slice(0,60).map(v=>clean(v.textContent,180)),evidenceKind:'inline-responseDeclaration',scriptLocator:locator(script)});
        }
      }catch{}
    }return result;
  }
  function settleAction(action,delay) {
    if(pendingTimers.size>=64){markTruncated('pending-timer-limit');return;}
    const timer=setTimeout(()=>{pendingTimers.delete(timer);if(!trace.active||trace.truncated)return;
      const afterState=deepState(action.root.isConnected?action.root:null,true),fingerprint=JSON.stringify(afterState);
      if(action.lastAfter===fingerprint)record('action-sample',{actionId:action.id,delay,unchanged:true,afterStateRef:action.lastAfterRef,rootConnected:action.root.isConnected,targetConnected:action.target.isConnected});
      else {
        const index=trace.records.length;
        record('action-after',{actionId:action.id,delay,rootConnected:action.root.isConnected,targetConnected:action.target.isConnected,afterState});
        if(trace.records.length>index){action.lastAfter=fingerprint;action.lastAfterRef=index;}
      }
    },delay);pendingTimers.add(timer);
  }

  function capture() {
    const counts = Object.fromEntries(selectors.map(selector => [selector, document.querySelectorAll(selector).length]));
    const interactions = [...document.querySelectorAll('.interaction')].slice(0, 45).map((el, index) => ({
      index, ...describe(el),
      children: [...el.querySelectorAll('input, textarea, select, button, [role="radio"], [role="checkbox"], [data-model-id], [draggable="true"], .om-text-gap__pool-item, .om-text-gap__draggable, .om-text-gap__target-item, .om-text-gap__droppable, .os-sequence-element')]
        .slice(0, 90).map(describe)
    }));
    // Dedicated pool/target snapshots retain nodes without data-model-id. These
    // are visual observations, not published QTI responseIdentifier mappings.
    const wordPools = [...document.querySelectorAll('.interaction.om-text-gap')].slice(0, 8).map((root, index) => ({
      index,
      pool: [...root.querySelectorAll('.om-text-gap__pool-item')].slice(0, 80).map(describe),
      gaps: [...root.querySelectorAll('.om-text-gap__target-item')].slice(0, 80).map(describe)
    }));
    const controls = []; // Unrelated page controls are outside diagnostic scope.
    const qtiNodes = [...document.querySelectorAll('script[src*="data.js"], script[type*="xml"], script[type*="qti"]')]
      .slice(0, 20).map(el => ({type: attr(el, 'type'), srcPath: (() => {try {const u = new URL(el.src); return u.origin+u.pathname;} catch {return null;}})(), text: null}));
    return {
      deepSchema:1,frame:frameEvidence(),deepInteractions:deepState(),responseDeclarations:declarations(),
      title: clean(document.title), url: safeUrl(), counts, interactions, controls, qtiNodes, wordPools,
      summary: {
        types: [...new Set(interactions.map(item => item.classes.split(' ').find(token => /^(is-|ic-|os-|pp-)/.test(token))).filter(Boolean))],
        interactionCount: counts['.interaction'],
        visibleInputTypes: [...new Set([...document.querySelectorAll('.interaction input')].map(input => input.type || 'text'))].slice(0,12)
      }
    };
  }

  const MAX_EVENTS = 360;
  const MAX_BYTES = 650000;
  const TRACE_MS = 180000;
  const watchEvents = ['touchstart', 'touchend', 'touchcancel', 'pointerdown', 'pointerup', 'click', 'dblclick', 'focusin', 'focusout', 'beforeinput', 'input', 'change', 'keydown', 'keyup', 'submit', 'dragstart', 'dragend', 'drop', 'mousedown', 'mouseup', 'mousemove', 'play', 'pause', 'ended'];
  const trace = {active: false, records: [], byteCount: 0, truncated: false, startedAt: null, endedAt: null, armedUntil: 0, lastMutation: 0, lastState: '', lastMouseMove: 0, observer: null, timer: null};

  const relevantEditor = el => {
    if(el?.nodeType===3)el=el.parentElement;
    if (!el || el.nodeType !== 1) return false;
    try {
      if (interactionRoot(el)) return true;
      return !!el.closest('[class*="icTextCorrection"], [class*="ki24"], [role="dialog"], [role="listbox"], [role="option"], [role="menu"], [role="menuitem"], .ui-dialog, .popover, .popper, .popup, .tooltip, [class*="replacement"], [class*="correction-menu"]');
    } catch {return false;}
  };
  const shortNode = el => {
    if (!el || el.nodeType !== 1) return {nodeType: el?.nodeType ?? null, text: sensitive(el?.parentElement)?null:clean(el?.textContent, 100)};
    return {
      tag: el.tagName.toLowerCase(), id: clean(el.id, 90) || null,
      classes: clean(classes(el), 160), role: attr(el, 'role'), modelId: attr(el, 'data-model-id'),
      text: safeText(el,130),
      value: 'value' in el && !sensitive(el) ? clean(el.value, 140) : null,
      type: attr(el, 'type'), ariaExpanded: attr(el, 'aria-expanded'), ariaSelected: attr(el, 'aria-selected')
    };
  };
  const isVisible = el => {
    try {return !!(el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';}
    catch {return false;}
  };
  const editorSelector = [
    'input:not([type="password"]):not([type="hidden"]):not([type="file"])', 'textarea',
    'select', '[contenteditable="true"]', '[role="dialog"]', '[role="listbox"]',
    '[role="option"]', '[class*="icTextCorrection"]', '[class*="ki24_"]',
    '[class*="ki24-"]', '.ui-dialog', '.popover', '.popper', '.popup', '.tooltip',
    '[class*="replacement"]', '[class*="correction-menu"]', '[role="menu"]', '[role="menuitem"]'
  ].join(', ');
  function correctionState() {
    const widgets = [...document.querySelectorAll('.ic-text-correction')].slice(0, 6).map((root, index) => ({
      index, classes: clean(classes(root), 160),
      tokens: [...root.querySelectorAll('span.input-text')].slice(0, 90).map((el, i) => ({
        i, modelId: attr(el, 'data-model-id'), text: clean(el.textContent, 90), classes: clean(classes(el), 140)
      }))
    }));
    const editorNodes = [...document.querySelectorAll(editorSelector)]
      .filter(el => isVisible(el) && (relevantEditor(el) ||
        (Date.now() < trace.armedUntil && ( /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
          !!el.closest?.('.popover, .popper, .popup, [role="menu"], [role="menuitem"], [class*="replacement"]') ))))
      .slice(0, 28).map(shortNode);
    return {widgets, editorNodes};
  }
  // Record a small, typed view of all exercise formats. The full 51+ token
  // correction snapshot is kept only for initial/final events; otherwise a
  // normal typing sequence would exhaust the trace byte/event budget.
  function compactState() {
    const widgets = [...document.querySelectorAll('.interaction')].slice(0, 9).map((root,index) => {
      const candidates = [...root.querySelectorAll(
        'input:not([type="password"]):not([type="hidden"]):not([type="file"]), textarea, select, [contenteditable="true"], [role="radio"], [role="checkbox"], [role="option"], [role="combobox"], [aria-checked], [aria-selected], .editing, .modified, [class*="selected"], [class*="active"]')];
      const interesting = candidates.filter(el => !el.closest('.tc_popup') &&
        (isVisible(el) || el.matches('.editing,.modified,[aria-checked],[aria-selected]'))).slice(0, 24);
      return {index, classes:clean(classes(root),160), text:safeText(root,180),
        controls:interesting.map(shortNode)};
    });
    const activeEditor = [...document.querySelectorAll(editorSelector)]
      .filter(el => isVisible(el) && (relevantEditor(el) ||
        (Date.now() < trace.armedUntil && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)))).slice(0, 12).map(shortNode);
    const corrections = [...document.querySelectorAll('.ic-text-correction .modified, .ic-text-correction .editing')]
      .slice(0, 18).map(shortNode);
    return {widgets,activeEditor,corrections,deepInteractions:deepState(null,true)};
  }
  function fullState() {
    const state=compactState();
    state.deepInteractions=deepState();
    if (document.querySelector('.ic-text-correction')) state.correctionDetail=correctionState();
    return state;
  }

  function markTruncated(reason) {
    trace.truncated=true;
    if(!trace.observation.truncationReasons.includes(reason))trace.observation.truncationReasons.push(reason);
    trace.observation.firstDroppedMs ??= Date.now()-trace.startedAt;
  }
  function record(type, data = {}, withState = false) {
    if (!trace.active || (type !== 'final' && trace.records.length >= MAX_EVENTS - 1) || trace.byteCount > MAX_BYTES) {
      if (trace.active) markTruncated('event-limit');
      return;
    }
    const entry = {ms: Date.now() - trace.startedAt,at:new Date().toISOString(),instanceId,sessionId:trace.context?.sessionId||null,frameId:trace.context?.frameId??null,actionId:pendingAction?.id||null,type,...data};
    if (withState) {
      const state = type === 'initial' || type === 'final' ? fullState() : compactState();
      const fingerprint = JSON.stringify(state);
      // Keep changed snapshots plus the first sample, but avoid repeated huge states.
      if (trace.lastState !== fingerprint || type === 'initial' || type === 'final') {
        entry.state = state;
        trace.lastState = fingerprint;
      }
    }
    const bytes = JSON.stringify(entry).length;
    if (trace.byteCount + bytes > (type === 'final' ? MAX_BYTES : MAX_BYTES - 100000)) {markTruncated(type==='final'?'final-state-budget':'snapshot-budget');return;}
    trace.records.push(entry);
    trace.byteCount += bytes;
  }
  function onEvent(event) {
    if (!trace.active || trace.truncated) return;
    if (event.type === 'mousemove') {
      const now = Date.now();
      if (now - trace.lastMouseMove < 180) return;
      trace.lastMouseMove = now;
    }
    trace.observation.eventCallbacks++;
    const el = event.target?.nodeType===3?event.target.parentElement:event.target;
    const inside = relevantEditor(el);
    const editorInput = Date.now() < trace.armedUntil &&
      el?.nodeType === 1 && ( /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) || !!el.closest?.('[role="option"], [role="listbox"], [role="menuitem"], .popover, .popper, .popup, .tooltip, .ui-dialog, [class*="replacement"]') );
    if (!inside && !editorInput) return;
    if (inside) trace.armedUntil = Date.now() + 20000;
    const root=interactionRoot(el),attributionData=attribution(el);
    if(root && ['pointerdown','mousedown','click','dblclick','keydown','drop','input','change'].includes(event.type)) {
      const reuse=pendingAction && pendingAction.target===el && Date.now()-pendingAction.startedAt<600 && !pendingAction.sawClick && ['mousedown','click'].includes(event.type);
      if(!reuse) {
        pendingAction={id:instanceId+':action-'+(++actionSerial),root,target:el,startedAt:Date.now(),sawClick:false};
        record('action-before',{actionId:pendingAction.id,trigger:event.type,target:compactNode(deepNode(el,false,true)),interactionRoot:compactNode(deepNode(root,false,true)),attribution:attributionData,beforeState:deepState(root,true),stateEncoding:'occupancy-v1'});
        for(const delay of [0,180,750,1800])settleAction(pendingAction,delay);
      }
      if(event.type==='click')pendingAction.sawClick=true;
    }
    const data={target:shortNode(el),deepTarget:compactNode(deepNode(el,false,true)),interactionRoot:root?compactNode(deepNode(root,false,true)):null,attribution:attributionData,isTrusted:event.isTrusted===true,provenance:'DOM trust is not proof of manual or Solve origin'};
    if (['mousedown','mouseup','mousemove','dragstart','dragend','drop'].includes(event.type) && 'clientX' in event) {
      data.pointer = {x:Math.round(event.clientX),y:Math.round(event.clientY)};
    }
    if (/^touch/.test(event.type))data.touchCount=event.touches?.length??null;
    if (/^key/.test(event.type)) {
      // Do not record literal character keystrokes; input values are captured in the scoped editor state.
      data.key = ['Enter', 'Escape', 'Tab', 'Backspace', 'Delete'].includes(event.key) ? event.key : 'other';
    }
    if (event.type === 'beforeinput' || event.type === 'input') data.inputType = clean(event.inputType, 50);
    record(event.type, data, ['click', 'input', 'change', 'focusin', 'focusout', 'pointerup'].includes(event.type));
    if (['click', 'input', 'change', 'drop', 'dragend'].includes(event.type)) {
      setTimeout(() => record('settled', {after: event.type}, true), 180);
    }
  }
  function onMutations(mutations,source) {
    if (!trace.active || trace.truncated) return;
    if(source==='stop-drain')trace.observation.mutationDrains++;else trace.observation.mutationCallbacks++;
    trace.observation.mutationsSeen+=mutations.length;
    const overlaySelector = 'input, textarea, [contenteditable="true"], [role="option"], [role="menuitem"], .popup, .popper, .popover, .interaction, [class*="replacement"], [class*="correction"]';
    if(mutations.length>120)trace.observation.mutationScanClipped+=mutations.length-120;
    const associated = mutations.slice(0,120).filter(m => relevantEditor(m.target) || [...m.addedNodes,...m.removedNodes].some(n=>n.nodeType===1 && (n.matches?.(".interaction") || n.querySelector?.(".interaction"))) ||
      (Date.now() < trace.armedUntil && [...m.addedNodes, ...m.removedNodes].some(n =>
        relevantEditor(n) || (n?.nodeType === 1 &&
          (n.matches?.(overlaySelector) || n.querySelector?.(overlaySelector))))));
    trace.observation.relevantMutations+=associated.length;
    if (!associated.length) return;
    trace.armedUntil = Date.now() + 20000;
    const samples = associated.slice(0, 6).map(m => ({
      kind: m.type, attribute: m.attributeName || null,oldValue:sensitive(m.target)||['value','style'].includes(m.attributeName)?null:clean(m.oldValue,220),target:shortNode(m.target),deepTarget:compactNode(deepNode(m.target,false,true)),attribution:attribution(m.target),
      added: [...m.addedNodes].slice(0, 3).map(n=>deepNode(n,false,true)),
      removed: [...m.removedNodes].slice(0, 3).map(n=>deepNode(n,false,true))
    }));
    const now = Date.now();
    if (now - trace.lastMutation > 75) {
      trace.lastMutation = now;
      record('dom-mutation', {changes:samples,total:associated.length,actionId:mutationActionId(samples)}, true);
    } else {
      record('dom-mutation', {changes:samples.slice(0,2),total:associated.length,actionId:mutationActionId(samples)});
    }
  }

  function mutationActionId(samples) {
    return pendingAction && Date.now()-pendingAction.startedAt<=2500 && samples.every(m=>m.attribution.root?.nodeId===locator(pendingAction.root)?.nodeId)?pendingAction.id:null;
  }
  function observation() {
    return {...trace.observation,rootCount:interactionRoots().length,snapshotRootLimit:limits.roots,rootLocators:interactionRoots().slice(0,limits.roots).map(locator),documentConnected:trace.observerTarget?.isConnected===true&&trace.observerTarget===document.documentElement,serializedChars:trace.byteCount,active:trace.active};
  }
  function startTrace() {
    if (trace.active) return {ok: true, active: true, alreadyActive: true};
    trace.active = true; trace.records = []; trace.byteCount = 0;
    trace.truncated = false; trace.startedAt = Date.now(); trace.endedAt = null;
    trace.observation={observerAttached:false,observerTarget:'document.documentElement',subtree:true,attributeFilter:['class','value','aria-expanded','aria-selected','aria-hidden','style','disabled','aria-disabled','aria-checked','data-model-id'],eventCallbacks:0,mutationCallbacks:0,mutationDrains:0,mutationsSeen:0,relevantMutations:0,mutationScanClipped:0,mutationScanLimit:120,truncationReasons:[],startedAt:new Date(trace.startedAt).toISOString(),stoppedAt:null,listenerCount:watchEvents.length};
    trace.armedUntil = 0; trace.lastMutation = 0; trace.lastMouseMove = 0; trace.lastState = '';
    for (const type of watchEvents) document.addEventListener(type, onEvent, true);
    trace.observerTarget=document.documentElement;
    try {
    trace.observer = new MutationObserver(onMutations);
    trace.observer.observe(trace.observerTarget, {subtree:true,childList:true,characterData:true,attributes:true,attributeOldValue:true,attributeFilter:['class','value','aria-expanded','aria-selected','aria-hidden','style','disabled','aria-disabled','aria-checked','data-model-id']});
    }catch(error){trace.active=false;for(const type of watchEvents)document.removeEventListener(type,onEvent,true);trace.observer?.disconnect();trace.observation.attachError=clean(error?.message,200);return {ok:false,error:'Inspector observer attachment failed',observation:observation()};}
    trace.observation.observerAttached=true;
    trace.observation.rootCountAtStart=interactionRoots().length;
    pendingAction=null;
    record('initial', {observation:observation(),frame:frameEvidence(),title: clean(document.title), url: safeUrl()}, true);
    trace.timer = setTimeout(stopTrace, TRACE_MS);
    return {ok:true,active:true,instanceId,observation:observation()};
  }
  function stopTrace() {
    if (!trace.active) return {ok:true, active:false};
    if(trace.observer)onMutations(trace.observer.takeRecords(),'stop-drain');
    record('final', {observation:observation(),pendingAsyncSamples:pendingTimers.size}, true);
    for(const timer of pendingTimers)clearTimeout(timer);pendingTimers.clear();pendingAction=null;
    trace.active = false; trace.endedAt = Date.now();
    trace.observation.stoppedAt=new Date(trace.endedAt).toISOString();
    for (const type of watchEvents) document.removeEventListener(type, onEvent, true);
    trace.observer?.disconnect();trace.observer = null;
    if (trace.timer) clearTimeout(trace.timer);
    trace.timer = null;
    return {ok: true, active: false};
  }
  function getTrace() {
    return {deepSchema:1,stateEncoding:'occupancy-v1',unchangedSamples:'action-sample.afterStateRef indexes this frame events',observation:trace.observation?observation():null,context:trace.context||null,frame:frameEvidence(),limits:{...limits,maxEvents:MAX_EVENTS,maxBytes:MAX_BYTES,durationMs:TRACE_MS},title:clean(document.title),url:safeUrl(),active:trace.active,
      startedAt: trace.startedAt ? new Date(trace.startedAt).toISOString() : null,
      endedAt: trace.endedAt ? new Date(trace.endedAt).toISOString() : null,
      truncated: trace.truncated, eventCount: trace.records.length, events: trace.records.slice()};
  }
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (!message?.type?.startsWith('SPARK_INSPECT_')) return false;
    if(message.type==='SPARK_INSPECT_TRACE_START'&&trace.active){respond({ok:true,active:true,alreadyActive:true});return false;}
    if(['SPARK_INSPECT_TRACE_STOP','SPARK_INSPECT_TRACE_CLEAR'].includes(message.type)&&
      message.expectedSessionId&&message.expectedSessionId!==trace.context?.sessionId){respond({ok:false,error:'Recording session ownership changed'});return false;}
    try {
      switch (message.type) {
        case 'SPARK_INSPECT_PROBE': respond({ok:true,result:{instanceId,adapter:'ngl',observation:trace.observation?observation():null,title:clean(document.title),url:safeUrl(),readyState:document.readyState,correctionWidgets:document.querySelectorAll('.interaction.ic-text-correction').length,interactionCount:interactionRoots().length,interactionTypes:[...new Set(interactionRoots().map(el=>[...el.classList].find(cls=>/^(?:om-|is-|ic-|os-|pp-)/.test(cls))||'unknown'))].slice(0,16)}}); break;
        case 'SPARK_INSPECT_CAPTURE': respond({ok:true, result:capture()}); break;
        case 'SPARK_INSPECT_TRACE_START': for(const key of ['roots','nodes','children'])if(Number.isInteger(message.limits?.[key]))limits[key]=Math.max(1,Math.min({roots:8,nodes:60,children:6}[key],message.limits[key]));trace.context={sessionId:clean(message.context?.sessionId,120),phase:clean(message.context?.phase,80),frameId:Number.isInteger(message.context?.frameId)?message.context.frameId:null};respond(startTrace()); break;
        case 'SPARK_INSPECT_TRACE_STOP': respond(stopTrace()); break;
        case 'SPARK_INSPECT_TRACE_GET': respond({ok:true, result:getTrace()}); break;
        case 'SPARK_INSPECT_TRACE_CLEAR': stopTrace();trace.records=[];trace.startedAt=null;trace.endedAt=null;trace.byteCount=0;trace.truncated=false;respond({ok:true});break;
        default: return false;
      }
    } catch (error) {respond({ok:false,error:String(error?.message || error)});}
    return false;
  });
})();
