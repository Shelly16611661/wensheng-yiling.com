/* ============================================================
   book.js ── 歐式復古翻頁書
   · 葉子數量由內容自動決定(封面 + 序 + N 張照片 + 間奏 + 終章 + 版權頁 + 封底)
   · 五種操作:拖曳跟手、點左右邊緣、鍵盤 ← →、行動端滑動、捲動(由 app.js 對應)
   · 拖曳過 30% 完成翻頁,未滿彈回;甩動(flick)可直接翻
   ============================================================ */
(function () {
  const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX',
                 'XXI','XXII','XXIII','XXIV','XXV','XXVI','XXVII','XXVIII','XXIX','XXX'];
  const THRESH = 0.30;

  const Book = {
    el: null, stage: null, leaves: 0, cur: 0, pages: [],
    onChange: null,            // (cur, source) => void   source: 'user' | 'prog'
    _target: 0, _stepping: false, _drag: null, _moved: false,
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function daysBetween(isoA, isoB) {
    const a = new Date(isoA + 'T00:00:00Z'), b = new Date(isoB + 'T00:00:00Z');
    return Math.round((b - a) / 86400000);
  }

  /* ── 組頁面 ─────────────────────────────── */
  function composePages(C) {
    const y0 = parseInt(C.wedding.slice(0, 4), 10);
    const N = C.photos.length;
    const folio = (k) => (k <= C.years ? `${y0 + k} · ${ROMAN[k - 1] || k}` : `${ROMAN[k - 1] || k}`);
    const pages = [];
    const days = daysBetween(C.wedding, `${C.anniversaryYear}-${C.weddingText.slice(5, 7)}-${C.weddingText.slice(8, 10)}`);

    /* 結構:封面葉(封面 | 序)→ 20 張照片各佔一葉(正面照片 | 背面下一張的年份扉頁)→ 尾葉(跋 | 版權頁)
       一個對開 = 左頁年份扉頁 + 右頁照片,像真正的畫冊 */
    pages.push({ type: 'cover' });
    pages.push({ type: 'text', cls: 'preface', chapter: `序 · ${C.weddingText}`, lines: C.preface });

    C.photos.forEach((ph, i) => {
      pages.push({ type: 'photo', src: ph.src, caption: ph.caption || '', fit: ph.fit || 'cover', folio: folio(i + 1), file: ph.src.split('/').pop() });
      if (i < N - 1) {
        const k = i + 2; // 面對的下一張照片
        pages.push({ type: 'plate', year: k <= C.years ? String(y0 + k) : '', roman: ROMAN[k - 1] || String(k), n: `${k} / ${N}` });
      } else {
        pages.push({ type: 'text', cls: 'interlude', chapter: folio(N + 1), big: C.interlude.title,
          num: days.toLocaleString('en-US'), lines: C.interlude.lines.map((l) => l.replace('{days}', '')) });
      }
    });

    pages.push({ type: 'text', cls: 'finale', chapter: folio(N + 2), hand: C.finale.line, small: C.finale.small });
    pages.push({ type: 'back', plate: `${C.father.name} · ${C.mother.name} · ${C.weddingText}`, smallLines: C.colophon });
    return pages;
  }

  function faceHTML(pg, side) {
    switch (pg.type) {
      case 'cover': {
        const C = window.CONTENT;
        return `<div class="pg-cover-inner">
          <div class="rule"></div><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
          <div class="spine"><i></i><i></i><i></i><i></i><i></i></div>
          <span class="years">${esc(C.weddingText.slice(0, 4))} — ${esc(String(C.anniversaryYear))}</span>
          <div class="title">${esc(C.bookTitle)}</div>
          <span class="sub">${esc(C.bookSubtitle)}</span>
          <span class="seal">♥</span></div>`;
      }
      case 'photo':
        return `<figure><div class="ph ${pg.fit === 'contain' ? 'contain' : ''}" data-file="${esc(pg.file)}">
            <img data-src="${esc(pg.src)}" alt="" draggable="false" decoding="async"></div>
          <figcaption>${esc(pg.caption)}</figcaption></figure>
          <span class="folio">${esc(pg.folio)}</span>`;
      case 'text': {
        let h = '';
        if (pg.chapter) h += `<span class="chapter">${esc(pg.chapter)}</span>`;
        if (pg.big) h += `<span class="big">${esc(pg.big)}</span>`;
        if (pg.num) h += `<span class="num">${esc(pg.num)}</span>`;
        if (pg.lines) h += `<div class="lines">${pg.lines.map((l) => esc(l)).join('<br>')}</div>`;
        if (pg.hand) h += `<span class="rule-sm"></span><span class="hand">${esc(pg.hand)}</span>`;
        if (pg.small) h += `<span class="small">${esc(pg.small)}</span>`;
        if (pg.smallLines) h += `<div class="small">${pg.smallLines.map((l) => esc(l)).join('<br>')}</div>`;
        return h;
      }
      case 'plate':
        return `<span class="year">${esc(pg.year)}</span><span class="rule-sm"></span><span class="roman">${esc(pg.roman)}</span><span class="n">${esc(pg.n)}</span>`;
      case 'back':
        return `<div class="small">${(pg.smallLines || []).map((l) => esc(l)).join('<br>')}</div><span class="plate">${esc(pg.plate)}</span>`;
      default:
        return '';
    }
  }
  const faceClass = (pg) => pg.type === 'cover' ? 'pg-cover' : pg.type === 'back' ? 'pg-back' : pg.type === 'photo' ? 'pg-photo' : pg.type === 'plate' ? 'pg-plate' : pg.type === 'text' ? `pg-text ${pg.cls || ''}` : 'pg-blank';

  /* ── 建書 ─────────────────────────────── */
  Book.build = function (bookEl, stageEl, C) {
    Book.el = bookEl; Book.stage = stageEl;
    Book.pages = composePages(C);
    Book.leaves = Book.pages.length / 2;
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= Book.leaves; i++) {
      const f = Book.pages[2 * i - 2], b = Book.pages[2 * i - 1];
      const leaf = document.createElement('div');
      leaf.className = 'leaf'; leaf.dataset.i = i;
      leaf.style.setProperty('--angle', '0deg');
      leaf.innerHTML = `<div class="face front ${faceClass(f)}">${faceHTML(f, 'front')}</div><div class="face back ${faceClass(b)}">${faceHTML(b, 'back')}</div>`;
      frag.appendChild(leaf);
    }
    bookEl.appendChild(frag);
    bookEl.querySelectorAll('.leaf').forEach(setLeafZ);
    bookEl.querySelectorAll('.ph img').forEach((img) => {
      img.addEventListener('error', () => img.parentNode.classList.add('missing'));
    });
    updateShift();
    bindEvents();
  };

  Book.preload = function (count) {
    const imgs = [...Book.el.querySelectorAll('.ph img[data-src]')].slice(0, count || 999);
    imgs.forEach((img) => { img.src = img.dataset.src; img.removeAttribute('data-src'); });
  };

  function setLeafZ(leaf) {
    const i = +leaf.dataset.i;
    const flipped = leaf.classList.contains('flipped');
    leaf.style.zIndex = flipped ? i : Book.leaves - i + 1;
  }
  function leafAt(i) { return Book.el.querySelector(`.leaf[data-i="${i}"]`); }

  function updateShift() {
    const closed = Book.cur === 0, ended = Book.cur === Book.leaves;
    Book.el.classList.toggle('closed', closed);
    Book.el.classList.toggle('ended', ended);
    Book.el.style.setProperty('--shift', closed ? '-25%' : ended ? '25%' : '0%');
  }

  function notify(source) { updateShift(); if (Book.onChange) Book.onChange(Book.cur, source); }

  /* ── 程式化翻頁(逐頁 tick) ─────────────── */
  Book.go = function (n, source) {
    n = Math.max(0, Math.min(Book.leaves, n | 0));
    Book._target = n;
    Book._source = source || 'prog';
    if (!Book._stepping && n !== Book.cur && !Book._drag) step();
  };
  function step() {
    if (Book._drag) { Book._stepping = false; return; }
    if (Book.cur === Book._target) { Book._stepping = false; return; }
    Book._stepping = true;
    const dir = Book._target > Book.cur ? 1 : -1;
    const leaf = leafAt(dir === 1 ? Book.cur + 1 : Book.cur);
    if (!leaf) { Book._stepping = false; return; }
    flip(leaf, dir === 1);
    Book.cur += dir;
    notify(Book._source);
    if (Book.cur !== Book._target) setTimeout(step, 170); else Book._stepping = false;
  }
  function flip(leaf, toFlipped) {
    leaf.classList.remove('snapback');
    leaf.classList.add('turning');
    leaf.classList.toggle('flipped', toFlipped);
    leaf.style.setProperty('--angle', toFlipped ? '-180deg' : '0deg');
    leaf.style.setProperty('--lift', '0');
    if (window.Sound) Sound.page();
    clearTimeout(leaf._t);
    leaf._t = setTimeout(() => { leaf.classList.remove('turning'); setLeafZ(leaf); }, 1000);
  }

  /* ── 拖曳跟手 ─────────────────────────────── */
  function topLeaf(side) {
    const leaves = [...Book.el.querySelectorAll('.leaf')];
    const pool = leaves.filter((l) => (side === 'right' ? !l.classList.contains('flipped') : l.classList.contains('flipped')));
    if (!pool.length) return null;
    return pool.sort((a, b) => (+b.style.zIndex) - (+a.style.zIndex))[0];
  }

  function bindEvents() {
    const book = Book.el;

    book.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('button, a, input, textarea')) return;
      const rect = book.getBoundingClientRect();
      const spineX = rect.left + rect.width / 2;
      const target = topLeaf(e.clientX > spineX ? 'right' : 'left');
      if (!target) return;
      const startAngle = target.classList.contains('flipped') ? -180 : 0;
      Book._drag = { leaf: target, grabX: e.clientX, grabY: e.clientY, lastX: e.clientX, lastT: performance.now(), vx: 0,
        halfW: rect.width / 2, startAngle, curAngle: startAngle, id: e.pointerId, active: false };
      Book._moved = false;
      try { book.setPointerCapture(e.pointerId); } catch (err) {}
    });

    book.addEventListener('pointermove', (e) => {
      const d = Book._drag; if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.grabX, dy = e.clientY - d.grabY;
      if (!d.active) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx) * 1.2 && e.pointerType === 'touch') { Book._drag = null; return; } // 讓垂直捲動通過
        d.active = true; Book._moved = true;
        d.leaf.classList.remove('snapback', 'turning');
        d.leaf.classList.add('dragging'); book.classList.add('dragging');
      }
      const now = performance.now();
      d.vx = (e.clientX - d.lastX) / Math.max(1, now - d.lastT); d.lastX = e.clientX; d.lastT = now;
      let angle = d.startAngle + (dx / d.halfW) * 180;
      angle = Math.max(-180, Math.min(0, angle));
      d.curAngle = angle;
      d.leaf.style.setProperty('--angle', angle + 'deg');
      d.leaf.style.setProperty('--lift', (Math.sin(Math.PI * (-angle / 180)) * 0.9).toFixed(3));
    });

    const finish = (e) => {
      const d = Book._drag; if (!d) return;
      if (e && e.pointerId !== undefined && e.pointerId !== d.id) return;
      Book._drag = null;
      book.classList.remove('dragging');
      if (!d.active) return;
      const { leaf, startAngle, curAngle, vx } = d;
      leaf.classList.remove('dragging');
      let target;
      if (startAngle === 0) target = (curAngle < -180 * THRESH || vx < -0.6) ? -180 : 0;
      else target = (curAngle > -180 * (1 - THRESH) || vx > 0.6) ? 0 : -180;
      const wasFlipped = startAngle === -180, willFlip = target === -180;
      if (willFlip !== wasFlipped) {
        flip(leaf, willFlip);
        Book.cur += willFlip ? 1 : -1;
        Book._target = Book.cur;
        notify('user');
      } else {
        leaf.classList.add('snapback');
        leaf.style.setProperty('--angle', target + 'deg');
        leaf.style.setProperty('--lift', '0');
        setTimeout(() => leaf.classList.remove('snapback'), 750);
      }
    };
    book.addEventListener('pointerup', finish);
    book.addEventListener('pointercancel', finish);
    book.addEventListener('lostpointercapture', finish);

    /* 點左右邊緣翻頁 */
    book.addEventListener('click', (e) => {
      if (Book._moved) { Book._moved = false; return; }
      if (e.target.closest('button, a, input, textarea')) return;
      const rect = book.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      if (Book.cur === 0) { Book.go(1, 'user'); return; }
      if (Book.cur === Book.leaves) { Book.go(Book.leaves - 1, 'user'); return; }
      if (x < 0.25) Book.go(Book.cur - 1, 'user');
      else if (x > 0.75) Book.go(Book.cur + 1, 'user');
    });
  }

  window.Book = Book;
})();
