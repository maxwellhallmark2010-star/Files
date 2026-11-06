// ─────────────────────────────────────────────────────────────────────────────
// Assets generated at boot: canvas textures (sun-bleached asphalt, sand, rust,
// tread, brambles, signs) and low-poly geometry builders (longhorn skull,
// creosote bush, rocks, poles, water bottles, tumbleweeds). Nothing is
// downloaded.
// ─────────────────────────────────────────────────────────────────────────────
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(c, repeat = false, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.encoding = THREE.sRGBEncoding;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function speckle(g, w, h, n, colors, rMin = 0.6, rMax = 2) {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[(Math.random() * colors.length) | 0]; const r = rand(rMin, rMax); g.fillRect(Math.random() * w, Math.random() * h, r, r); }
}
function blot(g, x, y, r, color, alpha) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = alpha; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.globalAlpha = 1;
}

// ── geometry helpers ────────────────────────────────────────────────────────
function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Matrix4().compose(_v1.set(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), _v2.set(sx, sy, sz));
  geo.applyMatrix4(m); return geo;
}
function colored(geo, hex, jitter = 0) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  _c1.set(hex);
  for (let i = 0; i < n; i++) { const j = 1 + (Math.random() - 0.5) * jitter; a[i * 3] = _c1.r * j; a[i * 3 + 1] = _c1.g * j; a[i * 3 + 2] = _c1.b * j; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
function mergeGeos(geos) {
  let vc = 0, ic = 0;
  geos.forEach((g) => { vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; });
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), col = new Float32Array(vc * 3).fill(1);
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.attributes.color) col.set(g.attributes.color.array, vo * 3);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// Collects (geometry, matrix) pairs and writes them into one buffer in a single
// pass — much cheaper than cloning + merging when a chunk has hundreds of props.
class GeoBatch {
  constructor() { this.items = []; this.v = 0; this.i = 0; }
  add(geo, m) { this.items.push(geo, m.clone()); this.v += geo.attributes.position.count; this.i += geo.index ? geo.index.count : geo.attributes.position.count; }
  get empty() { return this.items.length === 0; }
  build() {
    const pos = new Float32Array(this.v * 3), nor = new Float32Array(this.v * 3), col = new Float32Array(this.v * 3);
    const idx = this.v > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i);
    let vo = 0, io = 0;
    for (let n = 0; n < this.items.length; n += 2) {
      const g = this.items[n], e = this.items[n + 1].elements;
      const P = g.attributes.position.array, N = g.attributes.normal.array, C = g.attributes.color ? g.attributes.color.array : null, c = g.attributes.position.count;
      const sx = Math.hypot(e[0], e[1], e[2]) || 1;
      for (let k = 0; k < c; k++) {
        const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2], o = (vo + k) * 3;
        pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12]; pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const nx = N[k * 3], ny = N[k * 3 + 1], nz = N[k * 3 + 2];
        nor[o] = (e[0] * nx + e[4] * ny + e[8] * nz) / sx; nor[o + 1] = (e[1] * nx + e[5] * ny + e[9] * nz) / sx; nor[o + 2] = (e[2] * nx + e[6] * ny + e[10] * nz) / sx;
        if (C) { col[o] = C[k * 3]; col[o + 1] = C[k * 3 + 1]; col[o + 2] = C[k * 3 + 2]; } else { col[o] = col[o + 1] = col[o + 2] = 1; }
      }
      if (g.index) { const a = g.index.array; for (let k = 0; k < a.length; k++) idx[io + k] = a[k] + vo; io += a.length; }
      else { for (let k = 0; k < c; k++) idx[io + k] = vo + k; io += c; }
      vo += c;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere();
    return out;
  }
}
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler();
function mat4(x, y, z, rx = 0, ry = 0, rz = 0, s = 1) { _E.set(rx, ry, rz); _Q.setFromEuler(_E); return _M.compose(_v1.set(x, y, z), _Q, _v2.set(s, s, s)); }
const _signCache = new Map();
function signTextureCached(kind, text, sub) {
  const key = kind + '|' + text + '|' + sub;
  let t = _signCache.get(key); if (!t) { t = signTexture(kind, text, sub); _signCache.set(key, t); }
  return t;
}

