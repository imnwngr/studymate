(function(root){
  'use strict';
  if(root.SparkEmbeddedQTI)return;
  function read(document,parser){
    const assessments=[];
    const scripts=[...document.querySelectorAll('script[type="application/qti+xml"],script[type="application/xml"],script[type="application/json"][data-qti]')];
    if(scripts.length>12)return {assessments,reason:'tooManyAnswerSources'};
    let total=0;
    for(const script of scripts){
      const text=script.textContent||'';
      total+=text.length;
      if(text.length>1_000_000||total>2_000_000)return {assessments:[],reason:'answerSourceTooLarge'};
      let xmls=[text];
      if(script.type==='application/json'){
        let parsed;try{parsed=JSON.parse(text);}catch{return {assessments:[],reason:'invalidAnswerSource'};}
        xmls=Object.entries(parsed||{}).filter(([key,value])=>key.endsWith('.xml')&&typeof value==='string').map(([,value])=>value);
        if(xmls.length>12)return {assessments:[],reason:'tooManyAnswerSources'};
      }
      for(const text of xmls){
        if(text.length>1_000_000||/<!DOCTYPE|<!ENTITY/i.test(text))return {assessments:[],reason:'unsafeXml'};
        const xml=parser.parseFromString(text,'application/xml');
        if(xml.querySelector('parsererror'))return {assessments:[],reason:'invalidXml'};
        if(xml.documentElement.localName==='assessmentItem')assessments.push(xml);
      }
    }
    return {assessments,reason:assessments.length?'available':'noCompatibleAnswerSource'};
  }
  root.SparkEmbeddedQTI=Object.freeze({read});
})(globalThis);
