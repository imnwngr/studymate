from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
script=(root/'inspector-content.js').read_text()
html='''<!doctype html><html><body>
<div class="interaction is-radiobutton" id="radio-question"><p>Choose a word</p><div role="radiogroup"><label><input type="radio" name="r" value="alpha">Alpha</label><label><input type="radio" name="r" value="beta">Beta</label></div></div>
<div class="interaction is-dropdown" id="dropdown-question"><p>Choose a number</p><select><option value="">Choose</option><option value="one">One</option><option value="two">Two</option></select></div>
<div class="interaction ic-text-entry" id="text-question"><p>Write a word</p><input type="text" /></div>
<div class="interaction ic-text-correction" id="correction"><span class="input-text" data-model-id="A1">Title</span></div>
<input id="secret" type="password" value="SECRET_TEST_PASSWORD" />
<script>window.chrome={runtime:{onMessage:{addListener(fn){window.inspectorMessage=fn;}}}};</script>
</body></html>'''.replace('<\\/script>','</script>')

def send(page,kind):
 return page.evaluate('kind=>new Promise(resolve=>window.inspectorMessage({type:kind}, {}, resolve))',kind)
with sync_playwright() as p:
 executable=os.environ.get('SPARK_BROWSER') or shutil.which('chromium') or 'C:/Program Files/Google/Chrome/Application/chrome.exe'
 browser=p.chromium.launch(headless=True,executable_path=executable,args=['--no-sandbox'])
 page=browser.new_page()
 page.set_content(html)
 page.evaluate(script)
 probe=send(page,'SPARK_INSPECT_PROBE')
 assert probe['result']['interactionCount']==4,probe
 assert set(probe['result']['interactionTypes'])=={'is-radiobutton','is-dropdown','ic-text-entry','ic-text-correction'},probe
 assert send(page,'SPARK_INSPECT_TRACE_START')['ok']
 page.locator('input[type="radio"][value="beta"]').check()
 page.locator('select').select_option('two')
 page.locator('#text-question input').fill('example')
 page.locator('#correction span').click()
 page.wait_for_timeout(350)
 assert send(page,'SPARK_INSPECT_TRACE_STOP')['ok']
 result=send(page,'SPARK_INSPECT_TRACE_GET')['result']
 print('events',result['eventCount'],'truncated',result['truncated'])
 assert not result['truncated'],result
 types={e['type'] for e in result['events']}
 assert {'click','input','change','initial','final'}<=types,types
 dump=str(result)
 assert 'SECRET_TEST_PASSWORD' not in dump, 'Password leaked!'
 assert 'example' not in dump, 'Typed value leaked!'
 assert 'two' in dump and 'beta' in dump,'No choice state'
 capture=send(page,'SPARK_INSPECT_CAPTURE')['result']
 assert capture['summary']['interactionCount']==4,capture
 print('Inspector browser simulation: radio, dropdown, input and correction passed')
 browser.close()
