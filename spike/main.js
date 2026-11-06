// 山水意境 · 风格小样（试验品，用完即弃）
// 所有材质都是自定义着色器，颜色直接按“画面色”输出，不做色彩空间转换，便于对照参考图调色。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import GUI from 'lil-gui';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

THREE.ColorManagement.enabled = false;

// ───────────────────────── 逐帧录制（?cap）─────────────────────────
// 网址加 ?cap：不跑实时循环，由 capture.js 一帧一帧推进（固定步长、虚拟时钟），画面再慢也不掉帧。
const CAP = new URLSearchParams(location.search).has('cap');
if (CAP) {
  const p0 = performance.now(), realNow = performance.now.bind(performance);
  let vt = 0;
  performance.now = () => p0 + vt;
  window.__vclock = { advance(dt) { vt += dt * 1000; }, realNow };
}

// ───────────────────────── 工具：随机与噪声 ─────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261105);
const rand = (a, b) => a + (b - a) * rng();

function hash3(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440670441)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const sstep = (t) => t * t * (3 - 2 * t);
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = sstep(x - xi), yf = sstep(y - yi), zf = sstep(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf
  );
}
function fbm3(x, y, z, oct = 4) {
  let s = 0, a = 0.5;
  for (let i = 0; i < oct; i++) { s += a * noise3(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
  return s / (1 - Math.pow(0.5, oct));
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ───────────────────────── 共享“画意”参数 ─────────────────────────
const C = (hex) => new THREE.Color(hex);
const U = {
  uTime: { value: 0 },
  uSkyTop: { value: C('#5d9fe6') },
  uSkyHorizon: { value: C('#fdf7ef') },
  uMist: { value: C('#fbfaf6') },
  uFarTint: { value: C('#d9e4f1') },
  uSunGlow: { value: C('#ffd2bd') },
  uSunDir: { value: new THREE.Vector3(0.25, 0.22, -1).normalize() },
  uLightDir: { value: new THREE.Vector3(-0.55, 0.75, 0.45).normalize() },
  uFogDensity: { value: 0.00135 },
  uHeightFog: { value: 0.06 },
  uHeightFogStrength: { value: 0.7 },
  // 投影（水彩式：只把阴影处染成青灰，不压黑）
  uShadowMap: { value: null }, uShadowMatrix: { value: new THREE.Matrix4() }, uShadowOn: { value: 0 }, uShadowTexel: { value: 1 / 2048 },
  uShadowTint: { value: new THREE.Color('#b4c6dc') }, uSceneTint: { value: new THREE.Color('#ffffff') }, uShadowStrength: { value: 0.6 },
};

const COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uSkyTop, uSkyHorizon, uMist, uFarTint, uSunGlow, uSunDir, uLightDir;
uniform float uFogDensity, uHeightFog, uHeightFogStrength;

float hash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*noise(p); p *= 2.03; a *= 0.5; } return s/0.9375; }

vec3 skyColor(vec3 dir){
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 c = mix(uSkyHorizon, uSkyTop, pow(h, 0.55));
  float s = max(dot(dir, uSunDir), 0.0);
  c = mix(c, uSunGlow, pow(s, 5.0) * 0.55 * (1.0 - h*0.6));
  return c;
}
// 空气透视 + 贴水的雾带：越远越淡，越低越白
uniform vec3 uSceneTint;
uniform sampler2D uShadowMap; uniform mat4 uShadowMatrix; uniform float uShadowOn, uShadowTexel, uShadowStrength; uniform vec3 uShadowTint;
float shadowAt(vec3 wp){
  if (uShadowOn < 0.5) return 0.0;
  vec4 sc = uShadowMatrix * vec4(wp, 1.0);
  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 0.0;
  float s = 0.0;
  for (int i = -2; i <= 2; i++) for (int k = -2; k <= 2; k++) {
    vec2 o = vec2(float(i), float(k)) * uShadowTexel * 1.3;
    s += (p.z - 0.0009 > texture2D(uShadowMap, p.xy + o).x) ? 1.0 : 0.0;
  }
  s /= 25.0;
  vec2 e = min(p.xy, 1.0 - p.xy);
  return s * smoothstep(0.0, 0.06, min(e.x, e.y));
}
vec3 applyShadow(vec3 col, vec3 wp){
  // 云影：大尺度噪声随时间漂移，像云从头顶飘过
  float cs = fbm(vec3(wp.xz * 0.0045 + vec2(uTime * 0.006, uTime * 0.0025), 3.7));
  col = mix(col, col * uShadowTint, smoothstep(0.56, 0.72, cs) * 0.35 * uShadowStrength);
  float s = shadowAt(wp);
  if (s <= 0.0) return col;
  s = smoothstep(0.1, 0.9, s + (noise(wp * 1.1) - 0.5) * 0.3);       // 边缘晕开、略带笔触
  return mix(col, col * uShadowTint, s * uShadowStrength);
}
vec3 atmos(vec3 col, vec3 wp){
  col *= uSceneTint;
  vec3 d = wp - cameraPosition; float dist = length(d); vec3 dir = d / max(dist, 1e-3);
  float downK = smoothstep(0.06, 0.5, -dir.y) * smoothstep(20.0, 90.0, cameraPosition.y);   // 从高处往下看
  float f = (1.0 - exp(-pow(dist * uFogDensity, 1.4))) * (1.0 - 0.7 * downK);
  float hf = exp(-max(wp.y, 0.0) * uHeightFog) * smoothstep(25.0, 160.0, dist) * uHeightFogStrength;
  hf *= mix(1.0, 0.25, smoothstep(25.0, 110.0, cameraPosition.y)) * (1.0 - 0.85 * downK);   // 高空俯瞰：贴水雾层只是薄薄一层
  float m = clamp(f + hf * (1.0 - f), 0.0, 1.0);
  vec3 white = mix(uMist, skyColor(normalize(vec3(dir.x, 0.03, dir.z))), 0.5);
  vec3 fogC = mix(uFarTint, white, smoothstep(0.25, 0.9, m));   // 先变淡蓝，再融进白
  return mix(col, fogC, m);
}
`;

const VERT_STD = /* glsl */ `
varying vec3 vWorld; varying vec3 vNormal; varying vec3 vTint;
attribute float aH; varying float vH;
void main(){
  vec4 p = vec4(position, 1.0); vec3 nn = normal; vTint = vec3(1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p; nn = mat3(instanceMatrix) * nn;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
  vH = aH;
  vec4 wp = modelMatrix * p; vWorld = wp.xyz;
  vNormal = normalize(transpose(inverse(mat3(modelMatrix))) * nn);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

function shaderMat(fragBody, uniforms = {}, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, ...uniforms },
    vertexShader: opts.vertexShader || VERT_STD,
    fragmentShader: COMMON + fragBody,
    side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent,
    depthWrite: opts.depthWrite ?? true,
  });
}

