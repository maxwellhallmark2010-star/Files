// The three entities from the design sheet:
//  - Giant spider: crawls along walls/ceiling, hunts by sight; break line of
//    sight by taking turns and it loses you.
//  - Light-bulb creature: harmless unless you stare at it. Stare too long and it kills you.
//  - Shadow creature: pure scare, zero damage.
import * as THREE from 'three';
import { CELL, WALL_H, WALL_T, cellOf, damp, clamp } from './util.js';
import * as Models from './models.js';

const HIDDEN_Y = -500;

class Spider {
  constructor(mgr, idx) {
    this.mgr = mgr; this.idx = idx; this.kind = 'spider';
    this.mesh = Models.makeSpider();
    this.mesh.position.y = HIDDEN_Y;
    mgr.scene.add(this.mesh);
    this.active = false; this.dead = false;
    this.x = 0; this.z = 0; this.dir = new THREE.Vector3(0, 0, 1);
    this.rp = new THREE.Vector3(); this.q = new THREE.Quaternion();
    this.phase = 0; this.respawn = 8 + idx * 25;
    this.hitR = 0.9;
  }

  spawn(x, z) {
    Object.assign(this, { x, z, active: true, dead: false, hp: 3, state: 'wander', path: null, pathT: 0, lost: 0, cd: 0, deadT: 0, curl: 0, clickT: 0 });
    this.surface = 'ceil';
    this.rp.set(x, WALL_H - 0.45, z);
    this.q.setFromAxisAngle(_x, Math.PI);
    this.mesh.position.copy(this.rp);
  }

  despawn() { this.active = false; this.mesh.position.y = HIDDEN_Y; this.respawn = 25 + Math.random() * 25; }

  damage(n) {
    if (!this.active || this.dead) return;
    this.hp -= n;
    this.mgr.game.audio.play('screech', { x: this.rp.x, y: this.rp.y, z: this.rp.z });
    this.state = 'chase'; this.lost = 0;
    if (this.hp <= 0) this.kill();
  }

  kill() {
    if (this.dead) return;
    this.dead = true; this.deadT = 0; this.surface = 'floor';
    this.mgr.game.onMonsterKilled('spider');
  }

  hidePos() { return this.active ? this.rp : null; }

