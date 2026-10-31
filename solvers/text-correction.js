(function(root){
'use strict';
if(root.SparkCorrectionSolver)return;
  async function solve(p,response){
    const {visible}=p;
    const edits=response.corrections,originals=response.originals;
    if(!Array.isArray(edits)||!edits.length||edits.length>20 ||
      edits.some(e=>!e||typeof e.from!=='string'||typeof e.to!=='string'||
        !e.from.trim()||!e.to.trim()||e.from===e.to))
      return {status:'skipped',detail:'Missing validated QTI word-correction pairs.'};
    const failure=(reason,edit,observed)=>({status:'uncertain',reason,phase:edit?.phase||'preflight',
      sentence:Number.isInteger(edit?.sentence)?edit.sentence+1:null,
      tokenIndex:Number.isInteger(edit?.sentenceTokenIndex)?edit.sentenceTokenIndex+1:edit?.tokenIndex,
      expected:edit?.to??null,observed,
      detail:reason+' phase='+(edit?.phase||'preflight')+' sentence='+(Number.isInteger(edit?.sentence)?edit.sentence+1:'?')+
        ' token='+(Number.isInteger(edit?.sentenceTokenIndex)?edit.sentenceTokenIndex+1:edit?.tokenIndex??'?')+
        ' expected='+JSON.stringify(edit?.to??null)+' observed='+JSON.stringify(observed)});
    if(!p.available())return failure('CORRECTION_WIDGET_MISSING',edits[0],null);
    const startTokens=p.tokens();
    const baseline=startTokens.map(t=>String(t.textContent));
    const expected=baseline.slice();
    const used=new Set();
    // Originals must cover every token in document order before the first editor opens.
    if(!Array.isArray(originals)||originals.length!==baseline.length||!originals.length||originals.length>250||
      originals.some((o,i)=>!o||o.tokenIndex!==i||typeof o.text!=='string'||!o.text.trim()||
        !Number.isSafeInteger(o.sentence)||o.sentence<0||!Number.isSafeInteger(o.sentenceTokenIndex)||o.sentenceTokenIndex<0)||
      new Set(originals.map(o=>o.sentence+':'+o.sentenceTokenIndex)).size!==originals.length)
      return failure('UNSUPPORTED_ORIGINAL_MAPPING',edits[0],baseline);
    for(const edit of edits){
      const original=originals[edit.tokenIndex];
      if(!original||!Number.isSafeInteger(edit.tokenIndex)||used.has(edit.tokenIndex)||edit.from!==original.text||
        edit.sentence!==original.sentence||edit.sentenceTokenIndex!==original.sentenceTokenIndex)
        return failure('UNSUPPORTED_MAPPING',edit,null);
      used.add(edit.tokenIndex);
    }
    if(p.preflight&&!p.preflight(edits,originals))return failure('UNSUPPORTED_MAPPING',edits[0],baseline);
    if(p.editorOpen())return failure('EDITOR_ALREADY_OPEN',edits[0],baseline);
    const audit=()=>{
      const actual=p.tokens().map(t=>String(t.textContent));
      return actual.length===expected.length&&actual.every((value,i)=>value===expected[i])&&!p.editorOpen();
    };
    const commit=async edit=>{
      const tokens=p.tokens();
      if(!audit())return failure('CORRECTION_POSITION_AUDIT_FAILED',edit,tokens.map(t=>t.textContent));
      const index=edit.tokenIndex,target=tokens[index];
      if(!visible(target))return failure('CORRECTION_TARGET_NOT_VISIBLE',edit,target.textContent);
      if(p.commit){
        const result=await p.commit(edit);
        if(result!==true)return failure(result?.reason||'CORRECTION_COMMIT_FAILED',edit,p.tokens()[index]?.textContent??null);
      }else{
        p.open(target);
        const popup=await p.popup();
        if(popup){
          const confirmed=await p.confirm(target,edit.to,popup);
          if(!confirmed)return failure('CORRECTION_COMMIT_FAILED',edit,target.textContent);
        }else{
          if(!await p.choose(edit.to))return failure('REPLACEMENT_CONTROL_MISSING',edit,target.textContent);
        }
      }
      expected[index]=edit.to;
      if(!audit())return failure('CORRECTION_POSITION_AUDIT_FAILED',edit,p.tokens().map(t=>t.textContent));
      return null;
    };
    for(const original of originals){
      if(expected[original.tokenIndex]===original.text)continue;
      const result=await commit({...original,from:expected[original.tokenIndex],to:original.text,phase:'reset'});
      if(result)return result;
    }
    const originalText=originals.map(o=>o.text);
    if(!audit()||expected.some((value,i)=>value!==originalText[i]))
      return failure('RESET_ORIGINAL_AUDIT_FAILED',{...edits[0],phase:'reset'},p.tokens().map(t=>t.textContent));
    for(const edit of edits){
      const result=await commit({...edit,phase:'correct'});
      if(result)return result;
    }
    if(!audit())return failure('FINAL_CORRECTION_AUDIT_FAILED',{...edits[edits.length-1],phase:'verify'},p.tokens().map(t=>t.textContent));
    return {status:'filled',detail:'SUCCESS: complete QTI original reset and final correction state verified; gradebook not confirmed.'};
  }
root.SparkCorrectionSolver={solve};
})(globalThis);
