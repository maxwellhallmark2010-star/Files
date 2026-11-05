'use strict';
// ============================================================================
//  BOULEVARD KINGS — core: utils, renderer, input, touch controls, audio, fx
// ============================================================================
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = a => a[(Math.random() * a.length) | 0];
const chance = p => Math.random() < p;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const wrapAng = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const dampF = (lambda, dt) => 1 - Math.exp(-lambda * dt);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const V3 = THREE.Vector3;
const _v1 = new V3(), _v2 = new V3(), _v3 = new V3(), _v4 = new V3(), _v5 = new V3();
const _m4 = new THREE.Matrix4(), _q1 = new THREE.Quaternion(), _col = new THREE.Color();
const UP = new V3(0, 1, 0);
const $ = id => document.getElementById(id);
const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};
const settings = Object.assign({ mobile: IS_TOUCH, quality: IS_TOUCH ? 'low' : 'high', sound: true, sens: 1, driveCam: 'third', minimap: true }, store.get('bk_settings', {}));
function saveSettings() { store.set('bk_settings', settings); }

// game-wide flags (filled in by game.js)
const game = { running: false, paused: false, time: 0, timeScale: 1, slowmo: 0, touchMode: 'foot', shake: 0, frame: 0 };

// ---------------------------------------------------------------- renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !(IS_TOUCH && devicePixelRatio > 2), powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.12, 1500);
scene.add(camera);
const PSYS = [];
function onResize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  for (const p of PSYS) p.setScale();
}
function applyQuality() {
  const hi = settings.quality === 'high';
  renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? 1.75 : 1.1));
  onResize();
}

