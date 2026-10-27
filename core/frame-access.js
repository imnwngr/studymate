(function(root){
  'use strict';
  if(root.SparkFrameAccess)return;
  const files=Object.freeze(['qti.js','core/site-registry.js','solvers/interactions.js',
    'solvers/sequence.js','solvers/text-correction.js','answer-sources/embedded-qti.js','core/runtime.js',
    'adapters/ngl.js','adapters/generic.js','content.js']);
  async function send(chrome,tabId,frameId,message){
    try{return await chrome.tabs.sendMessage(tabId,message,{frameId});}
    catch{
      try{
        if(chrome.permissions?.contains&&chrome.webNavigation?.getAllFrames){
          const frames=await chrome.webNavigation.getAllFrames({tabId});
          const frame=frames?.find(f=>f.frameId===frameId),top=frames?.find(f=>f.frameId===0);
          if(frame&&top){
            let origin=null,topOrigin=null;try{origin=new URL(frame.url).origin;topOrigin=new URL(top.url).origin;}catch{}
            if(origin&&origin!=='null'&&origin!==topOrigin&&!await chrome.permissions.contains({origins:[origin+'/*']}))
              return {ok:false,reason:'accessUnavailable',error:'Host permission required for this cross-origin frame.'};
          }
        }
        await chrome.scripting.executeScript({target:{tabId,frameIds:[frameId]},files:[...files]});
      }catch(error){
        const detail=String(error?.message||error);
        const denied=/cannot access|permission|not allowed|extensions gallery|restricted|missing host/i.test(detail);
        return {ok:false,reason:denied?'accessUnavailable':'injectionFailed',error:detail.slice(0,200)};
      }
      try{return await chrome.tabs.sendMessage(tabId,message,{frameId});}
      catch(error){return {ok:false,reason:'frameUnavailable',error:String(error?.message||error).slice(0,200)};}
    }
  }
  root.SparkFrameAccess=Object.freeze({files,send});
})(globalThis);
