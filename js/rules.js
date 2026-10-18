/* 旅館カブ — ルール判定 (純粋関数のみ。DOM・乱数以外の副作用なし)
 * 仕様: docs/RULES.md  「暫定」の項目は CONFIG で切り替える。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KabuRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CONFIG = Object.freeze({
    DEALER_DRAW_MAX: 5,          // 暫定: 親は2枚で5点以下なら3枚目を引く
    NORMAL_MULT: 1,              // 暫定: 通常勝ちは賭け金×1
    PAYOUT_IS_NET: true,         // 暫定: 倍率は純利益(賭け金は別途返却)
    TIE: 'push',                 // 暫定: 引き分けは賭け金返却
    DEALER_FIRST_FACE_UP: false, // 暫定: 親の1枚目も伏せる(指示書)
    SHIPPIN_NAME: 'シッピン',    // 出典の表記。指示書は「ミッピン」
    STORM_BIG: [1, 3, 5, 10],    // 嵐 ×10 の数字(出典)
    ROLE_RANK: { kuppin: 4, arashi: 3, shuntsu: 2, shippin: 1, normal: 0 } // 暫定
  });

  const SUITS = ['spade', 'heart', 'diamond', 'club'];

  function makeDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) for (let n = 1; n <= 10; n++) d.push({ id: s * 10 + n, n, s });
    return d;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(deck, rnd) {
    const r = rnd || Math.random;
    const a = deck.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function score(cards) {
    let t = 0;
    for (const c of cards) t += c.n;
    return t % 10;
  }

  /** 手札の役を判定する。isDealer=親の手札か。 */
  function evaluate(cards, isDealer) {
    const sc = score(cards);
    const ns = cards.map(c => c.n);
    if (cards.length === 2) {
      if (isDealer && ns.includes(1) && ns.includes(9)) {
        return { type: 'kuppin', name: 'クッピン', mult: 0, score: sc };
      }
      if (!isDealer && ns.includes(1) && ns.includes(4)) {
        return { type: 'shippin', name: CONFIG.SHIPPIN_NAME, mult: 3, score: sc };
      }
    }
    if (cards.length === 3) {
      if (ns[0] === ns[1] && ns[1] === ns[2]) {
        const big = CONFIG.STORM_BIG.includes(ns[0]);
        return { type: 'arashi', name: '嵐', mult: big ? 10 : 5, score: sc };
      }
      const sorted = cards.slice().sort((a, b) => a.n - b.n);
      const sameSuit = sorted.every(c => c.s === sorted[0].s);
      if (sameSuit && sorted[1].n === sorted[0].n + 1 && sorted[2].n === sorted[1].n + 1) {
        return { type: 'shuntsu', name: '順子', mult: 5, score: sc };
      }
    }
    return { type: 'normal', name: sc + '点', mult: CONFIG.NORMAL_MULT, score: sc };
  }

  function isSpecial(role) { return role.type !== 'normal'; }

  /** 親が3枚目を引くか(暫定ルール)。 */
  function dealerShouldDraw(dealerCards) {
    if (dealerCards.length !== 2) return false;
    if (evaluate(dealerCards, true).type === 'kuppin') return false;
    return score(dealerCards) <= CONFIG.DEALER_DRAW_MAX;
  }

  function playerCanHit(playerCards) { return playerCards.length === 2; }

  /**
   * 勝敗と配当。
   * @returns {{outcome:'win'|'lose'|'push', reason:string, player:object, dealer:object,
   *            profit:number, returned:number, delta:number}}
   *   profit   = 純利益(勝ちのみ)
   *   returned = 持ち金に戻す額(賭け確定時に控除済みの賭け金を含む)
   *   delta    = この勝負での持ち金の増減(賭け金控除を通算した損益)
   */
  function judge(playerCards, dealerCards, stake) {
    const p = evaluate(playerCards, false);
    const d = evaluate(dealerCards, true);
    const R = CONFIG.ROLE_RANK;
    let outcome, reason;

    if (d.type === 'kuppin') {
      outcome = 'lose'; reason = '親のクッピン(プレイヤーの役は無効)';
    } else if (isSpecial(p) && isSpecial(d)) {
      if (R[p.type] > R[d.type]) { outcome = 'win'; reason = p.name + 'が' + d.name + 'に勝ち'; }
      else if (R[p.type] < R[d.type]) { outcome = 'lose'; reason = d.name + 'に負け'; }
      else { outcome = 'push'; reason = '同じ役で引き分け'; }
    } else if (isSpecial(p)) {
      outcome = 'win'; reason = p.name;
    } else if (isSpecial(d)) {
      outcome = 'lose'; reason = '親の' + d.name;
    } else if (p.score > d.score) {
      outcome = 'win'; reason = '点数勝ち';
    } else if (p.score < d.score) {
      outcome = 'lose'; reason = '点数負け';
    } else {
      outcome = 'push'; reason = '同点';
    }

    let profit = 0, returned = 0;
    if (outcome === 'win') {
      profit = stake * p.mult;
      returned = CONFIG.PAYOUT_IS_NET ? stake + profit : profit;
    } else if (outcome === 'push') {
      returned = CONFIG.TIE === 'push' ? stake : 0;
    }
    return { outcome, reason, player: p, dealer: d, profit, returned, delta: returned - stake };
  }

  return { CONFIG, SUITS, makeDeck, mulberry32, shuffle, score, evaluate, isSpecial,
           dealerShouldDraw, playerCanHit, judge };
});
