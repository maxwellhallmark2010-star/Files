/* ============================================================================
   AUTUMN TRAIL — a procedural first-person autumn biome with a red bicycle.
   Everything (terrain, trees, sky, bike, sounds) is generated in code.
   ========================================================================== */
(function () {
'use strict';
const THREE = window.THREE;
const V3 = THREE.Vector3;
const FT = 3.28084, MPH = 2.23694, G = 9.81;
const DROP = 30.48;                       // 100 feet, in metres
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/* ---------------------------------------------------------------- RNG/noise */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(20261102);
const perm = new Uint8Array(512);
{ const p = []; for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const GR = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1], ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
  const d = (h, dx, dy) => { const g = GR[h & 7]; return g[0] * dx + g[1] * dy; };
  const x1 = lerp(d(aa, xf, yf), d(ba, xf - 1, yf), u), x2 = lerp(d(ab, xf, yf - 1), d(bb, xf - 1, yf - 1), u);
  return lerp(x1, x2, v) * 1.4;
}
function fbm(x, y, o) { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < o; i++) { s += noise2(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.03; } return s / n; }
function ridged(x, y, o) { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < o; i++) { let v = 1 - Math.min(1, Math.abs(noise2(x * f, y * f))); v *= v; s += v * a; n += a; a *= 0.5; f *= 2.1; } return s / n; }

/* ----------------------------------------------------------------- the world */
const EDGE_Z = -640;                      // nominal z where the range plunges
function trailX(z) { return 26 * Math.sin(z * 0.011) + 12 * (Math.sin(z * 0.029 + 1) - Math.sin(1)); }
function trailHeading(z) { const d = (trailX(z + 1) - trailX(z - 1)) / 2; return Math.atan2(d, 1); }
function trailH(z) {
  const zc = Math.max(z, EDGE_Z);
  return 2.4 * Math.sin(zc * 0.024) + 2 * Math.sin(zc * 0.0105 + 2) + 0.5 * Math.sin(zc * 0.19) + Math.max(0, -zc - 90) * 0.034;
}
function edgeZ(x) { return EDGE_Z + 14 * noise2(x * 0.02, 5.5) + 4 * noise2(x * 0.11, 2.2); }
const ZE = edgeZ(trailX(EDGE_Z));         // where the trail runs out of ground

function terrainH(x, z) {
  const d = Math.abs(x - trailX(z));
  const th = trailH(z);
  const d0 = 3.4 + 11 * smooth(ZE + 80, ZE + 8, z);       // trail corridor, widening into a lookout
  let w = smooth(d0, d0 + 30, d);
  w = Math.max(w, smooth(ZE + 20, ZE - 40, z));
  const mf = smooth(-70, -470, z);                         // mountains build toward the end
  const hills = fbm(x * 0.011 + 10, z * 0.011, 4) * 10 + noise2(x * 0.05, z * 0.05) * 0.9 + noise2(x * 0.2, z * 0.2) * 0.12;
  const valley = Math.pow(Math.min(d / 280, 1.8), 1.6);
  let off = hills * (1 - 0.4 * mf) + valley * (12 + 45 * mf);
  if (mf > 0) off += mf * ridged(x * 0.0045 + 3.3, z * 0.0045 - 7.1, 5) * 70 * smooth(20, 200, d);
  const far = smooth(EDGE_Z - 60, EDGE_Z - 520, z);        // the peaks across the chasm
  if (far > 0) off += far * (ridged(x * 0.0035 - 5, z * 0.0035 + 2, 5) * 140 + 35);
  let h = th + w * off;
  const t = clamp((edgeZ(x) - z) / 2.5, 0, 1);             // the plunge: exactly 100 ft
  h -= DROP * t * t * (3 - 2 * t);
  return h;
}

/* --------------------------------------------------------------- the terrain */
const TS = 2.5, XMIN = -420, ZMAX = 110, NX = 337, NZ = 517;
const HM = new Float32Array(NX * NZ);
function groundH(x, z) {
  let fx = (x - XMIN) / TS, fj = (ZMAX - z) / TS;
  fx = clamp(fx, 0, NX - 1.001); fj = clamp(fj, 0, NZ - 1.001);
  const i = fx | 0, j = fj | 0, u = fx - i, v = fj - j, k = j * NX + i;
  const a = HM[k], b = HM[k + 1], c = HM[k + NX], d = HM[k + NX + 1];
  return (u + v <= 1) ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
}
function isTrail(x, z) { return z > ZE + 1 && Math.abs(x - trailX(z)) < 2.0; }

/* ------------------------------------------------------------------ renderer */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const FOG = new THREE.Color(0xe8b98a);
scene.fog = new THREE.FogExp2(FOG, 0.0021);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.06, 3200);
scene.add(camera);

const SUN_DIR = new V3(-0.62, 0.46, -0.64).normalize();
const sun = new THREE.DirectionalLight(0xffd7a0, 1.75);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
{ const c = sun.shadow.camera; c.left = -62; c.right = 62; c.top = 62; c.bottom = -62; c.near = 1; c.far = 360; }
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.35;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xffe2b8, 0x8a5a36, 0.95));

