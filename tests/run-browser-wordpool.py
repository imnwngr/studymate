#!/usr/bin/env python3
"""Exercise extension scripts on a local, synthetic Spark two-click word-pool widget."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'tests/browser-wordpool.html').read_text()
CONTENT=(ROOT/'adapters/ngl.js').read_text()
assert 'if(url.origin!==location.origin ||' in CONTENT
CONTENT=CONTENT.replace('if(url.origin!==location.origin ||','if(false && url.origin!==location.origin ||',1)
HTML=HTML.replace('<script src="../qti.js"></script>','<script>\n'+(ROOT/'qti.js').read_text()+'\n</script>')
HTML=HTML.replace('<script src="../adapters/ngl.js"></script>','<script>\n'+CONTENT+'\n</script>')
for module in ['core/site-registry.js', 'solvers/interactions.js', 'solvers/sequence.js',
               'solvers/text-correction.js', 'answer-sources/embedded-qti.js', 'core/runtime.js',
               'adapters/generic.js', 'content.js']:
 HTML=HTML.replace('<script src="../'+module+'"></script>','<script>\n'+(ROOT/module).read_text()+'\n</script>')
HTML=HTML.replace("marker.src='/cdn_proxy/test/data.js'","marker.src='file:///cdn_proxy/test/data.js'")
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for title,mode in [('1d | Real life | 1',''),('1e | Writing skill | 2',''),
                    ('1d | Real life | 1','correct'),('1e | Writing skill | 2','wrong')]:
  page=browser.new_page()
  doc=HTML.replace('1d | Real life | 1</h1>',title+'</h1>')
  if mode:doc=doc.replace('if(window.prefillMode){',f"window.prefillMode='{mode}'; if(window.prefillMode){{")
  page.set_content(doc,wait_until='domcontentloaded',timeout=20000)
  page.wait_for_selector('#test-result,#test-error',timeout=20000)
  if page.locator('#test-error').count():raise AssertionError(page.locator('#test-error').inner_text())
  out=json.loads(page.locator('#test-result').inner_text())
  print(title,mode, {k:v for k,v in out.items() if k not in ['qtiDetails','debug']})
  assert out['scan'][0]['kind']=='gapWordPool',out
  assert out['qti']=='complete',out
  assert out['qti']=='complete',out
  if mode=='wrong':
   assert out['apply'][0]['status']=='uncertain',out
   assert out['current'][0]=='Try drinking',out
   assert len(out['actions'])==2,out
  else:
   assert out['apply'][0]['status']=='filled',out
   assert out['current']==['How do you feel','Have you got','Try drinking'],out
   assert len(out['actions'])==6,out
   assert out['againScan']==['gapWordPool'] and out['secondQti']=='complete',out
   assert out['secondApply'][0]['status']=='filled',out
   assert len(out['actions'])==6,out
  page.close()
 browser.close()
print('Spark two-click word-pool UI: 4/4 passed')
