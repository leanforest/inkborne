// 山水意境 · 短视频逐帧录制（只在网址带 ?cap 时由 main.js 加载）
// 用法：?cap&shot=s04 → 自动渲染这一镜，每帧合成后 POST 到 /__frame（tools/serve.py 存到 video/frames/s04/）。
//       ?cap         → 只挂上 window.__cap，供调试踩点（still / info）。
//       横屏：加 &set=wide&w=1920&h=1080 → 用 shots_wide.js 的镜头，成片存到 promo/public/clips_wide/（窗口须 16:9）。
// 画面之外的 DOM（宣纸晕边、颗粒、开场、鱼卡、字幕）都画在 2D 合成层上，因为截取的只有 WebGL 画布。
const qs = new URLSearchParams(location.search);
const WIDE = qs.get('set') === 'wide';
const { SHOTS } = await import(WIDE ? './shots_wide.js' : './shots.js');
const DIR = WIDE ? 'clips_wide' : 'clips';

const W = window.__WORLD, G = window.__game;
const { THREE, camera, controls, renderer } = W;
const FPS = 30, OUT_W = +(qs.get('w') || 1080), OUT_H = +(qs.get('h') || 1920);

// 画质拉满：2 倍超采样（竖屏渲染 2160×3840 再缩到 1080×1920，横屏 3840×2160 → 1920×1080）+ 显卡上限 MSAA + 全分辨率反射 + 4K 阴影
const SS = +(qs.get('ss') || 2);
window.__capInfo = W.capQuality(OUT_W, SS);

const cv = document.createElement('canvas');
cv.width = OUT_W; cv.height = OUT_H;
const ctx = cv.getContext('2d', { willReadFrequently: false });

// 宣纸颗粒（对应 index.html 的 #grain）
const grain = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 260;
  const x = c.getContext('2d'), d = x.createImageData(260, 260);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = Math.random();
    d.data[i] = 140; d.data[i + 1] = 128; d.data[i + 2] = 107; d.data[i + 3] = n * 0.9 * 255;
  }
  x.putImageData(d, 0, 0);
  return ctx.createPattern(c, 'repeat');
})();

function compose(overlay, t) {
  // 3D 画面：按 cover 铺满
  const src = renderer.domElement, sw = src.width, sh = src.height;
  const s = Math.max(OUT_W / sw, OUT_H / sh);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, (OUT_W - sw * s) / 2, (OUT_H - sh * s) / 2, sw * s, sh * s);
  // 留白晕边（#paper）：ellipse 75% 70% at 50% 46%，55% 透明 → 100% 宣纸白 .55
  ctx.save();
  ctx.translate(OUT_W * 0.5, OUT_H * 0.46); ctx.scale(OUT_W * 0.75, OUT_H * 0.7);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0.55, 'rgba(250,248,243,0)'); g.addColorStop(1, 'rgba(250,248,243,0.55)');
  ctx.fillStyle = g; ctx.fillRect(-2, -2, 4, 4);
  ctx.restore();
  // 颗粒
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.06; ctx.fillStyle = grain; ctx.fillRect(0, 0, OUT_W, OUT_H); ctx.restore();
  if (overlay) { ctx.save(); overlay(ctx, t, { W: OUT_W, H: OUT_H, G }); ctx.restore(); }
}

async function post(shot, i) {
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));   // 无损，压缩留给最终编码
  await fetch(`/__frame?shot=${shot}&i=${i}`, { method: 'POST', body: blob });
}

// 上传一帧：偶发的网络错误重试几次（服务器只接收尺寸完整的帧，不会写进半帧）
async function postRetry(url, body, tries = 4) {
  for (let k = 1; ; k++) {
    try {
      const r = await fetch(url, { method: 'POST', body });
      if (r.ok) return r;
      if (k >= tries) throw new Error(`${url} → HTTP ${r.status}`);
    } catch (e) {
      if (k >= tries) throw e;
    }
    await new Promise((res) => setTimeout(res, 300 * k));
  }
}

