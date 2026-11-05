// ============================================================================
//  CHARACTERS — point skeleton, procedural anim, IK, active ragdoll, rendering
// ============================================================================
const J = { HEAD: 0, NECK: 1, PELV: 2, LSH: 3, LEL: 4, LHA: 5, RSH: 6, REL: 7, RHA: 8, LHIP: 9, LKN: 10, LFT: 11, RHIP: 12, RKN: 13, RFT: 14 };
const NJ = 15;
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x6b4226, 0xffdbac, 0xd9a066];
const SHIRTS = [0xffffff, 0x1d1d1d, 0xc0392b, 0x2e86de, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xe67e22, 0x7f8c8d, 0x16a085, 0xd35400, 0x2c3e50, 0xe84393, 0x6c5ce7, 0xb2bec3];
const PANTS = [0x2b3a67, 0x1f2a48, 0xb59f6a, 0x1e1e1e, 0x55595e, 0x6b4f2a, 0x3b4a2a, 0xdedede];
const SHOES = [0x111111, 0xf2f2f2, 0x5a3a20, 0x333333, 0x8a1a1a];
const HAIRS = [0x111111, 0x2a1a0e, 0x3b2314, 0x7a4b23, 0xd9b26a, 0x888888, 0x1a1a1a];
const CHAR_MAX = 110, PARTS = 14;
const chars = [];
let charMesh = null;
function randomColors() { return { skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), shoes: pick(SHOES), hair: pick(HAIRS) }; }
function initCharRender() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  charMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, CHAR_MAX * PARTS);
  charMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < CHAR_MAX * PARTS; i++) charMesh.setColorAt(i, _col.setHex(0xffffff));
  charMesh.castShadow = true; charMesh.receiveShadow = false; charMesh.frustumCulled = false; charMesh.count = 0;
  scene.add(charMesh);
  computeRest();
}

// ---------------------------------------------------------------- IK
const _ikD = new V3(), _ikP = new V3();
function ik2(S, T, a, b, pole, outE, outH) {
  _ikD.subVectors(T, S); let d = _ikD.length();
  const maxd = (a + b) * 0.995; if (d > maxd) { _ikD.multiplyScalar(maxd / d); d = maxd; }
  if (d < 0.06) { _ikD.set(0, -0.06, 0); d = 0.06; }
  const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
  _ikD.multiplyScalar(1 / d);
  _ikP.copy(pole).addScaledVector(_ikD, -pole.dot(_ikD)); if (_ikP.lengthSq() < 1e-6) _ikP.set(0, -1, 0); _ikP.normalize();
  outE.copy(S).addScaledVector(_ikD, x).addScaledVector(_ikP, h);
  outH.copy(S).addScaledVector(_ikD, d);
}

