'use strict';
// Executes the actual content.js adapter functions against an event-driven DOM
// test double. This is a Node unit simulation, NOT a real browser or Spark.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../adapters/ngl.js'),'utf8');
function section(begin,end){
  const start=source.indexOf(begin),stop=source.indexOf(end,start);
  assert.ok(start>=0&&stop>start,`Missing adapter section: ${begin}`);
  return source.slice(start,stop);
}
const script=fs.readFileSync(path.join(__dirname,'../solvers/interactions.js'),'utf8')+`
  const tidy=x=>String(x??'').replace(/\\s+/g,' ').trim();
  const normalized=x=>tidy(x).toLowerCase();
  const visible=node=>node?.testVisible!==false;
  ${section('function wordPoolSourceCard(li){','function scan(){')}
  ${section('function waitForWordPoolValue(widget,resolveGap,wanted){','async function apply(answers) {')}
  globalThis.runWordPool=setWordPool;
`;
function adapter(){
  const context={
    setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,5)),clearTimeout,
    MutationObserver:class{observe(){}disconnect(){}}
  };
  vm.runInNewContext(script,context);
  return context.runWordPool;
}
class Element{
  constructor(classes=[],text='',attrs={}){
    this.classes=new Set(classes);this.text=text;this.attrs=attrs;
    this.children=[];this.parent=null;this.isConnected=true;
    this.classList={contains:c=>this.classes.has(c),add:c=>this.classes.add(c),
      remove:c=>this.classes.delete(c)};
  }
  append(node){
    if(node.parent)node.parent.children=node.parent.children.filter(x=>x!==node);
    node.parent=this;this.children.push(node);
  }
  closest(selector){for(let n=this;n;n=n.parent)if(n.matches(selector))return n;return null;}
  matches(selector){return this.classes.has(selector.slice(1));}
  querySelectorAll(selector){
    const found=[];
    const walk=node=>{for(const child of node.children){if(child.matches(selector))found.push(child);walk(child);}};
    walk(this);return found;
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  get textContent(){return this.text+this.children.map(el=>el.textContent).join('');}
  getAttribute(key){return this.attrs[key]||null;}
  contains(node){while(node){if(node===this)return true;node=node.parent;}return false;}
  click(){if(this.isConnected&&this.onClick)this.onClick();}
}
const el=(name,text='',attrs={})=>new Element([name],text,attrs);
function fixture({labels=['Alpha','Beta','Gamma'],duplicateIds=false,
  prefilled={},targetIds=false,disableHandle=false,disableSlot=false,
  enableOuter=false,rerenderPool=false,rerenderTargets=false,
  delayedPlacement=false,changeUnrelated=false,
  rerenderTargetsOnSelect=false,deferSelection=false,
  corruptTargetAfterPlacement=false,returnMode='supported',
  rerenderTargetsAfterReturn=false,returnFailureAt=0,returnWrongHomeAt=0,
  rerenderHandleAfterSelection=false,delayedReturn=false,returnToAnyPool=false}={}){
  const widget=el('interaction');
  const pool=el('gap_match_view');widget.append(pool);
  const passage=el('contentblock');widget.append(passage);
  const actions=[],slotClicks=[];
  const cards=[],gaps=[],handles=[],slots=[],pairs=[],homes=[];
  let selected=null,returnAttempts=0;
  const replacedHandles=new WeakSet();
  function replace(parent,oldNode,newNode){
    const index=parent.children.indexOf(oldNode);
    assert.ok(index>=0);
    parent.children[index]=newNode;newNode.parent=parent;
    oldNode.parent=null;
    const disconnect=node=>{node.isConnected=false;node.children.forEach(disconnect);};
    disconnect(oldNode);
  }
  function bindHandle(handle,card){
    handle.onClick=()=>{
      actions.push('select');
      if(disableHandle)return;
      if(card.closest('.om-text-gap__target-item')&&selected===card){
        returnAttempts++;
        if(returnMode==='supported'&&returnAttempts!==returnFailureAt){
          const home=returnToAnyPool?homes.find(slot=>!slot.querySelector('.om-text-gap__draggable')):homes[returnWrongHomeAt===returnAttempts?
            (cards.indexOf(card)+1)%homes.length:cards.indexOf(card)];
          assert.ok(home,'A placed synthetic tile must retain its source pool');
          const performReturn=()=>{
            home.append(card);card.classList.remove('selected');selected=null;
            actions.push('return');
            if(rerenderTargetsAfterReturn)rerenderAllTargets();
          };
          if(delayedReturn)setTimeout(performReturn,4);
          else performReturn();
        }
        return;
      }
      const select=()=>{
        if(card.closest('.om-text-gap__target-item')&&returnMode==='noSelection')return;
        selected?.classList.remove('selected');selected=card;card.classList.add('selected');
        if(card.closest('.om-text-gap__target-item')&&rerenderHandleAfterSelection&&
          !replacedHandles.has(card)){
          replacedHandles.add(card);
          const replacement=el('om-text-gap__draggable-handle',handle.text);
          bindHandle(replacement,card);
          replace(card,handle,replacement);
        }
        if(rerenderTargetsOnSelect)rerenderAllTargets();
      };
      if(deferSelection)queueMicrotask(select);
      else select();
    };
  }
  function rerenderRemainingPool(){
    for(let i=0;i<cards.length;i++){
      const oldCard=cards[i],li=oldCard.parent;
      if(!li?.matches('.om-text-gap__pool-item'))continue;
      const newLi=el('om-text-gap__pool-item');
      const card=el('om-text-gap__draggable','',duplicateIds?{'data-choice-id':`T${i}`}:{}) ;
      const handle=el('om-text-gap__draggable-handle',labels[i]);
      card.append(handle);newLi.append(card);bindHandle(handle,card);
      replace(pool,li,newLi);cards[i]=card;handles[i]=handle;
    }
  }
  function rerenderAllTargets(){
    for(let i=0;i<gaps.length;i++){
      const oldGap=gaps[i],oldSlot=slots[i];
      const gap=el('om-text-gap__target-item','',targetIds?{'data-gap-id':`G${i}`}:{}) ;
      gap.append(el('caption',`Gap ${i+1} of ${labels.length}`));
      const slot=el('om-text-gap__droppable');gap.append(slot);
      const placed=oldSlot.querySelector('.om-text-gap__draggable');
      if(placed)slot.append(placed);
      slot.onClick=()=>{
        slotClicks.push({index:i,slot,live:slot.isConnected&&widget.contains(slot)&&slots[i]===slot,
          targetId:gap.getAttribute('data-gap-id')});
        actions.push('slot');if(!disableSlot)place(slot);
      };
      gap.onClick=()=>{actions.push('outer');if(enableOuter)place(slot);};
      replace(passage,oldGap,gap);gaps[i]=gap;slots[i]=slot;
      if(placed){
        const reconnect=node=>{node.isConnected=true;node.children.forEach(reconnect);};
        reconnect(placed);
      }
    }
  }
  function place(slot){
    if(!selected)return;
    slot.append(selected);
    selected.classList.remove('selected');
    selected=null;
    actions.push('place');
    if(changeUnrelated && actions.filter(x=>x==='place').length===1){
      const other=slots.find(candidate=>candidate!==slot);
      other.append(el('om-text-gap__draggable','unexpected'));
    }
    if(rerenderPool)rerenderRemainingPool();
    if(rerenderTargets)rerenderAllTargets();
    if(corruptTargetAfterPlacement&&actions.filter(x=>x==='place').length===1){
      gaps[1].attrs['data-gap-id']='G0';
    }
  }
  labels.forEach((label,i)=>{
    const id=`T${i}`,tid=`G${i}`;
    pairs.push({sourceId:id,targetId:tid,targetIndex:i,source:label});
    const li=el('om-text-gap__pool-item');pool.append(li);
    const measure=el('width-measure',label);measure.testVisible=false;li.append(measure);
    const home=el('om-text-gap__droppable');li.append(home);homes.push(home);
    const card=el('om-text-gap__draggable','',{
      ...(duplicateIds?{'data-choice-id':id}:{}),'data-model-id':String(1000000+i)});
    const handle=el('om-text-gap__draggable-handle',label);card.append(handle);home.append(card);
    cards.push(card);handles.push(handle);
    bindHandle(handle,card);
    const gap=el('om-text-gap__target-item', '',targetIds?{'data-gap-id':tid}:{});
    const caption=el('caption',`Gap ${i+1} of ${labels.length}`);
    const slot=el('om-text-gap__droppable');gap.append(caption);gap.append(slot);passage.append(gap);
    slots.push(slot);gaps.push(gap);
    slot.onClick=()=>{
      slotClicks.push({index:i,slot,live:slot.isConnected&&widget.contains(slot)&&slots[i]===slot,
        targetId:gap.getAttribute('data-gap-id')});
      actions.push('slot');if(!disableSlot){
      if(delayedPlacement)setTimeout(()=>place(slot),4);
      else place(slot);
    }};
    gap.onClick=()=>{actions.push('outer');if(enableOuter)place(slot);};
  });
  // An incorrectly prefilled gap can contain the wrong QTI source tile.
  for(const [target,source] of Object.entries(prefilled))slots[Number(target)].append(cards[Number(source)]);
  const ref={targets:gaps.map((node,i)=>({node,ordinal:i+1,qtiId:targetIds?`G${i}`:''}))};
  const response={wordPoolVerified:true,pairs,answer:'QTI verified'};
  const current=()=>gaps.map(g=>g.querySelector('.om-text-gap__draggable')?.textContent||'');
  return {widget,ref,response,pairs,gaps,cards,actions,slotClicks,current};
}
const run=adapter();
test('real Spark captions without total permit live ordinal target rebinding',async()=>{
  const f=fixture();
  f.gaps.forEach((gap,i)=>{gap.children[0].text=`Gap ${i+1} of .`;});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
});
test('empty gaps: one Solve fills every QTI target',async()=>{
  const f=fixture();
  const outcome=await run(f.widget,f.response,f.ref);
  assert.equal(outcome.status,'filled');
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
  assert.equal(f.actions.filter(x=>x==='place').length,3);
});
test('incomplete exercise returns even a correctly placed source before refilling',async()=>{
  const f=fixture({prefilled:{0:0}});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
  assert.equal(f.actions.filter(x=>x==='return').length,1);
  assert.equal(f.actions.filter(x=>x==='place').length,3);
  assert.ok(f.actions.lastIndexOf('return')<f.actions.indexOf('place'));
});
test('already completed editable exercise resets all gaps and refills',async()=>{
  const f=fixture({prefilled:{0:0,1:1,2:2}});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  assert.equal(f.actions.filter(x=>x==='return').length,3);
  assert.equal(f.actions.filter(x=>x==='place').length,3);
  assert.ok(f.actions.lastIndexOf('return')<f.actions.indexOf('place'));
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
});
test('duplicate phrases use QTI source IDs and reject ambiguous tiles',async()=>{
  const labels=['Same','Same','Other'];
  const good=fixture({labels,duplicateIds:true,targetIds:true});
  assert.equal((await run(good.widget,good.response,good.ref)).status,'filled');
  const bad=fixture({labels,targetIds:true});
  assert.equal((await run(bad.widget,bad.response,bad.ref)).status,'uncertain');
  assert.equal(bad.actions.length,0);
});
test('duplicate already placed without a QTI source ID is not assumed correct',async()=>{
  const f=fixture({labels:['Same','Same'],prefilled:{0:0}});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'uncertain');
  assert.equal(f.actions.length,0);
});
test('single mapped phrase duplicated by an unused QTI option requires source ID',async()=>{
  const f=fixture({prefilled:{0:0}});
  f.pairs[0].labelAmbiguous=true;
  assert.equal((await run(f.widget,f.response,f.ref)).status,'uncertain');
  assert.equal(f.actions.length,0);
});
test('unaccepted clicks fail without further selection retries',async()=>{
  const f=fixture({disableHandle:true});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'uncertain');
  assert.deepEqual(f.current(),['','','']);
  assert.deepEqual(f.actions,['select']);
});
test('target fallback only runs while the specific tile remains selected',async()=>{
  const f=fixture({disableSlot:true,enableOuter:true});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  assert.equal(f.actions.filter(x=>x==='outer').length,3);
});
test('repeated Solve resets every filled gap before refilling',async()=>{
  const f=fixture();
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  const before=f.actions.length;
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  const second=f.actions.slice(before);
  assert.equal(second.filter(x=>x==='return').length,3);
  assert.equal(second.filter(x=>x==='place').length,3);
  assert.ok(second.lastIndexOf('return')<second.indexOf('place'));
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
});
test('QTI target mismatch and occupied wrong gap do not click',async()=>{
  const missing=fixture({targetIds:true});missing.response.pairs[1].targetId='INVALID';
  assert.equal((await run(missing.widget,missing.response,missing.ref)).status,'skipped');
  assert.equal(missing.actions.length,0);
  const wrong=fixture({prefilled:{0:2},returnMode:'noChange'});
  assert.equal((await run(wrong.widget,wrong.response,wrong.ref)).status,'uncertain');
  assert.deepEqual(wrong.current(),['Gamma','','']);
  assert.equal(wrong.actions.filter(x=>x==='place').length,0);
});
test('explicit QTI target bindings override shuffled DOM positions',async()=>{
  const f=fixture({targetIds:true});
  f.ref.targets.reverse();
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
});
test('screen navigation checks successful verification before invoking Spark forward',async()=>{
  const body=section('async function forwardScreen(expectedIndex, expectedCount) {',
    'function handleMessage(');
  const root={id:'content_wrap_0'},next={id:'content_wrap_1'};
  let current=root,verified=false,clicks=0;
  const context={
    lastScan:{activeRoot:root,screenIndex:0,screenCount:2},
    activeContentRoot:()=>current,appliedStillMatches:()=>verified,
    availableActionControls:()=>[{click(){clicks++;current=next;}}],
    actionable:()=>true,wait:async()=>{}
  };
  vm.runInNewContext(`${body}\nglobalThis.forward=forwardScreen;`,context);
  assert.equal((await context.forward(0,2)).reason,'screenUnverified');
  assert.equal(clicks,0);
  verified=true;
  assert.equal((await context.forward(0,2)).advanced,true);
  assert.equal(clicks,1);
});

