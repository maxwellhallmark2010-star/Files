// ─────────────────────────────────────────────────────────────────────────────
// Game: modes, rules, shot resolution, steals/blocks/passes, possession,
// camera. One global object `G` so players and AI can call back into it.
//   Modes: attract (AI vs AI behind the menu) | practice | 1v1 | challenge
//   1v1 rules: check ball at the top, 14 s shot clock, take it back past the
//   arc after a change of possession, out of bounds, reach-in fouls,
//   goaltending, first to the target score.
// ─────────────────────────────────────────────────────────────────────────────
const TEAM_STYLE = [
  { jersey: '#d63a2d', shorts: '#1c1c22', trim: '#ffffff', shoe: 0xf4f4f4, ring: '#ffb03a', name: 'HOME' },
  { jersey: '#efe9dc', shorts: '#1f2f5c', trim: '#1f2f5c', shoe: 0x1e1e1e, ring: '#7fb2ff', name: 'AWAY' },
];
const FEEDER_STYLE = { jersey: '#2f8c59', shorts: '#13301f', trim: '#e8f6ed', shoe: 0xffffff, ring: '#7fffa8' };
const CHALLENGE_SPOTS = [
  new THREE.Vector3(-6.85, 0, 1.4), new THREE.Vector3(-5.2, 0, 6.5), new THREE.Vector3(0, 0, 8.7),
  new THREE.Vector3(5.2, 0, 6.5), new THREE.Vector3(6.85, 0, 1.4),
];
const CHALLENGE_TIME = 60;

