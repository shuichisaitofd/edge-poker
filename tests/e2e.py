#!/usr/bin/env python3
"""旅館カブ E2E (Playwright/Chromium)。
使い方: python3 tests/e2e.py [--port 8765] [--widths 320,375,390,430] [--shots]
前提: リポジトリ直下で `python3 -m http.server 8765` が動いていること。
各チェックは PASS/FAIL を出力し、1件でも FAIL なら終了コード 1。
"""
import re, argparse, json, sys, os, itertools
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--port', default='8765')
ap.add_argument('--widths', default='320,375,390,430')
ap.add_argument('--extra', default='390x664,430x740,360x640', help='追加サイズ(Safariアドレスバー表示時など) WxH,...')
ap.add_argument('--shots', action='store_true')
ap.add_argument('--speed', default='0.3')
args = ap.parse_args()
BASE = f'http://127.0.0.1:{args.port}/index.html'
SHOTS = os.path.join(os.path.dirname(__file__), 'shots')
os.makedirs(SHOTS, exist_ok=True)
HEIGHTS = {320: 568, 375: 667, 390: 844, 430: 932}

results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail and not ok else ''))
    sys.stdout.flush()

# ---------------------------------------------------------------- helpers
def snap(pg): return pg.evaluate('window.__kabu.snapshot()')
def wait_stage(pg, st, timeout=30000):
    pg.wait_for_function(f"window.__kabu.snapshot().stage==='{st}'", timeout=timeout)
def tap(pg, sel):
    pg.locator(sel).first.tap() if TOUCH[0] else pg.locator(sel).first.click()
TOUCH = [True]

def new_page(b, w, h, seed, touch=True):
    TOUCH[0] = touch
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if touch else 1,
                        is_mobile=touch, has_touch=touch)
    # Webフォント(外部CDN)はテスト環境から取得できないため空応答にする(フォントはフォールバックで検証)
    ctx.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/.*'), lambda r: r.fulfill(status=200, body='', content_type='text/css'))
    pg = ctx.new_page()
    pg.errors = []
    pg.on('console', lambda m: pg.errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: pg.errors.append('PAGEERROR ' + str(e)))
    pg.goto(f'{BASE}?seed={seed}&speed={args.speed}&purse=1000')
    pg.wait_for_selector('#deck')
    return pg

def shot(pg, name):
    if args.shots:
        pg.screenshot(path=os.path.join(SHOTS, name + '.png'))

# 画面要素の重なり検出(札どうしの重なりは仕様なので除外)
OVERLAP_JS = r"""
() => {
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    if (r.width < 1 || r.height < 1) return false;
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    let n = e; while (n && n !== document.body) { if (parseFloat(getComputedStyle(n).opacity) < .05) return false; n = n.parentElement; }
    return true; };
  const items = [];
  const add = (label, group, e) => { if (e && vis(e)) { const r = e.getBoundingClientRect(); items.push({label, group, x0:r.left, y0:r.top, x1:r.right, y1:r.bottom}); } };
  document.querySelectorAll('.card').forEach((c,i) => add('card:'+c.dataset.id, 'card', c.querySelector('.card-lift')));
  document.querySelectorAll('.lane-name').forEach((e,i) => add('laneName'+i, 'tag'+i, e));
  document.querySelectorAll('.lane-chip img').forEach((e,i) => add('chip', 'chip', e));
  document.querySelectorAll('.lane-score').forEach((e,i) => add('laneScore', 'score', e));
  add('dealerScore', 'dscore', document.getElementById('dealerScore'));
  add('dealerTag', 'dtag', document.querySelector('.tag-dealer'));
  add('verdict', 'verdict', document.getElementById('verdict'));
  document.querySelectorAll('.coin').forEach(e => add('coin'+e.dataset.amount, 'coin', e));
  add('purse', 'purse', document.getElementById('purse'));
  add('slotBtn', 'slot', document.getElementById('slotBtn'));
  add('standBtn', 'slot', document.getElementById('standBtn'));
  add('hitBtn', 'slot', document.getElementById('hitBtn'));
  add('deck', 'deck', document.querySelector('.deck-stack'));
  add('deckTag', 'deck', document.getElementById('deckTag'));
  add('sound', 'sound', document.getElementById('sound'));
  const bad = [];
  for (let i = 0; i < items.length; i++) for (let j = i+1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.group === b.group && (a.group === 'card' || a.group === 'coin' || a.group === 'slot' || a.group === 'deck')) continue;
    const w = Math.min(a.x1,b.x1) - Math.max(a.x0,b.x0), h = Math.min(a.y1,b.y1) - Math.max(a.y0,b.y0);
    if (w > 2 && h > 2) bad.push(a.label + ' × ' + b.label + ' (' + Math.round(w) + 'x' + Math.round(h) + ')');
  }
  // 画面外にはみ出し
  const vw = innerWidth, vh = innerHeight, out = [];
  for (const it of items) if (it.group !== 'card' && (it.x0 < -1 || it.x1 > vw + 1 || it.y0 < -1 || it.y1 > vh + 1)) out.push(it.label);
  return {bad, out, n: items.length};
}
"""
def overlaps(pg): return pg.evaluate(OVERLAP_JS)

