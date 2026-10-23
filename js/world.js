// Infinite procedural level: chunk streaming, wall layout, lighting, collision
// and grid path-finding. Layout is a pure function of the seed so every
// client in multiplayer and every reload sees the same maze.
import * as THREE from 'three';
import { preset } from './quality.js';
import { CELL, CHUNK, CHUNK_SIZE, WALL_H, WALL_T, PILLAR, hash, mulberry32, cellOf, chunkOf, clamp } from './util.js';


export const ITEM_TYPES = ['metal', 'electronics', 'gunpowder', 'almond'];

export class World {
  constructor(scene, tex, seed, settings) {
    this.scene = scene;
    this.tex = tex;
    this.seed = seed | 0;
    this.settings = settings;
    this.chunks = new Map();
    this.power = 1;          // rendered light level 0..1
    this.powerOn = true;
    this.time = 0;
    this.extraColliders = []; // furniture, generators, karts
    this.onChunkLoad = null;
    this.onChunkUnload = null;
    this._makeMaterials();
    this._makeLights();
  }

  // ---------------- layout (pure functions of the seed) ----------------

  chunkType(cx, cz) {
    if (cx === 0 && cz === 0) return 'base';
    const r = hash(this.seed, cx, cz, 101);
    if (r < 0.95) return 'normal';
    if (r < 0.98) return 'pool';
    return 'jackpot';
  }
  cellType(gx, gz) { return this.chunkType(chunkOf(gx), chunkOf(gz)); }
  inBase(gx, gz) { return gx >= 0 && gx <= 2 && gz >= 0 && gz <= 2; }
  inBaseWorld(x, z) { return x > 0 && x < 3 * CELL && z > 0 && z < 3 * CELL; }

  // Wall on the west edge of cell (gx, gz), i.e. along x = gx*CELL.
  wallW(gx, gz) {
    if (gz >= 0 && gz <= 2) {
      if (gx === 0 || gx === 3) return gz !== 1;
      if (gx === 1 || gx === 2) return false;
    }
    if (gx >= -1 && gx <= 4 && gz >= -1 && gz <= 3) return false;
    const s = this.seed;
    if (this.cellType(gx, gz) === 'pool') return hash(s, gx, Math.floor(gz / 3), 11) < 0.16 && hash(s, gx, gz, 12) < 0.7;
    return hash(s, gx, Math.floor(gz / 4), 11) < 0.42 && hash(s, gx, gz, 12) < 0.78;
  }
  // Wall on the north edge of cell (gx, gz), i.e. along z = gz*CELL.
  wallN(gx, gz) {
    if (gx >= 0 && gx <= 2) {
      if (gz === 0 || gz === 3) return gx !== 1;
      if (gz === 1 || gz === 2) return false;
    }
    if (gx >= -1 && gx <= 3 && gz >= -1 && gz <= 4) return false;
    const s = this.seed;
    if (this.cellType(gx, gz) === 'pool') return hash(s, Math.floor(gx / 3), gz, 13) < 0.16 && hash(s, gx, gz, 14) < 0.7;
    return hash(s, Math.floor(gx / 4), gz, 13) < 0.42 && hash(s, gx, gz, 14) < 0.78;
  }
  // Square column at the grid corner (gx*CELL, gz*CELL).
  pillarAt(gx, gz) {
    if (gx >= -1 && gx <= 4 && gz >= -1 && gz <= 4) return false;
    const p = this.cellType(gx, gz) === 'pool' ? 0.3 : 0.05;
    return hash(this.seed, gx, gz, 15) < p;
  }
  waterAt(gx, gz) {
    return this.cellType(gx, gz) === 'pool' && hash(this.seed, Math.floor(gx / 2), Math.floor(gz / 2), 40) < 0.5;
  }
  // 0 none, 1 on, 2 flickering, 3 dead
  fixtureAt(gx, gz) {
    const t = this.cellType(gx, gz);
    if (this.inBase(gx, gz) || t === 'pool') return 1;
    const r = hash(this.seed, gx, gz, 30);
    if (r > 0.62) return 0;
    const q = hash(this.seed, gx, gz, 31);
    return q < 0.06 ? 2 : q < 0.1 ? 3 : 1;
  }

