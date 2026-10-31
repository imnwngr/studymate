'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
require('../providers.js');require('../video-transport.js');
const P=globalThis.SparkProviders,Video=require('../video-gemini.js'),Text=require('../text-writing-ai.js'),Writer=require('../video-writing.js');
const background=fs.readFileSync(require.resolve('../background.js'),'utf8');
const popup=fs.readFileSync(require.resolve('../popup.js'),'utf8');
const exercise='Design a form for a language class.\nSample answer is a reference.\nCHECK: Include first language.';
const output='Name: __________\nFirst language: __________';
function profile(provider='gemini',id='saved-profile'){
  const p=P.newProfile(provider,id);if(provider!=='ollama')p.apiKey='existing-mock-key';return p;
}
function textHarness(storage,{status=200,body={choices:[{message:{content:output}}]}}={}){
  const requests=[];let listener;
  const chrome={storage:{local:{get:async()=>structuredClone(storage),setAccessLevel:async()=>{}}},permissions:{contains:async()=>true},runtime:{id:'test-extension',getURL:file=>'chrome-extension://test-extension/'+file,onMessage:{addListener:fn=>listener=fn}}};
  const context={importScripts:()=>{},SparkProviders:P,SparkTextWritingAI:Text,AbortController,setTimeout,clearTimeout,URL,TypeError,chrome,
    fetch:async(url,options)=>{requests.push({url,options});return {ok:status>=200&&status<300,status,json:async()=>body}}};
  vm.runInNewContext(background,context);
  const send=msg=>new Promise(resolve=>{assert.equal(listener(msg,{id:'test-extension',url:chrome.runtime.getURL('popup.html')},resolve),true)});
  chrome.runtime.sendMessage=send;
  return {chrome,requests,send,run:()=>send({type:'SPARK_TEXT_WRITING',exercise})};
}
function expectNoRequest(h,result,code){assert.equal(result.ok,false);assert.equal(result.code,code);assert.equal(h.requests.length,0);assert.doesNotMatch(result.error,/existing-mock-key/)}
for(const mode of ['offline','single','compare',undefined])test('stored Gemini works for text and video with mode '+String(mode),async()=>{
  const p=profile();const storage={aiProfiles:[p],activeProfileId:p.id,...(mode?{aiMode:mode}:{})};
  const h=textHarness(storage),result=await h.run();assert.equal(result.answer,output);assert.equal(h.requests.length,1);
  const request=h.requests[0],body=JSON.parse(request.options.body);
  assert.equal(request.url,p.endpoint);assert.equal(request.options.headers.Authorization,'Bearer '+p.apiKey);assert.equal(body.model,p.model);
  assert.equal(body.messages[1].content,'EXERCISE:\n'+exercise);assert.equal(body.input,undefined);
  const videoRequests=[];
  const answer=await Video.solve({videoUrl:'https://example.test/video.mp4',instructions:exercise},{chrome:h.chrome,fetch:async(url,options)=>{
    if(options.method==='HEAD')return {ok:true,status:200,headers:{get:name=>name==='content-length'?'100':null}};
    videoRequests.push({url,options});return {ok:true,status:200,json:async()=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:output}]}]})};
  }});
  assert.equal(answer,output);assert.equal(videoRequests.length,1);assert.match(videoRequests[0].url,/\/interactions$/);
  assert.equal(videoRequests[0].options.headers['x-goog-api-key'],p.apiKey);assert.equal(JSON.parse(videoRequests[0].options.body).model,p.model);
});
for(const mode of ['offline','single','compare'])test('explicit other provider is respected in '+mode,async()=>{
  const gemini=profile(),other=profile('groq','chosen-other');other.model='user-selected-model';other.enabled=false;
  const storage={aiProfiles:[gemini,other],activeProfileId:other.id,aiMode:mode};
  const h=textHarness(storage),result=await h.run();assert.equal(result.ok,true);assert.equal(h.requests[0].url,other.endpoint);assert.equal(JSON.parse(h.requests[0].options.body).model,other.model);
  assert.equal(Video.selectProfile(storage).id,gemini.id,'video keeps its existing Gemini-only policy');
});
test('no explicit selection reuses the Gemini profile used by Video Writing',async()=>{
  const unused=profile('openai','unused');unused.apiKey='';const gemini=profile();
  const storage={aiMode:'offline',aiProfiles:[unused,gemini]};assert.equal(Video.selectProfile(storage).id,gemini.id);
  const h=textHarness(storage);assert.equal((await h.run()).ok,true);assert.equal(h.requests[0].url,gemini.endpoint);
});
test('missing key in explicitly chosen profile must not switch to available Gemini',async()=>{
  const selected=profile('openai','selected');selected.apiKey='';const h=textHarness({aiProfiles:[selected,profile()],activeProfileId:selected.id});expectNoRequest(h,await h.run(),'AI_KEY_MISSING');
});
for(const storage of [{},{aiProfiles:[]}])test('no configured provider is AI_NOT_CONFIGURED '+JSON.stringify(storage),async()=>{const h=textHarness(storage);expectNoRequest(h,await h.run(),'AI_NOT_CONFIGURED')});
test('stale explicit profile ID is AI_PROFILE_NOT_FOUND without silent fallback',async()=>{const h=textHarness({aiProfiles:[profile()],activeProfileId:'removed-profile'});expectNoRequest(h,await h.run(),'AI_PROFILE_NOT_FOUND')});
test('saved profile without key is AI_KEY_MISSING',async()=>{const p=profile();p.apiKey='';const h=textHarness({aiProfiles:[p],activeProfileId:p.id});expectNoRequest(h,await h.run(),'AI_KEY_MISSING')});
for(const model of ['', 'x'.repeat(151), 'model\ninvalid'])test('invalid model is reported before request: '+JSON.stringify(model.slice(0,20)),async()=>{
  const p=profile();p.model=model;const h=textHarness({aiProfiles:[p],activeProfileId:p.id});expectNoRequest(h,await h.run(),'AI_MODEL_INVALID');
});
test('invalid endpoint is reported separately',async()=>{const p=profile();p.endpoint='https://example.test/wrong';const h=textHarness({aiProfiles:[p],activeProfileId:p.id});expectNoRequest(h,await h.run(),'AI_ENDPOINT_INVALID')});
test('ambiguous profiles without a choice are not reported as unconfigured',async()=>{
  const unused=profile('openai','unused');unused.apiKey='';const h=textHarness({aiProfiles:[unused,profile('gemini','one'),profile('gemini','two')]});expectNoRequest(h,await h.run(),'AI_PROFILE_AMBIGUOUS');
});
test('local Ollama can keep its existing keyless configuration',async()=>{const p=profile('ollama');const h=textHarness({aiMode:'offline',aiProfiles:[p],activeProfileId:p.id});assert.equal((await h.run()).ok,true);assert.equal(h.requests[0].options.headers.Authorization,undefined)});
test('legacy text configuration remains usable on explicit Writing Solve',async()=>{const h=textHarness({useAI:false,apiKey:'legacy-mock-key',model:'legacy-model'});assert.equal((await h.run()).ok,true);assert.equal(h.requests[0].options.headers.Authorization,'Bearer legacy-mock-key')});
for(const status of [401,403,404,429])test('actual HTTP '+status+' remains a request error',async()=>{
  const p=profile();const h=textHarness({aiProfiles:[p],activeProfileId:p.id},{status,body:{error:{message:p.apiKey}}});const result=await h.run();assert.equal(result.code,'AI_REQUEST_FAILED');assert.match(result.error,new RegExp('HTTP '+status));assert.equal(h.requests.length,1);assert.doesNotMatch(result.error,/existing-mock-key/);
});
test('video still honors selected Gemini and rejects ambiguous or unsupported configuration',()=>{
  const a=profile('gemini','a'),b=profile('gemini','b'),other=profile('groq','c');
  assert.equal(Video.selectProfile({aiProfiles:[a,b],activeProfileId:b.id,aiMode:'offline'}).id,b.id);
  assert.throws(()=>Video.selectProfile({aiProfiles:[other,a,b],activeProfileId:other.id}),/Chọn một Gemini/);
  assert.throws(()=>Video.selectProfile({aiProfiles:[{...a,model:'unsupported'}],activeProfileId:a.id}),/model/i);
});
test('offline Gemini Text Writing goes through one API request and MAIN-world CKEditor verify',async()=>{
 const p=profile(),h=textHarness({aiProfiles:[p],activeProfileId:p.id,aiMode:'offline'}),f=require('./writing-context-fixture.cjs')(),mainWindow=window;
 let gets=0;const get=f.editor.getData;f.editor.getData=()=>{gets++;return get()};
 const main=vm.createContext({document:f.doc,window:mainWindow,getComputedStyle,crypto,URL,Symbol,Object,setTimeout,clearTimeout});
 h.chrome.scripting={executeScript:async options=>{
  assert.equal(options.world,'MAIN');assert.ok(options.target.frameIds?.[0]===21||options.target.documentIds?.[0]==='synthetic-document');assert.doesNotMatch(JSON.stringify(options.args),/existing-mock-key/);
  main.args=options.args;return [{frameId:21,documentId:'synthetic-document',result:await vm.runInContext('('+options.func.toString()+')(...args)',main)}];
 }};
 const writing={found:true,frameId:21,...f.expected(),exercise,videoUrl:''};
 const helper=popup.slice(popup.indexOf('async function solveWriting('),popup.indexOf('async function solve()'));
 const context={state:{},chrome:h.chrome,SparkTextWriting:{scanFrame:async()=>writing},SparkVideoWriting:Writer,status(){},errString:e=>e.message};
 vm.runInNewContext(helper+';globalThis.run=solveWriting;',context);assert.equal(await context.run(writing,3),true);
 assert.equal(h.requests.length,1);assert.equal(f.writes(),1);assert.equal(gets,1);assert.match(f.html(),/<br>/);assert.equal(context.state.writingCompleted,true);
});
