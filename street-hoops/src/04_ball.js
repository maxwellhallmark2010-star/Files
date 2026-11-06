// ─────────────────────────────────────────────────────────────────────────────
// Ball: rigid sphere with exact constant-gravity integration (so an aimed shot
// lands exactly where it was aimed), sub-stepped collisions against the floor,
// rim torus, backboard box, pole and the fence. Score detection: the ball's
// centre must cross the rim plane downward inside the ring.
// Modes: held (a player owns it) | flight (shot / pass in the air) |
//        loose (free physics) | dead (after a score / whistle, untouchable)
// ─────────────────────────────────────────────────────────────────────────────
class Ball {
  constructor(scene, tex) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.0, emissive: 0xff5a00, emissiveIntensity: 0 }));
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    // blob shadow (always on — it doubles as a depth cue for the ball's height)
    const c = makeCanvas(64, 64), g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.renderOrder = 1; scene.add(this.blob);
    // trail for shots ("on fire" in the shooting challenge)
    this.trail = []; const tg = new THREE.SphereGeometry(BALL_R * 0.9, 8, 6);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      scene.add(m); this.trail.push(m);
    }
    this.trailOn = false; this.trailT = 0; this.trailIdx = 0;

    this.pos = new THREE.Vector3(0, 1, 6);
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.prevPos = new THREE.Vector3().copy(this.pos);
    this.mode = 'loose';
    this.holder = null;
    this.meta = null;          // flight info: {kind:'shot'|'pass', shooter, team, ...}
    this.lastTouch = null;     // last player to touch it
    this.events = [];          // collected each frame, consumed by the game
    this.touchedRim = false; this.touchedBoard = false;
    this.scored = false; this.upThroughT = -10; this.time = 0;
    this.floorBounces = 0;
    this._q = new THREE.Quaternion(); this._ax = new THREE.Vector3();
  }

  setHeld(player) {
    this.mode = 'held'; this.holder = player; this.lastTouch = player; this.meta = null;
    this.touchedRim = this.touchedBoard = false; this.scored = false; this.floorBounces = 0;
  }
  release(mode, vel, meta) {
    this.mode = mode; this.holder = null; this.meta = meta || null;
    this.vel.copy(vel);
    this.touchedRim = this.touchedBoard = false; this.scored = false; this.floorBounces = 0;
  }
  // position driven by a player's hands this frame
  placeHeld(p, dt) {
    this.vel.subVectors(p, this.pos).divideScalar(Math.max(dt, 1e-4));
    if (this.vel.lengthSq() > 400) this.vel.setLength(20);
    this.pos.copy(p);
  }

  update(dt) {
    this.time += dt;
    this.prevPos.copy(this.pos);
    if (this.mode !== 'held') {
      const speed = this.vel.length();
      const n = clamp(Math.ceil((speed * dt) / 0.025), 1, 12);
      const h = dt / n;
      for (let i = 0; i < n; i++) this.step(h);
    }
    // visual spin
    if (this.mode === 'held') {
      // dribbling: roll with motion
      this.spin.set(this.vel.z, 0, -this.vel.x).multiplyScalar(1 / BALL_R * 0.6);
    } else if (this.pos.y <= BALL_R + 0.002) {
      this.spin.set(this.vel.z, 0, -this.vel.x).multiplyScalar(1 / BALL_R);
    }
    const w = this.spin.length();
    if (w > 1e-3) { this._q.setFromAxisAngle(this._ax.copy(this.spin).divideScalar(w), w * dt); this.mesh.quaternion.premultiply(this._q); }
    this.mesh.position.copy(this.pos);
    this.blob.position.set(this.pos.x, 0.012, this.pos.z);
    const hh = clamp(this.pos.y / 3.5, 0, 1);
    this.blob.scale.setScalar(0.9 + hh * 0.9); this.blob.material.opacity = 1 - hh * 0.7;
    this.updateTrail(dt);
  }

  step(h) {
    const p = this.pos, v = this.vel;
    const prevY = p.y;
    // exact integration under gravity
    p.x += v.x * h; p.z += v.z * h; p.y += v.y * h - 0.5 * GRAV * h * h;
    v.y -= GRAV * h;

    // floor
    if (p.y < BALL_R) {
      p.y = BALL_R;
      if (v.y < 0) {
        const impact = -v.y;
        if (impact > 0.45) {
          v.y = impact * 0.76; v.x *= 0.9; v.z *= 0.9;
          this.floorBounces++;
          this.events.push({ type: 'floor', v: impact });
        } else v.y = 0;
      }
      const f = Math.max(0, 1 - 0.9 * h); v.x *= f; v.z *= f; // rolling resistance
    }
    // rim (torus): closest point on the ring's centre circle
    const Rc = RIM_R + RIM_TUBE, dx = p.x - HOOP.x, dz = p.z - HOOP.z;
    const hd = Math.sqrt(dx * dx + dz * dz);
    if (Math.abs(p.y - HOOP.y) < BALL_R + 0.05 && hd > Rc - BALL_R - 0.05 && hd < Rc + BALL_R + 0.05) {
      const ux = hd > 1e-5 ? dx / hd : 1, uz = hd > 1e-5 ? dz / hd : 0;
      const cx = HOOP.x + ux * Rc, cz = HOOP.z + uz * Rc;
      _v1.set(p.x - cx, p.y - HOOP.y, p.z - cz);
      const d = _v1.length(), minD = BALL_R + RIM_TUBE;
      if (d < minD && d > 1e-6) {
        _v1.divideScalar(d);
        p.addScaledVector(_v1, minD - d);
        const vn = v.dot(_v1);
        if (vn < 0) {
          v.addScaledVector(_v1, -vn * (1 + 0.52));        // restitution 0.52
          _v2.copy(_v1).multiplyScalar(v.dot(_v1));        // keep normal part,
          _v3.subVectors(v, _v2).multiplyScalar(0.86);     // damp tangential part
          v.copy(_v2).add(_v3);
          this.touchedRim = true;
          this.events.push({ type: 'rim', v: -vn });
        }
      }
    }
    // backboard (axis-aligned box)
    const qx = clamp(p.x, BOARD.x0, BOARD.x1), qy = clamp(p.y, BOARD.y0, BOARD.y1), qz = clamp(p.z, BOARD.z0, BOARD.z1);
    _v1.set(p.x - qx, p.y - qy, p.z - qz);
    let d = _v1.length();
    if (d < BALL_R) {
      if (d < 1e-6) { _v1.set(0, 0, 1); d = 0; } else _v1.divideScalar(d);
      p.addScaledVector(_v1, BALL_R - d);
      const vn = v.dot(_v1);
      if (vn < 0) {
        v.addScaledVector(_v1, -vn * 1.6); // restitution 0.6
        v.x *= 0.92; v.y *= 0.92;
        this.touchedBoard = true;
        this.events.push({ type: 'board', v: -vn });
      }
    }
    // stanchion pole + board mount (vertical cylinder)
    if (p.y < POLE.h + 0.1) {
      const px = p.x - POLE.x, pz = p.z - POLE.z, pd = Math.hypot(px, pz), md = POLE.r + BALL_R + (p.y < 1.6 ? 0.09 : 0);
      if (pd < md && pd > 1e-6) {
        const nx = px / pd, nz = pz / pd; p.x = POLE.x + nx * md; p.z = POLE.z + nz * md;
        const vn = v.x * nx + v.z * nz; if (vn < 0) { v.x -= 1.5 * vn * nx; v.z -= 1.5 * vn * nz; this.events.push({ type: 'pole', v: -vn }); }
      }
    }
    // net drag: the ball slows a little and centres as it falls through
    if (p.y < HOOP.y && p.y > HOOP.y - 0.45 && hd < RIM_R) {
      const k = Math.max(0, 1 - 2.2 * h);
      v.x *= k; v.z *= k; if (v.y < 0) v.y *= Math.max(0, 1 - 1.2 * h);
      v.x -= dx * 6 * h; v.z -= dz * 6 * h;
    }
    // fence walls
    if (Math.abs(p.x) > WORLD.x - BALL_R) { p.x = Math.sign(p.x) * (WORLD.x - BALL_R); v.x *= -0.45; this.events.push({ type: 'fence', v: 1 }); }
    if (p.z < WORLD.zMin + BALL_R) { p.z = WORLD.zMin + BALL_R; v.z *= -0.45; this.events.push({ type: 'fence', v: 1 }); }
    if (p.z > WORLD.zMax) { p.z = WORLD.zMax; v.z *= -0.45; }

    // scoring
    if (prevY >= HOOP.y && p.y < HOOP.y && hd < RIM_R && v.y < 0) {
      if (!this.scored && this.time - this.upThroughT > 1.2) {
        this.scored = true;
        this.events.push({ type: 'score', swish: !this.touchedRim && !this.touchedBoard, meta: this.meta });
      }
    } else if (prevY < HOOP.y && p.y >= HOOP.y && hd < RIM_R + 0.05) {
      this.upThroughT = this.time; // came up from underneath: not a basket
    }
  }

  updateTrail(dt) {
    this.trailT -= dt;
    if (this.trailOn && this.mode !== 'held' && this.trailT <= 0) {
      this.trailT = 0.025;
      const m = this.trail[this.trailIdx++ % this.trail.length];
      m.position.copy(this.pos); m.material.opacity = 0.55; m.scale.setScalar(1);
    }
    for (const m of this.trail) {
      if (m.material.opacity > 0) { m.material.opacity = Math.max(0, m.material.opacity - dt * 2.2); m.scale.multiplyScalar(1 - dt * 1.5); }
    }
    this.mesh.material.emissiveIntensity = damp(this.mesh.material.emissiveIntensity, this.trailOn ? 0.45 : 0, 6, dt);
  }

  // Predict where the ball can be grabbed: first point (after `minT`) where it
  // is descending through `height`, or where it lands. Ignores rim contacts.
  predict(height, out) {
    let px = this.pos.x, py = this.pos.y, pz = this.pos.z, vy = this.vel.y;
    const h = 0.04;
    for (let t = 0; t < 2.5; t += h) {
      px += this.vel.x * h; pz += this.vel.z * h; py += vy * h; vy -= GRAV * h;
      if ((vy < 0 && py <= height) || py <= BALL_R) { out.set(px, Math.max(py, BALL_R), pz); return t; }
    }
    out.set(px, Math.max(py, BALL_R), pz); return 2.5;
  }
}
