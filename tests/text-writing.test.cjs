'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
require('../providers.js');const AI=require('../text-writing-ai.js'),D=require('../text-writing.js');
const p=SparkProviders.newProfile('gemini','g');p.apiKey='mock-secret';
const exercise='Design a form.\nSample answer\nName: Example Learner\nCHECK\nIs it clear?';
test('request carries whole exercise and safeguards examples',()=>{const req=AI.request(p,exercise);assert.equal(req.model,p.model);assert.equal(req.messages[1].content,'EXERCISE:\n'+exercise);assert.match(req.messages[0].content,/Do not copy sample personal details/);assert.match(req.messages[0].content,/empty form/);assert.equal(req.stream,false)});
test('multiline plain answer preserves form structure',()=>{const text='Name: __________\nFirst language: __________';assert.equal(AI.parse({choices:[{message:{content:text}}]}),text)});
test('reject blank output and missing key',()=>{assert.throws(()=>AI.parse({choices:[{message:{content:'  '}}]}));assert.throws(()=>AI.request({...p,apiKey:''},exercise),/API key/)});
test('background sends one request using selected provider',async()=>{let listener,request;const storage={aiMode:'single',activeProfileId:'g',aiProfiles:[p]};const ctx={importScripts:()=>{},SparkProviders,SparkTextWritingAI:AI,AbortController,setTimeout,clearTimeout,URL,TypeError,fetch:async(url,opts)=>{request={url,opts};return {ok:true,status:200,json:async()=>({choices:[{message:{content:'Name: ____\nLanguage: ____'}}]})}},chrome:{storage:{local:{get:async()=>storage}},permissions:{contains:async()=>true},runtime:{id:'id',getURL:x=>'chrome-extension://id/'+x,onMessage:{addListener:f=>listener=f}}}};vm.runInNewContext(fs.readFileSync(require.resolve('../background.js'),'utf8'),ctx);const result=await new Promise(resolve=>listener({type:'SPARK_TEXT_WRITING',exercise},{id:'id',url:'chrome-extension://id/popup.html'},resolve));assert.equal(result.answer,'Name: ____\nLanguage: ____');assert.ok(JSON.parse(request.opts.body).messages[1].content.includes('Sample answer'));assert.equal(request.opts.headers.Authorization,'Bearer mock-secret')});
function el(tag,children=[],opts={}){const x={nodeType:1,tagName:tag.toUpperCase(),childNodes:children,parentElement:null,hidden:!!opts.hidden,id:opts.id||'',hasAttribute:()=>false,getAttribute:()=>null,closest:()=>null,matches:s=>!!opts.skip&&s.includes(opts.skip),querySelectorAll:()=>[],contains:n=>n===opts.editor};for(const c of children)c.parentElement=x;return x}const t=s=>({nodeType:3,nodeValue:s});
function fixture(){const frame=el('iframe'),root=el('div',[el('h2',[t('Design a form')]),el('p',[t('Use the sample answer.')]),el('div',[el('p',[t('Sample answer: Example Learner')])]),el('div',[el('p',[t('CHECK')]),el('ul',[el('li',[t('Is it clear?')])])]),el('nav',[t('Navigation')],{skip:'nav'}),el('p',[t('hidden')],{hidden:true}),frame],{id:'content_wrap_1',editor:frame});global.getComputedStyle=()=>({display:'block',visibility:'visible'});global.document={querySelectorAll:s=>s==='video'?[]:s.startsWith('.content-wrap')?[root]:s.startsWith('iframe')?[frame]:[]};return {root,frame}}
test('extracts ordered multi-column exercise, sample and checklist excluding navigation',()=>{fixture();const x=D.inspect();assert.equal(x.found,true);assert.match(x.exercise,/Design a form[\s\S]*Sample answer: Example Learner[\s\S]*CHECK[\s\S]*Is it clear/);assert.doesNotMatch(x.exercise,/Navigation|hidden/)});
test('refuses ambiguous editor and skips specialized controls',()=>{const f=fixture();document.querySelectorAll=s=>s.startsWith('.content-wrap')?[f.root]:s.startsWith('iframe')?[f.frame,el('iframe')]:[];assert.match(D.inspect().error,/duy nhất/);fixture();const root=document.querySelectorAll('.content-wrap')[0];root.querySelectorAll=()=>[el('select')];assert.equal(D.inspect().found,false)});
test('ignores video frame',()=>{fixture();document.querySelectorAll=s=>s==='video'?[el('video')]:[];assert.equal(D.inspect().found,false)});
test('refuses multiple candidate frames',async()=>{const chrome={scripting:{executeScript:async()=>[{frameId:2,result:{found:true}},{frameId:3,result:{found:true}}]}};assert.match((await D.scan(chrome,1)).error,/nhiều/)});
test('bridge escapes and verifies multiline answer on repeated writes',async()=>{
 const bridge=require('../video-writing.js'),f=require('./writing-context-fixture.cjs')();
 for(let i=0;i<2;i++){const context=await bridge.inspectFrame('captureWriting',f.expected());assert.equal((await bridge.inspectFrame('writeWriting',context,'Name: ____\nNote: <example>')).written,true);}
 assert.match(f.html(),/&lt;example&gt;/);assert.match(f.html(),/<br>/);assert.equal(f.writes(),2);
});