test('pool tile replacement between placements retains QTI source binding',async()=>{
  const f=fixture({rerenderPool:true});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
  assert.equal(f.actions.filter(x=>x==='place').length,3);
});

test('target replacement between placements rebinds to the same QTI gaps',async()=>{
  const f=fixture({rerenderTargets:true,targetIds:true});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
});

test('target replacement with uniquely numbered gaps also rebinds safely',async()=>{
  const f=fixture({rerenderTargets:true});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
});

test('unrelated gap mutation stops the remaining placements',async()=>{
  const f=fixture({changeUnrelated:true});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'uncertain');
  assert.equal(f.actions.filter(x=>x==='place').length,1);
});

test('delayed Spark placement is confirmed before the next selection',async()=>{
  const f=fixture({delayedPlacement:true});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
});

test('selection followed by a target rerender clicks the current destination',async()=>{
  const f=fixture({targetIds:true,rerenderTargetsOnSelect:true});
  const staleSlots=f.gaps.map(g=>g.querySelector('.om-text-gap__droppable'));
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
  assert.deepEqual(f.slotClicks.map(e=>e.index),[0,1,2]);
  assert.deepEqual(f.slotClicks.map(e=>e.targetId),['G0','G1','G2']);
  assert.ok(f.slotClicks.every(e=>e.live),'every clicked slot must be connected and current');
  assert.ok(f.slotClicks.every(e=>!staleSlots.includes(e.slot)),
    'a rerendered destination must replace each stale slot before its click');
  assert.equal(f.actions.filter(x=>x==='place').length,3);
});

