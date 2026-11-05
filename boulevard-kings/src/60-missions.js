// ============================================================================
//  MISSIONS — markers, objectives, 7 story missions
// ============================================================================
const markerPool = [];
function makeMarker(color) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.position.y = 0.05; g.add(beam, ring); g.userData = { beam, ring }; g.renderOrder = 4; scene.add(g); g.visible = false;
  return g;
}
function getMarker(i, color) { while (markerPool.length <= i) markerPool.push(makeMarker(0xffffff)); const m = markerPool[i]; m.userData.beam.material.color.setHex(color); m.userData.ring.material.color.setHex(color); return m; }
let markerUsed = 0;
function showMarker(p, r, color, h = 6) {
  const m = getMarker(markerUsed++, color); m.visible = true;
  m.position.set(p.x, groundH(p.x, p.z) + 0.02, p.z); m.userData.beam.scale.set(r, h, r); m.userData.beam.position.y = h / 2; m.userData.ring.scale.set(r, 1, r);
  m.userData.beam.material.opacity = 0.18 + Math.sin(game.time * 3) * 0.06;
}
const arrowPool = [];
let arrowUsed = 0;
function showArrow(p, color) {
  if (arrowPool.length <= arrowUsed) { const a = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })); scene.add(a); arrowPool.push(a); }
  const a = arrowPool[arrowUsed++]; a.visible = true; a.material.color.setHex(color);
  a.position.set(p.x, p.y + 0.6 + Math.sin(game.time * 4) * 0.15, p.z); a.rotation.y = game.time * 2;
}
function endMarkersFrame() { for (let i = markerUsed; i < markerPool.length; i++) markerPool[i].visible = false; for (let i = arrowUsed; i < arrowPool.length; i++) arrowPool[i].visible = false; markerUsed = 0; arrowUsed = 0; }

const mission = { active: null, S: null, done: new Set(), blips: [] };
function inCar() { return player.state === 'driving' && player.car; }
function nearXZ(a, b, r) { return Math.hypot(a.x - b.x, a.z - b.z) < r; }
function focusPos() { return player.state === 'driving' && player.car ? player.car.pos : player.ch.pos; }
function spawnHostile(x, z, weapon, colors) {
  const p = spawnPed(x, z, { mode: 'hostile', colors: Object.assign(randomColors(), colors || {}) });
  p.health = 70; p.mission = true; equipGun(p, weapon || 'pistol'); p.ai.alerted = false; return p;
}
const GANG_A = { shirt: 0x1e7d32, hat: 0x1e7d32, pants: 0x1e1e1e }, GANG_B = { shirt: 0x1d1d1d, hat: 0xc0281e, pants: 0x2b3a67, sleeve: 0xc0281e };
const RACE_ROUTE = [[6, 6], [6, 2], [3, 2], [3, 4], [1, 4], [1, 6], [2, 6]].map(([k, l]) => new V3(rp(k), 0, rp(l)));