// ---------------------------------------------------------------- input
const keys = {};
const input = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, throttle: 0, brake: 0, steer: 0, steerAnalog: false, handbrake: false, fire: false, aim: false, sprint: false, horn: false, pressed: new Set() };
const mouse = { l: false, r: false, locked: false };
const KEY_TAP = { KeyF: 'enter', Enter: 'enter', KeyE: 'interact', KeyC: 'camera', KeyV: 'camera', KeyH: 'hop', KeyM: 'map', Escape: 'pause', KeyP: 'pause', KeyQ: 'weapon', KeyR: 'reload', Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', Space: 'jump', Tab: 'weapon' };
addEventListener('keydown', e => {
  keys[e.code] = true;
  const a = KEY_TAP[e.code];
  if (a && !e.repeat) input.pressed.add(a);
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && game.running) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.l = mouse.r = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (settings.mobile || !game.running || game.paused) return;
  if (!mouse.locked && canvas.requestPointerLock) {
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (err) { }
  }
  if (e.button === 0) mouse.l = true;
  if (e.button === 2) mouse.r = true;
});
addEventListener('mouseup', e => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
addEventListener('mousemove', e => {
  if (settings.mobile || !game.running || game.paused) return;
  if (mouse.locked || mouse.l || mouse.r) { input.lookX += e.movementX || 0; input.lookY += e.movementY || 0; }
});
document.addEventListener('pointerlockchange', () => {
  const was = mouse.locked;
  mouse.locked = document.pointerLockElement === canvas;
  if (was && !mouse.locked && game.running && !game.paused && !settings.mobile && typeof openPause === 'function') openPause();
});

// ---- touch controls: joystick, steering wheel, look-drag, buttons
const touch = { roles: new Map(), held: {}, joy: { id: null, ox: 0, oy: 0, dx: 0, dy: 0 }, wheel: { id: null, lastA: 0, angle: 0, cx: 0, cy: 0 } };
const HOLD_BTNS = new Set(['gas', 'brake', 'handbrake', 'fire', 'aim', 'sprint', 'horn']);
function touchStart(e) {
  if (!game.running) return;
  e.preventDefault();
  for (const t of e.changedTouches) {
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const btn = el && el.closest ? el.closest('[data-btn]') : null;
    if (btn && btn.offsetParent !== null) {
      const b = btn.dataset.btn;
      touch.roles.set(t.identifier, { type: 'btn', b, el: btn });
      btn.classList.add('on');
      if (HOLD_BTNS.has(b)) touch.held[b] = true; else input.pressed.add(b);
      continue;
    }
    const wEl = $('wheel');
    if (el && el.closest && el.closest('#wheel') && game.touchMode === 'drive') {
      const r = wEl.getBoundingClientRect();
      touch.wheel.cx = r.left + r.width / 2; touch.wheel.cy = r.top + r.height / 2;
      touch.wheel.id = t.identifier;
      touch.wheel.lastA = Math.atan2(t.clientY - touch.wheel.cy, t.clientX - touch.wheel.cx);
      touch.roles.set(t.identifier, { type: 'wheel' });
      continue;
    }
    if (t.clientX < innerWidth * 0.45 && game.touchMode === 'foot' && touch.joy.id == null) {
      const j = touch.joy; j.id = t.identifier; j.ox = t.clientX; j.oy = t.clientY; j.dx = j.dy = 0;
      const base = $('joyBase'); base.hidden = false;
      base.style.left = (t.clientX - 60) + 'px'; base.style.top = (t.clientY - 60) + 'px';
      $('joyKnob').style.transform = 'translate(0px,0px)';
      touch.roles.set(t.identifier, { type: 'joy' });
      continue;
    }
    touch.roles.set(t.identifier, { type: 'look', x: t.clientX, y: t.clientY });
  }
}
function touchMove(e) {
  if (!game.running) return;
  e.preventDefault();
  for (const t of e.changedTouches) {
    const r = touch.roles.get(t.identifier); if (!r) continue;
    if (r.type === 'look') {
      input.lookX += (t.clientX - r.x) * 1.5; input.lookY += (t.clientY - r.y) * 1.5;
      r.x = t.clientX; r.y = t.clientY;
    } else if (r.type === 'joy') {
      const j = touch.joy, R = 60;
      let dx = t.clientX - j.ox, dy = t.clientY - j.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      j.dx = dx / R; j.dy = dy / R;
      $('joyKnob').style.transform = `translate(${dx}px,${dy}px)`;
    } else if (r.type === 'wheel') {
      const w = touch.wheel;
      const a = Math.atan2(t.clientY - w.cy, t.clientX - w.cx);
      if (Math.hypot(t.clientX - w.cx, t.clientY - w.cy) > 12) w.angle = clamp(w.angle + wrapAng(a - w.lastA), -2.4, 2.4);
      w.lastA = a;
    }
  }
}
function touchEnd(e) {
  for (const t of e.changedTouches) {
    const r = touch.roles.get(t.identifier); if (!r) continue;
    if (r.type === 'btn') { r.el.classList.remove('on'); if (HOLD_BTNS.has(r.b)) touch.held[r.b] = false; }
    else if (r.type === 'joy') { touch.joy.id = null; touch.joy.dx = touch.joy.dy = 0; $('joyBase').hidden = true; }
    else if (r.type === 'wheel') { touch.wheel.id = null; }
    touch.roles.delete(t.identifier);
  }
}
function releaseAllTouches() {
  for (const [, r] of touch.roles) if (r.type === 'btn') r.el.classList.remove('on');
  touch.roles.clear(); touch.held = {}; touch.joy.id = null; touch.joy.dx = touch.joy.dy = 0; touch.wheel.id = null;
  const jb = $('joyBase'); if (jb) jb.hidden = true;
}
{
  const tl = $('touch');
  tl.addEventListener('touchstart', touchStart, { passive: false });
  tl.addEventListener('touchmove', touchMove, { passive: false });
  tl.addEventListener('touchend', touchEnd, { passive: false });
  tl.addEventListener('touchcancel', touchEnd, { passive: false });
}

let _lastWheelCss = 99;
function gatherInput(dt) {
  const k = keys, h = touch.held;
  let mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  let my = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  if (touch.joy.id != null) { mx += touch.joy.dx; my -= touch.joy.dy; }
  input.moveX = clamp(mx, -1, 1); input.moveY = clamp(my, -1, 1);
  input.throttle = Math.max(k.KeyW || k.ArrowUp ? 1 : 0, h.gas ? 1 : 0);
  input.brake = Math.max(k.KeyS || k.ArrowDown ? 1 : 0, h.brake ? 1 : 0);
  if (touch.wheel.id == null) touch.wheel.angle *= Math.exp(-6 * dt);
  const ws = touch.wheel.angle / 2.4;
  const ks = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  input.steer = ks !== 0 ? ks : ws;
  input.steerAnalog = ks === 0;
  if (settings.mobile && Math.abs(_lastWheelCss - touch.wheel.angle) > 0.002) {
    _lastWheelCss = touch.wheel.angle;
    $('wheelImg').style.transform = `rotate(${touch.wheel.angle}rad)`;
  }
  input.handbrake = !!(k.Space || h.handbrake);
  input.fire = mouse.l || !!h.fire;
  input.aim = mouse.r || !!h.aim;
  input.sprint = !!(k.ShiftLeft || k.ShiftRight || h.sprint) || (touch.joy.id != null && Math.hypot(touch.joy.dx, touch.joy.dy) > 0.92);
  input.horn = !!(k.KeyG || h.horn);
}

// ---------------------------------------------------------------- audio (synthesized)
const Sound = {
  ctx: null, skid: { g: null }, rain: { g: null }, city: { g: null }, wind: { g: null }, fire: { g: null },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    let c; try { c = this.ctx = new AC(); } catch (e) { return; }
    this.master = c.createGain(); this.master.gain.value = settings.sound ? 0.8 : 0;
    const comp = c.createDynamicsCompressor(); this.master.connect(comp); comp.connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.eGain = c.createGain(); this.eGain.gain.value = 0;
    this.eFilt = c.createBiquadFilter(); this.eFilt.type = 'lowpass'; this.eFilt.frequency.value = 700; this.eFilt.Q.value = 2;
    this.eO1 = c.createOscillator(); this.eO1.type = 'sawtooth';
    this.eO2 = c.createOscillator(); this.eO2.type = 'square';
    this.eO3 = c.createOscillator(); this.eO3.type = 'sine';
    const g2 = c.createGain(); g2.gain.value = 0.45; const g3 = c.createGain(); g3.gain.value = 0.8;
    this.eO1.connect(this.eFilt); this.eO2.connect(g2); g2.connect(this.eFilt); this.eO3.connect(g3); g3.connect(this.eFilt);
    this.eFilt.connect(this.eGain); this.eGain.connect(this.master);
    this.eO1.start(); this.eO2.start(); this.eO3.start();
    this.skid = this.loop('bandpass', 1700, 3);
    this.rain = this.loop('lowpass', 1500, 0.4);
    this.city = this.loop('lowpass', 320, 0.7);
    this.wind = this.loop('bandpass', 420, 0.8);
    this.fire = this.loop('lowpass', 600, 0.5);
    this.setGain(this.city.g, 0.05, 1);
    this.hornO = null;
  },
  setMuted(m) { if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05); },
  loop(type, f, q) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.master);
    s.start(0, Math.random() * 1.5); return { s, f: fl, g };
  },
  setGain(node, v, t = 0.08) { if (this.ctx && node) node.gain.setTargetAtTime(v, this.ctx.currentTime, t); },
  engine(on, rpm, load, deep) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const f = (deep ? 22 : 30) + rpm * (deep ? 70 : 95);
    this.eO1.frequency.setTargetAtTime(f, t, 0.04); this.eO2.frequency.setTargetAtTime(f * 0.5, t, 0.04); this.eO3.frequency.setTargetAtTime(f * 0.25, t, 0.04);
    this.eFilt.frequency.setTargetAtTime(240 + rpm * 1500 + load * 700, t, 0.05);
    this.eGain.gain.setTargetAtTime(on ? (0.05 + 0.08 * load + 0.03 * rpm) : 0, t, 0.08);
  },
  vol(gain, dist) { return gain / (1 + (dist * dist) / 260); },
  burst({ dur = 0.3, f = 1000, q = 1, type = 'lowpass', gain = 0.5, attack = 0.002, dist = 0, rate = 1, delay = 0 } = {}) {
    const c = this.ctx; if (!c) return; const vol = this.vol(gain, dist); if (vol < 0.004) return;
    const s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = rate;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(); const t = c.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  tone({ f = 440, f2 = null, dur = 0.2, type = 'square', gain = 0.2, dist = 0, delay = 0, attack = 0.005 } = {}) {
    const c = this.ctx; if (!c) return; const vol = this.vol(gain, dist); if (vol < 0.004) return;
    const o = c.createOscillator(); o.type = type; const g = c.createGain(); const t = c.currentTime + delay;
    o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  shot(kind, dist) {
    if (kind === 'rifle') {
      this.burst({ dur: 0.11, f: 1500, q: 0.7, type: 'highpass', gain: 0.75, dist });
      this.burst({ dur: 0.22, f: 500, type: 'lowpass', gain: 0.9, dist });
      this.tone({ f: 160, f2: 45, dur: 0.12, type: 'sine', gain: 0.6, dist });
    } else {
      this.burst({ dur: 0.14, f: 1100, q: 0.7, type: 'highpass', gain: 0.65, dist });
      this.burst({ dur: 0.3, f: 380, type: 'lowpass', gain: 0.85, dist });
      this.tone({ f: 130, f2: 38, dur: 0.16, type: 'sine', gain: 0.6, dist });
    }
  },
  crash(intensity, dist) {
    const g = clamp(intensity, 0.1, 1);
    this.burst({ dur: 0.35 + g * 0.4, f: 600 + g * 900, type: 'lowpass', gain: 0.9 * g, dist });
    this.tone({ f: rand(150, 220), f2: 50, dur: 0.25, type: 'square', gain: 0.25 * g, dist });
    for (let i = 0; i < 3; i++) this.tone({ f: rand(500, 1400), dur: rand(0.08, 0.25), type: 'triangle', gain: 0.12 * g, dist, delay: rand(0, 0.12) });
  },
  glass(dist) {
    this.burst({ dur: 0.4, f: 3800, type: 'highpass', gain: 0.5, dist });
    for (let i = 0; i < 7; i++) this.tone({ f: rand(2500, 6500), dur: rand(0.04, 0.12), type: 'sine', gain: 0.08, dist, delay: rand(0, 0.35) });
  },
  explosion(dist) {
    this.burst({ dur: 2.2, f: 260, type: 'lowpass', gain: 1.2, dist, rate: 0.6 });
    this.burst({ dur: 0.5, f: 1400, type: 'lowpass', gain: 0.8, dist });
    this.tone({ f: 70, f2: 22, dur: 1.2, type: 'sine', gain: 0.9, dist });
  },
  thunder() { this.burst({ dur: 3.5, f: 180, type: 'lowpass', gain: 0.9, attack: 0.15, rate: 0.5, delay: rand(0.4, 1.8) }); },
  punch(dist) { this.burst({ dur: 0.09, f: 350, type: 'lowpass', gain: 0.6, dist }); this.tone({ f: 100, f2: 50, dur: 0.08, type: 'sine', gain: 0.4, dist }); },
  flesh(dist) { this.burst({ dur: 0.08, f: 700, q: 2, type: 'bandpass', gain: 0.45, dist }); },
  ping(dist) { this.tone({ f: rand(1800, 3200), f2: 900, dur: 0.12, type: 'triangle', gain: 0.12, dist }); },
  hop() { this.tone({ f: 70, f2: 150, dur: 0.18, type: 'sawtooth', gain: 0.18 }); this.burst({ dur: 0.25, f: 2600, q: 1.5, type: 'bandpass', gain: 0.25, delay: 0.05 }); },
  thud(g = 0.5, dist = 0) { this.burst({ dur: 0.16, f: 220, type: 'lowpass', gain: g, dist }); this.tone({ f: 75, f2: 40, dur: 0.12, type: 'sine', gain: g * 0.7, dist }); },
  click() { this.tone({ f: 1900, dur: 0.025, type: 'square', gain: 0.08 }); },
  cash() { this.tone({ f: 1320, dur: 0.08, type: 'square', gain: 0.08 }); this.tone({ f: 1760, dur: 0.18, type: 'square', gain: 0.08, delay: 0.08 }); },
  jingle() { [523, 659, 784, 1046].forEach((f, i) => this.tone({ f, dur: 0.22, type: 'triangle', gain: 0.18, delay: i * 0.12 })); },
  fail() { [392, 330, 262].forEach((f, i) => this.tone({ f, dur: 0.3, type: 'triangle', gain: 0.18, delay: i * 0.18 })); },
  honk(dist) { this.tone({ f: 415, dur: 0.35, type: 'square', gain: 0.06, dist }); this.tone({ f: 520, dur: 0.35, type: 'square', gain: 0.05, dist }); },
  horn(on) {
    if (!this.ctx) return;
    if (on && !this.hornO) {
      const c = this.ctx; const g = c.createGain(); g.gain.value = 0.07; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
      const a = c.createOscillator(), b = c.createOscillator(); a.type = b.type = 'square'; a.frequency.value = 392; b.frequency.value = 494;
      a.connect(f); b.connect(f); f.connect(g); g.connect(this.master); a.start(); b.start(); this.hornO = [a, b, g];
    } else if (!on && this.hornO) { const [a, b] = this.hornO; a.stop(); b.stop(); this.hornO = null; }
  }
};

// ---------------------------------------------------------------- particles
class ParticleSys {
  constructor(max, additive) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aCol = new THREE.BufferAttribute(this.col, 3);
    this.aSize = new THREE.BufferAttribute(this.size, 1); this.aAlpha = new THREE.BufferAttribute(this.alpha, 1);
    for (const a of [this.aPos, this.aCol, this.aSize, this.aAlpha]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('pcolor', this.aCol); g.setAttribute('psize', this.aSize); g.setAttribute('palpha', this.aAlpha);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: 'attribute float psize;attribute float palpha;attribute vec3 pcolor;varying vec3 vC;varying float vA;uniform float uScale;void main(){vC=pcolor;vec4 mv=modelViewMatrix*vec4(position,1.0);vA=palpha*smoothstep(0.4,2.2,-mv.z);gl_PointSize=min(180.0,psize*uScale/max(0.1,-mv.z));gl_Position=projectionMatrix*mv;if(palpha<=0.001)gl_Position=vec4(2.0,2.0,2.0,1.0);}',
      fragmentShader: 'varying vec3 vC;varying float vA;void main(){vec2 d=gl_PointCoord-0.5;float r=dot(d,d)*4.0;if(r>1.0)discard;float a=vA*(1.0-r)*(1.0-r*0.3);gl_FragColor=vec4(vC,a);}',
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points); PSYS.push(this); this.setScale(); this.active = 0;
  }
  setScale() {
    const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y || innerHeight;
    this.mat.uniforms.uScale.value = h * 0.5 / Math.tan(camera.fov * Math.PI / 360);
  }
  spawn(x, y, z, vx, vy, vz, size, life, r, g, b, a, grow = 0, drag = 0, grav = 0) {
    const i = this.i; this.i = (i + 1) % this.max; const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.a0[i] = a; this.alpha[i] = a;
    this.grow[i] = grow; this.drag[i] = drag; this.grav[i] = grav;
  }
  update(dt) {
    const P = this.pos, Vv = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      const i3 = i * 3, dr = Math.max(0, 1 - this.drag[i] * dt);
      Vv[i3] *= dr; Vv[i3 + 1] = Vv[i3 + 1] * dr - this.grav[i] * dt; Vv[i3 + 2] *= dr;
      P[i3] += Vv[i3] * dt; P[i3 + 1] += Vv[i3 + 1] * dt; P[i3 + 2] += Vv[i3 + 2] * dt;
      if (P[i3 + 1] < 0.03) { P[i3 + 1] = 0.03; Vv[i3 + 1] *= -0.3; Vv[i3] *= 0.6; Vv[i3 + 2] *= 0.6; }
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.a0[i] * Math.min(1, t * 1.6) * Math.min(1, (1 - t) * 12 + 0.2);
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }
}
let FX = null; // created in initFX

