// 山水意境 · 短视频分镜（配合 capture.js）。每一镜：时长、时辰天气、初始摆位、每帧驱动（pre）、镜头（cam）。
// 字幕、开场宣纸、鱼卡、片尾都在 Remotion（promo/）里做，这里只出干净的游戏画面。
// 坐标备忘：主岛在原点附近；栈桥从 (-15.8,10) 伸到 (-29.3,18.6)，朝外方向 yaw≈-1.01；小船泊在 (-26.8,19.8)；
//          桥在 z=0、x≈29~40 之间，东边小岛亭子 (48.8,0.5)；荷塘 x 22~52、z 4~28；桃树 (-15,9)、(-3,6)；云中塔 (-25,?,-265)。

const PIER_OUT = -1.01;   // 栈桥朝湖面的方向

export const SHOTS = {
  // ① 钩子：御剑穿过峰林，奔向云中塔
  fly: {
    dur: 4, time: '清晨', warm: 6,
    setup(T, st) {
      T.G.skipIntro();
      T.place(-6, 2, -3.0);
      st.yaw = Math.atan2(-25 + 6, -265 - 2);
    },
    pre(T, st, t) {
      T.driveCam(st.yaw, 0.12, 9);
      st.once('q', () => T.keys.tap('q'));
      if (t < -0.6) T.keys.hold(' '); else T.keys.release(' ');
      if (t > -5) T.keys.hold('w');
      if (t > -1) T.keys.hold('shift');
    },
    cam(T, st, t) {
      const h = T.G.hero.position, k = (t + 4) / 8;
      const side = T.lerp(3.0, 1.4, k);
      const back = 7.5, yaw = st.yaw;
      const p = [h.x - Math.sin(yaw) * back + Math.cos(yaw) * side, h.y + 3.2, h.z - Math.cos(yaw) * back - Math.sin(yaw) * side];
      T.setCam(p, [h.x + Math.sin(yaw) * 30, h.y - 7, h.z + Math.cos(yaw) * 30], 60);
    },
  },

  // ②③ 入画：开场宣纸散开后，镜头从高空俯冲进山水（游戏自带的开场运镜）
  intro: {
    dur: 6, time: '清晨', warm: 0,
    setup(T) { T.G.enter(); },
  },

  // ④ 西塞山前白鹭飞：清晨峰林，雁阵掠过
  dawn: {
    dur: 4.5, time: '清晨', warm: 2,
    setup(T) { T.G.skipIntro(); T.W.U.uTime.value = 128; },
    cam(T, st, t) {
      const k = T.ease(Math.min(1, Math.max(0, t / 4.5)));
      T.setCam(T.mix3([-40, 5, 52], [-36, 13, 47], k), T.mix3([-4, 26, -100], [-4, 30, -100], k), 55);
    },
  },

  // ⑤ 桃树下漫步
  walk: {
    dur: 3.5, time: '清晨', warm: 1.2,
    setup(T, st) { T.G.skipIntro(); T.place(-16.3, 10.3, 1.9); st.yaw = 1.9; },
    pre(T, st, t) { T.driveCam(st.yaw, 0.2); T.keys.hold('w'); },
    cam(T, st, t) {
      // 斜后方跟拍：主角走在桃树下，镜头在右后方偏低
      const h = T.G.hero.position, y = st.yaw, fx = Math.sin(y), fz = Math.cos(y);
      T.setCam([h.x - fx * 4.2 + fz * 2.0, h.y + 1.6, h.z - fz * 4.2 - fx * 2.0], [h.x + fx * 2.5 - fz * 0.5, h.y + 1.6, h.z + fz * 2.5 + fx * 0.5], 52);
    },
  },

  // ⑥⑦⑧ 桃花流水鳜鱼肥：栈桥尽头抛竿 → 咬钩 → 收竿（鱼卡在 Remotion 里叠）
  fish: {
    dur: 6.5, time: '正午', warm: 1,
    setup(T, st) {
      T.G.skipIntro();
      const p = T.W.pierG.localToWorld(new T.THREE.Vector3(10.6, 0, 0));
      T.place(p.x, p.z, PIER_OUT);
    },
    pre(T, st, t) {
      T.driveCam(PIER_OUT, 0.2);
      const F = T.G.S.fish;
      if (t >= 0.2 && !st.cast) { st.cast = true; T.keys.tap('f'); }
      if (F.st === 'waiting' && !st.wait) { st.wait = true; F.wait = 1.6; }
      if (F.st === 'bite' && F.t > 0.3 && !st.reel) { st.reel = true; T.keys.tap('f'); }
    },
    cam(T, st, t) {
      const h = T.G.hero.position, y = PIER_OUT, k = T.ease(Math.min(1, t / 6.5));
      const back = T.lerp(6.5, 4.8, k), side = 1.6;
      T.setCam([h.x - Math.sin(y) * back + Math.cos(y) * side, h.y + T.lerp(2.6, 2.2, k), h.z - Math.cos(y) * back - Math.sin(y) * side],
        [h.x + Math.sin(y) * 8, h.y + 0.6, h.z + Math.cos(y) * 8], 50);
    },
  },

  // ⑨ 青箬笠，绿蓑衣：斗笠背影，走向小船，登船
  board: {
    dur: 4, time: '正午', warm: 1,
    setup(T, st) {
      T.G.skipIntro();
      const p = T.W.pierG.localToWorld(new T.THREE.Vector3(6.5, 0, 0));
      T.place(p.x, p.z, PIER_OUT);
    },
    pre(T, st, t) {
      T.driveCam(PIER_OUT, 0.2);
      if (t < 1.6) T.keys.hold('w'); else T.keys.release('w');
      if (t >= 1.9 && !st.boarded) { st.boarded = true; T.keys.tap('e'); }
    },
    cam(T, st, t) {
      const h = T.G.hero.position, y = PIER_OUT;
      T.setCam([h.x - Math.sin(y) * 2.6 - Math.cos(y) * 0.6, h.y + 2.5, h.z - Math.cos(y) * 2.6 + Math.sin(y) * 0.6], [h.x + Math.sin(y) * 6, h.y + 0.6, h.z + Math.cos(y) * 6], 55);
    },
  },

  // ⑩ 泛舟：穿过荷塘，从桥洞下划过
  row: {
    dur: 4.5, time: '正午', warm: 1.5,
    setup(T, st) {
      T.G.skipIntro();
      T.place(-26.8, 17.5, PIER_OUT);
    },
    pre(T, st, t) {
      const B = T.G.pBoat;
      st.once('e', () => T.keys.tap('e'));
      if (!st.placed && T.G.S.mode === 'boat') { st.placed = true; B.position.set(33.6, 0, 16); B.rotation.y = Math.PI / 2; T.G.S.boat.speed = 2.6; }
      T.driveCam(Math.PI, 0.2);
      T.keys.hold('w');
    },
    cam(T, st, t) {
      const B = T.G.pBoat.position;
      T.setCam([B.x + 1.1, 2.0, B.z + 6.5], [B.x + 0.5, 2.2, B.z - 8], 52);
    },
  },

  // ⑪ 斜风细雨不须归：黄昏细雨，湖上一叶扁舟
  rain: {
    dur: 4.5, time: '黄昏', rain: true, warm: 2,
    setup(T, st) {
      T.G.skipIntro();
      T.place(-26.8, 17.5, PIER_OUT);
    },
    pre(T, st, t) {
      const B = T.G.pBoat;
      st.once('e', () => T.keys.tap('e'));
      if (!st.placed && T.G.S.mode === 'boat') { st.placed = true; B.position.set(-36, 0, 38); B.rotation.y = 0.5; T.G.S.boat.speed = 1.2; }
      T.driveCam(-1.2, 0.2);
      T.keys.hold('w');
    },
    cam(T, st, t) {
      const B = T.G.pBoat.position;
      T.setCam([B.x - 4, 2.8, B.z + 12], [B.x + 1.5, 5, B.z - 18], 52);
    },
  },

  // ⑫ 黄昏御剑，越飞越远
  away: {
    dur: 4, time: '黄昏', warm: 0.6,
    setup(T, st) {
      T.G.skipIntro();
      const p = T.W.pierG.localToWorld(new T.THREE.Vector3(10.6, 0, 0));
      T.place(p.x, p.z, PIER_OUT);
      st.yaw = PIER_OUT - 0.25;
      st.cam = null;
    },
    pre(T, st, t) {
      T.driveCam(st.yaw, -0.06, 9);
      if (t >= 0.3) st.once('q', () => T.keys.tap('q'));
      if (t > 1.0) T.keys.hold('w');
      if (t > 1.6) T.keys.hold('shift');
    },
    cam(T, st, t) {
      // 机位固定在主角身后，看着他起飞、沿视线越飞越远，没入暮色峰林
      if (!st.cam) {
        const h = T.G.hero.position, fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
        st.cam = [h.x - fx * 9 + fz * 1.2, h.y + 2.6, h.z - fz * 9 - fx * 1.2];
        st.tgt = [h.x + fx * 40, h.y + 11, h.z + fz * 40];
      }
      T.setCam(st.cam, st.tgt, 55);
    },
  },

  // ⑬ 落款：黄昏云中塔，镜头缓推（宣纸淡出与题字在 Remotion 里）
  end: {
    dur: 6, time: '黄昏', warm: 2,
    setup(T) { T.G.skipIntro(); },
    cam(T, st, t) {
      const k = T.ease(Math.min(1, t / 6));
      T.setCam(T.mix3([12, 54, -165], [6, 54, -180], k), [-25, 50, -265], 50);
    },
  },
};