// 通用“淡彩平涂”材质：柔和明暗 + 笔触噪声 + 空气透视
const FLAT_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uShade, uNoise;
varying vec3 vWorld; varying vec3 vNormal; varying vec3 vTint;
void main(){
  vec3 n = normalize(vNormal); if(!gl_FrontFacing) n = -n;
  float d = dot(n, uLightDir) * 0.5 + 0.5;
  float pn = fbm(vWorld * 0.9);
  // 分层淡彩：明暗分成几层再与平滑过渡混合，交界带一点笔触抖动
  float tone = smoothstep(0.15, 0.9, d + (noise(vWorld * 2.3) - 0.5) * 0.12);
  tone = mix(tone, floor(tone * 3.0 + 0.5) / 3.0, 0.45);
  vec3 col = uColor * vTint * mix(1.0 - uShade, 1.06, tone) * (1.0 + (pn - 0.5) * uNoise);
  // 大块晕染：一处偏暖一处偏冷、深浅不一
  float wsh = fbm(vWorld * 0.18 + 5.0);
  col *= mix(vec3(1.04, 1.0, 0.95), vec3(0.93, 0.97, 1.03), smoothstep(0.35, 0.7, wsh));
  // 颜料颗粒 + 掠射角处的积色（像水彩边缘）
  col *= 0.95 + 0.1 * noise(vWorld * 7.0);
  vec3 Vw = normalize(cameraPosition - vWorld);
  col *= 1.0 - smoothstep(0.75, 1.0, 1.0 - abs(dot(n, Vw))) * 0.12;
  gl_FragColor = vec4(atmos(applyShadow(col, vWorld), vWorld), 1.0);
}`;
const flatCache = new Map();
function flatMat(hex, shade = 0.28, noiseAmt = 0.12, side = THREE.FrontSide) {
  const key = hex + shade + noiseAmt + side;
  if (!flatCache.has(key)) {
    flatCache.set(key, shaderMat(FLAT_FRAG, {
      uColor: { value: C(hex) }, uShade: { value: shade }, uNoise: { value: noiseAmt },
    }, { side }));
  }
  return flatCache.get(key);
}

// ───────────────────────── 渲染器 / 场景 / 相机 ─────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: !CAP });   // 录制时抗锯齿全在离屏 MSAA + 超采样里做，省下显存
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.3, 9000);
camera.position.set(-42, 15, 58);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 7, -20);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 450;
controls.maxPolarAngle = 1.62;
controls.autoRotate = false;   // demo 里镜头跟随玩家，不再自动环绕
controls.autoRotateSpeed = 0.25;

// ───────────────────────── 天空：渐变 + 淡淡的写意流云 ─────────────────────────
{
  const mat = shaderMat(/* glsl */ `
    varying vec3 vWorld;
    void main(){
      vec3 dir = normalize(vWorld - cameraPosition);
      vec3 c = skyColor(dir);
      float up = max(dir.y, 0.0);
      vec2 p = dir.xz / (up + 0.12);
      float cl = fbm(vec3(p * 0.9 + vec2(uTime * 0.004, 0.0), 1.7));
      float cl2 = fbm(vec3(p * 2.3, 4.2));
      float cloud = smoothstep(0.52, 0.82, cl * 0.75 + cl2 * 0.35) * smoothstep(0.03, 0.25, up) * (1.0 - smoothstep(0.55, 0.95, up));
      vec3 cloudCol = mix(vec3(0.88, 0.92, 0.98), vec3(1.0), smoothstep(0.45, 0.8, cl2));
      c = mix(c, cloudCol, cloud * 0.75);
      // 地平线以下：与雾色一致，让水天交界消失
      c = mix(c, mix(uMist, uSkyHorizon, 0.5), smoothstep(0.0, -0.08, dir.y));
      gl_FragColor = vec4(c, 1.0);
    }`, {}, {
    side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vWorld; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vWorld = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 48, 24), mat);
  sky.renderOrder = -1;
  sky.onBeforeRender = (r, s, cam) => sky.position.copy(cam.position);
  scene.add(sky);
}

// ───────────────────────── 山峰（喀斯特尖峰 / 平顶台峰） ─────────────────────────
const PEAK_FRAG = /* glsl */ `
uniform vec3 uTop, uMid, uLight, uMoss; uniform float uBaseFade;
varying vec3 vWorld; varying vec3 vNormal; varying float vH;
void main(){
  vec3 n = normalize(vNormal);
  float d = dot(n, uLightDir) * 0.5 + 0.5;
  float streak = fbm(vec3(vWorld.x * 0.09, vWorld.y * 0.012, vWorld.z * 0.09));  // 大块竖向皴擦
  float fine = noise(vec3(vWorld.x * 0.45, vWorld.y * 0.035, vWorld.z * 0.45));
  float hair = noise(vec3(vWorld.x * 1.6, vWorld.y * 0.05, vWorld.z * 1.6));      // 细密披麻皴
  // 上深下浅：山顶黛蓝 → 山腰淡蓝 → 山脚留白
  float h = vH + (streak - 0.5) * 0.6;
  vec3 base = mix(uMid, uTop, smoothstep(0.25, 0.9, h));
  base = mix(base, uMoss, smoothstep(0.55, 0.9, n.y + (fine - 0.5) * 0.5) * 0.55);   // 青绿苔点
  // 受光面提亮成白色笔触（图1的白色皴线）
  float lit = smoothstep(0.35, 0.9, d + (fine - 0.5) * 0.5);
  float strokes = smoothstep(0.55, 0.8, hair * 0.6 + fine * 0.5) * lit;
  vec3 col = mix(base * 0.82, base, lit);
  col = mix(col, uLight, strokes * 0.55 * smoothstep(0.1, 0.6, vH));
  col = mix(col, base * 0.7, smoothstep(0.62, 0.8, 1.0 - hair) * (1.0 - lit) * 0.5); // 背光处的深色皴
  vec3 V = normalize(cameraPosition - vWorld);
  float rim = 1.0 - abs(dot(n, V));
  col = mix(col, uTop * 0.7, smoothstep(0.78, 1.0, rim) * 0.35);                      // 轮廓微微压墨
  col = mix(col, uMist, (1.0 - smoothstep(0.0, uBaseFade, vH + (streak - 0.5) * 0.2)) * 0.92); // 山脚没入云雾
  gl_FragColor = vec4(atmos(applyShadow(col, vWorld), vWorld), 1.0);
}`;
const peakUniforms = {
  uTop: { value: C('#24508f') }, uMid: { value: C('#86abd6') },
  uLight: { value: C('#f4f8fc') }, uMoss: { value: C('#4f9a92') }, uBaseFade: { value: 0.38 },
};
const peakMat = shaderMat(PEAK_FRAG, peakUniforms);
const rockUniforms = {
  uTop: { value: C('#335f96') }, uMid: { value: C('#9bbcdc') },
  uLight: { value: C('#f2f6fa') }, uMoss: { value: C('#4f9a8a') }, uBaseFade: { value: 0.3 },
};
const rockMat = shaderMat(PEAK_FRAG, rockUniforms);

function makePeak({ H, R, seed, lean = 0, mesa = false }) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 80, 64, false);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position;
  const aH = new Float32Array(pos.count);
  const sink = 8;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), t = pos.getY(i), z = pos.getZ(i);
    const rr = Math.min(1, Math.hypot(x, z));
    const th = Math.atan2(z, x), cx = Math.cos(th), cz = Math.sin(th);
    let prof = mesa
      ? 0.5 * (1 - 0.5 * Math.pow(t, 1.6))
      : 0.5 * Math.pow(Math.max(0, 1 - Math.pow(t, 1.7)), 0.75) + 0.02;
    const n = fbm3(cx * 1.1 + seed, t * 1.8, cz * 1.1 + seed * 0.7);
    const ridge = Math.abs(noise3(cx * 6 + seed, t * 0.9, cz * 6) * 2 - 1);
    const ridge2 = Math.abs(noise3(cx * 14 + seed, t * 1.6, cz * 14) * 2 - 1);
    const strata = mesa ? 0 : 0.035 * Math.sin(t * 18 + n * 6);
    prof *= 0.72 + 0.6 * n - 0.26 * ridge - 0.08 * ridge2 + strata;
    if (mesa && t > 0.92) prof *= 1 - (t - 0.92) * 1.5;
    const wx = (noise3(seed + 10.3, t * 1.4, 0.5) - 0.5) * 0.45 * t + lean * t * t;
    const wz = (noise3(0.5, t * 1.4, seed + 20.7) - 0.5) * 0.45 * t;
    pos.setXYZ(i, (cx * prof * rr + wx) * 2 * R, t * (H + sink) - sink, (cz * prof * rr + wz) * 2 * R);
    aH[i] = t;
  }
  g.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const m = mergeVertices(g);
  m.computeVertexNormals();
  return new THREE.Mesh(m, peakMat);
}

const peaks = [];
const RESERVED = [[0, 0, 48], [-25, -265, 40], [100, -110, 30]];
function addPeakCluster(cx, cz, H, R, count, seedBase) {
  for (let i = 0; i < count; i++) {
    const h = H * (i === 0 ? 1 : rand(0.45, 0.8));
    const r = R * (i === 0 ? 1 : rand(0.6, 0.9));
    const a = rand(0, Math.PI * 2), d = i === 0 ? 0 : R * rand(1.0, 1.8);
    const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d;
    // 给楼阁、初始岛、飞行视线留出空地
    if (RESERVED.some(([x, z, rr]) => Math.hypot(px - x, pz - z) < rr + r)) continue;
    const p = makePeak({ H: h, R: r, seed: seedBase + i * 3.7, lean: rand(-0.12, 0.12) });
    p.position.set(px, 0, pz);
    p.rotation.y = rand(0, Math.PI * 2);
    scene.add(p); peaks.push({ mesh: p, H: h });
  }
}
// 手工布景：主峰压在小岛背后（图1），左侧一组近峰，中间留缝看远处云中塔，右后方中景群峰，最远一圈淡山
const CLUSTERS = [
  // x, z, H, R, 个数
  [48, -135, 135, 24, 3],    // 主峰：屋后的大青峰
  [-90, -70, 85, 16, 3],     // 左侧近峰
  [-120, -120, 120, 22, 2],  // 左中
  [92, -14, 60, 13, 2],      // 右侧近峰，压住画面右缘
  [150, -150, 170, 30, 3],   // 右后中景
  [70, -250, 190, 34, 2],
  [-170, -300, 210, 36, 3],
  [-160, 110, 90, 18, 2],    // 身后几组，转身也有景
  [120, 150, 110, 22, 2],
  [-30, 230, 140, 26, 2],
  [-420, -520, 330, 70, 3],  // 最远一圈淡山
  [260, -620, 360, 80, 3],
  [-40, -720, 300, 70, 2],
  [620, -260, 330, 75, 3],
  [-640, -60, 300, 70, 3],
  [-300, 520, 300, 70, 2],
  [420, 480, 320, 70, 2],
];
CLUSTERS.forEach(([x, z, H, R, k], i) => { const f = Math.hypot(x, z) < 330 ? 0.72 : 1; addPeakCluster(x, z, H * f, R * (0.85 + 0.15 * f), k, (i + 1) * 11.3); });

// ───────────────────────── 初始岛 ─────────────────────────
let GROUND_MAT = null;
let distToPathFn = null;   // 小石散布时用（定义在后面）
function islandHeight(x, z) {
  const a = Math.atan2(z, x);
  const R = 27 * (0.8 + 0.4 * fbm3(Math.cos(a) * 1.2 + 3, Math.sin(a) * 1.2, 0.3));
  const r = Math.hypot(x / 1.25, z / 0.8) / R;
  let h = (1 - smooth(0.55, 1.05, r)) * 3.4 - 1.0;
  // 屋后小山：拉长、带起伏的山脊，而不是一个圆馒头
  const hx = x + 8, hz = z + 17;
  const ridge = Math.exp(-((hx * 0.8 + hz * 0.6) ** 2 / 170 + (hz * 0.8 - hx * 0.6) ** 2 / 55));
  h += 7.2 * ridge * (0.75 + 0.5 * fbm3(x * 0.09 + 2, 1.3, z * 0.09));
  h += 2.2 * Math.exp(-((x + 21) ** 2 + (z + 4) ** 2) / 40);            // 西侧小土坡
  const inner = 1 - smooth(0.75, 1.05, r);
  h += (fbm3(x * 0.06, 0.5, z * 0.06) - 0.5) * 1.2 * inner;
  h += (fbm3(x * 0.15 + 11, 2.1, z * 0.15) - 0.5) * 1.1 * inner;        // 中尺度起伏
  const flat = Math.exp(-((x - 5) ** 2 + (z + 3) ** 2) / 50);         // 屋基平台
  h = h * (1 - flat) + 2.5 * flat;
  return h;
}
{
  const g = new THREE.PlaneGeometry(150, 150, 180, 180);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, islandHeight(pos.getX(i), pos.getZ(i)));
  g.computeVertexNormals();
  const mat = shaderMat(/* glsl */ `
    uniform vec3 uGrass1, uGrass2, uRock, uSand, uPath, uPathGap;
    uniform sampler2D uShoreMap; uniform float uShoreSize;
    varying vec3 vWorld; varying vec3 vNormal;
    void main(){
      vec3 n = normalize(vNormal); float slope = 1.0 - n.y;
      float p = fbm(vWorld * 0.09); float p2 = noise(vWorld * 0.8);
      vec3 grass = mix(uGrass1, uGrass2, smoothstep(0.35, 0.68, p));
      vec3 col = mix(grass, uRock, smoothstep(0.22, 0.45, slope + (p2 - 0.5) * 0.2));
      col = mix(uSand, col, smoothstep(0.0, 1.0, vWorld.y + (p - 0.5) * 1.4));
      float d = dot(n, uLightDir) * 0.5 + 0.5;
      float strokes = noise(vec3(vWorld.x * 1.8, vWorld.y, vWorld.z * 0.35));
      float patches = smoothstep(0.55, 0.75, fbm(vWorld * 0.05 + 3.0));
      col = mix(col, col * vec3(0.86, 0.95, 0.9), patches * 0.6);           // 深浅不一的草色
      // 水彩大晕染：两种色调的色块，交界处颜料积成一道淡淡的湿边
      float wsh = fbm(vWorld * 0.045 + 9.0);
      col = mix(col, col * vec3(0.93, 1.02, 0.97), smoothstep(0.5, 0.53, wsh) * 0.6);
      col *= 1.0 - (1.0 - smoothstep(0.0, 0.02, abs(wsh - 0.515))) * 0.07;
      // 受光与背光分成几层淡彩，边缘带一点笔触抖动
      float tone = d + (noise(vWorld * vec3(0.5, 0.2, 0.5)) - 0.5) * 0.18;
      float layered = mix(tone, floor(clamp(tone, 0.0, 0.999) * 4.0) / 3.0, 0.35);
      col *= mix(0.8, 1.06, layered) * (0.93 + 0.1 * p2 + 0.06 * strokes);
      // 石板小路：沿路的方形石块，石缝露出草
      float path = texture2D(uShoreMap, vWorld.xz / uShoreSize + 0.5).g;
      if (path > 0.01) {
        vec2 pp = vWorld.xz * 0.95 + vec2(noise(vWorld * 0.6) * 0.35);
        vec2 ip = floor(pp), fp = fract(pp);
        float d1 = 8.0, d2 = 8.0; vec2 idc = ip;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 o = vec2(hash(vec3(ip + g, 1.0)), hash(vec3(ip + g, 2.0))) * 0.85 + 0.075;
          vec2 r = g + o - fp; float dd = dot(r, r);
          if (dd < d1) { d2 = d1; d1 = dd; idc = ip + g; } else if (dd < d2) { d2 = dd; }
        }
        float slab = smoothstep(0.05, 0.14, sqrt(d2) - sqrt(d1));
        float tone = 0.88 + 0.16 * hash(vec3(idc, 3.0));
        vec3 stone = uPath * tone;
        float eD = sqrt(d2) - sqrt(d1);
        stone *= mix(0.86, 1.0, smoothstep(0.08, 0.38, eD));                         // 石块边缘略暗，像有厚度
        stone = mix(stone, uPathGap * 0.95, smoothstep(0.74, 0.8, noise(vWorld * 4.5)) * 0.25);   // 苔点
        float onPath = smoothstep(0.15, 0.45, path + (noise(vWorld * 1.3) - 0.5) * 0.25);
        col = mix(col, mix(uPathGap, stone, slab), onPath);
      }
      gl_FragColor = vec4(atmos(applyShadow(col, vWorld), vWorld), 1.0);
    }`, {
    uGrass1: { value: C('#b3d698') }, uGrass2: { value: C('#86c2ae') },
    uRock: { value: C('#8ea6bd') }, uSand: { value: C('#ebe7da') },
    uPath: { value: C('#ddd5c2') }, uPathGap: { value: C('#94ad8d') },
    uShoreMap: { value: null }, uShoreSize: { value: 170 },
  });
  GROUND_MAT = mat;
  scene.add(new THREE.Mesh(g, mat));
}
// 沿某个方向找到岸线
function shoreAt(angle) {
  for (let d = 5; d < 60; d += 0.25) {
    const x = Math.cos(angle) * d, z = Math.sin(angle) * d;
    if (islandHeight(x, z) < 0) return { x, z, d };
  }
  return { x: Math.cos(angle) * 30, z: Math.sin(angle) * 30, d: 30 };
}

// ───────────────────────── 岩石（图1那种青蓝石） ─────────────────────────
const ROCKS = [];
function makeRock(size, seed, squash = 0.7) {
  const g = new THREE.IcosahedronGeometry(1, 5);
  const pos = g.attributes.position;
  let minY = Infinity, maxY = -Infinity;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm3(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4);
    const ridge = Math.abs(noise3(v.x * 3 + seed, v.y * 0.8, v.z * 3) * 2 - 1);
    v.multiplyScalar(0.65 + n * 0.75 - ridge * 0.12);
    v.y *= squash; if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.3;
    v.multiplyScalar(size);
    pos.setXYZ(i, v.x, v.y, v.z);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  const aH = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) aH[i] = (pos.getY(i) - minY) / (maxY - minY);
  g.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const m = mergeVertices(g); m.computeVertexNormals();
  const mesh = new THREE.Mesh(m, rockMat);
  mesh.userData.rock = { size, squash };
  ROCKS.push(mesh);
  return mesh;
}
for (let i = 0; i < 14; i++) {
  const a = [2.3, 2.5, 2.7, 3.9, 4.1, 4.3, 4.45, 1.2, 1.35, 5.6, 5.8, 0.6, 3.1, 1.6][i];
  if (Math.abs(a - 0) < 0.25 || Math.abs(a - Math.PI * 0.82) < 0.22) continue; // 桥和栈桥的位置空出来
  const s = shoreAt(a);
  const r = makeRock(rand(1.6, 4.8), i * 5.1, rand(0.7, 1.25));
  r.position.set(s.x * 1.02, rand(-0.4, 0.4), s.z * 1.02);
  r.rotation.y = rand(0, 6.28);
  scene.add(r);
}

// ───────────────────────── 写意树：枝干 + 点染叶团 ─────────────────────────
const dabUniforms = { uScale: { value: 1 } };
const dabMat = new THREE.ShaderMaterial({
  uniforms: { ...U, ...dabUniforms },
  vertexShader: /* glsl */ `
    attribute float aSize; attribute vec3 aColor; attribute float aSeed;
    uniform float uScale; uniform float uTime;
    varying vec3 vCol; varying vec3 vWorld; varying float vSeed;
    void main(){
      vec3 p = position;
      p.x += sin(uTime * 0.9 + aSeed * 6.0) * 0.04 * aSize;
      vec4 wp = modelMatrix * vec4(p, 1.0); vWorld = wp.xyz;
      vec4 mv = viewMatrix * wp;
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
      vCol = aColor; vSeed = aSeed;
    }`,
  alphaToCoverage: true,
  fragmentShader: COMMON + /* glsl */ `
    varying vec3 vCol; varying vec3 vWorld; varying float vSeed;
    void main(){
      vec2 c = gl_PointCoord - 0.5;
      float ang = atan(c.y, c.x);
      float edge = 0.5 - 0.16 * noise(vec3(cos(ang) * 2.5, sin(ang) * 2.5, vSeed * 13.0)) - 0.06 * noise(vec3(gl_PointCoord * 9.0, vSeed));
      float r = length(c * vec2(1.0, 1.3));
      float aa = fwidth(r) * 1.2;
      float alpha = 1.0 - smoothstep(edge - aa, edge + aa, r);
      if (alpha < 0.01) discard;
      vec3 col = vCol * mix(1.07, 0.86, gl_PointCoord.y);
      col = mix(col, col * 0.9, smoothstep(edge - 0.08, edge, r));   // 水彩边缘积色
      gl_FragColor = vec4(atmos(col, vWorld), alpha);
    }`,
});

function dabCloud(points) {
  const n = points.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), seed = new Float32Array(n);
  points.forEach((p, i) => {
    pos.set([p.x, p.y, p.z], i * 3); col.set([p.c.r, p.c.g, p.c.b], i * 3);
    size[i] = p.s; seed[i] = rng();
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return new THREE.Points(g, dabMat);
}

function branch(group, from, to, radius, color) {
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(rand(-0.4, 0.4), rand(0, 0.3), rand(-0.4, 0.4)).multiplyScalar(from.distanceTo(to) * 0.5));
  const curve = new THREE.CatmullRomCurve3([from, mid, to]);
  const geo = new THREE.TubeGeometry(curve, 10, radius, 6, false);
  group.add(new THREE.Mesh(geo, flatMat(color, 0.35, 0.2)));
}

const PALETTES = {
  peach: ['#f78fb0', '#fbb6cb', '#f06f98', '#ffe1ea', '#f9a0bd'],
  green: ['#9fd86e', '#bfe67f', '#7cc56c', '#d8ef9a'],
  teal: ['#5aaea4', '#7fc6b8', '#4a9799', '#a2d6c6'],
  maple: ['#e8766d', '#f0968b', '#d9605c', '#f4b3a6'],
  pine: ['#4f7f78', '#5f9087', '#3f6d6b'],
  bamboo: ['#86b56c', '#a3c97f', '#6b9e5a', '#bcd68d'],
};

const TREES = [], BAMBOOS = [];
function paintedTree({ x, z, y = null, height = 6, lean = [0, 0], palette = 'green', clumps = 5, dabs = 70,
  dabSize = [0.9, 1.5], spread = 2.6, flat = 0.55, trunk = '#3d322e', trunkR = 0.16, clumpR = null, anchor = null, peak = null }) {
  const group = new THREE.Group();
  const baseY = y ?? islandHeight(x, z);
  group.position.set(x, baseY - 0.2, z);
  const top = new THREE.Vector3(lean[0] * height, height * 0.78, lean[1] * height);
  branch(group, new THREE.Vector3(0, 0, 0), top, trunkR * height / 6, trunk);
  const pts = [];
  const pal = PALETTES[palette].map(C);
  for (let k = 0; k < clumps; k++) {
    const a = rand(0, 6.28), d = k === 0 ? 0 : rand(0.4, 1) * spread;
    const center = top.clone().add(new THREE.Vector3(Math.cos(a) * d, rand(-0.25, 0.35) * height * 0.4, Math.sin(a) * d));
    if (k > 0) {
      const from = top.clone().lerp(new THREE.Vector3(0, 0, 0), rand(0, 0.35));
      branch(group, from, center, trunkR * height / 6 * 0.45, trunk);
    }
    const cr = (clumpR ?? spread * 0.55) * rand(0.8, 1.25);
    for (let j = 0; j < dabs; j++) {
      const u = rng() * 6.28, v = Math.acos(2 * rng() - 1), r = Math.pow(rng(), 0.6) * cr;
      const px = center.x + r * Math.sin(v) * Math.cos(u);
      const py = center.y + r * Math.cos(v) * flat;
      const pz = center.z + r * Math.sin(v) * Math.sin(u);
      const c = pal[Math.floor(rng() * pal.length)].clone();
      if (py < center.y) c.multiplyScalar(0.88);
      c.offsetHSL(rand(-0.01, 0.01), 0, rand(-0.03, 0.03));
      pts.push({ x: px, y: py, z: pz, c, s: rand(dabSize[0], dabSize[1]) });
    }
  }
  group.add(dabCloud(pts));
  scene.add(group);
  // y 是手估的（岛石、山顶）→ 等石头/山峰精模换上后由 settleTrees() 按真实表面落地
  TREES.push({ group, palette, height, settle: y !== null, anchor: anchor ?? [x, z], peak });
  return group;
}

function bamboo(x, z, count = 10) {
  const group = new THREE.Group();
  const pts = [];
  const pal = PALETTES.bamboo.map(C);
  for (let i = 0; i < count; i++) {
    const bx = x + rand(-2.2, 2.2), bz = z + rand(-2.2, 2.2), by = islandHeight(bx, bz) - 0.2;
    const h = rand(7, 11);
    const bend = new THREE.Vector3(rand(-1.2, 1.2), 0, rand(-1.2, 1.2));
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(bx, by, bz),
      new THREE.Vector3(bx + bend.x * 0.2, by + h * 0.5, bz + bend.z * 0.2),
      new THREE.Vector3(bx + bend.x, by + h, bz + bend.z),
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.07, 5, false), flatMat('#6f9b58', 0.25, 0.1)));
    for (let s = 0; s < 5; s++) {
      const t = rand(0.45, 1);
      const c0 = curve.getPoint(t);
      const dir = new THREE.Vector3(rand(-1, 1), rand(-0.6, 0.1), rand(-1, 1)).normalize();
      for (let j = 0; j < 9; j++) {
        const l = rand(0.2, 1.6);
        pts.push({
          x: c0.x + dir.x * l + rand(-0.2, 0.2), y: c0.y + dir.y * l + rand(-0.15, 0.15), z: c0.z + dir.z * l + rand(-0.2, 0.2),
          c: pal[Math.floor(rng() * pal.length)].clone(), s: rand(0.35, 0.65),
        });
      }
    }
  }
  group.add(dabCloud(pts));
  scene.add(group);
  BAMBOOS.push({ group, x, z });
  return group;
}

// ───────────────────────── 中式屋顶（凹曲面 + 翼角起翘） ─────────────────────────
function makeRoof(w, d, h, { lift = 0.5, ridge = 0 } = {}) {
  const N = 14, M = 128;
  const verts = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;                    // 0 檐口 → 1 屋脊
    const r = 1 - t;
    const y = h * Math.pow(t, 1.7);
    for (let j = 0; j <= M; j++) {
      const th = (j / M) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      const k = 1 / Math.max(Math.abs(c), Math.abs(s));
      const corner = Math.pow(Math.abs(Math.sin(2 * th)), 8);
      const up = lift * corner * Math.pow(1 - t, 2.5);
      const out = 1 + 0.06 * corner * (1 - t);
      const px = c * k * (r * (w / 2 - ridge) + ridge) * out;
      const pz = s * k * r * (d / 2) * out;
      verts.push(px, y + up, pz);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * (M + 1) + j, b = a + M + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, flatMat('#4a5568', 0.35, 0.1, THREE.DoubleSide));
}

function box(w, h, d, hex, shade = 0.22) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flatMat(hex, shade, 0.08));
  return m;
}

// 民居（白墙黛瓦）
function house(x, z, rot = 0) {
  const g = new THREE.Group();
  const y = islandHeight(x, z);
  g.position.set(x, y, z); g.rotation.y = rot;
  const base = box(9, 0.6, 6.4, '#d9d6cc'); base.position.y = 0.1; g.add(base);
  const wall = box(7.6, 3.0, 5, '#f4f1ea', 0.15); wall.position.y = 1.9; g.add(wall);
  const door = box(1.4, 2.0, 0.1, '#7a4a35'); door.position.set(0, 1.4, 2.53); g.add(door);
  for (const wx of [-2.4, 2.4]) { const win = box(1.1, 0.9, 0.1, '#6b4f3f'); win.position.set(wx, 2.2, 2.53); g.add(win); }
  for (const px of [-3.8, 3.8]) for (const pz of [-2.5, 2.5]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.2, 8), flatMat('#6b3b30', 0.3, 0.1));
    p.position.set(px, 1.9, pz); g.add(p);
  }
  const roof = makeRoof(10.4, 7.6, 2.6, { lift: 0.55, ridge: 2.2 }); roof.position.y = 3.35; g.add(roof);
  const side = new THREE.Group();
  const w2 = box(4.6, 2.4, 4, '#f4f1ea', 0.15); w2.position.y = 1.5; side.add(w2);
  const r2 = makeRoof(6.2, 5.6, 1.8, { lift: 0.4, ridge: 1 }); r2.position.y = 2.65; side.add(r2);
  side.position.set(-6.4, -0.1, -1.2); g.add(side);
  scene.add(g);
  return g;
}

// 亭 / 楼阁 / 塔
function pavilion({ tiers = 1, w = 5, tierH = 3, open = true, shrink = 0.8, color = '#7a3a2f' }) {
  const g = new THREE.Group();
  const base = box(w * 1.25, 0.6, w * 1.25, '#dcd8ce'); base.position.y = 0.3; g.add(base);
  let y = 0.6, cw = w;
  for (let t = 0; t < tiers; t++) {
    const half = cw / 2 - 0.3;
    for (const px of [-half, half]) for (const pz of [-half, half]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * cw / 5, 0.13 * cw / 5, tierH, 8), flatMat(color, 0.3, 0.1));
      p.position.set(px, y + tierH / 2, pz); g.add(p);
    }
    if (!open || t > 0) { const wl = box(cw * 0.86, tierH * 0.9, cw * 0.86, '#f1ede4', 0.18); wl.position.y = y + tierH * 0.45; g.add(wl); }
    const rail = box(cw * 1.02, 0.12, cw * 1.02, color); rail.position.y = y + 0.7; if (t > 0) g.add(rail);
    const roof = makeRoof(cw * 1.55, cw * 1.55, cw * 0.32, { lift: cw * 0.11 });
    roof.position.y = y + tierH; g.add(roof);
    y += tierH + cw * 0.12; cw *= shrink;
  }
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.25 * w / 5, 1.6 * w / 5, 8), flatMat('#c9a24a', 0.3, 0.05));
  fin.position.y = y + w * 0.2; g.add(fin);
  scene.add(g);
  return g;
}

// 拱桥
function archBridge(len = 20, width = 3.2) {
  const top = (x) => 2.2 + 1.5 * Math.cos((Math.PI * x) / len);
  const s = new THREE.Shape();
  s.moveTo(-len / 2, -1.6);
  for (let i = 0; i <= 24; i++) { const x = -len / 2 + (len * i) / 24; s.lineTo(x, top(x)); }
  s.lineTo(len / 2, -1.6); s.lineTo(-len / 2, -1.6);
  const hole = new THREE.Path();
  hole.absarc(0, -1.3, 3.1, 0, Math.PI, false); hole.lineTo(3.1, -1.3);
  s.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, curveSegments: 24 });
  geo.translate(0, 0, -width / 2);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, flatMat('#e4e0d6', 0.25, 0.14)));
  // 栏杆
  for (const zz of [-width / 2 + 0.08, width / 2 - 0.08]) {
    for (let i = 0; i <= 16; i++) {
      const x = -len / 2 + 1 + ((len - 2) * i) / 16;
      const post = box(0.16, 0.8, 0.16, '#d4d0c4'); post.position.set(x, top(x) + 0.4, zz); g.add(post);
    }
    const pts = []; for (let i = 0; i <= 20; i++) { const x = -len / 2 + 1 + ((len - 2) * i) / 20; pts.push(new THREE.Vector3(x, top(x) + 0.8, zz)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.07, 5), flatMat('#d4d0c4', 0.25, 0.1)));
  }
  scene.add(g);
  return g;
}

// 栈桥
function pier(angle, len = 12) {
  const s = shoreAt(angle);
  const g = new THREE.Group();
  const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  g.position.set(s.x - dir.x * 2.5, 0, s.z - dir.z * 2.5);
  g.rotation.y = -angle;
  for (let i = 0; i < len / 0.5; i++) {
    const plank = box(0.42, 0.12, 2.2, '#9c7b5c', 0.3); plank.position.set(i * 0.5, 0.9, 0); g.add(plank);
  }
  for (let i = 0; i <= len; i += 2) for (const zz of [-1, 1]) {
    const p = box(0.18, 2.2, 0.18, '#6f553f', 0.3); p.position.set(i, 0, zz); g.add(p);
  }
  scene.add(g);
  return g;
}

// 船 + 渔夫
function boat(color = '#9c4632') {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), flatMat(color, 0.3, 0.1, THREE.DoubleSide));
  hull.scale.set(3.4, 0.75, 0.95); g.add(hull);
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.7, 16, 1, true, 0, Math.PI), flatMat('#5b4a3c', 0.3, 0.15, THREE.DoubleSide));
  canopy.rotation.z = Math.PI / 2; canopy.rotation.y = Math.PI / 2; canopy.rotation.x = Math.PI / 2; canopy.position.set(0.3, 0.05, 0);
  canopy.rotation.set(0, 0, Math.PI / 2); canopy.position.y = 0.1;
  g.add(canopy);
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 10), flatMat('#3f6491', 0.25, 0.1)); body.position.set(-2.0, 0.55, 0); g.add(body);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.35, 16), flatMat('#d6b660', 0.25, 0.1)); hat.position.set(-2.0, 1.25, 0); g.add(hat);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.5, 5), flatMat('#5b4a3c', 0.3, 0.1));
  pole.position.set(-2.6, 1.2, 0.5); pole.rotation.z = 1.0; g.add(pole);
  scene.add(g);
  return g;
}

// ───────────────────────── 摆放：初始岛 ─────────────────────────
const LOW = [], HIGH = [];
const SAILS = [];   // 代码简模 / Blender 精模，可在面板里切换对比
LOW.push(house(5, -3, 0.25));
bamboo(12, -11, 12);
bamboo(-2, -14, 8);
LOW.push(paintedTree({ x: -15, z: 9, height: 7.5, lean: [-0.4, 0.15], palette: 'peach', clumps: 16, dabs: 38, dabSize: [0.42, 0.8], spread: 4.2, flat: 0.45, clumpR: 0.95, trunk: '#3a2a2a', trunkR: 0.2 }));
LOW.push(paintedTree({ x: -3, z: 6, height: 5.5, lean: [0.1, 0.1], palette: 'peach', clumps: 10, dabs: 34, dabSize: [0.4, 0.75], spread: 3, flat: 0.45, clumpR: 0.8, trunk: '#3a2a2a' }));
paintedTree({ x: -9, z: -17, height: 9, palette: 'green', clumps: 9, dabs: 55, flat: 0.38, clumpR: 1.3, spread: 3.2 });
paintedTree({ x: -15, z: -9, height: 7, palette: 'teal', clumps: 8, dabs: 50, flat: 0.38, clumpR: 1.2, spread: 3 });
paintedTree({ x: 1, z: -18, height: 8, palette: 'teal', clumps: 8, dabs: 50, flat: 0.38, clumpR: 1.2, spread: 3 });
paintedTree({ x: 15, z: 8, height: 6, palette: 'maple', clumps: 9, dabs: 40, lean: [0.25, 0.1], flat: 0.4, clumpR: 1.0, spread: 3 });
paintedTree({ x: -20, z: -2, height: 6, palette: 'green', clumps: 7, dabs: 45, flat: 0.38, clumpR: 1.1, spread: 2.6 });
const peachRock = makeRock(4.2, 77, 0.8);
{ const s = shoreAt(2.98); peachRock.position.set(s.x, -0.3, s.z); scene.add(peachRock); }   // 让开栈桥

// 桥 → 小岛上的亭
const eastShore = shoreAt(0);
const br = archBridge(20, 3.2);
const WILLOWS = [[eastShore.x - 3, 7, 0.5], [eastShore.x - 5, -6, 2.2], [-19, 3, 1.3]];
br.position.set(eastShore.x + 5, 0, 0);
const islet = makeRock(7, 31, 0.42);
islet.position.set(eastShore.x + 20, -0.5, 0.5); scene.add(islet);
const ting = pavilion({ tiers: 1, w: 4.6, tierH: 2.8, open: true });
ting.position.set(eastShore.x + 20, 2.0, 0.5);
paintedTree({ x: eastShore.x + 23, z: -3.5, y: 1.8, height: 6, palette: 'green', clumps: 4, dabs: 60 });

const pierG = pier(Math.PI * 0.82, 12);
const myBoat = boat();
const boat2 = boat('#a8452f'); boat2.scale.setScalar(0.9);

// 荷叶
{
  const geo = new THREE.CircleGeometry(1, 20, 0.2, Math.PI * 2 - 0.4); geo.rotateX(-Math.PI / 2);
  const inst = new THREE.InstancedMesh(geo, flatMat('#86b678', 0.2, 0.25, THREE.DoubleSide), 34);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let k = 0;
  for (let tries = 0; tries < 2000 && k < 34; tries++) {
    const x = rand(26, 50), z = rand(7, 26);
    if (islandHeight(x, z) > -0.4) continue;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6.28));
    s.setScalar(rand(0.4, 0.85)); p.set(x, 0.06, z);
    m.compose(p, q, s); inst.setMatrixAt(k, m);
    inst.setColorAt(k, C('#ffffff').multiplyScalar(rand(0.88, 1.1)));
    k++;
  }
  inst.count = k;
  scene.add(inst);
  // 几朵荷花
  const pts = [];
  for (let i = 0; i < 14; i++) {
    const x = rand(28, 48), z = rand(9, 24);
    if (islandHeight(x, z) > -0.4) continue;
    for (let j = 0; j < 4; j++) pts.push({ x: x + rand(-0.15, 0.15), y: 0.45 + rand(0, 0.2), z: z + rand(-0.15, 0.15), c: C(j % 2 ? '#f5b8c6' : '#fbe1e7'), s: 0.35 });
  }
  scene.add(dabCloud(pts));
}

// ───────────────────────── 近处小岛 + 云中楼阁 ─────────────────────────
const ISLETS = [[-62, -28, 6, 'teal'], [52, -58, 7, 'green'], [-34, -86, 8, 'maple'], [70, 30, 5, 'green']];
{
  const pals = ['green', 'teal', 'maple', 'pine', 'green', 'teal'];
  for (let t = 0, n = 0; t < 400 && n < 16; t++) {
    const a = rand(0, 6.28), d = rand(95, 420), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (peaks.some(({ mesh, H }) => Math.hypot(mesh.position.x - x, mesh.position.z - z) < H * 0.32 + 14)) continue;
    if (ISLETS.some(([ix, iz]) => Math.hypot(ix - x, iz - z) < 40)) continue;
    if (Math.hypot(x + 25, z + 265) < 70 || Math.hypot(x - 100, z + 110) < 55) continue;   // 云中塔、山顶楼阁
    ISLETS.push([x, z, rand(4, 9), pals[n % pals.length]]); n++;
  }
}
for (const [x, z, s, pal] of ISLETS) {
  const r = makeRock(s, x * 0.1, 0.75); r.position.set(x, -0.6, z); scene.add(r);
  paintedTree({ x: x + 1, z, y: s * 0.55, height: s * 1.1, palette: pal, clumps: 4, dabs: 60, dabSize: [1, 1.7], anchor: [x, z] });
  paintedTree({ x: x - s * 0.5, z: z + s * 0.3, y: s * 0.35, height: s * 0.9, palette: 'teal', clumps: 3, dabs: 50, dabSize: [1, 1.7], anchor: [x, z] });
}
// 亭子把小岛那块石头整个占满了，岛边那棵树另给一块卧石托着（原先悬在水面上）。放在最后建，免得打乱前面石头的精模分配
const tingStone = makeRock(3, 63, 0.55); tingStone.position.set(eastShore.x + 23, -0.6, -3.5); scene.add(tingStone);
// ───────────────────────── 沙洲与荷塘（俯瞰时的点缀） ─────────────────────────
const SHOALS = [];
{
  const sandMat = shaderMat(/* glsl */ `
    uniform vec3 uSand, uWet; varying vec3 vWorld; varying vec3 vNormal;
    void main(){
      float n = fbm(vWorld * 0.12);
      vec3 col = mix(uWet, uSand, smoothstep(-0.05, 0.2, vWorld.y + (n - 0.5) * 0.12));
      col *= 0.95 + 0.08 * noise(vWorld * 1.5);
      gl_FragColor = vec4(atmos(applyShadow(col, vWorld), vWorld), 1.0);
    }`, { uSand: { value: C('#dcd2b2') }, uWet: { value: C('#a9cbbd') } });
  const lotusMat = flatMat('#86b678', 0.2, 0.25, THREE.DoubleSide);
  const leafGeo = new THREE.CircleGeometry(1, 18, 0.2, Math.PI * 2 - 0.4); leafGeo.rotateX(-Math.PI / 2);
  const leaves = new THREE.InstancedMesh(leafGeo, lotusMat, 900);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  let nl = 0;
  const flowers = [];
  for (let t = 0, n = 0; t < 600 && n < 14; t++) {
    const a = rand(0, 6.28), d = rand(70, 360), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (peaks.some(({ mesh, H }) => Math.hypot(mesh.position.x - x, mesh.position.z - z) < H * 0.32 + 18)) continue;
    if (ISLETS.some(([ix, iz]) => Math.hypot(ix - x, iz - z) < 22)) continue;
    if (SHOALS.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 45)) continue;
    n++;
    if (n % 2) {
      // 沙洲：长条、边缘起伏的低平沙地，略高出水面
      const L = rand(14, 30), Wd = rand(4, 8), g = new THREE.CircleGeometry(1, 40);
      g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i), pz = pos.getZ(i), r = Math.hypot(px, pz), th = Math.atan2(pz, px);
        const wob = 1 + 0.18 * Math.sin(th * 3 + a) + 0.1 * Math.sin(th * 7 + d);
        pos.setXYZ(i, px * L * wob, r < 0.01 ? 0.25 : -0.15, pz * Wd * wob);
      }
      g.computeVertexNormals();
      const sm = new THREE.Mesh(g, sandMat); sm.position.set(x, 0, z); sm.rotation.y = rand(0, 6.28); scene.add(sm);
      SHOALS.push([x, z, L]);
    } else {
      // 荷塘：一大片荷叶，间有荷花
      const R = rand(8, 16);
      for (let j = 0; j < 70 && nl < 900; j++) {
        const rr = R * Math.sqrt(rng()), th = rand(0, 6.28), px = x + Math.cos(th) * rr, pz = z + Math.sin(th) * rr * 0.7;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6.28)); sc.setScalar(rand(0.5, 1.1)); ps.set(px, 0.06, pz);
        m4.compose(ps, q, sc); leaves.setMatrixAt(nl, m4); leaves.setColorAt(nl, C('#ffffff').multiplyScalar(rand(0.85, 1.1))); nl++;
        if (rng() < 0.12) for (let f = 0; f < 4; f++) flowers.push({ x: px + rand(-0.15, 0.15), y: 0.5 + rand(0, 0.2), z: pz + rand(-0.15, 0.15), c: C(f % 2 ? '#f5b8c6' : '#fbe1e7'), s: 0.4 });
      }
      SHOALS.push([x, z, R]);
    }
  }
  leaves.count = nl; scene.add(leaves); scene.add(dabCloud(flowers));
}

// 平顶台峰 + 五层塔
const towerPeak = makePeak({ H: 48, R: 16, seed: 401, mesa: true });
peaks.push({ mesh: towerPeak, H: 48, mesa: 0 });
towerPeak.position.set(-25, 0, -265); scene.add(towerPeak);
const tower = pavilion({ tiers: 5, w: 6.5, tierH: 3.6, open: false, shrink: 0.84 });
tower.position.set(-25, 47.6, -265); tower.rotation.y = 0.4;
// 中景台峰上的楼阁
const hallPeak = makePeak({ H: 34, R: 18, seed: 517, mesa: true });
peaks.push({ mesh: hallPeak, H: 34, mesa: 1 });
hallPeak.position.set(100, 0, -110); scene.add(hallPeak);
const hall = pavilion({ tiers: 2, w: 9, tierH: 3.8, open: false, shrink: 0.75 });
hall.position.set(100, 33.6, -110); hall.rotation.y = -0.3; LOW.push(hall);
// 山顶几株松
for (const { mesh, H } of peaks.slice(0, 10)) {
  if (mesh.position.length() > 130) continue;
  paintedTree({ x: mesh.position.x, z: mesh.position.z, y: H - 2, height: H * 0.08, palette: 'pine', clumps: 3, dabs: 40, dabSize: [1.4, 2.4], flat: 0.35, spread: H * 0.05, peak: mesh });
}

// ───────────────────────── Blender 精模 ─────────────────────────
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
const gltfLoader = new GLTFLoader().setDRACOLoader(draco);
const STYLE = {   // 按材质名给明暗与笔触强度
  blossom: [0.16, 0.1, THREE.DoubleSide], leaf: [0.22, 0.12, THREE.DoubleSide], needle: [0.25, 0.12, THREE.DoubleSide],
  willow: [0.18, 0.1, THREE.DoubleSide], bamboo_leaf: [0.2, 0.1, THREE.DoubleSide], canopy: [0.3, 0.15, THREE.DoubleSide], bark: [0.35, 0.25],
  roof: [0.38, 0.08, THREE.DoubleSide], window_paper: [0.12, 0.05], stone: [0.22, 0.14], default: [0.26, 0.08],
};
const FOLIAGE_VERT = /* glsl */ `
uniform vec3 uCenter; uniform float uRadius; uniform float uTime;
varying vec3 vWorld; varying vec3 vN; varying float vH;
void main(){
  vec3 p = position;
  vec3 dir = p - uCenter;
  vH = clamp((p.y - (uCenter.y - uRadius)) / (2.0 * uRadius), 0.0, 1.0);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  float sway = sin(uTime * 1.3 + wp.x * 0.3 + wp.z * 0.2) * 0.6 + sin(uTime * 2.3 + wp.x * 0.8 - wp.z * 0.5) * 0.3;
  wp.xz += vec2(0.06, 0.04) * sway * smoothstep(0.15, 1.0, vH) * max(uRadius, 1.0) * 0.12;
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normalize(dir + vec3(0.0, uRadius * 0.3, 0.0)));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FOLIAGE_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec3 vWorld; varying vec3 vN; varying float vH;
void main(){
  float d = dot(normalize(vN), uLightDir) * 0.5 + 0.5;
  float pn = fbm(vWorld * 0.35);
  float lit = smoothstep(0.28, 0.85, d + (pn - 0.5) * 0.35);
  // 背光处偏冷偏深（花青），受光处偏暖提亮（藤黄），像一笔点染的深浅
  vec3 col = mix(uColor * vec3(0.7, 0.8, 0.88), uColor * vec3(1.08, 1.07, 0.98), lit);
  col = mix(col, col * 1.05 + 0.025, smoothstep(0.65, 1.0, vH) * 0.5);
  col *= 0.95 + 0.1 * noise(vWorld * 1.9);
  gl_FragColor = vec4(atmos(applyShadow(col, vWorld), vWorld), 1.0);
}`;
const FOLIAGE_KEYS = ['blossom', 'leaf', 'needle', 'willow_', 'bamboo_leaf'];
// 建筑调色：降饱和，红偏朱砂、屋顶偏黛青，与山水的青绿统一
const REMAP = {
  column_red: '#b0503f', lattice_wood: '#8f4d3c', roof_tile: '#4b5b70', roof_tile_ridge: '#5f7189', roof_ridge: '#37425a',
  interior_dark: '#6a4b3e', lantern_red: '#d8584a', paint_blue: '#4c78a3', paint_teal: '#4d9388', paint_gold: '#d3b26c', eave_board: '#8a4537', wood_hull: '#8a5038', wood_dark: '#6a4030',
};
function stylize(root) {
  // 先按父节点汇总树叶网格的包围盒 → 树冠中心与半径
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    if (!FOLIAGE_KEYS.some((k) => o.material.name.startsWith(k))) return;
    o.geometry.computeBoundingBox();
    const b = groups.get(o.parent) || new THREE.Box3();
    b.union(o.geometry.boundingBox); groups.set(o.parent, b);
  });
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || !groups.has(o.parent)) return;
    if (!FOLIAGE_KEYS.some((k) => o.material.name.startsWith(k))) return;
    const b = groups.get(o.parent), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    c.y = b.min.y + sz.y * 0.55;
    o.material = new THREE.ShaderMaterial({
      uniforms: { ...U, uColor: { value: o.material.color.clone() }, uCenter: { value: c }, uRadius: { value: Math.max(sz.x, sz.y, sz.z) * 0.5 } },
      vertexShader: FOLIAGE_VERT, fragmentShader: COMMON + FOLIAGE_FRAG, side: THREE.DoubleSide,
    });
    o.userData.foliage = true;
  });

  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.foliage) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((m) => {
      if (REMAP[m.name]) m.color.set(REMAP[m.name]);
      const key = Object.keys(STYLE).find((k) => m.name.startsWith(k)) || 'default';
      const [shade, nz, side] = STYLE[key];
      return flatMat('#' + m.color.getHexString(), shade, nz, side ?? THREE.FrontSide);
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  return root;
}
// 切块面山石：顶点色 R=凹陷(皴)  G=朝上(平台苔点)  B=相对高度
const VERT_VC = /* glsl */ `
varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor;
void main(){
  vColor = color.rgb;
  vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz;
  vNormal = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const CUN_FRAG = /* glsl */ `
uniform vec3 uTop, uMid, uLight, uMoss, uInk; uniform float uBaseFade, uCun;
varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor;
void main(){
  vec3 n = normalize(vNormal);
  float cav = vColor.r, up = vColor.g, h = vColor.b;
  float d = dot(n, uLightDir) * 0.5 + 0.5;
  float fine = noise(vWorld * vec3(0.35, 0.05, 0.35));
  float streak = fbm(vec3(vWorld.x * 0.07, vWorld.y * 0.012, vWorld.z * 0.07));
  float farB = smoothstep(130.0, 420.0, length(cameraPosition - vWorld));
  vec3 base = mix(uMid, uTop, smoothstep(0.25, 0.95, h + (streak - 0.5) * 0.35 * (1.0 - farB * 0.7)));
  // 块面两调：受光面提亮、背光面压深，交界带一点笔触抖动
  float lit = smoothstep(0.4, 0.62, d + (fine - 0.5) * 0.28);
  vec3 col = mix(base * 0.66, mix(base, uLight, 0.1), lit);
  // 凹处 = 皴笔：墨蓝，竖向拉丝
  float hairs = noise(vWorld * vec3(0.9, 0.03, 0.9));
  float far = smoothstep(130.0, 420.0, length(cameraPosition - vWorld));
  float cun = smoothstep(0.6, 0.85, cav + (hairs - 0.5) * 0.45) * (0.6 + 0.4 * fine) * (1.0 - far * 0.8);
  col = mix(col, uInk, cun * uCun);
  // 受光面上的白色飞白（图1）
  col = mix(col, uLight, smoothstep(0.72, 0.9, hairs) * lit * 0.35 * smoothstep(0.15, 0.6, h) * (1.0 - far * 0.85));
  // 远处：竖向拉丝换成横向的淡淡米点皴，读起来是山体不是蜡泪
  float mi = noise(vec3(vWorld.x * 0.12, vWorld.y * 0.35, vWorld.z * 0.12));
  col = mix(col, mix(col, uTop * 0.85, 0.35), smoothstep(0.62, 0.78, mi) * far * (1.0 - lit * 0.6));
  // 平台苔点 / 青绿
  float moss = smoothstep(0.3, 0.75, up) * smoothstep(0.3, 0.55, fine + 0.12);
  col = mix(col, uMoss, moss * 0.85);
  // 近看才出现的细节：分层淡彩、披麻皴、苔点
  float near = 1.0 - smoothstep(12.0, 80.0, length(cameraPosition - vWorld));
  float steep = 1.0 - smoothstep(0.35, 0.7, up);           // 皴笔只画在崖面上，平顶不画
  near *= steep;
  float tone = d + (noise(vWorld * vec3(0.7, 0.18, 0.7)) - 0.5) * 0.3;
  float wash = floor(clamp(tone, 0.0, 0.999) * 3.0) / 2.0;
  col *= mix(1.0, mix(0.9, 1.05, wash), near);
  float hemp = noise(vec3(vWorld.x * 2.4, vWorld.y * 0.11, vWorld.z * 2.4));
  float hempLine = smoothstep(0.6, 0.66, hemp) * (1.0 - smoothstep(0.68, 0.76, hemp));
  col = mix(col, uInk, hempLine * near * 0.4 * (1.0 - lit * 0.5));
  float hemp2 = noise(vec3(vWorld.x * 5.5 + 3.0, vWorld.y * 0.25, vWorld.z * 5.5));
  col = mix(col, uInk, smoothstep(0.7, 0.74, hemp2) * (1.0 - smoothstep(0.76, 0.8, hemp2)) * near * 0.25);
  float dots = smoothstep(0.8, 0.84, noise(vWorld * 1.7 + 9.0)) * smoothstep(0.1, 0.5, up + cav * 0.3);
  col = mix(col, uMoss * 0.7, dots * near * 0.45);
  // 平顶：成片的青绿苔草，柔和深浅
  float topK = smoothstep(0.55, 0.85, up);
  float patchN = fbm(vWorld * 0.25 + 7.0);
  vec3 topCol = mix(uMoss * 0.92, mix(uMoss, vec3(0.62, 0.8, 0.55), 0.45), smoothstep(0.35, 0.7, patchN));
  col = mix(col, topCol, topK * 0.85);
  vec3 V = normalize(cameraPosition - vWorld);
  col = mix(col, uInk, smoothstep(0.8, 1.0, 1.0 - abs(dot(n, V))) * 0.25);
  float bf = uBaseFade * (0.45 + 1.1 * fbm(vec3(vWorld.x * 0.012, 3.0, vWorld.z * 0.012)));
  col = mix(col, mix(uMist, uFarTint, 0.35), (1.0 - smoothstep(0.0, bf, h + (streak - 0.5) * 0.12)) * 0.82);
  gl_FragColor = vec4(atmos(applyShadow(col, vWorld), vWorld), 1.0);
}`;
const cunPeakU = {
  uTop: { value: C('#1c4a8e') }, uMid: { value: C('#6f9fd6') }, uLight: { value: C('#f3f7fb') },
  uMoss: { value: C('#3f9c8c') }, uInk: { value: C('#1a3560') }, uBaseFade: { value: 0.36 }, uCun: { value: 0.55 },
};
const cunRockU = {
  uTop: { value: C('#25579a') }, uMid: { value: C('#7fa9d8') }, uLight: { value: C('#f3f7fb') },
  uMoss: { value: C('#4fa08a') }, uInk: { value: C('#1d3d68') }, uBaseFade: { value: 0.12 }, uCun: { value: 0.35 },
};
const cunMat = (u) => { const m = shaderMat(CUN_FRAG, u, { vertexShader: VERT_VC }); m.vertexColors = true; return m; };
const cunPeakMat = cunMat(cunPeakU), cunRockMat = cunMat(cunRockU);
const rawLoad = (url) => new Promise((res, rej) => gltfLoader.load(url, (g) => res(g.scene), undefined, rej));
const geoByName = (root) => { const m = {}; root.traverse((o) => { if (o.isMesh) m[o.name] = o.geometry; }); return m; };
Promise.all([rawLoad('./assets/mountains.glb'), rawLoad('./assets/rocks.glb'), rawLoad('./assets/mountains_lo.glb')]).then(([mt, rk, mtLo]) => {
  const M = geoByName(mt), Rk = geoByName(rk), ML = geoByName(mtLo);
  const peakGeos = Object.keys(M).filter((k) => k.startsWith('peak_')).sort().map((k) => M[k]);
  const mesaGeos = Object.keys(M).filter((k) => k.startsWith('mesa_')).sort().map((k) => M[k]);
  const rockGeos = Object.keys(Rk).filter((k) => k.startsWith('rock_')).sort().map((k) => Rk[k]);
  peaks.forEach((p, i) => {
    const key = p.mesa !== undefined ? `mesa_${p.mesa}` : Object.keys(M).filter((k) => k.startsWith('peak_')).sort()[i % peakGeos.length];
    p.hi = M[key]; p.lo = ML[key] || M[key];
    p.mesh.geometry = p.hi; p.mesh.material = cunPeakMat;
    const s = p.H / 100, j = p.mesa !== undefined ? 1.0 : rand(0.85, 1.2);
    p.mesh.scale.set(s * j, s, s * j);
  });
  // 坡上、路边半埋的小石（不参与碰撞）
  for (let n = 0, t = 0; n < 26 && t < 4000; t++) {
    const x = rand(-36, 36), z = rand(-26, 26), y = islandHeight(x, z);
    if (y < 0.5 || Math.hypot(x - 5, z + 3) < 8) continue;
    const dp = distToPathFn ? distToPathFn(x, z) : 9;
    if (dp < 1.2) continue;
    const e = 0.5, slope = Math.abs(islandHeight(x + e, z) - islandHeight(x - e, z)) + Math.abs(islandHeight(x, z + e) - islandHeight(x, z - e));
    if (rng() > (dp < 3 ? 0.5 : 0.08) + slope * 0.4) continue;
    const cluster = 1 + Math.floor(rng() * 3);
    for (let c = 0; c < cluster && n < 26; c++, n++) {
      const px = x + rand(-0.8, 0.8), pz = z + rand(-0.8, 0.8), s = rand(0.035, 0.08);
      const pb = new THREE.Mesh(rockGeos[(n * 3) % rockGeos.length], cunRockMat);
      pb.scale.set(s, s * rand(0.5, 0.9), s);
      pb.position.set(px, islandHeight(px, pz) - s * 2.5, pz);
      pb.rotation.set(rand(-0.3, 0.3), rand(0, 6.28), rand(-0.3, 0.3));
      scene.add(pb);
    }
  }
  ROCKS.forEach((r, i) => {
    const { size, squash } = r.userData.rock;
    r.geometry = rockGeos[i % rockGeos.length]; r.material = cunRockMat;
    r.scale.set(size / 9, (size * squash) / 8, size / 9);
  });
  settleTrees();
}).catch((e) => console.error('山石精模加载失败', e));

// 树根落地：岛石、山峰换成精模后形状全变了，手估的 y 会让树悬空、半截埋进石头，甚至整棵伸到水面上。
// 向下打射线找真实表面，取树根一圈里最低的点作根部；圈里有点落空（出了石头边）或坡太陡，就往锚点（石心 / 峰顶）挪
function settleTrees() {
  scene.updateMatrixWorld(true);
  const solids = [...peaks.map((p) => p.mesh), ...ROCKS];
  const ray = new THREE.Raycaster(), from = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  const groundY = (x, z) => { ray.set(from.set(x, 600, z), down); const h = ray.intersectObjects(solids, false)[0]; return h ? h.point.y : null; };
  const v = new THREE.Vector3(), placed = [];
  for (const t of TREES) {
    if (!t.settle) continue;
    let [ax, az] = t.anchor;
    if (t.peak) {            // 峰顶不在峰心正上方（山体有歪斜），找几何最高点
      const pos = t.peak.geometry.attributes.position; let best = -Infinity;
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(t.peak.matrixWorld); if (v.y > best) { best = v.y; ax = v.x; az = v.z; } }
    }
    const r = Math.max(0.2, t.height * 0.035);       // 约树干粗细
    const gap = Math.max(1.5, t.height * 0.3);       // 同一块石头上的两棵树别挤在一处
    // 从原位置朝锚点一路试过去，再绕锚点转一圈，挑「不落空、离别的树够远、根下最平」的点
    const cand = [];
    const x0 = t.peak ? ax : t.group.position.x, z0 = t.peak ? az : t.group.position.z;
    const d0 = Math.hypot(ax - x0, az - z0);
    for (let s = 0; s <= 1.0001; s += 0.04) cand.push([x0 + (ax - x0) * s, z0 + (az - z0) * s, s * d0]);
    for (const rr of [0.6, 1.2, 1.8, 2.6]) for (let k = 0; k < 10; k++) {
      const a = Math.atan2(z0 - az, x0 - ax) + (k * Math.PI) / 5;
      cand.push([ax + Math.cos(a) * rr, az + Math.sin(a) * rr, d0 + rr]);
    }
    let best = null;
    for (const [x, z, moved] of cand) {
      if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < gap)) continue;
      const c = groundY(x, z);
      if (c === null) continue;
      let lo = c, hi = c;
      for (let k = 0; k < 8 && lo !== null; k++) {   // 根外再留半圈余量，不许骑在石头边上
        const y = groundY(x + Math.cos(k * 0.785) * r * 1.5, z + Math.sin(k * 0.785) * r * 1.5);
        if (y === null) lo = null; else { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      }
      if (lo === null) continue;
      const slope = (hi - lo) / (r * 1.5);
      if (slope > 2.5 && !t.peak) continue;          // 峭壁上不长树（峰顶的松除外：本来就是长在尖上的）
      const score = slope + moved * 0.08;            // 坡度为主，挪得少的优先
      if (!best || score < best.score) best = { x, z, y: lo, score };
      if (slope < 0.5 && !t.peak) break;             // 足够平就不再往里挪
    }
    // 石头太小（细高的石柱）放不下第二棵：宁可不要，也不留一棵悬在半空/水上的树
    if (!best) { scene.remove(t.group); t.removed = true; continue; }
    t.group.position.set(best.x, best.y - 0.12, best.z);
    placed.push([best.x, best.z]);
  }
}
const loadGLB = (url) => new Promise((res, rej) => gltfLoader.load(url, (g) => res(stylize(g.scene)), undefined, rej));
const hiState = { useHigh: true };
function applyDetail() { LOW.forEach((o) => (o.visible = !hiState.useHigh)); HIGH.forEach((o) => (o.visible = hiState.useHigh)); }
Promise.all([loadGLB('./assets/pavilion.glb'), loadGLB('./assets/peach.glb')]).then(([pav, peach]) => {
  const place = (src, x, z, s, ry, y = null) => {
    const o = src.clone(true); o.scale.setScalar(s); o.rotation.y = ry;
    o.position.set(x, y ?? islandHeight(x, z) - 0.15, z); scene.add(o); HIGH.push(o); return o;
  };
  place(pav, 5, -3, 0.6, 0.25, 2.4);
  place(pav, 100, -110, 0.5, -0.3, 34);
  place(peach, -15, 9, 1.0, 2.6);
  place(peach, -3, 6, 0.8, 0.9);
  applyDetail();
}).catch((e) => console.error('GLB 加载失败', e));