test('finds a visible content-wrap with no assumed id prefix',()=>{const {root,frame}=fixture();root.id='writing-container';let selectors=[];document.querySelectorAll=s=>{selectors.push(s);return s==='video'?[]:s==='.content-wrap'?[root]:s.startsWith('iframe')?[frame]:[]};const result=D.inspect();assert.equal(result.found,true);assert.equal(result.rootId,'writing-container');assert.ok(selectors.includes('.content-wrap'))});
test('reports empty exercise when a unique editor and root exist',()=>{const {root}=fixture();root.childNodes=[];assert.match(D.inspect().error,/trích xuất/)});
test('writing regression: withMedia class without a video selects text',()=>{const {root}=fixture();root.id='content_wrap_0';root.className='content-wrap activity--withRubric activity--withContent activity--withMedia';const result=D.inspect();assert.equal(result.found,true);assert.equal(result.videoUrl,'');assert.match(result.exercise,/Sample answer[\s\S]*CHECK/)});
test('writing with a video uses the same complete instructions',()=>{const {root}=fixture();const video=el('video');video.currentSrc='';video.ownerDocument={baseURI:'https://example.test/cdn/index'};video.getAttribute=k=>k==='src'?'media/movie.mp4':null;video.querySelector=()=>null;root.querySelectorAll=s=>s==='video'?[video]:[];const result=D.inspect();assert.equal(result.videoUrl,'https://example.test/cdn/media/movie.mp4');assert.match(result.exercise,/Sample answer[\s\S]*CHECK/)});
test('writing waits for an editor only on an identifiable writing screen',()=>{const {root}=fixture();root.innerText='Design a form';root.querySelector=()=>null;document.querySelectorAll=s=>s==='.content-wrap'?[root]:[];assert.equal(D.inspect().pending,true)});
for(const video of [false,true])test('Solve routes '+(video?'video':'text')+' through one writer',async()=>{
 const source=fs.readFileSync(require.resolve('../popup.js'),'utf8');const code=source.slice(source.indexOf('async function autoSolveAndFill()'),source.indexOf('async function submitAndNext()'));const calls=[];const nodes={auto:{},cancelVideo:{}};const writing={found:true,frameId:3,rootId:'content_wrap_0',exercise:'Design a form.\nSample answer\nCHECK',videoUrl:video?'https://example.test/video.mp4':''};
 const ctx={state:{questions:[]},$:id=>nodes[id],setTimeout,Date,Math,Set,Promise,chrome:{tabs:{query:async()=>[{id:1,url:'https://learn.eltngl.com/'}]},runtime:{sendMessage:async m=>{calls.push(m);return {ok:true,answer:'Name: ____\nLanguage: ____'}}}},SparkSites:{recognize:()=>({adapterId:'ngl'})},SparkTextWriting:{scan:async()=>writing,scanFrame:async()=>writing},SparkVideoWriting:{capture:async()=>({contextToken:"synthetic-context"}),writeText:async(_c,_t,_f,answer)=>{calls.push({write:answer});return {written:true}}},status(){},solveDiagnostic(){},errString:e=>e.message};vm.runInNewContext(source.slice(source.indexOf('async function solveWriting('),source.indexOf('async function solve()'))+code+';globalThis.run=autoSolveAndFill;',ctx);await ctx.run();assert.equal(calls.length,2);assert.equal(calls[0].type,video?'SPARK_VIDEO_SOLVE':'SPARK_TEXT_WRITING');assert.equal(video?calls[0].payload.instructions:calls[0].exercise,writing.exercise);assert.equal(calls[1].write,'Name: ____\nLanguage: ____');assert.equal(nodes.auto.disabled,false);
});
test('isolated detector chooses content frame without CKEDITOR and MAIN writer verifies',async()=>{
 const bridge=require('../video-writing.js'),f=require('./writing-context-fixture.cjs')(),frameId=73,childId=74,worlds=[],mainWindow=window;
 const chrome={scripting:{executeScript:async opts=>{worlds.push(opts.world);if(opts.world==='ISOLATED'){global.window={};return [{frameId,result:opts.func(...(opts.args||[]))},...(opts.target.allFrames?[{frameId:childId,result:{found:false}}]:[])];}global.window=mainWindow;return [{frameId,documentId:'synthetic-document',result:await opts.func(...opts.args)}];}}};
 const found=await D.scan(chrome,8);assert.equal(found.frameId,frameId);assert.equal(found.found,true);
 const context=await bridge.capture(chrome,8,frameId,found);assert.ok(context.contextToken);
 const rechecked=await D.scanFrame(chrome,8,frameId);assert.equal(rechecked.exercise,found.exercise);
 assert.equal((await bridge.writeText(chrome,8,frameId,'Name: ____',context)).written,true);assert.equal(f.writes(),1);assert.deepEqual(worlds,['ISOLATED','MAIN','ISOLATED','MAIN']);
});

