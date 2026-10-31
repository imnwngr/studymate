// Synthetic sentences share the published widget/QTI structure, not Inspector content.
window.makeCorrectionFixture=function(config={}){
  const slot=(from,answers)=>({from,answers:Array.isArray(answers)?answers:[answers]});
  const groups=[['Ria','likes',slot('cook','cooking')],['They','enjoy',slot('to play','playing'),'outside'],
    [slot('Cook','Cooking'),'is','fun'],['I',"can't",slot('work',config.punctuation?["I’m working!","I'm working!"]:['am working',"'m working"])],
    ['We','avoid',slot('cook','cooking'),'today']];
  if(config.extraSentence)groups.push(['No','errors','here']);
  const escape=text=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const declarations=[],edits=[];let index=0;
  const content=groups.map((group,sentence)=>'<div id="contentblock"><p>'+group.map((token,sentenceTokenIndex)=>{
    const tokenIndex=index++;
    if(typeof token==='string')return escape(token);
    const id='R'+edits.length;
    edits.push({from:token.from,to:token.answers[0],alternatives:token.answers,tokenIndex,sentence,sentenceTokenIndex});
    declarations.push('<responseDeclaration identifier="'+id+'" baseType="string" cardinality="single"><correctResponse><value>original</value></correctResponse></responseDeclaration>');
    return '<inlineChoiceInteraction responseIdentifier="'+id+'"><inlineChoice identifier="original">'+escape(token.from)+'</inlineChoice>'+token.answers.map((answer,i)=>'<inlineChoice identifier="answer'+i+'">'+escape(answer)+'</inlineChoice>').join('')+'</inlineChoiceInteraction>';
  }).join(' ')+'.</p></div>').join('');
  let xml='<assessmentItem identifier="Input:Completion:Text correction">'+declarations.join('')+'<itemBody><div id="rubric">Correct the error in each sentence.</div><div id="content">'+content+'</div></itemBody></assessmentItem>';
  if(config.multiAnswer)xml=xml.replace('<value>original</value>','<value>original</value><value>answer0</value>');
  if(config.missingOriginal)xml=xml.replace('Ria ','');
  const data={'synthetic.xml':xml};if(config.ambiguous)data['second.xml']=xml;
  return {groups,edits,source:config.missingQti?'unavailable':'ajaxData = '+JSON.stringify(data)+';'};
};