// 第一批精模：船、植物、塔亭桥。原代码简模保留为子物体，供面板切换对比
function attachHigh(group, src, s = 1, ry = 0, y = 0) {
  group.children.forEach((c) => LOW.push(c));
  const o = src.clone(true); o.position.set(0, y, 0); o.rotation.set(0, ry, 0); o.scale.setScalar(s);
  group.add(o); HIGH.push(o); return o;
}
const named = (root, name) => { const o = root.getObjectByName(name); o.position.set(0, 0, 0); return o; };
Promise.all([loadGLB('./assets/boat.glb'), loadGLB('./assets/plants.glb'), loadGLB('./assets/structures.glb')]).then(([boatG, plants, st]) => {
  const boatM = named(boatG, 'boat');
  attachHigh(myBoat, boatM, 1.0, 0);
  attachHigh(boat2, boatM, 1.0, 0);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const b = boatM.clone(true); b.scale.setScalar(1.3); g.add(b);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 7, 6), flatMat('#6a4a36', 0.3, 0.1)); mast.position.set(0.6, 3.6, 0); g.add(mast);
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(2.8, 0.3); sh.quadraticCurveTo(3.2, 3, 2.4, 5.6); sh.lineTo(0, 6.2); sh.lineTo(0, 0);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh, 8), flatMat('#ece2cc', 0.2, 0.15, THREE.DoubleSide));
    sail.position.set(0.7, 1.0, 0); sail.rotation.y = Math.PI / 2 - 0.3; g.add(sail);
    for (let j = 1; j < 6; j++) { const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.6, 4), flatMat('#7a5a42', 0.2, 0.1)); bt.rotation.z = Math.PI / 2; bt.position.set(0, j * 1.05, 0); const holder = new THREE.Group(); holder.position.set(0.7, 1.0, 0); holder.rotation.y = Math.PI / 2 - 0.3; bt.position.x = 1.3; holder.add(bt); g.add(holder); }
    g.userData = { R: rand(180, 380), a0: rand(0, 6.28), w: rand(0.004, 0.008) * (i % 2 ? 1 : -1) };
    scene.add(g); SAILS.push(g);
  }
  const P = { pine: named(plants, 'pine'), willow: named(plants, 'willow'), bamboo: named(plants, 'bamboo'),
    green: named(plants, 'tree_green'), teal: named(plants, 'tree_teal'), maple: named(plants, 'maple') };
  const H = { pine: 7.6, willow: 7.2, bamboo: 9.5, green: 8.9, teal: 7.0, maple: 7.4 };
  for (const { group, palette, height } of TREES) {
    if (palette === 'peach' || !P[palette]) continue;
    attachHigh(group, P[palette], (height * 1.15) / H[palette], rand(0, 6.28));
  }
  for (const { group, x, z } of BAMBOOS) attachHigh(group, P.bamboo, 1.0, rand(0, 6.28)).position.set(x, islandHeight(x, z) - 0.2, z);
  // 新增：岸边垂柳（图3）
  for (const [x, z, ry] of WILLOWS) {
    const g = new THREE.Group(); g.position.set(x, islandHeight(x, z) - 0.2, z); scene.add(g);
    const o = P.willow.clone(true); o.position.set(0, 0, 0); o.rotation.y = ry; o.scale.setScalar(1.0); g.add(o); HIGH.push(o);
  }
  attachHigh(ting, named(st, 'ting'), 0.72, -Math.PI / 2);   // 入口台阶正对拱桥（game.js 的亭内可走区按此朝向）
  attachHigh(tower, named(st, 'pagoda'), 0.62, 0);
  attachHigh(br, named(st, 'bridge'), 0.92, 0);
  loadGLB('./assets/pier.glb').then((pg) => {
    // 栈桥在 Blender 里 join 后原点留在第一块木板上（桥面高 0.9），named() 会把它清零、整座桥沉到水面；
    // 这里把原点偏移加回来，桥面回到 0.9，和 game.js walkHeight 的 0.95 对上，人物不再悬空
    const off = pg.getObjectByName('pier').position.clone();
    attachHigh(pierG, named(pg, 'pier'), 1.0, 0, off.y).position.x = off.x;
    applyDetail();
  });
  applyDetail();
}).catch((e) => console.error('第一批精模加载失败', e));