  update(dt, targets) {
    const g = this.mgr.game, w = g.world;
    if (!this.active) return;
    if (this.dead) {
      this.deadT += dt;
      this.curl = Math.min(1, this.curl + dt * 3);
      this._place(dt, 0, 0);
      Models.animateSpider(this.mesh, this.phase, 0, this.curl);
      if (this.deadT > 6) this.despawn();
      return;
    }
    this.cd -= dt;
    // nearest target
    let tgt = null, td = Infinity;
    for (const t of targets) {
      if (t.dead) continue;
      const d = Math.hypot(t.x - this.x, t.z - this.z);
      if (d < td) { td = d; tgt = t; }
    }
    if (!tgt || td > 75) { this.despawn(); return; }
    const lit = w.power > 0.5 || tgt.flashlight || td < 10;
    const sees = td < 30 && lit && !tgt.inBase && w.los(this.x, this.z, tgt.x, tgt.z);
    if (sees || (td < 9 && tgt.sprinting && !tgt.inBase)) {
      if (this.state !== 'chase') g.audio.play('hiss', { x: this.rp.x, y: this.rp.y, z: this.rp.z });
      this.state = 'chase'; this.lost = 0; this.last = { x: tgt.x, z: tgt.z };
    } else if (this.state === 'chase') {
      this.lost += dt;
      if (this.lost > 2.2 || tgt.inBase) { this.state = 'search'; this.path = null; }
    }

    let speed = 1.7, goal = null, direct = false;
    if (this.state === 'chase') {
      speed = w.power > 0.5 ? 5.0 : 5.6;
      goal = this.last;
      direct = sees && td < 7;
    } else if (this.state === 'search') {
      speed = 3.2; goal = this.last;
      if (Math.hypot(goal.x - this.x, goal.z - this.z) < 1) { this.state = 'wander'; this.path = null; }
    }

    let mx = 0, mz = 0;
    if (direct) {
      mx = tgt.x - this.x; mz = tgt.z - this.z;
    } else {
      this.pathT -= dt;
      if (!this.path || !this.path.length || this.pathT <= 0) {
        this.pathT = this.state === 'chase' ? 0.35 : 3;
        const sgx = cellOf(this.x), sgz = cellOf(this.z);
        let tg = goal ? { gx: cellOf(goal.x), gz: cellOf(goal.z) } : null;
        if (!tg) {
          const c = w.randomCellNear(this.x, this.z, 6, 22);
          tg = c ? { gx: c.gx, gz: c.gz } : { gx: sgx, gz: sgz };
        }
        this.path = w.inBase(tg.gx, tg.gz) ? null : w.findPath(sgx, sgz, tg.gx, tg.gz);
        if (!this.path) { this.path = []; if (this.state === 'search') this.state = 'wander'; }
      }
      if (this.path.length) {
        const n = this.path[0];
        const nx = n.gx * CELL + CELL / 2, nz = n.gz * CELL + CELL / 2;
        mx = nx - this.x; mz = nz - this.z;
        if (Math.hypot(mx, mz) < 0.35) this.path.shift();
      }
    }
    const ml = Math.hypot(mx, mz);
    let moving = 0;
    if (ml > 0.05 && !(this.state === 'chase' && td < 1.1)) {
      const step = Math.min(ml, speed * dt);
      this.x += (mx / ml) * step; this.z += (mz / ml) * step;
      if (direct) { const p = { x: this.x, z: this.z }; w.collideCircle(p, 0.45); this.x = p.x; this.z = p.z; }
      this.dir.set(mx / ml, 0, mz / ml);
      moving = speed;
    }
    if (direct || (this.state === 'chase' && td < 4)) { this.dir.set(tgt.x - this.x, 0, tgt.z - this.z).normalize(); }

    // attack local player
    if (this.state === 'chase' && td < 1.7 && this.cd <= 0 && tgt.local && !tgt.inBase) {
      this.cd = 1.3;
      g.hurtBy(this, 34);
    }
    this.surface = this.state === 'chase' && td < 5 ? 'floor' : this._pickSurface();
    this._place(dt, moving, td);
    this.phase += dt * (moving ? 2 + moving * 2.2 : 0.5);
    Models.animateSpider(this.mesh, this.phase, moving ? 1 : 0.15);
    this.clickT -= dt * (moving ? moving : 0);
    if (this.clickT <= 0 && moving) {
      this.clickT = 0.6;
      g.audio.play('click', { x: this.rp.x, y: this.rp.y, z: this.rp.z }, { gain: 1.5 });
    }
  }

  _pickSurface() {
    const w = this.mgr.game.world;
    const gx = cellOf(this.x), gz = cellOf(this.z);
    const alongZ = Math.abs(this.dir.z) > Math.abs(this.dir.x);
    if (alongZ) {
      if (w.wallW(gx, gz)) return 'wW';
      if (w.wallW(gx + 1, gz)) return 'wE';
    } else {
      if (w.wallN(gx, gz)) return 'wN';
      if (w.wallN(gx, gz + 1)) return 'wS';
    }
    return 'ceil';
  }