const G = {
  time: 0, mode: null, phase: 'idle', phaseT: 0, paused: false,
  players: [], ais: [], user: null, ball: null,
  possession: 0, score: [0, 0], shotClock: SHOT_CLOCK, clockOff: false, needClear: [false, false],
  winner: null, nextPossession: 0, checkPassed: false,
  pendingShot: null, ballFromShot: false, shootBuffer: 0, feedCall: false,
  practice: null, challenge: null, shake: 0, _anchor: new THREE.Vector3(),

  init(scene, camera, world) {
    this.scene = scene; this.camera = camera; this.world = world;
    this.ball = new Ball(scene, world.ballTex);
    this.camPos = new THREE.Vector3(0, 7, 22); this.camLook = new THREE.Vector3(0, 1.5, 4);
    // challenge spot marker
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 40), new THREE.MeshBasicMaterial({ color: 0xffc23d, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.visible = false; ring.renderOrder = 1;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), new THREE.MeshBasicMaterial({ color: 0xffc23d, transparent: true, opacity: 0.18, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.018; disc.visible = false;
    scene.add(ring, disc); this.spotRing = ring; this.spotDisc = disc;
  },

  get aiDiff() { return DIFFICULTY[this.mode === 'attract' ? 'pro' : Settings.difficulty]; },
  rulesOn() { return this.mode === '1v1' || this.mode === 'attract'; },
  controlsLive() { return this.phase === 'live' || this.phase === 'free'; },
  pointsFor(three) { return Settings.scoring === '12' ? (three ? 2 : 1) : (three ? 3 : 2); },
  mustClear(team) { return this.rulesOn() && this.needClear[team]; },

  // ── setup ────────────────────────────────────────────────────────────────
  clearPlayers() { this.players.forEach((p) => p.dispose(this.scene)); this.players = []; this.ais = []; this.user = null; },
  addPlayer(o, aiRole) {
    const p = new Player(this.scene, o);
    this.players.push(p);
    if (aiRole) { const ai = new AIController(p, { role: aiRole }); p.ai = ai; this.ais.push(ai); }
    return p;
  },
  startMode(mode) {
    this.clearPlayers();
    this.mode = mode; this.time = 0; this.paused = false;
    this.score = [0, 0]; this.winner = null; this.pendingShot = null; this.ballFromShot = false;
    this.needClear = [false, false]; this.shotClock = SHOT_CLOCK; this.clockOff = false; this.feedCall = false;
    this.spotRing.visible = this.spotDisc.visible = false;
    this.ball.trailOn = false;
    const D = DIFFICULTY[Settings.difficulty];
    const userOpts = { name: 'Ace', number: 7, team: 0, isHuman: true, colors: Object.assign({ skin: 0xa86f45, hair: 0x15100c }, TEAM_STYLE[0]), ratings: { speed: 1, shoot: 1, jump: 1.02, defense: 1, handle: 1.05 }, height: 1.9 };
    const oppRatings = { speed: 1, shoot: 0.92 + D.shoot * 0.2, jump: 1.0, defense: 0.9 + D.steal * 0.2, handle: 0.9 + D.aggression * 0.12 };
    if (mode === 'attract') {
      this.addPlayer(Object.assign({}, userOpts, { isHuman: false }), 'player');
      this.addPlayer({ name: 'Blaze', number: 24, team: 1, colors: Object.assign({ skin: 0x6b4428, hair: 0x0e0a08 }, TEAM_STYLE[1]), ratings: oppRatings, height: 1.96 }, 'player');
    } else if (mode === '1v1') {
      this.user = this.addPlayer(userOpts);
      this.addPlayer({ name: 'Blaze', number: 24, team: 1, colors: Object.assign({ skin: 0x6b4428, hair: 0x0e0a08 }, TEAM_STYLE[1]), ratings: oppRatings, height: 1.96 }, 'player');
    } else {
      this.user = this.addPlayer(userOpts);
      this.addPlayer({ name: 'Rebound', number: 0, team: 0, colors: Object.assign({ skin: 0xe0ac7a, hair: 0x3b2516 }, FEEDER_STYLE), ratings: { speed: 1.05 }, height: 1.88 }, 'feeder');
    }
    if (this.user) this.user.ring.material.opacity = 0.85;
    this.players.forEach((p) => { if (!p.isHuman) p.ring.material.opacity = mode === 'attract' ? 0 : 0.32; });

    if (mode === 'practice') {
      this.practice = { made: 0, att: 0, tm: 0, ta: 0, streak: 0, best: 0, swish: 0 };
      this.place(this.user, 0, 7.5); this.place(this.players[1], 1.6, 2.5);
      this.giveBall(this.user, 'start');
      this.setPhase('free');
    } else if (mode === 'challenge') {
      this.challenge = { time: CHALLENGE_TIME, score: 0, made: 0, att: 0, streak: 0, bestStreak: 0, spot: 0, fire: false, best: Store.get('challengeBest', 0) };
      const s = CHALLENGE_SPOTS[0];
      this.place(this.user, s.x + 0.6, s.z + 0.8); this.place(this.players[1], 0.8, 2.4);
      this.giveBall(this.players[1], 'start');
      this.updateSpot();
      this.setPhase('countdown');
    } else {
      this.possession = chance(0.5) || mode === '1v1' ? 0 : 1;
      this.startCheck(this.possession);
    }
    UI.onModeStart(mode);
  },
  place(p, x, z) { p.pos.set(x, 0, z); p.vel.set(0, 0, 0); p.jumpY = 0; p.vy = 0; p.airborne = false; p.action = null; p.emote = null; p.facing = Math.atan2(HOOP.x - x, HOOP.z - z); },
  setPhase(ph) { this.phase = ph; this.phaseT = 0; },
  teamPlayers(team) { return this.players.filter((p) => p.team === team); },

  startCheck(team) {
    this.setPhase('check');
    this.possession = team; this.needClear = [false, false];
    this.shotClock = SHOT_CLOCK; this.clockOff = false; this.checkPassed = false; this.pendingShot = null; this.ballFromShot = false;
    const off = this.teamPlayers(team)[0], def = this.teamPlayers(1 - team)[0];
    this.place(off, CHECK_SPOT.x, CHECK_SPOT.z); this.place(def, CHECK_SPOT.x, CHECK_SPOT.z - 1.6);
    def.facing = 0;
    this.players.forEach((p) => (p.hasBall = false));
    this.ball.setHeld(def); def.hasBall = true;
    this.ball.pos.set(def.pos.x, 1.2, def.pos.z);
    if (this.mode !== 'attract') UI.flash(team === 0 ? 'YOUR BALL · CHECK' : 'CHECK BALL', 'info');
  },

  // ── helpers used by AI and controls ─────────────────────────────────────
  nearestOpponent(p) {
    let best = null, bd = 1e9;
    for (const o of this.players) if (o.team !== p.team) { const d = dist2D(o.pos, p.pos); if (d < bd) { bd = d; best = o; } }
    return best;
  },
  teammate(p) { return this.players.find((o) => o !== p && o.team === p.team) || null; },
  inFront(p, o) { // >0 when o stands between p and the hoop
    const hx = HOOP.x - p.pos.x, hz = HOOP.z - p.pos.z, hl = Math.hypot(hx, hz) || 1;
    const ox = o.pos.x - p.pos.x, oz = o.pos.z - p.pos.z, ol = Math.hypot(ox, oz) || 1;
    return (hx * ox + hz * oz) / (hl * ol);
  },
  openness(p) {
    let open = 1;
    for (const o of this.players) {
      if (o.team === p.team) continue;
      const d = dist2D(o.pos, p.pos), f = this.inFront(p, o);
      const v = f > 0.1 ? clamp((d - 0.5) / 1.5, 0, 1) : clamp((d - 0.3) / 1.0, 0, 1);
      open = Math.min(open, v);
    }
    return open;
  },
  laneOpen(p) {
    const hx = HOOP.x - p.pos.x, hz = HOOP.z - p.pos.z, L = Math.hypot(hx, hz) || 1;
    for (const o of this.players) {
      if (o.team === p.team) continue;
      const ox = o.pos.x - p.pos.x, oz = o.pos.z - p.pos.z;
      const t = clamp((ox * hx + oz * hz) / (L * L), 0, 1);
      const px = p.pos.x + hx * t - o.pos.x, pz = p.pos.z + hz * t - o.pos.z;
      if (Math.hypot(px, pz) < 0.85 && t > 0.05) return false;
    }
    return true;
  },
  shotQuality(p, open) {
    const d = hoopDist(p.pos), three = isBeyondArc(p.pos.x, p.pos.z);
    let base = d < 1.6 ? 0.9 : d < 3 ? 0.66 : d < 5 ? 0.5 : d < 6.6 ? 0.42 : d < 7.6 ? 0.42 : d < 8.5 ? 0.22 : 0.04;
    if (three) base += 0.12;
    return base * (0.3 + 0.7 * open) * p.r.shoot;
  },
  shotWindow(p, type) {
    let w = SHOT.W[type] * (0.78 + 0.22 * p.r.shoot);
    if (p.isHuman) w *= TIMING_WINDOW[Settings.timing] || 1;
    if (this.mode === 'challenge' && this.challenge && this.challenge.fire) w *= 1.35;
    const d = hoopDist(p.pos);
    if (d > 8) w *= 0.7; // deep shots are harder to time
    return w;
  },
  shotTypeFor(p, mx, mz) {
    const d = hoopDist(p.pos);
    const tx = HOOP.x - p.pos.x, tz = HOOP.z - p.pos.z, tl = Math.hypot(tx, tz) || 1;
    const toward = (p.vel.x * tx + p.vel.z * tz) / tl;
    const im = Math.hypot(mx, mz), inDot = im > 0.01 ? (mx * tx + mz * tz) / (tl * im) : 0;
    if (d < 3.0 && d > 0.55 && (toward > 2.6 || (p.ctrl.sprint && toward > 1.4 && d < 2.6))) return 'dunk';
    if (d < 3.1) return 'layup';
    if (im > 0.5 && inDot < -0.55 && d < 7.5) return 'fade';
    return 'jumper';
  },
  contestFor(sh, type) {
    let c = 0;
    for (const o of this.players) {
      if (o.team === sh.team) continue;
      const d = dist2D(o.pos, sh.pos); if (d > 2.4) continue;
      const f = this.inFront(sh, o); if (f < -0.25) continue;
      let k = (1 - d / 2.4) * (0.55 + 0.45 * clamp(f, 0, 1));
      const up = o.action && (o.action.kind === 'block' || o.action.kind === 'rebound');
      k *= up ? 1.35 : (o.ctrl.stance === 'defense' ? 0.95 : 0.7);
      if (o.airborne) k *= 1.15;
      c = Math.max(c, k);
    }
    if (type === 'fade') c *= 0.55;
    return clamp(c, 0, 1);
  },
  userContext() {
    const u = this.user, b = this.ball;
    if (!u) return 'none';
    if (u.hasBall) return 'offense';
    if (b.mode === 'held' && b.holder) return b.holder.team === u.team ? 'teammate' : 'defense';
    return 'loose';
  },
  dribbleMoveKind(p, mx, mz) {
    const tx = HOOP.x - p.pos.x, tz = HOOP.z - p.pos.z, tl = Math.hypot(tx, tz) || 1, im = Math.hypot(mx, mz);
    if (im > 0.5 && (mx * tx + mz * tz) / (tl * im) < -0.5) return 'stepback';
    if (p.ctrl.sprint && p.speed > 3.2) return 'spin';
    return 'cross';
  },

  // ── ball ownership ───────────────────────────────────────────────────────
  giveBall(p, reason = 'catch') {
    const b = this.ball;
    const prevMeta = b.meta;
    this.players.forEach((o) => (o.hasBall = false));
    b.setHeld(p); p.hasBall = true; p.dribble.phase = 0.1; p.dribble.cross = null;
    if (reason === 'catch') Sound.catchBall();
    if (this.pendingShot) this.shotMissed(this.pendingShot);
    if (this.ballFromShot && reason === 'catch' && (!prevMeta || prevMeta.kind === 'shot')) { p.stats.reb++; }
    this.ballFromShot = false;
    if (!this.rulesOn() || this.phase !== 'live') return;
    if (p.team !== this.possession) {
      this.possession = p.team; this.needClear[p.team] = true; this.needClear[1 - p.team] = false;
      this.shotClock = SHOT_CLOCK; this.clockOff = false;
      if (p.isHuman) UI.toast('TAKE IT BACK', 'warn');
    } else if (this.clockOff) { this.shotClock = SHOT_CLOCK; this.clockOff = false; }
  },

  // ── shooting ─────────────────────────────────────────────────────────────
  launchShot(p, a, e) {
    const b = this.ball;
    if (!p.hasBall) return;
    const type = a.type, contest = this.contestFor(p, type), w = a.w;
    const perfect = Math.abs(e) <= w;
    let speedErr = perfect ? gauss() * 0.0025 : (Math.abs(e) - w) * Math.sign(e) * 0.3 + gauss() * 0.004;
    speedErr += gauss() * contest * (perfect ? 0.006 : 0.018);
    const P = b.pos;
    let ux = HOOP.x - P.x, uz = HOOP.z - P.z; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const ax = HOOP.x + ux * 0.03, az = HOOP.z + uz * 0.03;
    const d = Math.max(0.15, Math.hypot(ax - P.x, az - P.z)), h = HOOP.y - P.y;
    let yawSig = (0.0035 + d * 0.0011) * (1.6 - 0.6 * p.r.shoot) + contest * 0.03 + (type === 'fade' ? 0.004 : 0) + clamp(p.speed / 6, 0, 1) * 0.006;
    if (perfect) yawSig *= 0.35;
    if (type === 'layup') { speedErr = speedErr * 0.8 + gauss() * contest * 0.06; yawSig = yawSig * 0.9 + contest * 0.07; }
    const deg = Math.PI / 180;
    let theta = type === 'layup' ? Math.max(58 * deg, Math.atan(2 * h / d) + 12 * deg) : clamp(54 - d * 0.85, 45, 53) * deg;
    if (Math.tan(theta) < 2 * h / d + 0.25) theta = Math.atan(2 * h / d + 0.25);
    theta = Math.min(theta, 80 * deg);
    const ct = Math.cos(theta);
    const v = Math.sqrt((GRAV * d * d) / (2 * ct * ct * (d * Math.tan(theta) - h))) * (1 + speedErr);
    const yaw = gauss() * yawSig, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const dx = ux * cy - uz * sy, dz = ux * sy + uz * cy;
    _v1.set(dx * v * ct, v * Math.sin(theta), dz * v * ct);
    const three = a.threePt && type !== 'layup';
    const meta = {
      kind: 'shot', shooter: p, team: p.team, type, three, points: this.pointsFor(three), perfect, contest, e,
      needClear: this.mustClear(p.team), live: this.phase === 'live' || this.phase === 'free', t: this.time, touched: [],
      atSpot: this.mode === 'challenge' && dist2D(a.startPos, CHALLENGE_SPOTS[this.challenge.spot]) < 1.15,
    };
    b.release('flight', _v1, meta);
    b.spin.set(-dz, 0, dx).multiplyScalar(13);
    p.hasBall = false; p.noCatch = 0.65;
    p.stats.fga++; if (three) p.stats.tpa++;
    this.pendingShot = meta; this.ballFromShot = true;
    if (this.mode === 'practice') { this.practice.att++; if (three) this.practice.ta++; }
    if (this.mode === 'challenge') this.challenge.att++;
    if (p.isHuman) {
      let label, cls;
      if (perfect) { label = 'PERFECT RELEASE'; cls = 'good'; Sound.perfect(); }
      else if (e < 0) { label = e < -w - 0.12 ? 'VERY EARLY' : 'SLIGHTLY EARLY'; cls = 'warn'; }
      else { label = e > w + 0.12 ? 'VERY LATE' : 'SLIGHTLY LATE'; cls = 'warn'; }
      const tag = contest > 0.55 ? 'HEAVILY CONTESTED' : contest > 0.25 ? 'CONTESTED' : 'OPEN';
      UI.feedback(label, cls, tag);
      UI.meterResult(e, w);
    }
  },
  slamDunk(p) {
    const b = this.ball;
    if (!p.hasBall) return;
    const D = this.aiDiff;
    let blocker = null;
    for (const o of this.players) {
      if (o.team === p.team) continue;
      if (hoopDist(o.pos) < 1.5 && dist2D(o.pos, p.pos) < 1.2 && o.airborne && o.jumpY > 0.3) {
        const pb = (o.isHuman ? 0.6 : D.block * 0.7) * o.r.defense;
        if (chance(pb)) { blocker = o; break; }
      }
    }
    p.hasBall = false; p.noCatch = 0.8; p.stats.fga++;
    if (blocker) {
      const ox = p.pos.x - HOOP.x, oz = p.pos.z - HOOP.z, ol = Math.hypot(ox, oz) || 1;
      b.release('loose', _v1.set((ox / ol) * 4 + rand(-1, 1), 1.5, (oz / ol) * 4 + rand(0.5, 1.5)));
      b.lastTouch = blocker; blocker.stats.blk++;
      this.ballFromShot = true;
      UI.flash('REJECTED!', 'bad'); Sound.board(6); this.world.crowd.cheer(1); Sound.cheer(true);
      if (blocker.ai) blocker.ai.say('block');
      this.shotMissed({ shooter: p, team: p.team, kind: 'shot', type: 'dunk' }, true);
      return;
    }
    const ux = (HOOP.x - p.pos.x), uz = (HOOP.z - p.pos.z), ul = Math.hypot(ux, uz) || 1;
    b.pos.set(HOOP.x - (ux / ul) * 0.03, HOOP.y + 0.2, HOOP.z - (uz / ul) * 0.03);
    const meta = { kind: 'shot', shooter: p, team: p.team, type: 'dunk', three: false, points: this.pointsFor(false), perfect: true, contest: 0, needClear: this.mustClear(p.team), live: this.phase === 'live' || this.phase === 'free', t: this.time, touched: [], dunk: true };
    b.release('flight', _v1.set(0, -5.5, 0), meta);
    this.pendingShot = meta; this.ballFromShot = true;
    p.stats.dnk++;
    if (this.mode === 'practice') this.practice.att++;
    if (this.mode === 'challenge') this.challenge.att++;
    Sound.dunk(); this.world.shakeRim(0.06); this.shake = 0.35;
    const near = this.players.find((o) => o.team !== p.team && dist2D(o.pos, p.pos) < 1.4);
    UI.flash(near ? 'POSTERIZED!' : 'SLAM!', 'hot');
  },

  // ── passing, steals, dribble moves ───────────────────────────────────────
  throwPass(from, to) {
    const b = this.ball;
    if (!from.hasBall) return;
    const sx = b.pos.x, sy = b.pos.y, sz = b.pos.z;
    let t = clamp(dist2D(from.pos, to.pos) / 11, 0.22, 0.85);
    const tx = to.pos.x + to.vel.x * t, tz = to.pos.z + to.vel.z * t, ty = 1.25 * to.scale;
    t = clamp(Math.hypot(tx - sx, tz - sz) / 11, 0.22, 0.85);
    _v1.set((tx - sx) / t, (ty - sy) / t + 0.5 * GRAV * t, (tz - sz) / t);
    b.release('flight', _v1, { kind: this.phase === 'check' ? 'check' : 'pass', from, to, team: from.team });
    from.hasBall = false; from.noCatch = 0.4;
    Sound.pass();
  },
  resolveSteal(st) {
    const b = this.ball;
    if (b.mode === 'flight' && b.meta && b.meta.kind === 'pass' && b.meta.team !== st.team) {
      st.handPos(-1, _v1);
      if (_v1.distanceTo(b.pos) < 0.7) { this.giveBall(st, 'catch'); st.stats.stl++; UI.flash('PICKED OFF!', 'hot'); }
      return;
    }
    if (b.mode !== 'held' || !b.holder || b.holder.team === st.team) return;
    const h = b.holder;
    if (h.busy && h.action.kind !== 'cross') return; // mid-shot / pass: can't reach it
    const d = dist2D(st.pos, h.pos);
    if (d > 1.5) return;
    st.handPos(-1, _v1); st.handPos(1, _v2);
    const dh = Math.min(_v1.distanceTo(b.pos), _v2.distanceTo(b.pos));
    let p = 0.3 * st.r.defense * (st.isHuman ? 1 : 0.7 + this.aiDiff.steal * 0.5);
    if (dh < 0.45) p *= 1.6; else if (dh > 0.9) p *= 0.4;
    if (h.action && h.action.kind === 'cross') p *= 1.8;
    const hf = h.forward(_v3), bx = st.pos.x - h.pos.x, bz = st.pos.z - h.pos.z, bl = Math.hypot(bx, bz) || 1;
    if ((hf.x * bx + hf.z * bz) / bl < -0.3) p *= 1.4; // reach from behind
    p /= h.r.handle;
    p = clamp(p, 0.04, 0.72);
    if (chance(p)) {
      const ux = (st.pos.x - h.pos.x) / bl, uz = (st.pos.z - h.pos.z) / bl;
      h.hasBall = false; h.noCatch = 0.55; h.stats.to++;
      b.release('loose', _v1.set(ux * 2.2 + rand(-0.6, 0.6), 1.2, uz * 2.2 + rand(-0.6, 0.6)));
      b.lastTouch = st; st.stats.stl++;
      Sound.steal();
      UI.flash(st.isHuman ? 'STOLEN!' : 'STRIPPED!', st.isHuman ? 'hot' : 'bad');
      if (st.ai) st.ai.say('steal');
    } else if (d < 0.95 && chance(0.13) && this.rulesOn() && this.phase === 'live') {
      Sound.whistle();
      UI.flash('REACH-IN FOUL', 'warn');
      this.setPhase('dead'); this.nextPossession = h.team; this.ball.mode = 'dead'; h.hasBall = false;
    }
  },
  onDribbleMove(p, kind) {
    for (const o of this.players) {
      if (o.team === p.team) continue;
      const d = dist2D(o.pos, p.pos);
      if (d > 2.0 || this.inFront(p, o) < 0.25) continue;
      let c = { cross: 0.16, spin: 0.2, stepback: 0.22 }[kind] * p.r.handle / o.r.defense;
      if (o.action && o.action.kind === 'steal') c *= 2.6;
      if (!o.isHuman) c *= 1.25 - this.aiDiff.speed * 0.4;
      if (chance(c)) {
        o.stumble(0.85);
        UI.flash(p.isHuman ? 'ANKLE BREAKER!' : 'SHOOK YOU!', p.isHuman ? 'hot' : 'bad');
        this.world.crowd.cheer(0.8); Sound.cheer(false);
        if (p.ai) p.ai.say('ankle');
      }
    }
  },

  // ── scoring / misses / turnovers ─────────────────────────────────────────
  shotMissed(meta, blocked = false) {
    if (this.pendingShot !== meta && !blocked) return;
    this.pendingShot = null;
    const s = meta.shooter;
    if (this.mode === 'practice' && s.isHuman) { this.practice.streak = 0; }
    if (this.mode === 'challenge' && s.isHuman) { const c = this.challenge; c.streak = 0; if (c.fire) UI.toast('COOLED OFF', 'warn'); c.fire = false; this.ball.trailOn = false; }
    if (this.rulesOn()) {
      for (const ai of this.ais) if (ai.p.team !== s.team) ai.onOpponentMiss();
      if (s.isHuman) Sound.groan();
    }
  },
  handleScore(ev) {
    const b = this.ball, meta = ev.meta;
    if (ev.swish) Sound.swish(); else Sound.swish();
    let shooter = meta && meta.kind === 'shot' ? meta.shooter : (b.lastTouch || null);
    if (!shooter) return;
    const three = meta && meta.kind === 'shot' ? meta.three : false;
    const pts = meta && meta.kind === 'shot' ? meta.points : this.pointsFor(false);
    this.pendingShot = null;
    if (this.mode === 'practice') {
      const P = this.practice; P.made++; P.streak++; P.best = Math.max(P.best, P.streak); if (three) P.tm++; if (ev.swish) P.swish++;
      shooter.stats.fgm++; if (three) shooter.stats.tpm++;
      UI.flash(ev.swish ? 'SWISH!' : (meta && meta.dunk ? 'SLAM!' : 'BUCKET!'), 'good');
      this.world.crowd.cheer(0.5); Sound.cheer(false);
      return;
    }
    if (this.mode === 'challenge') {
      const C = this.challenge;
      if (!(meta && meta.live)) return;
      let add = pts; let tag = three ? '3PT' : '2PT';
      if (meta && meta.atSpot) { add *= 2; tag = 'MONEY SPOT ×2'; }
      if (ev.swish) add += 1;
      C.score += add; C.made++; C.streak++; C.bestStreak = Math.max(C.bestStreak, C.streak);
      if (C.streak === 3 && !C.fire) { C.fire = true; this.ball.trailOn = true; UI.toast('ON FIRE!', 'hot'); }
      if (meta && meta.atSpot) { C.spot = (C.spot + 1) % CHALLENGE_SPOTS.length; this.updateSpot(); }
      UI.flash('+' + add, ev.swish ? 'good' : 'hot', ev.swish ? 'SWISH · ' + tag : tag);
      this.world.crowd.cheer(0.6); Sound.cheer(C.streak >= 3);
      return;
    }
    // 1v1 / attract
    if (this.phase !== 'live' && !(meta && meta.live)) return;
    const team = shooter.team;
    if (meta && meta.needClear) {
      Sound.whistle();
      UI.flash('NO BASKET', 'bad', 'Take it back past the arc first');
      this.setPhase('dead'); this.ball.mode = 'dead'; this.nextPossession = 1 - team;
      return;
    }
    this.award(team, pts, shooter, meta, ev.swish);
  },
  award(team, pts, shooter, meta, swish) {
    this.score[team] += pts;
    shooter.stats.pts += pts; shooter.stats.fgm++; if (meta && meta.three) shooter.stats.tpm++;
    const user = shooter.isHuman;
    const label = meta && meta.dunk ? 'SLAM!' : swish ? 'SWISH!' : (meta && meta.three ? 'FROM DOWNTOWN!' : 'BUCKET!');
    if (this.mode !== 'attract') UI.flash('+' + pts, user ? 'good' : 'bad', label);
    this.world.crowd.cheer(pts >= 3 || (meta && meta.dunk) ? 1 : 0.6); Sound.cheer(pts >= 3);
    this.ball.mode = 'dead'; this.ball.meta = null;
    this.setPhase('dead');
    this.nextPossession = Settings.makeItTakeIt ? team : 1 - team;
    const dist = meta && meta.shooter ? hoopDist(meta.shooter.pos) : 2;
    for (const p of this.players) {
      if (p === shooter) { if (p.ai) p.ai.onScore(); else p.setEmote('celebrate', 1.3); }
      else if (p.team !== team) { if (p.ai) p.ai.onOpponentScore(dist); else p.setEmote('dejected', 1.0); }
    }
    if (this.score[team] >= Settings.target || (this.mode === 'attract' && this.score[team] >= 11)) this.winner = team;
  },
  goaltend(o, meta) {
    Sound.whistle();
    UI.flash('GOALTENDING', 'warn', 'Basket counts');
    this.ball.release('loose', _v1.set(rand(-1, 1), -1, 2));
    this.pendingShot = null;
    if (meta.needClear) { this.setPhase('dead'); this.ball.mode = 'dead'; this.nextPossession = 1 - meta.team; return; }
    this.award(meta.team, meta.points, meta.shooter, meta, false);
  },
  turnover(team, reason) {
    if (this.phase !== 'live') return;
    Sound.whistle();
    const user = this.user && this.user.team === team;
    UI.flash(reason, user ? 'bad' : 'info', user ? 'Turnover' : 'Your ball');
    const h = this.ball.holder; if (h) { h.stats.to++; h.hasBall = false; }
    this.ball.mode = 'dead'; this.ball.meta = null; this.pendingShot = null;
    this.setPhase('dead'); this.nextPossession = 1 - team;
  },

  // ── per-frame ────────────────────────────────────────────────────────────
  update(dt) {
    this.time += dt; this.phaseT += dt;
    if (this.user) this.updateHuman(dt);
    for (const ai of this.ais) ai.update(dt);
    for (const p of this.players) p.update(dt);
    this.separate();
    const b = this.ball;
    if (b.mode === 'held' && b.holder) { b.holder.ballAnchor(this._anchor, dt); b.placeHeld(this._anchor, dt); }
    b.update(dt);
    if (b.mode === 'flight' && b.meta && b.meta.kind === 'shot') this.checkBlocks();
    if (b.mode === 'flight' && b.meta && (b.meta.kind === 'pass' || b.meta.kind === 'check') && b.floorBounces > 0) { b.mode = 'loose'; b.meta = null; }
    this.checkCatches();
    this.handleEvents();
    this.updateRules(dt);
    this.world.update(dt, this.time, b);
    this.updateCamera(dt);
  },

  updateHuman(dt) {
    const p = this.user, c = p.ctrl, B = Input.btn;
    c.face = null; c.stance = null;
    if (!this.controlsLive()) { c.mx = c.mz = 0; c.sprint = false; return; }
    // camera-relative stick: screen-right / screen-up rotated by the camera yaw
    const yaw = this.camYaw || 0, cs = Math.cos(yaw), sn = Math.sin(yaw), ix = Input.move.x, iy = Input.move.y;
    c.mx = ix * cs - iy * sn; c.mz = -ix * sn - iy * cs; c.sprint = B.sprint.down;
    const ctx = this.userContext();
    if (ctx === 'defense') {
      const h = this.ball.holder;
      if (dist2D(h.pos, p.pos) < 4.5) { c.face = h.pos; c.stance = 'defense'; }
    }
    if (ctx === 'offense') {
      if (B.shoot.pressed) this.shootBuffer = 0.3;
      if (this.shootBuffer > 0) {
        this.shootBuffer -= dt;
        if (!p.busy && !p.airborne) {
          const type = this.shotTypeFor(p, c.mx, c.mz);
          if (p.startShot(type)) this.shootBuffer = 0;
        } else if (p.action && p.action.kind === 'cross') { p.action = null; p.dribble.cross = null; }
      }
      if (p.action && p.action.kind === 'shot' && !p.action.released && p.action.aiRelease === null && !B.shoot.down && p.action.t > 0) p.releaseShot();
      if (B.pass.pressed) { const tm = this.teammate(p); if (tm) p.startPass(tm); }
      if (B.move.pressed) p.startDribbleMove(this.dribbleMoveKind(p, c.mx, c.mz), c.mx, c.mz);
    } else {
      this.shootBuffer = 0;
      if (B.shoot.pressed) p.startBlock(ctx === 'defense' ? 'block' : 'rebound');
      if (B.pass.pressed) {
        if (ctx === 'teammate') { this.feedCall = true; UI.bubble(p, 'Ball!'); }
        else p.startSteal();
      }
    }
  },

  separate() {
    const P = this.players;
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j];
      if (Math.abs(a.jumpY - b.jumpY) > 1.2) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = 0.62 * (a.scale + b.scale) / 2;
      if (d < min && d > 1e-4) {
        const push = min - d, nx = dx / d, nz = dz / d;
        let wa = 0.5, wb = 0.5;
        if (a.hasBall) { wa = 0.7; wb = 0.3; } else if (b.hasBall) { wa = 0.3; wb = 0.7; }
        a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa;
        b.pos.x += nx * push * wb; b.pos.z += nz * push * wb;
        // the ball handler loses speed bumping into a set defender
        const h = a.hasBall ? a : b.hasBall ? b : null;
        if (h) h.vel.multiplyScalar(0.92);
      }
    }
  },

  checkBlocks() {
    const b = this.ball, m = b.meta;
    if (m.type === 'dunk' || b.touchedRim || b.touchedBoard) return;
    for (const o of this.players) {
      if (o.team === m.team || m.touched.includes(o)) continue;
      if (!o.airborne) continue;
      o.handPos(1, _v1); o.handPos(-1, _v2);
      const d = Math.min(_v1.distanceTo(b.pos), _v2.distanceTo(b.pos));
      if (d > BALL_R + 0.16) continue;
      m.touched.push(o);
      b.lastTouch = o;
      const goaltend = b.vel.y < 0 && b.pos.y > HOOP.y && hoopDist(b.pos) < 1.5;
      if (goaltend && this.rulesOn() && this.phase === 'live') { this.goaltend(o, m); return; }
      const pBlock = (o.isHuman ? 0.82 : this.aiDiff.block) * (0.6 + 0.4 * o.r.defense);
      if (chance(pBlock)) {
        const ox = m.shooter.pos.x - o.pos.x, oz = m.shooter.pos.z - o.pos.z, ol = Math.hypot(ox, oz) || 1;
        b.release('loose', _v3.set((ox / ol) * 3.2 + rand(-1.2, 1.2), rand(0.8, 2.4), (oz / ol) * 3.2 + rand(-1.2, 1.2)));
        b.lastTouch = o; o.stats.blk++;
        this.ballFromShot = true;
        UI.flash(o.isHuman ? 'BLOCKED!' : 'SWATTED!', o.isHuman ? 'hot' : 'bad');
        Sound.board(5); this.world.crowd.cheer(0.9); Sound.cheer(true);
        if (o.ai) o.ai.say('block');
        this.shotMissed(m, true);
        return;
      }
      b.vel.x += rand(-1.2, 1.2); b.vel.z += rand(-0.8, 0.8); b.vel.y *= 0.88;
      UI.feedback('TIPPED', 'warn', '');
    }
  },

  checkCatches() {
    const b = this.ball;
    if (b.mode === 'held' || b.mode === 'dead') return;
    const m = b.meta;
    if (m && m.kind === 'shot' && !(b.touchedRim || b.touchedBoard || b.floorBounces > 0)) {
      if (!(b.vel.y < 0 && b.pos.y < 2.5)) return; // airball rebounds only once it drops
    }
    let best = null, bd = 1e9;
    for (const p of this.players) {
      if (p.noCatch > 0 || (p.action && (p.action.kind === 'shot' || p.action.kind === 'dunk' || p.action.kind === 'stumble'))) continue;
      if (m && m.kind === 'check' && p !== m.to) continue;
      const dh = dist2D(p.pos, b.pos), y = b.pos.y;
      const reach = y < 1.0 ? 0.55 : 0.68;
      if (dh > reach * p.scale || y > p.reachTop() + 0.12 || y < 0.04) continue;
      if (m && m.kind === 'pass' && p !== m.to && p.team !== m.team && !chance(0.18 * p.r.defense)) continue; // interception roll
      if (dh < bd) { bd = dh; best = p; }
    }
    if (!best) return;
    if (m && m.kind === 'pass' && best.team !== m.team) { best.stats.stl++; UI.flash(best.isHuman ? 'PICKED OFF!' : 'INTERCEPTED!', best.isHuman ? 'hot' : 'bad'); }
    if (m && m.kind === 'check') { this.giveBall(best, 'check'); this.setPhase('live'); if (this.mode !== 'attract') UI.flash('BALL IN', 'info'); return; }
    if (m && m.kind === 'pass' && best === m.to && m.from) { /* assists are tracked on the next make */ }
    this.giveBall(best, 'catch');
  },

  handleEvents() {
    const b = this.ball;
    for (const ev of b.events) {
      switch (ev.type) {
        case 'floor':
          Sound.bounce(ev.v);
          if (this.pendingShot && b.mode !== 'held') this.shotMissed(this.pendingShot);
          if (this.rulesOn() && this.phase === 'live' && b.mode !== 'held' && !inBounds(b.pos.x, b.pos.z, BALL_R)) {
            const lt = b.lastTouch; this.turnover(lt ? lt.team : this.possession, 'OUT OF BOUNDS');
          }
          break;
        case 'rim': Sound.rim(ev.v); this.world.shakeRim(ev.v * 0.004); if (this.rulesOn()) this.clockOff = true; break;
        case 'board': Sound.board(ev.v); break;
        case 'pole': Sound.board(ev.v * 0.6); break;
        case 'fence': if (b.vel.lengthSq() > 2) Sound.rim(1); break;
        case 'score': this.handleScore(ev); break;
        default: break;
      }
    }
    b.events.length = 0;
  },

  updateRules(dt) {
    const b = this.ball;
    if (this.mode === 'practice') return;
    if (this.mode === 'challenge') return this.updateChallenge(dt);
    switch (this.phase) {
      case 'check': {
        const def = this.teamPlayers(1 - this.possession)[0], off = this.teamPlayers(this.possession)[0];
        if (!this.checkPassed && this.phaseT > 0.85 && def.hasBall) { def.startPass(off); this.checkPassed = true; }
        if (this.phaseT > 3.5 && this.phase === 'check') { this.giveBall(off, 'check'); this.setPhase('live'); }
        break;
      }
      case 'live': {
        if (!this.clockOff) this.shotClock -= dt;
        if (this.shotClock <= 0) {
          this.shotClock = 0;
          const inAir = b.mode === 'flight' && b.meta && b.meta.kind === 'shot';
          if (!inAir) { Sound.buzzer(); this.turnover(this.possession, 'SHOT CLOCK'); }
        }
        const h = b.mode === 'held' ? b.holder : null;
        if (h && this.needClear[h.team] && isBeyondArc(h.pos.x, h.pos.z)) {
          this.needClear[h.team] = false;
          if (h.isHuman) UI.toast('CLEARED', 'good');
        }
        if (h && !h.airborne && !inBounds(h.pos.x, h.pos.z, 0.05)) this.turnover(h.team, 'OUT OF BOUNDS');
        else if (b.mode === 'loose' && b.pos.y < 0.25 && !inBounds(b.pos.x, b.pos.z, BALL_R)) {
          const lt = b.lastTouch; this.turnover(lt ? lt.team : this.possession, 'OUT OF BOUNDS');
        }
        break;
      }
      case 'dead':
        if (this.phaseT > 1.7) {
          if (this.winner !== null) this.endGame();
          else this.startCheck(this.nextPossession);
        }
        break;
      default: break;
    }
  },

  updateChallenge(dt) {
    const C = this.challenge;
    if (this.phase === 'countdown') {
      const n = 3 - Math.floor(this.phaseT);
      if (n !== this._lastCount && n > 0) { this._lastCount = n; UI.flash(String(n), 'info'); Sound.tick(); }
      if (this.phaseT >= 3) { this.setPhase('live'); UI.flash('GO!', 'good'); Sound.whistle(); this._lastCount = null; }
    } else if (this.phase === 'live') {
      C.time -= dt;
      if (C.time <= 10 && Math.ceil(C.time) !== this._lastTick && C.time > 0) { this._lastTick = Math.ceil(C.time); Sound.tick(); }
      if (C.time <= 0) {
        C.time = 0; Sound.buzzer(); this.setPhase('buzzer');
        UI.flash('TIME!', 'warn');
        if (this.user.action && this.user.action.kind === 'shot' && !this.user.action.released) this.user.releaseShot();
      }
    } else if (this.phase === 'buzzer') {
      const inAir = this.ball.mode === 'flight' && this.ball.meta && this.ball.meta.kind === 'shot' && !this.ball.scored && this.ball.floorBounces === 0;
      if (!inAir || this.phaseT > 3) this.endGame();
    }
  },
  updateSpot() {
    const s = CHALLENGE_SPOTS[this.challenge.spot];
    this.spotRing.position.set(s.x, 0.02, s.z); this.spotDisc.position.set(s.x, 0.018, s.z);
    this.spotRing.visible = this.spotDisc.visible = true;
  },

  endGame() {
    this.setPhase('over');
    this.players.forEach((p) => { p.ctrl.mx = p.ctrl.mz = 0; });
    if (this.mode === 'attract') { this.startMode('attract'); return; }
    Sound.buzzer();
    if (this.mode === 'challenge') {
      const C = this.challenge; const record = C.score > C.best;
      if (record) Store.set('challengeBest', C.score);
      UI.showResults({ mode: 'challenge', score: C.score, made: C.made, att: C.att, bestStreak: C.bestStreak, best: Math.max(C.best, C.score), record });
    } else {
      const won = this.winner === 0;
      if (won) Sound.cheer(true);
      this.players.forEach((p) => p.setEmote(p.team === this.winner ? 'celebrate' : 'dejected', 3));
      UI.showResults({ mode: '1v1', won, score: this.score.slice(), players: this.players });
    }
  },

  // ── camera ───────────────────────────────────────────────────────────────
  updateCamera(dt) {
    const cam = this.camera, portrait = cam.aspect < 1;
    if (this.mode === 'attract' || !this.user) {
      const a = this.time * 0.08;
      const r = portrait ? 22 : 16;
      _v1.set(Math.sin(a) * r * 0.7, portrait ? 9 : 6.5, 6 + Math.cos(a) * r * 0.55 + 4);
      this.camPos.lerp(_v1, 1 - Math.exp(-2 * dt));
      this.camLook.lerp(_v2.set(0, 1.6, 4.5), 1 - Math.exp(-2 * dt));
      cam.position.copy(this.camPos); cam.lookAt(this.camLook);
      return;
    }
    const u = this.user, b = this.ball;
    const close = Settings.camera === 'close';
    let H = close ? 3.3 : 4.6, back = close ? 5.4 : 7.2;
    if (portrait) { H += 3.0; back += 4.2; }
    const flying = b.mode === 'flight' && b.meta && b.meta.kind === 'shot';
    const wBall = flying ? 0.45 : b.mode === 'loose' ? 0.35 : 0.15;
    const fx = lerp(u.pos.x, b.pos.x, wBall), fz = lerp(u.pos.z, b.pos.z, wBall);
    // swing behind the player relative to the hoop (capped), so corners and
    // the baseline still face the rim; the joystick follows this yaw
    const ox = fx - HOOP.x, oz = Math.max(fz - HOOP.z, 0) + 4.5;
    const want = clamp(Math.atan2(ox, oz) * 0.8, -0.7, 0.7);
    this.camYaw = damp(this.camYaw || 0, want, 2.2, dt);
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
    _v1.set(fx + sy * back, H, fz + cy * back);
    _v1.z = Math.min(_v1.z, WORLD.zMax + 5); _v1.x = clamp(_v1.x, -WORLD.x + 0.5, WORLD.x - 0.5);
    _v2.set(lerp(fx - sy * 1.5, HOOP.x, 0.35), portrait ? 1.0 : 1.5, lerp(fz - cy * 1.5, HOOP.z, 0.35));
    this.camPos.x = damp(this.camPos.x, _v1.x, 3.5, dt); this.camPos.y = damp(this.camPos.y, _v1.y, 3, dt); this.camPos.z = damp(this.camPos.z, _v1.z, 3.5, dt);
    this.camLook.x = damp(this.camLook.x, _v2.x, 5, dt); this.camLook.y = damp(this.camLook.y, _v2.y, 5, dt); this.camLook.z = damp(this.camLook.z, _v2.z, 5, dt);
    cam.position.copy(this.camPos);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); const s = this.shake * 0.12; cam.position.x += rand(-s, s); cam.position.y += rand(-s, s); }
    cam.lookAt(this.camLook);
  },
};