// ───────────────────────── 落地晕染 ─────────────────────────
const blotMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uBlot: { value: C('#4f7f6c') } },
  vertexShader: `varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader: COMMON + /* glsl */ `
    uniform vec3 uBlot; varying vec2 vUv; varying vec3 vWorld;
    void main(){
      float r = length(vUv - 0.5) * 2.0 + (fbm(vWorld * 0.6) - 0.5) * 0.45;
      float a = (1.0 - smoothstep(0.15, 1.0, r)) * 0.32;
      gl_FragColor = vec4(atmos(uBlot, vWorld), a);
    }`,
  transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
function groundBlot(x, z, r, sx = 1, sz = 1) {
  const g = new THREE.PlaneGeometry(2 * r * sx, 2 * r * sz, 12, 12);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, islandHeight(x + pos.getX(i), z + pos.getZ(i)) + 0.04);
  const m = new THREE.Mesh(g, blotMat); m.position.set(x, 0, z); m.renderOrder = 1; scene.add(m);
}
for (const { group, palette, height } of TREES) {
  const { x, z } = group.position;
  if (islandHeight(x, z) > 0.3 && Math.hypot(x, z) < 45) groundBlot(x, z, palette === 'peach' ? 3.2 : height * 0.45);
}
for (const { x, z } of BAMBOOS) groundBlot(x, z, 3.2);
groundBlot(5, -3, 7.5, 1.2, 0.95);                       // 楼阁台基

// ───────────────────────── 芦苇荡：岸边与小岛四周 ─────────────────────────
{
  const blade = new THREE.BufferGeometry();
  const bp = [];
  for (let k = 0; k < 5; k++) {
    const a = rand(0, 6.28), lean = rand(0.05, 0.22), w = 0.035;
    const cx = Math.cos(a), cz = Math.sin(a), sx = -cz * w, sz = cx * w;
    bp.push(sx, 0, sz, -sx, 0, -sz, cx * lean, 1, cz * lean);
  }
  blade.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); blade.computeVertexNormals();
  const plume = new THREE.ConeGeometry(0.05, 0.28, 5); plume.translate(0, 1.0, 0);
  const N = 900;
  const reeds = new THREE.InstancedMesh(blade, flatMat('#93a86a', 0.25, 0.15, THREE.DoubleSide), N);
  const plumes = new THREE.InstancedMesh(plume, flatMat('#d9c99c', 0.2, 0.1), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  let k = 0;
  const addClump = (x, z, n) => {
    for (let j = 0; j < n && k < N; j++) {
      const px = x + rand(-1.2, 1.2), pz = z + rand(-1.2, 1.2), h = rand(1.4, 2.4);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6.28)); sc.set(h, h, h); ps.set(px, -0.3, pz);
      m.compose(ps, q, sc); reeds.setMatrixAt(k, m); plumes.setMatrixAt(k, m); k++;
    }
  };
  // 主岛岸边：避开栈桥与拱桥
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand(-0.1, 0.1);
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI * 0.82), Math.cos(a - Math.PI * 0.82))) < 0.3 || Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.3) continue;
    if (rng() < 0.45) continue;
    const s0 = shoreAt(a); addClump(s0.x + Math.cos(a) * 1.5, s0.z + Math.sin(a) * 1.5, 12);
  }
  for (const [x, z, s] of ISLETS) for (let i = 0; i < 3; i++) { const a = rand(0, 6.28); addClump(x + Math.cos(a) * s * 1.1, z + Math.sin(a) * s * 1.1, 14); }
  reeds.count = plumes.count = k;
  scene.add(reeds, plumes);
}

// ───────────────────────── 云雾卡片 ─────────────────────────
function cloudTexture(seed, puffy) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const r = mulberry32(seed);
  const blob = (x, y, rad, rgba) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, rgba); gr.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  const shape = (x) => Math.sin(Math.PI * (x / 512));
  const items = [];
  for (let i = 0; i < (puffy ? 55 : 80); i++) {
    const x = 50 + r() * 412;
    const y = puffy ? 175 - r() * 110 * shape(x) : 185 - r() * 55 * shape(x);
    items.push([x, y, (puffy ? 35 : 28) + r() * (puffy ? 55 : 45)]);
  }
  for (const [x, y, rad] of items) blob(x, y + rad * 0.35, rad, 'rgba(208,224,246,0.30)');   // 淡紫的云底
  for (const [x, y, rad] of items) blob(x, y, rad * 0.92, 'rgba(255,255,255,0.42)');         // 白色云顶
  g.globalCompositeOperation = 'destination-in';
  const hm = g.createLinearGradient(0, 0, 512, 0);
  hm.addColorStop(0, 'rgba(0,0,0,0)'); hm.addColorStop(0.2, 'rgba(0,0,0,1)'); hm.addColorStop(0.8, 'rgba(0,0,0,1)'); hm.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hm; g.fillRect(0, 0, 512, 256);
  const vm = g.createLinearGradient(0, 0, 0, 256);
  vm.addColorStop(0, 'rgba(0,0,0,0)'); vm.addColorStop(0.2, 'rgba(0,0,0,1)'); vm.addColorStop(0.7, 'rgba(0,0,0,1)'); vm.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = vm; g.fillRect(0, 0, 512, 256);
  const t = new THREE.CanvasTexture(c);
  return t;
}
const cloudTex = [cloudTexture(1, false), cloudTexture(2, false), cloudTexture(3, true), cloudTexture(4, true)];
const mistUniforms = { uMistOpacity: { value: 0.7 } };
// 软边：云与山石相交处按场景深度渐隐（深度预渲染只画不透明物体）
const depthRT = new THREE.WebGLRenderTarget(16, 16, { depthTexture: new THREE.DepthTexture(16, 16) });
const DEPTH_U = {
  uDepth: { value: depthRT.depthTexture }, uRes: { value: new THREE.Vector2(1, 1) },
  uNear: { value: camera.near }, uFar: { value: camera.far }, uSoftOn: { value: 1 },
};
const SOFT_GLSL = /* glsl */ `
uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar, uSoftOn;
float linZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float softFade(float dist){
  float sceneZ = linZ(texture2D(uDepth, gl_FragCoord.xy / uRes).x);
  return mix(1.0, smoothstep(0.0, dist, sceneZ - linZ(gl_FragCoord.z)), uSoftOn);
}`;
const softHook = (m) => { m.onBeforeRender = (r, sc, cam) => { DEPTH_U.uSoftOn.value = cam === camera ? 1 : 0; }; };
function mistMat(tex) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, ...mistUniforms, ...DEPTH_U, map: { value: tex }, uAlpha: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0); vWorld = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: COMMON + SOFT_GLSL + /* glsl */ `
      uniform sampler2D map; uniform float uAlpha, uMistOpacity;
      varying vec2 vUv; varying vec3 vWorld;
      void main(){
        vec4 t = texture2D(map, vUv);
        float dist = length(vWorld - cameraPosition);
        float a = t.a * uAlpha * uMistOpacity * smoothstep(12.0, 70.0, dist) * softFade(30.0) * (1.0 - 0.92 * smoothstep(25.0, 90.0, cameraPosition.y - vWorld.y));
        vec3 col = mix(t.rgb, atmos(t.rgb, vWorld), 0.6);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
const mists = [];
function addMist(x, y, z, w, kind = null, alpha = 1) {
  const tex = cloudTex[kind ?? Math.floor(rng() * 2)];
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.4), mistMat(tex));
  m.material.uniforms.uAlpha.value = alpha;
  m.position.set(x, y + w * 0.12, z);
  m.userData.drift = rand(-0.6, 0.6);
  softHook(m);
  scene.add(m); mists.push(m);
}
// 山腰云带
for (const { mesh, H } of peaks) {
  const p = mesh.position;
  const d = p.length();
  addMist(p.x + rand(-20, 20), H * rand(0.08, 0.2), p.z + rand(-20, 20), Math.max(90, d * 0.55) * rand(0.8, 1.3), null, 0.75);
  if (rng() < 0.25) addMist(p.x + rand(-30, 30), H * rand(0.35, 0.55), p.z + rand(-30, 30), Math.max(70, d * 0.4) * rand(0.7, 1.1), null, 0.75);
}
// 贴水的薄雾环
for (let i = 0; i < 14; i++) {
  const a = rand(0, 6.28), d = rand(160, 420);
  addMist(Math.cos(a) * d, -3, Math.sin(a) * d, rand(90, 180), null, 0.45);
}
// 楼阁四周的云海（图3）
// （楼阁四周的云海改为下方的体积云团）