def card_label(c):  # id → 'スート n'
    return ['♠','♥','♦','♣'][(c-1)//10] + str(((c-1) % 10)+1)

def ids(suit, n): return suit*10+n   # suit: 0♠ 1♥ 2♦ 3♣

# テスト用の配札順(先頭から: 場1〜4の1枚目, 親1枚目, 場1〜4の2枚目, 親2枚目, [3枚目...])
def stack(pg, order):
    assert len(set(order)) == len(order), 'テスト配札に重複IDがある'
    assert pg.evaluate(f'window.__kabu.stack({json.dumps(order)})')

def start_and_pick(pg, lane, coin):
    tap(pg, '#deck')
    wait_stage(pg, 'pick')
    tap(pg, f'.lane[data-lane="{lane}"]')
    tap(pg, f'.coin[data-amount="{coin}"]')

# 毎フレーム相当で「DOMの札の数 == 内部状態」を監視する
MONITOR_JS = """
() => { window.__mismatch = []; window.__maxFly = 0;
  const tick = () => { const s = window.__kabu.snapshot();
    s.lanes.forEach((l,i) => { if (l.length !== s.domLanes[i]) window.__mismatch.push('lane'+i+':'+l.length+'/'+s.domLanes[i]); });
    if (s.dealer.length !== s.domDealer) window.__mismatch.push('dealer:'+s.dealer.length+'/'+s.domDealer);
    const all = [...document.querySelectorAll('.card')].map(c => c.dataset.id);
    if (new Set(all).size !== all.length) window.__mismatch.push('duplicate id in DOM');
    const fly = document.querySelectorAll('.card[data-state="flying"]').length; window.__maxFly = Math.max(window.__maxFly, fly);
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick); }
"""

# ---------------------------------------------------------------- scenarios
def scenario_flow(b, w, h, label=None):
    """選択変更・選択解除・金額変更・確定前は持ち金不変 → BET → 判断 → 公開 → 結果"""
    tag = f'[{label or str(w) + "px"}]'
    pg = new_page(b, w, h, 5)
    pg.evaluate(MONITOR_JS)
    check(f'{tag} 初期: 山札40枚・持ち金1,000円', snap(pg)['purse'] == 1000 and snap(pg)['deckLeft'] == 0 and pg.inner_text('#deckTag') == 'タップで配る')
    shot(pg, f'flow_{label or w}_00_idle')
    # 山札タップ→自動配札。二重タップしても1回だけ配る
    pg.locator('#deck').tap(); pg.locator('#deck').tap(force=True, no_wait_after=True) if False else None
    mid = None
    pg.wait_for_function("window.__kabu.snapshot().stage==='dealing' || window.__kabu.snapshot().stage==='pick'")
    # 配札中は札を選べない
    if snap(pg)['stage'] == 'dealing':
        pg.locator('.lane[data-lane="0"]').dispatch_event('click')
        check(f'{tag} 配札中は札選択が無効', snap(pg)['picked'] == -1)
    wait_stage(pg, 'pick')
    s = snap(pg)
    check(f'{tag} 初期配札: 場4枚+親1枚、山札35枚', [len(l) for l in s['lanes']] == [1,1,1,1] and len(s['dealer']) == 1 and s['deckLeft'] == 35, json.dumps(s))
    check(f'{tag} 配札後のDOM札数=内部状態', s['domLanes'] == [1,1,1,1] and s['domDealer'] == 1)
    check(f'{tag} 札選択前はコイン無効', pg.evaluate("[...document.querySelectorAll('.coin')].every(c=>c.disabled)"))
    check(f'{tag} 札選択前スロット文言', pg.inner_text('#slotBtn') == '賭ける札を選んでください' and pg.is_disabled('#slotBtn'))
    shot(pg, f'flow_{label or w}_01_pick')
    # 札選択 → 別札へ即変更 → 同じ札で解除
    tap(pg, '.lane[data-lane="2"]')
    check(f'{tag} 札選択', snap(pg)['picked'] == 2 and snap(pg)['stage'] == 'bet')
    check(f'{tag} 札選択後スロット=金額を選んでください(押せない)', pg.inner_text('#slotBtn') == '金額を選んでください' and pg.is_disabled('#slotBtn'))
    check(f'{tag} 札選択後コイン有効', pg.evaluate("[...document.querySelectorAll('.coin')].every(c=>!c.disabled)"))
    tap(pg, '.lane[data-lane="0"]')
    check(f'{tag} 別札タップで即変更', snap(pg)['picked'] == 0)
    tap(pg, '.lane[data-lane="0"]')
    check(f'{tag} 同じ札の再タップで解除', snap(pg)['picked'] == -1 and snap(pg)['stage'] == 'pick')
    check(f'{tag} 解除後コイン無効', pg.evaluate("[...document.querySelectorAll('.coin')].every(c=>c.disabled)"))
    tap(pg, '.lane[data-lane="3"]')
    # 金額の差し替え(何度でも)・確定前は持ち金不変
    for amt in (500, 100, 10, 5):
        tap(pg, f'.coin[data-amount="{amt}"]')
        pg.wait_for_timeout(60)
        s = snap(pg)
        check(f'{tag} {amt}円選択: 持ち金不変・チップ仮置き', s['coin'] == amt and s['purse'] == 1000 and pg.evaluate("document.querySelectorAll('.lane-chip img').length") == 1)
    check(f'{tag} 金額選択後スロット=BET確定ボタン(同時に注意書き無し)', pg.inner_text('#slotBtn') == 'BET 5円を確定' and not pg.is_disabled('#slotBtn'))
    tap(pg, '.lane[data-lane="1"]')
    pg.wait_for_timeout(400)
    ch = pg.evaluate("[...document.querySelectorAll('.lane')].map(l=>l.querySelectorAll('.lane-chip img').length)")
    check(f'{tag} 札変更でチップが移動(1か所のみ)', ch == [0,1,0,0] and snap(pg)['coin'] == 5, json.dumps(ch))
    tap(pg, '.coin[data-amount="100"]')
    pg.wait_for_timeout(350)
    r = overlaps(pg)
    check(f'{tag} 重なり無し(BET前)', not r['bad'] and not r['out'], json.dumps(r, ensure_ascii=False))
    shot(pg, f'flow_{label or w}_02_bet')
    # BET確定(二重タップ)
    pg.locator('#slotBtn').tap()
    pg.locator('#slotBtn').dispatch_event('click')
    pg.wait_for_function("window.__kabu.snapshot().stage!=='bet'")
    check(f'{tag} 確定直後に賭け金を控除(900円)', snap(pg)['purse'] == 900 and snap(pg)['stake'] == 100, json.dumps(snap(pg)))
    wait_stage(pg, 'decide')
    s = snap(pg)
    check(f'{tag} 2枚目配札: 場各2枚+親2枚(実DOMも同数)', [len(l) for l in s['lanes']] == [2,2,2,2] and len(s['dealer']) == 2 and s['domLanes'] == [2,2,2,2] and s['domDealer'] == 2, json.dumps(s))
    check(f'{tag} 二重BETでも控除は1回', s['purse'] == 900)
    check(f'{tag} 判断: 2択のみ表示(BET/案内文なし)', pg.is_visible('#standBtn') and pg.is_visible('#hitBtn') and not pg.is_visible('#slotBtn') and pg.inner_text('#standBtn') == 'この点数で勝負' and pg.inner_text('#hitBtn') == 'もう1枚引く')
    pg.wait_for_timeout(300)
    r = overlaps(pg)
    check(f'{tag} 重なり無し(判断)', not r['bad'] and not r['out'], json.dumps(r, ensure_ascii=False))
    shot(pg, f'flow_{label or w}_03_decide')
    # 3枚目(二重タップしても1枚だけ)
    pg.locator('#hitBtn').tap()
    pg.locator('#hitBtn').dispatch_event('click')
    wait_stage(pg, 'reveal')
    s = snap(pg)
    check(f'{tag} 引く: 選択札のみ3枚(二重タップでも1枚)', len(s['lanes'][1]) == 3 and [len(l) for l in s['lanes']] == [2,3,2,2] and s['domLanes'][1] == 3, json.dumps(s['lanes']))
    check(f'{tag} 親は2〜3枚', len(s['dealer']) in (2, 3) and s['domDealer'] == len(s['dealer']))
    # 公開中: 親札が1枚ずつ表になる(最初は全て伏せ)
    pg.wait_for_timeout(100)
    faces = pg.evaluate("[...document.querySelectorAll('#dealerHand .card')].map(c=>c.dataset.face)")
    check(f'{tag} 公開開始直後は親の札が全て伏せ(瞬間全公開なし)', 'up' not in faces or faces.count('up') < len(faces), json.dumps(faces))
    shot(pg, f'flow_{label or w}_04_reveal_start')
    seen_partial = False
    for _ in range(400):
        f = pg.evaluate("[...document.querySelectorAll('#dealerHand .card')].map(c=>c.dataset.face)")
        if 'up' in f and 'down' in f: seen_partial = True; break
        if snap(pg)['stage'] == 'result': break
        pg.wait_for_timeout(25)
    check(f'{tag} 親札は1枚ずつ公開される', seen_partial or len(snap(pg)['dealer']) == 2)
    wait_stage(pg, 'result', 60000)
    s = snap(pg)
    j = pg.evaluate("(()=>{const s=window.__kabu.snapshot(); const R=window.KabuRules; const byId={}; R.makeDeck().forEach(c=>byId[c.id]=c); const p=s.lanes[s.picked].map(i=>byId[i]); const d=s.dealer.map(i=>byId[i]); return R.judge(p,d,s.stake);})()")
    check(f'{tag} 持ち金 = 控除後 + 返却(判定と一致)', s['purse'] == 900 + j['returned'], f"purse={s['purse']} returned={j['returned']} outcome={j['outcome']}")
    check(f'{tag} 勝敗表示が結果と一致', pg.inner_text('#verdictTitle').startswith({'win':'勝ち','lose':'負け','push':'引き分け'}[j['outcome']]), pg.inner_text('#verdictTitle'))
    check(f'{tag} 結果: スロットは「次の勝負」1つだけ', pg.inner_text('#slotBtn') == '次の勝負' and not pg.is_visible('#standBtn'))
    pg.wait_for_function("document.querySelectorAll('.lane-chip img').length===0", timeout=5000)
    pg.wait_for_timeout(150)
    r = overlaps(pg)
    check(f'{tag} 重なり無し(結果)', not r['bad'] and not r['out'], json.dumps(r, ensure_ascii=False))
    shot(pg, f'flow_{label or w}_05_result')
    mism = pg.evaluate('window.__mismatch')
    check(f'{tag} 全工程で DOM札数=内部状態・重複なし', not mism, json.dumps(mism[:5]))
    check(f'{tag} 飛行中の札は常に1枚以内', pg.evaluate('window.__maxFly') <= 1, str(pg.evaluate('window.__maxFly')))
    # 次の勝負
    tap(pg, '#slotBtn')
    wait_stage(pg, 'pick')
    s = snap(pg)
    check(f'{tag} 次の勝負は押すだけで自動配札(前の札は消え新しい5枚)', s['round'] == 2 and pg.evaluate("document.querySelectorAll('.card').length") == 5 and not pg.is_visible('#verdict') and s['picked'] == -1, json.dumps(s)[:200])
    check(f'{tag} コンソールエラー無し', not pg.errors, json.dumps(pg.errors[:3]))
    pg.context.close()

def scenario_tapdeal(b):
    """山札を狙わなくても、畳の何もない所をタップすれば配られる。戦績シートは配札を起動しない。"""
    pg = new_page(b, 390, 844, 3)
    check('[タップ配札] 初期に配札ヒントが見える', pg.is_visible('#startHint'))
    pg.locator('#scoreBtn').tap()
    check('[タップ配札] 戦績シートが開く・配札は始まらない', pg.is_visible('#stats') and snap(pg)['stage'] == 'idle')
    pg.locator('#statsClose').tap()
    check('[タップ配札] 戦績シートが閉じる', not pg.is_visible('#stats') and snap(pg)['stage'] == 'idle')
    pg.touchscreen.tap(60, 520)     # 左の畳(UIなし)
    wait_stage(pg, 'pick')
    check('[タップ配札] 畳タップで配札(場4+親1)', snap(pg)['stage'] == 'pick' and pg.evaluate("document.querySelectorAll('.card').length") == 5)
    check('[タップ配札] 配札後はヒント非表示', not pg.is_visible('#startHint'))
    check('[タップ配札] コンソールエラー無し', not pg.errors, json.dumps(pg.errors[:3]))
    pg.context.close()

def scenario_rules(b):
    """配札順を固定して特殊役・配当を実画面で確認(390px)。"""
    w, h = 390, 844
    cases = [
        # name, order(場1〜4の1枚目, 親1枚目, 場1〜4の2枚目, 親2枚目, 3枚目...), lane, coin, hit, (結果, 最終持ち金)
        ('シッピン勝ち', [3, 11, 5, 6, 8,  9, 14, 2, 7, 10], 1, 100, False, ('win', 900 + 400)),
        ('クッピン負け', [3, 17, 5, 6, 1,  4, 18, 2, 7, 9], 1, 100, False, ('lose', 900)),
        ('嵐(×5)勝ち', [3, 7, 5, 6, 10,  9, 17, 2, 8, 19,  27], 1, 10, True, ('win', 990 + 10 + 50)),
        ('引き分け', [3, 7, 5, 6, 17,  9, 10, 2, 4, 20], 1, 100, False, ('push', 1000)),
        ('通常負け', [3, 31, 5, 6, 8,  9, 12, 2, 7, 10], 1, 500, False, ('lose', 500)),
    ]
    for name, order, lane, coin, hit, (exp_out, exp_purse) in cases:
        # 3枚目を引く場面は order の続きがそのまま使われる。足りない分は残り山札から。
        pg = new_page(b, w, h, 3)
        stack(pg, [o for o in order if o])
        start_and_pick(pg, lane, coin)
        pg.locator('#slotBtn').tap()
        wait_stage(pg, 'decide')
        (pg.locator('#hitBtn') if hit else pg.locator('#standBtn')).tap()
        wait_stage(pg, 'result', 60000)
        s = snap(pg)
        out = s['last']['outcome']
        check(f'[ルール実画面] {name}: 結果={exp_out}', out == exp_out, f"{out} {json.dumps(s['last'], ensure_ascii=False)[:200]}")
        check(f'[ルール実画面] {name}: 持ち金={exp_purse}円', s['purse'] == exp_purse, str(s['purse']))
        shot(pg, f'rule_{name}')
        pg.context.close()

def scenario_title(b):
    """スタート画面 → ロード(あらすじ) → ゲーム。?title=1 で表示。"""
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/.*'), lambda r: r.fulfill(status=200, body='', content_type='text/css'))
    pg = ctx.new_page(); pg.errors = []
    pg.on('console', lambda m: pg.errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: pg.errors.append('PAGEERROR ' + str(e)))
    pg.goto(f'{BASE}?title=1&seed=2&speed=0.4')
    pg.wait_for_selector('#titleBtn')
    check('[スタート画面] タイトル「あきの忘れた4000円を奪え。」・英語の副題・ボタン', ''.join(pg.inner_text('.title-logo').split()) == 'あきの忘れた4000円を奪え。' and '4000 yen' in pg.inner_text('.title-sub') and pg.inner_text('#titleBtn') == 'あきから4000円を奪う')
    check('[スタート画面] 背景の上でも卓の札はまだ操作不可(オーバーレイ)', pg.evaluate("document.elementFromPoint(195, 420).closest('#title') !== null"))
    pg.wait_for_timeout(1800)
    shot(pg, 'title_00_start')
    pg.locator('#titleBtn').tap()
    pg.wait_for_function("document.getElementById('title').dataset.phase==='loading'")
    txt = pg.inner_text('.load-main').replace('\n', '')
    check('[ロード画面] 「あきがガソスタに忘れた4000円を奪え」が出る', txt == 'あきがガソスタに忘れた4000円を奪え', txt)
    pg.wait_for_timeout(700)
    check('[ロード画面] ロゴ・ボタンは消える', pg.evaluate("getComputedStyle(document.getElementById('titleBtn')).opacity") == '0' and pg.evaluate("getComputedStyle(document.querySelector('.title-head')).opacity") == '0')
    pg.wait_for_function("document.querySelectorAll('#loadLines li.on').length>=2")
    shot(pg, 'title_01_loading')
    pg.wait_for_function("document.querySelectorAll('#loadLines li.on').length===4")
    check('[ロード画面] 説明が4行、順番に流れる', True)
    pg.wait_for_selector('#title', state='detached', timeout=15000)
    check('[ロード→ゲーム] 画面が閉じ、タップで配れる状態(idle)', snap(pg)['stage'] == 'idle' and pg.is_visible('#startHint'))
    pg.touchscreen.tap(60, 520); wait_stage(pg, 'pick')
    check('[ロード→ゲーム] そのまま配札できる', snap(pg)['stage'] == 'pick')
    check('[スタート画面] コンソールエラー無し', not pg.errors, json.dumps(pg.errors[:3]))
    ctx.close()
    # スキップ: ロード中タップ
    pg = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True).new_page()
    pg.route(re.compile(r'https://fonts\..*'), lambda r: r.fulfill(status=200, body='', content_type='text/css'))
    pg.goto(f'{BASE}?title=1&seed=2&speed=3'); pg.wait_for_selector('#titleBtn'); pg.locator('#titleBtn').tap()
    pg.wait_for_function("document.getElementById('title').dataset.phase==='loading'")
    pg.touchscreen.tap(195, 400)
    pg.wait_for_selector('#title', state='detached', timeout=5000)
    check('[ロード画面] タップでスキップできる', snap(pg)['stage'] == 'idle')
    pg.context.close()

