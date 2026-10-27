/* studymate appearance · local-only wallpaper controls. No external runtime. */
(() => {
  'use strict';
  const DEFAULT_COLOR = '#90adce';
  const DEFAULT_STRENGTH = 65;
  const PRESETS = Object.freeze([
    {id:'glacier',color:'#90adce'},
    {id:'aurora',color:'#a5b3b2'},
    {id:'orchid',color:'#bea6cf'},
    {id:'rose',color:'#dfacb0'},
    {id:'peach',color:'#e9be9e'},
    {id:'citron',color:'#d5ce9c'},
    {id:'seafoam',color:'#a4c9c3'},
    {id:'midnight',color:'#8197b7'},
    {id:'neutral',color:'#b5b5ba'}
  ]);
  function normalizeColor(color){
    if(typeof color!=='string')return DEFAULT_COLOR;
    const hex=color.trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(hex)?hex:DEFAULT_COLOR;
  }
  function normalizeStrength(v){
    const n=Number(v);return Number.isFinite(n)?Math.min(100,Math.max(0,Math.round(n))):DEFAULT_STRENGTH;
  }
  function rgb(hex){const s=normalizeColor(hex).slice(1);return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16));}
  function toHex(r,g,b){return '#'+[r,g,b].map(n=>Math.round(Math.max(0,Math.min(255,n))).toString(16).padStart(2,'0')).join('');}
  function hslToHex(h,s,l){
    h=((h%360)+360)%360; s=Math.min(1,Math.max(0,s)); l=Math.min(1,Math.max(0,l));
    const a=s*Math.min(l,1-l);
    const f=n=>{const k=(n+h/30)%12;return 255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)));};
    return toHex(f(0),f(8),f(4));
  }
  function hueFromHex(hex){
    const [r,g,b]=rgb(hex).map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
    if(delta===0)return 0;
    let h=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;
    return ((h*60)%360+360)%360;
  }
  function apply(color=DEFAULT_COLOR,strength=DEFAULT_STRENGTH,root=document.documentElement){
    const [r,g,b]=rgb(color), intensity=normalizeStrength(strength);
    root.style.setProperty('--wall-rgb',`${r}, ${g}, ${b}`);
    root.style.setProperty('--wall-strength',String(intensity/100));
    root.style.setProperty('--wall-color',normalizeColor(color));
    root.dataset.wallpaper=PRESETS.find(p=>p.color===normalizeColor(color))?.id||'custom';
    return {uiBackdropColor:normalizeColor(color),uiBackdropStrength:intensity};
  }
  async function load(){
    const saved=await chrome.storage.local.get(['uiBackdropColor','uiBackdropStrength']);
    return apply(saved.uiBackdropColor||DEFAULT_COLOR,saved.uiBackdropStrength??DEFAULT_STRENGTH);
  }
  function attachGlint(root=document){
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ||
      window.matchMedia?.('(prefers-reduced-transparency: reduce)')?.matches ||
      window.matchMedia?.('(pointer: coarse)')?.matches;
    if(reduce)return;
    // One compositor-friendly update per animation frame at most; no sync reads on
    // every pointer event. Leave scroll and form controls free of decorative work.
    root.querySelectorAll('.preview-sheet,.welcome-panel').forEach(el=>{
      if(el.dataset.glintBound)return;
      el.dataset.glintBound='true';
      let pending=0,rect=null,last=null;
      const update=()=>{
        pending=0;
        if(!last||!el.isConnected)return;
        rect ||= el.getBoundingClientRect();
        if(!rect.width||!rect.height)return;
        el.style.setProperty('--glare-x',`${((last.x-rect.left)/rect.width*100).toFixed(0)}%`);
        el.style.setProperty('--glare-y',`${((last.y-rect.top)/rect.height*100).toFixed(0)}%`);
      };
      el.addEventListener('pointerenter',()=>{rect=null;},{passive:true});
      el.addEventListener('pointermove',event=>{
        if(event.pointerType==='touch')return;
        last={x:event.clientX,y:event.clientY};
        if(!pending)pending=requestAnimationFrame(update);
      },{passive:true});
      el.addEventListener('pointerleave',()=>{
        last=null;rect=null;
        if(pending){cancelAnimationFrame(pending);pending=0;}
      },{passive:true});
    });
  }
  globalThis.SparkAppearance={attachGlint,DEFAULT_COLOR,DEFAULT_STRENGTH,PRESETS,normalizeColor,normalizeStrength,rgb,hslToHex,hueFromHex,apply,load};
})();