test('microtask-delayed selection is accepted before clicking the gap',async()=>{
  const f=fixture({deferSelection:true});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
});

test('unverifiable target IDs after a rerender stop additional clicks',async()=>{
  const f=fixture({targetIds:true,rerenderTargets:true,corruptTargetAfterPlacement:true});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'uncertain');
  assert.equal(f.actions.filter(x=>x==='place').length,1);
});

test('repeated Solve resets and refills after source and target replacement',async()=>{
  const f=fixture({targetIds:true,rerenderPool:true,rerenderTargets:true});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  const before=f.actions.length;
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  const second=f.actions.slice(before);
  assert.equal(second.filter(x=>x==='return').length,3);
  assert.equal(second.filter(x=>x==='place').length,3);
  assert.ok(second.lastIndexOf('return')<second.indexOf('place'));
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
});

test('post-apply navigation verification binds current targets and detects later edits',async()=>{
  const f=fixture({targetIds:true,rerenderTargets:true});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  const context={document:{contains:node=>node.isConnected},
    MutationObserver:class{observe(){}disconnect(){}},setTimeout,clearTimeout};
  const verifier=`${script}\n${section('function appliedStillMatches() {','async function submitNext(')}\n`+
    'globalThis.verify=appliedStillMatches;';
  vm.runInNewContext(verifier,context);
  context.lastScan={questions:[{id:'q1',applyable:true}],
    refs:new Map([['q1',{kind:'gapWordPool',node:f.widget,...f.ref}]]),
    applied:new Map([['q1','QTI verified']]),
    appliedWordPool:new Map([['q1',f.response.pairs]])};
  assert.equal(context.verify(),true);
  f.cards[0].querySelector('.om-text-gap__draggable-handle').text='Changed';
  assert.equal(context.verify(),false);
});