// ───────────────────────── 体积云团：一堆朝向镜头的云朵，顶亮底紫（图3） ─────────────────────────
const puffData = [];
function cloudPile(cx, cy, cz, R, n, flat = 0.5) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.28), d = Math.sqrt(rng()) * R;
    const dome = 1 - (d / R) ** 2;
    const y = cy + R * flat * dome * rand(0.2, 1.0);
    const h = (y - cy) / (R * flat + 1e-3);
    puffData.push({ p: new THREE.Vector3(cx + Math.cos(a) * d, y, cz + Math.sin(a) * d * 0.8), s: R * rand(0.32, 0.55) * (1.15 - 0.4 * h), h, seed: rng() });
  }
}
// 云中楼阁：塔下一圈云海
for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.28 + rand(-0.2, 0.2), d = rand(22, 75); cloudPile(-25 + Math.cos(a) * d, rand(14, 30), -265 + Math.sin(a) * d, rand(14, 26), 22); }
// 山顶楼阁下方
for (let i = 0; i < 8; i++) { const a = rand(0, 6.28), d = rand(16, 45); cloudPile(100 + Math.cos(a) * d, rand(10, 22), -110 + Math.sin(a) * d, rand(12, 20), 18); }
// 部分山峰的山腰云头
peaks.forEach(({ mesh, H }, i) => {
  if (i % 3 !== 0) return;
  const p = mesh.position, r = H * 0.25;
  const y0 = H * rand(0.25, 0.42);
  for (let k = 0; k < 4; k++) { const a = rand(0, 6.28); cloudPile(p.x + Math.cos(a) * r * 1.2, y0 + rand(-2, 2), p.z + Math.sin(a) * r * 1.2, H * rand(0.22, 0.32), 26, 0.22); }
});
// 远处贴水的低云堤
for (let i = 0; i < 18; i++) { const a = rand(0, 6.28), d = rand(220, 520); cloudPile(Math.cos(a) * d, -2, Math.sin(a) * d, rand(30, 60), 16, 0.3); }
const puffU = {
  uCloudLight: { value: C('#ffffff') }, uCloudShadow: { value: C('#c3cfe8') }, uCloudWarm: { value: C('#fff1e6') }, uPuffOpacity: { value: 0.8 },
};
const puffMat = new THREE.ShaderMaterial({
  uniforms: { ...U, ...DEPTH_U, ...puffU },
  vertexShader: /* glsl */ `
    varying vec2 vUv; varying vec3 vWorld; varying vec3 vInfo;
    void main(){
      vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float s = length(instanceMatrix[0].xyz);
      vec4 mv = viewMatrix * vec4(center, 1.0);
      vec2 off = position.xy * s;
      mv.xy += off;
      vWorld = center + transpose(mat3(viewMatrix)) * vec3(off, 0.0);
      vUv = uv; vInfo = instanceColor;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: COMMON + SOFT_GLSL + /* glsl */ `
    uniform vec3 uCloudLight, uCloudShadow, uCloudWarm; uniform float uPuffOpacity;
    varying vec2 vUv; varying vec3 vWorld; varying vec3 vInfo;
    void main(){
      vec2 c = vUv - 0.5;
      float n = fbm(vec3(vUv * 3.2, vInfo.g * 37.0));
      float r = length(c) * 2.0 + (n - 0.5) * 0.55;
      float a = 1.0 - smoothstep(0.12, 1.0, r);
      if (a < 0.01) discard;
      // 顶部受光、底部积紫；整团越高越亮
      float lit = clamp((vUv.y - 0.25) * 1.3 + (n - 0.5) * 0.5 + vInfo.r * 0.55, 0.0, 1.0);
      vec3 col = mix(uCloudShadow, uCloudLight, smoothstep(0.1, 0.85, lit));
      float sun = max(dot(normalize(vWorld - cameraPosition), uSunDir), 0.0);
      col = mix(col, uCloudWarm, pow(sun, 4.0) * 0.5 * lit);
      col = mix(col, atmos(col, vWorld), 0.55);
      float dist = length(vWorld - cameraPosition);
      a *= uPuffOpacity * smoothstep(6.0, 30.0, dist) * softFade(12.0) * (1.0 - 0.7 * smoothstep(40.0, 130.0, cameraPosition.y - vWorld.y));
      gl_FragColor = vec4(col, a);
    }`,
  transparent: true, depthWrite: false,
});
const puffs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), puffMat, puffData.length);
puffs.frustumCulled = false;
puffs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(puffData.length * 3), 3);
softHook(puffs);
scene.add(puffs);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _sv = new THREE.Vector3();
const puffOrder = puffData.map((_, i) => i);
function sortPuffs() {
  const cp = camera.position;
  for (const d of puffData) d.k = d.p.distanceToSquared(cp);
  puffOrder.sort((a, b) => puffData[b].k - puffData[a].k);
  puffOrder.forEach((idx, i) => {
    const d = puffData[idx];
    _m4.compose(d.p, _q, _sv.setScalar(d.s)); puffs.setMatrixAt(i, _m4);
    puffs.instanceColor.setXYZ(i, d.h, d.seed, 0);
  });
  puffs.instanceMatrix.needsUpdate = true; puffs.instanceColor.needsUpdate = true;
}
sortPuffs();

// ───────────────────────── 水面（倒影 + 淡青） ─────────────────────────
// 岸线高度图：把初始岛的高度烘焙进贴图，水面据此画浅滩和水痕
const SHORE_N = 256, SHORE_SIZE = 170;
const PATH = (() => {
  const a = Math.PI * 0.82, s0 = shoreAt(a);
  const pts = [[s0.x - Math.cos(a) * 5, s0.z - Math.sin(a) * 5], [-14, 12.6], [-6.5, 10.8], [2, 7], [6.5, 3.2], [12, 3.5], [17, 1.5], [eastShore.x - 1.5, 0.3]];
  return pts;
})();
function distToPath(x, z) {
  distToPathFn = distToPath;
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}
const shoreData = new Uint8Array(SHORE_N * SHORE_N * 4);
for (let j = 0; j < SHORE_N; j++) for (let i = 0; i < SHORE_N; i++) {
  const x = (i / (SHORE_N - 1) - 0.5) * SHORE_SIZE, z = (j / (SHORE_N - 1) - 0.5) * SHORE_SIZE;
  const h = islandHeight(x, z);
  const k = (j * SHORE_N + i) * 4;
  shoreData[k] = Math.round(Math.min(1, Math.max(0, (h + 4) / 8)) * 255); shoreData[k + 3] = 255;
  shoreData[k + 1] = Math.round(Math.max(0, 1 - distToPath(x, z) / 2.2) * 255);
}
const shoreTex = new THREE.DataTexture(shoreData, SHORE_N, SHORE_N);
shoreTex.magFilter = shoreTex.minFilter = THREE.LinearFilter; shoreTex.needsUpdate = true;
GROUND_MAT.uniforms.uShoreMap.value = shoreTex; GROUND_MAT.uniforms.uShoreSize.value = SHORE_SIZE;

// 草丛：笔触形草片 + 与地面同源的颜色 + 成片分布 + 风
{
  // 一丛 = 6 片外弯的宽草片；高度归一化为 1（实例缩放决定实际高度），每片 4 段以便弯曲
  const pos = [], idx = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + rand(-0.4, 0.4);
    const lean = rand(0.25, 0.6), h = rand(0.65, 1.0), w = rand(0.09, 0.14);
    const cx = Math.cos(a), cz = Math.sin(a), sx = -cz, sz = cx;
    const base = pos.length / 3;
    for (let r = 0; r <= 4; r++) {
      const t = r / 4, ww = w * (1 - t) * (1 - t * 0.2);
      const out = lean * t * t * h;
      const y = h * t;
      pos.push(cx * out + sx * ww, y, cz * out + sz * ww, cx * out - sx * ww, y, cz * out - sz * ww);
    }
    for (let r = 0; r < 4; r++) { const i = base + r * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const grassU = { uTip: { value: C('#dcebb4') }, uGrassDark: { value: 0.8 } };
  const grassMat = new THREE.ShaderMaterial({
    uniforms: { ...U, ...grassU, uGrass1: GROUND_MAT.uniforms.uGrass1, uGrass2: GROUND_MAT.uniforms.uGrass2 },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying float vT; varying vec3 vTint;
      uniform float uTime;
      void main(){
        float t = position.y;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float sway = sin(uTime * 1.5 + wp.x * 0.35 + wp.z * 0.27) * 0.6 + sin(uTime * 2.6 + wp.x * 0.9 - wp.z * 0.4) * 0.25;
        wp.x += sway * 0.09 * t * t; wp.z += sway * 0.05 * t * t;
        vWorld = wp.xyz; vT = t; vTint = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #endif
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: COMMON + /* glsl */ `
      uniform vec3 uGrass1, uGrass2, uTip; uniform float uGrassDark;
      varying vec3 vWorld; varying float vT; varying vec3 vTint;
      void main(){
        // 与地面同一套取色：根部和地面无缝相接，往上渐渐提亮成淡黄绿
        float p = fbm(vWorld * 0.09);
        vec3 ground = mix(uGrass1, uGrass2, smoothstep(0.35, 0.68, p));
        vec3 col = mix(ground * uGrassDark, mix(ground, uTip, 0.6), smoothstep(0.05, 1.0, vT));
        col *= vTint;
        gl_FragColor = vec4(atmos(applyShadow(col, vWorld), vWorld), 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  const N = 3200;
  const tufts = new THREE.InstancedMesh(g, grassMat, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), tint = new THREE.Color();
  const flowers = [];
  const fcol = ['#fbf8f0', '#f6dfe6', '#f3e7b8', '#e4def0'].map(C);
  const ok = (x, z) => {
    const y = islandHeight(x, z);
    if (y < 0.4) return null;
    if (distToPath(x, z) < 1.3) return null;
    if (Math.hypot(x - 5, z + 3) < 7.5) return null;
    const e = 0.4, slope = Math.abs(islandHeight(x + e, z) - islandHeight(x - e, z)) + Math.abs(islandHeight(x, z + e) - islandHeight(x, z - e));
    return slope > 0.9 ? null : y;
  };
  let k = 0;
  for (let t = 0; t < 40000 && k < N; t++) {
    const x = rand(-40, 40), z = rand(-30, 30);
    // 成片：噪声斑块里密，路边一圈密，其余大片草地只零星几丛（留白）
    const patch = fbm3(x * 0.11 + 4, 0.3, z * 0.11);
    const dp = distToPath(x, z);
    const edge = dp > 1.3 && dp < 2.8 ? 0.55 : 0;
    const prob = Math.max(smooth(0.47, 0.62, patch), edge);   // 不再零星撒点，空地留白
    if (rng() > prob) continue;
    // 每次落点长出一小簇 2~5 丛
    const n = 3 + Math.floor(rng() * 5);
    for (let j = 0; j < n && k < N; j++) {
      const px = x + rand(-0.7, 0.7), pz = z + rand(-0.7, 0.7);
      const y = ok(px, pz);
      if (y === null) continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6.28));
      const h = rand(0.28, 0.62) * (0.75 + patch * 0.5);
      sc.set(h * rand(0.9, 1.3), h, h * rand(0.9, 1.3)); ps.set(px, y - 0.03, pz);
      m.compose(ps, q, sc); tufts.setMatrixAt(k, m);
      tufts.setColorAt(k, tint.setScalar(rand(0.93, 1.06)));
      k++;
    }
    if (rng() < 0.05) {
      const c = fcol[Math.floor(rng() * fcol.length)], y = islandHeight(x, z);
      for (let j = 0; j < 4; j++) flowers.push({ x: x + rand(-0.35, 0.35), y: y + rand(0.18, 0.32), z: z + rand(-0.35, 0.35), c, s: rand(0.07, 0.11) });
    }
  }
  const anchors = [];
  for (const { group } of TREES) { const p = group.position; if (Math.hypot(p.x, p.z) < 45 && islandHeight(p.x, p.z) > 0.4) anchors.push([p.x, p.z, 0.7, 2.4]); }
  for (const { x, z } of BAMBOOS) anchors.push([x, z, 1.4, 3.2]);
  for (const r of ROCKS) { const p = r.position; if (Math.hypot(p.x, p.z) < 45) anchors.push([p.x, p.z, r.scale.x * 5, r.scale.x * 5 + 2]); }
  for (const [ax, az, r0, r1] of anchors) {
    for (let j = 0; j < 14 && k < N; j++) {
      const a = rand(0, 6.28), d = rand(r0, r1), px = ax + Math.cos(a) * d, pz = az + Math.sin(a) * d;
      const y = ok(px, pz);
      if (y === null) continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6.28));
      const h = rand(0.3, 0.6) * (1.2 - (d - r0) / (r1 - r0 + 0.01) * 0.4);
      sc.set(h * rand(0.9, 1.3), h, h * rand(0.9, 1.3)); ps.set(px, y - 0.03, pz);
      m.compose(ps, q, sc); tufts.setMatrixAt(k, m); tufts.setColorAt(k, tint.setScalar(rand(0.9, 1.02))); k++;
    }
  }
  tufts.count = k;
  scene.add(tufts);
  scene.add(dabCloud(flowers));
  window.__grassU = grassU;
}
const waterUniforms = {
  uWaterNear: { value: C('#b9e3d9') }, uWaterFar: { value: C('#dcefe9') }, uReflect: { value: 0.5 },
  uShallow: { value: C('#dff2ea') }, uWaterDeep: { value: C('#7dbbae') }, uCamFwd: { value: new THREE.Vector2(0, -1) }, uShore: { value: shoreTex }, uShoreSize: { value: SHORE_SIZE }, uBlur: { value: 1.0 },
};
// 必须细分：只有两个 12000 m 的巨型三角形时，裁剪后的深度插值误差远大于深度缓冲精度，
// 贴水的荷叶、沙洲、桥脚会和水面 z-fighting（高空俯瞰时尤其明显）
const water = new Reflector(new THREE.PlaneGeometry(12000, 12000, 96, 96), {
  textureWidth: Math.floor(innerWidth * renderer.getPixelRatio() * 0.5), textureHeight: Math.floor(innerHeight * renderer.getPixelRatio() * 0.5), clipBias: 0.003, multisample: 4,
  shader: {
    name: 'InkWater',
    uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
      void main(){ vUv = textureMatrix * vec4(position, 1.0); vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: COMMON + /* glsl */ `
      uniform sampler2D tDiffuse, uShore; uniform vec3 uWaterNear, uWaterFar, uShallow; uniform float uReflect, uShoreSize, uBlur; uniform vec2 uCamFwd; uniform vec3 uWaterDeep;
      varying vec4 vUv; varying vec3 vWorld;
      void main(){
        // 以镜头水平朝向为基准的坐标：横向 along、纵深 depth —— 水纹永远是画面上的横线
        vec2 fwd = uCamFwd;
        vec2 rgt = vec2(-fwd.y, fwd.x);
        float along = dot(vWorld.xz, rgt), depth = dot(vWorld.xz, fwd);
        float dist = length(vWorld.xz - cameraPosition.xz);
        float wave = noise(vec3(along * 0.012, depth * 0.35, uTime * 0.15));
        float wave2 = noise(vec3(along * 0.03, depth * 0.9 + 3.0, uTime * 0.22));
        vec2 rp = vec2(noise(vec3(vWorld.xz * 0.05, uTime * 0.2)) - 0.5, wave - 0.5);
        vec2 base = vUv.xy / vUv.w + vec2(rp.x * 0.012, rp.y * 0.03);
        // 倒影竖向拉丝：沿画面竖直方向多点采样
        vec3 refl = vec3(0.0); float wsum = 0.0;
        for (int i = -4; i <= 4; i++) {
          float fi = float(i);
          float wgt = exp(-fi * fi * 0.12);
          refl += texture2D(tDiffuse, base + vec2(0.0, fi * 0.0045 * uBlur * (0.6 + wave))).rgb * wgt;
          wsum += wgt;
        }
        refl /= wsum;
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(V.y, 0.0), 2.5);
        vec3 w = mix(uWaterNear, uWaterFar, smoothstep(30.0, 260.0, dist));
        float look = smoothstep(0.18, 0.7, normalize(cameraPosition - vWorld).y) * smoothstep(15.0, 70.0, cameraPosition.y);
        float deep = fbm(vec3(vWorld.xz * 0.008, 1.3));
        vec3 jade = mix(uWaterDeep, uWaterDeep * vec3(0.86, 0.94, 0.98), smoothstep(0.4, 0.7, deep));
        w = mix(w, jade, look * 0.9);
        refl = mix(refl, w, 0.28);                                   // 倒影淡一些，像隔着一层水汽
        vec3 col = mix(w, refl, clamp(uReflect * (0.55 + 0.6 * fres) * (0.35 + 0.65 * smoothstep(6.0, 60.0, dist)) * (1.0 - 0.75 * look), 0.0, 0.9));
        // 浅滩：靠近岸的水更浅更亮，岸边一圈断续的白色水痕
        vec2 suv = vWorld.xz / uShoreSize + 0.5;
        if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) {
          float h = texture2D(uShore, suv).r * 8.0 - 4.0;
          vec2 eg = min(suv, 1.0 - suv);
          float shallow = smoothstep(-0.97, -0.2, h) * smoothstep(0.0, 0.05, min(eg.x, eg.y));   // 只在岸边一圈，不再整块发白
          col = mix(col, uShallow, shallow * 0.55);
          float foamN = noise(vec3(vWorld.xz * 0.5, uTime * 0.3));
          float foam = smoothstep(-0.7, -0.25, h) * (1.0 - smoothstep(-0.25, 0.05, h)) * smoothstep(0.35, 0.65, foamN);
          col = mix(col, vec3(1.0), foam * 0.75);
        }
        // 画面横向的亮水纹（远处更明显）
        float lines = smoothstep(0.8, 0.97, wave2) * (0.4 + 0.6 * smoothstep(20.0, 160.0, dist));
        col = mix(col, vec3(1.0), lines * 0.3);
        col = mix(col, vec3(1.0), 0.05);
        gl_FragColor = vec4(atmos(applyShadow(col, vWorld), vWorld), 1.0);
      }`,
  },
});
water.rotation.x = -Math.PI / 2;
for (const k of Object.keys(U)) water.material.uniforms[k] = U[k];
Object.assign(water.material.uniforms, waterUniforms);
scene.add(water);

// ───────────────────────── 飞鸟 / 落花 ─────────────────────────
const birds = [];
{
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.18, 0, 0, 0.18, 1.3, 0.05, 0.25, 0, 0, 0.18, 1.3, 0.05, 0.25, 0.9, 0, 0.45], 3));
  wingGeo.computeVertexNormals();
  const inkMat = flatMat('#2d2f36', 0.0, 0.0, THREE.DoubleSide);
  for (let i = 0; i < 11; i++) {
    const b = new THREE.Group();
    const lw = new THREE.Mesh(wingGeo, inkMat), rw = new THREE.Mesh(wingGeo, inkMat);
    rw.scale.x = -1;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), inkMat); body.scale.set(1, 1, 3.2);
    b.add(lw, rw, body);
    const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
    b.userData = { lw, rw, off: new THREE.Vector3(side * row * 2.2, rand(-0.6, 0.6), row * 2.4), phase: rand(0, 6) };
    b.scale.setScalar(1.5);
    scene.add(b); birds.push(b);
  }
}
let petals;
{
  const n = 220, pts = [];
  for (let i = 0; i < n; i++) pts.push({ x: -15 + rand(-8, 6), y: rand(0, 12), z: 9 + rand(-6, 8), c: C(PALETTES.peach[i % 5]), s: 0.075 });
  petals = dabCloud(pts);
  scene.add(petals);
}

