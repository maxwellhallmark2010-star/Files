// ─────────────────────────────────────────────────────────────────────────────
// World: the court (canvas-painted markings to exact FIBA half-court scale),
// hoop / backboard / rim, a simulated net, and the dusk street environment.
// Static scenery is merged into a few draw calls; textures are generated on
// canvases at boot, so nothing is downloaded.
// ─────────────────────────────────────────────────────────────────────────────

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.encoding = THREE.sRGBEncoding;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
function speckle(g, w, h, n, colors, rMin = 0.5, rMax = 1.8) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    const r = rand(rMin, rMax);
    g.fillRect(Math.random() * w, Math.random() * h, r, r);
  }
}
// Merge an array of BufferGeometries (non-indexed or indexed) into one.
function mergeGeos(geos) {
  let vCount = 0, iCount = 0;
  geos.forEach((g) => { vCount += g.attributes.position.count; iCount += g.index ? g.index.count : g.attributes.position.count; });
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  geos.forEach((g) => {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  m.setPosition(x, y, z);
  geo.applyMatrix4(m);
  return geo;
}
function scaleUV(geo, su, sv) { const a = geo.attributes.uv.array; for (let i = 0; i < a.length; i += 2) { a[i] *= su; a[i + 1] *= sv; } return geo; }

// ── court markings ──────────────────────────────────────────────────────────
function courtTexture() {
  const AREA = { x0: -8.5, x1: 8.5, z0: -1, z1: 15 };
  const W = 2048, H = Math.round(2048 * (AREA.z1 - AREA.z0) / (AREA.x1 - AREA.x0));
  const ppm = W / (AREA.x1 - AREA.x0);
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const X = (x) => (x - AREA.x0) * ppm, Z = (z) => (z - AREA.z0) * ppm, M = (m) => m * ppm;

  // asphalt apron
  g.fillStyle = '#2b2d33'; g.fillRect(0, 0, W, H);
  speckle(g, W, H, 26000, ['#34373e', '#25272c', '#3c3f46', '#1f2125']);
  // painted court surface
  g.fillStyle = '#184c5e'; g.fillRect(X(-7.5), Z(0), M(15), M(14));
  // three-point area a touch lighter
  g.save(); g.beginPath();
  g.moveTo(X(-6.6), Z(0)); g.lineTo(X(-6.6), Z(CORNER_Z));
  const a0 = Math.atan2(CORNER_Z - HOOP.z, CORNER_X);
  g.arc(X(0), Z(HOOP.z), M(THREE_R), Math.PI - a0, a0, true);
  g.lineTo(X(6.6), Z(0)); g.closePath();
  g.fillStyle = '#1b5568'; g.fill(); g.restore();
  // key (paint)
  g.fillStyle = '#9c3826'; g.fillRect(X(-KEY.halfW), Z(0), M(KEY.halfW * 2), M(KEY.ftZ));
  // centre circle
  g.beginPath(); g.arc(X(0), Z(14), M(1.8), Math.PI, 2 * Math.PI); g.closePath(); g.fillStyle = '#9c3826'; g.fill();
  // wear: speckles + scuffs over the paint
  speckle(g, W, H, 14000, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.07)']);
  for (let i = 0; i < 26; i++) { // faint sneaker scuffs
    g.fillStyle = `rgba(0,0,0,${rand(0.03, 0.06)})`;
    g.beginPath(); g.ellipse(X(rand(-6, 6)), Z(rand(1, 12)), M(rand(0.1, 0.35)), M(rand(0.03, 0.08)), rand(0, 3), 0, 7); g.fill();
  }
  g.strokeStyle = 'rgba(10,10,12,0.55)'; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) { // hairline cracks
    let x = rand(0, W), y = rand(0, H); g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 9; k++) { x += rand(-40, 40); y += rand(-40, 40); g.lineTo(x, y); }
    g.stroke();
  }

  // lines (5 cm)
  g.strokeStyle = 'rgba(244,240,230,0.93)'; g.lineWidth = M(0.05); g.lineCap = 'butt';
  const line = (x1, z1, x2, z2) => { g.beginPath(); g.moveTo(X(x1), Z(z1)); g.lineTo(X(x2), Z(z2)); g.stroke(); };
  g.strokeRect(X(-7.5) + g.lineWidth / 2, Z(0) + g.lineWidth / 2, M(15) - g.lineWidth, M(14) - g.lineWidth);
  g.strokeRect(X(-KEY.halfW), Z(0), M(KEY.halfW * 2), M(KEY.ftZ));
  // free-throw circle: solid outside, dashed inside the key
  g.beginPath(); g.arc(X(0), Z(KEY.ftZ), M(KEY.ftR), 0, Math.PI); g.stroke();
  g.setLineDash([M(0.35), M(0.3)]); g.beginPath(); g.arc(X(0), Z(KEY.ftZ), M(KEY.ftR), Math.PI, 2 * Math.PI); g.stroke(); g.setLineDash([]);
  // three-point line
  line(-CORNER_X, 0, -CORNER_X, CORNER_Z); line(CORNER_X, 0, CORNER_X, CORNER_Z);
  g.beginPath(); g.arc(X(0), Z(HOOP.z), M(THREE_R), a0, Math.PI - a0); g.stroke();
  // restricted area
  g.beginPath(); g.arc(X(0), Z(HOOP.z), M(KEY.restricted), 0, Math.PI); g.stroke();
  line(-KEY.restricted, HOOP.z, -KEY.restricted, 1.2); line(KEY.restricted, HOOP.z, KEY.restricted, 1.2);
  // lane hash marks
  [1.75, 2.6, 3.45, 4.3].forEach((z) => { line(-KEY.halfW, z, -KEY.halfW - 0.15, z); line(KEY.halfW, z, KEY.halfW + 0.15, z); });
  // centre circle + midcourt
  g.beginPath(); g.arc(X(0), Z(14), M(1.8), Math.PI, 2 * Math.PI); g.stroke();
  // centre logo
  g.save(); g.translate(X(0), Z(13.35)); g.fillStyle = 'rgba(244,240,230,0.85)';
  g.font = `900 ${M(0.62)}px "Big Shoulders Display", Impact, "Arial Narrow", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SH3D', 0, 0); g.restore();
  // apron lettering
  g.save(); g.fillStyle = 'rgba(244,240,230,0.55)'; g.font = `700 ${M(0.42)}px "Big Shoulders Display", Impact, sans-serif`;
  g.textAlign = 'center'; g.translate(X(-8.05), Z(7)); g.rotate(-Math.PI / 2); g.fillText('EIGHTH STREET COURTS', 0, 0); g.restore();
  g.save(); g.fillStyle = 'rgba(244,240,230,0.55)'; g.font = `700 ${M(0.42)}px "Big Shoulders Display", Impact, sans-serif`;
  g.textAlign = 'center'; g.translate(X(8.05), Z(7)); g.rotate(Math.PI / 2); g.fillText('NO DUNKING AFTER 10 PM', 0, 0); g.restore();

  const tex = canvasTex(c); tex.anisotropy = 8;
  return { tex, area: AREA };
}

function ballTexture() {
  const W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#b9481a'); grd.addColorStop(0.5, '#e0662a'); grd.addColorStop(1, '#b9481a');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  speckle(g, W, H, 9000, ['rgba(120,40,10,0.35)', 'rgba(255,170,110,0.25)'], 0.8, 1.6);
  g.strokeStyle = '#1a0f0a'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();                    // equator
  g.beginPath(); g.moveTo(W / 4, 0); g.lineTo(W / 4, H); g.moveTo(W * 0.75, 0); g.lineTo(W * 0.75, H); g.stroke(); // great circle
  // the two curved panel seams (approximated in equirectangular space)
  g.lineWidth = 4.5;
  [0, W / 2, W].forEach((cx) => {
    g.beginPath();
    for (let y = 0; y <= H; y += 4) { const x = cx + Math.sin((y / H) * Math.PI * 2) * 52; if (y === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  });
  return canvasTex(c);
}

// ── net: verlet cloth of diamond-knotted strings ────────────────────────────
class Net {
  constructor(scene) {
    this.rings = 6; this.cols = 16;
    const N = this.rings * this.cols;
    this.p = new Float32Array(N * 3); this.prev = new Float32Array(N * 3); this.rest = new Float32Array(N * 3);
    const step = (Math.PI * 2) / this.cols;
    for (let i = 0; i < this.rings; i++) {
      const t = i / (this.rings - 1);
      const r = lerp(RIM_R + RIM_TUBE * 0.5, 0.135, Math.pow(t, 0.9));
      const y = HOOP.y - 0.01 - i * 0.082;
      for (let c = 0; c < this.cols; c++) {
        const a = (c + 0.5 * (i % 2)) * step, k = (i * this.cols + c) * 3;
        this.rest[k] = HOOP.x + Math.cos(a) * r; this.rest[k + 1] = y; this.rest[k + 2] = HOOP.z + Math.sin(a) * r;
      }
    }
    this.p.set(this.rest); this.prev.set(this.rest);
    const links = [];
    for (let i = 0; i < this.rings - 1; i++) {
      for (let c = 0; c < this.cols; c++) {
        const a = i * this.cols + c;
        const b1 = (i + 1) * this.cols + c;
        const c2 = i % 2 === 0 ? (c - 1 + this.cols) % this.cols : (c + 1) % this.cols;
        const b2 = (i + 1) * this.cols + c2;
        links.push(a, b1, a, b2);
      }
    }
    this.links = new Uint16Array(links);
    this.len = new Float32Array(links.length / 2);
    for (let l = 0; l < this.len.length; l++) {
      const a = this.links[l * 2] * 3, b = this.links[l * 2 + 1] * 3;
      this.len[l] = Math.hypot(this.rest[a] - this.rest[b], this.rest[a + 1] - this.rest[b + 1], this.rest[a + 2] - this.rest[b + 2]);
    }
    this.geo = new THREE.BufferGeometry();
    this.buf = new Float32Array(this.links.length * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.buf, 3));
    this.line = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ color: 0xf6f3ec, transparent: true, opacity: 0.95 }));
    this.line.frustumCulled = false;
    scene.add(this.line);
    this.writeBuffer();
  }
  update(dt, ball) {
    const p = this.p, prev = this.prev, rest = this.rest, cols = this.cols;
    const h = Math.min(dt, 1 / 30), g = -GRAV * 0.35 * h * h, N = p.length / 3;
    const bx = ball.pos.x, by = ball.pos.y, bz = ball.pos.z, bR = BALL_R + 0.012;
    const near = Math.abs(by - HOOP.y + 0.2) < 0.6 && Math.abs(bx - HOOP.x) < 0.5 && Math.abs(bz - HOOP.z) < 0.5;
    for (let n = cols; n < N; n++) { // ring 0 is tied to the rim
      const k = n * 3;
      for (let a = 0; a < 3; a++) {
        const v = (p[k + a] - prev[k + a]) * 0.95;
        prev[k + a] = p[k + a];
        p[k + a] += v + (rest[k + a] - p[k + a]) * 0.06; // gentle shape memory
      }
      p[k + 1] += g;
    }
    for (let it = 0; it < 4; it++) {
      for (let l = 0; l < this.len.length; l++) {
        const ia = this.links[l * 2], ib = this.links[l * 2 + 1];
        const a = ia * 3, b = ib * 3;
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = (d - this.len[l]) / d;
        const wa = ia < cols ? 0 : 0.5, wb = ia < cols ? 1 : 0.5;
        p[a] += dx * diff * wa; p[a + 1] += dy * diff * wa; p[a + 2] += dz * diff * wa;
        p[b] -= dx * diff * wb; p[b + 1] -= dy * diff * wb; p[b + 2] -= dz * diff * wb;
      }
      if (near) {
        for (let n = cols; n < N; n++) {
          const k = n * 3;
          const dx = p[k] - bx, dy = p[k + 1] - by, dz = p[k + 2] - bz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < bR * bR) { const d = Math.sqrt(d2) || 1e-6, s = bR / d; p[k] = bx + dx * s; p[k + 1] = by + dy * s; p[k + 2] = bz + dz * s; }
        }
      }
    }
    this.writeBuffer();
  }
  writeBuffer() {
    const p = this.p, L = this.links, B = this.buf;
    for (let i = 0; i < L.length; i++) { const k = L[i] * 3; B[i * 3] = p[k]; B[i * 3 + 1] = p[k + 1]; B[i * 3 + 2] = p[k + 2]; }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// ── crowd: a handful of instanced spectators that cheer on big plays ────────
class Crowd {
  constructor(scene) {
    const spots = [];
    [-1, 1].forEach((s) => {
      for (let i = 0; i < 7; i++) spots.push({ x: s * rand(10.9, 12.4), z: rand(-1.5, 15.5), seated: false });
      [5.2, 5.9, 6.6, 10.6, 11.3, 12.0].forEach((z) => { if (chance(0.8)) spots.push({ x: s * 9.3, z: z + rand(-0.1, 0.1), seated: true }); });
    });
    for (let i = 0; i < 6; i++) spots.push({ x: rand(-8, 8), z: WORLD.zMin - rand(0.8, 2.2), seated: false });
    this.spots = spots;
    const n = spots.length;
    const legs = new THREE.CylinderGeometry(0.15, 0.12, 1, 7); legs.translate(0, 0.5, 0);
    const torso = new THREE.CylinderGeometry(0.24, 0.17, 1, 8); torso.translate(0, 0.5, 0);
    const head = new THREE.SphereGeometry(0.11, 8, 6);
    this.legs = new THREE.InstancedMesh(legs, new THREE.MeshLambertMaterial(), n);
    this.torsos = new THREE.InstancedMesh(torso, new THREE.MeshLambertMaterial(), n);
    this.heads = new THREE.InstancedMesh(head, new THREE.MeshLambertMaterial(), n);
    const shirts = ['#c8412f', '#e8e4d8', '#2c3138', '#2f6fa8', '#2f9483', '#d9a92f', '#6d3f86', '#b84d8f', '#404a2a'];
    const pants = ['#1c1f26', '#2b3550', '#3a3328', '#151515', '#46505c'];
    const skins = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac', '#5c3a1e'];
    const col = new THREE.Color();
    spots.forEach((s, i) => {
      s.h = rand(0.92, 1.08); s.phase = rand(0, 6); s.jump = 0; s.vy = 0;
      this.torsos.setColorAt(i, col.set(shirts[(i * 5) % shirts.length]));
      this.legs.setColorAt(i, col.set(pants[(i * 3) % pants.length]));
      this.heads.setColorAt(i, col.set(skins[(i * 7) % skins.length]));
    });
    [this.legs, this.torsos, this.heads].forEach((m) => { m.instanceColor.needsUpdate = true; m.castShadow = true; scene.add(m); });
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.q0 = new THREE.Quaternion(); this.sv = new THREE.Vector3(); this.pv = new THREE.Vector3();
    this.cheerT = 0; this.cheerAmt = 0;
    this.update(0, 0);
  }
  cheer(amount) { this.cheerT = 1.8; this.cheerAmt = amount; this.spots.forEach((s) => { if (chance(0.35 + amount * 0.5)) s.vy = rand(1.6, 2.8) * amount; }); }
  update(dt, t) {
    if (this.cheerT > 0) this.cheerT -= dt;
    const m = this.m, q = this.q, sv = this.sv, pv = this.pv;
    this.spots.forEach((s, i) => {
      s.jump += s.vy * dt; s.vy -= GRAV * dt;
      if (s.jump <= 0) { s.jump = 0; s.vy = this.cheerT > 0 && chance(2.5 * this.cheerAmt * dt) ? rand(1.4, 2.4) * this.cheerAmt : 0; }
      const sway = Math.sin(t * 1.3 + s.phase) * 0.04;
      const legH = (s.seated ? 0.45 : 0.82) * s.h, torH = 0.62 * s.h, baseY = s.jump;
      const torsoY = s.seated ? 0.47 : baseY + legH;
      q.setFromAxisAngle(_v1.set(0, 0, 1), sway);
      m.compose(pv.set(s.x, s.seated ? 0 : baseY, s.z), this.q0, sv.set(1, legH, 1));
      this.legs.setMatrixAt(i, m);
      q.setFromAxisAngle(_v1.set(0, 0, 1), sway);
      m.compose(pv.set(s.x, torsoY + (s.seated ? s.jump * 0.3 : 0), s.z), q, sv.set(1, torH, 1));
      this.torsos.setMatrixAt(i, m);
      m.compose(pv.set(s.x - sway * torH, torsoY + torH + 0.12 + (s.seated ? s.jump * 0.3 : 0), s.z), q, sv.set(1, 1, 1));
      this.heads.setMatrixAt(i, m);
    });
    this.legs.instanceMatrix.needsUpdate = true; this.torsos.instanceMatrix.needsUpdate = true; this.heads.instanceMatrix.needsUpdate = true;
  }
}

// ── build everything ────────────────────────────────────────────────────────
function buildWorld(scene, quality) {
  const world = {};
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const lam = (o) => new THREE.MeshLambertMaterial(o);

  // lighting: dusk sky fill + one warm floodlight that casts the shadows
  const hemi = new THREE.HemisphereLight(0x8d9cf0, 0x3b2a22, 0.42);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd3a0, 1.15);
  sun.position.set(-7, 17, 13); sun.target.position.set(0, 0, 6);
  sun.castShadow = quality !== 'low';
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 12, bottom: -12, near: 2, far: 45 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const rimLight = new THREE.DirectionalLight(0x8fb0ff, 0.35); rimLight.position.set(8, 6, -10); scene.add(rimLight);
  world.sun = sun;

  // sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color('#0d1230') }, mid: { value: new THREE.Color('#5a3470') }, low: { value: new THREE.Color('#ff8a57') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP; void main(){ float h = clamp(vP.y,-0.2,1.0); vec3 c = h < 0.12 ? mix(low, mid, smoothstep(-0.05,0.12,h)) : mix(mid, top, smoothstep(0.12,0.6,h)); gl_FragColor = vec4(c,1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 14), skyMat); scene.add(sky);
  const starPos = [];
  for (let i = 0; i < 260; i++) {
    const a = rand(0, Math.PI * 2), e = rand(0.25, 1.3), r = 200;
    starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8 })));
  // moon
  const mc = makeCanvas(128, 128), mg = mc.getContext('2d');
  const mgrd = mg.createRadialGradient(64, 64, 10, 64, 64, 64);
  mgrd.addColorStop(0, 'rgba(255,248,230,1)'); mgrd.addColorStop(0.32, 'rgba(255,240,210,0.95)'); mgrd.addColorStop(0.36, 'rgba(255,220,180,0.25)'); mgrd.addColorStop(1, 'rgba(255,200,160,0)');
  mg.fillStyle = mgrd; mg.fillRect(0, 0, 128, 128);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(mc), depthWrite: false, transparent: true }));
  moon.position.set(60, 70, -150); moon.scale.set(30, 30, 1); scene.add(moon);

  // ground (asphalt) + court
  const ac = makeCanvas(256, 256), ag = ac.getContext('2d');
  ag.fillStyle = '#26282d'; ag.fillRect(0, 0, 256, 256); speckle(ag, 256, 256, 5000, ['#2f3137', '#1e2024', '#36383e']);
  const asphalt = canvasTex(ac, { repeat: true }); asphalt.repeat.set(40, 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), lam({ map: asphalt }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; ground.receiveShadow = true; scene.add(ground);

  const ct = courtTexture();
  const cw = ct.area.x1 - ct.area.x0, ch = ct.area.z1 - ct.area.z0;
  const courtGeo = new THREE.PlaneGeometry(cw, ch); courtGeo.rotateX(-Math.PI / 2);
  courtGeo.translate((ct.area.x0 + ct.area.x1) / 2, 0, (ct.area.z0 + ct.area.z1) / 2);
  const court = new THREE.Mesh(courtGeo, std({ map: ct.tex, roughness: 0.82, metalness: 0.0 }));
  court.receiveShadow = true; scene.add(court);

  // ── hoop ──
  const steel = std({ color: 0x2c3036, metalness: 0.55, roughness: 0.42 });
  const hoopParts = [];
  hoopParts.push(placed(new THREE.CylinderGeometry(POLE.r, POLE.r * 1.1, POLE.h + 0.1, 14), POLE.x, POLE.h / 2, POLE.z));
  hoopParts.push(placed(new THREE.BoxGeometry(0.12, 0.14, 2.3), 0, 3.45, (POLE.z + BOARD.z0) / 2 + 0.02));
  const brace = new THREE.BoxGeometry(0.08, 0.08, 1.55); hoopParts.push(placed(brace, 0, 3.0, -0.4, -0.62, 0, 0));
  hoopParts.push(placed(new THREE.BoxGeometry(0.6, 0.6, 0.06), 0, 3.43, BOARD.z0 - 0.06)); // board mount plate
  const hoopSteel = new THREE.Mesh(mergeGeos(hoopParts), steel); hoopSteel.castShadow = true; scene.add(hoopSteel);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.6, 14), std({ color: 0x1d4fa0, roughness: 0.9 }));
  pad.position.set(POLE.x, 0.8, POLE.z); pad.castShadow = true; scene.add(pad);

  const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0, BOARD.z1 - BOARD.z0),
    std({ color: 0xd8ecff, transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0.2, depthWrite: false }));
  board.position.set(0, (BOARD.y0 + BOARD.y1) / 2, (BOARD.z0 + BOARD.z1) / 2); board.renderOrder = 2; scene.add(board);
  const frameParts = [];
  const bw = BOARD.x1 - BOARD.x0, bh = BOARD.y1 - BOARD.y0, by = (BOARD.y0 + BOARD.y1) / 2, fz = BOARD.z1 + 0.004;
  frameParts.push(placed(new THREE.BoxGeometry(bw, 0.05, 0.012), 0, BOARD.y1 - 0.025, fz));
  frameParts.push(placed(new THREE.BoxGeometry(bw, 0.05, 0.012), 0, BOARD.y0 + 0.025, fz));
  frameParts.push(placed(new THREE.BoxGeometry(0.05, bh, 0.012), BOARD.x0 + 0.025, by, fz));
  frameParts.push(placed(new THREE.BoxGeometry(0.05, bh, 0.012), BOARD.x1 - 0.025, by, fz));
  // shooter's square, 59 x 45 cm, bottom edge level with the rim
  const sqB = HOOP.y + 0.0, sqT = sqB + 0.45;
  frameParts.push(placed(new THREE.BoxGeometry(0.59, 0.05, 0.012), 0, sqT, fz));
  frameParts.push(placed(new THREE.BoxGeometry(0.59, 0.05, 0.012), 0, sqB + 0.025, fz));
  frameParts.push(placed(new THREE.BoxGeometry(0.05, 0.45, 0.012), -0.295 + 0.025, (sqB + sqT) / 2, fz));
  frameParts.push(placed(new THREE.BoxGeometry(0.05, 0.45, 0.012), 0.295 - 0.025, (sqB + sqT) / 2, fz));
  const frame = new THREE.Mesh(mergeGeos(frameParts), std({ color: 0xffffff, roughness: 0.5, emissive: 0x222222 }));
  scene.add(frame);

  const rimMat = std({ color: 0xff4f1f, metalness: 0.45, roughness: 0.38, emissive: 0x2a0800 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R + RIM_TUBE, 0.016, 8, 36), rimMat);
  rim.rotation.x = Math.PI / 2; rim.position.copy(HOOP); rim.castShadow = true; scene.add(rim);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, HOOP.z - RIM_R - BOARD.z1), rimMat);
  bracket.position.set(0, HOOP.y - 0.02, (BOARD.z1 + HOOP.z - RIM_R) / 2); scene.add(bracket);
  world.rim = rim; world.rimBaseY = HOOP.y;
  world.net = new Net(scene);

  // ── fence ──
  const fc = makeCanvas(128, 128), fg = fc.getContext('2d');
  fg.strokeStyle = 'rgba(190,198,206,1)'; fg.lineWidth = 5;
  fg.beginPath(); fg.moveTo(0, 0); fg.lineTo(128, 128); fg.moveTo(128, 0); fg.lineTo(0, 128);
  fg.moveTo(-64, 64); fg.lineTo(64, 192); fg.moveTo(64, -64); fg.lineTo(192, 64);
  fg.moveTo(64, -64); fg.lineTo(-64, 64); fg.moveTo(192, 64); fg.lineTo(64, 192); fg.stroke();
  const fenceTex = canvasTex(fc, { repeat: true });
  const fenceMat = lam({ map: fenceTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
  const FH = 3.6, fenceParts = [], postParts = [];
  const fenceSeg = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const geo = new THREE.PlaneGeometry(len, FH); scaleUV(geo, len / 0.6, FH / 0.6);
    placed(geo, (x1 + x2) / 2, FH / 2, (z1 + z2) / 2, 0, -Math.atan2(z2 - z1, x2 - x1), 0);
    fenceParts.push(geo);
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      postParts.push(placed(new THREE.CylinderGeometry(0.04, 0.04, FH + 0.1, 6), lerp(x1, x2, t), FH / 2, lerp(z1, z2, t)));
    }
    const rail = new THREE.CylinderGeometry(0.03, 0.03, len, 6); rail.rotateZ(Math.PI / 2);
    postParts.push(placed(rail, (x1 + x2) / 2, FH, (z1 + z2) / 2, 0, -Math.atan2(z2 - z1, x2 - x1), 0));
  };
  const FX = WORLD.x + 0.25, FZ0 = WORLD.zMin - 0.25;
  fenceSeg(-FX, FZ0, FX, FZ0); fenceSeg(-FX, FZ0, -FX, 22); fenceSeg(FX, FZ0, FX, 22);
  scene.add(new THREE.Mesh(mergeGeos(fenceParts), fenceMat));
  scene.add(new THREE.Mesh(mergeGeos(postParts), lam({ color: 0x8d949b })));

  // ── brick mural wall behind the baseline ──
  const wc = makeCanvas(2048, 512), wg = wc.getContext('2d');
  wg.fillStyle = '#5a2c25'; wg.fillRect(0, 0, 2048, 512);
  for (let y = 0; y < 512; y += 16) {
    for (let x = (y / 16) % 2 ? -16 : 0; x < 2048; x += 34) {
      wg.fillStyle = `hsl(${rand(5, 18)},${rand(35, 50)}%,${rand(22, 32)}%)`; wg.fillRect(x + 1, y + 1, 32, 14);
    }
  }
  // mural: abstract shapes and the court's own tag
  const blobs = ['#ff6b35', '#f7c548', '#2ec4b6', '#e71d36', '#7b2cbf', '#3a86ff'];
  for (let i = 0; i < 26; i++) {
    wg.fillStyle = blobs[i % blobs.length]; wg.globalAlpha = 0.75;
    wg.beginPath(); wg.ellipse(rand(200, 1850), rand(140, 420), rand(30, 140), rand(20, 70), rand(0, 3), 0, 7); wg.fill();
  }
  wg.globalAlpha = 1;
  wg.font = '900 170px "Big Shoulders Display", Impact, sans-serif'; wg.textAlign = 'center'; wg.textBaseline = 'middle';
  wg.lineWidth = 16; wg.strokeStyle = '#140c14'; wg.strokeText('EIGHTH ST', 1024, 270);
  const tg = wg.createLinearGradient(0, 180, 0, 360); tg.addColorStop(0, '#ffe066'); tg.addColorStop(1, '#ff5d3a');
  wg.fillStyle = tg; wg.fillText('EIGHTH ST', 1024, 270);
  wg.font = '700 60px "Barlow Semi Condensed", "Arial Narrow", sans-serif'; wg.fillStyle = '#f2f2f2'; wg.fillText('BALL IS LIFE · RUN IT BACK', 1024, 410);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(34, 8.5), lam({ map: canvasTex(wc), color: 0x8a8a92 }));
  wall.position.set(0, 4.25, WORLD.zMin - 4.2); scene.add(wall);

  // ── skyline (merged boxes with proportional window textures) ──
  const winC = makeCanvas(128, 128), wn = winC.getContext('2d');
  wn.fillStyle = '#15151f'; wn.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const lit = Math.random() < 0.42;
    wn.fillStyle = lit ? `hsl(${rand(35, 50)},90%,${rand(55, 75)}%)` : '#262634';
    wn.fillRect(x * 32 + 8, y * 32 + 7, 16, 18);
  }
  const winTex = canvasTex(winC, { repeat: true });
  const bParts = [];
  for (let i = 0; i < 46; i++) {
    const ang = rand(-Math.PI * 0.98, -Math.PI * 0.02) + (i % 7 === 0 ? Math.PI * 0.5 : 0);
    const r = rand(30, 70);
    const w = rand(6, 14), d = rand(6, 14), h = rand(10, 42);
    const geo = new THREE.BoxGeometry(w, h, d); scaleUV(geo, w / 3, h / 3);
    placed(geo, Math.cos(ang) * r, h / 2 - 0.1, Math.sin(ang) * r + 4, 0, rand(0, 1.5), 0);
    if (Math.abs(Math.cos(ang) * r) > 18 || Math.sin(ang) * r < -16) bParts.push(geo);
  }
  const skyline = new THREE.Mesh(mergeGeos(bParts), new THREE.MeshLambertMaterial({ color: 0x3b3f55, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.55, map: winTex }));
  scene.add(skyline);

  // ── light poles with glowing heads ──
  const gc = makeCanvas(128, 128), gg = gc.getContext('2d');
  const ggr = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
  ggr.addColorStop(0, 'rgba(255,236,200,1)'); ggr.addColorStop(0.25, 'rgba(255,190,110,0.55)'); ggr.addColorStop(1, 'rgba(255,160,80,0)');
  gg.fillStyle = ggr; gg.fillRect(0, 0, 128, 128);
  const glowTex = canvasTex(gc);
  const poleParts = [], headParts = [];
  [[-1, WORLD.zMin + 0.6], [1, WORLD.zMin + 0.6], [-1, 15.5], [1, 15.5]].forEach(([s, z]) => {
    const x = s * (WORLD.x + 0.9);
    poleParts.push(placed(new THREE.CylinderGeometry(0.09, 0.13, 8.4, 8), x, 4.2, z));
    const arm = new THREE.BoxGeometry(1.4, 0.1, 0.1); poleParts.push(placed(arm, x - s * 0.6, 8.3, z));
    headParts.push(placed(new THREE.BoxGeometry(0.7, 0.16, 0.45), x - s * 1.15, 8.2, z));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
    glow.position.set(x - s * 1.15, 8.05, z); glow.scale.set(4.5, 4.5, 1); scene.add(glow);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), new THREE.MeshBasicMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.12 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(x - s * 2.2, 0.015, z + (z < 0 ? 2.5 : -2.5)); scene.add(pool);
  });
  scene.add(new THREE.Mesh(mergeGeos(poleParts), lam({ color: 0x3a3e45 })));
  scene.add(new THREE.Mesh(mergeGeos(headParts), new THREE.MeshBasicMaterial({ color: 0xfff1d6 })));

  // ── benches ──
  const benchParts = [];
  [[-1, 5.9], [-1, 11.3], [1, 5.9], [1, 11.3]].forEach(([s, z]) => {
    const x = s * 9.3;
    benchParts.push(placed(new THREE.BoxGeometry(0.45, 0.06, 2.2), x, 0.45, z));
    benchParts.push(placed(new THREE.BoxGeometry(0.06, 0.4, 2.2), x + s * 0.24, 0.7, z));
    [-0.95, 0.95].forEach((dz) => benchParts.push(placed(new THREE.BoxGeometry(0.4, 0.45, 0.06), x, 0.225, z + dz)));
  });
  const bench = new THREE.Mesh(mergeGeos(benchParts), lam({ color: 0x6b4a2f })); bench.castShadow = true; scene.add(bench);
  // ball rack / water cooler props
  const cooler = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 12), lam({ color: 0xe8862a }));
  cooler.position.set(-9.3, 0.73, 8.6); scene.add(cooler);

  world.crowd = new Crowd(scene);
  world.ballTex = ballTexture();
  world.update = (dt, t, ball) => {
    world.net.update(dt, ball);
    world.crowd.update(dt, t);
    // rim shake recovers after hard contact
    rim.position.y = damp(rim.position.y, HOOP.y, 18, dt);
  };
  world.shakeRim = (amt) => { rim.position.y = HOOP.y - clamp(amt, 0, 0.05); };
  return world;
}
