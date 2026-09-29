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

  /* ── 幕④:客廳 ─────────────────────────── */
  function buildRoom(THREE) {
    const C = window.CONTENT, F = C.figurines;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xFAFAFA, 0.06);
    scene.environment = S.env;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    camera.position.set(0, 1.5, 7.5);

    const key = new THREE.DirectionalLight(0xFFFFFF, 2.4); key.position.set(3.5, 6, 4.5);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6;
    key.shadow.camera.near = 1; key.shadow.camera.far = 20;
    key.shadow.camera.left = key.shadow.camera.bottom = -3; key.shadow.camera.right = key.shadow.camera.top = 3;
    key.shadow.bias = -0.0005;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xDCE6F0, 0.9); fill.position.set(-5, 2.5, 2); scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xE0E0E0, 0.55));

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

    const father = makeFather(THREE, F); father.group.position.x = -0.46; father.group.rotation.y = 0.2; scene.add(father.group);
    const mother = makeMother(THREE, F); mother.group.position.x = 0.46; mother.group.rotation.y = -0.2; scene.add(mother.group);

    // 牽手時浮出的小心
    const heartGeo = makeHeartGeometry(THREE, 0.12, 0.05);
    const smallHeart = new THREE.Mesh(heartGeo, new THREE.MeshPhysicalMaterial({ color: 0xC9202A, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1 }));
    smallHeart.position.set(0, 1.05, 0.3); smallHeart.scale.setScalar(0.001); smallHeart.castShadow = true; scene.add(smallHeart);

    return { scene, camera, father, mother, smallHeart, hands: false, t: 0, heartK: 0 };
  }

  function makeEyes(THREE, headR) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x2A2622, roughness: 0.4 });
    [-1, 1].forEach((s) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 12), m);
      e.position.set(s * headR * 0.36, headR * 0.05, headR * 0.92); g.add(e);
    });
    const blush = new THREE.MeshStandardMaterial({ color: 0xE8B8B0, roughness: 0.9, transparent: true, opacity: 0.5 });
    [-1, 1].forEach((s) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), blush);
      b.scale.set(1, 0.7, 0.3); b.position.set(s * headR * 0.6, -headR * 0.18, headR * 0.82); g.add(b);
    });
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 8, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0xB4544E, roughness: 0.6 }));
    mouth.rotation.z = Math.PI; mouth.position.set(0, -headR * 0.4, headR * 0.94); g.add(mouth);
    return g;
  }

  function makeArm(THREE, { len, r, skinHex, sleeveHex, gloveHex, sleeveLen = 0 }) {
    const pivot = new THREE.Group();
    const skin = porcelain(THREE, skinHex);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - r * 2, 6, 16), skin);
    arm.position.y = -len / 2; arm.castShadow = true; pivot.add(arm);
    if (sleeveLen > 0) {
      const sl = new THREE.Mesh(new THREE.CapsuleGeometry(r * 1.25, sleeveLen, 6, 16), porcelain(THREE, sleeveHex));
      sl.position.y = -sleeveLen / 2 - r * 0.6; sl.castShadow = true; pivot.add(sl);
    }
    const hand = new THREE.Mesh(new THREE.SphereGeometry(r * 1.15, 16, 16), porcelain(THREE, gloveHex || skinHex));
    hand.scale.set(1, 1.25, 0.7); hand.position.y = -len; hand.castShadow = true; pivot.add(hand);
    return pivot;
  }

  function makeFather(THREE, F) {
    const P = F.father, group = new THREE.Group();
    const trousers = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.145, 0.66, 24), porcelain(THREE, P.trousers, { roughness: 0.45, clearcoat: 0.4 }));
    trousers.position.y = 0.33; trousers.castShadow = true; group.add(trousers);
    [-1, 1].forEach((s) => {
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), porcelain(THREE, 0x9FB9D2));
      shoe.scale.set(0.8, 0.45, 1.5); shoe.position.set(s * 0.085, 0.03, 0.06); shoe.castShadow = true; group.add(shoe);
    });
    const chest = new THREE.Group(); chest.position.y = 0.64; group.add(chest);
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.235, 0.6, 28), porcelain(THREE, P.coat));
    coat.position.y = 0.3; coat.castShadow = true; chest.add(coat);
    const tails = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.2, 0.34, 28, 1, true, Math.PI * 0.62, Math.PI * 0.76), porcelain(THREE, P.coat, { side: THREE.DoubleSide }));
    tails.position.y = -0.14; tails.castShadow = true; chest.add(tails);
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.36, 0.03), porcelain(THREE, P.shirt));
    shirt.position.set(0, 0.36, 0.205); chest.add(shirt);
    const lapelM = porcelain(THREE, P.coat, { roughness: 0.25 });
    [-1, 1].forEach((s) => {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.02), lapelM);
      lapel.position.set(s * 0.085, 0.4, 0.215); lapel.rotation.z = s * 0.22; chest.add(lapel);
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), porcelain(THREE, P.coat));
      sh.position.set(s * 0.21, 0.56, 0); sh.scale.set(1, 0.8, 1); sh.castShadow = true; chest.add(sh);
    });
    const tieM = new THREE.MeshPhysicalMaterial({ color: P.tie, roughness: 0.35, clearcoat: 0.8 });
    [-1, 1].forEach((s) => { const w = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), tieM); w.scale.set(1.3, 0.8, 0.5); w.position.set(s * 0.032, 0.575, 0.215); chest.add(w); });
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), tieM); knot.position.set(0, 0.575, 0.225); chest.add(knot);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 16), porcelain(THREE, F.skin)); neck.position.y = 0.63; chest.add(neck);

    const head = new THREE.Group(); head.position.y = 0.66; chest.add(head);
    const hr = 0.175;
    const face = new THREE.Mesh(new THREE.SphereGeometry(hr, 32, 24), porcelain(THREE, F.skin)); face.position.y = hr; face.castShadow = true; head.add(face);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.05, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.56), porcelain(THREE, F.hair, { roughness: 0.4 }));
    hair.position.set(0, hr * 1.02, -hr * 0.1); hair.rotation.x = -0.25; hair.castShadow = true; head.add(hair);
    const eyes = makeEyes(THREE, hr); eyes.position.y = hr; head.add(eyes);
    [-1, 1].forEach((s) => { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), porcelain(THREE, F.skin)); ear.scale.set(0.5, 1, 0.8); ear.position.set(s * hr * 0.98, hr * 0.95, 0); head.add(ear); });

    const armOuter = makeArm(THREE, { len: 0.52, r: 0.05, skinHex: F.skin, sleeveHex: P.coat, gloveHex: F.skin, sleeveLen: 0.34 });
    armOuter.position.set(-0.24, 0.55, 0); armOuter.rotation.z = -0.14; chest.add(armOuter);
    const armInner = makeArm(THREE, { len: 0.52, r: 0.05, skinHex: F.skin, sleeveHex: P.coat, gloveHex: F.skin, sleeveLen: 0.34 });
    armInner.position.set(0.24, 0.55, 0); armInner.rotation.z = 0.14; chest.add(armInner);

    return { group, chest, head, armInner, armOuter, rest: { z: 0.14, x: 0 }, hold: { z: 0.72, x: -0.28 } };
  }

  function makeMother(THREE, F) {
    const P = F.mother, group = new THREE.Group();
    const pts = [[0, 0], [0.44, 0], [0.43, 0.04], [0.36, 0.22], [0.29, 0.44], [0.22, 0.64], [0.15, 0.82], [0.125, 0.9], [0.14, 1.0], [0.16, 1.1], [0.15, 1.17], [0.09, 1.2], [0, 1.2]]
      .map((p) => new THREE.Vector2(p[0], p[1]));
    const dress = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), porcelain(THREE, P.dress, { roughness: 0.34 }));
    dress.castShadow = true; group.add(dress);
    // 三層荷葉邊
    [[0.42, 0.06], [0.34, 0.27], [0.27, 0.48]].forEach(([r, y], i) => {
      const tier = new THREE.Mesh(new THREE.ConeGeometry(r + 0.03, 0.2, 64, 1, true), porcelain(THREE, i % 2 ? P.gloves : P.dress, { side: THREE.DoubleSide, roughness: 0.4 }));
      tier.position.y = y + 0.1; tier.castShadow = true; group.add(tier);
    });
    const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.013, 10, 48), new THREE.MeshPhysicalMaterial({ color: P.ribbon, roughness: 0.35, clearcoat: 0.8 }));
    ribbon.rotation.x = Math.PI / 2; ribbon.position.y = 0.9; group.add(ribbon);
    const bowM = ribbon.material;
    [-1, 1].forEach((s) => { const w = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), bowM); w.scale.set(1.3, 0.8, 0.5); w.position.set(s * 0.034, 0.9, 0.128); group.add(w); });

    const chest = new THREE.Group(); chest.position.y = 0.9; group.add(chest);
    [-1, 1].forEach((s) => { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 16), porcelain(THREE, F.skin)); sh.position.set(s * 0.14, 0.27, 0); sh.scale.set(1, 0.8, 1); chest.add(sh); });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.055, 0.12, 16), porcelain(THREE, F.skin)); neck.position.y = 0.34; chest.add(neck);
    const necklace = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.005, 8, 32), new THREE.MeshStandardMaterial({ color: 0xC9A227, metalness: 1, roughness: 0.3 }));
    necklace.rotation.x = Math.PI / 2 - 0.4; necklace.position.set(0, 0.31, 0.03); chest.add(necklace);

    const head = new THREE.Group(); head.position.y = 0.38; chest.add(head);
    const hr = 0.165;
    const face = new THREE.Mesh(new THREE.SphereGeometry(hr, 32, 24), porcelain(THREE, F.skin)); face.position.y = hr; face.castShadow = true; head.add(face);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.06, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), porcelain(THREE, F.hair, { roughness: 0.4 }));
    hair.position.set(0, hr * 1.02, -hr * 0.12); hair.rotation.x = -0.32; hair.castShadow = true; head.add(hair);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 16), porcelain(THREE, F.hair, { roughness: 0.4 }));
    bun.position.set(0, hr * 1.5, -hr * 0.85); bun.castShadow = true; head.add(bun);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 12), new THREE.MeshStandardMaterial({ color: 0xC9A227, metalness: 1, roughness: 0.3 }));
    pin.position.set(0.07, hr * 1.55, -hr * 0.55); head.add(pin);
    const eyes = makeEyes(THREE, hr); eyes.position.y = hr; head.add(eyes);

    const armOuter = makeArm(THREE, { len: 0.42, r: 0.042, skinHex: F.skin, gloveHex: P.gloves });
    armOuter.position.set(0.17, 0.27, 0); armOuter.rotation.z = 0.5; armOuter.rotation.x = -0.2; chest.add(armOuter); // 叉腰感
    const armInner = makeArm(THREE, { len: 0.42, r: 0.042, skinHex: F.skin, gloveHex: P.gloves });
    armInner.position.set(-0.17, 0.27, 0); armInner.rotation.z = -0.14; chest.add(armInner);

    return { group, chest, head, armInner, armOuter, rest: { z: -0.14, x: 0 }, hold: { z: -0.78, x: -0.28 } };
  }

  /* ── 心的幾何(擠出 + 平滑) ───────────────── */
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
      // 相機路徑:遠 → 近,微微環繞
      const a = smooth(0, 0.7, roomP);
      const orbit = Math.sin(roomP * Math.PI) * 0.9;
      R.camera.position.set(lerp(0.4, -0.3, roomP) + orbit * 0.4, lerp(1.7, 1.15, a), lerp(7.6, 4.3, a));
      R.camera.lookAt(0, lerp(0.75, 0.9, a), 0);
      R.scene.fog.density = lerp(0.075, 0.018, smooth(0, 0.45, roomP)) + smooth(0.82, 1, roomP) * 0.12;
      // 呼吸
      const br = 1 + 0.005 * Math.sin((R.t / 4) * Math.PI * 2);
      R.father.chest.scale.set(br, br, br); R.mother.chest.scale.set(br, br, br);
      // 視線跟隨(±25°),牽手時彼此對望
      const gx = clamp(S.pointer.x * 0.5, -0.44, 0.44), gy = clamp(-S.pointer.y * 0.18, -0.2, 0.2);
      const look = R.hands ? 1 : 0;
      [R.father, R.mother].forEach((f, i) => {
        const toward = i === 0 ? 0.42 : -0.42;
        const ty = lerp(gx, toward, look), tx = lerp(gy, 0.05, look);
        f.head.rotation.y += (ty - f.head.rotation.y) * k; f.head.rotation.x += (tx - f.head.rotation.x) * k;
        const pose = R.hands ? f.hold : f.rest;
        f.armInner.rotation.z += (pose.z - f.armInner.rotation.z) * k;
        f.armInner.rotation.x += (pose.x - f.armInner.rotation.x) * k;
      });
      // 小心
      const heartTarget = R.hands ? 1 : 0;
      R.heartK += (heartTarget - R.heartK) * k * 0.7;
      const hs = Math.max(0.001, R.heartK);
      R.smallHeart.scale.setScalar(hs);
      R.smallHeart.position.y = 1.02 + Math.sin(R.t * 1.6) * 0.04 + (1 - R.heartK) * -0.2;
      R.smallHeart.rotation.y += dt * 1.2;
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

  S.setHands = function (on) { if (S.ok) S.room.hands = !!on; };
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
