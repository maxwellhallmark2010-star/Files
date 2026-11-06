// ─────────────────────────────────────────────────────────────────────────────
// Game: fuel, thirst, gas-station stops, towing, the clock, the chase camera,
// and the main loop. App owns the renderer and quality presets.
// ─────────────────────────────────────────────────────────────────────────────
const TANK_START = 0.62;
const Game = {
  state: 'menu', time: 0, hour: 16.2, fuel: TANK_START, thirst: 1, bottles: 1, run: 0, total: 0, tows: 0,
  fueling: false, canFuel: false, canWater: false, waterLeft: 0, stranded: false, shake: 0, camMode: 0,
  init(scene, camera) {
    this.scene = scene; this.camera = camera;
    World.init(scene);
    Dust.init(scene);
    Tumbleweeds.init(scene);
    this.car = new Car(scene);
    this.car.onReverse = () => { if (this.state === 'drive') HUD.toast('Reverse: hold BRAKE to back up, GAS to go forward', 'info', 2200); };
    this.colliders = [];
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.camYaw = 0;
    window.addEventListener('dv-camera', () => {
      const order = ['near', 'far', 'first'];
      Settings.camera = order[(order.indexOf(Settings.camera) + 1) % order.length]; saveSettings(); HUD.syncSettings();
      HUD.toast({ near: 'Close chase cam', far: 'Far chase cam', first: 'First person: drag the screen to look around' }[Settings.camera]);
    });
    window.addEventListener('dv-radio', () => this.toggleRadio());
    window.addEventListener('dv-tune', () => this.tuneRadio());
    window.addEventListener('dv-window', () => this.toggleWindows());
    // first-person look-around: drag on the open view, springs back on release
    this.look = 0; this.lookPitch = 0; this.looking = false;
    const cv = document.getElementById('c'); let lid = null, lx = 0, ly = 0;
    cv.addEventListener('pointerdown', (e) => { if (Settings.camera !== 'first' || this.state !== 'drive' || lid !== null) return; lid = e.pointerId; lx = e.clientX; ly = e.clientY; this.looking = true; try { cv.setPointerCapture(lid); } catch (err) { /* ignore */ } });
    cv.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; this.look = clamp(this.look - (e.clientX - lx) * 0.006, -1.9, 1.9); this.lookPitch = clamp(this.lookPitch - (e.clientY - ly) * 0.004, -0.5, 0.35); lx = e.clientX; ly = e.clientY; });
    const lend = (e) => { if (e.pointerId === lid) { lid = null; this.looking = false; } };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => cv.addEventListener(ev, lend));
    this.fpQ = new THREE.Quaternion(); this.fpE = new THREE.Euler(0, 0, 0, 'YXZ'); this.fpTmp = new THREE.Quaternion();
    this.applySky();
    this.parkAtStart();
    World.update(this.car.z, 99);
  },
  applySky() { const fixed = { midday: 12.8, sunset: 18.85, night: 22.5 }[Settings.sky]; if (fixed) this.hour = fixed; },
  parkAtStart() {
    this.car.reset(44);
    this.fuel = TANK_START; this.thirst = 1; this.bottles = 1; this.run = 0; this.fueling = false; this.stranded = false;
    this.car.engineOn = true; this.lastZ = this.car.z;
    Tumbleweeds.reset();
    this.camPos.set(this.car.x + Math.sin(this.time * 0.12) * 8.5, this.car.y + 2.2, this.car.z + Math.cos(this.time * 0.12) * 8.5);
    this.camYaw = this.car.psi;
  },
  start(fresh = false) {
    if (fresh || this.state === 'menu') { World.reset(); this.parkAtStart(); this.applySky(); World.update(this.car.z, 99); }
    this.state = 'drive';
    Controls.reset();
    HUD.show('game');
    Sound.start();
    HUD.toast('Brake held at a stop = reverse. Twist the wheel to steer.', 'info', 3500);
  },
  pause() { if (this.state !== 'drive') return; this.state = 'paused'; HUD.show('pause'); },
  resume() { this.state = 'drive'; HUD.show('game'); Controls.reset(); },
  toMenu() { this.state = 'menu'; this.saveBest(); World.reset(); this.parkAtStart(); World.update(this.car.z, 99); HUD.refreshBest(); HUD.show('menu'); },
  saveBest() { if (this.run > Store.get('bestRun', 0)) Store.set('bestRun', this.run); },

  // ── cabin: radio & windows ──────────────────────────────────────────────
  toggleRadio() {
    Sound.radioOn(!Sound.radioIsOn);
    const info = Sound.radioInfo(); this.car.drawRadio(info);
    HUD.toast(info ? `Radio on · ${info.freq} ${info.call} · ${info.genre}` : 'Radio off');
  },
  tuneRadio() {
    if (!Sound.radioIsOn) { this.toggleRadio(); return; }
    Sound.radioNext(); const info = Sound.radioInfo(); this.car.drawRadio(info);
    HUD.toast(`${info.freq} ${info.call} · ${info.genre}`);
  },
  toggleWindows() {
    const c = this.car; c.windowTarget = c.windowTarget > 0.5 ? 0 : 1;
    HUD.toast(c.windowTarget ? 'Rolling the windows up' : 'Rolling the windows down');
  },

  // ── station actions ───────────────────────────────────────────────────────
  toggleFuel() {
    if (this.fueling) { this.fueling = false; return; }
    if (!this.canFuel) return;
    if (this.fuel > 0.985) { HUD.toast('Tank is already full'); return; }
    this.fueling = true; Sound.ui();
  },
  grabWater() {
    const s = this.station;
    if (!this.canWater || !s) return;
    if (this.bottles >= 4) { HUD.toast('Hands full: 4 bottles max'); return; }
    if (s.takeBottle()) { this.bottles++; Sound.pick(); HUD.toast(`Grabbed a water bottle (${this.bottles} on board)`, 'good'); }
  },
  drink() {
    if (this.bottles <= 0) return;
    this.bottles--; this.thirst = Math.min(1, this.thirst + 0.5); Sound.gulp();
    HUD.toast('Ahh. Warm, but wet.', 'good');
  },
  tow() {
    if (!this.stranded) return;
    const fade = HUD.el.fade; fade.classList.add('on');
    this.saveBest();
    this.tows++;
    setTimeout(() => {
      const st = nextStationAhead(this.car.z, 1);
      const z = st.z, x = roadX(z) + st.side * 13.2;
      this.car.reset(z); this.car.x = x; this.car.psi = Math.atan(roadDX(z)); this.car.updateVisual(0);
      this.fuel = 0.03; this.car.engineOn = true; this.stranded = false; this.run = 0; this.lastZ = this.car.z;
      World.update(this.car.z, 99);
      this.camYaw = this.car.psi; const f = this.car.forward(_v1); this.camPos.set(this.car.x - f.x * 7, this.car.y + 3, this.car.z - f.z * 7);
      fade.classList.remove('on');
      HUD.toast('The tow truck dropped you at the pump. Tap FILL UP.', 'warn', 3500);
    }, 900);
  },

  // ── per frame ─────────────────────────────────────────────────────────────
  update(dt) {
    this.time += dt;
    const car = this.car, driving = this.state === 'drive';
    // clock: an hour of desert takes 40 s by day, 20 s by night
    if (Settings.sky === 'cycle') { const night = this.hour > 19.5 || this.hour < 5.5; this.hour = (this.hour + dt / (night ? 20 : 40)) % 24; }
    const hourF = (this.hour - 5) / 24 * Math.PI * 2;
    this.tempF = 102 - Math.cos(hourF - 0.35) * 16;   // ~118°F late afternoon, ~86°F before dawn

    // input
    let steer = 0, gas = 0, brake = 0, park = false;
    if (driving) {
      Controls.update(dt);
      steer = Controls.steer; gas = Controls.gas; brake = Controls.brake;
      if (this.thirst < 0.12) steer += Math.sin(this.time * 0.9) * 0.05 + Math.sin(this.time * 2.3) * 0.03; // heat-dazed drift
    } else if (this.state === 'menu') { park = true; }
    if (this.fueling) park = true;
    const paused = this.state === 'paused';
    if (!paused) {
      World.colliders(car.x, car.z, this.colliders);
      car.update(dt, { steer, gas, brake, park }, this.colliders);
      // fuel use: idle trickle + load; tank lasts ~4 miles of highway
      if (driving && car.engineOn) {
        this.fuel -= dt * (0.0011 + 0.0068 * car.throttle * (0.4 + car.rpm / 5000));
        if (this.fuel <= 0.12 && !this._lowWarn) { this._lowWarn = true; Sound.warn(); HUD.toast('Low fuel: pull into the next station', 'warn', 3000); }
        if (this.fuel > 0.2) this._lowWarn = false;
        if (this.fuel <= 0) { this.fuel = 0; car.engineOn = false; Sound.sputter(); HUD.toast('Out of gas! Coast or brake to a stop to call a tow.', 'bad', 3500); }
      }
      this.stranded = driving && !car.engineOn && Math.abs(car.u) < 1.5;
      // thirst
      if (driving) {
        this.thirst = Math.max(0, this.thirst - dt * (1 / 330) * (0.5 + (this.tempF - 80) / 38));
        if (this.thirst < 0.22 && !this._thirstWarn) { this._thirstWarn = true; Sound.warn(); HUD.toast(this.bottles ? 'You\'re parched. Drink some water.' : 'You\'re parched. Grab water at the next station.', 'warn', 3000); }
        if (this.thirst > 0.3) this._thirstWarn = false;
      }
      // distance
      const dz = car.z - this.lastZ; this.lastZ = car.z;
      if (driving) { this.run += Math.abs(car.u) * dt; this.total += Math.abs(car.u) * dt; }
      void dz;
      // stations
      const s = World.nearestStationObj(car.z); this.station = s;
      this.canFuel = false; this.canWater = false; this.waterLeft = 0;
      if (s && driving && Math.abs(s.info.z - car.z) < 40) {
        const still = Math.abs(car.u) < 0.8;
        for (const p of s.pumps) if (Math.hypot(p.x - car.x, p.z - car.z) < 4.6 && still) this.canFuel = true;
        this.waterLeft = s.bottles.length;
        if (Math.hypot(s.water.x - car.x, s.water.z - car.z) < 9 && still && s.bottles.length > 0) this.canWater = true;
      }
      if (this.fueling) {
        if (!this.canFuel) this.fueling = false;
        else { this.fuel = Math.min(1, this.fuel + dt * 0.14); if (this.fuel >= 1) { this.fueling = false; Sound.ding(); HUD.toast('Tank full. Back on the road.', 'good'); } }
        if (!car.engineOn && this.fuel > 0.04) { car.engineOn = true; Sound.start(); }
      }
      this.nextStation = nextStationAhead(car.z - 30, car.u >= -0.5 ? 1 : -1);
      // world streaming
      World.update(car.z, 1);
      this.emitDust(dt);
      Tumbleweeds.update(dt, car);
      Dust.rebase(car.z);
      Dust.update(dt, Tumbleweeds.wind);
    }
    this.updateCamera(dt);
    Sky.update(this.hour, this.camera.position, _v3.set(car.x, car.y, car.z), App.shadows);
    car.setLights(Sky.night); World.updateLights(Sky.night, car.z);
    Dust.uni.light.value = lerp(1, 0.25, Sky.night);
    const moving = car.animateWindows(dt); Sound.motor(moving);
    car.setFirstPerson(Settings.camera === 'first' && this.state !== 'menu');
    Sound.update({ windowsUp: car.windowPos > 0.75, rpm: car.rpm, throttle: car.throttle, engineOn: car.engineOn && this.state !== 'menu' ? car.engineOn : car.engineOn, speed: car.u, slip: car.slip, onAsphalt: car.surf === 'asphalt' || car.surf === 'lot', fueling: this.fueling });
    HUD.update(this);
  },
  emitDust(dt) {
    const car = this.car, f = car.forward(_v1), sp = Math.abs(car.u);
    const off = !(car.surf === 'asphalt' || car.surf === 'lot');
    const left = _v2.set(Math.cos(car.psi), 0, -Math.sin(car.psi));
    for (const s of [-1, 1]) {
      const wx = car.x - f.x * CAR.b + left.x * s * 0.75, wz = car.z - f.z * CAR.b + left.z * s * 0.75;
      if (off && sp > 1.5 && Math.random() < dt * (8 + sp * 2.2)) Dust.emit(wx, car.y + 0.25, wz, -f.x * sp * 0.15 + rand(-0.6, 0.6), rand(0.5, 1.6), -f.z * sp * 0.15 + rand(-0.6, 0.6), 0.9, rand(1.4, 2.6), 0.5, 0, 2.6);
      if (!off && car.slip > 0.22 && sp > 3 && Math.random() < dt * 30) Dust.emit(wx, car.y + 0.2, wz, rand(-0.5, 0.5), rand(0.3, 1), rand(-0.5, 0.5), 0.6, rand(0.8, 1.6), 0.45, 0.75, 2);
    }
    if (car.engineOn && car.throttle > 0.6 && Math.random() < dt * 10) {
      const ex = car.x - f.x * 1.75 - left.x * 0.55, ez = car.z - f.z * 1.75 - left.z * 0.55;
      Dust.emit(ex, car.y + 0.5, ez, -f.x * 1.5, 0.4, -f.z * 1.5, 0.25, 0.9, 0.3, 1, 1.2);
    }
  },
  updateCamera(dt) {
    const car = this.car, cam = this.camera;
    if (this.state === 'menu') {
      const a = this.time * 0.12;
      _v1.set(car.x + Math.sin(a) * 8.5, car.y + 2.2 + Math.sin(this.time * 0.2) * 0.5, car.z + Math.cos(a) * 8.5);
      this.camPos.lerp(_v1, 1 - Math.exp(-2 * dt));
      cam.position.copy(this.camPos); cam.lookAt(car.x, car.y + 1, car.z);
      cam.fov = 55; cam.updateProjectionMatrix();
      return;
    }
    if (Settings.camera === 'first') {
      // driver's eye: rides the sprung body, so you feel every dip and lean
      car.eye.getWorldPosition(cam.position);
      if (!this.looking) { this.look *= Math.exp(-3 * dt); this.lookPitch *= Math.exp(-3 * dt); }
      car.body.getWorldQuaternion(this.fpQ);
      this.fpE.set(-0.1 + this.lookPitch, Math.PI + this.look, 0);
      cam.quaternion.copy(this.fpQ).multiply(this.fpTmp.setFromEuler(this.fpE));
      const off = !(car.surf === 'asphalt' || car.surf === 'lot');
      const sh = this.shake * 0.5 + (off ? Math.abs(car.u) * 0.0008 : 0);
      if (sh > 0) { cam.position.y += rand(-sh, sh); }
      this.shake = Math.max(0, this.shake - dt * 1.5);
      this.camPos.copy(cam.position); this.camYaw = car.psi;
      const fov = (cam.aspect < 1 ? 80 : 70) + clamp(Math.abs(car.u) * 0.15, 0, 7);
      if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 3, dt); cam.updateProjectionMatrix(); }
      return;
    }
    const far = Settings.camera === 'far', portrait = cam.aspect < 1;
    let dist = far ? 10 : 6.8, hgt = far ? 3.9 : 2.7;
    if (portrait) { dist *= 1.35; hgt *= 1.4; }
    // trail the direction of travel a little when sliding, stay behind the nose when reversing
    let want = car.psi;
    if (car.u > 3) want += clamp(Math.atan2(car.v, car.u) * 0.5, -0.4, 0.4);
    this.camYaw += wrapAngle(want - this.camYaw) * (1 - Math.exp(-4.5 * dt));
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    _v1.set(car.x - fx * dist, 0, car.z - fz * dist);
    _v1.y = Math.max(car.y + hgt, groundH(_v1.x, _v1.z) + 1.2);
    this.camPos.x = damp(this.camPos.x, _v1.x, 10, dt); this.camPos.z = damp(this.camPos.z, _v1.z, 10, dt); this.camPos.y = damp(this.camPos.y, _v1.y, 6, dt);
    cam.position.copy(this.camPos);
    const off = !(car.surf === 'asphalt' || car.surf === 'lot');
    const sh = this.shake + (off ? Math.abs(car.u) * 0.0018 : 0);
    if (sh > 0) { cam.position.x += rand(-sh, sh); cam.position.y += rand(-sh, sh) * 0.6; }
    this.shake = Math.max(0, this.shake - dt * 1.5);
    this.camLook.set(car.x + fx * 2.5, car.y + (portrait ? 1.6 : 0.55), car.z + fz * 2.5);
    cam.lookAt(this.camLook);
    const fov = (portrait ? 68 : 58) + clamp(Math.abs(car.u) * 0.28, 0, 12);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 3, dt); cam.updateProjectionMatrix(); }
  },
};

