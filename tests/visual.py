#!/usr/bin/env python3
"""スクリーンショット比較。固定seedで主要4場面を撮り、tests/baseline/ と平均画素差で比較する。
  python3 tests/visual.py --update   基準画像を作り直す
  python3 tests/visual.py            比較(平均差が閾値を超えたら FAIL)
"""
import os, sys, io
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops, ImageStat
HERE = os.path.dirname(os.path.abspath(__file__)); BASE = os.path.join(HERE, 'baseline'); OUT = os.path.join(HERE, 'shots', 'visual')
os.makedirs(BASE, exist_ok=True); os.makedirs(OUT, exist_ok=True)
update = '--update' in sys.argv
THRESH = 1.5  # 0-255 の平均差
def stage(pg, s): pg.wait_for_function(f"window.__kabu.snapshot().stage==='{s}'", timeout=40000)
fails = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for (w, h) in ((390, 844), (320, 568)):
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); pg.goto('http://127.0.0.1:8765/index.html?seed=11&speed=0.3'); pg.wait_for_selector('#deck')
        pg.evaluate('window.__kabu.stack([3,11,5,6,8, 9,14,2,7,10])')
        shots = {}
        def grab(name): pg.wait_for_timeout(700); shots[f'{name}_{w}'] = pg.screenshot()
        pg.tap('#deck'); stage(pg, 'pick'); grab('pick')
        pg.tap('.lane[data-lane="1"]'); pg.tap('.coin[data-amount="100"]'); grab('bet')
        pg.tap('#slotBtn'); stage(pg, 'decide'); grab('decide')
        pg.tap('#standBtn'); stage(pg, 'result'); pg.wait_for_timeout(2200); grab('result')
        for name, png in shots.items():
            cur = Image.open(io.BytesIO(png)).convert('RGB'); cur.save(os.path.join(OUT, name + '.png'))
            bp = os.path.join(BASE, name + '.png')
            if update or not os.path.exists(bp):
                cur.save(bp); print('BASELINE', name); continue
            d = ImageStat.Stat(ImageChops.difference(cur, Image.open(bp).convert('RGB'))).mean
            m = sum(d) / 3; ok = m <= THRESH
            print(('PASS ' if ok else 'FAIL ') + f'visual {name} diff={m:.2f}'); fails += (not ok)
        ctx.close()
    b.close()
sys.exit(1 if fails else 0)
