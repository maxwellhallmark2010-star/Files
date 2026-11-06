// ─────────────────────────────────────────────────────────────────────────────
// World: sky + day/night cycle, distant ranges, and the endless road built in
// 160 m chunks (terrain grid that bends with the road, asphalt ribbon, poles
// and wires, creosote, rocks, longhorn skulls, fences, signs) plus gas
// stations with pumps and water. Chunks ahead are built one per frame and
// chunks behind are thrown away. Geometry is chunk-local, so precision holds
// no matter how far you drive.
// ─────────────────────────────────────────────────────────────────────────────
const OFFSETS = (() => {
  const o = [0, 1.9, 3.8, 4.7, 6, 7.8, 10, 13, 17, 22, 28, 36, 46, 58, 74, 94, 120, 155, 200, 260, 340, 440, 560, 700, 860];
  return o.slice(1).reverse().map((v) => -v).concat(o);
})();

const Sky = {
  init(scene) {
    this.uni = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uni,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vP;
        void main(){ vec3 d = normalize(vP); float h = d.y;
          vec3 c = mix(hor, top, pow(smoothstep(-0.02, 0.55, h), 0.75));
          if (h < 0.0) c = hor * (0.92 + 0.08 * smoothstep(-0.2, 0.0, h));
          float s = max(dot(d, sunDir), 0.0);
          c += sunCol * (pow(s, 900.0) * 3.0 + pow(s, 24.0) * 0.32 + pow(s, 4.0) * 0.12) * (1.0 - night * 0.7);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), mat); this.dome.frustumCulled = false; this.dome.renderOrder = -1;
    scene.add(this.dome);
    const sp = [];
    for (let i = 0; i < 700; i++) { const a = rand(0, Math.PI * 2), e = Math.asin(rand(0.05, 1)), r = 4500; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false; scene.add(this.stars);
    // distant mountain ranges (two rings that travel with the camera)
    this.ranges = [];
    [[2300, 140, 360, 0.55, 3], [3300, 220, 620, 0.8, 11]].forEach(([R, h0, h1, shade, seed]) => {
      const N = 220, pos = [], col = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const n = 0.5 + 0.5 * (Math.sin(a * 3 + seed) * 0.35 + Math.sin(a * 7.3 + seed * 2) * 0.25 + Math.sin(a * 17 + seed) * 0.15 + Math.sin(a * 41 + seed * 3) * 0.07 + noise2(i * 0.6, seed) * 0.18);
        const h = lerp(h0, h1, clamp(n, 0, 1));
        const x = Math.cos(a) * R, z = Math.sin(a) * R;
        pos.push(x, -60, z, x * 0.985, h * 0.55, z * 0.985, x * 0.97, h, z * 0.97);
        col.push(shade * 0.7, shade * 0.62, shade * 0.6, shade * 0.88, shade * 0.78, shade * 0.74, shade, shade * 0.93, shade * 0.9);
        if (i < N) { const b = i * 3; idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
      m.frustumCulled = false; scene.add(m); this.ranges.push(m);
    });
    // far ground disk so the horizon never shows a gap past the terrain grid
    this.disk = new THREE.Mesh(new THREE.CircleGeometry(4200, 48), new THREE.MeshLambertMaterial({ color: 0xc8a87e }));
    this.disk.rotation.x = -Math.PI / 2; this.disk.frustumCulled = false; scene.add(this.disk);
    // lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2); scene.add(this.sun, this.sun.target);
    this.sun.shadow.camera.left = -28; this.sun.shadow.camera.right = 28; this.sun.shadow.camera.top = 28; this.sun.shadow.camera.bottom = -28;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 160; this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.04;
    this.fog = new THREE.Fog(0xffffff, 140, 1500); scene.fog = this.fog;
    this.night = 0;
  },
  // key colours by sun elevation (degrees)
  KEYS: [
    { e: -18, top: '#03050c', hor: '#0b0f20', sun: '#7f94d6', si: 0.16, hs: '#34426e', hg: '#14110d', hi: 0.2, mtn: '#11141f' },
    { e: -6, top: '#141a3d', hor: '#5a3e57', sun: '#ff8a5a', si: 0.25, hs: '#56608f', hg: '#3a2a24', hi: 0.38, mtn: '#2b2438' },
    { e: 1, top: '#36477f', hor: '#ff9a62', sun: '#ff9858', si: 1.1, hs: '#9a8fb5', hg: '#6a4a34', hi: 0.55, mtn: '#6b4a52' },
    { e: 9, top: '#4f78b8', hor: '#f0c49a', sun: '#ffc690', si: 1.7, hs: '#a9b8d8', hg: '#8a6646', hi: 0.5, mtn: '#9a7468' },
    { e: 30, top: '#3f7cc8', hor: '#dccfb8', sun: '#fff1da', si: 1.7, hs: '#b4c8e6', hg: '#a6825a', hi: 0.52, mtn: '#a98d80' },
    { e: 90, top: '#3576c8', hor: '#e0d4bf', sun: '#fffaf0', si: 1.8, hs: '#b9cdea', hg: '#ad8a60', hi: 0.55, mtn: '#b19a8c' },
  ],
  sample(e, key, out) {
    const K = this.KEYS;
    if (e <= K[0].e) return out.set(K[0][key]);
    for (let i = 0; i < K.length - 1; i++) {
      if (e <= K[i + 1].e) { const t = (e - K[i].e) / (K[i + 1].e - K[i].e); return out.set(K[i][key]).lerp(_c2.set(K[i + 1][key]), t); }
    }
    return out.set(K[K.length - 1][key]);
  },
  sampleN(e, key) {
    const K = this.KEYS;
    if (e <= K[0].e) return K[0][key];
    for (let i = 0; i < K.length - 1; i++) if (e <= K[i + 1].e) return lerp(K[i][key], K[i + 1][key], (e - K[i].e) / (K[i + 1].e - K[i].e));
    return K[K.length - 1][key];
  },
  // hour 0..24; sunrise ≈ 6, sunset ≈ 19
  update(hour, camPos, carPos, shadows) {
    const dayFrac = (hour - 6) / 13;                       // 0 at sunrise, 1 at sunset
    let elev;
    if (dayFrac >= 0 && dayFrac <= 1) elev = Math.sin(dayFrac * Math.PI) * 74;
    else { const nf = dayFrac > 1 ? (hour - 19) / 11 : (hour + 5) / 11; elev = -Math.sin(clamp(nf, 0, 1) * Math.PI) * 40; }
    const az = lerp(-1.9, 1.9, clamp(dayFrac, -0.2, 1.2)) + Math.PI * 0.15;  // east (−x side) to west
    const er = (elev * Math.PI) / 180;
    const sd = _v1.set(Math.sin(az) * Math.cos(er), Math.sin(er), Math.cos(az) * Math.cos(er) * 0.6 + 0.4 * Math.cos(er)).normalize();
    this.elev = elev;
    this.uni.sunDir.value.copy(sd);
    this.sample(elev, 'top', this.uni.top.value); this.sample(elev, 'hor', this.uni.hor.value); this.sample(elev, 'sun', this.uni.sunCol.value);
    this.night = 1 - smoothstep(-8, 2, elev);
    this.uni.night.value = this.night;
    this.fog.color.copy(this.uni.hor.value);
    this.fog.near = lerp(140, 60, this.night); this.fog.far = lerp(1500, 700, this.night);
    this.hemi.color.copy(this.sample(elev, 'hs', _c1)); this.hemi.groundColor.copy(this.sample(elev, 'hg', _c1)); this.hemi.intensity = this.sampleN(elev, 'hi');
    // at night the key light becomes moonlight from high up
    const moon = this.night > 0.5;
    if (moon) this.sun.position.set(carPos.x + 30, carPos.y + 80, carPos.z + 20);
    else this.sun.position.set(carPos.x + sd.x * 80, carPos.y + Math.max(sd.y, 0.08) * 80, carPos.z + sd.z * 80);
    this.sun.target.position.copy(carPos);
    this.sun.color.copy(this.uni.sunCol.value); this.sun.intensity = this.sampleN(elev, 'si');
    this.sun.castShadow = shadows && !moon;
    this.stars.material.opacity = smoothstep(0.3, 0.95, this.night);
    this.dome.position.copy(camPos); this.stars.position.copy(camPos);
    const mtn = this.sample(elev, 'mtn', _c1);
    this.ranges[0].material.color.copy(mtn).lerp(this.uni.hor.value, 0.35);
    this.ranges[1].material.color.copy(mtn).lerp(this.uni.hor.value, 0.6);
    this.ranges.forEach((r) => r.position.set(camPos.x, roadY(camPos.z) - 10, camPos.z));
    this.disk.position.set(camPos.x, roadY(camPos.z) - 14, camPos.z);
    this.disk.material.color.copy(this.uni.hor.value).multiplyScalar(0.9);
  },
};

// ── terrain colour ──────────────────────────────────────────────────────────
function terrainColor(x, z, d, out) {
  const ad = Math.abs(d);
  const n = fbm2(x * 0.02, z * 0.02, 2), salt = fbm2(x * 0.0035 + 40, z * 0.0035, 3);
  out.setRGB(0.7 + n * 0.05, 0.53 + n * 0.05, 0.36 + n * 0.04);                 // warm sand
  if (salt > 0.3 && ad > 40) out.lerp(_c2.setRGB(0.86, 0.82, 0.74), smoothstep(0.3, 0.48, salt) * 0.85);   // salt flats
  const pav = noise2(x * 0.05, z * 0.05);
  if (pav > 0.35) out.lerp(_c2.setRGB(0.62, 0.5, 0.39), (pav - 0.35) * 0.9);                       // desert pavement
  if (ad < ROAD_HALF + 2.6) out.lerp(_c2.setRGB(0.6, 0.55, 0.48), 1 - smoothstep(ROAD_HALF + 1.4, ROAD_HALF + 2.6, ad)); // gravel shoulder
  const far = smoothstep(160, 600, ad);
  if (far > 0) out.lerp(_c2.setRGB(0.66 + n * 0.08, 0.46, 0.34), far * 0.85);  // reddish badlands
  return out;
}

// ── chunks ──────────────────────────────────────────────────────────────────
let _skull = null;
const MAT = {};
function initMaterials() {
  MAT.terrain = new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.sand });
  MAT.road = new THREE.MeshLambertMaterial({ map: TEX.asphalt });
  MAT.props = new THREE.MeshLambertMaterial({ vertexColors: true });
  MAT.wire = new THREE.LineBasicMaterial({ color: 0x2a2420, transparent: true, opacity: 0.85 });
  MAT.lot = new THREE.MeshLambertMaterial({ map: TEX.lot });
  MAT.post = new THREE.MeshLambertMaterial({ color: 0x8a8f94 });
  _skull = skullGeo();
  const rng = mulberry32(4242);
  PROTO.bush = []; for (let i = 0; i < 10; i++) PROTO.bush.push(mergeGeos(bushGeo(rng)));
  PROTO.rock = []; for (let i = 0; i < 12; i++) PROTO.rock.push(rockGeo(rng));
  PROTO.pole = mergeGeos(poleGeo());
  PROTO.post = []; for (let i = 0; i < 4; i++) PROTO.post.push(postGeo(1.25)); PROTO.post155 = postGeo(1.55);
}
const PROTO = {};

