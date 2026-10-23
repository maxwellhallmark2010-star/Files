// Everything you can pick up, use, drive or place: crafting materials,
// generators, go-karts, landmines and the safe-base furniture.
import * as THREE from 'three';
import { CELL } from './util.js';
import * as Models from './models.js';

const KART_R = 0.85;

export class Entities {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.items = new Map();      // id -> {data, mesh}
    this.gens = new Map();       // id -> {data, mesh, loop}
    this.karts = new Map();      // id -> {data, mesh, speed, loop}
    this.mines = new Map();      // id -> {data, mesh}
    this.base = [];
    this.fx = [];
  }

  get state() { return this.game.state; }
  get world() { return this.game.world; }

  // ---------------- chunk streaming ----------------

  onChunkLoad(c) {
    for (const it of this.world.itemsForChunk(c.cx, c.cz)) {
      if (this.state.picked.has(it.id) || this.items.has(it.id)) continue;
      const mesh = Models.makeItem(it.type);
      mesh.position.set(it.x, 0, it.z);
      mesh.rotation.y = it.rot;
      this.scene.add(mesh);
      this.items.set(it.id, { data: it, mesh, chunk: `${c.cx},${c.cz}` });
    }
    const g = this.world.genForChunk(c.cx, c.cz);
    if (g && !this.gens.has(g.id)) {
      const mesh = Models.makeGenerator();
      mesh.position.set(g.x, 0, g.z);
      mesh.rotation.y = Math.floor((g.gx * 7 + g.gz * 3) % 4) * Math.PI / 2;
      this.scene.add(mesh);
      const col = { cx: g.x, cz: g.z, minX: g.x - 0.62, maxX: g.x + 0.62, minZ: g.z - 0.62, maxZ: g.z + 0.62 };
      this.world.extraColliders.push(col);
      const loop = this.game.audio.loop('generator', { x: g.x, y: 0.5, z: g.z });
      this.gens.set(g.id, { data: g, mesh, col, loop, chunk: `${c.cx},${c.cz}` });
    }
  }

  onChunkUnload(c) {
    const key = `${c.cx},${c.cz}`;
    for (const [id, it] of this.items) if (it.chunk === key) { this.scene.remove(it.mesh); this.items.delete(id); }
    for (const [id, g] of this.gens) if (g.chunk === key) {
      this.scene.remove(g.mesh);
      g.loop?.stop();
      this.world.extraColliders = this.world.extraColliders.filter((b) => b !== g.col);
      this.gens.delete(id);
    }
  }

  removeItem(id) {
    const it = this.items.get(id);
    if (it) { this.scene.remove(it.mesh); this.items.delete(id); }
  }

  // ---------------- safe base ----------------

  buildBase() {
    const add = (mesh, x, z, ry, w, d) => {
      mesh.position.set(x, 0, z); mesh.rotation.y = ry;
      this.scene.add(mesh); this.base.push(mesh);
      if (w) this.world.extraColliders.push({ cx: x, cz: z, minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      return mesh;
    };
    this.bed = add(Models.makeBed(), 1.9, 1.3, 0, 1.1, 2.1);
    this.phone = add(Models.makePhoneTable(), 10.6, 0.6, 0, 0.9, 0.55);
    this.bench = add(Models.makeWorkbench(), 11.45, 10.5, Math.PI / 2, 0.7, 1.6);
    const crate = (x, z, s, ry) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), Models.materials.wood);
      m.position.y = s / 2; m.castShadow = m.receiveShadow = true;
      const g = new THREE.Group(); g.add(m);
      add(g, x, z, ry, s, s);
    };
    crate(0.7, 11.2, 0.7, 0.2); crate(1.6, 11.3, 0.6, -0.1); crate(0.8, 10.3, 0.5, 0.5);
    this.spawnPoint = { x: 2.0, z: 3.4, yaw: Math.PI };
    this.phoneLoop = null;
  }

  setPhoneRinging(on) {
    if (on && !this.phoneLoop) this.phoneLoop = this.game.audio.loop('phone', { x: 10.6, y: 0.9, z: 0.6 });
    if (!on && this.phoneLoop) { this.phoneLoop.stop(); this.phoneLoop = null; }
  }

  // ---------------- karts ----------------

  spawnKart(data, announce = true) {
    if (this.karts.has(data.id)) return;
    const mesh = Models.makeKart(data.color ?? 0x9c1c14);
    mesh.position.set(data.x, 0, data.z);
    mesh.rotation.y = data.ry;
    this.scene.add(mesh);
    const col = { cx: data.x, cz: data.z, minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    this._kartCol(col, data);
    this.world.extraColliders.push(col);
    this.karts.set(data.id, { data, mesh, col, speed: 0, driver: null, loop: null });
    if (announce) this.game.net.send({ t: 'kart', k: data });
  }

  _kartCol(col, d) {
    col.cx = d.x; col.cz = d.z;
    col.minX = d.x - 0.7; col.maxX = d.x + 0.7; col.minZ = d.z - 0.7; col.maxZ = d.z + 0.7;
  }

  syncKart(d) {
    const k = this.karts.get(d.id);
    if (!k) return this.spawnKart(d, false);
    Object.assign(k.data, d);
    k.remote = true;
  }

  enterKart(id) {
    const k = this.karts.get(id);
    if (!k || k.driver) return false;
    k.driver = 'me';
    k.col.minX = k.col.maxX = 1e9;
    k.loop = this.game.audio.loop('engine', { x: k.data.x, y: 0.5, z: k.data.z });
    k.loop?.level(0.18);
    return k;
  }

  exitKart(k) {
    k.driver = null; k.speed = 0;
    this._kartCol(k.col, k.data);
    k.loop?.stop(); k.loop = null;
    // find a free spot beside the kart
    const d = k.data;
    for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
      const ang = d.ry + a;
      const p = { x: d.x + Math.sin(ang) * 1.5, z: d.z + Math.cos(ang) * 1.5 };
      if (!this.world.pointBlocked(p.x, p.z)) return p;
    }
    return { x: d.x, z: d.z };
  }

  driveKart(k, input, dt) {
    const d = k.data;
    const acc = input.fwd > 0 ? 7 : input.fwd < 0 ? (k.speed > 0 ? -12 : -4) : 0;
    k.speed += acc * dt;
    if (!input.fwd) k.speed *= Math.exp(-1.6 * dt);
    k.speed = Math.max(-4, Math.min(12, k.speed));
    const steer = -input.side * Math.min(1, Math.abs(k.speed) / 3) * 1.8 * Math.sign(k.speed || 1);
    d.ry += steer * dt;
    const p = { x: d.x + Math.sin(d.ry) * k.speed * dt, z: d.z + Math.cos(d.ry) * k.speed * dt };
    if (this.world.collideCircle(p, KART_R)) {
      if (Math.abs(k.speed) > 4) this.game.audio.play('thump', { x: p.x, y: 0.5, z: p.z });
      k.speed *= 0.4;
    }
    d.x = p.x; d.z = p.z;
    k.loop?.set(d.x, 0.5, d.z);
    k.loop?.setRate(Math.abs(k.speed));
    this.game.net.send({ t: 'kart', k: d }, true);
  }

  // ---------------- mines ----------------

  placeMine(data, announce = true) {
    if (this.mines.has(data.id)) return;
    const mesh = Models.makeMine();
    mesh.position.set(data.x, 0, data.z);
    this.scene.add(mesh);
    this.mines.set(data.id, { data, mesh });
    if (announce) this.game.net.send({ t: 'mine', m: data });
  }

  explodeMine(id, announce = true) {
    const m = this.mines.get(id);
    if (!m) return;
    this.scene.remove(m.mesh);
    this.mines.delete(id);
    this.state.mines = this.state.mines.filter((x) => x.id !== id);
    this.explosion(m.data.x, m.data.z);
    if (announce) this.game.net.send({ t: 'boom', id });
  }

  explosion(x, z) {
    this.game.audio.play('boom', { x, y: 0.5, z }, { ref: 6 });
    this.game.effects.pulse({ x, y: 1, z }, 0xffa040, 80, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat);
    ball.position.set(x, 0.6, z);
    this.scene.add(ball);
    const smokeMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, transparent: true, opacity: 0.8, roughness: 1, depthWrite: false });
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), smokeMat);
    smoke.position.set(x, 0.8, z);
    this.scene.add(smoke);
    this.fx.push({ t: 0, ball, smoke });
    const pl = this.game.player;
    const d = Math.hypot(pl.pos.x - x, pl.pos.z - z);
    if (d < 6) this.game.effects.shake(0.5 * (1 - d / 6), 0.6);
    if (d < 2.8) this.game.damagePlayer(45, 'explosion');
    this.game.monsters.explosionAt(x, z, 3.2);
  }

  // ---------------- interaction ----------------

  // Best interactable in front of the camera.
  findTarget(cam, pos) {
    const fwd = cam.getWorldDirection(_v);
    const camPos = cam.getWorldPosition(_v2);
    let best = null, bestScore = Infinity;
    const consider = (x, y, z, maxD, make) => {
      const dx = x - camPos.x, dy = y - camPos.y, dz = z - camPos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > maxD) return;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
      if (dot < 0.86) return;
      const score = d * (2 - dot);
      if (score < bestScore && this.world.los(pos.x, pos.z, x, z)) { bestScore = score; best = make(); }
    };
    for (const it of this.items.values()) {
      const p = it.mesh.position;
      if (Math.abs(p.x - pos.x) > 3 || Math.abs(p.z - pos.z) > 3) continue;
      consider(p.x, 0.1, p.z, 2.6, () => ({ kind: 'item', id: it.data.id, label: `Pick up ${ITEM_NAMES[it.data.type]}` }));
    }
    for (const g of this.gens.values()) {
      const p = g.mesh.position;
      consider(p.x, 0.6, p.z, 2.4, () => this.game.state.power
        ? { kind: 'gen-check', id: g.data.id, label: 'Inspect generator' }
        : { kind: 'gen-restart', id: g.data.id, label: 'Hold E to restart generator', hold: 2.5 });
    }
    for (const k of this.karts.values()) {
      if (k.driver) continue;
      const p = k.mesh.position;
      consider(p.x, 0.5, p.z, 2.6, () => ({ kind: 'kart', id: k.data.id, label: 'Get in go-kart' }));
    }
    if (this.bed) {
      consider(this.bed.position.x, 0.5, this.bed.position.z, 2.8, () => ({ kind: 'bed', label: 'Sleep' }));
      consider(this.phone.position.x, 0.85, this.phone.position.z, 2.4, () => ({ kind: 'phone', label: this.game.state.phone === 'ringing' ? 'Answer phone' : 'Phone' }));
      consider(this.bench.position.x, 0.95, this.bench.position.z, 2.6, () => ({ kind: 'bench', label: 'Use workbench' }));
    }
    return best;
  }

  // ---------------- per frame ----------------

  update(dt, time) {
    for (const g of this.gens.values()) {
      Models.setGeneratorLed(g.mesh, this.game.state.power);
      g.loop?.level(this.game.state.power ? 0.12 : 0);
      // a running engine shakes a little
      g.mesh.position.y = this.game.state.power ? Math.sin(time * 70) * 0.002 : 0;
    }
    // skip drawing small props that are lost in the fog anyway
    const cp = this.game.camera.position;
    const near = (o, r) => (o.position.x - cp.x) ** 2 + (o.position.z - cp.z) ** 2 < r * r;
    for (const g of this.gens.values()) g.mesh.visible = near(g.mesh, 40);
    for (const it of this.items.values()) {
      it.mesh.visible = near(it.mesh, 30);
      // slow bob so pickups catch the light
      it.mesh.position.y = 0.01 + Math.max(0, Math.sin(time * 1.5 + it.data.rot * 3)) * 0.015;
    }
    for (const m of this.mines.values()) m.mesh.userData.led.visible = (time * 2 + m.data.x) % 1 < 0.2;
    if (this.phone) this.phone.userData.led.visible = this.game.state.phone === 'ringing' && time % 1 < 0.5;
    for (const k of this.karts.values()) {
      const d = k.data;
      k.mesh.position.x += (d.x - k.mesh.position.x) * (k.remote ? Math.min(1, dt * 10) : 1);
      k.mesh.position.z += (d.z - k.mesh.position.z) * (k.remote ? Math.min(1, dt * 10) : 1);
      k.mesh.rotation.y = d.ry;
      if (k.remote) this._kartCol(k.col, d);
      for (const w of k.mesh.userData.wheels) w.rotation.x += k.speed * dt / 0.22;
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      f.ball.scale.setScalar(0.5 + f.t * 8);
      f.ball.material.opacity = Math.max(0, 1 - f.t * 3);
      f.smoke.scale.setScalar(0.5 + f.t * 2.2);
      f.smoke.position.y = 0.8 + f.t * 0.6;
      f.smoke.material.opacity = Math.max(0, 0.8 - f.t * 0.35);
      if (f.t > 2.4) {
        this.scene.remove(f.ball, f.smoke);
        f.ball.geometry.dispose(); f.smoke.geometry.dispose();
        this.fx.splice(i, 1);
      }
    }
  }

  nearestGenerator(x, z) {
    let best = null, bd = Infinity;
    const cx = Math.floor(x / (CELL * 12)), cz = Math.floor(z / (CELL * 12));
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const g = this.world.genForChunk(cx + dx, cz + dz);
      if (!g) continue;
      const d = Math.hypot(g.x - x, g.z - z);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  dispose() {
    for (const it of this.items.values()) this.scene.remove(it.mesh);
    for (const g of this.gens.values()) { this.scene.remove(g.mesh); g.loop?.stop(); }
    for (const k of this.karts.values()) { this.scene.remove(k.mesh); k.loop?.stop(); }
    for (const m of this.mines.values()) this.scene.remove(m.mesh);
    for (const b of this.base) this.scene.remove(b);
    for (const f of this.fx) this.scene.remove(f.ball, f.smoke);
    this.setPhoneRinging(false);
    this.items.clear(); this.gens.clear(); this.karts.clear(); this.mines.clear();
  }
}

export const ITEM_NAMES = { metal: 'Scrap Metal', electronics: 'Electronics', gunpowder: 'Gunpowder' };
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