// ---------------------------------------------------------------- local poses (character faces +Z, +X is its left)
function poseLocomotion(a, L) {
  const sp = a.speed, ph = a.phase;
  const walkK = clamp(sp / 1.4, 0, 1), runK = clamp((sp - 2.6) / 2.6, 0, 1);
  const amp = walkK * (0.42 + 0.38 * runK);
  const bob = Math.abs(Math.cos(ph)) * 0.045 * walkK * (1 + runK);
  const crouch = a.crouch || 0;
  const dance = a.dance || 0;
  const py = 0.95 - bob * 0.6 - crouch * 0.36 - dance * Math.abs(Math.sin(a.t * 5)) * 0.08;
  const lean = runK * 0.16 + (a.lean || 0) + crouch * 0.25;
  const jk = a.jerk;
  L[J.PELV].set(0, py, 0);
  L[J.NECK].set(jk.x, py + 0.52 * Math.cos(lean) + jk.y, 0.52 * Math.sin(lean) + jk.z);
  L[J.HEAD].set(jk.x * 1.4, L[J.NECK].y + 0.21, L[J.NECK].z + 0.03 + jk.z * 0.5);
  const tw = Math.sin(ph) * 0.06 * walkK;
  L[J.LSH].set(0.2, L[J.NECK].y - 0.05, L[J.NECK].z - tw);
  L[J.RSH].set(-0.2, L[J.NECK].y - 0.05, L[J.NECK].z + tw);
  L[J.LHIP].set(0.1, py - 0.04, 0); L[J.RHIP].set(-0.1, py - 0.04, 0);
  for (const s of [1, -1]) {
    const hip = L[s > 0 ? J.LHIP : J.RHIP], kn = L[s > 0 ? J.LKN : J.RKN], ft = L[s > 0 ? J.LFT : J.RFT];
    const p = ph + (s > 0 ? 0 : Math.PI);
    const th = Math.sin(p) * amp + crouch * 0.95 + (a.stagger || 0) * 0.3 * s;
    const kb = Math.max(0, Math.sin(p + 1.3)) * amp * 1.5 + crouch * 1.95 + 0.04;
    kn.set(hip.x + s * crouch * 0.05, hip.y - 0.45 * Math.cos(th), hip.z + 0.45 * Math.sin(th));
    ft.set(hip.x + s * crouch * 0.04, kn.y - 0.45 * Math.cos(th - kb), kn.z + 0.45 * Math.sin(th - kb));
    if (ft.y < 0.07) ft.y = 0.07;
    const sh = L[s > 0 ? J.LSH : J.RSH], el = L[s > 0 ? J.LEL : J.REL], ha = L[s > 0 ? J.LHA : J.RHA];
    let sw = -Math.sin(p) * amp * 0.9, eb = 0.25 + runK * 1.1 + walkK * 0.15, out = 0.04;
    if (dance > 0) { sw = 2.2 + Math.sin(a.t * 6 + s) * 0.5; eb = 0.8 + Math.sin(a.t * 6) * 0.4; out = 0.15; }
    el.set(sh.x + s * out, sh.y - 0.29 * Math.cos(sw), sh.z + 0.29 * Math.sin(sw));
    ha.set(el.x + s * 0.01, el.y - 0.27 * Math.cos(sw + eb), el.z + 0.27 * Math.sin(sw + eb));
  }
}
function poseSit(a, L, kind) {
  L[J.PELV].set(0, 0, 0);
  const lb = (kind === 'bike' ? -0.15 : 0.12) - (a.slump ? 0.55 : 0); // lean back (+) / forward (-)
  L[J.NECK].set(a.slump ? 0.08 : 0, 0.53 * Math.cos(lb), -0.53 * Math.sin(lb));
  L[J.HEAD].set(a.slump ? 0.14 : 0, L[J.NECK].y + (a.slump ? 0.12 : 0.21), L[J.NECK].z + (a.slump ? 0.14 : 0.03));
  L[J.LSH].set(0.2, L[J.NECK].y - 0.05, L[J.NECK].z); L[J.RSH].set(-0.2, L[J.NECK].y - 0.05, L[J.NECK].z);
  L[J.LHIP].set(0.1, -0.02, 0); L[J.RHIP].set(-0.1, -0.02, 0);
  if (kind === 'bike') {
    L[J.LKN].set(0.2, 0.0, 0.42); L[J.RKN].set(-0.2, 0.0, 0.42);
    L[J.LFT].set(0.2, -0.42, 0.32); L[J.RFT].set(-0.2, -0.42, 0.32);
  } else if (kind === 'bench') {
    L[J.LKN].set(0.12, 0.02, 0.45); L[J.RKN].set(-0.12, 0.02, 0.45);
    L[J.LFT].set(0.13, -0.38, 0.52); L[J.RFT].set(-0.13, -0.38, 0.52);
  } else {
    L[J.LKN].set(0.12, 0.08, 0.45); L[J.RKN].set(-0.12, 0.08, 0.45);
    L[J.LFT].set(0.13, -0.3, 0.62); L[J.RFT].set(-0.13, -0.3, 0.62);
  }
  for (const s of [1, -1]) {
    const sh = L[s > 0 ? J.LSH : J.RSH];
    L[s > 0 ? J.LEL : J.REL].set(sh.x + s * 0.03, sh.y - 0.27, sh.z + 0.1);
    L[s > 0 ? J.LHA : J.RHA].set(sh.x + s * 0.02, sh.y - 0.33, sh.z + 0.36);
  }
}

