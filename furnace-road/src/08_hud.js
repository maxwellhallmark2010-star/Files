// ─────────────────────────────────────────────────────────────────────────────
// HUD & menus: dashboard gauges (speedometer, tach, fuel, water), the next-gas
// readout, context buttons at the pump and the water stand, toasts, and the
// start / pause / settings / how-to screens.
// ─────────────────────────────────────────────────────────────────────────────
const SETTINGS_SCHEMA = [
  { key: 'units', label: 'Speed', options: [['mph', 'mph'], ['kmh', 'km/h']] },
  { key: 'steerRange', label: 'Wheel turn', options: [[180, '½ turn'], [270, '¾ turn'], [360, '1 turn'], [450, '1¼ turns']] },
  { key: 'assist', label: 'Steering at speed', options: [[true, 'Speed-sensitive'], [false, 'Raw']] },
  { key: 'camera', label: 'Camera', options: [['near', 'Close chase'], ['far', 'Far chase']] },
  { key: 'sky', label: 'Time of day', options: [['cycle', 'Day/night'], ['midday', 'Noon'], ['sunset', 'Sunset'], ['night', 'Night']] },
  { key: 'graphics', label: 'Graphics', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
  { key: 'sound', label: 'Sound', options: [[true, 'On'], [false, 'Off']] },
  { key: 'lefty', label: 'Layout', options: [[false, 'Wheel left'], [true, 'Wheel right']] },
];

const HUD = {
  cache: {}, screen: 'menu', settingsReturn: 'menu',
  init() {
    const $ = (id) => document.getElementById(id); this.$ = $;
    // speedometer ticks
    const svg = $('speedTicks'); let s = '';
    for (let i = 0; i <= 50; i++) {
      const a = (-120 + i * 4.8) * Math.PI / 180, major = i % 5 === 0;
      const r0 = major ? 40 : 43, r1 = 47;
      s += `<line x1="${(50 + Math.sin(a) * r0).toFixed(2)}" y1="${(50 - Math.cos(a) * r0).toFixed(2)}" x2="${(50 + Math.sin(a) * r1).toFixed(2)}" y2="${(50 - Math.cos(a) * r1).toFixed(2)}" stroke-width="${major ? 1.6 : 0.7}"/>`;
    }
    svg.innerHTML = s;
    this.buildSpeedLabels();
    this.el = {
      spdNeedle: $('spdNeedle'), spdNum: $('spdNum'), tach: $('tachFill'), gear: $('gear'), fuelNeedle: $('fuelNeedle'), fuelLight: $('fuelLight'),
      water: $('waterFill'), bottles: $('bottleCount'), next: $('nextGasVal'), nextDir: $('nextGasDir'), trip: $('tripVal'), clock: $('clock'), temp: $('temp'), elev: $('elev'),
      toast: $('toast'), thirst: $('thirstFx'), fade: $('fade'),
      actFuel: $('actFuel'), actWater: $('actWater'), actDrink: $('actDrink'), actTow: $('actTow'), stranded: $('stranded'),
      fuelProg: $('fuelProg'), waterLeft: $('waterLeft'),
    };
    $('startBtn').addEventListener('click', () => { Sound.unlock(); Sound.ui(); Game.start(); });
    $('howBtn').addEventListener('click', () => { Sound.unlock(); Sound.ui(); this.show('howto'); });
    $('setBtn').addEventListener('click', () => { Sound.unlock(); Sound.ui(); this.openSettings('menu'); });
    $('howBack').addEventListener('click', () => { Sound.ui(); this.show('menu'); });
    $('setBack').addEventListener('click', () => { Sound.ui(); this.show(this.settingsReturn); });
    $('pauseBtn').addEventListener('click', () => Game.pause());
    $('resumeBtn').addEventListener('click', () => { Sound.ui(); Game.resume(); });
    $('restartBtn').addEventListener('click', () => { Sound.ui(); Game.start(true); });
    $('pSetBtn').addEventListener('click', () => { Sound.ui(); this.openSettings('pause'); });
    $('quitBtn').addEventListener('click', () => { Sound.ui(); Game.toMenu(); });
    $('camBtn').addEventListener('click', () => window.dispatchEvent(new CustomEvent('dv-camera')));
    const tap = (el, fn) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); Sound.unlock(); fn(); });
    tap(this.el.actFuel, () => Game.toggleFuel());
    tap(this.el.actWater, () => Game.grabWater());
    tap(this.el.actDrink, () => Game.drink());
    tap(this.el.actTow, () => Game.tow());
    window.addEventListener('dv-pause', () => { if (this.screen === 'game') Game.pause(); else if (this.screen === 'pause') Game.resume(); });
    this.buildSettings(); this.applyLayout();
    this.refreshBest();
  },
  buildSpeedLabels() {
    const g = this.$('speedLabels'), max = Settings.units === 'mph' ? 100 : 160; let s = '';
    for (let i = 0; i <= 10; i++) {
      const a = (-120 + i * 24) * Math.PI / 180, r = 32;
      s += `<text x="${(50 + Math.sin(a) * r).toFixed(1)}" y="${(53 - Math.cos(a) * r).toFixed(1)}">${(max / 10) * i}</text>`;
    }
    g.innerHTML = s;
    this.$('spdUnit').textContent = Settings.units === 'mph' ? 'MPH' : 'KM/H';
  },
  show(name) {
    this.screen = name;
    ['menu', 'pause', 'settings', 'howto'].forEach((s) => (this.$(s).hidden = s !== name));
    const inGame = name === 'game';
    this.$('hud').hidden = !(inGame || name === 'pause' || (name === 'settings' && this.settingsReturn === 'pause'));
    document.body.classList.toggle('in-game', inGame);
    Controls.setEnabled(inGame);
    Sound.setLevel(inGame ? 1 : 0.35);
  },
  openSettings(from) { this.settingsReturn = from; this.syncSettings(); this.show('settings'); },
  buildSettings() {
    const list = this.$('settingsList'); list.innerHTML = '';
    SETTINGS_SCHEMA.forEach((s) => {
      const row = document.createElement('div'); row.className = 'set-row';
      const lab = document.createElement('div'); lab.className = 'set-label'; lab.textContent = s.label; lab.id = 'lbl-' + s.key;
      const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-labelledby', lab.id);
      s.options.forEach(([val, text]) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.id = `set-${s.key}-${String(val)}`; b.setAttribute('role', 'radio');
        b.addEventListener('click', () => { Sound.ui(); this.setSetting(s.key, val); });
        seg.appendChild(b);
      });
      row.append(lab, seg); list.appendChild(row);
    });
    this.syncSettings();
  },
  syncSettings() {
    SETTINGS_SCHEMA.forEach((s) => s.options.forEach(([val]) => {
      const b = document.getElementById(`set-${s.key}-${String(val)}`), on = Settings[s.key] === val;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    }));
  },
  setSetting(key, val) {
    Settings[key] = val; saveSettings(); this.syncSettings();
    if (key === 'units') { this.buildSpeedLabels(); this.cache = {}; }
    if (key === 'graphics') App.applyQuality();
    if (key === 'sound') Sound.setEnabled();
    if (key === 'lefty') this.applyLayout();
    if (key === 'sky') Game.applySky();
  },
  applyLayout() { document.body.classList.toggle('lefty', !!Settings.lefty); },
  refreshBest() {
    const b = Store.get('bestRun', 0);
    this.$('bestRun').textContent = b > 0.05 ? `Longest run without a tow: ${this.dist(b)}` : 'Fill up when you can. Stations are about 1.4 miles apart.';
  },
  dist(m) { return Settings.units === 'mph' ? (m / 1609.34).toFixed(1) + ' mi' : (m / 1000).toFixed(1) + ' km'; },

  toast(text, kind = 'info', ms = 2200) {
    const t = this.el.toast; t.textContent = text; t.className = ''; void t.offsetWidth; t.className = 'show k-' + kind;
    clearTimeout(this._tt); this._tt = setTimeout(() => (t.className = ''), ms);
  },
  set(key, el, val, prop = 'textContent') { if (this.cache[key] !== val) { this.cache[key] = val; el[prop] = val; } },
  vis(key, el, on) { if (this.cache[key] !== on) { this.cache[key] = on; el.hidden = !on; } },

  update(G) {
    if (this.screen !== 'game' && this.screen !== 'pause') return;
    const E = this.el, car = G.car;
    const sp = Math.abs(car.u) * (Settings.units === 'mph' ? MPH : KMH), max = Settings.units === 'mph' ? 100 : 160;
    this.set('spdN', E.spdNum, String(Math.round(sp)));
    E.spdNeedle.setAttribute('transform', `rotate(${(-120 + clamp(sp / max, 0, 1.04) * 240).toFixed(1)} 50 50)`);
    this.set('tach', E.tach.style, (clamp(car.rpm / 6000, 0, 1) * 100).toFixed(0) + '%', 'width');
    this.set('tachR', E.tach, car.rpm > 4800 ? 'red' : '', 'className');
    this.set('gear', E.gear, car.gearLabel());
    E.fuelNeedle.setAttribute('transform', `rotate(${(-60 + clamp(G.fuel, 0, 1) * 120).toFixed(1)} 50 56)`);
    const low = G.fuel < 0.18;
    const fl = low && G.time % 1 < 0.6 ? 'on' : '';
    if (this.cache.fl !== fl) { this.cache.fl = fl; E.fuelLight.setAttribute('class', fl); }
    this.set('water', E.water.style, (clamp(G.thirst, 0, 1) * 100).toFixed(0) + '%', 'height');
    this.set('wlow', E.water, G.thirst < 0.25 ? 'low' : '', 'className');
    this.set('bot', E.bottles, '×' + G.bottles);
    const st = G.nextStation;
    if (st) {
      const d = Math.abs(st.z - car.z);
      this.set('next', E.next, d < 60 ? 'HERE' : this.dist(d));
      this.set('nextDir', E.nextDir, st.side < 0 ? 'on the right' : 'on the left');
    }
    this.set('trip', E.trip, this.dist(G.run));
    const hr = Math.floor(G.hour) % 24, mn = Math.floor((G.hour % 1) * 60);
    this.set('clock', E.clock, `${((hr + 11) % 12) + 1}:${String(mn).padStart(2, '0')} ${hr < 12 ? 'AM' : 'PM'}`);
    this.set('temp', E.temp, `${Math.round(G.tempF)}°F`);
    const ft = elevationFt(car.z);
    this.set('elev', E.elev, ft < 0 ? `${-ft} ft below sea level` : `${ft} ft`);
    // context buttons
    this.vis('aF', E.actFuel, G.canFuel || G.fueling);
    this.set('aFt', E.actFuel.firstChild, G.fueling ? 'STOP PUMP' : (G.fuel > 0.985 ? 'TANK FULL' : 'FILL UP'));
    this.set('aFp', E.fuelProg.style, (G.fuel * 100).toFixed(0) + '%', 'width');
    this.vis('aW', E.actWater, G.canWater);
    this.set('aWl', E.waterLeft, G.waterLeft + ' left');
    this.vis('aD', E.actDrink, G.bottles > 0 && G.thirst < 0.6);
    this.vis('str', E.stranded, G.stranded);
    E.thirst.style.opacity = (1 - smoothstep(0, 0.3, G.thirst)).toFixed(2);
  },
};
