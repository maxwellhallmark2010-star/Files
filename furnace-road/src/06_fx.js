// ─────────────────────────────────────────────────────────────────────────────
// Effects: tumbleweeds blown across the road by a shifting desert wind (they
// roll, hop, and get launched when you hit them) and a pooled particle system
// for dust plumes, tyre smoke and exhaust.
// ─────────────────────────────────────────────────────────────────────────────
const Dust = {
  N: 420,
  init(scene) {
    const N = this.N;
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.max = new Float32Array(N);
    this.size = new Float32Array(N); this.grow = new Float32Array(N); this.alpha = new Float32Array(N); this.tone = new Float32Array(N);
    this.a0 = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('tone', new THREE.BufferAttribute(this.tone, 1));
    this.uni = { map: { value: TEX.soft }, sand: { value: new THREE.Color(0xd2b48a) }, light: { value: 1 }, scale: { value: 400 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uni, transparent: true, depthWrite: false,
      vertexShader: `attribute float size; attribute float alpha; attribute float tone; varying float vA; varying float vT;
        uniform float scale; void main(){ vA = alpha; vT = tone; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / max(-mv.z, 0.5); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 sand; uniform float light; varying float vA; varying float vT;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); vec3 c = mix(sand, vec3(0.32,0.3,0.29), vT) * light;
        gl_FragColor = vec4(c, t.a * vA); if (gl_FragColor.a < 0.01) discard; }`,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
    this.base = 0; this.next = 0;
    scene.add(this.points);
  },
  rebase(z) {
    const nb = Math.floor(z / 1000) * 1000;
    if (nb === this.base) return;
    const d = nb - this.base; for (let i = 0; i < this.N; i++) this.pos[i * 3 + 2] -= d;
    this.base = nb; this.points.position.z = nb;
  },
  emit(x, y, z, vx, vy, vz, size, life, alpha, tone = 0, grow = 2) {
    const i = this.next; this.next = (this.next + 1) % this.N;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z - this.base;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow; this.a0[i] = alpha; this.tone[i] = tone;
  },
  update(dt, wind) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3, drag = Math.exp(-1.6 * dt);
      this.vel[k] = this.vel[k] * drag + wind.x * 0.6 * dt; this.vel[k + 1] = this.vel[k + 1] * drag + 0.25 * dt; this.vel[k + 2] = this.vel[k + 2] * drag + wind.z * 0.6 * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.max[i];
      this.alpha[i] = this.a0[i] * Math.min(1, (1 - t) * 6) * t;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true; a.size.needsUpdate = true; a.alpha.needsUpdate = true; a.tone.needsUpdate = true;
  },
};

const Tumbleweeds = {
  list: [], wind: new THREE.Vector3(5, 0, 1), windT: 0,
  init(scene) {
    this.scene = scene;
    for (let i = 0; i < 11; i++) {
      const mesh = makeTumbleweed();
      const t = { mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: 0.4, q: new THREE.Quaternion(), active: false, hitT: 0 };
      scene.add(mesh); mesh.visible = false;
      this.list.push(t);
    }
    this.hits = 0;
  },
  reset() { this.list.forEach((t) => { t.active = false; t.mesh.visible = false; }); },
  spawn(t, car, near = false) {
    const ahead = near ? rand(-30, 120) : rand(70, 200);
    const z = car.z + ahead * (car.u >= -1 ? 1 : -1);
    const up = Math.sign(this.wind.x) || 1;      // start upwind so it rolls across the road
    const x = roadX(z) - up * rand(12, 70);
    t.r = rand(0.32, 0.72);
    t.pos.set(x, groundH(x, z) + t.r + rand(0, 1), z);
    t.vel.set(this.wind.x * 0.6, 0, this.wind.z * 0.6);
    t.mesh.scale.setScalar(t.r);
    t.active = true; t.mesh.visible = true; t.hitT = 0;
  },
  update(dt, car) {
    // gusty wind that slowly swings direction
    this.windT += dt;
    const ang = Math.sin(this.windT * 0.05) * 0.7 + Math.PI * 0.5 * (Math.sin(this.windT * 0.013) > -0.3 ? 1 : -1);
    const strength = 4.5 + 3 * Math.max(0, Math.sin(this.windT * 0.4) * Math.sin(this.windT * 0.17 + 1));
    this.wind.set(Math.sin(ang) * strength, 0, Math.cos(ang) * strength * 0.4);
    const f = car.forward(_v1);
    for (const t of this.list) {
      if (!t.active) { if (Math.random() < dt * 0.6) this.spawn(t, car, !this._seeded); continue; }
      const p = t.pos, v = t.vel;
      const g = groundH(p.x, p.z);
      const onGround = p.y - t.r <= g + 0.02;
      // drag toward wind speed, gravity, ground bounce with random hops
      const k = onGround ? 1.4 : 0.5;
      v.x += (this.wind.x - v.x) * k * dt; v.z += (this.wind.z - v.z) * k * dt; v.y -= GRAV * 0.75 * dt;
      p.addScaledVector(v, dt);
      if (p.y - t.r < g) {
        p.y = g + t.r;
        if (v.y < -1) v.y = -v.y * 0.45; else v.y = 0;
        if (Math.random() < dt * 1.6) v.y = rand(1.5, 4.2);
      }
      // roll: spin about the axis perpendicular to travel
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0.05) { _v2.set(v.z, 0, -v.x).normalize(); t.q.setFromAxisAngle(_v2, (sp / t.r) * dt); t.mesh.quaternion.premultiply(t.q); }
      t.mesh.position.copy(p);
      // car impact
      t.hitT = Math.max(0, t.hitT - dt);
      if (t.hitT <= 0) {
        for (const off of [1.3, 0, -1.3]) {
          const cx = car.x + f.x * off, cz = car.z + f.z * off;
          if (Math.hypot(p.x - cx, p.z - cz) < t.r + 0.95 && p.y - car.y < 2.4) {
            const cs = Math.abs(car.u);
            v.set(f.x * car.u * 1.15 + rand(-2, 2), 2.5 + cs * 0.35, f.z * car.u * 1.15 + rand(-2, 2));
            t.hitT = 0.6; this.hits++;
            Sound.twig();
            for (let i = 0; i < 14; i++) Dust.emit(p.x, p.y, p.z, rand(-3, 3) + v.x * 0.3, rand(0, 3), rand(-3, 3) + v.z * 0.3, 0.35, rand(0.6, 1.4), 0.7, 0.15, 1.2);
            break;
          }
        }
      }
      const dz = (p.z - car.z) * Math.sign(car.u || 1);
      if (dz < -60 || Math.abs(dz) > 260 || Math.abs(p.x - roadX(p.z)) > 110) { t.active = false; t.mesh.visible = false; }
    }
    this._seeded = true;
  },
};
