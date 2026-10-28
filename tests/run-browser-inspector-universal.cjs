'use strict';
const {createServer}=require('node:http'),{spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const browser=process.env.SPARK_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!browser)throw Error('Set SPARK_BROWSER to an installed Chromium executable.');
const server=createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  const allowed=['/tests/browser-universal-inspector.html','/inspector-content.js','/inspector-generic.js'];
  if(!allowed.includes(u.pathname)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',u.pathname.endsWith('.html')?'text/html':'application/javascript');
  res.end(fs.readFileSync(path.join(root,u.pathname.slice(1))));
});
async function main(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'spark-inspector-'));
  try{
    const html=await new Promise((resolve,reject)=>{
      const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--virtual-time-budget=12000','--dump-dom',`http://127.0.0.1:${server.address().port}/tests/browser-universal-inspector.html`],{windowsHide:true});
      let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('Inspector browser fixture timeout'));},45000);
      child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
      child.on('error',e=>{clearTimeout(timer);reject(e);});
      child.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(Error(stderr.slice(-1500)));});
    });
    const decode=s=>s.replace(/&quot;/g,'"').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&');
    const error=html.match(/<pre id="test-error">([\s\S]*?)<\/pre>/);if(error)throw Error(decode(error[1]));
    const result=html.match(/<pre id="test-result">([\s\S]*?)<\/pre>/);assert.ok(result,'Fixture incomplete: '+html.slice(-1200));
    const data=JSON.parse(decode(result[1]));assert.equal(data.passed,19);
    console.log('Chrome Universal Inspector: '+data.passed+'/19 PASS');data.cases.forEach(c=>console.log('PASS '+c));
  }finally{server.close();fs.rmSync(profile,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;server.close();});
