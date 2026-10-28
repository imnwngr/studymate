'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../adapters/ngl.js'),'utf8');
const start=source.indexOf('function wordPoolOrdinal(');
const end=source.indexOf('function scan(){',start);
const context={};
vm.runInNewContext('const tidy=x=>String(x||" ").trim();'+source.slice(start,end)+';globalThis.ordinal=wordPoolOrdinal;',context);
function gap(text,aria=null){return {getAttribute:()=>aria,children:[{textContent:text,matches:()=>false}]};}
test('real Spark missing-total captions retain bounded gap identity',()=>{
  for(let i=1;i<=5;i++)assert.equal(context.ordinal(gap(`Gap ${i} of .`),5),i);
});
test('caption rejects wrong totals, out-of-range and conflicting identities',()=>{
  for(const text of ['Gap 1 of 9','Gap 0 of .','Gap 6 of .','Gap 1 of nonsense'])
    assert.equal(context.ordinal(gap(text),5),null);
  assert.equal(context.ordinal(gap('Gap 2 of .','Gap 1 of 5'),5),null);
  assert.equal(context.ordinal(gap('Gap 1 of 5'),5),1);
});
