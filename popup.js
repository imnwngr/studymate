'use strict';
const $ = id => document.getElementById(id);
const I=SparkI18n;
const t=(key,vars)=>I.t(key,vars);
const state = {tabId:null,frameId:null,questions:[],title:'',answers:new Map(), solved:false,lastApplyVerified:false,submitting:false,screenIndex:null,screenCount:null,verifiedQti:false};
const normalized = s=>String(s||'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
function status(message,type='normal') {
  const container=$('status');
  container.className='status '+type;
  container.querySelector('.status-message').textContent=message;
}
function progress(phase){
  const phases=['scan','solve','apply'], index=phases.indexOf(phase);
  document.querySelectorAll('.progress-step').forEach((item,i)=>{
    item.classList.toggle('is-current',i===index);
    item.classList.toggle('is-done',i<index);
    if(i===index)item.setAttribute('aria-current','step');
    else item.removeAttribute('aria-current');
  });
}
function el(tag,className,text) {const node=document.createElement(tag); if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
const errString = e=>e?.message||String(e);
// Local, bounded diagnostics: no answers, page URLs, tokens or credentials.
function solveDiagnostic(stage, data) {
  console.info('[Spark Solve]', stage, data);
}
async function sendFrame(frameId,message) {
  const request=state.solveOperation?{...message,execution:{operationId:state.solveOperation,tabId:state.tabId,frameId}}:message;
  const response=await SparkFrameAccess.send(chrome,state.tabId,frameId,request);
  if(response?.execution){
    state.executionTrace=response.execution;
    if(state.loggedOperation!==response.execution.operationId){state.loggedOperation=response.execution.operationId;state.loggedSequence=0;}
    for(const event of response.execution.events||[])if(event.sequence>state.loggedSequence){solveDiagnostic(event.stage,event);state.loggedSequence=event.sequence;}
  }
  return response;
}
function showSiteStatus(tab,accessUnavailable=false){
  const node=$('siteStatus');
  if(!node)return;
  const site=SparkSites.recognize(tab?.url);
  const unavailable=accessUnavailable||!tab?.id||!SparkSites.access(tab?.url);
  node.dataset.state=unavailable?'unavailable':site?'registered':'unregistered';
  node.textContent=unavailable?t('siteAccessUnavailable'):site?
    t('siteRegistered',{site:site.name}):t('siteUnregistered');
}
async function refreshSiteStatus(){
  try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});showSiteStatus(tab);}
  catch{showSiteStatus(null,true);}
}
async function scanPage() {
  $('scan').disabled=true;
  state.questions=[];state.answers=new Map();state.solved=false;state.lastApplyVerified=false;$('submitNext').disabled=true;
  $('results').hidden=true;
  document.body.classList.remove('has-results');
  $('emptyState').hidden=false;
  progress('scan');
  $('fillReport').textContent='';
  status(t('scanning'));
  try {
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    showSiteStatus(tab);
    if (!tab?.id || !SparkSites.access(tab.url)) throw new Error(t('siteAccessUnavailable'));
    state.tabId=tab.id;
    if(state.solveOperation)solveDiagnostic('SCAN_STARTED',{operationId:state.solveOperation,tabId:state.tabId,frameId:null,result:'discovering-frames'});
    let frames;
    try{frames=await chrome.webNavigation.getAllFrames({tabId:tab.id});}catch{frames=null;}
    const targets=frames?.length?frames.map(f=>f.frameId):[0];
    const responses=await Promise.all(targets.map(async frameId=>({frameId,response:await sendFrame(frameId,{type:'SPARK_SCAN'})})));
    const candidates=responses.filter(x=>x.response?.ok && x.response.result?.questions?.length);
    const inaccessible=responses.filter(x=>x.response?.reason==='accessUnavailable');
    const failed=responses.filter(x=>!x.response?.ok&&x.response?.reason!=='accessUnavailable');
    if(failed.length)solveDiagnostic('scan-failures',{frames:failed.slice(0,60).map(x=>({frameId:x.frameId,reason:x.response?.reason||'scanFailed'}))});
    state.inaccessibleFrames=inaccessible.length;
    if(!candidates.length){
      if(inaccessible.length){showSiteStatus(tab,true);throw new Error(t('siteAccessUnavailable'));}
      if(failed.length)throw new Error(t('siteScanFailed'));
      throw new Error(t('noExercise'));
    }
    candidates.sort((a,b)=>b.response.result.questions.length-a.response.result.questions.length);
    const selected=candidates[0];
    state.frameId=selected.frameId;
    state.screenIndex=selected.response.result.screenIndex;
    state.screenCount=selected.response.result.screenCount;
    state.verifiedQti=false;
    state.title=selected.response.result.title;
    state.questions=selected.response.result.questions;
    state.architecture=selected.response.result.architecture||null;
    solveDiagnostic('architecture',{...state.architecture,inaccessibleFrames:inaccessible.length});
    solveDiagnostic('scan', {frameId:state.frameId,title:state.title,
      interactiveId:selected.response.result.frameUrl?.match(/\/(?:cdn_proxy|api\/interactives)\/([a-f0-9-]{36})\b/i)?.[1]||null,
      candidates:candidates.length,questions:state.questions.slice(0,60).map(q=>({
        id:q.id,kind:q.kind,applyable:q.applyable,gaps:q.gapCount,sources:q.poolLabels?.length}))});
    state.answers=new Map();state.solved=false;state.lastApplyVerified=false;$('submitNext').disabled=true;
    $('title').textContent=state.title;
    $('count').textContent=t('count',{n:state.questions.length,frame:state.frameId});
    $('results').hidden=false;
    document.body.classList.add('has-results');
    $('emptyState').hidden=true;
    progress('solve');
    render();
    status(t('readReady')+(inaccessible.length?' '+t('siteSomeFramesUnavailable'):''),'normal');
    return true;
  } catch(error) {status(errString(error),'error');return false;}
  finally {$('scan').disabled=false;}
}
function render() {
  const root=$('questions');root.replaceChildren();
  const fragment=document.createDocumentFragment();
  for(const [index,q] of state.questions.entries()) {
    const card=el('details','question-card');
    card.open=index===0;
    card.id='card-'+q.id;
    const head=el('summary','question-head');
    head.append(el('span','question-index',String(index+1).padStart(2,'0')));
    const main=el('span','question-headline');
    main.append(el('span','question-label',`${t('question')} ${index+1}`));
    const short=(q.localContext||q.context||'').replace(/\s+/g,' ').trim();
    main.append(el('span','question-summary',short));
    const end=el('span','question-end');
    const badge=el('span','question-answer-badge',t('answered'));badge.hidden=true;badge.id='badge-'+q.id;
    const chevron=document.createElementNS('http://www.w3.org/2000/svg','svg');
    chevron.setAttribute('class','ui-icon question-chevron');chevron.setAttribute('viewBox','0 0 24 24');
    const poly=document.createElementNS('http://www.w3.org/2000/svg','path');poly.setAttribute('d','m6 9 6 6 6-6');chevron.append(poly);
    end.append(badge,chevron);head.append(main,end);card.append(head);
    const body=el('div','question-body');
    body.append(el('span','question-kind',t({dropdown:'kindDropdown',choice:'kindDropdown',multi:'kindDropdown',checkbox:'kindDropdown',match:'kindManual',linkingLines:'kindManual',gapWordPool:'kindWordPool',text:'kindText',order:'kindOrder',correction:'kindCorrection',manual:'kindManual'}[q.kind]||'kindOther')));
    body.append(el('p','question-text',q.localContext||q.context));
    if(q.options?.length) body.append(el('p','options-preview',`${t('optionsLabel')}: ${q.options.join(' · ')}`));
    else if(q.wordBank) body.append(el('p','options-preview',`${t('optionsLabel')}: ${q.wordBank}`));
    const line=el('div','answer-line');
    const lbl=el('label','',t('answer'));lbl.setAttribute('for','answer-'+q.id);
    let input;
    if(q.options?.length && !['multi','checkbox','match','linkingLines'].includes(q.kind)) {
      input=el('select','answer-input');
      const blank=el('option','',`— ${t('chooseAnswer')} —`);blank.value=''; input.append(blank);
      for(const opt of q.options){const optEl=el('option','',opt);optEl.value=opt;input.append(optEl);}
    } else {
      input=el('input','answer-input');input.type='text';input.placeholder=t('answerPlaceholder');
    }
    input.id='answer-'+q.id;
    input.addEventListener('input',()=>{
      const prev=state.answers.get(q.id)||{};
      state.answers.set(q.id,{id:q.id,answer:input.value,confidence:'high',source:'user',explanation:t('manuallyEdited')});
      updateCardState(q.id,input.value);state.lastApplyVerified=false;$('submitNext').disabled=true;
      });
    line.append(lbl,input);body.append(line);
    const hint=el('p','explanation');hint.id='explain-'+q.id;
    if(!q.applyable) hint.textContent=t('manualOnly');
    const alternatives=el('div','alternatives');alternatives.id='alts-'+q.id;
    body.append(hint,alternatives);card.append(body);fragment.append(card);
  }
  root.append(fragment);
}
function updateCardState(id,answer){
  const card=$('card-'+id),badge=$('badge-'+id);
  if(!card||!badge)return;
  const hasAnswer=Boolean(String(answer||'').trim());
  card.classList.toggle('has-answer',hasAnswer);
  badge.hidden=!hasAnswer;
}
function updateAnswers() {
  for(const q of state.questions) {
    const ans=state.answers.get(q.id);
    const input=$('answer-'+q.id), note=$('explain-'+q.id), alts=$('alts-'+q.id);
    if (!input || !note || !alts) continue;
    input.value=ans?.answer||'';
    updateCardState(q.id,ans?.answer);
    let label=ans?.source==='qti'?t('qtiLabel'):ans?.source==='ai'?(ans.provider||'AI'):ans?.source==='compare'?t('compareAnswer'):ans?.source==='user'?t('yourChoice'):t('rules');
    note.textContent=ans ? `${label} · ${ans.confidence||'low'} · ${ans.source==='qti'?t('qtiExplanation'):(ans.explanation||'')}` : t('noAnswer');
    if(!q.applyable) note.textContent+=' '+t('notAutoFill')+
      (q.linkingDiagnostics?' '+q.linkingDiagnostics.reason:'')+
      (q.diagnostic?' '+q.diagnostic:'');
    if(ans && (!ans.answer || (ans.alternatives?.length>1))) $('card-'+q.id).open=true;
    alts.replaceChildren();
    for(const alternative of ans?.alternatives||[]) {
      const button=el('button','alt-button',`${alternative.answer} (${alternative.providers.join(', ')})`);
      button.type='button';
      button.title=t('chooseAlternative');
      button.addEventListener('click',()=>{
        state.answers.set(q.id,{id:q.id,answer:alternative.answer,confidence:'high',source:'user',
          explanation:t('choiceSelected'),alternatives:ans.alternatives});
        updateAnswers();state.lastApplyVerified=false;$('submitNext').disabled=true;
      });
      alts.append(button);
    }
  }
}
async function solve() {
  if(!state.questions.length)return false;
  state.lastApplyVerified=false;$('submitNext').disabled=true;
  progress('solve');status(t('solving'));
  try {
    const all=state.questions.map(q=>({id:q.id,kind:q.kind,context:q.context,
      localContext:q.localContext||'',options:q.options,choiceIds:q.choiceIds||[],choiceLabelsVerified:q.choiceLabelsVerified===true,orderTokens:q.orderTokens||[],rubric:q.rubric,wordBank:q.wordBank||'',hint:q.hint,before:q.before,after:q.after}));
    const payload={title:state.title,uiLanguage:I.language,questions:all};
    let qti=[];
    try {
      const read=await sendFrame(state.frameId,{type:'SPARK_QTI',ids:all.map(q=>q.id)});
      solveDiagnostic('qti',{frameId:state.frameId,ok:read?.ok===true,
        reason:read.result?.reason,answers:read.result?.answers?.length||0,
        diagnostics:read.result?.diagnostics?.slice(0,20),error:read.error});
      if(read?.ok && Array.isArray(read.result?.answers))qti=read.result.answers;
    } catch { /* QTI is best effort; a missed key must not block AI fallback. */ }
    const trusted=new Map();
    let labelsUpdated=false;
    for(const answer of qti){
      const question=all.find(q=>q.id===answer.id);
      if(!question || trusted.has(answer.id) || !answer.answer)continue;
      if(['choice','multi','checkbox'].includes(question.kind)){
        if(!answer.selectedIds?.length || !question.choiceIds?.length ||
          answer.selectedIds.some(id=>!question.choiceIds.includes(id)) ||
          !Array.isArray(answer.choiceOptions) || answer.choiceOptions.length!==question.choiceIds.length)continue;
        question.options=answer.choiceOptions;
        const live=state.questions.find(q=>q.id===question.id);
        if(live){live.options=answer.choiceOptions;labelsUpdated=true;}
      } else if(question.options?.length && !question.options.some(opt=>normalized(opt)===normalized(answer.answer)))continue;
      trusted.set(answer.id,answer);
    }
    const remaining=all.filter(q=>!trusted.has(q.id));
    const eligibleFallback=remaining.filter(q=>!['checkbox','linkingLines'].includes(q.kind));
    let fallback=null;
    if(eligibleFallback.length){
      try {
        const response=await chrome.runtime.sendMessage({type:'SPARK_SOLVE',payload:{...payload,questions:eligibleFallback}});
        if(!response?.ok)throw new Error(response?.error||t('solveFailed'));
        fallback=response.result;
      } catch(error) {
        // Keep already validated local answers if the remote fallback is down.
        fallback={answers:[],warning:errString(error)};
      }
    }
    const fallbackMap=new Map((fallback?.answers||[]).map(a=>[a.id,a]));
    state.answers=new Map();
    for(const q of all){
      const candidate=trusted.get(q.id)||fallbackMap.get(q.id);
      if(candidate)state.answers.set(q.id,candidate);
    }
    state.solved=true;
    state.verifiedQti=all.every(q=>trusted.has(q.id));
    if(labelsUpdated)render();
    updateAnswers();
    const complete=all.filter(q=>state.answers.get(q.id)?.answer).length;
    if(complete>0)progress('apply');
    const label=trusted.size===all.length?t('qtiLabel'):
      trusted.size?t('qtiMixed'):
      fallback?.mode==='compare'?t('compareMode'):
      fallback?.mode==='ai'?`AI (${fallback.provider||'API'})`:t('rules');
    status(t('readyCount',{mode:label,n:complete,total:all.length})+
      (trusted.size===all.length?' '+t('qtiNoApi'):'')+
      (fallback?.warning?' '+fallback.warning:''),complete?'success':'normal');
    solveDiagnostic('ANSWER_READY',{frameId:state.frameId,answers:complete,total:all.length,verifiedQti:state.verifiedQti});
    return complete>0;
  }catch(error){status(errString(error),'error');return false;}
}
// Copy the complete current exercise from Spark itself (not the truncated card preview).
// The content script intentionally omits entered answers, session details and QTI keys.
async function copyExercise() {
  if (!state.tabId || state.frameId===null || !state.questions.length) {
    status(t('noExercise'),'error');
    return;
  }
  try {
    const response=await sendFrame(state.frameId,{type:'SPARK_COPY_PROMPT'});
    if(!response?.ok || !response.result?.text)throw new Error(response?.error||t('noExercise'));
    await navigator.clipboard.writeText(response.result.text);
    status(t('copiedPrompt'),'success');
  } catch(error){status(t('copyFailed',{error:errString(error)}),'error');}
}
async function applyAnswers() {
  if(!state.questions.length)return false;
  state.lastApplyVerified=false;$('submitNext').disabled=true;
  const answers=[];
  let missing=0;
  for(const q of state.questions){
    const a=state.answers.get(q.id);
    const answer=String(a?.answer||'').trim();
    if(!answer || (a.source!=='user'&&a.confidence==='low')) {missing++;continue;}
    // Double check all option-backed answers before trying to click.
    if(q.options?.length && q.kind!=='multi' && q.kind!=='match' && !q.options.some(o=>normalized(o)===normalized(answer))) {missing++;continue;}
    if(q.kind==='checkbox' && (a.source!=='qti'||!Array.isArray(a.selectedIds)||!a.selectedIds.length)) {missing++;continue;}
    if(['multi','checkbox'].includes(q.kind) && a.source==='qti' && (!Array.isArray(a.selectedIds)||
      a.selectedIds.some(id=>!q.choiceIds?.includes(id)))){missing++;continue;}
    if(q.kind==='linkingLines'&&(!q.applyable||a.source!=='qti'||!a.linkingVerified)){missing++;continue;}
    answers.push({id:q.id,answer,...(a.selectedIds?.length&&a.source==='qti'?{selectedIds:a.selectedIds}:{}),...(q.kind==='order'&&a.source==='qti'&&Array.isArray(a.orderedTokens)?{orderedTokens:a.orderedTokens}:{}),...(q.kind==='textCorrection'&&a.source==='qti'&&Array.isArray(a.corrections)?{corrections:a.corrections}:{}),...(q.kind==='gapWordPool'&&a.source==='qti'&&a.wordPoolVerified&&Array.isArray(a.pairs)?{pairs:a.pairs,wordPoolVerified:true}:{})});
  }
  if(!answers.length){solveDiagnostic('APPLY_BLOCKED',{frameId:state.frameId,reason:'noEligibleAnswers',missing});status(t('notReady'),'error');return false;}
  solveDiagnostic('APPLY_REQUESTED',{frameId:state.frameId,answers:answers.length,missing});
  progress('apply');status(t('filling'));
  try{
    const response=await sendFrame(state.frameId,{type:'SPARK_APPLY',answers});
    if(!response?.ok) throw new Error(response?.error||t('fillFailed'));
    const results=response.result;
    solveDiagnostic('apply',{frameId:state.frameId,adapterId:state.architecture?.adapterId||'ngl',results:results.slice(0,60)});
    const filled=results.filter(x=>x.status==='filled').length;
    const manual=results.filter(x=>x.status==='manual').length;
    const uncertain=results.filter(x=>x.status==='uncertain').length;
    $('fillReport').textContent=t('fillReport',{filled,manual,uncertain,skipped:missing+results.filter(x=>x.status==='skipped').length})+
      results.filter(x=>x.status!=='filled'&&x.detail).slice(0,3).map(x=>' '+String(x.detail).slice(0,240)).join('');
    status(t('fillDone',{n:results.length}),filled?'success':'normal');
    // Require a verified page-level apply, including all recognised gaps, before enabling submit.
    state.lastApplyVerified=missing===0 && results.length===state.questions.length &&
      results.every(x=>x.status==='filled') && !state.questions.some(q=>q.kind==='textCorrection');
    solveDiagnostic(state.lastApplyVerified?'PLACEMENT_VERIFIED':'APPLY_BLOCKED',{frameId:state.frameId,filled,manual,uncertain,missing});
    $('submitNext').disabled=!state.lastApplyVerified||
      (state.architecture&&!state.architecture.capabilities.includes('verified-submit'));
    if(filled) { document.querySelector('[data-phase="apply"]')?.classList.add('is-done'); document.querySelector('[data-phase="apply"]')?.classList.remove('is-current'); }
    return state.lastApplyVerified;
  }catch(error){solveDiagnostic('APPLY_BLOCKED',{frameId:state.frameId,reason:'applyException',error:errString(error)});status(errString(error),'error');return false;}
}
async function autoSolveAndFill() {
  $('auto').disabled=true;
  state.solveOperation='solve-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  state.lastApplyVerified=false;
  try {
    // Bounded intra-activity screen workflow; no learning-object navigation.
    const seen=new Set();
    for(let iteration=0;iteration<30;iteration++){
      if(!(await scanPage()))break;
      const index=state.screenIndex, count=state.screenCount;
      const key=`${state.frameId}:${index}:${count}`;
      if(seen.has(key)){status('Screen did not advance; stopped safely.','error');break;}
      seen.add(key);
      if(!(await solve())){solveDiagnostic('APPLY_NOT_REQUESTED',{reason:'solveNotReady',frameId:state.frameId});break;}
      if(!(await applyAnswers()))break;
      // QTI provides known keys. AI guesses or manual edits cannot establish correctness.
      // The correction widget can show the replacement without confirming
      // Spark's gradebook model. Never advance automatically in this mode.
      if(state.questions.some(q=>q.kind==='textCorrection')){
        status('Correction screen processed. Check Spark feedback before moving on.','normal');
        break;
      }
      if(!state.verifiedQti){
        status('Solved this screen. Automatic Next requires verified QTI answers.','normal');
        break;
      }
      // Stop at final screen, or if the total is not independently known.
      if(!Number.isInteger(count) || count<2 || !Number.isInteger(index) || index>=count-1){
        status(Number.isInteger(count) ? `Solved screen ${index+1}/${count}. Final screen reached.` :
          'Solved this screen. Screen count unknown; automatic Next disabled.','success');
        break;
      }
      status(`Verified screen ${index+1}/${count}. Moving to next screen…`,'success');
      const response=await sendFrame(state.frameId,{type:'SPARK_FORWARD_SCREEN',screenIndex:index,screenCount:count});
      if(!response?.ok || !response.result?.advanced){
        status(`Screen ${index+1}/${count} solved; Next was not confirmed (${response?.result?.reason||response?.error||'unknown'}).`,'normal');
        break;
      }
    }
  } finally {
    solveDiagnostic(state.lastApplyVerified?'SOLVE_COMPLETED':'SOLVE_ABORTED',{operationId:state.solveOperation,tabId:state.tabId,frameId:state.questions.length?state.frameId:null,result:state.lastApplyVerified?'popup-apply-verified':'popup-stopped'});
    $('auto').disabled=false;
  }
}