class Chunk {
  constructor(k, scene) {
    this.k = k; this.colliders = [];
    const z0 = k * CHUNK_L;
    this.group = new THREE.Group(); this.group.position.set(0, 0, z0);
    const rng = mulberry32(k * 9973 + 1771);
    this.buildTerrain(z0);
    this.buildRoad(z0);
    this.buildProps(z0, rng);
    scene.add(this.group);
  }
  buildTerrain(z0) {
    const ROWS = CHUNK_L / 4, COLS = OFFSETS.length, DZ = 4;
    const n = (ROWS + 1) * COLS;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    // height grid with one extra row each end, so normals come from neighbours (seamless across chunks)
    const H = new Float32Array((ROWS + 3) * COLS), RX = new Float32Array(ROWS + 3);
    for (let j = -1; j <= ROWS + 1; j++) {
      const z = z0 + j * DZ, rx = roadX(z); RX[j + 1] = rx;
      for (let c = 0; c < COLS; c++) H[(j + 1) * COLS + c] = groundH(rx + OFFSETS[c], z);
    }
    const vOff = ((z0 % 6) + 6) % 6;
    let i = 0;
    for (let j = 0; j <= ROWS; j++) {
      const zl = j * DZ, z = z0 + zl, rx = RX[j + 1], row = (j + 1) * COLS;
      const s = nearestStation(z);
      for (let c = 0; c < COLS; c++, i++) {
        const off = OFFSETS[c], x = rx + off, y = H[row + c];
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = zl;
        const c0 = Math.max(0, c - 1), c1 = Math.min(COLS - 1, c + 1);
        const hx = (H[row + c1] - H[row + c0]) / (OFFSETS[c1] - OFFSETS[c0]);
        // along z the grid is sheared by the road curve; correct for the x shift between rows
        const xa = RX[j] + off, xb = RX[j + 2] + off;
        const hz = (H[row + COLS + c] - H[row - COLS + c] - hx * (xb - xa)) / (2 * DZ);
        const l = Math.hypot(hx, 1, hz); nor[i * 3] = -hx / l; nor[i * 3 + 1] = 1 / l; nor[i * 3 + 2] = -hz / l;
        terrainColor(x, z, off, _c1);
        const lw = lotWeight(off, z - s.z, s.side);
        if (lw > 0) _c1.lerp(_c2.setRGB(0.6, 0.56, 0.5), lw);
        col[i * 3] = _c1.r; col[i * 3 + 1] = _c1.g; col[i * 3 + 2] = _c1.b;
        uv[i * 2] = x / 6; uv[i * 2 + 1] = (vOff + zl) / 6;
      }
    }
    const idx = [];
    for (let j = 0; j < ROWS; j++) for (let c = 0; c < COLS - 1; c++) {
      const a = j * COLS + c, b = a + 1, d = a + COLS, e2 = d + 1;
      idx.push(a, d, b, b, d, e2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, MAT.terrain); m.receiveShadow = true; this.group.add(m); this.terrain = m;
  }
  buildRoad(z0) {
    const ROWS = CHUNK_L / 2, LAT = [-ROAD_HALF, 0, ROAD_HALF];
    const n = (ROWS + 1) * 3, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), nor = new Float32Array(n * 3);
    const vOff = ((z0 % 32) + 32) % 32;
    let i = 0;
    for (let j = 0; j <= ROWS; j++) {
      const zl = j * 2, z = z0 + zl, rx = roadX(z), ry = roadY(z);
      const slope = (roadY(z + 1) - roadY(z - 1)) / 2;
      for (let c = 0; c < 3; c++, i++) {
        pos[i * 3] = rx + LAT[c]; pos[i * 3 + 1] = ry + 0.03 + (c === 1 ? 0.035 : 0); pos[i * 3 + 2] = zl;
        const l = Math.hypot(slope, 1); nor[i * 3] = 0; nor[i * 3 + 1] = 1 / l; nor[i * 3 + 2] = -slope / l;
        uv[i * 2] = c / 2; uv[i * 2 + 1] = (vOff + zl) / 32;
      }
    }
    const idx = [];
    for (let j = 0; j < ROWS; j++) for (let c = 0; c < 2; c++) { const a = j * 3 + c, b = a + 1, d = a + 3, e = d + 1; idx.push(a, d, b, b, d, e); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, MAT.road); m.receiveShadow = true; this.group.add(m);
  }
  inLot(x, z, pad = 0) { const s = nearestStation(z); return lotWeight(x - roadX(z), z - s.z, s.side) > 0.05 || (Math.abs(z - s.z) < 40 + pad && (x - roadX(z)) * s.side > 3 && (x - roadX(z)) * s.side < 50); }
  buildProps(z0, rng) {
    const batch = new GeoBatch(), wires = [], g = this.group;
    const add = (geo, x, z, yOff = 0, ry = 0, rx = 0, s = 1) => { const y = groundH(x, z) + yOff; batch.add(geo, mat4(x, y, z - z0, rx, ry, 0, s)); };
    // telephone poles every 50 m on the left (+x) side, wires to the next pole
    const poleSide = 11.5;
    for (let z = Math.ceil(z0 / 50) * 50; z < z0 + CHUNK_L; z += 50) {
      const x = roadX(z) + poleSide;
      if (this.inLot(x, z, 30)) continue;
      const y = groundH(x, z);
      const ry = Math.atan(roadDX(z));
      batch.add(PROTO.pole, mat4(x, y - 0.3, z - z0, 0, ry, 0));
      this.colliders.push({ x, z, r: 0.25 });
      const z2 = z + 50, x2 = roadX(z2) + poleSide, y2 = groundH(x2, z2);
      if (!this.inLot(x2, z2, 30)) {
        for (const [ox, oy] of POLE_TOP) {
          const ax = x + ox * Math.cos(ry), ay = y - 0.3 + oy, az = z - z0, bx = x2 + ox * Math.cos(Math.atan(roadDX(z2))), by = y2 - 0.3 + oy, bz = z2 - z0;
          const N = 8;
          for (let s = 0; s < N; s++) {
            const t0 = s / N, t1 = (s + 1) / N, sag = (t) => -4 * 0.9 * t * (1 - t);
            wires.push(lerp(ax, bx, t0), lerp(ay, by, t0) + sag(t0), lerp(az, bz, t0), lerp(ax, bx, t1), lerp(ay, by, t1) + sag(t1), lerp(az, bz, t1));
          }
        }
      }
    }
    // creosote and rocks
    for (let i = 0; i < 75; i++) {
      const side = rng() < 0.5 ? -1 : 1, lat = side * (6.5 + Math.pow(rng(), 1.7) * 170), z = z0 + rng() * CHUNK_L, x = roadX(z) + lat;
      if (this.inLot(x, z)) continue;
      add(PROTO.bush[Math.floor(rng() * 10)], x, z, -0.05, rng() * 6, 0, 0.7 + rng() * 0.6);
    }
    for (let i = 0; i < 34; i++) {
      const side = rng() < 0.5 ? -1 : 1, lat = side * (5 + Math.pow(rng(), 1.5) * 200), z = z0 + rng() * CHUNK_L, x = roadX(z) + lat;
      if (this.inLot(x, z)) continue;
      add(PROTO.rock[Math.floor(rng() * 12)], x, z, -0.08, rng() * 6, 0, 0.6 + rng() * 0.8);
    }
    // longhorn skulls: on the sand, or nailed to a post facing the road
    const nSk = rng() < 0.65 ? (rng() < 0.3 ? 2 : 1) : 0; this.skulls = [];
    for (let i = 0; i < nSk; i++) {
      const side = rng() < 0.5 ? -1 : 1, z = z0 + 10 + rng() * (CHUNK_L - 20), x = roadX(z) + side * (5.6 + rng() * 9);
      if (this.inLot(x, z)) continue;
      const face = side > 0 ? -Math.PI / 2 : Math.PI / 2; this.skulls.push({ x, z });
      if (rng() < 0.45) {
        add(PROTO.post155, x, z, 0);
        add(_skull, x, z, 1.55, face + rng() * 0.4 - 0.2, 0.15, 1.3);
        this.colliders.push({ x, z, r: 0.12 });
      } else {
        add(_skull, x, z, 0.12, face + (rng() - 0.5) * 2, -0.55 - rng() * 0.3, 1.2 + rng() * 0.35);
      }
    }
    // barbed-wire fence runs
    if (rng() < 0.3) {
      const side = rng() < 0.5 ? -1 : 1, lat = side * (15 + rng() * 6), zs = z0 + rng() * 60, len = 60 + rng() * 40;
      let px = null, py, pz;
      for (let z = zs; z < Math.min(zs + len, z0 + CHUNK_L); z += 3.5) {
        const x = roadX(z) + lat; if (this.inLot(x, z)) { px = null; continue; }
        const y = groundH(x, z); add(PROTO.post[Math.floor(rng() * 4)], x, z, 0);
        if (px !== null) [0.45, 0.8, 1.15].forEach((h) => wires.push(px, py + h, pz - z0, x, y + h, z - z0));
        px = x; py = y; pz = z;
      }
    }
    if (!batch.empty) { const m = new THREE.Mesh(batch.build(), MAT.props); m.castShadow = true; m.receiveShadow = true; g.add(m); }
    if (wires.length) { const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); g.add(new THREE.LineSegments(wg, MAT.wire)); }
    this.buildSigns(z0, rng);
  }
  sign(kind, text, sub, z, side = -1, w = 2.4, h = 1.2, post = 2.2) {
    const x = roadX(z) + side * 6.4, y = groundH(x, z), z0 = this.k * CHUNK_L;
    const grp = new THREE.Group(); grp.position.set(x, y, z - z0);
    const tex = signTextureCached(kind, text, sub);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
    face.position.y = post + h / 2; face.rotation.y = Math.PI; grp.add(face);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: 0x8c8c88 }));
    back.position.set(0, post + h / 2, 0.01); grp.add(back);
    const pg = new THREE.CylinderGeometry(0.05, 0.05, post + h * 0.9, 6);
    [-w * 0.3, w * 0.3].forEach((px) => { const p = new THREE.Mesh(pg, MAT.post); p.position.set(px, (post + h * 0.9) / 2, 0.03); grp.add(p); });
    grp.rotation.y = Math.atan(roadDX(z));
    grp.children.forEach((c) => (c.castShadow = true));
    this.group.add(grp);
    this.colliders.push({ x, z, r: 0.3 });
  }
  buildSigns(z0, rng) {
    const z1 = z0 + CHUNK_L;
    const s = nextStationAhead(z0 - 1000);
    for (let k = s.k; k < s.k + 3; k++) {
      const st = stationInfo(k);
      const zA = st.z - 900, zB = st.z - 320;
      if (zA >= z0 && zA < z1) this.sign('service', 'GAS · WATER', '½ MILE AHEAD', zA);
      if (zB >= z0 && zB < z1) this.sign('service', 'GAS', st.side < 0 ? 'NEXT RIGHT →' : '← NEXT LEFT', zB);
      const zC = st.z + 120;
      if (zC >= z0 && zC < z1) this.sign('warning', 'NEXT GAS', `${((STATION_SPACING) / 1609).toFixed(1)} MILES`, zC);
    }
    if (z0 <= 60 && z1 > 60) this.sign('brown', 'DEATH VALLEY', '282 FT BELOW SEA LEVEL', 60, -1, 3.2, 1.6, 1.6);
    if (rng() < 0.1) this.sign('warning', 'TURN OFF A/C', 'NEXT 20 MILES', z0 + 40 + rng() * 80);
    else if (rng() < 0.1) this.sign('warning', 'WATCH FOR', 'TUMBLEWEEDS', z0 + 40 + rng() * 80);
    else if (rng() < 0.08) this.sign('warning', 'EXTREME HEAT', 'CARRY WATER', z0 + 40 + rng() * 80);
  }
  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && !Object.values(MAT).includes(o.material)) o.material.dispose(); });
  }
}

