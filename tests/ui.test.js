'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const popup=read('popup.html');
const options=read('options.html');
const css=read('styles.css');

test('popup retains all functional controls and status regions',()=>{
  for(const id of ['submitNext','scan','auto','settings','status','emptyState','results','questions','copy','fillReport','title','count']){
    assert.match(popup,new RegExp(`id="${id}"`),`Missing popup node #${id}`);
  }
  assert.match(popup,/aria-live="polite"/);
  assert.match(popup,/<details|id="questions"/);
});
test('compact popup has one solve and fill action and a complete-exercise copy',()=>{
  assert.match(popup,/id="auto"/);
  assert.match(popup,/id="copy"/);
  assert.match(popup,/id="submitNext"/);
  assert.doesNotMatch(popup,/id="solve"|id="apply"/);
  const script=read('popup.js');
  assert.match(script,/SPARK_COPY_PROMPT/);
  assert.doesNotMatch(script,/\$\('solve'\)|\$\('apply'\)/);
  assert.match(read('adapters/ngl.js'),/function copyPrompt\(/);
  assert.match(read('adapters/ngl.js'),/SPARK_COPY_PROMPT/);
});
test('options retains all provider settings fields used by JS',()=>{
  for(const id of ['uiLanguage','uiTheme','autoNext','activeProfile','profilesList','profileEditor','profileName','provider','endpoint','model','apiKey','responseFormat','enabled','toggleKey','removeProfile','newProvider','addProfile','save','message']){
    assert.match(options,new RegExp(`id="${id}"`),`Missing settings field #${id}`);
  }
});
test('solution modes remain semantic, keyboard-accessible radios',()=>{
  for(const mode of ['offline','single','compare'])assert.match(options,new RegExp(`<input[^>]*name="aiMode"[^>]*value="${mode}"`));
  assert.match(options,/<fieldset[^>]*id="aiModeChoices"/);
});
test('no remote UI runtime, fonts, or inline JS event handlers',()=>{
  for(const html of [popup,options]){
    assert.doesNotMatch(html,/<script[^>]+src="https?:/i);
    assert.doesNotMatch(html,/<link[^>]+href="https?:/i);
    assert.doesNotMatch(html,/\son(?:click|change|input|load)\s*=/i);
  }
});
test('design supports system theme, reduced motion and compact popup',()=>{
  assert.match(css,/prefers-color-scheme:dark/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/body\.popup\s*\{[\s\S]*?width:388px/);
  assert.match(css,/\.popup\.has-results \.welcome-panel/);
});
test('popup sizing does not depend on its initial viewport width',()=>{
  assert.match(popup,/<html[^>]*class="popup-document"/);
  const themeCss=read('themes.css');
  const htmlRule=themeCss.match(/html\.popup-document\s*\{([^}]+)\}/)?.[1]||'';
  const bodyRule=themeCss.match(/html body\.popup\s*\{([^}]+)\}/)?.[1]||'';
  assert.match(htmlRule,/min-width:0/);
  assert.match(htmlRule,/max-width:100%/);
  assert.match(bodyRule,/min-width:0/);
  assert.doesNotMatch(bodyRule,/100vw|100vh/);
  assert.match(bodyRule,/max-height:640px/);
});
test('design version matches the extension manifest',()=>{
  const manifest=JSON.parse(read('manifest.json'));
  assert.equal(manifest.version,'0.7.16');
  assert.match(options,/data-i18n="version"/);
});

test('all four UI languages and three themes are available',()=>{
  const ui=read('i18n.js');
  for(const locale of ['en','vi','zh-CN','zh-TW']){
    assert.match(options,new RegExp(`value="${locale}"`));
    assert.ok(ui.includes(locale));
  }
  for(const theme of ['system','light','dark']) assert.match(options,new RegExp(`value="${theme}"`));
  assert.match(css,/html\[data-theme="dark"\]/);
  assert.match(css,/html\[data-theme="light"\]/);
  const manifest=JSON.parse(read('manifest.json'));
  assert.equal(manifest.default_locale,'en');
  for(const locale of ['en','vi','zh_CN','zh_TW']){
    const messages=JSON.parse(read(`_locales/${locale}/messages.json`));
    assert.ok(messages.extName?.message && messages.extDescription?.message);
  }
});
test('submission is opt-in, guarded and uses only known Spark controls',()=>{
  const script=read('adapters/ngl.js');
  assert.match(script,/SPARK_SUBMIT_NEXT/);
  assert.match(script,/lastScan\.applied\.size!==expected/);
  assert.match(script,/availableActionControls\('check'\)/);
  assert.match(script,/availableActionControls\('submit'\)/);
  assert.match(script,/availableActionControls\('forward_lo'\)/);
  assert.match(script,/control\.isConnected/);
  assert.doesNotMatch(script,/querySelector\('button\[type=submit\]'/);
  const popupScript=read('popup.js');
  assert.doesNotMatch(popupScript,/confirm\(t\('submitAsk'\)\)/); 
  assert.match(popupScript,/state\.lastApplyVerified/);
  assert.match(popup,/<button[^>]*id="submitNext"[^>]*disabled/);
});
test('both English and Vietnamese README files and DOM discovery guide exist',()=>{
  for(const file of ['README.md','README.vi.md','docs/AUTOMATION_DISCOVERY.md','docs/UI_DESIGN.md']){
    assert.ok(fs.existsSync(path.join(root,file)));
  }
  assert.match(read('README.md'),/README\.vi\.md/);
  assert.match(read('README.vi.md'),/README\.md/);
});

test('v0.7.5 passes trusted ordered QTI tokens to sequence adapter and submits directly',()=>{
 const p=read('popup.js');
 assert.match(p,/orderedTokens:a\.orderedTokens/);
 assert.doesNotMatch(p,/confirm\(t\('submitAsk'\)\)/);
 assert.match(read('popup.html'),/>Solve<\/span>/);
 assert.match(read('popup.html'),/>Done &amp; next<\/span>/);
});

test('v0.7.6 finishes long sequences in one Solve click with bounded settling and retry',()=>{
 const script=read('solvers/sequence.js');
 assert.match(script,/async function waitForSequenceStep\(/);
 assert.match(script,/Date\.now\(\)\+1800/);
 assert.match(script,/attempts\+\+>=2/);
 assert.match(script,/while\(normalized\(tileText\(stable\(\)\[i\]\)\)\!==normalized\(desired\[i\]\)\)/);
 assert.doesNotMatch(script,/list\.appendChild\(|list\.insertBefore\(/);
});
