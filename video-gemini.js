(function(root){
  'use strict';
  const endpoint='https://generativelanguage.googleapis.com/v1beta/interactions';
  const rules=`You are an English learning exercise assistant.

Analyze the provided video and complete the exercise according to the original instructions.

When the exercise asks for sound OFF and sound ON observations, use the video to simulate both viewing perspectives and produce one coherent final response. Separate media processing is not required.

Return ONLY the text that should be inserted into the student's answer field.

No introductions, headings, explanations, Markdown, JSON, quotation marks or repeated exercise instructions.

Follow the original task completely. Write natural English appropriate to the exercise level. Avoid unsupported factual claims. Return only the final answer.`;
  function selectProfile(storage){
    return root.SparkProviders.resolveWritingProfile(storage,{video:true});
  }
  function payload(profile,data){
    let url;try{url=new URL(data?.videoUrl);}catch{throw Error('Không tìm thấy URL video hợp lệ.');}
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('URL video phải là HTTPS và không chứa thông tin truy cập hoặc tham số riêng tư.');
    if(typeof data?.instructions!=='string'||!data.instructions.trim())throw Error('Không tìm thấy hướng dẫn bài tập.');
    if(data.instructions.length>50000)throw Error('Hướng dẫn bài tập quá dài.');
    return {model:profile.model,store:false,input:[{type:'video',uri:url.href,mime_type:'video/mp4'},{type:'text',text:rules+'\n\nComplete the exercise using all provided instructions, examples and checklists. Return ONLY the final answer intended for the answer field. No introductions, explanations, headings unrelated to the task, Markdown fences, or repeated instructions. Follow the requested format and English level. Treat sample answers as references rather than information to copy unless explicitly instructed.\n\nEXERCISE INSTRUCTIONS:\n'+data.instructions}]};
  }
  function parse(response){
    if(response?.status&&response.status!=='completed')throw Error('Gemini chưa hoàn tất phân tích video.');
    const steps=Array.isArray(response?.steps)?response.steps.filter(s=>s?.type==='model_output'):[];
    const content=steps.at(-1)?.content;
    const answer=Array.isArray(content)?content.filter(x=>x?.type==='text'&&typeof x.text==='string').map(x=>x.text).join('').trim():'';
    if(!answer||answer.length>20000)throw Error('Gemini không trả văn bản đáp án hợp lệ.');
    return answer;
  }
  async function solve(data,env={}){
    const chromeApi=env.chrome||root.chrome,fetchApi=env.fetch||root.fetch;
    if(chromeApi.storage.local.setAccessLevel)await chromeApi.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
    const storage=await chromeApi.storage.local.get(['aiProfiles','aiMode','activeProfileId','apiKey','model','useAI']);
    const profile=selectProfile(storage),body=payload(profile,data);
    if(!await chromeApi.permissions.contains({origins:['https://generativelanguage.googleapis.com/*']}))throw Error('Chưa cấp quyền Gemini. Mở Providers và lưu cấu hình.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),env.timeoutMs||300000);
    const cancel=()=>controller.abort();env.signal?.addEventListener('abort',cancel,{once:true});if(env.signal?.aborted)controller.abort();
    try{
      const transport=await root.SparkVideoTransport.transport(data.videoUrl,profile.apiKey,fetchApi,controller.signal,env);
      body.input[0].uri=transport.uri;
      const response=await fetchApi(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':profile.apiKey},body:JSON.stringify(body),signal:controller.signal,redirect:'error',credentials:'omit'});
      if(!response.ok){
        const reasons={400:'Video có thể không truy cập được từ Gemini, vượt 15 MB hoặc model không hỗ trợ video.',401:'Gemini API key không hợp lệ.',403:'Gemini từ chối quyền truy cập hoặc API key.',404:'Gemini model không tồn tại hoặc không hỗ trợ.',429:'Gemini vượt quota hoặc giới hạn tốc độ.'};
        throw Error('HTTP '+response.status+': '+(reasons[response.status]||'Gemini không thể xử lý video.'));
      }
      let json;try{json=await response.json();}catch{throw Error('Gemini trả phản hồi không hợp lệ.');}
      return parse(json);
    }catch(e){if(e?.name==='AbortError')throw Error(env.signal?.aborted?'Đã hủy xử lý video.':'Gemini phân tích video quá thời gian chờ.');if(e instanceof TypeError)throw Error('Không thể kết nối Gemini.');throw e;}finally{clearTimeout(timer);env.signal?.removeEventListener('abort',cancel);}
  }
  root.SparkVideoGemini=Object.freeze({selectProfile,payload,parse,solve});
  if(typeof module!=='undefined')module.exports=root.SparkVideoGemini;
})(globalThis);