test('preserves whitespace between inline words for writing detection',()=>{const {root}=fixture();root.childNodes=[el('span',[t('Design')]),t(' '),el('span',[t('a form')])];assert.equal(D.inspect().exercise,'Design a form')});
for(const phase of ['before write','during write'])test('CKEditor body replacement '+phase,async()=>{
 const bridge=require('../video-writing.js'),f=require('./writing-context-fixture.cjs')();
 const context=await bridge.inspectFrame('captureWriting',f.expected());
 const replaceBody=()=>{
   const replacement={...f.body};
   f.body.isConnected=false;
   f.frame.contentDocument.body=replacement;
   f.editor.editable=()=>({$:replacement});
 };
 if(phase==='before write')replaceBody();
 else{
   const setData=f.editor.setData;
   f.editor.setData=(html,options)=>{replaceBody();setData(html,options);};
 }
 const result=await bridge.inspectFrame('writeWriting',context,'A verified draft.');
 assert.equal(f.writes(),phase==='before write'?0:1);
 if(phase==='during write')assert.equal(result.written,true);
 else assert.equal(result.code,'WRITING_CONTEXT_CHANGED');
});
test('Solve advances a reference screen and checks for a writing editor in the same frame',async()=>{
 const source=fs.readFileSync(require.resolve('../popup.js'),'utf8');
 const auto=source.slice(source.indexOf('async function autoSolveAndFill()'),source.indexOf('async function submitAndNext()'));
 const calls=[],writing={found:true,exercise:'Write a report.'};
 const state={tabId:3,frameId:7,questions:[],screenIndex:0,screenCount:2,referenceScreen:true};
 const context={state,chrome:{tabs:{query:async()=>[]}},$:()=>({}),scanPage:async()=>true,
   sendFrame:async(id,m)=>{calls.push([id,m.type]);return {ok:true,result:{advanced:true}};},
   SparkTextWriting:{scanFrame:async(api,tab,id)=>{calls.push([tab,id]);return writing;}},
   solveWriting:async(result,tab)=>{calls.push([tab,result.exercise]);state.writingCompleted=true;},
   solveDiagnostic(){},status(){},errString:e=>e.message};
 vm.runInNewContext(auto+';globalThis.run=autoSolveAndFill;',context);
 await context.run();
 assert.deepEqual(calls,[[7,'SPARK_FORWARD_SCREEN'],[3,7],[3,'Write a report.']]);
});
test('writing uses the referenced chart from the same activity and screen',()=>{
 const {root,frame}=fixture();
 const reference=el('div',[],{id:'content_wrap_0'});
 const img=el('img');img.alt='A chart shows bicycles at 70% and cars at 30%.';
 reference.querySelector=s=>s.includes('.interaction')?{}:null;
 reference.querySelectorAll=s=>s==='img[alt]'?[img]:[];
 let presenting=true;
 document.URL='https://example.test/activity/a';
 document.title='Writing';
 document.querySelectorAll=s=>s==='.content-wrap'?[presenting?reference:root]:s.startsWith('iframe')&&!presenting?[frame]:[];
 let instruction='Write about the chart on Screen 1.';
 root.querySelector=s=>s==='.layout__rubric'?{innerText:instruction}:null;
 assert.equal(D.inspect().found,false);
 presenting=false;
 assert.ok(D.inspect().exercise.includes(img.alt));
 instruction='Write about the graph from Screen 3.';
 assert.match(D.inspect().error,/WRITING_REFERENCE_MISSING/);
 instruction='Write about the chart on Screen 1.';
 document.URL+='-different';
 assert.match(D.inspect().error,/WRITING_REFERENCE_MISSING/);
});
test('reports missing editor and specialised controls without CKEDITOR',()=>{const {root}=fixture();global.window={};root.innerText='Design a form';root.querySelector=()=>null;document.querySelectorAll=s=>s==='.content-wrap'?[root]:[];assert.equal(D.inspect().reason,'EDITOR_NOT_FOUND');const f=fixture();f.root.querySelectorAll=()=>[el('select')];assert.equal(D.inspect().reason,'SPECIALIZED_INTERACTION')});
test('scanFrame rejects an unrelated returned frame',async()=>{const chrome={scripting:{executeScript:async()=>[{frameId:19,result:{found:true}}]}};await assert.rejects(D.scanFrame(chrome,1,20),/frame bài viết/)});
for(const [selector,tag] of [['[role="radio"]','div'],['[role="checkbox"]','div'],['[role="combobox"]','div'],['.interaction.om-text-gap','div'],['input:not([type="hidden"])','input'],['[role="textbox"]','div'],['select','select']])test('specialized guard reports matched '+selector,()=>{
  const {root}=fixture(),block=el(tag);block.parentElement=root;root.children=[block];block.matches=s=>s===selector;block.closest=()=>null;root.querySelectorAll=s=>s==='video'?[]:[block];
  const result=D.inspect();assert.equal(result.reason,'SPECIALIZED_INTERACTION');assert.deepEqual(result.diagnostic.selectors,[selector]);assert.equal(result.diagnostic.tag,tag);assert.equal(result.diagnostic.path,tag+':nth-child(1)');assert.equal(result.diagnostic.classification,'visible-outside-cke');assert.doesNotMatch(JSON.stringify(result.diagnostic),/Example Learner|mock-secret/);
});
test('hidden controls and elements inside .cke do not trigger specialized guard',()=>{
 const {root}=fixture(),hidden=el('input',[],{hidden:true}),toolbar=el('select');toolbar.closest=s=>s.includes('.cke')?{}:null;root.querySelectorAll=s=>s==='video'?[]:[hidden,toolbar];assert.equal(D.inspect().found,true);
});
function recordingFixture(extra=[]){
 const {root,frame}=fixture(),recording=el('div');recording.parentElement=root;root.children=[recording,...extra];
 recording.contains=n=>n===frame;recording.closest=s=>s==='.content-wrap'?root:null;recording.attributes=[];recording.classList=new Set(['interaction','ic-speaking-and-recording']);recording.classList.contains=name=>recording.classList.has(name);recording.querySelectorAll=()=>[];
 recording.matches=s=>s==='.interaction.ic-speaking-and-recording';
 root.querySelectorAll=s=>s==='video'?[]:s==='.interaction.ic-speaking-and-recording'?[recording]:[recording,...extra];return {root,recording};
}
test('editor-only Recording wrapper needs no category exception',()=>{recordingFixture();const x=D.inspect();assert.equal(x.found,true);assert.equal(x.allowAuxRecording,undefined);assert.match(x.exercise,/Design a form/)});
test('principal pronunciation marking remains blocked even in confirmed Writing context',()=>{const f=recordingFixture();f.recording.matches=s=>s==='.interaction.ic-speaking-and-recording'||s==='.im-marking';assert.equal(D.inspect({allowAuxRecording:true}).reason,'SPECIALIZED_INTERACTION')});
test('recording without Writing instructions remains ineligible',()=>{const f=recordingFixture();f.root.childNodes=[el('p',[t('Record your pronunciation.')])];assert.equal(D.inspect({allowAuxRecording:true}).reason,'WRITING_INSTRUCTION_NOT_FOUND')});
for(const selector of ['[role="radio"]','[role="checkbox"]','[role="combobox"]','.interaction.om-text-gap','.interaction.is-linking-lines'])test('confirmed Writing still blocks '+selector,()=>{const other=el('div');other.matches=s=>s===selector;other.closest=()=>null;recordingFixture([other]);assert.equal(D.inspect({allowAuxRecording:true}).reason,'SPECIALIZED_INTERACTION')});
test('scanFrame passes confirmed Writing context to detector',async()=>{let seen;const chrome={scripting:{executeScript:async opts=>{seen=opts;return [{frameId:42,result:{found:true}}]}}};await D.scanFrame(chrome,3,42,{allowAuxRecording:true});assert.deepEqual(seen.args,[{allowAuxRecording:true}]);assert.equal(seen.world,'ISOLATED')});
test('recording widget with word pool on the same node remains blocked',()=>{const f=recordingFixture();f.recording.matches=s=>s==='.interaction.ic-speaking-and-recording'||s==='.interaction.om-text-gap';assert.equal(D.inspect({allowAuxRecording:true}).reason,'SPECIALIZED_INTERACTION')});
for(const mode of ['no-editor-containment','custom-element','unknown-recording-state','pointer-control','live-stream'])test('Recording wrapper fails closed: '+mode,()=>{
 const {recording}=recordingFixture();
 if(mode==='no-editor-containment')recording.contains=()=>false;
 if(mode==='unknown-recording-state')recording.getAttribute=name=>name==='data-recording-state'?'pending':null;
 if(mode==='live-stream')recording.srcObject={active:true};
 if(mode==='custom-element')recording.querySelectorAll=()=>[{tagName:'CUSTOM-RECORDER',getAttribute:()=>null,closest:()=>null,hasAttribute:()=>false}];
 if(mode==='pointer-control'){const style=global.getComputedStyle;global.getComputedStyle=node=>({...style(node),cursor:node===recording?'pointer':'auto'});}
 assert.equal(D.inspect({allowAuxRecording:true}).reason,'SPECIALIZED_INTERACTION');
});
test('CKEditor dialog text is excluded from exercise instructions',()=>{const {root}=fixture();root.childNodes.push(el('div',[t('SYNTHETIC_EDITOR_DIALOG_TEXT')],{skip:'.cke_dialog'}));assert.doesNotMatch(D.inspect().exercise,/SYNTHETIC_EDITOR_DIALOG_TEXT/)});
