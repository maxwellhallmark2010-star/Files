// On-screen controls for phones and tablets: a move joystick on the left,
// drag anywhere else to look, and action buttons on the right.
const $ = (id) => document.getElementById(id);

export function wantsTouch(settings) {
  if (settings.touch === 'on') return true;
  if (settings.touch === 'off') return false;
  return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.move = { x: 0, y: 0 };
    this.run = false;
    this.crouch = false;
    this.stickId = null;
    this.lookId = null;
    this.root = $('touch');
    this._bindStick();
    this._bindLook();
    this._bindButtons();
  }

  get enabled() { return !this.root.classList.contains('hidden'); }

  setEnabled(on) {
    this.root.classList.toggle('hidden', !on);
    document.body.classList.toggle('touch-mode', on);
    if (!on) this.reset();
  }

  reset() {
    this.move.x = this.move.y = 0;
    this.stickId = this.lookId = null;
    $('stick-knob').style.transform = '';
    this.game.keys.delete('KeyE');
  }

  _bindStick() {
    const zone = $('stick-zone'), base = $('stick-base'), knob = $('stick-knob');
    const R = 55;
    let cx = 0, cy = 0;
    zone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
      // the joystick appears where your thumb lands
      const r = zone.getBoundingClientRect();
      cx = e.clientX; cy = e.clientY;
      base.style.left = `${cx - r.left}px`; base.style.top = `${cy - r.top}px`;
      base.classList.add('active');
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.move.x = dx / R; this.move.y = dy / R;
    });
    const end = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.move.x = this.move.y = 0;
      knob.style.transform = '';
      base.classList.remove('active');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  _bindLook() {
    const zone = $('look-zone');
    let lx = 0, ly = 0;
    zone.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      e.preventDefault();
      this.lookId = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
      lx = e.clientX; ly = e.clientY;
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      const g = this.game;
      if (!g.paused && !g.overlay) g.player.look((e.clientX - lx) * 2.4, (e.clientY - ly) * 2.4);
      lx = e.clientX; ly = e.clientY;
    });
    const end = (e) => { if (e.pointerId === this.lookId) this.lookId = null; };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  _bindButtons() {
    const g = this.game;
    const tap = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); g.audio.init(); fn(); });
    tap('t-fire', () => { if (!g.paused && !g.overlay) g.player.use(); });
    tap('t-light', () => { g.player.toggleFlashlight(); g.ui.refresh(); });
    tap('t-item', () => g.cycleItem());
    tap('t-heal', () => g.drinkAlmond());
    tap('t-run', () => { this.run = !this.run; $('t-run').classList.toggle('on', this.run); });
    tap('t-crouch', () => { this.crouch = !this.crouch; $('t-crouch').classList.toggle('on', this.crouch); });
    // E is held for generators, so it tracks press and release
    const e = $('t-use');
    e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); g.keys.add('KeyE'); g._pressE(); });
    const up = () => g.keys.delete('KeyE');
    e.addEventListener('pointerup', up);
    e.addEventListener('pointercancel', up);
    e.addEventListener('pointerleave', up);
  }

  // Joystick and toggles merged into the keyboard input shape.
  input() {
    const m = this.move;
    const mag = Math.hypot(m.x, m.y);
    if (mag < 0.15) return null;
    return {
      fwd: -m.y,
      side: m.x,
      sprint: this.run || mag > 0.95,
      crouch: this.crouch,
    };
  }
}
