'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const source=read('popup.js');
function setup({url='https://unregistered.example/quiz',denied=false,empty=false,partial=false}={}){
  const nodes=new Map(),sent=[];
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:false,textContent:'',dataset:{},classList:{add(){},remove(){},toggle(){}}});
    return nodes.get(id);
  };
  const answer={id:'q1',answer:'correct',source:'qti',confidence:'high'};
  const architecture={adapterId:'generic',registered:false,capabilities:['native-text'],solvers:[{id:'q1',kind:'text',solver:'text',applyable:true}]};
  const state={questions:[],answers:new Map()};
  const ctx=vm.createContext({URL,console,state,$:node,I:{language:'en'},t:(key,params)=>key+(params?.site||''),
    progress(){},status(message){node('status').textContent=message;},render(){},updateAnswers(){},showMode(){},
    normalized:x=>String(x).toLowerCase(),errString:e=>e.message,solveDiagnostic(){},
    document:{body:{classList:{add(){},remove(){}}},querySelector:()=>null},
    chrome:{tabs:{query:async()=>[{id:19,url}]},webNavigation:{getAllFrames:async()=>[{frameId:0},{frameId:299}]}}});
  vm.runInContext(read('core/site-registry.js'),ctx);
  ctx.sendFrame=async(frame,message)=>{
    sent.push({frame,message});
    if(denied||(partial&&frame===0))return {ok:false,reason:'accessUnavailable'};
    if(message.type==='SPARK_SCAN')return {ok:true,result:{title:'Unregistered quiz',screenIndex:0,screenCount:null,
      architecture,questions:frame===299&&!empty?[{id:'q1',kind:'text',context:'Question',options:[],applyable:true}]:[]}};
    if(message.type==='SPARK_QTI')return {ok:true,result:{reason:'complete',answers:[answer]}};
    if(message.type==='SPARK_APPLY')return {ok:true,result:[{id:'q1',status:'filled'}]};
  };
  vm.runInContext(source.slice(source.indexOf('function showSiteStatus('),source.indexOf('function render()'))+
    source.slice(source.indexOf('async function solve()'),source.indexOf('// Copy the complete current exercise'))+
    source.slice(source.indexOf('async function applyAnswers()'),source.indexOf('async function autoSolveAndFill()'))+
    ';globalThis.run={scanPage,solve,applyAnswers};',ctx);
  return {ctx,state,node,sent};
}
test('unknown-domain actual popup coordinator scans nested frame, resolves QTI and applies through same frame',async()=>{
  const f=setup();assert.equal(await f.ctx.run.scanPage(),true);
  assert.equal(f.node('siteStatus').dataset.state,'unregistered');assert.equal(f.node('scan').disabled,false);
  assert.equal(f.state.frameId,299);assert.equal(await f.ctx.run.solve(),true);assert.equal(await f.ctx.run.applyAnswers(),true);
  assert.deepEqual(f.sent.filter(x=>x.message.type!=='SPARK_SCAN').map(x=>[x.frame,x.message.type]),[[299,'SPARK_QTI'],[299,'SPARK_APPLY']]);
  assert.equal(f.node('submitNext').disabled,true,'Generic adapter has no verified submission port');
});
test('registered hostname does not establish exercise discovery',async()=>{
  const f=setup({url:'https://learn.eltngl.com/course',empty:true});
  assert.equal(await f.ctx.run.scanPage(),false);assert.equal(f.node('siteStatus').dataset.state,'registered');
  assert.equal(f.node('status').textContent,'noExercise');assert.equal(f.state.questions.length,0);
});
test('unregistered no-exercise is informational rather than a permission error',async()=>{
  const f=setup({empty:true});assert.equal(await f.ctx.run.scanPage(),false);
  assert.equal(f.node('siteStatus').dataset.state,'unregistered');assert.equal(f.node('status').textContent,'noExercise');
});
test('permission denied is distinct from unrecognized exercise and scan remains enabled',async()=>{
  const f=setup({denied:true});assert.equal(await f.ctx.run.scanPage(),false);
  assert.equal(f.node('siteStatus').dataset.state,'unavailable');assert.equal(f.node('status').textContent,'siteAccessUnavailable');
  assert.equal(f.node('scan').disabled,false);
});
test('restricted browser page stops before frame messaging',async()=>{
  const f=setup({url:'chrome://extensions'});assert.equal(await f.ctx.run.scanPage(),false);
  assert.equal(f.sent.length,0);assert.equal(f.node('siteStatus').dataset.state,'unavailable');
});
test('accessible child exercise can be selected with an explicit partial-access warning',async()=>{
  const f=setup({partial:true});assert.equal(await f.ctx.run.scanPage(),true);
  assert.equal(f.state.inaccessibleFrames,1);assert.match(f.node('status').textContent,/siteSomeFramesUnavailable/);
  assert.equal(f.node('siteStatus').dataset.state,'unregistered');
});
