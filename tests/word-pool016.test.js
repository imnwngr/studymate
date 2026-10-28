'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
require('../qti.js');
const Q=globalThis.SparkQTI;
class X{
 constructor(localName,attributes={},children=[],text=''){
  Object.assign(this,{localName,attributes,children,text});for(const c of children)c.parentNode=this;
 }
 getAttribute(k){return this.attributes[k]??null;}
 get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}
 getElementsByTagName(tag){return this.children.flatMap(n=>[...(tag==='*'||tag===n.localName?[n]:[]),...n.getElementsByTagName(tag)]);}
}
const x=(name,attrs={},kids=[],text='')=>new X(name,attrs,kids,text);
function fixture(bank=['A good idea','Another phrase'],pairs=['T1 G1','T0 G0'],
  sourceLabels=['A good idea','Another phrase']){
 const decl=x('responseDeclaration',{identifier:'R',baseType:'directedPair',cardinality:'multiple'},[
  x('correctResponse',{},pairs.map(t=>x('value',{},[],t)))]);
 const gap=x('gapMatchInteraction',{responseIdentifier:'R'},[
  ...sourceLabels.map((label,i)=>x('gapText',{identifier:`T${i}`},[],label)),
  x('p',{},[x('gap',{identifier:'G0'}),x('span',{},[],' test scenario some fixed words '),x('gap',{identifier:'G1'})])]);
 const xml=x('assessmentItem',{},[decl,x('itemBody',{},[x('p',{},[gap])])]);
 const q={id:'q1',kind:'gapWordPool',context:'A good idea Another phrase test scenario some fixed words',
  poolLabels:bank,gapCount:2,applyable:true};
 return {xml,q};
}
test('QTI word-pool pairing maps shuffled correct values to visible gap order',()=>{
 const {xml,q}=fixture();
 const result=Q.mapAssessment(xml,[q]);
 assert.equal(result.reason,'complete');
 assert.equal(result.answers[0].wordPoolVerified,true);
 assert.deepEqual(result.answers[0].pairs.map(p=>[p.targetIndex,p.source]),[[0,'A good idea'],[1,'Another phrase']]);
 assert.ok(Q.signatureScore(xml,[q])>0.55);
});
test('QTI word-pool refuses mismatched bank, missing gap and duplicate labels',()=>{
 const {xml,q}=fixture();
 for(const variant of [
  {...q,poolLabels:['Wrong','Another phrase']},
  {...q,gapCount:3},
  {...q,poolLabels:['A good idea','A good idea']},
  {...q,applyable:false}
 ])assert.equal(Q.mapAssessment(xml,[variant]).answers.length,0);
 assert.equal(Q.mapAssessment(fixture().xml,[{...q,kind:'match',applyable:false}]).answers[0].pairs.length,2);
});
test('word-pool does not accept QTI without all target directed pairs',()=>{
 const {xml,q}=fixture(undefined,['T0 G0']);
 assert.equal(Q.mapAssessment(xml,[q]).answers.length,0);
});
test('word-pool QTI accepts moved tiles or a retained full bank, with exact multiplicities',()=>{
 const {xml,q}=fixture();
 assert.equal(Q.mapAssessment(xml,[{...q,poolLabels:['A good idea','Another phrase','A good idea'],
   wordPoolBankAlternatives:[['A good idea','Another phrase']]}]).reason,'complete');
 assert.equal(Q.signatureScore(xml,[{...q,poolLabels:['A good idea','Another phrase','A good idea'],
   wordPoolBankAlternatives:[['A good idea','Another phrase']]}])>0.55,true);
 assert.equal(Q.mapAssessment(xml,[{...q,poolLabels:['Another phrase','A good idea']}]).reason,'complete');
 for(const poolLabels of [['A good idea'],['A good idea','A good idea'],['Unknown','Another phrase']]){
   const variant={...q,poolLabels,wordPoolBankAlternatives:[]};
   assert.equal(Q.mapAssessment(xml,[variant]).answers.length,0);
   assert.equal(Q.signatureScore(xml,[variant]),0);
 }
});
test('word-pool QTI permits identical labels only with distinct source identifiers',()=>{
 const {xml,q}=fixture(['A good idea','A good idea'],undefined,['A good idea','A good idea']);
 assert.equal(Q.mapAssessment(xml,[q]).reason,'complete');
 assert.deepEqual(Q.mapAssessment(xml,[q]).answers[0].pairs.map(p=>p.sourceId),['T0','T1']);
 assert.equal(Q.mapAssessment(xml,[{...q,poolLabels:['A good idea','Another phrase']}]).answers.length,0);
});
test('word-pool QTI flags labels repeated by a distractor source',()=>{
 const bank=['A good idea','Another phrase','A good idea'];
 const {xml,q}=fixture(bank,undefined,bank);
 const result=Q.mapAssessment(xml,[q]);
 assert.equal(result.reason,'complete');
 assert.deepEqual(result.answers[0].pairs.map(p=>p.labelAmbiguous),[true,false]);
});
test('word-pool adapter requires QTI pairs and verifies actual slot contents',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../adapters/ngl.js'),'utf8');
 const popup=fs.readFileSync(path.join(__dirname,'../popup.js'),'utf8');
 assert.match(js,/wordPoolVerified/);
 assert.match(js,/const wordPoolGapText/);
 assert.match(js,/handle\.click\(\)/);
 assert.match(js,/currentSlot\.click\(\)/);
 assert.match(js,/trustedWordPool/);
 assert.match(popup,/wordPoolVerified:true/);
});
