// ─────────────────────────────────────────────────────────────────────────────
// Player: a low-poly jointed figure (~40 triangles per limb segment) driven by
// procedural animation, plus locomotion physics and the action state machine
// (shots, dunks, passes, steals, dribble moves, blocks). Controllers (human or
// AI) write to `player.ctrl` and call the action methods; the game resolves
// what the actions do to the ball.
// ─────────────────────────────────────────────────────────────────────────────

const SHOT = {
  PERFECT: 0.78,                       // meter fraction that lines up with the jump apex
  T: { jumper: 0.56, fade: 0.56, layup: 0.6 },
  W: { jumper: 0.058, fade: 0.045, layup: 0.1 },
  JUMP: { jumper: 3.3, fade: 3.15, layup: 3.7 },
  GATHER: { jumper: 0.1, fade: 0.1, layup: 0.16 },
};

function jerseyTexture(color, trim, number, name) {
  const c = makeCanvas(512, 256), g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 512, 256);
  g.fillStyle = trim; g.fillRect(118, 0, 20, 256); g.fillRect(374, 0, 20, 256); // side panels
  g.fillRect(0, 0, 512, 14);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 120px "Big Shoulders Display", Impact, "Arial Narrow", sans-serif';
  g.lineWidth = 10; g.strokeStyle = trim; g.fillStyle = '#ffffff';
  const num = String(number);
  [[0, 140], [512, 140], [256, 150]].forEach(([x, y]) => { g.strokeText(num, x, y); g.fillText(num, x, y); });
  g.font = '800 34px "Barlow Semi Condensed", "Arial Narrow", sans-serif'; g.fillStyle = '#ffffff';
  g.fillText(name.toUpperCase(), 256, 58);
  return canvasTex(c);
}

class Player {
  constructor(scene, o) {
    this.name = o.name; this.team = o.team; this.number = o.number;
    this.isHuman = !!o.isHuman; this.role = o.role || 'player';
    this.r = Object.assign({ speed: 1, shoot: 1, jump: 1, defense: 1, handle: 1 }, o.ratings || {});
    this.scale = (o.height || 1.9) / 1.85;
    this.colors = o.colors;
    this.build(scene);

    this.pos = new THREE.Vector3(0, 0, 8);
    this.vel = new THREE.Vector3();
    this.facing = Math.PI; // facing -z (the hoop)
    this.jumpY = 0; this.vy = 0; this.airborne = false;
    this.stamina = 1;
    this.ctrl = { mx: 0, mz: 0, sprint: false, face: null, stance: null };
    this.action = null;      // current action object
    this.emote = null;
    this.hasBall = false;
    this.dribble = { phase: 0, side: -1, cross: null };
    this.noCatch = 0;        // seconds during which the player can't grab the ball
    this.stealCD = 0; this.moveCD = 0;
    this.runPhase = 0; this.time = rand(0, 10);
    this.stats = Player.blankStats();
    this.pose = {}; Player.JOINTS.forEach((j) => (this.pose[j] = 0));
    this._handL = new THREE.Vector3(); this._handR = new THREE.Vector3(); this._tmp = new THREE.Vector3();
  }
  static blankStats() { return { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, reb: 0, stl: 0, blk: 0, dnk: 0, to: 0, ast: 0 }; }

