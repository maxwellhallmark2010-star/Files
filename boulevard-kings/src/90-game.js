// ============================================================================
//  GAME — player, cameras, HUD, minimap, shops, spawner, saves, main loop
// ============================================================================
const player = {
  ch: null, state: 'foot', car: null, lastCar: null, homeCar: null, money: 500, armor: 0,
  weapons: { fist: { owned: true, mag: 0, ammo: 0 }, pistol: { owned: false, mag: 0, ammo: 0 }, rifle: { owned: false, mag: 0, ammo: 0 } },
  weapon: 'fist', fireCD: 0, reloadT: 0, triggerHeld: false, aimHold: 0, recoil: 0,
  camYaw: 0, camPitch: -0.12, orbitYaw: 0, orbitPitch: 0, orbitT: 0, chaseYaw: 0, seq: null, inside: null, deadT: 0, hurtFlash: 0,
  outfit: { shirt: 0xf2f2f2, pants: 0x2b3a67, hat: null }, waypoint: null
};
const PLAYER_COLORS = () => ({ skin: 0xc68642, shirt: player.outfit.shirt, pants: player.outfit.pants, shoes: 0xf2f2f2, hair: 0x111111, hat: player.outfit.hat });
function playerAlive() { return player.ch && !player.ch.dead; }
function playerAimPoint(out) {
  if (player.state === 'driving' && player.car) return out.copy(player.car.pos).setY(player.car.root.position.y + 1.1);
  return player.ch.center(out).setY(player.ch.center(out).y + 0.25);
}
function keyHint(k, m) { return settings.mobile ? m : k; }
let pendingAction = null;
function promptAction(html, fn) { if (!pendingAction) pendingAction = { html, fn }; }
function heal(n) { player.ch.health = Math.min(100, player.ch.health + n); }