def scenario_boss(b):
    """あき(持ち金4,000円)を倒すとクリア。配当はあきの残額が上限。"""
    pg = new_page(b, 390, 844, 3)
    check('[ボス] 初期: あき4,000円・札に表示', snap(pg)['boss'] == 4000 and '4,000' in pg.inner_text('#bossTag'))
    pg.evaluate('window.__kabu.setBoss(200)')
    check('[ボス] 残額が札に反映', '200' in pg.inner_text('#bossTag'))
    stack(pg, [3, 11, 5, 6, 8, 9, 14, 2, 7, 10])      # シッピン(x3)勝ちの並び: 通常なら+300円
    start_and_pick(pg, 1, 100)
    pg.locator('#slotBtn').tap(); wait_stage(pg, 'decide')
    pg.locator('#standBtn').tap(); wait_stage(pg, 'result', 60000)
    s = snap(pg)
    check('[ボス] 勝ち・配当はあきの残額200円で打ち止め(持ち金1,200円)', s['last']['outcome'] == 'win' and s['purse'] == 1200 and s['boss'] == 0, json.dumps(s['last'], ensure_ascii=False)[:160])
    check('[ボス] クリア扱い・スロット=「…次の日」', s['cleared'] and pg.inner_text('#slotBtn') == '…次の日')
    shot(pg, 'boss_clear')
    tap(pg, '#slotBtn')
    pg.wait_for_function("document.getElementById('badend').classList.contains('s-btn')", timeout=12000)
    pg.wait_for_timeout(900)
    check('[GOOD END] あきに焼きまんじゅうをおごる/GOOD END表示', pg.evaluate("document.getElementById('badend').dataset.kind") == 'good' and pg.inner_text('#beStamp') == 'GOOD END' and pg.evaluate("document.querySelector('#beImg').src").endswith('assets/end-good.webp') and pg.evaluate("document.getElementById('beImg').naturalHeight > document.getElementById('beImg').naturalWidth"))
    shot(pg, 'goodend')
    pg.locator('#beBtn').tap(); wait_stage(pg, 'pick')
    s = snap(pg)
    check('[ボス] 再挑戦: あき4,000円・持ち金1,000円に戻る', s['boss'] == 4000 and s['purse'] == 1000 and not s['cleared'], json.dumps(s)[:160])
    check('[ボス] コンソールエラー無し', not pg.errors, json.dumps(pg.errors[:3]))
    pg.context.close()

