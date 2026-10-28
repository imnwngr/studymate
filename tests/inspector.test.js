
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('inspector scripts are registered on all exercise frames',()=>{
  const manifest=JSON.parse(read('manifest.json'));
  assert.equal(manifest.version,'0.8.0');
  assert.equal(manifest.content_scripts[0].all_frames,true);
  assert.ok(manifest.content_scripts[0].js.includes('inspector-content.js'));
});
test('inspector UI includes manual capture, export and clear',()=>{
  const html=read('inspector.html');
  for(const id of ['capture','export','clear','preview','startTrace','stopTrace','recordCount']) assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(read('popup.html'),/id="inspector"/);
  assert.match(read('popup.js'),/chrome\.runtime\.getURL\('inspector\.html'\)/);
});
test('inspector content handler is read-only and never submits or navigates',()=>{
  const script=read('inspector-content.js');
  assert.match(script,/SPARK_INSPECT_CAPTURE/);
  assert.doesNotMatch(script,/\.click\(|\.dispatchEvent\(|fetch\(|XMLHttpRequest|eval\(/);
  assert.match(script,/sensitive\(el\)/);
  for(const action of ['PROBE','TRACE_START','TRACE_STOP','TRACE_GET','TRACE_CLEAR'])
    assert.match(script,new RegExp('SPARK_INSPECT_'+action));
  assert.match(script,/MutationObserver/);
  assert.match(script,/MAX_EVENTS = 360/);
  assert.match(script,/TRACE_MS = 180000/);
  assert.match(read('inspector.js'),/recordings/);
  assert.match(read('inspector.js'),/TRACE_VERSION = '3\.4\.0'/);
});
test('trace export keeps recordings separate from manual screen snapshots',()=>{
  const js=read('inspector.js');
  assert.match(js,/const recordings = \[\]/);
  assert.match(js,/SPARK_INSPECT_TRACE_START/);
  assert.match(js,/SPARK_INSPECT_TRACE_STOP/);
  assert.match(js,/SPARK_INSPECT_TRACE_GET/);
  assert.match(js,/TRACE_VERSION = '3\.4\.0'/);
  assert.match(js,/captures,recordings/);
});
test('correction trace captures temporary editor and modifications without direct page writes',()=>{
  const js=read('inspector-content.js');
  for(const value of ['pointerdown','pointerup','click','focusin','beforeinput','input','change','keydown','dom-mutation','settled'])
    assert.ok(js.includes(value));
  assert.match(js,/span\.input-text/);
  assert.match(js,/data-model-id/);
  assert.match(js,/getComputedStyle/);
  assert.match(js,/MutationObserver/);
  assert.match(js,/MAX_BYTES = 650000/);
  assert.match(js,/TRACE_MS = 180000/);
  assert.doesNotMatch(js,/\.dispatchEvent\(|\.click\(|fetch\(|XMLHttpRequest|eval\(/);
});
test('diagnostic log excludes sensitive inputs and arbitrary text keys',()=>{
  const js=read('inspector-content.js');
  assert.match(js,/\['password', 'hidden', 'file'\]/);
  assert.match(js,/\['Enter', 'Escape', 'Tab', 'Backspace', 'Delete'\]/);
  assert.match(read('inspector.html'),/Record interaction|Universal interaction trace/);
  assert.match(read('inspector.html'),/review before sharing/i);
});
