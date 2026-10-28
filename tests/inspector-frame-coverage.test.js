'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname,'../inspector.js'),'utf8');

async function harness() {
  const dom = new Map();
  const handlers = {};
  let poll = null;
  let downloaded = null;
  const state = {exerciseLoaded:false,genericLoaded:false,started:0,stopped:0};
  const node = id => {
    if(!dom.has(id)) dom.set(id,{textContent:'',disabled:false,children:[],
      addEventListener(type,fn){handlers[id+':'+type]=fn;},
      append(child){this.children.push(child);},replaceChildren(){this.children=[];},
      remove(){},click(){},set href(x){this._href=x;},set download(x){this._download=x;}});
    return dom.get(id);
  };
  const chrome = {
    tabs: {
      async get(){return {id:99,url:'https://learn.eltngl.com/dashboard/assignments/example',title:'NGL Spark'};},
      async query(){return [];},
      async sendMessage(_tab,{type},{frameId}){
        if (type==='SPARK_INSPECT_PROBE' && frameId===0) return {ok:true,result:{instanceId:'dashboard-1',adapter:'ngl',interactionCount:0,correctionWidgets:0}};
        if (type==='SPARK_INSPECT_PROBE' && frameId===1941) return {ok:true,result:{instanceId:'editor-1',correctionWidgets:1,interactionCount:2}};
        if (type==='SPARK_INSPECT_PROBE' && frameId===1942) return {ok:true,result:{instanceId:'dropdown-1',correctionWidgets:0,interactionCount:1}};
        if (type==='SPARK_INSPECT_TRACE_START' && [1941,1942].includes(frameId)) {state.started++;return {ok:true};}
        if (type==='SPARK_INSPECT_TRACE_STOP' && [1941,1942].includes(frameId)) {state.stopped++;return {ok:true};}
        if (type==='SPARK_INSPECT_TRACE_GET' && frameId===1941) return {ok:true,result:{eventCount:5,events:[{type:'initial'},{type:'click'},{type:'input'},{type:'dom-mutation'},{type:'final'}]}};
        if (type==='SPARK_INSPECT_TRACE_GET' && frameId===1942) return {ok:true,result:{eventCount:4,events:[{type:'initial'},{type:'click'},{type:'change'},{type:'final'}]}};
        if (type==='SPARK_INSPECT_CAPTURE') return {ok:true,result:{title:frameId===1942?'Real life':'NGL',summary:{types:frameId===1942?['is-dropdown']:[],interactionCount:frameId===1942?1:0}}};
        return {ok:false,error:'unavailable'};
      }
    },
    webNavigation:{async getAllFrames(){const url='https://learn.eltngl.com/assignments/example';const frames=[{frameId:0,parentFrameId:-1,url},{frameId:1940,parentFrameId:0,url}];if(state.exerciseLoaded)frames.push({frameId:1941,parentFrameId:1940,url});if(state.genericLoaded)frames.push({frameId:1942,parentFrameId:1940,url});return frames;}},
    permissions:{async contains(){return true;}},
    scripting:{async executeScript({target}){assert.ok(Array.isArray(target.frameIds));return [];}}
  };
  const context={chrome,location:{search:'?tabId=99'},URLSearchParams,URL:class extends URL {static createObjectURL(blob){downloaded=blob;return 'blob:test';}static revokeObjectURL(){}},Blob,
    setTimeout(){return 1;},clearTimeout(){},setInterval(fn){poll=fn;return 123;},clearInterval(){poll=null;},
    document:{getElementById:node,createElement(tag){return node('dynamic-'+tag+'-'+dom.size);},body:{append(){}}},console};
  vm.runInNewContext(script,context,{timeout:5000});
  await new Promise(resolve=>setImmediate(resolve));
  return {node,handlers,state,getPoll:()=>poll,download:async()=>downloaded?JSON.parse(await downloaded.text()):null};
}

test('empty Dashboard/nullblank recording is clearly marked unverified, not success',async()=>{
  const h=await harness();
  await h.handlers['startTrace:click']();
  assert.match(h.node('recordState').textContent,/Waiting/);
  assert.match(h.node('coverage').textContent,/0 interaction/);
  assert.equal(h.state.started,0);
  await h.handlers['stopTrace:click']();
  assert.match(h.node('status').textContent,/No exercise interaction/);
  await h.handlers['export:click']();
  const data=await h.download();
  assert.equal(data.version,'3.4.0');
  assert.equal(data.recordings.length,1);
  assert.equal(data.recordings[0].verified,false);
  assert.match(data.recordings[0].warning,/No exercise interaction/);
  assert.ok(data.coverage.length);
});

test('delayed exercise frame becomes attached automatically and produces verified trace',async()=>{
  const h=await harness();
  await h.handlers['startTrace:click']();
  h.state.exerciseLoaded=true;
  await h.getPoll()();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.state.started,1);
  assert.match(h.node('recordState').textContent,/Recording in 1 exercise iframe/);
  await h.handlers['stopTrace:click']();
  assert.equal(h.state.stopped,1);
  await h.handlers['export:click']();
  const data=await h.download();
  assert.equal(data.recordings[0].verified,true);
  assert.equal(data.recordings[0].frames[0].eventCount,5);
  assert.ok(data.coverage.some(s=>s.correctionFrames.length===1));
});


test('non-correction exercise frame attaches, records and exports before/after snapshots',async()=>{
  const h=await harness();
  h.state.genericLoaded=true;
  await h.handlers['startTrace:click']();
  assert.equal(h.state.started,1);
  assert.match(h.node('recordState').textContent,/Recording in 1 exercise iframe/);
  assert.match(h.node('coverage').textContent,/1 interaction/);
  await h.handlers['stopTrace:click']();
  await h.handlers['export:click']();
  const data=await h.download();
  assert.equal(data.recordings[0].verified,true);
  assert.equal(data.recordings[0].verificationScope,'interaction-events-observed-only; not answer correctness');
  assert.equal(data.recordings[0].frames[0].eventCount,4);
  assert.ok(data.recordings[0].screens.before.some(f=>f.title==='Real life'));
  assert.ok(data.recordings[0].screens.after.some(f=>f.title==='Real life'));
  assert.ok(data.coverage.some(f=>f.exerciseFrames.some(x=>x.frameId===1942)));
});
