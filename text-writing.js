(function(root){
 'use strict';
 function inspect(options={}){
   const visible=e=>{for(let n=e;n&&n.nodeType===1;n=n.parentElement){let s=getComputedStyle(n);if(n.hidden||n.hasAttribute('inert')||n.getAttribute('aria-hidden')==='true'||s.display==='none'||s.visibility==='hidden')return false;}return true;};
   const roots=[...document.querySelectorAll('.content-wrap')].filter(visible);
   const editors=[...document.querySelectorAll('iframe.cke_wysiwyg_frame,iframe[title^="Rich Text Editor"]')].filter(visible);
   const chartReference=Symbol.for('studymate.writing.chart');
   if(!editors.length){
     const page=roots.length===1?roots[0]:null;
     const index=page?.id?.match(/^content_wrap_(\d+)$/);
     if(index&&page.querySelector?.('.interaction.pp-present')){
       const descriptions=[...page.querySelectorAll('img[alt]')].filter(visible)
         .map(img=>img.alt.trim()).filter(alt=>/\b(?:chart|graph)\b/i.test(alt));
       document[chartReference]=descriptions.length===1&&descriptions[0].length<=4000?
         {url:document.URL,title:document.title,screen:Number(index[1])+1,description:descriptions[0]}:null;
     }
     const writingText=roots.some(r=>/\b(?:write|design|describe|create|draft|compose|paragraph|form)\b/i.test(r.innerText||''));
     const interaction=roots.some(r=>r.querySelector('.interaction,.wrapper-dropdown,select,input:not([type="hidden"]),[role="radio"],[role="checkbox"]'));
     return {found:false,pending:writingText&&!interaction,reason:roots.length?'EDITOR_NOT_FOUND':'CONTENT_ROOT_NOT_FOUND'};
   }
   if(roots.length!==1||editors.length!==1||!roots[0].contains(editors[0]))return {found:true,error:'Không xác định duy nhất phạm vi bài viết hoặc editor.'};
   const scope=roots[0];
   const specialized='.interaction.ic-text-correction,.interaction.os-sequence,.interaction.om-text-gap,.interaction.is-linking-lines,.interaction.is-checkbox,.interaction.is-radiobutton,.interaction.ic-speaking-and-recording,[role="textbox"],.wrapper-dropdown,[role="radio"],[role="checkbox"],[role="combobox"],select,input:not([type="hidden"])';
   const recording='.interaction.ic-speaking-and-recording';
   function editorWrapper(widget){
     if(widget.closest('.content-wrap')!==scope||!widget.contains(editors[0])||widget.matches('.im-marking')||
       [...scope.querySelectorAll(recording)].filter(visible).length!==1)return false;
     const passive=new Set(['DIV','SPAN','SECTION','ARTICLE','P','LABEL','UL','OL','LI','BR','H1','H2','H3','H4','H5','H6']);
     try{
       for(const node of [widget,...widget.querySelectorAll('*')]){
         if(node.srcObject)return false;
         if(['recording','is-recording','recording-active','capturing','is-capturing'].some(name=>node.classList?.contains(name)))return false;
         for(const name of ['data-recording','data-recording-state','data-capture-state']){
           const state=node.getAttribute(name);
           if(state!==null&&!['false','idle','inactive','stopped'].includes(state.toLowerCase()))return false;
         }
         const genericState=node.getAttribute('data-state');
         if(genericState&&/record|captur|active|pause/i.test(genericState))return false;
         if(node===editors[0]||node.closest('.cke,.cke_dialog'))continue;
         if(!visible(node))continue;
         if(getComputedStyle(node).cursor==='pointer'||!passive.has(node.tagName)||node.hasAttribute('tabindex')||node.hasAttribute('contenteditable')||node.hasAttribute('role'))return false;
         if([...node.attributes].some(a=>/^on|^data-(?:event|action|state|command|record|capture)/i.test(a.name)&&!['data-recording','data-recording-state','data-capture-state'].includes(a.name)))return false;
         const hints=['aria-label','title','id'].map(name=>node.getAttribute(name)||'').join(' ');
         if(/record|microphone|capture/i.test(hints))return false;
         const classes=[...node.classList].filter(name=>node!==widget||name!=='ic-speaking-and-recording');
         if(classes.some(name=>/record|microphone|capture|button|control/i.test(name)))return false;
       }
       return true;
     }catch{return false;}
   }
   const blocker=[...scope.querySelectorAll(specialized)].find(e=>{
     if(!visible(e)||e.closest('.cke,.cke_dialog'))return false;
     if(e.matches(recording) && editorWrapper(e) &&
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
   const skip='nav,header,footer,button,script,style,textarea,input,select,iframe,.cke,.cke_dialog,[role="navigation"],[role="toolbar"],[contenteditable="true"],.navigation,.toolbar';
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
   let exercise=parts.join('').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
   if(!exercise)return {found:true,error:'Không trích xuất được nội dung đề bài viết.'};
   const writingTask=/\b(?:write|design|describe|create|draft|compose|paragraph|form)\b/i.test(exercise);
   const videoTask=videos.length===1&&/\b(?:video|watch|film|clip)\b/i.test(exercise)&&
     /\b(?:answer|summarize|summarise|analyze|analyse|description)\b/i.test(exercise);
   if(!writingTask&&!videoTask)return {found:false,reason:'WRITING_INSTRUCTION_NOT_FOUND'};
   const rubric=scope.querySelector?.('.layout__rubric')?.innerText||'';
   const referenced=rubric.match(/\b(?:chart|graph)\s+(?:on|from)\s+screen\s+(\d+)\b/i);
   if(referenced){
     const chart=document[chartReference],screen=Number(referenced[1]);
     if(chart?.screen!==screen||chart.url!==document.URL||chart.title!==document.title)
       return {found:true,error:'WRITING_REFERENCE_MISSING: Mở màn '+screen+' rồi chạy Solve để đọc biểu đồ.'};
     exercise+='\n\nScreen '+screen+'\n'+chart.description;
   }
   if(exercise.length>50000)return {found:true,error:'Nội dung bài viết quá dài.'};
   return {found:true,exercise,rootId:scope.id,documentUrl:document.URL,contextText:scope.textContent,videoUrl};
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
