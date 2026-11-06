// 山水意境 · 横屏短视频分镜（16:9，配合 capture.js 的 ?set=wide）。方案见 docs/横屏短视频脚本.md。
// 节奏网格 120 BPM：1 小节 = 2 秒。每镜录得比场景略长，剪辑在 Remotion（promo/src/wide/）里按小节裁。
// 原则：小人大景——不拍人物特写、地形贴图近景、石板路近景，主角最多占画面高度 1/4。
// 坐标备忘见 shots.js 开头；另：主岛二层楼阁台基 (5, -3)，东岛亭子 ting (48.8, 2, 0.5)，峰台楼阁 hall (100, 33.6, -110)，
//       船夫的船 boat2 沿 x = 40 + sin(0.02t)·20、z = 45 往返；雁阵领头 (-10 + 110cos(0.035t), 64, -70 + 80sin(0.035t))。

const PIER_OUT = -1.01;            // 栈桥朝湖面的方向
const PAGODA = [-25, 50, -265];    // 云中塔
const DUSK_YAW = -2.0;             // 栈桥尽头迎着黄昏天光的朝向（蓄力、起飞共用）
const clamp01 = (x) => Math.min(1, Math.max(0, x));
// 世界时间对齐：让雁阵、船夫在 t=0 时正好处于想要的位置（uTime 在预热期间照常推进）
const HALL = [100, 38, -110];      // 峰台楼阁（主峰台顶）
const hideBirds = (T) => T.W.scene.traverse((o) => { if (o.userData && o.userData.lw) o.visible = false; });
const syncTime = (T, st, t, t0) => st.once('time', () => { T.W.U.uTime.value = t0 + t; });

