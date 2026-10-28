'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
require('../qti.js');
const Q=globalThis.SparkQTI;
// Small QTI fixtures with the *same shapes* as the 13 read-only inspector
// captures. No user data or unpublished exercise text is committed here.
class X{
  constructor(localName,attributes={},children=[],text=''){
    Object.assign(this,{localName,attributes,children,text});
    for(const c of children)c.parentNode=this;
  }
  getAttribute(k){return this.attributes[k]??null;}
  get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}
  getElementsByTagName(tag){
    return this.children.flatMap(n=>[...(tag==='*'||tag===n.localName?[n]:[]),...n.getElementsByTagName(tag)]);
  }
}
const x=(tag,attrs={},kids=[],text='')=>new X(tag,attrs,kids,text);
const textDecl=(id,values)=>x('responseDeclaration',{identifier:id,cardinality:'single',baseType:'string'},[
  x('correctResponse',{},values.map(v=>x('value',{},[],v)))]);
const identDecl=(id,values,multi=false)=>x('responseDeclaration',{identifier:id,cardinality:multi?'multiple':'single',baseType:multi?'identifier':'string'},[
  x('correctResponse',{},values.map(v=>x('value',{},[],v)))]);
const choice=(id,text)=>x('simpleChoice',{identifier:id},[],text);
const item=(declarations,body)=>x('assessmentItem',{},[...declarations,x('itemBody',{},body)]);
const sentence=(before,id,after)=>x('p',{},[
  x('span',{},[],before),x('textEntryInteraction',{responseIdentifier:id}),x('span',{},[],after)
]);
const input=(id,context,kind='text')=>({id,kind,options:[],context,rubric:'',wordBank:'',applyable:kind!=='match'});
test('radio choice maps shuffled Spark C0_n IDs, not visual index',()=>{
  const xml=item([identDecl('RESPONSE0',['C0_1'])],[
    x('choiceInteraction',{responseIdentifier:'RESPONSE0',shuffle:'true',maxChoices:'1'},[
      choice('C0_0','first'),choice('C0_1','second'),choice('C0_2','third')])]);
  const q={...input('q1','Example question?','choice'),choiceIds:['C0_2','C0_0','C0_1'],options:['third','first','second']};
  const result=Q.mapAssessment(xml,[q]);
  assert.equal(result.reason,'complete');
  assert.equal(result.answers[0].answer,'second');
  assert.deepEqual(result.answers[0].selectedIds,['C0_1']);
  assert.deepEqual(result.answers[0].choiceOptions,['third','first','second']);
});
test('multiple checkbox values stay a set of C0_n IDs',()=>{
  const xml=item([identDecl('RESPONSE0',['C0_0','C0_2'],true)],[
    x('choiceInteraction',{responseIdentifier:'RESPONSE0',shuffle:'true',maxChoices:'0'},[
      choice('C0_0','red'),choice('C0_1','green'),choice('C0_2','blue')])]);
  const q={...input('q1','Pick colors','multi'),choiceIds:['C0_2','C0_1','C0_0'],options:['blue','green','red']};
  assert.deepEqual(Q.mapAssessment(xml,[q]).answers[0].selectedIds,['C0_0','C0_2']);
});
test('wrong or duplicate checkbox IDs abstain instead of positional matching',()=>{
  const xml=item([identDecl('R',['C0_1'],true)],[x('choiceInteraction',{responseIdentifier:'R'},[
    choice('C0_0','alpha'),choice('C0_1','beta')])]);
  for(const choiceIds of [['C0_0','C0_0'],['C0_0','C0_7']]){
    const q={...input('q1','Choose','multi'),choiceIds,options:['a','b']};
    assert.equal(Q.mapAssessment(xml,[q]).answers.length,0);
  }
});
test('text entries accept multiple legal variants, choose one complete phrase',()=>{
  const xml=item([textDecl('R',['make a plan|a plan'])],[sentence('I ','R',' tomorrow.')]);
  const q={...input('q1','I [[1]] tomorrow.'),rubric:'Complete each sentence'};
  const result=Q.mapAssessment(xml,[q]);
  assert.equal(result.answers[0].answer,'make a plan');
  assert.deepEqual(result.answers[0].acceptedVariants,['make a plan','a plan']);
});
test('Wordbuilding requires complete play/do/go expression and keeps variants',()=>{
  const xml=item([textDecl('R',['play the violin|the violin'])],[sentence('I ','R',' at night.')]);
  const q={...input('q1','I [[1]] at night.'),wordBank:'the violin',rubric:'Use play, do or go and the phrase from the box'};
  const result=Q.mapAssessment(xml,[q]);
  assert.deepEqual(result.answers[0].acceptedVariants,['play the violin']);
});
test('partial review gaps use exact entered suffix, never expand full word',()=>{
  const xml=item([textDecl('R',['tay'])],[sentence('I s','R',' late.')]);
  assert.equal(Q.mapAssessment(xml,[input('q1','I s[[1]] late.')]).answers[0].answer,'tay');
});
test('match pairs extracted for review only, not automatic drag/drop',()=>{
  const interaction=x('gapMatchInteraction',{responseIdentifier:'R'},[
    x('gapText',{identifier:'T1'},[],'Hello'),x('gap',{identifier:'G1'})]);
  const declaration=x('responseDeclaration',{identifier:'R',baseType:'directedPair',cardinality:'multiple'},[
    x('correctResponse',{},[x('value',{},[],'T1 G1')])]);
  const result=Q.mapAssessment(item([declaration],[interaction]),[input('q1','Drag word','match')]);
  assert.equal(result.answers.length,1);
  assert.equal(result.answers[0].pairs[0].source,'Hello');
  assert.equal(result.answers[0].pairs[0].targetId,'G1');
});
test('two QTI screens with identical RESPONSE ids require a unique matching sentence',()=>{
  const first=item([textDecl('R0',['one'])],[sentence('First unique prompt ','R0',' end.')]);
  const second=item([textDecl('R0',['two'])],[sentence('Second other prompt ','R0',' end.')]);
  const files=[first,second];
  const parser={parseFromString(){const xml=files.shift();return {documentElement:xml,getElementsByTagName:t=>xml.getElementsByTagName(t)};}};
  const source=`window.bundle = {"screen1.xml":${JSON.stringify('<assessmentItem>first</assessmentItem>')},"screen2.xml":${JSON.stringify('<assessmentItem>second</assessmentItem>')}};`;
  const answer=Q.fromDataJs(source,[input('q1','Second other prompt [[1]] end.')],parser);
  assert.equal(answer.answers[0].answer,'two');
  assert.equal(answer.filename,'screen2.xml');
});
test('two indistinguishable screens abstain safely',()=>{
  const a=item([textDecl('R0',['one'])],[sentence('same ','R0',' sentence.')]);
  const b=item([textDecl('R0',['two'])],[sentence('same ','R0',' sentence.')]);
  let i=0;const all=[a,b];
  const parser={parseFromString(){const xml=all[i++];return {documentElement:xml,getElementsByTagName:t=>xml.getElementsByTagName(t)};}};
  const src=`{"1.xml":${JSON.stringify('<assessmentItem/>')},"2.xml":${JSON.stringify('<assessmentItem/>')}}`;
  assert.equal(Q.fromDataJs(src,[input('q1','same [[1]] sentence.')],parser).reason,'ambiguousAssessment');
});
test('Writing and Speaking retain previous behavior; QTI adapter does not process them',()=>{
  const code=fs.readFileSync(path.join(__dirname,'../adapters/ngl.js'),'utf8');
  assert.match(code,/deferredCategory/);
  assert.match(code,/reason:'deferredCategory'/);
});
test('live scanner keeps active page and stable checkbox/radio IDs',()=>{
  const code=fs.readFileSync(path.join(__dirname,'../adapters/ngl.js'),'utf8');
  assert.match(code,/function activeContentRoot/);
  assert.match(code,/activity--hidden/);
  assert.match(code,/function choiceGroup/);
  assert.match(code,/function setChoice/);
  assert.match(code,/lastScan\.appliedChoiceIds/);
});


