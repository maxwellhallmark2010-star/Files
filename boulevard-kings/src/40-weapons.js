// ============================================================================
//  WEAPONS — fists, pistol, assault rifle; bullets vs world / people / cars
// ============================================================================
const WEAPONS = {
  fist: { name: 'FISTS', dmg: 14, rate: 2.4, auto: false },
  pistol: { name: 'PISTOL', dmg: 30, rate: 4.5, mag: 12, reload: 1.3, spread: 0.008, range: 140, auto: false },
  rifle: { name: 'ASSAULT RIFLE', dmg: 22, rate: 10, mag: 30, reload: 2.0, spread: 0.02, range: 170, auto: true }
};
const gunPool = [];
function makeGunMesh(kind) {
  const g = new THREE.Group(); const dark = SH.dark, metal = SH.metal;
  if (kind === 'rifle') {
    const wood = new THREE.MeshLambertMaterial({ color: 0x6a3d1c });
    boxMesh(0.06, 0.09, 0.42, metal, 0, 0, 0.12, g); boxMesh(0.025, 0.025, 0.32, dark, 0, 0.02, 0.48, g);
    boxMesh(0.05, 0.06, 0.2, wood, 0, -0.01, 0.38, g); boxMesh(0.05, 0.1, 0.26, wood, 0, -0.03, -0.2, g);
    const mag = boxMesh(0.04, 0.2, 0.07, dark, 0, -0.12, 0.17, g); mag.rotation.x = 0.35;
    boxMesh(0.04, 0.1, 0.05, wood, 0, -0.08, 0.02, g);
  } else {
    boxMesh(0.035, 0.05, 0.19, dark, 0, 0.02, 0.06, g); const gr = boxMesh(0.032, 0.11, 0.05, dark, 0, -0.04, -0.01, g); gr.rotation.x = -0.25;
  }
  g.userData.kind = kind; g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(g); return g;
}
function getGun(kind) {
  for (const g of gunPool) if (g.userData.free && g.userData.kind === kind) { g.userData.free = false; g.visible = true; return g; }
  const g = makeGunMesh(kind); g.userData.free = false; gunPool.push(g); return g;
}
function equipGun(ch, kind) {
  if (ch.gunMesh && ch.gunMesh.userData.kind !== kind) { ch.gunMesh.visible = false; ch.gunMesh.userData.free = true; ch.gunMesh = null; }
  ch.weapon = kind;
  if (kind && kind !== 'fist' && !ch.gunMesh) ch.gunMesh = getGun(kind);
  if ((!kind || kind === 'fist') && ch.gunMesh) { ch.gunMesh.visible = false; ch.gunMesh.userData.free = true; ch.gunMesh = null; }
}
const _gd = new V3(), _gt = new V3();
function updateGunMeshes() {
  for (const ch of chars) {
    const g = ch.gunMesh; if (!g) continue;
    if (ch.dead || ch.ragdoll || ch.hideGun || (ch.vehicle && !ch.driveBy)) { g.visible = false; continue; }
    g.visible = ch.visible;
    const P = ch.joints;
    g.position.copy(P[J.RHA]);
    if (ch.anim.aim > 0.5 || ch.driveBy) { _gd.copy(ch.aimDir || _gd.set(Math.sin(ch.yaw), 0, Math.cos(ch.yaw))); }
    else { _gd.subVectors(P[J.RHA], P[J.REL]).normalize(); _gd.y = _gd.y * 0.3 - 0.2; _gd.x += Math.sin(ch.yaw) * 0.6; _gd.z += Math.cos(ch.yaw) * 0.6; }
    _gt.copy(g.position).add(_gd); g.lookAt(_gt);
  }
}
// muzzle light
let flash = null;
function flashLight(p, k) { if (!flash) return; flash.position.copy(p); flash.intensity = Math.max(flash.intensity, 2.5 * k); flash.distance = 12 + k * 20; }
function initWeaponsFX() { flash = new THREE.PointLight(0xffc070, 0, 14, 2); scene.add(flash); }

