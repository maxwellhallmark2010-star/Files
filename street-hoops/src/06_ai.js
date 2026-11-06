// ─────────────────────────────────────────────────────────────────────────────
// AI: one controller per computer player. It reads the game state, writes the
// player's movement intent (ctrl) and triggers the same actions a human can.
//   offense with ball : clear → read the defender → shoot / drive / dribble move
//   defense           : stay between man and hoop, adaptive cushion, steals,
//                       closeouts, contests and blocks with reaction delay
//   loose ball        : predict the landing point, crash the glass, jump
//   feeder (practice) : rebound and pass back to the human shooter
// ─────────────────────────────────────────────────────────────────────────────
const SPOTS = [
  new THREE.Vector3(-6.9, 0, 1.3), new THREE.Vector3(6.9, 0, 1.3),     // corners
  new THREE.Vector3(-5.3, 0, 6.4), new THREE.Vector3(5.3, 0, 6.4),     // wings (3)
  new THREE.Vector3(0, 0, 8.6),                                         // top
  new THREE.Vector3(-2.6, 0, 5.6), new THREE.Vector3(2.6, 0, 5.6),     // elbows
  new THREE.Vector3(-4.2, 0, 2.2), new THREE.Vector3(4.2, 0, 2.2),     // short corners / baseline
];
const TAUNTS = {
  score: ['Too easy.', 'Cash.', 'Again?', 'Count it!', 'That\'s my spot.', 'Buckets.'],
  block: ['Not in here!', 'Get that outta here!', 'Denied.', 'Nope.'],
  steal: ['Mine.', 'Too loose!', 'Thanks!'],
  oppScore: ['Lucky.', 'Okay, okay.', 'Won\'t happen again.', 'Hmm.'],
  oppMiss: ['Brick!', 'Off the iron.', 'Close one.'],
  ankle: ['Whoa!', 'Ankles!'],
};

class AIController {
  constructor(player, opts = {}) {
    this.p = player;
    this.role = opts.role || 'player';
    this.plan = null; this.thinkT = rand(0.2, 0.5);
    this.react = 0; this.contestFor = null;
    this.memory = { gapBias: 0, oppOutside: 0, oppInside: 0 };
    this.feedT = 0;
    this.lastTaunt = -10;
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3();
  }
  get diff() { return DIFFICULTY[G.mode === 'attract' ? 'pro' : Settings.difficulty]; }

  say(kind) {
    if (G.time - this.lastTaunt < 4 || !chance(0.6)) return;
    this.lastTaunt = G.time;
    const list = TAUNTS[kind]; UI.bubble(this.p, list[(Math.random() * list.length) | 0]);
  }

  // movement helper: steer toward a point with arrival slow-down
  steer(target, sprint = false, arrive = 0.25) {
    const p = this.p, dx = target.x - p.pos.x, dz = target.z - p.pos.z, d = Math.hypot(dx, dz);
    if (d < arrive) { p.ctrl.mx = 0; p.ctrl.mz = 0; p.ctrl.sprint = false; return d; }
    const m = clamp(d / 1.2, 0.25, 1) * this.diff.speed;
    p.ctrl.mx = (dx / d) * m; p.ctrl.mz = (dz / d) * m; p.ctrl.sprint = sprint && d > 1.5;
    return d;
  }
  stop() { const c = this.p.ctrl; c.mx = c.mz = 0; c.sprint = false; }

  update(dt) {
    const p = this.p, c = p.ctrl;
    c.face = null; c.stance = null;
    if (!G.controlsLive()) { this.stop(); return; }
    if (this.role === 'feeder') return this.feeder(dt);
    const ball = G.ball;
    if (p.hasBall) return this.offense(dt);
    if (ball.mode === 'held' && ball.holder) {
      if (ball.holder.team !== p.team) return this.defend(dt, ball.holder);
      return this.offBall(dt);
    }
    if (ball.mode === 'flight' && ball.meta && ball.meta.kind === 'shot' && ball.meta.team !== p.team) return this.defendShot(dt);
    if (ball.mode === 'loose' || ball.mode === 'flight') return this.rebound(dt);
    this.stop();
  }