const App = {
  last: 0, frameAcc: 0, frameN: 0, dprScale: 1,
  init() {
    const canvas = document.getElementById('c'), q = Settings.graphics;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q !== 'low', powerPreference: 'high-performance' });
    const r = this.renderer;
    r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.82;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 9000);
    buildTextures();
    Game.init(this.scene, this.camera);
    Controls.init(); HUD.init();
    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => { if (document.hidden) { Game.pause(); Sound.suspend(); } else Sound.resume(); });
    document.addEventListener('touchmove', (e) => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    HUD.show('menu');
    document.getElementById('loading').hidden = true;
    requestAnimationFrame((t) => { this.last = t; this.loop(t); });
  },
  applyQuality() {
    const q = Settings.graphics, r = this.renderer, dpr = window.devicePixelRatio || 1;
    this.baseDpr = q === 'low' ? 1 : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this.dprScale = 1; r.setPixelRatio(this.baseDpr);
    const shadows = q !== 'low';
    if (r.shadowMap.enabled !== shadows) { r.shadowMap.enabled = shadows; this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); }); }
    this.shadows = shadows;
    const size = q === 'high' ? 2048 : 1024;
    if (Sky.sun.shadow.mapSize.x !== size) { if (Sky.sun.shadow.map) { Sky.sun.shadow.map.dispose(); Sky.sun.shadow.map = null; } Sky.sun.shadow.mapSize.set(size, size); }
    this.resize();
  },
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    document.body.classList.toggle('portrait', w < h);
  },
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    let dt = (t - this.last) / 1000; this.last = t;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 1 / 20);
    Game.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.adapt(dt);
  },
  adapt(dt) {
    this.frameAcc += dt; this.frameN++;
    if (this.frameAcc < 2) return;
    const avg = this.frameAcc / this.frameN; this.frameAcc = 0; this.frameN = 0;
    if (avg > 1 / 40 && this.dprScale > 0.6) this.dprScale -= 0.12;
    else if (avg < 1 / 57 && this.dprScale < 1) this.dprScale = Math.min(1, this.dprScale + 0.06);
    else return;
    this.renderer.setPixelRatio(Math.max(0.75, this.baseDpr * this.dprScale));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  },
};

function boot() {
  const go = () => { try { App.init(); } catch (err) { console.error(err); document.getElementById('loadtxt').textContent = 'Could not start WebGL: ' + err.message; } };
  const fonts = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('800 40px "Overpass"'), document.fonts.load('600 20px "Overpass Mono"')]).catch(() => {}) : Promise.resolve();
  Promise.race([fonts, new Promise((r) => setTimeout(r, 1800))]).then(go);
}
window.FurnaceRoad = { Game, App, Settings, World, Controls, Tumbleweeds };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