// ---------------------------------------------------------------- player damage / death
function playerHurt(n, dir) {
  if (!playerAlive() || n <= 0) return;
  if (player.armor > 0) { const a = Math.min(player.armor, n * 0.7); player.armor -= a; n -= a * 0.85; }
  player.ch.takeDamage(n, dir, 'npc');
  player.hurtFlash = Math.min(1, player.hurtFlash + 0.35 + n * 0.02);
  if (player.ch.dead) playerDied();
}
function playerDied() {
  if (player.state === 'dead') return;
  const ch = player.ch;
  if (player.state === 'driving' && player.car) { const v = player.car; leaveSeat(v); ch.goRagdoll(_v1.copy(v.vel).add(_v2.set(0, 2, 0)), 2); }
  if (!ch.ragdoll) ch.goRagdoll(_v1.set(0, 0, 0), 1);
  player.state = 'dead'; player.deadT = 0; player.car = null;
  Sound.horn(false); Sound.engine(false, 0, 0);
  if (mission.active) endMission(false, 'You were hospitalized.');
  setTimeout(() => UI.big('HOSPITALIZED', 'Medical bills: $' + Math.min(player.money, 100), 3.5, 'fail'), 900);
}
function playerExplodedInCar(v) {
  if (player.car !== v || player.state !== 'driving') return;
  const ch = player.ch; leaveSeat(v);
  ch.goRagdoll(_v1.set(rand(-4, 4), 9, rand(-4, 4)).add(v.vel), 8);
  player.state = 'ragdoll'; player.car = null; player.lastCar = v;
  playerHurt(500, null);
}
async function respawn() {
  await fadeTo(true, 500);
  const ch = player.ch, d = PLACES.hospital.door;
  ch.ragdoll = null; ch.dead = false; ch.health = 100; ch.blend = null; ch.getupT = 0; ch.anim.crouch = 0; ch.anim.slump = 0;
  ch.pos.set(d.x, CURB, d.z); ch.yaw = Math.atan2(d.nx, d.nz); ch.vel.set(0, 0, 0);
  player.money = Math.max(0, player.money - 100); player.armor = 0; player.state = 'foot'; player.camYaw = ch.yaw; player.hurtFlash = 0;
  ch.updatePose(0.016);
  await fadeTo(false, 500);
}
function onPlayerHitByCar(v, rel) {
  if (player.ch.dead) { playerDied(); return; }
  if (player.ch.ragdoll && player.state === 'foot') player.state = 'ragdoll';
  player.hurtFlash = Math.min(1, player.hurtFlash + 0.4);
}
// ---------------------------------------------------------------- seats & enter / exit
const _sm = new THREE.Matrix4();
function seatCharacter(ch, v) {
  if (!ch.sitMatrix) ch.sitMatrix = new THREE.Matrix4();
  v.seatMatrix(ch.sitMatrix);
  const a = ch.anim;
  if (v.T.bike) {
    a.reach = v.bar.localToWorld(_v1.set(-0.31, 0, 0)); a.reach = a.reach.clone(); a.reachPole = _v2.set(0, -1, 0).clone();
    a.reachL = v.bar.localToWorld(_v1.set(0.31, 0, 0)).clone(); a.reachPoleL = a.reachPole;
    if (v.crank) { a.footL = v.crank.localToWorld(_v1.set(0.1, 0.18, 0)).clone(); a.footR = v.crank.localToWorld(_v1.set(-0.1, -0.18, 0)).clone(); }
    else { a.footL = v.localToWorld(0.2, 0.42, -0.02).clone(); a.footR = v.localToWorld(-0.2, 0.42, -0.02).clone(); }
  } else if (ch.anim.slump) { a.reach = a.reachL = null; a.footL = a.footR = null; }
  else {
    const sw = v.steerWheel;
    a.reach = sw.localToWorld(_v1.set(-0.15, 0.08, -0.02)).clone(); a.reachL = sw.localToWorld(_v1.set(0.15, 0.08, -0.02)).clone();
    const s = Math.sin(v.h), c = Math.cos(v.h);
    a.reachPole = new V3(-c * 0.6, -1, s * 0.6); a.reachPoleL = new V3(c * 0.6, -1, -s * 0.6);
    a.footL = a.footR = null;
    if (ch.driveBy && ch.aimDir) { a.reach = ch.joints[J.RSH].clone().addScaledVector(ch.aimDir, 0.55); a.reachPole = new V3(0, -1, 0); }
  }
}
function clearReach(ch) { const a = ch.anim; a.reach = a.reachL = a.footL = a.footR = null; }
function nearestEnterable() {
  const p = player.ch.pos; let best = null, bd = 9;
  for (const v of vehicles) {
    if (v.exploded || v.destroyed || (v.driver && v.driver.isPlayer)) continue;
    if (v.ai && v.ai.mode === 'race') continue;
    const side = v.sideOf(p);
    const dp = v.doorWorld(_v1, 0.65, side), d1 = Math.hypot(dp.x - p.x, dp.z - p.z), d2 = Math.hypot(v.pos.x - p.x, v.pos.z - p.z) - v.T.len * 0.45;
    const d = Math.min(d1, d2 + 0.6);
    if (d < 2.8 && d < bd && v.speed < 7) { bd = d; best = v; }
  }
  return best;
}
function enterPath(v, from, side) {
  // walk around the nose of the car when the target door is on the far side
  const pts = [from.clone()], T = v.T, s = Math.sin(v.h), c = Math.cos(v.h);
  const w2l = (lx, lz) => new V3(v.pos.x + lx * c + lz * s, 0, v.pos.z - lx * s + lz * c);
  const mySide = v.sideOf(from);
  if (!T.bike && mySide !== side) {
    const lz = ((from.x - v.pos.x) * s + (from.z - v.pos.z) * c) >= 0 ? T.len / 2 + 0.7 : -T.len / 2 - 0.7;
    pts.push(w2l(mySide * (T.wid / 2 + 0.7), lz), w2l(side * (T.wid / 2 + 0.7), lz));
  }
  pts.push(v.doorWorld(new V3(), 0.65, side));
  for (const q of pts) q.y = groundH(q.x, q.z);
  let len = 0; for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
  return { pts, len: Math.max(0.3, len) };
}
function startEnter(v) {
  const ch = player.ch;
  const jack = v.driver && !v.driver.isPlayer ? v.driver : null;
  const side = v.T.bike ? v.sideOf(ch.pos) : (jack ? 1 : v.sideOf(ch.pos));
  player.state = 'entering'; player.seq = { v, t: 0, phase: 'approach', side, path: enterPath(v, ch.pos, side), fromYaw: ch.yaw, jack };
  if (v.ai && v.ai.mode === 'drive') v.wake();
  ch.anim.aim = 0;
}
function updateEntering(dt) {
  const S = player.seq, v = S.v, ch = player.ch, a = ch.anim;
  if (v.destroyed || v.exploded) { player.state = 'foot'; clearReach(ch); return; }
  S.t += dt;
  if (v.ai && v.ai.mode === 'phys' && v.speed > 0.3) v.vel.multiplyScalar(Math.exp(-3 * dt));
  const door = v.doors[S.side > 0 ? 0 : 1];
  const spot = v.doorWorld(_v1, 0.65, S.side); spot.y = groundH(spot.x, spot.z);
  const faceYaw = v.T.bike ? v.h : Math.atan2(-Math.cos(v.h) * S.side, Math.sin(v.h) * S.side);
  if (S.phase === 'approach') {
    const P = S.path.pts, walk = Math.min(S.t * 3.6, S.path.len);
    let acc = 0, pos = P[P.length - 1], dir = null;
    for (let i = 1; i < P.length; i++) { const l = P[i].distanceTo(P[i - 1]); if (acc + l >= walk) { pos = _v2.lerpVectors(P[i - 1], P[i], (walk - acc) / (l || 1)); dir = _v3.subVectors(P[i], P[i - 1]); break; } acc += l; }
    P[P.length - 1].copy(spot);
    ch.pos.copy(pos);
    const done = walk >= S.path.len;
    const tyaw = done || !dir || dir.lengthSq() < 1e-4 ? faceYaw : Math.atan2(dir.x, dir.z);
    ch.yaw += wrapAng(tyaw - ch.yaw) * Math.min(1, dt * 14); a.speed = done ? 0 : 3; a.phase += dt * 8;
    if (done) { ch.yaw = faceYaw; S.phase = v.T.bike ? 'mount' : 'open'; S.t = 0; a.speed = 0; if (v.T.bike) { ch.startBlend(0.5); ch.vehicle = v; ch.seatKind = 'bike'; } }
  } else if (S.phase === 'open') {
    ch.pos.copy(spot); ch.yaw = faceYaw;
    door.handle.updateWorldMatrix(true, false); a.reach = new V3().setFromMatrixPosition(door.handle.matrixWorld); a.reachPole = new V3(0, -1, 0);
    if (S.t > 0.12) door.target = 1;
    if (S.t > 0.5) { S.t = 0; clearReach(ch); if (S.jack) { S.phase = 'jack'; jackDriver(v, S.jack); } else { S.phase = 'getin'; ch.startBlend(S.side > 0 ? 0.65 : 0.9); ch.vehicle = v; ch.seatKind = 'car'; } }
  } else if (S.phase === 'jack') {
    ch.pos.copy(spot); a.reach = S.jack.joints[J.NECK].clone(); a.reachPole = new V3(0, -1, 0);
    if (S.t > 0.55) { S.t = 0; clearReach(ch); S.phase = 'getin'; ch.startBlend(0.65); ch.vehicle = v; ch.seatKind = 'car'; }
  } else if (S.phase === 'getin' || S.phase === 'mount') {
    if (S.t > (S.phase === 'mount' ? 0.5 : (S.side > 0 ? 0.65 : 0.9))) { S.t = 0; if (S.phase === 'mount') finishEnter(v); else { S.phase = 'close'; door.target = 0; } }
  } else if (S.phase === 'close') {
    if (S.t > 0.35) finishEnter(v);
  }
}
function jackDriver(v, d) {
  v.driver = null; d.vehicle = null; d.sitMatrix = null; clearReach(d);
  const out = _v2.set(Math.cos(v.h), 0, -Math.sin(v.h));
  d.pos.copy(v.doorWorld(_v3, 0.3)); d.yaw = v.h;
  d.goRagdoll(_v3.copy(out).multiplyScalar(4.5).add(_v4.set(0, 2.2, 0)), 3);
  if (!d.dead) d.takeDamage(5, out, 'player');
  if (d.ai && !d.dead) d.ai.mode = 'flee', d.ai.threat.copy(player.ch.pos), d.ai.timer = 10;
  Sound.punch(0); UI.toast(d.dead ? 'You dragged the body out.' : 'Carjacked!', 1.4);
}
function finishEnter(v) {
  const ch = player.ch;
  player.state = 'driving'; player.car = v; player.lastCar = v; v.driver = ch; ch.vehicle = v; ch.seatKind = v.T.bike ? 'bike' : 'car';
  v.ai = null; v.parked = false; v.wake && (v.mission = v.mission || false);
  player.chaseYaw = v.h; player.orbitYaw = 0; player.orbitPitch = 0;
  UI.toast(`<b>${v.T.name}</b>`, 1.8);
  if (v.T.hydraulics) UI.toast(`<b>${v.T.name}</b> · hydraulics: <b>${keyHint('H', 'HOP')}</b>`, 2.6);
}
function leaveSeat(v) {
  const ch = player.ch;
  v.driver = null; ch.vehicle = null; ch.sitMatrix = null; clearReach(ch); ch.hideHead = false;
  v.ai = { mode: 'phys', wakeT: 0 };
  Sound.engine(false, 0, 0); Sound.horn(false); Sound.setGain(Sound.skid.g, 0);
}
function startExit() {
  const v = player.car, ch = player.ch;
  if (v.speed > 9) { // bail out of a moving car
    const out = _v2.set(Math.cos(v.h), 0, -Math.sin(v.h));
    ch.joints.forEach(j => j.addScaledVector(out, v.T.bike ? 0.2 : 0.9));
    leaveSeat(v); if (v.doors[0]) v.doors[0].target = 1;
    ch.goRagdoll(_v1.copy(v.vel).multiplyScalar(0.8).addScaledVector(out, 3).add(_v3.set(0, 1.5, 0)), 3);
    playerHurt(Math.max(0, v.speed - 10) * 1.5, out);
    if (!ch.dead) player.state = 'ragdoll';
    player.car = null; setTimeout(() => { if (v.doors[0] && v.driver === null) v.doors[0].target = 0; }, 1500);
    return;
  }
  player.state = 'exiting'; player.seq = { v, t: 0, phase: v.T.bike ? 'dismount' : 'open' };
}
function updateExiting(dt) {
  const S = player.seq, v = S.v, ch = player.ch; S.t += dt;
  v.vel.multiplyScalar(Math.exp(-4 * dt));
  const door = v.doors[0];
  if (S.phase === 'open') { if (door) door.target = 1; if (S.t > 0.35) { S.phase = 'getout'; S.t = 0; ch.startBlend(0.6); leaveSeat(v); const sp = v.doorWorld(_v1); ch.pos.set(sp.x, groundH(sp.x, sp.z), sp.z); ch.yaw = v.h + Math.PI / 2 * 0.3; } }
  else if (S.phase === 'dismount') { if (S.t > 0.05) { ch.startBlend(0.45); leaveSeat(v); const sp = v.doorWorld(_v1); ch.pos.set(sp.x, groundH(sp.x, sp.z), sp.z); ch.yaw = v.h; S.phase = 'done'; S.t = 0; } }
  else if (S.phase === 'getout') { if (S.t > 0.6) { S.phase = 'close'; S.t = 0; if (door) door.target = 0; } }
  else if (S.t > 0.3) { player.state = 'foot'; player.car = null; player.camYaw = ch.yaw; }
}
function onPlayerCarImpact(v, dv, inX, inZ, force) {
  if (player.state !== 'driving' || player.car !== v) return;
  const T = v.T, f = v.fwd(_v1);
  const frontal = (f.x * inX + f.z * inZ) < -0.45;
  const thr = T.bike ? 8.5 : 19;
  if (force || (dv > thr && (frontal || T.bike || dv > thr * 1.45))) ejectPlayer(v, dv);
  else if (dv > 9) playerHurt((dv - 9) * (T.bike ? 3 : 1.2), null);
}
function ejectPlayer(v, dv) {
  const ch = player.ch, T = v.T;
  const pre = v.prevVel.clone(); const sp = Math.max(pre.length(), dv);
  if (!T.bike && v.windshield) v.breakGlass(v.windshield);
  leaveSeat(v);
  const f = v.fwd(_v1);
  for (const j of ch.joints) { j.addScaledVector(f, T.bike ? 0.3 : 0.7); j.y += T.bike ? 0.4 : 0.45; }
  const vel = pre.multiplyScalar(0.95).add(_v2.set(0, 2.2 + sp * 0.12, 0)).addScaledVector(f, 1.5);
  ch.goRagdoll(vel, 3 + sp * 0.35); ch.ignoreVehicle = v; ch.ignoreT = 0.8;
  ch.ragdoll.flail = 2.4;
  player.state = 'ragdoll'; player.car = null; player.lastCar = v;
  game.slowmo = 0.9; game.shake = 1.2;
  UI.toast(T.bike ? 'Thrown off the bike!' : 'Through the windshield!', 2);
  playerHurt(Math.max(0, sp - 11) * 3.2, f);
  if (v.T.bike) v.fallen = true;
}
// ---------------------------------------------------------------- on-foot update
function updatePlayerFoot(dt) {
  const ch = player.ch, a = ch.anim;
  if (ch.ragdoll) { player.state = ch.dead ? 'dead' : 'ragdoll'; return; }
  if (ch.getupT > 0) { a.speed = 0; return; }
  const mx = input.moveX, my = input.moveY, mag = Math.min(1, Math.hypot(mx, my));
  const cy = player.camYaw, fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
  let wx = fx * my + rx * mx, wz = fz * my + rz * mx; const wl = Math.hypot(wx, wz) || 1; wx /= wl; wz /= wl;
  const armed = player.weapon !== 'fist';
  const aiming = armed && (input.aim || player.aimHold > 0 || (settings.mobile && input.fire));
  const sp = mag < 0.05 ? 0 : (aiming ? 2.2 : (input.sprint ? 5.8 : (settings.mobile ? 1.4 + mag * 1.4 : 2.3))) * (settings.mobile && !aiming && !input.sprint ? 1 : mag);
  const k = 1 - Math.exp(-(ch.onGround ? 12 : 2.5) * dt);
  ch.vel.x = lerp(ch.vel.x, wx * sp, k); ch.vel.z = lerp(ch.vel.z, wz * sp, k);
  if (input.pressed.has('jump') && ch.onGround) { ch.vy = 4.6; ch.onGround = false; }
  ch.vy -= 9.8 * dt; ch.pos.y += ch.vy * dt;
  ch.pos.x += ch.vel.x * dt; ch.pos.z += ch.vel.z * dt;
  const gh = groundH(ch.pos.x, ch.pos.z);
  if (ch.pos.y <= gh) { if (!ch.onGround && ch.vy < -9) playerHurt((-ch.vy - 9) * 6, null); ch.pos.y = gh; ch.vy = 0; ch.onGround = true; }
  else if (ch.pos.y > gh + 0.3) ch.onGround = false;
  pushOutCircle(ch.pos, 0.32, ch.pos.y + 0.5);
  // solid vehicles
  for (const v of vehicles) {
    const dx = ch.pos.x - v.pos.x, dz = ch.pos.z - v.pos.z, R = v.T.len / 2 + 1; if (dx * dx + dz * dz > R * R) continue;
    if (v.speed > 2.6) continue; // fast cars are handled as hits
    const f = v.fwd(_v1), lf = dx * f.x + dz * f.z, ll = dx * f.z - dz * f.x, hl = v.T.len / 2 + 0.3, hw = (v.T.bike ? 0.35 : v.T.wid / 2) + 0.3;
    if (Math.abs(lf) < hl && Math.abs(ll) < hw) {
      if (ch.pos.y > v.root.position.y + v.T.ride + v.cabTop - 0.3) { ch.pos.y = v.root.position.y + v.T.ride + v.cabTop; ch.vy = 0; ch.onGround = true; continue; }
      const pf = hl - Math.abs(lf), pl = hw - Math.abs(ll);
      if (pf < pl) { const s = Math.sign(lf); ch.pos.x += f.x * s * pf; ch.pos.z += f.z * s * pf; } else { const s = Math.sign(ll); ch.pos.x += f.z * s * pl; ch.pos.z += -f.x * s * pl; }
    }
  }
  // facing & anim
  const hs = Math.hypot(ch.vel.x, ch.vel.z);
  if (aiming) ch.yaw += wrapAng(cy - ch.yaw) * Math.min(1, dt * 18);
  else if (hs > 0.3) ch.yaw += wrapAng(Math.atan2(ch.vel.x, ch.vel.z) - ch.yaw) * Math.min(1, dt * 11);
  a.speed = ch.onGround ? hs : 0; a.phase += hs * dt * (hs > 3 ? 2.3 : 3.3);
  a.crouch = ch.onGround ? 0 : 0.25;
  a.aim = lerp(a.aim, aiming ? 1 : 0, Math.min(1, dt * 14)); a.aimPitch = player.camPitch + 0.1; a.rifle = player.weapon === 'rifle';
  ch.aimDir = camera.getWorldDirection(ch.aimDir || new V3());
  // weapons
  updatePlayerWeapon(dt);
  // interactions
  const v = nearestEnterable();
  if (v) promptAction(`<b>${keyHint('F', 'ENTER')}</b> ${v.driver && !v.driver.dead ? 'Jack' : 'Get in'} <b>${v.T.name}</b>`, null);
  if (input.pressed.has('enter') && v) { startEnter(v); return; }
  for (const s of STORES) {
    if (Math.hypot(ch.pos.x - s.door.x, ch.pos.z - s.door.z) < 1.9) promptAction(`<b>${keyHint('E', 'USE')}</b> Enter <b>${s.name}</b>`, () => enterStore(s));
  }
}
function updatePlayerWeapon(dt) {
  if (player.reloadT > 0) { player.reloadT -= dt; if (player.reloadT <= 0) finishReload(); }
  player.fireCD -= dt; player.aimHold = Math.max(0, player.aimHold - dt);
  if (input.pressed.has('weapon')) cycleWeapon();
  for (const [k, w] of [['w1', 'fist'], ['w2', 'pistol'], ['w3', 'rifle']]) if (input.pressed.has(k) && player.weapons[w].owned) setWeapon(w);
  if (input.pressed.has('reload')) startReload();
  if (!input.fire) { player.triggerHeld = false; return; }
  const W = WEAPONS[player.weapon];
  if (!W.auto && player.triggerHeld) return;
  if (player.fireCD > 0 || player.reloadT > 0) return;
  player.triggerHeld = true; player.fireCD = 1 / W.rate;
  if (player.weapon === 'fist') { if (player.state === 'foot') playerPunch(); return; }
  playerShoot();
}
function setWeapon(w) { player.weapon = w; equipGun(player.ch, w); player.reloadT = 0; Sound.click(); }
function cycleWeapon() { const order = ['fist', 'pistol', 'rifle'].filter(w => player.weapons[w].owned); const i = order.indexOf(player.weapon); setWeapon(order[(i + 1) % order.length]); }

