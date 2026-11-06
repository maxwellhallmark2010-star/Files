// ─────────────────────────────────────────────────────────────────────────────
// Sound: everything is synthesised with WebAudio, so the game ships with no
// audio files. iOS only allows audio after a user gesture: Sound.unlock() is
// called from the first button tap.
// ─────────────────────────────────────────────────────────────────────────────
const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null, ambient = null;
  const last = {};

  function unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = Settings.sound ? level : 0;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // iOS: play one silent buffer inside the gesture to fully unlock output
      const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0);
      startAmbient();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  let level = 0.8;
  function apply() { if (master) master.gain.setTargetAtTime(Settings.sound ? level : 0, ctx.currentTime, 0.08); }
  function setEnabled() { apply(); }
  function setLevel(v) { level = v; apply(); }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function throttle(name, ms) {
    const now = performance.now();
    if (last[name] && now - last[name] < ms) return false;
    last[name] = now; return true;
  }
  function env(g, t0, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }
  function tone(freq, { to = null, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.003, delay = 0, dest = null } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    env(g, t0, gain, attack, dur);
    o.connect(g); g.connect(dest || master);
    o.start(t0); o.stop(t0 + attack + dur + 0.05);
  }
  function noise({ dur = 0.2, gain = 0.3, type = 'bandpass', freq = 1000, to = null, q = 1, attack = 0.003, delay = 0 } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    s.playbackRate.value = 1;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + attack + dur);
    const g = ctx.createGain(); env(g, t0, gain, attack, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + attack + dur + 0.05);
  }
  function startAmbient() { // distant city hum, very quiet
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const g = ctx.createGain(); g.gain.value = 0.035;
    s.connect(f); f.connect(g); g.connect(master); s.start();
    ambient = g;
  }

  return {
    unlock, setEnabled, setLevel, suspend, resume,
    bounce(v = 3) {
      if (!ctx || v < 0.35 || !throttle('bounce', 40)) return;
      const k = clamp(v / 6, 0.15, 1);
      tone(150, { to: 55, dur: 0.13, gain: 0.5 * k, type: 'sine' });
      noise({ dur: 0.05, gain: 0.18 * k, type: 'lowpass', freq: 900 });
    },
    rim(v = 3) {
      if (!ctx || !throttle('rim', 60)) return;
      const k = clamp(v / 6, 0.2, 1);
      [523, 1311, 2087, 2950].forEach((f, i) => tone(f * rand(0.98, 1.02), { dur: 0.5 - i * 0.08, gain: (0.12 - i * 0.02) * k, type: 'triangle' }));
      noise({ dur: 0.06, gain: 0.15 * k, freq: 3000, q: 2 });
    },
    board(v = 3) {
      if (!ctx || !throttle('board', 60)) return;
      const k = clamp(v / 6, 0.2, 1);
      tone(95, { to: 70, dur: 0.22, gain: 0.45 * k, type: 'square' });
      noise({ dur: 0.12, gain: 0.25 * k, type: 'lowpass', freq: 600 });
    },
    swish() {
      if (!ctx || !throttle('swish', 200)) return;
      noise({ dur: 0.35, gain: 0.35, type: 'bandpass', freq: 5200, to: 2400, q: 0.8, attack: 0.04 });
    },
    whistle() {
      if (!ctx || !throttle('whistle', 300)) return;
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
      o.frequency.value = 2900; lfo.frequency.value = 38; lg.gain.value = 120;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.setValueAtTime(0.16, t0 + 0.38); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      o.connect(g); g.connect(master); o.start(t0); lfo.start(t0); o.stop(t0 + 0.55); lfo.stop(t0 + 0.55);
    },
    buzzer() { if (ctx) { tone(196, { dur: 0.9, gain: 0.16, type: 'sawtooth', attack: 0.01 }); tone(198, { dur: 0.9, gain: 0.14, type: 'square', attack: 0.01 }); } },
    squeak() {
      if (!ctx || !throttle('squeak', 260)) return;
      const f = rand(1700, 2400);
      tone(f, { to: f * rand(1.15, 1.4), dur: 0.07, gain: 0.05, type: 'sine' });
    },
    catchBall() { if (ctx && throttle('catch', 80)) noise({ dur: 0.05, gain: 0.25, type: 'lowpass', freq: 1400 }); },
    pass() { if (ctx && throttle('pass', 80)) noise({ dur: 0.08, gain: 0.12, type: 'bandpass', freq: 900, q: 1.5 }); },
    steal() { if (ctx) { noise({ dur: 0.06, gain: 0.3, type: 'lowpass', freq: 1800 }); tone(330, { to: 180, dur: 0.12, gain: 0.08, type: 'triangle' }); } },
    tick() { if (ctx) tone(1200, { dur: 0.04, gain: 0.06, type: 'square' }); },
    perfect() { if (ctx) { tone(1046, { dur: 0.12, gain: 0.08 }); tone(1568, { dur: 0.18, gain: 0.07, delay: 0.05 }); } },
    ui() { if (ctx && throttle('ui', 50)) tone(720, { to: 900, dur: 0.05, gain: 0.06, type: 'triangle' }); },
    dunk() { if (ctx) { tone(80, { to: 40, dur: 0.35, gain: 0.6, type: 'sine' }); noise({ dur: 0.25, gain: 0.35, type: 'lowpass', freq: 700 }); this.rim(8); } },
    cheer(big = false) {
      if (!ctx || !throttle('cheer', 500)) return;
      noise({ dur: big ? 2.2 : 1.3, gain: big ? 0.22 : 0.12, type: 'bandpass', freq: 1300, q: 0.6, attack: 0.25 });
      noise({ dur: big ? 1.8 : 1.0, gain: big ? 0.14 : 0.07, type: 'bandpass', freq: 2600, q: 0.9, attack: 0.3 });
      const n = big ? 5 : 2;
      for (let i = 0; i < n; i++) { const f = rand(500, 900); tone(f, { to: f * 1.5, dur: 0.35, gain: 0.025, type: 'triangle', delay: rand(0.1, 0.8) }); }
    },
    groan() { if (ctx && throttle('groan', 600)) noise({ dur: 0.9, gain: 0.08, type: 'bandpass', freq: 500, to: 300, q: 1, attack: 0.15 }); },
  };
})();