async function submitAndNext(){
  if(state.submitting || !state.lastApplyVerified || !state.questions.length){status(t('autoNotApplied'),'error');return;}
  state.submitting=true;$('submitNext').disabled=true;
  status(t('submitCheck'));
  try{
    const response=await sendFrame(state.frameId,{type:'SPARK_SUBMIT_NEXT',
      expected:state.questions.length,goNext:state.autoNext===true});
    if(!response?.ok)throw new Error(response?.error||t('submitControlMissing'));
    const result=response.result||{};
    if(!result.submitted){status(t('submitBlocked',{reason:t(result.reason||'submitWarning')}),'error');return;}
    if(result.nextClicked)status(t('submitNextDone'),'success');
    else if(result.confirmed)status(t('submitNoNext'),'success');
    else status(t('submitWarning'),'normal');
    // Never permit a second submission from this stale scan.
    state.lastApplyVerified=false;
  }catch(error){status(errString(error),'error');}
  finally{state.submitting=false;$('submitNext').disabled=true;}
}
$('submitNext').addEventListener('click',submitAndNext);

$('auto').addEventListener('click',autoSolveAndFill);
$('settings').addEventListener('click',()=>chrome.runtime.openOptionsPage());
$('inspector').addEventListener('click',async()=>{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const url=chrome.runtime.getURL('inspector.html')+(tab?.id?'?tabId='+tab.id:'');
  await chrome.tabs.create({url});
});
$('scan').addEventListener('click',scanPage);
$('copy').addEventListener('click',copyExercise);
async function showMode(){
  try {
    const saved=await chrome.storage.local.get(['aiMode']);
    const mode=saved.aiMode;
    $('modeLabel').textContent=t('qtiFirstShort');
  }catch{}
}
async function initialize(){
  try {await I.load();await SparkAppearance.load();const stored=await chrome.storage.local.get(['autoNext']);state.autoNext=stored.autoNext!==false;}catch{}
  await showMode();await refreshSiteStatus();await scanPage();
}
chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&(changes.uiLanguage||changes.uiTheme||changes.uiBackdropColor||changes.uiBackdropStrength)){
  Promise.all([I.load(),SparkAppearance.load()]).then(()=>{showMode();refreshSiteStatus();if(state.questions.length){render();updateAnswers();$('count').textContent=t('count',{n:state.questions.length,frame:state.frameId});}}).catch(()=>{});
}});
chrome.tabs.onActivated?.addListener(()=>{state.lastApplyVerified=false;$('submitNext').disabled=true;refreshSiteStatus();});
chrome.tabs.onUpdated?.addListener((_tabId,change)=>{if(change.url){state.lastApplyVerified=false;$('submitNext').disabled=true;refreshSiteStatus();}});
initialize();
