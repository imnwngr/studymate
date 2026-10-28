'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const content=fs.readFileSync(path.join(root,'adapters/ngl.js'),'utf8');
const popup=fs.readFileSync(path.join(root,'popup.js'),'utf8');
const tool=fs.readFileSync(path.join(root,'tools/inspect-submit-next.js'),'utf8');
test('copy uses active-screen DOM rather than shortened preview or guessed answers',()=>{
  assert.match(content,/function copyPrompt\(/);
  assert.match(content,/activeContentRoot\(\)/);
  assert.match(content,/SPARK_COPY_PROMPT/);
  assert.match(content,/findWordBank\(root,blocks,rubric\)/);
  assert.match(popup,/sendFrame\(state\.frameId,\{type:'SPARK_COPY_PROMPT'\}\)/);
  assert.doesNotMatch(popup,/function answerText\(/);
});
test('submission inspector is read-only and exports locally',()=>{
  assert.match(tool,/SPARK_SUBMIT_NEXT_DIAGNOSTIC/);
  assert.match(tool,/navigator\.clipboard\.writeText/);
  assert.match(tool,/URL\.createObjectURL/);
  assert.match(tool,/addEventListener\('click',onClick,true\)/);
  assert.doesNotMatch(tool,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|\beval\s*\(/);
  assert.doesNotMatch(tool,/button\.click\s*\(|\[data-event=\"check\"\]\.click/);
});