// ── textures ────────────────────────────────────────────────────────────────
const TEX = {};
function buildTextures() {
  // asphalt: 256 px across the road (7.6 m), 1024 px = 32 m along it
  {
    const W = 256, H = 1024, c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#4a4744'; g.fillRect(0, 0, W, H);
    speckle(g, W, H, 26000, ['#57534e', '#3c3a38', '#625d56', '#36332f'], 0.6, 1.6);
    for (let i = 0; i < 14; i++) blot(g, rand(0, W), rand(0, H), rand(30, 90), '#6d675e', 0.35);         // sun bleaching
    for (let i = 0; i < 8; i++) blot(g, rand(0, W), rand(0, H), rand(20, 60), '#2c2a28', 0.3);          // oil / patch
    // tar snakes: black crack-seal squiggles
    g.strokeStyle = 'rgba(18,17,16,0.8)'; g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      let x = rand(20, W - 20), y = rand(0, H); g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 14; k++) { x = clamp(x + rand(-14, 14), 6, W - 6); y += rand(8, 26); g.lineTo(x, y); }
      g.stroke();
    }
    g.strokeStyle = 'rgba(25,24,22,0.6)'; g.lineWidth = 1;
    for (let i = 0; i < 30; i++) { let x = rand(0, W), y = rand(0, H); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += rand(-10, 10); y += rand(-10, 10); g.lineTo(x, y); } g.stroke(); }
    // faded edge lines and dashed centre line (3 m dash / 8 m period)
    const ppm = H / 32;
    g.fillStyle = 'rgba(230,226,212,0.62)'; g.fillRect(8, 0, 6, H); g.fillRect(W - 14, 0, 6, H);
    g.fillStyle = 'rgba(214,170,52,0.72)';
    for (let m = 0; m < 32; m += 8) g.fillRect(W / 2 - 3, (m + 2.5) * ppm, 6, 3 * ppm);
    speckle(g, W, H, 4000, ['rgba(74,71,68,0.9)'], 1, 2.5); // wear on the paint
    // sand drifting over the edges
    const sg = g.createLinearGradient(0, 0, 26, 0); sg.addColorStop(0, 'rgba(196,166,122,0.7)'); sg.addColorStop(1, 'rgba(196,166,122,0)');
    g.fillStyle = sg; g.fillRect(0, 0, 26, H);
    const sg2 = g.createLinearGradient(W, 0, W - 26, 0); sg2.addColorStop(0, 'rgba(196,166,122,0.7)'); sg2.addColorStop(1, 'rgba(196,166,122,0)');
    g.fillStyle = sg2; g.fillRect(W - 26, 0, 26, H);
    TEX.asphalt = canvasTex(c, true); TEX.asphalt.anisotropy = 8;
  }
  // sand detail (multiplied with terrain vertex colours)
  {
    const c = makeCanvas(256, 256), g = c.getContext('2d');
    g.fillStyle = '#dedede'; g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 9000, ['#f2f2f2', '#c8c8c8', '#b4b4b4', '#e6e6e6', '#9c9c9c'], 0.8, 2.2);
    g.strokeStyle = 'rgba(160,160,160,0.25)'; g.lineWidth = 2;
    for (let y = 0; y < 256; y += 9) { g.beginPath(); for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x / 20 + y) * 3); g.stroke(); } // wind ripples
    TEX.sand = canvasTex(c, true);
  }
  // rusted paint for the jeep
  {
    const S = 512, c = makeCanvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#7a7450'; g.fillRect(0, 0, S, S);
    speckle(g, S, S, 30000, ['#857e58', '#6c6646', '#8f8862', '#615c3f'], 0.8, 2.2);
    for (let i = 0; i < 60; i++) blot(g, rand(0, S), rand(0, S), rand(15, 70), ['#8a3f17', '#a4541f', '#6b2f12', '#b8672a'][i % 4], rand(0.45, 0.85));
    for (let i = 0; i < 30; i++) { // rust streaks running down
      const x = rand(0, S), y = rand(0, S * 0.8), l = rand(30, 120);
      const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(120,52,18,0.7)'); gr.addColorStop(1, 'rgba(120,52,18,0)');
      g.fillStyle = gr; g.fillRect(x, y, rand(2, 6), l);
    }
    speckle(g, S, S, 5000, ['#3d1a0a', '#2a1408'], 1, 3);         // pitting
    g.strokeStyle = 'rgba(190,180,150,0.35)'; g.lineWidth = 1;     // scratches
    for (let i = 0; i < 40; i++) { const x = rand(0, S), y = rand(0, S); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-40, 40), y + rand(-8, 8)); g.stroke(); }
    const dust = g.createLinearGradient(0, S * 0.6, 0, S); dust.addColorStop(0, 'rgba(190,160,115,0)'); dust.addColorStop(1, 'rgba(190,160,115,0.55)');
    g.fillStyle = dust; g.fillRect(0, 0, S, S);
    TEX.rust = canvasTex(c);
  }
  {
    const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#4a3428'; g.fillRect(0, 0, S, S);
    speckle(g, S, S, 9000, ['#6b3a1c', '#3a2418', '#8a4a20', '#2a1a12'], 1, 3);
    TEX.metal = canvasTex(c);
  }
  // tyre tread
  {
    const c = makeCanvas(256, 64), g = c.getContext('2d');
    g.fillStyle = '#1d1c1b'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#2f2d2a';
    for (let x = 0; x < 256; x += 16) { g.fillRect(x + 2, 4, 9, 24); g.fillRect(x + 8, 36, 9, 24); }
    speckle(g, 256, 64, 600, ['rgba(160,130,90,0.4)'], 1, 2);
    TEX.tread = canvasTex(c, true); TEX.tread.repeat.set(3, 1);
  }
  // brambles for tumbleweeds (alpha tested)
  {
    const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S); g.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = ['#8a6a40', '#a8854f', '#6e5232', '#bf9d64'][i % 4]; g.lineWidth = rand(1.2, 3.2);
      const x = rand(0, S), y = rand(0, S);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + rand(-40, 40), y + rand(-40, 40), x + rand(-60, 60), y + rand(-60, 60)); g.stroke();
    }
    TEX.bramble = canvasTex(c);
  }
  // stucco for the station store
  {
    const c = makeCanvas(256, 256), g = c.getContext('2d');
    g.fillStyle = '#d8c7a6'; g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 9000, ['#e2d3b4', '#c9b691', '#bba684'], 0.8, 2);
    for (let i = 0; i < 10; i++) blot(g, rand(0, 256), rand(0, 256), rand(20, 60), '#a88f6a', 0.35);
    const dirt = g.createLinearGradient(0, 160, 0, 256); dirt.addColorStop(0, 'rgba(140,110,70,0)'); dirt.addColorStop(1, 'rgba(140,110,70,0.6)');
    g.fillStyle = dirt; g.fillRect(0, 0, 256, 256);
    TEX.stucco = canvasTex(c, true);
  }
  // cracked concrete for station lots
  {
    const c = makeCanvas(512, 512), g = c.getContext('2d');
    g.fillStyle = '#8f8678'; g.fillRect(0, 0, 512, 512);
    speckle(g, 512, 512, 20000, ['#9d9484', '#7f776a', '#a8a08f'], 0.8, 2);
    for (let i = 0; i < 20; i++) blot(g, rand(0, 512), rand(0, 512), rand(30, 90), i % 3 ? '#b79f78' : '#4b443b', 0.35);
    g.strokeStyle = 'rgba(50,45,40,0.7)'; g.lineWidth = 1.5;
    for (let i = 0; i < 25; i++) { let x = rand(0, 512), y = rand(0, 512); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += rand(-25, 25); y += rand(-25, 25); g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = 'rgba(60,56,50,0.5)'; g.lineWidth = 2;
    for (let x = 0; x <= 512; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(512, x); g.stroke(); }
    TEX.lot = canvasTex(c, true);
  }
  // soft round sprite for dust / glows
  {
    const c = makeCanvas(64, 64), g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    TEX.soft = canvasTex(c, false, false);
  }
}

