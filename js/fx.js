/* 演出: カットイン・画面揺れ・ゴゴゴ(拡大+振動)・ざわ…・周囲の男の一言。
 * 札/硬貨のDOMには触れず、#field 全体のtransformと重ねる演出レイヤーだけを動かす。 */
(function () {
  'use strict';
  window.Kabu = window.Kabu || {};

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cutTimer = 0, cutResolve = null, shoutEl = null, shoutTimer = 0, rumbleAnim = null, omenTimer = 0;
  const $ = id => document.getElementById(id);

  function cutin(text, kind, sub) {
    const el = $('cutin');
    if (!el) return Promise.resolve();
    $('cutinText').textContent = text;
    $('cutinSub').textContent = sub || '';
    el.dataset.kind = kind || 'win';
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    return new Promise(res => {
      cutResolve = res;
      cutTimer = setTimeout(endCut, reduce ? 500 : (kind === 'special' ? 1700 : 1300));
    });
  }
  function endCut() {
    clearTimeout(cutTimer);
    const el = $('cutin');
    if (el) el.classList.remove('on');
    if (cutResolve) { const r = cutResolve; cutResolve = null; r(); }
  }

  /** power: 1=通常 2=強 */
  function shake(power) {
    if (reduce) return;
    const f = $('field');
    const a = 5 * (power || 1);
    const fr = [];
    for (let i = 0; i < 14; i++) {
      const k = 1 - i / 14;
      fr.push({ transform: 'translate(' + ((Math.random() * 2 - 1) * a * k).toFixed(1) + 'px,' + ((Math.random() * 2 - 1) * a * k).toFixed(1) + 'px)' });
    }
    fr.push({ transform: 'none' });
    f.animate(fr, { duration: 380 + 120 * (power || 1) });
  }

  /** corner: tl|tr|bl|br — 四隅の男の近くに短い一言を出す(吹き出し無しの太字) */
  function shout(text, corner) {
    const f = $('field');
    if (shoutEl) { shoutEl.remove(); clearTimeout(shoutTimer); }
    const el = document.createElement('div');
    el.className = 'shout shout-' + (corner || 'tl');
    el.textContent = text;
    el.setAttribute('aria-hidden', 'true');
    f.appendChild(el);
    shoutEl = el;
    shoutTimer = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 1500);
  }

  /** 画面中央の「ざわ…」。pos: c(中央) / l,r(縦書き両端の「ゴゴゴ」) */
  function omen(kind, text, ms) {
    const o = $('omen');
    if (!o) return;
    clearTimeout(omenTimer);
    o.dataset.kind = kind;
    o.dataset.text = kind === 'nine' ? text : '';
    o.querySelector('.omen-c').textContent = kind === 'zawa' ? text : '';
    const gogo = kind === 'gogo' ? text : '';
    o.querySelector('.omen-l').textContent = gogo;
    o.querySelector('.omen-r').textContent = gogo;
    o.classList.remove('on'); void o.offsetWidth; o.classList.add('on');
    omenTimer = setTimeout(() => o.classList.remove('on'), ms || 1200);
  }
  function omenOff() { clearTimeout(omenTimer); const o = $('omen'); if (o) o.classList.remove('on'); }

  /** 親札めくり前の「ゴゴゴ…」: originEl 付近へじわじわ拡大しつつ振動。resolve で拡大状態のまま保持。 */
  function rumble(originEl, ms) {
    if (reduce) return Promise.resolve();
    const f = $('field');
    const fr = f.getBoundingClientRect(), r = originEl.getBoundingClientRect();
    f.style.transformOrigin = (r.left + r.width / 2 - fr.left) + 'px ' + (r.top + r.height / 2 - fr.top) + 'px';
    const N = 36, frames = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, sc = 1 + 0.15 * Math.pow(t, 1.6), a = 0.6 + 4.2 * t;
      frames.push({ transform: 'translate(' + ((Math.random() * 2 - 1) * a).toFixed(1) + 'px,' + ((Math.random() * 2 - 1) * a).toFixed(1) + 'px) scale(' + sc.toFixed(4) + ')' });
    }
    rumbleAnim = f.animate(frames, { duration: Math.max(1, ms), fill: 'forwards', easing: 'linear' });
    return rumbleAnim.finished.catch(() => {});
  }
  /** ゴゴゴ解除: 白フラッシュ+反動で元の大きさへ */
  function release() {
    const f = $('field');
    if (rumbleAnim) { rumbleAnim.cancel(); rumbleAnim = null; }
    omenOff();
    if (reduce) { f.style.transformOrigin = ''; return; }
    const a = f.animate([
      { transform: 'scale(1.2)' }, { transform: 'scale(.985)', offset: .35 }, { transform: 'scale(1)' }
    ], { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1)' });
    a.finished.then(() => { f.style.transformOrigin = ''; }).catch(() => { f.style.transformOrigin = ''; });
    flash();
  }
  function flash() {
    const f = $('field');
    const d = document.createElement('div');
    d.className = 'flash';
    f.appendChild(d);
    d.animate([{ opacity: .9 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' }).finished.then(() => d.remove()).catch(() => d.remove());
  }

  /** 9が揃った瞬間に、その場(卓の上)で左下・右下の画面外から小銭がぱしゃーんと飛び散る */
  function clearCoins() { document.querySelectorAll('#field .rain-coin').forEach(c => c.remove()); }
  /** 左下・右下の画面外から、斜め上へ勢いよく放物線で飛び散る小銭 */
  function coinBurst(ts) {
    if (reduce) return;
    const f = $('field');
    ts = ts || 1;
    const fr = f.getBoundingClientRect(), W = fr.width, H = fr.height;
    const g = H * 1.5;                                  // 重力(px/s²)
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < 30; i++) {
        const c = document.createElement('img');
        c.src = 'assets/coin-' + [5, 10, 100, 500][(i + side) % 4] + '.webp';
        c.className = 'rain-coin'; c.alt = ''; c.draggable = false;
        const sz = 30 + Math.random() * 24;
        c.style.cssText = 'left:0;top:0;width:' + sz.toFixed(0) + 'px;height:' + sz.toFixed(0) + 'px';
        f.appendChild(c);
        const dir = side === 0 ? 1 : -1;
        const x0 = side === 0 ? -sz : W, y0 = H * (0.82 + Math.random() * 0.16);
        const vx = dir * W * (0.45 + Math.random() * 0.75);            // 反対側の端近くまで届く
        const vy = -H * (0.8 + Math.random() * 0.65);                  // 上向きの初速
        const T = 2.6;                                                  // 落ちきるまで(秒)
        const rot = (Math.random() < .5 ? -1 : 1) * (360 + Math.random() * 900);
        const fr2 = [], N = 18;
        for (let k = 0; k <= N; k++) {
          const t = T * k / N;
          fr2.push({ transform: 'translate(' + (x0 + vx * t).toFixed(1) + 'px,' + (y0 + vy * t + 0.5 * g * t * t).toFixed(1) + 'px) rotate(' + (rot * k / N).toFixed(0) + 'deg)', offset: k / N });
        }
        c.animate(fr2, { duration: T * 1000 * ts, delay: Math.random() * 260 * ts, easing: 'linear', fill: 'both' }).finished.then(() => c.remove()).catch(() => c.remove());
      }
    }
  }

  /** 塩まき: あきの頭上から白い粒がぱらぱらと降る */
  function saltBurst(ts) {
    if (reduce) return;
    const f = $('field'), fr = f.getBoundingClientRect();
    ts = ts || 1;
    for (let i = 0; i < 46; i++) {
      const g = document.createElement('i');
      g.className = 'salt-grain';
      const sz = 3 + Math.random() * 4;
      const x = fr.width * (0.2 + Math.random() * 0.6), y0 = fr.height * 0.06;
      g.style.cssText = 'left:0;top:0;width:' + sz.toFixed(1) + 'px;height:' + sz.toFixed(1) + 'px';
      f.appendChild(g);
      const drift = (Math.random() * 2 - 1) * 70, fall = fr.height * (0.2 + Math.random() * 0.22);
      g.animate([{ transform: 'translate(' + x + 'px,' + y0 + 'px) rotate(0)', opacity: 1 }, { transform: 'translate(' + (x + drift) + 'px,' + (y0 + fall) + 'px) rotate(' + (Math.random() * 360).toFixed(0) + 'deg)', opacity: 0 }],
        { duration: (900 + Math.random() * 700) * ts, delay: Math.random() * 280 * ts, easing: 'cubic-bezier(.3,.6,.5,1)', fill: 'both' }).finished.then(() => g.remove()).catch(() => g.remove());
    }
  }
  Kabu.fx = { saltBurst, coinBurst, clearCoins, cutin, endCut, shake, shout, omen, omenOff, rumble, release, flash, reduce };
})();
