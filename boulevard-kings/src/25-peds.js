// ============================================================================
//  PEDESTRIANS — sidewalk navigation, crossings, idle behaviours, reactions
// ============================================================================
const peds = [];
// corner -> crossing options [di, dj, newCorner, axis of road being crossed]
const CROSS = [[[-1, 0, 1, 'z'], [0, -1, 3, 'x']], [[1, 0, 0, 'z'], [0, -1, 2, 'x']], [[1, 0, 3, 'z'], [0, 1, 1, 'x']], [[-1, 0, 2, 'z'], [0, 1, 0, 'x']]];
function spawnPed(x, z, o = {}) {
  const ch = new Character({ colors: o.colors });
  ch.pos.set(x, groundH(x, z), z); ch.yaw = o.yaw !== undefined ? o.yaw : rand(0, TAU);
  ch.ai = { mode: o.mode || 'walk', target: new V3(), bi: 0, bj: 0, corner: 0, dir: chance(0.5) ? 1 : -1, walk: rand(1.1, 1.55), run: rand(4.4, 5.6), timer: o.timer || 0, threat: new V3(), cross: null, fireT: rand(0.5, 1.5), strafe: 1, strafeT: 0, face: o.face || 0 };
  ch.onDamage = (n, dir, src) => pedOnDamage(ch, n, dir, src);
  peds.push(ch);
  if (!o.driver && (ch.ai.mode === 'walk')) pedNearestCorner(ch);
  return ch;
}
function removePed(ch) { const i = peds.indexOf(ch); if (i >= 0) peds.splice(i, 1); ch.destroy(); }
function pedNearestCorner(ch) {
  const b = blockOf(ch.pos.x, ch.pos.z), a = ch.ai;
  a.bi = clamp(b.i, 0, NB - 1); a.bj = clamp(b.j, 0, NB - 1);
  const cs = blockCorners(a.bi, a.bj); let bk = 0, bd = 1e9;
  cs.forEach((c, k) => { const d = c.distanceToSquared(ch.pos); if (d < bd) { bd = d; bk = k; } });
  // head to the corner ahead in walking direction (feels less robotic than turning back)
  a.corner = chance(0.5) ? bk : (bk + a.dir + 4) % 4;
  a.target.copy(cs[a.corner]); a.target.x += rand(-0.6, 0.6); a.target.z += rand(-0.6, 0.6);
}
function pedArrive(ch) {
  const a = ch.ai;
  if (chance(0.38)) {
    const opts = CROSS[a.corner].filter(o => a.bi + o[0] >= 0 && a.bi + o[0] < NB && a.bj + o[1] >= 0 && a.bj + o[1] < NB);
    if (opts.length) { const o = pick(opts); a.cross = { bi: a.bi + o[0], bj: a.bj + o[1], corner: o[2], axis: o[3] }; a.mode = 'wait'; a.timer = 0; return; }
  }
  if (chance(0.1)) { a.mode = chance(0.5) ? 'phone' : 'idle'; a.timer = rand(3, 9); return; }
  a.corner = (a.corner + a.dir + 4) % 4;
  const cs = blockCorners(a.bi, a.bj); a.target.copy(cs[a.corner]); a.target.x += rand(-0.7, 0.7); a.target.z += rand(-0.7, 0.7);
}
function pedMoveTo(ch, tx, tz, speed, dt, faceMove = true) {
  const dx = tx - ch.pos.x, dz = tz - ch.pos.z, d = Math.hypot(dx, dz);
  if (d < 0.5) { ch.vel.multiplyScalar(Math.exp(-10 * dt)); return true; }
  const k = 1 - Math.exp(-7 * dt);
  ch.vel.x = lerp(ch.vel.x, dx / d * speed, k); ch.vel.z = lerp(ch.vel.z, dz / d * speed, k);
  if (faceMove) ch.yaw += wrapAng(Math.atan2(ch.vel.x, ch.vel.z) - ch.yaw) * Math.min(1, dt * 9);
  return false;
}
function pedFlee(ch, from) {
  const a = ch.ai; if (!a || ch.dead || a.mode === 'hostile' || a.mode === 'driving') return;
  if (ch.sitMatrix && a.mode === 'sit') { ch.sitMatrix = null; ch.startBlend(0.4); ch.pos.y = groundH(ch.pos.x, ch.pos.z); }
  a.threat.copy(from); a.mode = 'flee'; a.timer = rand(6, 11); ch.anim.phone = 0; ch.anim.dance = 0;
}
function pedScare(ch, from) { const a = ch.ai; if (!a || ch.dead) return; if (a.mode === 'walk' || a.mode === 'idle' || a.mode === 'phone' || a.mode === 'wait') { pedFlee(ch, from); a.timer = rand(2, 4); } }
function pedsPanic(pos, radius, threat) {
  for (const p of peds) {
    if (p.dead || !p.ai || p.vehicle) continue;
    const m = p.ai.mode; if (m === 'hostile' || m === 'driving' || m === 'cower') continue;
    if (p.pos.distanceToSquared(pos) > radius * radius) continue;
    if (m === 'clerk') { p.ai.mode = 'cower'; p.ai.timer = rand(6, 12); p.ai.stay = true; continue; }
    if (chance(0.22)) { if (p.sitMatrix) { p.sitMatrix = null; p.startBlend(0.3); } p.ai.mode = 'cower'; p.ai.timer = rand(2, 5); p.ai.threat.copy(threat); }
    else pedFlee(p, threat);
  }
}
function pedOnDamage(ch, n, dir, src) {
  const a = ch.ai; if (!a) return;
  if (ch.vehicle && ch.vehicle.driver === ch && !ch.dead && n > 30) { /* shot through the window */ }
  if (a.mode !== 'hostile' && a.mode !== 'driving') pedFlee(ch, dir ? _v5.copy(ch.pos).addScaledVector(dir, -5) : ch.pos);
  if (a.mode === 'hostile') a.alerted = true;
}
function pedDodge(v) { // peds in the path of a fast car try to dive away
  const sp = v.speed; if (sp < 9) return;
  const f = v.fwd(_v1), lx = f.z, lz = -f.x;
  for (const p of peds) {
    if (p.dead || p.ragdoll || !p.ai || p.vehicle || p.sitMatrix || p.ai.dodged || p.ai.mode === 'hostile') continue;
    const rx = p.pos.x - v.pos.x, rz = p.pos.z - v.pos.z, ahead = rx * f.x + rz * f.z; if (ahead < 0 || ahead > 16) continue;
    const lat = rx * lx + rz * lz; if (Math.abs(lat) > v.T.wid / 2 + 1) continue;
    if (ahead / sp > 1.0) continue;
    p.ai.dodged = true;
    if (chance(0.5)) { const s = lat >= 0 ? 1 : -1; p.ai.mode = 'dive'; p.ai.timer = 0.55; p.vel.set(lx * s * 5.5, 0, lz * s * 5.5); p.yaw = Math.atan2(p.vel.x, p.vel.z); p.ai.threat.copy(v.pos); }
    else if (chance(0.5)) { p.ai.mode = 'cower'; p.ai.timer = 2; }
  }
}
function updatePed(ch, dt) {
  const a = ch.ai, an = ch.anim;
  if (ch.ragdoll) {
    if (!ch.dead && ch.ragdoll.restT > 0.9 && ch.ragdoll.age > 2.2) { ch.getUp(); a.mode = a.mode === 'hostile' ? 'hostile' : 'flee'; a.timer = rand(6, 10); }
    return;
  }
  if (ch.dead || ch.vehicle || a.mode === 'driving') return;
  if (ch.getupT > 0) { ch.vel.set(0, 0, 0); an.speed = 0; return; }
  an.phone = 0; an.cower = 0; an.dance = 0; an.wave = 0;
  let speedNow = 0;
  if (ch.stumbleT > 0) {
    ch.stumbleT -= dt; ch.vel.multiplyScalar(Math.exp(-3 * dt)); an.lean = lerp(an.lean, -0.25, 0.2);
  } else {
    an.lean = lerp(an.lean, 0, Math.min(1, dt * 5));
    switch (a.mode) {
      case 'walk': case 'return':
        if (pedMoveTo(ch, a.target.x, a.target.z, a.walk, dt)) { if (a.mode === 'return') { a.mode = 'walk'; pedNearestCorner(ch); } else pedArrive(ch); }
        break;
      case 'wait': {
        a.timer += dt; ch.vel.multiplyScalar(Math.exp(-8 * dt));
        const cs = blockCorners(a.cross.bi, a.cross.bj), tg = cs[a.cross.corner];
        ch.yaw += wrapAng(Math.atan2(tg.x - ch.pos.x, tg.z - ch.pos.z) - ch.yaw) * Math.min(1, dt * 5);
        const tt = world.lightClock % LIGHT_CYCLE, ok = a.cross.axis === 'z' ? (tt > 15 && tt < 24) : (tt > 1 && tt < 9);
        if (ok || a.timer > 30) { a.mode = 'cross'; a.target.copy(tg); a.target.x += rand(-0.4, 0.4); a.target.z += rand(-0.4, 0.4); }
        break;
      }
      case 'cross':
        if (pedMoveTo(ch, a.target.x, a.target.z, a.walk * 1.25, dt)) { a.bi = a.cross.bi; a.bj = a.cross.bj; a.corner = a.cross.corner; a.cross = null; a.mode = 'walk'; a.dodged = false; pedArrive(ch); if (a.mode === 'wait') { a.mode = 'walk'; a.corner = (a.corner + a.dir + 4) % 4; a.target.copy(blockCorners(a.bi, a.bj)[a.corner]); } }
        break;
      case 'idle': case 'phone':
        ch.vel.multiplyScalar(Math.exp(-8 * dt)); a.timer -= dt; if (a.mode === 'phone') an.phone = 1;
        if (a.timer <= 0) { a.mode = 'walk'; a.corner = (a.corner + a.dir + 4) % 4; a.target.copy(blockCorners(a.bi, a.bj)[a.corner]); }
        break;
      case 'flee': {
        a.timer -= dt;
        let dx = ch.pos.x - a.threat.x, dz = ch.pos.z - a.threat.z; const d = Math.hypot(dx, dz) || 1;
        dx /= d; dz /= d; const w = Math.sin(an.t * 0.7 + ch.colors.skin) * 0.5;
        const tx = ch.pos.x + (dx * Math.cos(w) - dz * Math.sin(w)) * 5, tz = ch.pos.z + (dz * Math.cos(w) + dx * Math.sin(w)) * 5;
        pedMoveTo(ch, tx, tz, a.run, dt);
        if (a.timer <= 0) { a.mode = 'return'; a.dodged = false; const b = blockOf(ch.pos.x, ch.pos.z); a.bi = clamp(b.i, 0, NB - 1); a.bj = clamp(b.j, 0, NB - 1); pedNearestCorner(ch); a.mode = 'return'; }
        break;
      }
      case 'cower':
        ch.vel.multiplyScalar(Math.exp(-10 * dt)); an.cower = 1; an.crouch = lerp(an.crouch, 0.7, Math.min(1, dt * 6)); a.timer -= dt;
        if (a.timer <= 0) { an.crouch = 0; if (a.stay) { a.mode = 'clerk'; a.stay = false; } else pedFlee(ch, a.threat); }
        break;
      case 'dive':
        a.timer -= dt; an.crouch = lerp(an.crouch, 0.6, 0.3); an.lean = 0.5;
        if (a.timer <= 0) { an.crouch = 0; an.lean = 0; pedFlee(ch, a.threat); }
        break;
      case 'hostile': hostileUpdate(ch, dt); break;
      case 'clerk': case 'still':
        ch.vel.multiplyScalar(Math.exp(-10 * dt)); ch.yaw += wrapAng(a.face - ch.yaw) * Math.min(1, dt * 4); break;
      case 'browse':
        if (!a.points) break;
        if (a.timer > 0) { a.timer -= dt; ch.vel.multiplyScalar(Math.exp(-10 * dt)); }
        else if (pedMoveTo(ch, a.target.x, a.target.z, 1.0, dt)) { a.timer = rand(2, 6); a.target.copy(pick(a.points)); }
        break;
      case 'dance':
        ch.vel.multiplyScalar(Math.exp(-10 * dt)); an.dance = 1; ch.yaw += wrapAng(a.face - ch.yaw) * Math.min(1, dt * 3); break;
      case 'watch':
        ch.vel.multiplyScalar(Math.exp(-10 * dt)); ch.yaw += wrapAng(a.face - ch.yaw) * Math.min(1, dt * 3); if (Math.sin(an.t * 0.9 + ch.colors.hair) > 0.6) an.wave = 1; break;
      case 'sit': ch.vel.set(0, 0, 0); break;
    }
    if (an.crouch > 0 && a.mode !== 'cower' && a.mode !== 'dive' && ch.getupT <= 0) an.crouch = Math.max(0, an.crouch - dt * 3);
  }
  if (ch.sitMatrix) { an.speed = 0; return; }
  ch.pos.x += ch.vel.x * dt; ch.pos.z += ch.vel.z * dt;
  pushOutCircle(ch.pos, 0.3, 0.6);
  ch.pos.y = groundH(ch.pos.x, ch.pos.z);
  speedNow = Math.hypot(ch.vel.x, ch.vel.z);
  an.speed = speedNow; an.phase += speedNow * dt * (speedNow > 3 ? 2.3 : 3.3);
}
function separatePeds() {
  for (let i = 0; i < peds.length; i++) {
    const a = peds[i]; if (a.ragdoll || a.vehicle || a.sitMatrix || a.dead) continue;
    for (let j = i + 1; j < peds.length; j++) {
      const b = peds[j]; if (b.ragdoll || b.vehicle || b.sitMatrix || b.dead) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 0.5 && d2 > 1e-6) { const d = Math.sqrt(d2), p = (0.71 - d) * 0.5; a.pos.x -= dx / d * p; a.pos.z -= dz / d * p; b.pos.x += dx / d * p; b.pos.z += dz / d * p; }
    }
  }
}
// ---------------------------------------------------------------- hostile gunmen
function hostileUpdate(ch, dt) {
  const a = ch.ai, an = ch.anim;
  const tgt = playerAimPoint(_v1);
  const dx = tgt.x - ch.pos.x, dz = tgt.z - ch.pos.z, d = Math.hypot(dx, dz);
  a.fireT -= dt; a.strafeT -= dt;
  if (a.strafeT <= 0) { a.strafeT = rand(1.2, 2.8); a.strafe = chance(0.5) ? 1 : -1; }
  if (!a.alerted && d > 38) { ch.vel.multiplyScalar(Math.exp(-6 * dt)); an.aim = Math.max(0, an.aim - dt * 3); return; }
  a.alerted = true;
  let mx = 0, mz = 0, sp = 0;
  const nx = dx / (d || 1), nz = dz / (d || 1);
  if (d > 22) { mx = nx; mz = nz; sp = 4.4; }
  else if (d < 7) { mx = -nx; mz = -nz; sp = 2.6; }
  else { mx = -nz * a.strafe; mz = nx * a.strafe; sp = 1.6; }
  const k = 1 - Math.exp(-6 * dt); ch.vel.x = lerp(ch.vel.x, mx * sp, k); ch.vel.z = lerp(ch.vel.z, mz * sp, k);
  ch.yaw += wrapAng(Math.atan2(dx, dz) - ch.yaw) * Math.min(1, dt * 8);
  an.aim = Math.min(1, an.aim + dt * 4); an.rifle = ch.weapon === 'rifle';
  an.aimPitch = Math.atan2(tgt.y - (ch.pos.y + 1.4), d);
  if (d < 48 && a.fireT <= 0 && playerAlive()) {
    a.fireT = ch.weapon === 'rifle' ? rand(0.12, 0.25) : rand(0.55, 1.1);
    if (ch.weapon === 'rifle' && chance(0.18)) a.fireT = rand(0.8, 1.4);
    npcShoot(ch, tgt, d);
  }
}