// ── 镜头工具 ──
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function setCam(p, t, fov) {
  camera.position.set(...p); controls.target.set(...t); camera.lookAt(controls.target);
  if (fov && camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
}
// 驱动镜头：放在主角身后（yaw 朝向、pitch 俯仰），让 WASD / 御剑的方向按这个视角走
function driveCam(yaw, pitch = 0.25, dist = 9) {
  const h = G.hero.position, tgt = V3(h.x, h.y + 1.5, h.z);
  controls.target.copy(tgt);
  camera.position.set(tgt.x - Math.sin(yaw) * Math.cos(pitch) * dist, tgt.y + Math.sin(pitch) * dist, tgt.z - Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(tgt);
}
function place(x, z, yaw) {
  const S = G.S;
  S.pos.set(x, 0, z); S.y = G.walkHeight(x, z, 30) ?? W.islandHeight(x, z); S.yaw = yaw;
  G.hero.position.set(x, S.y, z); G.hero.rotation.y = yaw;
}
// 按键走游戏自己的键盘监听：hold 按住，release 松开，tap 按一下（本帧生效）
const kd = (key) => dispatchEvent(new KeyboardEvent('keydown', { key }));
const ku = (key) => dispatchEvent(new KeyboardEvent('keyup', { key }));
const keys = { hold(...k) { k.forEach(kd); }, release(...k) { k.forEach(ku); }, tap(k) { kd(k); ku(k); } };
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const mix3 = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
const T = { V3, setCam, driveCam, place, keys, lerp, ease, mix3, W, G, THREE, camera, controls, FPS };

async function runShot(id, { only = null, still = false } = {}) {
  const shot = SHOTS[id];
  if (!shot) throw new Error('没有这一镜：' + id);
  // st.once(名字, 动作)：只做一次（按键、摆位等），放在 pre 里用
  const done = new Set();
  const st = { once(k, fn) { if (!done.has(k)) { done.add(k); fn(); } } };
  G.atmos.set(shot.time || '正午', !!shot.rain); G.atmos.snap();
  shot.setup?.(T, st);
  const dt = 1 / FPS;
  // 先跑几帧让开场状态走完（开场期间的按键会被吞掉），之后 pre 里的按键才有效
  for (let i = 0; i < 4 && G.introState !== 'done'; i++) window.__frame(dt);
  window.__capPre = (d, t) => shot.pre?.(T, st, st.t, d);
  window.__capPost = (d, t) => shot.cam?.(T, st, st.t, d);
  // 预热：让水面、云、动画、跟随镜头稳定下来（不出帧）
  st.t = -(shot.warm ?? 1.5);
  while (st.t < 0) { window.__frame(dt); st.t += dt; }
  const n = Math.round(shot.dur * FPS);
  let pending = Promise.resolve();
  for (let i = 0; i < n; i++) {
    st.t = i / FPS;
    window.__frame(dt);
    if (renderer.getContext().isContextLost()) throw new Error('WebGL 上下文丢失（显存不足？）');
    if (only && !only.includes(i)) continue;
    compose(shot.overlay ? (c, t, o) => shot.overlay(c, st.t, o, T, st) : null, st.t);
    if (still) { await post('probe_' + id, i); continue; }
    // 原始像素直接交给服务器端 ffmpeg；上一帧上传和这一帧渲染并行，但保证按顺序到达
    const data = ctx.getImageData(0, 0, OUT_W, OUT_H).data;
    await pending;
    pending = postRetry(`/__raw?shot=${id}&w=${OUT_W}&h=${OUT_H}&dir=${DIR}&i=${i}`, data);
    if (i % 30 === 0) document.title = `CAP ${id} ${i}/${n}`;
  }
  await pending;
  if (!still) await postRetry(`/__raw_end?shot=${id}&dir=${DIR}`, null);
  window.__capPre = window.__capPost = null;
  return n;
}

window.__cap = { runShot, compose, post, cv, T, SHOTS };
const shotId = qs.get('shot');
if (shotId) {
  document.title = 'CAP ' + shotId + ' …';
  const only = qs.get('only') ? qs.get('only').split(',').map(Number) : null;
  runShot(shotId, { only, still: !!only }).then((n) => { document.title = `DONE ${shotId} ${n}`; }, (e) => { document.title = 'FAIL ' + e.message; console.error(e); });
} else document.title = 'CAP READY';