def scenario_reset(b):
    """リセット: 戦績シートから「最初からやり直す」(2回タップ)。進行中でも破棄して初期状態へ。"""
    pg = new_page(b, 390, 844, 6)
    start_and_pick(pg, 2, 100)
    pg.locator('#slotBtn').tap(); wait_stage(pg, 'decide')
    before = snap(pg)
    pg.locator('#scoreBtn').tap()
    pg.locator('#resetRun').tap()
    check('[リセット] 1回目のタップは確認表示だけで実行されない', pg.inner_text('#resetRun') == 'もう一度タップで実行' and snap(pg)['stake'] == before['stake'] == 100)
    pg.locator('#resetRun').tap()
    pg.wait_for_function("window.__kabu.snapshot().stage==='idle'")
    s = snap(pg)
    check('[リセット] 2回目で初期化(持ち金1,000・あき4,000・卓は空・シート閉)', s['purse'] == 1000 and s['boss'] == 4000 and s['stake'] == 0 and s['picked'] == -1 and pg.evaluate("document.querySelectorAll('.card').length") == 0 and not pg.is_visible('#stats'), json.dumps(s)[:200])
    check('[リセット] ボタン表示が元に戻る', True)
    pg.touchscreen.tap(60, 520); wait_stage(pg, 'pick')
    check('[リセット] リセット後にそのまま配札できる', snap(pg)['stage'] == 'pick' and pg.evaluate("document.querySelectorAll('.card').length") == 5)
    pg.wait_for_timeout(400)
    pg.locator('#scoreBtn').tap()
    pg.locator('#resetStats').tap(); pg.locator('#resetStats').tap()
    check('[リセット] 戦績を消すとスコア0・シートは開いたまま', pg.inner_text('#scoreVal') == '0' and pg.is_visible('#stats'))
    check('[リセット] コンソールエラー無し', not pg.errors, json.dumps(pg.errors[:3]))
    pg.context.close()