// ---------------------------------------------------------------- ragdoll
const RD_PAIRS = [[J.HEAD, J.NECK], [J.NECK, J.LSH], [J.NECK, J.RSH], [J.LSH, J.RSH], [J.NECK, J.PELV], [J.LSH, J.PELV], [J.RSH, J.PELV], [J.PELV, J.LHIP], [J.PELV, J.RHIP], [J.LHIP, J.RHIP], [J.LSH, J.LHIP], [J.RSH, J.RHIP], [J.LSH, J.RHIP], [J.RSH, J.LHIP], [J.LSH, J.LEL], [J.LEL, J.LHA], [J.RSH, J.REL], [J.REL, J.RHA], [J.LHIP, J.LKN], [J.LKN, J.LFT], [J.RHIP, J.RKN], [J.RKN, J.RFT], [J.HEAD, J.LSH], [J.HEAD, J.RSH]];
const RD_STIFF = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.8, 0.8, 0.8, 0.8, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0.5];
const RD_MIN = [[J.LSH, J.LHA, 0.22], [J.RSH, J.RHA, 0.22], [J.LHIP, J.LFT, 0.42], [J.RHIP, J.RFT, 0.42], [J.HEAD, J.PELV, 0.6], [J.LKN, J.RKN, 0.12], [J.LFT, J.RFT, 0.1], [J.HEAD, J.LHA, 0.14], [J.HEAD, J.RHA, 0.14], [J.LFT, J.NECK, 0.45], [J.RFT, J.NECK, 0.45]];
let RD_REST = null;
function computeRest() {
  const L = Array.from({ length: NJ }, () => new V3());
  poseLocomotion({ speed: 0, phase: 0, jerk: new V3(), t: 0 }, L);
  RD_REST = RD_PAIRS.map(([a, b]) => L[a].distanceTo(L[b]));
}
const RD_DT = 1 / 60;
const _rv = new V3(), _rv2 = new V3();
class Ragdoll {
  constructor(joints, vel, spin = 1) {
    this.p = joints.map(j => j.clone());
    this.o = joints.map((j, i) => {
      const o = j.clone().addScaledVector(vel, -RD_DT);
      o.x += rand(-1, 1) * spin * RD_DT * (i === J.HEAD ? 2 : 1); o.y += rand(-0.5, 0.5) * spin * RD_DT; o.z += rand(-1, 1) * spin * RD_DT;
      return o;
    });
    this.age = 0; this.restT = 0; this.acc = 0; this.speed = 99; this.onGround = false; this.flail = rand(1.5, 3.2);
    this.seed = Math.random() * 100; this.writhe = rand(1.5, 4);
  }
  impulse(idx, v, spread = 0.4) {
    this.o[idx].addScaledVector(v, -RD_DT);
    if (spread > 0) for (const [a, b] of RD_PAIRS) { if (a === idx) this.o[b].addScaledVector(v, -RD_DT * spread); else if (b === idx) this.o[a].addScaledVector(v, -RD_DT * spread); }
  }
  impulseAll(v) { for (const o of this.o) o.addScaledVector(v, -RD_DT); }
  update(dt, alive) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= RD_DT) { this.acc -= RD_DT; this.step(RD_DT, alive); }
  }
  step(dt, alive) {
    this.age += dt;
    const P = this.p, O = this.o, g = -9.8 * dt * dt;
    let spd = 0;
    for (let i = 0; i < NJ; i++) {
      const p = P[i], o = O[i];
      const vx = (p.x - o.x) * 0.996, vy = (p.y - o.y) * 0.996, vz = (p.z - o.z) * 0.996;
      spd += Math.abs(vx) + Math.abs(vy) + Math.abs(vz);
      o.copy(p); p.x += vx; p.y += vy + g; p.z += vz;
    }
    this.speed = spd / NJ / dt;
    if (alive) this.behave(dt);
    let grounded = 0;
    for (let it = 0; it < 6; it++) {
      for (let c = 0; c < RD_PAIRS.length; c++) {
        const [a, b] = RD_PAIRS[c], pa = P[a], pb = P[b];
        _rv.subVectors(pb, pa); const d = _rv.length() || 1e-6, rest = RD_REST[c];
        const k = (d - rest) / d * 0.5 * RD_STIFF[c];
        pa.addScaledVector(_rv, k); pb.addScaledVector(_rv, -k);
      }
      for (const [a, b, m] of RD_MIN) {
        const pa = P[a], pb = P[b]; _rv.subVectors(pb, pa); const d = _rv.length() || 1e-6;
        if (d < m) { const k = (d - m) / d * 0.5; pa.addScaledVector(_rv, k); pb.addScaledVector(_rv, -k); }
      }
      for (let i = 0; i < NJ; i++) {
        const p = P[i], r = i === J.HEAD ? 0.12 : (i === J.PELV || i === J.NECK ? 0.11 : 0.06);
        const gh = groundH(p.x, p.z);
        if (p.y < gh + r) {
          p.y = gh + r; grounded++;
          const o = O[i]; o.x = p.x - (p.x - o.x) * 0.82; o.z = p.z - (p.z - o.z) * 0.82; if (o.y < p.y) o.y = p.y + (o.y - p.y) * -0.15;
        }
      }
    }
    this.onGround = grounded > 2;
    for (const i of [J.PELV, J.NECK, J.HEAD, J.LFT, J.RFT, J.LHA, J.RHA]) {
      const p = P[i];
      pushOutCircle(p, 0.15, p.y, (c, nx, nz) => { const o = O[i]; const vx = p.x - o.x, vz = p.z - o.z, vn = vx * nx + vz * nz; if (vn < 0) { o.x += nx * vn * 1.4; o.z += nz * vn * 1.4; } });
    }
    if (this.speed < 0.55 && this.age > 1.2) this.restT += dt; else this.restT = Math.max(0, this.restT - dt * 2);
  }
  behave(dt) { // "euphoria"-style active ragdoll: flail in the air, brace for impact, writhe on the ground
    const P = this.p, t = this.age * 11 + this.seed;
    const air = !this.onGround && this.age < 4;
    if (air && this.age < this.flail) {
      for (const s of [1, -1]) {
        const sh = P[s > 0 ? J.LSH : J.RSH], ha = P[s > 0 ? J.LHA : J.RHA], el = P[s > 0 ? J.LEL : J.REL];
        _rv.set(Math.sin(t + s) * 0.55, Math.cos(t * 1.1 + s) * 0.55, Math.sin(t * 0.7) * 0.3).add(sh);
        ha.lerp(_rv, 0.07); el.lerp(_rv.lerp(sh, 0.5), 0.03);
        const hip = P[s > 0 ? J.LHIP : J.RHIP], ft = P[s > 0 ? J.LFT : J.RFT];
        _rv.set(Math.sin(t * 0.8 + s * 2) * 0.35, -0.6, Math.cos(t * 0.8 + s * 2) * 0.45).add(hip);
        ft.lerp(_rv, 0.04);
      }
    } else if (!this.onGround) {
      // brace: arms reach toward the direction of motion / the ground
      const pv = _rv2.subVectors(P[J.NECK], this.o[J.NECK]); pv.y = Math.min(pv.y, 0); pv.normalize();
      for (const i of [J.LHA, J.RHA]) { _rv.copy(P[J.NECK]).addScaledVector(pv, 0.5); _rv.y -= 0.4; P[i].lerp(_rv, 0.06); }
    } else if (this.age < this.writhe + 2.5 && this.speed < 3) {
      const k = 0.015 * (1 - clamp((this.age - this.writhe) / 2.5, 0, 1));
      _rv.copy(P[J.PELV]).lerp(P[J.NECK], 0.5); _rv.y += 0.05;
      P[J.LHA].lerp(_rv, k * 2); P[J.RHA].lerp(_rv, k * 1.5);
      _rv.copy(P[J.PELV]); _rv.y += 0.25 + Math.sin(t * 0.4) * 0.1;
      P[J.LKN].lerp(_rv, k * (1 + Math.sin(t * 0.3))); P[J.RKN].lerp(_rv, k * (1 + Math.cos(t * 0.35)));
    }
  }
}

