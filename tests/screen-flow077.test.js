const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('intra-activity forwarding is bounded to known screens',()=>{
 const src=read('adapters/ngl.js');
 assert.match(src,/expectedIndex>=expectedCount-1/);
 assert.match(src,/availableActionControls\('forward'\)/);
 assert.match(src,/lastScan\.screenCount!==expectedCount/);
 assert.match(src,/if\(!appliedStillMatches\(\)\)/);
});
test('Solve repeats per-screen only after complete QTI verification',()=>{
 const src=read('popup.js');
 assert.match(src,/if\(!state\.verifiedQti\)/);
 assert.match(src,/if\(!\(await applyAnswers\(\)\)\)break/);
 assert.match(src,/for\(let iteration=0;iteration<30;iteration\+\+\)/);
 assert.match(src,/type:'SPARK_FORWARD_SCREEN'/);
 assert.doesNotMatch(src.slice(src.indexOf('async function autoSolveAndFill'),src.indexOf('async function submitAndNext')),/SPARK_SUBMIT_NEXT|forward_lo/);
});