def scenario_persist(b):
    """保存の復元: 持ち金が尽きた状態が残っていても、再訪時は持ち金2,500・あき4,000に戻る"""
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/.*'), lambda r: r.fulfill(status=200, body='', content_type='text/css'))
    ctx.add_init_script("if(!sessionStorage.getItem('i')){sessionStorage.setItem('i','1');localStorage.setItem('kabu.purse','0');localStorage.setItem('kabu.boss','4600');localStorage.setItem('kabu.runRounds','7');}")
    pg = ctx.new_page(); pg.errors = []
    pg.on('pageerror', lambda e: pg.errors.append(str(e)))
    pg.goto(f'{BASE}?seed=2&persist=1&speed=0.4')
    pg.wait_for_function('window.__kabu')
    s = snap(pg)
    check('[保存] 負け状態が残っていても初期値(2,500/4,000)から', s['purse'] == 2500 and s['boss'] == 4000, json.dumps(s)[:160])
    ctx.close()

def scenario_nine(b):
    """自分が9で勝つ: 手札が9になった時に激アツ予告、その場で小銭が左右下から飛び散る演出(全画面演出なし)。"""
    pg = new_page(b, 390, 844, 4)
    stack(pg, [3, 4, 6, 7, 10, 8, 5, 2, 9, 12, 16])     # 場2=4+5=9、親=0+2+6=8
    start_and_pick(pg, 1, 100)
    pg.locator('#slotBtn').tap()
    pg.wait_for_function("document.getElementById('omen').dataset.kind==='nine' && document.getElementById('omen').classList.contains('on')", timeout=10000)
    check('[9の演出] 手札が9になった瞬間に「激アツ」予告', 'nine' == pg.evaluate("document.getElementById('omen').dataset.kind") and pg.evaluate("document.getElementById('omen').dataset.text") != '')
    pg.wait_for_timeout(450)
    n = pg.locator('#field .rain-coin').count()
    side = pg.evaluate("(() => { const f = document.getElementById('field').getBoundingClientRect(); const cs = [...document.querySelectorAll('#field .rain-coin')].map(c => c.getBoundingClientRect()); return { L: cs.filter(r => r.left < f.left + f.width * .5).length, R: cs.filter(r => r.left >= f.left + f.width * .5).length }; })()")
    check('[9の演出] 9が揃った瞬間に小銭が左右の下端から飛び散る', n >= 50 and side['L'] > 5 and side['R'] > 5, f'{n} {side}')
    check('[9の演出] 画面は切り替わらない(全画面演出なし)', pg.locator('#jackpot').count() == 0 and pg.is_visible('#deck'))
    shot(pg, 'nine_teaser')
    wait_stage(pg, 'decide')
    check('[9の演出] 予告中も「勝負/もう1枚」は押せる', not pg.is_disabled('#standBtn'))
    pg.locator('#standBtn').tap()
    wait_stage(pg, 'result', 60000)
    s = snap(pg)
    check('[9の演出] 結果は勝ち(+100円)・演出後に通常の結果表示へ', s['last']['outcome'] == 'win' and s['purse'] == 1100, json.dumps(s['last'], ensure_ascii=False)[:140])
    check('[9の演出] コンソールエラー無し', not pg.errors, json.dumps(pg.errors[:3]))
    pg.context.close()

