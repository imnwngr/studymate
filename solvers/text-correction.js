(function(root){
'use strict';
if(root.SparkCorrectionSolver)return;
  async function solve(p,response){
    const {correctionNorm,visible}=p;
    const edits=response.corrections;
    if(!Array.isArray(edits)||!edits.length||edits.length>20 ||
      edits.some(e=>!e||typeof e.from!=='string'||typeof e.to!=='string'||
        !e.from.trim()||!e.to.trim()||correctionNorm(e.from)===correctionNorm(e.to)))
      return {status:'skipped',detail:'Missing validated QTI word-correction pairs.'};
    if(!p.available())return {status:'uncertain',detail:'Correction widget is missing.'};
    const startTokens=p.tokens();
    const baseline=startTokens.map(t=>correctionNorm(t.textContent));
    const expected=baseline.slice();
    const used=new Set();
    for(const edit of edits){
      const tokens=p.tokens();
      if(tokens.length!==baseline.length)
        return {status:'uncertain',detail:'Spark changed the number of correction tokens.'};
      const indexed=Number.isSafeInteger(edit.tokenIndex)?edit.tokenIndex:-1;
      // Older mock fixtures lack indices. For published QTI the mapper always
      // supplies the exact visible position, preventing cross-position swaps.
      const candidates=indexed>=0?[indexed]:tokens.flatMap((node,i)=>
        correctionNorm(node.textContent)===correctionNorm(edit.from)?[i]:[]);
      if(candidates.length!==1||candidates[0]<0||candidates[0]>=tokens.length||used.has(candidates[0]))
        return {status:'uncertain',detail:`Cannot uniquely locate word: ${edit.from}`};
      const index=candidates[0],target=tokens[index];
      used.add(index);
      const current=correctionNorm(target.textContent);
      if(current===correctionNorm(edit.to) &&
        (p.modified(target))){
        expected[index]=correctionNorm(edit.to);
        continue;
      }
      if(current!==correctionNorm(edit.from)){
        const modified=p.modified(target);
        if(edit.anchorVerified!==true||!modified)
          return {status:'uncertain',detail:`QTI position ${index+1} changed unexpectedly.`};
      }
      if(!visible(target))return {status:'uncertain',detail:'Correction target is not visible.'};
      if(p.editorOpen())
        return {status:'uncertain',detail:'Close the open Spark correction editor and retry.'};
      p.open(target);
      const popup=await p.popup();
      if(popup){
        const confirmed=await p.confirm(target,edit.to,popup);
        if(!confirmed)return {status:'uncertain',detail:`Spark popup did not confirm ${edit.from} → ${edit.to}.`};
      }else{
        if(!await p.choose(edit.to))return {status:'uncertain',detail:'No unique replacement control.'};
      }
      expected[index]=correctionNorm(edit.to);
      const after=p.tokens().map(t=>correctionNorm(t.textContent));
      if(after.length!==expected.length||after.some((value,i)=>value!==expected[i]))
        return {status:'uncertain',detail:'Spark changed a different word while correcting this position.'};
    }
    const final=p.tokens().map(t=>correctionNorm(t.textContent));
    if(final.length!==expected.length||final.some((value,i)=>value!==expected[i]))
      return {status:'uncertain',detail:'Full word-correction position audit failed.'};
    return {status:'filled',detail:'All QTI correction positions verified in Spark; gradebook not confirmed.'};
  }
root.SparkCorrectionSolver={solve};
})(globalThis);
