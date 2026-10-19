/* お助けアイテム: 定義・アイコン・抽選ルーレット・バイクの配達演出・取得時の拡大表示・手持ちの表示。
 * 状態(手持ち/連敗数)は game.js が持つ。ここは見た目と演出だけ。 */
(function () {
  'use strict';
  window.Kabu = window.Kabu || {};
  const $ = id => document.getElementById(id);
  const A = () => Kabu.audio;

  const DEFS = {
    salt: { id: 'salt', img: 'assets/item-salt.webp', name: 'ようすけの89点の伯方の塩', short: '89点の塩', desc: '塩をまく。この勝負、あきはもう1枚を引けなくなる。', when: '「勝負/もう1枚」の前に使える' },
    strong: { id: 'strong', img: 'assets/item-strong.webp', name: 'ひろたんのストロング', short: 'ストロング', desc: 'ハイリスク・ハイリターン。この勝負、勝てば配当2倍、負ければ負けも2倍。', when: '「勝負/もう1枚」の前に使える' },
    baken: { id: 'baken', img: 'assets/item-baken.webp', name: 'エノの万馬券', short: '万馬券', desc: '賭けた場を、隣の場に乗り換える。賭け金はそのまま。', when: '「勝負/もう1枚」の前に使える' },
    manju: { id: 'manju', img: 'assets/item-manju.webp', name: 'よく喋るおじさんの焼きまんじゅう', short: '焼きまんじゅう', desc: '次の勝負で負けても、賭け金が全額戻る(引き分け扱い)。', when: '「勝負/もう1枚」の前に使える', special: true }
  };
  const IDS = Object.keys(DEFS);
  const POOL = IDS.filter(id => !DEFS[id].special);          // ルーレットの景品(焼きまんじゅうはバイク専用)
  const pickId = rnd => POOL[Math.floor((rnd || Math.random)() * POOL.length)];
  const img = (id, cls) => '<img class="' + (cls || 'item-img') + '" src="' + DEFS[id].img + '" alt="" draggable="false">';
  IDS.concat(['bike']).forEach(id => { const i = new Image(); i.src = id === 'bike' ? 'assets/item-bike.webp' : DEFS[id].img; });   // 先読み

  let waiter = null, timers = [], anims = [];
  const wait = (ms, ts) => new Promise(r => { const t = setTimeout(r, Math.max(1, ms * ts)); timers.push(t); });
  const fxEl = () => $('itemfx');

  function open(mode) {
    const el = fxEl();
    el.hidden = false; el.dataset.mode = mode;
    $('field').classList.add('item-fx');
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    $('ifxReveal').hidden = true; $('ifxReel').hidden = true; $('ifxBike').hidden = true; $('ifxDrop').hidden = true; $('ifxTitle').hidden = true;
  }
  function close() {
    const el = fxEl();
    el.classList.remove('on'); el.hidden = true;
    $('field').classList.remove('item-fx');
    anims.forEach(a => { try { a.cancel(); } catch (e) { /* ignore */ } }); anims = [];
  }
  function cancel() {
    timers.forEach(clearTimeout); timers = [];
    close();
    if (waiter) { const w = waiter; waiter = null; w(); }
  }

  /** 取得時: 後光+拡大して、名前と説明を出す。タップで閉じる */
  async function reveal(id, ts, note) {
    const d = DEFS[id];
    $('ifxIcon').innerHTML = img(id, 'item-img');
    $('ifxName').textContent = d.name;
    $('ifxDesc').textContent = d.desc;
    $('ifxWhen').textContent = note || d.when;
    $('ifxTitle').hidden = true; $('ifxReel').hidden = true; $('ifxBike').hidden = true; $('ifxDrop').hidden = true;
    const rv = $('ifxReveal'); rv.hidden = false;
    A().play('item');
    const card = rv.querySelector('.ifx-card');
    anims.push(card.animate([{ transform: 'scale(.1) rotate(-12deg)', opacity: 0 }, { transform: 'scale(1.12) rotate(2deg)', opacity: 1, offset: .65 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 650 * ts, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'both' }));
    anims.push(rv.querySelector('.ifx-halo').animate([{ opacity: 0, transform: 'scale(.2) rotate(0)' }, { opacity: 1, transform: 'scale(1) rotate(60deg)', offset: .5 }, { opacity: 1, transform: 'scale(1) rotate(180deg)' }], { duration: 3200 * ts, easing: 'ease-out', fill: 'both', iterations: Infinity }));
    await wait(700, ts);
    await new Promise(res => { waiter = res; const el = fxEl(); const h = () => { el.removeEventListener('click', h); waiter = null; res(); }; el.addEventListener('click', h); });
    close();
  }

  /** 新規スタート: ルーレットで1個決まる */
  async function roulette(finalId, ts) {
    open('roulette');
    $('ifxTitle').textContent = 'お助けアイテム 抽選'; $('ifxTitle').hidden = false;
    const reel = $('ifxReel'); reel.hidden = false;
    const seq = [];
    for (let i = 0; i < 22; i++) seq.push(POOL[i % POOL.length]);
    seq.push(finalId);
    for (let i = 0; i < seq.length; i++) {
      const d = DEFS[seq[i]];
      reel.querySelector('.ifx-ico').innerHTML = img(seq[i], 'item-img');
      reel.querySelector('b').textContent = d.short;
      A().play('reel');
      await wait(55 + Math.pow(i / seq.length, 3) * 420, ts);
      if (!fxEl() || fxEl().hidden) return;
    }
    reel.classList.add('stop'); A().play('impact');
    await wait(700, ts);
    reel.classList.remove('stop');
    if (fxEl().hidden) return;
    await reveal(finalId, ts, '新しい挑戦の最初の1個');
  }

  /** 3連敗: 画面の横からバイクが来て、中央で止まってアイテムを落とす */
  async function bikeDrop(finalId, ts) {
    open('bike');
    const el = fxEl(), W = el.getBoundingClientRect().width || 390;
    const bike = $('ifxBike'); bike.hidden = false;
    const BASE = 'translate(-50%,-50%) ';
    const a1 = bike.animate([{ transform: BASE + 'translateX(' + (W * 0.85) + 'px)' }, { transform: BASE + 'translateX(0)' }], { duration: 950 * ts, easing: 'cubic-bezier(.1,.7,.2,1)', fill: 'both' });
    anims.push(a1);
    A().play('engine');
    await wait(950, ts); if (el.hidden) return;
    Kabu.fx.shake(1);
    anims.push(bike.animate([{ transform: BASE + 'translateX(0) rotate(0)' }, { transform: BASE + 'translateX(-6px) rotate(-4deg)', offset: .3 }, { transform: BASE + 'translateX(0) rotate(0)' }], { duration: 300 * ts, fill: 'both' }));
    await wait(320, ts); if (el.hidden) return;
    const drop = $('ifxDrop'); drop.hidden = false; drop.innerHTML = img(finalId, 'item-img');
    anims.push(drop.animate([{ transform: 'translate(-50%,-10px) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,70px) scale(1)', opacity: 1, offset: .5 }, { transform: 'translate(-50%,44px) scale(1)', offset: .7 }, { transform: 'translate(-50%,70px) scale(1)' }], { duration: 650 * ts, fill: 'both' }));
    A().play('land');
    await wait(900, ts); if (el.hidden) return;
    anims.push(bike.animate([{ transform: BASE + 'translateX(0)' }, { transform: BASE + 'translateX(' + (-W) + 'px)' }], { duration: 700 * ts, easing: 'cubic-bezier(.6,0,.9,.4)', fill: 'both' }));
    A().play('engine');
    await wait(560, ts); if (el.hidden) return;
    await reveal(finalId, ts, '3連敗のお助け。バイクが届けてくれた');
  }

  /** 手持ちの表示。list=[id,...] */
  function renderRack(list) {
    const rack = $('items');
    rack.innerHTML = list.map((id, i) => '<button type="button" class="item-btn" data-idx="' + i + '" data-item="' + id + '" aria-label="' + DEFS[id].name + ': ' + DEFS[id].desc + '">' + img(id, 'item-img') + '<span>' + DEFS[id].short + '</span></button>').join('');
    rack.dataset.count = list.length;
  }

  Kabu.items = { DEFS, IDS, POOL, pickId, roulette, bikeDrop, reveal, renderRack, cancel };
})();