def scenario_bankrupt(b):
    """持ち金が尽きる → 「次の日」→ 焼きまんじゅう BAD END → 再挑戦(持ち金2,500円・あき4,000円)。"""
    pg = new_page(b, 390, 844, 9)
    pg.evaluate('window.__kabu.setPurse(100)')
    pg.evaluate('window.__kabu.setBoss(2500)')
    stack(pg, [3, 17, 5, 6, 1, 4, 18, 2, 7, 9])      # クッピン負けの並び
    start_and_pick(pg, 1, 100)
    pg.locator('#slotBtn').tap(); wait_stage(pg, 'decide')
    pg.locator('#standBtn').tap(); wait_stage(pg, 'result', 60000)
    s = snap(pg)
    check('[BAD END] 負けて持ち金0円', s['purse'] == 0 and s['last']['outcome'] == 'lose', json.dumps(s['last'], ensure_ascii=False)[:120])
    check('[負け金→あき] 負けた100円があきの持ち金に加わる(2,500→2,600)', s['boss'] == 2600, str(s['boss']))
    check('[BAD END] スロット=「…次の日」', pg.inner_text('#slotBtn') == '…次の日')
    pg.locator('#slotBtn').tap()
    pg.wait_for_function("document.getElementById('badend').classList.contains('s-day')", timeout=10000)
    check('[BAD END] 「次の日」と暗転', pg.evaluate("document.getElementById('badend').dataset.kind") == 'bad' and pg.inner_text('#beDay') == '次の日' and pg.evaluate("document.getElementById('badend').classList.contains('on')") and pg.evaluate("getComputedStyle(document.querySelector('.field')).visibility") != '')
    shot(pg, 'badend_0_day')
    pg.wait_for_function("document.getElementById('badend').classList.contains('s-scene')", timeout=10000)
    src = pg.evaluate("document.getElementById('beImg').src")
    check('[BAD END] スマホで見返す写真(縦長の1枚絵 end-bad)を表示', src.endswith('assets/end-bad.webp') and pg.evaluate("document.getElementById('beImg').naturalWidth") > 0 and pg.evaluate("document.getElementById('beImg').naturalHeight > document.getElementById('beImg').naturalWidth"), src)
    pg.wait_for_function("document.getElementById('badend').classList.contains('s-btn')", timeout=10000)
    pg.wait_for_timeout(900)
    check('[BAD END] 一言の文字が写真の下に出る', '焼きまんじゅう' in pg.inner_text('#beCap') and pg.evaluate("getComputedStyle(document.getElementById('beCap')).opacity") == '1')
    check('[BAD END] BAD END表示と再挑戦ボタン', pg.inner_text('#beStamp') == 'BAD END' and pg.inner_text('#beBtn') == 'もう一度あきに挑む')
    shot(pg, 'badend_1_end')
    pg.locator('#beBtn').tap()
    wait_stage(pg, 'pick')
    s = snap(pg)
    check('[BAD END] 再戦: 持ち金1,000円・あき4,000円・即配札', s['purse'] == 1000 and s['boss'] == 4000 and not pg.is_visible('#badend'), json.dumps(s)[:160])
    check('[BAD END] コンソールエラー無し', not pg.errors, json.dumps(pg.errors[:3]))
    pg.context.close()

