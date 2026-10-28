#!/usr/bin/env python3
"""Local DOM smoke test for the real tc_popup correction flow.

The test uses about:blank because the automation browser blocks all navigations.
ONLY the in-memory test source relaxes the QTI origin assertion to accept a
synthetic file:///cdn_proxy/... URL; the shipping content.js is unchanged.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "tests/browser-textcorrection.html").read_text()
CONTENT = (ROOT / "adapters/ngl.js").read_text()
assert 'if(url.origin!==location.origin ||' in CONTENT
CONTENT = CONTENT.replace('if(url.origin!==location.origin ||',
                          'if(false && url.origin!==location.origin ||', 1)
HTML = HTML.replace('<script src="../qti.js"></script>',
                    '<script>\n' + (ROOT / "qti.js").read_text() + '\n</script>')
HTML = HTML.replace('<script src="../adapters/ngl.js"></script>',
                    '<script>\n' + CONTENT + '\n</script>')
for module in ['core/site-registry.js', 'solvers/interactions.js', 'solvers/sequence.js',
               'solvers/text-correction.js', 'answer-sources/embedded-qti.js', 'core/runtime.js',
               'adapters/generic.js', 'content.js']:
    HTML = HTML.replace('<script src="../' + module + '"></script>',
                        '<script>\n' + (ROOT / module).read_text() + '\n</script>')
HTML = HTML.replace("marker.src='/cdn_proxy/fixture/data.js'",
                    "marker.src='file:///cdn_proxy/fixture/data.js'")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                args=['--no-sandbox', '--disable-dev-shm-usage'])
    for missing_ok in (False, True):
        page = browser.new_page()
        if missing_ok:
            page.evaluate('window.mockNoOK=true')
        page.set_content(HTML, wait_until='domcontentloaded', timeout=12000)
        page.wait_for_selector('#test-result, #test-error', timeout=12000)
        selector = '#test-result' if page.locator('#test-result').count() else '#test-error'
        assert selector == '#test-result', page.locator(selector).text_content()
        result = json.loads(page.locator(selector).text_content())
        assert result['qti'] == 'complete', result
        if not missing_ok:
            assert result['apply'][0]['status'] == 'filled', result
            assert result['done'] == 5, result
            assert result['again'][0]['status'] == 'filled', result
            assert result['tokens'] == ['Surname', 'Date', 'Gender', 'Country', 'occupation'], result
            assert result['tokensAfter'] == result['tokens'], result
        else:
            assert result['apply'][0]['status'] == 'uncertain', result
            assert result['done'] == 0, result
            assert result['tokens'] == ['Title', 'Occupation', 'Nationality', 'Language', 'qualifications'], result
        page.close()
    browser.close()
print('Spark tc_popup real-UI simulation: 2/2 cases passed')