class Tracers {
  constructor(n) {
    this.n = n; this.i = 0; this.life = new Float32Array(n);
    this.pos = new Float32Array(n * 6); this.col = new Float32Array(n * 6); this.c0 = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(this.pos, 3); this.aC = new THREE.BufferAttribute(this.col, 3);
    g.setAttribute('position', this.aP); g.setAttribute('color', this.aC);
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  add(a, b, r = 1, g = 0.85, bl = 0.5) {
    const i = this.i; this.i = (i + 1) % this.n; const o = i * 6;
    this.pos[o] = a.x; this.pos[o + 1] = a.y; this.pos[o + 2] = a.z; this.pos[o + 3] = b.x; this.pos[o + 4] = b.y; this.pos[o + 5] = b.z;
    this.c0[i * 3] = r; this.c0[i * 3 + 1] = g; this.c0[i * 3 + 2] = bl; this.life[i] = 0.08;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      const o = i * 6; let k = 0;
      if (this.life[i] > 0) { this.life[i] -= dt; k = Math.max(0, this.life[i] / 0.08); }
      for (let j = 0; j < 2; j++) { this.col[o + j * 3] = this.c0[i * 3] * k * (j ? 1 : 0.3); this.col[o + j * 3 + 1] = this.c0[i * 3 + 1] * k * (j ? 1 : 0.3); this.col[o + j * 3 + 2] = this.c0[i * 3 + 2] * k * (j ? 1 : 0.3); }
    }
    this.aP.needsUpdate = this.aC.needsUpdate = true;
  }
}

