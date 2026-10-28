'use strict';
// Reuse the installed Chrome/CDP transport; serve the actual Inspector HTML and scripts.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),assert=require('node:assert/strict');
let source=fs.readFileSync(path.join(__dirname,'run-browser-themes.cjs'),'utf8');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'spark-inspector-ui-'));
source=source.replace("path.join(root,'docs/ui/screenshots')",JSON.stringify(output))
  .replace("path.join(root,'docs/ui/visual-results.json')",'path.join('+JSON.stringify(output)+',\'report.json\')');
const mock=`
chrome.tabs.get=async id=>({id,url:'https://unknown.example/quiz'});
chrome.tabs.onRemoved={addListener(){}};
chrome.tabs.sendMessage=async(_id,m)=>m.type==='SPARK_INSPECT_PROBE'?{ok:true,result:{instanceId:'fixture',adapter:'generic',interactionCount:1}}:
  m.type==='SPARK_INSPECT_TRACE_GET'?{ok:true,result:{instanceId:'fixture',active:true,eventCount:2,events:[{type:'initial'},{type:'click'}]}}:
  m.type==='SPARK_INSPECT_CAPTURE'?{ok:true,result:{summary:{interactionCount:1,types:['generic']}}}:{ok:true};
chrome.webNavigation={getAllFrames:async()=>[{frameId:0,parentFrameId:-1,url:'https://unknown.example/quiz'}],onCommitted:{addListener(){}}};
`;
source=source.replace('res.end(mock);','res.end(mock+'+JSON.stringify(mock)+');');
source=source.replace('errors.push(m.params.exceptionDetails.text);','errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);');
const begin=source.indexOf('  for(const style of styles)'),end=source.indexOf('  const report={browser,');
assert.ok(begin>0&&end>begin,'Existing CDP harness changed; review reuse boundary.');
const checks=String.raw`
  await cdp('Page.navigate',{url:base+'/inspector.html?tabId=42'});
  for(let i=0;i<50;i++){await sleep(20);if(await evaluate('document.getElementById("source")?.textContent.includes("unknown.example")'))break;}
  await evaluate('SparkInspectorExport.initialized');
  await evaluate('window.SparkInspectorExport={prepareDestination:async()=>({kind:"save-as"}),writeJSON:async(_d,data)=>{window.testExport=data;return {kind:"save-as",name:"fixture.json"}},chooseDirectory:async()=>({name:"exports"})}');
  assert.ok(await evaluate('document.getElementById("source").textContent.includes("unknown.example")'));
  for(const mode of ['light','dark']){
    await evaluate('document.documentElement.dataset.theme='+JSON.stringify(mode));
    for(const width of [320,768,1100]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Inspector overflow');
      assert.ok(await evaluate('[...document.querySelectorAll(".button")].every(b=>b.getBoundingClientRect().width<=innerWidth&&b.getBoundingClientRect().height>=44)'));
      layouts++;
    }
    const pairs=await evaluate(contrastExpression);
    for(const pair of pairs.filter(p=>['--ink/--page','--accent-ink/--accent'].includes(p.pair))){assert.ok(pair.ratio>=4.5);contrastChecks++;}
    combinations++;
  }
  await evaluate('document.getElementById("startTrace").click()');await sleep(50);
  assert.ok(await evaluate('document.getElementById("startTrace").disabled&&!document.getElementById("stopTrace").disabled'));
  await evaluate('document.getElementById("stopTrace").click()');await sleep(50);
  assert.equal(await evaluate('document.getElementById("recordState").textContent'),'Stopped');
  await evaluate('document.getElementById("export").click()');await sleep(30);
  assert.equal(await evaluate('window.testExport.schemaVersion'),'2.0');
  await evaluate('document.getElementById("selectExports").click()');await sleep(30);
  assert.ok(await evaluate('document.getElementById("folderStatus").textContent.includes("exports")'));
  await evaluate('document.getElementById("clear").click()');await sleep(30);
  assert.equal(await evaluate('document.getElementById("count").textContent'),'0');
  await evaluate('document.getElementById("capture").click()');await sleep(30);
  assert.equal(await evaluate('document.getElementById("count").textContent'),'1');
  await evaluate('document.getElementById("grantFrames").click()');await sleep(30);
  assert.ok(await evaluate('document.getElementById("grantFrames").disabled'),'No permission action without a blocked requestable origin');
  await evaluate('document.getElementById("startTrace").focus()');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.notEqual(await evaluate('getComputedStyle(document.activeElement).outlineStyle'),'none');
  assert.deepEqual(errors,[]);
  console.log('Inspector UI: 6 responsive layouts, 4 contrast checks, Start/Stop/Clear/Capture/Export/folder/permission controls and keyboard focus PASS');
`;
source=source.slice(0,begin)+checks+source.slice(end);
source=source.replace(/const report=\{browser,[^\n]+;/,'const report={browser,synthetic:true,authenticatedSpark:false,combinations,layouts,contrastChecks,screenshots:0,checks:["Inspector controls","keyboard focus","responsive layout","contrast"],runtimeErrors:errors};');
const moduleInstance=new Module(__filename);moduleInstance.filename=__filename;moduleInstance.paths=module.paths;
moduleInstance._compile(source,__filename);
