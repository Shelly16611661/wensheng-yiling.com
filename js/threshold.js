/* ============================================================
   threshold.js ── 幕②:相框玻璃從中心碎成 144 片,慢慢變成花瓣飄走
   純 DOM + CSS 3D(clip-path 多邊形逐格形變成花瓣),捲動進度驅動
   ============================================================ */
(function () {
  const COLS = 12, ROWS = 12;
  const T = { shards: [], el: null, frame: null, built: false, lastS: -1, cracked: false };

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  T.build = function (container, photo) {
    T.el = container; T.frame = container.parentNode;
    container.style.setProperty('--photo', `url("${photo}")`);

    // 共享頂點的抖動網格 → 碎片之間沒有縫
    const vx = [], mh = [], mv = [];
    for (let r = 0; r <= ROWS; r++) {
      vx[r] = [];
      for (let c = 0; c <= COLS; c++) {
        const jx = (c === 0 || c === COLS) ? 0 : rnd(-0.34, 0.34) / COLS;
        const jy = (r === 0 || r === ROWS) ? 0 : rnd(-0.34, 0.34) / ROWS;
        vx[r][c] = [c / COLS + jx, r / ROWS + jy];
      }
    }
    const mid = (a, b, jit) => [(a[0] + b[0]) / 2 + (jit ? rnd(-0.12, 0.12) / COLS : 0), (a[1] + b[1]) / 2 + (jit ? rnd(-0.12, 0.12) / ROWS : 0)];
    for (let r = 0; r <= ROWS; r++) { mh[r] = []; for (let c = 0; c < COLS; c++) mh[r][c] = mid(vx[r][c], vx[r][c + 1], r !== 0 && r !== ROWS); }
    for (let r = 0; r < ROWS; r++) { mv[r] = []; for (let c = 0; c <= COLS; c++) mv[r][c] = mid(vx[r][c], vx[r + 1][c], c !== 0 && c !== COLS); }

    const impact = [0.5, 0.42];
    const frag = document.createDocumentFragment();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const poly = [vx[r][c], mh[r][c], vx[r][c + 1], mv[r][c + 1], vx[r + 1][c + 1], mh[r + 1][c], vx[r + 1][c], mv[r][c]];
        const cx = poly.reduce((s, p) => s + p[0], 0) / 8, cy = poly.reduce((s, p) => s + p[1], 0) / 8;
        // 花瓣目標形狀(8 點,前端微尖)
        const rot = rnd(0, Math.PI * 2), rx = 0.36 / COLS, ry = 0.62 / ROWS;
        const petal = poly.map((_, k) => {
          const a = (k / 8) * Math.PI * 2;
          const rr = 1 + 0.22 * Math.cos(2 * a);
          const px = Math.cos(a) * rx * rr, py = Math.sin(a) * ry * rr;
          return [cx + px * Math.cos(rot) - py * Math.sin(rot), cy + px * Math.sin(rot) + py * Math.cos(rot)];
        });
        const dx = cx - impact[0], dy = cy - impact[1];
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx) + rnd(-0.35, 0.35);
        const el = document.createElement('div');
        el.className = 'shard';
        el.style.transformOrigin = `${(cx * 100).toFixed(2)}% ${(cy * 100).toFixed(2)}%`;
        el.style.clipPath = polyStr(poly);
        frag.appendChild(el);
        T.shards.push({ el, poly, petal, delay: Math.min(0.5, dist / 0.75 * 0.5),
          dirx: Math.cos(ang) * rnd(0.7, 1.4), diry: Math.sin(ang) * rnd(0.7, 1.4) * 0.8,
          dz: rnd(-600, 900), rx: rnd(-540, 540), ry: rnd(-540, 540), rz: rnd(-360, 360), wob: rnd(0, Math.PI * 2) });
      }
    }
    container.appendChild(frag);
    T.built = true;
  };

  function polyStr(pts) { return 'polygon(' + pts.map((p) => `${(p[0] * 100).toFixed(2)}% ${(p[1] * 100).toFixed(2)}%`).join(',') + ')'; }

  /* s ∈ [0,1] 碎裂進度 */
  T.update = function (s, now) {
    if (!T.built) return;
    if (s === T.lastS && (s === 0 || s === 1)) return;
    T.lastS = s;
    const W = T.frame.clientWidth || 400, H = T.frame.clientHeight || 500;
    const glass = T.frame.querySelector('.glass'), mat = T.frame.querySelector('.mat');
    if (glass) glass.style.opacity = s > 0.01 ? 0 : 1;
    if (mat) mat.style.opacity = 1 - smooth(0.25, 0.7, s);
    for (const sh of T.shards) {
      const k = smooth(sh.delay, sh.delay + 0.55, s);
      if (k <= 0) {
        if (sh.k !== 0) { sh.el.style.transform = ''; sh.el.style.opacity = ''; sh.el.style.setProperty('--tint', 0); sh.el.style.clipPath = polyStr(sh.poly); sh.k = 0; }
        continue;
      }
      sh.k = k;
      const e = k * k * (3 - 2 * k);
      const drift = Math.sin(now * 0.0014 + sh.wob) * 14 * k;
      const tx = sh.dirx * W * 1.1 * e + drift, ty = sh.diry * H * 0.7 * e + H * 0.75 * e * e, tz = sh.dz * e;
      const sc = 1 - 0.55 * e;
      sh.el.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,${tz.toFixed(1)}px) rotateX(${(sh.rx * e).toFixed(1)}deg) rotateY(${(sh.ry * e).toFixed(1)}deg) rotateZ(${(sh.rz * e).toFixed(1)}deg) scale(${sc.toFixed(3)})`;
      sh.el.style.setProperty('--tint', smooth(0.15, 0.8, k).toFixed(3));
      sh.el.style.opacity = (1 - smooth(0.72, 1, k)).toFixed(3);
      const m = smooth(0.25, 0.95, k);
      if (m > 0) {
        const pts = sh.poly.map((p, i) => [p[0] + (sh.petal[i][0] - p[0]) * m, p[1] + (sh.petal[i][1] - p[1]) * m]);
        sh.el.style.clipPath = polyStr(pts);
      }
    }
  };

  window.Threshold = T;
})();