test('actionability identifies hidden source before any click',async()=>{
  const f=fixture();f.cards[0].testVisible=false;
  const result=await run(f.widget,f.response,f.ref);
  assert.equal(result.status,'uncertain');assert.match(result.detail,/sourceCardNotVisible/);
  assert.equal(f.actions.length,0);
});
test('actionability identifies hidden target before any click',async()=>{
  const f=fixture();f.gaps[0].testVisible=false;
  const result=await run(f.widget,f.response,f.ref);
  assert.match(result.detail,/destinationGapNotVisible/);assert.equal(f.actions.length,0);
});
test('actionability identifies missing source handle before any click',async()=>{
  const f=fixture();f.cards[0].text=f.cards[0].textContent;f.cards[0].children=[];
  const result=await run(f.widget,f.response,f.ref);
  assert.match(result.detail,/sourceHandleMissing/);assert.equal(f.actions.length,0);
});
test('actionability identifies missing destination slot before any click',async()=>{
  const f=fixture();f.gaps[0].children=f.gaps[0].children.filter(n=>!n.matches('.om-text-gap__droppable'));
  const result=await run(f.widget,f.response,f.ref);
  assert.match(result.detail,/destinationSlotMissing/);assert.equal(f.actions.length,0);
});

test('hidden width-measure copies precede real controls without being selected',async()=>{
  const f=fixture({targetIds:true,duplicateIds:true});
  f.pairs[0].sourceId='GTID0_0';f.pairs[0].targetId='ID0';
  f.cards[0].attrs['data-choice-id']='GTID0_0';
  f.gaps[0].attrs['data-gap-id']='ID0';f.ref.targets[0].qtiId='ID0';
  for(const card of f.cards){
    const li=card.closest('.om-text-gap__pool-item'),measure=el('width-measure');measure.testVisible=false;
    const ghost=el('om-text-gap__draggable',card.textContent);ghost.testVisible=false;
    const handle=el('om-text-gap__draggable-handle');handle.testVisible=false;
    handle.onClick=()=>{throw Error('Hidden copy must not receive clicks');};ghost.append(handle);measure.append(ghost);
    measure.parent=li;li.children.unshift(measure);
  }
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
});
test('multiple non-measuring cards do not guess a source',async()=>{
  const f=fixture();f.cards[0].parent.append(el('om-text-gap__draggable','Alpha'));
  assert.equal((await run(f.widget,f.response,f.ref)).status,'uncertain');assert.equal(f.actions.length,0);
});
test('hidden real handle is rejected despite a visible card',async()=>{
  const f=fixture();f.cards[0].children[0].testVisible=false;
  assert.match((await run(f.widget,f.response,f.ref)).detail,/sourceHandleNotVisible/);
  assert.equal(f.actions.length,0);
});

