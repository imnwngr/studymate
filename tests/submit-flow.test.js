'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../adapters/ngl.js'),'utf8');

test('submit prefers a unique actionable Spark gradebook control, with check fallback',()=>{
  assert.match(src,/availableActionControls\('submit'\)/);
  assert.match(src,/availableActionControls\('check'\)/);
  assert.match(src,/gradebook\.length===1\?'gradebook'/);
  assert.match(src,/gradebook\.length>1 \|\| checks\.length>1/);
  assert.doesNotMatch(src,/querySelector\('button\[type=submit\]'/);
});
test('gradebook transition requires original node to become inactive before navigation',()=>{
  assert.match(src,/control\.isConnected && \(control\.disabled \|\| control\.classList\.contains\('inactive_button'\)\)/);
  assert.match(src,/activeContentRoot\(\)!==originalRoot/);
  assert.match(src,/if\(!transitioned\)/);
});
test('only the explicit next learning-object button can be requested',()=>{
  assert.match(src,/availableActionControls\('forward_lo'\)/);
  assert.match(src,/candidates\.length!==1/);
  assert.match(src,/setTimeout\(\(\)=>/);
  assert.match(src,/lastScan\.submitted && activeContentRoot\(\)===originalRoot/);
});
test('submitting remains opt-in, verified, and protected from duplicate calls',()=>{
  assert.match(src,/if\(lastScan\.submitted\)return/);
  assert.match(src,/lastScan\.applied\.size!==expected/);
  assert.match(src,/lastScan\.submitted=true;\s*control\.click\(\)/);
  const popup=fs.readFileSync(path.join(__dirname,'../popup.js'),'utf8');
  assert.doesNotMatch(popup,/confirm\(t\('submitAsk'\)\)/); 
});