// ---------------------------------------------------------------- Character
class Character {
  constructor(o = {}) {
    this.pos = new V3(); this.yaw = 0; this.vel = new V3(); this.vy = 0; this.onGround = true;
    this.joints = Array.from({ length: NJ }, () => new V3()); this.L = Array.from({ length: NJ }, () => new V3());
    this.colors = o.colors || randomColors();
    this.anim = { speed: 0, phase: Math.random() * TAU, crouch: 0, lean: 0, aim: 0, aimPitch: 0, rifle: false, phone: 0, punch: 0, jerk: new V3(), jerkV: new V3(), t: Math.random() * 10, dance: 0, stagger: 0, cower: 0, wave: 0, tilt: 0, roll: 0, reach: null, reachL: null };
    this.health = o.health || 100; this.dead = false; this.ragdoll = null; this.blend = null; this.isPlayer = !!o.isPlayer;
    this.vehicle = null; this.seatKind = null; this.sitMatrix = null; this.removeT = 0; this.visible = true; this.hideHead = false; this.radius = 0.3;
    this.getupT = 0; this.ai = null; this.kind = o.kind || 'ped'; this.scale = o.scale || 1;
    chars.push(this);
  }
  destroy() { const i = chars.indexOf(this); if (i >= 0) chars.splice(i, 1); this.destroyed = true; if (this.gunMesh) { this.gunMesh.visible = false; this.gunMesh.userData.free = true; this.gunMesh = null; } }
  center(out = new V3()) { return out.copy(this.ragdoll ? this.ragdoll.p[J.PELV] : this.joints[J.PELV]); }
  startBlend(dur) { this.blend = { from: this.joints.map(j => j.clone()), t: 0, dur }; }
  goRagdoll(vel, spin = 2) {
    if (this.ragdoll) { this.ragdoll.impulseAll(vel); this.ragdoll.restT = 0; return; }
    if (this.vehicle) this.vehicle = null;
    this.sitMatrix = null; const an = this.anim; an.reach = an.reachL = an.footL = an.footR = null;
    this.ragdoll = new Ragdoll(this.joints, vel, spin); this.blend = null; this.getupT = 0;
  }
  getUp() {
    if (!this.ragdoll) return;
    const P = this.ragdoll.p;
    this.pos.set(P[J.PELV].x, groundH(P[J.PELV].x, P[J.PELV].z), P[J.PELV].z);
    const dx = P[J.NECK].x - P[J.PELV].x, dz = P[J.NECK].z - P[J.PELV].z;
    // face up or down? use chest normal
    _v1.subVectors(P[J.LSH], P[J.RSH]); _v2.subVectors(P[J.NECK], P[J.PELV]); _v3.crossVectors(_v1, _v2);
    this.yaw = _v3.y < 0 ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz);
    for (let i = 0; i < NJ; i++) this.joints[i].copy(P[i]);
    this.ragdoll = null; this.anim.crouch = 1; this.anim.lean = 0.5; this.anim.speed = 0;
    this.startBlend(0.55); this.getupT = 1.15; this.vel.set(0, 0, 0);
  }
  hitJerk(dirWorld, amt) {
    // convert to local, jerk torso away from the hit
    const s = Math.sin(-this.yaw), c = Math.cos(-this.yaw);
    const lx = dirWorld.x * c + dirWorld.z * s, lz = -dirWorld.x * s + dirWorld.z * c;
    this.anim.jerkV.x += lx * amt * 6; this.anim.jerkV.z += lz * amt * 6; this.anim.jerkV.y -= amt * 1.5;
    this.anim.stagger = Math.min(1.2, this.anim.stagger + amt);
  }
  locoMatrix(m) {
    _q1.setFromEuler(_eul.set(this.anim.tilt, this.yaw, this.anim.roll, 'YXZ'));
    return m.compose(this.pos, _q1, _v4.set(this.scale, this.scale, this.scale));
  }
  updatePose(dt) {
    const a = this.anim; a.t += dt;
    // jerk spring
    a.jerkV.addScaledVector(a.jerk, -90 * dt); a.jerkV.multiplyScalar(Math.exp(-9 * dt)); a.jerk.addScaledVector(a.jerkV, dt);
    a.stagger = Math.max(0, a.stagger - dt * 1.5);
    if (this.ragdoll) {
      this.ragdoll.update(dt, !this.dead);
      for (let i = 0; i < NJ; i++) this.joints[i].copy(this.ragdoll.p[i]);
      const p = this.ragdoll.p[J.PELV]; this.pos.set(p.x, groundH(p.x, p.z), p.z);
      return;
    }
    const L = this.L;
    if (this.getupT > 0) {
      this.getupT -= dt;
      if (this.getupT < 0.6 && a.crouch > 0.5) { a.crouch = 0; a.lean = 0; this.startBlend(0.6); }
    }
    if (this.sitMatrix) {
      poseSit(a, L, this.seatKind);
      for (let i = 0; i < NJ; i++) this.joints[i].copy(L[i]).applyMatrix4(this.sitMatrix);
    } else {
      poseLocomotion(a, L);
      for (let i = 0; i < NJ; i++) this.joints[i].copy(L[i]);
      // local overlays
      if (a.cower > 0) {
        for (const s of [1, -1]) { const sh = L[s > 0 ? J.LSH : J.RSH]; _v1.set(s * 0.06, L[J.HEAD].y + 0.08, L[J.HEAD].z + 0.05); ik2(sh, _v1, 0.29, 0.27, _v2.set(s, 0.2, 0.4), this.joints[s > 0 ? J.LEL : J.REL], this.joints[s > 0 ? J.LHA : J.RHA]); }
      } else if (a.wave > 0) {
        _v1.set(0.35, L[J.HEAD].y + 0.25, 0.15 + Math.sin(a.t * 10) * 0.1); ik2(L[J.LSH], _v1, 0.29, 0.27, _v2.set(1, -0.5, 0), this.joints[J.LEL], this.joints[J.LHA]);
      } else if (a.phone > 0) {
        _v1.set(-0.11, L[J.HEAD].y - 0.02, L[J.HEAD].z + 0.04); ik2(L[J.RSH], _v1, 0.29, 0.27, _v2.set(-1, -1, -0.2), this.joints[J.REL], this.joints[J.RHA]);
      }
      if (a.aim > 0.01) {
        const cp = Math.cos(a.aimPitch), sp = Math.sin(a.aimPitch);
        const sh = L[J.RSH];
        _v1.set(sh.x + 0.1, sh.y + sp * 0.55, sh.z + cp * 0.55);
        ik2(sh, _v1, 0.29, 0.27, _v2.set(-1, -0.6, 0), _v3, _v4);
        this.joints[J.REL].lerp(_v3, a.aim); this.joints[J.RHA].lerp(_v4, a.aim);
        if (a.rifle) {
          _v1.set(sh.x + 0.14, sh.y + sp * 0.45 - 0.02, sh.z + cp * 0.42);
          ik2(L[J.LSH], _v1, 0.29, 0.27, _v2.set(1, -1, 0), _v3, _v4);
          this.joints[J.LEL].lerp(_v3, a.aim); this.joints[J.LHA].lerp(_v4, a.aim);
        }
      }
      if (a.punch > 0) {
        const k = Math.sin(clamp(a.punch, 0, 1) * Math.PI);
        _v1.set(-0.08, L[J.RSH].y + 0.02, L[J.RSH].z + 0.55);
        ik2(L[J.RSH], _v1, 0.29, 0.27, _v2.set(-1, -1, 0), _v3, _v4);
        this.joints[J.REL].lerp(_v3, k); this.joints[J.RHA].lerp(_v4, k);
        a.punch -= dt * 3.2;
      }
      this.locoMatrix(_m4);
      for (let i = 0; i < NJ; i++) this.joints[i].applyMatrix4(_m4);
    }
    // world-space reach overlays (door handles, steering wheel)
    if (a.reach) { _v2.copy(a.reachPole || _v5.set(0, -1, 0)); ik2(this.joints[J.RSH], a.reach, 0.29 * this.scale, 0.27 * this.scale, _v2, this.joints[J.REL], this.joints[J.RHA]); }
    if (a.reachL) { _v2.copy(a.reachPoleL || _v5.set(0, -1, 0)); ik2(this.joints[J.LSH], a.reachL, 0.29 * this.scale, 0.27 * this.scale, _v2, this.joints[J.LEL], this.joints[J.LHA]); }
    if (a.footL) { ik2(this.joints[J.LHIP], a.footL, 0.45, 0.45, _v2.set(0, 0.3, 1), this.joints[J.LKN], this.joints[J.LFT]); }
    if (a.footR) { ik2(this.joints[J.RHIP], a.footR, 0.45, 0.45, _v2.set(0, 0.3, 1), this.joints[J.RKN], this.joints[J.RFT]); }
    if (this.blend) {
      const b = this.blend; b.t += dt; const k = clamp(b.t / b.dur, 0, 1), e = k * k * (3 - 2 * k);
      for (let i = 0; i < NJ; i++) this.joints[i].lerpVectors(b.from[i], this.joints[i], e);
      if (k >= 1) this.blend = null;
    }
  }
  takeDamage(n, dir, src) {
    if (this.dead) return;
    this.health -= n;
    if (this.onDamage) this.onDamage(n, dir, src);
    if (this.health <= 0) this.die(dir);
  }
  die(dir) {
    if (this.dead) return; this.dead = true; this.health = 0;
    if (this.vehicle) this.anim.slump = 1;
    else if (!this.ragdoll) this.goRagdoll(dir ? _v1.copy(dir).multiplyScalar(2) : _v1.set(0, 0, 0), 1.5);
    this.removeT = 40;
    if (this.onDeath) this.onDeath();
  }
}
const _eul = new THREE.Euler();

