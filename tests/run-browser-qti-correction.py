from pathlib import Path
from playwright.sync_api import sync_playwright
base=Path(__file__).resolve().parent
root=base.parent
source=(base/'browser-textcorrection-qti.html').read_text()
content=(root/'adapters/ngl.js').read_text().replace('if(url.origin!==location.origin ||','if(false && url.origin!==location.origin ||',1)
source=source.replace('<script src="../qti.js"></script>', '<script>'+ (root/'qti.js').read_text()+'</script>')
source=source.replace('<script src="../adapters/ngl.js"></script>', '<script>'+content+'</script>')
for module in ['core/site-registry.js', 'solvers/interactions.js', 'solvers/sequence.js',
               'solvers/text-correction.js', 'answer-sources/embedded-qti.js', 'core/runtime.js',
               'adapters/generic.js', 'content.js']:
    source=source.replace('<script src="../'+module+'"></script>', '<script>'+(root/module).read_text()+'</script>')
source=source.replace("marker.src='/cdn_proxy/fixture/data.js'","marker.src='file:///cdn_proxy/fixture/data.js'")
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for scenario in ['fresh','corrupt','solved','unknown-unmodified','fixed-changed']:
        page=browser.new_page()
        page.set_content(source.replace("window.mockScenario=new URLSearchParams(location.search).get('scenario')||'fresh'","window.mockScenario='"+scenario+"'"), wait_until='domcontentloaded')
        page.wait_for_selector('#test-result,#test-error',timeout=15000)
        result=page.evaluate('window.mockResult || window.mockError')
        assert isinstance(result,dict),result
        print('CASE',scenario,'reason',result['reason'],'apply',result['apply'],'done',result['done'],'second',result['secondReason'])
        if scenario in ('unknown-unmodified','fixed-changed'):
            assert result['reason']!='complete',result
            assert result['done']==0,result
        else:
            assert result['reason']=='complete',result
            assert result['apply'][0]['status']=='filled',result
            assert result['finalTokens'][26]=='occupation',result
            assert result['finalTokens'][13]=='Date',result
            assert result['again'][0]['status']=='filled',result
            assert result['tokens']==result['finalTokens'],result
            assert result['done']==(5 if scenario=='fresh' else 1 if scenario=='corrupt' else 0),result
            assert result['corrections'][0]['tokenIndex']==3,result
            assert result['corrections'][4]['tokenIndex']==26,result
        page.close()
    browser.close()
print('QTI correction browser scenarios passed')