// ── gas stations ────────────────────────────────────────────────────────────
class Station {
  constructor(info, scene) {
    this.info = info; this.k = info.k; this.colliders = []; this.pumps = []; this.bottles = [];
    const side = info.side, zc = info.z;
    this.group = new THREE.Group(); this.group.position.set(0, 0, zc);
    const g = this.group;
    const at = (lat, dz) => { const z = zc + dz; const x = roadX(z) + side * lat; return { x, y: groundH(x, z), z, zl: dz }; };
    const rot = Math.atan(roadDX(zc));
    const std = (o) => new THREE.MeshLambertMaterial(o);
    this.mats = [];
    const mat = (o) => { const m = std(o); this.mats.push(m); return m; };
    // lot surface
    {
      const LAT = [3.9, 8, 14, 20, 26, 32, 38, 41], DZ = [-23, -18, -12, -6, 0, 6, 12, 18, 23];
      const pos = [], uv = [], idx = [];
      DZ.forEach((dz) => LAT.forEach((lat) => { const p = at(lat, dz); pos.push(p.x, p.y + 0.035, p.zl); uv.push(lat / 8, dz / 8); }));
      for (let j = 0; j < DZ.length - 1; j++) for (let i = 0; i < LAT.length - 1; i++) { const a = j * LAT.length + i, b = a + 1, c = a + LAT.length, d = c + 1; if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const lot = new THREE.Mesh(geo, MAT.lot); lot.receiveShadow = true; g.add(lot);
    }
    const box = (w, h, d, m, lat, dz, y0 = 0, cast = true) => {
      const p = at(lat, dz); const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(p.x, p.y + y0 + h / 2, p.zl); b.rotation.y = rot; b.castShadow = cast; b.receiveShadow = true; g.add(b); return b;
    };
    const cyl = (r, h, m, lat, dz, y0 = 0) => { const p = at(lat, dz); const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), m); c.position.set(p.x, p.y + y0 + h / 2, p.zl); c.castShadow = true; g.add(c); return c; };
    const white = mat({ color: 0xd9d2c4 }), red = mat({ color: 0xc8432f }), rusty = mat({ map: TEX.metal, color: 0xc8a080 });
    const conc = mat({ color: 0xa49b8c }), dark = mat({ color: 0x1f2226 }), glow = mat({ color: 0xfff6dc, emissive: 0xfff0c8, emissiveIntensity: 0 });
    this.glowMat = glow;
    // canopy over the pump island
    const CL = 15;
    [[-4.6, -5.5], [4.6, -5.5], [-4.6, 5.5], [4.6, 5.5]].forEach(([dl, dz]) => { cyl(0.18, 5.2, white, CL + dl, dz); const p = at(CL + dl, dz); this.colliders.push({ x: p.x, z: p.z, r: 0.3 }); });
    box(11.5, 0.55, 14, white, CL, 0, 5.2);
    box(11.6, 0.3, 14.1, red, CL, 0, 5.75);
    [-3, 0, 3].forEach((dz) => { const l = box(1.6, 0.06, 0.5, glow, CL - 2.5, dz, 5.17, false); void l; const l2 = box(1.6, 0.06, 0.5, glow, CL + 2.5, dz, 5.17, false); void l2; });
    box(1.2, 0.22, 9, conc, CL, 0, 0);
    for (let i = 0; i < 4; i++) { const p = at(CL, -4 + i * 2.67); this.colliders.push({ x: p.x, z: p.z, r: 0.75 }); }
    // pumps
    [-2.4, 2.4].forEach((dz) => {
      box(0.6, 1.75, 0.85, red, CL, dz, 0.22);
      box(0.62, 0.36, 0.6, mat({ color: 0xe9e2cf }), CL, dz, 1.6);
      box(0.64, 0.18, 0.4, mat({ color: 0x10161a, emissive: 0x3aff7a, emissiveIntensity: 0.25 }), CL, dz, 1.25);
      const hose = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 16, Math.PI * 1.2), dark);
      const p = at(CL - side * 0.33, dz); hose.position.set(p.x, p.y + 1.1, p.zl); hose.rotation.set(0, rot + Math.PI / 2, Math.PI * 0.9); g.add(hose);
      const pp = at(CL, dz); this.pumps.push({ x: pp.x, z: pp.z });
    });
    // store
    const SL = 32;
    const stucco = mat({ map: TEX.stucco, color: 0xffffff });
    box(8, 4.2, 12, stucco, SL, 2);
    box(8.3, 0.5, 12.3, red, SL, 2, 4.2);
    const winM = mat({ color: 0x1c2a33, emissive: 0xffc078, emissiveIntensity: 0 }); this.winMat = winM;
    box(0.08, 1.6, 3.4, winM, SL - 4.02, -1.4, 1.0, false); box(0.08, 1.6, 3.4, winM, SL - 4.02, 5.6, 1.0, false);
    box(0.08, 2.3, 1.2, mat({ color: 0x5a3a22 }), SL - 4.02, 2.2, 0, false);
    // name board on the store front
    const nameTex = signTexture('station', info.name, 'COLD WATER · ICE'); this.tex = [nameTex];
    const board = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.6), mat({ map: nameTex, emissive: 0xffffff, emissiveMap: nameTex, emissiveIntensity: 0 }));
    this.boardMat = board.material;
    { const p = at(SL - 4.2, 2); board.position.set(p.x, p.y + 3.55, p.zl); board.rotation.y = rot + (side > 0 ? -Math.PI / 2 : Math.PI / 2); g.add(board); }
    { const p0 = at(SL - 4, -4), p1 = at(SL + 4, 8); this.colliders.push({ box: true, x0: Math.min(p0.x, p1.x), x1: Math.max(p0.x, p1.x), z0: Math.min(p0.z, p1.z), z1: Math.max(p0.z, p1.z) }); }
    // tall roadside sign with prices
    const priceTex = signTexture('station', 'REG $6.89', 'DIESEL $7.29'); this.tex.push(priceTex);
    cyl(0.16, 7.5, rusty, 7, -16);
    const tall = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 0.3), [mat({ color: 0xefe6d2 }), mat({ color: 0xefe6d2 }), mat({ color: 0xb5321f }), mat({ color: 0xb5321f }), mat({ map: priceTex, emissive: 0xffffff, emissiveMap: priceTex, emissiveIntensity: 0 }), mat({ map: priceTex, emissive: 0xffffff, emissiveMap: priceTex, emissiveIntensity: 0 })]);
    this.priceMats = [tall.material[4], tall.material[5]];
    { const p = at(7, -16); tall.position.set(p.x, p.y + 7.4, p.zl); tall.rotation.y = rot; tall.castShadow = true; g.add(tall); this.colliders.push({ x: p.x, z: p.z, r: 0.35 }); }
    // water stand: table, packs, cooler and loose bottles you can grab
    const WL = 25, WZ = -7;
    const wood = mat({ color: 0x7a5a3a });
    box(1.0, 0.08, 2.4, wood, WL, WZ, 0.82);
    [[-0.4, -1.1], [0.4, -1.1], [-0.4, 1.1], [0.4, 1.1]].forEach(([a, b]) => box(0.07, 0.82, 0.07, wood, WL + a, WZ + b));
    const pack = mat({ color: 0x9fd3f2, emissive: 0x2a6f9a, emissiveIntensity: 0.15 });
    [[0, -0.3], [0, 0.6], [1.2, -0.3], [1.2, 0.6]].forEach(([a, b], i) => box(0.6, 0.5, 0.8, pack, WL + 1.3 + (i > 1 ? 0.6 : 0), WZ + b, a * 0.42 + (i > 1 ? 0 : 0)));
    const cooler = box(0.7, 0.75, 1.1, mat({ color: 0xe9edf0 }), WL, WZ + 2.2);
    box(0.72, 0.12, 1.12, mat({ color: 0x2f7fd0 }), WL, WZ + 2.2, 0.75); void cooler;
    this.bottleGeo = bottleGeo();
    const bm = mat({ vertexColors: true, emissive: 0x3d9ad8, emissiveIntensity: 0.25 });
    for (let i = 0; i < 4; i++) {
      const p = at(WL + (i % 2 ? 0.2 : -0.2), WZ - 0.8 + i * 0.5);
      const b = new THREE.Mesh(this.bottleGeo, bm); b.position.set(p.x, p.y + 0.86, p.zl); b.castShadow = true; g.add(b); this.bottles.push(b);
    }
    this.water = at(WL, WZ); this.colliders.push({ x: this.water.x, z: this.water.z, r: 1.3 });
    // junk: drum, tyre stack
    cyl(0.32, 0.9, rusty, 38, -14); { const p = at(38, -14); this.colliders.push({ x: p.x, z: p.z, r: 0.4 }); }
    const tyreM = mat({ color: 0x1b1a19 });
    for (let i = 0; i < 3; i++) { const p = at(37, 13); const t = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.14, 6, 14), tyreM); t.rotation.x = Math.PI / 2; t.position.set(p.x, p.y + 0.14 + i * 0.28, p.zl); t.castShadow = true; g.add(t); }
    { const p = at(37, 13); this.colliders.push({ x: p.x, z: p.z, r: 0.55 }); }
    scene.add(g);
  }
  takeBottle() {
    const b = this.bottles.pop(); if (!b) return false;
    this.group.remove(b); return true;
  }
  setNight(n) {
    this.glowMat.emissiveIntensity = n * 1.6; this.winMat.emissiveIntensity = n * 0.8;
    this.boardMat.emissiveIntensity = n * 0.55; this.priceMats.forEach((m) => (m.emissiveIntensity = n * 0.6));
  }
  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.mats.forEach((m) => m.dispose()); this.tex.forEach((t) => t.dispose());
  }
}

