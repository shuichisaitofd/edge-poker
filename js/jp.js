/* 日本語の折り返しを文節の切れ目に寄せる。助詞・句読点の後ろだけで改行できるようにする。 */
(function () {
  'use strict';
  const K = window.Kabu = window.Kabu || {};
  const PART = 'はがをにでともへやの';
  const CLOSE = '、。，．！？」』）)…';
  const isHira = c => /[ぁ-ゟ]/.test(c);
  function chunks(s) {
    const out = []; let cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i], n = s[i + 1];
      cur += c;
      if (!n) break;
      const brk = CLOSE.includes(c) || (PART.includes(c) && !(c === 'の' && 'こそあど'.includes(s[i - 1] || '')) && !isHira(n) && !/[\s、。ー]/.test(n)) || '「（('.includes(n);
      if (brk && cur.length >= 2) { out.push(cur); cur = ''; }
    }
    if (cur) out.push(cur);
    return out;
  }
  function apply(el) {
    if (!el) return el;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(t => {
      const s = t.nodeValue;
      if (!s.trim() || !/[　-鿿]/.test(s) || t.parentNode.classList && t.parentNode.classList.contains('ph')) return;
      const f = document.createDocumentFragment();
      chunks(s).forEach(c => { const sp = document.createElement('span'); sp.className = 'ph'; sp.textContent = c; f.appendChild(sp); });
      t.parentNode.replaceChild(f, t);
    });
    return el;
  }
  function set(el, s) { el.textContent = s; return apply(el); }
  K.jp = { apply, set, chunks };
})();