function initFX() {
  FX = {
    smoke: new ParticleSys(settings.quality === 'high' ? 2200 : 1200, false),
    glow: new ParticleSys(900, true),
    bits: new ParticleSys(900, false),
    tracers: new Tracers(48)
  };
}
// helpers
function fxSmoke(x, y, z, dark, amt = 1) {
  const c = dark ? rand(0.06, 0.14) : rand(0.5, 0.72);
  FX.smoke.spawn(x + rand(-0.2, 0.2), y, z + rand(-0.2, 0.2), rand(-0.4, 0.4), rand(1.2, 2.4), rand(-0.4, 0.4), rand(0.5, 0.9) * amt, rand(1.8, 3.2), c, c, c * 1.02, dark ? 0.55 : 0.35, 1.3, 0.6, -0.4);
}
function fxSparks(p, n = 10, spread = 4) {
  for (let i = 0; i < n; i++) FX.glow.spawn(p.x, p.y, p.z, rand(-spread, spread), rand(0.5, spread), rand(-spread, spread), rand(0.06, 0.12), rand(0.2, 0.5), 1, rand(0.55, 0.8), 0.2, 1, -0.1, 0.5, 9);
}
function fxDust(p, n = 6, c = 0.55) {
  for (let i = 0; i < n; i++) FX.smoke.spawn(p.x, p.y, p.z, rand(-1, 1), rand(0.2, 1.2), rand(-1, 1), rand(0.25, 0.45), rand(0.6, 1.2), c, c * 0.95, c * 0.85, 0.4, 0.8, 1.5, 0);
}
function fxBlood(p, dir, n = 10) {
  for (let i = 0; i < n; i++) FX.bits.spawn(p.x, p.y, p.z, (dir ? dir.x * 3 : 0) + rand(-1.5, 1.5), rand(0, 2.5), (dir ? dir.z * 3 : 0) + rand(-1.5, 1.5), rand(0.05, 0.11), rand(0.4, 0.9), rand(0.45, 0.6), 0.02, 0.02, 0.95, 0, 0.5, 9.8);
}
function fxGlass(p, n = 26) {
  for (let i = 0; i < n; i++) FX.bits.spawn(p.x + rand(-0.4, 0.4), p.y + rand(-0.2, 0.2), p.z + rand(-0.4, 0.4), rand(-3, 3), rand(0.5, 3.5), rand(-3, 3), rand(0.03, 0.07), rand(0.8, 1.8), 0.75, 0.88, 0.95, 0.9, 0, 0.3, 9.8);
}
function fxFire(x, y, z, s = 1) {
  FX.glow.spawn(x + rand(-0.3, 0.3) * s, y, z + rand(-0.3, 0.3) * s, rand(-0.3, 0.3), rand(1.5, 3), rand(-0.3, 0.3), rand(0.5, 0.9) * s, rand(0.35, 0.7), 1, rand(0.35, 0.6), 0.08, 0.9, -0.6, 0.5, -1);
}

// ---------------------------------------------------------------- UI helpers
const UI = {
  _p: null, toastT: 0, bigT: 0,
  toast(msg, dur = 2.6) { const el = $('toast'); el.innerHTML = msg; el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); this.toastT = dur; },
  prompt(txt) { if (this._p !== txt) { this._p = txt; const el = $('prompt'); el.hidden = !txt; el.innerHTML = txt || ''; } },
  big(title, sub, dur = 3.6, cls = '') {
    const el = $('bigmsg'); $('bigTitle').textContent = title; $('bigSub').textContent = sub || ''; el.className = cls; el.hidden = false;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); this.bigT = dur;
  },
  objective(txt) { const el = $('objective'); el.hidden = !txt; el.innerHTML = txt || ''; },
  update(dt) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').hidden = true; }
    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) $('bigmsg').hidden = true; }
  }
};
function fadeTo(black, ms = 350) {
  return new Promise(res => { const f = $('fade'); f.style.transitionDuration = ms + 'ms'; f.classList.toggle('on', black); setTimeout(res, ms + 20); });
}