  genForChunk(cx, cz) {
    if (cx === 0 && cz === 0) return { id: 'g0,0', x: 5 * CELL + CELL / 2, z: 1 * CELL + CELL / 2, gx: 5, gz: 1 };
    if (hash(this.seed, cx, cz, 50) > 0.45) return null;
    const gx = cx * CHUNK + 1 + Math.floor(hash(this.seed, cx, cz, 51) * (CHUNK - 2));
    const gz = cz * CHUNK + 1 + Math.floor(hash(this.seed, cx, cz, 52) * (CHUNK - 2));
    return { id: `g${cx},${cz}`, x: gx * CELL + CELL / 2, z: gz * CELL + CELL / 2, gx, gz };
  }

  itemsForChunk(cx, cz) {
    const type = this.chunkType(cx, cz);
    const rnd = mulberry32(hash(this.seed, cx, cz, 60) * 4294967296);
    let n = type === 'jackpot' ? 18 + Math.floor(rnd() * 8) : type === 'pool' ? 2 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 3);
    const gen = this.genForChunk(cx, cz);
    const out = [];
    for (let k = 0; k < n; k++) {
      const gx = cx * CHUNK + Math.floor(rnd() * CHUNK);
      const gz = cz * CHUNK + Math.floor(rnd() * CHUNK);
      const ox = (rnd() - 0.5) * 2.4, oz = (rnd() - 0.5) * 2.4, rot = rnd() * Math.PI * 2;
      const r = rnd();
      if (this.inBase(gx, gz) || (gen && gen.gx === gx && gen.gz === gz)) continue;
      const t = r < 0.4 ? 'metal' : r < 0.67 ? 'electronics' : r < 0.87 ? 'gunpowder' : 'almond';
      out.push({ id: `${cx},${cz},${k}`, type: t, x: gx * CELL + CELL / 2 + ox, z: gz * CELL + CELL / 2 + oz, rot });
    }
    return out;
  }

  // ---------------- collision / visibility ----------------

  // Push a circle out of walls, pillars and props. Returns true if it hit anything.
  collideCircle(p, r) {
    let hit = false;
    const gx0 = cellOf(p.x), gz0 = cellOf(p.z);
    const h = WALL_T / 2, P = PILLAR / 2;
    for (let pass = 0; pass < 2; pass++) {
      for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) {
        for (let gz = gz0 - 1; gz <= gz0 + 1; gz++) {
          const x = gx * CELL, z = gz * CELL;
          if (this.wallW(gx, gz)) hit = pushOut(p, r, x - h, x + h, z - h, z + CELL + h) || hit;
          if (this.wallN(gx, gz)) hit = pushOut(p, r, x - h, x + CELL + h, z - h, z + h) || hit;
          if (this.pillarAt(gx, gz)) hit = pushOut(p, r, x - P, x + P, z - P, z + P) || hit;
        }
      }
      for (const b of this.extraColliders) {
        if (Math.abs(b.cx - p.x) < 4 && Math.abs(b.cz - p.z) < 4) hit = pushOut(p, r, b.minX, b.maxX, b.minZ, b.maxZ) || hit;
      }
    }
    return hit;
  }

  pointBlocked(x, z) {
    const gx = cellOf(x), gz = cellOf(z);
    const lx = x - gx * CELL, lz = z - gz * CELL;
    const h = WALL_T / 2 + 0.02, P = PILLAR / 2;
    if (lx < h && this.wallW(gx, gz)) return true;
    if (lx > CELL - h && this.wallW(gx + 1, gz)) return true;
    if (lz < h && this.wallN(gx, gz)) return true;
    if (lz > CELL - h && this.wallN(gx, gz + 1)) return true;
    if (lx < P || lx > CELL - P) {
      const cx = lx < P ? gx : gx + 1;
      if (lz < P && this.pillarAt(cx, gz)) return true;
      if (lz > CELL - P && this.pillarAt(cx, gz + 1)) return true;
    }
    return false;
  }

  // Line of sight between two floor points; returns hit distance or Infinity.
  raycast(ax, az, bx, bz, step = 0.2) {
    const dx = bx - ax, dz = bz - az;
    const d = Math.hypot(dx, dz);
    const n = Math.ceil(d / step);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.pointBlocked(ax + dx * t, az + dz * t)) return d * t;
    }
    return Infinity;
  }
  los(ax, az, bx, bz) { return this.raycast(ax, az, bx, bz) === Infinity; }

  canStep(gx, gz, dx, dz) {
    if (dx === 1) return !this.wallW(gx + 1, gz);
    if (dx === -1) return !this.wallW(gx, gz);
    if (dz === 1) return !this.wallN(gx, gz + 1);
    return !this.wallN(gx, gz);
  }

  // BFS over grid cells. Monsters may not enter the safe base.
  findPath(sgx, sgz, tgx, tgz, maxNodes = 2500) {
    if (sgx === tgx && sgz === tgz) return [];
    const key = (x, z) => (x + 32768) * 65536 + (z + 32768);
    const prev = new Map();
    prev.set(key(sgx, sgz), -1);
    const q = [sgx, sgz];
    let qi = 0, found = false;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (qi < q.length && prev.size < maxNodes) {
      const x = q[qi++], z = q[qi++];
      for (const [dx, dz] of dirs) {
        const nx = x + dx, nz = z + dz, k = key(nx, nz);
        if (prev.has(k) || this.inBase(nx, nz) || !this.canStep(x, z, dx, dz)) continue;
        prev.set(k, key(x, z));
        if (nx === tgx && nz === tgz) { found = true; break; }
        q.push(nx, nz);
      }
      if (found) break;
    }
    if (!found) return null;
    const path = [];
    let k = key(tgx, tgz);
    const start = key(sgx, sgz);
    while (k !== start) {
      path.push({ gx: Math.floor(k / 65536) - 32768, gz: (k % 65536) - 32768 });
      k = prev.get(k);
    }
    return path.reverse();
  }

  // Random open cell between minD and maxD metres from (x,z), outside the base.
  randomCellNear(x, z, minD, maxD, rnd = Math.random, filter) {
    for (let tries = 0; tries < 60; tries++) {
      const a = rnd() * Math.PI * 2, d = minD + rnd() * (maxD - minD);
      const gx = cellOf(x + Math.cos(a) * d), gz = cellOf(z + Math.sin(a) * d);
      if (this.inBase(gx, gz)) continue;
      const c = { gx, gz, x: gx * CELL + CELL / 2, z: gz * CELL + CELL / 2 };
      if (filter && !filter(c)) continue;
      return c;
    }
    return null;
  }

  // ---------------- rendering ----------------

  _makeMaterials() {
    const t = this.tex;
    const wallTex = (map, rx, ry) => { const m = map.clone(); m.repeat.set(rx, ry); m.needsUpdate = true; return m; };
    this.mat = {
      wall: new THREE.MeshStandardMaterial({ map: t.wall, normalMap: t.wallN, normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.88 }),
      pillar: new THREE.MeshStandardMaterial({ map: wallTex(t.wall, 0.33, 1), normalMap: wallTex(t.wallN, 0.33, 1), roughness: 0.88 }),
      base: new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.55 }),
      carpet: new THREE.MeshStandardMaterial({ map: t.carpet, normalMap: t.carpetN, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 1 }),
      ceil: new THREE.MeshStandardMaterial({ map: t.ceil, normalMap: t.ceilN, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.95 }),
      poolFloor: new THREE.MeshStandardMaterial({ map: t.pool, normalMap: t.poolN, roughness: 0.12, envMapIntensity: 0.9 }),
      poolWall: new THREE.MeshStandardMaterial({ map: wallTex(t.pool, 3.5, 2.6), normalMap: wallTex(t.poolN, 3.5, 2.6), roughness: 0.12, envMapIntensity: 0.9 }),
      poolPillar: new THREE.MeshStandardMaterial({ map: wallTex(t.pool, 0.6, 2.6), normalMap: wallTex(t.poolN, 0.6, 2.6), roughness: 0.12 }),
      water: new THREE.MeshStandardMaterial({ color: 0x7fc4cf, transparent: true, opacity: 0.5, roughness: 0.02, metalness: 0.1, normalMap: t.water, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.6, depthWrite: false }),
      lightOn: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 2.6 }),
      lightFlicker: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 2.6 }),
      lightDead: new THREE.MeshStandardMaterial({ color: 0x77756c, roughness: 0.5 }),
      lightFrame: new THREE.MeshStandardMaterial({ color: 0xb8b2a0, roughness: 0.6, metalness: 0.3 }),
      ao: new THREE.MeshBasicMaterial({ color: 0x000000, map: t.ao, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    };
    this.geo = {
      wall: new THREE.BoxGeometry(CELL + WALL_T, WALL_H, WALL_T),
      board: new THREE.BoxGeometry(CELL + WALL_T + 0.01, 0.1, WALL_T + 0.03),
      pillar: new THREE.BoxGeometry(PILLAR, WALL_H, PILLAR),
      floor: scaledPlane(CHUNK_SIZE, CHUNK_SIZE / 2),
      ceil: scaledPlane(CHUNK_SIZE, CHUNK_SIZE / 2.4),
      poolFloor: scaledPlane(CHUNK_SIZE, CHUNK_SIZE / 1.2),
      water: new THREE.PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2),
      panel: new THREE.BoxGeometry(1.25, 0.03, 0.62),
      frame: new THREE.BoxGeometry(1.36, 0.02, 0.72),
      ao: new THREE.PlaneGeometry(CELL + WALL_T, 0.8).rotateX(-Math.PI / 2),
    };
  }

  _makeLights() {
    this.hemi = new THREE.HemisphereLight(0xfff1c8, 0x6d5c34, 0.55);
    this.scene.add(this.hemi);
    this.fog = new THREE.FogExp2(0xbfae72, 0.03);
    this.scene.fog = this.fog;
    this.bgOn = new THREE.Color(0xbfae72);
    this.bgOff = new THREE.Color(0x000000);
    this.bg = this.bgOn.clone();
    this.scene.background = this.bg;
    this.pool = [];
    this.applyQuality();
    this._poolTimer = 0;
  }

  // Real point lights follow the nearest ceiling panels. Fewer lights = much
  // cheaper pixels; the ambient fill rises a little to compensate.
  applyQuality() {
    const q = preset(this.settings);
    this.loadR = q.loadR;
    while (this.pool.length > q.lights) this.scene.remove(this.pool.pop());
    while (this.pool.length < q.lights) {
      const l = new THREE.PointLight(0xfff0d0, 0, 12, 1.5);
      l.userData.fix = null;
      this.scene.add(l);
      this.pool.push(l);
    }
    this.hemiBase = 0.5 + (8 - q.lights) * 0.05;
    this.lightBoost = 1 + (8 - q.lights) * 0.06;
    this._poolTimer = 0;
  }

  setPower(on) { this.powerOn = on; }

  // Reflections for the glossy pool tiles and water; scaled with the power level.
  setEnv(env) {
    this.envMats = [this.mat.poolFloor, this.mat.poolWall, this.mat.poolPillar, this.mat.water].map((m) => {
      m.envMap = env; m.needsUpdate = true;
      return [m, m.envMapIntensity];
    });
  }

  flicker(id = 0) {
    const t = this.time;
    const a = Math.sin(t * 31 + id) * Math.sin(t * 7.7 + id * 1.7) + Math.sin(t * 2.1 + id);
    if (a < -0.6) return 0.05;
    return 0.75 + Math.sin(t * 120) * 0.08;
  }

  buildChunk(cx, cz) {
    const type = this.chunkType(cx, cz);
    const pool = type === 'pool';
    const g = new THREE.Group();
    const wallM = [], wallMats = [], pillars = [], fixtures = [], water = [], aos = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const ry = (a) => q.setFromAxisAngle(up, a);
    const addAO = (x, z, a) => { aos.push(new THREE.Matrix4().compose(p.set(x, 0.006, z), ry(a).clone(), s)); };
    const off = WALL_T / 2 + 0.4;
    for (let i = 0; i < CHUNK; i++) {
      for (let j = 0; j < CHUNK; j++) {
        const gx = cx * CHUNK + i, gz = cz * CHUNK + j;
        const x = gx * CELL, z = gz * CELL;
        if (this.wallW(gx, gz)) {
          wallM.push(new THREE.Matrix4().compose(p.set(x, WALL_H / 2, z + CELL / 2), ry(Math.PI / 2).clone(), s));
          addAO(x + off, z + CELL / 2, Math.PI / 2); addAO(x - off, z + CELL / 2, -Math.PI / 2);
        }
        if (this.wallN(gx, gz)) {
          wallM.push(new THREE.Matrix4().compose(p.set(x + CELL / 2, WALL_H / 2, z), ry(0).clone(), s));
          addAO(x + CELL / 2, z + off, 0); addAO(x + CELL / 2, z - off, Math.PI);
        }
        if (this.pillarAt(gx, gz)) pillars.push(new THREE.Matrix4().makeTranslation(x, WALL_H / 2, z));
        const f = this.fixtureAt(gx, gz);
        if (f) fixtures.push({ x: x + CELL / 2, z: z + CELL / 2, kind: f, id: (gx * 13 + gz * 7) % 97 });
        if (this.waterAt(gx, gz)) water.push(new THREE.Matrix4().makeTranslation(x + CELL / 2, 0.16, z + CELL / 2));
      }
    }
    const inst = (geo, mat, mats, shadow) => {
      if (!mats.length) return null;
      const m = new THREE.InstancedMesh(geo, mat, mats.length);
      mats.forEach((mm, i) => m.setMatrixAt(i, mm));
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      m.receiveShadow = true;
      m.castShadow = !!shadow;
      g.add(m);
      return m;
    };
    inst(this.geo.wall, pool ? this.mat.poolWall : this.mat.wall, wallM);
    if (!pool) {
      inst(this.geo.board, this.mat.base, wallM.map((mm) => mm.clone().multiply(new THREE.Matrix4().makeTranslation(0, -WALL_H / 2 + 0.05, 0))));
      inst(this.geo.ao, this.mat.ao, aos);
    }
    inst(this.geo.pillar, pool ? this.mat.poolPillar : this.mat.pillar, pillars);
    inst(this.geo.water, this.mat.water, water);
    const fx = (kind) => fixtures.filter((f) => f.kind === kind).map((f) => new THREE.Matrix4().makeTranslation(f.x, WALL_H - 0.012, f.z));
    inst(this.geo.panel, this.mat.lightOn, fx(1));
    inst(this.geo.panel, this.mat.lightFlicker, fx(2));
    inst(this.geo.panel, this.mat.lightDead, fx(3));
    inst(this.geo.frame, this.mat.lightFrame, fixtures.map((f) => new THREE.Matrix4().makeTranslation(f.x, WALL_H - 0.005, f.z)));

    const floor = new THREE.Mesh(pool ? this.geo.poolFloor : this.geo.floor, pool ? this.mat.poolFloor : this.mat.carpet);
    floor.position.set(cx * CHUNK_SIZE + CHUNK_SIZE / 2, 0, cz * CHUNK_SIZE + CHUNK_SIZE / 2);
    floor.receiveShadow = true;
    const ceil = new THREE.Mesh(this.geo.ceil, pool ? this.mat.poolFloor : this.mat.ceil);
    ceil.rotation.x = Math.PI;
    ceil.position.set(floor.position.x, WALL_H, floor.position.z);
    g.add(floor, ceil);
    this.scene.add(g);
    return { cx, cz, type, group: g, fixtures };
  }

  disposeChunk(c) {
    this.scene.remove(c.group);
    c.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
  }

  update(dt, px, pz) {
    this.time += dt;
    const pcx = chunkOf(cellOf(px)), pcz = chunkOf(cellOf(pz));
    // stream chunks, nearest first, a couple per frame to avoid hitches
    const want = [];
    const R = this.loadR;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const k = `${pcx + dx},${pcz + dz}`;
      if (!this.chunks.has(k)) want.push([dx * dx + dz * dz, pcx + dx, pcz + dz, k]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(2, want.length); i++) {
      const [, cx, cz, k] = want[i];
      const c = this.buildChunk(cx, cz);
      this.chunks.set(k, c);
      this.onChunkLoad?.(c);
    }
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - pcx) > R + 1 || Math.abs(c.cz - pcz) > R + 1) {
        this.disposeChunk(c);
        this.chunks.delete(k);
        this.onChunkUnload?.(c);
      }
    }

    // power transitions (with a stutter when it cuts)
    const target = this.powerOn ? 1 : 0;
    if (this.power !== target) {
      this.power = clamp(this.power + Math.sign(target - this.power) * dt * (this.powerOn ? 0.8 : 2.5), 0, 1);
    }
    const stutter = this.power > 0 && this.power < 1 ? (Math.random() < 0.5 ? 0.2 : 1) : 1;
    const pw = this.power * stutter;
    const fl = this.flicker(3);
    this.mat.lightOn.emissiveIntensity = 2.6 * pw;
    this.mat.lightFlicker.emissiveIntensity = 2.6 * pw * fl;
    this.mat.lightOn.color.setScalar(0.3 + 0.7 * pw);
    this.hemi.intensity = 0.04 + this.hemiBase * pw;
    this.bg.copy(this.bgOff).lerp(this.bgOn, pw);
    this.fog.color.copy(this.bg);
    this.fog.density = 0.03 + (1 - pw) * 0.03;
    if (this.envMats) for (const [m, base] of this.envMats) m.envMapIntensity = base * (0.05 + 0.95 * pw);
    this.mat.water.normalMap.offset.set(this.time * 0.02, this.time * 0.013);

    // assign the real point lights to the nearest fixtures
    this._poolTimer -= dt;
    if (this._poolTimer <= 0) {
      this._poolTimer = 0.15;
      const list = [];
      for (const c of this.chunks.values()) {
        if (Math.abs(c.cx - pcx) > 1 || Math.abs(c.cz - pcz) > 1) continue;
        for (const f of c.fixtures) {
          if (f.kind === 3) continue;
          const d = (f.x - px) ** 2 + (f.z - pz) ** 2;
          if (d < 200) list.push([d, f]);
        }
      }
      list.sort((a, b) => a[0] - b[0]);
      this.pool.forEach((l, i) => {
        const f = list[i] && list[i][1];
        l.userData.fix = f || null;
        if (f) l.position.set(f.x, WALL_H - 0.35, f.z);
      });
    }
    for (const l of this.pool) {
      const f = l.userData.fix;
      l.intensity = f ? 7 * this.lightBoost * pw * (f.kind === 2 ? fl : 1) : 0;
    }
  }

  dispose() {
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
    for (const l of this.pool) this.scene.remove(l);
    this.scene.remove(this.hemi);
    this.scene.fog = null;
  }
}

function pushOut(p, r, minX, maxX, minZ, maxZ) {
  const cx = clamp(p.x, minX, maxX), cz = clamp(p.z, minZ, maxZ);
  const dx = p.x - cx, dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2), k = (r - d) / d;
    p.x += dx * k; p.z += dz * k;
  } else {
    // centre inside the box: leave along the shallowest axis
    const l = p.x - minX, rr = maxX - p.x, t = p.z - minZ, b = maxZ - p.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) p.x = minX - r; else if (m === rr) p.x = maxX + r; else if (m === t) p.z = minZ - r; else p.z = maxZ + r;
  }
  return true;
}

function scaledPlane(size, uvScale) {
  const g = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  return g;
}