export const SHOTS = {
  // ①② 画 → 入画：前 2 秒几乎静止（看起来像一幅立轴），之后加速俯冲穿云，露出湖岛全貌
  hook: {
    dur: 6.5, time: '清晨', warm: 2,
    setup(T) { T.G.skipIntro(); },
    cam(T, st, t) {
      const A = [46, 96, 150], At = [-20, 46, -210];   // 云上远眺峰林与云中塔
      const B = [-44, 14, 62], Bt = [0, 6, -20];       // 湖岛全景
      const creep = 0.025 * clamp01(t / 2);
      const k = creep + (1 - 0.025) * T.ease(clamp01((t - 2) / 4));
      const p = T.mix3(A, B, k), tg = T.mix3(At, Bt, k);
      p[1] += Math.sin(Math.PI * k) * 10;               // 下冲路径略微上拱，先压云再穿云
      T.setCam(p, tg, T.lerp(40, 46, k));
    },
  },

  // ③ 峰台楼阁：清晨云海里石柱顶上的二层楼阁，镜头绕楼阁缓缓横移，前景云团带出视差
  //    （原“晨雁”镜头弃用：低模的鸟一拍近就是黑色多边形，这一镜把鸟隐藏）
  hall: {
    dur: 3, time: '清晨', warm: 1.5,
    setup(T) { T.G.skipIntro(); hideBirds(T); },
    cam(T, st, t) {
      const k = T.ease(t / 3), a = T.lerp(0.28, 0.5, k);
      T.setCam([HALL[0] + Math.sin(a) * 60, T.lerp(43, 45, k), HALL[2] + Math.cos(a) * 60], [HALL[0], 40, HALL[2]], 40);
    },
  },

  // ④ 桃花：主岛桃树下，低机位，花瓣飘落，远处湖面与峰林
  peach: {
    dur: 3, time: '正午', warm: 1.5,
    setup(T) { T.G.skipIntro(); T.place(-29, 18.4, PIER_OUT); },
    cam(T, st, t) {
      const k = T.ease(t / 3);
      T.setCam(T.mix3([-22, 4.5, 17], [-21, 4.5, 16], k), [5, 9, -3], 44);
    },
  },

  // ⑤ 湖舟：贴水面，船夫的船慢慢划过，远处拱桥与东岛楼阁
  boatman: {
    dur: 3, time: '正午', warm: 1.5,
    setup(T) { T.G.skipIntro(); },
    pre(T, st, t) { syncTime(T, st, t, 0); },
    cam(T, st, t) {
      const b = T.W.boat2.position;
      T.setCam([b.x - 7 + t * 0.6, 0.9, b.z + 9], [b.x + 4, 2.2, b.z - 30], 40);
    },
  },

  // ⑥ 细雨：湖上全景，渔夫的一叶扁舟（myBoat 绕 (-30, 30) 慢慢转圈），雨丝和满湖涟漪
  //    主角不上船：之前摆的主角小船会划进渔夫船的路线、两船穿模
  rain: {
    dur: 3, time: '正午', rain: true, warm: 2,
    setup(T) { T.G.skipIntro(); T.place(46, 0.5, 0); },   // 主角放到东岛亭子里，不入画
    cam(T, st, t) {
      T.setCam([-30 + t * 0.4, 4, 62], [-20 + t * 0.4, 7, -10], 42);
    },
  },

  // ⑦ 暮色：东岛楼阁、桃花、暖色天光，远处云中塔与峰台楼阁（参考 tools/snaps/p3_dusk.png）
  dusk: {
    dur: 3, time: '黄昏', warm: 2,
    setup(T) { T.G.skipIntro(); T.place(-29, 18.4, PIER_OUT); },
    cam(T, st, t) {
      const k = T.ease(t / 3);
      T.setCam(T.mix3([-14, 9, 16], [-13.4, 8.9, 15.2], k), [10, 7, -30], 46);
    },
  },

  // ⑧ 蓄力：栈桥尽头的背影，面前是黄昏湖面与峰林，镜头后拉、升高，人越来越小
  gaze: {
    dur: 3, time: '黄昏', warm: 1,
    setup(T, st) {
      T.G.skipIntro();
      const p = T.W.pierG.localToWorld(new T.THREE.Vector3(10.6, 0, 0));
      st.yaw = DUSK_YAW;
      T.place(p.x, p.z, st.yaw);
    },
    pre(T, st) { T.driveCam(st.yaw, 0.1); },
    cam(T, st, t) {
      const h = T.G.hero.position, fx = Math.sin(st.yaw), fz = Math.cos(st.yaw), k = T.ease(t / 3);
      const back = T.lerp(6, 13, k), up = T.lerp(2.0, 4.5, k);
      T.setCam([h.x - fx * back + fz * 0.8, h.y + up, h.z - fz * back - fx * 0.8], [h.x + fx * 40, h.y + 3.5, h.z + fz * 40], 46);
    },
  },

  // ⑨ 御剑起飞：同一地点同一朝向，冲天而起，镜头跟在身后拔高
  takeoff: {
    dur: 4.5, time: '黄昏', warm: 0.6,
    setup(T, st) {
      T.G.skipIntro();
      const p = T.W.pierG.localToWorld(new T.THREE.Vector3(10.6, 0, 0));
      st.yaw = DUSK_YAW;
      T.place(p.x, p.z, st.yaw);
    },
    pre(T, st, t) {
      T.driveCam(st.yaw, 0.05, 9);
      if (t >= 0.05) st.once('q', () => T.keys.tap('q'));
      if (t > 0.1 && t < 2.6) T.keys.hold(' '); else T.keys.release(' ');
      if (t > 0.5) T.keys.hold('w');
      if (t > 1.2) T.keys.hold('shift');
    },
    cam(T, st, t, d) {
      // 滞后跟随：人先冲天而起，镜头再慢半拍追上去，起飞的冲劲才出得来
      const h = T.G.hero.position, fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
      const want = [h.x - fx * 9 + fz * 1.0, h.y + 2.4, h.z - fz * 9 - fx * 1.0];
      const look = [h.x + fx * 20, h.y + 2, h.z + fz * 20];
      if (!st.cp || t <= 0) { st.cp = want.slice(); st.cl = look.slice(); }
      const lag = T.lerp(0.6, 0.18, clamp01((t - 0.4) / 1.8));
      const a = 1 - Math.exp(-(d || 1 / 30) / lag), b = 1 - Math.exp(-(d || 1 / 30) / 0.3);
      st.cp = st.cp.map((v, i) => v + (want[i] - v) * a);
      st.cl = st.cl.map((v, i) => v + (look[i] - v) * b);
      T.setCam(st.cp, st.cl, 50);
    },
  },

  // ⑩ 云海穿行：贴着云海疾飞，峰林两侧掠过，从云中塔边擦过（参考 tools/snaps/it_fly.png）
  cloudrun: {
    dur: 4.5, time: '黄昏', warm: 6,
    setup(T, st) {
      T.G.skipIntro();
      T.place(-6, 2, -3.0);
      st.yaw = Math.atan2(PAGODA[0] + 9 - -6, PAGODA[2] - 2);   // 略偏塔的右侧，擦塔而过
    },
    pre(T, st, t) {
      T.driveCam(st.yaw, 0.12, 9);
      st.once('q', () => T.keys.tap('q'));
      if (t < -1.2) T.keys.hold(' '); else T.keys.release(' ');
      if (t > -5) T.keys.hold('w');
      if (t > -3) T.keys.hold('shift');
    },
    cam(T, st, t) {
      const h = T.G.hero.position, yaw = st.yaw, k = clamp01(t / 4.5);
      const side = T.lerp(2.4, 1.2, k), back = 7.5;
      const p = [h.x - Math.sin(yaw) * back + Math.cos(yaw) * side, h.y + 3.0, h.z - Math.cos(yaw) * back - Math.sin(yaw) * side];
      T.setCam(p, [h.x + Math.sin(yaw) * 30, h.y - 5, h.z + Math.cos(yaw) * 30], 52);
    },
  },

  // ⑪ 落款：黄昏云中塔大全景，缓推后定住（宣纸淡出与题字在 Remotion 里）
  seal: {
    dur: 6.5, time: '黄昏', warm: 2,
    setup(T) { T.G.skipIntro(); },
    cam(T, st, t) {
      const k = T.ease(clamp01(t / 5));
      T.setCam(T.mix3([22, 56, -150], [14, 55, -168], k), PAGODA, 40);
    },
  },
};
