// ─────────────────────────────────────────────────────────────────────────────
// The car: a rusted 1970s-style 4x4 (open top, flat fenders, round lamps,
// roll bar, spare and jerry can) and its driving model.
// Physics: single-track ("bicycle") model with a magic-formula tyre per axle,
// friction circle, longitudinal load transfer, rear-wheel drive through a
// torque converter and a 4-speed automatic, aero drag, rolling resistance by
// surface, gravity on grades, brakes that can lock on loose sand. The body
// rides on springs (squat, dive, roll) over the real terrain under each wheel.
// ─────────────────────────────────────────────────────────────────────────────
const CAR = {
  m: 1550, Iz: 2600, a: 1.15, b: 1.25, h: 0.72, track: 1.5, r: 0.4,
  gears: [0, 2.8, 1.62, 1.0, 0.74], rev: 2.6, final: 3.73, eff: 0.86,
  idle: 750, redline: 5200, stall: 2100, maxSteer: 0.6,  // 34° at the road wheels
};
function engineTorque(rpm) { // 4.0 L straight-six-ish: ~310 Nm at 3000 rpm
  if (rpm < 500) return 0;
  const t = 285 * (1 - Math.pow((rpm - 3000) / 3900, 2));
  return Math.max(0, rpm > CAR.redline ? t * 0.2 : t);
}

