// Fully procedural sound: fluorescent hum, footsteps, creature noises,
// jumpscare stings. Positional sounds use HRTF panning plus a shared reverb
// so everything sits in the same empty-office acoustic.
import * as THREE from 'three';

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.loops = new Set();
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);
    // reverb send
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.2, 2.5);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.35;
    this.reverb.connect(this.wet).connect(this.master);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.dry.connect(this.reverb);
    // white noise source buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.dist = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 6); }
    this.dist.curve = curve;
    this.dist.connect(this.dry);
    this._startHum();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _impulse(sec, decay) {
    const ctx = this.ctx, len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  get t() { return this.ctx.currentTime; }

  setListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = cam.getWorldPosition(_v1);
    const f = cam.getWorldDirection(_v2);
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  panner(x, y, z, ref = 2) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = ref; p.rolloffFactor = 1.3; p.maxDistance = 80;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
    else p.setPosition(x, y, z);
    p.connect(this.dry);
    return p;
  }

  // output node: positional if pos given, otherwise straight to the mix
  _out(pos, ref) { return pos ? this.panner(pos.x, pos.y ?? 1.5, pos.z, ref) : this.dry; }

  _noise(dest, { dur = 0.2, type = 'lowpass', freq = 1000, q = 1, gain = 0.5, attack = 0.005, rate = 1, sweepTo }) {
    const ctx = this.ctx, t = this.t;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.playbackRate.value = rate;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  _tone(dest, { freq = 440, to, type = 'sine', dur = 0.3, gain = 0.3, attack = 0.005, delay = 0 }) {
    const ctx = this.ctx, t = this.t + delay;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(name, pos, opts = {}) {
    if (!this.ctx) return;
    const out = this._out(pos, opts.ref);
    switch (name) {
      case 'step': this._noise(out, { dur: 0.11, freq: 380 + Math.random() * 120, gain: 0.32 * (opts.gain ?? 1) }); this._tone(out, { freq: 70, to: 40, dur: 0.08, gain: 0.12 * (opts.gain ?? 1) }); break;
      case 'stepWater': this._noise(out, { dur: 0.35, type: 'bandpass', freq: 900 + Math.random() * 600, q: 0.8, gain: 0.35, attack: 0.02, sweepTo: 400 }); break;
      case 'pickup': this._noise(out, { dur: 0.08, type: 'bandpass', freq: 3000, q: 2, gain: 0.3 }); this._tone(out, { freq: 1200, to: 1800, dur: 0.12, gain: 0.08, type: 'triangle' }); break;
      case 'craft':
        for (let i = 0; i < 4; i++) { this._noise(out, { dur: 0.12, type: 'bandpass', freq: 2500 + i * 500, q: 3, gain: 0.35 }); this._tone(out, { freq: 700 + i * 140, dur: 0.5, gain: 0.08, type: 'triangle', delay: i * 0.12 }); }
        break;
      case 'gun':
        this._noise(out, { dur: 0.35, type: 'lowpass', freq: 5000, sweepTo: 300, gain: 1.2, attack: 0.001 });
        this._tone(this.dist, { freq: 160, to: 35, dur: 0.3, gain: 0.6 });
        break;
      case 'click': this._noise(out, { dur: 0.04, type: 'highpass', freq: 3000, gain: 0.25 * (opts.gain ?? 1) }); break;
      case 'boom':
        this._noise(out, { dur: 2.2, type: 'lowpass', freq: 1800, sweepTo: 60, gain: 1.6, attack: 0.002 });
        this._tone(this.dist, { freq: 90, to: 25, dur: 1.2, gain: 0.8 });
        break;
      case 'hit': this._tone(this.dist, { freq: 120, to: 50, dur: 0.25, gain: 0.5 }); this._noise(this.dry, { dur: 0.25, freq: 900, gain: 0.6 }); break;
      case 'hiss': this._noise(out, { dur: 0.9, type: 'highpass', freq: 2500, gain: 0.5, attack: 0.05 }); break;
      case 'screech': this._noise(out, { dur: 1.2, type: 'bandpass', freq: 3500, q: 6, sweepTo: 900, gain: 0.9, attack: 0.02 }); break;
      case 'sting': this._sting(opts.gain ?? 1); break;
      case 'whoosh': this._noise(out, { dur: 0.7, type: 'bandpass', freq: 400, q: 1.5, sweepTo: 3000, gain: 0.6, attack: 0.3 }); break;
      case 'powerdown':
        this._tone(this.dry, { freq: 240, to: 20, dur: 1.6, gain: 0.25, type: 'sawtooth' });
        this._noise(this.dry, { dur: 0.3, freq: 200, gain: 0.8 });
        break;
      case 'powerup':
        this._noise(this.dry, { dur: 0.3, freq: 200, gain: 0.8 });
        this._tone(this.dry, { freq: 30, to: 120, dur: 1.4, gain: 0.2, type: 'sawtooth' });
        break;
      case 'thump': this._tone(out, { freq: 60, to: 30, dur: 0.4, gain: 0.6 }); this._noise(out, { dur: 0.3, freq: 300, gain: 0.4 }); break;
      case 'creak': this._tone(out, { freq: 180 + Math.random() * 80, to: 120, dur: 1.4, gain: 0.08, type: 'sawtooth', attack: 0.3 }); break;
      case 'shatter': for (let i = 0; i < 6; i++) this._noise(out, { dur: 0.3 + i * 0.05, type: 'highpass', freq: 4000 + i * 600, gain: 0.4 }); break;
      case 'bed': this._noise(out, { dur: 0.6, freq: 600, gain: 0.3, attack: 0.15 }); break;
      case 'ui': this._tone(this.dry, { freq: 900, dur: 0.06, gain: 0.05, type: 'square' }); break;
      case 'pickupPhone': this._noise(out, { dur: 0.1, type: 'bandpass', freq: 1500, gain: 0.4 }); break;
      case 'heartbeat': this._tone(this.dry, { freq: 55, to: 40, dur: 0.18, gain: 0.5 * (opts.gain ?? 1) }); this._tone(this.dry, { freq: 50, to: 38, dur: 0.18, gain: 0.35 * (opts.gain ?? 1), delay: 0.22 }); break;
    }
  }

  _sting(gain) {
    const ctx = this.ctx, t = this.t;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.55 * gain, t + 0.01);
    g.gain.setValueAtTime(0.55 * gain, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    g.connect(this.dist);
    for (const f of [110, 116.5, 155.6, 233, 311, 329.6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 2, t);
      o.frequency.exponentialRampToValueAtTime(f * (0.9 + Math.random() * 0.2), t + 1.4);
      o.detune.value = (Math.random() - 0.5) * 40;
      o.connect(g); o.start(t); o.stop(t + 1.7);
    }
    this._noise(this.dry, { dur: 1.3, type: 'bandpass', freq: 4500, q: 4, sweepTo: 700, gain: 1.4, attack: 0.005 });
    this._noise(this.dry, { dur: 0.6, type: 'lowpass', freq: 400, gain: 1.4, attack: 0.002 });
  }

  // ---------- continuous loops ----------

  _startHum() {
    const ctx = this.ctx;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    this.humGain.connect(this.master);
    lp.connect(this.humGain);
    for (const [f, g, type] of [[120, 0.05, 'sawtooth'], [240, 0.025, 'square'], [60, 0.04, 'sine']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g;
      o.connect(og).connect(lp); o.start();
    }
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 7000; bp.Q.value = 2;
    const ng = ctx.createGain(); ng.gain.value = 0.012;
    n.connect(bp).connect(ng).connect(this.humGain); n.start();
  }

  setHum(level) {
    if (!this.ctx) return;
    this.humGain.gain.setTargetAtTime(level * 0.7, this.t, 0.05);
  }

  // A positional looping sound that can be moved and faded.
  loop(kind, pos) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const pan = this.panner(pos.x, pos.y ?? 1, pos.z, kind === 'phone' ? 3 : 2);
    const g = ctx.createGain(); g.gain.value = 0;
    g.connect(pan);
    const nodes = [];
    const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); nodes.push(o); return o; };
    let ctrl = {};
    if (kind === 'phone') {
      const am = ctx.createGain(); am.gain.value = 0;
      osc('sine', 440).connect(am); osc('sine', 480).connect(am);
      const lfo = osc('square', 20); const lg = ctx.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      am.connect(g);
      ctrl.pattern = (time) => (time % 4 < 1.6 ? 0.25 : 0);
    } else if (kind === 'engine') {
      const o = osc('sawtooth', 40); const o2 = osc('square', 20);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
      const og = ctx.createGain(); og.gain.value = 0.5;
      o.connect(lp); o2.connect(og).connect(lp); lp.connect(g);
      ctrl.setRate = (r) => { o.frequency.setTargetAtTime(35 + r * 9, this.t, 0.1); o2.frequency.setTargetAtTime(17 + r * 4.5, this.t, 0.1); };
    } else if (kind === 'generator') {
      const o = osc('sawtooth', 48);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      const trem = osc('sine', 11); const tg = ctx.createGain(); tg.gain.value = 0.3;
      const amp = ctx.createGain(); amp.gain.value = 0.7;
      trem.connect(tg).connect(amp.gain);
      o.connect(lp).connect(amp).connect(g);
    } else if (kind === 'whine') {
      const o = osc('sine', 4200); const o2 = osc('sine', 4237);
      o.connect(g); o2.connect(g);
    } else if (kind === 'buzz') {
      const o = osc('sawtooth', 120);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 3;
      o.connect(bp).connect(g);
    }
    const l = {
      kind, gain: g, pan, ...ctrl,
      set: (x, y, z) => {
        if (pan.positionX) { pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z; }
        else pan.setPosition(x, y, z);
      },
      level: (v) => g.gain.setTargetAtTime(v, this.t, 0.08),
      stop: () => { try { g.gain.setTargetAtTime(0, this.t, 0.05); nodes.forEach((n) => n.stop(this.t + 0.3)); } catch (e) { /* already stopped */ } this.loops.delete(l); },
    };
    this.loops.add(l);
    return l;
  }

  stopAll() { for (const l of [...this.loops]) l.stop(); }

  // Phone voice: real speech synthesis pitched way down, if the browser has it.
  speak(text, enabled) {
    if (!enabled || !window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = 0.2; u.rate = 0.82; u.volume = Math.min(1, this.volume + 0.1);
      speechSynthesis.speak(u);
    } catch (e) { /* no speech */ }
  }
  stopSpeech() { try { window.speechSynthesis?.cancel(); } catch (e) { /* ignore */ } }
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
