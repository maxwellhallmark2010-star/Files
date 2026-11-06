// ─────────────────────────────────────────────────────────────────────────────
// UI: menus, settings, pause, results, scoreboard, shot meter, context button
// labels, pop-up messages and speech bubbles. DOM writes are cached so the
// per-frame update only touches what changed.
// ─────────────────────────────────────────────────────────────────────────────
const SETTINGS_SCHEMA = [
  { key: 'difficulty', label: 'Opponent', options: [['rookie', 'Rookie'], ['pro', 'Pro'], ['allstar', 'All-Star']] },
  { key: 'target', label: 'Game to', options: [[11, '11'], [15, '15'], [21, '21']] },
  { key: 'scoring', label: 'Scoring', options: [['23', '2s & 3s'], ['12', '1s & 2s']] },
  { key: 'makeItTakeIt', label: 'After a make', options: [[false, "Loser's ball"], [true, 'Make it, take it']] },
  { key: 'timing', label: 'Shot timing', options: [['forgiving', 'Forgiving'], ['normal', 'Normal'], ['tight', 'Pro']] },
  { key: 'meter', label: 'Shot meter', options: [[true, 'Show'], [false, 'Hide']] },
  { key: 'camera', label: 'Camera', options: [['broadcast', 'Broadcast'], ['close', 'Close']] },
  { key: 'graphics', label: 'Graphics', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
  { key: 'sound', label: 'Sound', options: [[true, 'On'], [false, 'Off']] },
  { key: 'lefty', label: 'Joystick', options: [[false, 'Left side'], [true, 'Right side']] },
];

const UI = {
  cache: {}, bubbles: [], screen: 'menu', settingsReturn: 'menu',
  init() {
    const $ = (id) => document.getElementById(id);
    this.$ = $;
    this.el = {
      hud: $('hud'), meter: $('meter'), meterFill: $('meterFill'), meterZone: $('meterZone'),
      flash: $('flash'), flashBig: $('flashBig'), flashSmall: $('flashSmall'), toast: $('toast'), feedback: $('feedback'),
      sbL: $('sbL'), sbLl: $('sbLl'), sbM: $('sbM'), sbMl: $('sbMl'), sbR: $('sbR'), sbRl: $('sbRl'), sbPossL: $('sbPossL'), sbPossR: $('sbPossR'),
      chip: $('statusChip'), stam: $('stamFill'), stamWrap: $('stam'),
      bShoot: $('bShoot'), bPass: $('bPass'), bMove: $('bMove'), bSprint: $('bSprint'), bubbles: $('bubbles'),
    };
    // menu buttons
    document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { Sound.unlock(); Sound.ui(); App.play(b.dataset.mode); }));
    $('btnSettings').addEventListener('click', () => { Sound.unlock(); Sound.ui(); this.openSettings('menu'); });
    $('btnHowto').addEventListener('click', () => { Sound.unlock(); Sound.ui(); this.show('howto'); });
    $('howtoBack').addEventListener('click', () => { Sound.ui(); this.show('menu'); });
    $('settingsBack').addEventListener('click', () => { Sound.ui(); this.show(this.settingsReturn); });
    $('pauseBtn').addEventListener('click', () => App.pause());
    $('resumeBtn').addEventListener('click', () => { Sound.ui(); App.resume(); });
    $('restartBtn').addEventListener('click', () => { Sound.ui(); App.play(G.mode); });
    $('pauseSettingsBtn').addEventListener('click', () => { Sound.ui(); this.openSettings('pause'); });
    $('quitBtn').addEventListener('click', () => { Sound.ui(); App.toMenu(); });
    $('againBtn').addEventListener('click', () => { Sound.ui(); App.play(G.mode); });
    $('resultsMenuBtn').addEventListener('click', () => { Sound.ui(); App.toMenu(); });
    $('rotateDismiss').addEventListener('click', () => { $('rotate').hidden = true; this.rotateDismissed = true; });
    window.addEventListener('sh-pause', () => { if (this.screen === 'game') App.pause(); else if (this.screen === 'pause') App.resume(); });
    this.buildSettings();
    this.applyLayout();
    this.refreshBest();
  },

  // ── screens ──────────────────────────────────────────────────────────────
  show(name) {
    this.screen = name;
    ['menu', 'pause', 'settings', 'howto', 'results'].forEach((s) => (this.$(s).hidden = s !== name));
    const inGame = name === 'game';
    this.el.hud.hidden = !(inGame || name === 'pause' || name === 'results' || (name === 'settings' && this.settingsReturn === 'pause'));
    document.body.classList.toggle('in-game', inGame);
    document.body.classList.toggle('in-menu', name === 'menu' || (name === 'settings' && this.settingsReturn === 'menu') || name === 'howto');
    Input.setEnabled(inGame);
    Sound.setLevel(name === 'menu' || name === 'howto' || (name === 'settings' && this.settingsReturn === 'menu') ? 0.22 : 0.8);
    this.checkRotate();
  },
  openSettings(from) { this.settingsReturn = from; this.syncSettings(); this.show('settings'); },
  buildSettings() {
    const list = this.$('settingsList');
    list.innerHTML = '';
    SETTINGS_SCHEMA.forEach((s) => {
      const row = document.createElement('div'); row.className = 'set-row';
      const lab = document.createElement('div'); lab.className = 'set-label'; lab.textContent = s.label; lab.id = 'lbl-' + s.key;
      const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-labelledby', lab.id);
      s.options.forEach(([val, text]) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.id = `set-${s.key}-${String(val)}`;
        b.setAttribute('role', 'radio');
        b.addEventListener('click', () => { Sound.ui(); this.setSetting(s.key, val); });
        b.dataset.val = JSON.stringify(val); seg.appendChild(b);
      });
      row.append(lab, seg); list.appendChild(row);
    });
    this.syncSettings();
  },
  syncSettings() {
    SETTINGS_SCHEMA.forEach((s) => {
      s.options.forEach(([val]) => {
        const b = document.getElementById(`set-${s.key}-${String(val)}`);
        const on = Settings[s.key] === val; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    });
  },
  setSetting(key, val) {
    Settings[key] = val; saveSettings(); this.syncSettings();
    if (key === 'graphics') App.applyQuality();
    if (key === 'sound') Sound.setEnabled(val);
    if (key === 'lefty') this.applyLayout();
    if (key === 'camera') App.resize();
  },
  applyLayout() { document.body.classList.toggle('lefty', !!Settings.lefty); },
  refreshBest() { const b = Store.get('challengeBest', 0); this.$('bestChip').textContent = b ? `Best ${b}` : '60 seconds'; },
  checkRotate() {
    const portrait = window.innerHeight > window.innerWidth;
    this.$('rotate').hidden = !(portrait && IS_TOUCH && this.screen === 'menu' && !this.rotateDismissed);
  },

  onModeStart(mode) {
    this.cache = {};
    this.bubbles.forEach((b) => b.el.remove()); this.bubbles = [];
    this.el.flash.className = ''; this.el.toast.className = ''; this.el.feedback.className = '';
    this.el.meter.classList.remove('show', 'res-good', 'res-bad');
    document.body.dataset.mode = mode;
  },

  // ── pop-ups ──────────────────────────────────────────────────────────────
  restartAnim(el, cls) { el.className = ''; void el.offsetWidth; el.className = cls; },
  flash(text, kind = 'info', sub = '') {
    if (this.screen === 'menu' && G.mode === 'attract') return;
    this.el.flashBig.textContent = text; this.el.flashSmall.textContent = sub;
    this.restartAnim(this.el.flash, 'show k-' + kind);
  },
  toast(text, kind = 'info') { this.el.toast.textContent = text; this.restartAnim(this.el.toast, 'show k-' + kind); },
  feedback(text, kind, tag) {
    this.el.feedback.innerHTML = '';
    const a = document.createElement('b'); a.textContent = text; this.el.feedback.appendChild(a);
    if (tag) { const t = document.createElement('span'); t.textContent = tag; this.el.feedback.appendChild(t); }
    this.restartAnim(this.el.feedback, 'show k-' + kind);
  },
  meterResult(e, w) {
    const m = this.el.meter;
    m.classList.remove('res-good', 'res-bad'); void m.offsetWidth;
    m.classList.add(Math.abs(e) <= w ? 'res-good' : 'res-bad');
    this.meterHold = 0.55;
  },
  bubble(player, text) {
    if (G.mode === 'attract') return;
    const el = document.createElement('div'); el.className = 'bubble'; el.textContent = text;
    this.el.bubbles.appendChild(el);
    this.bubbles.push({ el, player, t: 0 });
  },

  // ── results ──────────────────────────────────────────────────────────────
  showResults(r) {
    const $ = this.$;
    const body = $('resultsBody'); body.innerHTML = '';
    if (r.mode === 'challenge') {
      $('resultsTitle').textContent = r.record ? 'New record!' : 'Time!';
      $('resultsSub').textContent = 'Shooting challenge';
      const grid = document.createElement('div'); grid.className = 'res-grid';
      [['Score', r.score], ['Made', `${r.made}/${r.att}`], ['Best streak', r.bestStreak], ['Personal best', r.best]].forEach(([k, v]) => {
        const c = document.createElement('div'); c.className = 'res-cell'; c.innerHTML = `<span></span><b></b>`;
        c.firstChild.textContent = k; c.lastChild.textContent = v; grid.appendChild(c);
      });
      body.appendChild(grid);
      this.refreshBest();
    } else {
      $('resultsTitle').textContent = r.won ? 'You win' : 'Blaze wins';
      $('resultsSub').textContent = `Final · ${r.score[0]} – ${r.score[1]}`;
      const t = document.createElement('table'); t.className = 'stats';
      const ps = r.players;
      const rows = [['PTS', (s) => s.pts], ['FG', (s) => `${s.fgm}/${s.fga}`], ['3PT', (s) => `${s.tpm}/${s.tpa}`], ['REB', (s) => s.reb], ['STL', (s) => s.stl], ['BLK', (s) => s.blk], ['DUNKS', (s) => s.dnk], ['TO', (s) => s.to]];
      const head = document.createElement('tr'); head.innerHTML = '<th></th>';
      ps.forEach((p) => { const th = document.createElement('th'); th.textContent = p.isHuman ? 'You' : p.name; head.appendChild(th); });
      t.appendChild(head);
      rows.forEach(([k, f]) => {
        const tr = document.createElement('tr'); const th = document.createElement('th'); th.textContent = k; tr.appendChild(th);
        ps.forEach((p) => { const td = document.createElement('td'); td.textContent = f(p.stats); tr.appendChild(td); });
        t.appendChild(tr);
      });
      body.appendChild(t);
    }
    setTimeout(() => this.show('results'), 900);
  },

  // ── per-frame HUD ────────────────────────────────────────────────────────
  set(key, el, val, prop = 'textContent') { if (this.cache[key] !== val) { this.cache[key] = val; el[prop] = val; } },
  setVis(key, el, on) { if (this.cache[key] !== on) { this.cache[key] = on; el.classList.toggle('hide', !on); } },
  update(dt) {
    if (this.screen !== 'game' && this.screen !== 'pause') { this.updateBubbles(dt); return; }
    const E = this.el, mode = G.mode;
    // scoreboard
    if (mode === '1v1') {
      this.set('lL', E.sbLl, 'YOU'); this.set('rL', E.sbRl, 'BLAZE');
      this.set('l', E.sbL, String(G.score[0])); this.set('r', E.sbR, String(G.score[1]));
      this.set('m', E.sbM, G.phase === 'live' || G.phase === 'check' ? String(Math.ceil(G.shotClock)) : '–');
      const clear = G.needClear[0] && G.possession === 0 && G.phase === 'live';
      this.set('ml', E.sbMl, clear ? 'TAKE IT BACK' : `GAME TO ${Settings.target}`);
      this.setVis('possL', E.sbPossL, G.possession === 0); this.setVis('possR', E.sbPossR, G.possession === 1);
      this.set('mlc', E.sbMl, clear ? 'warn' : '', 'className');
      this.set('clk', E.sbM, G.shotClock < 5 && G.phase === 'live' ? 'low' : '', 'className');
    } else if (mode === 'challenge') {
      const C = G.challenge;
      this.set('lL', E.sbLl, 'SCORE'); this.set('rL', E.sbRl, C.fire ? 'ON FIRE' : 'STREAK');
      this.set('l', E.sbL, String(C.score)); this.set('r', E.sbR, String(C.streak));
      const t = Math.ceil(C.time); this.set('m', E.sbM, `0:${String(t).padStart(2, '0')}`.replace('0:60', '1:00'));
      this.set('ml', E.sbMl, `BEST ${C.best}`); this.set('mlc', E.sbMl, '', 'className');
      this.set('clk', E.sbM, C.time < 10 && G.phase === 'live' ? 'low' : '', 'className');
      this.setVis('possL', E.sbPossL, false); this.setVis('possR', E.sbPossR, false);
    } else if (mode === 'practice') {
      const P = G.practice;
      this.set('lL', E.sbLl, 'MADE'); this.set('rL', E.sbRl, 'STREAK');
      this.set('l', E.sbL, `${P.made}/${P.att}`); this.set('r', E.sbR, String(P.streak));
      this.set('m', E.sbM, P.att ? Math.round((P.made / P.att) * 100) + '%' : '—');
      this.set('ml', E.sbMl, `3PT ${P.tm}/${P.ta} · BEST ${P.best}`); this.set('mlc', E.sbMl, '', 'className'); this.set('clk', E.sbM, '', 'className');
      this.setVis('possL', E.sbPossL, false); this.setVis('possR', E.sbPossR, false);
    }
    const u = G.user;
    if (!u) return;
    // stamina
    this.set('stam', E.stam.style, `${Math.round(u.stamina * 100)}%`, 'width');
    this.setVis('stamw', E.stamWrap, u.stamina < 0.98);
    // context-sensitive buttons
    const ctx = G.userContext();
    let shoot = 'SHOOT', pass = 'PASS', move = 'CROSS', passOn = true, moveOn = true, hot = false;
    if (ctx === 'offense') {
      const a = u.action;
      const type = a && a.kind === 'shot' ? a.type : a && a.kind === 'dunk' ? 'dunk' : G.shotTypeFor(u, u.ctrl.mx, u.ctrl.mz);
      shoot = { dunk: 'DUNK', layup: 'LAYUP', fade: 'FADE', jumper: 'SHOOT' }[type];
      hot = type === 'dunk' || type === 'layup';
      passOn = !!G.teammate(u);
      const mk = G.dribbleMoveKind(u, u.ctrl.mx, u.ctrl.mz);
      move = { cross: 'CROSS', spin: 'SPIN', stepback: 'STEP BACK' }[mk];
    } else if (ctx === 'defense') { shoot = 'BLOCK'; pass = 'STEAL'; moveOn = false; }
    else if (ctx === 'teammate') { shoot = 'JUMP'; pass = 'CALL'; moveOn = false; }
    else { shoot = 'JUMP'; passOn = false; moveOn = false; }
    this.set('bs', E.bShoot.firstChild, shoot); this.set('bp', E.bPass.firstChild, pass); this.set('bm', E.bMove.firstChild, move);
    this.setVis('bpv', E.bPass, passOn); this.setVis('bmv', E.bMove, moveOn);
    if (this.cache.hot !== hot) { this.cache.hot = hot; E.bShoot.classList.toggle('hotbtn', hot); }
    this.updateMeter(dt, u);
    this.updateBubbles(dt);
  },
  project(v, out) {
    _v1.copy(v).project(G.camera);
    out.x = (_v1.x * 0.5 + 0.5) * window.innerWidth; out.y = (-_v1.y * 0.5 + 0.5) * window.innerHeight; out.z = _v1.z;
    return out;
  },
  updateMeter(dt, u) {
    const M = this.el.meter, a = u.action;
    const active = Settings.meter && a && a.kind === 'shot' && !a.released && a.aiRelease === null;
    this.meterHold = Math.max(0, (this.meterHold || 0) - dt);
    const visible = active || this.meterHold > 0;
    if (!visible) { if (this.cache.mv) { M.classList.remove('show', 'res-good', 'res-bad'); this.cache.mv = false; } return; }
    if (!this.cache.mv) { M.classList.add('show'); this.cache.mv = true; }
    if (active) {
      const m = clamp(a.t / a.T, 0, 1);
      this.el.meterFill.style.height = (m * 100).toFixed(1) + '%';
      const lo = (SHOT.PERFECT - a.w) * 100, hi = (SHOT.PERFECT + a.w) * 100;
      this.el.meterZone.style.bottom = lo.toFixed(1) + '%'; this.el.meterZone.style.height = (hi - lo).toFixed(1) + '%';
    }
    _v2.set(u.pos.x, u.jumpY + 1.4 * u.scale, u.pos.z);
    const s = this.project(_v2, this._p || (this._p = {}));
    M.style.transform = `translate(${Math.round(s.x + 44)}px, ${Math.round(s.y - 60)}px)`;
  },
  updateBubbles(dt) {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]; b.t += dt;
      if (b.t > 1.8 || !G.players.includes(b.player)) { b.el.remove(); this.bubbles.splice(i, 1); continue; }
      _v2.set(b.player.pos.x, b.player.jumpY + 2.25 * b.player.scale, b.player.pos.z);
      const s = this.project(_v2, this._b || (this._b = {}));
      b.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
      b.el.style.opacity = s.z > 1 ? 0 : String(clamp((1.8 - b.t) * 3, 0, 1));
    }
  },
};
