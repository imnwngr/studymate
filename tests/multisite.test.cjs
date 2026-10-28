'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const source=file=>fs.readFileSync(path.join(base,file),'utf8');
function context(files){
  const ctx=vm.createContext({URL,console,setTimeout,clearTimeout});
  for(const file of files)vm.runInContext(source(file),ctx,{filename:file});
  return ctx;
}
const sites=context(['core/site-registry.js']).SparkSites;
test('registry recognizes exact NGL host without granting support to spoofed or unrelated hosts',()=>{
  assert.equal(sites.recognize('https://learn.eltngl.com/course').id,'ngl-spark');
  for(const url of ['https://learn.eltngl.com.evil.test','https://notlearn.eltngl.com','https://evil-eltngl.com','https://example.org','https://learn.eltngl.com@evil.test','not a url'])assert.equal(sites.recognize(url),null,url);
});
test('registered frame origins use bounded Avallain subdomain matching',()=>{
  assert.equal(sites.frameSite('https://player.avallain.net/item').adapterId,'ngl');
  assert.equal(sites.frameSite('https://deep.player.avallain.net/item').adapterId,'ngl');
  assert.equal(sites.frameSite('https://avallain.net.evil.test'),null);
  assert.equal(sites.frameSite('https://evilavallain.net'),null);
  assert.equal(sites.recognize('https://player.avallain.net'),null);
});
test('restricted pages are access failures rather than unknown exercises',()=>{
  for(const url of ['chrome://extensions','edge://settings','about:blank','file:///C:/x','https://chromewebstore.google.com/detail/x','https://chrome.google.com/webstore/detail/x'])assert.equal(sites.access(url),false,url);
  for(const url of ['https://unknown.example/quiz','http://unknown.example/quiz','http://localhost:8000/'])assert.equal(sites.access(url),true);
});
test('core separates registered site, detected adapter, capabilities and solver identity',async()=>{
  const ctx=context(['core/site-registry.js','solvers/interactions.js','core/runtime.js']);
  const adapter=(id,detect)=>({id,answerSource:'test-source',detect,create:()=>({capabilities:['text'],dispatch:async()=>({ok:true,result:{questions:[{id:'q1',kind:'text',applyable:true}]}})})});
  ctx.SparkCore.register(adapter('ngl',c=>c.player));ctx.SparkCore.register(adapter('generic',()=>true));
  const runtime=ctx.SparkCore.create({url:'https://unknown.test/quiz',player:false});
  const result=(await runtime.dispatch({type:'SPARK_SCAN'})).result;
  assert.equal(result.architecture.registered,false);assert.equal(result.architecture.adapterId,'generic');
  assert.equal(result.architecture.solvers[0].solver,'text');assert.equal(result.architecture.capabilities[0],'text');
  assert.equal(ctx.SparkCore.select({url:'https://unknown.test',player:true}).adapter.id,'ngl');
  assert.equal(ctx.SparkCore.select({url:'https://player.avallain.net',player:true}).site.id,'ngl-spark');
});
test('core rejects overlapping Apply/Scan and exposes bounded read-only verification diagnostics',async()=>{
  const ctx=context(['core/site-registry.js','solvers/interactions.js','core/runtime.js']);let release;
  ctx.SparkCore.register({id:'generic',answerSource:'embedded-qti',detect:()=>true,create:()=>({capabilities:['text'],
    dispatch:async message=>{
      if(message.type==='SPARK_SCAN')return {ok:true,result:{questions:[{id:'q1',kind:'text',applyable:true}]}};
      await new Promise(resolve=>release=resolve);return {ok:true,result:[{id:'q1',status:'filled',detail:'secret answer omitted'}]};
    }})});
  const runtime=ctx.SparkCore.create({url:'https://unknown.test'});await runtime.dispatch({type:'SPARK_SCAN'});
  const first=runtime.dispatch({type:'SPARK_APPLY',answers:[{id:'q1',answer:'secret answer'}]});
  const second=await runtime.dispatch({type:'SPARK_APPLY',answers:[{id:'q1'}]});
  assert.equal(second.result[0].detail,'SOLVE_ALREADY_RUNNING');
  assert.equal((await runtime.dispatch({type:'SPARK_SCAN'})).reason,'solveRunning');
  release();await first;
  const diagnostics=(await runtime.dispatch({type:'SPARK_DIAGNOSTICS'})).result;
  assert.equal(diagnostics.verification,'verified');assert.equal(diagnostics.adapterId,'generic');
  assert.doesNotMatch(JSON.stringify(diagnostics),/secret answer/);
});
test('frame transport injects ordered modules only when missing and preserves selected frame',async()=>{
  const ctx=context(['core/frame-access.js']);let loaded=false,calls=[];
  const chrome={tabs:{sendMessage:async(tab,message,options)=>{calls.push({tab,message,options});if(!loaded)throw Error('Receiving end does not exist');return {ok:true};}},
    scripting:{executeScript:async request=>{calls.push(request);loaded=true;}}};
  assert.equal((await ctx.SparkFrameAccess.send(chrome,19,299,{type:'SPARK_SCAN'})).ok,true);
  assert.deepEqual(Array.from(calls[1].target.frameIds),[299]);
  assert.equal(calls[1].files.at(-1),'content.js');
  assert.ok(calls[1].files.indexOf('core/runtime.js')<calls[1].files.indexOf('adapters/ngl.js'));
  await ctx.SparkFrameAccess.send(chrome,19,299,{type:'SPARK_QTI'});
  assert.equal(calls.filter(c=>c.files).length,1);
});
test('denied cross-origin frame and injection defects have separate failure classifications',async()=>{
  const ctx=context(['core/frame-access.js']);
  for(const [error,reason] of [['Cannot access contents of url. Missing host permission.','accessUnavailable'],['SyntaxError in module','injectionFailed']]){
    const chrome={tabs:{sendMessage:async()=>{throw Error('No listener');}},scripting:{executeScript:async()=>{throw Error(error);}}};
    assert.equal((await ctx.SparkFrameAccess.send(chrome,1,2,{type:'SPARK_SCAN'})).reason,reason);
  }
});
test('shared Word Pool enforces complete reset before any placement and final verification',async()=>{
  const solver=context(['solvers/interactions.js']).SparkSolvers;const events=[];
  let occupied=[{id:'A'},{id:'B'}];
  const p={prepare:async()=>{},read:()=>({occupied}),returnToPool:async item=>{events.push('return-'+item.id);occupied=occupied.slice(1);},
    resetComplete:async()=>{},empty:()=>{events.push('verify-empty');return true;},
    plan:async()=>[{},{}],place:async()=>{events.push('fill');},finish:async()=>({status:'filled'}),verify:()=>{events.push('verify-mapping');return true;}};
  assert.equal((await solver.solve('gapWordPool',p,{})).status,'filled');
  assert.deepEqual(events,['return-A','return-B','verify-empty','fill','fill','verify-mapping']);
});
test('shared Word Pool stops on occupied gap or failed return without filling',async()=>{
  const solver=context(['solvers/interactions.js']).SparkSolvers;
  let filled=false;
  const p={prepare:async()=>{},read:()=>({occupied:[]}),resetComplete:async()=>{},empty:()=>false,plan:async()=>{filled=true;return [];}};
  assert.equal((await solver.solve('gapWordPool',p,{})).detail,'RESET_INCOMPLETE');assert.equal(filled,false);
  p.prepare=async()=>({status:'uncertain',detail:'RETURN_UNVERIFIED'});
  assert.equal((await solver.solve('gapWordPool',p,{})).detail,'RETURN_UNVERIFIED');assert.equal(filled,false);
});
test('shared linking connects directly and cannot equate a sent gesture with verified identities',async()=>{
  const solver=context(['solvers/interactions.js']).SparkSolvers;const seen=[];
  const result=await solver.solve('linkingLines',{current:()=>true,resolve:i=>({source:i,target:i+1}),
    connect:async pair=>seen.push(pair),wait:async()=>{}},{pairs:[{},{}]});
  assert.equal(seen.length,2);assert.equal(result.status,'uncertain');assert.equal(result.connected,2);
});
test('all established interaction families have a shared solver and unknown types abstain',async()=>{
  const solver=context(['solvers/interactions.js']).SparkSolvers;
  for(const kind of ['text','dropdown','choice','multi','checkbox','order','textCorrection','gapWordPool','linkingLines'])assert.ok(solver.kinds().includes(kind));
  assert.equal((await solver.solve('unsupported',{},{})).status,'manual');
});
test('manifest preserves least privilege and installs one ordered multi-frame runtime',()=>{
  const m=JSON.parse(source('manifest.json'));
  const baseline=JSON.parse(source('docs/agent-state/multisite-baseline.json'));
  assert.equal(m.version,'0.8.0');assert.ok(baseline.hashes['manifest.json']);
  assert.ok(m.permissions.includes('activeTab'));assert.ok(m.permissions.includes('scripting'));
  assert.ok(!m.host_permissions.includes('<all_urls>'));assert.ok(!m.host_permissions.includes('https://*/*'));
  assert.equal(m.content_scripts[0].all_frames,true);assert.ok(m.content_scripts[0].js.includes('inspector-content.js'));
  assert.deepEqual(Array.from(context(['core/frame-access.js']).SparkFrameAccess.files),m.content_scripts[0].js.filter(f=>f!=='inspector-content.js'));
  for(const file of m.content_scripts[0].js)assert.ok(fs.existsSync(path.join(base,file)),file);
});
test('site status is neutral, accessible, token-based and translated in all four languages',()=>{
  assert.match(source('popup.html'),/id="siteStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(source('site-status.css'),/var\(--ink\)/);
  assert.doesNotMatch(source('site-status.css'),/animation|#[a-f0-9]{3,8}/i);
  const ctx=context(['i18n.js']);ctx.document={querySelectorAll:()=>[],documentElement:{}};
  for(const locale of ['en','vi','zh-CN','zh-TW']){
    ctx.SparkI18n.setLanguage(locale);
    for(const key of ['siteRegistered','siteUnregistered','siteAccessUnavailable','siteSomeFramesUnavailable'])assert.notEqual(ctx.SparkI18n.t(key),key);
  }
});
test('shared sequence algorithm reorders through adapter gestures and verifies the final order',async()=>{
  const ctx=context(['solvers/interactions.js','solvers/sequence.js']);
  const a={text:'A',id:'a'},b={text:'B',id:'b'};let tiles=[b,a],drags=0;
  const norm=x=>String(x).toLowerCase();
  const result=await ctx.SparkSolvers.solve('order',{
    tidy:x=>String(x),normalized:norm,tileText:x=>x?.text||'',sameWords:(a,b)=>a.slice().sort().join()===b.slice().sort().join(),
    wait:async()=>{},tiles:()=>tiles,uniqueList:()=>true,fixed:()=>false,pending:()=>false,identity:x=>x.id,
    drag:async(source,target)=>{drags++;tiles=[source,target];return true;}
  },{orderedTokens:['A','B']});
  assert.equal(result.status,'filled');assert.equal(drags,1);assert.deepEqual(tiles.map(x=>x.text),['A','B']);
});
test('shared correction algorithm validates each intermediate position through editor ports',async()=>{
  const ctx=context(['solvers/interactions.js','solvers/text-correction.js']);
  const tokens=[{textContent:'Wrong'},{textContent:'Stable'}];
  const result=await ctx.SparkSolvers.solve('textCorrection',{
    correctionNorm:x=>String(x),visible:()=>true,available:()=>true,tokens:()=>tokens,modified:()=>false,
    editorOpen:()=>false,open(){},popup:async()=>({}),confirm:async(target,value)=>{target.textContent=value;return true;}
  },{corrections:[{from:'Wrong',to:'Right',tokenIndex:0}]});
  assert.equal(result.status,'filled');assert.equal(tokens[0].textContent,'Right');assert.equal(tokens[1].textContent,'Stable');
});