for(const [name,prefilled] of [
  ['one wrong',{0:1}],['swap',{0:1,1:0}],['three-source cycle',{0:1,1:2,2:0}],
  ['mixed correct wrong empty',{0:0,1:2}]]){
  test('reset-first restores verified mapping: '+name,async()=>{
    const f=fixture({prefilled,targetIds:true,duplicateIds:true});const before=f.current();
    const result=await run(f.widget,f.response,f.ref);
    assert.equal(result.status,'filled',result.detail);
    assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
    assert.equal(f.actions.filter(x=>x==='return').length,
      before.filter(Boolean).length);
    assert.ok(f.actions.lastIndexOf('return')<f.actions.indexOf('place'));
    const count=f.actions.length;
    assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
    const second=f.actions.slice(count);
    assert.equal(second.filter(x=>x==='return').length,3);
    assert.equal(second.filter(x=>x==='place').length,3);
    assert.ok(second.lastIndexOf('return')<second.indexOf('place'));
    assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
  });
}
test('five-source cycle normalizes before any correct placement',async()=>{
  const f=fixture({labels:['A','B','C','D','E'],prefilled:{0:1,1:2,2:3,3:4,4:0},targetIds:true,duplicateIds:true});
  assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
  assert.deepEqual(f.current(),['A','B','C','D','E']);
  assert.equal(f.actions.filter(x=>x==='return').length,5);
  assert.ok(f.actions.lastIndexOf('return')<f.actions.indexOf('place'));
});
test('unsupported programmatic return leaves existing placements and stops',async()=>{
  const f=fixture({prefilled:{0:1},returnMode:'noChange'});
  const result=await run(f.widget,f.response,f.ref);
  assert.equal(result.status,'uncertain');
  assert.match(result.detail,/RESET_RETURN_UNVERIFIED/);
  assert.deepEqual(f.current(),['Beta','','']);
  assert.equal(f.actions.filter(x=>x==='place').length,0);
});
test('unacknowledged return does not click twice or fill gaps',async()=>{
  const f=fixture({prefilled:{0:1},returnMode:'noSelection'});
  assert.match((await run(f.widget,f.response,f.ref)).detail,/RESET_SOURCE_NOT_SELECTED/);
  assert.equal(f.actions.length,1);
  assert.deepEqual(f.current(),['Beta','','']);
});
test('rerender after return preserves live target binding',async()=>{
  const f=fixture({prefilled:{0:1,1:0},targetIds:true,duplicateIds:true,
    rerenderTargetsAfterReturn:true});
  const result=await run(f.widget,f.response,f.ref);
  assert.equal(result.status,'filled',result.detail);
  assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
});
test('a correct return followed by failed placement reports partial state',async()=>{
  const f=fixture({prefilled:{0:1},disableSlot:true});
  const result=await run(f.widget,f.response,f.ref);
  assert.equal(result.status,'uncertain');
  assert.equal(f.actions.filter(x=>x==='return').length,1);
  assert.deepEqual(f.current(),['','','']);
});

