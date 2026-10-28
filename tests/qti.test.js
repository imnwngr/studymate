'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
require('../qti.js');
const Q=globalThis.SparkQTI;

class Element {
  constructor(tag,attributes={},kids=[],value=''){
    this.localName=tag;this.tagName=tag;this.attributes=attributes;this.children=kids;this.value=value;
  }
  getAttribute(name){return this.attributes[name]??null;}
  get textContent(){return this.value+this.children.map(c=>c.textContent).join('');}
  getElementsByTagName(tag){
    const nodes=[];
    for(const child of this.children){
      if(tag==='*'||tag===child.localName)nodes.push(child);
      nodes.push(...child.getElementsByTagName(tag));
    }
    return nodes;
  }
}
const node=(tag,attrs={},kids=[],value='')=>new Element(tag,attrs,kids,value);
function fixture({choices=5,text=false}={}){
  const correct=['0','0','1','0','0'];
  const phrases=[['rarely have','have rarely'],['always','never'],['forget usually','usually forget'],['often unable','unable often'],['every evening','once an evening']];
  const declarations=[];
  const interactions=[];
  const questions=[];
  for(let i=0;i<choices;i++){
    const id=`RESPONSE${i}`;
    declarations.push(node('responseDeclaration',{identifier:id,baseType:text?'string':'identifier',cardinality:'single'},[
      node('correctResponse',{},[node('value',{},[],text?`answer ${i}`:correct[i])])
    ]));
    interactions.push(text?node('textEntryInteraction',{responseIdentifier:id}):
      node('inlineChoiceInteraction',{responseIdentifier:id},phrases[i].map((label,j)=>node('inlineChoice',{identifier:String(j)},[],label))));
    questions.push({id:`q${i+1}`,kind:text?'text':'dropdown',context:'Sentence [[1]]',options:text?[]:phrases[i]});
  }
  return {xml:node('assessmentItem',{},[...declarations,node('itemBody',{},interactions)]),questions};
}
test('five correctResponse identifiers map to exact printed choices',()=>{
  const {xml,questions}=fixture();
  const output=Q.mapAssessment(xml,questions);
  assert.equal(output.reason,'complete');
  assert.deepEqual(output.answers.map(a=>a.answer),['rarely have','always','usually forget','often unable','every evening']);
  assert.deepEqual(output.answers.map(a=>a.id),['q1','q2','q3','q4','q5']);
  assert.ok(output.answers.every(a=>a.source==='qti'&&a.confidence==='high'));
});
test('textEntryInteraction accepts explicit text answer',()=>{
  const {xml,questions}=fixture({choices:1,text:true});
  assert.equal(Q.mapAssessment(xml,questions).answers[0].answer,'answer 0');
});
test('changed DOM option causes abstention for only that question',()=>{
  const {xml,questions}=fixture();questions[2].options=['unrelated','terms'];
  const answer=Q.mapAssessment(xml,questions);
  assert.equal(answer.answers.length,4);
  assert.ok(answer.diagnostics.includes('item3:choiceMismatch'));
});
test('same number of QTI interactions is a prerequisite',()=>{
  const {xml,questions}=fixture();questions.pop();
  const response=Q.mapAssessment(xml,questions);
  assert.equal(response.reason,'interactionCountMismatch');
  assert.equal(response.answers.length,0);
});
test('correct identifier absent from choices abstains',()=>{
  const {xml,questions}=fixture({choices:1});
  const declaration=xml.children[0];
  declaration.children[0].children[0].value='wrong-id';
  assert.equal(Q.mapAssessment(xml,questions).answers.length,0);
});
test('duplicate choice labels abstain even when identifiers differ',()=>{
  const {xml,questions}=fixture({choices:1});
  xml.children.at(-1).children[0].children[1].value='rarely have';
  questions[0].options=['rarely have','rarely have'];
  assert.equal(Q.mapAssessment(xml,questions).answers.length,0);
});
test('no matching XML filename or giant source is rejected',()=>{
  const parser={parseFromString(){throw new Error('should never parse');}};
  assert.equal(Q.fromDataJs('window.a = 1;',[],parser).reason,'noAssessment');
  assert.equal(Q.fromDataJs('x'.repeat(Q.MAX_SOURCE+1),[],parser).reason,'invalidData');
});
test('JSON-escaped XML is decoded without evaluating script',()=>{
  const {xml,questions}=fixture({choices:1});
  const fakeParser={parseFromString:(value)=>{
    assert.match(value,/^<assessmentItem/);
    return {documentElement:xml,getElementsByTagName:tag=>xml.getElementsByTagName(tag)};
  }};
  const encoded=JSON.stringify('<assessmentItem><itemBody/></assessmentItem>').replace(/</g,'\\u003c');
  const source=`throw Error('NEVER EXECUTE'); window.generated = {"cat2643621.xml":${encoded}};`;
  const answer=Q.fromDataJs(source,questions,fakeParser);
  assert.equal(answer.format,'QTI');
  assert.equal(answer.answers.length,1);
  assert.equal(answer.answers[0].answer,'rarely have');
});
test('legacy API receives only eligible questions missing QTI answers',async()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const popup=fs.readFileSync(path.join(__dirname,'../popup.js'),'utf8');
  const calls=[];
  const questions=[
    {id:'q1',kind:'text',context:'Published QTI',options:[]},
    {id:'q2',kind:'text',context:'Missing QTI',options:[]},
    {id:'q3',kind:'checkbox',context:'Checkbox',choiceIds:['C0_0','C0_1'],options:[]},
    {id:'q4',kind:'linkingLines',context:'Links',options:[],applyable:false}
  ];
  const state={questions,title:'Synthetic activity',frameId:7,answers:new Map()};
  const context={state,I:{language:'en'},$:()=>({disabled:false}),t:()=>'',
    progress(){},status(){},solveDiagnostic(){},updateAnswers(){},render(){},
    normalized:x=>String(x).trim().toLowerCase(),errString:e=>String(e),
    sendFrame:async(frame,message)=>{
      calls.push({frame,message});
      return {ok:true,result:{answers:[{id:'q1',kind:'text',answer:'from QTI',source:'qti',confidence:'high'}]}};
    },
    chrome:{runtime:{sendMessage:async message=>{
      calls.push({message});
      return {ok:true,result:{answers:[{id:'q2',answer:'from API',source:'ai',confidence:'high'}]}};
    }}}
  };
  const start=popup.indexOf('async function solve()');
  const end=popup.indexOf('// Copy the complete current exercise',start);
  assert.ok(start>=0&&end>start);
  vm.runInNewContext(popup.slice(start,end)+';globalThis.runSolve=solve;',context);
  assert.equal(await context.runSolve(),true);
  assert.deepEqual(calls.map(call=>call.message.type),['SPARK_QTI','SPARK_SOLVE']);
  assert.equal(calls[0].frame,7);
  assert.deepEqual(Array.from(calls[1].message.payload.questions,q=>q.id),['q2']);
  assert.deepEqual([...state.answers.keys()],['q1','q2']);
  assert.equal(state.verifiedQti,false);
});
