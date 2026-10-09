// 用 jsdom 跑整個頁面(不含 WebGL):開機、掃過整條捲動軸、翻書、心的面板、牽手 / 親吻、聲音鍵。
//   npm i -g jsdom 或 NODE_PATH=<有 jsdom 的 node_modules> node tools/test/dom-test.js
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', (e) => { const msg = String(e.detail && e.detail.stack || e.stack || e.message); if (!/window\.prompt/.test(msg)) errors.push('jsdomError: ' + msg); });
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
vc.on('warn', (...a) => console.log('[warn]', ...a));
vc.on('log', (...a) => console.log('[log]', ...a));

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<link[^>]+fonts\.(googleapis|gstatic)[^>]*>/g, '');
const dom = new JSDOM(html, {
  url: 'http://localhost:8080/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(window) {
    window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    window.scrollTo = function (a, b) { window.__scrollY = typeof a === 'object' ? a.top : b; };
    Object.defineProperty(window, 'scrollY', { get: () => window.__scrollY || 0, configurable: true });
    Object.defineProperty(window, 'pageYOffset', { get: () => window.__scrollY || 0, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true, writable: true });
    window.HTMLElement.prototype.setPointerCapture = function () {};
    window.HTMLElement.prototype.releasePointerCapture = function () {};
    window.HTMLElement.prototype.hasPointerCapture = function () { return false; };
    window.HTMLElement.prototype.getBoundingClientRect = function () { return { left: 100, top: 100, width: 800, height: 500, right: 900, bottom: 600, x: 100, y: 100 }; };
    class P { constructor(v) { this.value = v; } setValueAtTime() { return this; } linearRampToValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; } setTargetAtTime() { return this; } cancelScheduledValues() { return this; } }
    class N { constructor() { this.gain = new P(1); this.frequency = new P(440); this.Q = new P(1); this.detune = new P(0); this.pan = new P(0); this.playbackRate = new P(1); this.type = 'sine'; this.threshold = new P(-24); this.knee = new P(30); this.ratio = new P(12); this.attack = new P(0); this.release = new P(.25); } connect(n) { return n; } disconnect() {} start() {} stop() {} }
    class Ctx { constructor() { this.currentTime = 0; this.state = 'running'; this.destination = new N(); this.sampleRate = 44100; } createGain() { return new N(); } createOscillator() { return new N(); } createBiquadFilter() { return new N(); } createBufferSource() { return new N(); } createStereoPanner() { return new N(); } createDelay() { return new N(); } createConvolver() { return new N(); } createDynamicsCompressor() { return new N(); } createWaveShaper() { return new N(); } createBuffer(ch, len, sr) { return { getChannelData: () => new Float32Array(len), length: len, duration: len / sr, numberOfChannels: ch, sampleRate: sr }; } resume() { return Promise.resolve(); } }
    window.AudioContext = Ctx; window.webkitAudioContext = Ctx;
    window.HTMLCanvasElement.prototype.getContext = function () { return null; };
    Object.defineProperty(window.document, 'fonts', { value: { ready: Promise.resolve(), load: () => Promise.resolve([]) }, configurable: true });
    window.__now = 0; window.__rafQ = [];
    window.requestAnimationFrame = (cb) => { window.__rafQ.push(cb); return window.__rafQ.length; };
    window.cancelAnimationFrame = () => {};
    window.performance.now = () => window.__now;
  },
});
const { window } = dom; const { document } = window;
const $ = (s) => document.querySelector(s);
function run(rel) { try { window.eval(fs.readFileSync(path.join(ROOT, rel), 'utf8') + `\n//# sourceURL=${rel}`); } catch (e) { errors.push(`script ${rel}: ${e.stack}`); } }
['js/content.js', 'js/audio.js', 'js/book.js', 'js/threshold.js', 'js/flowers.js', 'js/figures.js', 'js/scene3d.js', 'js/dolls.js', 'js/app.js'].forEach(run);
function tick(ms) { window.__now += ms; const q = window.__rafQ; window.__rafQ = []; q.forEach((cb) => { try { cb(window.__now); } catch (e) { errors.push('raf: ' + e.stack); } }); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(120);
  console.log('body.ready =', document.body.classList.contains('ready'), '| Scene3D.ok =', window.Scene3D.ok, '| room-fallback hidden =', $('#room-fallback').hidden, '| heart-fallback hidden =', $('#heart-fallback').hidden);
  console.log('fallback vars:', $('#fb-stage').style.cssText.slice(0, 120), '| her src =', $('#fb-her').getAttribute('src'), '| dir =', $('#room-fallback').style.getPropertyValue('--dir'));
  console.log('leaves =', window.Book.leaves, '| shards =', document.querySelectorAll('#shards .shard').length, '| flowers =', document.querySelectorAll('#garden .flower').length);
  const coverText = $('#prologue').textContent.replace(/\s+/g, ' ').trim();
  console.log('title =', document.title, '| cover text =', coverText);
  if (coverText !== '吳文勝 劉翊鈴 婚紗照') errors.push('Unexpected cover text: ' + coverText);
  if (/\d|XXII/i.test(coverText)) errors.push('Cover contains a number or Roman numeral: ' + coverText);
  const total = parseFloat($('#scroller').style.height) - 900, steps = 300, seen = {};
  for (let i = 0; i <= steps; i++) {
    window.__scrollY = (total * i) / steps;
    for (let k = 0; k < 6; k++) tick(16);
    document.querySelectorAll('.act.is-on').forEach((a) => (seen[a.id] = (seen[a.id] || 0) + 1));
    if (i % 60 === 0) console.log(`t=${(i / steps).toFixed(2)} on=[${[...document.querySelectorAll('.act.is-on')].map((a) => `${a.id}:${a.style.opacity}`).join(' ')}] book.cur=${window.Book.cur} actions=${$('#room-actions').classList.contains('show')}`);
  }
  console.log('acts seen:', JSON.stringify(seen), '| flowers bloomed:', document.querySelectorAll('#garden .flower.on').length, '| echo:', $('#echo').className);
  // 芭蕾舞音樂盒:無 WebGL 備援、點擊與水平滑動切換原圖
  const dollStart = (130 + 150 + 130 + window.Book.leaves * 34 + 230) / 100 * 900;
  window.__scrollY = 0; for (let k = 0; k < 35; k++) tick(16);
  window.__scrollY = dollStart + (210 / 100 * 900) * 0.5; for (let k = 0; k < 90; k++) tick(16);
  console.log('doll active =', $('#dolls').classList.contains('is-active'), '| CSS fallback =', !$('#doll-fallback').hidden, '| photo =', window.DollScene.getPhoto());
  $('#doll-photo-hit').click();
  if (window.DollScene.getPhoto() !== 1 || !$('#doll-photo-1').classList.contains('active')) errors.push('Doll tap did not change photo');
  const pointer = (type, x, y) => { const e = new window.Event(type, { bubbles: true }); Object.defineProperties(e, { clientX: { value: x }, clientY: { value: y }, pointerId: { value: 7 } }); $('#doll-photo-hit').dispatchEvent(e); };
  pointer('pointerdown', 520, 350); pointer('pointerup', 585, 354);
  if (window.DollScene.getPhoto() !== 0 || !$('#doll-photo-0').classList.contains('active')) errors.push('Doll swipe did not change photo');
  let melodyNotes = 0; const originalDing = window.Sound.ding; window.Sound.ding = () => { melodyNotes++; };
  if (window.Sound.enabled) errors.push('Sound should start disabled');
  $('#sound').click();
  if (!window.Sound.enabled || melodyNotes < 1) errors.push('Doll melody did not start through the global sound switch');
  $('#sound').click();
  if (window.Sound.enabled) errors.push('Doll melody should stop when global sound is disabled');
  window.Sound.ding = originalDing;
  console.log('doll click/swipe → photo =', window.DollScene.getPhoto(), '| melody notes after global sound toggle =', melodyNotes);
  // 房間:牽手 / 親吻(備援模式)
  window.__scrollY = 0; for (let k = 0; k < 30; k++) tick(16);
  const roomStart = (130 + 150 + 130 + window.Book.leaves * 34) / 100 * 900;
  window.__scrollY = roomStart + 2.3 * 900 * 0.5; for (let k = 0; k < 60; k++) tick(16);
  console.log('room active =', $('#room').classList.contains('is-active'), '| actions show =', $('#room-actions').classList.contains('show'));
  $('#hands-btn').click(); console.log('hands →', $('#hands-btn').getAttribute('aria-pressed'), $('#hands-btn .txt').textContent, '| fallback.hands =', $('#room-fallback').classList.contains('hands'));
  $('#kiss-btn').click(); console.log('kiss → busy =', $('#kiss-btn').classList.contains('busy'), '| fallback.kiss =', $('#room-fallback').classList.contains('kiss'));
  // 心
  $('#opt-color button[data-v="gold"]').click();
  $('#engrave').value = '相愛相守'; $('#engrave').dispatchEvent(new window.Event('input', { bubbles: true })); await sleep(250);
  console.log('heart fallback --hc =', $('#heart-fallback').style.getPropertyValue('--hc'), '| engrave =', $('#fb-engrave').textContent);
  $('#share-btn').click(); await sleep(30); console.log('hash =', window.location.hash.slice(0, 40) + '…');
  $('#sound').click(); console.log('sound pressed =', $('#sound').getAttribute('aria-pressed')); $('#sound').click();
  // 書:鍵盤
  window.__scrollY = (130 + 150) / 100 * 900 + 0.3 * (130 + window.Book.leaves * 34) / 100 * 900; for (let k = 0; k < 80; k++) tick(16); await sleep(700); for (let k = 0; k < 10; k++) tick(16);
  const before = window.Book.cur; window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await sleep(300); for (let k = 0; k < 10; k++) tick(16);
  console.log('book active =', $('#book-act').classList.contains('is-active'), '| ArrowRight:', before, '→', window.Book.cur);
  await sleep(3600);
  console.log('kiss busy cleared =', !$('#kiss-btn').classList.contains('busy'), '| prologue classes:', $('#prologue').className);
  if (errors.length) { console.log('\n=== ERRORS ==='); errors.forEach((e) => console.log(e)); process.exitCode = 1; } else console.log('\nNo runtime errors.');
  window.close();
})();
