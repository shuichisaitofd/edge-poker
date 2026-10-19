/* 旅館カブ — ゲーム進行(状態遷移・配札・入力)。
 * 責務分離: ルール判定は rules.js(純粋関数)、札/硬貨のDOMは cards.js、音は audio.js、演出は fx.js。
 * ここは「状態 S」と「DOMの更新」だけを持つ。札のDOMは作り直さず、1枚ずつ飛ばして着地させる。
 */
(function () {
  'use strict';
  const R = window.KabuRules, C = Kabu.cards, A = Kabu.audio, FX = Kabu.fx;
  const $ = id => document.getElementById(id);
  const AMOUNTS = [5, 10, 100, 500];
  const START_PURSE = 1000;
  const BOSS_PURSE = 4000;   // ガソスタに忘れた、あきの4,000円。0にすればクリア

  const params = new URLSearchParams(location.search);
  const seedParam = params.get('seed');
  const rnd = seedParam !== null ? R.mulberry32(parseInt(seedParam, 10) || 0) : Math.random;
  const testMode = seedParam !== null || params.has('test');
  // 見た目だけのランダム(札の傾き・一言)。?seed= のときは固定してスクリーンショット比較を決定的にする
  const cos = seedParam !== null ? R.mulberry32((parseInt(seedParam, 10) || 0) + 777) : Math.random;
  const timeScale = FX.reduce ? 0.2 : (parseFloat(params.get('speed')) || 1);

  const S = {
    stage: 'idle',      // idle|dealing|pick|bet|dealing2|decide|hitting|dealer|reveal|result
    busy: false,
    run: 0,
    deck: [], lanes: [[], [], [], []], dealer: [],
    picked: -1, coin: 0, stake: 0,
    purse: START_PURSE, round: 0, boss: BOSS_PURSE, runRounds: 0,
    forced: null,       // テスト用: 次の山札の並びを固定
    last: null
  };
  let fast = false;     // 演出中のタップで短縮

  const field = $('field');
  const deckBtn = $('deck');
  const dealerHandEl = $('dealerHand');
  const slot = $('slot'), slotBtn = $('slotBtn'), standBtn = $('standBtn'), hitBtn = $('hitBtn');
  const laneEls = [], laneCardsEls = [], laneScoreEls = [], laneChipEls = [];
  const coinEls = {};

  const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms * timeScale * (fast ? 0.3 : 1))));
  const center = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const fmt = n => n.toLocaleString('ja-JP');
  const pick = a => a[Math.floor(cos() * a.length)];

  // ---------------------------------------------------------------- 永続化(持ち金のみ)
  function loadPurse() {
    if (testMode) return START_PURSE;
    try {
      const v = parseInt(localStorage.getItem('kabu.purse'), 10);
      if (v >= 5 && v < 10000000) return v;
    } catch (e) { /* ignore */ }
    return START_PURSE;
  }
  function savePurse() {
    if (testMode) return;
    try { localStorage.setItem('kabu.purse', String(S.purse)); localStorage.setItem('kabu.boss', String(S.boss)); localStorage.setItem('kabu.runRounds', String(S.runRounds)); } catch (e) { /* ignore */ }
  }
  function loadBoss() {
    if (testMode) return;
    try {
      const b = parseInt(localStorage.getItem('kabu.boss'), 10);
      if (b > 0 && b <= BOSS_PURSE) S.boss = b;
      S.runRounds = parseInt(localStorage.getItem('kabu.runRounds'), 10) || 0;
    } catch (e) { /* ignore */ }
  }
  function renderBoss(bump) {
    const t = $('bossTag');
    t.textContent = 'あき  ' + fmt(S.boss) + '円';
    if (bump) { t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); }
  }

  // ---------------------------------------------------------------- 戦績(スコア = 勝って得た配当の累計。負けても減らない)
  const STAT0 = { badEnds: 0, clears: 0, bestClear: 0, score: 0, wins: 0, losses: 0, pushes: 0, streak: 0, bestStreak: 0, bestPurse: START_PURSE, maxWin: 0 };
  let stats = Object.assign({}, STAT0);
  function loadStats() {
    if (testMode) return;
    try { const o = JSON.parse(localStorage.getItem('kabu.stats')); if (o && typeof o === 'object') stats = Object.assign({}, STAT0, o); } catch (e) { /* ignore */ }
  }
  function saveStats() {
    if (testMode) return;
    try { localStorage.setItem('kabu.stats', JSON.stringify(stats)); } catch (e) { /* ignore */ }
  }
  function recordResult(j) {
    if (j.outcome === 'win') {
      stats.wins++; stats.streak++; stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
      stats.score += j.delta; stats.maxWin = Math.max(stats.maxWin, j.delta);
    } else if (j.outcome === 'lose') { stats.losses++; stats.streak = 0; }
    else stats.pushes++;
    stats.bestPurse = Math.max(stats.bestPurse, S.purse);
    saveStats();
    renderScore(true);
  }
  function renderScore(bump) {
    $('scoreVal').textContent = fmt(stats.score);
    if (bump) { const t = $('scoreBtn'); t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); }
  }
  function openStats() {
    const rows = [['あきから回収', stats.clears + ' 回'], ['BAD END', stats.badEnds + ' 回'], ['最短クリア', stats.bestClear ? stats.bestClear + ' 戦' : '―'], ['スコア', fmt(stats.score) + ' 点'], ['勝ち / 負け / 引分', stats.wins + ' / ' + stats.losses + ' / ' + stats.pushes],
      ['連勝(最高)', stats.bestStreak + ' 連勝'], ['最高持ち金', fmt(stats.bestPurse) + ' 円'], ['最高配当', fmt(stats.maxWin) + ' 円']];
    $('statsList').innerHTML = rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
    $('stats').hidden = false;
  }

  // ---------------------------------------------------------------- DOM 構築(1回だけ)
  function build() {
    const lanes = $('lanes');
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = 'lane';
      el.dataset.lane = i;
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.setAttribute('aria-label', '場' + (i + 1));
      el.innerHTML = '<span class="tag lane-name">場' + (i + 1) + '</span><div class="lane-cards"></div>' +
        '<div class="lane-foot"><span class="lane-chip"></span><span class="tag lane-score"></span></div>';
      el.addEventListener('click', () => onLane(i));
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLane(i); } });
      lanes.appendChild(el);
      laneEls.push(el);
      laneCardsEls.push(el.querySelector('.lane-cards'));
      laneScoreEls.push(el.querySelector('.lane-score'));
      laneChipEls.push(el.querySelector('.lane-chip'));
    }
    const coins = $('coins');
    for (const a of AMOUNTS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'coin';
      b.dataset.amount = a;
      b.setAttribute('aria-label', a + '円');
      b.innerHTML = C.coinSvg(a);
      b.addEventListener('click', () => onCoin(a));
      coins.appendChild(b);
      coinEls[a] = b;
    }
    deckBtn.addEventListener('click', start);
    // 山札を狙わなくても、畳のどこをタップしても配れる
    field.addEventListener('click', e => {
      if (S.stage !== 'idle' || e.target.closest('.sound, .score-tag, .stats')) return;
      start();
    });
    $('scoreBtn').addEventListener('click', () => { A.play('tap'); openStats(); });
    $('statsClose').addEventListener('click', () => { $('stats').hidden = true; });
    $('stats').addEventListener('click', e => { if (e.target === $('stats')) $('stats').hidden = true; });
    slotBtn.addEventListener('click', onSlot);
    standBtn.addEventListener('click', () => decide(false));
    hitBtn.addEventListener('click', () => decide(true));
    $('sound').addEventListener('click', () => { A.setMuted(!A.isMuted()); A.unlock(); A.play('tap'); renderSound(); });
    // 演出中のタップ: カットインを閉じる/待ち時間を短縮
    field.addEventListener('pointerdown', e => {
      if (e.target.closest('.sound')) return;
      if (document.getElementById('cutin').classList.contains('on')) FX.endCut();
      if (S.busy) fast = true;
    });
    renderSound();
  }

  function renderSound() {
    const m = A.isMuted();
    $('sound').setAttribute('aria-pressed', String(m));
    $('sound').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/>' +
      (m ? '<path d="M17 9l5 6M22 9l-5 6"/>' : '<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>') + '</svg>';
  }

  // ---------------------------------------------------------------- 表示の同期(DOMは作り直さず属性だけ切り替える)
  function handText(cards, isDealer) {
    const r = R.evaluate(cards, isDealer);
    if (r.type === 'normal') return r.score + '点';
    return r.name + (!isDealer && r.mult > 1 ? ' ×' + r.mult : '');
  }

  function setStage(s) { S.stage = s; field.dataset.stage = s; refresh(); }

  function refresh() {
    const st = S.stage;
    $('purseAmount').textContent = fmt(S.purse);
    renderBoss(false);
    $('deckTag').textContent = st === 'idle' ? 'タップで配る' : '残り ' + S.deck.length + '枚';
    deckBtn.disabled = !(st === 'idle' && !S.busy);

    const selectable = (st === 'pick' || st === 'bet') && !S.busy;
    laneEls.forEach((el, i) => {
      const sel = S.picked === i;
      el.classList.toggle('is-selected', sel);
      el.classList.toggle('is-dim', S.picked >= 0 && !sel && st !== 'pick' && st !== 'bet');
      el.setAttribute('aria-pressed', String(sel));
      el.style.pointerEvents = selectable ? '' : 'none';
      laneScoreEls[i].textContent = sel && S.lanes[i].length ? handText(S.lanes[i], false) : '';
    });

    const coinsOn = st === 'bet' && S.picked >= 0 && !S.busy;
    for (const a of AMOUNTS) {
      coinEls[a].disabled = !coinsOn || a > S.purse;
      coinEls[a].classList.toggle('is-picked', coinsOn && S.coin === a);
    }

    let mode = 'none', text = '', enabled = false;
    if (st === 'pick') { mode = 'hint'; text = '賭ける札を選んでください'; }
    else if (st === 'bet') {
      if (S.coin) { mode = 'bet'; text = 'BET ' + fmt(S.coin) + '円を確定'; enabled = !S.busy; }
      else { mode = 'hint'; text = '金額を選んでください'; }
    } else if (st === 'decide') { mode = 'decide'; }
    else if (st === 'result') { mode = 'next'; text = S.cleared ? 'もう一度あきに挑む' : S.purse < 5 ? '…次の日' : '次の勝負'; enabled = !S.busy; }
    slot.dataset.mode = mode;
    slotBtn.textContent = text;
    slotBtn.disabled = !enabled;
    standBtn.disabled = hitBtn.disabled = !(st === 'decide' && !S.busy);
  }

  function showDealerScore(text, bump) {
    const el = $('dealerScore');
    if (!text) { el.classList.add('off'); return; }
    el.textContent = text;
    el.classList.remove('off');
    if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
  function showVerdict(kind, title, sub) {
    const v = $('verdict');
    v.className = 'verdict ' + kind;
    $('verdictTitle').textContent = title;
    $('verdictSub').textContent = sub;
    v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
  }
  function hideVerdict() { $('verdict').className = 'verdict off'; }

  // ---------------------------------------------------------------- 硬貨(仮置き)
  function setChip(amount, fromEl) {
    laneChipEls.forEach(e => { e.replaceChildren(); });
    if (!amount || S.picked < 0) return;
    const holder = laneChipEls[S.picked];
    holder.innerHTML = C.coinSvg(amount);
    const svg = holder.firstElementChild;
    if (fromEl) {
      const a = center(fromEl), b = center(holder);
      svg.animate([
        { transform: 'translate(' + (a.x - b.x) + 'px,' + (a.y - b.y) + 'px) scale(1.5)', opacity: .9 },
        { transform: 'translate(0,0) scale(1)', opacity: 1 }
      ], { duration: 280 * timeScale, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
  }

  // ---------------------------------------------------------------- 入力
  function onLane(i) {
    if (S.busy) return;
    if (S.stage === 'pick') {
      S.picked = i; S.coin = 0; A.play('tap'); setStage('bet');
    } else if (S.stage === 'bet') {
      if (S.picked === i) {                       // 同じ札の再タップ = 選択解除
        S.picked = -1; S.coin = 0; setChip(0); A.play('tap'); setStage('pick');
      } else {                                    // 別の札 = 即座に選択変更(硬貨は引き継ぐ)
        const from = laneChipEls[S.picked];
        S.picked = i; A.play('tap');
        refresh();
        if (S.coin) setChip(S.coin, from);
      }
    }
  }

  function onCoin(a) {
    if (S.busy || S.stage !== 'bet' || S.picked < 0 || a > S.purse) return;
    if (S.coin === a) { S.coin = 0; setChip(0); A.play('tap'); refresh(); return; } // 再タップで金額解除
    S.coin = a; A.play('coin'); refresh();
    setChip(a, coinEls[a]);
  }

  function onSlot() {
    if (S.stage === 'bet') confirmBet();
    else if (S.stage === 'result') next();
  }

  // ---------------------------------------------------------------- 配札(札のDOMは1枚ずつ飛ばして着地させる)
  async function dealTo(target, faceUp) {
    const run = S.run;
    const card = S.deck.pop();
    $('deckTag').textContent = '残り ' + S.deck.length + '枚';
    const isLane = target.lane !== undefined;
    const container = isLane ? laneCardsEls[target.lane] : dealerHandEl;
    const idx = isLane ? S.lanes[target.lane].length : S.dealer.length;
    const el = C.createCard(card);
    const rot = (cos() * 6 - 3) * (isLane ? 1 : 1.3);
    el.style.setProperty('--i', idx);
    el.style.setProperty('--rot', rot.toFixed(2) + 'deg');
    el.dataset.state = 'flying';
    if (isLane) el.classList.add('quick');
    container.appendChild(el);
    const src = center(deckBtn.querySelector('.deck-stack'));
    const dst = center(el);
    const dx = src.x - dst.x, dy = src.y - dst.y;
    A.play('deal');
    const dur = 400 * timeScale * (fast ? 0.45 : 1);
    const anim = el.animate([
      { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + (rot - 16) + 'deg) scale(1.08)' },
      { transform: 'translate(' + dx * .1 + 'px,' + dy * .1 + 'px) rotate(' + (rot + 3) + 'deg) scale(1.03)', offset: .82 },
      { transform: 'translate(0,0) rotate(' + rot + 'deg) scale(1)' }
    ], { duration: Math.max(1, dur), easing: 'cubic-bezier(.25,.7,.3,1)', fill: 'backwards' });
    try { await anim.finished; } catch (e) { /* cancelled */ }
    if (run !== S.run) { el.remove(); return null; }
    el.dataset.state = 'landed';              // 着地: ここで初めて「手札が1枚増えた」状態にする
    (isLane ? S.lanes[target.lane] : S.dealer).push(card);
    A.play('land');
    if (faceUp) { el.dataset.face = 'up'; A.play('flip'); }
    refresh();
    await sleep(120);
    return card;
  }

  async function start() {
    if (S.busy || S.stage !== 'idle') return;
    A.unlock();
    S.busy = true; fast = false;
    const run = ++S.run;
    S.round++; S.runRounds++;
    S.picked = -1; S.coin = 0; S.stake = 0;
    S.lanes = [[], [], [], []]; S.dealer = [];
    S.deck = S.forced ? S.forced.slice() : R.shuffle(R.makeDeck(), rnd);
    S.forced = null;
    hideVerdict(); showDealerScore(null);
    setStage('dealing');
    for (let i = 0; i < 4; i++) { await dealTo({ lane: i }, true); if (run !== S.run) return; }
    await dealTo({ dealer: true }, false);
    if (run !== S.run) return;
    S.busy = false;
    setStage('pick');
  }

  async function confirmBet() {
    if (S.busy || S.stage !== 'bet' || !S.coin || S.coin > S.purse) return;
    const run = S.run;
    S.busy = true;
    S.stake = S.coin; S.coin = 0;
    S.purse -= S.stake;                         // 確定して初めて持ち金を減らす
    savePurse();
    A.play('coin');
    setStage('dealing2');
    $('purse').classList.remove('pulse'); void $('purse').offsetWidth; $('purse').classList.add('pulse');
    await sleep(240);
    for (let i = 0; i < 4; i++) { await dealTo({ lane: i }, true); if (run !== S.run) return; }
    await dealTo({ dealer: true }, false);
    if (run !== S.run) return;
    S.busy = false;
    setStage('decide');
    FX.omen('zawa', pick(['ざわ…ざわ…', 'ざわ…', '…ざわ…']), 1200);
  }

  async function decide(hit) {
    if (S.busy || S.stage !== 'decide') return;
    if (hit && !R.playerCanHit(S.lanes[S.picked])) return;
    const run = S.run;
    S.busy = true;
    if (hit) {
      setStage('hitting');
      FX.shout(pick(['まだ行くのか！', '攻めるねぇ…', '欲張るなッ！']), pick(['tl', 'bl']));
      FX.omen('zawa', 'ざわッ…！', 900);
      await dealTo({ lane: S.picked }, true);
      if (run !== S.run) return;
      await sleep(380);
    }
    setStage('dealer');
    if (R.dealerShouldDraw(S.dealer)) {
      await sleep(320);
      await dealTo({ dealer: true }, false);
      if (run !== S.run) return;
    }
    await sleep(300);
    setStage('reveal');
    await revealDealer(run);
    if (run !== S.run) return;
    await finish(run);
  }

  async function revealDealer(run) {
    const cards = Array.from(dealerHandEl.querySelectorAll('.card'));
    for (let k = 0; k < cards.length; k++) {
      const last = k === cards.length - 1;
      let rumbled = false;
      if (last) {                                          // 最後の1枚: ゴゴゴ…と拡大・振動して溜める
        rumbled = true;
        FX.shout(pick(['…どうだ！？', '来るぞ…ッ', 'ごくり…']), pick(['bl', 'br']));
        FX.omen('gogo', 'ゴゴゴゴゴ', 1800 * timeScale + 300);
        A.play('rumble');
        await FX.rumble(cards[k], 1700 * timeScale * (fast ? 0.4 : 1));
      } else {
        await sleep(300);
      }
      if (run !== S.run) { FX.release(); return; }
      cards[k].dataset.face = 'up';
      if (rumbled) { FX.release(); A.play('impact'); FX.shake(2); } else A.play('flip');
      await sleep(560);
      const part = S.dealer.slice(0, k + 1);
      showDealerScore('あき ' + (last ? handText(S.dealer, true) : R.score(part) + '点'), true);
      await sleep(360);
    }
  }

  async function finish(run) {
    const mine = S.lanes[S.picked];
    const j = R.judge(mine, S.dealer, S.stake);
    if (j.outcome === 'win' && j.profit > S.boss) {          // あきの持ち金以上は取れない
      j.profit = S.boss; j.returned = S.stake + S.boss; j.delta = S.boss;
    }
    S.last = j;
    if (j.outcome === 'win') S.boss -= j.profit;
    const cleared = S.boss <= 0;
    await sleep(380);
    if (run !== S.run) return;

    const special = j.player.type !== 'normal' || j.dealer.type === 'kuppin' || cleared;
    if (j.outcome === 'win') {
      const txt = cleared ? '完全勝利！' : j.player.type !== 'normal' ? j.player.name + '！' : '勝ち！';
      A.play(special ? 'big' : 'win');
      FX.shake(special ? 2 : 1);
      if (cleared) FX.shout('俺の4,000円がァ…！', 'tl');
      else if (special) FX.shout(pick(['おおおっ！', 'マジかよ！', 'やりやがった！']), pick(['tl', 'bl', 'br']));
      else FX.shout(S.boss <= 1000 ? pick(['もう返してくれ…！', '頼む、もうやめろ…']) : pick(['くっ…俺の金が', 'ちょ、待て！']), 'tl');
      await FX.cutin(txt, special ? 'special' : 'win', cleared ? 'あきの4,000円、いただき！' : special ? pick(['天運…ッ！', '圧倒的…ッ！', '引き当てたァ…！']) : pick(['読みどおり…！', '勝負あり！', 'もらったッ！']));
    } else if (j.outcome === 'lose') {
      const txt = j.dealer.type === 'kuppin' ? 'クッピン！' : '負け…';
      A.play('lose');
      if (j.dealer.type !== 'normal') FX.shake();
      FX.shout(pick(['この金は渡さん！', 'ククク…俺の勝ちだ', '甘いなァ…']), pick(['bl', 'br']));
      await FX.cutin(txt, j.dealer.type === 'kuppin' ? 'special' : 'lose', pick(['ぐぬぬ…', '不覚ッ…！', '地獄…ッ！']));
    } else {
      A.play('push');
    }
    if (run !== S.run) return;

    S.purse += j.returned;
    savePurse();
    S.cleared = cleared;
    if (cleared) { stats.clears++; stats.bestClear = stats.bestClear ? Math.min(stats.bestClear, S.runRounds) : S.runRounds; }
    recordResult(j);
    renderBoss(true);
    const pt = j.player.type === 'normal' ? j.player.score + '点' : j.player.name;
    const dt = j.dealer.type === 'normal' ? j.dealer.score + '点' : j.dealer.name;
    const money = j.delta > 0 ? '＋' + fmt(j.delta) + '円' : j.delta < 0 ? '−' + fmt(-j.delta) + '円' : '±0円';
    const title = cleared ? 'クリア！  ＋' + fmt(j.delta) + '円' : (j.outcome === 'win' ? '勝ち' : j.outcome === 'lose' ? '負け' : '引き分け') + '  ' + money;
    showVerdict(j.outcome, title, 'あなた ' + pt + ' 対 親 ' + dt);
    settleChip(j.outcome);
    S.busy = false;
    setStage('result');
  }

  function settleChip(outcome) {
    const svg = laneChipEls[S.picked].firstElementChild;
    if (!svg) return;
    const from = center(svg);
    const to = center(outcome === 'lose' ? dealerHandEl : $('purse'));
    const a = svg.animate([
      { transform: 'none', opacity: 1 },
      { transform: 'translate(' + (to.x - from.x) + 'px,' + (to.y - from.y) + 'px) scale(.8)', opacity: 0 }
    ], { duration: 520 * timeScale, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
    a.finished.then(() => { if (S.stage === 'result') laneChipEls[S.picked] && laneChipEls[S.picked].replaceChildren(); }).catch(() => {});
  }

  /** 持ち金が尽きた: 暗転 → 「次の日」 → 焼きまんじゅうを奢ってもらった。BAD END → 再挑戦ボタン */
  async function badEnd() {
    const be = $('badend');
    fast = false;
    stats.badEnds++; stats.streak = 0; saveStats();
    be.classList.remove('s-day', 's-scene', 's-stamp', 's-btn');
    be.hidden = false;
    void be.offsetWidth;
    be.classList.add('on');
    A.play('lose');
    await sleep(900);
    be.classList.add('s-day');
    await sleep(1900);
    be.classList.remove('s-day');
    await sleep(600);
    be.classList.add('s-scene');
    await sleep(1500);
    be.classList.add('s-stamp'); A.play('impact'); FX.shake(2);
    await sleep(1100);
    be.classList.add('s-btn');
    await new Promise(res => { $('beBtn').onclick = () => { $('beBtn').onclick = null; res(); }; });
    A.play('coin');
    be.classList.remove('on');
    await sleep(500);
    be.hidden = true;
    be.classList.remove('s-day', 's-scene', 's-stamp', 's-btn');
  }

  async function next() {
    if (S.busy || S.stage !== 'result') return;
    S.busy = true;
    if (S.purse < 5) await badEnd();
    document.querySelectorAll('.card').forEach(c => {
      c.animate([{ opacity: 1 }, { opacity: 0, transform: getComputedStyle(c).transform + ' translateY(-10px)' }],
        { duration: 220 * timeScale, fill: 'forwards' });
    });
    hideVerdict(); showDealerScore(null);
    await sleep(260);
    document.querySelectorAll('.card').forEach(c => c.remove());
    laneChipEls.forEach(e => e.replaceChildren());
    S.lanes = [[], [], [], []]; S.dealer = [];
    S.picked = -1; S.coin = 0; S.stake = 0;
    if (S.purse < 5 || S.cleared) { S.purse = START_PURSE; S.boss = BOSS_PURSE; S.runRounds = 0; S.cleared = false; savePurse(); renderBoss(true); }
    fast = false;
    S.busy = false;
    setStage('idle');
    start();                                   // 次の勝負は押した瞬間にそのまま配る
  }

  // ---------------------------------------------------------------- 起動 / テスト用フック
  function snapshot() {
    const landed = sel => Array.from(document.querySelectorAll(sel)).filter(c => c.dataset.state === 'landed').length;
    return {
      stage: S.stage, busy: S.busy, round: S.round, boss: S.boss, cleared: !!S.cleared, purse: S.purse, stake: S.stake, picked: S.picked, coin: S.coin,
      deckLeft: S.deck.length,
      lanes: S.lanes.map(l => l.map(c => c.id)),
      dealer: S.dealer.map(c => c.id),
      domLanes: laneCardsEls.map((_, i) => landed('.lane[data-lane="' + i + '"] .card')),
      domDealer: landed('#dealerHand .card'),
      last: S.last
    };
  }
  window.__kabu = {
    snapshot,
    /** 次の配札順を固定する(先頭の id から配られる)。idle のときのみ。 */
    stack(ids) {
      if (S.stage !== 'idle') return false;
      const byId = {}; R.makeDeck().forEach(c => { byId[c.id] = c; });
      const used = new Set(ids);
      const rest = R.shuffle(R.makeDeck().filter(c => !used.has(c.id)), rnd);
      S.forced = rest.concat(ids.slice().reverse().map(id => byId[id]));
      return true;
    },
    setPurse(v) { S.purse = v; refresh(); },
    setBoss(v) { S.boss = v; refresh(); },
    setSpeed() { /* timeScale は ?speed= で指定 */ }
  };

  build();
  S.purse = loadPurse(); loadBoss();
  loadStats(); renderScore(false);
  setStage('idle');
})();
