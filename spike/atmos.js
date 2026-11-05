// 山水意境 · 时辰与天气：清晨 / 正午 / 黄昏 三套天光，细雨（雨丝 + 水面雨点涟漪 + 远山更朦胧）
// 所有变化都是对共享的“画意”参数做平滑插值，切换时缓缓过渡，不会突变。

export function createAtmos(W, { ripple, center }) {
  const { THREE, U, scene, camera, waterUniforms, islandHeight } = W;
  const C = (h) => new THREE.Color(h);
  const PRESETS = {
    清晨: { skyTop: '#5d9fe6', skyHorizon: '#fdf7ef', mist: '#fbfaf6', farTint: '#d9e4f1', sunGlow: '#ffd2bd', sun: [0.25, 0.22, -1], fog: 0.00135, hfog: 0.7, light: [-0.55, 0.75, 0.45], tint: '#ffffff', shadow: '#b4c6dc' },
    正午: { skyTop: '#4a92e6', skyHorizon: '#eef5f8', mist: '#f5f9fa', farTint: '#d0e1f3', sunGlow: '#fff4dc', sun: [0.1, 0.75, -0.6], fog: 0.0011, hfog: 0.45, light: [-0.2, 0.95, 0.25], tint: '#fffcf6', shadow: '#bccbdc' },
    黄昏: { skyTop: '#7c84b6', skyHorizon: '#f8cfb2', mist: '#f4e3d6', farTint: '#dccbdc', sunGlow: '#ff9a72', sun: [-0.7, 0.1, -0.7], fog: 0.0016, hfog: 0.8, light: [-0.75, 0.32, -0.55], tint: '#ffd9bf', shadow: '#b3acd2' },
  };
  const RAIN = { skyTop: '#9aa9bc', skyHorizon: '#e7eaec', mist: '#eaedee', farTint: '#d3dae2', sunGlow: '#e3e3e3' };
  const ORDER = ['清晨', '正午', '黄昏'];
  const st = { time: '清晨', rainOn: false, rain: 0 };
  const tmpC = new THREE.Color(), tmpC2 = new THREE.Color(), sun = new THREE.Vector3();
  const reflBase = waterUniforms.uReflect.value;

  // 雨丝：围着镜头的一团斜线，循环下落
  const N = 2200, BOX = 70, HGT = 40;
  const drops = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { drops[i * 3] = (Math.random() - 0.5) * BOX; drops[i * 3 + 1] = Math.random() * HGT; drops[i * 3 + 2] = (Math.random() - 0.5) * BOX; }
  const pos = new Float32Array(N * 6);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xa9bccb, transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(geo, mat);
  rain.frustumCulled = false; rain.visible = false;
  scene.add(rain);
  const slant = new THREE.Vector3(0.12, -1, 0.05).normalize();

  function lerpColor(u, a, b, k, rate) {
    tmpC.set(a); tmpC2.set(b); tmpC.lerp(tmpC2, k);
    u.value.lerp(tmpC, rate);
  }

  return {
    get time() { return st.time; },
    get raining() { return st.rainOn; },
    cycleTime() { st.time = ORDER[(ORDER.indexOf(st.time) + 1) % ORDER.length]; return st.time; },
    toggleRain() { st.rainOn = !st.rainOn; return st.rainOn; },
    set(time, rainOn) { if (time) st.time = time; if (rainOn !== undefined) st.rainOn = rainOn; },
    snap() {   // 立即到位（截图 / 调试用）
      st.rain = st.rainOn ? 1 : 0;
      for (let i = 0; i < 60; i++) this.update(0.2);
    },
    update(dt) {
      st.rain += ((st.rainOn ? 1 : 0) - st.rain) * Math.min(1, dt * 0.35);
      const r = st.rain, P = PRESETS[st.time], k = Math.min(1, dt * 0.9);
      lerpColor(U.uSkyTop, P.skyTop, RAIN.skyTop, r * 0.8, k);
      lerpColor(U.uSkyHorizon, P.skyHorizon, RAIN.skyHorizon, r * 0.7, k);
      lerpColor(U.uMist, P.mist, RAIN.mist, r * 0.7, k);
      lerpColor(U.uFarTint, P.farTint, RAIN.farTint, r * 0.7, k);
      lerpColor(U.uSunGlow, P.sunGlow, RAIN.sunGlow, r * 0.9, k);
      lerpColor(U.uSceneTint, P.tint, '#f2f4f6', r * 0.8, k);
      lerpColor(U.uShadowTint, P.shadow, '#c4ccd6', r * 0.8, k);
      U.uShadowStrength.value += ((0.6 - r * 0.45) - U.uShadowStrength.value) * k;
      U.uLightDir.value.lerp(sun.set(...P.light).normalize(), k).normalize();
      sun.set(...P.sun).normalize();
      U.uSunDir.value.lerp(sun, k).normalize();
      U.uFogDensity.value += (P.fog * (1 + r * 0.7) - U.uFogDensity.value) * k;
      U.uHeightFogStrength.value += (Math.min(1, P.hfog + r * 0.25) - U.uHeightFogStrength.value) * k;
      waterUniforms.uReflect.value += (reflBase * (1 - r * 0.35) - waterUniforms.uReflect.value) * k;

      // 雨丝
      rain.visible = r > 0.02;
      if (rain.visible) {
        mat.opacity = 0.6 * r;
        const cp = camera.position, fall = 26 * dt;
        for (let i = 0; i < N; i++) {
          let y = drops[i * 3 + 1] - fall;
          if (y < 0) y += HGT;
          drops[i * 3 + 1] = y;
          const x = cp.x + drops[i * 3] - slant.x * y * 0.3, z = cp.z + drops[i * 3 + 2], yy = cp.y - HGT * 0.45 + y;
          const L = 1.5;
          pos[i * 6] = x; pos[i * 6 + 1] = yy; pos[i * 6 + 2] = z;
          pos[i * 6 + 3] = x - slant.x * L; pos[i * 6 + 4] = yy - slant.y * L; pos[i * 6 + 5] = z - slant.z * L;
        }
        geo.attributes.position.needsUpdate = true;
        // 水面雨点：在玩家附近随机冒小涟漪
        const c = center();
        let n = r * 26 * dt;
        while (n > 0) {
          if (Math.random() < n) {
            const x = c.x + (Math.random() - 0.5) * 50, z = c.z + (Math.random() - 0.5) * 50;
            if (islandHeight(x, z) < -0.3) ripple(x, z, Math.random() * 0.25 + 0.12, 0.9);
          }
          n -= 1;
        }
      }
      return r;
    },
  };
}