// ---------------------------------------------------------------- rendering (all characters -> one instanced draw)
const _bx = new V3(), _by = new V3(), _bz = new V3(), _bc = new V3(), _rx = new V3();
const _me = new THREE.Matrix4();
function setPart(idx, c, X, Y, Z, sx, sy, sz, hex) {
  const e = _me.elements;
  e[0] = X.x * sx; e[1] = X.y * sx; e[2] = X.z * sx; e[3] = 0;
  e[4] = Y.x * sy; e[5] = Y.y * sy; e[6] = Y.z * sy; e[7] = 0;
  e[8] = Z.x * sz; e[9] = Z.y * sz; e[10] = Z.z * sz; e[11] = 0;
  e[12] = c.x; e[13] = c.y; e[14] = c.z; e[15] = 1;
  charMesh.setMatrixAt(idx, _me); charMesh.setColorAt(idx, _col.setHex(hex));
}
function limbBasis(a, b, ref) {
  _by.subVectors(b, a); const len = _by.length() || 1e-4; _by.multiplyScalar(1 / len);
  _bx.copy(ref).addScaledVector(_by, -ref.dot(_by)); if (_bx.lengthSq() < 1e-5) _bx.set(1, 0, 0).addScaledVector(_by, -_by.x); _bx.normalize();
  _bz.crossVectors(_bx, _by);
  return len;
}
function setLimb(idx, a, b, t, d, hex, ref, ext = 0.04) {
  const len = limbBasis(a, b, ref); _bc.addVectors(a, b).multiplyScalar(0.5);
  setPart(idx, _bc, _bx, _by, _bz, t, len + ext, d, hex);
}
function writeChar(ch, base) {
  const P = ch.joints, c = ch.colors, s = ch.scale;
  _rx.subVectors(P[J.LSH], P[J.RSH]).normalize();
  // torso
  let len = limbBasis(P[J.PELV], P[J.NECK], _rx);
  _bc.addVectors(P[J.PELV], P[J.NECK]).multiplyScalar(0.5).addScaledVector(_by, 0.03);
  setPart(base, _bc, _bx, _by, _bz, 0.4 * s, len + 0.1 * s, 0.22 * s, c.shirt);
  // pelvis
  _bc.addVectors(P[J.LHIP], P[J.RHIP]).multiplyScalar(0.5).addScaledVector(_by, 0.04);
  setPart(base + 1, _bc, _bx, _by, _bz, 0.35 * s, 0.2 * s, 0.22 * s, c.pants);
  // head + hair
  len = limbBasis(P[J.NECK], P[J.HEAD], _rx);
  if (ch.hideHead) { setPart(base + 2, P[J.HEAD], _bx, _by, _bz, 0, 0, 0, c.skin); setPart(base + 3, P[J.HEAD], _bx, _by, _bz, 0, 0, 0, c.hair); }
  else {
    _bc.copy(P[J.HEAD]).addScaledVector(_by, -0.02);
    setPart(base + 2, _bc, _bx, _by, _bz, 0.21 * s, 0.27 * s, 0.23 * s, c.skin);
    _bc.copy(P[J.HEAD]).addScaledVector(_by, 0.11 * s).addScaledVector(_bz, -0.015);
    if (c.hat) setPart(base + 3, _bc.addScaledVector(_bz, 0.04), _bx, _by, _bz, 0.25 * s, 0.08 * s, 0.33 * s, c.hat);
    else setPart(base + 3, _bc, _bx, _by, _bz, 0.23 * s, 0.07 * s, 0.25 * s, c.hair);
  }
  // arms
  setLimb(base + 4, P[J.LSH], P[J.LEL], 0.11 * s, 0.11 * s, c.sleeve || c.shirt, _rx);
  setLimb(base + 5, P[J.LEL], P[J.LHA], 0.085 * s, 0.09 * s, c.skin, _rx, 0.1);
  setLimb(base + 6, P[J.RSH], P[J.REL], 0.11 * s, 0.11 * s, c.sleeve || c.shirt, _rx);
  setLimb(base + 7, P[J.REL], P[J.RHA], 0.085 * s, 0.09 * s, c.skin, _rx, 0.1);
  // legs
  setLimb(base + 8, P[J.LHIP], P[J.LKN], 0.15 * s, 0.16 * s, c.pants, _rx);
  setLimb(base + 9, P[J.LKN], P[J.LFT], 0.12 * s, 0.13 * s, c.pants, _rx);
  setLimb(base + 10, P[J.RHIP], P[J.RKN], 0.15 * s, 0.16 * s, c.pants, _rx);
  setLimb(base + 11, P[J.RKN], P[J.RFT], 0.12 * s, 0.13 * s, c.pants, _rx);
  // feet
  for (const [k, kn, ft] of [[12, J.LKN, J.LFT], [13, J.RKN, J.RFT]]) {
    limbBasis(P[kn], P[ft], _rx);
    // shin basis: _by points knee->foot (down), _bx is the body's left, so _bz = _bx x _by points BACKWARD.
    // push the shoe forward (toes ahead of the ankle, small heel behind)
    _bc.copy(P[ft]).addScaledVector(_bz, -0.08 * s).addScaledVector(_by, -0.01);
    setPart(base + k, _bc, _bx, _by, _bz, 0.11 * s, 0.09 * s, 0.26 * s, c.shoes);
  }
}
function renderChars() {
  if (!charMesh) return;
  let n = 0; const cp = camera.position;
  for (const ch of chars) {
    if (!ch.visible) continue;
    const dx = ch.joints[J.PELV].x - cp.x, dz = ch.joints[J.PELV].z - cp.z;
    if (dx * dx + dz * dz > 170 * 170) continue;
    if (n >= CHAR_MAX) break;
    writeChar(ch, n * PARTS); n++;
  }
  charMesh.count = n * PARTS;
  charMesh.instanceMatrix.needsUpdate = true;
  if (charMesh.instanceColor) charMesh.instanceColor.needsUpdate = true;
}
// ray vs character (capsules around limb segments) -> {t, joint} or null
const CAP_SEGS = [[J.PELV, J.NECK, 0.2], [J.LSH, J.LEL, 0.08], [J.LEL, J.LHA, 0.07], [J.RSH, J.REL, 0.08], [J.REL, J.RHA, 0.07], [J.LHIP, J.LKN, 0.1], [J.LKN, J.LFT, 0.08], [J.RHIP, J.RKN, 0.1], [J.RKN, J.RFT, 0.08]];
const _ca = new V3(), _cb = new V3();
function raySegDist(o, d, a, b, maxT) {
  // closest approach between ray o+d*t and segment ab; returns [t, dist, s]
  _ca.subVectors(b, a); const w0x = o.x - a.x, w0y = o.y - a.y, w0z = o.z - a.z;
  const A = 1, B = d.dot(_ca), Cc = _ca.dot(_ca), D = d.x * w0x + d.y * w0y + d.z * w0z, E = _ca.x * w0x + _ca.y * w0y + _ca.z * w0z;
  const den = A * Cc - B * B; let t, s;
  if (den < 1e-8) { t = 0; s = E / Cc; } else { t = (B * E - Cc * D) / den; s = (A * E - B * D) / den; }
  s = clamp(s, 0, 1); t = Math.max(0, (_ca.x * s + a.x - o.x) * d.x + (_ca.y * s + a.y - o.y) * d.y + (_ca.z * s + a.z - o.z) * d.z);
  if (t > maxT) return null;
  const px = o.x + d.x * t - (a.x + _ca.x * s), py = o.y + d.y * t - (a.y + _ca.y * s), pz = o.z + d.z * t - (a.z + _ca.z * s);
  return [t, Math.sqrt(px * px + py * py + pz * pz), s];
}
function rayChar(o, d, maxT, ch) {
  const P = ch.joints;
  // quick reject with bounding sphere
  _cb.subVectors(P[J.PELV], o); const tc = _cb.dot(d); if (tc < -1.5 || tc > maxT + 1.5) return null;
  if (_cb.lengthSq() - tc * tc > 1.6 * 1.6) return null;
  let best = null;
  // head sphere
  _cb.subVectors(P[J.HEAD], o); const th = _cb.dot(d);
  if (th > 0 && th < maxT) { const d2 = _cb.lengthSq() - th * th; if (d2 < 0.14 * 0.14) best = { t: th - Math.sqrt(0.0196 - d2), joint: J.HEAD, head: true }; }
  for (const [a, b, r] of CAP_SEGS) {
    const res = raySegDist(o, d, P[a], P[b], maxT); if (!res) continue;
    if (res[1] < r && (!best || res[0] < best.t)) best = { t: res[0], joint: res[2] < 0.5 ? a : b, head: false };
  }
  return best;
}