  // Smoothly glue the body to the chosen surface (floor, ceiling or a wall).
  _place(dt, moving) {
    const gx = cellOf(this.x), gz = cellOf(this.z);
    const off = WALL_T / 2 + 0.42;
    let tx = this.x, ty = 0, tz = this.z;
    switch (this.surface) {
      case 'floor': _up.set(0, 1, 0); ty = 0; break;
      case 'ceil': _up.set(0, -1, 0); ty = WALL_H - 0.02; break;
      case 'wW': _up.set(1, 0, 0); tx = gx * CELL + off; ty = 1.7; break;
      case 'wE': _up.set(-1, 0, 0); tx = (gx + 1) * CELL - off; ty = 1.7; break;
      case 'wN': _up.set(0, 0, 1); tz = gz * CELL + off; ty = 1.7; break;
      case 'wS': _up.set(0, 0, -1); tz = (gz + 1) * CELL - off; ty = 1.7; break;
    }
    if (this.surface === 'floor' && this.dead) ty = 0;
    const r = moving ? 7 : 4;
    this.rp.x = damp(this.rp.x, tx, r, dt);
    this.rp.y = damp(this.rp.y, ty, r * 0.8, dt);
    this.rp.z = damp(this.rp.z, tz, r, dt);
    this.mesh.position.copy(this.rp);
    // orientation: up = surface normal, forward = travel direction
    _f.copy(this.dir).addScaledVector(_up, -this.dir.dot(_up));
    if (_f.lengthSq() < 1e-4) _f.set(0, 1, 0).addScaledVector(_up, -_up.y).normalize();
    if (_f.lengthSq() < 1e-4) _f.set(1, 0, 0);
    _f.normalize();
    _r.crossVectors(_up, _f);
    _m.makeBasis(_r, _up, _f);
    _q.setFromRotationMatrix(_m);
    this.q.slerp(_q, 1 - Math.exp(-8 * dt));
    this.mesh.quaternion.copy(this.q);
  }

  center() { return _c.copy(this.rp).addScaledVector(_up.set(0, 1, 0).applyQuaternion(this.q), 0.45); }
}

class Bulb {
  constructor(mgr, idx) {
    this.mgr = mgr; this.idx = idx; this.kind = 'bulb';
    this.mesh = Models.makeBulbCreature();
    this.mesh.position.y = HIDDEN_Y;
    this.mesh.userData.light.intensity = 0;
    mgr.scene.add(this.mesh);
    this.active = false; this.dead = false;
    this.respawn = 30;
    this.hitR = 0.5;
    this.phase = 0; this.x = 0; this.z = 0; this.ry = 0;
  }
  spawn(x, z) {
    Object.assign(this, { x, z, active: true, dead: false, hp: 2, path: null, pathT: 0, deadT: 0, fall: 0 });
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.position.set(x, 0, z);
  }
  despawn() { this.active = false; this.mesh.position.y = HIDDEN_Y; this.mesh.userData.light.intensity = 0; this.respawn = 40 + Math.random() * 40; }
  damage(n) {
    if (!this.active || this.dead) return;
    this.hp -= n;
    if (this.hp <= 0) this.kill();
  }
  kill() {
    if (this.dead) return;
    this.dead = true; this.deadT = 0;
    this.mgr.game.audio.play('shatter', { x: this.x, y: 2.4, z: this.z });
    this.mgr.game.onMonsterKilled('bulb');
  }
  update(dt, targets) {
    const g = this.mgr.game, w = g.world;
    if (!this.active) return;
    const u = this.mesh.userData;
    if (this.dead) {
      this.deadT += dt;
      this.fall = Math.min(Math.PI / 2, this.fall + dt * this.fall * 3 + dt * 0.3);
      this.mesh.rotation.x = -this.fall;
      u.light.intensity = 0; u.bulbMat.emissiveIntensity = 0;
      if (this.deadT > 6) this.despawn();
      return;
    }
    let tgt = null, td = Infinity;
    for (const t of targets) { const d = Math.hypot(t.x - this.x, t.z - this.z); if (d < td && !t.dead) { td = d; tgt = t; } }
    if (!tgt || td > 80) { this.despawn(); return; }
    let moving = 0;
    if (td > 13) {
      this.pathT -= dt;
      if (!this.path || this.pathT <= 0) {
        this.pathT = 1.5;
        this.path = w.findPath(cellOf(this.x), cellOf(this.z), cellOf(tgt.x), cellOf(tgt.z)) || [];
      }
      if (this.path.length) {
        const n = this.path[0];
        const mx = n.gx * CELL + CELL / 2 - this.x, mz = n.gz * CELL + CELL / 2 - this.z;
        const ml = Math.hypot(mx, mz);
        if (ml < 0.3) this.path.shift();
        else { const s = Math.min(ml, 1.3 * dt); this.x += mx / ml * s; this.z += mz / ml * s; moving = 1; }
      }
    }
    const want = Math.atan2(tgt.x - this.x, tgt.z - this.z);
    this.ry += Math.atan2(Math.sin(want - this.ry), Math.cos(want - this.ry)) * Math.min(1, dt * 2);
    this.phase += dt * (moving ? 3 : 0.4);
    Models.animateWalk(this.mesh, this.phase, moving);
    this.mesh.position.set(this.x, Math.sin(this.phase * 0.5) * 0.01, this.z);
    this.mesh.rotation.y = this.ry;
    const stare = this.mgr.stare;
    const fl = 0.75 + Math.random() * 0.25 * (1 + stare * 3);
    u.light.intensity = (4 + stare * 14) * fl * (0.5 + 0.5 * Math.max(0.2, w.power));
    u.bulbMat.emissiveIntensity = (5 + stare * 20) * fl;
  }
  center() { return _c.set(this.x, 2.45, this.z); }
}

