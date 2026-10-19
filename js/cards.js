/* 札と硬貨のDOM生成。画像に絵を焼き込まず、点数・マークは全てDOM/SVGで描く。 */
(function () {
  'use strict';
  window.Kabu = window.Kabu || {};

  const SUIT_NAMES = ['スペード', 'ハート', 'ダイヤ', 'クラブ'];
  // suit index: 0=spade 1=heart 2=diamond 3=club (rules.js の SUITS と同じ並び)
  const SUIT_SVG = [
    '<path d="M12 1.8C9.6 5.6 3 9.4 3 14.3c0 2.7 2.1 4.5 4.4 4.5 1.5 0 2.8-.7 3.6-1.9-.1 2.3-.9 4-2.7 5.1h7.4c-1.8-1.1-2.6-2.8-2.7-5.1.8 1.2 2.1 1.9 3.6 1.9 2.3 0 4.4-1.8 4.4-4.5C21 9.4 14.4 5.6 12 1.8z"/>',
    '<path d="M12 21.5C6.2 16.6 2.5 13 2.5 8.7 2.5 5.8 4.7 3.6 7.4 3.6c1.9 0 3.7 1 4.6 2.7.9-1.7 2.7-2.7 4.6-2.7 2.7 0 4.9 2.2 4.9 5.1 0 4.3-3.7 7.9-9.5 12.8z"/>',
    '<path d="M12 1.5 20.5 12 12 22.5 3.5 12z"/>',
    '<circle cx="12" cy="6.9" r="4.6"/><circle cx="6.3" cy="14.2" r="4.6"/><circle cx="17.7" cy="14.2" r="4.6"/><circle cx="12" cy="12" r="3.4"/><path d="M10.4 22.5c.9-1.7 1.4-3.7 1.5-6h.2c.1 2.3.6 4.3 1.5 6z"/>'
  ];
  const isRed = s => s === 1 || s === 2;

  function suitSvg(s, cls) {
    return '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">' + SUIT_SVG[s] + '</svg>';
  }

  // ピップ配置 (x,y は 0..1)。y>0.5 は上下反転して描く
  const L = .24, R = .76, C = .5;
  const PIPS = {
    1: [[C, .5]],
    2: [[C, .08], [C, .92]],
    3: [[C, .08], [C, .5], [C, .92]],
    4: [[L, .08], [R, .08], [L, .92], [R, .92]],
    5: [[L, .08], [R, .08], [C, .5], [L, .92], [R, .92]],
    6: [[L, .08], [R, .08], [L, .5], [R, .5], [L, .92], [R, .92]],
    7: [[L, .08], [R, .08], [C, .29], [L, .5], [R, .5], [L, .92], [R, .92]],
    8: [[L, .08], [R, .08], [C, .29], [L, .5], [R, .5], [C, .71], [L, .92], [R, .92]],
    9: [[L, .08], [R, .08], [L, .36], [R, .36], [C, .5], [L, .64], [R, .64], [L, .92], [R, .92]],
    10: [[L, .08], [R, .08], [C, .22], [L, .36], [R, .36], [L, .64], [R, .64], [C, .78], [L, .92], [R, .92]]
  };

  function rankLabel(n) { return n === 1 ? 'A' : String(n); }

  /** 札要素。data-face = down|up。flip は .card-inner の transform で行う(要素は作り直さない)。 */
  function createCard(card) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = card.id;
    el.dataset.n = card.n;
    el.dataset.suit = card.s;
    el.dataset.face = 'down';
    el.dataset.state = 'new';
    const label = SUIT_NAMES[card.s] + 'の' + rankLabel(card.n);
    let pips = '';
    for (const [x, y] of PIPS[card.n]) {
      pips += '<span class="pip' + (card.n === 1 ? ' pip-ace' : '') + (y > .5 ? ' flip' : '') +
        '" style="left:' + (x * 100) + '%;top:' + (y * 100) + '%">' + suitSvg(card.s, 'pip-svg') + '</span>';
    }
    el.innerHTML =
      '<div class="card-lift"><div class="card-inner">' +
      '<div class="face' + (isRed(card.s) ? ' red' : '') + '" role="img" aria-label="' + label + '">' +
      '<span class="idx tl"><b>' + rankLabel(card.n) + '</b>' + suitSvg(card.s, 'idx-svg') + '</span>' +
      '<span class="idx br"><b>' + rankLabel(card.n) + '</b>' + suitSvg(card.s, 'idx-svg') + '</span>' +
      '<div class="pips">' + pips + '</div></div>' +
      '<div class="back" aria-hidden="true"></div></div></div>';
    return el;
  }

  // 実写硬貨(assets/coin-N.webp 透過PNG相当)。クラス名 coin-svg は既存CSS互換のため維持
  function coinSvg(amount) {
    return '<img class="coin-svg" src="assets/coin-' + amount + '.webp" alt="" draggable="false" width="256" height="256">';
  }

  Kabu.cards = { createCard, coinSvg, rankLabel, SUIT_NAMES };
})();