// ---------------------------------------------------------------- ray vs vehicles
const _ro = new V3(), _rd = new V3();
function rayVehicle(o, d, maxT, v) {
  const T = v.T; const dx0 = v.pos.x - o.x, dz0 = v.pos.z - o.z;
  const tc = dx0 * d.x + dz0 * d.z; if (tc < -T.len || tc > maxT + T.len) return null;
  const s = Math.sin(-v.h), c = Math.cos(-v.h);
  const ox = o.x - v.pos.x, oz = o.z - v.pos.z;
  _ro.set(ox * c + oz * s, o.y - v.root.position.y, -ox * s + oz * c); _rd.set(d.x * c + d.z * s, d.y, -d.x * s + d.z * c);
  const W = T.bike ? 0.5 : T.wid, L = T.len, y0 = T.bike ? 0.1 : T.ride * 0.6, y1 = T.bike ? 1.15 : T.ride + v.cabTop;
  let tmin = 0, tmax = maxT; const mn = [-W / 2, y0, -L / 2], mx = [W / 2, y1, L / 2], oo = [_ro.x, _ro.y, _ro.z], dd = [_rd.x, _rd.y, _rd.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dd[a]) < 1e-9) { if (oo[a] < mn[a] || oo[a] > mx[a]) return null; continue; }
    let t1 = (mn[a] - oo[a]) / dd[a], t2 = (mx[a] - oo[a]) / dd[a]; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return null;
  }
  const hy = _ro.y + _rd.y * tmin, hz = _ro.z + _rd.z * tmin, hx = _ro.x + _rd.x * tmin;
  // wheels: check proximity of the hit or ray to each wheel
  let wheel = null;
  for (const w of v.wheels) {
    if (!w.attached) continue;
    const wp = v.wheelWorld(w, _v5); _v4.subVectors(wp, o); const tw = _v4.dot(d); if (tw < 0 || tw > maxT) continue;
    const dist2 = _v4.lengthSq() - tw * tw; if (dist2 < T.wr * T.wr * 1.1 && tw < tmin + 0.6) { wheel = w; tmin = Math.min(tmin, tw); }
  }
  const cabin = !T.bike && hy > T.ride + T.h + 0.04;
  return { t: tmin, wheel, cabin, local: new V3(hx, hy, hz) };
}
function castBullet(o, d, maxT, shooter, ignoreVehicle) {
  let best = { t: maxT, type: null };
  const s = rayStatic(o, d, maxT);
  if (s) best = { t: s.t, type: 'static', n: new V3(s.nx, s.ny, s.nz), c: s.c };
  let passVeh = [];
  for (const v of vehicles) {
    if (v === ignoreVehicle) continue;
    const r = rayVehicle(o, d, best.t, v); if (!r) continue;
    if (r.cabin && !r.wheel) { passVeh.push([v, r]); continue; }
    best = { t: r.t, type: 'veh', v, wheel: r.wheel, local: r.local };
  }
  for (const ch of chars) {
    if (ch === shooter || ch.destroyed || !ch.visible || ch.inside !== (shooter ? shooter.inside : undefined)) continue;
    if (ignoreVehicle && ch.vehicle === ignoreVehicle) continue;
    const r = rayChar(o, d, best.t, ch); if (r && r.t < best.t) best = { t: r.t, type: 'char', ch, joint: r.joint, head: r.head };
  }
  for (const [v, r] of passVeh) if (r.t < best.t) { // shot through a window: break glass, maybe hit the car body
    const lp = r.local; let bg = null, bd = 9;
    for (const g of v.glass) { if (g.broken) continue; const dd = g.c.distanceTo(_v4.set(lp.x, lp.y - v.T.ride, lp.z)); if (dd < bd) { bd = dd; bg = g; } }
    if (bg && bd < 1.2) v.breakGlass(bg);
    else if (best.type !== 'char') { best = { t: r.t, type: 'veh', v, wheel: null, local: r.local }; }
  }
  best.point = o.clone().addScaledVector(d, best.t);
  return best;
}
function applyBulletHit(hit, d, dmg, src) {
  const p = hit.point;
  if (hit.type === 'char') {
    const ch = hit.ch, mult = hit.head ? 3.6 : (hit.joint === J.PELV || hit.joint === J.NECK ? 1 : 0.75);
    const amt = dmg * mult;
    fxBlood(p, d, hit.head ? 18 : 10); Sound.flesh(distToCam(p.x, p.z));
    const wasDead = ch.dead;
    if (ch.ragdoll) { ch.ragdoll.impulse(hit.joint, _v4.copy(d).multiplyScalar(hit.head ? 7 : 5)); ch.ragdoll.restT = 0; }
    else ch.hitJerk(d, hit.head ? 1.1 : 0.7);
    ch.takeDamage(amt, d, src);
    if (ch.dead && !wasDead && ch.ragdoll) ch.ragdoll.impulse(hit.joint, _v4.copy(d).multiplyScalar(6));
    if (!ch.dead && !ch.ragdoll && amt > 40 && chance(0.25)) ch.goRagdoll(_v4.copy(d).multiplyScalar(3), 2);
    return 'char';
  }
  if (hit.type === 'veh') {
    const v = hit.v;
    if (hit.wheel) { v.popTire(hit.wheel); fxSparks(p, 5); }
    else { v.applyDamage(dmg * 0.32, p, d.x, d.z, { radius: 0.35, shot: true }); fxSparks(p, 6, 3); Sound.ping(distToCam(p.x, p.z)); }
    v.wake(); if (src === 'player') v.lastHitByPlayer = game.time;
    if (v.driver && v.driver.ai && !v.driver.dead && v.ai && v.ai.mode === 'drive' && chance(0.5)) { v.ai.cruise = 18; }
    return 'veh';
  }
  if (hit.type === 'static') {
    fxSparks(p, 4, 2.5); fxDust(p, 3, 0.6);
    if (hit.c && hit.c.prop && hit.c.prop.kind === 'lamp') Sound.ping(distToCam(p.x, p.z));
  }
  return hit.type;
}
// ---------------------------------------------------------------- player shooting
const _aimO = new V3(), _aimD = new V3();
function playerAimRay(oOut, dOut) {
  camera.getWorldDirection(dOut);
  oOut.copy(camera.position);
  // start the ray at the player's depth so walls behind the player don't block
  const c = player.ch.center(_v4); const t0 = Math.max(0, _v5.subVectors(c, oOut).dot(dOut) - 0.3);
  oOut.addScaledVector(dOut, t0);
  return oOut;
}
function aimAssist(o, d) {
  let best = null, bs = 0.985;
  for (const ch of chars) {
    if (ch.isPlayer || ch.dead || ch.destroyed || !ch.visible || ch.inside !== player.ch.inside) continue;
    const c = ch.center(_v4); c.y += 0.25; _v5.subVectors(c, o); const dist = _v5.length(); if (dist > 45 || dist < 0.5) continue;
    const dot = _v5.dot(d) / dist; const bonus = ch.ai && ch.ai.mode === 'hostile' ? 0.004 : 0;
    if (dot + bonus > bs) { bs = dot + bonus; best = c.clone(); }
  }
  if (best) d.subVectors(best, o).normalize();
}
function playerShoot() {
  const w = player.weapon, W = WEAPONS[w], inv = player.weapons[w];
  if (inv.mag <= 0) { if (inv.ammo > 0) startReload(); else { Sound.click(); UI.toast('Out of ammo'); } return; }
  inv.mag--;
  playerAimRay(_aimO, _aimD);
  if (settings.mobile || player.state === 'driving') aimAssist(_aimO, _aimD);
  const sp = W.spread * (player.state === 'driving' ? 1.6 : 1) * (player.ch.anim.speed > 2 ? 1.8 : 1) * (input.aim || player.aimHold > 0 ? 1 : 1.5);
  _aimD.x += rand(-sp, sp); _aimD.y += rand(-sp, sp); _aimD.z += rand(-sp, sp); _aimD.normalize();
  const hit = castBullet(_aimO, _aimD, W.range, player.ch, player.car);
  const muzzle = player.state === 'driving' ? _v3.copy(player.ch.joints[J.HEAD]).addScaledVector(_aimD, 0.6) : _v3.copy(player.ch.joints[J.RHA]).addScaledVector(_aimD, w === 'rifle' ? 0.6 : 0.22);
  FX.tracers.add(muzzle, hit.point);
  for (let i = 0; i < 4; i++) FX.glow.spawn(muzzle.x, muzzle.y, muzzle.z, _aimD.x * rand(1, 4), _aimD.y * rand(1, 4), _aimD.z * rand(1, 4), rand(0.12, 0.25), 0.06, 1, 0.8, 0.4, 1);
  flashLight(muzzle, 0.6);
  Sound.shot(w, 0);
  player.recoil += w === 'rifle' ? 0.012 : 0.03;
  const r = applyBulletHit(hit, _aimD, W.dmg, 'player');
  if (r === 'char' && hit.ch.ai) hit.ch.ai.lastHitBy = 'player';
  pedsPanic(player.ch.pos, 38, player.ch.pos);
  player.aimHold = 1.2;
  if (inv.mag === 0 && inv.ammo > 0) startReload();
}
function startReload() {
  const w = player.weapon; if (w === 'fist') return; const inv = player.weapons[w];
  if (inv.mag >= WEAPONS[w].mag || inv.ammo <= 0 || player.reloadT > 0) return;
  player.reloadT = WEAPONS[w].reload; Sound.click(); Sound.tone({ f: 600, dur: 0.05, type: 'square', gain: 0.06, delay: 0.3 });
}
function finishReload() {
  const w = player.weapon; const inv = player.weapons[w]; const need = WEAPONS[w].mag - inv.mag, take = Math.min(need, inv.ammo);
  inv.mag += take; inv.ammo -= take; Sound.tone({ f: 900, dur: 0.05, type: 'square', gain: 0.07 });
}
function playerPunch() {
  const ch = player.ch; ch.anim.punch = 1;
  const f = _v1.set(Math.sin(ch.yaw), 0, Math.cos(ch.yaw));
  let best = null, bd = 1.6;
  for (const o of chars) {
    if (o === ch || o.dead || o.vehicle || o.destroyed || o.inside !== ch.inside) continue;
    const c = o.ragdoll ? o.ragdoll.p[J.PELV] : o.pos;
    const dx = c.x - ch.pos.x, dz = c.z - ch.pos.z, d = Math.hypot(dx, dz);
    if (d < bd && (dx * f.x + dz * f.z) / (d || 1) > 0.5) { bd = d; best = o; }
  }
  setTimeout(() => {
    if (!best || best.dead) { Sound.burst({ dur: 0.08, f: 500, type: 'bandpass', gain: 0.15 }); return; }
    Sound.punch(0);
    best.punches = (best.punches || 0) + 1;
    best.hitJerk(f, 1.2); best.stumbleT = 0.5; best.vel.set(f.x * 2, 0, f.z * 2);
    best.takeDamage(WEAPONS.fist.dmg, f, 'player');
    if (!best.dead && (best.punches >= 3 || chance(0.15))) { best.goRagdoll(_v4.copy(f).multiplyScalar(3.5).add(_v5.set(0, 1.5, 0)), 2); best.punches = 0; }
    if (best.ai && best.ai.mode !== 'hostile') pedFlee(best, ch.pos);
  }, 140);
}
// ---------------------------------------------------------------- NPC shooting
function npcShoot(ch, tgt, d) {
  const muzzle = _v2.copy(ch.joints[J.RHA]);
  const dir = _v3.subVectors(tgt, muzzle).normalize();
  let acc = clamp(0.62 - d * 0.009, 0.12, 0.6);
  if (player.state === 'driving' && player.car && player.car.speed > 8) acc *= 0.45;
  if (player.ch.anim.speed > 3) acc *= 0.65;
  const hitPlayer = Math.random() < acc;
  if (!hitPlayer) { dir.x += rand(-0.06, 0.06); dir.y += rand(-0.03, 0.05); dir.z += rand(-0.06, 0.06); dir.normalize(); }
  const hit = castBullet(muzzle, dir, 90, ch, null);
  FX.tracers.add(muzzle, hit.point, 1, 0.7, 0.4);
  FX.glow.spawn(muzzle.x, muzzle.y, muzzle.z, 0, 0, 0, 0.2, 0.06, 1, 0.8, 0.4, 1);
  flashLight(muzzle, 0.4);
  Sound.shot(ch.weapon === 'rifle' ? 'rifle' : 'pistol', distToCam(muzzle.x, muzzle.z));
  const dmg = ch.weapon === 'rifle' ? 8 : 9;
  if (hit.type === 'char' && hit.ch.isPlayer) { playerHurt(dmg * (hit.head ? 1.8 : 1), dir); fxBlood(hit.point, dir, 6); if (!player.ch.ragdoll) player.ch.hitJerk(dir, 0.5); }
  else if (hit.type === 'veh' && hit.v === player.car && player.state === 'driving') { applyBulletHit(hit, dir, dmg, 'npc'); if (chance(0.25)) playerHurt(dmg * 0.6, dir); }
  else applyBulletHit(hit, dir, dmg, 'npc');
}
