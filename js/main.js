// Game bootstrap, main loop, input, day/objective flow, saving and death.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CELL, cellOf, randomSeed } from './util.js';
import { buildTextures } from './textures.js';
import { initModels } from './models.js';
import { World } from './world.js';
import { Entities, ITEM_NAMES } from './entities.js';
import { MonsterManager } from './monsters.js';
import { Player } from './player.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { UI, RECIPES } from './ui.js';
import { Net } from './net.js';
import { objectivesForDay, dialogueForDay } from './objectives.js';
import * as Save from './save.js';
import { preset, pixelRatio } from './quality.js';

const MENU_SEED = 90210;

class Game {
  constructor() {
    this.settings = Save.loadSettings();
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(pixelRatio(this.settings));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.05, preset(this.settings).far);
    this.scene.add(this.camera);
    this.audio = new GameAudio();
    this.audio.setVolume(this.settings.volume);
    this.ui = new UI(this);
    this.net = new Net(this);
    this.mode = 'loading';
    this.paused = false;
    this.overlay = null; // 'craft' | 'map'
    this.keys = new Set();
    this.time = 0;
    this.state = null;
    this.slot = null;
    this.holdT = 0; this.holdId = null;
    addEventListener('resize', () => this.resize());
  }

  async boot() {
    const step = (p, t) => { this.ui.setLoading(p, t); return new Promise((r) => setTimeout(r, 30)); };
    await step(0.05, 'Painting wallpaper…');
    this.tex = buildTextures(this.settings.quality);
    await step(0.6, 'Building creatures…');
    initModels(this.tex);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.player = new Player(this);
    this.effects = new Effects(this);
    await step(0.75, 'Loading explorer model…');
    this.explorerModel = await new Promise((res) => {
      new GLTFLoader().load('models/explorer.glb', (g) => {
        g.scene.traverse((o) => { if (o.isMesh) { o.geometry.computeVertexNormals(); o.material.metalness = 0.1; } });
        res(g.scene);
      }, undefined, () => res(null));
    });
    await step(0.9, 'Entering the Backrooms…');
    this._bindInput();
    this._startMenuWorld();
    this.mode = 'menu';
    this.ui.showMenu();
    this._bindMenu();
    document.getElementById('fps').classList.toggle('hidden', !this.settings.showFps);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    window.game = this;
  }

  // ---------------- menu ----------------

  _bindMenu() {
    const on = (id, fn) => document.getElementById(id).addEventListener('click', () => { this.audio.init(); this.audio.play('ui'); fn(); });
    on('btn-continue', () => { const s = Save.latestSave(); if (s) this.loadGame(s.slot); });
    on('btn-new', () => this.ui.openPanel('new'));
    on('btn-load', () => this.ui.openPanel('load'));
    on('btn-mp', () => this.ui.openPanel('mp'));
    on('btn-settings', () => this.ui.openPanel('settings'));
    on('btn-controls', () => this.ui.openPanel('controls'));
    on('btn-resume', () => this.resume());
    on('btn-save', () => this.saveGame(true));
    on('btn-psettings', () => this.ui.openPanel('settings', true));
    on('btn-pcontrols', () => this.ui.openPanel('controls', true));
    on('btn-quit', () => this.quitToMenu());
  }

  _startMenuWorld() {
    this.world = new World(this.scene, this.tex, MENU_SEED, this.settings);
    this.world.setEnv(this.envMap);
    this.menuCam = { x: 6, z: 6, yaw: 0, turn: 0 };
    this.camera.position.set(6, 1.6, 6);
  }

  _menuUpdate(dt) {
    const c = this.menuCam, w = this.world;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    if (c.turn !== 0) {
      const s = Math.sign(c.turn) * Math.min(Math.abs(c.turn), dt * 0.6);
      c.yaw += s; c.turn -= s;
    } else if (w.pointBlocked(c.x + fx * 3, c.z + fz * 3)) {
      c.turn = (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    } else { c.x += fx * dt * 1.1; c.z += fz * dt * 1.1; }
    w.update(dt, c.x, c.z);
    this.camera.position.set(c.x, 1.6 + Math.sin(this.time * 1.7) * 0.02, c.z);
    this.camera.rotation.set(Math.sin(this.time * 0.3) * 0.05, c.yaw + Math.sin(this.time * 0.2) * 0.1, 0, 'YXZ');
    const s = Math.floor(this.time);
    document.getElementById('vhs-time').textContent = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  // ---------------- sessions ----------------

  freshState(seed) {
    return {
      seed, day: 1, phone: 'ringing', objectives: [],
      inv: { metal: 0, electronics: 0, gunpowder: 0, gun: false, ammo: 0, mines: 0 },
      picked: new Set(), karts: [], mines: [], checkedGens: new Set(), explored: new Set(),
      power: true, player: null, visited: {},
    };
  }

  newGame(slot, seed) {
    const st = this.freshState(seed ?? randomSeed());
    this.startSession(st, slot);
    this.saveGame(false);
  }

  loadGame(slot) {
    const d = Save.readSave(slot);
    if (!d) { this.ui.toast('Save is missing or corrupt'); return; }
    const st = this.freshState(d.seed);
    Object.assign(st, {
      day: d.day, phone: d.phone, objectives: d.objectives || [], inv: { ...st.inv, ...d.inv },
      picked: new Set(d.picked || []), karts: d.karts || [], mines: d.mines || [],
      checkedGens: new Set(d.checkedGens || []), explored: new Set(d.explored || []),
      power: d.power !== false, player: d.player, visited: d.visited || {},
    });
    this.startSession(st, slot);
  }

  serialize() {
    const st = this.state, p = this.player;
    const explored = [...st.explored];
    return {
      version: 1, seed: st.seed, day: st.day, phone: st.phone === 'talking' ? 'done' : st.phone, objectives: st.objectives,
      inv: st.inv, picked: [...st.picked], karts: st.karts, mines: st.mines, checkedGens: [...st.checkedGens],
      explored: explored.slice(-40000), power: st.power, visited: st.visited,
      player: { x: p.pos.x, z: p.pos.z, yaw: p.yaw, health: Math.max(1, p.health) },
    };
  }

  saveGame(verbose) {
    if (this.mode !== 'play' || this.slot == null || this.net.isClient) { if (verbose) this.ui.toast('Guests can\'t save — the host\'s game saves for everyone'); return; }
    const ok = Save.writeSave(this.slot, this.serialize());
    if (verbose) this.ui.toast(ok ? `Game saved to slot ${this.slot + 1}` : 'Save failed (storage full or blocked)');
  }

  startSession(st, slot) {
    this.audio.init();
    this._endSession();
    this.state = st;
    this.slot = slot;
    this.world = new World(this.scene, this.tex, st.seed, this.settings);
    this.world.setEnv(this.envMap);
    this.entities = new Entities(this);
    this.monsters = new MonsterManager(this);
    this.monsters.puppet = this.net.isClient;
    this.world.onChunkLoad = (c) => this.entities.onChunkLoad(c);
    this.world.onChunkUnload = (c) => this.entities.onChunkUnload(c);
    this.entities.buildBase();
    for (const k of st.karts) this.entities.spawnKart(k, false);
    for (const m of st.mines) this.entities.placeMine(m, false);
    const sp = this.entities.spawnPoint;
    const pp = st.player || { x: sp.x, z: sp.z, yaw: sp.yaw, health: 100 };
    const p = this.player;
    p.place(pp.x, pp.z, pp.yaw);
    p.health = pp.health; p.stamina = 100; p.dead = false; p.kart = null; p.flashlight = false;
    p.selectSlot(1);
    this.world.setPower(st.power);
    this.world.power = st.power ? 1 : 0;
    this.ui.setPower(st.power);
    this.entities.setPhoneRinging(st.phone === 'ringing');
    this.monsters.spiders[0].respawn = st.day === 1 ? 50 : 20;
    this.blackoutT = 60;
    this.autosaveT = 120;
    this.ambientT = 12;
    this.exploreT = 0;
    this.lastCell = null;
    for (let gx = 0; gx < 3; gx++) for (let gz = 0; gz < 3; gz++) st.explored.add(`${gx},${gz}`);
    // pre-build the chunks around the player so we don't start in the void
    for (let i = 0; i < 13; i++) this.world.update(0, p.pos.x, p.pos.z);
    this.mode = 'play';
    this.ui.show('menu', false);
    this.ui.closePanel();
    this.ui.show('hud');
    this.ui.fade(false);
    this.ui.refresh();
    if (st.phone === 'ringing') this.ui.toast('The phone is ringing. Answer it (E).');
    this.resume();
  }

  _endSession() {
    this.ui.clearSubtitles();
    if (this.player?.kart) this.player.kart = null;
    this.entities?.dispose();
    this.monsters?.dispose();
    this.world?.dispose();
    this.audio.stopAll();
    this.entities = null; this.monsters = null; this.world = null;
  }

  quitToMenu() {
    if (this.mode === 'play') this.saveGame(false);
    this.net.close();
    this._endSession();
    this.state = null;
    this.mode = 'menu';
    this.paused = false;
    this.overlay = null;
    document.exitPointerLock?.();
    this._startMenuWorld();
    this.ui.showMenu();
    this.ui.fade(false);
  }

  // ---------------- multiplayer ----------------

  hostGame(status) {
    this.net.close();
    status('Opening room…');
    this.net.host((code) => {
      status(`Room code: ${code}`);
      this.roomCode = code;
      document.getElementById('mp-info').textContent = `Co-op room code: ${code}`;
      this.ui.toast(`Hosting! Room code: ${code} (shown in pause menu)`);
    }, (err) => { status(err); this.ui.toast(err); });
    const s = Save.latestSave();
    if (s) this.loadGame(s.slot);
    else {
      const free = Save.listSaves().findIndex((x) => !x);
      this.newGame(free < 0 ? 0 : free);
    }
  }

  joinGame(code, status) {
    this.net.close();
    this.net.join(code, (err) => status(err));
  }

  snapshotForGuest() {
    const st = this.state;
    return { seed: st.seed, day: st.day, picked: [...st.picked], karts: st.karts, mines: st.mines, power: st.power };
  }

  startNetGame(s) {
    const st = this.freshState(s.seed);
    Object.assign(st, { day: s.day, picked: new Set(s.picked), karts: s.karts, mines: s.mines, power: s.power });
    this.startSession(st, null);
    document.getElementById('mp-info').textContent = 'Connected to host (co-op)';
    this.ui.toast('Joined the host\'s world');
  }

  onHostLost() {
    this.ui.toast('Lost connection to host');
    setTimeout(() => this.quitToMenu(), 1500);
  }

  // ---------------- pause / overlays ----------------

  resume() {
    this.paused = false;
    this.ui.show('pause', false);
    this.ui.closePanel();
    this.ui.show('lockhint', false);
    this.canvas.requestPointerLock?.();
  }

  pause() {
    if (this.mode !== 'play') return;
    this.paused = true;
    this.overlay = null;
    this.ui.show('craft', false); this.ui.show('mapview', false);
    this.ui.show('pause');
    document.getElementById('btn-save').disabled = this.net.isClient;
  }

  openOverlay(kind) {
    if (this.overlay === kind) return this.closeOverlay();
    this.closeOverlay(false);
    this.overlay = kind;
    if (kind === 'craft') { this.ui.renderCraft(); this.ui.show('craft'); }
    if (kind === 'map') { this.ui.show('mapview'); this.ui.drawMap(); }
    document.exitPointerLock?.();
  }

  closeOverlay(relock = true) {
    this.ui.show('craft', false); this.ui.show('mapview', false);
    this.overlay = null;
    if (relock) this.canvas.requestPointerLock?.();
  }

  applySettings() {
    const s = this.settings;
    Save.saveSettings(s);
    this.camera.fov = s.fov; this.camera.updateProjectionMatrix();
    this.audio.setVolume(s.volume);
    this.player.applyQuality();
    this.effects.applyQuality(s);
    this.world?.applyQuality();
    this.camera.far = preset(s).far; this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio(s));
    this.effects.composer.setPixelRatio(pixelRatio(s));
    document.getElementById('fps').classList.toggle('hidden', !s.showFps);
    this.resize();
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.effects?.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ---------------- input ----------------

  _bindInput() {
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (!locked && this.mode === 'play' && !this.paused && !this.overlay) this.pause();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas && this.mode === 'play' && !this.paused && !this.overlay) this.player.look(e.movementX, e.movementY);
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.mode !== 'play' || this.paused) return;
      if (document.pointerLockElement !== this.canvas) { this.canvas.requestPointerLock?.(); return; }
      if (e.button === 0) this.player.use();
    });
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Tab') e.preventDefault();
      if (this.mode !== 'play') return;
      if (e.code === 'Escape') { if (this.overlay) this.closeOverlay(); else if (this.paused) this.resume(); return; }
      if (this.paused) return;
      if (e.repeat) return;
      this.keys.add(e.code);
      switch (e.code) {
        case 'KeyF': this.player.toggleFlashlight(); this.ui.refresh(); break;
        case 'KeyM': this.openOverlay('map'); break;
        case 'Tab': case 'KeyI': this.openOverlay('craft'); break;
        case 'Digit1': this.player.selectSlot(1); this.ui.refresh(); break;
        case 'Digit2': this.player.selectSlot(2); this.ui.refresh(); break;
        case 'Digit3': this.player.selectSlot(3); this.ui.refresh(); break;
        case 'KeyE': this._pressE(); break;
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  input() {
    const k = this.keys;
    if (this.paused || this.overlay || this.player.dead) return { fwd: 0, side: 0, sprint: false, crouch: false };
    return {
      fwd: (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0),
      side: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      crouch: k.has('KeyC') || k.has('ControlLeft'),
    };
  }

  _pressE() {
    const p = this.player;
    if (p.dead) return;
    if (p.kart) {
      const pos = this.entities.exitKart(p.kart);
      p.kart = null;
      p.place(pos.x, pos.z, p.yaw);
      return;
    }
    const t = this.target;
    if (t && !t.hold) this.interact(t);
  }

  interact(t) {
    const st = this.state, p = this.player, e = this.entities;
    switch (t.kind) {
      case 'item': {
        const it = e.items.get(t.id);
        if (!it) return;
        st.inv[it.data.type]++;
        st.picked.add(t.id);
        e.removeItem(t.id);
        this.net.send({ t: 'pickup', id: t.id });
        this.audio.play('pickup', null);
        this.ui.toast(`+1 ${ITEM_NAMES[it.data.type]}`);
        this.progress('collect', it.data.type);
        break;
      }
      case 'gen-check':
        if (!st.checkedGens.has(t.id)) { st.checkedGens.add(t.id); this.progress('gen', 'gen'); }
        this.ui.toast('The generator is running. Fuel gauge reads a quarter tank.');
        break;
      case 'gen-restart':
        if (this.net.isClient) this.net.send({ t: 'restore' });
        this.setPower(true);
        this.progress('restore', 'restore');
        break;
      case 'kart': {
        const k = e.enterKart(t.id);
        if (k) { p.kart = k; this.ui.toast('W/S drive · A/D steer · E to get out'); }
        break;
      }
      case 'bed':
        if (st.phone !== 'done') this.ui.toast(st.phone === 'ringing' ? 'Answer the phone first.' : 'Finish the call first.');
        else if (!st.objectives.every((o) => o.done)) this.ui.toast('You can\'t sleep until your objectives are finished.');
        else this.sleep();
        break;
      case 'phone':
        if (st.phone === 'ringing') this.answerPhone();
        else this.ui.toast(st.phone === 'talking' ? '…' : 'Dial tone. Nobody there.');
        break;
      case 'bench': this.openOverlay('craft'); break;
    }
    this.ui.refresh();
  }

  // ---------------- days & objectives ----------------

  async answerPhone() {
    const st = this.state;
    st.phone = 'talking';
    this.entities.setPhoneRinging(false);
    this.audio.play('pickupPhone', { x: 10.6, y: 0.9, z: 0.6 });
    st.objectives = objectivesForDay(st.seed, st.day);
    st.checkedGens = new Set();
    this.ui.refresh();
    await this.ui.subtitles(dialogueForDay(st.seed, st.day, st.objectives), 'THE MAN ON THE PHONE');
    if (this.state !== st) return;
    st.phone = 'done';
    this.ui.refresh();
    this.saveGame(false);
  }

  progress(type, key, amount = 1, absolute = false) {
    const st = this.state;
    if (!st || st.phone === 'ringing') return;
    let changed = false;
    for (const o of st.objectives) {
      if (o.done || o.type !== type || o.key !== key) continue;
      const before = Math.floor(o.n);
      o.n = absolute ? Math.max(o.n, amount) : o.n + amount;
      if (Math.floor(o.n) !== before) changed = true;
      if (o.n >= o.target) {
        o.done = true; changed = true;
        this.ui.toast(`✔ Objective complete: ${o.label}`);
        this.audio.play('craft', null);
        if (st.objectives.every((x) => x.done)) this.ui.toast('All objectives complete — go back to your bed and sleep.');
      }
    }
    if (changed) this.ui.refresh();
  }

  async sleep() {
    const st = this.state, p = this.player;
    this.audio.play('bed', { x: 1.9, y: 0.5, z: 1.3 });
    this.ui.fade(true, `DAY ${st.day} SURVIVED<br><small>you sleep. the lights hum.</small>`);
    p.dead = true; // freezes input during the fade
    await new Promise((r) => setTimeout(r, 3200));
    if (this.state !== st) return;
    st.day++;
    st.phone = 'ringing';
    st.objectives = [];
    p.dead = false; p.health = 100; p.stamina = 100;
    p.place(this.entities.spawnPoint.x, this.entities.spawnPoint.z, this.entities.spawnPoint.yaw);
    for (const m of this.monsters.all) if (m.active) m.despawn();
    if (!this.net.isClient) this.setPower(true);
    this.entities.setPhoneRinging(true);
    this.saveGame(false);
    this.ui.fade(false);
    this.ui.refresh();
    this.ui.toast(`Day ${st.day}. The phone is ringing.`);
  }

  craft(key) {
    const st = this.state, inv = st.inv, r = RECIPES.find((x) => x.key === key);
    if (!r || !Object.entries(r.cost).every(([k, n]) => inv[k] >= n)) return;
    for (const [k, n] of Object.entries(r.cost)) inv[k] -= n;
    const p = this.player;
    if (key === 'gun') { inv.gun = true; inv.ammo += 8; p.selectSlot(2); this.ui.toast('Crafted a gun (+8 rounds). Press 2 to equip.'); }
    if (key === 'landmine') { inv.mines++; this.ui.toast('Crafted a landmine. Press 3, click to place.'); }
    if (key === 'kart') {
      let spot = null;
      for (const a of [0, 0.6, -0.6, 1.2, -1.2, Math.PI]) {
        const ang = p.yaw + a;
        const x = p.pos.x - Math.sin(ang) * 2.6, z = p.pos.z - Math.cos(ang) * 2.6;
        const t = { x, z };
        if (!this.world.pointBlocked(x, z) && !this.world.collideCircle(t, 0.9)) { spot = { x, z }; break; }
      }
      spot = spot || { x: p.pos.x, z: p.pos.z };
      const colors = [0x9c1c14, 0x1c4f9c, 0x2a8a3a, 0xc8a020];
      const data = { id: `k${Date.now().toString(36)}`, x: spot.x, z: spot.z, ry: p.yaw + Math.PI, color: colors[st.karts.length % 4] };
      st.karts.push(data);
      this.entities.spawnKart(data);
      this.ui.toast('Go-kart built! It\'s pinged on your map (M).');
    }
    this.audio.play('craft', null);
    this.progress('craft', key);
    this.ui.refresh();
    this.ui.renderCraft();
  }

  setPower(on, announce = true) {
    const st = this.state;
    if (!st || st.power === on) return;
    st.power = on;
    this.world.setPower(on);
    this.ui.setPower(on);
    this.audio.play(on ? 'powerup' : 'powerdown', null);
    if (!on) this.ui.toast('The lights died. Flashlight: F. Nearest generator is marked on your map (M).');
    else this.ui.toast('Power restored.');
    if (announce && this.net.isHost) this.net.send({ t: 'power', on });
  }

  // ---------------- damage & death ----------------

  hurtBy(monster, dmg) { this.damagePlayer(dmg, monster.kind); }

  damagePlayer(dmg, cause) {
    const p = this.player;
    if (p.dead) return;
    p.health -= dmg;
    p.hurtT = 0;
    this.effects.hurt(0.9);
    this.effects.shake(0.05, 0.35);
    this.audio.play('hit', null);
    if (p.health <= 0) this.killPlayer(cause);
  }

  killPlayer(cause) {
    const p = this.player;
    if (p.dead) return;
    p.dead = true; p.health = 0;
    if (p.kart) { this.entities.exitKart(p.kart); p.kart = null; }
    const msg = {
      spider: 'The spider got you.', bulb: 'You stared at the light too long.', explosion: 'You stood too close to the blast.',
    }[cause] || 'You died.';
    const after = () => {
      this.ui.fade(true, `<span class="red">YOU DIED</span><br>${msg}<br><small>Waking up in your bed. Your inventory and objectives are safe.</small>`);
      setTimeout(() => {
        if (!this.state) return;
        const sp = this.entities.spawnPoint;
        p.place(sp.x, sp.z, sp.yaw);
        p.health = 100; p.stamina = 100; p.dead = false;
        this.monsters.stare = 0;
        this.ui.fade(false);
      }, 3600);
    };
    if (cause === 'spider' || cause === 'bulb') this.effects.jumpscare(cause, true, after);
    else after();
  }

  onMonsterKilled(kind) {
    this.progress('kill', kind);
    this.ui.toast(kind === 'spider' ? 'The spider is dead.' : 'The bulb shattered.');
  }

  // ---------------- main loop ----------------

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    if (this.mode === 'menu') {
      this._menuUpdate(dt);
      this.audio.setHum(this.audio.ctx ? 0.6 : 0);
    } else if (this.mode === 'play') {
      this._playUpdate(dt);
    }
    if (this.mode !== 'loading') {
      this.effects.update(dt, this.time);
      this.effects.render();
    }
    if (this.settings.showFps) {
      this.fpsN = (this.fpsN || 0) + 1;
      if (now - (this.fpsT || 0) > 500) {
        document.getElementById('fps').textContent = `${Math.round(this.fpsN * 1000 / (now - (this.fpsT || now - 500)))} FPS`;
        this.fpsN = 0; this.fpsT = now;
      }
    }
  }

  _playUpdate(dt) {
    const p = this.player, st = this.state;
    const frozen = this.paused && !this.net.active;
    if (frozen) { this.audio.setHum(0.2); return; }
    const inp = this.input();
    p.update(dt, inp);
    this.world.update(dt, p.pos.x, p.pos.z);
    this.entities.update(dt, this.time);
    this.monsters.update(dt);
    this.net.update(dt);
    this.audio.setListener(this.camera);
    this.audio.setHum(this.world.power);

    // interaction prompt & hold-to-use
    this.target = p.dead ? null : p.kart ? { label: 'Get out of go-kart', kind: 'exit' } : this.entities.findTarget(this.camera, p.pos);
    const t = this.target;
    if (t && t.hold && this.keys.has('KeyE') && !this.paused && !this.overlay) {
      if (this.holdId !== t.id) { this.holdId = t.id; this.holdT = 0; }
      this.holdT += dt;
      if (this.holdT >= t.hold) { this.holdT = 0; this.holdId = null; this.interact(t); }
    } else { this.holdT = 0; this.holdId = null; }
    this.ui.setPrompt(t, t?.hold ? this.holdT / t.hold : 0);
    this.ui.bars();
    this.ui.show('lockhint', !this.paused && !this.overlay && document.pointerLockElement !== this.canvas);
    if (this.overlay === 'map') this.ui.drawMap();

    // exploration, visits and travel distance
    this.exploreT -= dt;
    if (this.exploreT <= 0) {
      this.exploreT = 0.3;
      const gx = cellOf(p.pos.x), gz = cellOf(p.pos.z);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const k = `${gx + dx},${gz + dz}`;
        if (st.explored.has(k)) continue;
        if (this.world.los(p.pos.x, p.pos.z, (gx + dx) * CELL + CELL / 2, (gz + dz) * CELL + CELL / 2)) st.explored.add(k);
      }
      const ck = `${gx},${gz}`;
      if (ck !== this.lastCell) {
        this.lastCell = ck;
        const type = this.world.cellType(gx, gz);
        if (type === 'pool' || type === 'jackpot') {
          if (!st.visited[type]) { st.visited[type] = true; this.ui.toast(type === 'pool' ? 'You found the pool rooms.' : 'A supply cache! Materials everywhere.'); }
          this.progress('visit', type);
        }
      }
      this.progress('travel', 'dist', Math.hypot(p.pos.x - 6, p.pos.z - 6), true);
    }

    // random blackouts (host / single player)
    if (!this.net.isClient && st.power) {
      this.blackoutT -= dt;
      if (this.blackoutT <= 0) {
        this.blackoutT = 45;
        if ((st.day >= 2 || this.time > 240) && Math.random() < 0.12 && !this.world.inBaseWorld(p.pos.x, p.pos.z)) this.setPower(false);
      }
    }
    // distant ambience
    this.ambientT -= dt;
    if (this.ambientT <= 0) {
      this.ambientT = 14 + Math.random() * 30;
      const a = Math.random() * Math.PI * 2, d = 14 + Math.random() * 20;
      const pos = { x: p.pos.x + Math.cos(a) * d, y: 1, z: p.pos.z + Math.sin(a) * d };
      const r = Math.random();
      if (r < 0.4) this.audio.play('thump', pos);
      else if (r < 0.7) this.audio.play('creak', pos);
      else for (let i = 0; i < 4; i++) setTimeout(() => this.audio.play('step', pos, { gain: 0.6 }), i * 420);
    }
    // heartbeat when hurt or being stared down
    this.beatT = (this.beatT ?? 0) - dt;
    if ((p.health < 35 || this.monsters.stare > 0.3) && !p.dead && this.beatT <= 0) {
      this.beatT = 0.9 - this.monsters.stare * 0.4;
      this.audio.play('heartbeat', null, { gain: 0.6 + this.monsters.stare });
    }
    this.autosaveT -= dt;
    if (this.autosaveT <= 0) { this.autosaveT = 120; this.saveGame(false); }
    this.ui.refreshT = (this.ui.refreshT ?? 0) - dt;
    if (this.ui.refreshT <= 0) { this.ui.refreshT = 0.5; this.ui.refresh(); }
  }
}

const game = new Game();
game.boot().catch((e) => {
  console.error(e);
  document.getElementById('loadtext').textContent = `Failed to start: ${e.message}`;
});
