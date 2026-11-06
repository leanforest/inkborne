// 山水意境 · 程序化音频（WebAudio 现场合成，不依赖音频文件）
// 配乐：五声音阶（D 宫）的古琴拨弦 + 偶尔一段箫；环境：水声、鸟鸣、风声、雨声；玩法音效。
// 浏览器要求用户交互后才能出声，所以 start() 必须在点击里调用。

export function createAudio() {
  let ctx = null, master, music, amb, sfxBus, verb;
  let noiseBuf = null;
  const st = { muted: false, mood: '清晨', rain: 0, birds: true };
  const loops = {};
  let waterK = 1;
  const vols = { master: 0.9, music: 0.9, amb: 1, sfx: 0.9 };

  const rnd = (a, b) => a + (b - a) * Math.random();
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function makeNoise() {
    const len = ctx.sampleRate * 4;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.35 + last * 3.0; }
    }
    return b;
  }
  function makeImpulse(sec = 3.2) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return b;
  }
  function loopNoise(chain, gain = 0) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    src.loopStart = Math.random() * 2;
    const g = ctx.createGain(); g.gain.value = gain;
    let node = src;
    for (const f of chain) { node.connect(f); node = f; }
    node.connect(g); g.connect(amb);
    src.start();
    return { g, chain };
  }
  function burst({ dur = 0.3, type = 'bandpass', f0 = 800, f1 = null, q = 1, gain = 0.3, bus = null, delay = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus || sfxBus);
    src.start(t, Math.random() * 3); src.stop(t + dur + 0.05);
  }
  function tone({ f0, f1 = null, dur = 0.2, type = 'sine', gain = 0.2, bus = null, delay = 0, attack = 0.01, pan = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    o.connect(g); out.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ── 古琴：Karplus-Strong 拨弦（延迟线 + 低通反馈），离线算好按音高缓存；琴身用两段共鸣峰 + 低通
  const ksCache = new Map();
  function ksBuffer(freq, dur) {
    const key = Math.round(freq * 10) + ':' + dur;
    if (ksCache.has(key)) return ksCache.get(key);
    const sr = ctx.sampleRate, len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, len, sr), y = buf.getChannelData(0);
    const P = sr / freq, N = Math.floor(P), frac = P - N;
    // 激励：拨弦位置在弦长 1/7 处（梳状）+ 低通过的噪声，音色温润
    const exc = new Float32Array(N + 2);
    let lp = 0;
    for (let i = 0; i < N + 2; i++) { lp += 0.5 * ((Math.random() * 2 - 1) - lp); exc[i] = lp; }
    const pick = Math.max(1, Math.floor(N / 7));
    for (let i = N + 1; i >= pick; i--) exc[i] -= exc[i - pick];
    // 衰减：低音更长；反馈低通让高频先衰减（像丝弦）
    const T60 = Math.min(dur, 2.2 + 220 / freq);
    const g = Math.pow(10, -3 / (T60 * freq));
    for (let n = 0; n < len; n++) {
      const x = n < N + 2 ? exc[n] : 0;
      const a = n - N >= 0 ? y[n - N] : 0, b = n - N - 1 >= 0 ? y[n - N - 1] : 0;
      y[n] = x + g * ((1 - frac) * (0.5 * a + 0.5 * b) + frac * b);
    }
    let peak = 0; for (let n = 0; n < Math.min(len, sr * 0.2); n++) peak = Math.max(peak, Math.abs(y[n]));
    const k = 0.9 / (peak || 1); for (let n = 0; n < len; n++) y[n] *= k;
    ksCache.set(key, buf);
    return buf;
  }
  let qinBody = null;
  function body() {
    if (qinBody) return qinBody;
    const b1 = ctx.createBiquadFilter(); b1.type = 'peaking'; b1.frequency.value = 180; b1.Q.value = 1.2; b1.gain.value = 5;
    const b2 = ctx.createBiquadFilter(); b2.type = 'peaking'; b2.frequency.value = 520; b2.Q.value = 1.5; b2.gain.value = 3;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.5;
    b1.connect(b2); b2.connect(lp); lp.connect(music);
    qinBody = b1;
    return b1;
  }
  function qin(freq, when, vel = 1, dur = 4.5) {
    const t = when;
    const src = ctx.createBufferSource(); src.buffer = ksBuffer(freq, dur);
    // 吟猱：轻微颤音；上滑：从下方小三度左右滑进
    const r = Math.random();
    if (r < 0.18) { src.playbackRate.setValueAtTime(0.92, t); src.playbackRate.exponentialRampToValueAtTime(1, t + 0.22); }
    else if (r < 0.5) {
      const l = ctx.createOscillator(); l.frequency.value = 4.2;
      const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(0.008, t + 0.7);
      l.connect(lg); lg.connect(src.playbackRate); l.start(t); l.stop(t + dur);
    }
    const g = ctx.createGain(); g.gain.value = 0.32 * vel;
    src.connect(g); g.connect(body());
    src.start(t); src.stop(t + dur);
  }

  // ── 箫：正弦 + 颤音 + 气声
  function xiao(freq, when, dur = 2.4) {
    const t = when;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const l = ctx.createOscillator(); l.frequency.value = 5.2;
    const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(freq * 0.008, t + dur * 0.6);
    l.connect(lg); lg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.35); g.gain.setValueAtTime(0.07, t + dur - 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    o.connect(lp); lp.connect(g); g.connect(music);
    o.start(t); l.start(t); o.stop(t + dur + 0.1); l.stop(t + dur + 0.1);
    burst({ dur, type: 'bandpass', f0: freq * 2, q: 6, gain: 0.012, bus: music, delay: Math.max(0, t - ctx.currentTime) });
  }

  // ── 生成式配乐：五声音阶随机游走，一句 4~7 个音，句间留白
  const SCALE = [0, 2, 4, 7, 9];          // 宫 商 角 徵 羽
  const BASE = 146.83;                     // D3
  const deg2f = (d) => BASE * Math.pow(2, (SCALE[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5)) / 12);
  let deg = 5, musicTimer = 0;
  function phrase() {
    if (!ctx) return;
    const slow = st.mood === '黄昏' ? 1.35 : 1;
    let t = ctx.currentTime + 0.1;
    if (Math.random() < 0.7) qin(deg2f(pick([0, -3, -5])) / 1, t, 0.8, 5);      // 低音“散音”定调
    const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      deg = Math.max(2, Math.min(12, deg + pick([-2, -1, -1, 1, 1, 2, 0])));
      t += rnd(0.38, 0.95) * slow;
      qin(deg2f(deg), t, rnd(0.6, 1));
      if (Math.random() < 0.15) qin(deg2f(deg + 5), t + 0.02, 0.4);            // 泛音式的八度
    }
    if (Math.random() < 0.3) xiao(deg2f(pick([7, 8, 9, 10])) * 2, t + rnd(1, 2), rnd(2.2, 3.4));
    const rest = (rnd(4, 9) + (st.rain > 0.5 ? 4 : 0)) * slow;
    musicTimer = setTimeout(phrase, (t - ctx.currentTime + rest) * 1000);
  }

  // ── 鸟鸣：几声上扬的啁啾，左右随机
  let birdTimer = 0;
  function birds() {
    if (ctx && st.birds && st.rain < 0.4) {
      const f = rnd(2600, 4600), pan = rnd(-0.8, 0.8), n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) tone({ f0: f * rnd(0.95, 1.05), f1: f * rnd(1.15, 1.45), dur: rnd(0.05, 0.11), gain: rnd(0.008, 0.02), bus: amb, delay: i * rnd(0.09, 0.16), attack: 0.008, pan });
    }
    birdTimer = setTimeout(birds, rnd(6, 16) * 1000);
  }

  return {
    get started() { return !!ctx; },
    get state() { return ctx ? ctx.state : 'off'; },
    vols,
    setVol(name, v) {
      vols[name] = v;
      if (!ctx) return;
      const node = { master, music, amb, sfx: sfxBus }[name];
      if (name === 'master' && st.muted) return;
      node.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
    },
    resume() { if (ctx && ctx.state !== 'running') ctx.resume(); },
    demo(what) {
      if (!ctx) return;
      const t = ctx.currentTime + 0.05;
      if (what === 'qin') [5, 6, 7, 9, 7].forEach((d, i) => qin(deg2f(d), t + i * 0.5));
      if (what === 'xiao') xiao(deg2f(8) * 2, t, 3);
      if (what === 'bird') birds.once ? birds.once() : null;
    },
    start() {
      if (ctx) return;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuf = makeNoise();
      master = ctx.createGain(); master.gain.value = 0;
      master.gain.linearRampToValueAtTime(vols.master, ctx.currentTime + 3);
      master.connect(ctx.destination);
      verb = ctx.createConvolver(); verb.buffer = makeImpulse();
      const verbG = ctx.createGain(); verbG.gain.value = 0.55; verb.connect(verbG); verbG.connect(master);
      music = ctx.createGain(); music.gain.value = vols.music; music.connect(master); music.connect(verb);
      amb = ctx.createGain(); amb.gain.value = vols.amb; amb.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = vols.sfx; sfxBus.connect(master);
      const sfxVerb = ctx.createGain(); sfxVerb.gain.value = 0.25; sfxBus.connect(sfxVerb); sfxVerb.connect(verb);
      // 环境声：水（低通的起伏噪声）、风、雨
      const mk = (type, freq, q = 0.7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; };
      loops.water = loopNoise([mk('lowpass', 420), mk('highpass', 90)], 0.06);
      loops.lap = loopNoise([mk('bandpass', 260, 0.9)], 0);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09; const lg = ctx.createGain(); lg.gain.value = 0.04;
      lfo.connect(lg); lg.connect(loops.water.g.gain); lfo.start();
      loops.wind = loopNoise([mk('bandpass', 380, 0.8)], 0);
      loops.rain = loopNoise([mk('highpass', 1400), mk('lowpass', 7500)], 0);
      // 拍岸：每 2.5~5 秒一次缓慢的涌起与退去
      const lap = () => { if (!ctx) return; const t = ctx.currentTime, g = loops.lap.g.gain, a = rnd(0.03, 0.07) * waterK;
        g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(a, t + rnd(0.6, 1.1)); g.linearRampToValueAtTime(0.004, t + rnd(2, 3));
        setTimeout(lap, rnd(2500, 5000)); };
      setTimeout(lap, 800);
      // 滴水：偶尔一两声清亮的水滴
      const drip = () => { if (!ctx) return; if (waterK > 0.4 && st.rain < 0.3) { const f = rnd(900, 1500), p = rnd(-0.6, 0.6);
          tone({ f0: f, f1: f * 0.55, dur: 0.09, gain: 0.012 * waterK, bus: amb, attack: 0.004, pan: p });
          if (Math.random() < 0.4) tone({ f0: f * 1.3, f1: f * 0.7, dur: 0.07, gain: 0.008 * waterK, bus: amb, attack: 0.004, pan: p, delay: rnd(0.08, 0.2) }); }
        setTimeout(drip, rnd(1500, 6000)); };
      setTimeout(drip, 2000);
      setTimeout(phrase, 1500);
      setTimeout(birds, 2500);
    },
    toggleMute() {
      if (!ctx) return st.muted;
      st.muted = !st.muted;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(st.muted ? 0 : vols.master, ctx.currentTime + 0.4);
      return st.muted;
    },
    // 每帧调用：k ∈ [0,1]
    setWind(k, alt = 0) {
      if (!ctx) return;
      const t = ctx.currentTime;
      loops.wind.g.gain.setTargetAtTime(k * 0.3 + (alt > 20 ? Math.min(alt / 300, 1) * 0.05 : 0), t, 0.25);
      loops.wind.chain[0].frequency.setTargetAtTime(300 + k * 900, t, 0.3);
    },
    setRain(k) {
      st.rain = k;
      if (!ctx) return;
      loops.rain.g.gain.setTargetAtTime(k * 0.22, ctx.currentTime, 0.5);

    },
    setWater(k) { waterK = k; if (ctx) loops.water.g.gain.setTargetAtTime(0.02 + k * 0.05 + st.rain * 0.03, ctx.currentTime, 0.6); },
    setBirds(on) { st.birds = on; },
    // 录音轨用：把总线接到外部节点（如采样器），返回 AudioContext
    tap(node) { if (ctx && node) master.connect(node); return ctx; },
    setMood(m) { st.mood = m; },
    sfx: {
      oar() { burst({ dur: 0.35, type: 'bandpass', f0: 900, f1: 400, q: 0.8, gain: 0.09 }); burst({ dur: 0.18, type: 'lowpass', f0: 300, gain: 0.05, delay: 0.05 }); },
      cast() { burst({ dur: 0.45, type: 'bandpass', f0: 2600, f1: 500, q: 1.5, gain: 0.08 }); },
      plop() { tone({ f0: 520, f1: 140, dur: 0.14, gain: 0.12 }); burst({ dur: 0.2, type: 'lowpass', f0: 1200, gain: 0.06 }); },
      nibble() { tone({ f0: 700, f1: 300, dur: 0.07, gain: 0.04 }); },
      bite() { for (let i = 0; i < 3; i++) { tone({ f0: 620, f1: 160, dur: 0.12, gain: 0.12, delay: i * 0.13 }); burst({ dur: 0.18, type: 'lowpass', f0: 1600, gain: 0.08, delay: i * 0.13 }); } },
      splash() { burst({ dur: 0.7, type: 'lowpass', f0: 2600, f1: 500, gain: 0.18 }); burst({ dur: 0.3, type: 'highpass', f0: 3000, gain: 0.05, delay: 0.05 }); },
      chime() { if (!ctx) return; const t = ctx.currentTime + 0.05; [9, 11, 12, 14].forEach((d, i) => qin(deg2f(d), t + i * 0.13, 0.9, 2.6)); },
      miss() { if (!ctx) return; qin(deg2f(3), ctx.currentTime + 0.02, 0.6, 1.6); qin(deg2f(1), ctx.currentTime + 0.25, 0.5, 2); },
      swordUp() {
        burst({ dur: 0.9, type: 'bandpass', f0: 600, f1: 2400, q: 1.2, gain: 0.12 });
        for (const det of [1, 1.006, 1.5]) tone({ f0: 330 * det, f1: 990 * det, dur: 1.1, gain: 0.035, attack: 0.15 });
      },
      land() { burst({ dur: 0.6, type: 'bandpass', f0: 1800, f1: 300, q: 1, gain: 0.08 }); tone({ f0: 880, f1: 440, dur: 0.6, gain: 0.025, attack: 0.05 }); },
      board() { burst({ dur: 0.3, type: 'lowpass', f0: 500, gain: 0.12 }); tone({ f0: 180, f1: 120, dur: 0.25, gain: 0.08 }); },
      toggle() { if (ctx) qin(deg2f(7), ctx.currentTime + 0.02, 0.5, 2); },
    },
  };
}
