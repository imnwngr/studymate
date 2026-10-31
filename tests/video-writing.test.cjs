'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),V=require('../video-writing.js'),fixture=require('./writing-context-fixture.cjs');
const capture=f=>V.inspectFrame('captureWriting',f.expected());
for(const video of [false,true]){
 test((video?'video':'text')+' unchanged context writes, escapes and verifies multiline on repeated Solve',async()=>{
  const f=fixture({video});for(let i=0;i<2;i++){const context=await capture(f);assert.ok(context.contextToken);assert.equal((await V.inspectFrame('writeWriting',context,'Name: ____\nNote: <example>')).written,true);}assert.equal(f.writes(),2);assert.match(f.html(),/&lt;example&gt;/);
 });
 for(const [name,change]of [
  ['exercise identity',f=>f.doc.URL='https://example.test/cdn_proxy/other/index'],
  ['document with same URL',f=>global.document={...f.doc}],
  ['instructions',f=>f.setText('Write a different paragraph.')],
  ['editor instance',f=>window.CKEDITOR.instances.editor1={...f.editor}],
  ['editor iframe document',f=>f.frame.contentDocument={body:f.body}],
  ['editor detached',f=>f.frame.isConnected=false],
  ['editor no longer ready',f=>f.editor.status='destroyed'],
  ['editor read only',f=>f.editor.readOnly=true],
  ['editor mode',f=>f.editor.mode='source'],
  ['editable body replaced',f=>f.editor.editable=()=>({$:{isConnected:true}})],
  ['root replaced',f=>{const query=f.doc.querySelectorAll;f.doc.querySelectorAll=s=>s==='.content-wrap'?[{...f.scope}]:query(s);f.scope.isConnected=false;}]
 ])test((video?'video':'text')+' refuses '+name+' changed after popup recheck',async()=>{const f=fixture({video}),context=await capture(f);assert.ok(context.contextToken);change(f);const result=await V.inspectFrame('writeWriting',context,'Old answer');assert.equal(result.code,'WRITING_CONTEXT_CHANGED');assert.equal(f.writes(),0);assert.equal(f.html(),'');});
}
test('video URL changed refuses write',async()=>{const f=fixture({video:true}),context=await capture(f);f.media.currentSrc='https://example.test/media/other.mp4';assert.equal((await V.inspectFrame('writeWriting',context,'Old answer')).code,'WRITING_CONTEXT_CHANGED');assert.equal(f.writes(),0)});
for(const url of ['', 'about:blank','https://example.test/no-identity'])test('unknown interactive identity fails closed: '+url,async()=>{const f=fixture();f.doc.URL=url;assert.equal((await capture(f)).code,'WRITING_CONTEXT_CHANGED');assert.equal(f.writes(),0)});
test('capture rejects detector context that already changed',async()=>{const f=fixture(),expected=f.expected();f.setText('Write another answer');assert.equal((await V.inspectFrame('captureWriting',expected)).code,'WRITING_CONTEXT_CHANGED');assert.equal(f.writes(),0)});
test('new capture invalidates prior operation token',async()=>{const f=fixture(),old=await capture(f);await capture(f);assert.equal((await V.inspectFrame('writeWriting',old,'Old answer')).code,'WRITING_CONTEXT_CHANGED');assert.equal(f.writes(),0)});
test('missing capture refuses direct legacy write',async()=>{const f=fixture();assert.equal((await V.inspectFrame('write',null,'Old answer')).code,'WRITING_CONTEXT_CHANGED');assert.equal(f.writes(),0)});
test('capture checks unique ready editor before any request',async()=>{const f=fixture();window.CKEDITOR.instances.other={...f.editor};assert.equal((await capture(f)).code,'WRITING_CONTEXT_CHANGED');assert.equal(f.writes(),0)});
test('scan resolves relative media in content frame',async()=>{const f=fixture({video:true});f.media.currentSrc='';f.media.getAttribute=()=> 'media/movie.mp4';const s=await V.inspectFrame('scan');assert.equal(s.videoUrl,'https://example.test/media/movie.mp4')});
test('ambiguous nested frames refused',async()=>{assert.match((await V.scan({scripting:{executeScript:async()=>[{frameId:2,result:{found:true}},{frameId:3,result:{found:true}}]}},7)).error,/nhiều/)});
test('wrapper pins documentId and fails closed when frame reloads',async()=>{const f=fixture();let options;const chrome={scripting:{executeScript:async o=>{options=o;return [{frameId:9,documentId:'doc-a',result:await o.func(...o.args)}]}}};const context=await V.capture(chrome,1,9,f.expected());assert.equal(context.documentId,'doc-a');assert.equal((await V.writeText(chrome,1,9,'Answer',context)).written,true);assert.deepEqual(options.target,{tabId:1,documentIds:['doc-a']});chrome.scripting.executeScript=async()=>{throw Error('Document removed')};assert.equal((await V.writeText(chrome,1,9,'Old answer',context)).code,'WRITING_CONTEXT_CHANGED');assert.equal(f.writes(),1)});
test('mutation during callback cannot report false verification',async()=>{const f=fixture(),context=await capture(f);f.editor.setData=(_data,options)=>{f.doc.URL='https://example.test/cdn_proxy/other/index';options.callback()};assert.equal((await V.inspectFrame('writeWriting',context,'Answer')).code,'WRITING_CONTEXT_CHANGED')});
test('second editor mapped to the same iframe invalidates captured identity',async()=>{const f=fixture(),context=await capture(f);window.CKEDITOR.instances.other={...f.editor};assert.equal((await V.inspectFrame('writeWriting',context,'Old answer')).code,'WRITING_CONTEXT_CHANGED');assert.equal(f.writes(),0)});
test('editable body becomes non-editable before write',async()=>{const f=fixture(),context=await capture(f);f.body.getAttribute=()=> 'false';assert.equal((await V.inspectFrame('writeWriting',context,'Old answer')).code,'WRITING_CONTEXT_CHANGED');assert.equal(f.writes(),0)});
