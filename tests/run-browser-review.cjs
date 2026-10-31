'use strict';
const {createServer}=require('node:http');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const browser=process.env.SPARK_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!browser)throw Error('No Chromium browser found. Configure SPARK_BROWSER.');


const allowed=new Set(['/qti.js','/core/site-registry.js','/solvers/interactions.js','/solvers/sequence.js','/solvers/text-correction.js','/answer-sources/embedded-qti.js','/core/runtime.js','/adapters/ngl.js','/adapters/generic.js','/content.js','/tests/browser-review.html','/tests/review-fixture.js']);
const server=createServer((req,res)=>{
 const filename=new URL(req.url,'http://localhost').pathname;
 if(allowed.has(filename)){res.setHeader('Content-Type',filename.endsWith('.html')?'text/html':'application/javascript');res.end(fs.readFileSync(path.join(root,filename.slice(1))));return;}
 res.statusCode=404;res.end();
});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'spark-review-'));
 try{
  for(const [page,count] of [['browser-review.html',83]]){
  const output=await new Promise((resolve,reject)=>{
   const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--virtual-time-budget=150000','--dump-dom',`http://127.0.0.1:${server.address().port}/tests/${page}`]);
   let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('Review tests timed out'));},65000);
   child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
   child.on('error',error=>{clearTimeout(timer);reject(error);});
   child.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(Error(`Chrome ${code}: ${stderr.slice(-2500)}`));});
  });
  const decode=text=>text.replace(/&quot;/g,'"').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&');
  const error=output.match(/<pre id="test-error">([\s\S]*?)<\/pre>/);if(error)throw Error(decode(error[1]));
  const match=output.match(/<pre id="test-result">([\s\S]*?)<\/pre>/);assert.ok(match,`Chrome did not finish: ${output.slice(-2000)}`);
  const result=JSON.parse(decode(match[1]));assert.equal(result.failed?.length||0,0,JSON.stringify(result.failed));assert.equal(result.passed,count);
  console.log(`Chrome synthetic mixed Review cases: ${result.passed}/${count} passed (${page})`);result.cases.forEach(name=>console.log(`PASS ${name}`));
  }
 }finally{server.close();fs.rmSync(profile,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;server.close();});
