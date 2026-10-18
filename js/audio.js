/* 効果音 — WebAudio で合成(音声ファイル不使用)。ユーザー操作を起点に AudioContext を生成する。
 * 原作ゲーム/他作品の音源は一切使っていない。 */
(function () {
  'use strict';
  window.Kabu = window.Kabu || {};
  let ctx = null, master = null, muted = false;
  try { muted = localStorage.getItem('kabu.muted') === '1'; } catch (e) { /* private mode */ }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noiseBuf(dur) {
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function gainEnv(t, peak, attack, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(master);
    return g;
  }
  function noiseHit(t, dur, type, f0, f1, q, peak) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(dur + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    src.connect(f); f.connect(gainEnv(t, peak, 0.006, dur));
    src.start(t); src.stop(t + dur + 0.05);
  }
  function tone(t, type, f0, f1, dur, peak, attack) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(gainEnv(t, peak, attack || 0.004, dur));
    o.start(t); o.stop(t + dur + 0.05);
  }

  const S = {
    deal(t) { noiseHit(t, 0.12, 'bandpass', 2600, 4200, 0.9, 0.16); },
    land(t) { tone(t, 'sine', 200, 90, 0.09, 0.32); noiseHit(t, 0.04, 'lowpass', 1200, 500, 0.7, 0.12); },
    tap(t) { tone(t, 'sine', 760, 520, 0.06, 0.16); },
    flip(t) { noiseHit(t, 0.18, 'bandpass', 1100, 3400, 1.1, 0.14); },
    coin(t) {
      tone(t, 'sine', 2637, 2600, 0.24, 0.16);
      tone(t + 0.035, 'sine', 3520, 3480, 0.2, 0.1);
      noiseHit(t, 0.03, 'highpass', 4000, 6000, 0.7, 0.05);
    },
    drum(t) { tone(t, 'sine', 130, 55, 0.3, 0.55); noiseHit(t, 0.08, 'lowpass', 500, 200, 0.7, 0.2); },
    win(t) {
      S.drum(t);
      [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(t + 0.08 + i * 0.09, 'triangle', f, f, 0.32, 0.14));
    },
    big(t) {
      S.drum(t); S.drum(t + 0.16);
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + 0.2 + i * 0.08, 'triangle', f, f, 0.42, 0.16));
    },
    lose(t) { tone(t, 'sine', 240, 100, 0.55, 0.28); noiseHit(t, 0.2, 'lowpass', 700, 200, 0.6, 0.1); },
    push(t) { tone(t, 'triangle', 440, 440, 0.18, 0.12); tone(t + 0.14, 'triangle', 440, 440, 0.2, 0.1); }
  };

  function play(name) {
    if (muted) return;
    if (!ensure()) return;
    try { if (S[name]) S[name](ctx.currentTime + 0.001); } catch (e) { /* ignore */ }
  }
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('kabu.muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  Kabu.audio = { play, setMuted, isMuted: () => muted, unlock: ensure };
})();