// sign faces: returns a texture for a road sign
function signTexture(kind, text, sub) {
  const c = makeCanvas(512, 256), g = c.getContext('2d');
  const sans = '"Overpass", "Arial Narrow", "Helvetica Neue", sans-serif';
  if (kind === 'service') {          // blue services sign
    g.fillStyle = '#1f4f8c'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#f0f0ea'; g.lineWidth = 10; g.strokeRect(12, 12, 488, 232);
    g.fillStyle = '#f0f0ea'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 92px ${sans}`; g.fillText(text, 256, 100);
    g.font = `600 58px ${sans}`; g.fillText(sub, 256, 190);
  } else if (kind === 'warning') {   // brown/yellow desert warning
    g.fillStyle = '#e0a82e'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 10; g.strokeRect(12, 12, 488, 232);
    g.fillStyle = '#1a1a1a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 70px ${sans}`; g.fillText(text, 256, 95);
    g.font = `600 52px ${sans}`; g.fillText(sub, 256, 180);
  } else if (kind === 'brown') {
    g.fillStyle = '#5b3a22'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#efe2c8'; g.lineWidth = 8; g.strokeRect(14, 14, 484, 228);
    g.fillStyle = '#efe2c8'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 74px ${sans}`; g.fillText(text, 256, 100);
    g.font = `500 44px ${sans}`; g.fillText(sub, 256, 182);
  } else if (kind === 'station') {   // big roadside station sign
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#b5321f'; g.fillRect(0, 0, 512, 92);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 64px ${sans}`; g.fillText('GAS · WATER', 256, 50);
    g.fillStyle = '#2a2420'; g.font = `700 44px ${sans}`; g.fillText(text, 256, 132);
    g.font = `600 40px ${sans}`; g.fillText(sub, 256, 200);
  }
  speckle(g, 512, 256, 1400, ['rgba(255,255,255,0.18)', 'rgba(90,60,30,0.25)'], 1, 3); // sun & sand wear
  return canvasTex(c);
}

