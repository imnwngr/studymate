window.makeReviewFixture=function(config={}){
  const kinds=['choice','choice','choice','text','checkbox','choice','dropdown','choice'],groups=[],files={};
  const types={choice:'Identify:Select:Radiobutton',checkbox:'Identify:Select:Checkbox',text:'Input:Completion:Text gap',dropdown:'Identify:Select:Dropdown'};
  for(let index=0;index<kinds.length;index++){
    const kind=kinds[index],count=kind==='checkbox'?1:5,questions=[],declarations=[],interactions=[];
    for(let q=0;q<count;q++){
      const reference=config.inspectorSequence||config.referenceCheckbox||config.referenceMapping;
      const dropdownOptions=[['like','dislike'],['bad','good'],["'d like",'like'],['can','should'],["'d prefer",'prefer']];
      const options=kind==='checkbox'?(reference?['One','Two','Three','Four','Five','Six','Seven']:['One','Two','Three','Four','Five','Six']):
        config.referenceMapping&&index===6?dropdownOptions[q]:config.duplicateLabels&&kind==='choice'?['Shared','Shared','Different']:['Shared','Other','Different'];
      const ids=options.map((_,i)=>kind==='dropdown'?String(i):'C'+q+'_'+i),referenceIndex=({5:[2,0,1,1,0],6:[0,1,0,1,0],7:[1,0,2,1,2]})[index]?.[q];
      const selected=kind==='checkbox'?(reference?[ids[0],ids[2],ids[3],ids[4],ids[5]]:[ids[0],ids[2],ids[4]]):[ids[config.referenceMapping&&referenceIndex!==undefined?referenceIndex:(index+q)%options.length]];
      const answer=kind==='text'?'repeat':kind==='dropdown'?options[ids.indexOf(selected[0])]:selected;
      questions.push({options,ids,answer});
      declarations.push('<responseDeclaration identifier="RESPONSE'+q+'" cardinality="'+(kind==='checkbox'?'multiple':'single')+'" baseType="'+(kind==='text'?'string':'identifier')+'"><correctResponse>'+(kind==='text'?[answer]:selected).map(v=>'<value>'+v+'</value>').join('')+'</correctResponse></responseDeclaration>');
      interactions.push(kind==='text'?'<textEntryInteraction responseIdentifier="RESPONSE'+q+'"/>':
        '<'+(kind==='dropdown'?'inlineChoiceInteraction':'choiceInteraction')+' responseIdentifier="RESPONSE'+q+'">'+options.map((label,i)=>'<'+(kind==='dropdown'?'inlineChoice':'simpleChoice')+' identifier="'+ids[i]+'">'+label+'</'+(kind==='dropdown'?'inlineChoice':'simpleChoice')+'>').join('')+'</'+(kind==='dropdown'?'inlineChoiceInteraction':'choiceInteraction')+'>');
    }
    groups.push({kind,questions});
    files[(config.lastScreenGlobalReset&&index===0?'cat2652486':'section'+index)+'.xml']='<assessmentItem identifier="'+types[kind]+'">'+declarations.join('')+'<itemBody>'+interactions.join('')+'</itemBody></assessmentItem>';
  }
  files['LearningObjectInfo.xml']='<LearningObjectInfo><screens>'+groups.map((_,i)=>'<screen><name>'+(config.lastScreenGlobalReset&&i===0?'cat2652486':'section'+i)+'.xml</name></screen>').join('')+'</screens></LearningObjectInfo>';
  if(config.missingQti)delete files['section7.xml'];
  if(config.partialQti)files['section7.xml']=files['section7.xml'].replace(/<responseDeclaration[\s\S]*?<\/responseDeclaration>/,'');
  if(config.missingManifest)delete files['LearningObjectInfo.xml'];
  return {groups,source:'ajaxData = '+JSON.stringify(files)+';'};
};
