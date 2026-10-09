/* ============================================================
   app.js ── 捲動引擎與七幕編排
   整個網站是一條捲動軸:scrollY → t ∈ [0,1] → 每一幕的區間進度 p
   舞台固定滿版,各幕依 p 淡入淡出、縮放、模糊(相機推進的感覺)
   ============================================================ */
(function () {
  const C = window.CONTENT;
  const $ = (s) => document.querySelector(s);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const clamp01 = (x) => clamp(x, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  /* ── 七幕與捲動長度(vh) ────────────────────── */
  const ACTS = [
    { id: 'prologue', el: $('#prologue'), vh: 130, fog: 0 },
    { id: 'threshold', el: $('#threshold'), vh: 150, fog: 0.22 },
    { id: 'book', el: $('#book-act'), vh: 0, fog: 0.34 },
    { id: 'room', el: $('#room'), vh: 230, fog: 0.2 },
    { id: 'heart', el: $('#heart'), vh: 250, fog: 0.12 },
    { id: 'spring', el: $('#spring'), vh: 280, fog: 0.05 },
    { id: 'echo', el: $('#echo'), vh: 230, fog: 0 },
  ];
  const A = {}; ACTS.forEach((a) => (A[a.id] = a));
  let total = 0, y = 0, lastW = innerWidth, lastH = innerHeight;

  function layout() {
    A.book.vh = 130 + Book.leaves * 34;
    let s = 0;
    ACTS.forEach((a) => { a.start = s; a.len = (a.vh / 100) * innerHeight; s += a.len; });
    total = s;
    $('#scroller').style.height = Math.round(total + innerHeight) + 'px';
  }

  /* ── 文案注入 ─────────────────────────────── */
  function fillText() {
    document.title = C.siteTitle;
    $('#threshold-line').textContent = C.threshold.line;
    $('#echo-1').textContent = C.echo.line1;
    $('#echo-2').textContent = C.echo.line2;
    $('#threshold .frame-caption').textContent = C.weddingText.replace(/\./g, ' · ');
  }

  /* ── 封面儀式節奏:舞台微亮 → 法典浮現 → 黃銅題牌掠光 → 封蠟可啟 ── */
  function coverTimeline() {
    const P = A.prologue.el;
    if (REDUCED) { P.classList.add('s1', 's2', 's3', 's4'); return; }
    setTimeout(() => P.classList.add('s1'), 1000);
    setTimeout(() => P.classList.add('s2'), 2000);
    setTimeout(() => P.classList.add('s3'), 3000);
    setTimeout(() => P.classList.add('s4'), 4000);
  }

  /* ── 捲動到某幕的某個進度 ───────────────────── */
  function scrollToAct(id, p, smoothly) {
    const a = A[id]; const target = a.start + a.len * (p || 0);
    if (smoothly && !REDUCED) window.scrollTo({ top: target, behavior: 'smooth' });
    else { window.scrollTo(0, target); y = target; }
  }

  /* ════════════════════════ 各幕更新 ════════════════════════ */
  const st = { crack: false, springSound: false, echoTimer: null, echoOut: false, roomSound: false };

  function setLayer(a, opacity) {
    const on = opacity > 0.002;
    if (a._on !== on) { a.el.classList.toggle('is-on', on); a._on = on; }
    const active = opacity > 0.5;
    if (a._active !== active) { a.el.classList.toggle('is-active', active); a._active = active; }
    if (a._op !== opacity) { a.el.style.opacity = opacity.toFixed(3); a._op = opacity; }
    return on;
  }

  const coverArt = $('#cover-art');
  function updatePrologue(a, p) {
    const op = 1 - smooth(0.45, 0.92, p);
    document.body.classList.toggle('cover-on', op > 0.02);
    if (!setLayer(a, op)) return;
    const k = smooth(0, 0.85, p);
    coverArt.style.transform = `translate3d(0,${(-18 * k).toFixed(1)}px,0) scale(${(1 + 0.06 * k).toFixed(3)})`;
    if (p > 0.02 && !a._scrolled) { a._scrolled = true; a.el.classList.add('scrolled'); }
  }

  const frame = $('#frame'), thLine = $('#threshold-line');
  function updateThreshold(a, p, now) {
    const enter = smooth(0, 0.14, p), exit = 1 - smooth(0.9, 1, p);
    const op = (p <= 0 || p >= 1) ? 0 : Math.min(enter, exit);
    if (!setLayer(a, op)) { if (p >= 1 && Threshold.lastS !== 1) Threshold.update(1, now); if (p <= 0 && Threshold.lastS !== 0) Threshold.update(0, now); return; }
    frame.style.transform = `translateY(${((1 - enter) * 30).toFixed(1)}px) scale(${(0.92 + 0.08 * enter).toFixed(3)})`;
    const s = smooth(0.2, 0.86, p);
    Threshold.update(s, now);
    if (s > 0.02 && !st.crack) { st.crack = true; a.el.classList.add('crack'); setTimeout(() => a.el.classList.remove('crack'), 600); Sound.glass(); }
    if (s < 0.01) st.crack = false;
    const lo = smooth(0.6, 0.78, p) * (1 - smooth(0.92, 1, p));
    thLine.style.opacity = lo.toFixed(3);
    thLine.style.letterSpacing = (0.6 - 0.2 * smooth(0.6, 0.85, p)).toFixed(3) + 'em';
  }

  const bookStage = $('#book-stage');
  let bookUserLock = 0;
  function updateBook(a, p, now) {
    const enter = smooth(0, 0.07, p), exit = 1 - smooth(0.93, 1, p);
    const op = (p <= 0 || p >= 1) ? 0 : Math.min(enter, exit);
    if (p > 0 && !a._preloaded) { a._preloaded = true; Book.preload(); }
    if (!setLayer(a, op)) return;
    const ex = 1 - exit;
    bookStage.style.transform = `translateY(${((1 - enter) * 50).toFixed(1)}px) scale(${(0.94 + 0.06 * enter - 0.14 * ex).toFixed(3)})`;
    bookStage.style.filter = ex > 0.02 ? `blur(${(8 * ex).toFixed(1)}px)` : '';
    if (!Book._drag && now > bookUserLock) {
      const q = clamp01((p - 0.07) / 0.86);
      const n = Math.round(q * Book.leaves);
      if (n !== Book.cur) Book.go(n, 'prog');
    }
  }

  const handsBtn = $('#hands-btn'), kissBtn = $('#kiss-btn'), roomActions = $('#room-actions'), roomFallback = $('#room-fallback');
  function updateRoom(a, p) {
    const enter = smooth(0, 0.12, p), exit = 1 - smooth(0.9, 1, p);
    const op = (p <= 0 || p >= 1) ? 0 : Math.min(enter, exit);
    setLayer(a, op);
    const showBtn = p > 0.22 && p < 0.86;
    if (a._btn !== showBtn) { a._btn = showBtn; roomActions.classList.toggle('show', showBtn); }
    if (p > 0.05 && p < 0.95 && !st.roomSound) { st.roomSound = true; Sound.piano(196, 4, 0.06); }
    if (p <= 0 || p >= 1) st.roomSound = false;
    return op;
  }

  const heartPanel = $('#heart-panel');
  function updateHeart(a, p) {
    const enter = smooth(0, 0.12, p), exit = 1 - smooth(0.9, 1, p);
    const op = (p <= 0 || p >= 1) ? 0 : Math.min(enter, exit);
    setLayer(a, op);
    const show = p > 0.2 && p < 0.88;
    if (a._panel !== show) { a._panel = show; heartPanel.classList.toggle('show', show); }
    return op;
  }

  const garden = $('#garden');
  function updateSpring(a, p, now) {
    const op = (p <= 0 || p >= 1) ? 0 : smooth(0, 0.1, p) * (1 - smooth(0.9, 1, p));
    if (!setLayer(a, op)) { if (p <= 0) Flowers.update(0, now); return; }
    const ex = smooth(0.86, 1, p);
    garden.style.transform = `scale(${(1 - 0.4 * ex).toFixed(3)})`;
    garden.style.filter = ex > 0.02 ? `blur(${(8 * ex).toFixed(1)}px)` : '';
    Flowers.update(p, now);
  }

  const echoEl = $('#echo');
  function updateEcho(a, p) {
    const op = smooth(0, 0.15, p);
    if (!setLayer(a, op)) { if (st.echoTimer) { clearTimeout(st.echoTimer); st.echoTimer = null; } echoEl.classList.remove('out', 'l1', 'l2'); st.echoOut = false; st.echoStrings = false; return; }
    if (p > 0.05 && !st.echoStrings) { st.echoStrings = true; Sound.strings(); }
    echoEl.style.setProperty('--go', (smooth(0.05, 0.4, p) * 0.9).toFixed(3));
    echoEl.style.setProperty('--gs', (1 + 0.12 * p).toFixed(3));
    echoEl.classList.toggle('l1', p > 0.3);
    echoEl.classList.toggle('l2', p > 0.5);
    if (p >= 0.6) {
      if (!st.echoTimer && !st.echoOut) st.echoTimer = setTimeout(() => { st.echoOut = true; echoEl.classList.add('out'); Sound.piano(130.81, 6, 0.09); }, 8000);
    } else {
      if (st.echoTimer) { clearTimeout(st.echoTimer); st.echoTimer = null; }
      if (st.echoOut) { st.echoOut = false; echoEl.classList.remove('out'); }
    }
  }

  /* ════════════════════════ 主迴圈 ════════════════════════ */
  const progI = $('#progress i'), progB = $('#progress b'), fogEl = $('#fog');
  let lastT = -1;
  function loop(now) {
    const target = window.scrollY || window.pageYOffset || 0;
    y += (target - y) * 0.16; if (Math.abs(target - y) < 0.4) y = target;
    const t = total ? clamp01(y / total) : 0;
    if (t !== lastT) { lastT = t; progI.style.height = (t * 100).toFixed(2) + '%'; progB.style.top = (t * 100).toFixed(2) + '%'; }

    const P = {}; ACTS.forEach((a) => (P[a.id] = a.len ? clamp01((y - a.start) / a.len) : 0));
    updatePrologue(A.prologue, P.prologue);
    updateThreshold(A.threshold, P.threshold, now);
    updateBook(A.book, P.book, now);
    const roomOp = updateRoom(A.room, P.room);
    const heartOp = updateHeart(A.heart, P.heart);
    updateSpring(A.spring, P.spring, now);
    updateEcho(A.echo, P.echo);

    // 3D canvas:哪一幕在用
    const active = roomOp > 0 ? 'room' : heartOp > 0 ? 'heart' : null;
    if (Scene3D.ok) {
      if (Scene3D.active !== active) Scene3D.setActive(active);
      if (active) Scene3D.render(now, { roomP: P.room, heartP: P.heart, roomOpacity: roomOp, heartOpacity: heartOp });
    }
    // 霧:記憶的清晰度
    let fog = 0; ACTS.forEach((a) => (fog += (a._op || 0) * a.fog));
    fogEl.style.setProperty('--fog-o', fog.toFixed(3));
    requestAnimationFrame(loop);
  }

  /* ════════════════════════ 心的定制器 ════════════════════════ */
  const DEF = { c: 'rose', m: 'ceramic', h: 'none', e: '' };
  const heartState = { mine: Object.assign({}, DEF), received: null };
  const b64e = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  const sanitize = (o) => ({ c: (o && COLORS_OK.includes(o.c)) ? o.c : DEF.c, m: (o && MAT_OK.includes(o.m)) ? o.m : DEF.m, h: (o && HALO_OK.includes(o.h)) ? o.h : DEF.h, e: (o && typeof o.e === 'string') ? o.e.slice(0, 10) : '' });
  const COLORS_OK = ['rose', 'ivory', 'gold', 'mist'], MAT_OK = ['ceramic', 'velvet', 'metal', 'glass'], HALO_OK = ['none', 'ring', 'glow'];
  const HEX = { rose: '#C9202A', ivory: '#F2F2F2', gold: '#C9A227', mist: '#B9BEC2' };

  function readHash() {
    const m = location.hash.match(/[#&]h=([A-Za-z0-9\-_=]+)/);
    if (!m) return false;
    try {
      const data = JSON.parse(b64d(m[1]));
      const hearts = Array.isArray(data.hearts) ? data.hearts.map(sanitize).slice(0, 2) : [];
      if (!hearts.length) return false;
      heartState.received = hearts[0];
      if (hearts[1]) heartState.mine = hearts[1];
      return true;
    } catch (e) { return false; }
  }
  function heartsList() { return heartState.received ? [heartState.received, heartState.mine] : [heartState.mine]; }
  function renderHearts() {
    if (Scene3D.ok) Scene3D.setHearts(heartsList());
    else {
      const fb = $('#heart-fallback'); fb.hidden = false;
      fb.style.setProperty('--hc', HEX[heartState.mine.c]); $('#fb-engrave').textContent = heartState.mine.e;
    }
  }
  function syncPanel() {
    heartPanel.querySelectorAll('.row[data-key]').forEach((row) => {
      const key = row.dataset.key;
      row.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === heartState.mine[key]));
    });
    $('#engrave').value = heartState.mine.e;
    const rec = $('#received');
    if (heartState.received) { rec.hidden = false; rec.textContent = heartState.received.e ? `收到一顆刻著「${heartState.received.e}」的心 — 加上你的,就是雙心。` : '收到一顆心 — 加上你的,就是雙心。'; }
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200); }

  function shareLink() {
    const payload = { v: 1, hearts: heartsList() };
    const url = `${location.origin === 'null' ? '' : location.origin}${location.pathname}#h=${b64e(JSON.stringify(payload))}`;
    history.replaceState(null, '', `#h=${b64e(JSON.stringify(payload))}`);
    const done = () => toast('已複製連結');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => window.prompt('複製這個連結:', url));
    else window.prompt('複製這個連結:', url);
  }

  async function downloadCard() {
    try { await document.fonts.load('400 40px "Ma Shan Zheng"'); await document.fonts.load('600 40px "Noto Serif TC"'); await document.fonts.load('500 40px "Cormorant Garamond"'); } catch (e) {}
    const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    x.fillStyle = '#FAFAFA'; x.fillRect(0, 0, W, H);
    x.save(); x.font = '500 640px "Cormorant Garamond", Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.strokeStyle = 'rgba(201,162,39,.30)'; x.lineWidth = 2; x.strokeText('22', W / 2, 560); x.restore();
    const snap = Scene3D.ok ? Scene3D.snapshotHeart() : null;
    await new Promise((res) => {
      if (!snap) { drawFallbackHeart(x, W / 2, 560, 300, HEX[heartState.mine.c]); return res(); }
      const img = new Image(); img.onload = () => { x.drawImage(img, 90, 110, 900, 900); res(); }; img.onerror = res; img.src = snap;
    });
    x.fillStyle = '#1A1A1A'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.font = '600 40px "Noto Serif TC", serif'; try { x.letterSpacing = '8px'; } catch (e) {}
    x.fillText(C.echo.line1, W / 2 + 4, 1090);
    x.fillStyle = '#C9A227'; x.font = '500 26px "Cormorant Garamond", Georgia, serif'; try { x.letterSpacing = '8px'; } catch (e) {}
    x.fillText(`${C.weddingText}  —  ${C.anniversaryText}`, W / 2 + 4, 1140);
    const e = heartState.mine.e || (heartState.received && heartState.received.e);
    if (e) { x.fillStyle = '#C9202A'; x.font = '400 44px "Ma Shan Zheng", "Noto Serif TC", serif'; try { x.letterSpacing = '6px'; } catch (er) {} x.fillText(e, W / 2 + 3, 1215); }
    x.fillStyle = '#9A9A9A'; x.font = '400 18px "Cormorant Garamond", Georgia, serif'; try { x.letterSpacing = '5px'; } catch (er) {}
    x.fillText(C.domain, W / 2 + 2, 1290);
    const a = document.createElement('a'); a.download = 'wensheng-yiling-22-heart.png'; a.href = cv.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove();
    toast('卡片已下載');
  }
  function drawFallbackHeart(x, cx, cy, r, color) {
    x.save(); x.translate(cx, cy); x.scale(r / 52, r / 52); x.beginPath();
    x.moveTo(0, 42); x.bezierCurveTo(-10, 30, -52, 12, -52, -18); x.bezierCurveTo(-52, -36, -38, -48, -24, -48); x.bezierCurveTo(-12, -48, -4, -42, 0, -34);
    x.bezierCurveTo(4, -42, 12, -48, 24, -48); x.bezierCurveTo(38, -48, 52, -36, 52, -18); x.bezierCurveTo(52, 12, 10, 30, 0, 42); x.closePath();
    x.fillStyle = color; x.fill(); x.restore();
  }

  function bindHeartPanel() {
    heartPanel.querySelectorAll('.row[data-key]').forEach((row) => {
      row.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        heartState.mine[row.dataset.key] = b.dataset.v; syncPanel(); renderHearts(); Sound.ding(7);
      });
    });
    let eT;
    $('#engrave').addEventListener('input', (e) => {
      heartState.mine.e = e.target.value.slice(0, 10);
      clearTimeout(eT); eT = setTimeout(renderHearts, 180);
    });
    $('#share-btn').addEventListener('click', shareLink);
    $('#card-btn').addEventListener('click', () => downloadCard().catch(() => toast('下載失敗,請再試一次')));
    // 拖曳轉動心
    const hit = $('#heart-hit'); let hd = null;
    hit.addEventListener('pointerdown', (e) => { hd = { x: e.clientX, t: performance.now(), id: e.pointerId }; hit.setPointerCapture(e.pointerId); Scene3D.heartDrag.start(); });
    hit.addEventListener('pointermove', (e) => { if (!hd || e.pointerId !== hd.id) return; const now = performance.now(); const dx = e.clientX - hd.x; const dt = Math.max(1, now - hd.t); Scene3D.heartDrag.move((dx / dt) * 16); hd.x = e.clientX; hd.t = now; });
    const up = (e) => { if (!hd || (e.pointerId !== undefined && e.pointerId !== hd.id)) return; hd = null; Scene3D.heartDrag.end(); };
    hit.addEventListener('pointerup', up); hit.addEventListener('pointercancel', up);
  }

  /* ── 無 WebGL 的房間:同樣兩層照片,位置來自 FIGURES ── */
  function setupRoomFallback() {
    const FG = window.FIGURES; if (!FG) { roomFallback.hidden = false; return; }
    const stage = $('#fb-stage'), W = FG.image.w, H = FG.image.h;
    stage.style.setProperty('--fb-ar', (W / H).toFixed(4));
    [['her', $('#fb-her')], ['him', $('#fb-him')]].forEach(([key, img]) => {
      const m = FG[key];
      stage.style.setProperty(`--${key}-x`, (m.x / W * 100).toFixed(2) + '%');
      stage.style.setProperty(`--${key}-y`, (m.y / H * 100).toFixed(2) + '%');
      stage.style.setProperty(`--${key}-w`, (m.w / W * 100).toFixed(2) + '%');
      img.style.setProperty('--px', (m.pivot / m.w * 100).toFixed(2) + '%');
      img.style.zIndex = FG.front === key ? 2 : 1;
      img.src = m.src;
    });
    const herFeet = FG.her.x + FG.her.pivot, himFeet = FG.him.x + FG.him.pivot;
    roomFallback.style.setProperty('--dir', himFeet > herFeet ? 1 : -1);
    roomFallback.hidden = false;
  }

  /* ════════════════════════ 其他互動 ════════════════════════ */
  function bindUI() {
    $('#sound').addEventListener('click', (e) => {
      const on = Sound.toggle();
      e.currentTarget.setAttribute('aria-pressed', on ? 'true' : 'false');
      e.currentTarget.setAttribute('aria-label', on ? '關閉聲音' : '開啟聲音');
    });
    $('#wax-seal').addEventListener('click', () => { Sound.seal(); scrollToAct('threshold', 0.16, true); });
    $('#ribbon').addEventListener('click', (e) => { e.stopPropagation(); Book.go(1, 'user'); });
    handsBtn.addEventListener('click', () => {
      const on = handsBtn.getAttribute('aria-pressed') !== 'true';
      handsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      handsBtn.querySelector('.txt').textContent = on ? '牽著' : '牽手';
      if (Scene3D.ok) Scene3D.setHands(on); else roomFallback.classList.toggle('hands', on);
      if (on) Sound.chord(); else Sound.ding(0);
    });
    kissBtn.addEventListener('click', () => {
      if (kissBtn.classList.contains('busy')) return;
      let ms = 3400;
      if (Scene3D.ok) { ms = Scene3D.kiss(); if (!ms) return; }
      else { roomFallback.classList.remove('kiss'); void roomFallback.offsetWidth; roomFallback.classList.add('kiss'); setTimeout(() => roomFallback.classList.remove('kiss'), 2600); }
      kissBtn.classList.add('busy');
      setTimeout(() => Sound.kiss(), 550);
      setTimeout(() => kissBtn.classList.remove('busy'), ms);
    });
    addEventListener('pointermove', (e) => { Scene3D.pointer.x = (e.clientX / innerWidth) * 2 - 1; Scene3D.pointer.y = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
    addEventListener('keydown', (e) => {
      if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (A.book._active) {
        if (e.key === 'ArrowRight') { e.preventDefault(); Book.go(Book.cur + 1, 'user'); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); Book.go(Book.cur - 1, 'user'); }
      }
    });
    addEventListener('resize', () => {
      const w = innerWidth, h = innerHeight;
      const big = w !== lastW || Math.abs(h - lastH) / lastH > 0.15;
      if (!big) return;
      const t = total ? y / total : 0;
      lastW = w; lastH = h; layout(); Flowers.layout();
      window.scrollTo(0, t * total); y = t * total;
    });
    // 書翻頁 → 同步捲動位置
    Book.onChange = (cur, source) => {
      if (source !== 'user') return;
      const a = A.book; const q = cur / Book.leaves; const target = a.start + a.len * (0.07 + q * 0.86);
      bookUserLock = performance.now() + 400;
      window.scrollTo(0, target); y = target;
    };
  }

  /* ════════════════════════ 啟動 ════════════════════════ */
  function boot() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    fillText();
    Book.build($('#book'), $('#book-stage'), C);
    Threshold.build($('#shards'), C.threshold.photo);
    Flowers.build($('#garden'), $('#spring-line'), C.spring.line);
    layout();
    bindUI();
    bindHeartPanel();
    const hasHeartLink = readHash();
    syncPanel();

    // 3D(非同步;失敗就走靜態備援)
    const useFallback = () => { setupRoomFallback(); $('#heart-fallback').hidden = false; renderHearts(); };
    Scene3D.init($('#gl')).then((ok) => { if (!ok) useFallback(); else renderHearts(); }).catch(useFallback);

    // 字體就緒後才開始儀式(最多等 2.5 秒)
    const fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))]).then(() => {
      document.body.classList.add('ready');
      if (hasHeartLink) { A.prologue.el.classList.add('s1', 's2', 's3', 's4'); scrollToAct('heart', 0.4, false); }
      else { window.scrollTo(0, 0); y = 0; coverTimeline(); }
      requestAnimationFrame(loop);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
