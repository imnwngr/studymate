'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
require('../qti.js');
const Q=globalThis.SparkQTI;
class N{
  constructor(localName,attributes={},children=[],text='') {Object.assign(this,{localName,attributes,children,text});}
  getAttribute(k){return this.attributes[k]??null;}
  get textContent(){return this.text+this.children.map(x=>x.textContent).join('');}
  getElementsByTagName(tag){return this.children.flatMap(x=>[...(tag==='*'||tag===x.localName?[x]:[]),...x.getElementsByTagName(tag)]);}
}
const n=(tag,attrs={},kids=[],text='')=>new N(tag,attrs,kids,text);
const decl=(id,correct)=>n('responseDeclaration',{identifier:id,baseType:'string',cardinality:'single'},[n('correctResponse',{},[n('value',{},[],correct)])]);
const item=(declarations,elements)=>n('assessmentItem',{},[...declarations,n('itemBody',{},[n('div',{},elements)])]);
const pairs=[['Title','Surname'],['Occupation','Date'],['Nationality','Gender'],['Language','Country'],['qualifications','occupation']];
const prompt='Correct the five errors in the form.';
function correctionXml(){
  const ints=pairs.map(([bad,good],i)=>n('inlineChoiceInteraction',{responseIdentifier:`R${i}`},[
    n('inlineChoice',{identifier:bad},[],bad),n('inlineChoice',{identifier:good},[],good)]));
  return item(pairs.map(([bad],i)=>decl(`R${i}`,bad)),[
    n('p',{},[],prompt),n('div',{},[n('p',{},ints)])]);
}
function correctionQuestion(){return [{id:'q1',kind:'textCorrection',options:[],
  correctionTokens:['First','name','Anna','Title','Smith','Address','Occupation','Nationality','Language','qualifications', 'other'],context:'Form text'}];}
test('published Writing skill correction pairs map 5 visible incorrect words to alternative choices',()=>{
  const mapped=Q.mapAssessment(correctionXml(),correctionQuestion());
  assert.equal(mapped.reason,'complete');
  assert.equal(mapped.answers.length,1);
  assert.deepEqual(mapped.answers[0].corrections.map(e=>[e.from,e.to]),pairs);
  assert.equal(mapped.answers[0].source,'qti');
});
test('text correction fails closed when a wrong word is absent or repeated',()=>{
  const missing=correctionQuestion();missing[0].correctionTokens=missing[0].correctionTokens.filter(t=>t!=='Title');
  assert.equal(Q.mapAssessment(correctionXml(),missing).answers.length,0);
  const doubled=correctionQuestion();doubled[0].correctionTokens.push('Title');
  assert.equal(Q.mapAssessment(correctionXml(),doubled).answers.length,0);
});
test('text correction requires explicit rubric and exactly two distinct choices',()=>{
  const xml=correctionXml();xml.children.at(-1).children[0].children[0].text='Write a story.';
  assert.equal(Q.mapAssessment(xml,correctionQuestion()).answers.length,0);
  const second=correctionXml();const interaction=second.children.at(-1).children[0].children[1].children[0];
  interaction.children[0].children.pop();
  assert.equal(Q.mapAssessment(second,correctionQuestion()).answers.length,0);
});
test('correction XML does not map onto ordinary text or dropdown questions',()=>{
  const other=[{...correctionQuestion()[0],kind:'text'}];
  assert.equal(Q.mapAssessment(correctionXml(),other).answers.length,0);
});
test('Review radio choices accept exact QTI IDs independent of shuffled appearance',()=>{
  const options=[["aren't","isn't","not"],['Are','Do','Have']];
  const xml=item(['C0_1','C1_1'].map((c,i)=>decl('R'+i,c)),[
    ...options.map((ops,i)=>n('p',{},[
      n('choiceInteraction',{responseIdentifier:'R'+i},ops.map((word,j)=>n('simpleChoice',{identifier:`C${i}_${j}`},[],word)))]))]);
  const qs=options.map((ops,i)=>({id:'q'+(i+1),kind:'choice',choiceIds:[`C${i}_2`,`C${i}_1`,`C${i}_0`],options:[ops[2],ops[1],ops[0]],choiceLabelsVerified:true}));
  const result=Q.mapAssessment(xml,qs);
  assert.equal(result.reason,'complete');
  assert.deepEqual(result.answers.map(a=>a.selectedIds),['C0_1','C1_1'].map(x=>[x]));
});
test('five-QTI-interaction correction is ranked against one visible correction widget',()=>{
  assert.equal(Q.signatureScore(correctionXml(),correctionQuestion()),1);
  const wrong=correctionQuestion();wrong[0].correctionTokens=wrong[0].correctionTokens.filter(x=>x!=='Title');
  assert.equal(Q.signatureScore(correctionXml(),wrong),0);
});
test('popup forwards only published correction pairs to the Spark UI',()=>{
  const fs=require('node:fs');const path=require('node:path');
  const script=fs.readFileSync(path.join(__dirname,'../popup.js'),'utf8');
  const content=fs.readFileSync(path.join(__dirname,'../adapters/ngl.js'),'utf8');
  assert.match(script,/q\.kind==='textCorrection'&&a\.source==='qti'/);
  assert.match(script,/results\.every\(x=>x\.status==='filled'\) && !state\.questions\.some\(q=>q\.kind==='textCorrection'\)/);
  assert.match(content,/lastScan\.trustedCorrections\?\.get\(id\)/);
  assert.match(content,/async function setTextCorrections/);
  assert.doesNotMatch(content,/widget\.innerHTML\s*=/);
});