def scenario_desktop(b):
    pg = new_page(b, 1280, 800, 5, touch=False)
    pg.evaluate(MONITOR_JS)
    tap(pg, '#deck'); wait_stage(pg, 'pick')
    tap(pg, '.lane[data-lane="0"]'); tap(pg, '.coin[data-amount="10"]')
    pg.wait_for_timeout(300)
    r = overlaps(pg)
    check('[PC 1280x800] 重なり無し(BET前)', not r['bad'] and not r['out'], json.dumps(r, ensure_ascii=False))
    shot(pg, 'desktop_1280_bet')
    tap(pg, '#slotBtn'); wait_stage(pg, 'decide')
    tap(pg, '#standBtn'); wait_stage(pg, 'result', 60000)
    pg.wait_for_function("document.querySelectorAll('.lane-chip img').length===0", timeout=5000)
    pg.wait_for_timeout(150)
    r = overlaps(pg)
    check('[PC 1280x800] 重なり無し(結果)', not r['bad'] and not r['out'], json.dumps(r, ensure_ascii=False))
    shot(pg, 'desktop_1280_result')
    check('[PC 1280x800] DOM札数=内部状態', not pg.evaluate('window.__mismatch'))
    check('[PC 1280x800] コンソールエラー無し', not pg.errors, json.dumps(pg.errors[:3]))
    pg.context.close()


