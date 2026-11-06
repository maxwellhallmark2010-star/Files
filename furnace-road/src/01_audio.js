// ─────────────────────────────────────────────────────────────────────────────
// Audio, all synthesised: an inline-six engine (firing frequency follows RPM,
// filter opens with throttle), tyre squeal, wind, gravel, horn and one-shots.
// ─────────────────────────────────────────────────────────────────────────────
const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null;
  const L = {};            // continuous layers
  let hornOn = false, level = 1;

  function unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = Settings.sound ? level : 0;
      const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0);
      build();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(0, Math.random()); return s; }
  function build() {
    // engine
    const eg = ctx.createGain(); eg.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 2.5;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const o3 = ctx.createOscillator(); o3.type = 'triangle';
    const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain(); g1.gain.value = 0.5; g2.gain.value = 0.28; g3.gain.value = 0.5;
    o1.connect(g1); o2.connect(g2); o3.connect(g3); g1.connect(lp); g2.connect(lp); g3.connect(lp);
    const intake = noiseSrc(), ib = ctx.createBiquadFilter(); ib.type = 'bandpass'; ib.frequency.value = 700; ib.Q.value = 0.8;
    const ig = ctx.createGain(); ig.gain.value = 0; intake.connect(ib); ib.connect(ig); ig.connect(eg);
    lp.connect(eg); eg.connect(master);
    [o1, o2, o3].forEach((o) => o.start());
    Object.assign(L, { eg, lp, o1, o2, o3, ig, ib });
    // tyres, wind, gravel
    const mk = (type, f, q) => { const s = noiseSrc(), fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(master); return { g, fl }; };
    L.skid = mk('bandpass', 1900, 6); L.wind = mk('lowpass', 900, 0.5); L.road = mk('lowpass', 260, 1); L.grit = mk('bandpass', 3200, 0.9);
    L.glug = mk('bandpass', 420, 4);
    // horn
    const h1 = ctx.createOscillator(), h2 = ctx.createOscillator(); h1.type = h2.type = 'square'; h1.frequency.value = 349; h2.frequency.value = 440;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1800;
    const hg = ctx.createGain(); hg.gain.value = 0; h1.connect(hf); h2.connect(hf); hf.connect(hg); hg.connect(master); h1.start(); h2.start();
    L.horn = hg;
  }
  const set = (p, v, tc = 0.05) => p.setTargetAtTime(v, ctx.currentTime, tc);

  function tone(f, { to = null, dur = 0.2, type = 'sine', gain = 0.3, delay = 0 } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function burst({ dur = 0.2, gain = 0.3, type = 'lowpass', f = 800, q = 1, delay = 0 } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay, s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  // ── the radio: three procedurally played stations through a dash speaker ──
  const STATIONS = [
    { freq: '98.3', call: 'KDVL', genre: 'Desert Twang', bpm: 96, swing: 0 },
    { freq: '104.7', call: 'KZRO', genre: 'Night Drive', bpm: 104, swing: 0 },
    { freq: 'AM 1450', call: 'KRTL', genre: 'Rattlesnake Blues', bpm: 76, swing: 0.33, am: true },
  ];
  const R = { on: false, idx: 0, step: 0, nextT: 0, timer: null, bus: null, tone: null, crackle: null, phrase: [] };
  const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function radioBuild() {
    R.bus = ctx.createGain(); R.bus.gain.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
    R.tone = ctx.createBiquadFilter(); R.tone.type = 'lowpass'; R.tone.frequency.value = 6500;
    R.bus.connect(hp); hp.connect(R.tone); R.tone.connect(master);
    const n = noiseSrc(), nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2500; nf.Q.value = 0.6;
    R.crackle = ctx.createGain(); R.crackle.gain.value = 0; n.connect(nf); nf.connect(R.crackle); R.crackle.connect(R.bus);
  }
  function v(type, f, t, dur, gain, { cut = 3000, cutEnd = null, attack = 0.004, detune = 0, q = 1 } = {}) {
    const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(cut, t); fl.Q.value = q; if (cutEnd) fl.frequency.exponentialRampToValueAtTime(cutEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(R.bus); o.start(t); o.stop(t + dur + 0.05);
  }
  function hit(t, dur, gain, type, f, q = 1) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(R.bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function kick(t, g = 0.6) { const o = ctx.createOscillator(), a = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18); a.gain.setValueAtTime(g, t); a.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(a); a.connect(R.bus); o.start(t); o.stop(t + 0.35); }
  const pluck = (m, t, d, g) => { v('sawtooth', mf(m), t, d, g, { cut: 3200, cutEnd: 500 }); v('triangle', mf(m), t, d * 1.2, g * 0.6, { cut: 2000, detune: 7 }); };
  const PENT = { twang: [55, 57, 59, 62, 64, 67, 69, 71, 74], drive: [57, 60, 62, 64, 67, 69, 72, 74, 76], blues: [52, 55, 57, 58, 59, 62, 64, 67] };
  function newPhrase(scale, len, density) { const p = []; let i = Math.floor(scale.length / 2); for (let k = 0; k < len; k++) { if (Math.random() < density) { i = clamp(i + Math.round(rand(-2.4, 2.4)), 0, scale.length - 1); p.push(scale[i]); } else p.push(null); } return p; }
  function playStep(st, s, t, sd) {
    const bar = Math.floor(s / 16), k = s % 16;
    if (st.genre === 'Desert Twang') {                     // G C D G, boom-chick, brushes, twangy lead
      const roots = [43, 48, 50, 43][bar % 4], ch = [[55, 59, 62], [60, 64, 67], [62, 66, 69], [55, 59, 62]][bar % 4];
      if (k === 0 || k === 8) { v('triangle', mf(k === 0 ? roots : roots + 7), t, sd * 3.5, 0.22, { cut: 700 }); kick(t, 0.25); }
      if (k === 4 || k === 12) { ch.forEach((m, i) => pluck(m, t + i * 0.012, sd * 2.5, 0.05)); hit(t, 0.12, 0.08, 'bandpass', 3000, 0.7); }
      if (k % 2 === 1) hit(t, 0.05, 0.025, 'highpass', 6000);
      if (k === 0 && bar % 4 === 0) R.phrase = newPhrase(PENT.twang, 64, 0.42);
      const n = R.phrase[(bar % 4) * 16 + k]; if (n && k % 2 === 0) { pluck(n + 12, t, sd * 2.2, 0.07); v('sine', mf(n + 12) * 1.003, t + 0.01, sd * 2, 0.03); }
    } else if (st.genre === 'Night Drive') {               // Am F C G, four-on-the-floor, arps, pads
      const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], ch = chords[bar % 4];
      if (k % 4 === 0) kick(t, 0.5);
      if (k === 4 || k === 12) hit(t, 0.16, 0.14, 'bandpass', 1500, 0.8);
      if (k % 4 === 2) hit(t, 0.04, 0.05, 'highpass', 7000);
      if (k % 2 === 0) v('sawtooth', mf(ch[0] - 24 + (k % 4 === 2 ? 12 : 0)), t, sd * 1.6, 0.12, { cut: 600, cutEnd: 200 });
      v('square', mf(ch[k % 3] + 12 + (k % 8 >= 6 ? 12 : 0)), t, sd * 0.9, 0.03, { cut: 2200, cutEnd: 700 });
      if (k === 0) ch.forEach((m) => { v('sawtooth', mf(m), t, sd * 16, 0.022, { cut: 1100, attack: 0.4, detune: -8 }); v('sawtooth', mf(m), t, sd * 16, 0.022, { cut: 1100, attack: 0.4, detune: 8 }); });
      if (k === 0 && bar % 4 === 0) R.phrase = newPhrase(PENT.drive, 64, 0.22);
      const n = R.phrase[(bar % 4) * 16 + k]; if (n) v('triangle', mf(n + 12), t, sd * 3, 0.05, { cut: 3000, attack: 0.02 });
    } else {                                                // 12-bar shuffle in E, organ + walking bass, AM band
      const prog = [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7], r = 40 + prog[bar % 12];
      if (k % 4 === 0) { const walk = [0, 4, 7, 9][(k / 4) | 0]; v('triangle', mf(r + walk), t, sd * 3.5, 0.24, { cut: 600 }); }
      if (k % 4 === 0 || k % 4 === 3) { [r + 24, r + 28, r + 31, r + 34].forEach((m) => { v('sine', mf(m), t, sd * 1.8, 0.03); v('sine', mf(m) * 2, t, sd * 1.8, 0.012); }); }
      if (k === 4 || k === 12) hit(t, 0.14, 0.09, 'bandpass', 2500, 0.7);
      if (k % 4 === 0) hit(t, 0.06, 0.03, 'highpass', 5000);
      if (k === 0 && bar % 4 === 0) R.phrase = newPhrase(PENT.blues.map((m) => m + 12), 64, 0.3);
      const n = R.phrase[(bar % 4) * 16 + k]; if (n && k % 2 === 0) { v('sawtooth', mf(n), t, sd * 2.5, 0.045, { cut: 1600, cutEnd: 700 }); }
    }
  }
  function tick() {
    if (!R.on || !ctx) return;
    const st = STATIONS[R.idx], sd = 60 / st.bpm / 4;
    while (R.nextT < ctx.currentTime + 0.15) {
      const swing = st.swing && R.step % 2 === 1 ? sd * st.swing : 0;
      playStep(st, R.step, R.nextT + swing, sd);
      R.nextT += sd; R.step++;
    }
  }
  function applyRadio() {
    if (!ctx) return;
    if (!R.bus) radioBuild();
    const st = STATIONS[R.idx];
    set(R.bus.gain, R.on ? 0.55 : 0, 0.15);
    set(R.tone.frequency, st.am ? 2600 : 6500, 0.05);
    set(R.crackle.gain, R.on && st.am ? 0.035 : 0, 0.1);
    if (R.on && !R.timer) { R.nextT = ctx.currentTime + 0.35; R.step = 0; R.timer = setInterval(tick, 30); }
    if (!R.on && R.timer) { clearInterval(R.timer); R.timer = null; }
  }
  function tuneStatic() { burst({ dur: 0.45, gain: 0.18, type: 'bandpass', f: 2200, q: 0.5 }); }

  return {
    radioOn(on) { unlock(); R.on = on; applyRadio(); if (on) tuneStatic(); },
    radioNext() { unlock(); R.idx = (R.idx + 1) % STATIONS.length; if (R.on) { tuneStatic(); R.nextT = ctx.currentTime + 0.4; R.step = 0; } applyRadio(); },
    radioInfo() { return R.on ? STATIONS[R.idx] : null; },
    get radioIsOn() { return R.on; },
    motor(on) { if (!ctx) return; if (!L.motor) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 95; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; const g = ctx.createGain(); g.gain.value = 0; o.connect(f); f.connect(g); g.connect(master); o.start(); L.motor = g; } set(L.motor.gain, on ? 0.05 : 0, 0.05); },
    unlock,
    setEnabled() { if (master) set(master.gain, Settings.sound ? level : 0, 0.1); },
    setLevel(v) { level = v; if (master) set(master.gain, Settings.sound ? level : 0, 0.2); },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    // called every frame with the car's state
    update(s) {
      if (!ctx || !L.eg) return;
      const run = s.engineOn ? 1 : 0;
      const fire = (s.rpm / 60) * 3;               // inline-6, 4-stroke: 3 fires per revolution
      set(L.o1.frequency, fire, 0.03); set(L.o2.frequency, fire * 0.5, 0.03); set(L.o3.frequency, fire * 0.25, 0.03);
      set(L.lp.frequency, 260 + s.throttle * 1500 + s.rpm * 0.12, 0.05);
      set(L.eg.gain, run * (0.1 + s.throttle * 0.13 + s.rpm / 5200 * 0.06), 0.06);
      set(L.ig.gain, run * s.throttle * 0.35, 0.08); set(L.ib.frequency, 500 + s.rpm * 0.25, 0.08);
      set(L.skid.g.gain, clamp((s.slip - 0.12) * 0.9, 0, 0.32) * (s.onAsphalt ? 1 : 0.25), 0.05);
      const v = Math.abs(s.speed);
      const cab = s.windowsUp ? 0.3 : 1;        // rolled-up glass cuts the wind roar
      set(L.wind.g.gain, clamp(v * v / 2200, 0, 0.32) * cab, 0.2); set(L.wind.fl.frequency, (400 + v * 30) * (s.windowsUp ? 0.5 : 1), 0.2);
      set(L.road.g.gain, clamp(v / 40, 0, 0.25) * (s.onAsphalt ? 0.6 : 1) * (s.windowsUp ? 0.6 : 1), 0.1);
      set(L.grit.g.gain, s.onAsphalt ? 0 : clamp(v / 25, 0, 0.22) * (s.windowsUp ? 0.5 : 1), 0.1);
      set(L.horn.gain, hornOn ? 0.16 : 0, 0.02);
      set(L.glug.g.gain, s.fueling ? 0.18 + Math.sin(ctx.currentTime * 18) * 0.06 : 0, 0.05);
    },
    horn(on) { hornOn = on; },
    shift() { burst({ dur: 0.08, gain: 0.12, f: 500 }); tone(90, { dur: 0.08, gain: 0.15, type: 'square' }); },
    thump(v = 1) { burst({ dur: 0.18, gain: 0.25 * clamp(v, 0.2, 1), f: 600 }); tone(70, { to: 45, dur: 0.18, gain: 0.3 * clamp(v, 0.2, 1) }); },
    crunch(v = 1) { const k = clamp(v / 10, 0.2, 1); burst({ dur: 0.35, gain: 0.5 * k, f: 1400, q: 0.6 }); tone(110, { to: 50, dur: 0.3, gain: 0.4 * k, type: 'square' }); },
    twig() { burst({ dur: 0.12, gain: 0.25, type: 'highpass', f: 2500 }); burst({ dur: 0.2, gain: 0.15, type: 'bandpass', f: 1200, q: 2, delay: 0.04 }); },
    gulp() { [0, 0.28, 0.56].forEach((d) => tone(220, { to: 140, dur: 0.15, gain: 0.2, delay: d })); },
    pick() { tone(660, { to: 990, dur: 0.12, gain: 0.12, type: 'triangle' }); },
    sputter() { for (let i = 0; i < 6; i++) burst({ dur: 0.07, gain: 0.3, f: 300, delay: i * rand(0.12, 0.25) }); },
    start() { for (let i = 0; i < 5; i++) tone(70 + i * 6, { dur: 0.12, gain: 0.18, type: 'square', delay: i * 0.11 }); },
    ding() { tone(1320, { dur: 0.25, gain: 0.08 }); tone(1760, { dur: 0.3, gain: 0.06, delay: 0.12 }); },
    warn() { tone(880, { dur: 0.12, gain: 0.08, type: 'square' }); tone(880, { dur: 0.12, gain: 0.08, type: 'square', delay: 0.2 }); },
    ui() { tone(620, { to: 820, dur: 0.05, gain: 0.06, type: 'triangle' }); },
  };
})();
