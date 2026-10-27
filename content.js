(() => {
  'use strict';
  // Frame messaging only. NGL DOM operations live in adapters/ngl.js;
  // interaction workflows live in solvers/ and selection in core/runtime.js.
  if(globalThis.__sparkStudyAssistantLoaded)return;
  if(!globalThis.SparkCore||!globalThis.SparkGenericAdapter||!globalThis.SparkNglAdapter)return;
  globalThis.__sparkStudyAssistantLoaded=true;
  const runtime=SparkCore.create({document,url:location.href});
  const supported=new Set(['SPARK_SCAN','SPARK_COPY_PROMPT','SPARK_APPLY','SPARK_PING','SPARK_SUBMIT_NEXT','SPARK_FORWARD_SCREEN','SPARK_QTI','SPARK_DIAGNOSTICS']);
  chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
    if(!supported.has(message?.type))return false;
    runtime.dispatch(message).then(respond,error=>respond({ok:false,error:String(error?.message||error).slice(0,250)}));
    return true;
  });
})();