class Shadow {
  constructor(mgr) {
    this.mgr = mgr; this.kind = 'shadow';
    this.mesh = Models.makeShadowCreature();
    this.mesh.position.y = HIDDEN_Y;
    mgr.scene.add(this.mesh);
    this.active = false;
    this.timer = 25 + Math.random() * 30;
  }
  spawn(x, z) {
    Object.assign(this, { x, z, active: true, seen: 0, life: 0, rush: false });
    this.mesh.position.set(x, 0, z);
  }
  despawn() { this.active = false; this.mesh.position.y = HIDDEN_Y; this.timer = 40 + Math.random() * 60; }
  update(dt, me, cam) {
    const g = this.mgr.game, w = g.world;
    if (!this.active) {
      this.timer -= dt * (w.power < 0.5 ? 2 : 1);
      if (this.timer <= 0 && !me.inBase && !me.dead) {
        // appear in peripheral vision, with a clear line of sight
        const yaw = g.player.yaw;
        const c = w.randomCellNear(me.x, me.z, 11, 24, Math.random, (c) => {
          const a = Math.atan2(-(c.x - me.x), -(c.z - me.z));
          const off = Math.abs(Math.atan2(Math.sin(a - yaw), Math.cos(a - yaw)));
          return off > 0.45 && off < 1.2 && w.los(me.x, me.z, c.x, c.z);
        });
        if (c) this.spawn(c.x, c.z); else this.timer = 5;
      }
      return;
    }
    this.life += dt;
    const dx = me.x - this.x, dz = me.z - this.z, d = Math.hypot(dx, dz);
    this.mesh.rotation.y = Math.atan2(dx, dz);
    if (this.rush) {
      const s = Math.min(d, 26 * dt);
      this.x += dx / d * s; this.z += dz / d * s;
      this.mesh.position.set(this.x, 0, this.z);
      if (d < 1.3) {
        g.effects.jumpscare('shadow', false);
        g.audio.play('sting', null, { gain: 0.8 });
        this.despawn();
      }
      return;
    }
    const head = _c.set(this.x, 2.3, this.z);
    const looking = this.mgr.lookingAt(cam, head, 0.2) && w.los(me.x, me.z, this.x, this.z);
    if (looking) this.seen += dt;
    if (this.seen > 0.35 || d < 6) {
      if (Math.random() < 0.55) { this.rush = true; g.audio.play('whoosh', null); }
      else { g.audio.play('whoosh', { x: this.x, y: 1.5, z: this.z }); this.despawn(); }
    } else if (this.life > 18 || d > 45) this.despawn();
  }
}