const World = {
  chunks: new Map(), stations: new Map(),
  init(scene) {
    this.scene = scene;
    initMaterials();
    Sky.init(scene);
    this.lamp = new THREE.PointLight(0xffe2b0, 0, 30, 2); scene.add(this.lamp);
  },
  reset() {
    this.chunks.forEach((c) => c.dispose(this.scene)); this.chunks.clear();
    this.stations.forEach((s) => s.dispose(this.scene)); this.stations.clear();
  },
  // keep chunks around z; build at most `budget` new chunks per call
  update(z, budget = 1) {
    const kc = Math.floor(z / CHUNK_L);
    for (const [k, c] of this.chunks) if (k < kc - CHUNK_BEHIND - 1 || k > kc + CHUNK_AHEAD + 1) { c.dispose(this.scene); this.chunks.delete(k); }
    let built = 0;
    // nearest first
    for (let d = 0; d <= CHUNK_AHEAD && built < budget; d++) {
      for (const k of d === 0 ? [kc] : [kc + d, kc - d]) {
        if (k < kc - CHUNK_BEHIND || this.chunks.has(k) || built >= budget) continue;
        this.chunks.set(k, new Chunk(k, this.scene)); built++;
      }
    }
    const si = stationIndexNear(z);
    for (const [k, s] of this.stations) if (Math.abs(s.info.z - z) > 1500) { s.dispose(this.scene); this.stations.delete(k); }
    for (let k = si - 1; k <= si + 1; k++) {
      const info = stationInfo(k);
      if (!this.stations.has(k) && Math.abs(info.z - z) < 1200 && built < budget + 1) { this.stations.set(k, new Station(info, this.scene)); built++; }
    }
    return built;
  },
  ready(z) { const kc = Math.floor(z / CHUNK_L); for (let k = kc - 1; k <= kc + 3; k++) if (!this.chunks.has(k)) return false; return true; },
  nearestStationObj(z) { let best = null, bd = 1e9; for (const s of this.stations.values()) { const d = Math.abs(s.info.z - z); if (d < bd) { bd = d; best = s; } } return best; },
  colliders(x, z, out) {
    out.length = 0;
    const kc = Math.floor(z / CHUNK_L);
    for (let k = kc - 1; k <= kc + 1; k++) { const c = this.chunks.get(k); if (c) for (const o of c.colliders) if (o.box || (Math.abs(o.x - x) < 12 && Math.abs(o.z - z) < 12)) out.push(o); }
    const s = this.nearestStationObj(z); if (s && Math.abs(s.info.z - z) < 60) for (const o of s.colliders) out.push(o);
    return out;
  },
  updateLights(night, z) {
    const s = this.nearestStationObj(z);
    this.stations.forEach((st) => st.setNight(night));
    if (s && Math.abs(s.info.z - z) < 300 && night > 0.05) {
      const p = s.pumps[0]; this.lamp.position.set(p.x, groundH(p.x, s.info.z) + 4.8, s.info.z); this.lamp.intensity = night * 2.2;
    } else this.lamp.intensity = 0;
  },
};
