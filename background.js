importScripts('solver.js', 'providers.js', 'video-transport.js', 'video-gemini.js', 'text-writing-ai.js');
'use strict';

const MAX_QUESTIONS = 100;
const API_TIMEOUT_MS = 50000;

function errMessage(error) {
  return String(error?.message || error || 'Lỗi không xác định').slice(0,250);
}

async function solveWithProfile(payload, profile, writing=false) {
  const p=SparkProviders.validateProfile(profile);
  const pattern=SparkProviders.originPattern(p.endpoint);
  if(!await chrome.permissions.contains({origins:[pattern]})) {
    throw new Error(`Chưa cấp quyền truy cập máy chủ cho “${p.name}”. Mở Cài đặt và Lưu để cấp quyền.`);
  }
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),API_TIMEOUT_MS);
  try {
    const headers={'Content-Type':'application/json'};
    // Local Ollama needs no secret; remote compatible services use Bearer authentication.
    if(p.apiKey)headers.Authorization=`Bearer ${p.apiKey}`;
    const response=await fetch(p.endpoint,{
      method:'POST',headers,signal:controller.signal,redirect:'error',
      body:JSON.stringify(writing?SparkTextWritingAI.request(p,payload):SparkProviders.requestBody(p,payload))
    });
    if(!response.ok) {
      const reasons={400:'Yêu cầu không hợp lệ. Kiểm tra model và cấu hình.',401:'API key không hợp lệ.',403:'API key không có quyền truy cập model.',404:'Không tìm thấy endpoint hoặc model không khả dụng.',429:'Đã vượt quota hoặc giới hạn tốc độ. Thử lại sau và kiểm tra quota.'};
      throw new Error('HTTP '+response.status+': '+(reasons[response.status]||'Máy chủ API không khả dụng.'));
    }
    let body;
    try {body=await response.json();}
    catch {throw new Error('Máy chủ không trả JSON hợp lệ.');}
    if(writing)return {profile:p,answer:SparkTextWritingAI.parse(body)};
    const raw=SparkProviders.parseContent(body?.choices?.[0]?.message?.content);
    return {profile:p,answers:SparkProviders.normalizeAnswers(payload,raw,p)};
  } catch(error) {
    if(error?.name==='AbortError')throw new Error('Kết nối API quá thời gian chờ.');
    if(error instanceof TypeError)throw new Error('Không thể kết nối máy chủ API.');
    throw error;
  } finally {clearTimeout(timeout);}
}

async function runSolver(payload) {
  if(!payload||!Array.isArray(payload.questions)||payload.questions.length>MAX_QUESTIONS ||
    payload.questions.some(q=>!q||typeof q.id!=='string'||typeof q.context!=='string')) {
    throw new Error('Dữ liệu bài tập không hợp lệ hoặc quá dài.');
  }
  if(chrome.storage.local.setAccessLevel)await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  const storage=await chrome.storage.local.get(['aiProfiles','aiMode','activeProfileId','apiKey','model','useAI']);
  const settings=SparkProviders.normalizeSettings(storage);
  const offline=SparkSolver.solve(payload);
  const selected=SparkProviders.selectedProfiles(settings);
  if(settings.aiMode==='offline'||!selected.length)return offline;
  if(settings.aiMode==='single') {
    try {
      const solved=await solveWithProfile(payload,selected[0]);
      return {answers:solved.answers,mode:'ai',provider:solved.profile.name};
    } catch(error) {
      return {...offline,warning:`API “${selected[0].name}” không khả dụng (${errMessage(error)}). Đã dùng quy tắc offline.`};
    }
  }
  const settled=await Promise.allSettled(selected.map(p=>solveWithProfile(payload,p)));
  const successes=[];
  const failures=[];
  for(let i=0;i<settled.length;i++) {
    if(settled[i].status==='fulfilled')successes.push(settled[i].value);
    else failures.push({name:selected[i].name,reason:errMessage(settled[i].reason)});
  }
  if(!successes.length) {
    return {...offline,warning:'Tất cả API đều thất bại. '+failures.map(f=>`${f.name}: ${f.reason}`).join(' | ')};
  }
  const compared=SparkProviders.mergeComparison(payload,successes,failures);
  if(failures.length)compared.warning=failures.map(f=>`${f.name}: ${f.reason}`).join(' | ');
  return compared;
}

let activeVideoOperation=null;
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg?.type==='SPARK_TEST_PROVIDER') {
    if(sender.id!==chrome.runtime.id || sender.url!==chrome.runtime.getURL('options.html'))return false;
    const payload={title:'Connection test',questions:[{id:'test',kind:'text',context:'Say hello.',options:[]}]};
    solveWithProfile(payload,msg.profile).then(()=>sendResponse({ok:true}),error=>sendResponse({ok:false,error:errMessage(error)}));
    return true;
  }
  if(msg?.type==='SPARK_TEXT_WRITING') {
    if(sender.id!==chrome.runtime.id || sender.url!==chrome.runtime.getURL('popup.html'))return false;
    (async()=>{
      if(chrome.storage.local.setAccessLevel)await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
      const stored=await chrome.storage.local.get(['aiProfiles','aiMode','activeProfileId','apiKey','model','useAI']);
      const profile=SparkProviders.resolveWritingProfile(stored);
      const result=await solveWithProfile(msg.exercise,profile,true);
      return result.answer;
    })().then(answer=>sendResponse({ok:true,answer}),error=>sendResponse({ok:false,error:errMessage(error),code:error.code||'AI_REQUEST_FAILED'}));
    return true;
  }
  if(msg?.type==='SPARK_VIDEO_CANCEL') {
    if(sender.id!==chrome.runtime.id || sender.url!==chrome.runtime.getURL('popup.html'))return false;
    if(activeVideoOperation?.id===msg.operationId)activeVideoOperation.controller.abort();
    sendResponse({ok:true});return false;
  }
  if(msg?.type==='SPARK_VIDEO_SOLVE') {
    if(sender.id!==chrome.runtime.id || sender.url!==chrome.runtime.getURL('popup.html'))return false;
    if(activeVideoOperation){sendResponse({ok:false,error:'Một tác vụ video đang chạy.'});return false;}
    const operation={id:msg.operationId,controller:new AbortController()};activeVideoOperation=operation;
    SparkVideoGemini.solve(msg.payload,{signal:operation.controller.signal}).then(answer=>sendResponse({ok:true,answer}),error=>sendResponse({ok:false,error:errMessage(error)})).finally(()=>{if(activeVideoOperation===operation)activeVideoOperation=null;});
    return true;
  }
  if(msg?.type!=='SPARK_SOLVE')return false;
  runSolver(msg.payload)
    .then(result=>sendResponse({ok:true,result}),error=>sendResponse({ok:false,error:errMessage(error)}));
  return true;
});
