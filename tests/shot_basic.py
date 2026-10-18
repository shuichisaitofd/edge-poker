import sys, json
from playwright.sync_api import sync_playwright
W=int(sys.argv[1]) if len(sys.argv)>1 else 390
H=int(sys.argv[2]) if len(sys.argv)>2 else 844
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':W,'height':H},device_scale_factor=2,is_mobile=True,has_touch=True)
    pg=ctx.new_page()
    errs=[]
    pg.on('console', lambda m: errs.append(m.text) if m.type in('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)))
    pg.goto('http://127.0.0.1:8765/index.html?seed=11&speed=0.4')
    pg.wait_for_timeout(600)
    pg.screenshot(path=f'tests/shots/basic_{W}_idle.png')
    pg.tap('#deck')
    pg.wait_for_function("window.__kabu.snapshot().stage==='pick'", timeout=15000)
    pg.wait_for_timeout(300)
    pg.screenshot(path=f'tests/shots/basic_{W}_pick.png')
    pg.tap('.lane[data-lane="1"]')
    pg.wait_for_timeout(200)
    pg.tap('.coin[data-amount="10"]')
    pg.wait_for_timeout(500)
    pg.screenshot(path=f'tests/shots/basic_{W}_bet.png')
    print(json.dumps(pg.evaluate("window.__kabu.snapshot()"))[:400])
    print('ERRS',errs)
    b.close()