export class MonsterManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.spiders = [new Spider(this, 0), new Spider(this, 1)];
    this.bulbs = [new Bulb(this, 2)];
    this.all = [...this.spiders, ...this.bulbs];
    this.shadow = new Shadow(this);
    this.stare = 0;
    this.whine = null;
    this.puppet = false;
  }

  lookingAt(cam, p, maxAngle) {
    cam.getWorldPosition(_a);
    cam.getWorldDirection(_b);
    _d.copy(p).sub(_a);
    const dist = _d.length();
    return _d.normalize().dot(_b) > Math.cos(maxAngle) && dist < 40;
  }

  targets() {
    const g = this.game, p = g.player;
    const list = [{ x: p.pos.x, z: p.pos.z, local: true, dead: p.dead, inBase: g.world.inBaseWorld(p.pos.x, p.pos.z), flashlight: p.flashlight, sprinting: p.sprinting }];
    for (const r of g.net.remotes.values()) {
      if (r.state) list.push({ x: r.state.x, z: r.state.z, local: false, dead: !!r.state.dead, inBase: g.world.inBaseWorld(r.state.x, r.state.z), flashlight: r.state.fl, sprinting: false });
    }
    return list;
  }

  update(dt) {
    const g = this.game, w = g.world, me = g.player;
    const targets = this.targets();
    if (!this.puppet) {
      // spawning (host / single player)
      const day = g.state.day;
      const spiderCap = w.power < 0.5 ? 2 : day >= 3 ? 2 : 1;
      this.spiders.forEach((s, i) => {
        if (s.active) return;
        if (i >= spiderCap) return;
        s.respawn -= dt;
        if (s.respawn <= 0) this._spawnAway(s, 26, 42);
      });
      if (day >= 2) for (const b of this.bulbs) if (!b.active) { b.respawn -= dt; if (b.respawn <= 0) this._spawnAway(b, 22, 38); }
      for (const m of this.all) m.update(dt, targets);
      // landmines
      for (const mine of g.entities.mines.values()) {
        for (const m of this.all) {
          if (m.active && !m.dead && Math.hypot(m.x - mine.data.x, m.z - mine.data.z) < 1.4) { g.entities.explodeMine(mine.data.id); break; }
        }
      }
      // go-karts mow monsters down
      for (const k of g.entities.karts.values()) {
        if (Math.abs(k.speed) < 6) continue;
        for (const m of this.all) if (m.active && !m.dead && Math.hypot(m.x - k.data.x, m.z - k.data.z) < 1.6) { m.kill(); g.audio.play('thump', { x: m.x, y: 1, z: m.z }); }
      }
    } else {
      this._puppetUpdate(dt, targets);
    }

    // staring at the bulb creature (always evaluated locally)
    let staring = false;
    const meInBase = w.inBaseWorld(me.pos.x, me.pos.z);
    for (const b of this.bulbs) {
      if (!b.active || b.dead || me.dead || meInBase) continue;
      const head = b.center();
      if (this.lookingAt(g.camera, head, 0.32) && w.los(me.pos.x, me.pos.z, b.x, b.z)) staring = true;
      if (!this.whine) this.whine = g.audio.loop('whine', head);
      this.whine?.set(head.x, head.y, head.z);
    }
    this.stare = clamp(this.stare + (staring ? dt / 3.2 : -dt * 0.35), 0, 1);
    this.whine?.level(this.stare * 0.12);
    if (this.stare >= 1 && !me.dead) {
      this.stare = 0;
      g.killPlayer('bulb');
    }
    // puppet spiders still bite locally
    if (this.puppet) {
      for (const s of this.spiders) {
        if (!s.active || s.dead || me.dead || meInBase) continue;
        s.cd = (s.cd ?? 0) - dt;
        if (Math.hypot(s.x - me.pos.x, s.z - me.pos.z) < 1.7 && s.surface === 'floor' && s.cd <= 0) { s.cd = 1.3; g.hurtBy(s, 34); }
      }
    }
    this.shadow.update(dt, targets[0], g.camera);
  }

  _spawnAway(m, minD, maxD) {
    const p = this.game.player.pos, w = this.game.world;
    const c = w.randomCellNear(p.x, p.z, minD, maxD, Math.random, (c) => !w.los(p.x, p.z, c.x, c.z));
    if (c) m.spawn(c.x, c.z); else m.respawn = 3;
  }

  explosionAt(x, z, r) {
    if (this.puppet) return;
    for (const m of this.all) if (m.active && !m.dead && Math.hypot(m.x - x, m.z - z) < r) m.kill();
  }

  // Gun hit test: nearest monster along the ray that isn't behind a wall.
  shoot(origin, dir) {
    let best = null, bt = 40;
    for (const m of this.all) {
      if (!m.active || m.dead) continue;
      const c = m.center();
      _d.copy(c).sub(origin);
      const t = _d.dot(dir);
      if (t < 0 || t > bt) continue;
      const perp = _d.addScaledVector(dir, -t).length();
      if (perp > m.hitR) continue;
      const hx = origin.x + dir.x * t, hz = origin.z + dir.z * t;
      if (!this.game.world.los(origin.x, origin.z, hx, hz)) continue;
      best = m; bt = t;
    }
    return best;
  }

  // ---------- multiplayer ----------
  snapshot() {
    return this.all.map((m) => ({
      a: m.active ? 1 : 0, d: m.dead ? 1 : 0,
      x: +m.x.toFixed(2), z: +m.z.toFixed(2),
      px: +m.mesh.position.x.toFixed(2), py: +m.mesh.position.y.toFixed(2), pz: +m.mesh.position.z.toFixed(2),
      q: m.mesh.quaternion.toArray().map((v) => +v.toFixed(3)), s: m.surface || '', st: m.state || '', ph: +(m.phase || 0).toFixed(2), c: +(m.curl || 0).toFixed(2), f: +(m.fall || 0).toFixed(2),
    }));
  }
  applySnapshot(list) { this._snap = list; }
  _puppetUpdate(dt) {
    const s = this._snap;
    if (!s) return;
    this.all.forEach((m, i) => {
      const d = s[i];
      if (!d) return;
      const wasDead = m.dead;
      m.active = !!d.a; m.dead = !!d.d; m.x = d.x; m.z = d.z; m.surface = d.s; m.state = d.st; m.phase = d.ph;
      if (!m.active) { m.mesh.position.y = HIDDEN_Y; if (m.kind === 'bulb') m.mesh.userData.light.intensity = 0; return; }
      _c.set(d.px, d.py, d.pz);
      if (m.mesh.position.y < -100) m.mesh.position.copy(_c); else m.mesh.position.lerp(_c, Math.min(1, dt * 12));
      _q.fromArray(d.q);
      m.mesh.quaternion.slerp(_q, Math.min(1, dt * 12));
      if (m.kind === 'spider') {
        m.rp.copy(m.mesh.position); m.q.copy(m.mesh.quaternion);
        Models.animateSpider(m.mesh, d.ph, m.dead ? 0 : 1, d.c);
      } else {
        m.ry = m.mesh.rotation.y;
        Models.animateWalk(m.mesh, d.ph, 1);
        const u = m.mesh.userData;
        u.light.intensity = m.dead ? 0 : (4 + this.stare * 14) * (0.75 + Math.random() * 0.25);
        u.bulbMat.emissiveIntensity = m.dead ? 0 : 5 + this.stare * 20;
      }
      if (m.dead && !wasDead && m.kind === 'bulb') this.game.audio.play('shatter', { x: m.x, y: 2.4, z: m.z });
    });
  }

  dispose() {
    for (const m of [...this.all, this.shadow]) this.scene.remove(m.mesh);
    this.whine?.stop();
  }
}

const _x = new THREE.Vector3(1, 0, 0), _up = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _c = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
