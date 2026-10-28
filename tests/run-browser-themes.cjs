'use strict';
const {createServer}=require('node:http'),{spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/ui/screenshots');
const styles=['liquid-glass','editorial-studio','signal-instrument','paper-atelier'];
const browser='C:/Program Files/Google/Chrome/Application/chrome.exe';
const mock=`(() => {const listeners=[];const defaults={uiVisualStyle:new URL(location).searchParams.get('style')||'liquid-glass',uiTheme:new URL(location).searchParams.get('mode')||'light',uiLanguage:'en',aiMode:'offline',autoNext:false};const stored=()=>JSON.parse(localStorage.getItem('test-settings')||JSON.stringify(defaults));window.chrome={storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,stored()[k]])),set:async patch=>{const prev=stored();localStorage.setItem('test-settings',JSON.stringify({...prev,...patch}));const changes=Object.fromEntries(Object.entries(patch).map(([k,v])=>[k,{oldValue:prev[k],newValue:v}]));listeners.forEach(f=>f(changes,'local'));},remove:async()=>{},setAccessLevel:async()=>{}},onChanged:{addListener:f=>listeners.push(f)}},tabs:{query:async()=>[],create:async()=>{}},runtime:{openOptionsPage:()=>{},getURL:s=>s},permissions:{request:async()=>true}};})();`;
const server=createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/ui-mock.js'){res.setHeader('Content-Type','application/javascript');return res.end(mock);}const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'})[ext]||'text/plain');let data=fs.readFileSync(file);if(ext==='.html')res.setHeader('Content-Security-Policy',"script-src 'self'; object-src 'self'");if(ext==='.html')data=data.toString().replace('<head>','<head><script src="/ui-mock.js"></script>');res.end(data);});
let child,ws,id=0;const requests=new Map(),errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function cdp(method,params={}){return new Promise((resolve,reject)=>{const n=++id;requests.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression){const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
async function navigate(url){await cdp('Page.navigate',{url});for(let i=0;i<100;i++){await sleep(30);try{if(await evaluate('document.readyState==="complete" && !!globalThis.SparkI18n && !!globalThis.SparkVisualStyle'))break;}catch{}}await evaluate('SparkVisualStyle.ready');await sleep(80);}
async function main(){
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'spark-ui-'));
 child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`],{windowsHide:true,stdio:['ignore','ignore','ignore']});
 try{
  const portFile=path.join(profile,'DevToolsActivePort');for(let n=0;!fs.existsSync(portFile)&&n<100;n++)await sleep(100);
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0];const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=requests.get(m.id);requests.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(m.method==='Log.entryAdded' && m.params.entry.source==='security')errors.push(m.params.entry.text);};
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Log.enable');
  const base=`http://127.0.0.1:${server.address().port}`;let combinations=0,layouts=0,contrastChecks=0;
  const contrastExpression="(() => {const canvas=document.createElement('canvas'),c=canvas.getContext('2d');const rgb=value=>{c.clearRect(0,0,1,1);c.fillStyle=value;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data].slice(0,3);};const lum=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const temp=document.createElement('span');document.body.append(temp);const resolve=name=>{temp.style.color='var('+name+')';return rgb(getComputedStyle(temp).color);};const pairs=[['--ink','--page'],['--ink','--surface'],['--muted','--surface'],['--muted','--surface-raised'],['--accent','--accent-soft'],['--accent-ink','--accent'],['--green','--green-bg'],['--red','--red-bg'],['--warning','--warning-bg']];const ratios=pairs.map(([a,b])=>{const x=lum(resolve(a)),y=lum(resolve(b));return {pair:a+'/'+b,ratio:(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};});temp.remove();return ratios;})()";
  for(const style of styles)for(const mode of ['light','dark']){
   await navigate(`${base}/popup.html?style=${style}&mode=${mode}`);
   await evaluate(`chrome.storage.local.set({uiVisualStyle:${JSON.stringify(style)},uiTheme:${JSON.stringify(mode)}})`);
   await sleep(30);
   assert.equal(await evaluate('document.documentElement.dataset.visualStyle'),style);
   assert.equal(await evaluate('document.documentElement.dataset.theme'),mode);
   for(const [width,height] of [[320,480],[360,600],[400,640],[420,680]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    const metrics=await evaluate(`({width:document.documentElement.scrollWidth,viewport:innerWidth,action:document.getElementById('auto').getBoundingClientRect().width})`);
    assert.ok(metrics.width<=width,`${style}/${mode} overflow ${JSON.stringify(metrics)}`);assert.ok(metrics.action>200);layouts++;
   }
   await cdp('Emulation.setDeviceMetricsOverride',{width:400,height:640,deviceScaleFactor:1,mobile:false});
   for(const pair of await evaluate(contrastExpression)){assert.ok(pair.ratio>=4.5,style+'/'+mode+' contrast '+JSON.stringify(pair));contrastChecks++;}
   const shot=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`${style}-${mode}-popup.png`),Buffer.from(shot.data,'base64'));
   await evaluate(`document.body.classList.add('has-results');document.getElementById('emptyState').hidden=true;document.getElementById('results').hidden=false;document.getElementById('title').textContent='Synthetic fixture: a long exercise title that must wrap safely';document.getElementById('count').textContent='1 item · frame 145';document.getElementById('questions').innerHTML='<details class="question-card" open><summary class="question-head"><span class="question-index">1</span><span class="question-headline"><span class="question-label">Phrase matching</span><span class="question-summary">Review the answer on Spark</span></span></summary><div class="question-body"><p class="question-text">A synthetic question with a long answer and localized text: Tiếng Việt · 简体中文 · 繁體中文.</p><div class="answer-line"><label for="fixtureAnswer">Answer to review</label><input id="fixtureAnswer" class="answer-input" value="How do you feel" /></div></div></details>';document.getElementById('status').className='status warning';document.querySelector('.status-message').textContent='Placement uncertain. Spark pool control or gap is not actionable.';document.getElementById('fillReport').textContent='Confirmed 0 · uncertain 1 · skipped 0';`);
   assert.equal(await evaluate('document.getElementById("submitNext").disabled'),true);
   const resultShot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,`${style}-${mode}-results.png`),Buffer.from(resultShot.data,'base64'));
   for(const width of [320,360,400,420]){await cdp('Emulation.setDeviceMetricsOverride',{width,height:640,deviceScaleFactor:1,mobile:false});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await evaluate('document.getElementById("auto").scrollIntoView({block:"center"})');assert.ok(await evaluate('document.getElementById("auto").getBoundingClientRect().bottom<=innerHeight'));layouts++;}
   await navigate(`${base}/options.html`);
   await evaluate(`chrome.storage.local.set({uiVisualStyle:${JSON.stringify(style)},uiTheme:${JSON.stringify(mode)}});SparkI18n.setTheme(${JSON.stringify(mode)})`);
   await sleep(30);
   assert.equal(await evaluate('document.querySelector(`input[name="uiVisualStyle"]:checked`).value'),style);
   await cdp('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false});
   const settingsShot=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`${style}-${mode}-settings.png`),Buffer.from(settingsShot.data,'base64'));
   for(const width of [320,360,400,420,768]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:680,deviceScaleFactor:1,mobile:false});
    const metrics=await evaluate('({width:document.documentElement.scrollWidth,viewport:innerWidth})');assert.ok(metrics.width<=width,`settings ${style} overflow ${JSON.stringify(metrics)}`);layouts++;
   }
   await evaluate(`document.getElementById('uiTheme').value='system';document.getElementById('uiTheme').dispatchEvent(new Event('change'));`);
   await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
   assert.ok(await evaluate('getComputedStyle(document.documentElement).colorScheme.includes("dark")'));
   for(const pair of await evaluate(contrastExpression)){assert.ok(pair.ratio>=4.5);contrastChecks++;}
   await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
   assert.ok(await evaluate('getComputedStyle(document.documentElement).colorScheme.includes("light")'));
   combinations++;
  }
  // Exercise the actual static radio controls and real Settings script with mocked local storage.
  await evaluate(`document.querySelector('input[value="editorial-studio"]').click()`);await sleep(40);
  assert.equal(await evaluate('document.documentElement.dataset.visualStyle'),'editorial-studio');
  assert.equal(await evaluate('(async()=> (await chrome.storage.local.get(["autoNext"])).autoNext)()'),false);
  await navigate(`${base}/options.html`);assert.equal(await evaluate('document.documentElement.dataset.visualStyle'),'editorial-studio');
  await evaluate(`document.querySelector('input[value="editorial-studio"]').focus()`);
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});await sleep(40);
  assert.equal(await evaluate('document.documentElement.dataset.visualStyle'),'paper-atelier');
  assert.notEqual(await evaluate('getComputedStyle(document.activeElement.nextElementSibling).outlineStyle'),'none');
  for(const locale of ['en','vi','zh-CN','zh-TW']){await evaluate(`document.getElementById('uiLanguage').value=${JSON.stringify(locale)};document.getElementById('uiLanguage').dispatchEvent(new Event('change'))`);assert.notEqual(await evaluate('document.querySelector(".style-chooser legend").textContent'),'visualStyle');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));}
  for(const style of styles)for(const mode of ['light','dark'])for(const color of ['#000000','#ffffff','#ff0000','#00ff00','#0000ff','#bea6cf']){
   await evaluate(`SparkVisualStyle.apply(${JSON.stringify(style)});SparkI18n.setTheme(${JSON.stringify(mode)});SparkAppearance.apply(${JSON.stringify(color)},65);`);
   for(const pair of await evaluate(contrastExpression)){assert.ok(pair.ratio>=4.5,style+'/'+mode+'/'+color+' contrast '+JSON.stringify(pair));contrastChecks++;}
  }
  await evaluate(`chrome.storage.local.set({uiVisualStyle:'invalid'});`);assert.equal(await evaluate('document.documentElement.dataset.visualStyle'),'liquid-glass');
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-reduced-transparency',value:'reduce'}]});
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".style-choice input")).transitionDuration'),'0s');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".settings-sidebar")).backdropFilter'),'none');
  await evaluate('document.getElementById("resetAppearance").click()');await sleep(40);assert.equal(await evaluate('document.documentElement.dataset.visualStyle'),'liquid-glass');assert.equal(await evaluate('(async()=> (await chrome.storage.local.get(["autoNext"])).autoNext)()'),false);
  assert.deepEqual(errors,[]);
  await cdp('Emulation.setEmulatedMedia',{features:[]});
  await evaluate(`SparkI18n.setLanguage('en');document.getElementById('addProfile').click();`);
  assert.equal(await evaluate('document.getElementById("profileEditor").hidden'),false);
  await evaluate(`document.getElementById('profileName').value='Synthetic UI test provider';document.getElementById('profileName').dispatchEvent(new Event('input'));document.getElementById('toggleKey').click();`);
  assert.equal(await evaluate('document.getElementById("apiKey").type'),'text');
  await evaluate(`document.getElementById('toggleKey').click();document.getElementById('nativeColor').value='#bea6cf';document.getElementById('nativeColor').dispatchEvent(new Event('input'));document.getElementById('wallStrength').value='80';document.getElementById('wallStrength').dispatchEvent(new Event('input'));document.getElementById('save').click();`);await sleep(80);
  assert.equal(await evaluate('(async()=> (await chrome.storage.local.get(["uiBackdropColor"])).uiBackdropColor)()'),'#bea6cf');
  await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:680,deviceScaleFactor:1,mobile:false});
  await evaluate('document.getElementById("profileEditor").scrollIntoView({block:"start"})');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
  fs.writeFileSync(path.join(out,'provider-form-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const report={browser,synthetic:true,authenticatedSpark:false,combinations,layouts,screenshots:25,contrastChecks,checks:['style selection','persistence','invalid fallback','keyboard arrows','focus ring','four locales','reduced motion','reduced transparency','system mode','MV3 script CSP','custom accent contrast','uncertain results and disabled submission','appearance reset','automation preservation'],runtimeErrors:errors};
  fs.writeFileSync(path.join(root,'docs/ui/visual-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 }finally{ws?.close();child?.kill();server.close();console.log('Temporary browser profile retained at '+profile);}
}
main().catch(e=>{console.error(e);process.exitCode=1;child?.kill();server.close();});