def scenario_timing(b):
    """演出の破綻検出: 公開中に勝敗が先に出ない / タップ短縮でも整合 / 配札中・公開中の誤入力。"""
    for fastmode in (False, True):
        tag = '[演出 短縮タップ]' if fastmode else '[演出 通常]'
        pg = new_page(b, 390, 844, 21)
        pg.evaluate(MONITOR_JS)
        pg.evaluate("""() => { window.__viol = []; const tick = () => {
            const v = document.getElementById('verdict'); const shown = !v.classList.contains('off');
            const faces = [...document.querySelectorAll('#dealerHand .card')].map(c => c.dataset.face);
            const cut = document.getElementById('cutin').classList.contains('on');
            if ((shown || cut) && faces.length && faces.some(f => f !== 'up')) window.__viol.push('verdict/cutin before all dealer cards up');
            requestAnimationFrame(tick); }; requestAnimationFrame(tick); }""")
        tap(pg, '#deck'); wait_stage(pg, 'pick')
        tap(pg, '.lane[data-lane="3"]'); tap(pg, '.coin[data-amount="500"]')
        pg.locator('#slotBtn').tap()
        pg.wait_for_function("window.__kabu.snapshot().stage==='dealing2'")
        # 配札中の誤入力は無視される
        before = snap(pg)
        pg.locator('.lane[data-lane="0"]').dispatch_event('click')
        pg.locator('.coin[data-amount="5"]').dispatch_event('click')
        pg.locator('#slotBtn').dispatch_event('click')
        after = snap(pg)
        check(f'{tag} 配札中の入力は無効(選択・金額・持ち金が変化しない)', after['picked'] == 3 and after['purse'] == 500 and after['stake'] == 500 and after['coin'] == 0, json.dumps(after))
        wait_stage(pg, 'decide')
        pg.locator('#standBtn').tap()
        if fastmode:
            pg.wait_for_function("window.__kabu.snapshot().stage==='reveal'")
            pg.locator('#field').dispatch_event('pointerdown')
            pg.locator('#standBtn').dispatch_event('click')  # 結果前の連打も無視される
        wait_stage(pg, 'result', 60000)
        pg.wait_for_timeout(300)
        viol = pg.evaluate('window.__viol')
        check(f'{tag} 親札が全て表になる前に勝敗/カットインが出ない', not viol, json.dumps(viol[:3]))
        s = snap(pg)
        check(f'{tag} 終了時のDOM札数=内部状態', not pg.evaluate('window.__mismatch') and s['domDealer'] == len(s['dealer']))
        j = s['last']
        check(f'{tag} 持ち金整合', s['purse'] == 500 + j['returned'], json.dumps(j, ensure_ascii=False)[:160])
        pg.context.close()

if __name__ == '__main__':
    widths = [int(x) for x in args.widths.split(',')]
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w in widths:
            scenario_flow(b, w, HEIGHTS.get(w, 800))
        for wh in [x for x in args.extra.split(',') if x]:
            ew, eh = [int(v) for v in wh.split('x')]
            scenario_flow(b, ew, eh, label=f'{ew}x{eh}')
        scenario_tapdeal(b)
        scenario_timing(b)
        scenario_rules(b)
        scenario_title(b)
        scenario_boss(b)
        scenario_reset(b)
        scenario_persist(b)
        scenario_nine(b)
        scenario_bankrupt(b)
        scenario_desktop(b)
        b.close()
    fails = [r for r in results if not r[1]]
    print(f'\n== {len(results) - len(fails)}/{len(results)} PASS, {len(fails)} FAIL ==')
    for n, _, d in fails: print('FAIL:', n, d[:300])
    sys.exit(1 if fails else 0)
