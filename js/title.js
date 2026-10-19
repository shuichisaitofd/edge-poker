/* スタート画面 → ロード画面(あらすじが1行ずつ流れる) → ゲーム。
 * テスト/スクショ用(?seed= または ?test)ではスキップ。?title=1 で強制表示。 */
(function () {
  'use strict';
  const el = document.getElementById('title');
  if (!el) return;
  if (document.documentElement.classList.contains('skip-title')) { el.remove(); return; }
  const A = Kabu.audio;
  const params = new URLSearchParams(location.search);
  const scale = parseFloat(params.get('speed')) || 1;
  const reduce = Kabu.fx && Kabu.fx.reduce;
  const T = ms => ms * scale * (reduce ? 0.3 : 1);
  let done = false;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, T(ms)));

  function finish() {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    el.dataset.phase = 'out';
    setTimeout(() => el.remove(), T(600));
    document.getElementById('field').dataset.ready = '1';
  }

  // セーブがあれば「続きから / 最初から」。なければ「あきから4000円を奪う」だけ
  const G = Kabu.game;
  if (G && G.hasSave()) {
    const sm = G.summary();
    document.getElementById('titleBtn').hidden = true;
    document.getElementById('titleContinue').hidden = false;
    document.getElementById('titleNew').hidden = false;
    const sv = document.getElementById('titleSave');
    sv.hidden = false;
    sv.textContent = sm.rounds + '戦目 ／ 持ち金 ' + sm.purse.toLocaleString('ja-JP') + '円 ／ あき ' + sm.boss.toLocaleString('ja-JP') + '円';
  }
  let newTimer = 0;
  document.getElementById('titleNew').addEventListener('click', e => {
    const b = e.currentTarget;
    if (el.dataset.phase !== 'start') return;
    if (!b.classList.contains('armed')) {                       // 誤タップ防止: もう一度タップで実行
      b.classList.add('armed'); b.textContent = '本当に最初から？もう一度タップ';
      newTimer = setTimeout(() => { b.classList.remove('armed'); b.textContent = '最初から'; }, 3000);
      return;
    }
    clearTimeout(newTimer);
    G.newRun();
    begin();
  });
  document.getElementById('titleContinue').addEventListener('click', () => begin());
  document.getElementById('titleBtn').addEventListener('click', () => begin());

  function begin() {
    if (el.dataset.phase !== 'start') return;
    A.unlock(); A.play('coin');
    el.dataset.phase = 'loading';
    const items = document.querySelectorAll('#loadLines li');
    document.getElementById('loadBar').style.transitionDuration = T(4300) + 'ms';
    requestAnimationFrame(() => requestAnimationFrame(() => { document.getElementById('loadBar').style.width = '100%'; }));
    items.forEach((li, i) => later(() => { li.classList.add('on'); A.play('tap'); }, 1500 + i * 650));
    later(finish, 4600);
  }
  // ロード中のタップでスキップ
  el.addEventListener('click', e => { if (el.dataset.phase === 'loading' && !e.target.closest('.title-btn')) finish(); });
})();
