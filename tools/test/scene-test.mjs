// 在 Node 裡(沒有 WebGL)用真正的 Three.js 建構幕④ / 幕⑤ 場景,抓 API 與執行期錯誤。
//   node tools/test/scene-test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const THREE = await import(pathToFileURL(path.join(ROOT, 'vendor/three.module.min.js')).href);
console.log('three revision', THREE.REVISION);

const ctx2d = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? (a, b, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
const canvasEl = () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {}, toDataURL: () => 'data:image/png;base64,' });
const imgEl = () => ({ style: {}, addEventListener() {}, removeEventListener() {}, set src(v) {}, complete: false, width: 0, height: 0 });
const sb = { console, performance, setTimeout, clearTimeout, Math, Object, Array, Number, String, Float32Array, Uint16Array, Uint32Array, Uint8Array, Uint8ClampedArray, Map, Set, Promise, JSON, Error, Date,
  document: { createElement: (t) => (t === 'canvas' ? canvasEl() : t === 'img' ? imgEl() : { style: {} }), createElementNS: (ns, t) => (t === 'canvas' ? canvasEl() : imgEl()), fonts: { load: () => Promise.resolve([]) } },
  matchMedia: () => ({ matches: false }), navigator: { deviceMemory: 8 }, devicePixelRatio: 2, innerWidth: 1440, innerHeight: 900, addEventListener() {} };
sb.window = sb; sb.self = sb;
globalThis.document = sb.document; // Three 的 ImageLoader 會用全域 document
new Function('window', fs.readFileSync(path.join(ROOT, 'js/content.js'), 'utf8'))(sb);
new Function('window', fs.readFileSync(path.join(ROOT, 'js/figures.js'), 'utf8'))(sb);
let src = fs.readFileSync(path.join(ROOT, 'js/scene3d.js'), 'utf8');
src = src.replace(/\n  return S;\n\}\)\(\);\s*$/, '\n  S._t = { buildRoom, buildHeartScene, makeHeartGeometry }; return S;\n})();');
vm.createContext(sb); vm.runInContext(src, sb, { filename: 'scene3d.js' });
const S = sb.Scene3D;
S.THREE = THREE; S.env = new THREE.Texture(); S.ok = true; S.canvas = canvasEl();
S.renderer = { setSize() {}, setPixelRatio() {}, render() {}, domElement: canvasEl(), shadowMap: { enabled: true }, dispose() {} };

let fails = 0;
const t = (name, fn) => { try { const r = fn(); console.log('OK  ', name, (r === undefined || typeof r === 'object') ? '' : r); return r; } catch (e) { fails++; console.log('FAIL', name, e.stack.split('\n').slice(0, 4).join('\n')); } };
const room = t('buildRoom', () => S._t.buildRoom(THREE));
if (room) {
  S.room = room;
  t('room objects', () => `${room.scene.children.length} children; front=${room.front}; herFeetX=${room.her.feetX.toFixed(2)} himFeetX=${room.him.feetX.toFixed(2)}; faceMid=${room.faceMid.toArray().map((v) => v.toFixed(2))}; her ${room.her.w.toFixed(2)}×${room.her.h.toFixed(2)} him ${room.him.w.toFixed(2)}×${room.him.h.toFixed(2)}`);
}
const heart = t('buildHeartScene', () => S._t.buildHeartScene(THREE));
if (heart) S.heart = heart;
t('resize', () => S.resize());
t('setActive room', () => S.setActive('room'));
t('render room frames', () => { for (let i = 0; i < 30; i++) S.render(i * 16, { roomP: i / 30, heartP: 0, roomOpacity: 1, heartOpacity: 0 }); });
// 投影檢查:兩個人都要在畫面裡
t('room framing', () => {
  const out = [];
  for (const p of [0, 0.5, 0.95]) {
    S.render(1000 + p * 100, { roomP: p, roomOpacity: 1 });
    room.scene.updateMatrixWorld(true); room.camera.updateMatrixWorld(true); room.camera.updateProjectionMatrix();
    for (const [n, f] of [['her', room.her], ['him', room.him]]) {
      const top = new THREE.Vector3(0, f.h, 0).applyMatrix4(f.group.matrixWorld).project(room.camera);
      const feet = new THREE.Vector3(0, 0, 0).applyMatrix4(f.group.matrixWorld).project(room.camera);
      out.push(`p=${p} ${n} head(${top.x.toFixed(2)},${top.y.toFixed(2)}) feet(${feet.x.toFixed(2)},${feet.y.toFixed(2)})`);
    }
  }
  return out.join(' | ');
});
t('setHands', () => { S.setHands(true); for (let i = 0; i < 40; i++) S.render(2000 + i * 16, { roomP: 0.5, roomOpacity: 1 }); return `heartK=${room.heartK.toFixed(2)} herRotZ=${room.her.group.rotation.z.toFixed(3)} himRotZ=${room.him.group.rotation.z.toFixed(3)} heartScale=${room.smallHeart.scale.x.toFixed(2)}`; });
t('kiss', () => { const ms = S.kiss(); let maxK = 0, maxVis = 0; for (let i = 0; i < 240; i++) { S.render(3000 + i * 16, { roomP: 0.5, roomOpacity: 1 }); maxK = Math.max(maxK, room.kissK); maxVis = Math.max(maxVis, room.puffs.filter((p) => p.mesh.visible).length); } return `ms=${ms} maxKissK=${maxK.toFixed(2)} maxPuffsVisible=${maxVis} kissT(after)=${room.kissT}`; });
t('setHearts single', () => S.setHearts([{ c: 'rose', m: 'ceramic', h: 'none', e: '' }]));
t('setHearts double + engraving', () => S.setHearts([{ c: 'gold', m: 'metal', h: 'ring', e: '相愛相守' }, { c: 'mist', m: 'glass', h: 'glow', e: '二十二年' }]));
for (const m of ['ceramic', 'velvet', 'metal', 'glass']) for (const h of ['none', 'ring', 'glow']) t(`cfg ${m}/${h}`, () => S.setHearts([{ c: 'ivory', m, h, e: 'x' }]));
t('setActive heart', () => S.setActive('heart'));
t('render heart frames', () => { for (let i = 0; i < 30; i++) S.render(5000 + i * 16, { heartP: i / 30, heartOpacity: 1 }); });
t('heartDrag', () => { S.heartDrag.start(); S.heartDrag.move(12); S.render(6000, { heartP: 0.5, heartOpacity: 1 }); S.heartDrag.end(); S.render(6016, { heartP: 0.5, heartOpacity: 1 }); return 'spin=' + S.heart.spin.toFixed(3); });
t('degrade', () => S.degrade());
t('snapshotHeart', () => (S.snapshotHeart() || '').slice(0, 20));
console.log(fails ? `\n${fails} FAILURES` : '\nAll scene tests passed.');
process.exit(fails ? 1 : 0);
