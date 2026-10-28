'use strict';
const {createServer}=require('node:http'),{spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const browser=process.env.SPARK_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const mock=`(()=>{
const params=new URL(location).searchParams,listeners=[];
const saved={uiVisualStyle:params.get('style'),uiTheme:params.get('mode'),uiLanguage:params.get('lang')||'en',aiMode:'offline',autoNext:false};
window.fixtureUrl='https://unregistered.example/quiz';window.messages=[];window.fixtureDeny=false;
let frame,ready;
const child=()=>ready||(ready=new Promise(resolve=>{frame=document.createElement('iframe');frame.id='exerciseFrame';frame.style.cssText='position:absolute;left:-10000px;width:800px;height:600px';frame.src='/tests/browser-multisite-frame.html';frame.onload=()=>resolve(frame.contentWindow);document.body.append(frame);}));
window.chrome={storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,saved[k]])),set:async patch=>Object.assign(saved,patch)},onChanged:{addListener:f=>listeners.push(f)}},
 tabs:{query:async()=>[{id:42,url:window.fixtureUrl}],sendMessage:async(tab,message,{frameId})=>{window.messages.push({tab,frameId,type:message.type});if(window.fixtureDeny)throw Error('No receiver');if(frameId===0)return {ok:true,result:{title:'Top document',questions:[]}};const target=await child();return new Promise(resolve=>target.__handler(message,null,resolve));},create:async()=>{}},
 webNavigation:{getAllFrames:async()=>[{frameId:0},{frameId:299}]},scripting:{executeScript:async()=>{throw Error('Cannot access contents of url. Missing host permission.');}},
 runtime:{openOptionsPage(){},getURL:p=>p,sendMessage:async()=>{throw Error('Generic fixture must not use API fallback');}}};
})();`;
const server=createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/multisite-mock.js'){res.setHeader('Content-Type','application/javascript');return res.end(mock);}
  const file=path.resolve(root,'.'+u.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
  const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'})[ext]||'text/plain');
  let body=fs.readFileSync(file);
  if(u.pathname==='/popup.html')body=body.toString().replace('<head>','<head><script src="/multisite-mock.js"></script>');
  res.end(body);
});
let processHandle,ws,id=0;const pending=new Map(),errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function cdp(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function waitFor(expression){for(let i=0;i<150;i++){try{if(await evaluate(expression))return;}catch{}await sleep(30);}throw Error('Timed out: '+expression);}
async function main(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const profile=fs.mkdtempSync(path.join(os.tmpdir(),'spark-multisite-popup-'));
  processHandle=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`],{windowsHide:true,stdio:'ignore'});
  try{
    const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(portFile);i++)await sleep(100);
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0],tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);};
    await cdp('Page.enable');await cdp('Runtime.enable');
    const base=`http://127.0.0.1:${server.address().port}`;let combinations=0,layouts=0,statusChecks=0,contrastChecks=0,keyboardChecks=0;
    for(const style of ['liquid-glass','editorial-studio','paper-atelier','signal-instrument'])for(const mode of ['light','dark']){
      await cdp('Page.navigate',{url:`${base}/popup.html?style=${style}&mode=${mode}`});
      await waitFor('document.readyState==="complete" && typeof state!=="undefined" && state.questions.length===1');
      assert.equal(await evaluate('document.getElementById("siteStatus").dataset.state'),'unregistered');
      assert.equal(await evaluate('document.documentElement.dataset.visualStyle'),style);
      assert.equal(await evaluate('document.documentElement.dataset.theme'),mode);
      const ratios=await evaluate(`(()=>{
        const canvas=document.createElement('canvas'),c=canvas.getContext('2d');
        const rgb=value=>{c.clearRect(0,0,1,1);c.fillStyle=value;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data].slice(0,3);};
        const lum=values=>values.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
        const node=document.createElement('span');document.body.append(node);
        const text=lum(rgb(getComputedStyle(document.getElementById('siteStatus')).color));
        const result=['--page','--surface'].map(token=>{node.style.color='var('+token+')';const bg=lum(rgb(getComputedStyle(node).color));return (Math.max(text,bg)+.05)/(Math.min(text,bg)+.05);});node.remove();return result;
      })()`);
      for(const ratio of ratios){assert.ok(ratio>=4.5,style+'/'+mode+' status contrast '+ratio);contrastChecks++;}
      for(const width of [320,375,414,768]){
        await cdp('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,style+'/'+mode+'/'+width);
        assert.equal(await evaluate('document.getElementById("siteStatus").getBoundingClientRect().width<=innerWidth'),true);layouts++;
      }
      await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      assert.equal(await evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'),true);
      await evaluate('document.getElementById("scan").focus()');
      await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      assert.equal(await evaluate('document.activeElement instanceof HTMLButtonElement'),true);keyboardChecks++;
      for(const language of ['en','vi','zh-CN','zh-TW']){
        await evaluate(`SparkI18n.setLanguage(${JSON.stringify(language)});refreshSiteStatus()`);
        assert.equal(await evaluate('document.getElementById("siteStatus").textContent===SparkI18n.t("siteUnregistered")'),true);
        assert.equal(await evaluate('document.getElementById("siteStatus").getAttribute("role")'), 'status');statusChecks++;
      }
      await evaluate('SparkI18n.setLanguage("en");document.getElementById("auto").click()');
      await waitFor('!document.getElementById("auto").disabled && state.lastApplyVerified');
      assert.equal(await evaluate('document.getElementById("exerciseFrame").contentDocument.querySelector("input").value'),'nested answer');
      assert.equal(await evaluate('document.getElementById("submitNext").disabled'),true);
      assert.equal(await evaluate('messages.filter(m=>m.type==="SPARK_APPLY").every(m=>m.frameId===299)'),true);
      assert.equal(await evaluate('messages.some(m=>m.type==="SPARK_SUBMIT_NEXT"||m.type==="SPARK_FORWARD_SCREEN")'),false);
      await evaluate('window.fixtureUrl="https://learn.eltngl.com/course";refreshSiteStatus()');assert.equal(await evaluate('document.getElementById("siteStatus").dataset.state'),'registered');
      await evaluate('window.fixtureDeny=true;scanPage()');assert.equal(await evaluate('document.getElementById("siteStatus").dataset.state'),'unavailable');
      assert.equal(await evaluate('document.getElementById("submitNext").disabled'),true);
      await evaluate('window.fixtureUrl="chrome://extensions";refreshSiteStatus()');assert.equal(await evaluate('document.getElementById("siteStatus").dataset.state'),'unavailable');
      combinations++;
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({popupStyleModes:combinations,layouts,localizedStatusChecks:statusChecks,contrastChecks,keyboardChecks,unknownSitePopupToNestedContent:'PASS',permissionAndRestrictedStates:'PASS',genericSubmitAndNextSafety:'PASS',runtimeErrors:errors.length}));
  }finally{
    ws?.close();if(processHandle&&!processHandle.killed){processHandle.kill();await new Promise(resolve=>processHandle.once('close',resolve));}
    server.close();fs.rmSync(profile,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;processHandle?.kill();server.close();});