class Car {
  constructor(scene) {
    this.scene = scene;
    this.build();
    this.reset(20);
  }
  build() {
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.82, metalness: 0.15 }, o));
    const rust = std({ map: TEX.rust }), metal = std({ map: TEX.metal, metalness: 0.4, roughness: 0.6 });
    const black = std({ color: 0x1a1918, roughness: 0.9 }), seat = std({ color: 0x3b2a1e, roughness: 0.95 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfd4d8, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.3, depthWrite: false });
    this.lampMat = std({ color: 0xfff6dc, emissive: 0xffe9b8, emissiveIntensity: 0.1, roughness: 0.3 });
    this.tailMat = std({ color: 0x6a1010, emissive: 0xff2010, emissiveIntensity: 0.15 });
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ';
    this.body = new THREE.Group(); this.root.add(this.body);
    const B = this.body;
    const box = (w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; B.add(o); return o; };
    const cyl = (rt, rb, h, m, x, y, z, rx = 0, ry = 0, rz = 0, seg = 10) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; B.add(o); return o; };
    // body tub, cowl, hood, fenders
    box(1.6, 0.56, 2.15, rust, 0, 0.92, -0.5);
    box(1.52, 0.5, 0.5, rust, 0, 0.98, 0.3);
    box(1.42, 0.12, 1.32, rust, 0, 1.18, 1.0, 0.03);
    box(1.2, 0.36, 1.32, rust, 0, 0.94, 1.0);
    [-1, 1].forEach((s) => {
      box(0.34, 0.05, 1.15, rust, s * 0.86, 1.09, 0.98);
      box(0.34, 0.05, 0.45, rust, s * 0.86, 0.95, 1.6, -0.55);
      box(0.13, 0.3, 1.0, rust, s * 0.84, 1.0, -1.25);
      box(0.06, 0.05, 0.5, metal, s * 0.84, 0.7, 0.2); // step
    });
    // grille with vertical slots and round headlamps
    const gc = makeCanvas(256, 128), gg = gc.getContext('2d');
    gg.drawImage(TEX.rust.image, 0, 0, 256, 128);
    gg.fillStyle = '#120d0a'; for (let i = 0; i < 7; i++) gg.fillRect(58 + i * 21, 22, 11, 88);
    const grille = box(1.2, 0.66, 0.08, std({ map: canvasTex(gc) }), 0, 0.93, 1.68);
    void grille;
    this.lamps = [];
    [-1, 1].forEach((s) => {
      cyl(0.13, 0.13, 0.1, metal, s * 0.5, 1.02, 1.71, Math.PI / 2);
      const l = cyl(0.105, 0.105, 0.04, this.lampMat, s * 0.5, 1.02, 1.765, Math.PI / 2); this.lamps.push(l);
      box(0.12, 0.16, 0.05, this.tailMat, s * 0.74, 0.98, -1.6);
    });
    box(1.85, 0.14, 0.16, metal, 0, 0.6, 1.84);
    box(1.7, 0.14, 0.14, metal, 0, 0.62, -1.66);
    // windshield frame (folded up) and roll bar
    const wsh = new THREE.Group(); wsh.position.set(0, 1.22, 0.55); wsh.rotation.x = -0.22; B.add(wsh);
    const fr = (w, h, d, x, y) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rust); o.position.set(x, y, 0); o.castShadow = true; wsh.add(o); };
    fr(1.48, 0.06, 0.06, 0, 0.62); fr(1.48, 0.06, 0.06, 0, 0.02); fr(0.06, 0.62, 0.06, -0.71, 0.32); fr(0.06, 0.62, 0.06, 0.71, 0.32);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 0.56), glass); gl.position.set(0, 0.32, 0); wsh.add(gl);
    [-1, 1].forEach((s) => { cyl(0.04, 0.04, 0.85, black, s * 0.7, 1.55, -0.72); cyl(0.04, 0.04, 0.95, black, s * 0.7, 1.55, -1.12, 0.95); });
    cyl(0.04, 0.04, 1.4, black, 0, 1.97, -0.72, 0, 0, Math.PI / 2);
    // seats, spare tyre, jerry can, exhaust
    [-1, 1].forEach((s) => { box(0.5, 0.14, 0.5, seat, s * 0.38, 1.12, -0.25); box(0.5, 0.55, 0.12, seat, s * 0.38, 1.42, -0.52, -0.12); });
    box(1.3, 0.14, 0.45, seat, 0, 1.12, -1.15);
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 16), black); spare.rotation.x = Math.PI / 2; spare.position.set(0.3, 1.15, -1.82); spare.castShadow = true; B.add(spare);
    cyl(0.2, 0.2, 0.27, metal, 0.3, 1.15, -1.82, Math.PI / 2);
    box(0.17, 0.45, 0.32, std({ color: 0x8a2a1c, map: TEX.metal }), -0.52, 1.18, -1.8);
    cyl(0.04, 0.04, 0.5, metal, -0.55, 0.5, -1.7, Math.PI / 2);
    // steering wheel + driver in a hat
    this.steerWheel = new THREE.Group(); this.steerWheel.position.set(0.38, 1.42, 0.3); this.steerWheel.rotation.x = -0.9; B.add(this.steerWheel);
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 6, 20), black); this.steerWheel.add(sw);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.02), black); this.steerWheel.add(spoke);
    const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.19, 0.02), black); spoke2.position.y = -0.09; this.steerWheel.add(spoke2);
    const handM = std({ color: 0x7a5236, roughness: 0.9 });
    [Math.PI * 0.82, Math.PI * 0.18].forEach((a) => { const hnd = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), handM); hnd.scale.set(1, 1.25, 0.9); hnd.position.set(Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0.015); this.steerWheel.add(hnd); });
    const shirt = std({ color: 0x5f7a92 }), skin = std({ color: 0xb07a52 }), hat = std({ color: 0x8a6a44 }), jeans = std({ color: 0x2f3b52 });
    const D = new THREE.Group(); D.position.set(0.38, 1.2, -0.28); B.add(D);
    const dm = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; D.add(o); return o; };
    this.bodyParts = [dm(new THREE.CylinderGeometry(0.17, 0.15, 0.55, 10), shirt, 0, 0.32, 0, -0.1)];
    this.headParts = [
      dm(new THREE.SphereGeometry(0.11, 12, 10), skin, 0, 0.72, 0.03),
      dm(new THREE.CylinderGeometry(0.3, 0.3, 0.018, 18), hat, 0, 0.8, 0.03, -0.06),
      dm(new THREE.CylinderGeometry(0.1, 0.12, 0.13, 12), hat, 0, 0.87, 0.03, -0.06),
      dm(new THREE.BoxGeometry(0.17, 0.035, 0.03), black, 0, 0.73, 0.13)];
    [-1, 1].forEach((s) => {
      this.bodyParts.push(dm(new THREE.CylinderGeometry(0.045, 0.04, 0.42, 8), shirt, s * 0.2, 0.42, 0.22, -1.15, 0, s * 0.15));
      this.bodyParts.push(dm(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), jeans, s * 0.1, 0.02, 0.27, -1.45));
    });
    // wheels: pivot (steer) → spin
    this.wheels = [];
    const tyreGeo = new THREE.CylinderGeometry(CAR.r, CAR.r, 0.3, 20); tyreGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.31, 12); rimGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.33, 8); hubGeo.rotateZ(Math.PI / 2);
    const tread = std({ map: TEX.tread, roughness: 0.95, color: 0x2a2826 }), rimM = std({ color: 0x9a8e7c, map: TEX.metal, metalness: 0.5, roughness: 0.6 });
    [[1, CAR.a], [-1, CAR.a], [1, -CAR.b], [-1, -CAR.b]].forEach(([s, z], i) => {
      const pivot = new THREE.Group(); pivot.position.set(s * CAR.track / 2, CAR.r, z); this.root.add(pivot);
      const spin = new THREE.Group(); pivot.add(spin);
      const t = new THREE.Mesh(tyreGeo, tread); t.castShadow = true; spin.add(t);
      spin.add(new THREE.Mesh(rimGeo, rimM)); spin.add(new THREE.Mesh(hubGeo, metal));
      for (let k = 0; k < 5; k++) { const nut = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.03), metal); nut.position.set(0, Math.cos(k * 1.256) * 0.16, Math.sin(k * 1.256) * 0.16); spin.add(nut); }
      this.wheels.push({ pivot, spin, side: s, z, front: i < 2, y: CAR.r });
    });
    // doors with framed roll-up windows (the glass slides down inside the door skin)
    this.glass = [];
    const winGlass = new THREE.MeshStandardMaterial({ color: 0x9fc0cc, transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.5, side: THREE.DoubleSide, depthWrite: false });
    [-1, 1].forEach((s) => {
      const x = s * 0.825;
      box(0.05, 0.54, 1.02, rust, x, 0.93, -0.06);
      box(0.06, 0.03, 0.14, metal, x + s * 0.02, 1.08, -0.42);                           // handle
      box(0.04, 0.035, 0.92, rust, x, 1.64, -0.12);                                      // frame top
      box(0.04, 0.44, 0.035, rust, x, 1.42, -0.56);                                      // rear post
      box(0.04, 0.48, 0.035, rust, x, 1.42, 0.33, -0.2);                                 // front post
      const g = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.42), winGlass);
      g.rotation.y = Math.PI / 2; g.position.set(x, 1.41, -0.12); g.renderOrder = 3; B.add(g); this.glass.push(g);
      const seal = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.025, 0.02), black); seal.position.y = 0.2; g.add(seal);
    });
    this.windowPos = 0; this.windowTarget = 0;
    // dashboard with two dials and the radio
    const dc = makeCanvas(512, 96), dg = dc.getContext('2d');
    dg.fillStyle = '#2a2420'; dg.fillRect(0, 0, 512, 96);
    [[92, 'MPH'], [182, 'FUEL']].forEach(([cx, t]) => {
      dg.fillStyle = '#0e0c0b'; dg.beginPath(); dg.arc(cx, 48, 38, 0, 7); dg.fill();
      dg.strokeStyle = '#d8cfbd'; dg.lineWidth = 2; for (let i = 0; i < 9; i++) { const a = -2.4 + i * 0.6; dg.beginPath(); dg.moveTo(cx + Math.cos(a) * 28, 48 + Math.sin(a) * 28); dg.lineTo(cx + Math.cos(a) * 34, 48 + Math.sin(a) * 34); dg.stroke(); }
      dg.fillStyle = '#d8cfbd'; dg.font = '700 13px sans-serif'; dg.textAlign = 'center'; dg.fillText(t, cx, 76);
    });
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.16, 0.26), [rust, rust, rust, rust, rust, std({ map: canvasTex(dc), roughness: 0.9 })]);
    dash.position.set(0, 1.27, 0.44); dash.castShadow = true; B.add(dash);
    this.radioCanvas = makeCanvas(256, 64); this.radioTex = canvasTex(this.radioCanvas);
    this.radioMat = std({ color: 0x111111, emissive: 0xffffff, emissiveMap: this.radioTex, emissiveIntensity: 1, map: this.radioTex });
    box(0.34, 0.1, 0.05, black, -0.05, 1.26, 0.29);
    const rface = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.078), this.radioMat); rface.position.set(-0.05, 1.26, 0.264); rface.rotation.y = Math.PI; B.add(rface);
    this.drawRadio(null);
    // first-person eye point (driver's head) — the camera reads its world transform
    this.eye = new THREE.Object3D(); this.eye.position.set(0.38, 1.68, -0.36); B.add(this.eye);
    // headlights
    this.heads = [];
    [-1, 1].forEach((s) => {
      const L = new THREE.SpotLight(0xfff0d0, 0, 95, 0.42, 0.55, 1.4);
      L.position.set(s * 0.5, 1.02, 1.8); L.target.position.set(s * 0.6, 0.2, 14);
      this.root.add(L, L.target); this.heads.push(L);
    });
    this.scene.add(this.root);
  }

  reset(z, speed = 0) {
    this.x = roadX(z) + LANE_X; this.z = z;
    this.psi = Math.atan(roadDX(z)); this.u = speed; this.v = 0; this.r = 0;
    this.gear = 1; this.mode = 'D'; this.rpm = CAR.idle; this.shiftT = 0; this.revT = 0;
    this.engineOn = true; this.throttle = 0; this.brake = 0; this.delta = 0; this.ax = 0; this.ay = 0;
    this.pitch = 0; this.roll = 0; this.pv = 0; this.rv = 0; this.bodyY = 0; this.bvY = 0;
    this.slip = 0; this.spinV = 0; this.wheelSpin = 0; this.surf = 'asphalt'; this.impact = 0;
    this.y = groundH(this.x, this.z);
    this.hist = [];
    this.updateVisual(0);
  }
  get speed() { return this.u; }
  forward(out) { return out.set(Math.sin(this.psi), 0, Math.cos(this.psi)); }

  // input: steer -1 (left) .. 1 (right) as the driver sees it, gas & brake 0..1
  update(dt, input, colliders) {
    const h = 1 / 120;
    let acc = Math.min(dt, 0.1);
    while (acc > 1e-6) { const s = Math.min(h, acc); this.step(s, input); acc -= s; }
    this.collide(colliders);
    this.updateVisual(dt);
  }

  step(h, inp) {
    const m = CAR.m, L = CAR.a + CAR.b;
    // brake-to-reverse automatic
    const absU = Math.abs(this.u);
    if (inp.park) { /* parked: no gear changes */ }
    else if (this.mode === 'D' && absU < 0.4 && inp.brake > 0.5 && inp.gas < 0.05) { this.revT += h; if (this.revT > 0.9) { this.mode = 'R'; this.revT = 0; Sound.shift(); if (this.onReverse) this.onReverse(); } }
    else if (this.mode === 'R' && absU < 0.6 && inp.gas > 0.5) { this.revT += h; if (this.revT > 0.2) { this.mode = 'D'; this.gear = 1; this.revT = 0; } }
    else this.revT = 0;
    const thr = inp.park ? 0 : this.mode === 'D' ? inp.gas : inp.brake;
    const brk = inp.park ? 1 : this.mode === 'D' ? inp.brake : inp.gas;
    this.throttle = this.engineOn ? thr : 0; this.brake = brk;

    // steering: the wheel's rotation maps straight to the road wheels
    let lock = CAR.maxSteer;
    if (Settings.assist) lock = CAR.maxSteer / (1 + (absU * absU) / 260);
    const target = -inp.steer * lock;
    this.delta += clamp(target - this.delta, -3.2 * h, 3.2 * h);

    // surface & loads
    const f = this.forward(_v1);
    const fx = this.x + f.x * CAR.a, fz = this.z + f.z * CAR.a, rx = this.x - f.x * CAR.b, rz = this.z - f.z * CAR.b;
    const sf = SURFACE[surfaceAt(fx, fz)], sr = SURFACE[surfaceAt(rx, rz)];
    this.surf = surfaceAt(this.x, this.z);
    const Nf = clamp(m * GRAV * CAR.b / L - m * this.ax * CAR.h / L, 1500, 15000);
    const Nr = clamp(m * GRAV * CAR.a / L + m * this.ax * CAR.h / L, 1500, 15000);

    // drivetrain
    const ratio = this.mode === 'R' ? CAR.rev : CAR.gears[this.gear];
    const wheelRpm = (absU / CAR.r) * 60 / (2 * Math.PI) * ratio * CAR.final;
    const convRpm = CAR.idle + this.throttle * (CAR.stall - CAR.idle);
    let rpm = Math.max(wheelRpm + this.wheelSpin * 400, convRpm);
    if (!this.engineOn) rpm = 0;
    this.rpm = damp(this.rpm, rpm, 12, h);
    const mult = 1 + 0.55 * clamp(1 - wheelRpm / Math.max(convRpm, 1), 0, 1);          // converter torque multiplication
    let drive = 0;
    if (this.engineOn && this.shiftT <= 0.2) drive = engineTorque(this.rpm) * this.throttle * ratio * CAR.final * CAR.eff * mult / CAR.r;
    if (this.mode === 'R') drive = -drive;
    // engine braking when coasting in gear
    if (this.engineOn && this.throttle < 0.05 && absU > 1) drive -= Math.sign(this.u) * 32 * ratio * CAR.final / CAR.r * clamp(this.rpm / 2500, 0.3, 1.2);
    // automatic shifting
    this.shiftT = Math.max(0, this.shiftT - h);
    if (this.mode === 'D' && this.shiftT <= 0) {
      const up = lerp(2100, 4700, this.throttle), down = lerp(1000, 1700, this.throttle);
      const nextRpm = this.gear < 4 ? wheelRpm * CAR.gears[this.gear + 1] / CAR.gears[this.gear] : 0;
      // upshift at the shift point, or once the Jeep has stopped pulling hard (cruise)
      if (this.gear < 4 && (wheelRpm > up || (this.ax < 0.35 && absU > 14 && nextRpm > 1900))) { this.gear++; this.shiftT = 0.35; Sound.shift(); }
      else if (this.gear > 1 && wheelRpm < down) { this.gear--; this.shiftT = 0.3; }
    }

    // brakes (front-biased); hold the car still at a stop
    const Fb = brk * 0.95 * m * GRAV;
    let FbF = Fb * 0.62, FbR = Fb * 0.38;

    // tyres
    const sd = Math.sin(this.delta), cd = Math.cos(this.delta);
    const vxF = this.u * cd + (this.v + CAR.a * this.r) * sd, vyF = -this.u * sd + (this.v + CAR.a * this.r) * cd;
    const vxR = this.u, vyR = this.v - CAR.b * this.r;
    const aF = Math.atan2(vyF, Math.abs(vxF) + 0.6), aR = Math.atan2(vyR, Math.abs(vxR) + 0.6);
    const tyre = (alpha, N, mu) => -mu * N * Math.sin(1.35 * Math.atan(9 * alpha));
    let FyF = tyre(aF, Nf, sf.mu), FyR = tyre(aR, Nr, sr.mu);
    // longitudinal per axle (wheel frame)
    let FxF = -Math.sign(vxF) * Math.min(FbF, Math.abs(vxF) * m * 0.5 / h);
    let FxR = drive - Math.sign(vxR) * Math.min(FbR, Math.abs(vxR) * m * 0.5 / h);
    // friction circle: a locked or spinning axle loses side grip
    const limF = sf.mu * Nf, limR = sr.mu * Nr;
    let lockF = 0, spinR = 0;
    if (Math.abs(FxF) > limF) { lockF = 1; FxF = Math.sign(FxF) * limF; }
    if (Math.abs(FxR) > limR) { spinR = (Math.abs(FxR) - limR) / limR; FxR = Math.sign(FxR) * limR; }
    FyF *= Math.sqrt(Math.max(0.05, 1 - (FxF / limF) ** 2)); FyR *= Math.sqrt(Math.max(0.05, 1 - (FxR / limR) ** 2));
    if (lockF) FyF *= 0.5;
    this.wheelSpin = damp(this.wheelSpin, clamp(spinR, 0, 3), 6, h);

    // to body frame
    let Fx = FxF * cd - FyF * sd + FxR;
    let Fy = FxF * sd + FyF * cd + FyR;
    const Mz = CAR.a * (FxF * sd + FyF * cd) - CAR.b * FyR;
    // resistances: rolling (surface), aero, grade
    const crr = (sf.roll + sr.roll) / 2;
    Fx -= Math.sign(this.u) * Math.min(crr * m * GRAV, absU * m / h) + 0.5 * 1.2 * 0.62 * 2.9 * this.u * absU;
    const hF = groundH(fx, fz), hR = groundH(rx, rz);
    const grade = (hF - hR) / L;
    Fx -= m * GRAV * grade / Math.sqrt(1 + grade * grade);

    this.ax = Fx / m; this.ay = Fy / m;
    this.u += (this.ax + this.v * this.r) * h;
    this.v += (this.ay - this.u * this.r) * h;
    this.r += (Mz / CAR.Iz) * h;
    // below walking pace blend into pure rolling kinematics (no sideways creep)
    const k = smoothstep(0.8, 4, absU);
    this.r = lerp((this.u * Math.tan(this.delta)) / L, this.r, k);
    this.v = lerp(0, this.v, k);
    // a held brake (or a resting car on a gentle slope) stays put
    if (absU < 0.5 && brk > 0.2 && Math.abs(grade) < brk * 0.9) { this.u = 0; this.v = 0; this.r = 0; }
    else if (absU < 0.35 && this.throttle < 0.02 && Math.abs(grade) < 0.06) { this.u *= Math.exp(-14 * h); }
    this.v *= Math.exp(-0.4 * h); this.r *= Math.exp(-0.25 * h);

    this.psi += this.r * h;
    const sp = Math.sin(this.psi), cp = Math.cos(this.psi);
    this.x += (sp * this.u + cp * this.v) * h;
    this.z += (cp * this.u - sp * this.v) * h;
    this.slip = Math.max(Math.abs(aF) * smoothstep(2, 6, absU), Math.abs(aR) * smoothstep(2, 6, absU), lockF * smoothstep(1, 4, absU) * 0.6, this.wheelSpin * 0.25);
    this.grade = grade; this.lockF = lockF;
  }

  collide(colliders) {
    if (!colliders || !colliders.length) return;
    const f = this.forward(_v1);
    this.impact = 0;
    for (const off of [1.25, 0, -1.25]) {
      const cx = this.x + f.x * off, cz = this.z + f.z * off, R = 0.95;
      for (const c of colliders) {
        let nx, nz, pen;
        if (c.box) {
          const qx = clamp(cx, c.x0, c.x1), qz = clamp(cz, c.z0, c.z1);
          const dx = cx - qx, dz = cz - qz, d = Math.hypot(dx, dz);
          if (d >= R) continue;
          if (d < 1e-4) { nx = 0; nz = cz < (c.z0 + c.z1) / 2 ? -1 : 1; pen = R; } else { nx = dx / d; nz = dz / d; pen = R - d; }
        } else {
          const dx = cx - c.x, dz = cz - c.z, d = Math.hypot(dx, dz), min = R + c.r;
          if (d >= min || d < 1e-4) continue;
          nx = dx / d; nz = dz / d; pen = min - d;
        }
        this.x += nx * pen; this.z += nz * pen;
        // velocity into the obstacle, in body frame
        const sp = Math.sin(this.psi), cp = Math.cos(this.psi);
        const nu = nx * sp + nz * cp, nv = nx * cp - nz * sp;
        const vn = this.u * nu + this.v * nv;
        if (vn < 0) {
          this.u -= 1.3 * vn * nu; this.v -= 1.3 * vn * nv;
          this.r += -vn * off * 0.25 * (nv >= 0 ? 1 : -1);
          this.impact = Math.max(this.impact, -vn);
        }
      }
    }
    if (this.impact > 1.5) { Sound.crunch(this.impact); Game.shake = Math.min(0.6, this.impact * 0.05); }
  }

  updateVisual(dt) {
    const f = this.forward(_v1), sp = Math.sin(this.psi), cp = Math.cos(this.psi);
    const left = _v2.set(cp, 0, -sp);
    let sum = 0;
    const off = this.surf === 'asphalt' || this.surf === 'lot' ? 0 : 1;
    for (const w of this.wheels) {
      const wx = this.x + f.x * w.z + left.x * w.side * CAR.track / 2, wz = this.z + f.z * w.z + left.z * w.side * CAR.track / 2;
      const bump = off * SURFACE.sand.bump * (noise2(wx * 1.7, wz * 1.7) + 0.6 * noise2(wx * 4.1, wz * 4.1));
      w.h = groundH(wx, wz) + bump; sum += w.h;
    }
    const hAvg = sum / 4;
    const W = this.wheels;
    const pitchG = Math.atan2((W[0].h + W[1].h) / 2 - (W[2].h + W[3].h) / 2, CAR.a + CAR.b);
    const rollG = Math.atan2((W[0].h + W[2].h) / 2 - (W[1].h + W[3].h) / 2, CAR.track);
    this.y = hAvg;
    this.root.position.set(this.x, hAvg, this.z);
    this.root.rotation.set(-pitchG, this.psi, rollG);
    // wheel travel = residual from the averaged plane
    for (const w of W) {
      const plane = hAvg + Math.tan(pitchG) * (w.z - (CAR.a - CAR.b) / 2) + Math.tan(rollG) * w.side * CAR.track / 2;
      w.pivot.position.y = CAR.r + clamp(w.h - plane, -0.12, 0.12);
      if (w.front) w.pivot.rotation.y = this.delta;
      w.spin.rotation.x += (this.u / CAR.r + (w.front ? 0 : this.wheelSpin * 6 * Math.sign(this.u || 1)) * (w.front && this.lockF ? 0 : 1)) * dt;
    }
    // sprung body: squat under power, dive under braking, roll in corners, shake off-road
    if (dt > 0) {
      const tp = clamp(this.ax * 0.011, -0.07, 0.07), tr = clamp(this.ay * 0.012, -0.08, 0.08);
      this.pv += ((tp - this.pitch) * 90 - this.pv * 11) * dt; this.pitch += this.pv * dt;
      this.rv += ((tr - this.roll) * 80 - this.rv * 9) * dt; this.roll += this.rv * dt;
      const shake = off * Math.abs(this.u) * 0.0012 * (noise2(this.z * 2.3, 3) + noise2(this.x * 2.9, 5));
      this.body.position.y = shake + 0.02 * Math.sin(this.rpm * 0.01 * (this.engineOn ? 1 : 0) + (this._t = (this._t || 0) + dt * 30)) * (this.engineOn && Math.abs(this.u) < 1 ? 0.15 : 0);
      this.body.rotation.x = -this.pitch; this.body.rotation.z = this.roll;
    }
    this.steerWheel.rotation.z = this.delta * 9;
    this.tailMat.emissiveIntensity = this.brake > 0.1 ? 2.2 : (Sky.night > 0.4 ? 0.8 : 0.15);
  }
  drawRadio(info) {
    const g = this.radioCanvas.getContext('2d');
    g.fillStyle = '#0b0a08'; g.fillRect(0, 0, 256, 64);
    if (info) {
      g.fillStyle = '#ffb347'; g.font = '700 30px "Overpass Mono", monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(info.freq, 12, 24); g.font = '600 16px "Overpass", sans-serif'; g.fillStyle = '#ffcf8a'; g.fillText(info.call + ' · ' + info.genre, 12, 50);
    } else { g.fillStyle = '#3a2a18'; g.font = '700 26px "Overpass Mono", monospace'; g.textBaseline = 'middle'; g.fillText('-- OFF --', 40, 32); }
    this.radioTex.needsUpdate = true;
  }
  setFirstPerson(fp) { if (this._fp === fp) return; this._fp = fp; this.headParts.forEach((m) => (m.visible = !fp)); this.bodyParts.forEach((m) => (m.visible = !fp)); }
  animateWindows(dt) {
    const prev = this.windowPos;
    this.windowPos += clamp(this.windowTarget - this.windowPos, -dt * 0.55, dt * 0.55);
    for (const g of this.glass) g.position.y = 1.41 - (1 - this.windowPos) * 0.44;
    return this.windowPos !== prev;
  }
  setLights(n) {
    this.heads.forEach((L) => (L.intensity = n > 0.25 ? 3.2 * n : 0));
    this.lampMat.emissiveIntensity = n > 0.25 ? 2.5 : 0.1;
  }
  gearLabel() { if (!this.engineOn) return 'OFF'; return this.mode === 'R' ? 'R' : 'D' + this.gear; }
}