/* sky dome */
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uSun: { value: SUN_DIR }, uTime: { value: 0 } },
  vertexShader: 'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position.z=gl_Position.w;}',
  fragmentShader: `uniform vec3 uSun;uniform float uTime;varying vec3 vDir;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*noise(p);p*=2.02;a*=.5;}return s;}
  void main(){
    vec3 d=normalize(vDir); float h=clamp(d.y,0.,1.);
    vec3 zen=vec3(0.30,0.52,0.82),mid=vec3(0.62,0.76,0.90),hor=vec3(0.95,0.76,0.56);
    vec3 col=mix(hor,mid,smoothstep(0.0,0.22,h)); col=mix(col,zen,smoothstep(0.2,0.85,h));
    if(d.y<0.) col=mix(hor,vec3(0.72,0.55,0.42),smoothstep(0.,0.3,-d.y));
    float sd=max(dot(d,uSun),0.);
    col+=vec3(1.0,0.78,0.5)*pow(sd,6.)*0.30+vec3(1.,0.85,0.6)*pow(sd,48.)*0.6+vec3(1.,.95,.85)*smoothstep(0.9993,0.9997,sd)*3.;
    if(d.y>0.02){
      vec2 uv=d.xz/(d.y+0.2)*1.3+vec2(uTime*0.006,uTime*0.002);
      float c=smoothstep(0.46,0.80,fbm(uv*1.4));
      float fade=smoothstep(0.02,0.25,d.y);
      vec3 cc=mix(vec3(1.,0.82,0.66),vec3(1.),smoothstep(0.,0.8,h));
      cc=mix(cc,vec3(1.,0.7,0.45),pow(sd,5.)*0.7);
      col=mix(col,cc,c*fade*0.85);
    }
    gl_FragColor=vec4(col,1.);
  }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
sky.frustumCulled = false; sky.renderOrder = -10;
scene.add(sky);

/* ------------------------------------------------------- ground texture/mesh */
function makeGroundTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); const r = mulberry32(77);
  g.fillStyle = '#d9d0c0'; g.fillRect(0, 0, S, S);
  const wrapDraw = (x, y, fn) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { if (x + dx < -14 || x + dx > S + 14 || y + dy < -14 || y + dy > S + 14) continue; g.save(); g.translate(x + dx, y + dy); fn(); g.restore(); } };
  for (let i = 0; i < 9000; i++) {
    const x = r() * S, y = r() * S, w = 3 + r() * 9, h = 1.5 + r() * 4, a = r() * 6.283;
    const hue = 14 + r() * 38, sat = 22 + r() * 34, lit = 48 + r() * 34;
    wrapDraw(x, y, () => { g.rotate(a); g.fillStyle = `hsl(${hue},${sat}%,${lit}%)`; g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, 6.283); g.fill();
      if (w > 7) { g.strokeStyle = `hsla(${hue},${sat}%,${lit - 22}%,.5)`; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-w, 0); g.lineTo(w, 0); g.stroke(); } });
  }
  for (let i = 0; i < 2500; i++) { // little dark gaps/twigs
    const x = r() * S, y = r() * S;
    wrapDraw(x, y, () => { g.rotate(r() * 6.283); g.strokeStyle = `rgba(70,45,28,${0.25 + r() * 0.3})`; g.lineWidth = 0.8 + r(); g.beginPath(); g.moveTo(0, 0); g.lineTo(3 + r() * 9, (r() - 0.5) * 3); g.stroke(); });
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
}

function buildTerrain() {
  for (let j = 0; j < NZ; j++) { const z = ZMAX - j * TS; for (let i = 0; i < NX; i++) HM[j * NX + i] = terrainH(XMIN + i * TS, z); }
  const pos = new Float32Array(NX * NZ * 3), uv = new Float32Array(NX * NZ * 2);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, x = XMIN + i * TS, z = ZMAX - j * TS;
    pos[k * 3] = x; pos[k * 3 + 1] = HM[k]; pos[k * 3 + 2] = z; uv[k * 2] = x / 6; uv[k * 2 + 1] = z / 6;
  }
  const idx = new Uint32Array((NX - 1) * (NZ - 1) * 6); let q = 0;
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
    idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const nor = geo.attributes.normal.array;
  for (let k = 0; k < NX * NZ; k++) { const nx = Math.abs(nor[k * 3]), ny = nor[k * 3 + 1], nz = Math.abs(nor[k * 3 + 2]); const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
    if (ny < 0.6 && nz > nx) { uv[k * 2] = x / 6; uv[k * 2 + 1] = y / 6; } else if (ny < 0.6) { uv[k * 2] = z / 6; uv[k * 2 + 1] = y / 6; } }
  geo.attributes.uv.needsUpdate = true;
  const col = new Float32Array(NX * NZ * 3);
  // palette ramp for leaf litter
  const ramp = [[0, 0x6a4426], [0.28, 0x9c4f1d], [0.5, 0xc57a22], [0.68, 0xd9a03a], [0.84, 0xa8361c], [1, 0x7e2c18]].map(s => [s[0], new THREE.Color(s[1])]);
  const cA = new THREE.Color(), cB = new THREE.Color(), tmp = new THREE.Color();
  const brownish = new THREE.Color(0x7a5434), rock = new THREE.Color(0x7b6c5e), rock2 = new THREE.Color(0x8d6a50), snow = new THREE.Color(0xf1ece4), dirt = new THREE.Color(0x8a6a48), dry = new THREE.Color(0x9a8a3a);
  const strata = [new THREE.Color(0x7a5a48), new THREE.Color(0x92715a), new THREE.Color(0x66554c), new THREE.Color(0x9c8672)];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, x = XMIN + i * TS, z = ZMAX - j * TS, h = HM[k], ny = nor[k * 3 + 1];
    const d = Math.abs(x - trailX(z));
    let t = clamp(fbm(x * 0.02 + 40, z * 0.02, 3) * 1.6 * 0.5 + 0.5 + noise2(x * 0.3, z * 0.3) * 0.15, 0, 1);
    let s = 0; while (s < ramp.length - 2 && t > ramp[s + 1][0]) s++;
    const f = (t - ramp[s][0]) / (ramp[s + 1][0] - ramp[s][0]);
    cA.copy(ramp[s][1]).lerp(ramp[s + 1][1], clamp(f, 0, 1));
    const dr = smooth(-0.15, -0.45, fbm(x * 0.012 - 90, z * 0.012, 3));      // meadows of dry gold grass
    cA.lerp(dry, dr * 0.55); cA.lerp(brownish, 0.28).multiplyScalar(0.86);
    // trail
    if (z > ZE) { const tt = 1 - smooth(1.4, 3.0, d); if (tt > 0) { tmp.copy(dirt).multiplyScalar(0.92 + noise2(x * 0.4, z * 0.4) * 0.12); cA.lerp(tmp, tt); } }
    // lookout slab
    if (z < ZE + 22 && z > ZE - 3 && d < 12) cA.lerp(rock2, smooth(12, 4, d) * smooth(ZE + 22, ZE + 4, z) * 0.7);
    // rock on steep ground
    const steep = smooth(0.82, 0.5, ny);
    if (steep > 0) {
      const band = 0.5 + 0.5 * Math.sin(h * 0.9 + noise2(x * 0.05, z * 0.05) * 3);
      cB.copy(strata[((band * 3.99) | 0)]).lerp(rock, 0.3 + 0.25 * noise2(x * 0.2, z * 0.2));
      cA.lerp(cB, Math.min(1, steep * 1.4));
    }
    // altitude: scrub → bare rock → snow
    const alt = smooth(45, 95, h); if (alt > 0) cA.lerp(rock, alt * 0.8);
    const sn = smooth(112 + noise2(x * 0.03, z * 0.03) * 18, 150, h) * smooth(0.55, 0.85, ny); if (sn > 0) cA.lerp(snow, sn);
    col[k * 3] = cA.r; col[k * 3 + 1] = cA.g; col[k * 3 + 2] = cA.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: makeGroundTexture(), roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh);
}

/* ---------------------------------------------------- baked low-poly geometry */
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; }
const _c = new THREE.Color();
function paint(geo, fn) {     // geo must be non-indexed; fn(faceCentreY,x,y,z,faceIndex) -> Color
  const p = geo.attributes.position, n = p.count, arr = new Float32Array(n * 3);
  for (let f = 0; f < n; f += 3) {
    const cx = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3, cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3, cz = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
    const c = fn(cx, cy, cz, f / 3);
    for (let v = 0; v < 3; v++) { arr[(f + v) * 3] = c.r; arr[(f + v) * 3 + 1] = c.g; arr[(f + v) * 3 + 2] = c.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return geo;
}
function merge(geos) {
  let n = 0; geos.forEach(g => n += g.attributes.position.count);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.computeVertexNormals(); return m;
}
function blob(sx, sy, sz, cx, cy, cz, jit, base, seed, detail) {
  const g = new THREE.IcosahedronGeometry(1, detail === undefined ? 1 : detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + jit * hash3(x * 3.1 + seed, y * 3.1, z * 3.1 + seed * 1.7);
    p.setXYZ(i, x * k * sx + cx, y * k * sy + cy, z * k * sz + cz);
  }
  const r = mulberry32((seed * 9973) | 0);
  return paint(g, (x, y, z) => { const yn = clamp((y - cy) / sy, -1, 1); const b = 0.7 + 0.3 * (yn * 0.5 + 0.5) + (r() - 0.5) * 0.16; return _c.copy(base).multiplyScalar(b); });
}
function tube(rt, rb, h, cx, cy, cz, col, seg, tilt, dir) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg || 6, 1, true).toNonIndexed();
  if (tilt) g.rotateZ(tilt); if (dir) g.rotateY(dir);
  g.translate(cx, cy, cz);
  return paint(g, (x, y) => _c.copy(col).multiplyScalar(0.75 + 0.35 * clamp(y / 4, 0, 1) + hash3(x, y, 1) * 0.04));
}
function cone(r, h, cy, base, tip, seed) {
  const g = new THREE.ConeGeometry(r, h, 7, 1, true).toNonIndexed(), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.1 * hash3(x * 4 + seed, y, z * 4); p.setXYZ(i, x * k, y + cy, z * k); }
  const rr = mulberry32(seed * 31 + 5);
  return paint(g, (x, y) => { const t = clamp((y - (cy - h / 2)) / h, 0, 1); return _c.copy(base).lerp(tip, t * 0.5).multiplyScalar(0.72 + 0.3 * t + (rr() - 0.5) * 0.12); });
}
const BARK = new THREE.Color(0x4b3324), BIRCH = new THREE.Color(0xe6e1d3);
function deciduous(col, seed) {
  const base = new THREE.Color(col);
  return merge([
    tube(0.14, 0.27, 3.6, 0, 1.8, 0, BARK, 6),
    tube(0.07, 0.12, 2.0, 0.55, 3.3, 0.1, BARK, 5, -0.7), tube(0.06, 0.1, 1.8, -0.5, 3.2, -0.2, BARK, 5, 0.75),
    blob(2.3, 1.85, 2.3, 0, 5.0, 0, 0.16, base, seed), blob(1.6, 1.3, 1.6, 1.5, 4.1, 0.8, 0.18, base, seed + 1),
    blob(1.6, 1.3, 1.6, -1.4, 4.3, -0.7, 0.18, base, seed + 2), blob(1.4, 1.2, 1.4, 0.3, 4.2, -1.6, 0.18, base, seed + 3),
    blob(1.3, 1.1, 1.3, 0.2, 6.2, 0.4, 0.18, base, seed + 4)
  ]);
}
function birch(col, seed) {
  const base = new THREE.Color(col);
  const parts = [tube(0.09, 0.14, 6.4, 0, 3.2, 0, BIRCH, 6)];
  const dark = new THREE.Color(0x2a2622);
  for (let i = 0; i < 6; i++) parts.push(tube(0.095, 0.095, 0.1, 0, 0.8 + i * 0.95 + hash3(i, seed, 0) * 0.2, 0, dark, 6));
  parts.push(blob(1.15, 1.7, 1.15, 0, 5.4, 0, 0.16, base, seed), blob(0.95, 1.4, 0.95, 0.6, 4.3, 0.3, 0.18, base, seed + 1),
    blob(0.95, 1.5, 0.95, -0.55, 4.8, -0.4, 0.18, base, seed + 2), blob(0.8, 1.2, 0.8, 0.1, 7.0, 0.1, 0.18, base, seed + 3));
  return merge(parts);
}
function conifer(col, tip, seed) {
  const b = new THREE.Color(col), t = new THREE.Color(tip);
  return merge([tube(0.12, 0.2, 1.8, 0, 0.9, 0, BARK, 6), cone(2.2, 3.4, 2.7, b, t, seed), cone(1.8, 3.0, 4.3, b, t, seed + 1), cone(1.4, 2.7, 5.8, b, t, seed + 2), cone(0.95, 2.4, 7.2, b, t, seed + 3)]);
}
function rockGeo(seed) {
  const g = new THREE.DodecahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.22 * hash3(x * 2.7 + seed, y * 2.7, z * 2.7); p.setXYZ(i, x * k * 1.15, y * k * 0.72, z * k); }
  const base = new THREE.Color(0x7a7066), r = mulberry32(seed + 9);
  return paint(g, (x, y) => _c.copy(base).multiplyScalar(0.7 + 0.35 * clamp(y + 0.5, 0, 1) + (r() - 0.5) * 0.2).lerp(new THREE.Color(0x8d6a50), 0.15));
}
function bushGeo(col, seed) {
  const base = new THREE.Color(col);
  return merge([blob(0.9, 0.62, 0.9, 0, 0.5, 0, 0.2, base, seed, 1), blob(0.65, 0.5, 0.65, 0.7, 0.38, 0.3, 0.2, base, seed + 1, 1), blob(0.6, 0.45, 0.6, -0.6, 0.35, -0.3, 0.2, base, seed + 2, 1)]);
}
function logGeo() {
  const g = new THREE.CylinderGeometry(0.3, 0.34, 1, 7, 1, false).toNonIndexed(); g.rotateZ(Math.PI / 2);
  return paint(g, (x, y, z) => _c.set(0x5a4030).multiplyScalar(0.8 + hash3(x * 9, y * 9, z * 9) * 0.15));
}

/* --------------------------------------------- instancing in culling chunks */
const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
const VARIANTS = {};
function variant(name, geo, shadow) { VARIANTS[name] = { geo, shadow: shadow !== false }; }
const AUTUMN = [0xb3261e, 0xd6471c, 0xe8821e, 0xf0a21f, 0x9a4a1c, 0xc8341c];
AUTUMN.forEach((c, i) => variant('oak' + i, deciduous(c, 10 + i * 7)));
variant('birchA', birch(0xf1c93c, 3)); variant('birchB', birch(0xe3d24c, 8));
variant('pineG', conifer(0x2f4d2c, 0x4b6a35, 4)); variant('pineL', conifer(0xc99a2c, 0xe3b94a, 9));
variant('rock0', rockGeo(1)); variant('rock1', rockGeo(2)); variant('rock2', rockGeo(3));
variant('bushR', bushGeo(0xb02a1e, 2), false); variant('bushO', bushGeo(0xe0701a, 4), false); variant('bushY', bushGeo(0xe8b02a, 6), false);
variant('log', logGeo());

const CH = 120;                 // chunk size
const chunks = new Map();
const colliders = new Map();    // spatial hash for trunks & boulders
const COL_CELL = 8;
function addCollider(x, z, r) { const k = Math.floor(x / COL_CELL) * 100003 + Math.floor(z / COL_CELL); let a = colliders.get(k); if (!a) colliders.set(k, a = []); a.push(x, z, r); }
const dummy = new THREE.Object3D();
function addInstance(name, x, y, z, sx, sy, sz, ry, bright) {
  const cx = Math.floor(x / CH), cz = Math.floor(z / CH), key = cx * 1000 + cz;
  let c = chunks.get(key); if (!c) chunks.set(key, c = { cx, cz, items: {} });
  (c.items[name] || (c.items[name] = [])).push([x, y, z, sx, sy, sz, ry, bright || 1]);
}
function finalizeChunks() {
  const col = new THREE.Color();
  for (const c of chunks.values()) {
    c.group = new THREE.Group(); c.box = new THREE.Box3();
    for (const name in c.items) {
      const arr = c.items[name], v = VARIANTS[name];
      const m = new THREE.InstancedMesh(v.geo, treeMat, arr.length);
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i]; dummy.position.set(a[0], a[1], a[2]); dummy.rotation.set(0, a[6], 0); dummy.scale.set(a[3], a[4], a[5]); dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, col.setScalar(a[7]));
        c.box.expandByPoint(dummy.position);
      }
      m.castShadow = v.shadow; m.receiveShadow = true; m.frustumCulled = false; c.group.add(m);
    }
    c.box.expandByScalar(18); c.box.min.y -= 10; c.box.max.y += 18;
    scene.add(c.group);
  }
}
const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
function cullChunks() {
  pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
  const px = camera.position.x, pz = camera.position.z;
  for (const c of chunks.values()) {
    const dx = Math.max(c.box.min.x - px, 0, px - c.box.max.x), dz = Math.max(c.box.min.z - pz, 0, pz - c.box.max.z);
    const dist = Math.hypot(dx, dz);
    c.group.visible = dist < 620 && (dist < 100 || frustum.intersectsBox(c.box));
  }
}

/* ----------------------------------------------------- scatter the biome */
const keepClear = [];           // {x,z,r}
function populate() {
  const r = mulberry32(555), treeGrid = new Map();
  const free = (x, z, m) => { const k = Math.floor(x / 4) * 100003 + Math.floor(z / 4); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const a = treeGrid.get(k + dx * 100003 + dz); if (a) for (let i = 0; i < a.length; i += 3) if (Math.hypot(a[i] - x, a[i + 1] - z) < Math.max(m, a[i + 2])) return false; } return true; };
  const mark = (x, z, rad) => { const k = Math.floor(x / 4) * 100003 + Math.floor(z / 4); let a = treeGrid.get(k); if (!a) treeGrid.set(k, a = []); a.push(x, z, rad); };
  const nearKeep = (x, z) => { for (const c of keepClear) if (Math.hypot(x - c.x, z - c.z) < c.r) return true; return false; };
  const grad = (x, z) => Math.hypot(groundH(x + 1, z) - groundH(x - 1, z), groundH(x, z + 1) - groundH(x, z - 1)) / 2;
  let trees = 0;
  for (let n = 0; n < 26000 && trees < 8200; n++) {
    const z = 100 - r() * 1260;
    let x;
    if (z > ZE - 20) { const u = r(); x = trailX(z) + (r() < 0.5 ? -1 : 1) * (5 + (-Math.log(1 - u * 0.999)) * 70); } else x = (r() - 0.5) * 820;
    if (Math.abs(x) > 410) continue;
    const h = groundH(x, z); if (h > 70 - noise2(x * 0.02, z * 0.02) * 14) continue;
    if (z > ZE - 6 && z < ZE + 4 + 0 && false) continue;
    if (z <= ZE + 1 && z > ZE - 3) continue;
    if (z > ZE && Math.abs(x - trailX(z)) < 4.2) continue;
    if (grad(x, z) > 0.75 || nearKeep(x, z)) continue;
    const clear = fbm(x * 0.017 + 7, z * 0.017, 3); if (clear < -0.32 && r() < 0.85) continue;
    const gr = noise2(x * 0.02 + 300, z * 0.02);
    let name, tr;
    if (h > 38 || (z < ZE && r() < 0.6)) { name = r() < 0.7 ? 'pineG' : 'pineL'; tr = 0.28; }
    else if (gr > 0.18) { name = r() < 0.6 ? 'birchA' : 'birchB'; tr = 0.2; }
    else if (r() < 0.14) { name = r() < 0.7 ? 'pineG' : 'pineL'; tr = 0.28; }
    else { name = 'oak' + ((noise2(x * 0.03, z * 0.03) * 3 + 3 + r() * 2.2) | 0) % 6; tr = 0.3; }
    const s = 0.75 + r() * 0.85;
    if (!free(x, z, 3.0 * s)) continue;
    mark(x, z, 2.6 * s);
    addInstance(name, x, h - 0.2, z, s * (0.92 + r() * 0.18), s * (0.9 + r() * 0.25), s * (0.92 + r() * 0.18), r() * 6.283, 0.82 + r() * 0.32);
    addCollider(x, z, tr * s + 0.1); trees++;
  }
  // boulders
  let rocks = 0;
  for (let n = 0; n < 6000 && rocks < 700; n++) {
    const z = 90 - r() * 1240, side = r() < 0.5 ? -1 : 1;
    const x = z > ZE ? trailX(z) + side * (3.8 + r() * r() * 160) : (r() - 0.5) * 800;
    if (Math.abs(x) > 410) continue;
    const h = groundH(x, z);
    if (z > ZE - 3 && z < ZE + 1.5) continue;
    if (z > ZE && Math.abs(x - trailX(z)) < 2.8) continue;
    if (nearKeep(x, z) && r() < 0.95) continue;
    const s = 0.35 + Math.pow(r(), 3) * 2.4 + (grad(x, z) > 0.5 ? 0.6 : 0);
    addInstance('rock' + ((r() * 3) | 0), x, h + s * 0.05, z, s, s * (0.8 + r() * 0.5), s * (0.9 + r() * 0.4), r() * 6.283, 0.85 + r() * 0.25);
    if (s > 0.9) addCollider(x, z, s * 0.95);
    rocks++;
  }
  // a few big boulders at the lookout
  for (let i = 0; i < 7; i++) {
    const z = ZE + 6 + r() * 30, tx = trailX(z), x = tx + (i % 2 ? 1 : -1) * (9 + r() * 6), s = 1.6 + r() * 1.6;
    addInstance('rock' + (i % 3), x, groundH(x, z) + s * 0.1, z, s, s * 0.9, s, r() * 6.28, 0.95); addCollider(x, z, s * 0.95);
  }
  // bushes & logs
  for (let n = 0; n < 4200; n++) {
    const z = 95 - r() * 760; const x = trailX(z) + (r() < 0.5 ? -1 : 1) * (3.3 + r() * r() * 70);
    if (z < ZE + 3) continue; if (Math.abs(x - trailX(z)) < 3.8 || nearKeep(x, z) || grad(x, z) > 0.8) continue;
    const s = 0.5 + r() * 0.75;
    addInstance(['bushR', 'bushO', 'bushY'][(r() * 3) | 0], x, groundH(x, z) - 0.05, z, s, s * (0.7 + r() * 0.6), s, r() * 6.28, 0.85 + r() * 0.3);
  }
  for (let n = 0; n < 140; n++) {
    const z = 80 - r() * 700, x = trailX(z) + (r() < 0.5 ? -1 : 1) * (4.5 + r() * 40);
    if (z < ZE + 10 || nearKeep(x, z) || grad(x, z) > 0.5) continue;
    const len = 2.5 + r() * 3.5; addInstance('log', x, groundH(x, z) + 0.12, z, len, 0.8 + r() * 0.7, 0.8 + r() * 0.7, r() * 6.28, 0.9);
  }
}

/* --------------------------------------------------- props: sign & markers */
function buildSign() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 288; const g = c.getContext('2d');
  g.fillStyle = '#e9d9a6'; g.fillRect(0, 0, 512, 288);
  g.strokeStyle = '#5a2a14'; g.lineWidth = 14; g.strokeRect(10, 10, 492, 268);
  g.fillStyle = '#a3260f'; g.textAlign = 'center';
  g.font = 'bold 70px Georgia, serif'; g.fillText('TRAIL ENDS', 256, 100);
  g.fillStyle = '#3b2412'; g.font = 'bold 40px Georgia, serif'; g.fillText('CLIFF EDGE AHEAD', 256, 160);
  g.fillStyle = '#a3260f'; g.font = 'bold 56px Georgia, serif'; g.fillText('100 FT DROP', 256, 236);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b3b24, roughness: 1 });
  const grp = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.24, 0.08), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  board.position.y = 1.9; grp.add(board);
  for (const sx of [-0.9, 0.9]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.13, 2.5, 0.13), wood); p.position.set(sx, 1.25, -0.02); grp.add(p); }
  grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const z = ZE + 24, x = trailX(z) + 3.6;
  grp.position.set(x, groundH(x, z) - 0.1, z);
  grp.rotation.y = 0.35 + trailHeading(z) * 0.5 + 0.0;
  scene.add(grp);
  keepClear.push({ x, z, r: 4 });
}

/* ---------------------------------------------------------------- the bicycle */
const bikeRoot = new THREE.Group(); bikeRoot.rotation.order = 'YXZ';
const paintRed = new THREE.MeshStandardMaterial({ color: 0xd2111a, metalness: 0.45, roughness: 0.32 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd3d6, metalness: 0.9, roughness: 0.28 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
const leather = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.7 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x33363a, metalness: 0.7, roughness: 0.5 });
const UP = new V3(0, 1, 0), _t = new V3();
const unitCyl = {};
function mkTube(r, mat, seg) { const k = r + '_' + (seg || 10); const geo = unitCyl[k] || (unitCyl[k] = new THREE.CylinderGeometry(r, r, 1, seg || 10)); const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; }
function place(m, a, b) { _t.subVectors(b, a); const len = _t.length(); m.position.copy(a).addScaledVector(_t, 0.5); m.quaternion.setFromUnitVectors(UP, _t.normalize()); m.scale.set(1, Math.max(len, 1e-4), 1); }
const toV = a => Array.isArray(a) ? new V3(a[0], a[1], a[2]) : a.clone();
function addTube(parent, r, mat, a, b) { const m = mkTube(r, mat); place(m, toV(a), toV(b)); parent.add(m); return m; }

const WR = 0.343;                       // wheel radius
const RAXLE = [0, WR, 0.54], FAXLE_Z = -0.54, BB = [0, 0.30, 0.12];
const HB = new V3(0, 0.74, -0.42), HT = new V3(0, 0.88, -0.38);
const STEER_AXIS = new V3().subVectors(HT, HB).normalize();
function makeWheel(withCog) {
  const w = new THREE.Group(), spin = new THREE.Group(); w.add(spin);
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.313, 0.03, 10, 40), rubber); tire.rotation.y = Math.PI / 2; tire.castShadow = true; spin.add(tire);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.283, 0.008, 6, 40), chrome); rim.rotation.y = Math.PI / 2; spin.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.11, 10), chrome); hub.rotation.z = Math.PI / 2; spin.add(hub);
  for (let i = 0; i < 18; i++) {
    const pv = new THREE.Group(); pv.rotation.x = i / 18 * Math.PI * 2;
    const s = mkTube(0.0022, chrome, 4); s.scale.y = 0.26; s.position.y = 0.153; s.position.x = (i % 2 ? 0.012 : -0.012); pv.add(s); spin.add(pv);
  }
  const refl = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.05), new THREE.MeshBasicMaterial({ color: 0xffa21a })); refl.position.set(0.005, 0.285, 0); spin.add(refl);
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0xf4f4f0 })); mark.position.set(0, 0.34, 0.04); spin.add(mark);
  if (withCog) { const cog = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.008, 14), darkMetal); cog.rotation.z = Math.PI / 2; cog.position.x = 0.045; spin.add(cog); }
  w.spin = spin; return w;
}
const rearWheel = makeWheel(true); rearWheel.position.set(...RAXLE); bikeRoot.add(rearWheel);
const fork = new THREE.Group(); fork.position.copy(HB); bikeRoot.add(fork);
const frontWheel = makeWheel(false); frontWheel.position.set(0, WR - HB.y, FAXLE_Z - HB.z); fork.add(frontWheel);
const F_REL = new V3(0, WR - HB.y, FAXLE_Z - HB.z);
// frame
{
  const S_TOP = [0, 0.90, 0.30];
  addTube(bikeRoot, 0.019, paintRed, BB, S_TOP);                              // seat tube
  addTube(bikeRoot, 0.018, paintRed, [0, 0.845, 0.283], [0, 0.86, -0.395]);   // top tube
  addTube(bikeRoot, 0.024, paintRed, [0, 0.785, -0.41], BB);                  // down tube
  addTube(bikeRoot, 0.027, paintRed, [HB.x, HB.y, HB.z], [HT.x, HT.y, HT.z]); // head tube
  for (const sx of [-1, 1]) {
    addTube(bikeRoot, 0.011, paintRed, [sx * 0.03, BB[1], BB[2]], [sx * 0.055, RAXLE[1], RAXLE[2]]);            // chainstays
    addTube(bikeRoot, 0.010, paintRed, [0, 0.845, 0.283], [sx * 0.055, RAXLE[1], RAXLE[2]]);                    // seatstays
  }
  addTube(bikeRoot, 0.0145, chrome, S_TOP, [0, 1.00, 0.322]);                  // seat post
  const sad = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), leather); sad.scale.set(0.075, 0.03, 0.15); sad.position.set(0, 1.03, 0.30); sad.castShadow = true; bikeRoot.add(sad);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), leather); nose.scale.set(0.03, 0.022, 0.09); nose.position.set(0, 1.025, 0.14); bikeRoot.add(nose);
  // chain
  const cx = 0.047; addTube(bikeRoot, 0.003, darkMetal, [cx, BB[1] + 0.085, BB[2]], [cx, RAXLE[1] + 0.036, RAXLE[2]]); addTube(bikeRoot, 0.003, darkMetal, [cx, BB[1] - 0.085, BB[2]], [cx, RAXLE[1] - 0.036, RAXLE[2]]);
  // fenders
  const fend = new THREE.Mesh(new THREE.TorusGeometry(0.372, 0.01, 4, 20, 2.1), paintRed); fend.rotation.y = Math.PI / 2; fend.rotation.z = 1.05; fend.position.set(0, WR, 0.54); bikeRoot.add(fend);
  // kickstand (only while parked)
  var stand = addTube(bikeRoot, 0.007, darkMetal, [0, 0.30, 0.34], [-0.24, 0.054, 0.34]);
  // bell
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 6, 0, 6.28, 0, 1.6), chrome); bell.position.set(0.1, 0.915, -0.33); bikeRoot.add(bell);
}
// fork + handlebar (steers)
const gripL = new V3(-0.33, 0, 0), gripR = new V3(0.33, 0, 0);
{
  for (const sx of [-1, 1]) addTube(fork, 0.013, paintRed, [sx * 0.045, 0.0, 0.0], [sx * 0.045, F_REL.y, F_REL.z]);
  addTube(fork, 0.012, paintRed, [-0.045, 0, 0], [0.045, 0, 0]);
  const S1 = new V3().subVectors(HT, HB).add(new V3(0, 0.06, 0.018)), C = S1.clone().add(new V3(0, 0, -0.075));
  addTube(fork, 0.012, chrome, new V3().subVectors(HT, HB), S1); addTube(fork, 0.014, chrome, S1, C);
  const L = C.clone().add(new V3(-0.29, 0.0, 0.1)), R = C.clone().add(new V3(0.29, 0.0, 0.1));
  addTube(fork, 0.0115, chrome, C, L); addTube(fork, 0.0115, chrome, C, R);
  const gl = L.clone().add(new V3(-0.1, 0, 0.012)), gr = R.clone().add(new V3(0.1, 0, 0.012));
  addTube(fork, 0.017, rubber, L, gl); addTube(fork, 0.017, rubber, R, gr);
  gripL.copy(L).lerp(gl, 0.5); gripR.copy(R).lerp(gr, 0.5);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 10), darkMetal); lamp.rotation.x = Math.PI / 2; lamp.position.set(0, 0.255, -0.075); fork.add(lamp); addTube(fork, 0.006, darkMetal, C, new V3(0, 0.235, -0.075));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 10), new THREE.MeshBasicMaterial({ color: 0xfff1c0 })); lens.position.set(0, 0.255, -0.1015); lens.rotation.y = Math.PI; fork.add(lens);
}
// cranks & pedals
const crank = new THREE.Group(); crank.position.set(...BB); bikeRoot.add(crank);
const pedals = [];
{
  addTube(crank, 0.011, darkMetal, [0.075, 0, 0], [0.075, -0.17, 0]); addTube(crank, 0.011, darkMetal, [-0.075, 0, 0], [-0.075, 0.17, 0]);
  addTube(crank, 0.012, darkMetal, [-0.08, 0, 0], [0.08, 0, 0]);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.006, 24), darkMetal); ring.rotation.z = Math.PI / 2; ring.position.x = 0.047; crank.add(ring);
  for (const sx of [1, -1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.025, 0.1), darkMetal); p.position.set(sx * 0.12, sx > 0 ? -0.17 : 0.17, 0); crank.add(p); pedals.push(p); }
}
bikeRoot.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
scene.add(bikeRoot);

// the rider (first person): arms & legs, drawn in bike-local space
const jacketMat = new THREE.MeshStandardMaterial({ color: 0x3b5a4a, roughness: 0.9 });
const jeansMat = new THREE.MeshStandardMaterial({ color: 0x2c3e5e, roughness: 0.95 });
const gloveMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 });
const shoeMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.85 });
const rider = new THREE.Group(); bikeRoot.add(rider);
const armSeg = [], legSeg = [], shoes = [], hands = [];
for (let i = 0; i < 2; i++) {
  armSeg.push([mkTube(0.045, jacketMat, 8), mkTube(0.04, jacketMat, 8)]); armSeg[i].forEach(m => { m.castShadow = false; rider.add(m); });
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), gloveMat); h.scale.set(1, 0.9, 1.2); rider.add(h); hands.push(h);
  legSeg.push([mkTube(0.075, jeansMat, 8), mkTube(0.06, jeansMat, 8)]); legSeg[i].forEach(m => { m.castShadow = false; rider.add(m); });
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.27), shoeMat); rider.add(s); shoes.push(s);
}
function ik(root, tip, l1, l2, pole, out) {   // two-bone IK -> knee/elbow position
  const d = new V3().subVectors(tip, root); let L = d.length(); const dn = d.clone().normalize();
  L = clamp(L, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.005);
  const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const mid = root.clone().addScaledVector(dn, a), perp = pole.clone().addScaledVector(dn, -pole.dot(dn)).normalize();
  return out.copy(mid).addScaledVector(perp, h);
}
const _a = new V3(), _b = new V3(), _c1 = new V3(), _c2 = new V3();
function updateRider(b) {
  fork.updateMatrix();
  for (let i = 0; i < 2; i++) {
    const sx = i === 0 ? -1 : 1;
    // arms
    const grip = (sx < 0 ? gripL : gripR);
    _a.copy(grip).applyMatrix4(fork.matrix);                              // hand in bike space
    const shoulder = _b.set(sx * 0.2, 1.36, 0.3);
    const elbow = ik(shoulder.clone(), _a.clone().add(new V3(0, 0.03, 0.02)), 0.3, 0.29, new V3(sx * 0.7, -0.5, 0.4), _c1);
    place(armSeg[i][0], shoulder, elbow); place(armSeg[i][1], elbow, _a);
    hands[i].position.copy(_a);
    // legs
    const ph = -b.phase + (i === 0 ? Math.PI : 0), px = (sx * 0.12);
    const ankle = _c2.set(px, BB[1] + (-0.17 * Math.cos(ph)) + 0.06, BB[2] + (-0.17 * Math.sin(ph)) + 0.02);
    const hip = new V3(sx * 0.1, 1.0, 0.33);
    const knee = ik(hip, ankle, 0.43, 0.43, new V3(sx * 0.25, 0.2, -1), new V3());
    place(legSeg[i][0], hip, knee); place(legSeg[i][1], knee, ankle);
    shoes[i].position.set(ankle.x, ankle.y - 0.035, ankle.z - 0.05);
  }
}

/* ---------------------------------------------------------------- game state */
const state = {
  mode: 'walk', playing: false, started: false,
  player: { pos: new V3(), vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, onGround: true, peakY: 0, stepAcc: 0, bob: 0 },
  bike: { pos: new V3(), heading: 0, v: 0, steer: 0, lean: 0, vy: 0, gvy: 0, onGround: true, phase: 0, wheel: 0, pitch: 0, peakY: 0, hopCd: 0, stamina: 1, winded: false, skid: false, parkLean: 0.22, cadence: 0, coast: 0 },
  look: { yaw: 0, pitch: 0, idle: 0 },
  shake: 0, blend: null, deadT: 0, deadInfo: '', time: 0, msgT: 0
};
const K = {};
const P = state.player, B = state.bike, L = state.look;
const START_Z = 40, BIKE_Z = -26;

function placeBikeParked(x, z, heading) {
  B.pos.set(x, groundH(x, z), z); B.heading = heading; B.v = 0; B.steer = 0; B.lean = 0; B.vy = 0; B.gvy = 0; B.onGround = true; B.pitch = 0; B.parkLean = 0.22;
  const hr = groundH(x + Math.sin(heading) * 0.54, z + Math.cos(heading) * 0.54), hf = groundH(x - Math.sin(heading) * 0.54, z - Math.cos(heading) * 0.54);
  B.pos.y = (hr + hf) / 2; B.pitch = Math.atan2(hf - hr, 1.08);
}
function resetWorld() {
  const tz = START_Z; const sx = trailX(tz) + 0.3;
  P.pos.set(sx, groundH(sx, tz), tz); P.yaw = trailHeading(tz); P.pitch = -0.05; P.vx = P.vz = P.vy = 0; P.onGround = true;
  const bx = trailX(BIKE_Z) + 3.7; placeBikeParked(bx, BIKE_Z, trailHeading(BIKE_Z) + 0.55);
  state.mode = 'walk'; L.yaw = L.pitch = 0; state.blend = null;
}

/* ----------------------------------------------------------- tree collisions */
function collide(pos, rad, out) {
  let hit = false;
  const cx = Math.floor(pos.x / COL_CELL), cz = Math.floor(pos.z / COL_CELL);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const a = colliders.get((cx + dx) * 100003 + (cz + dz)); if (!a) continue;
    for (let i = 0; i < a.length; i += 3) {
      const ox = pos.x - a[i], oz = pos.z - a[i + 1], d = Math.hypot(ox, oz), m = rad + a[i + 2];
      if (d < m && d > 1e-5) { const nx = ox / d, nz = oz / d; pos.x += nx * (m - d); pos.z += nz * (m - d); out.x = nx; out.z = nz; hit = true; }
    }
  }
  return hit;
}
const hitN = { x: 0, z: 0 };

/* ---------------------------------------------------------------- audio (procedural) */
let AC = null, master, windG, windF, rollG, rollF, noiseBuf, muted = false;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = 0.7; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const loop = () => { const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(); return s; };
    windF = AC.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 420; windF.Q.value = 0.6; windG = AC.createGain(); windG.gain.value = 0.05;
    loop().connect(windF); windF.connect(windG); windG.connect(master);
    rollF = AC.createBiquadFilter(); rollF.type = 'lowpass'; rollF.frequency.value = 700; rollG = AC.createGain(); rollG.gain.value = 0;
    loop().connect(rollF); rollF.connect(rollG); rollG.connect(master);
  } catch (e) { AC = null; }
}
function burst(freq, q, dur, vol, type) {
  if (!AC || muted) return; const s = AC.createBufferSource(); s.buffer = noiseBuf; const f = AC.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = AC.createGain(); const t = AC.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 1.5, dur + 0.05);
}
function stepSound() { burst(1200 + Math.random() * 700, 0.8, 0.12, 0.28); setTimeout(() => burst(2400 + Math.random() * 900, 1.2, 0.07, 0.12), 45); }
function thump(v) { burst(110, 1, 0.35, clamp(v / 14, 0.1, 0.9), 'lowpass'); burst(900, 0.7, 0.2, clamp(v / 30, 0.05, 0.4)); }
function tick() { burst(3600, 6, 0.012, 0.045); }
function bell() { if (!AC || muted) return; for (const f of [2093, 2637]) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0.0001, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.18, AC.currentTime + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 1.4); o.connect(g); g.connect(master); o.start(); o.stop(AC.currentTime + 1.5); } }
let nextBird = 3;
function bird() {
  if (!AC || muted) return; const base = 2200 + Math.random() * 2200, n = 2 + (Math.random() * 4 | 0), t0 = AC.currentTime;
  for (let i = 0; i < n; i++) { const o = AC.createOscillator(), g = AC.createGain(), t = t0 + i * 0.13; o.type = 'sine'; o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), t + 0.08);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.12); }
}
let tickAcc = 0;

/* ---------------------------------------------------------------- UI hooks */
const $ = id => document.getElementById(id);
const hud = { speed: $('speed'), unit: $('unit'), info: $('info'), prompt: $('prompt'), msg: $('msg'), fade: $('fade'), stam: $('stam'), stamWrap: $('stamwrap'), hint: $('hint') };
function say(text, secs) { hud.msg.textContent = text; hud.msg.style.opacity = 1; state.msgT = secs || 4; }

/* ----------------------------------------------------------------- physics */
function die(fallH, ft) {
  if (state.mode === 'dead') return;
  state.deadWas = state.mode; state.mode = 'dead'; state.deadT = 0; state.shake = 1.5;
  thump(30);
  hud.fade.classList.add('on');
  const feet = Math.round(fallH * FT);
  state.deadInfo = `You went over the edge.\n${feet} ft down.`;
  $('deadtxt').textContent = state.deadInfo; $('dead').classList.add('on');
}
function respawn() {
  const z = ZE + 55, x = trailX(z), heading = trailHeading(z);
  hud.fade.classList.remove('on'); $('dead').classList.remove('on');
  if (state.deadWas === 'ride') {
    placeBikeParked(x, z, heading); B.parkLean = 0; B.v = 0; state.mode = 'ride'; P.pos.copy(B.pos); L.yaw = L.pitch = 0;
  } else {
    P.pos.set(x, groundH(x, z), z); P.yaw = heading; P.pitch = 0; P.vx = P.vz = P.vy = 0; P.onGround = true; state.mode = 'walk';
  }
  state.blend = null; say('Back at the lookout. Mind the edge.', 4);
}

function stepWalk(dt) {
  const f = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0), r = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
  const sp = K.ShiftLeft || K.ShiftRight ? 6.4 : 3.5, sn = Math.sin(P.yaw), cs = Math.cos(P.yaw);
  let wx = -sn * f + cs * r, wz = -cs * f - sn * r; const l = Math.hypot(wx, wz); if (l > 0) { wx /= l; wz /= l; }
  const k = P.onGround ? Math.min(1, 11 * dt) : Math.min(1, 0.8 * dt);
  P.vx += (wx * sp - P.vx) * k; P.vz += (wz * sp - P.vz) * k;
  // horizontal move with slope / wall tests
  const tryMove = (nx, nz) => {
    nx = clamp(nx, XMIN + 6, XMIN + (NX - 1) * TS - 6); nz = clamp(nz, ZMAX - (NZ - 1) * TS + 6, ZMAX - 6);
    const gh = groundH(nx, nz), dh = gh - P.pos.y, dist = Math.hypot(nx - P.pos.x, nz - P.pos.z) + 1e-6;
    const blocked = P.onGround ? (dh > 0.04 && dh / dist > 1.05) : dh > 0.25;
    if (!blocked) { P.pos.x = nx; P.pos.z = nz; }
    return !blocked;
  };
  const nx = P.pos.x + P.vx * dt, nz = P.pos.z + P.vz * dt;
  if (!tryMove(nx, nz)) { if (!tryMove(nx, P.pos.z)) P.vx = 0; if (!tryMove(P.pos.x, nz)) P.vz = 0; }
  if (collide(P.pos, 0.38, hitN)) { const vn = P.vx * hitN.x + P.vz * hitN.z; if (vn < 0) { P.vx -= vn * hitN.x; P.vz -= vn * hitN.z; } }
  const bd = Math.hypot(P.pos.x - B.pos.x, P.pos.z - B.pos.z);
  if (bd < 0.65 && bd > 1e-4 && state.mode === 'walk') { const ox = (P.pos.x - B.pos.x) / bd, oz = (P.pos.z - B.pos.z) / bd; P.pos.x = B.pos.x + ox * 0.65; P.pos.z = B.pos.z + oz * 0.65; }
  const gh = groundH(P.pos.x, P.pos.z);
  if (P.onGround) {
    const drop = P.pos.y - gh, dist = Math.hypot(P.vx, P.vz) * dt + 1e-6;
    if (drop > 0.55 || (drop > 0.08 && drop / dist > 1.9)) { P.onGround = false; P.peakY = P.pos.y; P.vy = 0; }
    else P.pos.y = gh;
    if (P.onGround && K.Space && !K._spaceUsed) { K._spaceUsed = true; P.onGround = false; P.vy = 4.7; P.peakY = P.pos.y; }
    const spd = Math.hypot(P.vx, P.vz);
    if (P.onGround && spd > 0.8) { P.stepAcc += spd * dt; P.bob += spd * dt * 2.3; if (P.stepAcc > (spd > 5 ? 2.0 : 1.5)) { P.stepAcc = 0; stepSound(); } }
  }
  if (!P.onGround) {
    P.vy -= G * dt; P.pos.y += P.vy * dt; P.peakY = Math.max(P.peakY, P.pos.y);
    if (P.pos.y <= gh) {
      const imp = -P.vy, fall = P.peakY - gh; P.pos.y = gh; P.onGround = true; P.vy = 0;
      if (fall > 9 || imp > 16) die(fall); else if (imp > 3) { state.shake = Math.max(state.shake, clamp(imp / 12, 0.1, 0.9)); thump(imp); P.vx *= 0.5; P.vz *= 0.5; }
    }
  }
}

function groundAt(b, out) {            // contact heights for the two wheels
  const s = Math.sin(b.heading), c = Math.cos(b.heading);
  out.hr = groundH(b.pos.x + s * 0.54, b.pos.z + c * 0.54); out.hf = groundH(b.pos.x - s * 0.54, b.pos.z - c * 0.54);
}
const gh2 = { hr: 0, hf: 0 };
function stepBike(dt) {
  const m = 85, WB = 1.08;
  groundAt(B, gh2);
  const onTr = isTrail(B.pos.x, B.pos.z), mu = onTr ? 0.85 : 0.6, crr = onTr ? 0.018 : 0.055;
  const brake = !!(K.KeyS || K.ArrowDown), pedal = !!(K.KeyW || K.ArrowUp);
  const sprintKey = !!(K.ShiftLeft || K.ShiftRight);
  let sprint = false;
  if (pedal && sprintKey && !B.winded && B.stamina > 0) { sprint = true; B.stamina -= 0.16 * dt; if (B.stamina <= 0) { B.stamina = 0; B.winded = true; } }
  else { B.stamina = Math.min(1, B.stamina + (pedal ? 0.05 : 0.12) * dt); if (B.winded && B.stamina > 0.3) B.winded = false; }
  B.hopCd -= dt;
  if (B.onGround) {
    const grad = (gh2.hf - gh2.hr) / WB, cosT = 1 / Math.sqrt(1 + grad * grad), sinT = grad * cosT;
    const power = pedal ? (sprint ? 820 : 340) : 0;
    const F = power > 0 ? Math.min(power / Math.max(B.v, 1.3), 235) : 0;
    const drag = 0.5 * 1.2 * 0.55 * B.v * B.v;
    const net = F - drag - m * G * sinT;
    const resist = crr * m * G * cosT * (B.v > 0.05 ? 1 : 0.0) + (brake ? 560 * Math.min(1, B.v / 0.5 + 0.2) : 0);
    const a = (net - resist) / m;
    if (brake && B.v <= 0.15 && !pedal) B.v = Math.max(B.v - 2.5 * dt, -1.6);          // walk it backwards
    else if (B.v < 0) B.v = Math.min(0, B.v + 5 * dt);
    else if (B.v <= 0.02 && a <= 0) B.v = 0;
    else if (B.v <= 0.02 && net > crr * m * G * cosT) B.v += a * dt + 0.01;
    else B.v += a * dt;
    if (B.v > 32) B.v = 32;
    // steering
    const maxS = lerp(0.62, 0.08, smooth(0, 15, B.v));
    const si = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
    B.steer += (si * maxS - B.steer) * Math.min(1, 7 * dt);
    let yawRate = -B.v / WB * Math.tan(B.steer);
    const aLat = Math.abs(B.v * yawRate), aMax = mu * G * (brake ? 0.8 : 1);
    B.skid = false;
    if (aLat > aMax) { yawRate *= aMax / aLat; B.skid = true; B.v = Math.max(0, B.v - 2.4 * dt); }
    B.heading += yawRate * dt;
    const leanT = Math.atan(B.v * -yawRate / G) + (pedal && B.v > 1 ? Math.sin(B.phase) * 0.012 : 0);
    B.lean += (leanT - B.lean) * Math.min(1, 9 * dt);
    // pedalling / cadence
    if (pedal) { B.cadence = clamp(32 + B.v * 8.5, 36, 118); B.phase += B.cadence / 60 * 6.283 * dt * (sprint ? 1.1 : 1); } else B.cadence = 0;
    B.parkLean = Math.max(0, B.parkLean - dt * 0.6);
  } else {
    B.lean += (0 - B.lean) * Math.min(1, 1.5 * dt);
    B.steer += (0 - B.steer) * Math.min(1, 2 * dt);
    B.v *= 1 - 0.02 * dt;
  }
  // move
  const fx = -Math.sin(B.heading), fz = -Math.cos(B.heading), dist = B.v * dt;
  if (dist !== 0) {
    const nx = B.pos.x + fx * dist, nz = B.pos.z + fz * dist, sg = dist > 0 ? 1 : -1;
    const hfN = groundH(nx + fx * 0.54 * sg, nz + fz * 0.54 * sg), hRef = sg > 0 ? gh2.hf : gh2.hr;
    const blocked = B.onGround ? (hfN - hRef > 0.06 && (hfN - hRef) > 1.15 * Math.abs(dist)) : (hfN > B.pos.y + 0.5);
    if (blocked) { if (Math.abs(B.v) > 3.5) { state.shake = Math.max(state.shake, clamp(B.v / 14, 0.2, 1)); thump(B.v * 2); } B.v = 0; }
    else { B.pos.x = clamp(nx, XMIN + 8, XMIN + (NX - 1) * TS - 8); B.pos.z = clamp(nz, ZMAX - (NZ - 1) * TS + 8, ZMAX - 8); }
  }
  // trees & boulders
  if (collide(B.pos, 0.42, hitN)) {
    const vn = B.v * (fx * -hitN.x + fz * -hitN.z);
    if (vn > 0 && B.v > 0) { if (B.v > 3) { state.shake = Math.max(state.shake, clamp(B.v / 12, 0.25, 1)); thump(B.v * 2.4); } B.v = Math.max(0, B.v - vn * 1.1); }
  }
  // vertical
  groundAt(B, gh2);
  const target = (gh2.hr + gh2.hf) / 2, WBL = 1.08;
  if (K.Space && !K._spaceUsed && B.onGround && B.hopCd <= 0) { K._spaceUsed = true; B.onGround = false; B.vy = 3.6; B.peakY = B.pos.y; B.hopCd = 0.5; }
  if (B.onGround) {
    const yBall = B.pos.y + B.gvy * dt - 0.5 * G * dt * dt;
    if (yBall > target + 0.07) { B.onGround = false; B.pos.y = yBall; B.vy = B.gvy - G * dt; B.peakY = Math.max(B.pos.y, gh2.hr, gh2.hf); }
    else { B.gvy = lerp(B.gvy, clamp((target - B.pos.y) / dt, -30, 30), 0.35); B.pos.y = target; }
  } else {
    B.vy -= G * dt; B.pos.y += B.vy * dt; B.peakY = Math.max(B.peakY, B.pos.y);
    if (B.pos.y <= target) {
      const imp = -B.vy, fall = B.peakY - target;
      B.pos.y = target; B.onGround = true; B.gvy = 0;
      if (fall > 9 || imp > 17) die(fall);
      else if (imp > 3.5) { state.shake = Math.max(state.shake, clamp(imp / 11, 0.1, 1)); thump(imp * 1.2); B.v *= 1 - clamp((imp - 6) / 28, 0, 0.4); }
    }
  }
  const pT = B.onGround ? Math.atan2(gh2.hf - gh2.hr, WBL) : clamp(Math.atan2(B.vy, Math.max(B.v, 1.5)), -1.15, 0.5);
  B.pitch += (pT - B.pitch) * Math.min(1, (B.onGround ? 14 : 3.5) * dt);
  B.wheel += B.v * dt / WR;
  if (B.v < -0.1) B.cadence = 0;
  // freewheel clicks
  if (B.onGround && Math.abs(B.v) > 0.8 && !pedal) { tickAcc += B.v * dt * 4; if (tickAcc > 1) { tickAcc = 0; tick(); } }
  if (B.onGround && B.v > 6 && !onTr) state.shake = Math.max(state.shake, 0.06);
  P.pos.set(B.pos.x, B.pos.y, B.pos.z);
}

/* ------------------------------------------------------------ interactions */
function nearBike() {
  const dx = B.pos.x - P.pos.x, dz = B.pos.z - P.pos.z, d = Math.hypot(dx, dz);
  if (d > 3.2) return false;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  return d < 1.6 || (dx * fx + dz * fz) / d > 0.55;
}
function startBlend() { state.blend = { t: 0, pos: camera.position.clone(), quat: camera.quaternion.clone() }; }
function mount() {
  startBlend();
  B.heading = P.yaw; L.yaw = 0; L.pitch = P.pitch; B.v = 0; B.steer = 0; B.lean = 0;
  state.mode = 'ride'; initAudio(); say('W pedal · S brake · A/D steer', 4);
}
function dismount() {
  if (B.v > 4) { say('Slow down first.', 1.5); return; }
  startBlend();
  const s = Math.sin(B.heading), c = Math.cos(B.heading);
  P.yaw = B.heading + L.yaw; P.pitch = L.pitch;
  const px = B.pos.x + c * -0.95, pz = B.pos.z - s * -0.95;
  P.pos.set(px, groundH(px, pz), pz); P.vx = P.vz = P.vy = 0; P.onGround = true;
  B.parkLean = 0.22; B.v = 0; state.mode = 'walk';
}
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  K[e.code] = true;
  if (!state.playing) return;
  if (e.code === 'KeyE') { if (state.mode === 'ride') dismount(); else if (state.mode === 'walk' && nearBike()) mount(); }
  if (e.code === 'KeyR' && state.mode !== 'dead') { hud.fade.classList.remove('on'); resetWorld(); say('Back to the trailhead.', 3); }
  if (e.code === 'KeyB' && state.mode === 'ride') bell();
  if (e.code === 'KeyM') { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.7; say(muted ? 'Sound off' : 'Sound on', 1.5); }
});
window.addEventListener('keyup', e => { K[e.code] = false; if (e.code === 'Space') K._spaceUsed = false; });
window.addEventListener('blur', () => { for (const k in K) K[k] = false; });

let locked = false, dragging = false;
function look(dx, dy) {
  if (state.mode === 'dead' || !state.playing) return;
  const s = 0.0022;
  if (state.mode === 'ride') { L.yaw = clamp(L.yaw - dx * s, -2.3, 2.3); L.pitch = clamp(L.pitch - dy * s, -1.4, 1.2); L.idle = 0; }
  else { P.yaw -= dx * s; P.pitch = clamp(P.pitch - dy * s, -1.5, 1.5); }
}
document.addEventListener('mousemove', e => { if (locked || dragging) look(e.movementX || 0, e.movementY || 0); });
canvas.addEventListener('mousedown', () => { if (!locked && state.playing) dragging = true; });
window.addEventListener('mouseup', () => { dragging = false; });
document.addEventListener('pointerlockchange', () => {
  const was = locked; locked = document.pointerLockElement === canvas;
  if (was && !locked && state.started) { state.playing = false; $('overlay').classList.remove('hidden'); $('go').textContent = 'Resume'; }
});
function begin() {
  initAudio(); state.playing = true; state.started = true; $('overlay').classList.add('hidden');
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  if (!state.firstMsg) { state.firstMsg = true; say('Follow the trail — something red is resting beside it.', 6); }
}
$('go').addEventListener('click', begin);
canvas.addEventListener('click', () => { if (!state.playing && state.ready) begin(); });
window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });

/* --------------------------------------------------------- falling leaves */
const LEAF_N = 700, leafGeo = new THREE.PlaneGeometry(0.17, 0.12);
const leafMesh = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), LEAF_N);
leafMesh.frustumCulled = false; scene.add(leafMesh);
const leaf = { x: new Float32Array(LEAF_N), y: new Float32Array(LEAF_N), z: new Float32Array(LEAF_N), s: new Float32Array(LEAF_N), p: new Float32Array(LEAF_N), f: new Float32Array(LEAF_N) };
function initLeaves() {
  const pal = [0xc8341c, 0xe8821e, 0xf0a21f, 0xd9b02a, 0x9a4a1c, 0xb3261e], col = new THREE.Color();
  for (let i = 0; i < LEAF_N; i++) { leaf.x[i] = (Math.random() - 0.5) * 44; leaf.y[i] = Math.random() * 16; leaf.z[i] = (Math.random() - 0.5) * 44; leaf.s[i] = 0.6 + Math.random() * 0.9; leaf.p[i] = Math.random() * 6.28; leaf.f[i] = 0.8 + Math.random() * 1.4; leafMesh.setColorAt(i, col.setHex(pal[(Math.random() * pal.length) | 0])); }
}
function updateLeaves(dt, t, cam) {
  const wx = 0.9 + Math.sin(t * 0.13) * 0.5, wz = -0.3 + Math.cos(t * 0.09) * 0.4;
  for (let i = 0; i < LEAF_N; i++) {
    leaf.x[i] += (wx + Math.sin(t * leaf.f[i] + leaf.p[i]) * 0.9) * dt; leaf.z[i] += (wz + Math.cos(t * leaf.f[i] * 0.8 + leaf.p[i]) * 0.9) * dt; leaf.y[i] -= (0.55 + leaf.s[i] * 0.45) * dt;
    let dx = leaf.x[i] - cam.x, dz = leaf.z[i] - cam.z;
    if (dx > 22) leaf.x[i] -= 44; else if (dx < -22) leaf.x[i] += 44; if (dz > 22) leaf.z[i] -= 44; else if (dz < -22) leaf.z[i] += 44;
    const gh = groundH(leaf.x[i], leaf.z[i]);
    if (leaf.y[i] < gh + 0.03) { leaf.y[i] = Math.max(cam.y + 4, gh + 6) + Math.random() * 10; }
    else if (leaf.y[i] > cam.y + 22) leaf.y[i] = gh + 0.5;
    dummy.position.set(leaf.x[i], leaf.y[i], leaf.z[i]);
    dummy.rotation.set(t * leaf.f[i] * 1.7 + leaf.p[i], t * leaf.f[i] + leaf.p[i] * 2, leaf.p[i]);
    const s = leaf.s[i]; dummy.scale.set(s, s, s); dummy.updateMatrix(); leafMesh.setMatrixAt(i, dummy.matrix);
  }
  leafMesh.instanceMatrix.needsUpdate = true;
}

/* ----------------------------------------------------------------- camera */
const rig = new THREE.Object3D(); rig.rotation.order = 'YXZ';
const qLook = new THREE.Quaternion(), eLook = new THREE.Euler(0, 0, 0, 'YXZ'), qShake = new THREE.Quaternion(), eShake = new THREE.Euler();
const tgtPos = new V3(), tgtQuat = new THREE.Quaternion();
function updateCamera(dt) {
  const t = state.time;
  if (state.mode === 'ride' || (state.mode === 'dead' && state.deadWas === 'ride')) {
    rig.position.copy(B.pos); rig.rotation.set(B.pitch * 0.75, B.heading, -B.lean * 0.38); rig.updateMatrix();
    const sway = B.cadence > 0 ? Math.sin(B.phase) * 0.012 : 0;
    tgtPos.set(sway, 1.5, 0.2).applyMatrix4(rig.matrix);
    eLook.set(L.pitch, L.yaw, 0); qLook.setFromEuler(eLook);
    tgtQuat.setFromEuler(rig.rotation).multiply(qLook);
  } else {
    tgtPos.set(P.pos.x, P.pos.y + 1.7 + Math.sin(P.bob) * 0.035 * (P.onGround ? 1 : 0), P.pos.z);
    eLook.set(P.pitch, P.yaw, 0); tgtQuat.setFromEuler(eLook);
  }
  const gy = groundH(tgtPos.x, tgtPos.z) + 0.25; if (tgtPos.y < gy) tgtPos.y = gy;
  if (state.blend) {
    state.blend.t += dt / 0.55; const e = smooth(0, 1, state.blend.t);
    camera.position.copy(state.blend.pos).lerp(tgtPos, e); camera.quaternion.copy(state.blend.quat).slerp(tgtQuat, e);
    if (state.blend.t >= 1) state.blend = null;
  } else { camera.position.copy(tgtPos); camera.quaternion.copy(tgtQuat); }
  if (state.shake > 0.001) {
    const s = state.shake; camera.position.x += (Math.random() - 0.5) * 0.05 * s; camera.position.y += (Math.random() - 0.5) * 0.06 * s;
    eShake.set((Math.random() - 0.5) * 0.03 * s, (Math.random() - 0.5) * 0.03 * s, (Math.random() - 0.5) * 0.04 * s); qShake.setFromEuler(eShake); camera.quaternion.multiply(qShake);
    state.shake *= Math.exp(-5 * dt);
  }
  const speed = state.mode === 'ride' ? B.v : Math.hypot(P.vx, P.vz);
  const fov = state.mode === 'dead' ? camera.fov : 72 + clamp(speed, 0, 22) * 0.95 + (state.mode === 'dead' ? 0 : (!P.onGround && state.mode === 'walk' ? 6 : 0));
  if (Math.abs(fov - camera.fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, 6 * dt); camera.updateProjectionMatrix(); }
}

function updateBikeVisual() {
  const riding = state.mode === 'ride' || (state.mode === 'dead' && state.deadWas === 'ride');
  bikeRoot.position.copy(B.pos);
  bikeRoot.rotation.set(B.pitch, B.heading, riding ? -B.lean + B.parkLean : B.parkLean);
  fork.quaternion.setFromAxisAngle(STEER_AXIS, riding ? -B.steer : 0.18);
  rearWheel.spin.rotation.x = -B.wheel; frontWheel.spin.rotation.x = -B.wheel;
  crank.rotation.x = -B.phase; pedals[0].rotation.x = B.phase; pedals[1].rotation.x = B.phase;
  rider.visible = riding; stand.visible = !riding;
  bikeRoot.updateMatrix(); bikeRoot.updateMatrixWorld(true);
  if (riding) updateRider(B);
}

/* -------------------------------------------------------------- HUD update */
let hudTick = 0;
function updateHud(dt) {
  if (state.msgT > 0) { state.msgT -= dt; if (state.msgT <= 0) hud.msg.style.opacity = 0; }
  if ((hudTick++ % 3) !== 0) return;
  const riding = state.mode === 'ride';
  const spd = riding ? B.v : Math.hypot(P.vx, P.vz);
  hud.speed.textContent = (Math.abs(spd) * MPH).toFixed(0); hud.unit.textContent = 'mph';
  const x = P.pos.x, z = P.pos.z, toEdge = (z - edgeZ(x)) * FT, alt = P.pos.y * FT;
  const air = riding ? !B.onGround : !P.onGround, peak = riding ? B.peakY : P.peakY, fallen = (peak - P.pos.y) * FT;
  let info = (toEdge > 0 ? `cliff edge ${Math.max(0, toEdge).toFixed(0)} ft ahead` : `below the cliff`) + ` · elev ${alt.toFixed(0)} ft`;
  if (air && fallen > 12 && state.mode !== 'dead') info = `FALLING · ${fallen.toFixed(0)} ft`;
  hud.info.textContent = info;
  hud.stamWrap.style.opacity = riding ? 1 : 0; hud.stam.style.width = (B.stamina * 100).toFixed(0) + '%'; hud.stam.classList.toggle('low', B.winded);
  let prompt = '';
  if (state.mode === 'walk' && nearBike()) prompt = '[E]  Take the red bicycle';
  else if (riding) prompt = '';
  hud.prompt.textContent = prompt; hud.prompt.style.opacity = prompt ? 1 : 0;
  hud.hint.style.opacity = riding ? 0.85 : (state.mode === 'walk' ? 0.55 : 0);
  hud.hint.textContent = riding ? 'W pedal · S brake · A/D steer · Shift sprint · Space hop · B bell · E dismount' : 'WASD move · Shift run · Space jump · E interact · R trailhead · M sound';
}

/* ------------------------------------------------------------------- loop */
let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const now = ts / 1000; let dt = Math.min(0.05, now - last); last = now; if (dt <= 0) return;
  if (state.playing) {
    state.time += dt;
    const n = Math.ceil(dt / (1 / 90)), h = dt / n;
    for (let i = 0; i < n; i++) {
      if (state.mode === 'walk') { stepWalk(h); }
      else if (state.mode === 'ride') { stepBike(h); }
      else if (state.mode === 'dead') {
        // keep falling/landing visuals alive
        if (state.deadWas === 'ride' && !B.onGround) { B.vy -= G * h; B.pos.y += B.vy * h; const t = groundH(B.pos.x, B.pos.z); if (B.pos.y < t) { B.pos.y = t; B.onGround = true; } }
      }
    }
    if (state.mode === 'dead') { state.deadT += dt; if (state.deadT > 3.2) respawn(); }
    // auto-recentre head while pedalling
    if (state.mode === 'ride') { L.idle += dt; if (L.idle > 1.2 && (K.KeyW || K.ArrowUp) && B.v > 2) { L.yaw *= Math.exp(-1.6 * dt); L.pitch += (-0.04 - L.pitch) * Math.min(1, 1.2 * dt); } }
    // wind & rolling audio
    if (AC) {
      const sp = state.mode === 'ride' ? B.v : Math.hypot(P.vx, P.vz), airFall = (state.mode === 'ride' ? !B.onGround : !P.onGround) ? Math.abs(state.mode === 'ride' ? B.vy : P.vy) : 0;
      const wv = 0.05 + sp * 0.014 + airFall * 0.02; windG.gain.value += ((muted ? 0 : wv) - windG.gain.value) * 0.1;
      windF.frequency.value = 380 + sp * 38 + airFall * 90;
      const rv = state.mode === 'ride' && B.onGround ? clamp(B.v / 14, 0, 1) * (isTrail(B.pos.x, B.pos.z) ? 0.1 : 0.18) + (B.skid ? 0.2 : 0) : 0;
      rollG.gain.value += (rv - rollG.gain.value) * 0.1; rollF.frequency.value = 500 + sp * 60;
      nextBird -= dt; if (nextBird < 0) { bird(); nextBird = 4 + Math.random() * 9; }
    }
  }
  skyMat.uniforms.uTime.value = state.time;
  updateBikeVisual();
  updateCamera(dt);
  camera.updateMatrixWorld();
  sky.position.copy(camera.position);
  // follow-the-player shadow frustum
  const tx = Math.round(camera.position.x / 4) * 4, tz = Math.round(camera.position.z / 4) * 4, ty = camera.position.y;
  sun.target.position.set(tx, ty - 1, tz); sun.position.set(tx + SUN_DIR.x * 180, ty - 1 + SUN_DIR.y * 180, tz + SUN_DIR.z * 180);
  sun.target.updateMatrixWorld();
  cullChunks();
  updateLeaves(dt, state.time, camera.position);
  updateHud(dt);
  renderer.render(scene, camera);
}

/* --------------------------------------------------------------------- boot */
function boot() {
  const t0 = performance.now();
  buildTerrain();
  const bx = trailX(BIKE_Z) + 3.7;
  keepClear.push({ x: bx, z: BIKE_Z, r: 4.2 }, { x: trailX(START_Z), z: START_Z, r: 6 });
  buildSign();
  populate();
  finalizeChunks();
  initLeaves();
  resetWorld();
  // a tree to lean-park behind the bike, so it reads as "left on the side of the trail"
  $('go').disabled = false; $('go').textContent = 'Start'; $('loadtxt').textContent = 'Click to begin';
  state.ready = true;
  console.log('world built in', Math.round(performance.now() - t0), 'ms; chunks', chunks.size);
  requestAnimationFrame(frame);
}
window.__game = { state, K, groundH, trailX, trailH, trailHeading, ZE, edgeZ, begin, camera, scene, renderer, B, P, L, die, mount, dismount, resetWorld, isTrail };
setTimeout(boot, 30);
})();
