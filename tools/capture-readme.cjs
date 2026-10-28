'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
let source=fs.readFileSync(path.join(root,'tests/run-browser-themes.cjs'),'utf8');
source=source.replace("path.join(root,'docs/ui/screenshots')","path.join(root,'docs/images')");
const extraMock=String.raw`
chrome.tabs.query=async()=>[{id:42,url:'https://learn.eltngl.com/'}];
chrome.tabs.get=async()=>({id:42,title:'Documentation fixture',url:'https://example.invalid/'});
chrome.tabs.onRemoved={addListener(){}};
chrome.tabs.sendMessage=async(_id,m)=>m.type==='SPARK_SCAN'?new Promise(()=>{}):m.type==='SPARK_INSPECT_PROBE'?{ok:true,result:{instanceId:'documentation',adapter:'generic',interactionCount:0}}:m.type==='SPARK_INSPECT_CAPTURE'?{ok:true,result:{summary:{interactionCount:0,types:[]}}}:{ok:true};
chrome.webNavigation={getAllFrames:async()=>[],onCommitted:{addListener(){}}};
`;
source=source.replace('res.end(mock);','res.end(mock+'+JSON.stringify(extraMock)+');');
const begin=source.indexOf("  for(const style of styles)"),end=source.indexOf('  const report={browser,');
if(begin<0||end<=begin)throw Error('Capture harness changed');
const capture=String.raw`
  const assets=[];
  async function shot(file,width,height){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await evaluate('document.fonts.ready');await sleep(160);
    const evidence=await evaluate('({overflow:document.documentElement.scrollWidth>innerWidth,answers:document.querySelectorAll(".answer-input").length,keys:[...document.querySelectorAll("input[type=password]")].some(x=>x.value),version:document.querySelector(".header-version")?.textContent})');
    if(evidence.overflow||evidence.answers||evidence.keys)throw Error('Unsafe/overflow capture '+JSON.stringify(evidence));
    const image=await cdp('Page.captureScreenshot',{format:'webp',quality:90,captureBeyondViewport:false});
    const bytes=Buffer.from(image.data,'base64');fs.writeFileSync(path.join(out,file),bytes);
    assets.push({file,width,height,bytes:bytes.length});
  }
  for(const [style,mode,file] of [
    ['liquid-glass','dark','popup.webp'],['liquid-glass','light','popup-light.webp'],
    ['editorial-studio','light','style-editorial.webp'],['signal-instrument','dark','style-cognify.webp'],
    ['paper-atelier','dark','style-insightos.webp']]){
    await evaluate('localStorage.clear()');
    await navigate(base+'/popup.html?style='+style+'&mode='+mode);
    await evaluate('chrome.storage.local.set({uiVisualStyle:'+JSON.stringify(style)+',uiTheme:'+JSON.stringify(mode)+'})');
    await sleep(50);await shot(file,400,640);
  }
  await evaluate('localStorage.clear()');
  await navigate(base+'/options.html?style=liquid-glass&mode=light');
  await shot('settings.webp',1100,850);
  await evaluate('localStorage.clear()');
  await cdp('Page.navigate',{url:base+'/inspector.html?tabId=42'}); await sleep(700);
  await shot('inspector.webp',1100,1080);
  if(errors.length)throw Error('UI runtime errors: '+JSON.stringify(errors));
  console.log(JSON.stringify({capture:'actual repository UI rendered by Chrome',environment:'local HTTP fixture with mocked Chrome APIs',authenticatedSite:false,assets},null,2));
`;
source=source.slice(0,begin)+capture+source.slice(end);
source=source.replace(/  const report=\{browser,[\s\S]*?\n }finally\{/, '\n }finally{');
const instance=new Module(__filename);instance.filename=__filename;instance.paths=module.paths;
instance._compile(source,__filename);
