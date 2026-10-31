/* Spark QTI Reader. Pure structural parser: never executes published scripts.
 * A QTI declaration is accepted only when it is consistent with the controls
 * present on the active Spark screen. */
(function(root){
  'use strict';
  const MAX_SOURCE=2_000_000,MAX_XML=1_000_000;
  const clean=value=>String(value??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const norm=value=>clean(value).normalize('NFKC').toLowerCase().replace(/[’]/g,"'");
  // Word-correction alternatives can differ ONLY in capitalization:
  // "Occupation" (incorrect on the DOB line) vs "occupation" (correct
  // on the Current occupation line). Never case-fold correction tokens.
  const correctionNorm=value=>clean(value).normalize('NFKC').replace(/[’]/g,"'");
  const name=node=>node?.localName||node?.nodeName?.split(':').pop()||'';
  const children=(node,tag)=>[...(node?.children||[])].filter(el=>name(el)===tag);
  const child=(node,tag)=>children(node,tag)[0]||null;
  const descendants=(node,tag)=>[...(node?.getElementsByTagName?.('*')||[])].filter(el=>name(el)===tag);
  const attr=(node,key)=>node?.getAttribute?.(key)||'';
  const recognised=new Set(['inlineChoiceInteraction','choiceInteraction','textEntryInteraction','extendedTextInteraction','gapMatchInteraction','associateInteraction','orderInteraction','matchInteraction']);
  function assessmentsFromDataJs(source,parser){
    if(typeof source!=='string'||source.length>MAX_SOURCE||!parser?.parseFromString)return [];
    const regex=/"([^"\\]{1,120}\.xml)"\s*:\s*("(?:\\.|[^"\\])*")/g;
    const files=[];let match;
    while((match=regex.exec(source))!==null){
      let decoded;
      try{decoded=JSON.parse(match[2]);}catch{continue;}
      if(typeof decoded!=='string'||decoded.length>MAX_XML||!decoded.trimStart().startsWith('<'))continue;
      let xml;
      try{xml=parser.parseFromString(decoded,'application/xml');}catch{continue;}
      if(descendants(xml,'parsererror').length||name(xml.documentElement)!=='assessmentItem')continue;
      files.push({xml,filename:match[1]});
    }
    return files;
  }
  function xmlFromDataJs(source,parser){
    const list=assessmentsFromDataJs(source,parser);
    return list[0]||{error:typeof source!=='string'||source.length>MAX_SOURCE?'invalidData':'noAssessment'};
  }
  const interactionNodes=xml=>[...(xml?.getElementsByTagName?.('*')||[])].filter(n=>recognised.has(name(n)));
  function declaredResponses(xml){
    const map=new Map(), diagnostics=[];
    for(const el of descendants(xml,'responseDeclaration')){
      const id=attr(el,'identifier');
      const values=children(child(el,'correctResponse'),'value').map(n=>clean(n.textContent)).filter(Boolean);
      if(!id||map.has(id)){diagnostics.push('duplicateOrMissingResponseId');continue;}
      if(values.length)map.set(id,{values,baseType:attr(el,'baseType'),cardinality:attr(el,'cardinality')});
    }
    return {map,diagnostics};
  }
  function textVariants(values){
    // Spark text-gap QTI can encode accepted alternatives with a literal pipe,
    // or as multiple <value> siblings. Only the FIRST valid variant is typed.
    return values.flatMap(v=>v.split('|').map(clean)).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
  }
  // Spark text correction is encoded as inlineChoiceInteraction QTI even
  // though its widget is a row of clickable .input-text spans, not dropdowns.
  // In this activity the declared value names the incorrect visible token;
  // the other published inlineChoice is the replacement offered by Spark.
  // Align the ordered inlineChoice slots with the complete published QTI
  // sentence, rather than locating them by word labels alone. This is needed
  // when a previous run changed a wrong word to ANOTHER wrong word: for
  // example Current Date instead of Current occupation. The alignment is
  // accepted only when every ordinary (non-choice) token still agrees with
  // the source and the full token count matches Spark's displayed tokens.
  function correctionAnchors(xml,q,interactions){
    const tokens=(q.correctionTokens||[]).map(correctionNorm);
    if(!tokens.length||!interactions.length)return null;
    const paragraphs=interactions.map(interaction=>{
      let parent=interaction.parentNode;
      while(parent&&name(parent)!=='p')parent=parent.parentNode;
      return parent;
    });
    if(!paragraphs[0]||paragraphs.some(p=>p!==paragraphs[0]))return null;
    const sequence=[],anchors=new Map();
    const split=value=>(String(value||'').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)||[]).map(correctionNorm);
    function visit(node){
      if(node.nodeType===3||node.nodeType===4){sequence.push(...split(node.nodeValue));return;}
      if(name(node)==='inlineChoiceInteraction'){
        anchors.set(node,sequence.length);sequence.push(null);return;
      }
      if(node.childNodes?.length){for(const childNode of node.childNodes)visit(childNode);}
      else if(node.children?.length){
        // Plain Node test doubles have no childNodes. They are not trusted
        // for positional matching unless text and child order are available.
        if(node.text)sequence.push(...split(node.text));
        for(const childNode of node.children)visit(childNode);
      }else if(node.text)sequence.push(...split(node.text));
    }
    visit(paragraphs[0]);
    if(sequence.length!==tokens.length||anchors.size!==interactions.length)return null;
    // A matched-length sentence with mismatched static words is suspicious:
    // do not silently fall back to matching only the five highlighted words.
    if(sequence.some((value,i)=>value!==null&&value!==tokens[i]))return false;
    return anchors;
  }
  const correctionModifiedAt=(q,i)=>Array.isArray(q.correctionModifiedIndices)&&q.correctionModifiedIndices.includes(i);
  function wordPoolInventoryMatches(q,sourceLabels){
    const expected=sourceLabels.map(norm).sort().join('\0');
    const possibilities=[q.poolLabels,...(q.wordPoolBankAlternatives||[])];
    return possibilities.some(labels=>Array.isArray(labels)&&labels.length===sourceLabels.length&&
      labels.every(label=>norm(label))&&labels.map(norm).sort().join('\0')===expected);
  }
  function mapStructuredCorrection(xml,q){
    const fail=reason=>({answers:[],total:1,reason:'UNSUPPORTED',diagnostics:[reason]});
    const body=descendants(xml,'itemBody')[0],interactions=interactionNodes(xml);
    const declarations=declaredResponses(xml);
    const rubric=descendants(body,'div').find(n=>attr(n,'id')==='rubric');
    if(!/correct\s+(?:the\s+)?\w*\s*errors?/.test(norm(rubric?.textContent||body?.textContent)) ||
      !interactions.length||interactions.length>20||interactions.some(n=>name(n)!=='inlineChoiceInteraction')||declarations.diagnostics.length)
      return fail('correctionStructureUnsupported');
    const content=descendants(body,'div').find(n=>attr(n,'id')==='content');
    const paragraphs=content?descendants(content,'p'):descendants(body,'p').filter(p=>descendants(p,'inlineChoiceInteraction').length);
    if(paragraphs.length!==q.correctionGroups.length)return fail('correctionSentenceCountMismatch');
    const edits=[],originals=[],seen=new Set();let offset=0;
    const split=value=>String(value||'').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)||[];
    for(let sentence=0;sentence<paragraphs.length;sentence++){
      const sequence=[];
      const visit=node=>{
        if(node.nodeType===3||node.nodeType===4){sequence.push(...split(node.nodeValue));return;}
        if(name(node)==='inlineChoiceInteraction'){sequence.push(node);return;}
        if(node.childNodes?.length)for(const childNode of node.childNodes)visit(childNode);
        else if(node.children?.length){if(node.text)sequence.push(...split(node.text));for(const childNode of node.children)visit(childNode);}
        else if(node.text)sequence.push(...split(node.text));
      };
      visit(paragraphs[sentence]);
      const visible=q.correctionGroups[sentence];
      if(!Array.isArray(visible)||visible.length!==sequence.length)return fail('correctionSentenceShapeMismatch');
      for(let sentenceTokenIndex=0;sentenceTokenIndex<sequence.length;sentenceTokenIndex++){
        const node=sequence[sentenceTokenIndex],tokenIndex=offset+sentenceTokenIndex;
        const position={sentence,sentenceTokenIndex,tokenIndex};
        if(typeof node==='string'){
          originals.push({...position,text:node});
          continue;
        }
        const responseId=attr(node,'responseIdentifier'),declaration=declarations.map.get(responseId);
        const options=children(node,'inlineChoice').map(c=>({id:attr(c,'identifier'),label:clean(c.textContent)}));
        if(seen.has(responseId)||!responseId||!declaration||declaration.baseType!=='string'||declaration.cardinality!=='single'||
          declaration.values.length!==1||options.length<2||options.length>8||
          options.some(o=>!o.id||!o.label||/[|]/.test(o.label))||new Set(options.map(o=>o.id)).size!==options.length)
          return fail('correctionDeclarationAmbiguous');
        seen.add(responseId);
        const original=options.find(o=>o.id===declaration.values[0]);
        const alternatives=options.filter(o=>o!==original).map(o=>o.label);
        if(!original||!alternatives.length||new Set(alternatives).size!==alternatives.length||alternatives.includes(original.label))
          return fail('correctionAlternativesAmbiguous');
        originals.push({...position,text:original.label});
        edits.push({from:original.label,to:alternatives[0],alternatives,
          responseId,sentence,sentenceTokenIndex,tokenIndex,anchorVerified:true});
      }
      offset+=sequence.length;
    }
    if(edits.length!==interactions.length||seen.size!==declarations.map.size)return fail('correctionMappingIncomplete');
    return {answers:[{id:q.id,answer:edits.map(e=>e.from+' → '+e.to).join(' ; '),source:'qti',confidence:'high',
      correctionVerified:true,originals,corrections:edits}],total:1,reason:'complete',diagnostics:[]};
  }
  function mapTextCorrection(xml,q){
    if(Array.isArray(q.correctionGroups))return mapStructuredCorrection(xml,q);
    const fail=reason=>({answers:[],total:1,reason,diagnostics:[reason]});
    const prompt=norm(child(xml.getElementsByTagName('itemBody')[0],'div')?.textContent||
      descendants(xml,'itemBody')[0]?.textContent||'');
    if(!/correct\s+(?:the\s+)?\w*\s*errors?/.test(prompt))return fail('notWordCorrectionPrompt');
    const interactions=interactionNodes(xml);
    if(!interactions.length||interactions.length>20||
      interactions.some(el=>name(el)!=='inlineChoiceInteraction'))return fail('correctionInteractionType');
    const {map:declared}=declaredResponses(xml);
    const tokens=(q.correctionTokens||[]).map(correctionNorm);
    const modified=(q.correctionModifiedTokens||[]).map(correctionNorm);
    if(!tokens.length)return fail('missingVisibleCorrectionTokens');
    const edits=[];
    const anchors=correctionAnchors(xml,q,interactions);
    if(anchors===false)return fail('correctionFixedContentMismatch');
    for(const el of interactions){
      const responseId=attr(el,'responseIdentifier');
      const declaration=declared.get(responseId);
      const options=children(el,'inlineChoice').map(o=>({id:attr(o,'identifier'),label:clean(o.textContent)}));
      if(!declaration||declaration.values.length!==1||options.length!==2||
        options.some(o=>!o.id||!o.label)||new Set(options.map(o=>o.id)).size!==2)
        return fail('correctionDeclarationMismatch');
      const incorrect=options.find(o=>o.id===declaration.values[0]);
      const replacement=options.find(o=>o.id!==declaration.values[0]);
      if(!incorrect||!replacement||correctionNorm(incorrect.label)===correctionNorm(replacement.label))
        return fail('correctionPairAmbiguous');
      const incorrectMatches=tokens.flatMap((token,index)=>
        token===correctionNorm(incorrect.label)?[index]:[]);
      const replacementMatches=tokens.flatMap((token,index)=>
        token===correctionNorm(replacement.label)?[index]:[]);
      const alreadyCorrected=incorrectMatches.length===0 && replacementMatches.length===1 &&
        (correctionModifiedAt(q,replacementMatches[0]) ||
          modified.filter(t=>t===correctionNorm(replacement.label)).length===1);
      let tokenIndex,anchorVerified=false;
      if(anchors){
        tokenIndex=anchors.get(el);
        anchorVerified=true;
        const current=tokens[tokenIndex];
        // An unrecognised token is repairable only if Spark itself marks
        // that precise QTI position as previously modified.
        if(current!==correctionNorm(incorrect.label)&&current!==correctionNorm(replacement.label) &&
          !correctionModifiedAt(q,tokenIndex))return fail('correctionUnexpectedUnmodifiedToken');
        if(current===correctionNorm(replacement.label)&&
          !correctionModifiedAt(q,tokenIndex) &&
          modified.filter(t=>t===current).length!==1)return fail('correctionUnverifiedReplacement');
      }else{
        if(incorrectMatches.length!==1&&!alreadyCorrected)return fail('correctionTargetNotUnique');
        tokenIndex=alreadyCorrected?replacementMatches[0]:incorrectMatches[0];
      }
      if(edits.some(edit=>edit.tokenIndex===tokenIndex))return fail('correctionPositionsOverlap');
      edits.push({from:incorrect.label,to:replacement.label,responseId,tokenIndex,anchorVerified});
    }
    if(new Set(edits.map(e=>correctionNorm(e.from))).size!==edits.length)return fail('duplicateCorrectionTargets');
    return {answers:[{id:q.id,answer:edits.map(e=>`${e.from} → ${e.to}`).join(' ; '),
      corrections:edits,confidence:'high',source:'qti',manualOnly:false,
      explanation:'Validated word-correction alternatives from published QTI; Spark UI must confirm changes.'}],
      total:1,interactions:interactions.length,reason:'complete',diagnostics:[]};
  }
  function mapPronunciation(xml,q){
    const fail=reason=>({answers:[],total:1,reason,diagnostics:[reason]});
    if(attr(xml.documentElement||xml,'identifier')!=='Identify:Mark:Marking' || !q.applyable)
      return fail('UNSUPPORTED_MARKING');
    const interactions=interactionNodes(xml),{map,diagnostics}=declaredResponses(xml);
    if(diagnostics.length||interactions.length!==1||name(interactions[0])!=='gapMatchInteraction')
      return fail('UNSUPPORTED_MARKING_STRUCTURE');
    const interaction=interactions[0],options=children(interaction,'gapText');
    const declaration=map.get(attr(interaction,'responseIdentifier'));
    if(options.length!==1||!/^#[0-9a-f]{6}$/i.test(attr(options[0],'style')) ||
      !declaration||declaration.baseType!=='identifier'||declaration.cardinality!=='ordered'||declaration.values.length!==1)
      return fail('UNSUPPORTED_MARKING_DECLARATION');
    const optionId=attr(options[0],'identifier'),color=attr(options[0],'style').toLowerCase();
    // Marking uses one ordered value: option identifier followed by all its gap identifiers.
    const values=declaration.values[0].split(/\s+/),gaps=descendants(interaction,'gap');
    const groups=descendants(interaction,'p').map(p=>descendants(p,'gap')).filter(g=>g.length);
    const visible=q.markingGroups;
    if(!optionId||values.shift()!==optionId||!values.length||new Set(values).size!==values.length||
      !gaps.length||gaps.length>100||new Set(gaps.map(g=>attr(g,'identifier'))).size!==gaps.length||
      gaps.some(g=>!attr(g,'identifier'))||groups.flat().length!==gaps.length||
      !Array.isArray(visible)||visible.length!==groups.length||q.markingColor!==color)
      return fail('UNSUPPORTED_MARKING_MAPPING');
    const targets=[];
    for(let group=0;group<groups.length;group++){
      if(!Array.isArray(visible[group])||visible[group].length!==groups[group].length)
        return fail('MARKING_GROUP_MISMATCH');
      for(let segment=0;segment<groups[group].length;segment++){
        const gap=groups[group][segment],label=clean(attr(gap,'label'));
        if(!label||label!==clean(visible[group][segment]))return fail('MARKING_SEGMENT_MISMATCH');
        if(values.includes(attr(gap,'identifier')))targets.push({group,segment,gapId:attr(gap,'identifier'),optionId,color});
      }
    }
    if(targets.length!==values.length)return fail('MARKING_ANSWER_MISSING');
    return {answers:[{id:q.id,answer:targets.map(t=>visible[t.group][t.segment]).join(' | '),
      source:'qti',confidence:'high',markingVerified:true,targets}],total:1,reason:'complete',diagnostics:[]};
  }
  function mapAssessment(xml,questions){
    if(Array.isArray(questions)&&questions.length===1&&questions[0]?.kind==='pronunciation')
      return mapPronunciation(xml,questions[0]);
    if(Array.isArray(questions)&&questions.length===1&&questions[0]?.kind==='textCorrection')
      return mapTextCorrection(xml,questions[0]);
    const diagnostics=[],interactions=interactionNodes(xml),{map:declared,diagnostics:declErrors}=declaredResponses(xml);
    diagnostics.push(...declErrors);
    if(!Array.isArray(questions)||!questions.length||interactions.length!==questions.length){
      return {answers:[],total:questions?.length||0,interactions:interactions.length,reason:'interactionCountMismatch',diagnostics};
    }
    const answers=[];
    for(let i=0;i<interactions.length;i++){
      const el=interactions[i],q=questions[i],type=name(el),responseId=attr(el,'responseIdentifier');
      const declaration=declared.get(responseId),fail=reason=>diagnostics.push(`item${i+1}:${reason}`);
      if(!declaration){fail('missingDeclaration');continue;}
      let answer='',selectedIds=[],selectedLabels=[],choiceOptions=[],alternatives=[],pairs=[];
      if(type==='inlineChoiceInteraction'||type==='choiceInteraction'){
        const supported=type==='inlineChoiceInteraction'?q.kind==='dropdown':['choice','multi','checkbox'].includes(q.kind);
        if(!supported){fail('unsupportedControl');continue;}
        const tag=type==='inlineChoiceInteraction'?'inlineChoice':'simpleChoice';
        const options=children(el,tag).map(x=>({id:attr(x,'identifier'),label:clean(x.textContent)}));
        const ids=options.map(x=>x.id),labels=options.map(x=>norm(x.label));
        if(options.length<2||ids.some(x=>!x)||new Set(ids).size!==ids.length||labels.some(x=>!x)||(!q.reviewIdentity&&new Set(labels).size!==labels.length)){fail('choiceMismatch');continue;}
        if(type==='inlineChoiceInteraction'){
          if(options.length!==q.options?.length ||
             labels.slice().sort().join('\u0000')!==q.options.map(norm).sort().join('\u0000')){fail('choiceMismatch');continue;}
        } else {
          // Spark shuffles radio/checkbox labels at runtime. The stable C0_1
          // identifier is part of the DOM class; never trust the QTI position.
          if(options.length!==q.choiceIds?.length ||
             ids.slice().sort().join('\u0000')!==q.choiceIds.slice().sort().join('\u0000')){fail('choiceMismatch');continue;}
          if(q.choiceLabelsVerified){
            if(q.options?.length!==q.choiceIds?.length ||
              q.choiceIds.some((id,index)=>norm(q.options[index])!==norm(options.find(c=>c.id===id)?.label))){
              fail('choiceLabelMismatch');continue;
            }
          } else if(q.choiceLabelsVerified===false){
            // For Review radio groups whose clickable node has no readable label,
            // use the displayed sentence+options. Bare C0_n IDs are reusable
            // across XML documents and are not proof of matching the screen.
            const context=norm(q.context);
            const hasLabel=label=>{
              const text=norm(label);
              if(text.length<2)return false;
              const escaped=text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
              return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,'u').test(context);
            };
            if(options.some(option=>!hasLabel(option.label))){fail('unverifiedChoiceLabels');continue;}
          }
          if(['multi','checkbox'].includes(q.kind) && declaration.cardinality!=='multiple'){fail('cardinalityMismatch');continue;}
          if(q.kind==='choice' && declaration.values.length!==1){fail('cardinalityMismatch');continue;}
        }
        const wanted=declaration.values;
        if(!wanted.length||new Set(wanted).size!==wanted.length||wanted.some(id=>!ids.includes(id))||
          ((type==='inlineChoiceInteraction'||q.kind==='choice')&&wanted.length!==1)){fail('correctOptionMissing');continue;}
        selectedIds=wanted.slice();
        selectedLabels=wanted.map(id=>options.find(c=>c.id===id).label);
        choiceOptions=(q.choiceIds||[]).map(id=>options.find(c=>c.id===id)?.label||id);
        answer=selectedLabels.join(' | ');
      } else if(type==='textEntryInteraction'||type==='extendedTextInteraction'){
        if(q.kind!=='text'||q.options?.length||
           (declaration.cardinality && declaration.cardinality!=='single')||
           (declaration.baseType && declaration.baseType!=='string')){fail('textMismatch');continue;}
        alternatives=textVariants(declaration.values);
        if(!alternatives.length||alternatives.some(v=>v.length>400)){fail('textMismatch');continue;}
        if(/\bplay\s*,?\s*do\s*(?:or|\/)\s*go\b/i.test(q.rubric||'')&&q.wordBank){
          alternatives=alternatives.filter(v=>/^(?:play|do|go|plays|does|goes)\s+\S+/i.test(v));
          if(!alternatives.length){fail('incompleteCollocation');continue;}
        }
        answer=alternatives[0];
      } else if(type==='orderInteraction'){
        // Published Spark order sequences have explicit correctResponse identifier
        // order, but their Avallain drag/drop widget has no verified programmatic
        // adapter. Reveal the answer only; do not change DOM or submission state.
        if(q.kind!=='order'||!Array.isArray(q.orderTokens)||
           declaration.cardinality!=='ordered'||declaration.baseType!=='identifier'){
          fail('unsupportedOrderControl');continue;
        }
        const choices=children(el,'simpleChoice').map(n=>({id:attr(n,'identifier'),label:clean(n.textContent)}));
        const ids=choices.map(c=>c.id),tokens=choices.map(c=>norm(c.label));
        if(choices.length<2||ids.some(id=>!id)||tokens.some(t=>!t)||
           new Set(ids).size!==ids.length||declaration.values.length!==choices.length||
           declaration.values.some(id=>!ids.includes(id))||new Set(declaration.values).size!==ids.length){
          fail('orderDeclarationMismatch');continue;
        }
        const seen=a=>a.map(norm).sort().join('\u0000');
        if(seen(q.orderTokens)!==seen(choices.map(c=>c.label))){
          fail('orderTilesMismatch');continue;
        }
        selectedIds=declaration.values.slice();
        const ordered=selectedIds.map(id=>choices.find(c=>c.id===id).label);
        selectedLabels=ordered;
        answer=ordered.join(' ').replace(/\s+([,.!?;:])/g,'$1');
      } else if(type==='gapMatchInteraction' && q.kind==='gapWordPool'){
        // On Spark's om-text-gap widget, QTI directed pairs name a gapText
        // choice and a gap. The target IDs are resolved against the order of
        // <gap> nodes IN the verified assessment, never against random DOM IDs.
        const sourceNodes=descendants(el,'gapText'),gapNodes=descendants(el,'gap');
        const sources=sourceNodes.map(n=>({id:attr(n,'identifier'),label:clean(n.textContent)}));
        const gaps=gapNodes.map(n=>attr(n,'identifier'));
        const sourceIds=sources.map(x=>x.id);
        if(!q.applyable || declaration.baseType!=='directedPair'||declaration.cardinality!=='multiple'||
          sources.length<2 || gaps.length!==q.gapCount ||
          sources.some(x=>!x.id||!x.label)||gaps.some(x=>!x)||
          new Set(sourceIds).size!==sources.length||new Set(gaps).size!==gaps.length||
          !wordPoolInventoryMatches(q,sources.map(x=>x.label)) ||
          declaration.values.length!==gaps.length){fail('wordPoolQtiMismatch');continue;}
        const mapped=new Map();let safe=true;
        for(const value of declaration.values){
          const ids=clean(value).split(/\s+/);
          if(ids.length!==2||!sourceIds.includes(ids[0])||!gaps.includes(ids[1])||mapped.has(ids[1])){safe=false;break;}
          mapped.set(ids[1],ids[0]);
        }
        if(!safe||mapped.size!==gaps.length||
          new Set(mapped.values()).size!==mapped.size){fail('wordPoolPairsAmbiguous');continue;}
        pairs=gaps.map((id,targetIndex)=>{
          const sourceId=mapped.get(id);
          const source=sources.find(c=>c.id===sourceId).label;
          return {sourceId,targetId:id,source,
            labelAmbiguous:sources.filter(c=>norm(c.label)===norm(source)).length>1,
            target:`Gap ${targetIndex+1}`,targetIndex};
        });
        answer=pairs.map(e=>`${e.source} → ${e.target}`).join(' ; ');
      } else if(type==='gapMatchInteraction'||type==='associateInteraction'){
        if((q.applyable&&q.kind!=='linkingLines')||!['match','associate','manual','linkingLines'].includes(q.kind) ||
           !['directedPair','pair'].includes(declaration.baseType)||declaration.cardinality!=='multiple'){
          fail('unsupportedInteraction:'+type);continue;
        }
        const choiceNodes=[...descendants(el,'gapText'),...descendants(el,'gapImg'),...descendants(el,'gap'),...descendants(el,'simpleAssociableChoice')];
        const choices=new Map();
        for(const n of choiceNodes){const id=attr(n,'identifier');if(id && !choices.has(id))choices.set(id,clean(n.textContent)||
          (name(n)==='gap'?`Gap ${choices.size+1}`:id));}
        if(!choices.size){fail('pairChoicesMissing');continue;}
        let valid=true;
        for(const raw of declaration.values){
          const tuple=clean(raw).split(/\s+/);
          if(tuple.length!==2||!choices.has(tuple[0])||!choices.has(tuple[1])){valid=false;break;}
          pairs.push({sourceId:tuple[0],targetId:tuple[1],source:choices.get(tuple[0]),target:choices.get(tuple[1])});
        }
        if(!valid||!pairs.length){fail('pairMismatch');continue;}
        if(q.kind==='linkingLines'&&q.applyable){
          const sources=(q.linkingSources||[]).map(norm),targets=(q.linkingTargets||[]).map(norm);
          const labels=[...choices.values()].map(norm);
          const all=[...sources,...targets];
          if(choiceNodes.length!==choices.size||sources.length<2||sources.length!==targets.length||pairs.length!==sources.length||
             all.length!==labels.length||new Set(all).size!==all.length||new Set(labels).size!==labels.length||
             all.some(label=>!labels.includes(label))||
             new Set(pairs.map(p=>p.sourceId)).size!==pairs.length||
             new Set(pairs.map(p=>p.targetId)).size!==pairs.length||
             pairs.some(p=>!sources.includes(norm(p.source))||!targets.includes(norm(p.target)))){
            fail('linkingEndpointMismatch');continue;
          }
        }
        answer=pairs.map(p=>`${p.source} → ${p.target}`).join(' ; ');
      } else {fail('unsupportedInteraction:'+type);continue;}
      if(answer)answers.push({id:q.id,answer,confidence:'high',source:'qti',responseId,
        ...(selectedIds.length?{selectedIds,selectedLabels,choiceOptions}:{}),
        ...(alternatives.length?{acceptedVariants:alternatives}:{}),
        ...(pairs.length?{pairs}:{}),
        ...(q.kind==='gapWordPool'?{wordPoolVerified:true}:{}),
        ...(q.kind==='linkingLines'&&q.applyable?{linkingVerified:true}:{}),
        ...(type==='orderInteraction'?{manualOnly:false,orderedTokens:selectedLabels}:{}),
        explanation:'Declared correct response in the published exercise data.'});
    }
    return {answers,total:questions.length,interactions:interactions.length,
      reason:answers.length===questions.length?'complete':'partial',diagnostics};
  }
  function finger(value){return norm(value).replace(/\[\[\d+\]\]|\[other gap\]|\[___\]/gi,' ').replace(/^[\d]+[.)]\s*/,'').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();}
  function paragraph(node){
    let current=node;
    for(let n=0;n<8&&current;n++,current=current.parentNode){if(name(current)==='p')return clean(current.textContent);}
    return '';
  }
  function signatureScore(xml,questions){
    const its=interactionNodes(xml);
    if(questions.length===1&&questions[0]?.kind==='textCorrection'){
      if(Array.isArray(questions[0].correctionGroups))return mapStructuredCorrection(xml,questions[0]).answers.length?1:0;
      if(!its.length || its.some(el=>name(el)!=='inlineChoiceInteraction'))return 0;
      const declarations=declaredResponses(xml).map;
      const visible=(questions[0].correctionTokens||[]).map(correctionNorm);
      const modified=(questions[0].correctionModifiedTokens||[]).map(correctionNorm);
      const anchors=correctionAnchors(xml,questions[0],its);
      if(anchors===false)return 0;
      const matches=its.every(el=>{
        const declaration=declarations.get(attr(el,'responseIdentifier'));
        const answer=declaration?.values[0];
        const choices=children(el,'inlineChoice');
        const chosen=choices.find(c=>attr(c,'identifier')===answer);
        const other=choices.find(c=>attr(c,'identifier')!==answer);
        if(!chosen||!other||choices.length!==2)return false;
        if(anchors){
          const position=anchors.get(el),current=visible[position];
          return current===correctionNorm(chosen.textContent)||
            (current===correctionNorm(other.textContent)&&
              (correctionModifiedAt(questions[0],position)||modified.includes(current)))||
            correctionModifiedAt(questions[0],position);
        }
        const wrongCount=visible.filter(t=>t===correctionNorm(chosen.textContent)).length;
        return wrongCount===1||(wrongCount===0 &&
          visible.filter(t=>t===correctionNorm(other.textContent)).length===1 &&
          modified.filter(t=>t===correctionNorm(other.textContent)).length===1);
      });
      return matches?1:0;
    }
    if(its.length!==questions.length)return 0;
    if(its.length===1 && name(its[0])==='orderInteraction' && questions[0]?.kind==='order'){
      const tokens=children(its[0],'simpleChoice').map(c=>norm(c.textContent)).sort();
      const visible=(questions[0].orderTokens||[]).map(norm).sort();
      return tokens.length===visible.length && tokens.join('\u0000')===visible.join('\u0000')?1:0;
    }
    if(its.length===1 && name(its[0])==='gapMatchInteraction' && questions[0]?.kind==='gapWordPool'){
      const q=questions[0],el=its[0];
      const bank=descendants(el,'gapText').map(n=>norm(n.textContent)).sort();
      if(bank.length<2||!wordPoolInventoryMatches(q,bank)||
        descendants(el,'gap').length!==q.gapCount)return 0;
      // Both the word bank AND sentence context must point to this screen.
      const a=finger(el.textContent),b=finger(q.context||'');
      if(!a||!b)return 0;
      const aa=a.split(' '),bb=b.split(' '),bag=new Map();
      for(const token of aa)bag.set(token,(bag.get(token)||0)+1);
      let common=0;for(const token of bb){const n=bag.get(token)||0;if(n){common++;bag.set(token,n-1);}}
      return 2*common/(aa.length+bb.length);
    }
    let total=0,available=0;
    for(let i=0;i<its.length;i++){
      const a=finger(paragraph(its[i])),b=finger(questions[i]?.context||'');
      if(!a||!b)continue;
      // Character token overlap tolerates the blank marker and counter prefix.
      const aa=a.split(' '),bb=b.split(' ');
      const bag=new Map();for(const token of aa)bag.set(token,(bag.get(token)||0)+1);
      let same=0;for(const token of bb){const n=bag.get(token)||0;if(n){bag.set(token,n-1);same++;}}
      total+=2*same/(aa.length+bb.length);available++;
    }
    return available?total/available:0;
  }
  function mapReview(source,q,parser){
    const fail=(reason,group=null)=>({answers:[],total:1,reason:'UNSUPPORTED',diagnostics:[group===null?reason:'group'+group+':'+reason],group});
    const groups=q.reviewGroups;
    if(!q.applyable)return fail(q.reviewFailure?.reason||'reviewInventoryIncomplete',q.reviewFailure?.group??null);
    if(!Array.isArray(groups)||groups.length<2||groups.length>20)return fail('reviewInventoryIncomplete');
    const files=assessmentsFromDataJs(source,parser),manifests=[];
    const regex=/"LearningObjectInfo\.xml"\s*:\s*("(?:\\.|[^"\\])*")/g;let match;
    while((match=regex.exec(source))!==null){try{const text=JSON.parse(match[1]);if(text.length>MAX_XML||/<!DOCTYPE|<!ENTITY/i.test(text))return fail('unsafeManifest');
      const xml=parser.parseFromString(text,'application/xml');if(descendants(xml,'parsererror').length)return fail('invalidManifest');manifests.push(xml);}catch{return fail('invalidManifest');}}
    if(manifests.length!==1)return fail('reviewManifestMissingOrAmbiguous');
    const names=children(child(manifests[0].documentElement,'screens'),'screen').map(n=>clean(child(n,'name')?.textContent));
    if(names.length!==groups.length||names.some(n=>!n)||new Set(names).size!==names.length)return fail('reviewScreenCountMismatch');
    const mapped=[];
    for(let index=0;index<groups.length;index++){
      const candidates=files.filter(f=>f.filename===names[index]);
      if(candidates.length!==1)return fail('reviewAssessmentMissingOrAmbiguous',index);
      const group=groups[index],xml=candidates[0].xml;
      const types={choice:'Identify:Select:Radiobutton',checkbox:'Identify:Select:Checkbox',text:'Input:Completion:Text gap',dropdown:'Identify:Select:Dropdown'};
      if(attr(xml.documentElement,'identifier')!==types[group.kind])return fail('reviewInteractionTypeMismatch',index);
      const result=mapAssessment(xml,group.questions);
      if(result.reason!=='complete'||result.answers.length!==group.questions.length||declaredResponses(xml).diagnostics.length)
        return fail('reviewAnswerMappingIncomplete:'+result.diagnostics.join(','),index);
      mapped.push({index,kind:group.kind,filename:names[index],answers:result.answers});
    }
    return {answers:[{id:q.id,answer:mapped.map(g=>'Section '+(g.index+1)+': '+g.answers.map(a=>a.answer).join(' ; ')).join(' | '),
      source:'qti',confidence:'high',reviewVerified:true,groups:mapped}],total:1,reason:'complete',diagnostics:[],
      groupCount:mapped.length,responseCount:mapped.reduce((n,g)=>n+g.answers.length,0)};
  }
  function fromDataJs(source,questions,parser){
    if(typeof source!=='string'||source.length>MAX_SOURCE||!parser?.parseFromString)
      return {answers:[],total:questions?.length||0,reason:'invalidData',diagnostics:[]};
    if(questions?.length===1&&questions[0]?.kind==='review')return mapReview(source,questions[0],parser);
    const files=assessmentsFromDataJs(source,parser);
    if(!files.length)return {answers:[],total:questions?.length||0,reason:'noAssessment',diagnostics:[]};
    const candidates=files.map(f=>({...f,mapped:mapAssessment(f.xml,questions),signature:signatureScore(f.xml,questions)}));
    const viable=candidates.filter(f=>f.mapped.answers.length &&
      !(questions.length===1&&questions[0]?.kind==='gapWordPool'&&f.signature<0.55));
    if(questions.length===1&&['pronunciation','textCorrection'].includes(questions[0]?.kind)&&viable.length>1)
      return {answers:[],total:1,reason:'ambiguousAssessment',diagnostics:[questions[0].kind==='textCorrection'?'multipleCorrectionAssessments':'multipleMarkingAssessments']};
    if(!viable.length)return {...candidates[0].mapped,answers:[],reason:'noMapping',format:'QTI'};
    viable.sort((a,b)=>b.mapped.answers.length-a.mapped.answers.length||b.signature-a.signature);
    const best=viable[0],runner=viable[1];
    if(runner && best.mapped.answers.length===runner.mapped.answers.length &&
      (best.signature<0.55 || best.signature-runner.signature<0.15)){
      return {answers:[],total:questions?.length||0,reason:'ambiguousAssessment',diagnostics:['multipleQtiScreens']};
    }
    return {...best.mapped,filename:best.filename,format:'QTI',assessmentCount:files.length};
  }
  root.SparkQTI={fromDataJs,xmlFromDataJs,assessmentsFromDataJs,mapAssessment,signatureScore,norm,MAX_SOURCE};
})(typeof self!=='undefined'?self:globalThis);
