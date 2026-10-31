'use strict';
const {createServer}=require('node:http'),{spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'checkbox-inspector-fixture.json'),'utf8').replace(/^\uFEFF/,''));
const browser=process.env.SPARK_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!browser)throw Error('No installed Chromium browser found.');
const choices=Array.from({length:8},(_,i)=>'<simpleChoice identifier="C0_'+i+'">Option '+(i+1)+'</simpleChoice>').join('');
const xml='<assessmentItem><responseDeclaration identifier="R" cardinality="multiple" baseType="identifier"><correctResponse>'+fixture.syntheticQtiSelectedIds.map(id=>'<value>'+id+'</value>').join('')+'</correctResponse></responseDeclaration><itemBody><p>Select all the necessary fields.</p><choiceInteraction responseIdentifier="R" maxChoices="0">'+choices+'</choiceInteraction></itemBody></assessmentItem>';
const files=new Set(['/qti.js','/core/site-registry.js','/solvers/interactions.js','/solvers/sequence.js','/solvers/text-correction.js','/answer-sources/embedded-qti.js','/core/runtime.js','/adapters/ngl.js','/adapters/generic.js','/content.js','/text-writing.js','/tests/browser-checkbox-inspector.html']);
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(pathname==='/tests/checkbox-inspector-fixture.js'){res.setHeader('Content-Type','application/javascript');res.end('window.checkboxFixture='+JSON.stringify(fixture)+';');return;}
  if(pathname==='/cdn_proxy/'+fixture.interactiveId+'/data.js'){res.setHeader('Content-Type','application/javascript');res.end('window.exerciseData='+JSON.stringify({'synthetic-checkbox.xml':xml})+';');return;}
  if(files.has(pathname)){res.setHeader('Content-Type',pathname.endsWith('.html')?'text/html':'application/javascript');res.end(fs.readFileSync(path.join(root,pathname.slice(1))));return;}
  res.statusCode=404;res.end();
});
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const tempRoot=fs.realpathSync(os.tmpdir());const profile=fs.mkdtempSync(path.join(tempRoot,'studymate-checkbox-'));
  try{
    const output=await new Promise((resolve,reject)=>{
      const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--user-data-dir='+profile,'--virtual-time-budget=30000','--dump-dom','http://127.0.0.1:'+server.address().port+'/tests/browser-checkbox-inspector.html'],{windowsHide:true});
      let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('Checkbox fixture browser timed out'));},45000);
      child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
      child.on('error',error=>{clearTimeout(timer);reject(error)});child.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(Error('Chromium exited '+code+': '+stderr.slice(-1000)))});
    });
    const decode=value=>value.replace(/&quot;/g,'"').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&');
    const failure=output.match(/<pre id="test-error">([\s\S]*?)<\/pre>/);if(failure)throw Error(decode(failure[1]));
    const match=output.match(/<pre id="test-result">([\s\S]*?)<\/pre>/);assert.ok(match,'Browser fixture did not finish');
    const result=JSON.parse(decode(match[1]));assert.equal(result.passed,19);console.log('Checkbox Inspector fixture: '+result.passed+'/19 PASS');result.cases.forEach(name=>console.log('PASS '+name));
  }finally{
    server.close();const resolved=fs.realpathSync(profile);if(path.dirname(resolved)!==tempRoot||!path.basename(resolved).startsWith('studymate-checkbox-'))throw Error('Unexpected temporary profile location');
    fs.rmSync(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:200});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;server.close()});
