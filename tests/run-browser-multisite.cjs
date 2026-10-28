'use strict';
const {createServer}=require('node:http'),{spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const browser=process.env.SPARK_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!browser)throw Error('Set SPARK_BROWSER to an installed Chromium browser.');
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'text/plain');
  let body=fs.readFileSync(file,'utf8');
  if(url.pathname==='/tests/browser-textcorrection.html'&&url.searchParams.has('noOK'))body=body.replace('let done=0;','window.mockNoOK=true;let done=0;');
  res.end(body);
});
async function page(url){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'spark-multisite-'));
  try{
    return await new Promise((resolve,reject)=>{
      const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--virtual-time-budget=45000','--dump-dom',url],{windowsHide:true});
      let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('Browser timeout'));},60000);
      child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
      child.on('error',error=>{clearTimeout(timer);reject(error);});
      child.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(Error(stderr.slice(-2000)));});
    });
  }finally{fs.rmSync(profile,{recursive:true,force:true});}
}
function result(html,id='test-result'){
  const decode=s=>s.replace(/&quot;/g,'"').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&');
  const error=html.match(/<pre id="(?:test-error|error)">([\s\S]*?)<\/pre>/);if(error)throw Error(decode(error[1]));
  const match=html.match(new RegExp('<pre id="'+id+'">([\\s\\S]*?)<\\/pre>'));
  assert.ok(match,'Missing result: '+html.slice(-1500));return JSON.parse(decode(match[1]));
}
async function main(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const generic=result(await page(base+'/tests/browser-multisite.html'));
    assert.equal(generic.passed,25);console.log('Chrome generic multi-site: '+generic.passed+'/25 PASS');generic.cases.forEach(c=>console.log('PASS '+c));
    const choices=result(await page(base+'/tests/browser-adapters.html'));
    assert.ok(choices.apply.every(r=>r.status==='filled'));assert.ok(choices.stale.every(r=>r.status==='skipped'));console.log('Chrome NGL radio/multi/stale screen: PASS');
    for(const missing of [false,true]){
      const correction=result(await page(base+'/tests/browser-textcorrection.html'+(missing?'?noOK=1':'')));
      assert.equal(correction.apply[0].status,missing?'uncertain':'filled');if(!missing)assert.equal(correction.again[0].status,'filled');console.log('Chrome correction editor '+(missing?'missing OK':'normal/repeat')+': PASS');
    }
    for(const scenario of ['fresh','corrupt','solved','unknown-unmodified','fixed-changed']){
      const r=result(await page(base+'/tests/browser-textcorrection-qti.html?scenario='+scenario));
      if(['unknown-unmodified','fixed-changed'].includes(scenario))assert.notEqual(r.reason,'complete');
      else{assert.equal(r.reason,'complete');assert.equal(r.apply[0].status,'filled');assert.equal(r.again[0].status,'filled');}
      console.log('Chrome correction QTI '+scenario+': PASS');
    }
    const copy=result(await page(base+'/tests/browser-copy.html'),'result');assert.equal(copy.ok,true);assert.ok(copy.result.text);assert.doesNotMatch(copy.result.text,/hidden-student-input|Do not copy this hidden screen/);console.log('Chrome exercise copy and privacy: PASS');
  }finally{server.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;server.close();});
