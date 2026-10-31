(function(root){
  'use strict';
  async function inspectFrame(action,expected,answer){
    const changed=()=>({found:true,code:'WRITING_CONTEXT_CHANGED',error:'WRITING_CONTEXT_CHANGED: Bài tập hoặc editor đã thay đổi; hãy Solve lại.'});
    const visible=e=>{for(let n=e;n&&n.nodeType===1;n=n.parentElement){const s=getComputedStyle(n);if(n.hidden||n.hasAttribute('inert')||s.display==='none'||s.visibility==='hidden')return false;}return true;};
    const frames=[...document.querySelectorAll('iframe.cke_wysiwyg_frame,iframe[title^="Rich Text Editor"]')].filter(visible);
    const scopes=[...document.querySelectorAll('.content-wrap')].filter(visible);
    const identity=()=>{
      try{const url=new URL(document.URL);const match=url.pathname.match(/\/(?:cdn_proxy|api\/interactives)\/([^/]+)(?:\/|$)/);return url.protocol==='https:'&&match?url.origin+'/'+match[1]:null;}catch{return null;}
    };
    const slot=Symbol.for('studymate.writing.context');
    if(action==='captureWriting'){
      if(!expected||!identity()||expected.documentUrl!==document.URL||scopes.length!==1||frames.length!==1)return changed();
      const scope=scopes[0],frame=frames[0];
      if(scope.id!==expected.rootId||!scope.contains(frame)||typeof expected.contextText!=='string'||scope.textContent!==expected.contextText)return changed();
      const matches=Object.values(window.CKEDITOR?.instances||{}).filter(e=>e?.container?.$?.querySelector('iframe')===frame);
      if(matches.length!==1)return changed();
      const editor=matches[0],container=editor.container.$,doc=document,frameDoc=frame.contentDocument;
      if(!frameDoc||!editor.editable?.()?.$||editor.status!=='ready'||editor.mode!=='wysiwyg'||editor.readOnly)return changed();
      const editable=editor.editable().$,exerciseId=identity(),url=document.URL,text=scope.textContent;
      const video=scope.querySelector('video');
      const media=()=>{if(!video)return '';const src=video.currentSrc||video.getAttribute('src')||video.querySelector('source[src]')?.getAttribute('src');try{return src?new URL(src,video.ownerDocument.baseURI).href:null;}catch{return null;}};
      if(media()!==(expected.videoUrl||''))return changed();
      const videoUrl=media();
      const valid=()=>document===doc&&document.URL===url&&identity()===exerciseId&&scope.isConnected&&frame.isConnected&&container.isConnected&&editable.isConnected&&
        [...document.querySelectorAll('.content-wrap')].filter(visible).length===1&&[...document.querySelectorAll('.content-wrap')].filter(visible)[0]===scope&&scope.contains(frame)&&scope.textContent===text&&
        [...document.querySelectorAll('iframe.cke_wysiwyg_frame,iframe[title^="Rich Text Editor"]')].filter(visible).length===1&&visible(scope)&&visible(frame)&&
        frame.contentDocument===frameDoc&&frameDoc.body===editable&&editable.getAttribute('contenteditable')==='true'&&scope.querySelector('video')===video&&media()===videoUrl&&
        Object.values(window.CKEDITOR?.instances||{}).filter(e=>e?.container?.$?.querySelector('iframe')===frame).length===1&&Object.values(window.CKEDITOR?.instances||{}).includes(editor)&&editor.container?.$===container&&container.querySelector('iframe')===frame&&
        editor.editable?.()?.$===editable&&editor.status==='ready'&&editor.mode==='wysiwyg'&&!editor.readOnly;
      if(!valid())return changed();
      const token=crypto.randomUUID();
      Object.defineProperty(window,slot,{value:{token,valid,editor},writable:true,configurable:true});
      return {found:true,contextToken:token};
    }
    if(action==='scan'){
      const videos=[...document.querySelectorAll('video.vjs-tech,video')].filter(visible);
      if(!videos.length&&!frames.length)return {found:false};
      const text=[...document.querySelectorAll('p')].filter(visible).map(e=>e.innerText||e.textContent||'').filter(s=>s.trim()).join('\n');
      if(!/\b(?:video|watch|film|clip)\b/i.test(text)||!/\b(?:write|describe|description|summarize|summarise|answer|analyze|analyse)\b/i.test(text))return {found:false};
      if(videos.length!==1||frames.length!==1)return {found:true,error:'Không xác định duy nhất video hoặc CKEditor.'};
      const video=videos[0],src=video.currentSrc||video.getAttribute('src')||video.querySelector('source[src]')?.getAttribute('src');
      let url;try{url=new URL(src,video.ownerDocument.baseURI);if(!src||url.protocol!=='https:')throw Error();}catch{return {found:true,error:'Không tìm thấy URL video HTTPS.'};}
      return {found:true,videoUrl:url.href,instructions:text};
    }
    const saved=window[slot];
    if(!saved||!expected?.contextToken||saved.token!==expected.contextToken||!saved.valid())return changed();
    if(typeof answer!=='string'||!answer.trim())return {found:true,error:'Đáp án trống.'};
    const editor=saved.editor;
    const box=document.createElement('div');box.textContent=answer;const html='<p>'+box.innerHTML.replace(/\n/g,'<br>')+'</p>';
    if(!saved.valid())return changed();
    // No await between the context guard and the first editor mutation.
    const written=await new Promise(resolve=>{let done=false;const timer=setTimeout(()=>{if(!done){done=true;resolve(false);}},5000);try{editor.setData(html,{callback:()=>{if(!done){done=true;clearTimeout(timer);resolve(true);}}});}catch{clearTimeout(timer);resolve(false);}});
    if(!saved.valid())return changed();
    if(!written)return {found:true,error:'Không ghi được CKEditor.'};
    const check=document.createElement('div');check.innerHTML=editor.getData();
    check.querySelectorAll('br').forEach(br=>br.replaceWith(document.createTextNode('\n')));
    const lines=s=>String(s).replace(/\u00a0/g,' ').replace(/\r\n?/g,'\n').split('\n').map(line=>line.trim().replace(/[ \t]+/g,' ')).join('\n').trim();
    if(lines(check.textContent)!==lines(answer))return {found:true,error:'Không xác minh được nội dung CKEditor.'};
    if(!saved.valid())return changed();
    return {found:true,written:true};
  }
  async function scan(chromeApi,tabId){
    const results=await chromeApi.scripting.executeScript({target:{tabId,allFrames:true},world:'MAIN',func:inspectFrame,args:['scan']});
    const found=results.filter(x=>x.result?.found);
    if(found.length>1)return {found:true,error:'Có nhiều bài video; không xác định được câu hỏi.'};
    return found.length?{...found[0].result,frameId:found[0].frameId}:{found:false};
  }
  async function capture(chromeApi,tabId,frameId,expected){
    try{
      const results=await chromeApi.scripting.executeScript({target:{tabId,frameIds:[frameId]},world:'MAIN',func:inspectFrame,args:['captureWriting',expected]});
      const result=results.find(r=>r.frameId===frameId);
      return result?.result?.contextToken?{...result.result,documentId:result.documentId}:result?.result||{code:'WRITING_CONTEXT_CHANGED'};
    }catch{return {code:'WRITING_CONTEXT_CHANGED'};}
  }
  async function writeText(chromeApi,tabId,frameId,answer,expected){
    if(!expected?.contextToken)return {code:'WRITING_CONTEXT_CHANGED',error:'WRITING_CONTEXT_CHANGED'};
    try{
      const target=expected.documentId?{tabId,documentIds:[expected.documentId]}:{tabId,frameIds:[frameId]};
      const results=await chromeApi.scripting.executeScript({target,world:'MAIN',func:inspectFrame,args:['writeWriting',expected,answer]});
      return results.find(r=>r.frameId===frameId&&(!expected.documentId||r.documentId===expected.documentId))?.result||{code:'WRITING_CONTEXT_CHANGED',error:'WRITING_CONTEXT_CHANGED'};
    }catch{return {code:'WRITING_CONTEXT_CHANGED',error:'WRITING_CONTEXT_CHANGED'};}
  }
  async function write(chromeApi,tabId,frameId,expected,answer){return writeText(chromeApi,tabId,frameId,answer,expected);}
  root.SparkVideoWriting=Object.freeze({inspectFrame,scan,capture,write,writeText});
  if(typeof module!=='undefined')module.exports=root.SparkVideoWriting;
})(globalThis);
