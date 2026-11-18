(function(root){
  'use strict';
  if(root.SparkNglAdapter)return;
  const adapter={id:'ngl',answerSource:'qti',
    detect:({document})=>!!document.querySelector('.content-wrap[id^="content_wrap_"],.learningObject__title,.layout__content .interaction,.interaction.om-text-gap,.interaction.is-linking-lines,.interaction.is-checkbox,.interaction.im-marking.ic-speaking-and-recording,.interaction.ic-text-correction.replace'),
    create(context){
  'use strict';
  let lastScan = { title: '', questions: [], refs: new Map(), applied:new Map(), appliedChoiceIds:new Map(), submitted:false,activeRoot:null };
  let qtiCache = null;
  let qtiPending = null;
  let reviewOperation=null,reviewTrace=null,reviewSequence=0;
  const tidy = (v) => String(v || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const normalized = (v) => tidy(v).normalize('NFKC').toLowerCase().replace(/[’]/g, "'");
  // Correction tokens are case-sensitive: Occupation != occupation.
  const correctionNorm = (v) => tidy(v).normalize('NFKC').replace(/[’]/g, "'");

  const isTextField = el => {
    if (el.matches('textarea,[contenteditable="true"],[role="textbox"]')) return true;
    if (!el.matches('input')) return false;
    return ['text','search','email','number',''].includes(el.getAttribute('type') || 'text');
  };
  const getKind = node => node.matches('select,.wrapper-dropdown,[role="combobox"]') ? 'dropdown' : 'text';
  const optionNodes = node => {
    if (node.matches('select')) return [...node.options];
    let candidates = [...node.querySelectorAll('[role="option"], .listbox__choice,option')];
    if (!candidates.length && node.matches('[role="combobox"]')) {
      const popupId = node.getAttribute('aria-controls');
      const popup = popupId ? document.getElementById(popupId) : null;
      if (popup) candidates = [...popup.querySelectorAll('[role="option"],.listbox__choice,option')];
    }
    return candidates;
  };
  const getOptions = node => optionNodes(node).map(e => tidy(e.textContent))
    .filter(x => x && !/^(select|choose)( an? option)?$/i.test(x));
  function getControls(block) {
    const candidates = [...block.querySelectorAll('select,.wrapper-dropdown,[role="combobox"],input,textarea,[contenteditable="true"],[role="textbox"]')];
    return candidates.filter(node => {
      if (!node.matches('select,.wrapper-dropdown,[role="combobox"]') && !isTextField(node)) return false;
      if (node.matches('[role="combobox"]') && node.closest('.wrapper-dropdown')) return false;
      if (node.matches('select') && node.closest('.wrapper-dropdown')) return false;
      if (node.closest('.wrapper-dropdown') && !node.matches('.wrapper-dropdown')) return false;
      if (candidates.some(parent => parent !== node && parent.contains(node) &&
          (parent.matches('.wrapper-dropdown,[role="combobox"]') || (parent.matches('[contenteditable="true"]') && node.matches('[role="textbox"]'))))) return false;
      return true;
    });
  }
  function activeContentRoot(){
    const roots=[...document.querySelectorAll('.content-wrap[id^="content_wrap_"]')];
    const visible=roots.filter(el=>!el.classList.contains('activity--hidden') && !el.hidden &&
      !el.closest('[hidden],[inert]') && getComputedStyle(el).display!=='none');
    return visible[0]||roots[0]||document;
  }
  function choiceGroup(block,includeHidden=false){
    const controls=[...block.querySelectorAll('[role="checkbox"],[role="radio"]')]
      .filter(el=>includeHidden||(!el.closest('[hidden],[inert]') && !el.matches('[aria-hidden="true"]')));
    if(!controls.length)return null;
    const kind=controls[0].getAttribute('role')==='checkbox'?'multi':'choice';
    if(controls.some(el=>el.getAttribute('role')!==(kind==='multi'?'checkbox':'radio')))return null;
    const items=controls.map(el=>{
      const match=(el.id||el.className||'').match(/(?:input-(?:checkbox|radio)-(?:s\d+-)?c|choice-c)(\d+)-(\d+)/);
      const id=match?`C${match[1]}_${match[2]}`:'';
      // Spark prepends a visual "." icon to radio text. Reading the entire
      // clickable div produces ".isn't" while QTI has "isn't".
      const caption=el.querySelector('.is-radiobutton-choice-text,.is-checkbox-choice-text,.choice-text,.item .text');
      const label=tidy(caption?.textContent||el.closest('label')?.innerText||
        el.parentElement?.querySelector('label')?.innerText||el.innerText||el.textContent||'')
        .replace(el.querySelector('.is-radiobutton__icon,.is-checkbox__icon') && !caption ? /^\.\s*/ : /^$/,'');
      return {node:el,id,label};
    });
    // QTI identifiers must be verifiable in the live DOM. Never infer from
    // shuffled visual position or fabricated labels.
    if(items.some(x=>!x.id)||new Set(items.map(x=>x.id)).size!==items.length)return null;
    const groups=new Set(items.map(x=>x.id.split('_')[0]));
    if(groups.size!==1)return null;
    return {kind,items,options:items.map(x=>x.label||x.id),choiceIds:items.map(x=>x.id),
      choiceLabelsVerified:items.every(x=>Boolean(x.label)&&normalized(x.label)!==normalized(x.id))};
  }
  // Bank words are per-screen. Do not accidentally take the hidden next page's pool.
  function findWordBank(root,blocks,rubric){
    const pool=[...root.querySelectorAll('.pool .static_word')].map(el=>tidy(el.textContent)).filter(Boolean);
    if(pool.length)return {text:pool.join(' | '),block:null};
    if(!/\b(?:word|words|phrase|phrases)\b[^.?!]{0,130}\bbox\b/i.test(rubric)&&
       !/\b(?:word|words)\s*bank\b/i.test(rubric))return {text:'',block:null};
    const explicit=root.querySelector('.wordbank,.word-bank,.word-box,.wordbox,[data-zone-type="wordbank"]');
    if(explicit&&!getControls(explicit).length){
      const value=tidy(explicit.innerText||explicit.textContent).slice(0,350);
      if(value)return {text:value,block:blocks.find(b=>b===explicit||b.contains(explicit))||null};
    }
    const firstEditable=blocks.findIndex(b=>getControls(b).length>0);
    if(firstEditable<1)return {text:'',block:null};
    for(const block of blocks.slice(0,firstEditable)){
      if(getControls(block).length||block.querySelector('.enum,[data-continuous-enumeration-id]'))continue;
      const text=tidy(block.innerText||block.textContent);
      if(text.length>=5&&text.length<=220&&!/[?.!]/.test(text))return {text,block};
    }
    return {text:'',block:null};
  }
  function formatBlock(block, controls) {
    const sequence=block.closest('.interaction.os-sequence')||block.querySelector('.interaction.os-sequence');
    if(sequence){
      const tokens=[...sequence.querySelectorAll('li.os-sequence-element')].map(tile=>
        tidy(tile.querySelector('.firstword')?.textContent||tile.innerText||tile.textContent)).filter(Boolean);
      if(tokens.length)return `Sequence: ${tokens.join(' ').replace(/\s+([,.!?;:])/g,'$1')}`;
    }
    const clone = block.cloneNode(true);
    clone.querySelectorAll('.enum,.sr-only,.srOnly,.sr_only,script,style').forEach(n => n.remove());
    const copiedControls = getControls(clone);
    // Controls in detached cloned DOM appear in the same document order as originals.
    for (let i = copiedControls.length - 1; i >= 0; i--) {
      const ctrl = copiedControls[i];
      if (ctrl.isConnected || !clone.contains(ctrl)) continue;
      ctrl.replaceWith(document.createTextNode(` [[${i + 1}]] `));
    }
    return tidy(clone.textContent).replace(/\s+([,.!?;:])/g, '$1');
  }
  function around(context, index) {
    const token = `[[${index + 1}]]`;
    const offset = context.indexOf(token);
    if (offset < 0) return {before:'',after:'',hint:''};
    const before = context.slice(Math.max(0,offset - 240), offset).trim();
    const after = context.slice(offset + token.length, offset + token.length + 120).trim();
    const hintMatch = after.match(/^\s*\(([^)]+)\)/) || before.match(/\(([^)]+)\)\s*$/);
    return {before, after, hint:hintMatch?.[1] || ''};
  }
  function exerciseTitle() {
    return tidy(document.querySelector('.learningObject__title')?.textContent ||
      document.querySelector('.learningObject__heading')?.textContent ||
      document.title || 'Bài tập');
  }
  function screenInfo(root){
    const index=Number((root.id||'').match(/content_wrap_(\d+)/)?.[1]||0);
    const roots=[...document.querySelectorAll('.content-wrap[id^="content_wrap_"]')];
    const indices=roots.map(el=>Number(el.id.match(/^content_wrap_(\d+)$/)?.[1]));
    const reliable=indices.length>1&&indices.every(Number.isInteger)&&
      new Set(indices).size===indices.length&&Math.min(...indices)===0&&
      Math.max(...indices)===indices.length-1;
    return {index,count:reliable?indices.length:null};
  }
  function wordPoolSourceCard(li){
    const cards=[...li.querySelectorAll('.om-text-gap__draggable')]
      .filter(card=>!card.closest('.width-measure'));
    return cards.length===1?cards[0]:null;
  }
  function wordPoolLabel(li){
    const card=wordPoolSourceCard(li);
    if(!card&&li.querySelector('.width-measure'))return '';
    const label=tidy(card?.textContent||li.textContent);
    // Spark exposes both a visible draggable and a measuring copy in a pool
    // item. Only remove duplication when the two halves are IDENTICAL.
    if(!card && label.length%2===0 && label.slice(0,label.length/2)===label.slice(label.length/2))
      return tidy(label.slice(0,label.length/2));
    return label;
  }
  const wordPoolGapText=gap=>tidy(wordPoolSourceCard(gap)?.textContent||'');
  // A Spark data-model-id is not a QTI identifier. Keep source and target
  // attributes separate so a placed choice cannot masquerade as a gap ID.
  const wordPoolQtiId=(node,kind)=>{
    if(!node)return '';
    const child=kind==='target'?'.om-text-gap__droppable':'.om-text-gap__draggable';
    const attrs=kind==='target'?['data-gap-id','data-qti-id','data-identifier']:
      ['data-gap-text-id','data-choice-id','data-qti-id','data-identifier'];
    for(const el of [node,kind==='source'?wordPoolSourceCard(node):node.querySelector(child),
      ...(kind==='source'?[wordPoolSourceCard(node)?.querySelector('.om-text-gap__draggable-handle')]:[])].filter(Boolean)){
      for(const attr of attrs){
        const id=tidy(el.getAttribute(attr));
        if(id)return id;
      }
    }
    return '';
  };
  function wordPoolOrdinal(gap,total){
    const captions=[gap.getAttribute('aria-label'),
      [...gap.children].filter(el=>!el.matches('.om-text-gap__draggable'))
        .map(el=>el.textContent).join(' ')];
    // Real Spark captions can omit the total: "Gap 1 of .". The scan and
    // live bindings still require a complete, unique ordinal set.
    const ordinals=captions.map(text=>tidy(text).match(/\bgap\s+(\d+)\s+(?:of|\/)\s*(\d+|\.(?=\s|$))/i))
      .filter(Boolean).map(match=>(match[2]==='.'||Number(match[2])===total)&&Number(match[1])>=1&&
        Number(match[1])<=total?Number(match[1]):null);
    return ordinals.length && ordinals.every(n=>n!==null&&n===ordinals[0])?ordinals[0]:null;
  }
  const markingSelector='.interaction.im-marking.ic-speaking-and-recording';
  function markingColor(css){
    // Let Chrome parse CSS Color 4 and alpha forms instead of parsing serialized rgb() ourselves.
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx||!CSS.supports('color',css))return null;
    ctx.fillStyle=css;ctx.fillRect(0,0,1,1);
    return [...ctx.getImageData(0,0,1,1).data];
  }
  function markingSnapshot(){
    const roots=[...activeContentRoot().querySelectorAll(markingSelector)].filter(n=>!n.closest('[hidden],[inert]'));
    if(roots.length!==1)return null;
    const widget=roots[0],items=[...widget.querySelectorAll('.im-marking__item.markable')];
    if(widget.querySelectorAll('.im-marking__item-button').length!==items.length ||
      [...widget.querySelectorAll('.marked,.imMarking__item--marked')].some(node=>!items.includes(node)))return null;
    const erasers=[...widget.querySelectorAll('.im-marking__button.erase')];
    const options=[...widget.querySelectorAll('.im-marking__button.toggle')];
    if(!items.length||items.length>100||erasers.length!==1||options.length!==1)return null;
    const color=[...options[0].classList].filter(c=>/^color-[0-9a-f]{6}$/i.test(c));
    if(color.length!==1)return null;
    const groups=[],nodes=[],buttons=[];
    for(const item of items){
      const p=item.closest('p'),contents=[...item.querySelectorAll('[id^="markable-content-"]')];
      const clicks=[...item.querySelectorAll('.im-marking__item-button')];
      if(!p||!widget.contains(p)||contents.length!==1||clicks.length!==1||!clicks[0].contains(contents[0]))return null;
      if(!nodes.includes(p)){nodes.push(p);groups.push([]);}
      if(nodes.indexOf(p)!==groups.length-1)return null;
      groups[groups.length-1].push(tidy(contents[0].textContent));buttons.push(clicks[0]);
    }
    if(groups.flat().some(label=>!label))return null;
    const expectedColor='#'+color[0].slice(6).toLowerCase();
    const observations=items.map(item=>{
      const marked=item.classList.contains('marked'),other=item.classList.contains('imMarking__item--marked');
      const background=getComputedStyle(item).backgroundColor;
      // NGL announces the assigned category on each marked parent, independently of its paint/alpha.
      const annotation=item.cloneNode(true);
      annotation.querySelectorAll('[id^="markable-content-"]').forEach(node=>node.remove());
      const annotationText=tidy(annotation.textContent);
      const options=[...annotationText.matchAll(/Marked as Option\s+(\d+)\./gi)].map(m=>Number(m[1]));
      const observed={marked,other,options,background};
      if(marked!==other)return {...observed,state:'ambiguous'};
      if(!marked)return {...observed,state:options.length?'ambiguous':null};
      if(options.length)return {...observed,state:options.every(n=>n===1)?expectedColor:'optionMismatch'};
      if(/Marked as/i.test(annotationText))return {...observed,state:'ambiguous'};
      const rgba=markingColor(background);
      const expected=expectedColor.slice(1).match(/../g).map(n=>parseInt(n,16));
      return {...observed,state:rgba&&rgba[3]>0&&expected.every((n,i)=>Math.abs(n-rgba[i])<=2)?expectedColor:
        rgba&&rgba[3]>0?'colorMismatch':'ambiguous'};
    });
    const state=observations.map(o=>o.state);
    return {widget,items,buttons,groups,state,observations,erase:erasers[0],option:options[0],color:'#'+color[0].slice(6).toLowerCase()};
  }
  function markingLive(question){
    if(activeContentRoot()!==lastScan.activeRoot)return null;
    const live=markingSnapshot();
    return live&&live.color===question.markingColor&&JSON.stringify(live.groups)===JSON.stringify(question.markingGroups)&&
      [...live.buttons,live.erase,live.option].every(actionable)?live:null;
  }
  function markingIndex(question,target){
    const groups=question.markingGroups;
    return Number.isInteger(target.group)&&Number.isInteger(target.segment)&&target.group>=0&&target.segment>=0&&
      groups[target.group]&&target.segment<groups[target.group].length?
      groups.slice(0,target.group).reduce((n,g)=>n+g.length,0)+target.segment:-1;
  }
  function markingMatches(question,targets){
    const live=markingLive(question);
    if(!live||!targets)return false;
    const expected=live.state.map(()=>null);
    for(const target of targets){const index=markingIndex(question,target);if(index<0||expected[index]!==null)return false;expected[index]=target.color;}
    return live.state.every((value,i)=>value===expected[i]);
  }
  async function setPronunciation(id){
    const question=lastScan.questions.find(q=>q.id===id),targets=lastScan.trustedMarking?.get(id);
    const live=()=>markingLive(question);
    const selected=(s,mode)=>mode==='erase'?s.erase.classList.contains('activated')&&!s.option.classList.contains('activated'):
      s.option.classList.contains('activated')&&!s.erase.classList.contains('activated');
    const poll=async predicate=>{
      const deadline=Date.now()+2000;
      do{const s=live();if(s&&predicate(s))return true;await wait(Math.min(50,Math.max(1,deadline-Date.now())));}while(Date.now()<deadline);
      const s=live();return Boolean(s&&predicate(s));
    };
    const failure=(reason,index,mode)=>{
      let offset=0,group=0;
      while(group<question.markingGroups.length&&index>=offset+question.markingGroups[group].length)
        offset+=question.markingGroups[group++].length;
      const s=live(),observed=s?.observations[index]||null;
      return {status:'uncertain',detail:reason+' group='+ (group+1)+' segment='+ (index-offset+1)+
        ' observed='+JSON.stringify(observed),reason,phase:mode,group:group+1,segment:index-offset+1,observed};
    };
    const mode=async mode=>{
      const s=live();if(!s)return false;
      if(!selected(s,mode)){try{(mode==='erase'?s.erase:s.option).click();}catch{return false;}}
      return poll(s=>selected(s,mode));
    };
    return globalThis.SparkSolvers.solve('pronunciation',{
      preflight:()=>Boolean(targets&&live()&&targets.every(t=>markingIndex(question,t)>=0)),
      read:()=>live()?.state||null,index:t=>markingIndex(question,t),mode,
      click:async(index,phase)=>{
        let s=live();if(!s||!s.buttons[index])return failure('TARGET_MISMATCH',index,phase);
        if(!selected(s,phase)&&!await mode(phase))return failure('OPTION_ACTIVATION_FAILED',index,phase);
        s=live();if(!s||!selected(s,phase))return failure('TARGET_MISMATCH',index,phase);
        const wanted=phase==='erase'?null:question.markingColor;
        if(s.state[index]===wanted)return true;
        // A pending or ambiguous mark must never receive another toggle click.
        if(phase==='mark'&&s.state[index]!==null)return failure('TARGET_STATE_MISMATCH',index,phase);
        try{s.buttons[index].click();}catch{return failure('CLICK_FAILED',index,phase);}
        if(await poll(s=>s.state[index]===wanted))return true;
        s=live();
        const reason=!s?'TARGET_MISMATCH':s.state[index]==='optionMismatch'?'OPTION_MISMATCH':
          s.state[index]==='colorMismatch'?'COLOR_MISMATCH':s.state[index]==='ambiguous'?'AMBIGUOUS_MARKED_STATE':'DOM_TRANSITION_TIMEOUT';
        return failure(reason,index,phase);
      },
      verify:()=>markingMatches(question,targets)
    },{targets});
  }

  function reviewSnapshot(){
    const roots=[...document.querySelectorAll('.content-wrap[id^="content_wrap_"]')]
      .sort((a,b)=>Number(a.id.slice(13))-Number(b.id.slice(13)));
    if(roots.length<2||roots.length>20||roots.some((r,i)=>r.id!=='content_wrap_'+i))return {reason:'REVIEW_SCREEN_IDENTITY',group:0};
    const groups=[];
    for(let index=0;index<roots.length;index++){
      const root=roots[index],widgets=[...root.querySelectorAll('.interaction')].filter(n=>!n.parentElement.closest('.interaction'));
      if(widgets.length!==1)return {reason:'REVIEW_INTERACTION_UNAVAILABLE',group:index};
      const widget=widgets[0],kind=widget.matches('.is-radiobutton')?'choice':widget.matches('.is-checkbox')?'checkbox':
        widget.matches('.ic-text-gap')?'text':widget.matches('.is-dropdown')?'dropdown':null;
      if(!kind)return {reason:'REVIEW_TYPE_UNSUPPORTED',group:index};
      const questions=[],bindings=[];
      if(kind==='choice'||kind==='checkbox'){
        const controls=[...widget.querySelectorAll(kind==='choice'?'[role="radio"]':'[role="checkbox"]')],buckets=new Map();
        for(const node of controls){
          const match=(node.id||node.className||'').match(/(?:input-(?:checkbox|radio)-(?:s\d+-)?c|choice-c)(\d+)-(\d+)/);
          if(!match)return {reason:'REVIEW_CHOICE_IDENTITY',group:index};
          const ordinal=Number(match[1]);if(!buckets.has(ordinal))buckets.set(ordinal,[]);buckets.get(ordinal).push(node);
        }
        for(let i=0;i<buckets.size;i++){
          const nodes=buckets.get(i);if(!nodes)return {reason:'REVIEW_QUESTION_IDENTITY',group:index};
          const group=choiceGroup({querySelectorAll:()=>nodes},true);
          if(!group||!group.choiceLabelsVerified)return {reason:'REVIEW_CHOICE_LABELS',group:index};
          group.items.sort((a,b)=>a.id.localeCompare(b.id));
          const question={id:'s'+index+'q'+i,kind,options:group.items.map(x=>x.label),choiceIds:group.items.map(x=>x.id),
            choiceLabelsVerified:true,reviewIdentity:true,applyable:true,context:'',rubric:''};
          questions.push(question);bindings.push({items:group.items});
        }
      }else{
        const controls=kind==='text'?[...widget.querySelectorAll('input[type="text"],input:not([type])')]:
          [...widget.querySelectorAll('select,.wrapper-dropdown,button[role="combobox"]')].filter(n=>!n.parentElement.closest('.wrapper-dropdown'));
        for(let i=0;i<controls.length;i++){
          const node=controls[i],options=kind==='dropdown'?getOptions(node).sort():[];
          if(kind==='dropdown'&&(options.length<2||new Set(options.map(normalized)).size!==options.length))
            return {reason:'REVIEW_DROPDOWN_OPTIONS',group:index};
          questions.push({id:'s'+index+'q'+i,kind,options,applyable:true,context:'',rubric:''});bindings.push({node});
        }
      }
      if(!questions.length)return {reason:'REVIEW_QUESTIONS_MISSING',group:index};
      groups.push({index,root,widget,kind,questions,bindings});
    }
    return {groups};
  }
  const reviewSignature=snapshot=>JSON.stringify(snapshot.groups?.map(g=>({kind:g.kind,questions:g.questions})));
  function scanReview(title){
    if(!/\breview\b/i.test(title))return null;
    const candidates=document.querySelectorAll('.interaction.is-radiobutton,.interaction.is-checkbox,.interaction.ic-text-gap,.interaction.is-dropdown');
    if(document.querySelectorAll('.content-wrap[id^="content_wrap_"]').length<2&&
      !/(?:^|\|)\s*review\s*$/i.test(title)&&candidates.length<2)return null;
    const snapshot=reviewSnapshot();
    if(!snapshot.reason&&new Set(snapshot.groups.map(g=>g.kind)).size<2)return null;
    const question={id:'q1',kind:'review',options:[],context:'Complete mixed Review',applyable:!snapshot.reason,
      reviewGroups:snapshot.groups?.map(g=>({kind:g.kind,questions:g.questions}))||[],
      ...(snapshot.reason?{diagnostic:'UNSUPPORTED: '+snapshot.reason+' group='+snapshot.group,
        reviewFailure:{reason:snapshot.reason,group:snapshot.group}}:{})};
    lastScan={title,questions:[question],refs:new Map([['q1',{kind:'review'}]]),activeRoot:activeContentRoot(),
      reviewFrameUrl:location.origin+location.pathname,
      reviewSignature:reviewSignature(snapshot),reviewScanFailure:snapshot.reason?{reason:snapshot.reason,group:snapshot.group}:null,
      applied:new Map(),appliedChoiceIds:new Map(),appliedOrder:new Map(),trustedReview:null,submitted:false,screenIndex:0,screenCount:null};
    return {title,questions:[question],hasExercise:true,screenIndex:0,screenCount:null,frameUrl:location.origin+location.pathname};
  }
  function reviewLive(){
    if(exerciseTitle()!==lastScan.title||location.origin+location.pathname!==lastScan.reviewFrameUrl)return null;
    const snapshot=reviewSnapshot();
    return !snapshot.reason&&reviewSignature(snapshot)===lastScan.reviewSignature?snapshot:null;
  }
  function reviewState(index,diagnostic){
    const group=reviewLive()?.groups[index];if(!group)return null;
    const result=[];
    for(const [position,binding] of group.bindings.entries()){
      if(binding.items){
        const selected=[];
        for(const item of binding.items){
          const aria=item.node.getAttribute('aria-checked'),flag=item.node.classList.contains(group.kind==='choice'?'input-radio-checked':'input-checkbox-checked');
          const input=item.node.querySelector('input[type="radio"],input[type="checkbox"]');
          if(!['true','false'].includes(aria)||flag!==(aria==='true')||(input&&input.checked!==flag))return null;
          if(flag)selected.push(item.id);
        }
        if(group.kind==='choice'&&selected.length>1)return null;result.push(selected);
      }else if(group.kind==='text')result.push(binding.node.value);
      else{
        const node=binding.node;
        if(node.matches('select')){const selected=node.selectedOptions[0];result.push(!selected||!tidy(selected.textContent)?null:tidy(selected.textContent));continue;}
        const label=node.matches('.listbox__label')?node:node.querySelector('.listbox__label'),options=optionNodes(node);
        const handle=node.matches('[role="combobox"]')?node:node.querySelector('[role="combobox"]');
        const answer=lastScan.trustedReview?.[index]?.answers?.[position];
        const matching=answer?options.filter(o=>tidy(o.textContent)===answer.answer).length:0;
        const fail=(reason,detail)=>{if(diagnostic)Object.assign(diagnostic,{reason,detail,section:index,question:position,
          qtiResponseResolved:Boolean(answer?.responseId),expectedOptionResolved:Boolean(answer?.selectedIds?.length),
          comboboxMapped:Boolean(handle),currentSelectionReadable:false,expanded:handle?.getAttribute('aria-expanded')==='true',matchingOptions:matching});return null;};
        if(!label||!handle)return fail('CONTROL_UNMAPPED','combobox or label unavailable');
        const selected=options.filter(o=>o.getAttribute('aria-selected')==='true'||o.matches('.listbox__choice--selected,.selected,.is-selected'));
        const placeholder=Boolean(label.querySelector('.listbox__placeholder'))||!tidy(label.textContent);
        if(!selected.length&&placeholder)result.push(null);
        else if(selected.length===1&&tidy(selected[0].textContent)===tidy(label.textContent))result.push(tidy(label.textContent));
        else return fail(selected.length>1?'OPTION_AMBIGUOUS':'SELECTION_UNREADABLE',
          !options.length?'options unavailable':selected.length>1?'multiple selected options':'selection and label disagree');
      }
    }
    return result;
  }
  const reviewEmpty=index=>{
    const group=reviewLive()?.groups[index],state=reviewState(index);
    return Boolean(group&&state&&state.every(value=>Array.isArray(value)?value.length===0:group.kind==='text'?value==='':value===null));
  };
  async function reviewPoll(predicate){
    const operation=reviewOperation,end=Date.now()+2200;
    do{if(reviewOperation!==operation)return false;reviewObserve();if(reviewOperation?.fault)return false;if(predicate())return true;await wait(50);}while(Date.now()<end);
    if(reviewOperation!==operation)return false;
    reviewObserve();return !reviewOperation?.fault&&Boolean(predicate());
  }
  function reviewLog(stage,data={}){
    const op=reviewOperation;if(!op)return;
    const event={sequence:++op.eventSequence,ms:Date.now()-op.started,stage,phase:op.phase,intended:op.intended,
      actual:op.actual,interaction:op.actual===null?null:{section:op.actual,kind:op.plan[op.actual]?.kind,qti:op.plan[op.actual]?.filename},
      operation:op.trigger,resetCount:op.resetCount,generation:op.generation,...data};
    if(op.events.length===400)op.events.shift();op.events.push(event);
    console.debug('[Studymate Review]',op.operationId,event);
  }
  function reviewObserve(){
    const op=reviewOperation;if(!op)return null;
    const snapshot=reviewLive(),active=snapshot?.groups.filter(g=>visible(g.root));
    const actual=active?.length===1?active[0].index:null,previous=op.actual;
    if(snapshot&&snapshot.groups.some((g,i)=>g.widget!==op.widgets[i])){
      const rebound=op.widgets.length>0;if(rebound)op.generation++;
      op.widgets=snapshot.groups.map(g=>g.widget);reviewLog(rebound?'DOM_RELOAD':'DOM_BOUND');
    }
    op.actual=actual;
    if(previous!==actual)reviewLog('ACTIVE_SCREEN_CHANGED',{from:previous,to:actual,initiator:op.navigation?'coordinator-navigation':op.phase==='reset'?'native-reset':'external-or-native'});
    if(['solve','verify-final'].includes(op.phase)&&!op.fault){
      let reason=null;
      if(!snapshot&&!op.navigation)reason='STALE_INTERACTION_ROOT';
      else if(actual===null&&!op.navigation)reason='ACTIVE_SCREEN_MISMATCH';
      else if(actual===null)return snapshot;
      else if(op.navigation?actual!==op.navigation.from&&actual!==op.navigation.to:actual!==op.intended)
        reason=previous!==null&&actual<previous?'UNEXPECTED_BACKWARD_NAVIGATION':'ACTIVE_SCREEN_MISMATCH';
      if(reason){op.fault={reason,actual,intended:op.intended,trigger:op.trigger};reviewLog('GUARD_FAILED',{reason});}
    }
    return snapshot;
  }
  function reviewCurrent(index){
    const op=reviewOperation,snapshot=reviewObserve();
    return Boolean(op&&!op.fault&&op===reviewOperation&&snapshot&&op.actual===index);
  }
  async function reviewActivate(index){
    const op=reviewOperation;if(op){reviewObserve();if(op.fault)return false;}
    for(let count=0;count<=20;count++){
      if(reviewOperation!==op)return false;
      const snapshot=reviewObserve()||reviewLive();if(!snapshot||op?.fault)return false;
      const active=snapshot.groups.filter(g=>visible(g.root));if(active.length!==1)return false;
      if(active[0].index===index){if(op){op.intended=index;if(op.phase==='solve')reviewLog('SECTION_ACTIVATED',{section:index});}return true;}
      const links=[...document.querySelectorAll('#activity_controls [data-interaction],#continous-enumeration-nav [data-interaction]')]
        .filter(n=>n.getAttribute('data-interaction')===String(index)&&actionable(n));
      const direction=active[0].index<index?'forward':'previous',controls=availableActionControls(direction);
      if(op?.phase==='solve'&&direction==='previous'){
        op.fault={reason:'UNEXPECTED_BACKWARD_NAVIGATION',actual:active[0].index,intended:index,trigger:'activate'};return false;
      }
      if(!links.length&&controls.length!==1)return false;
      const destination=links.length?index:active[0].index+(direction==='forward'?1:-1);
      if(op){op.intended=index;op.navigation={from:active[0].index,to:destination};op.trigger='navigate:'+active[0].index+'->'+destination;
        if(op.phase==='solve')reviewLog('SECTION_ADVANCE',{from:active[0].index,to:destination});
        reviewLog('NAVIGATE_START',{direction,trigger:links.length?'data-interaction':direction});}
      try{(links[0]||controls[0]).click();}catch{return false;}
      const arrived=await reviewPoll(()=>{const s=reviewLive();return s&&s.groups.filter(g=>visible(g.root)).length===1&&visible(s.groups[destination].root);});
      reviewObserve();if(op){
        if(!arrived&&!op.fault)op.fault={reason:reviewLive()?'NAVIGATION_FAILED':'STALE_INTERACTION_ROOT',actual:op.actual,intended:index,trigger:op.trigger};
        reviewLog(arrived&&!op.fault?'NAVIGATE_COMMITTED':'NAVIGATE_FAILED',{direction});op.navigation=null;
      }
      if(!arrived||op?.fault)return false;
    }
    return false;
  }
  function reviewFailure(reason,phase,group,expected=null){
    const op=reviewOperation;reviewObserve();
    const cause=reason;
    reason=op?.fault?.reason||(String(reason||'').startsWith('UNSUPPORTED_')||['SECTION_VERIFY_FAILED','QTI_UNRESOLVED','CONTROL_UNMAPPED','SELECTION_UNREADABLE','OPTION_AMBIGUOUS','STATE_NOT_COMMITTED'].includes(reason)?reason:/NAVIGATION/.test(reason)?'NAVIGATION_FAILED':phase==='reset'?'RESET_FAILED':phase==='solve'?'SECTION_SOLVE_FAILED':phase==='verify'?'FINAL_VERIFICATION_FAILED':reason);
    const kind=lastScan.questions[0].reviewGroups[group]?.kind||null,observed=reviewState(group);
    if(op)reviewLog('FAILURE',{reason,cause,group});
    return {status:'uncertain',reason,cause,phase:op?.phase||phase,group,kind,expected,observed,
      ...(op?{operationId:op.operationId,lastCompletedSection:op.lastCompleted,intendedNextSection:op.intended,actualActiveScreen:op.actual,triggeringOperation:op.fault?.trigger||op.trigger}:{}),
      detail:reason+' group='+group+' type='+kind+' expected='+JSON.stringify(expected)+' observed='+JSON.stringify(observed)};
  }
  async function applyReview(answers){
    if(reviewOperation)return [{id:'q1',status:'uncertain',reason:'CONCURRENT_SOLVE_ATTEMPT',detail:'CONCURRENT_SOLVE_ATTEMPT',operationId:reviewOperation.operationId}];
    const supplied=answers.filter(a=>a.id==='q1'),plan=lastScan.trustedReview;
    if(supplied.length!==1||answers.length!==1||!plan)return [{id:'q1',...reviewFailure('UNSUPPORTED_COMPLETE_QTI_REQUIRED','preflight',lastScan.reviewScanFailure?.group??0)}];
    const op={operationId:'review-'+Date.now().toString(36)+'-'+(++reviewSequence),started:Date.now(),phase:'preflight',intended:null,
      actual:null,lastCompleted:null,trigger:'apply',resetCount:0,generation:0,widgets:[],events:[],eventSequence:0,plan,fault:null,navigation:null};

    reviewOperation=op;reviewTrace=op;
    const current=index=>reviewOperation===op&&!op.finished&&reviewCurrent(index);
    const observer=new MutationObserver(()=>{if(reviewOperation===op)reviewObserve();});
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','style','aria-hidden']});
    const controlEvent=event=>{
      const node=event.target.closest?.('[data-event],[data-interaction]');
      if(!node||!node.closest('#activity_controls,#continous-enumeration-nav'))return;
      reviewLog('NATIVE_CONTROL_EVENT',{event:event.type,control:node.getAttribute('data-event')||'section',section:node.getAttribute('data-interaction'),trusted:event.isTrusted});
    };
    document.addEventListener('click',controlEvent,true);document.addEventListener('keyup',controlEvent,true);
    reviewObserve();reviewLog('SOLVE_START');
    try{
    const verify=index=>{
      const state=reviewState(index),group=plan[index];
      return Boolean(state&&state.length===group.answers.length&&group.answers.every((a,i)=>
        Array.isArray(state[i])?JSON.stringify(state[i].slice().sort())===JSON.stringify(a.selectedIds.slice().sort()):state[i]===a.answer));
    };
    const stateSummary=index=>{
      const state=reviewState(index);if(!state)return null;
      return state.map((value,i)=>({position:i,selectedCount:Array.isArray(value)?value.length:undefined,
        hasValue:Array.isArray(value)?undefined:value!==null&&value!=='',matchesExpected:Array.isArray(value)?
          JSON.stringify(value.slice().sort())===JSON.stringify(plan[index].answers[i].selectedIds.slice().sort()):value===plan[index].answers[i].answer}));
    };
    const actionStart=(section,question,kind)=>{op.actions.attempted++;reviewLog('ANSWER_ACTION_START',{section,question,solver:kind,attempted:op.actions.attempted});};
    const actionCommit=(section,question,kind)=>{op.actions.acknowledged++;reviewLog('ANSWER_ACTION_COMMITTED',{section,question,solver:kind,source:'dom',acknowledged:op.actions.acknowledged,observed:stateSummary(section)});};
    let resetKind=null,globalResetIndex=null;
    const reconcile=plan.every(group=>['choice','checkbox','text','dropdown'].includes(group.kind));
    if(!reconcile)return [{id:'q1',...reviewFailure('UNSUPPORTED_RECONCILIATION_STRATEGY','preflight',
      plan.findIndex(group=>!['choice','checkbox','text','dropdown'].includes(group.kind)),'supported section-specific strategy')}];
    const reset=async(all,index)=>{
      if(op.phase!=='reset'||all&&op.globalResetCount)return reviewFailure('RESET_REENTRY_BLOCKED','reset',index);
      const buttons=availableActionControls(all?'reset_all':'reset');
      if(buttons.length!==1)return reviewFailure('NATIVE_RESET_UNAVAILABLE','reset',index);
      op.resetCount++;if(all)op.globalResetCount=(op.globalResetCount||0)+1;op.trigger=all?'reset_all':'reset:'+index;reviewLog('RESET_START',{all});
      try{buttons[0].click();}catch{return reviewFailure('NATIVE_RESET_CLICK_FAILED','reset',index);}
      const selector=all?'.dialog-really-reload-all':'.dialog-really-reload';
      if(!await reviewPoll(()=>[...document.querySelectorAll(selector)].filter(visible).length===1))return reviewFailure('RESET_CONFIRMATION_MISSING','reset',index);
        const dialog=[...document.querySelectorAll(selector)].find(visible),ok=[...dialog.querySelectorAll('[data-button="ok"]')].filter(actionable);
        if(ok.length!==1)return reviewFailure('RESET_CONFIRMATION_AMBIGUOUS','reset',index);
        const previous=reviewLive();
        if(!previous)return reviewFailure('REVIEW_MAPPING_CHANGED','reset',index);
        const indices=all?plan.map((_,i)=>i):[index];
        // Native reload empties contentWrap before rendering fresh interaction views.
        const reloaded=i=>!previous.groups[i].widget.isConnected&&reviewLive()?.groups[i].widget!==previous.groups[i].widget;
        try{ok[0].click();}catch{return reviewFailure('RESET_CONFIRMATION_FAILED','reset',index);}
        if(!await reviewPoll(()=>![...document.querySelectorAll(selector)].some(visible)&&reviewLive()&&
          indices.every(i=>reloaded(i)&&reviewEmpty(i))&&(!all||reviewObserve()?.groups[0]&&op.actual===0))){
          const failed=indices.find(i=>!reloaded(i)||!reviewEmpty(i))??index;
          return reviewFailure(reloaded(failed)?'RESET_INCOMPLETE':'RESET_RELOAD_NOT_OBSERVED','reset',failed,'native reload completed and empty');
        }
      reviewLog('RESET_COMMITTED',{all});
      return null;
    };
    const outcome=await globalThis.SparkSolvers.solve('review',{
      count:plan.length,
      reconcile,
      inspectHidden:true,
      phase:phase=>{op.phase=phase;op.intended=op.actual;op.trigger='phase:'+phase;reviewLog('PHASE_START');},
      check:current,
      completed:index=>{op.lastCompleted=index;const status=op.actions.attempted?'Corrected':'AlreadyCorrect';
        reviewLog('SECTION_PASS',{section:index,status,...op.questions,attempted:op.actions.attempted,acknowledged:op.actions.acknowledged});
        return {index,status,...op.questions,actionsNeeded:op.actions.needed,actionsCommitted:op.actions.acknowledged};},
      preflight:async()=>{
        if(!reviewLive()||plan.length!==lastScan.questions[0].reviewGroups.length)return reviewFailure('REVIEW_MAPPING_CHANGED','preflight',0);
        if([...document.querySelectorAll('.ui-dialog,.dialog-really-reload-all,.dialog-really-reload')].some(visible))
          return reviewFailure('UNSUPPORTED_DIALOG_ALREADY_OPEN','preflight',0);
        const resetEvidence=[];
        for(let index=0;index<plan.length;index++){
          if(!await reviewActivate(index))return reviewFailure('REVIEW_NAVIGATION_UNAVAILABLE','preflight',index);
          const group=reviewLive()?.groups[index];
          const diagnostic={};
          if(!group||!reviewState(index,diagnostic)){
            const reason=diagnostic.reason||'REVIEW_STATE_AMBIGUOUS';
            reviewLog('STATE_READ_FAILED',diagnostic);
            return {...reviewFailure(reason,'preflight',index),...(diagnostic.reason?{question:diagnostic.question,stateDiagnostic:diagnostic}:{})};
          }
          if(!reconcile)resetEvidence.push({index,global:availableActionControls('reset_all').length,section:availableActionControls('reset').length});
          for(const binding of group.bindings){
            const controls=binding.items?binding.items.map(x=>x.node):[binding.node];
            if(controls.some(n=>!actionable(n)||n.readOnly||n.matches('.listbox--prefilled,.prefill,[data-prefilled="true"]')))
              return reviewFailure('REVIEW_CONTROL_UNAVAILABLE','preflight',index);
            if(!reconcile&&group.kind==='dropdown'&&binding.node.matches('select')&&![...binding.node.options].some(o=>o.value===''))
              return reviewFailure('UNSUPPORTED_DROPDOWN_EMPTY_STATE','preflight',index,'blank placeholder');
          }
        }
        if(reconcile){
          if(!await reviewActivate(0))return reviewFailure('REVIEW_NAVIGATION_UNAVAILABLE','preflight',0);
          reviewLog('PREFLIGHT_ALL_COMPLETE',{strategy:'reconcile'});return null;
        }
        if(!resetEvidence.some(item=>item.global===1&&item.index>0)){
          if(await reviewPoll(()=>availableActionControls('reset_all').length===1))
            resetEvidence[plan.length-1].global=1;
        }
        const global=resetEvidence.filter(item=>item.global===1&&item.index>0).at(-1);
        const missing=resetEvidence.find(item=>item.section!==1);
        if(global){resetKind='all';globalResetIndex=global.index;}
        else if(!missing)resetKind='section';
        else{
          const firstOnly=resetEvidence[0].global===1;
          return {...reviewFailure(firstOnly?'UNSUPPORTED_GLOBAL_RESET_NAVIGATION_UNOBSERVABLE':'UNSUPPORTED_NATIVE_RESET_REQUIRED','preflight',missing.index,
            firstOnly?'global reset on a later screen or one section reset per section':'one global reset or one section reset per section'),resetEvidence};
        }
        reviewLog('RESET_STRATEGY',{strategy:resetKind,section:globalResetIndex,availability:resetEvidence});
        reviewLog('PREFLIGHT_ALL_COMPLETE');
        return null;
      },
      reset:async()=>{
        if(resetKind==='all'){
          if(!await reviewActivate(globalResetIndex))return reviewFailure('REVIEW_NAVIGATION_FAILED','reset',globalResetIndex);
          return reset(true,globalResetIndex);
        }
        for(let index=0;index<plan.length;index++){
          if(!await reviewActivate(index))return reviewFailure('REVIEW_NAVIGATION_FAILED','reset',index);
          const result=await reset(false,index);if(result)return result;
        }
        if(!await reviewActivate(0))return reviewFailure('REVIEW_NAVIGATION_FAILED','reset',0);
        return null;
      },
      recover:async(scope,index)=>{
        if(scope==='section'){
          if(!await reviewActivate(index)||availableActionControls('reset').length!==1)
            return reviewFailure('NATIVE_SECTION_RESET_UNAVAILABLE','reset',index,'verified section reset');
          const before=plan.map((_,i)=>reviewState(i));
          if(before.some(state=>!state))return reviewFailure('SCOPED_RESET_STATE_UNAVAILABLE','reset',index,'observable section states');
          const failure=await reset(false,index);if(failure)return failure;
          if(plan.some((_,i)=>i!==index&&JSON.stringify(reviewState(i))!==JSON.stringify(before[i])))
            return reviewFailure('SCOPED_RESET_CHANGED_OTHER_SECTION','reset',index,'other sections unchanged');
          op.recoveryScope='section';return null;
        }
        if(scope!=='all')return reviewFailure('UNSUPPORTED_RESET_SCOPE','reset',index);
        let globalIndex=null;
        for(let i=0;i<plan.length;i++){
          if(!await reviewActivate(i))return reviewFailure('REVIEW_NAVIGATION_FAILED','reset',i);
          if(i>0&&availableActionControls('reset_all').length===1)globalIndex=i;
        }
        if(globalIndex===null||!await reviewActivate(globalIndex))return reviewFailure('NATIVE_GLOBAL_RESET_UNAVAILABLE','reset',index,'verified global reset');
        const failure=await reset(true,globalIndex);if(!failure)op.recoveryScope='all';return failure;
      },
      activate:reviewActivate,empty:index=>{const empty=reviewEmpty(index);reviewLog('EMPTY_VERIFIED',{section:index,passed:empty});return empty;},
      verify:index=>{reviewLog('SECTION_VERIFY_START',{section:index,source:'dom',active:op.actual===index});
        const observed=stateSummary(index),passed=verify(index),verifiedQuestions=observed?.filter(q=>q.matchesExpected).length??0;
        reviewLog(passed?'SECTION_VERIFY_PASS':'SECTION_VERIFY_FAIL',{...(op.questions?.section===index?op.questions:{}),section:index,passed,
          expectedQuestions:plan[index].answers.length,verifiedQuestions,failed:plan[index].answers.length-verifiedQuestions,
          firstFailedQuestion:observed?observed.find(q=>!q.matchesExpected)?.position??null:0,observed});return passed;},
      failure:(reason,phase,index)=>{
        const observed=stateSummary(index),expectedQuestions=plan[index]?.answers.length??0,verifiedQuestions=observed?.filter(q=>q.matchesExpected).length??0;
        return {...reviewFailure(reason==='GROUP_FINAL_MISMATCH'?'SECTION_VERIFY_FAILED':reason,phase,index,phase==='reset'?'empty':plan[index]?.answers.map(a=>a.selectedIds?.length?a.selectedIds:a.answer)),
          questionCounts:{...(op.questions?.section===index?op.questions:{}),expectedQuestions,mappedControls:reviewLive()?.groups[index]?.bindings.length??0,
            verifiedQuestions,failed:expectedQuestions-verifiedQuestions,firstFailedQuestion:observed?observed.find(q=>!q.matchesExpected)?.position??null:0}};
      },
      solveGroup:async index=>{
        let currentPosition=-1;
        try{
        if(!current(index))return reviewFailure('ACTIVE_SCREEN_MISMATCH','solve',index);
        const initial=reviewState(index),already=verify(index);
        if(!initial)return reviewFailure('REVIEW_STATE_AMBIGUOUS','solve',index);
        const needed=initial.reduce((total,value,i)=>{
          const answer=plan[index].answers[i];
          if(Array.isArray(value))return total+(plan[index].kind==='checkbox'?
            new Set([...value,...answer.selectedIds].filter(id=>value.includes(id)!==answer.selectedIds.includes(id))).size:
            Number(value.length!==1||value[0]!==answer.selectedIds[0]));
          return total+Number(value!==answer.answer);
        },0);
        op.actions={section:index,attempted:0,acknowledged:0,needed};op.trigger='section:'+index;
        const live=reviewLive()?.groups[index];
        op.questions={section:index,expectedQuestions:plan[index].answers.length,mappedControls:live?.bindings.length??0,
          alreadyCorrect:0,corrected:0,failed:0,verifiedQuestions:0,firstFailedQuestion:null};
        if(op.questions.mappedControls!==op.questions.expectedQuestions)return reviewFailure('REVIEW_CONTROL_MAPPING_INCOMPLETE','solve',index);
        reviewLog('SECTION_START',{section:index});
        reviewLog('SECTION_SOLVER_PLANNED',{section:index,solver:plan[index].kind,qti:plan[index].filename,
          expectedResponses:plan[index].answers.length,mappedControls:live?.bindings.length??0,
          actualControls:live?.bindings.reduce((n,b)=>n+(b.items?.length||1),0)??0});
        reviewLog('RECONCILIATION_PLAN',{section:index,strategy:'state-reconcile',actionsNeeded:needed,currentState:stateSummary(index),
          expectedState:{responses:plan[index].answers.length}});
        for(let position=0;position<plan[index].answers.length;position++){
          currentPosition=position;
          if(!current(index))return reviewFailure('ACTIVE_SCREEN_MISMATCH','solve',index);
          const answer=plan[index].answers[position],group=()=>current(index)?reviewLive()?.groups[index]:null,binding=()=>group()?.bindings[position];
          const existing=reviewState(index)?.[position];
          if(existing===undefined||existing===null&&plan[index].kind!=='dropdown')return reviewFailure('REVIEW_STATE_AMBIGUOUS','solve',index);
          const matches=(value,expected)=>Array.isArray(value)?JSON.stringify(value.slice().sort())===JSON.stringify(expected.selectedIds.slice().sort()):value===expected.answer;
          if(index<4&&matches(existing,answer)){op.questions.alreadyCorrect++;op.questions.verifiedQuestions++;continue;}
          const perform=async()=>{
          reviewLog('SOLVER_DISPATCH',{section:index,question:position,solver:plan[index].kind});
          let result;
          if(plan[index].kind==='choice'||plan[index].kind==='checkbox'){
            const ids=group().questions[position].choiceIds;
            const activate=async id=>{
              const item=binding()?.items.find(x=>x.id===id);if(!item||!actionable(item.node))throw Error('Review choice disappeared');
              const state=reviewState(index)?.[position];if(!state)throw Error('Review choice state unavailable');
              const intended=!state.includes(id),target=item.node.querySelector(plan[index].kind==='checkbox'?'.is-checkbox__icon':'.is-radiobutton__icon');
              if(!target||!actionable(target))throw Error('Review choice target unavailable');
              op.trigger='section:'+index+':choice';actionStart(index,position,plan[index].kind);target.click();
              if(!await reviewPoll(()=>{const selected=reviewState(index)?.[position];return selected&&selected.includes(id)===intended;}))throw Error('Review choice transition unconfirmed');
              actionCommit(index,position,plan[index].kind);
            };
            result=await globalThis.SparkSolvers.solve(plan[index].kind,{
              ids,single:plan[index].kind==='choice',wait,
              checked:id=>reviewState(index)?.[position]?.includes(id),activate,
              read:()=>{const state=current(index)?reviewState(index)?.[position]:null;return state?new Map(ids.map(id=>[id,state.includes(id)])):null;}
            },answer);
          }else if(plan[index].kind==='text')result=await globalThis.SparkSolvers.solve('text',{
            write:async value=>{const node=binding()?.node;if(!node||!actionable(node))throw Error('Review gap disappeared');
              op.trigger='section:'+index+':text';actionStart(index,position,'text');setText(node,value);
              if(!await reviewPoll(()=>reviewState(index)?.[position]===value))throw Error('Review text transition unconfirmed');actionCommit(index,position,'text');},
            matches:value=>reviewState(index)?.[position]===value
          },answer);
          else result=await globalThis.SparkSolvers.solve('dropdown',{
            hasOption:value=>group()?.questions[position].options.filter(o=>o===value).length===1,
            select:async value=>{
              let node=binding()?.node;if(!node||!actionable(node))throw Error('Review dropdown disappeared');
              if(node.matches('select')){
                const option=[...node.options].filter(o=>tidy(o.textContent)===value);if(option.length!==1)throw Error('Review option ambiguous');
                  op.trigger='section:'+index+':dropdown';actionStart(index,position,'dropdown');
                  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'selectedIndex').set.call(node,[...node.options].indexOf(option[0]));
                node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));
              }else{
                const button=node.matches('[role="combobox"]')?node:node.querySelector('button[role="combobox"],[data-event="toggle"]');
                if(!button||!actionable(button))throw Error('Review dropdown handle missing');
                if(button.getAttribute('aria-expanded')!=='true')button.click();
                if(!await reviewPoll(()=>{node=binding()?.node;return node&&optionNodes(node).some(o=>tidy(o.textContent)===value&&actionable(o));}))throw Error('Review dropdown options unavailable');
                  const options=optionNodes(binding().node).filter(o=>tidy(o.textContent)===value&&actionable(o));if(options.length!==1)throw Error('Review dropdown option ambiguous');
                  op.trigger='section:'+index+':dropdown';actionStart(index,position,'dropdown');options[0].click();
              }
                if(!await reviewPoll(()=>{
                  const currentNode=binding()?.node,handle=currentNode?.matches('[role="combobox"]')?currentNode:currentNode?.querySelector('[role="combobox"]');
                  return reviewState(index)?.[position]===value&&(node.matches('select')||handle?.getAttribute('aria-expanded')!=='true');
                }))
                  throw Error('Review dropdown transition unconfirmed');actionCommit(index,position,'dropdown');
            },matches:value=>reviewState(index)?.[position]===value
          },answer);
          return result;
          };
          let question;
          if(index>=4){
            const attemptedBefore=op.actions.attempted,committedBefore=op.actions.acknowledged;
            question=await globalThis.SparkSolvers.checkAndReconcile(existing,answer,{replace:true},{matches,
              isEmpty:value=>Array.isArray(value)?value.length===0:value===null||value==='',
              apply:perform,read:()=>current(index)?reviewState(index)?.[position]:undefined,
              onStage:(stage,data)=>reviewLog(stage,{section:index,question:position,interaction:plan[index].kind,...data,
                actionAttempted:op.actions.attempted>attemptedBefore,actionCommitted:op.actions.acknowledged>committedBefore})});
          }else{
            const result=await perform();question={status:result.status==='filled'&&current(index)&&matches(reviewState(index)?.[position],answer)?'Corrected':'Failed',reason:result.detail};
          }
          if(question.status==='ResetRequired')return {status:'recovery',scope:question.scope,group:index,question:position};
          if(question.status==='Failed'||!current(index)){
            op.questions.failed++;op.questions.firstFailedQuestion=position;
            if(op.actions.attempted===0)reviewLog('SECTION_ZERO_ACTIONS',{section:index,question:position,attempted:0,acknowledged:0});
            reviewLog('SECTION_VERIFY_FAIL',{section:index,...op.questions,observed:stateSummary(index),attempted:op.actions.attempted,acknowledged:op.actions.acknowledged});
            const dropdownReason=plan[index].kind==='dropdown'?(question.reason==='OPTION_NOT_UNIQUE'?'OPTION_AMBIGUOUS':
              question.reason==='ACTION_EXCEPTION'||question.reason==='QUESTION_MISMATCH'||question.reason==='SELECTION_NOT_VERIFIED'?'STATE_NOT_COMMITTED':null):null;
            return {...reviewFailure(dropdownReason||question.reason||'QUESTION_UNVERIFIED','solve',index,answer),question:position,questionCounts:{...op.questions},...(question.error?{error:question.error}:{})};
          }
          if(question.status==='AlreadyCorrect')op.questions.alreadyCorrect++;else op.questions.corrected++;
          op.questions.verifiedQuestions++;
        }
        if(op.questions.verifiedQuestions!==op.questions.expectedQuestions)return reviewFailure('SECTION_QUESTION_COUNT_MISMATCH','solve',index);
        if((op.actions.attempted===0&&(!already||!verify(index)))||op.actions.acknowledged!==op.actions.attempted){reviewLog('SECTION_ZERO_ACTIONS',{section:index,attempted:op.actions.attempted,acknowledged:op.actions.acknowledged});
          reviewLog('SECTION_VERIFY_FAIL',{section:index,observed:stateSummary(index)});return reviewFailure('SECTION_ACTIONS_UNVERIFIED','solve',index);}
        return null;
        }catch(error){if(currentPosition>=0&&op.questions?.section===index){op.questions.failed++;op.questions.firstFailedQuestion=currentPosition;}
          reviewLog('SECTION_VERIFY_FAIL',{section:index,...(op.questions?.section===index?op.questions:{}),observed:stateSummary(index),attempted:op.actions?.attempted??0,acknowledged:op.actions?.acknowledged??0});
          return {...reviewFailure('REVIEW_GROUP_EXCEPTION','solve',index,plan[index].answers),question:currentPosition>=0?currentPosition:null,
            questionCounts:op.questions?.section===index?{...op.questions}:undefined,error:String(error?.message||error)};}
      }
    },{});
    if(outcome.status==='filled')Object.assign(outcome,{responsesVerified:plan.reduce((n,g)=>n+g.answers.length,0),
      resetMechanism:op.recoveryScope==='all'?'reset_all':op.recoveryScope==='section'?'reset':reconcile?'none':resetKind==='all'?'reset_all':'reset'});
    if(outcome.status==='filled')lastScan.applied.set('q1',supplied[0].answer);else lastScan.applied.delete('q1');
    reviewLog(outcome.status==='filled'?'VERIFY_FINAL_ALL_PASS':'SOLVE_FAILED',{reason:outcome.reason||null});
    return [{id:'q1',...outcome,operationId:op.operationId,reviewDiagnostics:{operationId:op.operationId,events:op.events}}];
    }catch(error){return [{id:'q1',...reviewFailure('SECTION_SOLVE_FAILED',op.phase,op.intended??0),error:String(error?.message||error)}];}
    finally{observer.disconnect();document.removeEventListener('click',controlEvent,true);document.removeEventListener('keyup',controlEvent,true);op.finished=true;reviewOperation=null;}
  }
  function scan(){
    const questions=[],refs=new Map();
    const root=activeContentRoot();
    const title=exerciseTitle();
    const review=scanReview(title);if(review)return review;
    const markingRoots=[...root.querySelectorAll(markingSelector)].filter(n=>!n.closest('[hidden],[inert]'));
    if(markingRoots.length){
      const live=markingSnapshot(),screen=screenInfo(root),id='q1';
      const usable=Boolean(live&&[...live.buttons,live.erase,live.option].every(actionable));
      questions.push({id,kind:'pronunciation',context:live?.groups.map(g=>g.join('')).join(' | ')||'',options:[],
        rubric:'',applyable:usable,markingGroups:live?.groups||[],markingColor:live?.color||'',
        ...(usable?{}:{diagnostic:'UNSUPPORTED: ambiguous marking segments or controls.'})});
      if(usable)refs.set(id,{kind:'pronunciation'});
      lastScan={title,questions,refs,activeRoot:root,applied:new Map(),appliedChoiceIds:new Map(),appliedOrder:new Map(),
        trustedMarking:new Map(),submitted:false,screenIndex:screen.index,screenCount:screen.count};
      return {title,questions,screenIndex:screen.index,screenCount:screen.count,hasExercise:true,frameUrl:location.origin+location.pathname};
    }
    const deferredCategory=/\|\s*(?:speaking|writing(?: skill)?)\s*\|/i.test(title);
    const rubric=tidy(root.querySelector('.layout__rubric')?.textContent ||
      document.querySelector('.layout__rubric')?.textContent).slice(0,500);
    const blocks=[...root.querySelectorAll('.layout__content .contentblock,.interaction .contentblock')]
      .filter((n,i,a)=>a.indexOf(n)===i);
    const bank=findWordBank(root,blocks,rubric);
    const sourceBlocks=blocks.length?blocks.filter(b=>b!==bank.block):
      [...root.querySelectorAll('.layout__content .interaction')].slice(0,3);
    // These widgets can sit outside contentblock, including on Writing screens.
    const checkboxWidgets=[...root.querySelectorAll('.interaction.is-checkbox')]
      .filter(node=>!node.closest('[hidden],[inert]'));
    const linkingWidgets=[...root.querySelectorAll('.interaction.is-linking-lines')]
      .filter(node=>!node.closest('[hidden],[inert]'));
    if(checkboxWidgets.length || linkingWidgets.length){
      const screen=screenInfo(root),id='q1';
      if(checkboxWidgets.length===1 && linkingWidgets.length===0){
        const widget=checkboxWidgets[0],group=choiceGroup(widget);
        const usable=group?.kind==='multi' && group.items.length>=2 &&
          widget.querySelectorAll('[role="checkbox"]').length===group.items.length;
        const context=tidy(widget.textContent).slice(0,1200);
        questions.push({id,kind:'checkbox',context,localContext:context,
          options:usable?group.options:[],choiceIds:usable?group.choiceIds:[],
          choiceLabelsVerified:usable?group.choiceLabelsVerified:false,
          rubric,wordBank:'',block:1,position:1,applyable:Boolean(usable),
          ...(usable?{}:{diagnostic:'Checkbox controls lack unique verified QTI identifiers.'})});
        if(usable)refs.set(id,{kind:'checkbox',node:widget,choiceIds:group.choiceIds.slice(),
          choiceLabels:new Map(group.items.map(item=>[item.id,item.label]))});
      }else{
        const widget=linkingWidgets.length===1&&checkboxWidgets.length===0?linkingWidgets[0]:null;
        const handles=widget?[...widget.querySelectorAll('.isLinkingMultipleLines__handle')]:[];
        const right=handles.filter(h=>h.classList.contains('right_handle'));
        const left=handles.filter(h=>h.classList.contains('left_handle'));
        const endpoints=linkingEndpoints(widget);
        if(endpoints)refs.set(id,{kind:'linkingLines',node:widget});
        const context=tidy(widget?.textContent||rubric).slice(0,1200);
        questions.push({id,kind:'linkingLines',context,localContext:context,options:[],
          rubric,wordBank:'',block:1,position:1,applyable:Boolean(endpoints),
          linkingSources:endpoints?.sources.map(e=>e.label)||[],
          linkingTargets:endpoints?.targets.map(e=>e.label)||[],
          linkingDiagnostics:{rightHandles:right.length,leftHandles:left.length,
            linkedRight:right.filter(h=>h.classList.contains('linked')).length,
            linkedLeft:left.filter(h=>h.classList.contains('linked')).length,
            pairIdentityVerified:false,
            stateVerification:'unavailable',
            missingEvidence:endpoints?['final-pair-verification']:['qti-endpoint-dom-mapping','final-pair-verification'],
            reason:widget?(endpoints?'Unique cell labels available; QTI mapping required.':
              'Endpoint cells lack unique labels for QTI mapping.'):'Ambiguous interaction roots.'}});
      }
      lastScan={title,questions,refs,applied:new Map(),appliedChoiceIds:new Map(),
        appliedOrder:new Map(),submitted:false,screenIndex:screen.index,screenCount:screen.count,
        activeRoot:root,trustedCorrections:new Map(),trustedWordPool:new Map(),trustedCheckbox:new Map()};
      return {title,questions,screenIndex:screen.index,screenCount:screen.count,
        frameUrl:location.origin+location.pathname,hasExercise:true};
    }
    // Spark's published gapMatchInteraction drives om-text-gap. Its drag/drop
    // widget also supports the native two-click flow: choose phrase, click gap.
    // Restrict to ONE visible interaction with independently identifiable
    // targets; other matching/association activities remain manual.
    const wordPool=root.querySelector('.interaction.om-text-gap .gap_match_view');
    const poolWidget=wordPool?.closest('.interaction.om-text-gap');
    if(poolWidget && !root.querySelector('textarea,[contenteditable="true"]')){
      const pool=[...wordPool.querySelectorAll('.om-text-gap__pool-item')];
      const gaps=[...wordPool.querySelectorAll('.om-text-gap__target-item')];
      if(gaps.length>=1 && pool.length<=60 && gaps.length<=60){
        const remaining=pool.map(wordPoolLabel).filter(Boolean);
        const placed=gaps.map(wordPoolGapText).filter(Boolean);
        // Spark may move tiles out of the pool or retain a visible bank copy.
        // Preserve both observed multiset possibilities and let QTI validate
        // the full bank, including duplicate phrase multiplicities.
        const labels=remaining.concat(placed);
        const bankAlternatives=placed.length&&remaining.length?[remaining]:[];
        // Occupied Spark gaps replace the numbered placeholder with the tile.
        // Retain their passage order and bind subsequent checks to the gap model.
        const modelIds=gaps.map(gap=>gap.getAttribute('data-model-id'));
        const stableModels=modelIds.every(Boolean)&&new Set(modelIds).size===gaps.length;
        const ordinals=gaps.map((gap,i)=>wordPoolOrdinal(gap,gaps.length)||
          (stableModels&&wordPoolSourceCard(gap)?i+1:null));
        const explicitIds=gaps.map(gap=>wordPoolQtiId(gap,'target'));
        const explicit=explicitIds.every(Boolean)&&new Set(explicitIds).size===gaps.length;
        const ordinal=ordinals.every(Boolean)&&new Set(ordinals).size===gaps.length;
        const identified=explicit||(!explicitIds.some(Boolean)&&ordinal);
        const passage=poolWidget.querySelector('.contentblock')?.cloneNode(true);
        passage?.querySelectorAll('.om-text-gap__draggable,.om-text-gap__droppable-placeholder').forEach(el=>el.remove());
        const id='q1',context=tidy(labels.join(' ')+' '+(passage?.textContent||'')).slice(0,2000);
        questions.push({id,kind:'gapWordPool',context,localContext:context,options:[],
          poolLabels:labels,wordPoolBankAlternatives:bankAlternatives,
          gapCount:gaps.length,rubric,wordBank:labels.join(' | '),
          hint:'',before:'',after:'',block:1,position:1,
          applyable:identified&&labels.length>=2});
        if(identified&&labels.length>=2)
          refs.set(id,{kind:'gapWordPool',node:poolWidget,
            targets:gaps.map((node,i)=>({node,ordinal:ordinals[i],qtiId:explicitIds[i],
              modelId:stableModels?modelIds[i]:null}))});
        const screen=screenInfo(root);
        lastScan={title,questions,refs,applied:new Map(),appliedChoiceIds:new Map(),
          appliedOrder:new Map(),appliedWordPool:new Map(),submitted:false,screenIndex:screen.index,
          screenCount:screen.count,activeRoot:root,trustedCorrections:new Map(),trustedWordPool:new Map()};
        return {title,questions,screenIndex:screen.index,screenCount:screen.count,
          frameUrl:location.origin+location.pathname,hasExercise:true};
      }
    }
    // A specific, answer-keyed word-correction activity is eligible even in
    // Writing skill. Essay/extended writing remains excluded.
    const correctionRoots=[...root.querySelectorAll('.interaction.ic-text-correction.replace')].filter(visible);
    if(correctionRoots.length){
      const snapshot=correctionSnapshot(),id='q1',tiles=snapshot?.tokens||[],screen=screenInfo(root);
      const usable=Boolean(snapshot&&tiles.every(visible));
      questions.push({id,kind:'textCorrection',context:tidy(snapshot?.root.textContent).slice(0,1800),
        localContext:tidy(snapshot?.root.textContent).slice(0,1800),options:[],
        correctionGroups:snapshot?.groups.map(group=>group.map(t=>t.textContent))||[],
        correctionTokens:tiles.map(t=>t.textContent),
        correctionModifiedTokens:tiles.filter(t=>t.matches('.modified,.icTextCorrection__item--modified')).map(t=>t.textContent),
        correctionModifiedIndices:tiles.flatMap((t,i)=>t.matches('.modified,.icTextCorrection__item--modified')?[i]:[]),
        rubric,wordBank:'',hint:'',before:'',after:'',block:1,position:1,applyable:usable,
        ...(usable?{}:{diagnostic:'UNSUPPORTED: correction sentences or tokens are ambiguous.'})});
      if(usable)refs.set(id,{kind:'textCorrection',node:snapshot.root});
      lastScan={title,questions,refs,applied:new Map(),appliedChoiceIds:new Map(),appliedOrder:new Map(),
        submitted:false,screenIndex:screen.index,screenCount:screen.count,activeRoot:root,trustedCorrections:new Map()};
      return {title,questions,screenIndex:screen.index,screenCount:screen.count,frameUrl:location.origin+location.pathname,hasExercise:true};
    }
    const hasEditable=sourceBlocks.some(b=>getControls(b).length||(!deferredCategory&&choiceGroup(b)));
    const hasSequence=sourceBlocks.some(b=>b.closest('.os-sequence')||b.querySelector('.os-sequence__list'));
    for(let b=0;b<sourceBlocks.length;b++){
      const block=sourceBlocks[b];
      const group=deferredCategory?null:choiceGroup(block);
      if(group){
        const id=`q${questions.length+1}`;
        const question={id,kind:group.kind,context:tidy(block.innerText||block.textContent).slice(0,1200),
          localContext:tidy(block.innerText||block.textContent).slice(0,1200),options:group.options,
          choiceIds:group.choiceIds,choiceLabelsVerified:group.choiceLabelsVerified,rubric,wordBank:bank.text,hint:'',before:'',after:'',
          block:b+1,position:1,applyable:true};
        questions.push(question);
        refs.set(id,{kind:group.kind,items:group.items});
        continue;
      }
      const controls=getControls(block);
      if((hasEditable||hasSequence)&&!controls.length && !block.closest('.os-sequence') && !block.querySelector('.os-sequence__list'))continue; // e.g. static vocabulary reference before text gaps
      const context=formatBlock(block,controls);
      if(!context)continue;
      if(controls.length){
        controls.forEach((node,index)=>{
          const id=`q${questions.length+1}`,kind=getKind(node),extra=around(context,index);
          const localContext=context.replace(/\[\[\d+\]\]/g, token=>
            token===`[[${index+1}]]`?'[[1]]':'[other gap]');
          const options=kind==='dropdown'?getOptions(node):[];
          questions.push({id,kind,context,localContext,options,rubric,wordBank:bank.text,
            hint:extra.hint,before:extra.before,after:extra.after,
            block:b+1,position:index+1,applyable:true});
          refs.set(id,{node,kind,options});
        });
      }else{
        const id=`q${questions.length+1}`;
        const isMatch=Boolean(block.matches('.gap_match_view,.om-text-gap,.ll_view')||block.closest('.gap_match_view,.om-text-gap,.ll_view')||block.querySelector('.gap_match_view,.om-text-gap,.ll_view'));
        const sequence=block.closest('.interaction.os-sequence')||block.querySelector('.interaction.os-sequence');
        const tiles=sequence?[...sequence.querySelectorAll('li.os-sequence-element')].map(tile=>
          tidy(tile.querySelector('.firstword')?.textContent||tile.innerText||tile.textContent)).filter(Boolean):[];
        const isOrder=Boolean(sequence && tiles.length>=2) || /sequence\s*\d/i.test(context)||/\b(order|unscramble|reorder)\b/i.test(rubric);
        const isCorrection=/\b(correction|correct|mistake|error)\b/i.test(rubric)||/grammar\s*1\s*\|\s*1/i.test(title);
        questions.push({id,kind:isMatch?'match':isOrder?'order':isCorrection?'correction':'manual',
          context,options:[],rubric,wordBank:bank.text,hint:'',before:'',after:'',
          ...(isOrder&&tiles.length?{orderTokens:tiles}:{}),
          block:b+1,position:1,applyable:Boolean(isOrder && sequence && sequence.querySelector('.os-sequence__list'))});
        if(isOrder && sequence && sequence.querySelector('.os-sequence__list')) refs.set(id,{kind:'order',node:sequence});
      }
    }
    const screenMatch=(root.id||'').match(/content_wrap_(\d+)/);
    const screenIndex=screenMatch?Number(screenMatch[1]):0;
    const screenRoots=[...document.querySelectorAll('.content-wrap[id^="content_wrap_"]')];
    const indices=screenRoots.map(el=>Number(el.id.match(/^content_wrap_(\d+)$/)?.[1]));
    const reliableScreens=indices.length>1 && indices.every(Number.isInteger) &&
      new Set(indices).size===indices.length && Math.min(...indices)===0 &&
      Math.max(...indices)===indices.length-1;
    const screenCount=reliableScreens?indices.length:null;
    lastScan={title,questions,refs,applied:new Map(),appliedChoiceIds:new Map(),appliedOrder:new Map(),submitted:false,screenIndex,screenCount,activeRoot:root,trustedCorrections:new Map()};
    return {title,questions,screenIndex,screenCount,frameUrl:location.origin+location.pathname,hasExercise:questions.length>0};
  }
  // Read the complete, *currently visible* exercise as a learner sees it.
  // Never copy typed answers, XML correctResponse data, tokens, or hidden screens.
  function copyPrompt() {
    const root=activeContentRoot();
    const title=exerciseTitle();
    const rubric=tidy(root.querySelector('.layout__rubric')?.textContent ||
      document.querySelector('.layout__rubric')?.textContent);
    const blocks=[...root.querySelectorAll('.layout__content .contentblock,.interaction .contentblock')]
      .filter((block,index,array)=>array.indexOf(block)===index);
    const bank=findWordBank(root,blocks,rubric);
    const relevant=blocks.filter(block=>block!==bank.block);
    const lines=[title];
    if(rubric)lines.push('',`Instructions: ${rubric}`);
    if(bank.text)lines.push('',`Word bank: ${bank.text}`);
    let number=0;
    for(const block of relevant) {
      const controls=getControls(block);
      const group=choiceGroup(block);
      const formatted=formatBlock(block,controls)
        .replace(/\[\[\d+\]\]/g,'[____]');
      if(!formatted)continue;
      number++;
      const printed=tidy(block.querySelector('.enum')?.textContent)||String(number);
      lines.push('',`${/^\d+\.?$/.test(printed)?printed.replace(/\.$/,''):number}. ${formatted}`);
      if(group?.options.length)lines.push(`Options: ${group.options.join(' | ')}`);
      const orderTiles=block.closest('.os-sequence')?.querySelectorAll('li.os-sequence-element');
      if(orderTiles?.length)lines.push(`Tiles: ${[...orderTiles].map(n=>tidy(n.querySelector('.firstword')?.textContent||n.innerText||n.textContent)).join(' | ')}`);
      else {
        for(const [index,node] of controls.entries()) {
          const options=getOptions(node);
          if(options.length)lines.push(`Gap ${index+1} options: ${options.join(' | ')}`);
        }
      }
    }
    return {title,screenIndex:Number((root.id||'').match(/content_wrap_(\d+)/)?.[1]||0),
      questionBlocks:number,text:lines.join('\n').trim()};
  }

  function linkingEndpoints(widget){
    if(!widget)return null;
    const handles=[...widget.querySelectorAll('button.isLinkingMultipleLines__handle')];
    const endpoints=handles.map(handle=>{
      const cell=handle.closest('td');
      return {handle,label:tidy(cell?.textContent),side:handle.classList.contains('right_handle')?'source':
        handle.classList.contains('left_handle')?'target':null,
        valid:cell?.querySelectorAll('button.isLinkingMultipleLines__handle').length===1};
    });
    if(!endpoints.length||endpoints.some(e=>!e.valid||!e.side||!e.label)||
       new Set(endpoints.map(e=>normalized(e.label))).size!==endpoints.length)return null;
    const sources=endpoints.filter(e=>e.side==='source'),targets=endpoints.filter(e=>e.side==='target');
    return sources.length>=2&&sources.length===targets.length?{sources,targets}:null;
  }
  function mapQtiAndRemember(source,questions){
    const result=globalThis.SparkQTI.fromDataJs(source,questions,new DOMParser());
    if(questions.length===1&&['pronunciation','textCorrection'].includes(questions[0].kind)&&!result.answers.length)
      result.reason='UNSUPPORTED';
    lastScan.trustedCorrections=new Map();
    lastScan.trustedCorrectionOriginals=new Map();
    lastScan.trustedWordPool=new Map();
    lastScan.trustedCheckbox=new Map();
    lastScan.trustedLinking=new Map();
    lastScan.trustedMarking=new Map();
    lastScan.trustedReview=null;
    for(const answer of result.answers||[]){
      const question=questions.find(q=>q.id===answer.id);
      if(question?.kind==='review'&&answer.source==='qti'&&answer.reviewVerified)lastScan.trustedReview=JSON.parse(JSON.stringify(answer.groups));
      if(question?.kind==='pronunciation'&&answer.markingVerified&&answer.source==='qti')
        lastScan.trustedMarking.set(answer.id,answer.targets.map(t=>({...t})));
      if(question?.kind==='linkingLines'&&answer.linkingVerified&&answer.source==='qti')
        lastScan.trustedLinking.set(answer.id,answer.pairs.map(p=>({...p})));
      if(question?.kind==='checkbox' && answer.source==='qti' &&
         Array.isArray(answer.selectedIds) && answer.selectedIds.length &&
         answer.selectedIds.every(id=>question.choiceIds.includes(id)) &&
         new Set(answer.selectedIds).size===answer.selectedIds.length)
        lastScan.trustedCheckbox.set(answer.id,answer.selectedIds.slice());
      if(questions.find(q=>q.id===answer.id)?.kind==='gapWordPool' &&
        answer.wordPoolVerified && Array.isArray(answer.pairs))
        lastScan.trustedWordPool.set(answer.id,answer.pairs.map(({sourceId,targetId,source,targetIndex,labelAmbiguous})=>
          ({sourceId,targetId,source,targetIndex,labelAmbiguous})));

      if(questions.find(q=>q.id===answer.id)?.kind==='textCorrection' &&
        Array.isArray(answer.corrections)&&answer.corrections.length){
        lastScan.trustedCorrections.set(answer.id,answer.corrections.map(e=>({...e,alternatives:e.alternatives?.slice()})));
        if(Array.isArray(answer.originals))lastScan.trustedCorrectionOriginals.set(answer.id,answer.originals.map(o=>({...o})));
      }
    }
    return result;
  }
  async function readQTI(expectedIds) {
    const questions = lastScan.questions;
    if (!questions.length || !Array.isArray(expectedIds) ||
      questions.length !== expectedIds.length ||
      questions.some((q,i)=>q.id!==expectedIds[i])) {
      return {answers:[],reason:'staleScan'};
    }
    const script = [...document.querySelectorAll('script[src]')].find(el=>{
      try{return new URL(el.src).pathname.endsWith('/data.js');}catch{return false;}
    });
    if(/\|\s*(?:speaking|writing(?: skill)?)\s*\|/i.test(lastScan.title) &&
      !(questions.length===1&&['textCorrection','gapWordPool','checkbox','linkingLines','pronunciation'].includes(questions[0].kind)))
      return {answers:[],reason:'deferredCategory'};
    if(!script || !globalThis.SparkQTI)return {answers:[],reason:'noDataScript'};
    const url = new URL(script.src);
    // Never load other origins or user-supplied endpoints.
    if(url.origin!==location.origin || !/^\/cdn_proxy\//.test(url.pathname))return {answers:[],reason:'invalidDataOrigin'};
    if(qtiCache?.url===url.href && qtiCache?.source){
      return mapQtiAndRemember(qtiCache.source,questions);
    }
    if(!qtiPending){
      qtiPending=(async()=>{
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),4000);
        try {
          const response=await fetch(url.href,{credentials:'same-origin',cache:'force-cache',signal:controller.signal});
          if(!response.ok)return null;
          const declaredLength=Number(response.headers.get('content-length')||0);
          if(declaredLength>globalThis.SparkQTI.MAX_SOURCE)return null;
          const source=await response.text();
          return source.length<=globalThis.SparkQTI.MAX_SOURCE?source:null;
        } finally {clearTimeout(timer);}
      })().finally(()=>{qtiPending=null;});
    }
    const source=await qtiPending;
    if(!source)return {answers:[],reason:'dataUnavailable'};
    qtiCache={url:url.href,source};
    return mapQtiAndRemember(source,questions);
  }
  function setText(el, value) {
    el.focus();
    if (el.matches('input,textarea')) {
      const proto = el.matches('textarea') ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if (nativeSetter) nativeSetter.call(el,value); else el.value = value;
    } else if (el.isContentEditable) {
      el.textContent = value;
    } else return false;
    el.dispatchEvent(new InputEvent('input', {bubbles:true,inputType:'insertText',data:value}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.blur();
    return el.matches('input,textarea') ? el.value === value : tidy(el.textContent) === tidy(value);
  }
  const wait = ms => new Promise(r => setTimeout(r,ms));
  async function setDropdown(el, answer) {
    let selectedOption=null,button=null;
    return globalThis.SparkSolvers.solve('dropdown',{
      hasOption:value=>getOptions(el).filter(option=>normalized(option)===normalized(value)).length===1,
      select:async value=>{
        if(el.matches('select')){
          selectedOption=[...el.options].find(option=>normalized(option.textContent)===normalized(value));
          const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')?.set;
          if(setter)setter.call(el,selectedOption.value);else el.value=selectedOption.value;
          el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
          return;
        }
        button=el.matches('[role="combobox"]')?el:el.querySelector('[role="combobox"],button[data-event="toggle"]');
        selectedOption=optionNodes(el).find(option=>normalized(option.textContent)===normalized(value));
        if(!button||!selectedOption)throw Error('Dropdown controls unavailable.');
        if(normalized(button.textContent)===normalized(value))return;
        button.click();await wait(100);selectedOption.click();await wait(160);
      },
      matches:value=>el.matches('select')?el.value===selectedOption?.value:
        !!button&&(normalized(button.textContent).includes(normalized(value))||
          selectedOption?.getAttribute('aria-selected')==='true'||selectedOption?.classList.contains('selected')||selectedOption?.classList.contains('is-selected'))
    },{answer});
  }
  function isChecked(node){
    const input=node.querySelector('input[type="checkbox"],input[type="radio"]');
    return node.hasAttribute('aria-checked') ? node.getAttribute('aria-checked')==='true' : Boolean(input?.checked);
  }
  // Read live controls on every pass: Spark can replace both the item and widget.
  function checkboxState(ref){
    if(activeContentRoot()!==lastScan.activeRoot||exerciseTitle()!==lastScan.title)return null;
    const expectedIds=ref.choiceIds;
    const widgets=[...lastScan.activeRoot.querySelectorAll('.interaction.is-checkbox')]
      .filter(el=>!el.closest('[hidden],[inert]'));
    if(widgets.length!==1)return null;
    const widget=widgets[0],group=choiceGroup(widget);
    if(group?.kind!=='multi'||group.items.length!==expectedIds.length||
       widget.querySelectorAll('[role="checkbox"]').length!==group.items.length||
       group.items.some(item=>!expectedIds.includes(item.id)||
         normalized(item.label)!==normalized(ref.choiceLabels.get(item.id))))return null;
    const checked=new Map();
    for(const item of group.items){
      const aria=item.node.getAttribute('aria-checked');
      if(aria!=='true'&&aria!=='false')return null;
      const value=aria==='true',input=item.node.querySelector('input[type="checkbox"]');
      if(input&&input.checked!==value)return null;
      if(item.node.classList.contains('input-checkbox-checked')!==value)return null;
      checked.set(item.id,value);
    }
    return {widget,group,checked};
  }
  async function setCheckbox(ref,expected){
    return globalThis.SparkSolvers.solve('checkbox',{
      ids:ref.choiceIds,wait,
      read:()=>checkboxState(ref)?.checked||null,
      accept:()=>{ref.node=checkboxState(ref).widget;},
      activate:id=>{
        const current=checkboxState(ref);
        const item=current?.group.items.find(item=>item.id===id);
        if(!item)throw Error('Checkbox identity changed.');
        (item.node.querySelector('.is-checkbox__icon')||item.node).click();
      }
    },{selectedIds:expected});
  }
  async function setChoice(group,answer,selectedIds){
    const parts=Array.isArray(selectedIds)&&selectedIds.length?selectedIds:
      String(answer).split(' | ').map(tidy).filter(Boolean).map(label=>{
        const hits=group.items.filter(item=>normalized(item.label)===normalized(label));
        return hits.length===1?hits[0].id:'';
      });
    if(!parts.length||parts.some(id=>!id)||new Set(parts).size!==parts.length||
      parts.some(id=>!group.items.some(x=>x.id===id))||
      (group.kind==='choice'&&parts.length!==1))
      return {status:'skipped',detail:'QTI choice identifiers do not match visible controls.'};
    return globalThis.SparkSolvers.solve(group.kind,{
      ids:group.items.map(item=>item.id),single:group.kind==='choice',
      checked:id=>isChecked(group.items.find(item=>item.id===id).node),
      activate:async id=>{group.items.find(item=>item.id===id).node.click();await wait(group.kind==='choice'?100:90);}
    },{selectedIds:parts});
  }
  // Experimental Avallain sequence adapter. The widget can settle later than
  // the mouseup event, especially in long horizontal word sequences. Never
  // reorder DOM directly or assume a synthetic drag was persisted by Spark.
  const sequenceTiles = root => [...root.querySelectorAll('.os-sequence__list > li.os-sequence-element')]
    .filter(el => !el.classList.contains('ui-draggable-dragging'));
  const tileText = el => tidy(el.querySelector('.firstword')?.textContent || el.innerText || el.textContent);
  const sameWords = (a,b) => a.length===b.length &&
    a.map(normalized).sort().join('\0')===b.map(normalized).sort().join('\0');
  const sequenceWords = root => sequenceTiles(root).map(tileText);
  async function dragSequenceTile(source,target,before) {
    if(!source.isConnected || !target.isConnected || source===target)return false;
    if(source.classList.contains('ui-draggable-disabled') || target.classList.contains('ui-draggable-disabled'))return false;
    const a=source.getBoundingClientRect(),b=target.getBoundingClientRect();
    if(!a.width||!a.height||!b.width||!b.height)return false;
    const view=source.ownerDocument.defaultView;
    const x0=a.left+a.width/2,y0=a.top+a.height/2;
    const x1=before?b.left+b.width*.22:b.right-b.width*.22,y1=b.top+b.height/2;
    const send=(el,type,x,y,buttons)=>el.dispatchEvent(new view.MouseEvent(type,{
      bubbles:true,cancelable:true,view,button:0,buttons,clientX:x,clientY:y}));
    send(source,'mouseover',x0,y0,0);
    send(source,'mousedown',x0,y0,1);
    for(let i=1;i<=18;i++){
      const t=i/18,x=x0+(x1-x0)*t,y=y0+(y1-y0)*t;
      const hit=source.ownerDocument.elementFromPoint(x,y)||target;
      send(hit,'mousemove',x,y,1);
      await wait(24);
    }
    send(source.ownerDocument.elementFromPoint(x1,y1)||target,'mouseup',x1,y1,0);
    return true;
  }
  async function setSequence(root,response) {
    const lists=[...root.querySelectorAll('.os-sequence__list')];
    const list=lists[0];
    return globalThis.SparkSolvers.solve('order',{
      tidy,normalized,tileText,sameWords,wait,
      uniqueList:()=>lists.length===1,
      tiles:()=>list?[...list.children].filter(el=>el.matches('li.os-sequence-element')&&!el.classList.contains('ui-draggable-dragging')):[],
      fixed:el=>el.classList.contains('ui-draggable-disabled'),
      pending:()=>!!list?.querySelector('.ui-draggable-dragging,.drop-placeholder'),
      identity:el=>el.getAttribute('data-model-id')||el.id||tileText(el),
      drag:dragSequenceTile
    },response);
  }
  // Recorded in Spark Inspector v3.3: clicking an inline token opens a
  // .tc_popup with a native input and an <a.button-submit>OK</a>. The OK click
  // commits the change to Spark's widget model; Enter alone does not.
  const visible=node=>{
    if(!node?.isConnected || node.closest('[hidden],[inert]'))return false;
    const style=getComputedStyle(node);
    return style.display!=='none'&&style.visibility!=='hidden'&&node.getClientRects().length>0;
  };
  function correctionSnapshot(){
    const roots=[...activeContentRoot().querySelectorAll('.interaction.ic-text-correction.replace')].filter(visible);
    if(roots.length!==1)return null;
    const root=roots[0],blocks=[...root.querySelectorAll('.contentblock.ki24_view')];
    const groups=blocks.map(block=>[...block.querySelectorAll('span.input-text')]);
    const tokens=groups.flat();
    if(!groups.length||groups.some(g=>!g.length)||!tokens.length||tokens.length>250||
      new Set(tokens).size!==tokens.length||tokens.length!==root.querySelectorAll('span.input-text').length)return null;
    return {root,groups,tokens};
  }
  async function waitForUniqueCorrectionPopup(resolve){
    const deadline=Date.now()+2000;
    do{
      const snapshot=resolve();
      if(snapshot){const popups=[...snapshot.root.querySelectorAll('.tc_popup')].filter(visible);
        if(popups.length)return popups.length===1?popups[0]:null;}
      await wait(40);
    }while(Date.now()<deadline);
    return null;
  }
  function typeCorrectionIntoPopup(field,value){
    if(!field?.matches('input[type="text"]')||!actionable(field)||field.readOnly)return false;
    field.focus();
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
    if(!setter)return false;
    setter.call(field,value);
    field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
    return field.isConnected&&field.value===value;
  }
  async function confirmCorrection(edit,resolve,popup){
    const fail=(reason)=>({reason});
    const current=resolve();
    if(!current||!popup.isConnected||!current.root.contains(popup))return fail('TARGET_CHANGED');
    const fields=[...popup.querySelectorAll('input[type="text"]')].filter(visible);
    const buttons=[...popup.querySelectorAll('.button-submit')].filter(button=>actionable(button)&&/^ok$/i.test(tidy(button.textContent)));
    if(fields.length!==1||buttons.length!==1)return fail('EDITOR_CONTROLS_MISSING');
    try{if(!typeCorrectionIntoPopup(fields[0],edit.to))return fail('INPUT_EVENT_FAILED');}
    catch{return fail('INPUT_EVENT_FAILED');}
    const live=resolve(),popups=live?[...live.root.querySelectorAll('.tc_popup')].filter(visible):[];
    if(!live||popups.length!==1||popups[0]!==popup||!buttons[0].isConnected||fields[0].value!==edit.to)
      return fail('EDITOR_CHANGED_DURING_INPUT');
    try{buttons[0].click();}catch{return fail('CONFIRMATION_FAILED');}
    const deadline=Date.now()+2000;
    do{
      const after=resolve();
      if(after&&![...after.root.querySelectorAll('.tc_popup')].some(visible)&&after.tokens[edit.tokenIndex]?.textContent===edit.to)return true;
      await wait(40);
    }while(Date.now()<deadline);
    const after=resolve();
    return fail(!after?'TARGET_CHANGED':[...after.root.querySelectorAll('.tc_popup')].some(visible)?'CONFIRMATION_TIMEOUT':'COMMITTED_TEXT_MISMATCH');
  }
  async function setTextCorrections(id,response){
    const question=lastScan.questions.find(q=>q.id===id),shape=question.correctionGroups;
    const resolve=()=>{
      if(activeContentRoot()!==lastScan.activeRoot)return null;
      const snapshot=correctionSnapshot();
      return snapshot&&snapshot.groups.length===shape.length&&snapshot.groups.every((g,i)=>g.length===shape[i].length)&&
        snapshot.tokens.every(visible)?snapshot:null;
    };
    const editorOpen=()=>{
      const snapshot=resolve();
      return !snapshot||[...snapshot.root.querySelectorAll('.tc_popup')].some(visible);
    };
    return globalThis.SparkSolvers.solve('textCorrection',{
      correctionNorm:value=>String(value),visible,available:()=>Boolean(resolve()),
      tokens:()=>resolve()?.tokens||[],editorOpen,
      preflight:(edits,originals)=>{
        const snapshot=resolve();
        return Boolean(snapshot&&!editorOpen()&&originals.length===snapshot.tokens.length&&originals.every(o=>
          Number.isInteger(o.sentence)&&Number.isInteger(o.sentenceTokenIndex)&&
          snapshot.groups[o.sentence]?.[o.sentenceTokenIndex]===snapshot.tokens[o.tokenIndex])&&edits.every(e=>
            e.anchorVerified===true&&snapshot.groups[e.sentence]?.[e.sentenceTokenIndex]===snapshot.tokens[e.tokenIndex]));
      },
      commit:async edit=>{
        const before=resolve(),target=before?.groups[edit.sentence]?.[edit.sentenceTokenIndex];
        if(!target||target!==before.tokens[edit.tokenIndex])return {reason:'TARGET_CHANGED'};
        if(editorOpen())return {reason:'EDITOR_ALREADY_OPEN'};
        try{target.click();}catch{return {reason:'POPUP_OPEN_FAILED'};}
        const popup=await waitForUniqueCorrectionPopup(resolve);
        if(!popup)return {reason:'POPUP_OPEN_FAILED'};
        // The editor must belong to the token just clicked, either structurally or by its editing state.
        const now=resolve(),active=now?.tokens[edit.tokenIndex];
        const editing=now?.tokens.filter(n=>n.classList.contains('editing'))||[];
        const block=active?.closest('.ki24_view');
        if(!now||!active||!((editing.length===1&&editing[0]===active)||block?.contains(popup)))
          return {reason:'POPUP_TARGET_AMBIGUOUS'};
        return confirmCorrection(edit,resolve,popup);
      }
    },response);
  }
  // Observe a *model-driven DOM change*, not a CSS selection class or an
  // assumed successful click. No manipulation of the target's DOM is allowed.
  function waitForWordPoolValue(widget,resolveGap,wanted){
    return new Promise(resolve=>{
      const matches=()=>{
        const gap=resolveGap();
        return !!gap&&normalized(wordPoolGapText(gap))===wanted;
      };
      if(matches()){resolve(true);return;}
      let done=false,timer;
      const observer=new MutationObserver(()=>{
        if(matches())finish(true);
      });
      const finish=ok=>{
        if(done)return;
        done=true;observer.disconnect();clearTimeout(timer);resolve(ok);
      };
      observer.observe(widget,{subtree:true,childList:true,attributes:true,characterData:true});
      timer=setTimeout(()=>finish(matches()),480);
    });
  }
  // The QTI source ID may be absent in Spark's DOM. That is safe only when
  // the phrase is unique across the entire QTI word bank.
  function wordPoolPlacedMatches(gap,pair,repeated){
    if(normalized(wordPoolGapText(gap))!==normalized(pair.source))return false;
    const sourceId=wordPoolQtiId(wordPoolSourceCard(gap),'source');
    return sourceId?sourceId===pair.sourceId:!repeated;
  }
  // Rebind the original, QTI-checked targets after Spark rerenders. A new
  // target is usable only if its visible identity still matches the scan.
  function wordPoolLiveBindings(widget,ref,pairs){
    const targets=ref?.targets||[];
    const gaps=[...widget.querySelectorAll('.om-text-gap__target-item')];
    if(!gaps.length||gaps.length!==targets.length||gaps.length!==pairs.length)return null;
    const explicit=targets.some(t=>t.qtiId);
    if(targets.some(t=>explicit?!t.qtiId:!t.ordinal))return null;
    const bound=new Map();
    for(const pair of pairs){
      const original=targets.filter(t=>explicit?t.qtiId===pair.targetId:
        t.ordinal===pair.targetIndex+1);
      if(original.length!==1||bound.has(pair.targetId))return null;
      const found=gaps.filter(gap=>explicit?
        wordPoolQtiId(gap,'target')===pair.targetId:
        !wordPoolQtiId(gap,'target')&&
          (original[0].modelId?gap.getAttribute('data-model-id')===original[0].modelId:
            wordPoolOrdinal(gap,gaps.length)===original[0].ordinal));
      if(found.length!==1||[...bound.values()].includes(found[0]))return null;
      const liveOrdinal=wordPoolOrdinal(found[0],gaps.length);
      if(original[0].ordinal&&liveOrdinal&&original[0].ordinal!==liveOrdinal)return null;
      bound.set(pair.targetId,found[0]);
    }
    return {gaps,bound};
  }
  // Locate each real card once. Hidden measuring copies never count as occupants.
  function wordPoolResetInventory(widget,ref,pairs,duplicateLabels){
    const bindings=wordPoolLiveBindings(widget,ref,pairs);
    if(!bindings)return {reason:'RESET_IDENTITY_AMBIGUOUS'};
    const pool=[...widget.querySelectorAll('.om-text-gap__pool-item')];
    if(pool.some(slot=>[...slot.querySelectorAll('.om-text-gap__draggable')]
      .filter(card=>!card.closest('.width-measure')).length>1))
      return {reason:'RESET_IDENTITY_AMBIGUOUS'};
    const allCards=[...widget.querySelectorAll('.om-text-gap__draggable')]
      .filter(card=>!card.closest('.width-measure'));
    const modelIds=allCards.map(card=>card.getAttribute('data-model-id')).filter(Boolean);
    if(new Set(modelIds).size!==modelIds.length)
      return {reason:'RESET_IDENTITY_AMBIGUOUS'};
    const matched=new Map();
    for(const pair of pairs){
      const wanted=normalized(pair.source);
      const candidates=allCards.filter(card=>{
        const sourceId=wordPoolQtiId(card,'source')||
          (duplicateLabels.has(wanted)?wordPoolQtiId(card.closest('.om-text-gap__pool-item'),'source'):'');
        return sourceId?sourceId===pair.sourceId:
          !duplicateLabels.has(wanted)&&normalized(card.textContent)===wanted;
      });
      if(candidates.length!==1||matched.has(candidates[0]))
        return {reason:'RESET_IDENTITY_AMBIGUOUS'};
      matched.set(candidates[0],pair);
    }
    const occupied=[];
    for(const [targetId,gap] of bindings.bound){
      const cards=[...gap.querySelectorAll('.om-text-gap__draggable')]
        .filter(card=>!card.closest('.width-measure'));
      if(cards.length>1)return {reason:'RESET_UNSUPPORTED_OCCUPANT',targetId};
      if(!cards.length)continue;
      const card=cards[0];
      const pair=matched.get(card);
      if(!pair&&(!normalized(card.textContent)||
        allCards.filter(x=>normalized(x.textContent)===normalized(card.textContent)).length!==1))
        return {reason:'RESET_UNSUPPORTED_OCCUPANT',targetId};
      occupied.push({targetId,card,sourceId:pair?.sourceId||
        wordPoolQtiId(card,'source')||'unmapped',modelId:card.getAttribute('data-model-id')||null,
        sourceLabel:normalized(card.textContent),known:!!pair});
    }
    return {bindings,occupied,cards:allCards};
  }
  function waitForWordPoolReturn(widget,verify){
    return new Promise(resolve=>{
      if(verify()){resolve(true);return;}
      let done=false,timer;
      const observer=new MutationObserver(()=>{if(verify())finish(true);});
      const finish=ok=>{
        if(done)return;
        done=true;observer.disconnect();clearTimeout(timer);resolve(ok);
      };
      observer.observe(widget,{subtree:true,childList:true,attributes:true,characterData:true});
      timer=setTimeout(()=>finish(verify()),850);
    });
  }
  const activeWordPoolSolves=new WeakSet();
  async function setWordPool(widget,response,ref){
    if(activeWordPoolSolves.has(widget))return {status:'uncertain',detail:'RESET_STATE_CHANGED: Solve already running for this interaction.'};
    activeWordPoolSolves.add(widget);
    try{return await runWordPoolResetFirst(widget,response,ref);}
    finally{activeWordPoolSolves.delete(widget);}
  }
  async function runWordPoolResetFirst(widget,response,ref){
    const pairs=Array.isArray(response.pairs)?response.pairs:[];
    const targets=ref?.targets||[];
    const interactionId=widget.getAttribute('data-model-id')||null;
    const exerciseId=typeof location!=='undefined'?
      location.pathname.match(/\/cdn_proxy\/([a-f0-9-]{36})\b/i)?.[1]||null:null;
    const diagnostic=(stage,data)=>console.info('[Spark word-pool]',stage,
      {exerciseId,interactionId,...data});
    diagnostic('mapping',{pairs:pairs.length,targets:targets.length,
      sources:widget.querySelectorAll('.om-text-gap__pool-item').length,
      verified:response.wordPoolVerified===true});
    if(!response.wordPoolVerified||!pairs.length||
      pairs.length>60||targets.length!==pairs.length||
      new Set(pairs.map(p=>p.targetId)).size!==pairs.length||
      new Set(pairs.map(p=>p.sourceId)).size!==pairs.length||
      new Set(pairs.map(p=>p.targetIndex)).size!==pairs.length||
      pairs.some(p=>!p.sourceId||!p.targetId||!p.source||
        !Number.isSafeInteger(p.targetIndex)||p.targetIndex<0||p.targetIndex>=pairs.length))
      return {status:'skipped',detail:'Missing complete, ID-verified QTI gap mapping.'};
    const ordered=pairs.slice().sort((a,b)=>a.targetIndex-b.targetIndex);
    const initial=wordPoolLiveBindings(widget,ref,ordered);
    if(!initial)return {status:'skipped',detail:'Cannot bind QTI targets to unique visible Spark gaps.'};
    // A repeated phrase can be graded by distinct QTI IDs. Never guess which
    // identical tile belongs to which ID without an exposed DOM identifier.
    const duplicateLabels=new Set(ordered.filter(p=>p.labelAmbiguous ||
      ordered.filter(x=>normalized(x.source)===normalized(p.source)).length>1)
      .map(p=>normalized(p.source)));
    const originalCards=[...widget.querySelectorAll('.om-text-gap__draggable')]
      .filter(card=>!card.closest('.width-measure'));
    const originalLabels=originalCards.map(card=>normalized(card.textContent)).sort();
    const inventory=()=>{
      const now=wordPoolResetInventory(widget,ref,ordered,duplicateLabels);
      if(!now.reason&&(now.cards.length!==originalCards.length||
        now.cards.map(card=>normalized(card.textContent)).sort().some((label,i)=>label!==originalLabels[i])||
        originalCards.some(card=>{
        const model=card.getAttribute('data-model-id');
        return model&&!now.cards.some(current=>current.getAttribute('data-model-id')===model);
      })))return {...now,reason:'RESET_STATE_CHANGED'};
      return now;
    };
    let returnAttempt=null;
    const blocked=(reason,data={})=>{
      const state=wordPoolLiveBindings(widget,ref,ordered);
      const remaining=state?[...state.bound].flatMap(([targetId,gap])=>{
        const card=wordPoolSourceCard(gap);
        return card?[{targetId,answer:normalized(card.textContent),
          modelId:card.getAttribute('data-model-id'),selected:card.classList.contains('selected'),
          connected:card.isConnected,handleConnected:card.querySelector('.om-text-gap__draggable-handle')?.isConnected===true}]:[];
      }):null;
      const details={...returnAttempt,...data,widgetConnected:widget.isConnected,remainingGaps:remaining,
        poolItems:[...widget.querySelectorAll('.om-text-gap__pool-item')].map(slot=>{
          const card=wordPoolSourceCard(slot);
          return card?{answer:normalized(card.textContent),modelId:card.getAttribute('data-model-id')}:null;
        }).filter(Boolean)};
      diagnostic('reset-blocked',{failureReason:reason,...details});
      return {status:'uncertain',detail:reason+': '+JSON.stringify(details)};
    };
    let reset=inventory();
    if(reset.reason)return blocked(reset.reason,{targetId:reset.targetId||null});
    const prepareReset=async()=>{
    diagnostic('reset-start',{expectedSources:ordered.length,occupied:reset.occupied.length});
    diagnostic('reset-inventory',{occupied:reset.occupied.map(x=>
      ({sourceId:x.sourceId,currentTargetId:x.targetId}))});
    // Verify every occupied handle before changing anything.
    for(const item of reset.occupied){
      const handle=item.card.querySelector('.om-text-gap__draggable-handle');
      if(!item.card.isConnected||!visible(item.card)||!handle?.isConnected||
        !visible(handle)||handle.disabled||handle.getAttribute('aria-disabled')==='true'||
        (!item.known&&!item.modelId))
        return blocked('RESET_UNSUPPORTED_OCCUPANT',{sourceId:item.sourceId,currentTargetId:item.targetId});
    }
    };
    const returnToPool=async(item,step,startingOccupied)=>{
      reset=inventory();
      if(reset.reason)return blocked(reset.reason,{step});
      if(reset.occupied.length!==startingOccupied-step)
        return blocked('RESET_STATE_CHANGED',{step,remainingOccupied:reset.occupied.length});
      if(reset.occupied[0]?.targetId!==item.targetId)return blocked('RESET_STATE_CHANGED',{step});
      const originId=item.targetId,expectedModel=item.modelId;
      returnAttempt={answer:item.sourceLabel,sourceId:item.sourceId,targetId:originId,
        interaction:'placed answer handle click, then click its current handle again if selected',clicks:0};
      const live=()=>inventory();
      const sameOrigin=()=>{
        const now=live();
        const current=now.occupied?.find(x=>x.targetId===originId);
        return !now.reason&&current?.sourceId===item.sourceId&&
          current.sourceLabel===item.sourceLabel&&
          (!expectedModel||current.modelId===expectedModel)&&
          now.occupied.length===startingOccupied-step;
      };
      const returned=()=>{
        const now=live();
        if(now.reason||now.occupied.length!==startingOccupied-step-1||
          now.occupied.some(x=>x.targetId===originId))return false;
        const cards=now.cards.filter(card=>card.closest('.om-text-gap__pool-item')&&
          normalized(card.textContent)===item.sourceLabel&&
          (!expectedModel||card.getAttribute('data-model-id')===expectedModel));
        if(cards.length!==1)return false;
        return true;
      };
      if(!sameOrigin())return blocked('RESET_STATE_CHANGED',{step,currentTargetId:originId});
      const control=live().occupied.find(x=>x.targetId===originId)?.card;
      const handle=control?.querySelector('.om-text-gap__draggable-handle');
      if(!control?.isConnected||!visible(control)||!handle?.isConnected||
        !visible(handle)||handle.disabled||handle.getAttribute('aria-disabled')==='true')
        return blocked('RESET_UNSUPPORTED_OCCUPANT',{step,currentTargetId:originId});
      diagnostic('reset-return-attempt',{sourceId:item.sourceId,currentTargetId:originId,
        attempt:1});
      returnAttempt.clicks++;
      handle.click();
      // A handle may already be selected. Check whether its first click
      // returned the tile before considering a second activation.
      if(!returned()){
        const deadline=Date.now()+480;
        while(sameOrigin()&&!live().occupied.find(x=>x.targetId===originId)?.card.classList.contains('selected')&&
          Date.now()<deadline)await new Promise(done=>setTimeout(done,20));
        if(!sameOrigin()){
          if(!await waitForWordPoolReturn(widget,returned))return blocked('RESET_STATE_CHANGED',{step,currentTargetId:originId});
        }else{
          const selected=live().occupied.find(x=>x.targetId===originId)?.card;
          const acknowledged=!!selected?.classList.contains('selected')&&
            [...widget.querySelectorAll('.om-text-gap__draggable.selected')]
              .filter(x=>!x.closest('.width-measure')).every(x=>x===selected);
          diagnostic('reset-source-selection',{sourceId:item.sourceId,currentTargetId:originId,
            selectionAcknowledged:acknowledged});
          if(!acknowledged)return blocked('RESET_SOURCE_NOT_SELECTED',{step,currentTargetId:originId});
          await new Promise(done=>setTimeout(done,420));
          if(!returned()){
            if(!sameOrigin())return blocked('RESET_STATE_CHANGED',{step,currentTargetId:originId});
            const fresh=live().occupied.find(x=>x.targetId===originId)?.card;
            const second=fresh?.querySelector('.om-text-gap__draggable-handle');
            if(!fresh?.classList.contains('selected')||!fresh.isConnected||!visible(fresh)||
              !second?.isConnected||!visible(second)||second.disabled||
              second.getAttribute('aria-disabled')==='true')
              return blocked('RESET_SOURCE_NOT_SELECTED',{step,currentTargetId:originId});
            returnAttempt.clicks++;
            second.click();
          }
        }
      }
      const verified=await waitForWordPoolReturn(widget,returned);
      diagnostic('reset-return-result',{sourceId:item.sourceId,currentTargetId:originId,
        sourceReturned:verified,destinationCleared:verified});
      if(!verified)return blocked('RESET_RETURN_UNVERIFIED',{step,currentTargetId:originId});
      reset=inventory();
      if(reset.reason||reset.occupied.length!==startingOccupied-step-1)
        return blocked('RESET_STATE_CHANGED',{step,remainingOccupied:reset.occupied?.length??null});
      diagnostic('reset-progress',{remainingOccupied:reset.occupied.length,
        verifiedPoolSources:ordered.length-reset.occupied.length});
    };
    const resetComplete=async()=>{
    reset=inventory();
    const allBackInPool=!reset.reason&&reset.cards.every(card=>
      card.isConnected&&card.closest('.om-text-gap__pool-item'));
    if(reset.reason||reset.occupied.length||!allBackInPool||
      !reset.bindings.gaps.every(gap=>!wordPoolGapText(gap)&&
        ![...gap.querySelectorAll('.om-text-gap__draggable')].some(card=>!card.closest('.width-measure'))))
      return blocked('RESET_INCOMPLETE',{remainingOccupied:reset.occupied?.length??null});
    diagnostic('reset-complete',{remainingOccupied:0,verifiedPoolSources:ordered.length});
    if(!widget.isConnected)return blocked('RESET_STATE_CHANGED',{phase:'refill'});
    };
    const refillBlocked=(reason,data={})=>{
      diagnostic('refill-placement',{verified:false,failureReason:reason,...data});
      return {status:'uncertain',detail:reason};
    };
    // Validate every gap and every still-needed tile *before* the first click.
    // An uncertain later gap must not leave an avoidable partial edit.
    const planned=[],reserved=new Set();
    const matchingPoolItems=(pair,excluded=new Set())=>{
      const wanted=normalized(pair.source);
      return [...widget.querySelectorAll('.om-text-gap__pool-item')].filter(li=>{
        const card=wordPoolSourceCard(li);
        const sourceId=wordPoolQtiId(card,'source')||
          (duplicateLabels.has(wanted)?wordPoolQtiId(li,'source'):'');
        return !excluded.has(li)&&card&&normalized(wordPoolLabel(li))===wanted&&
          (sourceId?sourceId===pair.sourceId:!duplicateLabels.has(wanted));
      });
    };
    const planFill=async()=>{
      diagnostic('refill-start',{expectedSources:ordered.length});
    for(const pair of ordered){
      const gap=reset.bindings.bound.get(pair.targetId),wanted=normalized(pair.source);
      if(!gap.isConnected||!widget.contains(gap))return {status:'uncertain',detail:'Gap was replaced during solving.'};
      const value=normalized(wordPoolGapText(gap));
      if(value===wanted){
        if(!wordPoolPlacedMatches(gap,pair,duplicateLabels.has(wanted)))
          return {status:'skipped',detail:`Placed phrase ${pair.sourceId} has an ambiguous or conflicting QTI identity.`};
        continue;
      }
      if(value)return {status:'uncertain',detail:`Gap ${pair.targetId} already contains another phrase; no overwrite attempted.`};
      const pool=[...widget.querySelectorAll('.om-text-gap__pool-item')];
      if(pool.length>60)return {status:'skipped',detail:'Word pool size exceeds the supported limit.'};
      const chosen=matchingPoolItems(pair,reserved);
      if(chosen.length!==1)
        return {status:'skipped',detail:`Phrase ${pair.sourceId} cannot be identified uniquely in the Spark pool.`};
      const card=wordPoolSourceCard(chosen[0]);
      const handle=card?.querySelector('.om-text-gap__draggable-handle');
      const slot=gap.querySelector('.om-text-gap__droppable');
      const cardVisible=visible(card),gapVisible=visible(gap);
      const failed=[!handle&&'sourceHandleMissing',!slot&&'destinationSlotMissing',
        !cardVisible&&'sourceCardNotVisible',handle&&!visible(handle)&&'sourceHandleNotVisible',
        handle&&(handle.disabled||handle.getAttribute('aria-disabled')==='true')&&'sourceHandleDisabled',!gapVisible&&'destinationGapNotVisible'].filter(Boolean);
      if(failed.length){
        // Inspect only control metadata; never dump page contents or answers.
        const describe=node=>{
          if(!node)return {exists:false};
          let style=null,rectCount=null;
          try {style=globalThis.getComputedStyle?.(node);rectCount=node.getClientRects?.().length??null;} catch {}
          return {exists:true,tag:node.tagName||null,
            classes:String(node.getAttribute?.('class')||'').slice(0,240),
            connected:node.isConnected===true,disabled:node.disabled===true,
            ariaDisabled:node.getAttribute?.('aria-disabled')||null,
            hiddenAncestor:!!node.closest?.('[hidden],[inert]'),
            display:style?.display||null,visibility:style?.visibility||null,rectCount};
        };
        diagnostic('APPLY_BLOCKED',{reason:'wordPoolActionability',failed,
          title:typeof document!=='undefined'?exerciseTitle():null,
          interactiveId:typeof location!=='undefined'?location.pathname.match(/\/cdn_proxy\/([a-f0-9-]{36})\b/i)?.[1]||null:null,
          sourceId:pair.sourceId,targetId:pair.targetId,sourceMatches:chosen.length,
          cardVisible,gapVisible,source:describe(card),handle:describe(handle),
          destination:describe(gap),slot:describe(slot)});
        return {status:'uncertain',detail:'Spark pool control or gap is not actionable: '+failed.join(', ')+
          ' (source '+pair.sourceId+', target '+pair.targetId+').'};
      }
      reserved.add(chosen[0]);
      planned.push(pair);
    }
      return planned;
    };
    const placeFromPool=async(pair)=>{
      // Other gaps must retain their state while this particular tile moves.
      const current=wordPoolLiveBindings(widget,ref,ordered);
      if(!current)return refillBlocked('RESET_STATE_CHANGED',{sourceId:pair.sourceId});
      const gap=current.bound.get(pair.targetId);
      const before=new Map(ordered.map(p=>[p.targetId,
        wordPoolGapText(current.bound.get(p.targetId))]));
      const liveGap=()=>wordPoolLiveBindings(widget,ref,ordered)?.bound.get(pair.targetId);
      // Spark can rebuild its remaining pool after each placement. Resolve a
      // fresh tile by the same verified QTI identity before every interaction.
      const chosen=matchingPoolItems(pair);
      const card=chosen.length===1?wordPoolSourceCard(chosen[0]):null;
      const handle=card?.querySelector('.om-text-gap__draggable-handle');
      const slot=gap.querySelector('.om-text-gap__droppable');
      if(chosen.length!==1||!card?.isConnected||!handle?.isConnected||
        !slot?.isConnected||!gap.isConnected||!visible(card)||!visible(handle)||handle.disabled||
        handle.getAttribute('aria-disabled')==='true'||!visible(gap)||
        normalized(wordPoolGapText(gap)))
        return refillBlocked('REFILL_SOURCE_MISSING',{sourceId:pair.sourceId,targetId:pair.targetId});
      // Perform the same two-click interaction Spark exposes to a user.
      // One retry on the outer target is safe ONLY if the chosen tile visibly
      // remains selected and no gap content changed after the inner click.
      handle.click();
      // Let synchronous framework selection updates settle, then resolve the
      // current target again: selecting a tile can also rebuild the gap DOM.
      const selectionDeadline=Date.now()+480;
      while(card.isConnected&&!card.classList.contains('selected')&&Date.now()<selectionDeadline)
        await new Promise(resolve=>setTimeout(resolve,20));
      if(!card.isConnected||!card.classList.contains('selected'))
        return refillBlocked('SOURCE_NOT_SELECTED',{sourceId:pair.sourceId,targetId:pair.targetId});
      diagnostic('source-selection',{sourceId:pair.sourceId,targetId:pair.targetId,
        selected:card.classList.contains('selected'),connected:card.isConnected});
      const selectedTarget=wordPoolLiveBindings(widget,ref,ordered)?.bound.get(pair.targetId);
      const currentSlot=selectedTarget?.querySelector('.om-text-gap__droppable');
      diagnostic('target-rebind',{targetId:pair.targetId,connected:currentSlot?.isConnected===true});
      if(!currentSlot?.isConnected||!visible(selectedTarget))
        return refillBlocked('REFILL_DESTINATION_OCCUPIED',{sourceId:pair.sourceId,targetId:pair.targetId});
      if(wordPoolGapText(selectedTarget))
        return refillBlocked('REFILL_DESTINATION_OCCUPIED',{sourceId:pair.sourceId,targetId:pair.targetId});
      currentSlot.click();
      let placed=await waitForWordPoolValue(widget,liveGap,normalized(pair.source));
      const unchanged=()=>{
        const state=wordPoolLiveBindings(widget,ref,ordered);
        return state&&ordered.every(p=>before.get(p.targetId)===
          wordPoolGapText(state.bound.get(p.targetId)));
      };
      if(!placed && unchanged() &&
        card.isConnected && card.classList.contains('selected')){
        liveGap()?.click();
        placed=await waitForWordPoolValue(widget,liveGap,normalized(pair.source));
      }
      const after=wordPoolLiveBindings(widget,ref,ordered);
      diagnostic('placement',{sourceId:pair.sourceId,targetId:pair.targetId,placed,
        rebound:!!after});
      if(!placed||!after||ordered.some(p=>p.targetId!==pair.targetId &&
        before.get(p.targetId)!==wordPoolGapText(after.bound.get(p.targetId))))
        return refillBlocked('PLACEMENT_NOT_OBSERVED',{sourceId:pair.sourceId,targetId:pair.targetId});
      if(!wordPoolPlacedMatches(after.bound.get(pair.targetId),pair,
        duplicateLabels.has(normalized(pair.source))))
        return refillBlocked('FINAL_MAPPING_MISMATCH',{sourceId:pair.sourceId,targetId:pair.targetId});
      diagnostic('refill-placement',{sourceId:pair.sourceId,targetId:pair.targetId,verified:true});
    };
    const finishFill=async()=>{
    const final=wordPoolLiveBindings(widget,ref,ordered);
    const all=final&&ordered.every(p=>wordPoolPlacedMatches(final.bound.get(p.targetId),p,
      duplicateLabels.has(normalized(p.source))));
    diagnostic('refill-complete',{finalMappingVerified:!!all});
    diagnostic('final-mapping-verification',{verified:!!all});
    return {status:all?'filled':'uncertain',detail:all?
      'Every QTI word-pool target verified on the rendered Spark widget; gradebook not confirmed.':
      'FINAL_MAPPING_MISMATCH: Word-pool final state could not be verified.'};
    };
    return globalThis.SparkSolvers.solve('gapWordPool',{
      prepare:prepareReset,read:inventory,returnToPool,resetComplete,blocked,
      empty:()=>{const state=inventory();return !state.reason&&state.occupied.length===0;},
      plan:planFill,place:placeFromPool,finish:finishFill,
      verify:()=>{const state=wordPoolLiveBindings(widget,ref,ordered);return !!state&&ordered.every(p=>
        wordPoolPlacedMatches(state.bound.get(p.targetId),p,duplicateLabels.has(normalized(p.source))));}
    },response);
  }
  async function setLinkingLines(id){
    const pairs=lastScan.trustedLinking?.get(id);
    if(!pairs?.length)return {status:'skipped',detail:'Link endpoints were not verified against QTI.'};
    if(lastScan.linkingBusy)return {status:'skipped',detail:'Linking Solve is already running.'};
    lastScan.linkingBusy=true;
    const resolve=()=>{
      const widgets=[...lastScan.activeRoot.querySelectorAll('.interaction.is-linking-lines')]
        .filter(w=>!w.closest('[hidden],[inert]'));
      const endpoints=widgets.length===1?linkingEndpoints(widgets[0]):null;
      if(!endpoints||endpoints.sources.length!==pairs.length)return null;
      const mapped=pairs.map(p=>({source:endpoints.sources.find(e=>normalized(e.label)===normalized(p.source))?.handle,
        target:endpoints.targets.find(e=>normalized(e.label)===normalized(p.target))?.handle}));
      return mapped.every(p=>actionable(p.source)&&actionable(p.target))?mapped:null;
    };
    try{
      return await globalThis.SparkSolvers.solve('linkingLines',{
        current:()=>activeContentRoot()===lastScan.activeRoot,
        resolve:index=>resolve()?.[index],wait,
        connect:async({source,target})=>{
          const view=source.ownerDocument.defaultView;
          const a=source.getBoundingClientRect(),b=target.getBoundingClientRect();
          const x=a.left+a.width/2,y=a.top+a.height/2,tx=b.left+b.width/2,ty=b.top+b.height/2;
          const send=(node,type,cx,cy,buttons)=>node.dispatchEvent(new view.MouseEvent(type,{
            bubbles:true,cancelable:true,view,button:0,buttons,clientX:cx,clientY:cy}));
          send(source,'mousedown',x,y,1);
          for(let step=1;step<=18;step++){
            const cx=x+(tx-x)*step/18,cy=y+(ty-y)*step/18;
            send(source.ownerDocument.elementFromPoint(cx,cy)||target,'mousemove',cx,cy,1);
            await wait(24);
          }
          send(source.ownerDocument.elementFromPoint(tx,ty)||target,'mouseup',tx,ty,0);
        }
      },{pairs});
    }finally{lastScan.linkingBusy=false;}
  }
  async function apply(answers) {
    if(lastScan.questions.length===1&&lastScan.questions[0].kind==='review')return applyReview(answers);
    if(!lastScan.activeRoot||activeContentRoot()!==lastScan.activeRoot){
      return (Array.isArray(answers)?answers:[]).map(a=>({id:a.id,status:'skipped',detail:'Screen changed; scan again.'}));
    }
    const results = [];
    for (const response of answers) {
      const id = response.id;
      const value = tidy(response.answer);
      const found = lastScan.refs.get(id);
      if (!value) {lastScan.applied.delete(id);results.push({id,status:'skipped',detail:'Không có đáp án.'});continue;}
      if (!found) {lastScan.applied.delete(id);results.push({id,status:'manual',detail:lastScan.questions.find(q=>q.id===id)?.kind==='pronunciation'?
        'UNSUPPORTED: marking controls or mapping unavailable.':'Dạng này chưa hỗ trợ tương tác tự động; dùng đáp án xem trước.'});continue;}
      if (!['checkbox','linkingLines','pronunciation','textCorrection'].includes(found.kind) && !(found.items?found.items.every(item=>document.contains(item.node)):document.contains(found.node))) {lastScan.applied.delete(id);results.push({id,status:'skipped',detail:'Bài đã thay đổi. Hãy quét lại.'});continue;}
      try {
        let outcome;
        if(found.kind==='pronunciation')outcome=await setPronunciation(id);
        else if(found.kind==='linkingLines')outcome=await setLinkingLines(id);
        else if(found.kind==='textCorrection'){
          const trusted=lastScan.trustedCorrections?.get(id),submitted=response.corrections;
          if(!trusted||!Array.isArray(submitted)||trusted.length!==submitted.length||
            trusted.some((e,i)=>e.from!==submitted[i].from||e.to!==submitted[i].to||e.tokenIndex!==submitted[i].tokenIndex||
              e.sentence!==submitted[i].sentence||e.sentenceTokenIndex!==submitted[i].sentenceTokenIndex))
            outcome={status:'skipped',detail:'UNSUPPORTED: correction mapping was not verified against current QTI.'};
          else outcome=await setTextCorrections(id,{corrections:trusted,originals:lastScan.trustedCorrectionOriginals?.get(id)});
        }
        else if(found.kind==='gapWordPool'){
          const trusted=lastScan.trustedWordPool?.get(id);
          const supplied=Array.isArray(response.pairs)?response.pairs:[];
          if(!response.wordPoolVerified || !trusted || trusted.length!==supplied.length ||
            trusted.some((p,i)=>p.sourceId!==supplied[i].sourceId||p.targetId!==supplied[i].targetId||
              p.source!==supplied[i].source||p.targetIndex!==supplied[i].targetIndex||
              p.labelAmbiguous!==supplied[i].labelAmbiguous))
            outcome={status:'skipped',detail:'Word-pool pairs were not verified against current QTI.'};
          else outcome=await setWordPool(found.node,response,found);
        }
        else if(found.kind==='checkbox'){
          const trusted=lastScan.trustedCheckbox?.get(id),supplied=response.selectedIds;
          if(!trusted||!Array.isArray(supplied)||supplied.length!==trusted.length||
            supplied.some(choiceId=>!trusted.includes(choiceId)))
            outcome={status:'skipped',detail:'Checkbox answer was not verified against this screen’s QTI.'};
          else outcome=await setCheckbox(found,trusted);
        }
        else if(found.kind==='order')outcome=await setSequence(found.node,response);
        else if(found.kind==='dropdown')outcome=await setDropdown(found.node,value);
        else if(found.kind==='choice'||found.kind==='multi')outcome=await setChoice(found,value,response.selectedIds);
        else outcome=await globalThis.SparkSolvers.solve('text',{
          write:answer=>setText(found.node,answer),
          matches:answer=>found.node.matches('input,textarea')?found.node.value===answer:
            tidy(found.node.textContent)===tidy(answer)
        },{answer:value});
        if(outcome.status==='filled'){
          lastScan.applied.set(id,value);
          if(found.kind==='order')lastScan.appliedOrder.set(id,response.orderedTokens.map(tidy));
          if(found.kind==='gapWordPool')lastScan.appliedWordPool.set(id,response.pairs.map(p=>
            ({source:p.source,sourceId:p.sourceId,targetId:p.targetId,
              targetIndex:p.targetIndex,labelAmbiguous:p.labelAmbiguous})));
          if(found.kind==='checkbox')lastScan.appliedChoiceIds.set(id,lastScan.trustedCheckbox.get(id).slice());
          else if(found.items){
            const ids=found.items.filter(item=>isChecked(item.node)).map(item=>item.id);
            lastScan.appliedChoiceIds.set(id,ids);
          }
        }else{lastScan.applied.delete(id);lastScan.appliedChoiceIds.delete(id);lastScan.appliedOrder.delete(id);lastScan.appliedWordPool?.delete(id);}
        results.push({id,...outcome});
      } catch(error) {
        lastScan.applied.delete(id);
        lastScan.appliedChoiceIds.delete(id);
        lastScan.appliedOrder.delete(id);
        lastScan.appliedWordPool?.delete(id);
        results.push({id,status:'skipped',detail:String(error?.message || error)});
      }
    }
    return results;
  }
  // Only Spark's known scoring control is a submission candidate. Never guess at a
  // generic "submit" button, which might belong to a different iframe or LMS form.
  function actionable(node) {
    if (!node || !node.isConnected || node.disabled || node.getAttribute('aria-disabled') === 'true') return false;
    if (node.closest('[hidden],[inert]') || node.classList.contains('inactive_button')) return false;
    const css=getComputedStyle(node);
    return css.display!=='none' && css.visibility!=='hidden' && node.getClientRects().length>0;
  }
  function availableActionControls(event) {
    // Spark creates hidden duplicates of each toolbar in some activities.
    // Only the single rendered, enabled control inside the learning object is safe.
    return [...document.querySelectorAll(`#activity_controls [data-event="${event}"]`)]
      .filter(actionable);
  }
  function checkSignal() {
    const available=availableActionControls('check');
    const answerStates=document.querySelectorAll('.status-correct,.status-incorrect,.is-correct,.is-incorrect,.correct-answer,.incorrect-answer').length;
    return {checkAvailable:available.length===1, answerStates};
  }
  // Verify all applied answers against live controls, not merely a successful click.
  function appliedStillMatches() {
    if(!lastScan.questions.length || lastScan.refs.size!==lastScan.questions.length ||
      lastScan.applied.size!==lastScan.questions.length ||
      lastScan.questions.some(q=>!q.applyable))return false;
    return [...lastScan.refs.entries()].every(([id,ref])=>{
      if(ref.kind==='review')return false;
      if(ref.kind==='pronunciation')return markingMatches(lastScan.questions.find(q=>q.id===id),lastScan.trustedMarking?.get(id));
      if(ref.kind==='checkbox'){
        const expected=lastScan.trustedCheckbox?.get(id),applied=lastScan.appliedChoiceIds?.get(id);
        if(!expected||!applied||expected.length!==applied.length||
          expected.some(choiceId=>!applied.includes(choiceId)))return false;
        const current=checkboxState(ref);
        return Boolean(current&&[...current.checked].every(([choiceId,checked])=>checked===expected.includes(choiceId)));
      }
      if(!(ref.items?ref.items.every(item=>document.contains(item.node)):document.contains(ref.node)))return false;
      const wanted=normalized(lastScan.applied.get(id));
      if(!wanted)return false;
      if(ref.kind==='textCorrection')return false; // Spark grading persistence not verified.
      if(ref.kind==='gapWordPool'){
        const pairs=lastScan.appliedWordPool?.get(id);
        const targets=ref.targets||[];
        if(!Array.isArray(pairs)||pairs.length!==targets.length)return false;
        const live=wordPoolLiveBindings(ref.node,ref,pairs);
        if(!live)return false;
        return pairs.every(p=>{
          const slot=live.bound.get(p.targetId);
          if(!slot?.isConnected)return false;
          const repeated=p.labelAmbiguous ||
            pairs.filter(x=>normalized(x.source)===normalized(p.source)).length>1;
          return wordPoolPlacedMatches(slot,p,repeated);
        });
      }

      if(ref.kind==='order'){
        const order=lastScan.appliedOrder?.get(id);
        return Array.isArray(order) && sameWords(sequenceWords(ref.node),order) &&
          sequenceWords(ref.node).every((word,i)=>normalized(word)===normalized(order[i]));
      }
      if(ref.kind==='choice'||ref.kind==='multi'){
        const wanted=lastScan.appliedChoiceIds?.get(id);
        if(!wanted?.length)return false;
        return ref.items.every(item=>isChecked(item.node)===wanted.includes(item.id));
      }
      if(ref.kind==='dropdown'){
        if(ref.node.matches('select'))return normalized(ref.node.selectedOptions[0]?.textContent)===wanted;
        const button=ref.node.matches('[role="combobox"]')?ref.node:ref.node.querySelector('[role="combobox"],button[data-event="toggle"]');
        if(normalized(button?.textContent).includes(wanted))return true;
        return optionNodes(ref.node).some(option=>normalized(option.textContent)===wanted &&
          (option.getAttribute('aria-selected')==='true'||option.classList.contains('selected')||option.classList.contains('is-selected')));
      }
      return normalized(ref.node.value!==undefined?ref.node.value:ref.node.textContent)===wanted;
    });


  }

  async function submitNext(expected,goNext) {
    if(!lastScan.activeRoot||activeContentRoot()!==lastScan.activeRoot)
      return {submitted:false,reason:'submitChanged'};
    if(lastScan.submitted)return {submitted:false,reason:'submitAlready'};
    if(!Number.isInteger(expected)||expected!==lastScan.questions.length || !expected ||
      lastScan.questions.some(q=>!q.applyable||q.kind==='order')||lastScan.refs.size!==expected || lastScan.applied.size!==expected) {
      return {submitted:false,reason:'submitUnverified'};
    }
    if(!appliedStillMatches())return {submitted:false,reason:'submitChanged'};

    // Observed on the authenticated 1b | Grammar | 3 activity:
    //   submit -> Submit to Gradebook, becomes inactive after ~1.2 s
    //   forward_lo -> Next, remains actionable until clicked
    //   check -> Check Answers, hidden/disabled here
    // Use the Spark gradebook control when present, falling back to Check Answers
    // for other activity types. Never click a generic form submit button.
    const gradebook=availableActionControls('submit');
    const checks=availableActionControls('check');
    if(gradebook.length>1 || checks.length>1)return {submitted:false,reason:'submitControlMissing'};
    const mode=gradebook.length===1?'gradebook':checks.length===1?'check':null;
    if(!mode)return {submitted:false,reason:'submitControlMissing'};
    const control=mode==='gradebook'?gradebook[0]:checks[0];
    const originalRoot=lastScan.activeRoot;
    const before=checkSignal();

    // Lock before clicking to avoid a second Gradebook submission on repeated calls.
    lastScan.submitted=true;
    control.click();
    let transitioned=false;
    for(let i=0;i<22;i++){
      await wait(160);
      if(activeContentRoot()!==originalRoot)break;
      if(mode==='gradebook'){
        // Disappearance alone is NOT proof: require the *same connected button*
        // to enter the disabled/inactive state, as observed in the diagnostic.
        if(control.isConnected && (control.disabled || control.classList.contains('inactive_button'))
           && !actionable(control)){
          // Avoid advancing while a transient save-request spinner merely disables Submit.
          await wait(380);
          if(control.isConnected && (control.disabled || control.classList.contains('inactive_button'))
             && !actionable(control) && activeContentRoot()===originalRoot){
            transitioned=true;
            break;
          }
        }
      }else{
        const after=checkSignal();
        if((before.checkAvailable && !after.checkAvailable) || after.answerStates>before.answerStates){
          transitioned=true;
          break;
        }
      }
    }
    if(!transitioned){
      // The click may have reached Spark, but a server-side save is NOT established.
      // Never retry automatically or click Next on an ambiguous outcome.
      return {submitted:true,confirmed:false,nextClicked:false,mode,reason:'submitClicked'};
    }

    if(goNext){
      const candidates=availableActionControls('forward_lo');
      if(candidates.length!==1)
        return {submitted:true,confirmed:true,nextClicked:false,mode,reason:'nextControlMissing'};
      const next=candidates[0];
      // Respond before navigating, since Spark may unload this iframe on Next.
      // Recheck every guard immediately before the scheduled click.
      setTimeout(()=>{
        if(lastScan.submitted && activeContentRoot()===originalRoot &&
           actionable(next) && availableActionControls('forward_lo').length===1 &&
           (mode!=='gradebook'||(control.isConnected && !actionable(control)))){
          next.click();
        }
      },300);
      return {submitted:true,confirmed:true,nextClicked:true,mode};
    }
    return {submitted:true,confirmed:true,nextClicked:false,mode};
  }

  function referenceScreen(root,result){
    return Number.isInteger(result.screenCount)&&result.screenIndex<result.screenCount-1&&
      result.questions.every(q=>q.kind==='manual')&&root.querySelectorAll('.interaction').length===1&&
      !!root.querySelector('.interaction.pp-present')&&!root.querySelector('input,textarea,[contenteditable="true"],.audioRecorder,.lrp_wrap,iframe');
  }

  async function forwardScreen(expectedIndex, expectedCount) {
    if(!lastScan.activeRoot || activeContentRoot()!==lastScan.activeRoot ||
       !Number.isInteger(expectedIndex) || !Number.isInteger(expectedCount) ||
       lastScan.screenIndex!==expectedIndex || lastScan.screenCount!==expectedCount ||
       expectedCount<2 || expectedIndex<0 || expectedIndex>=expectedCount-1)
      return {advanced:false,reason:'screenBoundary'};
    if(!(lastScan.referenceScreen&&referenceScreen(lastScan.activeRoot,lastScan))&&!appliedStillMatches())
      return {advanced:false,reason:'screenUnverified'};
    const next=availableActionControls('forward');
    if(next.length!==1)return {advanced:false,reason:'screenForwardMissing'};
    // Spark's intra-activity navigation is `forward`, NEVER `forward_lo`.
    // Recheck before clicking to avoid advancing a changed screen.
    if(activeContentRoot()!==lastScan.activeRoot || !actionable(next[0]))
      return {advanced:false,reason:'screenChanged'};
    next[0].click();
    const deadline=Date.now()+2200;
    while(Date.now()<deadline){
      await wait(80);
      const current=activeContentRoot();
      if(current!==lastScan.activeRoot){
        const number=Number(current.id?.match(/^content_wrap_(\d+)$/)?.[1]);
        if(number===expectedIndex+1)return {advanced:true,screenIndex:number};
        return {advanced:false,reason:'unexpectedScreen'};
      }
    }
    return {advanced:false,reason:'screenTransitionUnknown'};
  }

  function handleMessage(message,_sender,respond) {
    if (!message || !['SPARK_SCAN','SPARK_COPY_PROMPT','SPARK_APPLY','SPARK_PING','SPARK_SUBMIT_NEXT','SPARK_FORWARD_SCREEN','SPARK_QTI'].includes(message.type)) return false;
    if (message.type === 'SPARK_PING') {respond({ok:true,ready:true});return false;}
    if (message.type === 'SPARK_SCAN') {
      try {
        const result=scan();
        lastScan.referenceScreen=Boolean(lastScan.activeRoot&&referenceScreen(lastScan.activeRoot,result));
        respond({ok:true,result:lastScan.referenceScreen?{...result,referenceScreen:true}:result});
      } catch(e) {respond({ok:false,error:e.message});}
      return false;
    }
    if (message.type === 'SPARK_COPY_PROMPT') {
      try {respond({ok:true,result:copyPrompt()});} catch(e){respond({ok:false,error:e.message});}
      return false;
    }
    if (message.type === 'SPARK_QTI') {
      readQTI(message.ids).then(result=>respond({ok:true,result}),error=>respond({ok:false,error:String(error?.message||error)}));
      return true;
    }
    if (message.type === 'SPARK_APPLY') {
      apply(Array.isArray(message.answers)?message.answers:[])
        .then(result=>respond({ok:true,result,...(result[0]?.reviewDiagnostics?{execution:result[0].reviewDiagnostics}:{})}),err=>respond({ok:false,error:err.message}));
      return true;
    }
    if (message.type === 'SPARK_FORWARD_SCREEN') {
      forwardScreen(message.screenIndex,message.screenCount)
        .then(result=>respond({ok:true,result}),err=>respond({ok:false,error:String(err?.message||err)}));
      return true;
    }
    if (message.type === 'SPARK_SUBMIT_NEXT') {
      submitNext(message.expected,message.goNext===true)
        .then(result=>respond({ok:true,result}),err=>respond({ok:false,error:String(err?.message||err)}));
      return true;
    }
    return false;
  }
  return {capabilities:['review','pronunciation','qti','text','dropdown','choice','multi','checkbox','order','textCorrection','gapWordPool','linkingLines','verified-submit'],
    execution:()=>reviewTrace?{operationId:reviewTrace.operationId,phase:reviewTrace.phase,finished:Boolean(reviewTrace.finished),events:reviewTrace.events}:null,
    concurrent:()=>{if(!reviewOperation)return false;reviewLog('CONCURRENT_SOLVE_ATTEMPT');return true;},
    dispatch:message=>new Promise(resolve=>handleMessage(message,null,resolve))};

    }
  };
  root.SparkNglAdapter=adapter;
  root.SparkCore.register(adapter);
})(globalThis);