for(const [name,options] of [
 ['handle replacement',{rerenderHandleAfterSelection:true}],
 ['delayed return',{delayedReturn:true}]
])test('full reset handles '+name,async()=>{
 const f=fixture({prefilled:{0:1,1:0,2:2},targetIds:true,duplicateIds:true,...options});
 const result=await run(f.widget,f.response,f.ref);
 assert.equal(result.status,'filled',result.detail);
 assert.equal(f.actions.filter(x=>x==='return').length,3);
 assert.ok(f.actions.lastIndexOf('return')<f.actions.indexOf('place'));
 assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
});
test('second failed return prevents refill and later Solve resumes actual state',async()=>{
 const f=fixture({prefilled:{0:1,1:0,2:2},returnFailureAt:2});
 assert.match((await run(f.widget,f.response,f.ref)).detail,/RESET_RETURN_UNVERIFIED/);
 assert.deepEqual(f.current(),['','Alpha','Gamma']);
 assert.equal(f.actions.filter(x=>x==='return').length,1);
 assert.equal(f.actions.filter(x=>x==='place').length,0);
 assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
 assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
 assert.equal(f.actions.filter(x=>x==='return').length,3);
 assert.ok(f.actions.lastIndexOf('return')<f.actions.indexOf('place'));
});
test('wrong pool return fails reset barrier',async()=>{
 const f=fixture({prefilled:{0:1,1:0},returnWrongHomeAt:1});
 assert.match((await run(f.widget,f.response,f.ref)).detail,/RESET_RETURN_UNVERIFIED/);
 assert.equal(f.actions.filter(x=>x==='place').length,0);
 assert.deepEqual(f.current(),['','Alpha','']);
});
test('unknown occupant blocks before any return',async()=>{
 const f=fixture({prefilled:{0:1}});
 f.gaps[2].querySelector('.om-text-gap__droppable').append(el('om-text-gap__draggable','Unknown'));
 assert.match((await run(f.widget,f.response,f.ref)).detail,/RESET_UNSUPPORTED_OCCUPANT/);
 assert.equal(f.actions.length,0);
});
test('missing mapped source blocks before mutation',async()=>{
 const f=fixture({prefilled:{0:1}});
 const card=f.cards[2];card.parent.children=card.parent.children.filter(x=>x!==card);
 card.parent=null;card.isConnected=false;
 assert.match((await run(f.widget,f.response,f.ref)).detail,/RESET_IDENTITY_AMBIGUOUS/);
 assert.equal(f.actions.length,0);
});
test('concurrent Solve cannot interleave reset',async()=>{
 const f=fixture({prefilled:{0:1,1:0}});
 const first=run(f.widget,f.response,f.ref);
 assert.match((await run(f.widget,f.response,f.ref)).detail,/already running/);
 assert.equal((await first).status,'filled');
});