  // ── with the ball ────────────────────────────────────────────────────────
  offense(dt) {
    const p = this.p, D = this.diff;
    if (p.busy) return;
    const def = G.nearestOpponent(p);
    const d = hoopDist(p.pos);
    if (G.mustClear(p.team)) {
      const dir = this.tmp.set(p.pos.x - HOOP.x, 0, p.pos.z - HOOP.z); if (dir.z < 0.4) dir.z = 0.4; dir.normalize();
      const t = this.tmp2.set(HOOP.x + dir.x * 7.4, 0, HOOP.z + dir.z * 7.4);
      t.x = clamp(t.x, -6.2, 6.2); t.z = clamp(t.z, 3.2, 11);
      this.steer(t, true, 0.3); this.plan = null;
      return;
    }
    const clock = G.rulesOn() ? G.shotClock : 99;
    const defDist = def ? dist2D(def.pos, p.pos) : 99;
    const open = G.openness(p);
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = rand(0.22, 0.45) / D.aggression;
      const laneOpen = G.laneOpen(p);
      if (d < 2.9 && p.speed > 2.4 && laneOpen && p.r.jump >= 1 && chance(0.75)) { p.startShot('dunk'); return; }
      if (d < 2.5 && (laneOpen || chance(0.5))) { this.shoot('layup', open); return; }
      const q = G.shotQuality(p, open);
      const thresh = (clock < 3 ? 0.03 : clock < 6 ? 0.22 : 0.3) / (0.85 + 0.15 * D.aggression);
      if (q > thresh && d < 8.2 && d > 2.8 && chance(0.7)) {
        const fade = defDist < 1.2 && d > 3.2 && d < 6.5 && chance(0.4);
        this.shoot(fade ? 'fade' : 'jumper', open);
        return;
      }
      if (defDist < 1.5 && chance(0.4 * D.aggression) && p.moveCD <= 0) {
        const r = Math.random();
        const kind = d > 6.2 && r < 0.35 ? 'stepback' : (r < 0.65 ? 'cross' : 'spin');
        const side = chance(0.5) ? 1 : -1;
        const toH = this.tmp.set(HOOP.x - p.pos.x, 0, HOOP.z - p.pos.z).normalize();
        p.startDribbleMove(kind, -toH.z * side + toH.x * 0.5, toH.x * side + toH.z * 0.5);
        this.plan = { kind: 'drive', side, t: 1.6 };
        return;
      }
      if (!this.plan || this.plan.t <= 0 || chance(0.2)) {
        if (laneOpen && chance(0.55) || clock < 5) this.plan = { kind: 'drive', side: chance(0.5) ? 1 : -1, t: rand(1.2, 2.2) };
        else this.plan = { kind: 'spot', target: SPOTS[(Math.random() * SPOTS.length) | 0].clone(), t: rand(1.2, 2.5) };
      }
    }
    if (!this.plan) this.plan = { kind: 'drive', side: 1, t: 1 };
    this.plan.t -= dt;
    if (this.plan.kind === 'drive') {
      // attack the rim, slipping to the side away from the defender
      const toH = this.tmp.set(HOOP.x - p.pos.x, 0, HOOP.z - p.pos.z).normalize();
      let side = this.plan.side;
      if (def) { const cross = toH.x * (def.pos.z - p.pos.z) - toH.z * (def.pos.x - p.pos.x); side = cross > 0 ? -1 : 1; }
      const t = this.tmp2.set(HOOP.x - toH.x * 1.3 - toH.z * side * 0.8, 0, HOOP.z - toH.z * 1.3 + toH.x * side * 0.8);
      t.z = Math.max(t.z, 1.9);
      this.steer(t, true, 0.2);
      // defender sitting in the lane: swing out
      if (def && defDist < 1.1 && G.inFront(p, def) > 0.75) { p.ctrl.mx += -toH.z * side * 0.8; p.ctrl.mz += toH.x * side * 0.8; }
    } else {
      this.steer(this.plan.target, false, 0.4);
    }
    // stay inbounds with the ball
    if (Math.abs(p.pos.x) > 6.9) p.ctrl.mx -= Math.sign(p.pos.x) * 0.8;
    if (p.pos.z > 12.8) p.ctrl.mz -= 0.8;
    if (p.pos.z < 0.6) p.ctrl.mz += 0.8;
  }

  shoot(type, open) {
    const p = this.p, D = this.diff;
    const pGreen = clamp((D.shoot + (p.r.shoot - 1) * 0.8) * (0.45 + 0.55 * open), 0.05, 0.92);
    const w = G.shotWindow(p, type);
    const rel = chance(pGreen) ? SHOT.PERFECT + rand(-0.75, 0.75) * w
      : SHOT.PERFECT + Math.sign(gauss()) * (w + Math.abs(gauss()) * 0.07 * (1.4 - D.shoot));
    p.startShot(type, clamp(rel, 0.3, 1.1));
    this.plan = null;
  }

  // ── defending the ball handler ───────────────────────────────────────────
  defend(dt, man) {
    const p = this.p, D = this.diff, c = p.ctrl;
    if (p.busy && p.action.kind !== 'recover') return;
    const dMan = hoopDist(man.pos);
    const toH = this.tmp.set(HOOP.x - man.pos.x, 0, HOOP.z - man.pos.z).normalize();
    let gap = 1.15 + D.gapAdj + this.memory.gapBias;
    if (dMan > 8.2) gap += (dMan - 8.2) * 0.6;
    if (dMan < 3.2) gap = Math.min(gap, 0.75);
    gap = clamp(gap, 0.65, 3.5);
    const lead = D.react * 0.9;
    const t = this.tmp2.set(man.pos.x + man.vel.x * lead + toH.x * gap, 0, man.pos.z + man.vel.z * lead + toH.z * gap);
    const d = this.steer(t, dist2D(p.pos, t) > 0.9 || man.speed > 4.2 || dist2D(p.pos, HOOP) > dMan + 0.3, 0.12);
    c.face = man.pos; c.stance = dist2D(p.pos, man.pos) < 3.5 ? 'defense' : null;
    if (d > 0.12) { const m = Math.hypot(c.mx, c.mz); if (m > 0) { const s = clamp(d * 2.2, 0.3, 1) / m * D.speed; c.mx *= s; c.mz *= s; } }

    const md = dist2D(p.pos, man.pos);
    // closeouts, contests & blocks
    if (man.isShooting()) {
      if (this.contestFor !== man.action) { this.contestFor = man.action; this.react = D.react * rand(0.75, 1.25); }
      this.react -= dt;
      if (this.react <= 0 && !p.airborne && md < 2.0) {
        const ma = man.action;
        const close = md < 1.35 || ma.kind === 'dunk' || (ma.type === 'layup');
        if (close && chance(0.35 + D.block * 0.6)) p.startBlock('block');
      }
      if (md > 1.2) { c.mx = (man.pos.x - p.pos.x) / md; c.mz = (man.pos.z - p.pos.z) / md; c.sprint = true; }
      return;
    }
    // reach for the ball
    if (md < 1.45 && !man.busy && p.stealCD <= 0) {
      const exposed = man.action && man.action.kind === 'cross' ? 3.5 : 1;
      if (chance(D.steal * 0.7 * exposed * dt)) p.startSteal();
    }
  }
  defendShot(dt) { // ball in the air from the other team: box toward the rim
    const p = this.p;
    if (p.busy) return;
    const ball = G.ball;
    if (ball.vel.y < 1.5 || hoopDist(ball.pos) < 3) return this.rebound(dt);
    const t = this.tmp.set(HOOP.x + (p.pos.x - HOOP.x) * 0.35, 0, HOOP.z + Math.max(0.8, (p.pos.z - HOOP.z) * 0.35));
    this.steer(t, true, 0.3);
    p.ctrl.face = ball.pos;
  }

  offBall(dt) { // teammate has the ball (feeder handled separately)
    const p = this.p;
    this.steer(SPOTS[4], false, 0.5);
    p.ctrl.face = G.ball.pos;
  }

  // ── loose ball / rebounds ────────────────────────────────────────────────
  rebound(dt) {
    const p = this.p, ball = G.ball;
    if (p.busy) return;
    const tGrab = ball.predict(2.35, this.tmp);
    const target = this.tmp;
    // stay a touch off the landing spot so we arrive moving through it
    const d = this.steer(target, true, 0.15);
    p.ctrl.face = ball.pos;
    const dh = dist2D(p.pos, ball.pos);
    if (dh < 1.0 && ball.pos.y > 2.0 && ball.pos.y < p.reachTop() + 0.9 && ball.vel.y < 1.5 && !p.airborne &&
        (ball.touchedRim || ball.touchedBoard || ball.mode === 'loose') && chance(0.5)) p.startBlock('rebound');
    void tGrab; void d;
  }

  // ── practice / challenge feeder ──────────────────────────────────────────
  feeder(dt) {
    const p = this.p, ball = G.ball, user = G.user;
    p.ctrl.face = user.pos;
    if (p.hasBall) {
      this.stop();
      this.feedT += dt;
      const ready = !user.hasBall && !user.busy;
      const wait = G.mode === 'challenge' ? 0.15 : (G.feedCall ? 0 : 0.55);
      if (ready && this.feedT > wait && !p.busy) { p.startPass(user); G.feedCall = false; this.feedT = 0; }
      return;
    }
    this.feedT = 0;
    if (ball.mode === 'loose' || (ball.mode === 'flight' && ball.meta && ball.meta.kind === 'shot')) {
      if (ball.mode === 'flight' && !ball.touchedRim && !ball.touchedBoard && ball.vel.y > -1) {
        const home = this.tmp.set(HOOP.x + 1.0, 0, HOOP.z + 1.0); this.steer(home, true, 0.3); return;
      }
      ball.predict(1.4, this.tmp); this.steer(this.tmp, true, 0.1); p.ctrl.face = ball.pos;
      return;
    }
    // stand beside the hoop, opposite the shooter
    const side = user.pos.x > 0 ? -1 : 1;
    const home = this.tmp.set(HOOP.x + side * 1.6, 0, HOOP.z + 0.9);
    this.steer(home, false, 0.3);
  }

  // ── reactions ────────────────────────────────────────────────────────────
  onOpponentScore(dist) {
    if (dist > 5.2) { this.memory.oppOutside++; this.memory.gapBias = Math.max(-0.4, this.memory.gapBias - 0.12); }
    else { this.memory.oppInside++; this.memory.gapBias = Math.min(0.55, this.memory.gapBias + 0.1); }
    this.p.setEmote('dejected', 1.2);
    this.say('oppScore');
  }
  onOpponentMiss() { this.memory.gapBias *= 0.9; this.say('oppMiss'); }
  onScore() { this.p.setEmote(chance(0.5) ? 'celebrate' : 'flex', 1.3); this.say('score'); }
}
