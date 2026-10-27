/* Presentation state only. Exercise state and provider settings are never read here. */
(() => {
  'use strict';
  const STYLES=Object.freeze(['liquid-glass','editorial-studio','signal-instrument','paper-atelier']);
  const normalize=value=>STYLES.includes(value)?value:STYLES[0];
  const root=document.documentElement;
  const cacheKey='spark.visual-style';
  let selected=STYLES[0], writes=Promise.resolve(),pendingWrites=0;
  const modeKey='spark.appearance-mode';
  const mode=value=>['light','dark','system'].includes(value)?value:'system';
  function cacheMode(value){try{localStorage.setItem(modeKey,mode(value));}catch{}}
  function apply(value){
    selected=normalize(value);root.dataset.visualStyle=selected;
    try{localStorage.setItem(cacheKey,selected);}catch{}
    for(const radio of document.querySelectorAll('input[name="uiVisualStyle"]'))radio.checked=radio.value===selected;
    return selected;
  }
  function announce(key){const node=document.getElementById('styleSaveStatus');if(node)node.textContent=globalThis.SparkI18n?.t(key)||key;}
  function save(value){
    const next=apply(value);
    // Serialize rapid selections so the final click is also the final stored value.
    pendingWrites++;
    writes=writes.catch(()=>{}).then(()=>chrome.storage.local.set({uiVisualStyle:next})).finally(()=>{pendingWrites--;});
    return writes.then(()=>announce('styleSaved'),()=>announce('styleSaveFailed'));
  }
  async function reset(){
    apply(STYLES[0]);
    writes=writes.catch(()=>{}).then(()=>chrome.storage.local.set({uiVisualStyle:STYLES[0],uiTheme:'system',uiBackdropColor:'#90adce',uiBackdropStrength:65}));
    return writes.then(()=>announce('styleSaved'),()=>announce('styleSaveFailed'));
  }
  try{apply(localStorage.getItem(cacheKey));root.dataset.theme=mode(localStorage.getItem(modeKey));}catch{apply(STYLES[0]);}
  const ready=(async()=>{
    try{const stored=await chrome.storage.local.get(['uiVisualStyle','uiTheme']);apply(stored.uiVisualStyle);root.dataset.theme=mode(stored.uiTheme);cacheMode(stored.uiTheme);}catch{}
  })();
  document.addEventListener('DOMContentLoaded',async()=>{
    await ready;apply(selected);
    for(const radio of document.querySelectorAll('input[name="uiVisualStyle"]'))radio.addEventListener('change',()=>{if(radio.checked)save(radio.value);});
  });
  chrome.storage.onChanged?.addListener((changes,area)=>{if(area!=='local')return;if(changes.uiVisualStyle&&!pendingWrites)apply(changes.uiVisualStyle.newValue);if(changes.uiTheme)cacheMode(changes.uiTheme.newValue);});
  globalThis.SparkVisualStyle={STYLES,normalize,apply,save,reset,ready};
})();
