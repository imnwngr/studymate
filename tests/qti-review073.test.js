'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../qti.js');
const Q = globalThis.SparkQTI;
class N {
  constructor(localName,attrs={},kids=[],text='') {this.localName=localName;this.attrs=attrs;this.children=kids;this.text=text; for(const k of kids)k.parentNode=this;}
  getAttribute(k){return this.attrs[k]??null;}
  get textContent(){return this.text+this.children.map(k=>k.textContent).join('');}
  getElementsByTagName(tag){return this.children.flatMap(k=>[...(tag==='*'||tag===k.localName?[k]:[]),...k.getElementsByTagName(tag)]);}
}
const n=(name,attrs={},children=[],text='')=>new N(name,attrs,children,text);
const response=(id,values,baseType='identifier',cardinality='ordered')=>n('responseDeclaration',{identifier:id,baseType,cardinality},[n('correctResponse',{},values.map(v=>n('value',{},[],v)))]);
const xml=(decs,interactions)=>n('assessmentItem',{},[...decs,n('itemBody',{},interactions)]);
const order=(words,answerIndices=words.map((_,i)=>i))=>xml([response('RESPONSE0',answerIndices.map(i=>'SC'+i))], [n('orderInteraction',{responseIdentifier:'RESPONSE0',shuffle:'true'},words.map((w,i)=>n('simpleChoice',{identifier:'SC'+i},[],w)))]);
const seq=(tokens)=>({id:'q1',kind:'order',applyable:false,orderTokens:tokens,context:'Sequence tiles',rubric:'Put the words in the correct order.'});
const source=(files)=>'{'+files.map((_,i)=>JSON.stringify('sample'+i+'.xml')+':'+JSON.stringify('<assessmentItem/>')).join(',')+'}';
function parserFor(files){let i=0;return{parseFromString(){const r=files[i++];return{documentElement:r,getElementsByTagName:t=>r.getElementsByTagName(t)};}};}
test('review order: read QTI ordered identifiers, retaining punctuation, experimental fill',()=>{
  const item=order(['i','feel','fine','.'],[0,1,2,3]);
  const mapped=Q.mapAssessment(item,[seq(['feel','i','fine','.'])]);
  assert.equal(mapped.reason,'complete');
  assert.equal(mapped.answers[0].answer,'i feel fine.');
  assert.equal(mapped.answers[0].manualOnly,false);
  assert.deepEqual(mapped.answers[0].orderedTokens,['i','feel','fine','.']);
});
test('review order: select exactly one item XML from five with reused response identifier',()=>{
  const files=[order(['hello','world','.']),order(['where','are','you','?']),order(['i','am','fine','.'])];
  const found=Q.fromDataJs(source(files),[seq(['are','you','where','?'])],parserFor(files));
  assert.equal(found.filename,'sample1.xml');
  assert.equal(found.answers[0].answer,'where are you?');
});
test('review order: wrong, duplicate, missing tile or unexpected cardinality must abstain',()=>{
  const sourceXml=order(['go','home','.']);
  for(const tokens of [['go','away','.'],['go','go','.'],['go','home'],['go','home','.','.']]){
    assert.equal(Q.mapAssessment(sourceXml,[seq(tokens)]).answers.length,0);
  }
  sourceXml.children[0].attrs.cardinality='multiple';
  assert.equal(Q.mapAssessment(sourceXml,[seq(['go','home','.'])]).answers.length,0);
});
test('review order: ambiguous repeated tile XML must abstain',()=>{
  const files=[order(['i','am','here','.']),order(['i','am','here','.'],[0,2,1,3])];
  const result=Q.fromDataJs(source(files),[seq(['am','i','here','.'])],parserFor(files));
  assert.equal(result.reason,'ambiguousAssessment');
  assert.equal(result.answers.length,0);
});
function choiceXml(blocks){
  return xml(blocks.map((b,i)=>response('RESPONSE'+i,[`C${i}_${b.right}`],'string','single')),
    blocks.map((b,i)=>n('choiceInteraction',{responseIdentifier:'RESPONSE'+i,shuffle:'true'},b.choices.map((c,j)=>n('simpleChoice',{identifier:`C${i}_${j}`},[],c)))));
}
function choiceQuestion(i,opts,{visibleLabels=false}={}){
  const shuffled=opts.map((_,j)=>j).reverse();
  return {id:'q'+(i+1),kind:'choice',applyable:true,choiceIds:shuffled.map(j=>`C${i}_${j}`),
    choiceLabelsVerified:visibleLabels,options:shuffled.map(j=>visibleLabels?opts[j]:`C${i}_${j}`),
    context:`Exercise ${i+1}: ${opts.join(' / ')}`,rubric:'Choose one'};
}
test('review: reject other XML docs with the same C0 IDs but different option labels',()=>{
  const blocks=[{choices:['can','could','might'],right:1},{choices:['one','two','three'],right:2}];
  const q=blocks.map((b,i)=>choiceQuestion(i,b.choices));
  const correct=choiceXml(blocks);
  const unrelated=choiceXml([{choices:['here','there','therefore'],right:0},{choices:['red','green','blue'],right:1}]);
  assert.equal(Q.mapAssessment(correct,q).answers.length,2);
  assert.equal(Q.mapAssessment(unrelated,q).answers.length,0);
  const found=Q.fromDataJs(source([unrelated,correct]),q,parserFor([unrelated,correct]));
  assert.equal(found.filename,'sample1.xml');
  assert.deepEqual(found.answers.map(a=>a.selectedIds),[['C0_1'],['C1_2']]);
});
test('review: strict label-by-ID matching when DOM labels can be verified',()=>{
  const blocks=[{choices:['alpha','beta','gamma'],right:2}];
  const item=choiceXml(blocks);
  const q=choiceQuestion(0,blocks[0].choices,{visibleLabels:true});
  assert.equal(Q.mapAssessment(item,[q]).answers[0].answer,'gamma');
  q.options=['gamma','alpha','beta']; // order no longer agrees with stable C0_n ID
  assert.equal(Q.mapAssessment(item,[q]).answers.length,0);
});
test('review title with Writing skill remains deferred in extension',()=>{
  const fs=require('node:fs'); const src=fs.readFileSync(require('node:path').join(__dirname,'../adapters/ngl.js'),'utf8');
  assert.match(src,/speaking\|writing\(\?: skill\)/);
});
test('order result exposes ordered tokens for experimental fill',()=>{
  const answer=Q.mapAssessment(order(['move','tiles','!']),[seq(['tiles','!','move'])]).answers[0];
  assert.equal(answer.confidence,'high');
  assert.equal(answer.source,'qti');
  assert.equal(answer.manualOnly,false);
  assert.equal(answer.answer,'move tiles!');
});
test('order QTI refuses partial or extra identifiers',()=>{
  const item=order(['first','second','.']);
  item.children[0].children[0].children.pop();
  assert.equal(Q.mapAssessment(item,[seq(['second','first','.'])]).answers.length,0);
});
test('Review alternative XML with matching C identifiers but absent option labels is rejected',()=>{
  const item=choiceXml([{choices:['sun','moon','stars'],right:1}]);
  const q=choiceQuestion(0,['red','green','blue']);
  assert.equal(Q.mapAssessment(item,[q]).answers.length,0);
});
