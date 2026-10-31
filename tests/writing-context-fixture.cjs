'use strict';
function fixture({video=false}={}){
 const node=extra=>Object.defineProperties({nodeType:1,tagName:"DIV",matches:()=>false,parentElement:null,isConnected:true,hidden:false,hasAttribute:()=>false,getAttribute:()=>null},Object.getOwnPropertyDescriptors(extra||{}));
 let text=video?'Watch the video. Write about it.':'Design a form. Sample answer: Example Learner. CHECK: Include first language.';
 let html='',writes=0;
 const body=node({getAttribute:()=> 'true'}),frame=node({contentDocument:{body}});
 const media=video?node({currentSrc:'https://example.test/media/movie.mp4',ownerDocument:{baseURI:'https://example.test/'},querySelector:()=>null}):null;
 const scope=node({id:'content_wrap_0',get textContent(){return text;},get childNodes(){return [{nodeType:3,nodeValue:text}]},contains:n=>n===frame||n===container,querySelector:s=>s==='video'?media:null,querySelectorAll:s=>s==='video'&&media?[media]:[]});
 const container=node({querySelector:()=>frame});frame.parentElement=scope;container.parentElement=scope;
 const editor={status:'ready',mode:'wysiwyg',readOnly:false,container:{$:container},editable:()=>({$:body}),setData(data,options){writes++;html=data;options.callback();},getData:()=>html};
 const box=()=>{let markup='',value='';return {set textContent(v){value=v;markup=v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')},get textContent(){return value||markup.replace(/<br\s*\/?>/g,'\n').replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')},set innerHTML(v){markup=v;value=''},get innerHTML(){return markup},querySelectorAll:()=>[]};};
 const doc={URL:'https://example.test/cdn_proxy/synthetic-writing/index',querySelector:s=>s==='.content-wrap'?scope:null,querySelectorAll:s=>s==='.content-wrap'?[scope]:s.startsWith('iframe')?[frame]:s.startsWith('video')?(media?[media]:[]):s==='p'?[{innerText:text}]:[],createElement:box};
 global.document=doc;global.window={CKEDITOR:{instances:{editor1:editor}}};global.getComputedStyle=()=>({display:'block',visibility:'visible'});
 return {doc,scope,frame,body,container,editor,media,writes:()=>writes,html:()=>html,setText:v=>text=v,expected:()=>({rootId:scope.id,documentUrl:doc.URL,contextText:scope.textContent,videoUrl:media?.currentSrc||''})};
}
module.exports=fixture;
