// 山水意境 · 游山玩水钓鱼 demo —— 玩法层
// 行走（第三人称）、登船划船、抛竿钓鱼、鱼篓与渔获卡片。场景与画面由 main.js 负责，这里只读写它暴露的对象。

import { createAudio } from './audio.js';
import { createAtmos } from './atmos.js';

export function startGame(W) {
  const { THREE, scene, camera, controls, islandHeight, flatMat, loadGLB, named, rand } = W;
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  // ───────────────────────── 界面 ─────────────────────────
  const css = document.createElement('style');
  css.textContent = `
    .g-panel{position:fixed;pointer-events:none;font-family:"STKaiti","KaiTi","楷体",serif;color:#2f3640}
    #g-prompt{left:50%;bottom:64px;transform:translateX(-50%);padding:8px 22px;background:rgba(250,246,236,.9);
      border:1px solid rgba(60,70,80,.35);border-radius:3px;font-size:20px;letter-spacing:2px;opacity:0;transition:opacity .25s}
    #g-prompt.on{opacity:1}
    #g-toast{left:50%;top:22%;transform:translateX(-50%);font-size:30px;letter-spacing:6px;color:#2a3a4a;
      text-shadow:0 0 12px rgba(255,255,255,.9);opacity:0;transition:opacity .35s}
    #g-toast.on{opacity:1}
    #g-card{right:28px;top:42%;transform:translateY(-50%) scale(.96);width:300px;padding:22px 26px 18px;
      background:linear-gradient(#fbf7ee,#f3ecdc);border:1px solid #b9ab8c;box-shadow:0 8px 30px rgba(60,50,30,.18);
      opacity:0;transition:opacity .35s, transform .35s}
    #g-card.on{opacity:1;transform:translateY(-50%) scale(1)}
    #g-card h2{margin:0 0 4px;font-size:34px;letter-spacing:8px;font-weight:normal}
    #g-card .meta{font-size:16px;color:#6a6458;margin-bottom:10px}
    #g-card .poem{font-size:17px;line-height:1.7;color:#3e4a52;border-top:1px dashed #c9bfa8;padding-top:10px}
    #g-card .seal{position:absolute;right:20px;top:20px;width:46px;height:46px;border:2px solid #b8342c;color:#b8342c;
      font-size:15px;line-height:21px;text-align:center;border-radius:4px;transform:rotate(6deg)}
    #g-card canvas{display:block;margin:6px auto 8px}
    #g-basket{right:18px;bottom:52px;min-width:150px;padding:10px 14px;background:rgba(250,246,236,.82);
      border:1px solid rgba(60,70,80,.25);border-radius:3px;font-size:15px;line-height:1.6}
    #g-basket b{font-size:17px;letter-spacing:3px;font-weight:normal}
    #g-help{left:50%;top:50%;transform:translate(-50%,-50%);padding:20px 30px;background:rgba(250,246,236,.95);
      border:1px solid #b9ab8c;font-size:18px;line-height:1.9;opacity:0;transition:opacity .25s}
    #g-help.on{opacity:1}
    #g-help h3{margin:0 0 8px;font-weight:normal;font-size:24px;letter-spacing:6px}
    #g-mode{left:50%;top:16px;transform:translateX(-50%);font-size:15px;letter-spacing:3px;color:#4a5560;opacity:.75}
  `;
  document.head.appendChild(css);
  const mk = (id, html = '') => { const d = document.createElement('div'); d.id = id; d.className = 'g-panel'; d.innerHTML = html; document.body.appendChild(d); return d; };
  const ui = {
    prompt: mk('g-prompt'), toast: mk('g-toast'), card: mk('g-card'), basket: mk('g-basket'), mode: mk('g-mode'),
    help: mk('g-help', `<h3>操作</h3>
      W A S D · 行走 / 划船　　Shift · 快走<br>鼠标拖动 · 转视角　　滚轮 · 远近<br>
      E · 登船 / 上岸　　F · 抛竿 · 咬钩时再按 F 收竿<br>Q · 御剑起飞 / 落地　　空格 · 上升　　C · 下降　　Shift · 疾行<br>T · 切换时辰（清晨 / 正午 / 黄昏）　　R · 细雨　　M · 静音　　G · 调色面板<br>V · 自由观景（右上角面板切换视角）　　H · 显示 / 隐藏本说明`),
  };
  let promptText = '';
  const setPrompt = (t) => { if (t !== promptText) { promptText = t; ui.prompt.textContent = t; ui.prompt.classList.toggle('on', !!t); } };
  let toastTimer = 0;
  const toast = (t, sec = 2.2) => { ui.toast.textContent = t; ui.toast.classList.add('on'); toastTimer = sec; };
  let helpOn = false, helpTimer = 0;

  // ───────────────────────── 录制模式 ─────────────────────────
  // 网址加 ?rec：隐藏所有界面文字和鼠标，只留画面、水墨开场和渔获卡片；U 键随时切换。
  // 网址加 ?fish=鳜鱼：之后每一竿都钓到这种鱼（拍渔获卡片用）。
  const qs = new URLSearchParams(location.search);
  const recCss = document.createElement('style');
  recCss.textContent = `
    body.rec #hint, body.rec #title, body.rec #seal, body.rec #g-prompt, body.rec #g-toast,
    body.rec #g-basket, body.rec #g-mode, body.rec #g-help, body.rec .lil-gui{display:none!important}
    body.rec, body.rec *{cursor:none!important}`;
  document.head.appendChild(recCss);
  document.body.classList.toggle('rec', qs.has('rec'));
  addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'u' && !e.repeat) document.body.classList.toggle('rec'); });

  // ───────────────────────── 输入 ─────────────────────────
  const keys = new Set();
  const pressed = new Set();
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'q', 'c', 't', 'r', 'm', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  const down = (...ks) => ks.some((k) => keys.has(k));
  const hit = (k) => pressed.has(k);

  // ───────────────────────── 可行走面 / 障碍 ─────────────────────────
  const tmpV = V3();
  const bridgeTop = (x) => (Math.abs(x) < 11 ? 1.4 + 2.6 * Math.pow(Math.cos((Math.PI * x) / 22), 1.2) : 1.4);
  const tingCenter = W.ting.position.clone();
  // 亭子（精模缩放 0.72，入口台阶朝桥 = 世界 -x）：台基底 1.75 米，地面 2.30 米，自带三级台阶；
  // 桥头到台阶脚之间约 1.6 米空档，补两级石阶接上
  const TS = 0.72, T_BASE = 1.75, TING_FLOOR = T_BASE + 0.76 * TS;
  const STEPS = (() => {
    const tc = tingCenter, foot = tc.x - 4.5 * TS, brEnd = W.br.position.x + 11 * 0.92 - 0.25, mid = (brEnd + foot) / 2;
    const treads = [[brEnd, mid, 1.5, 0.85], [mid, foot, 1.72, 0.85]];      // [x0, x1, 高, 半宽]：补的两级
    const mat = flatMat('#d8d1c2', 0.25, 0.14);
    for (const [a, b, h, hw] of treads) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b - a, h + 0.5, hw * 2), mat);   // 底部没入水下，不留悬空
      m.position.set((a + b) / 2, (h - 0.5) / 2, tc.z); scene.add(m);
    }
    for (let i = 0; i < 3; i++) treads.push([tc.x - (4.5 - 0.4 * i) * TS, tc.x - (4.1 - 0.4 * i) * TS, T_BASE + 0.23 * (i + 1) * TS, 1.1 * TS]);   // 亭子自带的台阶
    return { z: tc.z, treads };
  })();
  function stepHeight(x, z) {
    for (const [a, b, h, hw] of STEPS.treads) if (x >= a && x < b && Math.abs(z - STEPS.z) < hw) return h;
    return null;
  }
  // 亭内可走：入口一侧到台基边沿，另外三面只到美人靠座凳内侧
  const inTing = (x, z) => x >= tingCenter.x - 3.3 * TS && x < tingCenter.x + 2.0 * TS && Math.abs(z - tingCenter.z) < 2.0 * TS;
  const HALL = { x: 5, z: -3, rot: 0.25, s: 0.6 };
  function hallLocal(x, z) {
    const dx = x - HALL.x, dz = z - HALL.z, c = Math.cos(-HALL.rot), s = Math.sin(-HALL.rot);
    return [dx * c + dz * s, -dx * s + dz * c];
  }
  // 树干、竹丛等圆形障碍（只对行走生效）
  const trunks = [];
  for (const { group } of W.TREES) {
    const p = group.position;
    if (Math.hypot(p.x, p.z) < 45 && islandHeight(p.x, p.z) > 0.3) trunks.push([p.x, p.z, 0.5]);
  }
  for (const { x, z } of W.BAMBOOS) trunks.push([x, z, 1.3]);
  for (const [x, z] of W.WILLOWS) trunks.push([x, z, 0.5]);
  for (const r of W.ROCKS) {
    const p = r.position;
    if (r === W.islet) continue;   // 亭子坐在这块石头上，算障碍会把亭内地面整个挡掉
    if (Math.hypot(p.x, p.z) < 60) trunks.push([p.x, p.z, r.scale.x * 5.2]);
  }

  // 平顶台峰：山顶楼阁、云中五层塔（顶面高度、可站半径、建筑占地半径）
  const MESAS = W.peaks.filter((p) => p.mesa !== undefined).map((p) => ({ x: p.mesh.position.x, z: p.mesh.position.z, y: p.H, r: p.H * 0.17, block: p.mesa === 0 ? 3.6 : 3.4 }));
  // 返回该点可站立的高度；同一点有多层（桥上/桥下）时取最接近 refY 的
  function walkHeight(x, z, refY) {
    const c = [];
    const g = islandHeight(x, z);
    if (g > 0.12) c.push(g);
    const pl = W.pierG.worldToLocal(tmpV.set(x, 0, z));
    if (pl.x >= -0.1 && pl.x <= 11.0 && Math.abs(pl.z) < 0.9) c.push(0.95);
    if (pl.x < -0.1 && pl.x > -2.7 && Math.abs(pl.z) < 1.35) c.push(0.95 + Math.min(2, Math.floor(-pl.x / 0.9)) * 0.28);
    const sh = stepHeight(x, z);
    const bl = W.br.worldToLocal(tmpV.set(x, 0, z));
    if (sh !== null) c.push(sh);                                   // 台阶上不再叠桥面那一层，免得被"就近取高"拉回桥面
    else if (Math.abs(bl.x) < 10.3 && Math.abs(bl.z) < 1.4) c.push(bridgeTop(bl.x / 0.92) * 0.92 + 0.03);
    if (inTing(x, z)) c.push(TING_FLOOR);
    const [hx, hz] = hallLocal(x, z);
    if (Math.abs(hx) < 4.8 && Math.abs(hz) < 3.6) c.push(3.15);
    for (const m of MESAS) if (Math.hypot(x - m.x, z - m.z) < m.r) c.push(m.y);
    if (!c.length) return null;
    c.sort((a, b) => Math.abs(a - refY) - Math.abs(b - refY));
    return c[0];
  }
  function walkBlocked(x, z) {
    for (const m of MESAS) if (Math.hypot(x - m.x, z - m.z) < m.block) return true;   // 台峰上的楼阁 / 塔身
    const [hx, hz] = hallLocal(x, z);
    if (Math.abs(hx) < 3.5 && Math.abs(hz) < 2.5) return true;                 // 楼阁屋内
    for (const [tx, tz, r] of trunks) if ((x - tx) ** 2 + (z - tz) ** 2 < r * r) return true;
    return false;
  }
  // 船：陆地、山、石、桥墩（拱洞可穿）、栈桥
  const boatObstacles = [];
  for (const { mesh, H } of W.peaks) boatObstacles.push([mesh.position.x, mesh.position.z, H * 0.25]);
  for (const r of W.ROCKS) boatObstacles.push([r.position.x, r.position.z, r.scale.x * 6]);
  function waterFree(x, z) {
    if (islandHeight(x, z) > -0.7) return false;
    for (const [ox, oz, r] of boatObstacles) if ((x - ox) ** 2 + (z - oz) ** 2 < r * r) return false;
    const bl = W.br.worldToLocal(tmpV.set(x, 0, z));
    if (Math.abs(bl.z) < 2.4 && Math.abs(bl.x) < 10.8 && Math.abs(bl.x) > 2.4) return false;
    const pl = W.pierG.worldToLocal(tmpV.set(x, 0, z));
    if (pl.x > -0.5 && pl.x < 12.6 && Math.abs(pl.z) < 1.5) return false;
    return Math.hypot(x, z) < 900;
  }

  // ───────────────────────── 角色 ─────────────────────────
  const hero = new THREE.Group();            // 根：位置 + 朝向
  const body = new THREE.Group();            // 起伏
  hero.add(body);
  scene.add(hero);
  const parts = {};
  const rodPivot = new THREE.Group();        // 竿子挂在右手
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 2.8, 6), flatMat('#a98a4c', 0.2, 0.05));
  rod.position.y = -1.4; rod.rotation.x = Math.PI; rodPivot.add(rod);   // 竿子顺着手臂方向伸出，细端在外
  rodPivot.visible = false;
  const rodTip = V3();
  loadGLB('./assets/hero.glb').then((g) => {
    for (const n of ['hero_torso', 'hero_head', 'hero_armL', 'hero_armR', 'hero_legL', 'hero_legR', 'hero_skirtL', 'hero_skirtR', 'hero_ribbon', 'hero_sash']) {
      const o = g.getObjectByName(n);
      if (!o) continue;
      const pivot = new THREE.Group();
      pivot.position.copy(o.position);
      o.position.set(0, 0, 0);
      pivot.add(o);
      body.add(pivot);
      parts[n.slice(5)] = pivot;
    }
    // 竿子：右手（armR 局部的手掌位置约在 -0.54 处）
    rodPivot.position.set(-0.02, -0.55, -0.02);
    parts.armR.add(rodPivot);
    for (const k of ['legL', 'legR']) if (parts[k]) parts[k].userData.foot = footTable(parts[k]);
  });
  // 腿绕髋摆动时脚底最低点的位置表：摆角 → [相对髋的高度, 前后位置]。
  // 走路时两腿一前一后都会把脚抬离地面，要按这张表把身子往下放，让着地的那只脚踩实
  const FOOT_A = 0.8, FOOT_N = 33;
  function footTable(pivot) {
    pivot.updateMatrixWorld(true);
    const inv = pivot.matrixWorld.clone().invert(), pts = [], v = V3();
    pivot.traverse((o) => {
      if (!o.isMesh) return;
      const m = inv.clone().multiply(o.matrixWorld), pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m); pts.push(v.y, v.z); }
    });
    const tab = [];
    for (let j = 0; j < FOOT_N; j++) {
      const a = -FOOT_A + (2 * FOOT_A * j) / (FOOT_N - 1), c = Math.cos(a), s = Math.sin(a);
      let lo = Infinity, lz = 0;
      for (let i = 0; i < pts.length; i += 2) { const y = pts[i] * c - pts[i + 1] * s; if (y < lo) { lo = y; lz = pts[i] * s + pts[i + 1] * c; } }
      tab.push([lo, lz]);
    }
    return tab;
  }
  function footAt(pivot) {
    const tab = pivot.userData.foot;
    const f = THREE.MathUtils.clamp((pivot.rotation.x + FOOT_A) / (2 * FOOT_A), 0, 1) * (FOOT_N - 1);
    const j = Math.min(FOOT_N - 2, Math.floor(f)), t = f - j, A = tab[j], B = tab[j + 1];
    return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
  }
  // 身子要下放多少，才能让两只脚中更低的那只正好踩在它脚下的地面上（坡上、桥上前后脚地面高度不同）
  function plantBody() {
    const ns = [];
    const sy = Math.sin(hero.rotation.y), cy = Math.cos(hero.rotation.y);
    for (const k of ['legL', 'legR']) {
      const p = parts[k];
      if (!p?.userData.foot) return 0;
      const [fy, fz] = footAt(p);
      const x = p.position.x, z = p.position.z + fz;
      const wx = hero.position.x + cy * x + sy * z, wz = hero.position.z - sy * x + cy * z;
      const g = walkHeight(wx, wz, S.y) ?? S.y;
      ns.push(g - hero.position.y - p.position.y - fy);   // 这只脚刚好着地时 body 的高度
    }
    // 取低的那只脚着地；另一只最多插进地面 8 厘米（上坡迈出的前脚），再多就整体抬一点
    const need = Math.min(ns[0], ns[1]), other = Math.max(ns[0], ns[1]);
    return THREE.MathUtils.clamp(Math.max(need, other - 0.08), -0.45, 0.3);
  }

  // 玩家的船（空船）停在栈桥尽头旁
  const pBoat = new THREE.Group();
  scene.add(pBoat);
  loadGLB('./assets/boat_empty.glb').then((g) => pBoat.add(named(g, 'boat')));
  {
    const end = W.pierG.localToWorld(V3(10.5, 0, -2.4));
    pBoat.position.set(end.x, 0, end.z);
    pBoat.rotation.y = W.pierG.rotation.y;
  }

  // ───────────────────────── 飞剑 ─────────────────────────
  const swordG = new THREE.Group();
  swordG.rotation.order = 'YXZ';
  swordG.visible = false;
  scene.add(swordG);
  loadGLB('./assets/sword.glb').then((g) => { const sw = named(g, 'sword'); sw.position.set(0, 0, -0.9); swordG.add(sw); });
  const halo = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.scale.set(0.32, 1.5, 1); halo.position.set(0, -0.06, 0.2);
  halo.visible = false;   // 亮场景里会变成一块白斑，先不用
  swordG.add(halo);
  const TR = 56;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TR * 2 * 3), 3));
  trailGeo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(new Float32Array(TR * 2), 1));
  { const idx = []; for (let i = 0; i < TR - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } trailGeo.setIndex(idx); }
  const trail = new THREE.Mesh(trailGeo, new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#a9d8f0') } },
    vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA, vA); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  trail.frustumCulled = false; trail.visible = false;
  scene.add(trail);
  const trailPts = [];
  function updateTrail(on, speedK) {
    const tail = V3(0, 0, -1.55).applyEuler(swordG.rotation).add(swordG.position);
    if (trailPts.length && trailPts[0].p.distanceTo(tail) > 8) trailPts.length = 0;   // 瞬移/落地后重置
    trailPts.unshift({ p: tail, t: 0 });
    if (trailPts.length > TR) trailPts.length = TR;
    const pos = trailGeo.attributes.position, al = trailGeo.attributes.aAlpha;
    const side = V3(1, 0, 0).applyEuler(swordG.rotation);
    for (let i = 0; i < TR; i++) {
      const q = trailPts[Math.min(i, trailPts.length - 1)].p;
      const k = i / (TR - 1), w = 0.12 * (1 - k);
      pos.setXYZ(i * 2, q.x + side.x * w, q.y + side.y * w, q.z + side.z * w);
      pos.setXYZ(i * 2 + 1, q.x - side.x * w, q.y - side.y * w, q.z - side.z * w);
      const a = on ? (1 - k) * (1 - k) * 0.28 * Math.min(1, speedK) : 0;
      al.setX(i * 2, a); al.setX(i * 2 + 1, a);
    }
    pos.needsUpdate = true; al.needsUpdate = true;
    trail.visible = on;
  }
  // 山峰的近似截面半径（随高度收窄），用于飞行避让
  const peakCols = W.peaks.map(({ mesh, H }) => ({ x: mesh.position.x, z: mesh.position.z, H, R: H * 0.27 * Math.max(mesh.scale.x / Math.max(mesh.scale.y, 1e-3), 0.8) }));
  function peakRadiusAt(c, y) { if (y > c.H + 2) return 0; const t = Math.max(0, y) / c.H; return c.R * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.4))) + 2.0; }

  const oar = new THREE.Group();
  {
    const wood = flatMat('#a7845a', 0.25, 0.1);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 3.0, 6), wood);
    pole.position.y = -0.6;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.24), wood);
    blade.position.y = -2.0;
    const arm = new THREE.Group(); arm.add(pole, blade);
    arm.rotation.set(0.75, 0, -0.35);
    oar.add(arm);
    oar.position.set(-1.2, 1.15, 0.55);
    oar.visible = false;
    pBoat.add(oar);
  }

  // ───────────────────────── 状态 ─────────────────────────
  const S = {
    mode: 'walk', free: false,
    pos: V3(), y: 0, yaw: 0, speed: 0, phase: 0,
    boat: { speed: 0, yawRate: 0 },
    fly: { vel: V3(), up: 0, landing: null, target: null, yawRate: 0, appear: 0 },
    fish: { st: 'idle', t: 0, target: V3(), wait: 0, bobber: null, line: null, caught: null },
  };
  // 出生在栈桥上岸处的小路
  {
    const p = W.pierG.localToWorld(V3(-3.5, 0, 0));
    S.pos.set(p.x, 0, p.z);
    S.y = walkHeight(p.x, p.z, 2) ?? islandHeight(p.x, p.z);
    S.yaw = Math.atan2(5 - p.x, -3 - p.z);
  }
  // 镜头放到玩家身后
  function snapCamera() {
    const t = V3(S.pos.x, S.y + 1.5, S.pos.z);
    const back = V3(-Math.sin(S.yaw), 0, -Math.cos(S.yaw)).multiplyScalar(9);
    controls.target.copy(t);
    camera.position.copy(t).add(back).add(V3(0, 3.2, 0));
  }
  W.stopTween();
  snapCamera();

  // ───────────────────────── 音频 / 时辰天气 ─────────────────────────
  const audio = createAudio();
  const sfx = audio.sfx;
  // 面板「声音」：分轨音量 + 试听
  if (W.gui) {
    const fs = W.gui.addFolder('声音');
    fs.add(audio.vols, 'master', 0, 1.5, 0.01).name('总音量').onChange((v) => audio.setVol('master', v));
    fs.add(audio.vols, 'music', 0, 1.5, 0.01).name('配乐（琴 / 箫）').onChange((v) => audio.setVol('music', v));
    fs.add(audio.vols, 'amb', 0, 1.5, 0.01).name('环境（水 / 鸟 / 风 / 雨）').onChange((v) => audio.setVol('amb', v));
    fs.add(audio.vols, 'sfx', 0, 1.5, 0.01).name('音效').onChange((v) => audio.setVol('sfx', v));
    fs.add({ f: () => audio.demo('qin') }, 'f').name('试听 · 古琴');
    fs.add({ f: () => audio.demo('xiao') }, 'f').name('试听 · 箫');
    fs.add({ f: () => sfx.chime() }, 'f').name('试听 · 钓到鱼');
    fs.add({ f: () => sfx.swordUp() }, 'f').name('试听 · 御剑');
  }
  addEventListener('pointerdown', () => audio.resume());
  let atmos = null;   // 在 ripple 定义之后创建

  // ───────────────────────── 前景桃枝：右上角框景 ─────────────────────────
  const fgCss = document.createElement('style');
  fgCss.textContent = `#g-fg{position:fixed;right:-30px;top:-20px;pointer-events:none;z-index:2;opacity:.92;filter:blur(1.1px);
    transform-origin:100% 0;animation:fgSway 7s ease-in-out infinite;transition:opacity 1.2s}
    #g-fg.off{opacity:0}
    @keyframes fgSway{0%,100%{transform:rotate(0deg)}50%{transform:rotate(1.6deg)}}`;
  document.head.appendChild(fgCss);
  const fg = document.createElement('canvas');
  fg.id = 'g-fg'; fg.width = 640; fg.height = 420;
  {
    const x = fg.getContext('2d'), R = Math.random;
    const branch = (pts, w) => { x.strokeStyle = 'rgba(52,38,40,0.92)'; x.lineCap = 'round'; for (let i = 1; i < pts.length; i++) { x.lineWidth = w * (1 - i / pts.length * 0.7); x.beginPath(); x.moveTo(...pts[i - 1]); x.lineTo(...pts[i]); x.stroke(); } };
    const main = [[660, 0], [600, 40], [540, 70], [470, 120], [400, 150], [330, 200], [260, 230], [190, 290]];
    branch(main, 16);
    const subs = [];
    for (const i of [1, 3, 4, 6]) { const [bx, by] = main[i]; const s = [[bx, by]]; let cx = bx, cy = by; for (let k = 0; k < 4; k++) { cx -= 20 + R() * 25; cy += 18 + R() * 28; s.push([cx, cy]); } branch(s, 7); subs.push(s); }
    const blossom = (cx, cy, r) => {
      for (let p = 0; p < 5; p++) { const a = p * 1.2566 + R() * 0.3; x.fillStyle = `rgba(${240 + R() * 15},${150 + R() * 50},${175 + R() * 30},0.9)`; x.beginPath(); x.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.55, r * 0.42, a, 0, 7); x.fill(); }
      x.fillStyle = 'rgba(214,150,60,0.9)'; x.beginPath(); x.arc(cx, cy, r * 0.18, 0, 7); x.fill();
    };
    const pts = [...main.slice(1), ...subs.flat()];
    for (let i = 0; i < 70; i++) { const [bx, by] = pts[Math.floor(R() * pts.length)]; blossom(bx + (R() - 0.5) * 40, by + (R() - 0.5) * 30, 7 + R() * 9); }
    for (let i = 0; i < 18; i++) { const [bx, by] = pts[Math.floor(R() * pts.length)]; x.fillStyle = 'rgba(140,180,100,0.85)'; x.beginPath(); x.ellipse(bx + (R() - 0.5) * 30, by + (R() - 0.5) * 24, 10, 4, R() * 3, 0, 7); x.fill(); }
  }
  document.body.appendChild(fg);

  // ───────────────────────── 水墨开场 ─────────────────────────
  const introCss = document.createElement('style');
  introCss.textContent = `
    #g-intro{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;cursor:pointer;
      background:radial-gradient(ellipse at 50% 45%, #fbf8f1 0%, #f2ede2 70%, #e8e1d2 100%);transition:opacity 2.2s ease, filter 2.2s ease}
    #g-intro.out{opacity:0;filter:blur(14px);pointer-events:none}
    #g-intro .ink{position:absolute;inset:-10%;background:
      radial-gradient(ellipse 38% 22% at 22% 78%, rgba(40,60,90,.16), transparent 70%),
      radial-gradient(ellipse 30% 40% at 82% 30%, rgba(40,60,90,.12), transparent 70%),
      radial-gradient(ellipse 50% 18% at 50% 92%, rgba(60,90,110,.10), transparent 70%);filter:blur(6px);animation:inkIn 4s ease both}
    #g-intro .t{writing-mode:vertical-rl;font-family:"STKaiti","KaiTi","楷体",serif;font-size:76px;letter-spacing:22px;color:#2d3440;
      opacity:0;animation:inkIn 2.6s ease .4s both;text-shadow:0 0 1px rgba(30,30,30,.4)}
    #g-intro .sub{writing-mode:vertical-rl;font-family:"STKaiti","KaiTi",serif;font-size:20px;letter-spacing:8px;color:#5a6270;
      margin-right:34px;opacity:0;animation:inkIn 2.4s ease 1.4s both}
    #g-intro .seal{width:44px;height:44px;background:#b8342c;color:#f6e9e2;font:18px/22px "STKaiti",serif;text-align:center;
      border-radius:4px;position:absolute;left:calc(50% + 62px);top:calc(50% + 150px);transform:rotate(-4deg);opacity:0;animation:inkIn 1.2s ease 2.2s both}
    #g-intro .go{position:absolute;bottom:13%;left:50%;transform:translateX(-50%);font-family:"STKaiti","KaiTi",serif;font-size:22px;
      letter-spacing:10px;color:#3a4250;opacity:0;animation:inkIn 1.6s ease 2.6s both, breathe 3s ease-in-out 4.2s infinite}
    @keyframes inkIn{from{opacity:0;filter:blur(8px)}to{opacity:1;filter:blur(0)}}
    @keyframes breathe{0%,100%{opacity:.9}50%{opacity:.4}}`;
  document.head.appendChild(introCss);
  const intro = document.createElement('div');
  intro.id = 'g-intro';
  intro.innerHTML = `<div class="ink"></div><div class="sub">一 叶 扁 舟 · 万 重 青 山</div><div class="t">山水意境</div><div class="seal">游<br>心</div><div class="go">山 色 渐 开 ……</div>`;
  document.body.appendChild(intro);
  let introState = 'wait';      // wait → ready → fly → done
  let introT = 0;
  const introFrom = { p: V3(), t: V3() }, introTo = { p: V3(), t: V3() };
  const setReady = () => { if (introState === 'wait') { introState = 'ready'; intro.querySelector('.go').textContent = '点 击 入 画'; } };
  THREE.DefaultLoadingManager.onLoad = () => setTimeout(setReady, 600);
  setTimeout(setReady, 9000);
  function enterPainting() {
    if (introState !== 'ready') return;
    introState = 'fly'; introT = 0;
    audio.start();
    intro.classList.add('out');
    setTimeout(() => intro.remove(), 2400);
    snapCamera();
    introTo.p.copy(camera.position); introTo.t.copy(controls.target);
    introFrom.t.set(introTo.t.x - 20, 40, introTo.t.z - 60);
    introFrom.p.set(introTo.p.x + 40, 95, introTo.p.z + 120);
    camera.position.copy(introFrom.p); controls.target.copy(introFrom.t);
    setTimeout(() => toast('按 H 查看操作', 2.6), 5200);
  }
  intro.addEventListener('click', enterPainting);
  addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') enterPainting(); });
  // 开场前先摆一个云中远景
  camera.position.set(80, 110, 160); controls.target.set(0, 30, -60);
  controls.minDistance = 3; controls.maxDistance = 45; controls.enablePan = false; controls.maxPolarAngle = 1.5;

  // ───────────────────────── 水波纹 ─────────────────────────
  const ripples = [];
  const rippleGeo = new THREE.RingGeometry(0.93, 1, 48); rippleGeo.rotateX(-Math.PI / 2);
  function ripple(x, z, size = 1, life = 1.8) {
    const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
    m.position.set(x, 0.05, z); m.userData = { t: 0, life, size };
    scene.add(m); ripples.push(m);
  }
  atmos = createAtmos(W, { ripple, center: () => S.pos });
  function updateRipples(dt) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i]; r.userData.t += dt;
      const k = r.userData.t / r.userData.life;
      r.scale.setScalar(r.userData.size * (0.3 + k * 2.2));
      r.material.opacity = 0.26 * (1 - k) * (1 - k) * Math.min(1, k * 6);
      if (k >= 1) { scene.remove(r); r.material.dispose(); ripples.splice(i, 1); }
    }
  }

  // ───────────────────────── 鱼 ─────────────────────────
  const FISH = [
    { name: '白条', w: 30, cm: [10, 20], col: '#dfe6ea', fin: '#b9c4cc', note: '成群掠过水面的小白鱼，最是常见。' },
    { name: '鲫鱼', w: 28, cm: [14, 30], col: '#9aa58a', fin: '#7d8a70', note: '青箬笠，绿蓑衣，斜风细雨不须归。<br>——张志和《渔歌子》' },
    { name: '鲤鱼', w: 16, cm: [30, 62], col: '#c99a52', fin: '#c4583e', note: '金鳞赤尾，跃于浅滩。' },
    { name: '鳜鱼', w: 10, cm: [25, 46], col: '#b9a167', fin: '#6e5a3a', spots: true, deep: true, note: '西塞山前白鹭飞，桃花流水鳜鱼肥。<br>——张志和《渔歌子》' },
    { name: '锦鲤', w: 7, cm: [30, 52], col: '#f4eee6', fin: '#e0563e', patches: true, lotus: true, note: '鱼戏莲叶间。<br>——汉乐府《江南》' },
    { name: '青鱼', w: 5, cm: [50, 95], col: '#3f5568', fin: '#2c3d4e', deep: true, note: '孤舟蓑笠翁，独钓寒江雪。<br>——柳宗元《江雪》' },
    { name: '金鲤', w: 1.2, cm: [45, 70], col: '#f2c94c', fin: '#e9a23b', legend: true, note: '传说中鲤跃龙门，今日竟被你钓起。' },
  ];
  const forcedFish = qs.get('fish') && FISH.find((f) => f.name === qs.get('fish'));
  if (qs.get('fish') && !forcedFish) console.warn(`?fish=${qs.get('fish')} 不是已有的鱼：${FISH.map((f) => f.name).join('、')}`);
  function rollFish(x, z) {
    if (forcedFish) return forcedFish;
    const far = Math.hypot(x, z) > 70;
    const lotus = x > 22 && x < 52 && z > 4 && z < 28;
    const pool = FISH.map((f) => ({ f, w: f.w * (f.deep && far ? 3 : 1) * (f.lotus && lotus ? 5 : 1) * (f.deep && !far ? 0.4 : 1) }));
    let r = Math.random() * pool.reduce((a, b) => a + b.w, 0);
    for (const p of pool) { r -= p.w; if (r <= 0) return p.f; }
    return FISH[0];
  }
  function fishMesh(f, cm) {
    const g = new THREE.Group();
    const L = cm / 100;
    const bodyM = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), flatMat(f.col, 0.25, 0.12));
    bodyM.scale.set(L * 0.28, L * 0.36, L); g.add(bodyM);
    const tailG = new THREE.BufferGeometry();
    tailG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -L * 0.45, 0, L * 0.22, -L * 0.75, 0, -L * 0.22, -L * 0.75], 3));
    tailG.computeVertexNormals();
    const fm = flatMat(f.fin, 0.2, 0.1, THREE.DoubleSide);
    g.add(new THREE.Mesh(tailG, fm));
    const dorsal = new THREE.Mesh(tailG, fm); dorsal.scale.set(1, 0.6, 0.55); dorsal.rotation.x = -Math.PI / 2; dorsal.position.set(0, L * 0.16, L * 0.05); g.add(dorsal);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(L * 0.03, 6, 4), flatMat('#1f2328', 0, 0));
    eye.position.set(L * 0.1, L * 0.05, L * 0.36); g.add(eye.clone()); eye.position.x *= -1; g.add(eye);
    return g;
  }
  // 卡片里的小画：用 2D 画一条写意鱼
  function fishSketch(f, cm) {
    const c = document.createElement('canvas'); c.width = 260; c.height = 110;
    const x = c.getContext('2d');
    const L = 70 + Math.min(1, cm / 90) * 90;
    x.translate(130, 56);
    x.fillStyle = f.fin; x.globalAlpha = 0.85;
    x.beginPath(); x.moveTo(-L * 0.42, 0); x.lineTo(-L * 0.68, -L * 0.2); x.quadraticCurveTo(-L * 0.6, 0, -L * 0.68, L * 0.2); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(-L * 0.1, -L * 0.16); x.quadraticCurveTo(L * 0.02, -L * 0.33, L * 0.14, -L * 0.15); x.fill();
    x.fillStyle = f.col; x.globalAlpha = 0.95;
    x.beginPath(); x.ellipse(0, 0, L * 0.45, L * 0.17, 0, 0, Math.PI * 2); x.fill();
    if (f.patches) { x.fillStyle = '#e0563e'; for (const [a, b, r] of [[-0.1, -0.05, 0.1], [0.15, 0.04, 0.08]]) { x.beginPath(); x.ellipse(a * L, b * L, r * L, r * L * 0.7, 0, 0, 7); x.fill(); } }
    if (f.spots) { x.fillStyle = '#5a4a30'; for (let i = 0; i < 9; i++) { x.beginPath(); x.arc((Math.random() - 0.5) * L * 0.6, (Math.random() - 0.5) * L * 0.18, 2.5, 0, 7); x.fill(); } }
    x.globalAlpha = 1; x.strokeStyle = 'rgba(40,40,40,.55)'; x.lineWidth = 1.5;
    x.beginPath(); x.ellipse(0, 0, L * 0.45, L * 0.17, 0, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#222'; x.beginPath(); x.arc(L * 0.3, -L * 0.03, 3, 0, 7); x.fill();
    return c;
  }

  // 鱼篓（存在浏览器本地）
  const basket = JSON.parse(localStorage.getItem('shanshui-basket') || '{}');
  function renderBasket() {
    const rows = FISH.filter((f) => basket[f.name]).map((f) => `${f.name}　×${basket[f.name].n}　<span style="color:#7a7266">最大 ${basket[f.name].max} 厘米</span>`);
    ui.basket.innerHTML = `<b>鱼 篓</b><br>${rows.length ? rows.join('<br>') : '<span style="color:#7a7266">尚无渔获</span>'}`;
  }
  renderBasket();
  let cardTimer = 0;
  function showCard(f, cm) {
    const rare = f.legend ? '传 说' : f.w <= 5 ? '稀 有' : f.w <= 16 ? '少 见' : '寻 常';
    ui.card.innerHTML = `<div class="seal">${rare.replace(' ', '<br>')}</div><h2>${f.name}</h2><div class="meta">长 ${cm} 厘米</div><div class="sk"></div><div class="poem">${f.note}</div>`;
    ui.card.querySelector('.sk').appendChild(fishSketch(f, cm));
    ui.card.classList.add('on'); cardTimer = 4.5;
  }

  // ───────────────────────── 钓鱼 ─────────────────────────
  const bobber = new THREE.Group();
  {
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), flatMat('#d23b2f', 0.1, 0));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), flatMat('#f6f3ea', 0.1, 0));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.25, 4), flatMat('#d23b2f', 0.1, 0));
    stick.position.y = 0.15;
    bobber.add(top, bot, stick);
  }
  bobber.visible = false; scene.add(bobber);
  const LINE_N = 24;
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(LINE_N * 3), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x3a3f46, transparent: true, opacity: 0.7 }));
  line.frustumCulled = false; line.visible = false; scene.add(line);
  let hooked = null;   // 正在被拉上来的鱼模型

  function castSpot() {
    // 在船上：向船右舷前方抛；在岸上：向面朝方向抛，脚下附近必须是水边
    let dir, from;
    if (S.mode === 'boat') {
      const y = pBoat.rotation.y;
      dir = V3(Math.cos(y) * 0.5 + Math.sin(y) * 0.86, 0, -Math.sin(y) * 0.5 + Math.cos(y) * 0.86).normalize();
      from = pBoat.position;
    } else {
      dir = V3(Math.sin(S.yaw), 0, Math.cos(S.yaw));
      from = S.pos;
      let nearWater = false;
      for (const d of [1.5, 2.5, 3.5]) if (islandHeight(from.x + dir.x * d, from.z + dir.z * d) < -0.2) nearWater = true;
      if (!nearWater) return null;
    }
    for (const d of [8, 7, 6, 5]) {
      const x = from.x + dir.x * d, z = from.z + dir.z * d;
      if (waterFree(x, z)) return V3(x, 0, z);
    }
    return null;
  }
  function startCast() {
    const spot = castSpot();
    if (!spot) { toast(S.mode === 'boat' ? '这里水太浅，换个地方' : '走到水边、面朝水面再抛竿', 1.8); return; }
    const F = S.fish;
    F.st = 'casting'; F.t = 0; F.target.copy(spot); sfx.cast();
    rodPivot.visible = true; bobber.visible = true; line.visible = true;
  }
  function endFishing() {
    const F = S.fish; F.st = 'idle'; F.t = 0;
    bobber.visible = false; line.visible = false; rodPivot.visible = false;
    if (hooked) { scene.remove(hooked); hooked = null; }
  }
  function updateFishing(dt) {
    const F = S.fish;
    if (F.st === 'idle') return;
    F.t += dt;
    rod.updateWorldMatrix(true, false);
    rodTip.set(0, 1.4, 0).applyMatrix4(rod.matrixWorld);
    const tgt = F.target;
    if (F.st === 'casting') {
      const k = Math.min(1, F.t / 0.7);
      bobber.position.lerpVectors(rodTip, tgt, k); bobber.position.y = THREE.MathUtils.lerp(rodTip.y, 0.02, k) + Math.sin(k * Math.PI) * 2.5;
      if (k >= 1) { F.st = 'waiting'; F.t = 0; F.wait = rand(2.5, 7); ripple(tgt.x, tgt.z, 0.6); sfx.plop(); setPrompt('静候鱼讯……'); }
    } else if (F.st === 'waiting') {
      bobber.position.set(tgt.x, 0.02 + Math.sin(F.t * 2.2) * 0.02, tgt.z);
      if (Math.random() < dt * 0.6) { bobber.position.y -= 0.04; ripple(tgt.x, tgt.z, 0.25, 0.8); sfx.nibble(); }  // 小鱼试探
      if (F.t > F.wait) { F.st = 'bite'; F.t = 0; sfx.bite(); ripple(tgt.x, tgt.z, 0.9, 1.2); setPrompt('鱼咬钩了！按 F 收竿'); }
    } else if (F.st === 'bite') {
      bobber.position.set(tgt.x + Math.sin(F.t * 30) * 0.05, -0.12 + Math.sin(F.t * 18) * 0.05, tgt.z);
      if (Math.random() < dt * 6) ripple(tgt.x, tgt.z, 0.4, 0.7);
      if (F.t > 0.95) { toast('鱼跑了……', 1.6); sfx.miss(); setPrompt(''); endFishing(); return; }
    } else if (F.st === 'reeling') {
      const k = Math.min(1, F.t / 1.3);
      const p = V3().lerpVectors(tgt, rodTip, k * k); p.y = THREE.MathUtils.lerp(0, rodTip.y - 0.6, k) + Math.sin(k * Math.PI) * 1.2;
      bobber.position.copy(p);
      if (hooked) { hooked.position.copy(p).add(V3(0, -0.35, 0)); hooked.rotation.set(Math.PI / 2 + Math.sin(F.t * 25) * 0.4, F.t * 3, 0); }
      if (k >= 1) {
        const { f, cm } = F.caught;
        const b = basket[f.name] || { n: 0, max: 0 }; b.n++; b.max = Math.max(b.max, cm); basket[f.name] = b;
        localStorage.setItem('shanshui-basket', JSON.stringify(basket)); renderBasket();
        showCard(f, cm); sfx.chime(); endFishing();
      }
    }
    // 鱼线：竿梢 → 浮漂，自然下垂
    const pos = lineGeo.attributes.position;
    for (let i = 0; i < LINE_N; i++) {
      const k = i / (LINE_N - 1);
      const sag = F.st === 'waiting' ? 0.6 : 0.15;
      pos.setXYZ(i, THREE.MathUtils.lerp(rodTip.x, bobber.position.x, k), THREE.MathUtils.lerp(rodTip.y, bobber.position.y + 0.05, k) - Math.sin(k * Math.PI) * sag, THREE.MathUtils.lerp(rodTip.z, bobber.position.z, k));
    }
    pos.needsUpdate = true;
  }
  function pressFish() {
    const F = S.fish;
    if (F.st === 'idle') return startCast();
    if (F.st === 'waiting') { toast('收竿太早了', 1.4); sfx.miss(); setPrompt(''); return endFishing(); }
    if (F.st === 'bite') {
      const f = rollFish(F.target.x, F.target.z);
      const cm = Math.round(rand(f.cm[0], f.cm[1]));
      F.caught = { f, cm }; F.st = 'reeling'; F.t = 0; setPrompt(''); sfx.splash();
      hooked = fishMesh(f, cm); scene.add(hooked);
      ripple(F.target.x, F.target.z, 1.2, 1.4);
    }
  }

  // ───────────────────────── 上船 / 上岸 ─────────────────────────
  function tryBoard() {
    if (Math.hypot(S.pos.x - pBoat.position.x, S.pos.z - pBoat.position.z) > 4) return false;
    S.mode = 'boat'; S.boat.speed = 0; endFishing();
    toast('登 船', 1.2); sfx.board();
    return true;
  }
  function landingSpot() {
    let best = null;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      for (const d of [2.4, 3.2, 4.2]) {
        const x = pBoat.position.x + Math.cos(ang) * d, z = pBoat.position.z + Math.sin(ang) * d;
        const h = walkHeight(x, z, 1);
        if (h !== null && !walkBlocked(x, z) && h < 2.2 && (!best || d < best.d)) best = { x, z, h, d };
      }
    }
    return best;
  }
  function tryLand() {
    const p = landingSpot();
    if (!p) { toast('这里靠不了岸', 1.4); return; }
    S.mode = 'walk'; S.pos.set(p.x, 0, p.z); S.y = p.h; S.boat.speed = 0; endFishing();
    S.yaw = Math.atan2(p.x - pBoat.position.x, p.z - pBoat.position.z);
    toast('上 岸', 1.2); sfx.board();
  }

  function takeOff() {
    if (S.mode === 'boat') { toast('先上岸，再御剑', 1.4); return; }
    endFishing(); setPrompt('');
    S.mode = 'fly'; S.fly.vel.set(0, 7, 0); S.fly.up = 0.7; S.fly.landing = null; S.fly.target = null; S.fly.appear = 0;
    swordG.visible = true; trailPts.length = 0;
    toast('御 剑', 1.2); sfx.swordUp();
    controls.minDistance = 6;
  }
  // 可落脚点缓存：主岛一带按网格采样 + 各台峰顶；四周 0.8 米也得能站，免得落在水线边上
  let landSpots = null;
  function canStand(x, z) {
    if (walkBlocked(x, z) || walkHeight(x, z, 1e3) === null) return false;
    for (const [dx, dz] of [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) {
      if (walkHeight(x + dx, z + dz, 1e3) === null || walkBlocked(x + dx, z + dz)) return false;
    }
    return true;
  }
  function buildLandSpots() {
    landSpots = [];
    for (let x = -90; x <= 90; x += 1.5) for (let z = -90; z <= 90; z += 1.5) {
      if (canStand(x, z)) landSpots.push({ x, z, h: walkHeight(x, z, 1e3) });
    }
    for (const m of MESAS) {
      for (let rr = m.block + 0.6; rr < m.r; rr += 1.2) for (let a = 0; a < 6.28; a += 1.2 / rr) {
        const x = m.x + Math.cos(a) * rr, z = m.z + Math.sin(a) * rr;
        if (canStand(x, z)) landSpots.push({ x, z, h: walkHeight(x, z, 1e3) });
      }
    }
  }
  function nearestLandSpot(x, z) {
    if (!landSpots) buildLandSpots();
    let best = null, bd = Infinity;
    for (const p of landSpots) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function land() {
    const h = walkHeight(S.pos.x, S.pos.z, S.y);
    if (h !== null && !walkBlocked(S.pos.x, S.pos.z)) { S.fly.landing = h; S.fly.target = null; return; }
    const p = nearestLandSpot(S.pos.x, S.pos.z);
    if (!p) { toast('脚下无处落脚，飞到岸上再落', 1.8); return; }
    S.fly.landing = p.h; S.fly.target = p;
    toast('脚下无处落脚，往最近的岸边落', 1.8);
  }

  // ───────────────────────── 每帧 ─────────────────────────
  const fwd = V3(), rgt = V3();
  let wakeT = 0;
  function camBasis() {
    fwd.subVectors(controls.target, camera.position); fwd.y = 0; fwd.normalize();
    rgt.set(-fwd.z, 0, fwd.x);
  }
  function flutter(speed) {
    const P = parts, t = performance.now() / 1000;
    const k = Math.min(1, speed / 18);
    if (P.ribbon) P.ribbon.rotation.x = THREE.MathUtils.lerp(P.ribbon.rotation.x, 0.15 + k * 1.15 + Math.sin(t * (4 + k * 10)) * (0.06 + 0.12 * k), 0.2);
    if (P.ribbon) P.ribbon.rotation.z = Math.sin(t * 2.3) * 0.08 * (1 - k * 0.5);
    if (P.sash) {
      P.sash.rotation.x = THREE.MathUtils.lerp(P.sash.rotation.x, -0.04 - k * 0.35 + Math.sin(t * (5 + k * 9) + 1) * (0.04 + 0.08 * k), 0.2);
      P.sash.rotation.z = Math.sin(t * (3 + k * 7)) * (0.04 + 0.18 * k);
    }
  }
  function skirts(k) {
    const P = parts;
    if (P.skirtL) P.skirtL.rotation.x = P.legL.rotation.x * k;
    if (P.skirtR) P.skirtR.rotation.x = P.legR.rotation.x * k;
  }
  function pose(dt, moving, speedK) {
    if (!parts.legL) return;
    const P = parts;
    flutter(S.mode === 'fly' ? S.fly.vel.length() : S.mode === 'boat' ? Math.abs(S.boat.speed) * 1.5 : moving ? speedK * 4 : 0);
    if (S.mode === 'fly') {
      const k = Math.min(1, S.fly.vel.length() / 16);
      const t = performance.now() / 1000;
      body.position.y = Math.sin(t * 2.2) * 0.03;
      P.legL.rotation.x = THREE.MathUtils.lerp(P.legL.rotation.x, -0.28, 0.2);
      P.legR.rotation.x = THREE.MathUtils.lerp(P.legR.rotation.x, 0.3, 0.2);
      P.torso.rotation.x = THREE.MathUtils.lerp(P.torso.rotation.x, 0.06 + 0.16 * k, 0.1);
      P.armL.rotation.x = THREE.MathUtils.lerp(P.armL.rotation.x, 0.25 + 0.45 * k + Math.sin(t * 11) * 0.05 * k, 0.15);
      P.armR.rotation.x = THREE.MathUtils.lerp(P.armR.rotation.x, 0.25 + 0.45 * k + Math.sin(t * 11 + 1) * 0.05 * k, 0.15);
      P.armL.rotation.z = THREE.MathUtils.lerp(P.armL.rotation.z, 0.28, 0.1);
      P.armR.rotation.z = THREE.MathUtils.lerp(P.armR.rotation.z, -0.28, 0.1);
      P.head.rotation.x = -P.torso.rotation.x * 0.7;
      skirts(0.5);
      return;
    }
    P.armL.rotation.z = THREE.MathUtils.lerp(P.armL.rotation.z, 0, 0.2);
    P.armR.rotation.z = THREE.MathUtils.lerp(P.armR.rotation.z, 0, 0.2);
    P.head.rotation.x = 0;
    if (S.mode === 'boat') {
      body.position.y = -0.55;
      P.legL.rotation.x = P.legR.rotation.x = -1.45;
      const row = Math.abs(S.boat.speed) > 0.3 ? Math.sin(S.phase) : 0;
      if (S.fish.st === 'idle') { P.armL.rotation.x = -0.9 + row * 0.45; P.armR.rotation.x = -0.9 + row * 0.45; }
      P.torso.rotation.x = row * 0.08;
      skirts(0.83);
    } else {
      // 坡上（拱桥、台阶、山坡）步子迈小些：腿是直的，前后脚踩的地面高差太大，总有一只脚够不着地
      const fx = Math.sin(hero.rotation.y), fz = Math.cos(hero.rotation.y), hx = hero.position.x, hz = hero.position.z;
      const slope = Math.abs((walkHeight(hx + fx * 0.4, hz + fz * 0.4, S.y) ?? S.y) - (walkHeight(hx - fx * 0.4, hz - fz * 0.4, S.y) ?? S.y)) / 0.8;
      const sw = moving ? (Math.sin(S.phase) * 0.55 * speedK) / (1 + 2.5 * Math.min(slope, 1)) : 0;
      P.legL.rotation.x = THREE.MathUtils.lerp(P.legL.rotation.x, sw, 0.3);
      P.legR.rotation.x = THREE.MathUtils.lerp(P.legR.rotation.x, -sw, 0.3);
      // 脚踩实地面：迈步时两腿张开身子自然下沉（起伏由此而来），坡上按前后脚各自的地面高度落脚
      const plant = plantBody() + (moving ? 0 : Math.sin(performance.now() / 900) * 0.004);
      body.position.y = THREE.MathUtils.lerp(body.position.y, plant, 0.5);
      if (S.fish.st === 'idle') {
        P.armL.rotation.x = THREE.MathUtils.lerp(P.armL.rotation.x, -sw * 0.8, 0.3);
        P.armR.rotation.x = THREE.MathUtils.lerp(P.armR.rotation.x, sw * 0.8, 0.3);
      }
      P.torso.rotation.x = 0;
      P.torso.rotation.y = moving ? Math.sin(S.phase) * 0.1 * speedK : THREE.MathUtils.lerp(P.torso.rotation.y, 0, 0.2);
      skirts(0.5);
    }
    // 钓鱼姿势：右臂前举，竿子斜指水面
    if (S.fish.st !== 'idle') {
      const st = S.fish.st;
      const lift = st === 'casting' ? -2.4 + Math.min(1, S.fish.t / 0.7) * 1.3 : st === 'reeling' ? -1.6 + Math.sin(S.fish.t * 12) * 0.15 : -1.15;
      P.armR.rotation.x = THREE.MathUtils.lerp(P.armR.rotation.x, lift, 0.35);
      P.armL.rotation.x = THREE.MathUtils.lerp(P.armL.rotation.x, -0.9, 0.3);
      rodPivot.rotation.x = -0.9;    // 竿梢上挑
    }
  }

  window.__gameUpdate = (dt) => {
    window.__shadowCenter = S.pos;
    oar.visible = S.mode === 'boat' && S.fish.st === 'idle';
    fg.classList.toggle('off', S.mode === 'fly' || S.free);
    if (atmos) {
      const r = atmos.update(dt);
      audio.setRain(r);
      audio.setBirds(S.mode !== 'fly' && atmos.time !== '黄昏' || Math.random() < 0.3);
      const flyK = S.mode === 'fly' ? Math.min(1, S.fly.vel.length() / 30) : S.mode === 'boat' ? Math.min(0.25, Math.abs(S.boat.speed) / 12) : 0;
      audio.setWind(flyK, S.mode === 'fly' ? S.y : 0);
      audio.setWater(S.mode === 'fly' ? Math.max(0, 1 - S.y / 80) : 1);
    }
    if (introState !== 'done') {
      if (introState === 'fly') {
        introT = Math.min(1, introT + dt / 5.5);
        const e = 1 - Math.pow(1 - introT, 3);
        camera.position.lerpVectors(introFrom.p, introTo.p, e);
        controls.target.lerpVectors(introFrom.t, introTo.t, e);
        if (introT >= 1) introState = 'done';
      }
      pose(dt, false, 0); updateRipples(dt); pressed.clear();
      return;
    }
    if (hit('t')) { const tm = atmos.cycleTime(); audio.setMood(tm); toast(tm, 1.6); sfx.toggle(); }
    if (hit('r')) { toast(atmos.toggleRain() ? '细 雨' : '雨 歇', 1.6); sfx.toggle(); }
    if (hit('g') && W.gui) { W.gui.show(W.gui._hidden); }
    if (hit('m')) { toast(audio.toggleMute() ? '静 音' : '有 声', 1.2); }
    // 全局键
    if (hit('h')) { helpOn = !helpOn; ui.help.classList.toggle('on', helpOn); helpTimer = 0; }
    if (hit('v')) {
      S.free = !S.free;
      controls.enablePan = S.free; controls.maxDistance = S.free ? 450 : 45;
      toast(S.free ? '自由观景' : '回到游人', 1.2);
      if (!S.free) snapCamera();
    }
    if (helpTimer > 0) { helpTimer -= dt; if (helpTimer <= 0 && helpOn) { helpOn = false; ui.help.classList.remove('on'); } }
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.classList.remove('on'); }
    if (cardTimer > 0) { cardTimer -= dt; if (cardTimer <= 0) ui.card.classList.remove('on'); }
    ui.mode.textContent = S.free ? '自由观景 · 按 V 回到游人' : S.mode === 'boat' ? '泛 舟' : S.mode === 'fly' ? '御 剑' : '漫 步';

    if (!S.free) {
      camBasis();
      let ix = 0, iz = 0;
      if (down('w', 'arrowup')) iz += 1;
      if (down('s', 'arrowdown')) iz -= 1;
      if (down('a', 'arrowleft')) ix -= 1;
      if (down('d', 'arrowright')) ix += 1;
      const moving = (ix || iz) && S.fish.st !== 'reeling';
      if (moving && (S.fish.st === 'waiting' || S.fish.st === 'casting' || S.fish.st === 'bite')) { endFishing(); setPrompt(''); }

      if (S.mode === 'walk') {
        const run = down('shift');
        const sp = moving ? (run ? 6.2 : 3.2) : 0;
        if (moving) {
          const dir = V3().addScaledVector(fwd, iz).addScaledVector(rgt, ix).normalize();
          const targetYaw = Math.atan2(dir.x, dir.z);
          let dy = targetYaw - S.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          S.yaw += dy * Math.min(1, dt * 10);
          const step = sp * dt;
          const tryMove = (nx, nz) => {
            if (walkBlocked(nx, nz)) return false;
            const h = walkHeight(nx, nz, S.y);
            if (h === null || h - S.y > 0.85) return false;
            S.pos.x = nx; S.pos.z = nz; S.y = h; return true;
          };
          if (!tryMove(S.pos.x + dir.x * step, S.pos.z + dir.z * step)) {
            tryMove(S.pos.x + dir.x * step, S.pos.z) || tryMove(S.pos.x, S.pos.z + dir.z * step);
          }
          S.phase += dt * sp * 2.6;
        }
        // 平滑只留给台阶这类突变；坡上、桥面直接跟地面走，免得上坡陷脚、下坡悬空
        const hy = hero.position.y || S.y;
        hero.position.set(S.pos.x, Math.abs(S.y - hy) > 0.15 ? THREE.MathUtils.lerp(hy, S.y, Math.min(1, dt * 14)) : S.y, S.pos.z);
        hero.rotation.y = S.yaw;
        pose(dt, moving, sp / 3.2);
        // 提示
        if (S.fish.st === 'idle') {
          if (Math.hypot(S.pos.x - pBoat.position.x, S.pos.z - pBoat.position.z) < 4) setPrompt('按 E 登船');
          else if (castSpot()) setPrompt('按 F 抛竿');
          else setPrompt('');
        }
        if (hit('e')) tryBoard();
        if (hit('q')) takeOff();
      } else if (S.mode === 'boat') {
        if (hit('q')) takeOff();
        // 划船：W/S 前后，A/D 转向
        const B = S.boat;
        const thrust = (iz > 0 ? 3.2 : iz < 0 ? -1.6 : 0);
        B.speed += (thrust - B.speed * 0.55) * dt;
        B.yawRate = THREE.MathUtils.lerp(B.yawRate, -ix * 0.75 * (0.35 + Math.min(1, Math.abs(B.speed) / 3)), dt * 3);
        pBoat.rotation.y += B.yawRate * dt;
        const bx = Math.cos(pBoat.rotation.y), bz = -Math.sin(pBoat.rotation.y);   // 船头 = 局部 +x
        const nx = pBoat.position.x + bx * B.speed * dt, nz = pBoat.position.z + bz * B.speed * dt;
        const ok = [2.6, 0, -2.6].every((o) => [-0.7, 0.7].every((s) => waterFree(nx + bx * o - bz * s, nz + bz * o + bx * s)));
        if (ok) pBoat.position.set(nx, 0, nz); else B.speed *= -0.25;
        const t = performance.now() / 1000;
        pBoat.position.y = Math.sin(t * 1.3) * 0.05;
        pBoat.rotation.x = Math.sin(t * 1.1) * 0.02; pBoat.rotation.z = Math.sin(t * 0.9) * 0.02 + B.yawRate * 0.04;
        const ph0 = S.phase;
        S.phase += dt * Math.min(6, Math.abs(B.speed) * 2.2);
        oar.rotation.y = Math.sin(S.phase) * 0.5 * Math.min(1, Math.abs(B.speed) / 1.5);
        if (Math.abs(B.speed) > 0.4 && Math.floor(ph0 / Math.PI) !== Math.floor(S.phase / Math.PI)) sfx.oar();
        wakeT += dt;
        if (Math.abs(B.speed) > 0.6 && wakeT > 0.16) {
          wakeT = 0;
          // 船头两侧不断生出涟漪，留在身后越扩越大，连起来就是 V 形尾迹
          for (const sd of [-1, 1]) ripple(pBoat.position.x + bx * 2.2 - bz * sd * 0.75, pBoat.position.z + bz * 2.2 + bx * sd * 0.75, 0.45, 3.2);
          if (Math.random() < 0.5) ripple(pBoat.position.x - bx * 2.7, pBoat.position.z - bz * 2.7, 0.7, 2.0);
        }
        // 人坐在船尾，面朝船头
        const seat = V3(-1.6, 0.25, 0).applyEuler(pBoat.rotation).add(pBoat.position);
        hero.position.copy(seat);
        hero.rotation.set(0, pBoat.rotation.y + Math.PI / 2, 0);
        S.pos.set(seat.x, 0, seat.z); S.y = seat.y; S.yaw = hero.rotation.y;
        pose(dt, false, 0);
        if (S.fish.st === 'idle') setPrompt(landingSpot() ? '按 E 上岸 · F 抛竿' : '按 F 抛竿');
        if (hit('e')) tryLand();
      } else {
        // ── 御剑飞行：W/S 沿视线方向，A/D 平移，空格上升，C 下降，Shift 疾行
        const F = S.fly;
        const look = V3().subVectors(controls.target, camera.position).normalize();
        const fast = down('shift');
        const sp = fast ? 34 : 16;
        const want = V3();
        // 自动降落途中按方向键 → 取消，继续自由飞
        if (F.target && (iz || ix)) { F.landing = null; F.target = null; toast('取消降落', 1.0); }
        let tgtD = 0;
        if (F.landing !== null && F.target) {
          // 先滑翔到落脚点上空，沿约 1:2 的下滑线逐渐降低，到了再垂直落下
          const dx = F.target.x - S.pos.x, dz = F.target.z - S.pos.z;
          tgtD = Math.hypot(dx, dz);
          const hs = Math.min(fast ? 34 : 20, tgtD * 1.5) / (tgtD || 1);
          want.set(dx * hs, 0, dz * hs);
          want.y = tgtD > 0.6 ? THREE.MathUtils.clamp(F.landing + 2 + tgtD * 0.5 - S.y, -7, 6) : -7;
        } else if (F.landing !== null) {
          want.set(0, -7, 0);
        } else {
          want.addScaledVector(fwd, iz * sp).addScaledVector(rgt, ix * sp * 0.75);
          if (down(' ')) want.y += 9;
          if (down('c', 'control')) want.y -= 9;
          if (F.up > 0) { F.up -= dt; want.y = Math.max(want.y, 6); }
        }
        F.vel.lerp(want, Math.min(1, dt * (iz || ix || F.target ? 2.0 : 1.4)));
        const np = V3(S.pos.x, S.y, S.pos.z).addScaledVector(F.vel, dt);
        // 避开山峰：在近似截面内就沿径向推出去
        for (const c of peakCols) {
          const r = peakRadiusAt(c, np.y);
          if (!r) continue;
          const dx = np.x - c.x, dz = np.z - c.z, d = Math.hypot(dx, dz);
          if (d < r) {
            const nx = dx / (d || 1), nz = dz / (d || 1);
            np.x = c.x + nx * r; np.z = c.z + nz * r;
            const vn = F.vel.x * nx + F.vel.z * nz;
            if (vn < 0) { F.vel.x -= vn * nx; F.vel.z -= vn * nz; }
            if (F.target) F.vel.y = Math.max(F.vel.y, 6);   // 自动降落被山挡住：拔高越过去
          }
        }
        // 离地 / 离水至少 1.2 米，最高 420 米，不飞出天地
        const ground = Math.max(islandHeight(np.x, np.z), 0, walkHeight(np.x, np.z, np.y) ?? -9);
        if (F.landing !== null && F.target && tgtD > 0.6) {
          np.y = Math.max(np.y, ground + 1.2);                       // 滑翔途中别擦着地面 / 屋顶
        } else if (F.landing !== null) {
          if (F.target) { np.x = THREE.MathUtils.lerp(np.x, F.target.x, Math.min(1, dt * 6)); np.z = THREE.MathUtils.lerp(np.z, F.target.z, Math.min(1, dt * 6)); }
          if (np.y <= F.landing + 0.02) {
            if (F.target) { np.x = F.target.x; np.z = F.target.z; F.target = null; }
            S.mode = 'walk'; S.y = F.landing; swordG.visible = false; trail.visible = false;
            hero.rotation.set(0, S.yaw, 0); controls.minDistance = 3;
            toast('落 地', 1.0); sfx.land();
          }
          np.y = Math.max(np.y, F.landing);
        } else if (np.y < ground + 1.2) { np.y = ground + 1.2; if (F.vel.y < 0) F.vel.y = 0; }
        np.y = Math.min(np.y, 420);
        const R = Math.hypot(np.x, np.z); if (R > 850) { np.x *= 850 / R; np.z *= 850 / R; }
        S.pos.set(np.x, 0, np.z); S.y = np.y;
        // 朝向：跟随水平速度，转弯时略微侧倾，升降时俯仰
        const hv = Math.hypot(F.vel.x, F.vel.z);
        if (hv > 0.8) {
          const ty = Math.atan2(F.vel.x, F.vel.z);
          let dy = ty - S.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          F.yawRate = THREE.MathUtils.lerp(F.yawRate, dy * 3, Math.min(1, dt * 4));
          S.yaw += dy * Math.min(1, dt * 4);
        } else F.yawRate *= 0.9;
        const pitch = THREE.MathUtils.clamp(-F.vel.y / 30, -0.35, 0.35);
        const roll = THREE.MathUtils.clamp(-F.yawRate * 0.25, -0.5, 0.5);
        const bob = Math.sin(performance.now() / 450) * 0.06;
        F.appear = Math.min(1, F.appear + dt * 2.5);
        swordG.position.set(S.pos.x, S.y + bob, S.pos.z);
        swordG.rotation.set(pitch, S.yaw, roll);
        swordG.scale.setScalar(0.2 + 0.8 * F.appear);
        hero.rotation.order = 'YXZ';
        hero.position.set(S.pos.x, S.y + bob + 0.04, S.pos.z);
        hero.rotation.set(pitch, S.yaw, roll);
        pose(dt, false, 0);
        updateTrail(S.mode === 'fly', hv / 12);
        const alt = Math.round(S.y - Math.max(islandHeight(S.pos.x, S.pos.z), 0));
        ui.mode.textContent = `御 剑 · 离地 ${alt} 米`;
        setPrompt(F.landing !== null ? '' : 'W 前行 · 空格 上升 · C 下降 · Shift 疾行 · Q 落地');
        if (hit('q') && F.landing === null) land();
        // 速度感：快时视野略微张开
        const fovT = 50 + 12 * Math.min(1, hv / 30);
        if (Math.abs(camera.fov - fovT) > 0.05) { camera.fov += (fovT - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
      }
      if (S.mode !== 'fly') {
        if (Math.abs(camera.fov - 50) > 0.05) { camera.fov += (50 - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
        if (trail.visible) updateTrail(false, 0);
      }
      if (hit('f') && S.mode !== 'fly') pressFish();

      // 镜头跟随：目标点平移，用户拖动的角度与距离保持不变
      const tgt = V3(hero.position.x, hero.position.y + (S.mode === 'boat' ? 1.3 : S.mode === 'fly' ? 1.4 : 1.5), hero.position.z);
      const delta = tgt.sub(controls.target);
      controls.target.add(delta); camera.position.add(delta);
      if (camera.position.y < hero.position.y + 0.6) camera.position.y = hero.position.y + 0.6;
    } else {
      setPrompt('');
      pose(dt, false, 0);
    }
    updateFishing(dt);
    updateRipples(dt);
    pressed.clear();
  };
  window.__game = { S, hero, pBoat, walkHeight, waterFree, pressFish, tryBoard, tryLand, takeOff, land, keys, audio, get atmos() { return atmos; }, skipIntro() { introState = 'ready'; enterPainting(); introT = 1; }, enter() { introState = 'ready'; enterPainting(); }, get introState() { return introState; }, castSpot: () => castSpot(), snapCamera };
}
