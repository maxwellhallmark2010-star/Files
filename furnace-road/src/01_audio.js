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

  return {
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
      set(L.wind.g.gain, clamp(v * v / 2200, 0, 0.32), 0.2); set(L.wind.fl.frequency, 400 + v * 30, 0.2);
      set(L.road.g.gain, clamp(v / 40, 0, 0.25) * (s.onAsphalt ? 0.6 : 1), 0.1);
      set(L.grit.g.gain, s.onAsphalt ? 0 : clamp(v / 25, 0, 0.22), 0.1);
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