const MISSIONS = [
  {
    id: 'lowslow', title: 'Low & Slow', giver: () => PLACES.safehouse.door, reward: 500,
    brief: 'Take the Vaquero to the car meet at Eastside Park and show it off.',
    start(S) {
      if (!player.homeCar || player.homeCar.destroyed || player.homeCar.exploded) spawnHomeCar();
      S.stage = 0; S.hops = 0; S.meet = new V3(rp(4) + 40, 0, rp(4) + 40); S.ents = [];
      const types = ['lowrider', 'classic57', 'lowrider'];
      types.forEach((t, k) => { const v = new Vehicle(t, S.meet.x - 9 + k * 9, S.meet.z + 8, Math.PI + rand(-0.2, 0.2)); v.ai = { mode: 'parked' }; v.mission = true; S.ents.push(v); });
      for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI + Math.PI; const p = spawnPed(S.meet.x + Math.cos(a) * 9, S.meet.z + Math.sin(a) * 9 * 0.8 + 2, { mode: chance(0.5) ? 'dance' : 'watch' }); p.ai.face = Math.atan2(S.meet.x - p.pos.x, S.meet.z - p.pos.z); p.mission = true; S.ents.push(p); }
    },
    update(S) {
      const car = player.homeCar;
      if (!car || car.destroyed || car.exploded) return 'fail:Your lowrider got wrecked.';
      if (S.stage === 0) {
        UI.objective('Get in your <b>Vaquero Lowrider</b>.'); showArrow(_v1.copy(car.pos).setY(1.8), 0x60d0ff);
        if (player.car === car && player.state === 'driving') S.stage = 1;
      } else if (S.stage === 1) {
        UI.objective('Cruise to the car meet at <b>Eastside Park</b>. Keep it clean.'); showMarker(S.meet, 7, 0xffd23a); mission.blips.push({ p: S.meet, c: '#ffd23a' });
        if (player.car !== car) { UI.objective('Get back in your <b>Vaquero Lowrider</b>.'); showArrow(_v1.copy(car.pos).setY(1.8), 0x60d0ff); }
        else if (nearXZ(car.pos, S.meet, 8)) { if (car.health < 500) return 'fail:Your ride is too beat up to show.'; S.stage = 2; UI.toast('The crowd is watching…'); }
      } else {
        UI.objective(`Show off! Hit the hydraulics <b>${3 - S.hops}</b> more time${3 - S.hops === 1 ? '' : 's'} (<b>H</b> / HOP).`);
        if (S.hops >= 3) { for (const e of S.ents) if (e.ai && e.ai.mode === 'watch') e.ai.mode = 'dance'; return 'pass'; }
      }
    },
    onHop(S) { if (S.stage === 2 && player.car === player.homeCar) { S.hops++; Sound.cash(); } }
  },
  {
    id: 'tacorun', title: 'Taco Run', giver: () => STORES[3].door, reward: 600,
    brief: 'Three hot orders, two and a half minutes. Drive fast, park in the marker.',
    start(S) {
      S.stops = [[1, 2, '+x'], [5, 1, '-z'], [6, 4, '-x']].map(([i, j, s]) => { const d = placeDoor({ i, j, side: s }, SW + 0.9); return new V3(d.x, 0, d.z); });
      S.k = 0; S.timeLeft = 150;
    },
    update(S, dt) {
      S.timeLeft -= dt; if (S.timeLeft <= 0) return 'fail:The food got cold.';
      if (!inCar()) { UI.objective('Get a vehicle to make the deliveries.'); return; }
      const p = S.stops[S.k]; showMarker(p, 4, 0xffd23a); mission.blips.push({ p, c: '#ffd23a' });
      UI.objective(`Deliver order <b>${S.k + 1}/3</b> and stop in the marker.`);
      if (nearXZ(player.car.pos, p, 4.5) && player.car.speed < 5) { S.k++; Sound.cash(); UI.toast('Order delivered! +$20 tip'); player.money += 20; if (S.k >= 3) return 'pass'; }
    }
  },
  {
    id: 'race', title: 'Street Kings', giver: () => new V3(rp(2) - 12, 0, rp(6) - 11), reward: 1200,
    brief: 'Three muscle cars, one loop around the west side. Finish first.',
    start(S) {
      S.stage = 0; S.start = new V3(rp(1) + 28, 0, rp(6) + 1.8); S.racers = [];
    },
    update(S, dt) {
      if (S.stage === 0) {
        if (!inCar() || player.car.T.bike || player.car.T.bus) { UI.objective('Get a <b>car</b> and drive to the starting line.'); }
        else UI.objective('Drive to the <b>starting line</b>.');
        showMarker(S.start, 5, 0xffd23a); mission.blips.push({ p: S.start, c: '#ffd23a' });
        if (inCar() && !player.car.T.bike && !player.car.T.bus && nearXZ(player.car.pos, S.start, 6) && player.car.speed < 6) {
          const pc = player.car; pc.pos.set(S.start.x, 0, rp(6) + 1.8); pc.h = Math.PI / 2; pc.vel.set(0, 0, 0); pc.yawRate = 0;
          [['charger', 0, 3.6], ['challenger', -9, 0], ['muscle', -9, 3.6]].forEach(([t, dx, dz]) => {
            for (const v of vehicles) if (v !== pc && Math.hypot(v.pos.x - (S.start.x + dx), v.pos.z - (rp(6) + 1.8 + dz)) < 6 && !v.mission) v.pos.z += 30;
            const v = new Vehicle(t, S.start.x + dx, rp(6) + 1.8 + dz, Math.PI / 2);
            const d = spawnPed(0, 0, { driver: true, colors: Object.assign(randomColors(), GANG_B) }); d.vehicle = v; d.seatKind = 'car'; d.sitMatrix = new THREE.Matrix4(); d.ai.mode = 'driving'; d.mission = true;
            v.driver = d; v.ai = { mode: 'race', cp: 0, stuckT: 0, rev: 0, rubber: 1, skill: rand(0.92, 1.04) }; v.mission = true; v.invuln = true; S.racers.push(v);
          });
          S.stage = 1; S.count = 3.5; S.cp = 0;
        }
      } else if (S.stage === 1) {
        S.count -= dt; const n = Math.ceil(S.count);
        UI.objective(n > 0 ? `<span class="count">${n}</span>` : '<span class="count">GO!</span>');
        if (S.lastN !== n) { S.lastN = n; if (n > 0) Sound.tone({ f: 440, dur: 0.2, type: 'square', gain: 0.12 }); else Sound.tone({ f: 880, dur: 0.4, type: 'square', gain: 0.14 }); }
        if (S.count <= 0) { S.stage = 2; for (const r of S.racers) r.ai.go = true; }
        else { player.car.vel.set(0, 0, 0); }
      } else {
        if (!inCar()) { S.offT = (S.offT || 0) + dt; if (S.offT > 12) return 'fail:You abandoned the race.'; UI.objective('Get back in a car!'); }
        else S.offT = 0;
        const N = RACE_ROUTE.length, p = RACE_ROUTE[S.cp];
        showMarker(p, 9, 0xffd23a, 10); mission.blips.push({ p, c: '#ffd23a' });
        if (S.cp + 1 < N) mission.blips.push({ p: RACE_ROUTE[S.cp + 1], c: '#a08a30' });
        if (inCar() && nearXZ(player.car.pos, p, 11)) { S.cp++; Sound.tone({ f: 990, dur: 0.12, type: 'triangle', gain: 0.14 }); if (S.cp >= N) return 'pass'; }
        const myProg = S.cp * 1000 - Math.hypot(focusPos().x - p.x, focusPos().z - p.z);
        let pos = 1;
        for (const r of S.racers) {
          if (r.destroyed || r.exploded || !r.driver || r.driver.dead) continue;
          const rp_ = RACE_ROUTE[Math.min(r.ai.cp, N - 1)], prog = r.ai.cp * 1000 - Math.hypot(r.pos.x - rp_.x, r.pos.z - rp_.z);
          if (prog > myProg) pos++;
          r.ai.rubber = clamp(1 + (myProg - prog) / 900, 0.85, 1.22) * r.ai.skill;
          if (r.ai.cp >= N) return 'fail:You got smoked. A rival finished first.';
          showArrow(_v1.copy(r.pos).setY(2.2), 0xff4040);
        }
        UI.objective(`Race: position <b>${pos}/${S.racers.length + 1}</b> · checkpoint <b>${Math.min(S.cp + 1, N)}/${N}</b>`);
      }
    },
    cleanup(S) { for (const r of S.racers) { r.mission = false; r.invuln = false; if (r.ai && r.ai.mode === 'race') r.ai = { mode: 'phys', wakeT: 0 }; if (r.driver) r.driver.mission = false; } }
  },
  {
    id: 'repo', title: 'Repo Man', giver: () => PLACES.garage.door, reward: 900,
    brief: 'A customer never paid for a respray. Take back the Cherry \'57 from the east side lot.',
    start(S) {
      const b = blockRect(6, 2); S.lot = new V3((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
      S.car = new Vehicle('classic57', S.lot.x, S.lot.z, 0.3); S.car.ai = { mode: 'parked' }; S.car.mission = true;
      S.guards = [spawnHostile(S.lot.x + 6, S.lot.z + 4, 'pistol', GANG_A), spawnHostile(S.lot.x - 5, S.lot.z - 6, 'pistol', GANG_A)];
      S.stage = 0; S.drop = PLACES.garage.curb;
    },
    update(S) {
      const car = S.car; if (car.destroyed || car.exploded) return 'fail:The Cherry \'57 is scrap metal.';
      for (const g of S.guards) if (!g.dead && g.pos.distanceTo(focusPos()) < 26) g.ai.alerted = true;
      if (player.car !== car) { UI.objective(S.stage ? 'Get back in the <b>Cherry \'57</b>.' : 'Steal the <b>Cherry \'57</b> from the east side lot.'); showArrow(_v1.copy(car.pos).setY(2), 0x60d0ff); mission.blips.push({ p: car.pos, c: '#60d0ff' }); return; }
      if (!S.stage) { S.stage = 1; for (const g of S.guards) g.ai.alerted = true; UI.toast('They saw you! Get out of there.'); }
      UI.objective(`Bring it to <b>Pinstripe Auto Body</b>. Don't wreck it! <span class="sub">(${Math.max(0, Math.round(car.health / 10))}%)</span>`);
      const p = new V3(S.drop.x, 0, S.drop.z); showMarker(p, 4.5, 0xffd23a); mission.blips.push({ p, c: '#ffd23a' });
      if (nearXZ(car.pos, p, 5) && car.speed < 5) { if (car.health < 450) return 'fail:That\'s not worth repo-ing anymore.'; return 'pass'; }
    },
    cleanup(S) { if (S.car) S.car.mission = false; for (const g of S.guards) g.mission = false; }
  },
  {
    id: 'armed', title: 'Armed & Dangerous', giver: () => STORES[1].door, reward: 1000,
    brief: 'The Vipers have been shaking down shop owners. Get strapped and run them off.',
    start(S) { S.stage = 0; S.spot = new V3(rp(5) + 20, 0, rp(6) + 11.5); S.gang = []; },
    update(S) {
      if (S.stage === 0) {
        if (player.weapons.pistol.owned || player.weapons.rifle.owned) { S.stage = 1; }
        else { UI.objective('Buy a <b>pistol</b> inside <b>Lock & Load Guns</b>.'); return; }
      }
      if (S.stage === 1) {
        S.gang = [spawnHostile(S.spot.x, S.spot.z, 'pistol', GANG_A), spawnHostile(S.spot.x + 3, S.spot.z + 1.5, 'pistol', GANG_A), spawnHostile(S.spot.x - 3, S.spot.z + 1, 'pistol', GANG_A)];
        S.stage = 2;
      }
      const alive = S.gang.filter(g => !g.dead && !g.destroyed);
      for (const g of alive) { showArrow(_v1.copy(g.joints[J.HEAD]).setY(g.joints[J.HEAD].y + 0.4), 0xff4040); mission.blips.push({ p: g.pos, c: '#ff4040' }); if (g.pos.distanceTo(focusPos()) < 32) g.ai.alerted = true; }
      UI.objective(`Take out the <b>Vipers</b>: <b>${alive.length}</b> left.`);
      if (!alive.length) return 'pass';
    },
    cleanup(S) { for (const g of S.gang) g.mission = false; }
  },
  {
    id: 'demo', title: 'Demolition Man', giver: () => { const b = blockRect(6, 2); return new V3(b.x0 + 2, 0, b.z1 - 2); }, reward: 1500,
    brief: 'Insurance fraud pays. Destroy three marked cars before time runs out.',
    start(S) {
      S.timeLeft = 180; S.targets = [];
      const spots = [['x', 2, 1, 0, rp(3) + 40], ['z', 7, -1, 1, rp(5) + 30], ['x', 6, -1, 0, rp(2) + 30]];
      for (const [ax, k, d, l, al] of spots) { const v = spawnTrafficCar(pick(['sedan', 'pickup', 'taxi']), ax, k, d, l, al); v.mission = true; S.targets.push(v); }
    },
    update(S, dt) {
      S.timeLeft -= dt; if (S.timeLeft <= 0) return 'fail:Time\'s up.';
      const left = S.targets.filter(v => !v.exploded && !v.destroyed);
      for (const v of left) { showArrow(_v1.copy(v.pos).setY(v.T.h + v.T.ride + 1.8), 0xff4040); mission.blips.push({ p: v.pos, c: '#ff4040' }); }
      UI.objective(`Destroy the marked cars: <b>${left.length}</b> left. <span class="sub">Ram them or shoot them until they blow.</span>`);
      if (!left.length) return 'pass';
    },
    cleanup(S) { for (const v of S.targets) v.mission = false; }
  },
  {
    id: 'king', title: 'Boulevard King', giver: () => new V3(rp(4) + 40, 0, rp(4) + 12), reward: 5000,
    brief: 'The Eastside Crew wants your streets. Settle it at Fountain Park.',
    start(S) {
      if (!player.weapons.rifle.owned) { player.weapons.rifle.owned = true; player.weapons.rifle.mag = 30; UI.toast('Big Earl handed you an <b>assault rifle</b>.'); }
      player.weapons.rifle.ammo += 120;
      const b = blockRect(1, 1), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      S.crew = [];
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; S.crew.push(spawnHostile(cx + Math.cos(a) * 9, cz + Math.sin(a) * 9, k % 3 === 0 ? 'rifle' : 'pistol', GANG_B)); }
      S.park = new V3(cx, 0, cz);
    },
    update(S) {
      const alive = S.crew.filter(g => !g.dead && !g.destroyed);
      for (const g of alive) { showArrow(_v1.copy(g.joints[J.HEAD]).setY(g.joints[J.HEAD].y + 0.4), 0xff4040); mission.blips.push({ p: g.pos, c: '#ff4040' }); if (g.pos.distanceTo(focusPos()) < 40) g.ai.alerted = true; }
      if (alive.length === S.crew.length) mission.blips.push({ p: S.park, c: '#ff8040' });
      UI.objective(`Wipe out the <b>Eastside Crew</b> at Fountain Park: <b>${alive.length}</b> left.`);
      if (!alive.length) return 'pass';
    },
    cleanup(S) { for (const g of S.crew) g.mission = false; }
  }
];
function nextMission() { return MISSIONS.find(m => !mission.done.has(m.id)); }
function startMission(m) {
  mission.active = m; mission.S = {}; m.start(mission.S);
  UI.big(m.title, m.brief, 4, 'start'); Sound.jingle();
}
function endMission(passed, reason) {
  const m = mission.active; if (!m) return;
  if (m.cleanup) m.cleanup(mission.S);
  if (mission.S.ents) for (const e of mission.S.ents) e.mission = false;
  mission.active = null; mission.S = null; UI.objective('');
  if (passed) {
    mission.done.add(m.id); player.money += m.reward;
    const all = MISSIONS.every(x => mission.done.has(x.id));
    UI.big(all ? 'YOU RUN THE BOULEVARD' : 'MISSION PASSED', '+$' + m.reward + (all ? ' · every mission complete' : ''), 4.5, 'pass'); Sound.jingle(); Sound.cash();
    saveGame(true);
  } else { UI.big('MISSION FAILED', reason || '', 3.6, 'fail'); Sound.fail(); }
}
function updateMissions(dt) {
  mission.blips.length = 0;
  if (!mission.active) {
    const m = nextMission();
    if (m && !player.inside) {
      const g = m.giver(); showMarker(g, 1.4, 0xffd23a, 3); mission.blips.push({ p: g, c: '#ffd23a', m: true });
      if (nearXZ(focusPos(), g, player.state === 'driving' ? 4.5 : 2.2) && (player.state === 'foot' || player.state === 'driving')) {
        promptAction(`<b>${keyHint('E', 'USE')}</b> Start mission: <b>${m.title}</b>`, () => startMission(m));
      }
    }
  } else {
    const r = mission.active.update(mission.S, dt);
    if (mission.S && mission.S.timeLeft !== undefined) { $('timer').hidden = false; const t = Math.max(0, mission.S.timeLeft); $('timer').textContent = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); }
    else $('timer').hidden = true;
    if (r === 'pass') { $('timer').hidden = true; endMission(true); }
    else if (r && r.startsWith('fail')) { $('timer').hidden = true; endMission(false, r.slice(5)); }
  }
  endMarkersFrame();
}
// racer AI driving controller (uses full physics)
function raceAI(v, dt) {
  const a = v.ai;
  if (!a.go || !v.driver || v.driver.dead) { v.physicsStep(dt, { throttle: 0, brake: 1, steer: 0, handbrake: false }); return; }
  const N = RACE_ROUTE.length, p = RACE_ROUTE[Math.min(a.cp, N - 1)];
  const dx = p.x - v.pos.x, dz = p.z - v.pos.z, d = Math.hypot(dx, dz);
  if (d < 14 && a.cp < N) a.cp++;
  if (a.cp >= N) { v.physicsStep(dt, { throttle: 0, brake: 1, steer: 0, handbrake: false }); return; }
  const nxt = RACE_ROUTE[Math.min(a.cp + 1, N - 1)];
  const turn = a.cp + 1 < N ? Math.abs(wrapAng(Math.atan2(nxt.x - p.x, nxt.z - p.z) - Math.atan2(dx, dz))) : 0;
  const cornerV = turn > 0.6 ? 12 : 60, brakeD = (v.speed * v.speed - cornerV * cornerV) / (2 * 13) + 10;
  // aim slightly past the checkpoint toward the exit of the corner
  const k = d < 18 && turn > 0.6 ? 0.35 : 0, ax = p.x + (nxt.x - p.x) / (Math.hypot(nxt.x - p.x, nxt.z - p.z) || 1) * 8 * k, az = p.z + (nxt.z - p.z) / (Math.hypot(nxt.x - p.x, nxt.z - p.z) || 1) * 8 * k;
  const diff = wrapAng(Math.atan2(ax - v.pos.x, az - v.pos.z) - v.h);
  let steer = clamp(-diff * 2.6, -1, 1), thr = 1, brk = 0, hb = false;
  if (d < brakeD && v.speed > cornerV) { thr = 0; brk = 1; }
  if (Math.abs(diff) > 0.5 && v.speed > 16) { thr = 0.2; brk = 0.7; }
  if (Math.abs(diff) > 1.0 && v.speed > 9) hb = true;
  if (Math.abs(diff) > 0.8 && d < 45 && v.speed > 8) { thr = 0; brk = 1; hb = false; } // don't orbit the checkpoint
  if (Math.abs(diff) > 0.8 && v.speed < 6) thr = 0.7;
  // avoid cars directly ahead
  const f = v.fwd(_v1);
  for (const o of vehicles) { if (o === v) continue; const rx = o.pos.x - v.pos.x, rz = o.pos.z - v.pos.z, ah = rx * f.x + rz * f.z; if (ah < 0 || ah > 16) continue; const lat = rx * f.z - rz * f.x; if (Math.abs(lat) < 2.4) steer += lat > 0 ? 0.5 : -0.5; }
  // progress watchdog: a racer that stops closing on its checkpoint gets put back on the route while unseen
  if (a.bestD === undefined || a.lastCp !== a.cp) { a.bestD = d; a.lastCp = a.cp; a.noProg = 0; }
  if (d < a.bestD - 4) { a.bestD = d; a.noProg = 0; } else a.noProg += dt;
  if (a.noProg > 7 && offscreen(v.pos.x, v.pos.z, 50)) {
    const prev = a.cp > 0 ? RACE_ROUTE[a.cp - 1] : new V3(rp(1), 0, rp(6));
    const hd = Math.atan2(p.x - prev.x, p.z - prev.z), fx = Math.sin(hd), fz = Math.cos(hd);
    const spot = new V3(prev.x + fx * 16 + fz * 3.6, 0, prev.z + fz * 16 - fx * 3.6);
    if (offscreen(spot.x, spot.z, 50) && !vehicles.some(o => o !== v && o.pos.distanceTo(spot) < 6)) { v.pos.copy(spot); v.h = hd; v.vel.set(fx * 12, 0, fz * 12); v.yawRate = 0; a.noProg = 0; a.bestD = 1e9; }
  }
  if (v.speed < 1.2 && a.go) a.stuckT += dt; else a.stuckT = Math.max(0, a.stuckT - dt);
  if (a.stuckT > 1.8) { a.rev = 1.1; a.stuckT = 0; }
  if (a.rev > 0) { a.rev -= dt; thr = 0; brk = 1; steer = -steer; }
  v.physicsStep(dt, { throttle: thr, brake: brk, steer: clamp(steer, -1, 1), handbrake: hb });
}