// ───────────────────────── 视角预设 + 调色面板 ─────────────────────────
const VIEWS = {
  '岸边漫步': { p: [-20, 6.5, 22], t: [8, 6, -30] },
  '水面泛舟': { p: [-34, 1.6, 44], t: [0, 7, -60] },
  '御剑高空': { p: [70, 95, 140], t: [-10, 25, -120] },
  '云中楼阁': { p: [10, 55, -170], t: [-25, 52, -265] },
  '远眺全景': { p: [-42, 15, 58], t: [0, 7, -20] },
};
let tween = null;
function goView(name) {
  const v = VIEWS[name];
  controls.autoRotate = false; gui.controllersRecursive().forEach((c) => c.updateDisplay());
  tween = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...v.p), t1: new THREE.Vector3(...v.t) };
}
const gui = new GUI({ title: '风格小样' });
const fv = gui.addFolder('视角');
gui.add(hiState, 'useHigh').name('Blender 精模（关=代码简模）').onChange(applyDetail);
for (const name of Object.keys(VIEWS)) fv.add({ go: () => goView(name) }, 'go').name(name);
fv.add(controls, 'autoRotate').name('自动环绕');
const fa = gui.addFolder('天空与云雾');
fa.addColor(U.uSkyTop, 'value').name('天顶');
fa.addColor(U.uSkyHorizon, 'value').name('天际');
fa.addColor(U.uMist, 'value').name('雾色');
fa.addColor(U.uSunGlow, 'value').name('霞光');
fa.add(U.uFogDensity, 'value', 0.0005, 0.006, 0.0001).name('远景淡化');
fa.add(U.uHeightFogStrength, 'value', 0, 1, 0.01).name('贴水雾浓度');
fa.add(U.uHeightFog, 'value', 0.005, 0.15, 0.001).name('雾带高度(越小越高)');
fa.add(mistUniforms.uMistOpacity, 'value', 0, 1, 0.01).name('云片浓度');
fa.add(puffU.uPuffOpacity, 'value', 0, 1, 0.01).name('云团浓度');
fa.addColor(puffU.uCloudShadow, 'value').name('云底紫');
const fm = gui.addFolder('山石');
fm.addColor(cunPeakU.uTop, 'value').name('精模·山顶');
fm.addColor(cunPeakU.uMid, 'value').name('精模·山腰');
fm.addColor(cunPeakU.uInk, 'value').name('精模·皴墨');
fm.addColor(cunPeakU.uMoss, 'value').name('精模·苔点');
fm.add(cunPeakU.uCun, 'value', 0, 1, 0.01).name('皴笔浓度');
fm.addColor(peakUniforms.uTop, 'value').name('山顶黛蓝');
fm.addColor(peakUniforms.uMid, 'value').name('山腰');
fm.addColor(peakUniforms.uLight, 'value').name('受光面');
fm.addColor(peakUniforms.uMoss, 'value').name('青绿苔点');
fm.add(peakUniforms.uBaseFade, 'value', 0, 0.9, 0.01).name('山脚没雾');
fm.addColor(rockUniforms.uTop, 'value').name('岸石深色');
const fw = gui.addFolder('水');
fw.addColor(waterUniforms.uWaterNear, 'value').name('近水');
fw.addColor(waterUniforms.uWaterFar, 'value').name('远水');
fw.add(waterUniforms.uReflect, 'value', 0, 1, 0.01).name('倒影强度');
fw.add(waterUniforms.uBlur, 'value', 0, 3, 0.01).name('倒影虚化');
fw.addColor(waterUniforms.uShallow, 'value').name('浅滩');
gui.add({ dump: () => {
  const out = {};
  const walk = (o, pre) => { for (const [k, v] of Object.entries(o)) { const val = v.value; out[pre + k] = val?.isColor ? '#' + val.getHexString() : val?.isVector3 ? val.toArray() : val; } };
  walk(U, ''); walk(peakUniforms, 'peak.'); walk(rockUniforms, 'rock.'); walk(waterUniforms, 'water.'); walk(mistUniforms, '');
  const s = JSON.stringify(out, null, 2); console.log(s); navigator.clipboard?.writeText(s).catch(() => {});
} }, 'dump').name('导出当前参数（复制到剪贴板）');
gui.close();
gui.hide();
window.__goView = goView;
window.__dbg = { camera, controls, scene, U, renderer, get QUALITY() { return QUALITY; }, get resize() { return resize; }, get water() { return water; }, get puffs() { return puffs; }, get composer() { return composer; } };
// 调试：直接跳到视角并立即渲染一帧（面板隐藏、动画被节流时用于截图）
window.__snap = (name) => {
  const v = typeof name === 'string' ? VIEWS[name] : name; tween = null; controls.autoRotate = false;
  const md = controls.maxDistance, mn = controls.minDistance; controls.maxDistance = 1e5; controls.minDistance = 0;
  camera.position.set(...v.p); controls.target.set(...v.t); controls.update();
  controls.maxDistance = md; controls.minDistance = mn;
  U.uTime.value += 0.016; sortPuffs(); updateLOD(); shadowPass(); depthPrepass(); composer.render();
};
// 调试：渲染指定视角并把画面存到 tools/snaps/<file>.png
window.__bench = (view, n = 30) => {
  const gl = renderer.getContext(), px = new Uint8Array(4);
  window.__snap(view); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { window.__snap(view); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  const ms = (performance.now() - t0) / n;
  return { view, ms: +ms.toFixed(1), fps: Math.round(1000 / ms), w: renderer.domElement.width, h: renderer.domElement.height, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
};
window.__shot = async (view, file, w = 1280, h = 800) => {
  const ow = innerWidth, oh = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  window.__snap(view); window.__snap(view);
  const url = renderer.domElement.toDataURL('image/png');
  renderer.setSize(ow, oh); composer.setSize(ow, oh); camera.aspect = ow / oh; camera.updateProjectionMatrix();
  await fetch('/__snap?name=' + encodeURIComponent(file), { method: 'POST', body: url });
  return file;
};

// ───────────────────────── 后期：辉光 + 调色（提饱和、提亮、压不出暗部） ─────────────────────────
const QUALITY = { msaa: 4, scale: Math.min(devicePixelRatio, 2) };
const composerTarget = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: QUALITY.msaa });
const composer = new EffectComposer(renderer, composerTarget);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.12, 0.6, 0.93);
composer.addPass(bloom);
const watercolor = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 800) }, uRes: { value: new THREE.Vector2(1280, 800) },
    uWobble: { value: 1.0 }, uEdge: { value: 1.0 }, uGrain: { value: 0.06 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uTexel, uRes; uniform float uWobble, uEdge, uGrain;
    varying vec2 vUv;
    float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
    float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main(){
      // 晕染抖动：低频噪声把画面轻轻推开 1~3 像素，边缘不再是机器直线
      vec2 w = vec2(n2(vUv * vec2(14.0, 9.0)), n2(vUv * vec2(14.0, 9.0) + 17.3)) - 0.5;
      vec2 uv = vUv + w * uTexel * uWobble * 5.0;
      vec3 c = texture2D(tDiffuse, uv).rgb;
      // 颜料积边：色块交界处颜料沉积，略微加深（乘色，保持色相）
      vec2 o = uTexel * 1.5;
      float gx = lum(texture2D(tDiffuse, uv + vec2(o.x, 0.0)).rgb) - lum(texture2D(tDiffuse, uv - vec2(o.x, 0.0)).rgb);
      float gy = lum(texture2D(tDiffuse, uv + vec2(0.0, o.y)).rgb) - lum(texture2D(tDiffuse, uv - vec2(0.0, o.y)).rgb);
      float e = smoothstep(0.025, 0.16, length(vec2(gx, gy)));
      c *= 1.0 - e * uEdge * 0.16;
      // 纸纹颗粒：纸纤维（细）+ 颜料沉淀（粗），中间调最明显，纯白处几乎没有
      vec2 px = vUv * uRes;
      float fiber = n2(px * 0.55) * 0.6 + n2(px * 0.13 + 5.0) * 0.4;
      float settle = n2(px * 0.035 + 11.0);
      float l = lum(c);
      float mid = smoothstep(0.98, 0.6, l) * (0.4 + 0.6 * (1.0 - abs(l * 2.0 - 1.0)));
      c *= 1.0 - ((fiber - 0.5) * 0.7 + (settle - 0.5) * 0.45) * uGrain * mid;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(watercolor);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.06 }, uContrast: { value: 1.04 }, uBright: { value: 0.0 }, uLift: { value: C('#3a5a86') } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uSat, uContrast, uBright; uniform vec3 uLift; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5 + uBright;
      c = max(c, uLift * 0.55);                 // 最暗也只到青蓝，不出现黑灰
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
});
composer.addPass(grade);
const fg = gui.addFolder('后期');
fg.add(grade.uniforms.uSat, 'value', 0.6, 1.8, 0.01).name('饱和度');
fg.add(grade.uniforms.uContrast, 'value', 0.8, 1.4, 0.01).name('对比度');
fg.add(grade.uniforms.uBright, 'value', -0.1, 0.15, 0.005).name('明度');
fg.add(bloom, 'strength', 0, 1, 0.01).name('辉光');
fg.add(watercolor.uniforms.uGrain, 'value', 0, 0.3, 0.005).name('纸纹颗粒');
fg.add(U.uShadowStrength, 'value', 0, 1, 0.01).name('投影浓淡');
fg.addColor(U.uShadowTint, 'value').name('投影色');
fg.add(watercolor.uniforms.uEdge, 'value', 0, 3, 0.01).name('颜料积边');
fg.add(watercolor.uniforms.uWobble, 'value', 0, 3, 0.01).name('晕染抖动');
const fq = gui.addFolder('画质');
fq.add(QUALITY, 'msaa', { 关: 0, '2x': 2, '4x': 4, '8x': 8 }).name('抗锯齿').onChange((v) => { for (const t of [composer.renderTarget1, composer.renderTarget2]) { t.samples = +v; t.dispose(); } resize(); });
fq.add(QUALITY, 'scale', { 省电: 1, 标准: Math.min(devicePixelRatio, 2), 超采样: Math.min(devicePixelRatio * 1.5, 3) }).name('渲染精度').onChange(() => resize());
fa.addColor(U.uFarTint, 'value').name('远山蓝');

