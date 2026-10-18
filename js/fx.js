/* 演出: カットイン・画面揺れ・周囲の男の一言(テキスト)。常時演出はしない。 */
(function () {
  'use strict';
  window.Kabu = window.Kabu || {};

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cutTimer = 0, cutResolve = null, shoutEl = null, shoutTimer = 0;

  function cutin(text, kind) {
    const el = document.getElementById('cutin');
    const txt = document.getElementById('cutinText');
    if (!el) return Promise.resolve();
    txt.textContent = text;
    el.dataset.kind = kind || 'win';
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    return new Promise(res => {
      cutResolve = res;
      cutTimer = setTimeout(endCut, reduce ? 500 : 1050);
    });
  }
  function endCut() {
    clearTimeout(cutTimer);
    const el = document.getElementById('cutin');
    if (el) el.classList.remove('on');
    if (cutResolve) { const r = cutResolve; cutResolve = null; r(); }
  }

  function shake() {
    if (reduce) return;
    const f = document.getElementById('field');
    f.classList.remove('shake');
    void f.offsetWidth;
    f.classList.add('shake');
    setTimeout(() => f.classList.remove('shake'), 420);
  }

  /** corner: tl|tr|bl|br — 四隅の男の近くに短い一言を出す */
  function shout(text, corner) {
    const f = document.getElementById('field');
    if (shoutEl) { shoutEl.remove(); clearTimeout(shoutTimer); }
    const el = document.createElement('div');
    el.className = 'shout shout-' + (corner || 'tl');
    el.textContent = text;
    el.setAttribute('aria-hidden', 'true');
    f.appendChild(el);
    shoutEl = el;
    shoutTimer = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 1500);
  }

  Kabu.fx = { cutin, endCut, shake, shout, reduce };
})();
