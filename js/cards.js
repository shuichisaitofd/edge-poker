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

  // 日本円硬貨(SVG)。写真ではなく簡略表現。持ち金(円表記のプレート)とは見た目で区別する。
  const COIN = {
    5: { a: '#f0dc8a', b: '#c9a444', c: '#7d6325', ink: '#6a531c', hole: true, text: '五', sub: '5円' },
    10: { a: '#f2b58b', b: '#b8653a', c: '#6d3320', ink: '#5a2814', text: '10', sub: '' },
    100: { a: '#fbfbfb', b: '#c3c5c7', c: '#7d8084', ink: '#5b5e62', text: '100', sub: '' },
    500: { a: '#fff3cd', b: '#cdb683', c: '#7c6a44', ink: '#5e4f2f', text: '500', sub: '' }
  };
  let coinSeq = 0;
  function coinSvg(amount) {
    const k = COIN[amount];
    const id = 'cg' + (++coinSeq);
    let face = '';
    if (k.hole) {
      face =
        '<path fill-rule="evenodd" d="M50 50m-40 0a40 40 0 1 0 80 0a40 40 0 1 0-80 0zM50 50m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0z" fill="url(#' + id + ')"/>' +
        '<circle cx="50" cy="50" r="10" fill="none" stroke="' + k.c + '" stroke-width="2.2"/>' +
        '<circle cx="50" cy="50" r="33" fill="none" stroke="' + k.ink + '" stroke-opacity=".5" stroke-width="1.2" stroke-dasharray="2.2 3.2"/>' +
        '<text x="50" y="76" text-anchor="middle" font-size="17" font-weight="800" fill="' + k.ink + '" font-family="serif">' + k.sub + '</text>' +
        '<text x="50" y="30" text-anchor="middle" font-size="15" font-weight="800" fill="' + k.ink + '" font-family="serif">' + k.text + '</text>';
    } else {
      face =
        '<circle cx="50" cy="50" r="40" fill="url(#' + id + ')"/>' +
        '<circle cx="50" cy="50" r="32.5" fill="none" stroke="' + k.ink + '" stroke-opacity=".45" stroke-width="1.4"/>' +
        '<text x="50" y="' + (amount === 10 ? 58 : 57) + '" text-anchor="middle" font-size="' + (amount === 10 ? 30 : amount === 500 ? 25 : 26) +
        '" font-weight="800" fill="' + k.ink + '" font-family="Georgia,serif" letter-spacing="-1">' + k.text + '</text>' +
        '<text x="50" y="76" text-anchor="middle" font-size="12" font-weight="700" fill="' + k.ink + '" font-family="serif" opacity=".85">円</text>';
    }
    return '<svg class="coin-svg" viewBox="0 0 100 100" aria-hidden="true">' +
      '<defs><radialGradient id="' + id + '" cx=".34" cy=".3" r=".85"><stop offset="0" stop-color="' + k.a + '"/>' +
      '<stop offset=".62" stop-color="' + k.b + '"/><stop offset="1" stop-color="' + k.c + '"/></radialGradient></defs>' +
      '<circle cx="50" cy="50" r="46" fill="' + k.c + '"/>' +
      '<circle cx="50" cy="50" r="43.5" fill="' + k.b + '"/>' + face +
      '<ellipse cx="38" cy="30" rx="22" ry="11" fill="#fff" opacity=".18" transform="rotate(-28 38 30)"/>' +
      '</svg>';
  }

  Kabu.cards = { createCard, coinSvg, rankLabel, SUIT_NAMES };
})();
