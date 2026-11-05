// ============================================================================
//  WORLD — city grid, buildings, roads, signals, props, sky, day/night, weather
// ============================================================================
const NB = 8, ROAD = 18, RH = 9, PITCH = 80, SW = 4, CURB = 0.15, HALF = NB * PITCH / 2; // 320
const LANES = [1.8, 5.4];
const WALL = HALF + RH + SW; // 333
const STOP_D = 13.5;
const rp = k => -HALF + k * PITCH;
const PARKS = new Set(['4,4', '1,1', '6,6', '1,6']);
const LOTS = new Set(['6,2']);
const world = { props: [], potholes: [], emitters: [], lightClock: 0, benches: [], mapCanvas: null, markers: [] };

function inRoadBand(v) { const t = v + HALF; const k = Math.round(t / PITCH); return k >= 0 && k <= NB && Math.abs(t - k * PITCH) <= RH; }
function groundH(x, z) {
  if (Math.abs(x) > HALF + RH || Math.abs(z) > HALF + RH) return CURB;
  return (inRoadBand(x) || inRoadBand(z)) ? 0 : CURB;
}
function blockOf(x, z) { return { i: Math.floor((x + HALF) / PITCH), j: Math.floor((z + HALF) / PITCH) }; }
function blockRect(i, j) { return { x0: rp(i) + RH, x1: rp(i + 1) - RH, z0: rp(j) + RH, z1: rp(j + 1) - RH }; }
function blockCorners(i, j) { const b = blockRect(i, j), o = 2; return [new V3(b.x0 + o, 0, b.z0 + o), new V3(b.x1 - o, 0, b.z0 + o), new V3(b.x1 - o, 0, b.z1 - o), new V3(b.x0 + o, 0, b.z1 - o)]; }
function laneFixed(axis, roadK, dir, lane) { const c = rp(roadK), off = LANES[lane]; return axis === 'x' ? c + dir * off : c - dir * off; }
function axisHeading(axis, dir) { return axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2); }
function sideFace(i, j, side) {
  const x0 = rp(i) + RH + SW, x1 = rp(i + 1) - RH - SW, z0 = rp(j) + RH + SW, z1 = rp(j + 1) - RH - SW;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (side === '-z') return { x: cx, z: z0, nx: 0, nz: -1 };
  if (side === '+z') return { x: cx, z: z1, nx: 0, nz: 1 };
  if (side === '-x') return { x: x0, z: cz, nx: -1, nz: 0 };
  return { x: x1, z: cz, nx: 1, nz: 0 };
}

// ---------------------------------------------------------------- places
const STORES = [
  { id: 'mart', type: 'mart', name: 'SUNSET 24/7', i: 3, j: 2, side: '-z', color: '#d8342a', awn: 0xd8342a },
  { id: 'guns', type: 'guns', name: 'LOCK & LOAD GUNS', i: 5, j: 3, side: '-x', color: '#e0b030', awn: 0x2c2c2c },
  { id: 'diner', type: 'diner', name: "BIG EARL'S BURGERS", i: 2, j: 4, side: '+x', color: '#ff7a1a', awn: 0xc8281e },
  { id: 'tacos', type: 'diner', name: 'TACO LOCO', i: 4, j: 5, side: '+z', color: '#3fd16a', awn: 0x1f8a3a },
  { id: 'clothes', type: 'clothes', name: 'THREADS', i: 2, j: 2, side: '+z', color: '#ff4fd8', awn: 0x7a2a8a },
  { id: 'mart2', type: 'mart', name: 'QUICK STOP', i: 6, j: 5, side: '-z', color: '#3aa0ff', awn: 0x1a5aa8 }
];
const PLACES = {
  safehouse: { i: 2, j: 5, side: '+x', name: 'HOME' },
  hospital: { i: 1, j: 3, side: '+x', name: 'COUNTY GENERAL' },
  garage: { i: 4, j: 2, side: '-z', name: 'PINSTRIPE AUTO BODY' }
};
const STORE_BLOCKS = new Set([...STORES, ...Object.values(PLACES)].map(s => s.i + ',' + s.j));
function placeDoor(p, out = 1.3) { const f = sideFace(p.i, p.j, p.side); return { x: f.x + f.nx * out, z: f.z + f.nz * out, nx: f.nx, nz: f.nz, fx: f.x, fz: f.z }; }
for (const s of STORES) s.door = placeDoor(s);
for (const k in PLACES) PLACES[k].door = placeDoor(PLACES[k]);
PLACES.garage.curb = placeDoor(PLACES.garage, SW + 1.2);
PLACES.safehouse.curb = placeDoor(PLACES.safehouse, SW + 0.9);
PLACES.hospital.curb = placeDoor(PLACES.hospital, SW + 0.9);

// ---------------------------------------------------------------- collision grid
const CELL = 20; const cgrid = new Map(); let cstamp = 1;
const ckey = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);
function addCollider(c) {
  c.stamp = 0;
  let x0, x1, z0, z1;
  if (c.type === 'box') { x0 = c.minX; x1 = c.maxX; z0 = c.minZ; z1 = c.maxZ; } else { x0 = c.x - c.r; x1 = c.x + c.r; z0 = c.z - c.r; z1 = c.z + c.r; }
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const k = ckey(cx, cz); let l = cgrid.get(k); if (!l) { l = []; cgrid.set(k, l); } l.push(c);
    }
  return c;
}
function addBox(minX, minZ, maxX, maxZ, h, extra) { return addCollider(Object.assign({ type: 'box', minX, minZ, maxX, maxZ, h }, extra || {})); }
function addCircle(x, z, r, h, extra) { return addCollider(Object.assign({ type: 'circle', x, z, r, h }, extra || {})); }
const _qOut = [];
function queryArea(minX, minZ, maxX, maxZ, out = _qOut) {
  cstamp++; out.length = 0;
  for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++)
    for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
      const l = cgrid.get(ckey(cx, cz)); if (!l) continue;
      for (const c of l) if (!c.dead && c.stamp !== cstamp) { c.stamp = cstamp; out.push(c); }
    }
  return out;
}
const _hit = { nx: 0, nz: 0, pen: 0 };
function circleVs(x, z, r, c) {
  if (c.type === 'box') {
    const px = clamp(x, c.minX, c.maxX), pz = clamp(z, c.minZ, c.maxZ);
    const dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz;
    if (d2 > r * r) return null;
    if (d2 > 1e-9) { const d = Math.sqrt(d2); _hit.nx = dx / d; _hit.nz = dz / d; _hit.pen = r - d; return _hit; }
    const l = x - c.minX, rr = c.maxX - x, b = z - c.minZ, t = c.maxZ - z, m = Math.min(l, rr, b, t);
    if (m === l) { _hit.nx = -1; _hit.nz = 0; } else if (m === rr) { _hit.nx = 1; _hit.nz = 0; } else if (m === b) { _hit.nx = 0; _hit.nz = -1; } else { _hit.nx = 0; _hit.nz = 1; }
    _hit.pen = m + r; return _hit;
  }
  const dx = x - c.x, dz = z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
  if (d2 > rr * rr) return null;
  const d = Math.sqrt(d2) || 1e-4; _hit.nx = dx / d; _hit.nz = dz / d; _hit.pen = rr - d; return _hit;
}
// push a circle out of static world; returns accumulated normal (or null)
function pushOutCircle(p, r, y = 0.5, cb) {
  const list = queryArea(p.x - r, p.z - r, p.x + r, p.z + r, []);
  let hitAny = false;
  for (const c of list) {
    if (c.h !== undefined && y > c.h) continue;
    if (c.noChar && !cb) continue;
    const h = circleVs(p.x, p.z, r, c); if (!h) continue;
    p.x += h.nx * h.pen; p.z += h.nz * h.pen; hitAny = true;
    if (cb) cb(c, h.nx, h.nz, h.pen);
  }
  return hitAny;
}
// ray vs static (boxes as extruded prisms with height h, circles as cylinders)
const _rayRes = { t: 0, nx: 0, ny: 0, nz: 0, c: null };
function rayStatic(o, d, maxT, boxesOnly) {
  let best = maxT, bc = null, bn = [0, 0, 0];
  // ground
  if (d.y < -1e-4) { const t = (groundH(o.x, o.z) - o.y) / d.y; if (t > 0 && t < best) { best = t; bc = 'ground'; bn = [0, 1, 0]; } }
  const steps = Math.ceil(maxT / (CELL * 0.5));
  const seen = new Set();
  for (let s = 0; s <= steps; s++) {
    const t0 = s * CELL * 0.5; if (t0 > best + CELL) break;
    const px = o.x + d.x * t0, pz = o.z + d.z * t0;
    const list = queryArea(px - CELL * 0.5, pz - CELL * 0.5, px + CELL * 0.5, pz + CELL * 0.5, []);
    for (const c of list) {
      if (seen.has(c)) continue; seen.add(c);
      if (boxesOnly && (c.type !== 'box' || c.h < 2.5)) continue;
      if (c.type === 'box') {
        let tmin = 0, tmax = best, nAxis = -1, nSign = 0;
        const bmin = [c.minX, 0, c.minZ], bmax = [c.maxX, c.h, c.maxZ], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
        let ok = true;
        for (let a = 0; a < 3; a++) {
          if (Math.abs(dd[a]) < 1e-9) { if (oo[a] < bmin[a] || oo[a] > bmax[a]) { ok = false; break; } continue; }
          let t1 = (bmin[a] - oo[a]) / dd[a], t2 = (bmax[a] - oo[a]) / dd[a], sg = -1;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sg = 1; }
          if (t1 > tmin) { tmin = t1; nAxis = a; nSign = sg; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) { ok = false; break; }
        }
        if (ok && nAxis >= 0 && tmin < best) { best = tmin; bc = c; bn = [0, 0, 0]; bn[nAxis] = nSign; }
      } else {
        const ox = o.x - c.x, oz = o.z - c.z, a = d.x * d.x + d.z * d.z; if (a < 1e-9) continue;
        const b = 2 * (ox * d.x + oz * d.z), cc = ox * ox + oz * oz - c.r * c.r, disc = b * b - 4 * a * cc;
        if (disc < 0) continue; const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t > 0 && t < best && o.y + d.y * t < (c.h || 3)) { best = t; bc = c; const hx = ox + d.x * t, hz = oz + d.z * t, l = Math.hypot(hx, hz) || 1; bn = [hx / l, 0, hz / l]; }
      }
    }
  }
  if (!bc) return null;
  _rayRes.t = best; _rayRes.c = bc; _rayRes.nx = bn[0]; _rayRes.ny = bn[1]; _rayRes.nz = bn[2]; return _rayRes;
}