test('hidden gap measuring copy never supplies placed QTI identity',async()=>{
 const f=fixture({labels:['Same','Same'],duplicateIds:true,targetIds:true});
 f.cards.forEach((card,i)=>{
  card.closest('.om-text-gap__pool-item').attrs['data-choice-id']='T'+i;
  f.gaps[i].querySelector('.om-text-gap__droppable').append(card);
 });
 for(const gap of f.gaps){
  const measure=el('width-measure');
  measure.append(el('om-text-gap__draggable','Same',{'data-choice-id':'WRONG'}));
  measure.parent=gap;gap.children.unshift(measure);
 }
 assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
 assert.equal(f.actions.filter(x=>x==='return').length,2);
 assert.equal(f.actions.filter(x=>x==='place').length,2);
 assert.ok(f.actions.lastIndexOf('return')<f.actions.indexOf('place'));
 f.cards.forEach((card,i)=>assert.equal(card.closest('.om-text-gap__target-item'),f.gaps[i]));
 f.gaps.forEach(gap=>assert.equal(gap.querySelector('.width-measure')
   .querySelector('.om-text-gap__draggable').getAttribute('data-choice-id'),'WRONG'));
});

for(const [name,prefilled] of Object.entries({empty:{},partial:{2:2,3:3,4:4},full:{0:0,1:1,2:2,3:3,4:4},wrong:{2:4,3:2,4:3}})){
 test('occupied gaps without placeholders reset then refill: '+name,async()=>{
  const f=fixture({labels:['First name','Nationality','Address','Passport no.','Marital status'],prefilled});
  f.gaps.forEach((gap,i)=>{
   gap.attrs['data-model-id']=String(200+i);f.ref.targets[i].modelId=String(200+i);
   const caption=gap.querySelector('.caption');
   const removeCaption=()=>{gap.children=gap.children.filter(child=>child!==caption);caption.parent=null;};
   if(gap.querySelector('.om-text-gap__draggable'))removeCaption();
   const slot=gap.querySelector('.om-text-gap__droppable'),place=slot.onClick;
   slot.onClick=()=>{place();removeCaption();};
  });
  for(let attempt=0;attempt<2;attempt++){
   const start=f.actions.length;
   assert.equal((await run(f.widget,f.response,f.ref)).status,'filled');
   const actions=f.actions.slice(start),returns=attempt?5:Object.keys(prefilled).length;
   assert.equal(actions.filter(x=>x==='return').length,returns);
   assert.equal(actions.filter(x=>x==='place').length,5);
   assert.ok(actions.lastIndexOf('return')<actions.indexOf('place'));
   assert.deepEqual(f.current(),f.pairs.map(pair=>pair.source));
  }
 });
}

