/* ============================================================
   flowers.js ── 幕⑥:22 朵花,一朵一朵開,開完排成「22」
   時間軸(秒):1 起每 0.8s 開一朵 → 18.6 開始飄移 4s → 22.6 文字浮現
   往下捲動可以快轉,停著不動就讓它自己開
   ============================================================ */
(function () {
  const N = 22, FIRST = 1.0, GAP = 0.8, DRIFT_AT = FIRST + GAP * (N - 1) + 0.9, DRIFT_DUR = 4.0;
  const TEXT_AT = DRIFT_AT + DRIFT_DUR + 0.2;
  const F = { el: null, line: null, items: [], t0: null, seq: 0, done: false, TOTAL: TEXT_AT + 2 };

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* 「2」的路徑(單位框內),依弧長取 11 個點 */
  function digitTwo(n) {
    const pts = [];
    const cx = 0.5, cy = 0.31, r = 0.31;
    for (let a = 200; a >= -32; a -= 4) { const t = (a * Math.PI) / 180; pts.push([cx + Math.cos(t) * r, cy - Math.sin(t) * r]); }
    const endArc = pts[pts.length - 1];
    const bottomL = [0.09, 0.985], bottomR = [0.93, 0.985];
    for (let i = 1; i <= 30; i++) { const t = i / 30; pts.push([endArc[0] + (bottomL[0] - endArc[0]) * t, endArc[1] + (bottomL[1] - endArc[1]) * t]); }
    for (let i = 1; i <= 20; i++) { const t = i / 20; pts.push([bottomL[0] + (bottomR[0] - bottomL[0]) * t, bottomL[1]]); }
    // 弧長參數化
    const L = [0]; for (let i = 1; i < pts.length; i++) L[i] = L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const total = L[L.length - 1], out = [];
    for (let k = 0; k < n; k++) {
      const target = (k / (n - 1)) * total;
      let i = 1; while (i < L.length - 1 && L[i] < target) i++;
      const t = (target - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
      out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
    }
    return out;
  }

  const PETAL = 'M0 0 C 11 -9, 15 -27, 3 -41 C 0 -44, -1 -44, -3 -41 C -15 -27, -11 -9, 0 0 Z';
  function flowerSVG() {
    let g = '';
    for (let i = 0; i < 5; i++) g += `<path class="petal" d="${PETAL}" transform="rotate(${i * 72})"/>`;
    return `<svg viewBox="-50 -50 100 100" aria-hidden="true">${g}<circle class="core" r="4.2"/></svg>`;
  }

  F.build = function (container, lineEl, text) {
    F.el = container; F.line = lineEl; lineEl.textContent = text;
    for (let i = 0; i < N; i++) {
      const el = document.createElement('div');
      el.className = 'flower';
      el.innerHTML = `<div class="bloom">${flowerSVG()}</div>`;
      container.appendChild(el);
      F.items.push({ el, i });
    }
    F.layout();
  };

  F.layout = function () {
    const W = innerWidth, H = innerHeight;
    const unit = Math.min(H * 0.45, (W * 0.6) / 1.5);
    const gap = unit * 0.28, w2 = unit * 0.62;
    const totalW = w2 * 2 + gap;
    const ox = (W - totalW) / 2, oy = H * 0.5 - unit * 0.52;
    const d = digitTwo(11);
    const base = Math.max(46, Math.min(96, unit * 0.22));
    F.items.forEach((it, i) => {
      const digit = i < 11 ? 0 : 1, k = i % 11;
      const p = d[k];
      it.tx = ox + digit * (w2 + gap) + p[0] * w2;
      it.ty = oy + p[1] * unit;
      // 起始位置:避開中央
      let sx, sy, tries = 0;
      do { sx = rnd(0.08, 0.92) * W; sy = rnd(0.12, 0.9) * H; tries++; }
      while (tries < 20 && Math.abs(sx / W - 0.5) < 0.26 && Math.abs(sy / H - 0.5) < 0.24);
      if (i === 0) { sx = W * 0.14; sy = H * 0.8; }
      it.sx = sx; it.sy = sy;
      it.size = base * rnd(0.72, 1.0);
      it.rot = rnd(-15, 15);
      it.cx = (it.sx + it.tx) / 2 + rnd(-0.18, 0.18) * W;
      it.cy = (it.sy + it.ty) / 2 + rnd(-0.16, 0.16) * H;
      const el = it.el;
      el.style.setProperty('--s', it.size.toFixed(1) + 'px');
      el.style.setProperty('--r', it.rot.toFixed(1) + 'deg');
      el.style.setProperty('--pc', (i + 1) % 5 === 0 ? '#E8C4C0' : '#C9202A');
      el.style.setProperty('--d', (-rnd(0, 5)).toFixed(2) + 's');
      el.style.setProperty('--x', it.sx.toFixed(1) + 'px');
      el.style.setProperty('--y', it.sy.toFixed(1) + 'px');
    });
    F.line.style.setProperty('--ty', ((oy + unit) / H * 100 + 7).toFixed(1) + '%');
  };

  F.reset = function () {
    F.t0 = null; F.seq = 0; F.done = false; F.lastDing = 0;
    F.items.forEach((it) => { it.el.classList.remove('on'); it.bloomed = false; it.el.style.setProperty('--k', 1); it.el.style.setProperty('--o', 1); });
    F.layout();
    F.line.classList.remove('show');
  };

  /* p:幕內進度;now:ms */
  F.update = function (p, now) {
    if (p <= 0.02) { if (F.t0 !== null) F.reset(); return; }
    if (F.t0 === null) F.t0 = now;
    const real = (now - F.t0) / 1000;
    const ff = clamp01((p - 0.08) / 0.62) * F.TOTAL;      // 捲動快轉
    const t = Math.max(real, ff);
    F.seq = t;
    let dings = 0;
    F.items.forEach((it, i) => {
      const bloomAt = FIRST + i * GAP;
      if (!it.bloomed && t >= bloomAt) {
        it.bloomed = true; it.el.classList.add('on');
        if (window.Sound && Sound.enabled && now - F.lastDing > 110 && dings < 2) {
          F.lastDing = now; dings++;
          if (i === N - 1) Sound.chord(); else Sound.ding(i);
        }
      }
      // 飄移到「22」
      const dt = clamp01((t - (DRIFT_AT + i * 0.03)) / DRIFT_DUR);
      if (dt > 0) {
        const e = easeInOut(dt), u = 1 - e;
        const x = u * u * it.sx + 2 * u * e * it.cx + e * e * it.tx;
        const y = u * u * it.sy + 2 * u * e * it.cy + e * e * it.ty;
        it.el.style.setProperty('--x', x.toFixed(1) + 'px');
        it.el.style.setProperty('--y', y.toFixed(1) + 'px');
        const mid = Math.sin(Math.PI * dt);
        it.el.style.setProperty('--k', (1 - 0.2 * mid).toFixed(3));
        it.el.style.setProperty('--o', (1 - 0.15 * mid).toFixed(3));
      }
    });
    if (t >= TEXT_AT && !F.done) {
      F.done = true; F.line.classList.add('show');
      if (window.Sound && Sound.enabled) Sound.piano(65.41, 4, 0.09);
    }
  };

  window.Flowers = F;
})();
