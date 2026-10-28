'use strict';
// Reuse the existing real-page CDP harness and keep its regression assertions.
const fs=require('node:fs'),path=require('node:path');
let source=fs.readFileSync(path.join(__dirname,'run-browser-themes.cjs'),'utf8');
const marker='  const report={browser,';
if(!source.includes(marker))throw Error('Browser harness insertion point changed');
source=source.replace("path.join(root,'docs/ui/screenshots')","path.join(root,'docs/ui/style1-motion/screenshots')")
 .replace("path.join(root,'docs/ui/visual-results.json')","path.join(root,'docs/ui/style1-motion/regression-results.json')");
const motionChecks=String.raw`
  const motion=[];
  for(const style of styles)for(const mode of ['light','dark']){
   await navigate(base+'/popup.html?style='+style+'&mode='+mode);
   await evaluate('chrome.storage.local.set({uiVisualStyle:'+JSON.stringify(style)+',uiTheme:'+JSON.stringify(mode)+'});SparkI18n.setTheme('+JSON.stringify(mode)+')');
   const name=await evaluate('getComputedStyle(document.querySelector(".popup-shell")).animationName');
   assert.equal(name,style==='liquid-glass'?'ventrix-settle':'none');
   if(style!=='liquid-glass')continue;
   await cdp('Emulation.setDeviceMetricsOverride',{width:400,height:640,deviceScaleFactor:1,mobile:false});
   await evaluate('(async()=>{const shell=document.querySelector(".popup-shell");shell.style.animationName="none";await new Promise(requestAnimationFrame);shell.style.animationName="";await new Promise(requestAnimationFrame);const animation=shell.getAnimations()[0];animation.pause();globalThis.motionEntrance=animation;})()');
   const frames=[];
   for(const time of [0,120,240]){
    await evaluate('motionEntrance.currentTime='+time);
    const frame=await evaluate('({opacity:+getComputedStyle(document.querySelector(".popup-shell")).opacity,transform:getComputedStyle(document.querySelector(".popup-shell")).transform,usableWidth:document.documentElement.clientWidth})');
    frames.push(frame);
    fs.writeFileSync(path.join(out,'style1-'+mode+'-entrance-'+time+'ms.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
   }
   assert.ok(frames[0].opacity<frames[1].opacity&&frames[1].opacity<=frames[2].opacity);
   assert.equal(frames[2].opacity,1);
   assert.ok(frames.every(frame=>frame.usableWidth===frames[0].usableWidth),'Entrance must not toggle scrollbar width');
   await evaluate('motionEntrance.finish()');
   const button=await evaluate('(()=>{const r=document.getElementById("auto").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
   await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...button});await sleep(210);
   assert.notEqual(await evaluate('getComputedStyle(document.getElementById("auto")).transform'),'none');
   assert.equal(await evaluate('getComputedStyle(document.getElementById("auto"),"::before").opacity'),'1');
   await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...button});await sleep(160);
   const pressed=await evaluate('getComputedStyle(document.getElementById("auto")).transform');
   assert.ok(pressed.includes('0.985'));
   // Move away before release: exercise press feedback without activating Solve.
   await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});
   await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:1,y:1});
   await evaluate('document.getElementById("auto").disabled=true;document.getElementById("status").className="status normal"');
   assert.equal(await evaluate('getComputedStyle(document.querySelector(".status-indicator")).animationIterationCount'),'2');
   await evaluate('document.getElementById("status").className="status success"');
   assert.equal(await evaluate('getComputedStyle(document.querySelector(".status-indicator")).animationName'),'none');
   assert.equal(await evaluate('getComputedStyle(document.getElementById("status")).animationName'),'ventrix-feedback');
   await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
   assert.equal(await evaluate('getComputedStyle(document.querySelector(".popup-shell")).animationName'),'none');
   assert.equal(await evaluate('getComputedStyle(document.getElementById("auto")).transitionDuration'),'0s');
   assert.equal(await evaluate('getComputedStyle(document.getElementById("auto"),"::before").content'),'none');
   await navigate(base+'/options.html');
   await evaluate('chrome.storage.local.set({uiVisualStyle:"liquid-glass",uiTheme:'+JSON.stringify(mode)+'});SparkI18n.setTheme('+JSON.stringify(mode)+')');
   assert.equal(await evaluate('getComputedStyle(document.querySelector(".settings-intro")).animationName'),'none');
   await cdp('Emulation.setEmulatedMedia',{features:[]});
   assert.equal(await evaluate('getComputedStyle(document.querySelector(".settings-intro")).animationName'),'ventrix-settle');
   await evaluate('document.querySelector("input[name=uiVisualStyle]").focus()');
   assert.notEqual(await evaluate('getComputedStyle(document.querySelector(".style-card")).outlineStyle'),'none');
   const switchTiming=await evaluate('getComputedStyle(document.querySelector(".ios-switch"),"::after").transitionDuration');
   assert.equal(switchTiming,'0.19s');
   motion.push({mode,frames,pressed,switchTiming,reducedMotion:true,keyboardFocus:true,busyCueIterations:2});
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'motion-results.json'),JSON.stringify({motion,otherStylesIsolated:true,runtimeErrors:errors},null,2)+'\n');
  console.log('Motion assertions passed for both appearances; other styles isolated; reduced motion verified.');
`;
source=source.replace(marker,motionChecks+'\n'+marker);
new Function('require','__dirname',source)(require,__dirname);
