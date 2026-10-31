(function(root){
 'use strict';
 function inspect(options={}){
   const visible=e=>{for(let n=e;n&&n.nodeType===1;n=n.parentElement){let s=getComputedStyle(n);if(n.hidden||n.hasAttribute('inert')||n.getAttribute('aria-hidden')==='true'||s.display==='none'||s.visibility==='hidden')return false;}return true;};
   const roots=[...document.querySelectorAll('.content-wrap')].filter(visible);
   const editors=[...document.querySelectorAll('iframe.cke_wysiwyg_frame,iframe[title^="Rich Text Editor"]')].filter(visible);
   if(!editors.length){
     const writingText=roots.some(r=>/\b(?:write|design|describe|create|draft|compose|paragraph|form)\b/i.test(r.innerText||''));
     const interaction=roots.some(r=>r.querySelector('.interaction,.wrapper-dropdown,select,input:not([type="hidden"]),[role="radio"],[role="checkbox"]'));
     return {found:false,pending:writingText&&!interaction,reason:roots.length?'EDITOR_NOT_FOUND':'CONTENT_ROOT_NOT_FOUND'};
   }
   if(roots.length!==1||editors.length!==1||!roots[0].contains(editors[0]))return {found:true,error:'Không xác định duy nhất phạm vi bài viết hoặc editor.'};
   const scope=roots[0];
   const specialized='.interaction.ic-text-correction,.interaction.os-sequence,.interaction.om-text-gap,.interaction.is-linking-lines,.interaction.is-checkbox,.interaction.is-radiobutton,.interaction.ic-speaking-and-recording,[role="textbox"],.wrapper-dropdown,[role="radio"],[role="checkbox"],[role="combobox"],select,input:not([type="hidden"])';
   const recording='.interaction.ic-speaking-and-recording';
   const blocker=[...scope.querySelectorAll(specialized)].find(e=>{
     if(!visible(e)||e.closest('.cke'))return false;
     if(options.allowAuxRecording===true && e.matches(recording) && !e.matches('.im-marking') &&
       specialized.split(',').filter(selector=>e.matches(selector)).every(selector=>selector===recording))return false;
     return true;
   });
   if(blocker){
     const selectors=specialized.split(',').filter(selector=>blocker.matches(selector));
     const path=[];
     for(let node=blocker;node&&node!==scope&&path.length<12;node=node.parentElement){
       const tag=/^[a-z][a-z0-9-]{0,30}$/.test(String(node.tagName||'').toLowerCase())?node.tagName.toLowerCase():'element';
       const siblings=node.parentElement?.children?[...node.parentElement.children]:[];
       const index=siblings.indexOf(node)+1;
       path.unshift(tag+(index>0?':nth-child('+index+')':''));
     }
     return {found:false,reason:'SPECIALIZED_INTERACTION',diagnostic:{selectors,tag:path.at(-1)?.split(':')[0]||'element',path:path.join(' > '),classification:'visible-outside-cke',insideToolbar:!!blocker.closest('[role="toolbar"],.toolbar,.cke_toolbox'),insideNavigation:!!blocker.closest('nav,[role="navigation"],.navigation')}};
   }
   const videos=[...scope.querySelectorAll('video')].filter(visible);
   if(videos.length>1)return {found:true,error:'WRITING_MEDIA_AMBIGUOUS: Có nhiều video trong bài.'};
   let videoUrl='';
   if(videos.length){
     const video=videos[0],src=video.currentSrc||video.getAttribute('src')||video.querySelector('source[src]')?.getAttribute('src');
     try {const u=new URL(src,video.ownerDocument.baseURI);if(!src||u.protocol!=='https:')throw Error();videoUrl=u.href;}
     catch{return {found:true,error:'WRITING_MEDIA_URL: Không tìm thấy URL video HTTPS.'};}
   }
   const skip='nav,header,footer,button,script,style,textarea,input,select,iframe,.cke,[role="navigation"],[role="toolbar"],[contenteditable="true"],.navigation,.toolbar';
   const parts=[];const blocks=new Set(['P','DIV','SECTION','ARTICLE','H1','H2','H3','H4','H5','H6','LI','TR','BR']);
   function walk(node){
     if(node.nodeType===3){const t=node.nodeValue.replace(/\s+/g,' ');if(t)parts.push(t);return;}
     if(node.nodeType!==1||!visible(node)||node.matches(skip))return;
     const block=blocks.has(node.tagName);if(block)parts.push('\n');
     if(node.tagName==='LI')parts.push('- ');
     if(node.tagName==='TD'||node.tagName==='TH')parts.push(' | ');
     for(const child of node.childNodes)walk(child);
     if(block)parts.push('\n');
   }
   walk(scope);
   const exercise=parts.join('').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
   if(!exercise)return {found:true,error:'Không trích xuất được nội dung đề bài viết.'};
   if(!/\b(?:write|design|describe|create|draft|compose|paragraph|form)\b/i.test(exercise))return {found:false,reason:'WRITING_INSTRUCTION_NOT_FOUND'};
   if(exercise.length>50000)return {found:true,error:'Nội dung bài viết quá dài.'};
   return {found:true,exercise,rootId:scope.id,documentUrl:document.URL,contextText:scope.textContent,videoUrl,...(options.allowAuxRecording===true?{allowAuxRecording:true}:{})};
 }
 async function scan(chromeApi,tabId){
   const frames=await chromeApi.scripting.executeScript({target:{tabId,allFrames:true},world:'ISOLATED',func:inspect});
   const found=frames.filter(f=>f.result?.found);
   if(found.length>1)return {found:true,error:'Có nhiều bài viết; không xác định được editor.'};
   return found.length?{...found[0].result,frameId:found[0].frameId}:{found:false,pending:frames.some(f=>f.result?.pending)};
 }
 async function scanFrame(chromeApi,tabId,frameId,options={}){
   const frames=await chromeApi.scripting.executeScript({target:{tabId,frameIds:[frameId]},world:'ISOLATED',func:inspect,args:[options]});
   const frame=frames.find(item=>item.frameId===frameId);
   const result=frame?.result;
   if(!result)throw Error('Không thể kiểm tra frame bài viết đã chọn.');
   return {...result,frameId};
 }
 root.SparkTextWriting=Object.freeze({inspect,scan,scanFrame});
 if(typeof module!=='undefined')module.exports=root.SparkTextWriting;
})(globalThis);
