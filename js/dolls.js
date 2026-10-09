/* ============================================================
   dolls.js ── 獨立的芭蕾舞音樂盒場景互動
   肖像固定朝向觀眾;舞台、底盤與微塵慢轉。WebGL 失敗時改用同一份原圖的 CSS 舞台。
   ============================================================ */
(function () {
  const $ = (s) => document.querySelector(s);
  const fallback = $('#doll-fallback');
  const hit = $('#doll-photo-hit');
  const status = $('#doll-photo-status');
  const photos = [$('#doll-photo-0'), $('#doll-photo-1')];
  const labels = ['婚紗照中的陶瓷娃娃', '牽手照片中的陶瓷娃娃'];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const melody = [12, 19, 24, 19, 17, 14, 19, 12];
  const state = { index: 0, active: false, webgl: false, soundTimer: 0, note: 0, entryTimers: [], pointer: null, ignoreClickUntil: 0, ready: false };

  function syncPhoto() {
    photos.forEach((img, i) => img.classList.toggle('active', i === state.index));
    hit.setAttribute('aria-label', `切換照片，目前顯示：${labels[state.index]}`);
    status.textContent = `目前顯示：${labels[state.index]}`;
    if (window.Scene3D && Scene3D.ok) Scene3D.setDollPhoto(state.index);
  }

  function makeDust() {
    const box = $('#doll-fallback-dust');
    for (let i = 0; i < 12; i++) {
      const mote = document.createElement('i');
      const x = 34 + Math.random() * 32;
      const y = 82 + Math.random() * 13;
      mote.style.setProperty('--x', `${x.toFixed(2)}%`);
      mote.style.setProperty('--y', `${y.toFixed(2)}%`);
      mote.style.setProperty('--size', `${(2 + Math.random() * 2).toFixed(1)}px`);
      mote.style.setProperty('--drift', `${(Math.random() * 16 - 8).toFixed(1)}px`);
      mote.style.setProperty('--delay', `${(-Math.random() * 10).toFixed(2)}s`);
      box.appendChild(mote);
    }
  }

  function startFallbackEntry() {
    if (state.webgl) return;
    state.entryTimers.forEach(clearTimeout);
    state.entryTimers.length = 0;
    fallback.classList.remove('is-entered', 'is-revealed', 'is-spinning');
    if (reduced) {
      fallback.classList.add('is-entered', 'is-revealed', 'is-spinning');
      return;
    }
    requestAnimationFrame(() => fallback.classList.add('is-entered'));
    state.entryTimers.push(setTimeout(() => fallback.classList.add('is-revealed'), 720));
    state.entryTimers.push(setTimeout(() => fallback.classList.add('is-spinning'), 2050));
  }

  function stopMusic() {
    if (state.soundTimer) clearTimeout(state.soundTimer);
    state.soundTimer = 0;
  }
  function playNextNote() {
    state.soundTimer = 0;
    if (!state.active || !window.Sound || !Sound.enabled) return;
    Sound.ding(melody[state.note]);
    state.note = (state.note + 1) % melody.length;
    const pause = state.note === 0 ? 1550 : 900;
    state.soundTimer = setTimeout(playNextNote, pause);
  }
  function syncMusic() {
    stopMusic();
    if (state.active && window.Sound && Sound.enabled) playNextNote();
  }

  function setActive(on) {
    const next = !!on;
    if (state.active === next) return;
    state.active = next;
    if (next) startFallbackEntry();
    else {
      state.entryTimers.forEach(clearTimeout); state.entryTimers.length = 0;
      if (!state.webgl) fallback.classList.remove('is-entered', 'is-revealed', 'is-spinning');
    }
    syncMusic();
  }

  function setWebGL(available) {
    state.webgl = !!available;
    fallback.hidden = state.webgl;
    if (state.webgl) {
      state.entryTimers.forEach(clearTimeout); state.entryTimers.length = 0;
      fallback.classList.remove('is-entered', 'is-revealed', 'is-spinning');
      if (window.Scene3D && Scene3D.ok) Scene3D.setDollPhoto(state.index);
    } else if (state.active) startFallbackEntry();
  }

  function changePhoto(direction = 1) {
    state.index = (state.index + direction + photos.length) % photos.length;
    syncPhoto();
  }

  function bindGesture() {
    hit.addEventListener('click', (e) => {
      if (performance.now() < state.ignoreClickUntil) { e.preventDefault(); return; }
      changePhoto(1);
    });
    hit.addEventListener('pointerdown', (e) => {
      if (!state.active) return;
      state.pointer = { x: e.clientX, y: e.clientY, id: e.pointerId };
      try { hit.setPointerCapture(e.pointerId); } catch (_) {}
    });
    hit.addEventListener('pointerup', (e) => {
      if (!state.pointer || e.pointerId !== state.pointer.id) return;
      const dx = e.clientX - state.pointer.x, dy = e.clientY - state.pointer.y;
      state.pointer = null;
      if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        changePhoto(dx < 0 ? 1 : -1);
        state.ignoreClickUntil = performance.now() + 480;
      }
    });
    hit.addEventListener('pointercancel', () => { state.pointer = null; });
    addEventListener('keydown', (e) => {
      if (!state.active || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); changePhoto(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); changePhoto(-1); }
    });
  }

  const DollScene = {
    init() {
      if (state.ready) return;
      state.ready = true;
      makeDust();
      bindGesture();
      syncPhoto();
    },
    update(opacity) {
      setActive(opacity > 0.015);
    },
    setWebGL,
    soundChanged() { syncMusic(); },
    changePhoto,
    getPhoto() { return state.index; },
  };
  window.DollScene = DollScene;
})();
