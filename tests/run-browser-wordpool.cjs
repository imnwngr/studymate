// Dependency-free browser check of the real content-script message path.
// Synthetic widget only; this does not verify the authenticated Spark website.
const {createServer}=require('node:http');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const browser=process.env.SPARK_BROWSER || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium'
].find(p=>fs.existsSync(p));
if(!browser)throw Error('Set SPARK_BROWSER to an installed Chromium browser executable.');
const base=fs.readFileSync(path.join(__dirname,'browser-wordpool.html'),'utf8')
  .replace(/(<li class="om-text-gap__pool-item"[^>]*>)([\s\S]*?)(<\/li>)/g,
    (_,open,card,close)=>open+'<div class="width-measure" style="visibility:hidden;display:none">'+card+
      '</div><div class="om-text-gap__droppable">'+card+'</div>'+close)
  .replace("widget.querySelectorAll('.om-text-gap__draggable-handle')[index]","[...widget.querySelectorAll('.om-text-gap__draggable-handle')].filter(h=>!h.closest('.width-measure'))[index]")
  .replace("widget.querySelectorAll('.om-text-gap__droppable')[0]","widget.querySelectorAll('.om-text-gap__target-item .om-text-gap__droppable')[0]");
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/tests/browser-wordpool.html'){
    let html=base.replace('1d | Real life | 1</h1>',`${url.searchParams.get('title')}</h1>`);
    const mode=url.searchParams.get('mode');
    if(url.searchParams.has('missingTotal'))html=html.replace(/Gap ([123]) of 3/g,'Gap $1 of .');
    if(mode)html=html.replace('if(window.prefillMode){',`window.prefillMode=${JSON.stringify(mode)}; if(window.prefillMode){`);
    if(url.searchParams.has('rerender')){
      html=html.replace("actions.push(['select',handle.textContent]);return;",
        "actions.push(['select',handle.textContent]); widget.querySelectorAll('.om-text-gap__target-item').forEach(g=>{ const next=g.cloneNode(true); const occupant=g.querySelector('.om-text-gap__draggable'); if(occupant){ next.querySelector('.om-text-gap__draggable')?.remove(); next.querySelector('.om-text-gap__droppable').appendChild(occupant); } g.replaceWith(next); }); return;");
    }
    res.setHeader('Content-Type','text/html');res.end(html);
  }else if(["/qti.js","/core/site-registry.js","/solvers/interactions.js","/solvers/sequence.js","/solvers/text-correction.js","/answer-sources/embedded-qti.js","/core/runtime.js","/adapters/ngl.js","/adapters/generic.js","/content.js"].includes(url.pathname)){
    res.setHeader('Content-Type','application/javascript');
    res.end(fs.readFileSync(path.join(root,url.pathname.slice(1))));
  }else{res.statusCode=404;res.end();}
});
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let passed=0;
  try{
    for(const [title,mode,rerender,missingTotal] of [
      ['1d | Real life | 1','',false],['1e | Writing skill | 2','',false],
      ['1d | Real life | 1','correct',false],['1e | Writing skill | 2','wrong',false],
      ['1e | Writing skill | 2','swap',false],
      ['1e | Writing skill | 2','cycle',false],
      ['1e | Writing skill | 2','mixed',false],
      ['1e | Writing skill | 2','allCorrect',false],
      ['1d | Real life | 1','',true],
      ['1d | Real life | 1','',false,true],['1e | Writing skill | 2','',false,true]
    ]){
      const profile=fs.mkdtempSync(path.join(os.tmpdir(),'spark-wordpool-browser-'));
      const url=`http://127.0.0.1:${server.address().port}/tests/browser-wordpool.html?`+
        new URLSearchParams({title,mode,...(rerender?{rerender:'1'}:{}),...(missingTotal?{missingTotal:'1'}:{})});
      try{
        const output=await new Promise((resolve,reject)=>{
          const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run',
            '--no-default-browser-check',`--user-data-dir=${profile}`,
            '--virtual-time-budget=10000','--dump-dom',url]);
          let stdout='',stderr='';
          const timer=setTimeout(()=>{child.kill();reject(Error('Browser timed out after 30 seconds'));},30000);
          child.stdout.on('data',data=>stdout+=data);
          child.stderr.on('data',data=>stderr+=data);
          child.on('error',error=>{clearTimeout(timer);reject(error);});
          child.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(Error(`Browser exit ${code}: ${stderr}`));});
        });
        const match=output.match(/<pre id="test-result">([\s\S]*?)<\/pre>/);
        assert.ok(match,`No result: ${output.slice(-3000)}`);
        const result=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&'));
        assert.equal(result.qti,'complete');
        assert.equal(result.scan[0].kind,'gapWordPool');
        assert.equal(result.apply[0].status,'filled',JSON.stringify(result.apply));
        assert.deepEqual(result.current,['How do you feel','Have you got','Try drinking']);
        const expectedReturns=mode==='cycle'||mode==='allCorrect'?3:
          (mode==='swap'||mode==='mixed')?2:(mode==='wrong'||mode==='correct')?1:0;
        const first=result.firstSolveActions,second=result.secondSolveActions;
        assert.equal(first.filter(action=>action[0]==='return').length,expectedReturns);
        assert.equal(first.filter(action=>action[0]==='place').length,3);
        if(expectedReturns)assert.ok(first.findLastIndex(a=>a[0]==='return')<first.findIndex(a=>a[0]==='place'),'first Solve must finish reset before refill');
        assert.equal(result.secondQti,'complete');
        assert.equal(result.secondApply[0].status,'filled',JSON.stringify(result.secondApply));
        assert.equal(second.filter(action=>action[0]==='return').length,3);
        assert.equal(second.filter(action=>action[0]==='place').length,3);
        assert.ok(second.findLastIndex(a=>a[0]==='return')<second.findIndex(a=>a[0]==='place'),'second Solve must finish reset before refill');
        assert.deepEqual(result.secondCurrent,['How do you feel','Have you got','Try drinking']);
        console.log(JSON.stringify({title,mode,rerender,status:result.apply[0].status,current:result.secondCurrent,firstReturns:expectedReturns,secondReturns:3}));
        passed++;
      }finally{
        // Only this harness's newly created temporary profile is removed.
        fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
      }
    }
    console.log(`Synthetic browser integration: ${passed}/11 PASS (${browser})`);
  }finally{server.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