// ---------------------------------------------------------------- geometry builder
class GeoB {
  constructor(colors = false) { this.p = []; this.n = []; this.u = []; this.i = []; this.c = colors ? [] : null; this.cr = this.cg = this.cb = 1; }
  color(hex) { _col.setHex(hex); this.cr = _col.r; this.cg = _col.g; this.cb = _col.b; return this; }
  quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, u0, v0, u1, v1) {
    const k = this.p.length / 3;
    this.p.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    for (let j = 0; j < 4; j++) { this.n.push(nx, ny, nz); if (this.c) this.c.push(this.cr, this.cg, this.cb); }
    this.u.push(u0, v0, u1, v0, u1, v1, u0, v1); this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  flat(x0, z0, x1, z1, y, ts = 1) { this.quad(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0, 0, 1, 0, x0 / ts, -z1 / ts, x1 / ts, -z0 / ts); }
  box(x0, y0, z0, x1, y1, z1, o = {}) {
    const us = o.us || 1, vs = o.vs || 1, uo = o.uo || 0, w = x1 - x0, d = z1 - z0, ts = o.ts || us;
    if (o.sides !== false) {
      this.quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, uo, y0 / vs, uo + w / us, y1 / vs);
      this.quad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, uo + 0.37, y0 / vs, uo + 0.37 + w / us, y1 / vs);
      this.quad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, uo + 0.61, y0 / vs, uo + 0.61 + d / us, y1 / vs);
      this.quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, uo + 0.13, y0 / vs, uo + 0.13 + d / us, y1 / vs);
    }
    if (o.top !== false) this.quad(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0, x0 / ts, -z1 / ts, x1 / ts, -z0 / ts);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); g.computeBoundingSphere(); return g;
  }
}
function mergeGeos(list) { // list of [geometry, matrix]
  const P = [], N = [], U = [];
  for (const [g0, m] of list) {
    const g = (g0.index ? g0.toNonIndexed() : g0.clone()); if (m) g.applyMatrix4(m);
    const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv ? g.attributes.uv.array : null;
    for (let i = 0; i < p.length; i++) P.push(p[i]);
    for (let i = 0; i < n.length; i++) N.push(n[i]);
    for (let i = 0; i < p.length / 3; i++) { U.push(u ? u[i * 2] : 0, u ? u[i * 2 + 1] : 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeBoundingSphere(); return g;
}
const M4 = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz));

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function noiseFill(g, w, h, base, amt, n = 4000, sz = 2) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const v = Math.random() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * amt})`; g.fillRect(Math.random() * w, Math.random() * h, sz, sz); }
}
const TEX = {};
function buildTextures() {
  TEX.asphalt = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#3b3d40', 0.18, 9000, 2);
    for (let i = 0; i < 14; i++) { g.strokeStyle = 'rgba(20,20,20,0.35)'; g.lineWidth = 1; g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rand(-14, 14); y += rand(-14, 14); g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(25,25,28,0.25)'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rand(10, 30), rand(6, 18), rand(0, 3), 0, TAU); g.fill(); }
  });
  TEX.asphalt.repeat.set(1, 1);
  TEX.sidewalk = canvasTex(128, 128, (g, w, h) => {
    noiseFill(g, w, h, '#a7a39a', 0.12, 2500, 2);
    g.strokeStyle = 'rgba(60,58,52,0.55)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  });
  TEX.grass = canvasTex(128, 128, (g, w, h) => {
    noiseFill(g, w, h, '#4d7a35', 0.25, 5000, 2);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${randi(40, 90)},${randi(100, 150)},${randi(30, 60)},0.6)`; g.fillRect(Math.random() * w, Math.random() * h, 1, 3); }
  });
  TEX.roof = canvasTex(128, 128, (g, w, h) => { noiseFill(g, w, h, '#4a4a4c', 0.2, 3000, 3); });
  TEX.dirt = canvasTex(128, 128, (g, w, h) => { noiseFill(g, w, h, '#6b6247', 0.25, 4000, 3); });
  TEX.lot = canvasTex(128, 128, (g, w, h) => { noiseFill(g, w, h, '#38393c', 0.15, 3000, 2); });
}
const FACADES = [
  { wall: '#8a4a36', win: '#26313c', frame: '#d8d2c4', kind: 'brick' },
  { wall: '#b7ae9c', win: '#2e3a46', frame: '#7c766a', kind: 'concrete' },
  { wall: '#2f5f80', win: '#3f7fa4', frame: '#1a2a36', kind: 'glass' },
  { wall: '#e6c79c', win: '#30363c', frame: '#f4eee0', kind: 'stucco' },
  { wall: '#d79ea3', win: '#30363c', frame: '#f4eee0', kind: 'stucco' },
  { wall: '#94c4b9', win: '#30363c', frame: '#f4eee0', kind: 'stucco' },
  { wall: '#3c3f45', win: '#1f2a33', frame: '#5a5f66', kind: 'dark' }
];
const FAC_W = 16, FAC_H = 14;
function makeFacade(f) {
  const W = 512, H = 448, bays = 4, floors = 4, bw = W / bays, fh = H / floors;
  const lit = [];
  for (let i = 0; i < bays * floors; i++) lit.push(Math.random() < (f.kind === 'glass' ? 0.45 : 0.32));
  const map = canvasTex(W, H, (g) => {
    noiseFill(g, W, H, f.wall, 0.12, 6000, 2);
    if (f.kind === 'brick') { g.fillStyle = 'rgba(40,20,10,0.18)'; for (let y = 0; y < H; y += 7) { g.fillRect(0, y, W, 1); for (let x = (y / 7) % 2 * 8; x < W; x += 16) g.fillRect(x, y, 1, 7); } }
    for (let fy = 0; fy < floors; fy++) for (let bx = 0; bx < bays; bx++) {
      const x = bx * bw, y = H - (fy + 1) * fh;
      if (f.kind === 'glass') {
        g.fillStyle = f.win; g.fillRect(x + 2, y + 4, bw - 4, fh - 10);
        const gr = g.createLinearGradient(x, y, x + bw, y + fh); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0.15)'); g.fillStyle = gr; g.fillRect(x + 2, y + 4, bw - 4, fh - 10);
        g.fillStyle = f.frame; g.fillRect(x, y, bw, 4); g.fillRect(x + bw / 2 - 1, y, 2, fh);
      } else {
        const ww = bw * 0.46, wh = fh * 0.56, wx = x + (bw - ww) / 2, wy = y + fh * 0.2;
        g.fillStyle = f.frame; g.fillRect(wx - 4, wy - 4, ww + 8, wh + 10);
        g.fillStyle = f.win; g.fillRect(wx, wy, ww, wh);
        const gr = g.createLinearGradient(wx, wy, wx + ww, wy + wh); gr.addColorStop(0, 'rgba(255,255,255,0.16)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.02)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)'); g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
        g.fillStyle = f.frame; g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
        if (Math.random() < 0.3) { g.fillStyle = `rgba(${randi(150, 240)},${randi(130, 220)},${randi(90, 180)},0.55)`; g.fillRect(wx + 2, wy + 2, ww / 2 - 4, wh * rand(0.3, 0.9)); } // curtains
        if (f.kind === 'stucco') { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(wx - 4, wy + wh + 6, ww + 8, 3); }
      }
    }
    if (f.kind !== 'glass') { g.fillStyle = 'rgba(0,0,0,0.12)'; for (let fy = 1; fy < floors; fy++) g.fillRect(0, H - fy * fh - 2, W, 3); }
  });
  const em = canvasTex(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (let fy = 0; fy < floors; fy++) for (let bx = 0; bx < bays; bx++) {
      if (!lit[fy * bays + bx]) continue;
      const x = bx * bw, y = H - (fy + 1) * fh;
      const warm = Math.random() < 0.8;
      g.fillStyle = warm ? `rgb(${randi(220, 255)},${randi(170, 210)},${randi(90, 130)})` : `rgb(${randi(150, 190)},${randi(190, 220)},255)`;
      if (f.kind === 'glass') g.fillRect(x + 2, y + 4, bw - 4, fh - 10);
      else { const ww = bw * 0.46, wh = fh * 0.56; g.fillRect(x + (bw - ww) / 2, y + fh * 0.2, ww, wh); }
    }
  });
  return new THREE.MeshLambertMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0 });
}
function signTexture(text, color, bg = '#141414', w = 512, h = 96) {
  return canvasTex(w, h, g => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.font = `bold ${Math.floor(h * 0.52)}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 14; g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 2, w - 30);
    g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(text, w / 2, h / 2 + 2, w - 30);
  }, false);
}

// ---------------------------------------------------------------- materials (shared)
const MAT = {};
function buildMaterials() {
  MAT.asphalt = new THREE.MeshLambertMaterial({ map: TEX.asphalt });
  MAT.sidewalk = new THREE.MeshLambertMaterial({ map: TEX.sidewalk });
  MAT.grass = new THREE.MeshLambertMaterial({ map: TEX.grass });
  MAT.roof = new THREE.MeshLambertMaterial({ map: TEX.roof });
  MAT.lot = new THREE.MeshLambertMaterial({ map: TEX.lot });
  MAT.dirt = new THREE.MeshLambertMaterial({ map: TEX.dirt });
  MAT.marks = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  MAT.metal = new THREE.MeshLambertMaterial({ color: 0x3f4448 });
  MAT.darkMetal = new THREE.MeshLambertMaterial({ color: 0x23272a });
  MAT.concrete = new THREE.MeshLambertMaterial({ color: 0x9c978c });
  MAT.wood = new THREE.MeshLambertMaterial({ color: 0x7a5232 });
  MAT.trunk = new THREE.MeshLambertMaterial({ color: 0x6b5034 });
  MAT.palmTrunk = new THREE.MeshLambertMaterial({ color: 0x8a7350 });
  MAT.leaf = new THREE.MeshLambertMaterial({ color: 0x3d7a2e });
  MAT.palmLeaf = new THREE.MeshLambertMaterial({ color: 0x4f8a2c, side: THREE.DoubleSide });
  MAT.red = new THREE.MeshLambertMaterial({ color: 0xc0281e });
  MAT.lampHead = new THREE.MeshBasicMaterial({ color: 0x555555 });
  MAT.lampGlow = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  MAT.storeGlass = new THREE.MeshLambertMaterial({ color: 0x6c8a99, emissive: 0xffe4b0, emissiveIntensity: 0.1 });
  MAT.facades = FACADES.map(makeFacade);
  MAT.signals = {
    z: { R: new THREE.MeshBasicMaterial({ color: 0x300c0c }), Y: new THREE.MeshBasicMaterial({ color: 0x302a0c }), G: new THREE.MeshBasicMaterial({ color: 0x0c2a14 }) },
    x: { R: new THREE.MeshBasicMaterial({ color: 0x300c0c }), Y: new THREE.MeshBasicMaterial({ color: 0x302a0c }), G: new THREE.MeshBasicMaterial({ color: 0x0c2a14 }) }
  };
  MAT.signs = [];
}

// ---------------------------------------------------------------- traffic signal timing
const LIGHT_CYCLE = 30;
function lightState(axis) {
  const t = world.lightClock % LIGHT_CYCLE;
  if (axis === 'z') return t < 11 ? 'G' : (t < 14 ? 'Y' : 'R');
  return t < 15 ? 'R' : (t < 26 ? 'G' : (t < 29 ? 'Y' : 'R'));
}
const SIG_ON = { R: 0xff2a14, Y: 0xffc21a, G: 0x22ff66 }, SIG_OFF = { R: 0x2c0a0a, Y: 0x2c260a, G: 0x0a2612 };
function updateSignals(dt) {
  world.lightClock += dt;
  for (const ax of ['z', 'x']) { const s = lightState(ax); for (const c of ['R', 'Y', 'G']) MAT.signals[ax][c].color.setHex(s === c ? SIG_ON[c] : SIG_OFF[c]); }
}

// ---------------------------------------------------------------- city build
function buildCity() {
  const rng = mulberry32(90210);
  const R = (a, b) => a + rng() * (b - a);
  buildTextures(); buildMaterials();

  // ground: asphalt city + outer grass
  const gsize = (HALF + RH) * 2;
  TEX.asphalt.repeat.set(gsize / 8, gsize / 8);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(gsize, gsize), MAT.asphalt);
  road.rotation.x = -Math.PI / 2; road.receiveShadow = true; scene.add(road);
  const outerT = TEX.dirt.clone(); outerT.needsUpdate = true; outerT.repeat.set(220, 220);
  { // ground outside the city wall: four slabs that never overlap the streets (avoids depth fighting)
    const og = new GeoB(), F = 1500, Wd = WALL;
    og.flat(-F, -F, F, -Wd, 0, 13.6); og.flat(-F, Wd, F, F, 0, 13.6); og.flat(-F, -Wd, -Wd, Wd, 0, 13.6); og.flat(Wd, -Wd, F, Wd, 0, 13.6);
    outerT.repeat.set(1, 1);
    scene.add(new THREE.Mesh(og.build(), new THREE.MeshLambertMaterial({ map: outerT, color: 0x9a9a80 })));
  }

  // sidewalks & block bases
  const sw = new GeoB(), grassG = new GeoB(), lotG = new GeoB();
  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) {
    const b = blockRect(i, j);
    sw.box(b.x0, 0, b.z0, b.x1, CURB, b.z1, { us: 2, vs: 2, ts: 2 });
    const key = i + ',' + j;
    if (PARKS.has(key)) grassG.flat(b.x0 + SW, b.z0 + SW, b.x1 - SW, b.z1 - SW, CURB + 0.01, 6);
    if (LOTS.has(key)) lotG.flat(b.x0 + SW, b.z0 + SW, b.x1 - SW, b.z1 - SW, CURB + 0.008, 8);
  }
  // outer ring sidewalk
  const E = HALF + RH;
  sw.box(-WALL, 0, -WALL, WALL, CURB, -E, { us: 2, vs: 2, ts: 2 }); sw.box(-WALL, 0, E, WALL, CURB, WALL, { us: 2, vs: 2, ts: 2 });
  sw.box(-WALL, 0, -E, -E, CURB, E, { us: 2, vs: 2, ts: 2 }); sw.box(E, 0, -E, WALL, CURB, E, { us: 2, vs: 2, ts: 2 });
  const swm = new THREE.Mesh(sw.build(), MAT.sidewalk); swm.receiveShadow = true; scene.add(swm);
  const gm = new THREE.Mesh(grassG.build(), MAT.grass); gm.receiveShadow = true; scene.add(gm);
  const lm = new THREE.Mesh(lotG.build(), MAT.lot); lm.receiveShadow = true; scene.add(lm);

  // boundary wall
  const wallG = new GeoB();
  wallG.box(-WALL - 1, 0, -WALL - 1, WALL + 1, 3.2, -WALL, { us: 4, vs: 4 }); wallG.box(-WALL - 1, 0, WALL, WALL + 1, 3.2, WALL + 1, { us: 4, vs: 4 });
  wallG.box(-WALL - 1, 0, -WALL, -WALL, 3.2, WALL, { us: 4, vs: 4 }); wallG.box(WALL, 0, -WALL, WALL + 1, 3.2, WALL, { us: 4, vs: 4 });
  scene.add(new THREE.Mesh(wallG.build(), MAT.concrete));
  addBox(-WALL - 1, -WALL - 1, WALL + 1, -WALL, 3.2); addBox(-WALL - 1, WALL, WALL + 1, WALL + 1, 3.2);
  addBox(-WALL - 1, -WALL, -WALL, WALL, 3.2); addBox(WALL, -WALL, WALL + 1, WALL, 3.2);

  // distant hills
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x5e6a4a, flatShading: true });
  const hillG = [];
  for (let a = 0; a < TAU; a += TAU / 28) {
    const r = R(520, 760), h = R(40, 150), w = R(90, 200);
    hillG.push([new THREE.ConeGeometry(w, h, 7, 1), M4(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r, R(0, 3))]);
  }
  const hills = new THREE.Mesh(mergeGeos(hillG), hillMat); scene.add(hills); world.hillMat = hillMat;
  // "HOLLYWOOD"-style hillside letters? (keeps generic) -> big sign on a hill
  {
    const t = signTexture('BOULEVARD KINGS', '#ffffff', 'rgba(0,0,0,0)', 1024, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(220, 28), new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: false, color: 0xdddddd }));
    m.position.set(-60, 70, 640); m.rotation.y = Math.PI; scene.add(m);
  }

  // buildings
  const bGeo = FACADES.map(() => new GeoB()); const roofG = new GeoB();
  const storeBlocks = STORE_BLOCKS;
  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) {
    const key = i + ',' + j;
    if (PARKS.has(key) || LOTS.has(key)) continue;
    const x0 = rp(i) + RH + SW, x1 = rp(i + 1) - RH - SW, z0 = rp(j) + RH + SW, z1 = rp(j + 1) - RH - SW;
    const dc = Math.hypot(i - 3.5, j - 3.5);
    const zone = dc < 1.6 ? 2 : (dc < 2.9 ? 1 : 0);
    const isStore = storeBlocks.has(key);
    const nx = isStore ? 3 : (rng() < 0.5 ? 2 : 3), nz = isStore ? 3 : (rng() < 0.5 ? 2 : 3);
    const cutsX = [x0], cutsZ = [z0];
    for (let k = 1; k < nx; k++) cutsX.push(x0 + (x1 - x0) * (k / nx) + (isStore ? 0 : R(-4, 4)));
    for (let k = 1; k < nz; k++) cutsZ.push(z0 + (z1 - z0) * (k / nz) + (isStore ? 0 : R(-4, 4)));
    cutsX.push(x1); cutsZ.push(z1);
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      const interior = a > 0 && a < nx - 1 && b > 0 && b < nz - 1;
      if (interior && rng() < 0.6) continue;
      const al = 1.2;
      const lx0 = cutsX[a] + (a > 0 ? al : 0), lx1 = cutsX[a + 1] - (a < nx - 1 ? al : 0);
      const lz0 = cutsZ[b] + (b > 0 ? al : 0), lz1 = cutsZ[b + 1] - (b < nz - 1 ? al : 0);
      let h, style;
      if (zone === 2) { h = R(26, 88); style = [2, 1, 6, 2][Math.floor(rng() * 4)]; }
      else if (zone === 1) { h = R(10, 28); style = [0, 1, 0, 3, 6][Math.floor(rng() * 5)]; }
      else { h = R(5.5, 13); style = [3, 4, 5, 0, 3][Math.floor(rng() * 5)]; }
      if (isStore) h = Math.max(h, 8);
      h = Math.round(h / 3.5) * 3.5 + 0.5;
      const uo = Math.floor(rng() * 4) * 0.25;
      bGeo[style].box(lx0, 0, lz0, lx1, h, lz1, { us: FAC_W, vs: FAC_H, uo, top: false });
      roofG.box(lx0, h, lz0, lx1, h + 0.01, lz1, { sides: false, ts: 6 });
      // parapet
      roofG.box(lx0, h, lz0, lx1, h + 0.6, lz0 + 0.3, { us: 4, vs: 4, top: true }); roofG.box(lx0, h, lz1 - 0.3, lx1, h + 0.6, lz1, { us: 4, vs: 4 });
      roofG.box(lx0, h, lz0, lx0 + 0.3, h + 0.6, lz1, { us: 4, vs: 4 }); roofG.box(lx1 - 0.3, h, lz0, lx1, h + 0.6, lz1, { us: 4, vs: 4 });
      // setback tower
      if (zone === 2 && h > 45 && rng() < 0.7) {
        const sx = (lx1 - lx0) * 0.18, sz = (lz1 - lz0) * 0.18, h2 = h + R(10, 30);
        bGeo[style].box(lx0 + sx, h, lz0 + sz, lx1 - sx, h2, lz1 - sz, { us: FAC_W, vs: FAC_H, uo, top: false });
        roofG.box(lx0 + sx, h2, lz0 + sz, lx1 - sx, h2 + 0.01, lz1 - sz, { sides: false, ts: 6 });
        if (rng() < 0.5) roofG.box((lx0 + lx1) / 2 - 0.2, h2, (lz0 + lz1) / 2 - 0.2, (lx0 + lx1) / 2 + 0.2, h2 + R(6, 14), (lz0 + lz1) / 2 + 0.2, {});
        addBox(lx0, lz0, lx1, lz1, h2);
      } else addBox(lx0, lz0, lx1, lz1, h);
      // rooftop clutter
      for (let k = 0, n = Math.floor(rng() * 3); k < n; k++) {
        const cx = R(lx0 + 2, lx1 - 3), cz = R(lz0 + 2, lz1 - 3);
        roofG.box(cx, h, cz, cx + R(1, 2.5), h + R(0.8, 1.8), cz + R(1, 2.5), {});
      }
    }
  }
  bGeo.forEach((gb, k) => { if (!gb.p.length) return; const m = new THREE.Mesh(gb.build(), MAT.facades[k]); m.castShadow = true; m.receiveShadow = true; scene.add(m); });
  const roofs = new THREE.Mesh(roofG.build(), MAT.roof); roofs.receiveShadow = true; roofs.castShadow = true; scene.add(roofs);

  buildRoadMarkings();
  buildSignals();
  buildStorefronts();
  buildProps(rng);
  buildParks(rng);
  buildPotholes(rng);
  world.mapCanvas = renderMapCanvas();
}

function buildRoadMarkings() {
  const g = new GeoB(true); const Y = 0.012;
  const rect = (axis, c, a0, a1, o0, o1, col) => {
    g.color(col);
    if (axis === 'x') g.flat(Math.min(a0, a1), c + Math.min(o0, o1), Math.max(a0, a1), c + Math.max(o0, o1), Y);
    else g.flat(c + Math.min(o0, o1), Math.min(a0, a1), c + Math.max(o0, o1), Math.max(a0, a1), Y);
  };
  const W = 0xe8e8e0, YL = 0xe8b923;
  for (const axis of ['x', 'z']) for (let l = 0; l <= NB; l++) {
    const c = rp(l);
    for (let k = 0; k < NB; k++) {
      const a0 = rp(k) + RH, a1 = rp(k + 1) - RH;
      rect(axis, c, a0 + 4.5, a1 - 4.5, -0.26, -0.12, YL); rect(axis, c, a0 + 4.5, a1 - 4.5, 0.12, 0.26, YL);
      for (const s of [-1, 1]) {
        for (let a = a0 + 5; a < a1 - 7; a += 9) rect(axis, c, a, a + 3, s * 3.54, s * 3.66, W);
        rect(axis, c, a0 + 4.5, a1 - 4.5, s * 7.15, s * 7.27, W);
      }
      // stop lines
      const sideP = axis === 'x' ? 1 : -1; // lanes side for dir +1
      rect(axis, c, a1 - 4.5, a1 - 4.0, sideP * 0.3, sideP * 7.2, W);
      rect(axis, c, a0 + 4.0, a0 + 4.5, -sideP * 0.3, -sideP * 7.2, W);
      // crosswalks
      for (let o = -8.4; o < 8.4; o += 1.2) { rect(axis, c, a0 + 0.6, a0 + 3.4, o, o + 0.6, W); rect(axis, c, a1 - 3.4, a1 - 0.6, o, o + 0.6, W); }
    }
  }
  const m = new THREE.Mesh(g.build(), MAT.marks); m.receiveShadow = true; scene.add(m);
}

function buildSignals() {
  const poles = [], heads = [];
  const lens = { z: { R: [], Y: [], G: [] }, x: { R: [], Y: [], G: [] } };
  const o = 9.6;
  for (let k = 0; k <= NB; k++) for (let l = 0; l <= NB; l++) {
    const cx = rp(k), cz = rp(l);
    const defs = [
      { axis: 'z', x: cx - o, z: cz - o, fx: 0, fz: -1 }, { axis: 'z', x: cx + o, z: cz + o, fx: 0, fz: 1 },
      { axis: 'x', x: cx - o, z: cz + o, fx: -1, fz: 0 }, { axis: 'x', x: cx + o, z: cz - o, fx: 1, fz: 0 }
    ];
    for (const d of defs) {
      if (Math.abs(d.x) > WALL - 0.5 || Math.abs(d.z) > WALL - 0.5) continue;
      poles.push([new THREE.CylinderGeometry(0.09, 0.11, 4.6, 6), M4(d.x, 2.3 + CURB, d.z)]);
      const yaw = Math.atan2(d.fx, d.fz);
      heads.push([new THREE.BoxGeometry(0.36, 1.08, 0.26), M4(d.x + d.fx * 0.08, 3.92 + CURB, d.z + d.fz * 0.08, yaw)]);
      heads.push([new THREE.BoxGeometry(0.5, 0.06, 0.4), M4(d.x + d.fx * 0.12, 4.5 + CURB, d.z + d.fz * 0.12, yaw)]);
      const ys = { R: 4.26, Y: 3.92, G: 3.58 };
      for (const c of ['R', 'Y', 'G']) lens[d.axis][c].push({ x: d.x + d.fx * 0.22, y: ys[c] + CURB, z: d.z + d.fz * 0.22 });
      addCircle(d.x, d.z, 0.22, 5);
    }
  }
  const pm = new THREE.Mesh(mergeGeos(poles.concat(heads)), MAT.darkMetal); pm.castShadow = true; scene.add(pm);
  const lg = new THREE.SphereGeometry(0.12, 8, 6);
  for (const ax of ['z', 'x']) for (const c of ['R', 'Y', 'G']) {
    const list = lens[ax][c];
    const im = new THREE.InstancedMesh(lg, MAT.signals[ax][c], list.length);
    list.forEach((p, i) => { _m4.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, _m4); });
    im.frustumCulled = false; scene.add(im);
  }
}

function buildStorefronts() {
  const all = STORES.map(s => ({ ...s, kind: 'store' })).concat(Object.entries(PLACES).map(([k, p]) => ({ ...p, id: k, kind: k, color: k === 'hospital' ? '#ff4040' : (k === 'garage' ? '#40c8ff' : '#ffd060'), awn: k === 'hospital' ? 0xeeeeee : (k === 'garage' ? 0x2a4a6a : 0x6a4a2a) })));
  for (const s of all) {
    const f = sideFace(s.i, s.j, s.side);
    const grp = new THREE.Group(); grp.position.set(f.x, CURB, f.z); grp.rotation.y = Math.atan2(f.nx, f.nz); scene.add(grp);
    // local: +z = outward (street), x = along face
    const wide = s.kind === 'garage' ? 10 : 8;
    if (s.kind === 'garage') {
      const door = new THREE.Mesh(new THREE.BoxGeometry(6.5, 4, 0.1), new THREE.MeshLambertMaterial({ color: 0x8a9096 })); door.position.set(0, 2, 0.06); grp.add(door);
      for (let y = 0.4; y < 4; y += 0.5) { const l = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.04, 0.04), MAT.darkMetal); l.position.set(0, y, 0.12); grp.add(l); }
    } else {
      const glass = new THREE.Mesh(new THREE.BoxGeometry(wide - 0.6, 2.8, 0.08), MAT.storeGlass); glass.position.set(0, 1.7, 0.05); grp.add(glass);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.25, 0.2), MAT.darkMetal); frame.position.set(0, 3.15, 0.08); grp.add(frame);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 0.12), new THREE.MeshLambertMaterial({ color: 0x1a2228, emissive: 0x352a12, emissiveIntensity: 0.6 })); door.position.set(0, 1.2, 0.1); grp.add(door);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), new THREE.MeshLambertMaterial({ color: 0xcccccc })); bar.position.set(0, 1.1, 0.2); grp.add(bar);
    }
    const awnMat = new THREE.MeshLambertMaterial({ color: s.awn });
    const awn = new THREE.Mesh(new THREE.BoxGeometry(wide + 0.6, 0.12, 1.8), awnMat); awn.position.set(0, 3.55, 0.9); awn.rotation.x = 0.25; grp.add(awn);
    const st = new THREE.Mesh(new THREE.BoxGeometry(wide + 0.6, 0.35, 0.05), awnMat); st.position.set(0, 3.26, 1.76); grp.add(st);
    const tex = signTexture(s.name, s.color);
    const sm = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.4 }); MAT.signs.push(sm);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(wide, 1.3, 0.15), [MAT.darkMetal, MAT.darkMetal, MAT.darkMetal, MAT.darkMetal, sm, MAT.darkMetal]);
    sign.position.set(0, 4.55, 0.1); grp.add(sign);
    if (s.kind === 'hospital') { const cross = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.2), new THREE.MeshBasicMaterial({ color: 0xff2222 })), c2 = cross.clone(); c2.rotation.z = Math.PI / 2; cross.position.set(wide / 2 + 0.8, 4.5, 0.2); c2.position.copy(cross.position); grp.add(cross, c2); }
  }
}

function makeLampGeo() {
  return mergeGeos([
    [new THREE.CylinderGeometry(0.08, 0.12, 6.5, 6), M4(0, 3.25, 0)],
    [new THREE.BoxGeometry(0.08, 0.08, 1.8), M4(0, 6.4, 0.85)],
    [new THREE.BoxGeometry(0.34, 0.16, 0.6), M4(0, 6.38, 1.7)]
  ]);
}
function buildProps(rng) {
  const lamps = [], palms = [], hydrants = [], trash = [];
  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) {
    const b = blockRect(i, j);
    const sides = [
      { ax: 'x', fixed: b.z0 + 0.7, a0: b.x0, a1: b.x1, yaw: Math.PI }, { ax: 'x', fixed: b.z1 - 0.7, a0: b.x0, a1: b.x1, yaw: 0 },
      { ax: 'z', fixed: b.x0 + 0.7, a0: b.z0, a1: b.z1, yaw: -Math.PI / 2 }, { ax: 'z', fixed: b.x1 - 0.7, a0: b.z0, a1: b.z1, yaw: Math.PI / 2 }
    ];
    for (const s of sides) {
      for (const f of [0.3, 0.7]) {
        const a = lerp(s.a0, s.a1, f), x = s.ax === 'x' ? a : s.fixed, z = s.ax === 'x' ? s.fixed : a;
        lamps.push({ x, z, yaw: s.yaw });
      }
      const boulevard = (s.ax === 'z' && (i === 3 || i === 4) && (Math.abs(s.fixed - rp(4)) < 15)) || (s.ax === 'x' && (j === 3 || j === 4) && Math.abs(s.fixed - rp(4)) < 15);
      const beach = (s.ax === 'z' && Math.abs(s.fixed - rp(0)) < 15) || (s.ax === 'x' && Math.abs(s.fixed - rp(8)) < 15);
      if (boulevard || beach) for (let a = s.a0 + 9; a < s.a1 - 8; a += 11) { const x = s.ax === 'x' ? a : s.fixed, z = s.ax === 'x' ? s.fixed : a; if (Math.abs(a - lerp(s.a0, s.a1, 0.5)) < 4) continue; palms.push({ x, z, yaw: rng() * TAU, s: 0.85 + rng() * 0.4 }); }
      if (rng() < 0.35) { const a = lerp(s.a0, s.a1, rng() < 0.5 ? 0.12 : 0.88), x = s.ax === 'x' ? a : s.fixed, z = s.ax === 'x' ? s.fixed : a; hydrants.push({ x, z, yaw: 0 }); }
      if (rng() < 0.4) { const a = lerp(s.a0, s.a1, rng() * 0.6 + 0.2), x = s.ax === 'x' ? a : s.fixed, z = s.ax === 'x' ? s.fixed : a; trash.push({ x, z, yaw: rng() * 3 }); }
    }
  }
  // lamps
  const lampMesh = new THREE.InstancedMesh(makeLampGeo(), MAT.metal, lamps.length); lampMesh.castShadow = true; lampMesh.frustumCulled = false;
  const headMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.06, 0.5), MAT.lampHead, lamps.length); headMesh.frustumCulled = false;
  const glowMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(4.5, 16).rotateX(-Math.PI / 2), MAT.lampGlow, lamps.length); glowMesh.frustumCulled = false; glowMesh.renderOrder = 1;
  lamps.forEach((p, k) => {
    const base = new THREE.Matrix4().compose(new V3(p.x, CURB, p.z), new THREE.Quaternion().setFromAxisAngle(UP, p.yaw), new V3(1, 1, 1));
    lampMesh.setMatrixAt(k, base);
    const hm = base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 6.27, 1.7)); headMesh.setMatrixAt(k, hm);
    const gp = new V3(0, 0, 1.9).applyMatrix4(base); _m4.makeTranslation(gp.x, 0.03, gp.z); glowMesh.setMatrixAt(k, _m4);
    const prop = { kind: 'lamp', x: p.x, z: p.z, yaw: p.yaw, base, parts: [{ m: lampMesh, i: k, local: new THREE.Matrix4() }, { m: headMesh, i: k, local: new THREE.Matrix4().makeTranslation(0, 6.27, 1.7) }], glow: { m: glowMesh, i: k }, state: 0, t: 0 };
    prop.col = addCircle(p.x, p.z, 0.18, 7, { prop });
    world.props.push(prop);
  });
  scene.add(lampMesh, headMesh, glowMesh); world.lampGlow = glowMesh;
  // palms
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 9, 6, 4); { const p = trunkGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 4.5; p.setX(i, p.getX(i) + Math.pow(y / 9, 2) * 0.9); p.setY(i, y); } trunkGeo.computeVertexNormals(); }
  const frondList = [];
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; const fg = new THREE.PlaneGeometry(0.9, 3.4, 1, 3); { const p = fg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 1.7; p.setZ(i, -Math.pow(y / 3.4, 2) * 1.4); p.setY(i, y); } } frondList.push([fg, M4(0.9, 9, 0, a, 1.15, 0)]); }
  const frondGeo = mergeGeos(frondList);
  const pt = new THREE.InstancedMesh(trunkGeo, MAT.palmTrunk, Math.max(1, palms.length)), pf = new THREE.InstancedMesh(frondGeo, MAT.palmLeaf, Math.max(1, palms.length));
  palms.forEach((p, k) => { _m4.compose(_v1.set(p.x, CURB, p.z), _q1.setFromAxisAngle(UP, p.yaw), _v2.set(p.s, p.s, p.s)); pt.setMatrixAt(k, _m4); pf.setMatrixAt(k, _m4); addCircle(p.x, p.z, 0.3, 9); });
  pt.count = pf.count = palms.length; pt.castShadow = pf.castShadow = true; pt.frustumCulled = pf.frustumCulled = false; scene.add(pt, pf);
  // hydrants
  const hydGeo = mergeGeos([[new THREE.CylinderGeometry(0.16, 0.2, 0.7, 8), M4(0, 0.35, 0)], [new THREE.SphereGeometry(0.17, 8, 6), M4(0, 0.7, 0)], [new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6), M4(0, 0.45, 0, 0, 0, Math.PI / 2)]]);
  makePropSet(hydGeo, MAT.red, hydrants, 'hydrant', 0.22);
  const trashGeo = mergeGeos([[new THREE.CylinderGeometry(0.3, 0.26, 0.95, 10), M4(0, 0.48, 0)], [new THREE.CylinderGeometry(0.33, 0.33, 0.06, 10), M4(0, 0.97, 0)]]);
  makePropSet(trashGeo, new THREE.MeshLambertMaterial({ color: 0x2f5a3a }), trash, 'trash', 0.32);
}
function makePropSet(geo, mat, list, kind, r) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length); im.castShadow = true; im.frustumCulled = false;
  list.forEach((p, k) => {
    const base = new THREE.Matrix4().compose(new V3(p.x, CURB, p.z), new THREE.Quaternion().setFromAxisAngle(UP, p.yaw || 0), new V3(1, 1, 1));
    im.setMatrixAt(k, base);
    const prop = { kind, x: p.x, z: p.z, yaw: p.yaw || 0, base, parts: [{ m: im, i: k, local: new THREE.Matrix4() }], geo, mat, state: 0, t: 0 };
    prop.col = addCircle(p.x, p.z, r, 1.2, { prop });
    world.props.push(prop);
  });
  scene.add(im); return im;
}
const _zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
function hitProp(prop, vx, vz, speed) {
  if (prop.state !== 0) return;
  if (speed < 3) return;
  prop.state = 1; prop.col.dead = true; prop.t = 0;
  const l = Math.hypot(vx, vz) || 1; prop.dir = { x: vx / l, z: vz / l };
  if (prop.kind === 'lamp') {
    prop.axis = new V3(prop.dir.z, 0, -prop.dir.x).normalize();
    if (prop.glow) { prop.glow.m.setMatrixAt(prop.glow.i, _zeroM); prop.glow.m.instanceMatrix.needsUpdate = true; }
    Sound.crash(0.5, distToCam(prop.x, prop.z)); fxSparks(new V3(prop.x, 1, prop.z), 14);
  } else {
    for (const p of prop.parts) { p.m.setMatrixAt(p.i, _zeroM); p.m.instanceMatrix.needsUpdate = true; }
    const m = new THREE.Mesh(prop.geo, prop.mat); m.castShadow = true;
    spawnDebris(m, new V3(prop.x, CURB, prop.z), new V3(vx * 0.8 + rand(-1, 1), rand(2, 5) + speed * 0.15, vz * 0.8 + rand(-1, 1)), 0.3, 25);
    Sound.thud(0.5, distToCam(prop.x, prop.z));
    if (prop.kind === 'hydrant') world.emitters.push({ kind: 'water', x: prop.x, z: prop.z, t: 16 });
  }
}
function updateProps(dt) {
  for (const p of world.props) {
    if (p.state !== 1 || p.kind !== 'lamp') continue;
    p.t += dt; const ang = Math.min(Math.PI / 2 - 0.05, p.t * p.t * 2.6);
    _q1.setFromAxisAngle(p.axis, ang);
    const m = new THREE.Matrix4().compose(new V3(p.x, CURB, p.z), _q1, new V3(1, 1, 1)).multiply(new THREE.Matrix4().makeRotationY(p.yaw));
    for (const part of p.parts) { _m4.multiplyMatrices(m, part.local); part.m.setMatrixAt(part.i, _m4); part.m.instanceMatrix.needsUpdate = true; }
    if (ang >= Math.PI / 2 - 0.06) { p.state = 2; Sound.thud(0.6, distToCam(p.x, p.z)); fxDust(new V3(p.x + p.dir.x * 5, 0.3, p.z + p.dir.z * 5), 10); }
  }
  for (let i = world.emitters.length - 1; i >= 0; i--) {
    const e = world.emitters[i]; e.t -= dt; if (e.t <= 0) { world.emitters.splice(i, 1); continue; }
    if (distToCam(e.x, e.z) < 90) for (let k = 0; k < 4; k++) FX.bits.spawn(e.x + rand(-0.1, 0.1), CURB + 0.6, e.z + rand(-0.1, 0.1), rand(-0.8, 0.8), rand(7, 10) * Math.min(1, e.t / 3), rand(-0.8, 0.8), rand(0.08, 0.16), rand(0.8, 1.4), 0.75, 0.85, 1, 0.75, 0.2, 0.1, 9.8);
  }
}

function buildParks(rng) {
  const trees = [], benches = [];
  const fountainMat = new THREE.MeshLambertMaterial({ color: 0xb0aa9a });
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x3f7fb0, emissive: 0x0a2030, transparent: true, opacity: 0.85 });
  const pathG = new GeoB();
  for (const key of PARKS) {
    const [i, j] = key.split(',').map(Number); const b = blockRect(i, j);
    const x0 = b.x0 + SW, x1 = b.x1 - SW, z0 = b.z0 + SW, z1 = b.z1 - SW, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    pathG.flat(cx - 1.8, z0, cx + 1.8, z1, CURB + 0.02, 2); pathG.flat(x0, cz - 1.8, x1, cz + 1.8, CURB + 0.02, 2);
    const plaza = key === '4,4';
    if (plaza) pathG.flat(cx - 14, cz - 14, cx + 14, cz + 14, CURB + 0.025, 2);
    else {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.7, 20), fountainMat); base.position.set(cx, CURB + 0.35, cz); scene.add(base);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.1, 20), waterMat); water.position.set(cx, CURB + 0.66, cz); scene.add(water);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.2, 10), fountainMat); col.position.set(cx, CURB + 1.4, cz); scene.add(col);
      addCircle(cx, cz, 3.6, 0.8);
      world.emitters.push({ kind: 'water', x: cx, z: cz, t: 1e9, fountain: true });
    }
    for (let k = 0; k < 26; k++) {
      const x = x0 + 2 + rng() * (x1 - x0 - 4), z = z0 + 2 + rng() * (z1 - z0 - 4);
      if (Math.abs(x - cx) < 3.5 || Math.abs(z - cz) < 3.5) continue;
      if (plaza && Math.abs(x - cx) < 16 && Math.abs(z - cz) < 16) continue;
      if (Math.hypot(x - cx, z - cz) < 6) continue;
      trees.push({ x, z, yaw: rng() * TAU, s: 0.8 + rng() * 0.6 });
    }
    for (const [bx, bz, yaw] of [[cx + 2.6, z0 + 10, -Math.PI / 2], [cx - 2.6, z1 - 10, Math.PI / 2], [x0 + 10, cz + 2.6, Math.PI], [x1 - 10, cz - 2.6, 0], [cx + 2.6, z1 - 18, -Math.PI / 2], [cx - 2.6, z0 + 18, Math.PI / 2]]) benches.push({ x: bx, z: bz, yaw });
  }
  const pm = new THREE.Mesh(pathG.build(), MAT.sidewalk); pm.receiveShadow = true; scene.add(pm);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 3.2, 6).translate(0, 1.6, 0), MAT.trunk, trees.length);
  const fol = new THREE.InstancedMesh(mergeGeos([[new THREE.DodecahedronGeometry(2.2, 0), M4(0, 4.2, 0)], [new THREE.DodecahedronGeometry(1.6, 0), M4(0.9, 5.4, 0.4)], [new THREE.DodecahedronGeometry(1.5, 0), M4(-0.8, 5.0, -0.6)]]), new THREE.MeshLambertMaterial({ color: 0x3f7a30, flatShading: true }), trees.length);
  trees.forEach((t, k) => { _m4.compose(_v1.set(t.x, CURB, t.z), _q1.setFromAxisAngle(UP, t.yaw), _v2.set(t.s, t.s, t.s)); trunk.setMatrixAt(k, _m4); fol.setMatrixAt(k, _m4); addCircle(t.x, t.z, 0.35 * t.s, 8); });
  trunk.castShadow = fol.castShadow = true; trunk.frustumCulled = fol.frustumCulled = false; scene.add(trunk, fol);
  const benchGeo = mergeGeos([[new THREE.BoxGeometry(1.8, 0.07, 0.5), M4(0, 0.45, 0)], [new THREE.BoxGeometry(1.8, 0.45, 0.07), M4(0, 0.72, -0.24, 0, -0.15)], [new THREE.BoxGeometry(0.08, 0.45, 0.45), M4(-0.8, 0.22, 0)], [new THREE.BoxGeometry(0.08, 0.45, 0.45), M4(0.8, 0.22, 0)]]);
  makePropSet(benchGeo, MAT.wood, benches, 'bench', 0.55);
  world.benches = benches;
}

function buildPotholes(rng) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x18181a, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const rim = new THREE.MeshLambertMaterial({ color: 0x55534e, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (let n = 0; n < 16; n++) {
    const axis = rng() < 0.5 ? 'x' : 'z', l = 1 + Math.floor(rng() * (NB - 1)), k = Math.floor(rng() * NB);
    const along = lerp(rp(k) + RH + 16, rp(k + 1) - RH - 16, rng());
    const dir = rng() < 0.5 ? 1 : -1, lane = rng() < 0.5 ? 0 : 1;
    const fixed = laneFixed(axis, l, dir, lane) + rand(-0.6, 0.6);
    const x = axis === 'x' ? along : fixed, z = axis === 'x' ? fixed : along, r = 0.55 + rng() * 0.35;
    const g = new THREE.CircleGeometry(r, 10); const p = g.attributes.position; for (let i = 1; i < p.count; i++) { const s = 0.75 + rng() * 0.4; p.setX(i, p.getX(i) * s); p.setY(i, p.getY(i) * s); }
    const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.014, z); scene.add(m);
    const rm = new THREE.Mesh(new THREE.RingGeometry(r * 0.95, r * 1.25, 10), rim); rm.rotation.x = -Math.PI / 2; rm.position.set(x, 0.013, z); scene.add(rm);
    world.potholes.push({ x, z, r });
  }
}

// ---------------------------------------------------------------- map image (minimap / big map)
const MAP_E = 340, MAP_S = 1024 / (MAP_E * 2);
function mapXY(x, z) { return [(MAP_E - x) * MAP_S, (MAP_E - z) * MAP_S]; }
function renderMapCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = '#26302a'; g.fillRect(0, 0, 1024, 1024);
  const [wx0, wz0] = mapXY(WALL, WALL), [wx1, wz1] = mapXY(-WALL, -WALL);
  g.fillStyle = '#6e737a'; g.fillRect(wx0, wz0, wx1 - wx0, wz1 - wz0);
  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) {
    const b = blockRect(i, j), key = i + ',' + j;
    const [ax, az] = mapXY(b.x1, b.z1), [bx, bz] = mapXY(b.x0, b.z0);
    g.fillStyle = PARKS.has(key) ? '#3f7a3c' : (LOTS.has(key) ? '#4a4f55' : '#30353b');
    g.fillRect(ax, az, bx - ax, bz - az);
    if (!PARKS.has(key) && !LOTS.has(key)) { g.fillStyle = '#262a30'; g.fillRect(ax + 6, az + 6, bx - ax - 12, bz - az - 12); }
  }
  return c;
}

// ---------------------------------------------------------------- sky, lights, day/night, weather
const env = {
  time: 10, dayLen: 960, weather: 'clear', cur: { rain: 0, fog: 0, cloud: 0.15, storm: 0 }, wet: 0, nextChange: 200,
  lightning: 0, lightT: 8, night: 0, day: 1, sunDir: new V3(0, 1, 0)
};
const WEATHERS = { clear: { rain: 0, fog: 0, cloud: 0.12, storm: 0 }, cloudy: { rain: 0, fog: 0.12, cloud: 0.8, storm: 0 }, rain: { rain: 0.7, fog: 0.3, cloud: 0.92, storm: 0 }, storm: { rain: 1, fog: 0.4, cloud: 1, storm: 1 }, fog: { rain: 0, fog: 1, cloud: 0.6, storm: 0 } };
const WEATHER_W = [['clear', 0.4], ['cloudy', 0.22], ['rain', 0.16], ['storm', 0.1], ['fog', 0.12]];
let sky, stars, sun, hemi, ambient, rainMesh, cloudMesh;
function buildSky() {
  sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 24, 12), new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new V3() }, sunCol: { value: new THREE.Color(1, 0.9, 0.7) }, sunVis: { value: 1 }, moonDir: { value: new V3() }, moonVis: { value: 0 } },
    vertexShader: 'varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 top;uniform vec3 hor;uniform vec3 sunDir;uniform vec3 sunCol;uniform float sunVis;uniform vec3 moonDir;uniform float moonVis;varying vec3 vD;void main(){vec3 d=normalize(vD);float h=max(d.y,0.0);vec3 c=mix(hor,top,pow(h,0.6));if(d.y<0.0)c=hor*0.9;float s=max(dot(d,sunDir),0.0);c+=sunCol*(pow(s,700.0)*4.0+pow(s,10.0)*0.3)*sunVis;float m=dot(d,moonDir);c+=vec3(0.85,0.9,1.0)*smoothstep(0.99935,0.99965,m)*moonVis;gl_FragColor=vec4(c,1.0);}',
    side: THREE.BackSide, depthWrite: false, fog: false
  }));
  sky.renderOrder = -10; scene.add(sky);
  const sp = []; for (let i = 0; i < 1400; i++) { const v = new V3(rand(-1, 1), rand(0.05, 1), rand(-1, 1)).normalize().multiplyScalar(1000); sp.push(v.x, v.y, v.z); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.renderOrder = -9; scene.add(stars);
  const ct = canvasTex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(30, 90); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.restore(); } }
  });
  ct.repeat.set(3, 3);
  cloudMesh = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.4, depthWrite: false, fog: false }));
  cloudMesh.rotation.x = Math.PI / 2; cloudMesh.position.y = 260; cloudMesh.renderOrder = -8; scene.add(cloudMesh);

  hemi = new THREE.HemisphereLight(0xbfdcff, 0x4a4035, 0.6); scene.add(hemi);
  ambient = new THREE.AmbientLight(0xffffff, 0.06); scene.add(ambient);
  sun = new THREE.DirectionalLight(0xfff0dd, 0.9); sun.castShadow = true;
  const hi = settings.quality === 'high';
  sun.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024);
  const sc = sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 500;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.04;
  scene.add(sun); scene.add(sun.target);
  scene.fog = new THREE.FogExp2(0xcfe6ff, 0.0025);
  // rain
  const N = settings.quality === 'high' ? 2400 : 1200;
  const rp_ = new Float32Array(N * 6); const off = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { off[i * 3] = rand(-35, 35); off[i * 3 + 1] = rand(-6, 26); off[i * 3 + 2] = rand(-35, 35); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp_, 3));
  rainMesh = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.45, depthWrite: false }));
  rainMesh.frustumCulled = false; rainMesh.userData = { off, N }; scene.add(rainMesh);
}
const C = (h) => new THREE.Color(h);
const SKYC = { dayTop: C(0x3d7fd6), dayHor: C(0xcfe4f8), duskTop: C(0x2a3a72), duskHor: C(0xff9358), nightTop: C(0x03050e), nightHor: C(0x0e1628), ovDay: C(0x8b9198), ovNight: C(0x0d0e12) };
const _ct = new THREE.Color(), _ch = new THREE.Color();
function pickWeather() { let r = Math.random(); for (const [w, p] of WEATHER_W) { r -= p; if (r <= 0) return w; } return 'clear'; }
function setWeather(w, instant) { env.weather = w; if (instant) Object.assign(env.cur, WEATHERS[w]); }
function updateEnv(dt, focus) {
  env.time = (env.time + dt * 24 / env.dayLen) % 24;
  env.nextChange -= dt;
  if (env.nextChange <= 0) { env.nextChange = rand(150, 300); const w = pickWeather(); if (w !== env.weather) { env.weather = w; UI.toast('Weather: ' + w.toUpperCase(), 2.2); } }
  const tgt = WEATHERS[env.weather];
  for (const k in env.cur) env.cur[k] = lerp(env.cur[k], tgt[k], Math.min(1, dt / 18));
  const cw = env.cur;
  env.wet = lerp(env.wet, cw.rain > 0.15 ? 1 : 0, Math.min(1, dt / (cw.rain > 0.15 ? 25 : 60)));
  const a = (env.time - 6) / 24 * TAU, elev = Math.sin(a);
  env.sunDir.set(Math.cos(a) * 0.8, elev, 0.45).normalize();
  env.day = smooth(-0.06, 0.25, elev); env.night = 1 - smooth(-0.2, 0.04, elev);
  const dusk = clamp(1 - Math.abs(elev) * 4.5, 0, 1) * (1 - cw.cloud * 0.7);
  _ct.copy(SKYC.nightTop).lerp(SKYC.dayTop, env.day).lerp(SKYC.duskTop, dusk * 0.6);
  _ch.copy(SKYC.nightHor).lerp(SKYC.dayHor, env.day).lerp(SKYC.duskHor, dusk * 0.85);
  const ov = _col.copy(SKYC.ovNight).lerp(SKYC.ovDay, env.day);
  _ct.lerp(ov, cw.cloud * 0.8); _ch.lerp(ov, cw.cloud * 0.7);
  if (cw.fog > 0.05) _ch.lerp(_col.setRGB(0.62, 0.65, 0.68).multiplyScalar(0.15 + env.day * 0.85), cw.fog * 0.6);
  // lightning
  if (cw.storm > 0.5) { env.lightT -= dt; if (env.lightT <= 0) { env.lightT = rand(5, 15); env.lightning = 1; Sound.thunder(); } }
  env.lightning = Math.max(0, env.lightning - dt * 4);
  const fl = env.lightning > 0 ? (Math.random() < 0.6 ? env.lightning : env.lightning * 0.3) : 0;
  _ct.lerp(_col.setRGB(0.8, 0.85, 1), fl * 0.7); _ch.lerp(_col.setRGB(0.85, 0.88, 1), fl * 0.7);
  const u = sky.material.uniforms; u.top.value.copy(_ct); u.hor.value.copy(_ch); u.sunDir.value.copy(env.sunDir);
  u.sunVis.value = smooth(-0.1, 0.05, elev) * (1 - cw.cloud * 0.9); u.moonDir.value.copy(env.sunDir).negate(); u.moonVis.value = env.night * (1 - cw.cloud);
  u.sunCol.value.setRGB(1, 0.85 - dusk * 0.3, 0.6 - dusk * 0.4);
  scene.fog.color.copy(_ch);
  scene.fog.density = 0.0021 + cw.fog * 0.013 + cw.rain * 0.003 + (settings.quality === 'low' ? 0.0008 : 0);
  stars.material.opacity = env.night * (1 - cw.cloud) * 0.9;
  cloudMesh.material.opacity = 0.12 + cw.cloud * 0.6; cloudMesh.material.color.copy(_ch).lerp(_col.setRGB(1, 1, 1), 0.3 * env.day);
  cloudMesh.material.map.offset.x += dt * 0.002; cloudMesh.material.map.offset.y += dt * 0.0007;
  // lights
  const sunUp = elev > -0.02;
  const ld = sunUp ? env.sunDir : _v5.copy(env.sunDir).negate();
  sun.intensity = sunUp ? (0.25 + env.day * 0.75) * (1 - cw.cloud * 0.55) : 0.16 * (1 - cw.cloud * 0.6);
  sun.color.setRGB(1, sunUp ? 0.92 - dusk * 0.3 : 0.75, sunUp ? 0.82 - dusk * 0.45 : 1).lerp(_col.setRGB(0.7, 0.8, 1), sunUp ? 0 : 1);
  const f = focus || camera.position;
  const sx = Math.round(f.x / 2) * 2, sz = Math.round(f.z / 2) * 2;
  sun.position.set(sx + ld.x * 200, Math.max(10, ld.y * 200), sz + ld.z * 200); sun.target.position.set(sx, 0, sz); sun.target.updateMatrixWorld();
  hemi.intensity = 0.28 + env.day * 0.42 + fl * 1.5;
  hemi.color.copy(_ch).lerp(_col.setRGB(1, 1, 1), 0.35); hemi.groundColor.setRGB(0.3, 0.27, 0.22).multiplyScalar(0.3 + env.day * 0.7);
  ambient.intensity = 0.06 + env.night * 0.1;
  // world materials
  const n = env.night;
  for (const m of MAT.facades) m.emissiveIntensity = n * 1.05;
  for (const m of MAT.signs) m.emissiveIntensity = 0.35 + n * 0.9;
  MAT.storeGlass.emissiveIntensity = 0.15 + n * 0.85;
  const lampOn = smooth(0.25, 0.6, n + cw.cloud * 0.25 + cw.fog * 0.2);
  MAT.lampHead.color.setRGB(0.35 + lampOn * 0.65, 0.35 + lampOn * 0.5, 0.35 + lampOn * 0.15);
  MAT.lampGlow.opacity = lampOn * 0.32;
  const wetK = 1 - env.wet * 0.42; MAT.asphalt.color.setRGB(wetK, wetK, wetK * 1.02); MAT.sidewalk.color.setRGB(1 - env.wet * 0.25, 1 - env.wet * 0.25, 1 - env.wet * 0.22);
  world.hillMat.color.setRGB(0.37, 0.42, 0.29).multiplyScalar(0.25 + env.day * 0.75);
  // sky follows camera
  sky.position.copy(camera.position); stars.position.copy(camera.position); cloudMesh.position.x = camera.position.x; cloudMesh.position.z = camera.position.z;
  // rain
  const rd = rainMesh.userData, cnt = Math.floor(rd.N * cw.rain);
  rainMesh.visible = cnt > 10; rainMesh.geometry.setDrawRange(0, cnt * 2);
  if (rainMesh.visible) {
    const pos = rainMesh.geometry.attributes.position.array, off = rd.off, cp = camera.position;
    const wind = 2 + cw.storm * 5;
    for (let i = 0; i < cnt; i++) {
      off[i * 3 + 1] -= 26 * dt; off[i * 3] += wind * dt * 0.3;
      if (off[i * 3 + 1] < -6) { off[i * 3 + 1] += 32; off[i * 3] = rand(-35, 35); off[i * 3 + 2] = rand(-35, 35); }
      const x = cp.x + off[i * 3], y = cp.y + off[i * 3 + 1], z = cp.z + off[i * 3 + 2];
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z; pos[i * 6 + 3] = x - wind * 0.03; pos[i * 6 + 4] = y + 0.7; pos[i * 6 + 5] = z;
    }
    rainMesh.geometry.attributes.position.needsUpdate = true;
    rainMesh.material.opacity = 0.25 + 0.3 * (1 - env.night * 0.5);
    for (let k = 0; k < cw.rain * 8; k++) { const x = cp.x + rand(-18, 18), z = cp.z + rand(-18, 18); FX.bits.spawn(x, groundH(x, z) + 0.05, z, 0, rand(0.8, 1.6), 0, 0.05, 0.18, 0.7, 0.78, 0.85, 0.5, 0.2, 0, 9.8); }
  }
  if (Sound.ctx) { Sound.setGain(Sound.rain.g, cw.rain * 0.22, 0.5); Sound.setGain(Sound.wind.g, 0.01 + cw.storm * 0.08 + cw.fog * 0.02, 0.8); }
}
function gripMult() { return 1 - env.wet * 0.22; }
function distToCam(x, z) { return Math.hypot(camera.position.x - x, camera.position.z - z); }
