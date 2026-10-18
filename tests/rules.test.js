// node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rules.js');

const c = (n, s = 0) => ({ id: s * 10 + n, n, s });
const hand = (...ns) => ns.map(x => (Array.isArray(x) ? c(x[0], x[1]) : c(x)));

test('デッキは A〜10 × 4スート = 40枚・重複なし', () => {
  const d = R.makeDeck();
  assert.equal(d.length, 40);
  assert.equal(new Set(d.map(x => x.id)).size, 40);
  assert.ok(d.every(x => x.n >= 1 && x.n <= 10 && x.s >= 0 && x.s <= 3));
});

test('同じseedなら同じシャッフル、違えば違う並び', () => {
  const a = R.shuffle(R.makeDeck(), R.mulberry32(7)).map(x => x.id);
  const b = R.shuffle(R.makeDeck(), R.mulberry32(7)).map(x => x.id);
  const d = R.shuffle(R.makeDeck(), R.mulberry32(8)).map(x => x.id);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, d);
  assert.deepEqual([...a].sort((x, y) => x - y), R.makeDeck().map(x => x.id));
});

test('点数は合計の1の位', () => {
  assert.equal(R.score(hand(7)), 7);
  assert.equal(R.score(hand(7, 8)), 5);
  assert.equal(R.score(hand(10, 10)), 0);
  assert.equal(R.score(hand(5, 5, 9)), 9);
  assert.equal(R.score(hand(9, 9, 9)), 7);
});

test('シッピン: A+4 はプレイヤーのみ・2枚のみ', () => {
  assert.equal(R.evaluate(hand(1, 4), false).type, 'shippin');
  assert.equal(R.evaluate(hand(4, 1), false).mult, 3);
  assert.equal(R.evaluate(hand(1, 4), true).type, 'normal');      // 親のA+4は役ではない
  assert.equal(R.evaluate(hand(1, 4, 2), false).type, 'normal');   // 3枚目を引くと消える(暫定)
});

test('クッピン: A+9 は親のみ', () => {
  assert.equal(R.evaluate(hand(1, 9), true).type, 'kuppin');
  assert.equal(R.evaluate(hand(9, 1), true).type, 'kuppin');
  assert.equal(R.evaluate(hand(1, 9), false).type, 'normal');      // プレイヤーはただの0点
  assert.equal(R.evaluate(hand(1, 9), false).score, 0);
});

test('嵐: 3枚同数。A・3・5・10 は×10、他は×5', () => {
  for (const n of [1, 3, 5, 10]) assert.equal(R.evaluate(hand([n, 0], [n, 1], [n, 2]), false).mult, 10, 'n=' + n);
  for (const n of [2, 4, 6, 7, 8, 9]) assert.equal(R.evaluate(hand([n, 0], [n, 1], [n, 2]), false).mult, 5, 'n=' + n);
  assert.equal(R.evaluate(hand([7, 0], [7, 1], [7, 2]), true).type, 'arashi');
  assert.equal(R.evaluate(hand([7, 0], [7, 1]), false).type, 'normal'); // 2枚では嵐にならない
});

test('順子: 同スート連番3枚(A-2-3 可、10-A の循環は不可)', () => {
  assert.equal(R.evaluate(hand([2, 1], [3, 1], [4, 1]), false).type, 'shuntsu');
  assert.equal(R.evaluate(hand([4, 1], [2, 1], [3, 1]), false).type, 'shuntsu');   // 並び順は不問
  assert.equal(R.evaluate(hand([1, 3], [2, 3], [3, 3]), false).type, 'shuntsu');
  assert.equal(R.evaluate(hand([8, 0], [9, 0], [10, 0]), false).type, 'shuntsu');
  assert.equal(R.evaluate(hand([2, 1], [3, 2], [4, 1]), false).type, 'normal');    // スート混在
  assert.equal(R.evaluate(hand([9, 0], [10, 0], [1, 0]), false).type, 'normal');   // 循環
  assert.equal(R.evaluate(hand([2, 1], [3, 1], [5, 1]), false).type, 'normal');    // 連番でない
  assert.equal(R.evaluate(hand([2, 1], [3, 1], [4, 1]), false).mult, 5);
});

test('親が3枚目を引く条件(暫定: 5点以下、クッピンなら引かない)', () => {
  assert.equal(R.dealerShouldDraw(hand(2, 3)), true);    // 5
  assert.equal(R.dealerShouldDraw(hand(3, 3)), false);   // 6
  assert.equal(R.dealerShouldDraw(hand(10, 10)), true);  // 0
  assert.equal(R.dealerShouldDraw(hand(1, 9)), false);   // クッピン
  assert.equal(R.dealerShouldDraw(hand(2, 3, 1)), false); // すでに3枚
  assert.equal(R.dealerShouldDraw(hand(2)), false);
});

