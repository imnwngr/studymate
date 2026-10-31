'use strict';
const {createServer}=require('node:http');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const browser=process.env.SPARK_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!browser)throw Error('No Chromium browser found. Configure SPARK_BROWSER.');


const allowed=new Set(['/qti.js','/core/site-registry.js','/solvers/interactions.js','/solvers/sequence.js','/solvers/text-correction.js','/answer-sources/embedded-qti.js','/core/runtime.js','/adapters/ngl.js','/adapters/generic.js','/content.js','/tests/browser-correction.html','/tests/correction-fixture.js','/tests/browser-textcorrection.html','/tests/browser-textcorrection-qti.html']);
const server=createServer((req,res)=>{
 const filename=new URL(req.url,'http://localhost').pathname;
 if(allowed.has(filename)){res.setHeader('Content-Type',filename.endsWith('.html')?'text/html':'application/javascript');res.end(fs.readFileSync(path.join(root,filename.slice(1))));return;}
 res.statusCode=404;res.end();
});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'spark-correction-'));
 try{
  for(const [page,count] of [['browser-correction.html',37],...['fresh','corrupt','solved','unknown-unmodified','fixed-changed'].map(s=>['browser-textcorrection-qti.html?scenario='+s,0]),['browser-textcorrection.html',0],['browser-textcorrection.html?missing-ok',0]]){
  const output=await new Promise((resolve,reject)=>{
   const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--virtual-time-budget=60000','--dump-dom',`http://127.0.0.1:${server.address().port}/tests/${page}`]);
   let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('Correction tests timed out'));},45000);
   child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
   child.on('error',error=>{clearTimeout(timer);reject(error);});
   child.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(Error(`Chrome ${code}: ${stderr.slice(-2500)}`));});
  });
  const decode=text=>text.replace(/&quot;/g,'"').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&');
  const error=output.match(/<pre id="test-error">([\s\S]*?)<\/pre>/);if(error)throw Error(decode(error[1]));
  const match=output.match(/<pre id="test-result">([\s\S]*?)<\/pre>/);assert.ok(match,`Chrome did not finish: ${output.slice(-2000)}`);
  const result=JSON.parse(decode(match[1]));
  if(count===0){
    if(page.includes('missing-ok')){assert.equal(result.apply[0].status,'uncertain');assert.equal(result.done,0);}
    else{
      assert.equal(result.apply[0].status,'filled',JSON.stringify(result));assert.equal(result.again[0].status,'filled');assert.deepEqual(result.tokens,result.finalTokens||result.tokensAfter);
      assert.equal(result.done,page.includes('scenario=fixed-changed')?21:page.includes('scenario=')&&!page.includes('scenario=fresh')?20:15);
      if(result.finalTokens)assert.equal(result.finalTokens[7],'Bridge','unrelated edit was not restored');
    }
    console.log('PASS legacy correction: '+page);continue;
  }
  assert.equal(result.failed?.length||0,0,JSON.stringify(result.failed));assert.equal(result.passed,count);
  console.log(`Chrome synthetic correction cases: ${result.passed}/${count} passed (${page})`);result.cases.forEach(name=>console.log(`PASS ${name}`));
  }
 }finally{server.close();fs.rmSync(profile,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;server.close();});
