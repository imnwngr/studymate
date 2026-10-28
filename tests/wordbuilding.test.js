'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
require('../qti.js');
const Q=globalThis.SparkQTI;
class E{
  constructor(tag,attrs={},kids=[],text=''){this.localName=tag;this.attributes=attrs;this.children=kids;this.text=text;}
  getAttribute(key){return this.attributes[key]??null;}
  get textContent(){return this.text+this.children.map(k=>k.textContent).join('');}
  getElementsByTagName(tag){const result=[];for(const child of this.children){if(tag==='*'||child.localName===tag)result.push(child);result.push(...child.getElementsByTagName(tag));}return result;}
}
const el=(tag,attrs={},kids=[],text='')=>new E(tag,attrs,kids,text);
const words=['play the piano','go hiking','do yoga','play football','do nothing','go horse riding'];
function wordbuilding({type='textEntryInteraction',declarations=true}={}){
  const responses=words.map((answer,i)=>el('responseDeclaration',{identifier:`RESPONSE${i}`,baseType:'string',cardinality:'single'},[
    el('correctResponse',{},[el('value',{},[],answer)])]));
  const interactions=words.map((_,i)=>el(type,{responseIdentifier:`RESPONSE${i}`}));
  const xml=el('assessmentItem',{},[
    ...(declarations?responses:[]),el('itemBody',{},interactions)
  ]);
  const questions=words.map((_,i)=>({id:`q${i+1}`,kind:'text',options:[],
    rubric:'Complete the sentences with play, do or go and a word or phrase from the box to make collocations.',
    wordBank:'football hiking horse riding nothing the piano yoga',
    context:`Example sentence [[1]] #${i+1}`
  }));
  return {xml,questions};
}
test('Wordbuilding six full collocations map to exact string QTI declarations',()=>{
  const {xml,questions}=wordbuilding();
  const found=Q.mapAssessment(xml,questions);
  assert.equal(found.reason,'complete');
  assert.equal(found.total,6);
  assert.deepEqual(found.answers.map(a=>a.answer),words);
  assert.ok(found.answers.every(a=>a.source==='qti'&&a.confidence==='high'));
});
test('incomplete verb-only answer is not a full Wordbuilding collocation',()=>{
  const {xml,questions}=wordbuilding();
  xml.children[0].children[0].children[0].text='play';
  const found=Q.mapAssessment(xml,questions);
  assert.equal(found.answers.length,5);
  assert.ok(found.diagnostics.includes('item1:incompleteCollocation'));
});
test('string gaps must not blindly fill an identifier response',()=>{
  const {xml,questions}=wordbuilding();
  xml.children[0].attributes.baseType='identifier';
  const found=Q.mapAssessment(xml,questions);
  assert.equal(found.answers.length,5);
  assert.ok(found.diagnostics.includes('item1:textMismatch'));
});
test('gapMatchInteraction requires evidence of UI to QTI mappings',()=>{
  const {xml,questions}=wordbuilding({type:'gapMatchInteraction'});
  const found=Q.mapAssessment(xml,questions);
  assert.equal(found.answers.length,0);
  assert.ok(found.diagnostics.every(x=>x.includes('unsupportedInteraction')));
});
test('QTI count mismatch does not guess current screen responses',()=>{
  const {xml,questions}=wordbuilding();
  questions.pop();
  const found=Q.mapAssessment(xml,questions);
  assert.equal(found.reason,'interactionCountMismatch');
  assert.equal(found.answers.length,0);
});
test('Wordbuilding word bank is passed to AI fallback and shown in popup',()=>{
  const base=path.join(__dirname,'..');
  const content=fs.readFileSync(path.join(base,'adapters/ngl.js'),'utf8');
  const popup=fs.readFileSync(path.join(base,'popup.js'),'utf8');
  const provider=fs.readFileSync(path.join(base,'providers.js'),'utf8');
  assert.match(content,/function findWordBank\(/);
  assert.match(content,/blocks\.filter\(b=>b!==bank\.block\)/);
  assert.match(popup,/wordBank:q\.wordBank\|\|''/);
  assert.match(popup,/else if\(q\.wordBank\)/);
  assert.match(provider,/wordBank field/);
});
test('Wordbuilding diagnostic is local/read-only with copy or download backup',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../tools/inspect-wordbuilding.js'),'utf8');
  assert.match(source,/SPARK_WORDBUILDING_DIAGNOSTIC/);
  assert.match(source,/credentials:'same-origin'/);
  assert.match(source,/navigator\.clipboard\.writeText/);
  assert.match(source,/URL\.createObjectURL/);
  assert.doesNotMatch(source,/\beval\s*\(/);
  assert.doesNotMatch(source,/data-event="check"/);
});
