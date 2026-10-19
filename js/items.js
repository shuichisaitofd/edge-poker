/* お助けアイテム: 定義・アイコン・抽選ルーレット・バイクの配達演出・取得時の拡大表示・手持ちの表示。
 * 状態(手持ち/連敗数)は game.js が持つ。ここは見た目と演出だけ。 */
(function () {
  'use strict';
  window.Kabu = window.Kabu || {};
  const $ = id => document.getElementById(id);
  const A = () => Kabu.audio;

  const ICON = {
    peek: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M3 24C10 13 17 9 24 9s14 4 21 15c-7 11-14 15-21 15S10 35 3 24z" fill="#fff8e6" stroke="#2b1a0e" stroke-width="2.5" stroke-linejoin="round"/><circle cx="24" cy="24" r="8.5" fill="#24365c"/><circle cx="24" cy="24" r="3.6" fill="#0c0f1a"/><circle cx="27" cy="21" r="2" fill="#fff"/></svg>',
    redraw: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="12" y="7" width="24" height="34" rx="3" fill="#fff8e6" stroke="#2b1a0e" stroke-width="2.5"/><path d="M33 17a10 10 0 0 0-17 1M15 31a10 10 0 0 0 17-1" fill="none" stroke="#a52b1a" stroke-width="3" stroke-linecap="round"/><path d="M16 11v7h7M32 37v-7h-7" fill="none" stroke="#a52b1a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    charm: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 9h20l3 6v24a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V15z" fill="#a52b1a" stroke="#2b1a0e" stroke-width="2.5" stroke-linejoin="round"/><path d="M11 15h26" stroke="#2b1a0e" stroke-width="2.5"/><path d="M24 4v8" stroke="#c9a24a" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="4.5" r="2.5" fill="#c9a24a"/><text x="24" y="35" text-anchor="middle" font-size="15" font-weight="700" fill="#f3d98a" font-family="serif">守</text></svg>'
  };

  const DEFS = {
    peek: { id: 'peek', name: 'のぞき見', short: 'のぞき見', desc: 'あきの2枚目を、こっそり表に返す。', when: '「勝負/もう1枚」の前に使える' },
    redraw: { id: 'redraw', name: '引き直し', short: '引き直し', desc: '自分の2枚目を捨てて、引き直す。', when: '「勝負/もう1枚」の前に使える' },
    charm: { id: 'charm', name: 'お守り', short: 'お守り', desc: 'この勝負に負けても、賭け金の半分が戻る。', when: '「勝負/もう1枚」の前に使える' }
  };
  const IDS = Object.keys(DEFS);
  const pickId = rnd => IDS[Math.floor((rnd || Math.random)() * IDS.length)];

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
    $('ifxIcon').innerHTML = ICON[id];
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
    for (let i = 0; i < 22; i++) seq.push(IDS[i % IDS.length]);
    seq.push(finalId);
    for (let i = 0; i < seq.length; i++) {
      const d = DEFS[seq[i]];
      reel.querySelector('.ifx-ico').innerHTML = ICON[seq[i]];
      reel.querySelector('b').textContent = d.name;
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
    const drop = $('ifxDrop'); drop.hidden = false; drop.innerHTML = ICON[finalId];
    anims.push(drop.animate([{ transform: 'translate(-50%,-10px) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,60px) scale(1)', opacity: 1, offset: .5 }, { transform: 'translate(-50%,36px) scale(1)', offset: .7 }, { transform: 'translate(-50%,60px) scale(1)' }], { duration: 650 * ts, fill: 'both' }));
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
    rack.innerHTML = list.map((id, i) => '<button type="button" class="item-btn" data-idx="' + i + '" data-item="' + id + '" aria-label="' + DEFS[id].name + ': ' + DEFS[id].desc + '">' + ICON[id] + '<span>' + DEFS[id].short + '</span></button>').join('');
    rack.dataset.count = list.length;
  }

  Kabu.items = { DEFS, IDS, ICON, pickId, roulette, bikeDrop, reveal, renderRack, cancel };
})();