// ───────────────────────── 循环 ─────────────────────────
let capSS = 1;
// 录视频用的最高画质：outW 为输出宽度，ss 为超采样倍数；MSAA 拉到显卡上限，反射、阴影、山体全用最高精度
// （4K 渲染 + 8x MSAA 会让浏览器显存不足、上下文丢失，所以 MSAA 封顶 4x：配合 2x 超采样每像素 16 个采样）
function capQuality(outW, ss = 2, msaa = 4) {
  const maxS = Math.min(msaa, renderer.capabilities.maxSamples);
  QUALITY.msaa = maxS;
  for (const t of [composer.renderTarget1, composer.renderTarget2]) { t.samples = maxS; t.dispose(); }
  capSS = ss; QUALITY.scale = (outW * ss) / innerWidth;
  resize();
  const pr = renderer.getPixelRatio(), rt = water.getRenderTarget();
  rt.setSize(Math.floor(innerWidth * pr), Math.floor(innerHeight * pr)); rt.samples = Math.min(4, maxS); rt.dispose();
  SHADOW_N = 4096; shadowRT.setSize(SHADOW_N, SHADOW_N); U.uShadowTexel.value = 1 / SHADOW_N;
  for (const p of peaks) if (p.lo) { p.mesh.geometry = p.hi; p.lo = null; }
  return { msaa: maxS, scale: QUALITY.scale, size: [renderer.domElement.width, renderer.domElement.height] };
}
function resize() {
  renderer.setPixelRatio(+QUALITY.scale);
  composer.setPixelRatio(+QUALITY.scale);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  const pr = renderer.getPixelRatio();
  // 超采样录制时，笔触 / 积边 / 纸纹按输出分辨率计算，画风与 1 倍渲染一致，只是边缘更干净
  const fx = pr / capSS;
  watercolor.uniforms.uRes.value.set(innerWidth * fx, innerHeight * fx);
  watercolor.uniforms.uTexel.value.set(1 / (innerWidth * fx), 1 / (innerHeight * fx));
  depthRT.setSize(Math.floor(innerWidth * pr), Math.floor(innerHeight * pr));
  DEPTH_U.uRes.value.set(innerWidth * pr, innerHeight * pr);
  dabUniforms.uScale.value = (innerHeight * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
}
addEventListener('resize', resize); resize();

const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
const _fw = new THREE.Vector3();
function depthPrepass() {
  camera.getWorldDirection(_fw); _fw.y = 0; if (_fw.lengthSq() > 1e-6) { _fw.normalize(); waterUniforms.uCamFwd.value.set(_fw.x, _fw.z); }
  const hide = [...mists, puffs, water, petals].filter((o) => o.visible);
  hide.forEach((o) => (o.visible = false));
  scene.overrideMaterial = depthOnly;
  renderer.setRenderTarget(depthRT); renderer.clear(); renderer.render(scene, camera);
  renderer.setRenderTarget(null); scene.overrideMaterial = null;
  hide.forEach((o) => (o.visible = true));
}
// 远景山峰换低模（距离 > 260 用一半网格密度的版本）
function updateLOD() {
  for (const p of peaks) if (p.lo) p.mesh.geometry = p.mesh.position.distanceTo(camera.position) - p.H * 0.3 > 260 ? p.lo : p.hi;
}
let SHADOW_N = 2048; const SHADOW_HALF = 60;
const shadowRT = new THREE.WebGLRenderTarget(SHADOW_N, SHADOW_N, { depthTexture: new THREE.DepthTexture(SHADOW_N, SHADOW_N) });
const shadowCam = new THREE.OrthographicCamera(-SHADOW_HALF, SHADOW_HALF, SHADOW_HALF, -SHADOW_HALF, 1, 420);
const shadowDepthMat = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
U.uShadowMap.value = shadowRT.depthTexture; U.uShadowTexel.value = 1 / SHADOW_N; U.uShadowOn.value = 1;
const _shC = new THREE.Vector3();
function shadowPass() {
  const c = window.__shadowCenter || _shC.set(0, 0, 0);
  const step = (2 * SHADOW_HALF) / SHADOW_N * 4;
  _shC.set(Math.round(c.x / step) * step, 0, Math.round(c.z / step) * step);
  shadowCam.position.copy(_shC).addScaledVector(U.uLightDir.value, 200);
  shadowCam.lookAt(_shC); shadowCam.updateMatrixWorld();
  U.uShadowMatrix.value.multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse);
  const hidden = [];
  scene.traverse((o) => {
    if (!o.visible) return;
    const m = o.material;
    if (o.isPoints || o.isLine || o === water || (m && !Array.isArray(m) && (m.transparent || m.depthWrite === false))) { o.visible = false; hidden.push(o); }
  });
  scene.overrideMaterial = shadowDepthMat;
  renderer.setRenderTarget(shadowRT); renderer.clear(); renderer.render(scene, shadowCam);
  renderer.setRenderTarget(null); scene.overrideMaterial = null;
  for (const o of hidden) o.visible = true;
}
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
function animate() {
  frame(Math.min(clock.getDelta(), 0.05));
  requestAnimationFrame(animate);
}
function frame(dt) {
  if (CAP) window.__vclock.advance(dt);
  const t = (U.uTime.value += dt);
  if (window.__capPre) window.__capPre(dt, t);

  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 2.2);
    const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (tween.t >= 1) tween = null;
  }
  if (window.__gameUpdate) window.__gameUpdate(dt, t);
  controls.update();
  if (camera.position.y < 0.8) camera.position.y = 0.8;
  if (window.__capPost) window.__capPost(dt, t);

  for (const m of mists) {
    m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);
    m.position.x += m.userData.drift * dt;
  }
  // 船
  const a1 = t * 0.03;
  myBoat.position.set(-30 + Math.cos(a1) * 6, Math.sin(t * 1.3) * 0.06, 30 + Math.sin(a1) * 6);
  myBoat.rotation.set(Math.sin(t * 1.1) * 0.03, -a1 + Math.PI / 2, Math.sin(t * 0.9) * 0.025);
  boat2.position.set(40 + Math.sin(t * 0.02) * 20, Math.sin(t * 1.2 + 1) * 0.05, 45);
  boat2.rotation.y = Math.PI * 0.1;
  for (const sb of SAILS) {
    const { R, a0, w } = sb.userData, a = a0 + t * w;
    let x = Math.cos(a) * R, z = Math.sin(a) * R;
    sb.position.set(x, Math.sin(t * 1.1 + a0) * 0.06, z);
    const sg = Math.sign(w), vx = -Math.sin(a) * sg, vz = Math.cos(a) * sg;
    sb.rotation.set(0, Math.atan2(-vz, vx), Math.sin(t * 0.9 + a0) * 0.03);
  }
  // 雁阵
  const fa_ = t * 0.035;
  const lead = tmp.set(-10 + Math.cos(fa_) * 110, 64 + Math.sin(t * 0.3) * 4, -70 + Math.sin(fa_) * 80);
  const heading = Math.atan2(-Math.sin(fa_) * 110, Math.cos(fa_) * 80);
  for (const b of birds) {
    const { lw, rw, off, phase } = b.userData;
    const c = Math.cos(heading), s = Math.sin(heading);
    b.position.set(lead.x + off.x * c + off.z * s, lead.y + off.y, lead.z - off.x * s + off.z * c);
    b.rotation.y = heading;
    const f = Math.sin(t * 5 + phase) * 0.55;
    lw.rotation.z = f; rw.rotation.z = -f;
  }
  // 落花
  const pp = petals.geometry.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    let y = pp.getY(i) - dt * (0.5 + (i % 7) * 0.08);
    let x = pp.getX(i) + Math.sin(t * 0.8 + i) * dt * 0.6 + dt * 0.35;
    let z = pp.getZ(i) + Math.cos(t * 0.6 + i * 1.3) * dt * 0.4;
    if (y < 0.05) { y = rand(6, 11); x = -15 + rand(-7, 4); z = 9 + rand(-5, 6); }
    pp.setXYZ(i, x, y, z);
  }
  pp.needsUpdate = true;

  sortPuffs();
  updateLOD();
  shadowPass();
  depthPrepass();
  composer.render();
}
if (CAP) window.__frame = frame; else animate();

// ───────────────────────── 玩法层（game.js）─────────────────────────
window.__WORLD = {
  THREE, scene, camera, controls, renderer, U, islandHeight, flatMat, loadGLB, named, rand,
  pierG, br, ting, islet, peaks, ROCKS, TREES, BAMBOOS, WILLOWS, eastShore, myBoat, boat2,
  waterUniforms, gui, stopTween: () => { tween = null; }, resize, QUALITY, CAP, capQuality,
};
import('./game.js').then((m) => m.startGame(window.__WORLD)).then(() => CAP && import('./capture.js')).catch((e) => console.error('game.js 加载失败', e));
