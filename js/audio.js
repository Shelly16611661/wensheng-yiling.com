/* ============================================================
   audio.js ── 全站音效,全部用 WebAudio 合成,沒有外部音檔
   預設關閉;使用者點右上角 SOUND 後才開啟。所有音量 ≤ -18dB
   ============================================================ */
(function () {
  const A = {
    enabled: false,
    ctx: null,
    master: null,
    _ambient: null,
    _timer: null,
  };

  const DB18 = 0.126; // ≈ -18dB

  function ctx() {
    if (!A.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      A.ctx = new C();
      A.master = A.ctx.createGain();
      A.master.gain.value = 1;
      A.master.connect(A.ctx.destination);
    }
    if (A.ctx.state === 'suspended') A.ctx.resume();
    return A.ctx;
  }

  function on() { return A.enabled && ctx(); }

  /* 通用:一顆有 attack / exponential decay 的音 */
  function tone({ freq = 440, type = 'sine', dur = 1.2, gain = 0.08, attack = 0.01, glide = null, filter = null, when = 0 }) {
    const c = on(); if (!c) return;
    const t0 = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur * 0.9);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o;
    if (filter) { const f = c.createBiquadFilter(); f.type = filter.type || 'lowpass'; f.frequency.value = filter.freq || 2000; f.Q.value = filter.q || 0.7; o.connect(f); node = f; }
    node.connect(g).connect(A.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  /* 白噪音 buffer(快取) */
  let noiseBuf = null;
  function noise() {
    const c = A.ctx;
    if (noiseBuf) return noiseBuf;
    const len = c.sampleRate * 2;
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function burst({ dur = 0.4, gain = DB18, filter = { type: 'bandpass', freq: 1800, q: 0.7 }, curve = 2.4, when = 0 }) {
    const c = on(); if (!c) return;
    const t0 = c.currentTime + when;
    const src = c.createBufferSource(); src.buffer = noise();
    const f = c.createBiquadFilter(); f.type = filter.type; f.frequency.value = filter.freq; f.Q.value = filter.q || 0.7;
    const g = c.createGain();
    // 依 curve 做衰減包絡
    const steps = 24;
    g.gain.setValueAtTime(gain, t0);
    for (let i = 1; i <= steps; i++) {
      const x = i / steps;
      g.gain.linearRampToValueAtTime(gain * Math.pow(1 - x, curve) + 0.0001, t0 + dur * x);
    }
    src.connect(f).connect(g).connect(A.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  /* ── 具名音效 ─────────────────────────────── */
  A.seal = () => tone({ freq: 660, glide: 392, dur: 0.5, gain: 0.12, attack: 0.03 });

  A.page = () => burst({ dur: 0.4, gain: DB18, filter: { type: 'bandpass', freq: 1800, q: 0.7 }, curve: 2.4 });

  A.glass = () => {
    burst({ dur: 0.35, gain: 0.09, filter: { type: 'highpass', freq: 3000, q: 0.5 }, curve: 3 });
    [2400, 3100, 4200, 5300, 6400].forEach((f, i) => tone({ freq: f, dur: 1.4 + Math.random() * 0.6, gain: 0.02, attack: 0.005, when: Math.random() * 0.28 + i * 0.03 }));
  };

  // 「叮」:C4 起,每次升半音
  A.ding = (i) => {
    const f = 261.63 * Math.pow(2, i / 12);
    tone({ freq: f, dur: 1.5, gain: 0.07, attack: 0.008 });
    tone({ freq: f * 2, dur: 0.9, gain: 0.018, attack: 0.008 });
  };
  /* 親吻:短短的「啾」= 一小口帶通噪音 + 往下滑的正弦,然後一顆小鈴 */
  A.kiss = () => {
    burst({ dur: 0.09, gain: 0.07, filter: { type: 'bandpass', freq: 2600, q: 1.2 }, curve: 1.2 });
    tone({ freq: 1040, glide: 520, dur: 0.16, gain: 0.07, attack: 0.005 });
    tone({ freq: 1567.98, type: 'triangle', dur: 1.4, gain: 0.035, attack: 0.01, when: 0.18 });
  };
  A.chord = () => [261.63, 329.63, 392.0, 523.25].forEach((f, i) => tone({ freq: f, dur: 3, gain: 0.05, attack: 0.02, when: i * 0.04 }));

  A.piano = (freq = 130.81, dur = 3.5, gain = 0.1) => {
    tone({ freq, type: 'triangle', dur, gain, attack: 0.01, filter: { type: 'lowpass', freq: 1400 } });
    tone({ freq: freq * 2, type: 'sine', dur: dur * 0.6, gain: gain * 0.35, attack: 0.01 });
  };

  A.strings = () => {
    const c = on(); if (!c) return;
    const t0 = c.currentTime;
    [65.41, 98.0, 130.81].forEach((f, i) => {
      [-4, 4].forEach((det) => {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 520;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.02 - i * 0.004, t0 + 1.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 6.5);
        o.connect(fl).connect(g).connect(A.master);
        o.start(t0); o.stop(t0 + 6.6);
      });
    });
  };

  /* ── 環境音:極低的兩個正弦 + 稀疏鋼琴單音 ── */
  const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
  function startAmbient() {
    const c = on(); if (!c || A._ambient) return;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.02, c.currentTime + 3);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.08;
    const lg = c.createGain(); lg.gain.value = 0.008; lfo.connect(lg).connect(g.gain);
    const oscs = [110, 165.2, 220.6].map((f, i) => {
      const o = c.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle'; o.frequency.value = f;
      const og = c.createGain(); og.gain.value = i === 0 ? 1 : 0.28;
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 380;
      o.connect(fl).connect(og).connect(g); o.start(); return o;
    });
    g.connect(A.master); lfo.start();
    A._ambient = { g, oscs, lfo };
    const tick = () => {
      if (!A.enabled) return;
      A.piano(PENTA[Math.floor(Math.random() * PENTA.length)] * (Math.random() < 0.5 ? 1 : 0.5), 4, 0.05);
      A._timer = setTimeout(tick, 7000 + Math.random() * 6000);
    };
    A._timer = setTimeout(tick, 2500);
  }
  function stopAmbient() {
    if (!A._ambient) return;
    const c = A.ctx, a = A._ambient;
    a.g.gain.cancelScheduledValues(c.currentTime);
    a.g.gain.setValueAtTime(a.g.gain.value, c.currentTime);
    a.g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.2);
    setTimeout(() => { a.oscs.forEach((o) => { try { o.stop(); } catch (e) {} }); try { a.lfo.stop(); } catch (e) {} }, 1400);
    A._ambient = null;
    clearTimeout(A._timer);
  }

  A.toggle = () => {
    A.enabled = !A.enabled;
    if (A.enabled) { ctx(); startAmbient(); } else { stopAmbient(); }
    return A.enabled;
  };

  window.Sound = A;
})();