for(const [name,prefilled] of Object.entries({twoInPool:{2:2,3:3,4:4},allOccupied:{0:0,1:1,2:2,3:3,4:4},allWrong:{0:1,1:2,2:3,3:4,4:0},mixed:{1:3,4:1}})){
 test('return to any empty pool slot then fill, repeated: '+name,async()=>{
  const f=fixture({labels:['First name','Nationality','Address','Passport no.','Marital status'],prefilled,returnToAnyPool:true});
  for(let attempt=0;attempt<2;attempt++){
   const start=f.actions.length;
   const result=await run(f.widget,f.response,f.ref);
   assert.equal(result.status,'filled',result.detail);
   const actions=f.actions.slice(start);
   assert.equal(actions.filter(x=>x==='return').length,attempt?5:Object.keys(prefilled).length);
   assert.equal(actions.filter(x=>x==='place').length,5);
   assert.ok(actions.lastIndexOf('return')<actions.indexOf('place'));
   assert.deepEqual(f.current(),f.pairs.map(pair=>pair.source));
  }
 });
}

test('failed return identifies answer, gap, actual clicks and remaining DOM state',async()=>{
 const f=fixture({prefilled:{2:1},returnMode:'unsupported'});
 const result=await run(f.widget,f.response,f.ref);
 assert.equal(result.status,'uncertain');
 assert.match(result.detail,/RESET_RETURN_UNVERIFIED/);
 const detail=JSON.parse(result.detail.slice(result.detail.indexOf(': ')+2));
 assert.equal(detail.answer,'beta');assert.equal(detail.targetId,'G2');assert.equal(detail.clicks,2);
 assert.match(detail.interaction,/handle/);
 assert.equal(detail.remainingGaps[0].targetId,'G2');
 assert.equal(detail.remainingGaps[0].answer,'beta');
 assert.equal(detail.remainingGaps[0].selected,true);
 assert.equal(detail.remainingGaps[0].handleConnected,true);
 assert.equal(detail.poolItems.length,2);
 assert.equal(f.actions.filter(x=>x==='place').length,0);
});
for(const mode of ['lost','duplicated'])test('return conservation blocks filling when a tile is '+mode,async()=>{
 const f=fixture({prefilled:{0:1,1:0}});
 const handle=f.cards[1].querySelector('.om-text-gap__draggable-handle'),click=handle.onClick;
 handle.onClick=()=>{
  const before=f.actions.filter(x=>x==='return').length;click();
  if(f.actions.filter(x=>x==='return').length===before)return;
  const card=f.cards[1];
  if(mode==='lost'){card.parent.children=card.parent.children.filter(child=>child!==card);card.parent=null;card.isConnected=false;}
  else card.parent.append(el('om-text-gap__draggable','Beta',{'data-model-id':card.getAttribute('data-model-id')}));
 };
 assert.equal((await run(f.widget,f.response,f.ref)).status,'uncertain');
 assert.equal(f.actions.filter(x=>x==='place').length,0);
});

test('pool box identifiers do not override current uniquely labelled cards',async()=>{
 const f=fixture({prefilled:{0:1,1:2,2:0},returnToAnyPool:true});
 f.cards.forEach((card,i)=>{
  const home=f.widget.querySelectorAll('.om-text-gap__pool-item')[i];
  home.attrs['data-choice-id']='T'+i;
 });
 const result=await run(f.widget,f.response,f.ref);
 assert.equal(result.status,'filled',result.detail);
 assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
 assert.ok(f.actions.lastIndexOf('return')<f.actions.indexOf('place'));
});

test('already-selected return waits for the tile to arrive in the pool',async()=>{
 const f=fixture({prefilled:{0:1}});
 const card=f.cards[1],handle=card.querySelector('.om-text-gap__draggable-handle');
 handle.click();
 const click=handle.onClick;
 handle.onClick=()=>{
  click();
  const home=card.parent;
  if(!card.closest('.om-text-gap__pool-item'))return;
  home.children=home.children.filter(child=>child!==card);card.parent=null;
  setTimeout(()=>home.append(card),4);
 };
 const result=await run(f.widget,f.response,f.ref);
 assert.equal(result.status,'filled',result.detail);
 assert.equal(f.actions.filter(action=>action==='return').length,1);
 assert.ok(f.actions.lastIndexOf('return')<f.actions.indexOf('place'));
 assert.deepEqual(f.current(),['Alpha','Beta','Gamma']);
});
