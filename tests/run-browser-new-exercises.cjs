'use strict';
const {createServer}=require('node:http');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const browser=process.env.SPARK_BROWSER||[
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium'
].find(p=>fs.existsSync(p));
if(!browser)throw Error('No Chromium browser found. Configure SPARK_BROWSER.');
const choices=['Alpha','Beta','Gamma'];
const checkbox=`<assessmentItem><responseDeclaration identifier="R" cardinality="multiple" baseType="identifier"><correctResponse><value>C0_0</value><value>C0_2</value></correctResponse></responseDeclaration><itemBody><p>Select all the necessary fields.</p><choiceInteraction responseIdentifier="R" maxChoices="0">${choices.map((v,i)=>`<simpleChoice identifier="C0_${i}">${v}</simpleChoice>`).join('')}</choiceInteraction></itemBody></assessmentItem>`;
const association=`<assessmentItem><responseDeclaration identifier="R" cardinality="multiple" baseType="directedPair"><correctResponse><value>S0 T0</value></correctResponse></responseDeclaration><itemBody><associateInteraction responseIdentifier="R"><simpleAssociableChoice identifier="S0">one</simpleAssociableChoice><simpleAssociableChoice identifier="T0">two</simpleAssociableChoice></associateInteraction></itemBody></assessmentItem>`;
const body=`window.exerciseData={"checkbox.xml":${JSON.stringify(checkbox)},"linking.xml":${JSON.stringify(association)}};`;
const server=createServer((req,res)=>{
  const filename=new URL(req.url,'http://localhost').pathname;
  if(filename==='/cdn_proxy/synthetic/data.js'){
    res.setHeader('Content-Type','application/javascript');res.end(body);return;
  }
  if(["/qti.js","/core/site-registry.js","/solvers/interactions.js","/solvers/sequence.js","/solvers/text-correction.js","/answer-sources/embedded-qti.js","/core/runtime.js","/adapters/ngl.js","/adapters/generic.js","/content.js",'/tests/browser-new-exercises.html'].includes(filename)){
    res.setHeader('Content-Type',filename.endsWith('.html')?'text/html':'application/javascript');
    res.end(fs.readFileSync(path.join(root,filename.slice(1))));return;
  }
  res.statusCode=404;res.end();
});
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'spark-new-exercises-'));
  try{
    const url=`http://127.0.0.1:${server.address().port}/tests/browser-new-exercises.html`;
    const output=await new Promise((resolve,reject)=>{
      const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run',
        '--no-default-browser-check',`--user-data-dir=${profile}`,'--virtual-time-budget=30000','--dump-dom',url]);
      let stdout='',stderr='';
      const timer=setTimeout(()=>{child.kill();reject(Error('Synthetic Chrome tests timed out'));},45000);
      child.stdout.on('data',data=>stdout+=data);
      child.stderr.on('data',data=>stderr+=data);
      child.on('error',err=>{clearTimeout(timer);reject(err);});
      child.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(Error(`Chrome ${code}: ${stderr.slice(-2500)}`));});
    });
    const decode=text=>text.replace(/&quot;/g,'"').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&');
    const error=output.match(/<pre id="test-error">([\s\S]*?)<\/pre>/);
    if(error)throw Error(decode(error[1]));
    const match=output.match(/<pre id="test-result">([\s\S]*?)<\/pre>/);
    assert.ok(match,`Chrome did not finish: ${output.slice(-2200)}`);
    const result=JSON.parse(decode(match[1]));
    assert.equal(result.passed,20);
    console.log(`Chrome synthetic new-exercise cases: ${result.passed}/20 passed`);
    result.cases.forEach(name=>console.log(`PASS ${name}`));
  }finally{
    server.close();fs.rmSync(profile,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;server.close();});
