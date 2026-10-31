(function(root){
  'use strict';
  const base='https://generativelanguage.googleapis.com';
  const DIRECT_LIMIT=15*1000*1000, FILE_LIMIT=2*1000*1000*1000;
  const cache=new Map();
  function number(value){if(!/^\d+$/.test(value||''))return null;const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;}
  async function size(url,fetcher,signal){
    let res;
    try{res=await fetcher(url,{method:'HEAD',credentials:'include',redirect:'follow',signal});
      if(res.ok&&res.status===200&&!res.headers.get('content-range')&&!/^(?!identity$).+/i.test(res.headers.get('content-encoding')||'')){const n=number(res.headers.get('content-length'));if(n!==null)return n;}}
    catch(e){if(signal?.aborted)throw e;}
    try{res=await fetcher(url,{method:'GET',headers:{Range:'bytes=0-0'},credentials:'include',redirect:'follow',signal});
      if(res.status===206){const match=/^bytes\s+0-0\/(\d+)$/i.exec(res.headers.get('content-range')||'');const n=number(match?.[1]);if(n!==null){res.body?.cancel?.();return n;}}res.body?.cancel?.();}
    catch(e){if(signal?.aborted)throw e;}
    return null;
  }
  function check(response,stage){if(!response.ok)throw Error(stage+' thất bại (HTTP '+response.status+(response.status===429?', quota hoặc giới hạn tốc độ':'')+').');}
  async function json(response,stage){try{return await response.json()}catch{throw Error(stage+': phản hồi không hợp lệ.')}}
  function validFile(file){
    if(!/^files\/[a-zA-Z0-9_-]+$/.test(file?.name||''))throw Error('Gemini Files trả tên file không hợp lệ.');
    const u=new URL(file.uri);if(u.protocol!=='https:'||u.hostname!=='generativelanguage.googleapis.com')throw Error('Gemini Files trả URI không hợp lệ.');
    return file;
  }
  async function upload(url,key,fetcher,signal,options={}){
    const media=await fetcher(url,{method:'GET',credentials:'include',redirect:'follow',signal});check(media,'Tải video');
    if(media.status!==200)throw Error('Tải video không trả toàn bộ file.');
    const type=(media.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(type!=='video/mp4')throw Error('Video tải về không có MIME video/mp4.');
    const stated=number(media.headers.get('content-length'));if(stated>FILE_LIMIT)throw Error('Video vượt giới hạn Files API 2 GB.');
    const blob=await media.blob();if(blob.type.split(';')[0].toLowerCase()!=='video/mp4')throw Error('Blob video không có MIME video/mp4.');if(!blob.size||blob.size>FILE_LIMIT)throw Error('Video rỗng hoặc vượt giới hạn Files API 2 GB.');
    const start=await fetcher(base+'/upload/v1beta/files',{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json','X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(blob.size),'X-Goog-Upload-Header-Content-Type':'video/mp4'},body:JSON.stringify({file:{display_name:'Studymate video'}}),credentials:'omit',redirect:'error',signal});check(start,'Khởi tạo upload');
    let uploadUrl;try{uploadUrl=new URL(start.headers.get('x-goog-upload-url'));if(uploadUrl.protocol!=='https:'||uploadUrl.hostname!=='generativelanguage.googleapis.com')throw Error();}catch{throw Error('Gemini không trả URL upload hợp lệ.');}
    const uploaded=await fetcher(uploadUrl.href,{method:'POST',headers:{'Content-Type':'video/mp4','X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize'},body:blob,credentials:'omit',redirect:'error',signal});check(uploaded,'Upload video');
    let file=validFile((await json(uploaded,'Upload video')).file);
    const until=Date.now()+(options.processingTimeoutMs||180000);
    while(file.state==='PROCESSING'){
      if(Date.now()>=until)throw Error('Gemini xử lý video quá thời gian chờ.');
      await new Promise((resolve,reject)=>{if(signal?.aborted)return reject(new DOMException('Aborted','AbortError'));const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},options.pollMs??2000);function abort(){clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))}signal?.addEventListener('abort',abort,{once:true})});
      const status=await fetcher(base+'/v1beta/'+file.name,{headers:{'x-goog-api-key':key},credentials:'omit',redirect:'error',signal});check(status,'Kiểm tra xử lý video');file=validFile(await json(status,'Kiểm tra xử lý video'));
    }
    if(file.state==='FAILED')throw Error('Gemini xử lý video thất bại.');
    if(file.state!=='ACTIVE')throw Error('Gemini chưa xác nhận video ACTIVE.');
    return file;
  }
  async function transport(url,key,fetcher,signal,options={}){
    const n=await size(url,fetcher,signal);
    if(n!==null&&n>FILE_LIMIT)throw Error('Video vượt giới hạn Files API 2 GB.');
    if(n!==null&&n<=DIRECT_LIMIT){
      try{
        const publicHead=await fetcher(url,{method:'HEAD',credentials:'omit',redirect:'follow',signal});
        if(publicHead.ok&&publicHead.status===200&&number(publicHead.headers.get('content-length'))===n)return {uri:url,direct:true};
      }catch(e){if(signal?.aborted)throw e;}
    }
    const cacheKey=key+'\n'+url+'\n'+n;
    const saved=cache.get(cacheKey);if(saved&&saved.expires>Date.now())return {uri:saved.uri,direct:false};
    const file=await upload(url,key,fetcher,signal,options);
    const expiry=Date.parse(file.expirationTime||'');cache.set(cacheKey,{uri:file.uri,expires:Math.min(Number.isFinite(expiry)?expiry:Date.now()+3600000,Date.now()+3600000)});
    return {uri:file.uri,direct:false};
  }
  root.SparkVideoTransport=Object.freeze({size,upload,transport,DIRECT_LIMIT,FILE_LIMIT});
  if(typeof module!=='undefined')module.exports=root.SparkVideoTransport;
})(globalThis);