// ---------------------------------------------------------------- driving update
function updatePlayerDriving(dt) {
  const v = player.car; if (!v || v.destroyed) { player.state = 'foot'; player.car = null; return; }
  if (input.pressed.has('enter')) { startExit(); return; }
  if (input.pressed.has('hop') && v.T.hydraulics && v.hopCD <= 0) {
    v.hopCD = 0.4; v.susp.vy += 4.2; v.susp.vp += (input.brake ? -2.4 : (input.throttle ? 2.4 : 0)); v.susp.vr += input.steer * 2.5; Sound.hop();
    if (mission.active && mission.active.onHop) mission.active.onHop(mission.S);
  }
  Sound.horn(input.horn);
  if (input.horn) for (const p of peds) if (!p.dead && p.ai && p.ai.mode === 'walk' && p.pos.distanceToSquared(v.pos) < 225 && chance(0.02)) pedScare(p, v.pos);
  const deep = v.T.deep || v.T.id === 'pickup' || v.T.id === 'bus';
  Sound.engine(v.health > 0 && !v.T.bicycle, v.rpm, v.throttleVis || 0, deep);
  Sound.setGain(Sound.skid.g, v.T.bicycle ? 0 : clamp((v.slip - 3.4) / 6, 0, 1) * 0.22 * (v.speed > 3 ? 1 : 0), 0.05);
  pedDodge(v);
  player.ch.aimDir = camera.getWorldDirection(player.ch.aimDir || new V3());
  if (player.weapon !== 'fist') { player.ch.driveBy = input.fire || player.aimHold > 0; updatePlayerWeapon(dt); }
  else { player.ch.driveBy = false; if (input.pressed.has('weapon')) cycleWeapon(); }
  // garage
  const g = PLACES.garage.curb;
  if (Math.hypot(v.pos.x - g.x, v.pos.z - g.z) < 5.5 && v.speed < 5 && !v.T.bicycle) promptAction(`<b>${keyHint('E', 'USE')}</b> Repair &amp; respray <b>$150</b>`, () => repairCar(v));
}
async function repairCar(v) {
  if (player.money < 150) { UI.toast('Repairs cost $150. Come back with cash.'); return; }
  player.money -= 150; Sound.cash();
  await fadeTo(true, 400);
  const T = v.T, col = pick(T.colors.length > 1 ? T.colors.filter(c => c !== v.color) : T.colors);
  const nv = new Vehicle(T.id, v.pos.x, v.pos.z, v.h, col);
  nv.mission = v.mission;
  if (mission.active && mission.S && mission.S.car === v) mission.S.car = nv;
  if (player.homeCar === v) player.homeCar = nv;
  const ch = player.ch; v.driver = null; v.destroy();
  nv.driver = ch; ch.vehicle = nv; player.car = nv; player.lastCar = nv; nv.ai = null;
  await fadeTo(false, 400);
  UI.toast('Good as new. Fresh paint, no questions.');
}
// ---------------------------------------------------------------- stores & shops
async function enterStore(s) {
  await fadeTo(true, 300);
  const I = buildInterior(s); I.grp.visible = true; populateInterior(I);
  const ch = player.ch; ch.pos.copy(I.entry); ch.yaw = 0; ch.vel.set(0, 0, 0); ch.inside = s.id; player.inside = I; player.camYaw = 0; player.camPitch = -0.15;
  player.state = 'foot';
  for (const p of peds) if (!p.inside) p.visible = false;
  for (const v of vehicles) v.root.visible = false;
  await fadeTo(false, 300);
  UI.toast(`<b>${s.name}</b>`, 1.6);
}
async function exitStore() {
  const I = player.inside; if (!I) return; closeShop();
  await fadeTo(true, 300);
  clearInterior(I); I.grp.visible = false;
  const d = I.store.door, ch = player.ch;
  ch.pos.set(d.x + d.nx * 0.4, CURB, d.z + d.nz * 0.4); ch.yaw = Math.atan2(d.nx, d.nz); ch.inside = undefined; player.inside = null; player.camYaw = ch.yaw;
  for (const p of peds) p.visible = true;
  for (const v of vehicles) v.root.visible = true;
  await fadeTo(false, 300);
}
const OUTFITS = [
  { n: 'Classic White Tee', shirt: 0xf2f2f2, pants: 0x2b3a67, hat: null },
  { n: 'Flannel & Khakis', shirt: 0x2a4a8a, pants: 0xb59f6a, hat: null },
  { n: 'All Black Everything', shirt: 0x151515, pants: 0x151515, hat: 0x151515 },
  { n: 'Red Jersey Fit', shirt: 0xc0281e, pants: 0x1e1e1e, hat: 0xc0281e },
  { n: 'Green Track Suit', shirt: 0x1e7d32, pants: 0x1e7d32, hat: null },
  { n: 'Gold & Black', shirt: 0xf1c40f, pants: 0x1e1e1e, hat: 0x111111 }
];
function shopItems(type) {
  const W = player.weapons;
  if (type === 'mart') return [
    { n: 'Hot Dog', p: 5, d: '+25 health', f: () => heal(25) }, { n: 'Soda', p: 2, d: '+10 health', f: () => heal(10) },
    { n: 'Energy Drink', p: 8, d: '+40 health', f: () => heal(40) },
    { n: 'Scratch Ticket', p: 10, d: '1 in 8 wins $250', f: () => { if (chance(1 / 8)) { player.money += 250; UI.toast('WINNER! +$250'); Sound.jingle(); } else UI.toast('Not a winner.'); } }];
  if (type === 'diner') return [{ n: 'Burger Combo', p: 12, d: 'Full health', f: () => heal(100) }, { n: 'Tacos (3)', p: 6, d: '+50 health', f: () => heal(50) }, { n: 'Coffee', p: 3, d: '+15 health', f: () => heal(15) }];
  if (type === 'guns') return [
    { n: W.pistol.owned ? 'Pistol (owned)' : 'Pistol', p: 400, d: '12-round semi-auto, +36 rounds', dis: W.pistol.owned, f: () => { W.pistol.owned = true; W.pistol.mag = 12; W.pistol.ammo += 36; setWeapon('pistol'); } },
    { n: 'Pistol Ammo', p: 60, d: '+36 rounds', dis: !W.pistol.owned, f: () => { W.pistol.ammo += 36; } },
    { n: W.rifle.owned ? 'Assault Rifle (owned)' : 'Assault Rifle', p: 2000, d: '30-round full-auto, +90 rounds', dis: W.rifle.owned, f: () => { W.rifle.owned = true; W.rifle.mag = 30; W.rifle.ammo += 90; setWeapon('rifle'); } },
    { n: 'Rifle Ammo', p: 150, d: '+90 rounds', dis: !W.rifle.owned, f: () => { W.rifle.ammo += 90; } },
    { n: 'Body Armor', p: 250, d: 'Absorbs most bullet damage', f: () => { player.armor = 100; } }];
  if (type === 'clothes') return OUTFITS.map(o => ({ n: o.n, p: 60, d: 'Swap your fit', sw: o, f: () => { player.outfit = { shirt: o.shirt, pants: o.pants, hat: o.hat }; player.ch.colors = PLAYER_COLORS(); } }));
  return [];
}
let shopOpen = null;
function openShop(store) {
  shopOpen = store; const el = $('shop'); el.hidden = false; $('shopTitle').textContent = store.name; renderShop(); releaseAllTouches();
  if (document.exitPointerLock && mouse.locked) document.exitPointerLock();
}
function renderShop() {
  const list = $('shopList'); list.innerHTML = '';
  shopItems(shopOpen.type).forEach((it, i) => {
    const row = document.createElement('div'); row.className = 'shopRow';
    const sw = it.sw ? `<span class="sw" style="background:#${it.sw.shirt.toString(16).padStart(6, '0')}"></span>` : '';
    row.innerHTML = `<div class="si">${sw}<div><b>${it.n}</b><small>${it.d}</small></div></div>`;
    const b = document.createElement('button'); b.className = 'buy'; b.textContent = '$' + it.p; b.id = 'buy' + i;
    b.disabled = !!it.dis || player.money < it.p;
    b.onclick = () => { if (player.money < it.p || it.dis) return; player.money -= it.p; it.f(); Sound.cash(); renderShop(); };
    row.appendChild(b); list.appendChild(row);
  });
  $('shopMoney').textContent = '$' + player.money;
}
function closeShop() { shopOpen = null; $('shop').hidden = true; }
$('shopClose').onclick = closeShop;
function updateInterior(dt) {
  const I = player.inside, ch = player.ch;
  if (Math.hypot(ch.pos.x - I.exit.x, ch.pos.z - I.exit.z) < 1.3) promptAction(`<b>${keyHint('E', 'USE')}</b> Leave`, exitStore);
  if (Math.hypot(ch.pos.x - I.shop.x, ch.pos.z - I.shop.z) < 1.6) { const clerk = I.npcs[0]; if (clerk && !clerk.dead && clerk.ai.mode === 'clerk') promptAction(`<b>${keyHint('E', 'USE')}</b> Shop`, () => openShop(I.store)); }
  showMarker(I.exit, 0.7, 0x40c0ff, 1.2); showMarker(I.shop, 0.8, 0x40ff90, 1.2);
  const clerk = I.npcs[0];
  if (clerk && I.store.type === 'guns' && !clerk.dead && (clerk.ai.mode === 'cower' || clerk.health < 100)) { clerk.ai.mode = 'hostile'; clerk.hideGun = false; clerk.ai.alerted = true; }
}
// ---------------------------------------------------------------- home car
function spawnHomeCar(color) {
  const c = PLACES.safehouse.curb;
  const along = c.z - 8, v = new Vehicle('lowrider', c.x, along, 0, color != null ? color : 0x6b1fa3);
  v.ai = { mode: 'parked' }; v.mission = true; player.homeCar = v; return v;
}

