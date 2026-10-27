(function(root){
'use strict';
if(root.SparkSequenceSolver)return;
  async function solve(p,response) {
    const {tidy,normalized,tileText,sameWords,wait}=p;
    const desired=Array.isArray(response.orderedTokens)?response.orderedTokens.map(tidy):[];
    const original=p.tiles().map(tileText);
    if(desired.length<2 || !sameWords(original,desired))return {status:'skipped',detail:'QTI order does not match the visible tiles.'};
    if(!p.uniqueList())return {status:'skipped',detail:'Sequence list is ambiguous.'};
    const stable=()=>p.tiles();
    if(stable().length!==desired.length)return {status:'skipped',detail:'Sequence contains unexpected tiles.'};
    const fixed=stable().map((el,i)=>p.fixed(el)?i:-1).filter(i=>i>=0);
    if(fixed.some(i=>normalized(tileText(stable()[i]))!==normalized(desired[i])))
      return {status:'skipped',detail:'Fixed punctuation does not match the QTI order.'};

    // Wait for the widget's drag clone/placeholder and asynchronous reflow to
    // settle. A fixed 250ms sleep could misread an in-flight reordering as a
    // failure and force the user to press Solve again.
    async function waitForSequenceStep(position,expected,beforeIds) {
      const deadline=Date.now()+1800;
      let unchangedAt=0,previous='';
      while(Date.now()<deadline){
        const tiles=stable();
        const ids=tiles.map(el=>p.identity(el)).join('\u0001');
        const dragging=p.pending();
        if(tiles.length===desired.length && !dragging &&
          normalized(tileText(tiles[position]))===normalized(expected) && ids!==beforeIds){
          // Allow Spark a final animation/frame to update its model.
          await wait(120);
          const final=stable();
          if(final.length===desired.length && normalized(tileText(final[position]))===normalized(expected))return true;
        }
        if(ids!==previous){previous=ids;unchangedAt=Date.now();}
        if(unchangedAt && Date.now()-unchangedAt>=500 && !dragging && ids===beforeIds)break;
        await wait(80);
      }
      return false;
    }

    // Retry the *same* still-unsolved position within this click, instead of
    // making the user press Solve twice. Bounded work prevents runaway drags.
    for(let i=0;i<desired.length;i++){
      let attempts=0;
      while(normalized(tileText(stable()[i]))!==normalized(desired[i])){
        const current=stable();
        if(current.length!==desired.length)return {status:'uncertain',detail:'Sequence changed during dragging.'};
        if(p.fixed(current[i]))return {status:'skipped',detail:'Cannot move a fixed tile.'};
        const candidates=current.slice(i+1).filter(el=>normalized(tileText(el))===normalized(desired[i])&&!p.fixed(el));
        if(candidates.length!==1)return {status:'skipped',detail:'Ambiguous repeated word; refusing to guess tile identity.'};
        if(attempts++>=2)return {status:'uncertain',detail:'Spark did not accept the drag after two attempts; stopping safely.'};
        const beforeIds=current.map(el=>p.identity(el)).join('\u0001');
        const moved=await p.drag(candidates[0],current[i],true);
        if(!moved || !(await waitForSequenceStep(i,desired[i],beforeIds))){
          // The tile may have moved while the widget was settling; re-read
          // state rather than applying a second drag against stale elements.
          if(normalized(tileText(stable()[i]))===normalized(desired[i]))continue;
          if(attempts>=2)return {status:'uncertain',detail:'Spark did not confirm the synthetic drag. No DOM-only fallback was used.'};
          await wait(180);
        }
      }
    }
    const correct=stable().map(tileText).every((t,i)=>normalized(t)===normalized(desired[i]));
    return {status:correct?'filled':'uncertain',detail:correct?
      'Visible sequence verified; Spark persistence is not independently confirmed.':
      'Sequence order could not be verified.'};
  }
root.SparkSequenceSolver={solve};
})(globalThis);