// ── geometry builders ───────────────────────────────────────────────────────
function taperedTube(points, r0, r1, segs, radial, colA, colB) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = geo.attributes.position, n = p.count, col = new Float32Array(n * 3);
  const ca = new THREE.Color(colA), cb = new THREE.Color(colB), cc = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const t = Math.floor(i / (radial + 1)) / segs;
    curve.getPointAt(t, _v1);
    const r = lerp(r0, r1, Math.pow(t, 0.8));
    p.setXYZ(i, _v1.x + (p.getX(i) - _v1.x) * r, _v1.y + (p.getY(i) - _v1.y) * r, _v1.z + (p.getZ(i) - _v1.z) * r);
    cc.copy(ca).lerp(cb, smoothstep(0.55, 1, t));
    col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}
// Longhorn steer skull, face toward +z, poll (top of head) at the origin.
function skullGeo() {
  const bone = 0xe9e1cc, shade = 0xcfc4a8, dark = 0x2a221a;
  const parts = [];
  parts.push(colored(placed(new THREE.SphereGeometry(0.14, 12, 9), 0, 0, 0, 0, 0, 0, 1.35, 0.72, 0.85), bone, 0.06));
  parts.push(colored(placed(new THREE.CylinderGeometry(0.115, 0.07, 0.46, 10), 0, -0.27, 0.05, -0.18, 0, 0, 1, 1, 0.62), bone, 0.08));
  parts.push(colored(placed(new THREE.SphereGeometry(0.07, 8, 6), 0, -0.5, 0.1, 0, 0, 0, 1, 0.8, 0.7), shade, 0.06));
  parts.push(colored(placed(new THREE.SphereGeometry(0.05, 8, 6), 0.1, -0.08, 0.035, 0, 0, 0, 1, 1, 0.6), dark));
  parts.push(colored(placed(new THREE.SphereGeometry(0.05, 8, 6), -0.1, -0.08, 0.035, 0, 0, 0, 1, 1, 0.6), dark));
  parts.push(colored(placed(new THREE.SphereGeometry(0.035, 6, 5), 0.03, -0.47, 0.135, 0, 0, 0, 1, 1.5, 0.6), dark));
  parts.push(colored(placed(new THREE.SphereGeometry(0.035, 6, 5), -0.03, -0.47, 0.135, 0, 0, 0, 1, 1.5, 0.6), dark));
  // horns sweep out, then curl up and forward at the tips
  const horn = (s) => taperedTube([
    new THREE.Vector3(s * 0.15, 0.01, -0.01), new THREE.Vector3(s * 0.42, -0.02, 0.02), new THREE.Vector3(s * 0.68, 0.04, 0.05),
    new THREE.Vector3(s * 0.86, 0.2, 0.09), new THREE.Vector3(s * 0.93, 0.38, 0.15)], 0.072, 0.01, 18, 8, 0xd9ccb0, 0x4c3c2a);
  parts.push(horn(1), horn(-1));
  return mergeGeos(parts);
}
function bushGeo(rng) {
  const parts = [], n = 4 + Math.floor(rng() * 5), s = 0.6 + rng() * 0.9;
  for (let i = 0; i < n; i++) {
    const r = (0.22 + rng() * 0.3) * s;
    const g = placed(new THREE.IcosahedronGeometry(r, 0), (rng() - 0.5) * 0.8 * s, r * 0.8 + rng() * 0.3 * s, (rng() - 0.5) * 0.8 * s);
    colored(g, [0x4a4f26, 0x5a5a2c, 0x3f4524, 0x66603a][i % 4], 0.25); parts.push(g);
  }
  return parts;
}
function rockGeo(rng) {
  const r = 0.2 + Math.pow(rng(), 2.2) * 1.1;
  const g = new THREE.DodecahedronGeometry(r, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 1 + hash1(Math.round(p.getX(i) * 50) * 7 + Math.round(p.getY(i) * 50) * 13 + Math.round(p.getZ(i) * 50)) * 0.35; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.6, p.getZ(i) * k); }
  g.computeVertexNormals();
  return colored(g, [0x8b735c, 0x7a6450, 0x9a8670, 0x6a5444][Math.floor(rng() * 4)], 0.15);
}
function poleGeo() {
  const parts = [];
  parts.push(colored(placed(new THREE.CylinderGeometry(0.1, 0.14, 8.6, 7), 0, 4.3, 0), 0x6b5843, 0.12));
  parts.push(colored(placed(new THREE.BoxGeometry(2.0, 0.12, 0.12), 0, 7.9, 0), 0x5e4d3a, 0.1));
  [-0.85, -0.3, 0.85].forEach((x) => parts.push(colored(placed(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 6), x, 8.04, 0), 0x6f9a8a)));
  return parts;
}
const POLE_TOP = [[-0.85, 8.12], [-0.3, 8.12], [0.85, 8.12]];
function postGeo(h = 1.3) { return colored(placed(new THREE.CylinderGeometry(0.055, 0.07, h, 6), 0, h / 2, 0, rand(-0.06, 0.06), 0, rand(-0.06, 0.06)), 0x6a5640, 0.15); }
function bottleGeo() {
  const parts = [];
  parts.push(colored(placed(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10), 0, 0.1, 0), 0x9fd3f2, 0.05));
  parts.push(colored(placed(new THREE.CylinderGeometry(0.046, 0.046, 0.06, 10), 0, 0.11, 0), 0x2f7fd0));
  parts.push(colored(placed(new THREE.CylinderGeometry(0.028, 0.045, 0.04, 10), 0, 0.22, 0), 0xa9d9f5));
  parts.push(colored(placed(new THREE.CylinderGeometry(0.02, 0.02, 0.025, 8), 0, 0.25, 0), 0xf2f2f2));
  return mergeGeos(parts);
}
// tumbleweed: two alpha-tested bramble shells (shared geometry + material)
let _twGeo = null, _twGeo2 = null, _twMat = null;
function makeTumbleweed() {
  if (!_twGeo) {
    _twGeo = new THREE.IcosahedronGeometry(1, 2); _twGeo2 = new THREE.IcosahedronGeometry(0.68, 1);
    _twMat = new THREE.MeshLambertMaterial({ map: TEX.bramble, alphaTest: 0.45, side: THREE.DoubleSide, color: 0xd8bf8e });
  }
  const g = new THREE.Group();
  const a = new THREE.Mesh(_twGeo, _twMat), b = new THREE.Mesh(_twGeo2, _twMat);
  b.rotation.set(1.1, 0.4, 2.2); a.castShadow = true;
  g.add(a, b);
  return g;
}
