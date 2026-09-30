/* ============================================================
   scene3d.js ── 幕④ 陶瓷人偶(呼吸 / 視線跟隨 / 牽手)+ 幕⑤ 3D 心定制器
   單一 WebGL canvas,兩個 scene 輪流渲染;霧色 = 頁面底色,場景從霧裡浮出來
   Three.js 先讀本機 vendor/,失敗再退到 CDN(直接雙擊 index.html 也能跑)
   ============================================================ */
window.Scene3D = (function () {
  const S = { ok: false, THREE: null, renderer: null, canvas: null, env: null, room: null, heart: null,
    active: null, pointer: { x: 0, y: 0 }, low: false, _ft: [], reduced: false };

  const THREE_URLS = [
    './vendor/three.module.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js',
    'https://unpkg.com/three@0.170.0/build/three.module.min.js',
  ];

  async function loadThree() {
    for (const u of THREE_URLS) {
      try { const m = await import(u); if (m && m.WebGLRenderer) return m; } catch (e) { /* try next */ }
    }
    return null;
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ── 初始化 ─────────────────────────────── */
  S.init = async function (canvas) {
    S.canvas = canvas;
    S.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const THREE = await loadThree();
    if (!THREE) return false;
    S.THREE = THREE;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    S.low = (navigator.deviceMemory && navigator.deviceMemory < 4) || false;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, S.low ? 1.25 : 2));
    renderer.setClearColor(0xFAFAFA, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = !S.low;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    S.renderer = renderer;
    try {
      S.env = makeEnvironment(THREE, renderer);
      S.room = buildRoom(THREE);
      S.heart = buildHeartScene(THREE);
      S.resize();
    } catch (e) { console.warn('[Scene3D] build failed, using static fallback', e); try { renderer.dispose(); } catch (_) {} return false; }
    addEventListener('resize', S.resize);
    S.ok = true;
    return true;
  };

  S.resize = function () {
    if (!S.renderer) return;
    const w = innerWidth, h = innerHeight;
    S.renderer.setSize(w, h, false);
    [S.room, S.heart].forEach((sc) => { if (sc) { sc.camera.aspect = w / h; sc.camera.updateProjectionMatrix(); } });
  };

  /* ── 攝影棚環境(取代 RoomEnvironment,無需 addon) ── */
  function makeEnvironment(THREE, renderer) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xB8B8B8);
    const geo = new THREE.PlaneGeometry(1, 1);
    const panel = (hex, k, w, h, pos) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
      m.scale.set(w, h, 1); m.position.set(pos[0], pos[1], pos[2]); m.lookAt(0, 0, 0); scene.add(m);
    };
    panel(0xFFFFFF, 7, 6, 4, [4, 6, 4]);       // 主光:右上
    panel(0xD8E4F0, 2.6, 5, 5, [-6, 3, 2]);    // 冷色補光:左
    panel(0xFFFFFF, 1.8, 8, 3, [0, 2.5, -7]);  // 輪廓光:後
    panel(0x777777, 0.5, 14, 14, [0, -7, 0]);  // 地板:暗
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(scene, 0.04).texture;
    pm.dispose();
    return tex;
  }

  /* ── 材質 ─────────────────────────────── */
  function porcelain(THREE, hex, o = {}) {
    return new THREE.MeshPhysicalMaterial(Object.assign({ color: hex, roughness: 0.32, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.18, envMapIntensity: 0.85 }, o));
  }
  function textTexture(THREE, text, { w = 1024, h = 256, font = '600 84px "Noto Serif TC", "Songti TC", serif', color = '#3A2C10', spacing = 10 } = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.clearRect(0, 0, w, h);
    x.fillStyle = color; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
    try { x.letterSpacing = spacing + 'px'; } catch (e) {}
    x.fillText(text, w / 2 + spacing / 2, h / 2 + 4);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  /* ── 幕④:客廳 ───────────────────────────
     兩層「照片浮雕」:她 / 他 各是一張去背照片貼在細分平面上,
     用距離變換高度圖做位移(displacement)+ 法線圖打光 → 有厚度的陶瓷感,
     但顏色 100% 來自照片(emissive),所以和上傳的公仔一模一樣。 */
  function buildRoom(THREE) {
    const C = window.CONTENT, FG = window.FIGURES;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xFAFAFA, 0.06);
    scene.environment = S.env;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    camera.position.set(0, 1.5, 7.5);

    const key = new THREE.DirectionalLight(0xFFFFFF, 1.6); key.position.set(3.5, 6, 4.5);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6;
    key.shadow.camera.near = 1; key.shadow.camera.far = 20;
    key.shadow.camera.left = key.shadow.camera.bottom = -3; key.shadow.camera.right = key.shadow.camera.top = 3;
    key.shadow.bias = -0.0006;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xDCE6F0, 0.7); fill.position.set(-5, 2.5, 2); scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xE0E0E0, 0.5));

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.14; ground.receiveShadow = true; scene.add(ground);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.24, 0.14, 72), porcelain(THREE, 0xF1F1F0, { roughness: 0.28, clearcoat: 0.6 }));
    pedestal.position.y = -0.07; pedestal.receiveShadow = true; pedestal.castShadow = true; scene.add(pedestal);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.012, 12, 120), new THREE.MeshStandardMaterial({ color: 0xC9A227, metalness: 1, roughness: 0.25 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.003; scene.add(rim);

    // 銅牌
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.11, 0.02), new THREE.MeshStandardMaterial({ color: 0xC9A227, metalness: 1, roughness: 0.3 }));
    plate.position.set(0, -0.045, 1.215); plate.rotation.x = -0.18; scene.add(plate);
    const plateText = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.09),
      new THREE.MeshBasicMaterial({ map: textTexture(THREE, `${C.father.name.slice(1)} · ${C.mother.name.slice(1)} · ${C.weddingText}`, { w: 1200, h: 180, font: '500 92px "Noto Serif TC","Songti TC",serif', color: '#4A3609', spacing: 8 }), transparent: true }));
    plateText.position.set(0, -0.045, 1.226); plateText.rotation.x = -0.18; scene.add(plateText);

    // 兩層照片浮雕
    const FIG_H = 1.62;                         // 整張合照在世界裡的高度
    const px = FIG_H / FG.image.h;              // 每像素 = 幾個世界單位
    const mkFigure = (key, z) => {
      const m = FG[key];
      const w = m.w * px, h = m.h * px;
      const segX = Math.min(160, Math.max(32, Math.round(m.w / 6))), segY = Math.min(240, Math.max(48, Math.round(m.h / 6)));
      const geo = new THREE.PlaneGeometry(w, h, segX, segY);
      const loader = new THREE.TextureLoader();
      const map = loader.load(m.src); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
      const disp = loader.load(m.height);
      const nrm = loader.load(m.normal);
      const depth = FIG_H * 0.075;
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0x000000,                        // 不吃漫反射光 → 顏色完全等於照片
        emissive: 0xFFFFFF, emissiveMap: map, emissiveIntensity: 1.0,
        map,                                    // 只為了 alpha
        displacementMap: disp, displacementScale: depth, displacementBias: 0,
        normalMap: nrm, normalScale: new THREE.Vector2(0.7, 0.7),
        roughness: 0.34, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.22, envMapIntensity: 0.35,
        alphaTest: 0.08, alphaToCoverage: true, transparent: false, side: THREE.FrontSide, fog: true,
      });
      mat.toneMapped = false;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5, displacementMap: disp, displacementScale: depth });
      // 群組原點 = 這個人的腳底(旋轉/傾身的軸心)
      const feetX = (m.x + m.pivot - FG.image.w / 2) * px;
      const cx = (m.x + m.w / 2 - FG.image.w / 2) * px, cy = (FG.image.h - (m.y + m.h / 2)) * px;
      const group = new THREE.Group(); group.position.set(feetX, 0, z);
      mesh.position.set(cx - feetX, cy, 0);
      group.add(mesh);
      const faceY = (FG.image.h - (m.y + m.h * 0.13)) * px;   // 臉大約在這一層上方 13% 處
      return { group, mesh, mat, feetX, faceY, baseZ: z, w, h };
    };
    const frontKey = FG.front === 'him' ? 'him' : 'her';
    const her = mkFigure('her', frontKey === 'her' ? 0.03 : -0.03);
    const him = mkFigure('him', frontKey === 'him' ? 0.03 : -0.03);
    her.mesh.renderOrder = frontKey === 'her' ? 2 : 1; him.mesh.renderOrder = frontKey === 'him' ? 2 : 1;
    scene.add(her.group); scene.add(him.group);

    // 牽手時浮出的小心 + 親吻時冒出的小心們
    const heartGeo = makeHeartGeometry(THREE, 0.12, 0.05);
    const heartMat = new THREE.MeshPhysicalMaterial({ color: 0xC9202A, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1 });
    const smallHeart = new THREE.Mesh(heartGeo, heartMat);
    smallHeart.position.set(0, 0.9, 0.3); smallHeart.scale.setScalar(0.001); smallHeart.castShadow = true; scene.add(smallHeart);
    const puffs = [];
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(heartGeo, new THREE.MeshPhysicalMaterial({ color: i % 2 ? 0xE8A0A6 : 0xC9202A, roughness: 0.3, clearcoat: 1, transparent: true, opacity: 0 }));
      p.scale.setScalar(0.001); p.visible = false; scene.add(p); puffs.push({ mesh: p, t: 99, vx: 0, vy: 0, vz: 0, spin: 0 });
    }
    const faceMid = new THREE.Vector3((her.feetX + him.feetX) / 2, (her.faceY + him.faceY) / 2, 0.2);

    return { scene, camera, her, him, front: frontKey, smallHeart, puffs, faceMid, hands: false, t: 0, heartK: 0, kissT: -1, kissK: 0, burstDone: false };
  }

  function makeHeartGeometry(THREE, size = 1, depth = 0.34) {
    const s = new THREE.Shape();
    s.moveTo(0, 0.32);
    s.bezierCurveTo(0, 0.62, -0.62, 0.62, -0.62, 0.18);
    s.bezierCurveTo(-0.62, -0.12, -0.2, -0.32, 0, -0.62);
    s.bezierCurveTo(0.2, -0.32, 0.62, -0.12, 0.62, 0.18);
    s.bezierCurveTo(0.62, 0.62, 0, 0.62, 0, 0.32);
    let g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.12, bevelSegments: 10, curveSegments: 28 });
    g = mergeVerts(THREE, g);
    g.computeVertexNormals();
    g.center();
    g.scale(size, size, size);
    return g;
  }
  function mergeVerts(THREE, geo) {
    const pos = geo.attributes.position, n = pos.count, map = new Map(), idx = [], out = [];
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = `${Math.round(x * 1e4)}_${Math.round(y * 1e4)}_${Math.round(z * 1e4)}`;
      let j = map.get(k);
      if (j === undefined) { j = out.length / 3; map.set(k, j); out.push(x, y, z); }
      idx.push(j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    g.setIndex(idx);
    return g;
  }

  /* ── 幕⑤:心 ─────────────────────────────── */
  const COLORS = { rose: 0xC9202A, ivory: 0xF2F2F2, gold: 0xC9A227, mist: 0xB9BEC2 };
  function heartMaterial(THREE, cfg) {
    const color = COLORS[cfg.c] || COLORS.rose;
    switch (cfg.m) {
      case 'velvet': return new THREE.MeshPhysicalMaterial({ color, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35), envMapIntensity: 0.4 });
      case 'metal': return new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: 0.2, envMapIntensity: 1.2 });
      case 'glass': return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35), transmission: S.low ? 0 : 0.92, thickness: 1.2, roughness: 0.06, ior: 1.5, metalness: 0,
        attenuationColor: new THREE.Color(color), attenuationDistance: 1.4, clearcoat: 1, envMapIntensity: 1, transparent: S.low });
      default: return new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1 });
    }
  }
  function glowTexture(THREE) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'); const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, 'rgba(232,196,192,.9)'); g.addColorStop(0.45, 'rgba(232,196,192,.35)'); g.addColorStop(1, 'rgba(232,196,192,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  function buildHeartScene(THREE) {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xFAFAFA, 0.08);
    scene.environment = S.env;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0.1, 5.4);
    const key = new THREE.DirectionalLight(0xFFFFFF, 2.0); key.position.set(3, 5, 4); scene.add(key);
    const fill = new THREE.DirectionalLight(0xDCE6F0, 0.8); fill.position.set(-4, 1, 3); scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xE8E8E8, 0.5));
    const root = new THREE.Group(); scene.add(root);
    const geo = makeHeartGeometry(THREE, 1, 0.34);
    const glowTex = glowTexture(THREE);
    return { scene, camera, root, geo, glowTex, hearts: [], spin: 0, vel: 0, dragging: false, scaleK: 0, t: 0 };
  }

  function makeHeartObject(THREE, H, cfg) {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(H.geo, heartMaterial(THREE, cfg)); g.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    const frontZ = box.max.z;
    const engrave = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    engrave.position.set(0, 0.02, frontZ + 0.006); g.add(engrave);
    const obj = { group: g, mesh, engrave, halo: null, cfg: null };
    applyHeartConfig(THREE, H, obj, cfg);
    return obj;
  }
  function applyHeartConfig(THREE, H, obj, cfg) {
    const prev = obj.cfg || {};
    if (prev.c !== cfg.c || prev.m !== cfg.m) { obj.mesh.material.dispose(); obj.mesh.material = heartMaterial(THREE, cfg); }
    if (prev.h !== cfg.h) {
      if (obj.halo) { obj.group.remove(obj.halo); obj.halo = null; }
      if (cfg.h === 'ring') {
        obj.halo = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.018, 16, 160), new THREE.MeshStandardMaterial({ color: 0xC9A227, metalness: 1, roughness: 0.22, envMapIntensity: 1.2 }));
        obj.halo.rotation.x = 1.25; obj.group.add(obj.halo);
      } else if (cfg.h === 'glow') {
        obj.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: H.glowTex, transparent: true, depthWrite: false, opacity: 0.9 }));
        obj.halo.scale.set(3.6, 3.6, 1); obj.halo.position.z = -0.4; obj.group.add(obj.halo);
      }
    }
    if (prev.e !== cfg.e || prev.c !== cfg.c) {
      const text = (cfg.e || '').trim();
      if (obj.engrave.material.map) obj.engrave.material.map.dispose();
      if (text) {
        const color = (cfg.c === 'ivory' || cfg.c === 'gold') ? '#C9202A' : '#F3DFA0';
        obj.engrave.material.map = textTexture(THREE, text, { w: 1024, h: 512, font: '400 150px "Ma Shan Zheng","Noto Serif TC",serif', color, spacing: 12 });
        obj.engrave.material.opacity = 1; obj.engrave.material.needsUpdate = true;
      } else { obj.engrave.material.map = null; obj.engrave.material.opacity = 0; obj.engrave.material.needsUpdate = true; }
    }
    obj.cfg = Object.assign({}, cfg);
  }

  /* hearts:[cfg] 一顆或兩顆(雙心) */
  S.setHearts = function (list) {
    if (!S.ok) return;
    const THREE = S.THREE, H = S.heart;
    while (H.hearts.length > list.length) { const o = H.hearts.pop(); H.root.remove(o.group); }
    list.forEach((cfg, i) => {
      if (!H.hearts[i]) { H.hearts[i] = makeHeartObject(THREE, H, cfg); H.root.add(H.hearts[i].group); }
      else applyHeartConfig(THREE, H, H.hearts[i], cfg);
    });
    const two = list.length === 2;
    H.hearts.forEach((o, i) => {
      o.group.position.x = two ? (i === 0 ? -0.72 : 0.72) : 0;
      o.group.rotation.y = two ? (i === 0 ? 0.3 : -0.3) : 0;
      o.group.scale.setScalar(two ? 0.82 : 1);
    });
  };
  S.refreshEngraving = function () { if (S.ok) S.heart.hearts.forEach((o) => { const c = Object.assign({}, o.cfg); o.cfg.e = '\u0000'; applyHeartConfig(S.THREE, S.heart, o, c); }); };

  /* ── 每幀更新 ─────────────────────────────── */
  S.setActive = function (name) {
    S.active = name;
    S.canvas.style.opacity = name ? 1 : 0;
  };

  let lastNow = 0;
  S.render = function (now, { roomP = 0, heartP = 0, roomOpacity = 0, heartOpacity = 0 } = {}) {
    if (!S.ok || !S.active) return;
    const dt = Math.min(0.05, lastNow ? (now - lastNow) / 1000 : 0.016); lastNow = now;
    const THREE = S.THREE, k = 1 - Math.pow(0.92, dt * 60);
    if (S.active === 'room') {
      const R = S.room; R.t += dt;
      // 親吻時間軸(秒):0–.7 傾身 → 停到 2.3 → 2.3–3.2 回正
      let kiss = 0;
      if (R.kissT >= 0) {
        R.kissT += dt;
        kiss = smooth(0, 0.7, R.kissT) * (1 - smooth(2.3, 3.2, R.kissT));
        if (R.kissT > 0.55 && !R.burstDone) { R.burstDone = true; burstHearts(R); }
        if (R.kissT > 3.4) { R.kissT = -1; R.burstDone = false; }
      }
      R.kissK += (kiss - R.kissK) * k;
      const hands = R.hands ? 1 : 0;
      R.heartK += (hands - R.heartK) * k * 0.7;
      // 相機路徑:遠 → 近,微微環繞;親吻時再推近一點
      const a = smooth(0, 0.7, roomP);
      const orbit = Math.sin(roomP * Math.PI) * 0.9;
      R.camera.position.set(lerp(0.4, -0.3, roomP) + orbit * 0.4, lerp(1.7, 1.2, a) + 0.1 * R.kissK, lerp(7.6, 4.4, a) - 0.9 * R.kissK);
      R.camera.lookAt(0, lerp(0.75, 0.92, a) + 0.3 * R.kissK, 0);
      R.scene.fog.density = lerp(0.075, 0.018, smooth(0, 0.45, roomP)) + smooth(0.82, 1, roomP) * 0.12;
      // 呼吸(以腳底為軸的極小縮放)
      const br = 1 + 0.004 * Math.sin((R.t / 4) * Math.PI * 2), br2 = 1 + 0.004 * Math.sin((R.t / 4.6) * Math.PI * 2 + 1.3);
      // 視線 / 身體跟隨滑鼠(±10°),牽手時彼此微微相向,親吻時他傾身過去、她微微仰起
      const gx = clamp(S.pointer.x * 0.18, -0.18, 0.18), gy = clamp(-S.pointer.y * 0.05, -0.05, 0.05);
      const dirHer = R.him.feetX > R.her.feetX ? 1 : -1;     // 她要轉向他的方向(+1 = 他在右邊)
      const herYaw = lerp(gx, 0.12 * dirHer, R.heartK), himYaw = lerp(gx, -0.12 * dirHer, R.heartK);
      const lean = 0.035 * R.heartK;                          // 牽手:兩人微微靠近
      const H = R.her, M = R.him;
      H.group.rotation.y += (herYaw - H.group.rotation.y) * k;
      M.group.rotation.y += (himYaw - M.group.rotation.y) * k;
      H.group.rotation.x += (gy - H.group.rotation.x) * k;
      M.group.rotation.x += (gy - M.group.rotation.x) * k;
      H.group.rotation.z = -dirHer * (lean + 0.06 * R.kissK);
      M.group.rotation.z = dirHer * (lean + 0.13 * R.kissK);
      H.group.position.x = H.feetX + dirHer * (0.02 * R.heartK + 0.01 * R.kissK);
      M.group.position.x = M.feetX - dirHer * (0.02 * R.heartK + 0.06 * R.kissK);
      H.group.scale.set(1, br * (1 + 0.012 * R.kissK), 1);   // 她踮一下
      M.group.scale.set(1, br2 * (1 - 0.01 * R.kissK), 1);   // 他微微低頭
      // 小心:牽手時浮在兩人手之間;親吻時跳到臉之間
      const hs = Math.max(0.001, Math.max(R.heartK, R.kissK * 1.3));
      R.smallHeart.scale.setScalar(hs);
      const hy = lerp(0.9, R.faceMid.y + 0.1, R.kissK);
      R.smallHeart.position.set(R.faceMid.x, hy + Math.sin(R.t * 1.6) * 0.04 + (1 - Math.max(R.heartK, R.kissK)) * -0.2, 0.32);
      R.smallHeart.rotation.y += dt * 1.2;
      // 親吻冒出的小心們
      R.puffs.forEach((p) => {
        if (p.t > 2) { p.mesh.visible = false; return; }
        p.t += dt; p.mesh.visible = true;
        p.vy -= 0.25 * dt; p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.y += p.spin * dt;
        const life = p.t / 1.8, sc = Math.max(0.001, smooth(0, 0.18, life) * (1 - smooth(0.6, 1, life)) * 0.55);
        p.mesh.scale.setScalar(sc); p.mesh.material.opacity = 1 - smooth(0.55, 1, life);
      });
      S.canvas.style.opacity = roomOpacity;
      S.renderer.render(R.scene, R.camera);
    } else if (S.active === 'heart') {
      const H = S.heart; H.t += dt;
      const appear = smooth(0.04, 0.32, heartP);
      H.scaleK += (appear - H.scaleK) * k;
      H.root.scale.setScalar(Math.max(0.001, H.scaleK));
      H.root.position.y = lerp(-0.9, 0.05, appear) + Math.sin(H.t * 0.8) * 0.04;
      H.scene.fog.density = lerp(0.16, 0.02, appear) + smooth(0.86, 1, heartP) * 0.14;
      if (!H.dragging) { H.vel *= Math.pow(0.05, dt); H.spin += H.vel * dt + (S.reduced ? 0 : 0.18 * dt); }
      else H.spin += H.vel * dt;
      H.root.rotation.y = H.spin;
      H.hearts.forEach((o, i) => {
        if (o.halo && o.halo.isMesh) o.halo.rotation.z += dt * 0.35;
        o.group.rotation.x = Math.sin(H.t * 0.7 + i) * 0.06;
      });
      S.canvas.style.opacity = heartOpacity;
      S.renderer.render(H.scene, H.camera);
    }
    // 簡易 FPS 偵測:持續 <30fps 就降級
    if (!S.low) {
      S._ft.push(dt); if (S._ft.length > 90) { S._ft.shift(); const avg = S._ft.reduce((a, b) => a + b, 0) / S._ft.length; if (avg > 0.034) S.degrade(); }
    }
  };
  S.degrade = function () {
    S.low = true; S._ft = [];
    S.renderer.setPixelRatio(1); S.renderer.shadowMap.enabled = false;
    S.heart.hearts.forEach((o) => { if (o.cfg && o.cfg.m === 'glass') { const c = Object.assign({}, o.cfg); o.cfg.m = '_'; applyHeartConfig(S.THREE, S.heart, o, c); } });
  };

  function burstHearts(R) {
    R.puffs.forEach((p, i) => {
      p.t = -i * 0.12;
      p.mesh.position.set(R.faceMid.x + (Math.random() - 0.5) * 0.1, R.faceMid.y + 0.05, 0.3);
      p.vx = (Math.random() - 0.5) * 0.5; p.vy = 0.55 + Math.random() * 0.35; p.vz = 0.15 + Math.random() * 0.2; p.spin = (Math.random() - 0.5) * 6;
      p.mesh.scale.setScalar(0.001); p.mesh.material.opacity = 0;
    });
  }
  S.setHands = function (on) { if (S.ok) S.room.hands = !!on; };
  /* 親吻:一次性的 3.4 秒時間軸;回傳毫秒數給 UI 用 */
  S.kiss = function () { if (!S.ok) return 0; if (S.room.kissT >= 0) return 0; S.room.kissT = 0; S.room.burstDone = false; return 3400; };
  S.heartDrag = { start() { if (S.ok) { S.heart.dragging = true; S.heart.vel = 0; } }, move(dxPx) { if (S.ok) S.heart.vel = dxPx * 0.6; }, end() { if (S.ok) S.heart.dragging = false; } };

  /* ── 卡片截圖:1080×1080 的心 ────────────── */
  S.snapshotHeart = function () {
    if (!S.ok) return null;
    const r = S.renderer, H = S.heart;
    const w = innerWidth, h = innerHeight;
    const prevFog = H.scene.fog.density, prevY = H.root.position.y, prevS = H.root.scale.x;
    r.setSize(1080, 1080, false); H.camera.aspect = 1; H.camera.updateProjectionMatrix();
    H.scene.fog.density = 0.0001; H.root.position.y = 0; H.root.scale.setScalar(1);
    r.render(H.scene, H.camera);
    const url = r.domElement.toDataURL('image/png');
    H.scene.fog.density = prevFog; H.root.position.y = prevY; H.root.scale.setScalar(prevS);
    r.setSize(w, h, false); H.camera.aspect = w / h; H.camera.updateProjectionMatrix();
    r.render(H.scene, H.camera);
    return url;
  };

  return S;
})();