  build(scene) {
    const c = this.colors;
    const std = (col, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: col, roughness: 0.72, metalness: 0 }, extra || {}));
    const skin = std(c.skin, { roughness: 0.6 }), shorts = std(c.shorts), shoe = std(c.shoe, { roughness: 0.5 }), sock = std(0xf2f2f2), band = std(c.trim);
    const jersey = std(0xffffff, { map: jerseyTexture(c.jersey, c.trim, this.number, this.name) });
    const mesh = (geo, mat, y = 0, parent = null) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; if (parent) parent.add(m); return m; };
    const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    this.root = new THREE.Group(); this.root.scale.setScalar(this.scale);
    scene.add(this.root);
    const J = (this.j = {});
    J.hips = grp(this.root, 0, 0.98, 0);
    mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.34, 10), shorts, -0.1, J.hips);
    J.torso = grp(J.hips, 0, 0.04, 0);
    const torsoMesh = mesh(new THREE.CylinderGeometry(0.23, 0.18, 0.6, 12), jersey, 0.3, J.torso); torsoMesh.scale.z = 0.72;
    J.neck = grp(J.torso, 0, 0.62, 0);
    mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8), skin, 0.03, J.neck);
    J.head = grp(J.neck, 0, 0.08, 0);
    const head = mesh(new THREE.SphereGeometry(0.115, 14, 10), skin, 0.1, J.head); head.scale.set(0.92, 1.05, 1);
    const hair = mesh(new THREE.SphereGeometry(0.119, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), std(c.hair || 0x1b120c, { roughness: 0.9 }), 0.115, J.head); hair.scale.set(0.93, 0.9, 1.02);
    const hb = mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.035, 14, 1, true), band, 0.14, J.head); hb.scale.set(0.93, 1, 1.02);
    // arms
    const armGeoU = new THREE.CylinderGeometry(0.055, 0.045, 0.33, 8); armGeoU.translate(0, -0.165, 0);
    const armGeoL = new THREE.CylinderGeometry(0.045, 0.038, 0.3, 8); armGeoL.translate(0, -0.15, 0);
    const handGeo = new THREE.SphereGeometry(0.052, 8, 6);
    ['L', 'R'].forEach((s) => {
      const sx = s === 'L' ? 1 : -1;
      J['sh' + s] = grp(J.torso, sx * 0.25, 0.53, 0);
      mesh(new THREE.SphereGeometry(0.075, 8, 6), jersey, 0, J['sh' + s]);
      mesh(armGeoU, skin, 0, J['sh' + s]);
      J['el' + s] = grp(J['sh' + s], 0, -0.33, 0);
      mesh(armGeoL, skin, 0, J['el' + s]);
      J['hand' + s] = grp(J['el' + s], 0, -0.33, 0);
      mesh(handGeo, skin, 0, J['hand' + s]);
      const wb = mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.05, 8), band, 0.06, J['hand' + s]);
      // legs
      J['hip' + s] = grp(J.hips, sx * 0.105, -0.03, 0);
      const thigh = new THREE.CylinderGeometry(0.085, 0.065, 0.46, 8); thigh.translate(0, -0.23, 0);
      mesh(thigh, skin, 0, J['hip' + s]);
      const leg = new THREE.CylinderGeometry(0.098, 0.09, 0.2, 8); mesh(leg, shorts, -0.11, J['hip' + s]); // short legs
      J['kn' + s] = grp(J['hip' + s], 0, -0.46, 0);
      const shin = new THREE.CylinderGeometry(0.062, 0.045, 0.44, 8); shin.translate(0, -0.22, 0);
      mesh(shin, skin, 0, J['kn' + s]);
      mesh(new THREE.CylinderGeometry(0.05, 0.048, 0.16, 8), sock, -0.36, J['kn' + s]);
      J['an' + s] = grp(J['kn' + s], 0, -0.46, 0);
      const sh = mesh(new THREE.BoxGeometry(0.11, 0.08, 0.27), shoe, 0.0, J['an' + s]); sh.position.z = 0.05;
      void wb;
    });
    // ground blob (used when real shadows are off) + team ring under the player
    const bc = makeCanvas(64, 64), bg = bc.getContext('2d');
    const gr = bg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    bg.fillStyle = gr; bg.fillRect(0, 0, 64, 64);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2; scene.add(this.blob);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 28), new THREE.MeshBasicMaterial({ color: c.ring || c.jersey, transparent: true, opacity: 0.0, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.renderOrder = 1; scene.add(this.ring);
  }
  setVisible(v) { this.root.visible = v; this.blob.visible = v; this.ring.visible = v; }
  dispose(scene) { scene.remove(this.root, this.blob, this.ring); }

  // ── queries ────────────────────────────────────────────────────────────────
  get onGround() { return !this.airborne; }
  get busy() { return !!this.action && this.action.kind !== 'recover'; }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  forward(out) { return out.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }
  reachTop() { const up = this.action && (this.action.kind === 'block' || this.action.kind === 'rebound'); return (up ? 2.32 : 2.05) * this.scale + this.jumpY; }
  handPos(side, out) { return out.setFromMatrixPosition((side > 0 ? this.j.handL : this.j.handR).matrixWorld); }
  isShooting() { return this.action && (this.action.kind === 'shot' || this.action.kind === 'dunk') ; }

  // ── actions ───────────────────────────────────────────────────────────────
  jump(vy) { if (this.airborne) return false; this.vy = vy * (0.92 + 0.08 * this.r.jump); this.airborne = true; return true; }

  startShot(type, aiRelease = null) {
    if (!this.hasBall || this.busy || this.airborne) return false;
    if (type === 'dunk') return this.startDunk();
    const toHoop = _v1.set(HOOP.x - this.pos.x, 0, HOOP.z - this.pos.z).normalize();
    this.action = {
      kind: 'shot', type, t: 0, T: SHOT.T[type], gather: SHOT.GATHER[type], released: false, jumped: false,
      w: G.shotWindow(this, type), aiRelease, dir: toHoop.clone(), startPos: this.pos.clone(),
      threePt: isBeyondArc(this.pos.x, this.pos.z), dist: hoopDist(this.pos),
    };
    if (type === 'layup') {
      // glide to a finishing spot ~1 m in front of the rim (never under it)
      let ox = this.pos.x - HOOP.x, oz = this.pos.z - HOOP.z; const ol = Math.hypot(ox, oz);
      if (ol < 0.3 || oz < -0.2) { ox = ox * 0.3; oz = 1; }
      const on = Math.hypot(ox, oz) || 1;
      const fx = HOOP.x + (ox / on) * 1.0, fz = HOOP.z + Math.max(0.35, (oz / on) * 1.0);
      const tt = SHOT.GATHER.layup + 0.3;
      this.action.glide = new THREE.Vector3((fx - this.pos.x) / tt, 0, (fz - this.pos.z) / tt);
      if (this.action.glide.length() > 4.2) this.action.glide.setLength(4.2);
      this.vel.x = this.action.glide.x; this.vel.z = this.action.glide.z;
    }
    return true;
  }
  releaseShot() {
    const a = this.action;
    if (!a || a.kind !== 'shot' || a.released) return;
    a.released = true;
    G.launchShot(this, a, a.t / a.T - SHOT.PERFECT);
  }
  startDunk() {
    const start = this.pos.clone();
    const away = _v1.set(this.pos.x - HOOP.x, 0, this.pos.z - HOOP.z);
    if (away.lengthSq() < 1e-4) away.set(0, 0, 1);
    away.normalize();
    const target = new THREE.Vector3(HOOP.x + away.x * 0.5, 0, HOOP.z + away.z * 0.5);
    const dist = dist2D(start, target);
    const vy = 4.25, tUp = vy / GRAV;
    this.action = { kind: 'dunk', t: 0, phase: 'gather', target, vy, hv: Math.min(dist / tUp, 7.5), dir: _v2.subVectors(target, start).setY(0).normalize().clone() };
    return true;
  }
  startPass(target) {
    if (!this.hasBall || this.busy) return false;
    this.action = { kind: 'pass', t: 0, T: 0.15, target };
    return true;
  }
  startSteal() {
    if (this.busy || this.airborne || this.stealCD > 0 || this.hasBall) return false;
    this.action = { kind: 'steal', t: 0, T: 0.42, resolved: false };
    const f = this.forward(_v1); this.vel.x += f.x * 1.8; this.vel.z += f.z * 1.8;
    this.stealCD = 0.85;
    return true;
  }
  startBlock(kind = 'block') {
    if (this.busy || this.airborne || this.hasBall) return false;
    if (!this.jump(kind === 'block' ? 3.95 : 3.7)) return false;
    this.action = { kind, t: 0 };
    return true;
  }
  startDribbleMove(kind, dirX, dirZ) {
    if (!this.hasBall || this.busy || this.airborne || this.moveCD > 0) return false;
    this.moveCD = 0.45;
    const toHoop = _v1.set(HOOP.x - this.pos.x, 0, HOOP.z - this.pos.z).normalize();
    if (kind === 'stepback') {
      this.action = { kind: 'stepback', t: 0, T: 0.4 };
      this.vel.x = -toHoop.x * 4.6; this.vel.z = -toHoop.z * 4.6;
      this.vy = 1.6; this.airborne = true;
    } else if (kind === 'spin') {
      const side = dirX * toHoop.z - dirZ * toHoop.x >= 0 ? 1 : -1;
      this.action = { kind: 'spin', t: 0, T: 0.5, side, base: this.facing };
      const sx = -toHoop.z * side, sz = toHoop.x * side; // lateral
      this.vel.x = (toHoop.x * 0.6 + sx * 0.8) * 5.4; this.vel.z = (toHoop.z * 0.6 + sz * 0.8) * 5.4;
    } else { // crossover: ball switches hands, burst toward the new side
      const d = this.dribble;
      d.cross = { t: 0, T: 0.3, from: d.side, to: -d.side };
      this.action = { kind: 'cross', t: 0, T: 0.3 };
      let lx = dirX, lz = dirZ;
      if (Math.hypot(lx, lz) < 0.3) { const f = this.forward(_v2); lx = f.z * -d.side; lz = -f.x * -d.side; }
      const m = Math.hypot(lx, lz) || 1;
      this.vel.x = (lx / m) * 5.2; this.vel.z = (lz / m) * 5.2;
    }
    G.onDribbleMove(this, kind);
    return true;
  }
  stumble(T = 0.9) { if (this.airborne) return; this.action = { kind: 'stumble', t: 0, T }; }
  setEmote(kind, T = 1.4) { this.emote = { kind, t: 0, T }; }

  // ── per-frame simulation ──────────────────────────────────────────────────
  update(dt) {
    this.time += dt;
    this.noCatch = Math.max(0, this.noCatch - dt);
    this.stealCD = Math.max(0, this.stealCD - dt);
    this.moveCD = Math.max(0, this.moveCD - dt);
    if (this.emote) { this.emote.t += dt; if (this.emote.t > this.emote.T) this.emote = null; }

    const a = this.action;
    let control = 1, accel = 24;
    const sprinting = this.ctrl.sprint && this.stamina > 0.05 && !a;
    let maxSpeed = (sprinting ? 6.5 : 4.5) * this.r.speed * (this.hasBall ? 0.92 : 1);
    if (this.ctrl.stance === 'defense' && !sprinting) maxSpeed *= 0.92;
    if (this.emote && this.emote.kind === 'dejected') maxSpeed *= 0.5;

    if (a) {
      a.t += dt;
      switch (a.kind) {
        case 'shot': control = 0; this.updateShot(a, dt); break;
        case 'dunk': control = 0; this.updateDunk(a, dt); break;
        case 'pass': control = 0.5; if (a.t >= a.T && this.hasBall) { G.throwPass(this, a.target); this.action = { kind: 'recover', t: 0, T: 0.12 }; } break;
        case 'steal': control = 0.35; if (!a.resolved && a.t >= 0.13) { a.resolved = true; G.resolveSteal(this); } if (a.t >= a.T) this.action = null; break;
        case 'block': case 'rebound': control = 0; if (!this.airborne && a.t > 0.1) this.action = { kind: 'recover', t: 0, T: 0.12 }; break;
        case 'cross': control = 0.25; accel = 10; if (a.t >= a.T) this.action = null; break;
        case 'stepback': control = 0; if (a.t >= a.T && !this.airborne) this.action = null; break;
        case 'spin': control = 0; this.facing = a.base + a.side * Math.PI * 2 * clamp(a.t / a.T, 0, 1); if (a.t >= a.T) { this.action = null; } break;
        case 'stumble': control = 0.15; accel = 6; if (a.t >= a.T) this.action = null; break;
        case 'recover': control = 0.35; if (a.t >= a.T) this.action = null; break;
        default: break;
      }
    }

    // locomotion
    if (!this.airborne) {
      const m = Math.min(1, Math.hypot(this.ctrl.mx, this.ctrl.mz));
      const dx = this.ctrl.mx * maxSpeed * control, dz = this.ctrl.mz * maxSpeed * control;
      const ax = dx - this.vel.x, az = dz - this.vel.z, al = Math.hypot(ax, az);
      const k = (a && control === 0) ? 0 : Math.min(1, (accel * dt) / (al || 1));
      const prevVx = this.vel.x, prevVz = this.vel.z;
      this.vel.x += ax * k; this.vel.z += az * k;
      if (a && (a.kind === 'stepback' || a.kind === 'spin')) { this.vel.multiplyScalar(Math.max(0, 1 - 2.5 * dt)); }
      if (a && a.kind === 'shot' && !a.jumped && a.type !== 'layup') this.vel.multiplyScalar(Math.max(0, 1 - 18 * dt));
      // sneaker squeaks on sharp cuts
      const ps = Math.hypot(prevVx, prevVz);
      if (ps > 3 && m > 0.5 && (prevVx * dx + prevVz * dz) < 0) Sound.squeak();
      if (sprinting && m > 0.3) this.stamina = Math.max(0, this.stamina - dt * 0.2);
      else this.stamina = Math.min(1, this.stamina + dt * 0.14);
    }
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.pos.x = clamp(this.pos.x, -WORLD.x + 0.4, WORLD.x - 0.4);
    this.pos.z = clamp(this.pos.z, WORLD.zMin + 0.4, WORLD.zMax - 0.4);
    // no walking through the stanchion
    const pdx = this.pos.x - POLE.x, pdz = this.pos.z - POLE.z, pd = Math.hypot(pdx, pdz);
    if (pd < 0.55 && pd > 1e-4) { this.pos.x = POLE.x + (pdx / pd) * 0.55; this.pos.z = POLE.z + (pdz / pd) * 0.55; }

    // vertical
    if (this.airborne) {
      if (!(a && a.kind === 'dunk' && a.phase === 'hang')) {
        this.jumpY += this.vy * dt; this.vy -= GRAV * dt;
      }
      if (this.jumpY <= 0) {
        this.jumpY = 0; this.vy = 0; this.airborne = false;
        if (!this.action) this.action = { kind: 'recover', t: 0, T: 0.08 };
      }
    }

    // facing
    let want = null;
    if (a && (a.kind === 'shot' || a.kind === 'dunk')) want = Math.atan2(HOOP.x - this.pos.x, HOOP.z - this.pos.z);
    else if (a && a.kind === 'pass' && a.target) want = Math.atan2(a.target.pos.x - this.pos.x, a.target.pos.z - this.pos.z);
    else if (a && a.kind === 'spin') want = null;
    else if (this.ctrl.face) want = Math.atan2(this.ctrl.face.x - this.pos.x, this.ctrl.face.z - this.pos.z);
    else if (this.speed > 0.7) want = Math.atan2(this.vel.x, this.vel.z);
    else if (this.hasBall) want = Math.atan2(HOOP.x - this.pos.x, HOOP.z - this.pos.z);
    if (want !== null && !(a && a.kind === 'spin')) this.facing = dampAngle(this.facing, want, a && a.kind === 'shot' ? 18 : 11, dt);

    this.animate(dt);
    this.root.position.set(this.pos.x, this.jumpY + this.bob, this.pos.z);
    this.root.rotation.y = this.facing;
    this.root.updateMatrixWorld(true);
    this.blob.position.set(this.pos.x, 0.011, this.pos.z);
    this.blob.scale.setScalar(1 - Math.min(0.5, this.jumpY * 0.5));
    this.ring.position.set(this.pos.x, 0.013, this.pos.z);
  }

  updateShot(a, dt) {
    if (!a.jumped && a.t >= a.gather) {
      a.jumped = true;
      this.jump(SHOT.JUMP[a.type]);
      if (a.type === 'fade') { this.vel.x = -a.dir.x * 1.7; this.vel.z = -a.dir.z * 1.7; }
      else if (a.type === 'jumper') { this.vel.x *= 0.25; this.vel.z *= 0.25; }
      else if (a.type === 'layup') { this.vel.x = a.glide.x; this.vel.z = a.glide.z; }
    }
    if (!a.released) {
      const m = a.t / a.T;
      if (a.aiRelease !== null && m >= a.aiRelease) this.releaseShot();
      else if (m >= 1.15) this.releaseShot(); // held too long: forced, very late
    } else if (!this.airborne && a.jumped) {
      this.action = { kind: 'recover', t: 0, T: 0.18 };
    }
  }

  updateDunk(a, dt) {
    if (a.phase === 'gather') {
      this.vel.x = a.dir.x * Math.min(a.hv, 5); this.vel.z = a.dir.z * Math.min(a.hv, 5);
      if (a.t > 0.12) {
        a.phase = 'rise'; a.t = 0;
        this.vy = a.vy; this.airborne = true;
        this.vel.x = a.dir.x * a.hv; this.vel.z = a.dir.z * a.hv;
      }
    } else if (a.phase === 'rise') {
      const left = dist2D(this.pos, a.target);
      if (left < 0.12 || this.vy <= 0.15) { this.vel.x *= 0.1; this.vel.z *= 0.1; }
      if (this.vy <= 0.05) { a.phase = 'slam'; a.t = 0; G.slamDunk(this); }
    } else if (a.phase === 'slam') {
      this.vel.set(0, 0, 0);
      if (a.t > 0.05) { a.phase = 'hang'; a.t = 0; }
    } else if (a.phase === 'hang') {
      this.vel.set(0, 0, 0);
      if (a.t > 0.32) { a.phase = 'drop'; this.vy = -0.5; }
    } else if (a.phase === 'drop') {
      if (!this.airborne) this.action = { kind: 'recover', t: 0, T: 0.25 };
    }
  }

  // ── procedural animation ──────────────────────────────────────────────────
  animate(dt) {
    const P = {}; Player.JOINTS.forEach((j) => (P[j] = 0));
    const a = this.action, sp = this.speed, t = this.time;
    const run = clamp(sp / 6.3, 0, 1);
    this.runPhase += dt * (sp * 2.25 + (this.ctrl.stance === 'defense' ? sp * 1.2 : 0));
    const ph = this.runPhase;
    let bob = 0;
    // base: idle / run cycle
    P.crouch = 0.03 + Math.sin(t * 2) * 0.01;
    P.kneeL = P.kneeR = 0.18; P.hipLx = P.hipRx = -0.08;
    P.shLz = 0.12; P.shRz = -0.12; P.elL = P.elR = -0.35;
    if (sp > 0.2) {
      const s = Math.sin(ph), c = Math.cos(ph);
      P.hipLx = -s * 0.95 * run - 0.1; P.hipRx = s * 0.95 * run - 0.1;
      P.kneeL = 0.2 + run * 1.25 * Math.max(0, c); P.kneeR = 0.2 + run * 1.25 * Math.max(0, -c);
      P.shLx = s * 0.9 * run; P.shRx = -s * 0.9 * run;
      P.elL = P.elR = -0.5 - 0.9 * run;
      P.lean = 0.06 + 0.2 * run;
      bob = Math.abs(Math.sin(ph)) * 0.05 * run;
    }
    // defensive stance
    if (this.ctrl.stance === 'defense' && !a && !this.airborne) {
      P.crouch = 0.16; P.lean = 0.32;
      P.hipLz = 0.22; P.hipRz = -0.22; P.kneeL = P.kneeR = 0.75; P.hipLx = P.hipRx = -0.45;
      if (sp > 0.3) { const s = Math.sin(ph * 1.4); P.hipLz += s * 0.12; P.hipRz += s * 0.12; }
      P.shLz = 0.95; P.shRz = -0.95; P.shLx = P.shRx = -0.55; P.elL = P.elR = -0.55;
    }
    // ball handling (dribble arm + off-arm protecting)
    if (this.hasBall && !a) {
      const d = this.dribble, ds = d.side > 0 ? 'L' : 'R', os = d.side > 0 ? 'R' : 'L';
      const push = 0.5 + 0.5 * Math.cos(d.phase * Math.PI * 2); // 1 at hand
      P['sh' + ds + 'x'] = -0.55 - 0.2 * push - run * 0.2; P['sh' + ds + 'z'] = d.side * 0.25;
      P['el' + ds] = -0.25 - 0.85 * push;
      P['sh' + os + 'x'] = -0.75; P['sh' + os + 'z'] = -d.side * 0.35; P['el' + os] = -1.1;
      P.crouch = Math.max(P.crouch, 0.08); P.lean = Math.max(P.lean || 0, 0.18);
      P.kneeL = Math.max(P.kneeL, 0.4); P.kneeR = Math.max(P.kneeR, 0.4);
    }
    if (a) {
      const k = a.t / (a.T || 1);
      switch (a.kind) {
        case 'shot': {
          const air = this.airborne;
          if (!a.jumped) { P.crouch = 0.2; P.kneeL = P.kneeR = 0.9; P.hipLx = P.hipRx = -0.5; P.lean = 0.15; P.shLx = P.shRx = -1.3; P.elL = P.elR = -1.7; }
          else {
            P.kneeL = P.kneeR = 0.25; P.hipLx = P.hipRx = -0.12;
            if (a.type === 'layup') {
              P.hipLx = -1.25; P.kneeL = 1.5;
              P.shRx = a.released ? -2.95 : -2.6; P.elR = a.released ? -0.15 : -0.8; P.shLx = -1.2; P.elL = -0.9;
            } else {
              P.shLx = P.shRx = a.released ? -2.75 : -2.55; P.shLz = -0.12; P.shRz = 0.12;
              P.elL = P.elR = a.released ? -0.2 : -1.6;
              if (a.type === 'fade') { P.lean = -0.28; P.hipLx = -0.6; P.kneeL = 0.9; }
            }
          }
          if (!air && a.released) { P.shLx = P.shRx = -2.2; P.elL = P.elR = -0.3; }
          break;
        }
        case 'dunk':
          if (a.phase === 'gather') { P.crouch = 0.22; P.kneeL = P.kneeR = 1.0; P.hipLx = P.hipRx = -0.6; P.shRx = -1.2; P.elR = -1.2; }
          else if (a.phase === 'rise') { P.shRx = -3.0; P.elR = -0.5; P.shLx = -1.6; P.hipLx = -1.1; P.kneeL = 1.4; P.kneeR = 0.4; }
          else if (a.phase === 'slam' || a.phase === 'hang') { P.shRx = P.shLx = -3.05; P.elR = P.elL = -0.15; P.kneeL = P.kneeR = 0.7; P.hipLx = P.hipRx = -0.35; }
          else { P.shRx = P.shLx = -2.4; P.kneeL = P.kneeR = 0.5; }
          break;
        case 'pass': P.shLx = P.shRx = -1.45; P.shLz = -0.25; P.shRz = 0.25; P.elL = P.elR = lerp(-1.7, -0.1, clamp(k, 0, 1)); P.lean = 0.2; break;
        case 'steal': P.shRx = -1.35; P.elR = -0.1; P.shRz = 0.25; P.lean = 0.55; P.crouch = 0.17; P.kneeL = P.kneeR = 0.85; P.hipLx = -0.7; break;
        case 'block': case 'rebound':
          P.shLx = P.shRx = -3.05; P.shLz = 0.1; P.shRz = -0.1; P.elL = P.elR = -0.1;
          P.kneeL = P.kneeR = 0.5; P.hipLx = P.hipRx = -0.3; break;
        case 'stepback': P.lean = -0.2; P.kneeL = P.kneeR = 0.7; P.hipLx = -0.4; P.hipRx = 0.2; break;
        case 'spin': P.crouch = 0.12; P.lean = 0.3; P.kneeL = P.kneeR = 0.7; P.shLz = 0.6; P.shRz = -0.6; break;
        case 'cross': P.crouch = 0.14; P.lean = 0.3; P.kneeL = P.kneeR = 0.75; break;
        case 'stumble': P.lean = -0.35; P.shLz = 1.4 + Math.sin(t * 20) * 0.4; P.shRz = -1.4 + Math.sin(t * 17) * 0.4; P.kneeL = 0.9; P.kneeR = 0.2; P.crouch = 0.12; break;
        case 'recover': P.crouch = 0.12; P.kneeL = P.kneeR = 0.7; P.hipLx = P.hipRx = -0.4; break;
        default: break;
      }
    }
    if (this.airborne && !a) { P.kneeL = P.kneeR = 0.6; P.hipLx = P.hipRx = -0.4; }
    if (this.emote && !a) {
      const e = this.emote;
      if (e.kind === 'celebrate') { P.shLx = P.shRx = -2.85 + Math.sin(t * 12) * 0.25; P.shLz = 0.35; P.shRz = -0.35; P.elL = P.elR = -0.5; P.headX = -0.25; }
      else if (e.kind === 'flex') { P.shLz = 1.5; P.shRz = -1.5; P.elL = P.elR = -2.1; P.shLx = P.shRx = -0.2; P.crouch = 0.12; P.kneeL = P.kneeR = 0.6; }
      else if (e.kind === 'dejected') { P.headX = 0.55; P.lean = 0.25; P.shLz = 0.05; P.shRz = -0.05; P.elL = P.elR = -0.1; }
      else if (e.kind === 'clap') { P.shLx = P.shRx = -1.25; P.shLz = -0.35 + Math.abs(Math.sin(t * 9)) * 0.3; P.shRz = -P.shLz; P.elL = P.elR = -0.9; }
    }
    this.bob = bob;
    // smooth toward targets
    const rate = 22;
    const S = this.pose;
    for (const j of Player.JOINTS) S[j] = damp(S[j], P[j] || 0, rate, dt);
    const J = this.j;
    J.hips.position.y = 0.98 - S.crouch;
    J.torso.rotation.x = S.lean;
    J.head.rotation.x = S.headX - S.lean * 0.6;
    J.shL.rotation.set(S.shLx, 0, S.shLz); J.shR.rotation.set(S.shRx, 0, S.shRz);
    J.elL.rotation.x = S.elL; J.elR.rotation.x = S.elR;
    J.hipL.rotation.set(S.hipLx, 0, S.hipLz); J.hipR.rotation.set(S.hipRx, 0, S.hipRz);
    J.knL.rotation.x = S.kneeL; J.knR.rotation.x = S.kneeR;
    J.anL.rotation.x = -S.kneeL * 0.35 - S.hipLx * 0.3; J.anR.rotation.x = -S.kneeR * 0.35 - S.hipRx * 0.3;
  }

  // Where the ball should be while this player owns it (world space).
  ballAnchor(out, dt) {
    const a = this.action;
    const f = this.forward(_v3);
    if (a && (a.kind === 'shot' || a.kind === 'pass')) {
      if (a.kind === 'shot' && a.type === 'layup' && a.jumped) { this.handPos(-1, out); out.y += 0.1; out.addScaledVector(f, 0.04); return out; }
      this.handPos(1, this._handL); this.handPos(-1, this._handR);
      out.addVectors(this._handL, this._handR).multiplyScalar(0.5).addScaledVector(f, 0.1); out.y += 0.06;
      return out;
    }
    if (a && a.kind === 'dunk') { this.handPos(-1, out); out.y += 0.12; out.addScaledVector(f, 0.03); return out; }
    if (a && a.kind === 'spin') { this.handPos(-this.dribble.side, out); out.addScaledVector(f, 0.05); return out; }
    // dribbling
    const d = this.dribble;
    const freq = 1.7 + this.speed * 0.22;
    const prevPhase = d.phase;
    d.phase = (d.phase + dt * freq) % 1;
    if (prevPhase < 0.5 && d.phase >= 0.5) Sound.bounce(2.2 + this.speed * 0.4);
    const right = _v4.set(f.z, 0, -f.x); // local +x in world space
    if (d.cross) {
      d.cross.t += dt;
      const k = clamp(d.cross.t / d.cross.T, 0, 1);
      const side = lerp(d.cross.from, d.cross.to, k);
      out.copy(this.pos).addScaledVector(right, side * 0.3 * this.scale).addScaledVector(f, 0.42);
      out.y = BALL_R + Math.abs(Math.cos(k * Math.PI)) * 0.55;
      if (k >= 0.5 && !d.cross.bounced) { d.cross.bounced = true; Sound.bounce(3); }
      if (k >= 1) { d.side = d.cross.to; d.cross = null; d.phase = 0.05; }
      return out;
    }
    this.handPos(d.side, this._handL);
    const lead = 0.12 + this.speed * 0.07;
    _v2.copy(this.pos).addScaledVector(right, d.side * 0.33 * this.scale).addScaledVector(f, 0.22 + lead);
    _v2.y = BALL_R;
    const top = this._handL; top.y -= 0.07;
    const u = Math.abs(Math.cos(d.phase * Math.PI));
    out.lerpVectors(_v2, top, u);
    return out;
  }
}
Player.JOINTS = ['crouch', 'lean', 'headX', 'shLx', 'shLz', 'shRx', 'shRz', 'elL', 'elR', 'hipLx', 'hipLz', 'hipRx', 'hipRz', 'kneeL', 'kneeR'];