test('linking-lines QTI can explain pairs without authorizing DOM application',()=>{
  const xml=item([x('responseDeclaration',{identifier:'R',cardinality:'multiple',baseType:'directedPair'},[
    x('correctResponse',{},[x('value',{},[],'A B')])])],[
    x('associateInteraction',{responseIdentifier:'R'},[
      x('simpleAssociableChoice',{identifier:'A'},[],'source'),
      x('simpleAssociableChoice',{identifier:'B'},[],'target')])]);
  const q={...input('q1','Link sources to targets','linkingLines'),applyable:false};
  const result=Q.mapAssessment(xml,[q]);
  assert.deepEqual(result.answers[0].pairs,[{sourceId:'A',targetId:'B',source:'source',target:'target'}]);
  assert.equal(q.applyable,false);
  assert.equal(result.answers[0].wordPoolVerified,undefined);
  assert.equal(Q.mapAssessment(xml,[{...q,applyable:true}]).answers.length,0);
  xml.children[0].children[0].children[0].text='A MISSING';
  assert.equal(Q.mapAssessment(xml,[q]).answers.length,0);
});


test('linking maps unique cell labels to QTI identities regardless of DOM or QTI order',()=>{
  const declaration=x('responseDeclaration',{identifier:'R',cardinality:'multiple',baseType:'directedPair'},[
    x('correctResponse',{},[x('value',{},[],'S2 T1'),x('value',{},[],'S1 T2')])]);
  const interaction=x('associateInteraction',{responseIdentifier:'R'},[
    x('simpleAssociableChoice',{identifier:'T2'},[],'Delta'),
    x('simpleAssociableChoice',{identifier:'S1'},[],'Alpha'),
    x('simpleAssociableChoice',{identifier:'T1'},[],'Gamma'),
    x('simpleAssociableChoice',{identifier:'S2'},[],'Beta')]);
  const xml=item([declaration],[interaction]);
  const q={...input('q1','Link','linkingLines'),applyable:true,
    linkingSources:['Beta','Alpha'],linkingTargets:['Delta','Gamma']};
  const mapped=Q.mapAssessment(xml,[q]);
  assert.equal(mapped.answers[0].linkingVerified,true);
  assert.deepEqual(mapped.answers[0].pairs.map(p=>[p.source,p.target]),[['Beta','Gamma'],['Alpha','Delta']]);
  for(const changed of [
    {linkingSources:['Beta','Beta']},{linkingTargets:['Delta','Missing']},
    {linkingSources:[]},{linkingSources:['Gamma','Delta'],linkingTargets:['Alpha','Beta']}
  ])assert.equal(Q.mapAssessment(xml,[{...q,...changed}]).answers.length,0);
  interaction.children.push(x('simpleAssociableChoice',{identifier:'S1'},[],'Alpha'));
  assert.equal(Q.mapAssessment(xml,[q]).answers.length,0);
  interaction.children.pop();
  declaration.children[0].children[1].text='S1 T1';
  assert.equal(Q.mapAssessment(xml,[q]).answers.length,0);
});