// ---------------------------------------------------------------- spawner
let spawnT = 0;
const TRAFFIC_MIX = [['sedan', 26], ['taxi', 9], ['pickup', 10], ['van', 7], ['bus', 3], ['muscle', 7], ['charger', 7], ['challenger', 7], ['classic57', 6], ['lowrider', 7], ['motorbike', 6], ['bmx', 2]];
function pickType(mix = TRAFFIC_MIX) { const tot = mix.reduce((s, m) => s + m[1], 0); let r = Math.random() * tot; for (const [t, w] of mix) { r -= w; if (r <= 0) return t; } return 'sedan'; }
function offscreen(x, z, minD) { const cp = camera.position, dx = x - cp.x, dz = z - cp.z, d = Math.hypot(dx, dz); if (d < minD) return false; camera.getWorldDirection(_v5); return (dx * _v5.x + dz * _v5.z) / d < 0.35 || d > 120; }
function updateSpawner(dt, focus) {
  if (player.inside) return;
  spawnT -= dt; if (spawnT > 0) return; spawnT = 0.2;
  const hi = settings.quality === 'high';
  const maxCars = hi ? 22 : 14, maxParked = hi ? 9 : 6, maxPeds = hi ? 34 : 22;
  let traffic = 0, parked = 0;
  for (let i = vehicles.length - 1; i >= 0; i--) {
    const v = vehicles[i];
    if (v.mission || v === player.car || v === player.homeCar || (v === player.lastCar && distToCam(v.pos.x, v.pos.z) < 260)) continue;
    const d = Math.hypot(v.pos.x - focus.x, v.pos.z - focus.z);
    const isTraffic = v.ai && v.ai.mode === 'drive';
    if (d > (isTraffic ? 200 : 170) || (v.exploded && d > 90) || (v.ai && v.ai.mode === 'phys' && !v.driver && d > 140)) { if (d > 60 && offscreen(v.pos.x, v.pos.z, 60)) { v.destroy(); continue; } }
    if (isTraffic) traffic++; else if (v.ai && v.ai.mode === 'parked') parked++;
  }
  if (traffic < maxCars) {
    for (let tries = 0; tries < 6; tries++) {
      const axis = chance(0.5) ? 'x' : 'z';
      const fixedNear = axis === 'x' ? focus.z : focus.x, alongNear = axis === 'x' ? focus.x : focus.z;
      const roadK = clamp(Math.round((fixedNear + HALF) / PITCH) + randi(-2, 2), 0, NB);
      const along = clamp(alongNear + rand(-150, 150), -HALF + 4, HALF - 4);
      const nodeD = Math.abs(((along + HALF) % PITCH + PITCH) % PITCH); if (nodeD < RH + 4 || nodeD > PITCH - RH - 4) continue;
      const dir = chance(0.5) ? 1 : -1, lane = chance(0.5) ? 0 : 1;
      const x = axis === 'x' ? along : laneFixed(axis, roadK, dir, lane), z = axis === 'x' ? laneFixed(axis, roadK, dir, lane) : along;
      const d = Math.hypot(x - focus.x, z - focus.z); if (d < 55 || d > 165) continue;
      if (!offscreen(x, z, 50)) continue;
      if (vehicles.some(o => Math.hypot(o.pos.x - x, o.pos.z - z) < 14)) continue;
      let t = pickType(); if (t === 'bus' && lane === 0) t = 'sedan';
      spawnTrafficCar(t, axis, roadK, dir, lane, along);
      break;
    }
  }
  if (parked < maxParked && chance(0.5)) {
    const axis = chance(0.5) ? 'x' : 'z', roadK = clamp(Math.round(((axis === 'x' ? focus.z : focus.x) + HALF) / PITCH) + randi(-1, 1), 0, NB);
    const along = (axis === 'x' ? focus.x : focus.z) + rand(-120, 120), nodeD = Math.abs(((along + HALF) % PITCH + PITCH) % PITCH);
    if (nodeD > RH + 15 && nodeD < PITCH - RH - 15 && Math.abs(along) < HALF) {
      const s = chance(0.5) ? 1 : -1, fixed = rp(roadK) + s * 8.0;
      const x = axis === 'x' ? along : fixed, z = axis === 'x' ? fixed : along;
      const dir = axis === 'x' ? s : -s;
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d > 45 && d < 140 && offscreen(x, z, 40) && !vehicles.some(o => Math.hypot(o.pos.x - x, o.pos.z - z) < 7) && Math.abs(fixed) < WALL - 3) {
        const v = new Vehicle(pickType(TRAFFIC_MIX.filter(m => m[0] !== 'bus' && m[0] !== 'bmx')), x, z, axisHeading(axis, dir));
        v.ai = { mode: 'parked' }; v.parkedSpawn = true;
      }
    }
  }
  // peds
  let walkers = 0;
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i]; if (p.vehicle || p.inside || p.ai.mode === 'driving') continue;
    const c = p.ragdoll ? p.ragdoll.p[J.PELV] : p.pos;
    const d = Math.hypot(c.x - focus.x, c.z - focus.z);
    if (p.dead) { p.removeT -= 0.2; if ((p.removeT < 0 || d > 120) && offscreen(c.x, c.z, 30) && !p.mission) { removePed(p); continue; } }
    else if (!p.mission && d > 135 && offscreen(c.x, c.z, 60)) { removePed(p); continue; }
    if (!p.dead) walkers++;
  }
  // orphaned drivers (their car got despawned)
  for (let i = peds.length - 1; i >= 0; i--) { const p = peds[i]; if (p.ai.mode === 'driving' && (!p.vehicle || p.vehicle.destroyed)) removePed(p); }
  if (walkers < maxPeds) {
    for (let tries = 0; tries < 5; tries++) {
      const b = blockOf(focus.x + rand(-110, 110), focus.z + rand(-110, 110)); if (b.i < 0 || b.j < 0 || b.i >= NB || b.j >= NB) continue;
      const cs = blockCorners(b.i, b.j), k = randi(0, 3), p = new V3().lerpVectors(cs[k], cs[(k + 1) % 4], Math.random());
      const d = Math.hypot(p.x - focus.x, p.z - focus.z); if (d < 35 || d > 115 || !offscreen(p.x, p.z, 30)) continue;
      if (chance(0.12) && world.benches.length) { // bench sitter
        const bn = pick(world.benches); if (Math.hypot(bn.x - focus.x, bn.z - focus.z) > 110 || peds.some(q => q.benchRef === bn)) continue;
        const s = spawnPed(bn.x, bn.z, { mode: 'sit' }); s.benchRef = bn;
        s.sitMatrix = new THREE.Matrix4().compose(new V3(bn.x + Math.sin(bn.yaw) * 0.05, CURB + 0.5, bn.z + Math.cos(bn.yaw) * 0.05), new THREE.Quaternion().setFromAxisAngle(UP, bn.yaw), new V3(1, 1, 1)); s.seatKind = 'bench';
        s.pos.set(bn.x, CURB, bn.z); break;
      }
      const ped = spawnPed(p.x, p.z); ped.ai.bi = b.i; ped.ai.bj = b.j; ped.ai.corner = (k + 1) % 4; ped.ai.dir = 1; ped.ai.target.copy(cs[(k + 1) % 4]);
      if (chance(0.5)) { ped.ai.corner = k; ped.ai.dir = -1; ped.ai.target.copy(cs[k]); }
      break;
    }
  }
}
// ---------------------------------------------------------------- update vehicles
function updateVehicles(dt) {
  const steps = dt > 1 / 45 ? 2 : 1, h = dt / steps;
  for (let s = 0; s < steps; s++) {
    for (const v of vehicles) {
      if (!v.root.visible && player.inside) continue;
      if (v === player.car && player.state === 'driving') {
        let thr = input.throttle, brk = input.brake;
        if (v.T.bicycle && input.sprint) thr *= 1.4;
        v.physicsStep(h, { throttle: thr, brake: brk, steer: input.steer, handbrake: input.handbrake, analog: input.steerAnalog });
      } else if (v.ai) updateVehicleAI(v, h);
      else v.physicsStep(h, { throttle: 0, brake: 0.2, steer: 0, handbrake: false });
      if (v.ai && v.ai.mode === 'parked') { v.prevVel.set(0, 0, 0); continue; }
      v.prevVel.copy(v.vel);
      collideStatic(v);
    }
    for (let i = 0; i < vehicles.length; i++) for (let j = i + 1; j < vehicles.length; j++) {
      const a = vehicles[i], b = vehicles[j];
      if (a.ai && a.ai.mode === 'parked' && b.ai && b.ai.mode === 'parked') continue;
      if (a.ai && b.ai && a.ai.mode === 'drive' && b.ai.mode === 'drive' && a.ai.speed < 0.1 && b.ai.speed < 0.1) continue;
      collideVehicles(a, b);
    }
  }
  for (const v of vehicles) {
    if (!(v.ai && v.ai.mode === 'parked')) collideVehicleChars(v);
    v.syncVisual(dt);
    v.updateDamageFX(dt);
  }
  if (player.ch.ignoreT > 0) player.ch.ignoreT -= dt;
}
// ---------------------------------------------------------------- cameras
const _camT = new V3(), _camP = new V3(), _camD = new V3(), _cq = new THREE.Quaternion(), _ce = new THREE.Euler();
let titleAng = 0;
function camCollide(target, desired) {
  _camD.subVectors(desired, target); const len = _camD.length(); if (len < 0.01) return desired;
  _camD.multiplyScalar(1 / len);
  const hit = rayStatic(target, _camD, len + 0.3, true);
  if (hit && hit.c !== 'ground') desired.copy(target).addScaledVector(_camD, Math.max(0.4, hit.t - 0.35));
  if (desired.y < groundH(desired.x, desired.z) + 0.25) desired.y = groundH(desired.x, desired.z) + 0.25;
  return desired;
}
function updateCamera(rdt) {
  const sens = settings.sens * (settings.mobile ? 0.0048 : 0.0026);
  const lx = input.lookX * sens, ly = input.lookY * sens; input.lookX = input.lookY = 0;
  if (!game.running) {
    titleAng += rdt * 0.05;
    camera.position.set(Math.cos(titleAng) * 150, 60, Math.sin(titleAng) * 150);
    camera.lookAt(0, 15, 0); camera.fov = 60; camera.updateProjectionMatrix(); return;
  }
  const ch = player.ch;
  let fov = 65;
  if (player.state === 'driving' && player.car) {
    const v = player.car, T = v.T;
    if (Math.abs(lx) + Math.abs(ly) > 0) { player.orbitYaw -= lx; player.orbitPitch = clamp(player.orbitPitch - ly, -0.5, 0.7); player.orbitT = 1.6; }
    else if (player.orbitT > 0) player.orbitT -= rdt; else { player.orbitYaw *= Math.exp(-3 * rdt); player.orbitPitch *= Math.exp(-3 * rdt); }
    if (settings.driveCam === 'first') {
      ch.hideHead = true;
      v.body.updateMatrixWorld(true); v.body.getWorldQuaternion(_cq);
      player.orbitYaw = clamp(player.orbitYaw, -2.2, 2.2);
      _ce.set(player.orbitPitch * 0.8 - 0.04, Math.PI + player.orbitYaw, 0, 'YXZ'); _q1.setFromEuler(_ce);
      camera.quaternion.copy(_cq).multiply(_q1);
      const hp = ch.joints[J.HEAD];
      camera.position.copy(hp).addScaledVector(v.fwd(_v1), T.bike ? 0.05 : 0.12); camera.position.y += T.bike ? 0.06 : -0.02;
      fov = 74 + Math.min(8, v.speed * 0.2);
    } else {
      ch.hideHead = false;
      let tgtYaw = v.h;
      if (v.speed > 5) { const vy = Math.atan2(v.vel.x, v.vel.z); const d = wrapAng(vy - v.h); if (Math.abs(d) < 2) tgtYaw = v.h + d * 0.4; }
      if (v.vF < -4) tgtYaw = v.h;
      player.chaseYaw += wrapAng(tgtYaw - player.chaseYaw) * (1 - Math.exp(-4.5 * rdt));
      const yaw = player.chaseYaw + player.orbitYaw, pitch = -0.2 - player.orbitPitch;
      const dist = T.bike ? 5 : (T.bus ? 15 : T.len * 1.15 + 3.2), th = T.bus ? 3.2 : (T.van ? 2.2 : 1.25);
      _camT.set(v.pos.x, v.root.position.y + th, v.pos.z);
      _camP.set(_camT.x - Math.sin(yaw) * Math.cos(pitch) * dist, _camT.y - Math.sin(pitch) * dist, _camT.z - Math.cos(yaw) * Math.cos(pitch) * dist);
      camCollide(_camT, _camP);
      camera.position.copy(_camP); camera.lookAt(_camT.x + Math.sin(v.h) * 2, _camT.y + 0.3, _camT.z + Math.cos(v.h) * 2);
      fov = 64 + Math.min(16, v.speed * 0.36);
    }
  } else if (player.state === 'ragdoll' || player.state === 'dead') {
    ch.hideHead = false;
    player.camYaw -= lx; player.camPitch = clamp(player.camPitch - ly, -1.1, 0.4);
    const p = ch.ragdoll ? ch.ragdoll.p[J.PELV] : ch.pos;
    _camT.copy(p); _camT.y += 0.5;
    const d = 5.5, yaw = player.camYaw, pitch = player.camPitch - 0.25;
    _camP.set(_camT.x - Math.sin(yaw) * Math.cos(pitch) * d, _camT.y - Math.sin(pitch) * d, _camT.z - Math.cos(yaw) * Math.cos(pitch) * d);
    camCollide(_camT, _camP);
    camera.position.lerp(_camP, 1 - Math.exp(-8 * rdt)); camera.lookAt(_camT);
  } else {
    ch.hideHead = false;
    player.camYaw -= lx; player.camPitch = clamp(player.camPitch - ly, -1.2, 0.85);
    const aiming = ch.anim.aim > 0.5;
    const inside = !!player.inside;
    const dist = aiming ? 1.9 : (inside ? 2.8 : 4.0), off = aiming ? 0.55 : 0.25;
    const base = ch.getupT > 0 || player.state === 'entering' || player.state === 'exiting' ? ch.joints[J.PELV] : ch.pos;
    _camT.set(base.x, (player.state === 'foot' && ch.getupT <= 0 ? ch.pos.y + 1.55 : base.y + 0.7), base.z);
    const yaw = player.camYaw, pitch = player.camPitch;
    const fx = Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = Math.cos(yaw) * Math.cos(pitch), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    _camT.x += rx * off; _camT.z += rz * off;
    _camP.set(_camT.x - fx * dist, _camT.y - fy * dist, _camT.z - fz * dist);
    camCollide(_camT, _camP);
    camera.position.copy(_camP);
    _ce.set(pitch, yaw + Math.PI, 0, 'YXZ'); camera.quaternion.setFromEuler(_ce);
    fov = aiming ? 52 : 65;
  }
  // recoil & shake
  if (player.recoil > 0) { player.camPitch += player.recoil * 0.5; player.orbitPitch -= player.recoil * 0.3; player.recoil *= Math.exp(-14 * rdt); if (player.recoil < 1e-4) player.recoil = 0; }
  if (game.shake > 0) { const s = game.shake * 0.12; camera.position.x += rand(-s, s); camera.position.y += rand(-s, s); camera.position.z += rand(-s, s); game.shake = Math.max(0, game.shake - rdt * 2.2); }
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-6 * rdt)); camera.updateProjectionMatrix(); for (const p of PSYS) p.setScale(); }
}
// ---------------------------------------------------------------- HUD + minimap + big map
const mini = { el: $('minimap'), ctx: null, zoom: 1.25 };
const BLIPS = () => [
  ...STORES.map(s => ({ p: s.door, g: s.type === 'guns' ? 'G' : (s.type === 'mart' ? '$' : (s.type === 'diner' ? 'B' : 'T')), c: s.type === 'guns' ? '#ff5a4a' : (s.type === 'mart' ? '#5adc7a' : (s.type === 'diner' ? '#ff9a3a' : '#ff6ad8')), name: s.name })),
  { p: PLACES.garage.door, g: 'W', c: '#4ac8ff', name: 'Pinstripe Auto Body (repairs)' }, { p: PLACES.hospital.door, g: '+', c: '#ff4a4a', name: 'County General' }, { p: PLACES.safehouse.door, g: 'H', c: '#ffd23a', name: 'Home' }
];
let staticBlips = null;
function drawBlip(g, x, y, b, s = 1) {
  g.fillStyle = '#111'; g.beginPath(); g.arc(x, y, 7 * s, 0, TAU); g.fill();
  g.fillStyle = b.c; g.beginPath(); g.arc(x, y, 5.6 * s, 0, TAU); g.fill();
  if (b.g) { g.fillStyle = '#111'; g.font = `bold ${Math.round(8 * s)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.g, x, y + 0.5); }
}
function drawMinimap() {
  const c = mini.el; if (!c || $('mapPanel').classList.contains('collapsed')) return;
  const dpr = Math.min(2, devicePixelRatio || 1), W = c.clientWidth, H = c.clientHeight; if (!W) return;
  if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#26302a'; g.fillRect(0, 0, W, H);
  const f = player.inside ? player.inside.store.door : focusPos();
  const yaw = player.state === 'driving' && player.car ? (settings.driveCam === 'first' ? player.car.h : player.chaseYaw + player.orbitYaw) : player.camYaw;
  const sc = mini.zoom * (player.state === 'driving' && player.car ? clamp(1.25 - player.car.speed * 0.012, 0.75, 1.25) : 1.4);
  g.save(); g.translate(W / 2, H / 2 + 10); g.rotate(yaw); g.scale(sc, sc);
  const [mx, my] = mapXY(f.x, f.z);
  g.drawImage(world.mapCanvas, -mx / MAP_S, -my / MAP_S, 1024 / MAP_S, 1024 / MAP_S);
  const toM = p => [(f.x - p.x), (f.z - p.z)];
  const all = (staticBlips || (staticBlips = BLIPS())).concat(mission.blips.map(b => ({ p: b.p, c: b.c, g: b.m ? 'M' : null })));
  if (player.waypoint) all.push({ p: player.waypoint, c: '#c070ff', g: 'X' });
  const R = Math.min(W, H) / 2 / sc - 6 / sc;
  for (const b of all) {
    let [x, y] = toM(b.p); const d = Math.hypot(x, y);
    if (d > R) { x *= R / d; y *= R / d; }
    g.save(); g.translate(x, y); g.rotate(-yaw); drawBlip(g, 0, 0, b, 1 / sc * (b.g ? 1 : 0.7)); g.restore();
  }
  g.restore();
  // player arrow
  const ph = player.state === 'driving' && player.car ? player.car.h : player.ch.yaw;
  g.save(); g.translate(W / 2, H / 2 + 10); g.rotate(yaw - ph);
  g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
  // north marker (+z is map up)
  const na = yaw; const nx = W / 2 + Math.sin(-na) * 0 , r0 = Math.min(W, H) / 2 - 9;
  const ax = W / 2 - Math.sin(na) * r0 * 0, ay = 0;
  g.save(); g.translate(W / 2, H / 2 + 10); g.rotate(yaw); g.translate(0, -r0); g.rotate(-yaw); g.fillStyle = '#111'; g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', 0, 0.5); g.restore();
}
const bigMap = { open: false, zoom: 1, cx: 512, cy: 512, drag: null, moved: false };
function openBigMap() {
  bigMap.open = true; $('bigmap').hidden = false; releaseAllTouches(); if (document.exitPointerLock && mouse.locked) document.exitPointerLock();
  const f = focusPos(); const [mx, my] = mapXY(f.x, f.z); bigMap.cx = mx; bigMap.cy = my; bigMap.zoom = 1;
  const lg = $('legend'); lg.innerHTML = '';
  for (const b of BLIPS().concat([{ c: '#ffd23a', g: 'M', name: 'Mission' }, { c: '#c070ff', g: 'X', name: 'Your waypoint (tap the map)' }])) { const d = document.createElement('div'); d.innerHTML = `<i style="background:${b.c}">${b.g}</i>${b.name}`; lg.appendChild(d); }
  drawBigMap();
}
function closeBigMap() { bigMap.open = false; $('bigmap').hidden = true; }
function drawBigMap() {
  if (!bigMap.open) return;
  const c = $('bigCanvas'), dpr = Math.min(2, devicePixelRatio || 1), W = c.clientWidth, H = c.clientHeight;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#1b201c'; g.fillRect(0, 0, W, H);
  const fit = Math.min(W, H) / 1024 * 0.95, s = fit * bigMap.zoom;
  bigMap.s = s; bigMap.W = W; bigMap.H = H;
  g.save(); g.translate(W / 2, H / 2); g.scale(s, s); g.translate(-bigMap.cx, -bigMap.cy);
  g.drawImage(world.mapCanvas, 0, 0);
  const all = (staticBlips || BLIPS()).concat(mission.blips.map(b => ({ p: b.p, c: b.c, g: b.m ? 'M' : null })));
  if (player.waypoint) all.push({ p: player.waypoint, c: '#c070ff', g: 'X' });
  for (const b of all) { const [x, y] = mapXY(b.p.x, b.p.z); drawBlip(g, x, y, b, 1.3 / s); }
  const f = focusPos(), [px, py] = mapXY(f.x, f.z), ph = player.state === 'driving' && player.car ? player.car.h : player.ch.yaw;
  g.translate(px, py); g.rotate(-ph); g.scale(1.6 / s, 1.6 / s); g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke();
  g.restore();
}
{
  const c = $('bigCanvas');
  const down = (x, y) => { bigMap.drag = { x, y, cx: bigMap.cx, cy: bigMap.cy }; bigMap.moved = false; };
  const move = (x, y) => { if (!bigMap.drag) return; const dx = x - bigMap.drag.x, dy = y - bigMap.drag.y; if (Math.abs(dx) + Math.abs(dy) > 6) bigMap.moved = true; bigMap.cx = bigMap.drag.cx - dx / bigMap.s; bigMap.cy = bigMap.drag.cy - dy / bigMap.s; drawBigMap(); };
  const up = (x, y) => {
    if (bigMap.drag && !bigMap.moved) { const r = c.getBoundingClientRect(); const mx = (x - r.left - bigMap.W / 2) / bigMap.s + bigMap.cx, my = (y - r.top - bigMap.H / 2) / bigMap.s + bigMap.cy; const wx = MAP_E - mx / MAP_S, wz = MAP_E - my / MAP_S; player.waypoint = player.waypoint && Math.hypot(player.waypoint.x - wx, player.waypoint.z - wz) < 15 ? null : new V3(wx, 0, wz); drawBigMap(); }
    bigMap.drag = null;
  };
  c.addEventListener('mousedown', e => down(e.clientX, e.clientY)); addEventListener('mousemove', e => move(e.clientX, e.clientY)); addEventListener('mouseup', e => up(e.clientX, e.clientY));
  c.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; down(t.clientX, t.clientY); }, { passive: false });
  c.addEventListener('touchmove', e => { e.preventDefault(); const t = e.changedTouches[0]; move(t.clientX, t.clientY); }, { passive: false });
  c.addEventListener('touchend', e => { e.preventDefault(); const t = e.changedTouches[0]; up(t.clientX, t.clientY); }, { passive: false });
  c.addEventListener('wheel', e => { e.preventDefault(); bigMap.zoom = clamp(bigMap.zoom * (e.deltaY < 0 ? 1.15 : 0.87), 0.8, 6); drawBigMap(); }, { passive: false });
  $('mapZoomIn').onclick = () => { bigMap.zoom = clamp(bigMap.zoom * 1.4, 0.8, 6); drawBigMap(); };
  $('mapZoomOut').onclick = () => { bigMap.zoom = clamp(bigMap.zoom / 1.4, 0.8, 6); drawBigMap(); };
  $('mapClose').onclick = closeBigMap;
  $('minimap').onclick = () => { if (game.running) openBigMap(); };
  $('minimap').addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); if (game.running) openBigMap(); }, { passive: false });
  const tog = () => { const p = $('mapPanel'); p.classList.toggle('collapsed'); settings.minimap = !p.classList.contains('collapsed'); saveSettings(); };
  $('mapToggle').onclick = tog; $('mapToggle').addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); tog(); }, { passive: false });
}
let hudCache = {};
function setText(id, t) { if (hudCache[id] !== t) { hudCache[id] = t; $(id).textContent = t; } }
function updateHUD(dt) {
  const ch = player.ch;
  setText('money', '$' + String(Math.max(0, Math.floor(player.money))).padStart(8, '0'));
  $('hpFill').style.width = Math.max(0, ch.health) + '%'; $('arFill').style.width = player.armor + '%'; $('arBar').hidden = player.armor <= 0;
  const W = WEAPONS[player.weapon], inv = player.weapons[player.weapon];
  setText('wpnName', W.name); setText('wpnAmmo', player.weapon === 'fist' ? '' : (player.reloadT > 0 ? 'RELOADING' : inv.mag + ' / ' + inv.ammo));
  const hh = Math.floor(env.time), mm = Math.floor((env.time - hh) * 60);
  setText('clock', String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'));
  setText('weatherTxt', { clear: env.night > 0.5 ? 'CLEAR NIGHT' : 'SUNNY', cloudy: 'OVERCAST', rain: 'RAIN', storm: 'THUNDERSTORM', fog: 'FOG' }[env.weather]);
  const driving = player.state === 'driving' && player.car;
  $('speedo').hidden = !driving;
  if (driving) { const v = player.car; setText('spd', String(Math.round(v.speed * 2.237))); setText('carName', v.T.name); $('carHp').style.width = clamp(v.health / 10, 0, 100) + '%'; $('carHp').className = v.health < 200 ? 'crit' : (v.health < 420 ? 'warn' : ''); }
  const aimShow = player.weapon !== 'fist' && (ch.anim.aim > 0.5 || (player.state === 'driving' && (player.aimHold > 0 || input.aim))) && player.state !== 'ragdoll';
  $('cross').hidden = !aimShow;
  player.hurtFlash = Math.max(0, player.hurtFlash - dt * 1.2);
  $('hurt').style.opacity = Math.max(player.hurtFlash, ch.health < 25 && !ch.dead ? 0.25 + Math.sin(game.time * 5) * 0.1 : 0);
  // prompt
  UI.prompt(pendingAction ? pendingAction.html : '');
  // touch mode
  const tm = driving ? 'drive' : 'foot';
  if (game.touchMode !== tm) { game.touchMode = tm; $('touch').className = tm; releaseAllTouches(); }
  if (settings.mobile) {
    $('bHop').hidden = !(driving && player.car.T.hydraulics);
    $('bUse').hidden = !(pendingAction && pendingAction.fn); $('bUse').classList.add('ready');
    $('bEnter').classList.toggle('ready', !!(pendingAction && !pendingAction.fn) || driving);
    $('bWpn').textContent = player.weapon === 'fist' ? 'FIST' : (player.weapon === 'pistol' ? 'PISTOL' : 'RIFLE');
  }
  if (player.waypoint) { const f = focusPos(), d = Math.hypot(player.waypoint.x - f.x, player.waypoint.z - f.z); if (d < 12) { player.waypoint = null; UI.toast('Waypoint reached'); } }
}
// ---------------------------------------------------------------- pause, title, settings
function syncSettingsUI() {
  $('optMobile').textContent = settings.mobile ? 'ON' : 'OFF';
  $('optCam').textContent = settings.driveCam === 'first' ? 'FIRST PERSON' : 'THIRD PERSON';
  $('optGfx').textContent = settings.quality === 'high' ? 'HIGH' : 'LOW';
  $('optSound').textContent = settings.sound ? 'ON' : 'OFF';
  $('optSens').value = settings.sens;
  $('touch').hidden = !settings.mobile || !game.running;
  $('pauseBtn').hidden = !game.running;
  document.body.classList.toggle('mobile', settings.mobile);
}
function openPause() { if (!game.running || game.paused) return; game.paused = true; $('pause').hidden = false; releaseAllTouches(); Sound.engine(false, 0, 0); Sound.horn(false); if (document.exitPointerLock && mouse.locked) document.exitPointerLock(); syncSettingsUI(); }
function closePause() { game.paused = false; $('pause').hidden = true; }
$('resume').onclick = closePause;
$('pauseBtn').onclick = openPause; $('pauseBtn').addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); openPause(); }, { passive: false });
$('optMobileBtn').onclick = () => { settings.mobile = !settings.mobile; saveSettings(); syncSettingsUI(); };
$('optCamBtn').onclick = () => { settings.driveCam = settings.driveCam === 'first' ? 'third' : 'first'; saveSettings(); syncSettingsUI(); };
$('optGfxBtn').onclick = () => { settings.quality = settings.quality === 'high' ? 'low' : 'high'; saveSettings(); applyQuality(); sun.castShadow = settings.quality === 'high'; syncSettingsUI(); };
$('optSoundBtn').onclick = () => { settings.sound = !settings.sound; saveSettings(); Sound.setMuted(!settings.sound); syncSettingsUI(); };
$('optSens').oninput = e => { settings.sens = parseFloat(e.target.value); saveSettings(); };
$('saveBtn').onclick = () => { saveGame(false); };
$('helpBtn').onclick = () => { $('help').hidden = !$('help').hidden; };
$('quitBtn').onclick = () => { saveGame(true); location.reload(); };
function saveGame(silent) {
  if (!player.ch || !game.running) return;
  if (player.state === 'dead') return;
  const d = player.inside ? player.inside.store.door : focusPos();
  const data = {
    v: 1, money: player.money, health: Math.max(1, player.ch.health), armor: player.armor, weapons: player.weapons, weapon: player.weapon,
    done: [...mission.done], pos: { x: d.x, z: d.z }, time: env.time, weather: env.weather, outfit: player.outfit, homeColor: player.homeCar ? player.homeCar.color : null
  };
  store.set('bk_save', data);
  if (!silent) UI.toast('Game saved');
}
function newGameState() {
  const d = PLACES.safehouse.door;
  player.ch.pos.set(d.x, CURB, d.z); player.ch.yaw = Math.atan2(d.nx, d.nz); player.camYaw = player.ch.yaw + 0.6;
  spawnHomeCar();
}
function loadGameState(s) {
  player.money = s.money; player.armor = s.armor || 0; player.ch.health = s.health || 100;
  for (const w of ['pistol', 'rifle']) if (s.weapons && s.weapons[w]) Object.assign(player.weapons[w], s.weapons[w]);
  mission.done = new Set(s.done || []);
  env.time = s.time || 10; setWeather(s.weather || 'clear', true);
  if (s.outfit) player.outfit = s.outfit; player.ch.colors = PLAYER_COLORS();
  player.ch.pos.set(s.pos.x, groundH(s.pos.x, s.pos.z), s.pos.z); pushOutCircle(player.ch.pos, 0.4, 0.5);
  spawnHomeCar(s.homeColor);
  if (s.weapon && player.weapons[s.weapon] && player.weapons[s.weapon].owned) setWeapon(s.weapon);
}
async function startGame(cont) {
  Sound.init(); Sound.setMuted(!settings.sound);
  $('title').hidden = true;
  const s = store.get('bk_save', null);
  if (cont && s) loadGameState(s); else { newGameState(); }
  player.ch.visible = true;
  // clear title-screen traffic so the start feels clean around the player
  for (let i = vehicles.length - 1; i >= 0; i--) { const v = vehicles[i]; if (v !== player.homeCar && Math.hypot(v.pos.x - player.ch.pos.x, v.pos.z - player.ch.pos.z) < 30 && !v.mission) v.destroy(); }
  game.running = true; syncSettingsUI();
  $('hud').hidden = false;
  $('mapPanel').classList.toggle('collapsed', !settings.minimap);
  if (!cont || !s) UI.big('BOULEVARD KINGS', 'Your lowrider is parked out front. Head to the yellow marker to start.', 5, 'start');
  else UI.toast('Welcome back.');
}
// ---------------------------------------------------------------- global keys
function handleGlobal() {
  if (input.pressed.has('pause')) { if (bigMap.open) closeBigMap(); else if (shopOpen) closeShop(); else if (game.paused) closePause(); else openPause(); input.pressed.delete('pause'); }
  if (input.pressed.has('map') && game.running) { if (bigMap.open) closeBigMap(); else openBigMap(); }
  if (input.pressed.has('camera') && player.state === 'driving') { settings.driveCam = settings.driveCam === 'first' ? 'third' : 'first'; saveSettings(); }
}
// ---------------------------------------------------------------- init + loop
function init() {
  applyQuality();
  initFX(); buildCity(); buildSky(); initCharRender(); initVehicleMats(); initSkids(); initWeaponsFX();
  player.ch = new Character({ isPlayer: true, colors: PLAYER_COLORS() });
  player.ch.onDeath = () => { if (game.running) playerDied(); };
  player.ch.visible = false;
  newGameState(); // places player + home car for the title backdrop; reset on start
  if (player.homeCar) { player.homeCar.destroy(); player.homeCar = null; }
  env.time = 17.6; setWeather('clear', true);
  addEventListener('resize', onResize);
  const has = !!store.get('bk_save', null);
  $('contBtn').hidden = !has;
  $('contBtn').onclick = () => { env.time = (store.get('bk_save', {}).time) || 10; startGame(true); };
  $('newBtn').onclick = () => { store.del('bk_save'); env.time = 10; setWeather('clear', true); startGame(false); };
  $('loading').hidden = true; $('menuBtns').hidden = false;
  syncSettingsUI();
  requestAnimationFrame(frame);
}
let lastT = performance.now(), autosaveT = 45;
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000)); lastT = now;
  if (tick(rdt)) renderer.render(scene, camera);
}
function tick(rdt) {
  pendingAction = null;
  gatherInput(rdt);
  handleGlobal();
  if (game.paused || bigMap.open || shopOpen) {
    if (bigMap.open) drawBigMap();
    if (shopOpen && input.pressed.has('interact')) closeShop();
    input.pressed.clear(); return true;
  }
  if (game.slowmo > 0) { game.slowmo -= rdt; game.timeScale = lerp(game.timeScale, 0.3, 0.25); } else game.timeScale = lerp(game.timeScale, 1, 0.08);
  const dt = rdt * game.timeScale; game.time += dt; game.frame++;
  const ch = player.ch;
  if (game.running) {
    switch (player.state) {
      case 'foot': updatePlayerFoot(dt); break;
      case 'entering': updateEntering(dt); break;
      case 'exiting': updateExiting(dt); break;
      case 'driving': updatePlayerDriving(dt); break;
      case 'ragdoll':
        if (!ch.ragdoll) { player.state = 'foot'; break; }
        if (ch.dead) { player.state = 'dead'; break; }
        if ((ch.ragdoll.restT > 0.8 && ch.ragdoll.age > 1.4) || (input.pressed.has('jump') && ch.ragdoll.age > 1 && ch.ragdoll.speed < 2)) { ch.getUp(); player.state = 'foot'; player.camYaw = ch.yaw; }
        break;
      case 'dead': player.deadT += dt; if (player.deadT > 4.5 && !player.respawning) { player.respawning = true; respawn().then(() => player.respawning = false); } break;
    }
    if (player.state !== 'driving') { Sound.engine(false, 0, 0); Sound.setGain(Sound.skid.g, 0); }
    if (player.inside && player.state === 'foot') updateInterior(dt);
    autosaveT -= rdt; if (autosaveT <= 0) { autosaveT = 45; if (!mission.active && (player.state === 'foot' || player.state === 'driving')) saveGame(true); }
  }
  updateVehicles(dt);
  for (const p of peds) if (!p.inside || player.inside) updatePed(p, dt);
  separatePeds();
  for (const c of chars) {
    if (c.vehicle && !c.vehicle.destroyed) seatCharacter(c, c.vehicle);
    if (!c.visible && !c.isPlayer && player.inside) continue;
    c.updatePose(dt);
  }
  if (ch.ragdoll && ch.ignoreVehicle && ch.ignoreT <= 0) ch.ignoreVehicle = null;
  updateGunMeshes();
  if (game.running) updateMissions(dt); else endMarkersFrame();
  if (game.running && pendingAction && pendingAction.fn && input.pressed.has('interact')) { const fn = pendingAction.fn; fn(); }
  const focus = game.running ? focusPos() : _v5.set(0, 0, 0);
  updateSpawner(dt, focus);
  updateSignals(dt); updateProps(dt); updateDebris(dt);
  FX.smoke.update(dt); FX.glow.update(dt); FX.bits.update(dt); FX.tracers.update(dt);
  if (flash) flash.intensity *= Math.exp(-30 * dt);
  updateEnv(dt, game.running ? (player.inside ? player.inside.origin : focus) : _v4.set(0, 0, 0));
  if (player.inside) { hemi.intensity = 0.75; sun.intensity = 0.35; sun.position.copy(player.inside.origin).add(_v1.set(3, 30, -4)); sun.target.position.copy(player.inside.origin); sun.target.updateMatrixWorld(); scene.fog.density = 0.002; ambient.intensity = 0.25; rainMesh.visible = false; Sound.setGain(Sound.rain.g, 0.02); }
  updateCamera(rdt);
  renderChars();
  if (game.running) { updateHUD(rdt); if (game.frame % 2 === 0) drawMinimap(); }
  UI.update(rdt);
  input.pressed.clear();
  return true;
}
window.__bk = { seatCharacter, renderChars, renderer, MISSIONS, startMission, saveGame, scene, mouse, touch, setWeapon, sim(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) tick(dt); }, press(a) { input.pressed.add(a); }, player, vehicles, chars, peds, env, settings, mission, game, startEnter, Vehicle, STORES, PLACES, enterStore, input, keys, camera };
try { init(); } catch (e) { console.error(e); const l = $('loading'); if (l) l.textContent = 'Failed to start: ' + e.message; }