test('プレイヤーが引けるのは2枚の時だけ', () => {
  assert.equal(R.playerCanHit(hand(1)), false);
  assert.equal(R.playerCanHit(hand(1, 2)), true);
  assert.equal(R.playerCanHit(hand(1, 2, 3)), false);
});

test('勝敗: 通常の点数比較と配当(純利益=賭け金×1)', () => {
  let j = R.judge(hand(7, 10), hand(3, 4), 100); // 7 vs 7 → 同点
  assert.equal(j.outcome, 'push');
  assert.equal(j.returned, 100);
  assert.equal(j.delta, 0);
  j = R.judge(hand(8, 10), hand(3, 4), 100); // 8 vs 7
  assert.equal(j.outcome, 'win');
  assert.equal(j.profit, 100);
  assert.equal(j.returned, 200);
  assert.equal(j.delta, 100);
  j = R.judge(hand(6, 10), hand(3, 4), 100); // 6 vs 7
  assert.equal(j.outcome, 'lose');
  assert.equal(j.returned, 0);
  assert.equal(j.delta, -100);
});

test('勝敗: クッピンは無条件で親の勝ち(プレイヤーの嵐・シッピンも無効)', () => {
  let j = R.judge(hand(1, 4), hand(1, 9), 100);
  assert.equal(j.outcome, 'lose');
  assert.equal(j.delta, -100);
  j = R.judge(hand([7, 0], [7, 1], [7, 2]), hand(1, 9), 500);
  assert.equal(j.outcome, 'lose');
  j = R.judge(hand(9, 10), hand(1, 9), 5); // 9点でも親クッピンに負け
  assert.equal(j.outcome, 'lose');
});

test('勝敗: プレイヤーの役は通常の親に勝ち、倍率が適用される', () => {
  let j = R.judge(hand(1, 4), hand(9, 10), 100); // シッピン(5点)対 親9点
  assert.equal(j.outcome, 'win');
  assert.equal(j.profit, 300);
  assert.equal(j.returned, 400);
  assert.equal(j.delta, 300);
  j = R.judge(hand([3, 0], [3, 1], [3, 2]), hand(9, 10), 10); // 嵐×10
  assert.equal(j.profit, 100);
  j = R.judge(hand([2, 0], [2, 1], [2, 2]), hand(9, 10), 10); // 嵐×5
  assert.equal(j.profit, 50);
  j = R.judge(hand([2, 1], [3, 1], [4, 1]), hand(9, 10), 100); // 順子×5
  assert.equal(j.profit, 500);
});

test('勝敗: 親の嵐/順子は通常のプレイヤーに勝つ。役同士は優先順位で決まる', () => {
  let j = R.judge(hand(9, 10), hand([2, 1], [3, 1], [4, 1]), 100); // 親 順子
  assert.equal(j.outcome, 'lose');
  assert.equal(j.delta, -100);
  j = R.judge(hand([5, 0], [5, 1], [5, 2]), hand([2, 1], [3, 1], [4, 1]), 100); // 嵐 > 順子
  assert.equal(j.outcome, 'win');
  j = R.judge(hand([2, 1], [3, 1], [4, 1]), hand([5, 0], [5, 1], [5, 2]), 100); // 順子 < 嵐
  assert.equal(j.outcome, 'lose');
  j = R.judge(hand([2, 1], [3, 1], [4, 1]), hand([6, 2], [7, 2], [8, 2]), 100); // 順子 = 順子
  assert.equal(j.outcome, 'push');
  j = R.judge(hand(1, 4), hand([6, 2], [7, 2], [8, 2]), 100); // シッピン < 順子
  assert.equal(j.outcome, 'lose');
});

test('配当の全パターンで 持ち金の増減 = returned - stake', () => {
  const rnd = R.mulberry32(99);
  for (let i = 0; i < 2000; i++) {
    const deck = R.shuffle(R.makeDeck(), rnd);
    const p = deck.slice(0, 2 + Math.floor(rnd() * 2));
    const d = deck.slice(5, 7 + Math.floor(rnd() * 2));
    const stake = [5, 10, 100, 500][Math.floor(rnd() * 4)];
    const j = R.judge(p, d, stake);
    assert.equal(j.delta, j.returned - stake);
    if (j.outcome === 'lose') assert.equal(j.returned, 0);
    if (j.outcome === 'push') assert.equal(j.returned, stake);
    if (j.outcome === 'win') assert.ok(j.returned > stake);
  }
});
