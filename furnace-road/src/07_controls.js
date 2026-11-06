// ─────────────────────────────────────────────────────────────────────────────
// Controls: an on-screen steering wheel you turn with your finger (it rotates
// exactly as far as you twist it, and the road wheels follow), gas and brake
// pedals with pedal travel, and a keyboard fallback. The wheel self-centres
// when you let go, like a real caster return.
// ─────────────────────────────────────────────────────────────────────────────
const Controls = {
  steer: 0, gas: 0, brake: 0, deg: 0, hold: false,
  gasDown: false, brakeDown: false, enabled: false, keys: new Set(),
  init() {
    this.wheelEl = document.getElementById('wheel');
    this.wheelRot = document.getElementById('wheelRot');
    this.gasEl = document.getElementById('gas'); this.brakeEl = document.getElementById('brake');
    let wid = null, lastA = 0, moved = 0, hornT = null;
    const center = () => { const r = this.wheelEl.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 }; };
    this.wheelEl.addEventListener('pointerdown', (e) => {
      if (!this.enabled || wid !== null) return;
      e.preventDefault(); Sound.unlock();
      wid = e.pointerId; try { this.wheelEl.setPointerCapture(wid); } catch (err) { /* ignore */ }
      const c = center(); lastA = Math.atan2(e.clientY - c.y, e.clientX - c.x); moved = 0;
      this.hold = true;
      // a tap on the hub is the horn
      if (Math.hypot(e.clientX - c.x, e.clientY - c.y) < c.R * 0.3) { hornT = setTimeout(() => { Sound.horn(true); this.wheelEl.classList.add('honk'); }, 60); }
    });
    this.wheelEl.addEventListener('pointermove', (e) => {
      if (e.pointerId !== wid) return;
      e.preventDefault();
      const c = center(), dx = e.clientX - c.x, dy = e.clientY - c.y;
      if (Math.hypot(dx, dy) < c.R * 0.18) return;          // too close to the hub to read an angle
      const a = Math.atan2(dy, dx);
      const d = wrapAngle(a - lastA) * 180 / Math.PI;       // screen y points down: + is clockwise
      lastA = a; moved += Math.abs(d);
      if (moved > 6 && hornT !== null) { clearTimeout(hornT); hornT = null; Sound.horn(false); this.wheelEl.classList.remove('honk'); }
      const R = Settings.steerRange;
      this.deg = clamp(this.deg + d, -R, R);
    });
    const end = (e) => {
      if (e.pointerId !== wid) return;
      wid = null; this.hold = false;
      if (hornT !== null) { clearTimeout(hornT); hornT = null; }
      Sound.horn(false); this.wheelEl.classList.remove('honk');
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => this.wheelEl.addEventListener(ev, end));

    const pedal = (el, key) => {
      let id = null;
      el.addEventListener('pointerdown', (e) => {
        if (!this.enabled || id !== null) return;
        e.preventDefault(); Sound.unlock(); id = e.pointerId;
        try { el.setPointerCapture(id); } catch (err) { /* ignore */ }
        this[key] = true; el.classList.add('down');
      });
      const up = (e) => { if (e.pointerId !== id) return; id = null; this[key] = false; el.classList.remove('down'); };
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => el.addEventListener(ev, up));
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    pedal(this.gasEl, 'gasDown'); pedal(this.brakeEl, 'brakeDown');

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code); Sound.unlock();
      if (e.code === 'KeyH') Sound.horn(true);
      if (e.code === 'Escape' || e.code === 'KeyP') window.dispatchEvent(new CustomEvent('dv-pause'));
      if (e.code === 'KeyC') window.dispatchEvent(new CustomEvent('dv-camera'));
      if (e.code === 'KeyR' && !e.repeat) window.dispatchEvent(new CustomEvent('dv-radio'));
      if (e.code === 'KeyT' && !e.repeat) window.dispatchEvent(new CustomEvent('dv-tune'));
      if (e.code === 'KeyV' && !e.repeat) window.dispatchEvent(new CustomEvent('dv-window'));
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'KeyH') Sound.horn(false); });
    window.addEventListener('blur', () => { this.keys.clear(); this.gasDown = this.brakeDown = false; });
  },
  setEnabled(on) {
    this.enabled = on;
    if (!on) { this.gasDown = this.brakeDown = false; this.hold = false; this.gasEl.classList.remove('down'); this.brakeEl.classList.remove('down'); Sound.horn(false); }
  },
  update(dt) {
    const K = this.keys, R = Settings.steerRange;
    const kl = K.has('KeyA') || K.has('ArrowLeft'), kr = K.has('KeyD') || K.has('ArrowRight');
    if (kl || kr) { this.deg = clamp(this.deg + (kr ? 1 : -1) * R * 1.6 * dt, -R, R); }
    else if (!this.hold) this.deg *= Math.exp(-5.5 * dt);   // self-centring
    if (Math.abs(this.deg) < 0.05 && !this.hold) this.deg = 0;
    this.steer = this.deg / R;
    const g = this.gasDown || K.has('KeyW') || K.has('ArrowUp'), b = this.brakeDown || K.has('KeyS') || K.has('ArrowDown') || K.has('Space');
    // pedal travel: you feather in over ~a third of a second
    this.gas = g ? Math.min(1, this.gas + dt * 3.2) : Math.max(0, this.gas - dt * 7);
    this.brake = b ? Math.min(1, this.brake + dt * 4) : Math.max(0, this.brake - dt * 9);
    this.wheelRot.style.transform = `rotate(${this.deg.toFixed(1)}deg)`;
    this.gasEl.style.setProperty('--press', this.gas.toFixed(2));
    this.brakeEl.style.setProperty('--press', this.brake.toFixed(2));
  },
  reset() { this.deg = 0; this.gas = this.brake = 0; this.steer = 0; },
};
