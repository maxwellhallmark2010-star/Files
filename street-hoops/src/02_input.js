// ─────────────────────────────────────────────────────────────────────────────
// Input: floating virtual joystick + four touch buttons (multi-touch via
// Pointer Events), with a keyboard fallback for desktop testing.
//   Input.move       {x, y} in -1..1, y = up on screen (toward the hoop)
//   Input.btn[name]  {down, pressed, released}  — edges are valid for one frame
// Button names: shoot (also block/jump), pass (also steal/call), move
// (crossover / spin / step-back), sprint.
// ─────────────────────────────────────────────────────────────────────────────
const Input = (() => {
  const move = { x: 0, y: 0 };
  const btn = {};
  ['shoot', 'pass', 'move', 'sprint'].forEach((n) => (btn[n] = { down: false, pressed: false, released: false, src: 0 }));
  const keys = new Set();
  let joyId = null, joyOrigin = { x: 0, y: 0 }, joyVec = { x: 0, y: 0 };
  let enabled = false;
  const JOY_R = 58;
  let zone, base, knob;

  function press(name, srcBit) {
    const b = btn[name];
    if (!b.src) { b.down = true; b.pressed = true; }
    b.src |= srcBit;
  }
  function release(name, srcBit) {
    const b = btn[name];
    if (!(b.src & srcBit)) return;
    b.src &= ~srcBit;
    if (!b.src) { b.down = false; b.released = true; }
  }

  function init() {
    zone = document.getElementById('joyzone');
    base = document.getElementById('joybase');
    knob = document.getElementById('joyknob');

    zone.addEventListener('pointerdown', (e) => {
      if (joyId !== null || !enabled) return;
      e.preventDefault();
      joyId = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const r = zone.getBoundingClientRect();
      joyOrigin.x = e.clientX; joyOrigin.y = e.clientY;
      base.style.left = (e.clientX - r.left) + 'px';
      base.style.top = (e.clientY - r.top) + 'px';
      base.classList.add('active');
      updateKnob(e.clientX, e.clientY);
      Sound.unlock();
    });
    const endJoy = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null; joyVec.x = joyVec.y = 0;
      knob.style.transform = 'translate(-50%,-50%)';
      base.classList.remove('active');
    };
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) { e.preventDefault(); updateKnob(e.clientX, e.clientY); } });
    zone.addEventListener('pointerup', endJoy);
    zone.addEventListener('pointercancel', endJoy);
    zone.addEventListener('lostpointercapture', endJoy);

    document.querySelectorAll('[data-btn]').forEach((el) => {
      const name = el.dataset.btn;
      let id = null;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (id !== null) return;
        id = e.pointerId;
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        el.classList.add('down');
        press(name, 1);
        Sound.unlock();
      });
      const up = (e) => {
        if (e.pointerId !== id) return;
        id = null; el.classList.remove('down');
        release(name, 1);
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    const keyMap = { KeyJ: 'shoot', Space: 'shoot', KeyK: 'pass', KeyL: 'move', ShiftLeft: 'sprint', ShiftRight: 'sprint' };
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      keys.add(e.code);
      if (keyMap[e.code]) { press(keyMap[e.code], 2); e.preventDefault(); }
      if (e.code === 'Escape' || e.code === 'KeyP') window.dispatchEvent(new CustomEvent('sh-pause'));
      Sound.unlock();
    });
    window.addEventListener('keyup', (e) => { keys.delete(e.code); if (keyMap[e.code]) release(keyMap[e.code], 2); });
    window.addEventListener('blur', () => { keys.clear(); Object.keys(btn).forEach((n) => { btn[n].src = 0; btn[n].down = false; }); });
  }

  function updateKnob(cx, cy) {
    let dx = cx - joyOrigin.x, dy = cy - joyOrigin.y;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { // drag the base along so the stick never "sticks" at the rim
      const over = d - JOY_R;
      joyOrigin.x += (dx / d) * over; joyOrigin.y += (dy / d) * over;
      const r = zone.getBoundingClientRect();
      base.style.left = (joyOrigin.x - r.left) + 'px'; base.style.top = (joyOrigin.y - r.top) + 'px';
      dx = cx - joyOrigin.x; dy = cy - joyOrigin.y;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    let x = dx / JOY_R, y = -dy / JOY_R;
    const m = Math.hypot(x, y);
    if (m < 0.14) { x = 0; y = 0; } else { const s = Math.min(1, (m - 0.14) / 0.8) / m; x *= s; y *= s; }
    joyVec.x = x; joyVec.y = y;
  }

  function poll() {
    let kx = 0, ky = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) ky += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) ky -= 1;
    if (kx || ky) { const m = Math.hypot(kx, ky); move.x = kx / m; move.y = ky / m; }
    else { move.x = joyVec.x; move.y = joyVec.y; }
  }
  function endFrame() { for (const n in btn) { btn[n].pressed = false; btn[n].released = false; } }
  function reset() {
    for (const n in btn) { btn[n].pressed = btn[n].released = btn[n].down = false; btn[n].src = 0; }
    document.querySelectorAll('[data-btn].down').forEach((el) => el.classList.remove('down'));
    joyId = null; joyVec.x = joyVec.y = 0; move.x = move.y = 0;
    if (base) base.classList.remove('active');
  }
  function setEnabled(on) { enabled = on; if (!on) reset(); }

  return { init, poll, endFrame, reset, setEnabled, move, btn };
})();