test('a previously corrected Spark token remains QTI-valid only when marked modified',()=>{
  const partial=correctionQuestion()[0];
  partial.correctionTokens=partial.correctionTokens.map(t=>t==='Title'?'Surname':t);
  partial.correctionModifiedTokens=['Surname'];
  assert.equal(Q.mapAssessment(correctionXml(),[partial]).reason,'complete');
  assert.equal(Q.signatureScore(correctionXml(),[partial]),1);
  const unsigned={...partial,correctionModifiedTokens:[]};
  assert.equal(Q.mapAssessment(correctionXml(),[unsigned]).answers.length,0);
  assert.equal(Q.signatureScore(correctionXml(),[unsigned]),0);
});

test('trace-backed correction adapter uses tc_popup input and OK instead of synthetic Enter',()=>{
  const fs=require('node:fs');const path=require('node:path');
  const content=fs.readFileSync(path.join(__dirname,'../adapters/ngl.js'),'utf8');
  assert.match(content,/waitForUniqueCorrectionPopup/);
  assert.match(content,/\.tc_popup/);
  assert.match(content,/button-submit/);
  assert.match(content,/buttons\[0\]\.click\(\)/);
  const correction=content.slice(content.indexOf('async function confirmCorrection'),content.indexOf('async function apply(answers)'));
  assert.doesNotMatch(correction,/KeyboardEvent\('keydown'/);
});


test('already corrected occupation never masquerades as incorrect Occupation on a repeated Solve',()=>{
  const previouslySolved=correctionQuestion()[0];
  previouslySolved.correctionTokens=['First','name','Anna','Surname','Smith','Address','Date',
    'Gender','Country','occupation','other'];
  previouslySolved.correctionModifiedTokens=['Surname','Date','Gender','Country','occupation'];
  const mapped=Q.mapAssessment(correctionXml(),[previouslySolved]);
  assert.equal(mapped.reason,'complete',JSON.stringify(mapped));
  assert.deepEqual(mapped.answers[0].corrections.map(e=>e.from),pairs.map(p=>p[0]));
  assert.deepEqual(mapped.answers[0].corrections.map(e=>e.to),pairs.map(p=>p[1]));
  assert.equal(mapped.answers[0].corrections[1].tokenIndex,6);
  assert.equal(mapped.answers[0].corrections[4].tokenIndex,9);
  assert.equal(Q.signatureScore(correctionXml(),[previouslySolved]),1);
});

test('partially edited capitalization collision resolves each QTI pair to its own physical word',()=>{
  const partial=correctionQuestion()[0];
  partial.correctionTokens=['Title','Date','Nationality','Language','occupation'];
  partial.correctionModifiedTokens=['Date','occupation'];
  const mapped=Q.mapAssessment(correctionXml(),[partial]);
  assert.equal(mapped.reason,'complete',JSON.stringify(mapped));
  assert.deepEqual(mapped.answers[0].corrections.map(e=>e.tokenIndex),[0,1,2,3,4]);
  const corrupt={...partial,correctionTokens:['Title','Date','Nationality','Language','Date'],
    correctionModifiedTokens:['Date']};
  assert.equal(Q.mapAssessment(correctionXml(),[corrupt]).answers.length,0);
});
