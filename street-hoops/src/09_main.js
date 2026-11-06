// ─────────────────────────────────────────────────────────────────────────────
// App: renderer, quality presets, adaptive resolution, main loop and the
// menu ⇄ game ⇄ pause flow.
// ─────────────────────────────────────────────────────────────────────────────
const App = {
  last: 0, frameAcc: 0, frameN: 0, dprScale: 1,
  init() {
    const canvas = document.getElementById('c');
    const q = Settings.graphics;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q !== 'low', powerPreference: 'high-performance' });
    const r = this.renderer;
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = q !== 'low';
    r.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x2b2142, 45, 150);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);
    this.world = buildWorld(this.scene, q);
    G.init(this.scene, this.camera, this.world);
    Input.init(); UI.init();
    this.applyQuality(true);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (UI.screen === 'game') this.pause(); Sound.suspend(); } else Sound.resume();
    });
    // iOS: stop page scroll / zoom gestures while playing
    document.addEventListener('touchmove', (e) => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    G.startMode('attract');
    UI.show('menu');
    document.getElementById('loading').hidden = true;
    requestAnimationFrame((t) => { this.last = t; this.loop(t); });
  },

  applyQuality(boot = false) {
    const q = Settings.graphics, r = this.renderer;
    const dpr = window.devicePixelRatio || 1;
    this.baseDpr = q === 'low' ? 1 : q === 'medium' ? Math.min(dpr, 1.6) : Math.min(dpr, 2);
    this.dprScale = 1;
    r.setPixelRatio(this.baseDpr);
    const shadows = q !== 'low';
    if (r.shadowMap.enabled !== shadows || !boot) {
      r.shadowMap.enabled = shadows;
      this.world.sun.castShadow = shadows;
      const size = q === 'high' ? 2048 : 1024;
      if (this.world.sun.shadow.map && this.world.sun.shadow.mapSize.x !== size) { this.world.sun.shadow.map.dispose(); this.world.sun.shadow.map = null; }
      this.world.sun.shadow.mapSize.set(size, size);
      this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); });
    }
    G.players.forEach((p) => (p.blob.visible = !shadows));
    this.shadowsOn = shadows;
    this.resize();
  },
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 68 : (Settings.camera === 'close' ? 56 : 50);
    this.camera.updateProjectionMatrix();
    document.body.classList.toggle('portrait', w < h);
    if (UI.checkRotate) UI.checkRotate();
  },

  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    let dt = (t - this.last) / 1000; this.last = t;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 1 / 20);
    Input.poll();
    if (!G.paused) G.update(dt);
    G.players.forEach((p) => { if (!this.shadowsOn) p.blob.visible = p.root.visible; else p.blob.visible = false; });
    UI.update(dt);
    this.renderer.render(this.scene, this.camera);
    Input.endFrame();
    this.adapt(dt);
  },
  // adaptive resolution: if frames run long for ~2 s, render fewer pixels
  adapt(dt) {
    this.frameAcc += dt; this.frameN++;
    if (this.frameAcc < 2) return;
    const avg = this.frameAcc / this.frameN; this.frameAcc = 0; this.frameN = 0;
    if (avg > 1 / 42 && this.dprScale > 0.6) { this.dprScale -= 0.12; }
    else if (avg < 1 / 58 && this.dprScale < 1) { this.dprScale = Math.min(1, this.dprScale + 0.06); }
    else return;
    this.renderer.setPixelRatio(Math.max(0.75, this.baseDpr * this.dprScale));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  },

  play(mode) {
    Sound.unlock();
    G.paused = false;
    G.startMode(mode);
    UI.show('game');
    Input.reset();
  },
  pause() {
    if (UI.screen !== 'game' || G.phase === 'over') return;
    G.paused = true; Input.reset(); UI.show('pause'); Sound.ui();
  },
  resume() { G.paused = false; UI.show('game'); Input.reset(); },
  toMenu() { G.paused = false; G.startMode('attract'); UI.refreshBest(); UI.show('menu'); },
};

function boot() {
  const go = () => { try { App.init(); } catch (err) { console.error(err); document.getElementById('loadtxt').textContent = 'This device could not start WebGL. ' + err.message; } };
  const fonts = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('900 40px "Big Shoulders Display"'), document.fonts.load('700 20px "Barlow Semi Condensed"')]).catch(() => {})
    : Promise.resolve();
  Promise.race([fonts, new Promise((r) => setTimeout(r, 1800))]).then(go);
}
window.StreetHoops = { G, App, Settings, Input };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
