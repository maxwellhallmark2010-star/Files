// Procedurally painted PBR textures (colour + normal maps) so the game needs
// no image downloads. Everything tiles seamlessly.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Tileable fractal value noise in [0,1].
function fbm(size, cells, octaves, seed, persistence = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const p = cells << o;
    const rnd = mulberry32(seed * 7919 + o * 104729);
    const lat = new Float32Array(p * p);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * p, iy = Math.floor(fy), ty = fy - iy;
      const sy = ty * ty * (3 - 2 * ty);
      const y0 = (iy % p) * p, y1 = ((iy + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * p, ix = Math.floor(fx), tx = fx - ix;
        const sx = tx * tx * (3 - 2 * tx);
        const x0 = ix % p, x1 = (ix + 1) % p;
        const a = lat[y0 + x0] + (lat[y0 + x1] - lat[y0 + x0]) * sx;
        const b = lat[y1 + x0] + (lat[y1 + x1] - lat[y1 + x0]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp; amp *= persistence;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function heightToNormal(h, size, strength) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x];
      const dn = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      d[i] = (nx / len * 0.5 + 0.5) * 255;
      d[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      d[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function toTexture(canvas, srgb, aniso = 8) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function paintPixels(size, fn) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const [r, g, b] = fn(x, y, y * size + x);
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Mono-yellow backrooms wallpaper, with grime toward the floor.
function wallpaper(size) {
  const mottle = fbm(size, 4, 5, 11);
  const fine = fbm(size, 64, 2, 12);
  const stain = fbm(size, 6, 5, 13, 0.55);
  const h = new Float32Array(size * size);
  const rnd = mulberry32(5);
  const grain = new Float32Array(size * size).map(() => rnd());
  const stripe = size / 8;
  const col = paintPixels(size, (x, y, i) => {
    const v = y / size; // 0 top (ceiling) -> 1 floor
    const sx = x % stripe;
    const line = sx < 3 || (sx > 9 && sx < 12) ? 1 : 0;
    // small repeating diamond motif between stripe lines
    const mx = ((x + stripe / 2) % stripe) - stripe / 2, my = (y % 48) - 24;
    const motif = Math.abs(mx) / 10 + Math.abs(my) / 14 < 1 ? 1 : 0;
    let k = 1 - line * 0.07 - motif * 0.035 + (mottle[i] - 0.5) * 0.16 + (grain[i] - 0.5) * 0.04;
    let r = 199 * k, g = 182 * k, b = 108 * k;
    // grime gradient at floor and under ceiling
    const floorDirt = Math.max(0, (v - 0.78) / 0.22) ** 1.6;
    const ceilDirt = Math.max(0, (0.06 - v) / 0.06) ** 2;
    const dirt = floorDirt * (0.35 + stain[i] * 0.5) + ceilDirt * 0.3;
    r *= 1 - dirt * 0.55; g *= 1 - dirt * 0.6; b *= 1 - dirt * 0.7;
    // water stains: blotches with a darker rim
    const s = stain[i] + (v - 0.5) * 0.3;
    if (s > 0.69) {
      const rim = s < 0.705 ? 0.12 : 0.05;
      r *= 1 - rim; g *= 1 - rim * 1.1; b *= 1 - rim * 1.5;
    }
    h[i] = line * 0.6 + motif * 0.25 + fine[i] * 0.5;
    return [r, g, b];
  });
  return { map: col, normal: heightToNormal(h, size, 2.2) };
}

// Damp, matted carpet.
function carpet(size) {
  const mottle = fbm(size, 5, 5, 21);
  const stain = fbm(size, 3, 6, 22, 0.6);
  const rnd = mulberry32(23);
  const fiber = new Float32Array(size * size).map(() => rnd());
  const tuft = fbm(size, 128, 1, 24);
  const h = new Float32Array(size * size);
  const col = paintPixels(size, (x, y, i) => {
    let k = 0.82 + (mottle[i] - 0.5) * 0.35 + (fiber[i] - 0.5) * 0.22 + (tuft[i] - 0.5) * 0.18;
    let r = 150 * k, g = 128 * k, b = 72 * k;
    if (stain[i] > 0.6) {
      const t = Math.min(1, (stain[i] - 0.6) * 6);
      r *= 1 - t * 0.2; g *= 1 - t * 0.2; b *= 1 - t * 0.16;
    }
    h[i] = fiber[i] * 0.5 + tuft[i] * 0.7;
    return [r, g, b];
  });
  return { map: col, normal: heightToNormal(h, size, 3.5) };
}

// Acoustic drop-ceiling tiles, 4x4 per texture.
function ceiling(size) {
  const rnd = mulberry32(31);
  const stain = fbm(size, 4, 4, 32);
  const fine = fbm(size, 96, 2, 33);
  const tile = size / 4;
  const holes = new Uint8Array(size * size);
  for (let n = 0; n < size * size * 0.012; n++) holes[(rnd() * size * size) | 0] = 1;
  const stainedTiles = new Set();
  for (let n = 0; n < 2; n++) stainedTiles.add(((rnd() * 4) | 0) + ((rnd() * 4) | 0) * 4);
  const h = new Float32Array(size * size);
  const col = paintPixels(size, (x, y, i) => {
    const tx = x % tile, ty = y % tile;
    const edge = Math.min(tx, ty, tile - 1 - tx, tile - 1 - ty);
    let k = 0.92 + (fine[i] - 0.5) * 0.08 - holes[i] * 0.25;
    let r = 214 * k, g = 208 * k, b = 186 * k;
    let height = 1;
    if (edge < 5) { r = 175; g = 170; b = 155; height = 0.2; }
    else if (edge < 9) { const s = 0.85 + (edge - 5) * 0.035; r *= s; g *= s; b *= s; height = 0.7; }
    const tid = ((x / tile) | 0) + ((y / tile) | 0) * 4;
    if (stainedTiles.has(tid) && edge >= 5) {
      const s = stain[i];
      if (s > 0.55) { const t = Math.min(1, (s - 0.55) * 4); r *= 1 - t * 0.12; g *= 1 - t * 0.15; b *= 1 - t * 0.3; }
      if (s > 0.55 && s < 0.57) { r *= 0.88; g *= 0.85; b *= 0.75; }
    }
    h[i] = height - holes[i] * 0.3;
    return [r, g, b];
  });
  return { map: col, normal: heightToNormal(h, size, 2.5) };
}

// White pool tiles, 8x8 per texture.
function poolTiles(size) {
  const rnd = mulberry32(41);
  const tint = Array.from({ length: 64 }, () => 0.93 + rnd() * 0.07);
  const dirt = fbm(size, 4, 4, 42);
  const tile = size / 8;
  const h = new Float32Array(size * size);
  const col = paintPixels(size, (x, y, i) => {
    const tx = x % tile, ty = y % tile;
    const edge = Math.min(tx, ty, tile - 1 - tx, tile - 1 - ty);
    const k = tint[((x / tile) | 0) + ((y / tile) | 0) * 8] - (dirt[i] - 0.5) * 0.05;
    h[i] = edge < 4 ? 0 : Math.min(1, edge / 8);
    if (edge < 4) return [168, 172, 168];
    return [236 * k, 240 * k, 238 * k];
  });
  return { map: col, normal: heightToNormal(h, size, 3) };
}

function waterNormal(size) {
  const h = fbm(size, 8, 4, 51);
  return heightToNormal(h, size, 6);
}

function rustyMetal(size) {
  const n = fbm(size, 6, 5, 61);
  const f = fbm(size, 48, 2, 62);
  const h = new Float32Array(size * size);
  const col = paintPixels(size, (x, y, i) => {
    const rust = Math.max(0, Math.min(1, (n[i] - 0.48) * 5));
    h[i] = rust * 0.6 + f[i] * 0.4;
    const g = 120 + (f[i] - 0.5) * 40;
    return [g + rust * (120 - g + 30), g + rust * (60 - g), g + rust * (30 - g)];
  });
  return { map: col, normal: heightToNormal(h, size, 2) };
}

function circuit(size) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(71);
  ctx.fillStyle = '#1d4a2a'; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#b89a3c'; ctx.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    let x = rnd() * size, y = rnd() * size;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) { if (rnd() < 0.5) x += (rnd() - 0.5) * 80; else y += (rnd() - 0.5) * 80; ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.fillStyle = '#d8c070'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
  }
  return c;
}

function label(text, bg, fg, w = 256, h = 128) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg; ctx.font = `bold ${h * 0.24}px Arial`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  text.split('\n').forEach((t, i, a) => ctx.fillText(t, w / 2, h / 2 + (i - (a.length - 1) / 2) * h * 0.3));
  // scuffs
  const rnd = mulberry32(text.length);
  for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.25})`; ctx.fillRect(rnd() * w, rnd() * h, rnd() * 6, rnd() * 3); }
  return c;
}

function fabric(size, r0, g0, b0, seed) {
  const n = fbm(size, 8, 4, seed);
  const rnd = mulberry32(seed);
  const h = new Float32Array(size * size);
  const col = paintPixels(size, (x, y, i) => {
    const weave = ((x >> 1) + (y >> 1)) & 1;
    const k = 0.85 + (n[i] - 0.5) * 0.3 + weave * 0.04 + (rnd() - 0.5) * 0.06;
    h[i] = weave * 0.3 + n[i];
    return [r0 * k, g0 * k, b0 * k];
  });
  return { map: col, normal: heightToNormal(h, size, 1.5) };
}

// Soft dark gradient used for fake ambient occlusion where walls meet floor.
function aoGradient() {
  const c = makeCanvas(16, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.6)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 128);
  return c;
}

export function buildTextures(quality) {
  const S = quality === 'low' ? 512 : 1024;
  const aniso = quality === 'low' ? 2 : 8;
  const w = wallpaper(S), cp = carpet(S), ce = ceiling(S), pt = poolTiles(S);
  const rm = rustyMetal(256), fb = fabric(256, 225, 222, 210, 81), bl = fabric(256, 70, 78, 96, 82);
  const tex = {
    wall: toTexture(w.map, true, aniso), wallN: toTexture(w.normal, false, aniso),
    carpet: toTexture(cp.map, true, aniso), carpetN: toTexture(cp.normal, false, aniso),
    ceil: toTexture(ce.map, true, aniso), ceilN: toTexture(ce.normal, false, aniso),
    pool: toTexture(pt.map, true, aniso), poolN: toTexture(pt.normal, false, aniso),
    water: toTexture(waterNormal(512), false, aniso),
    metal: toTexture(rm.map, true), metalN: toTexture(rm.normal, false),
    circuit: toTexture(circuit(256), true),
    powder: toTexture(label('GUN\nPOWDER', '#8c1a12', '#e8d9b0'), true),
    sheet: toTexture(fb.map, true), sheetN: toTexture(fb.normal, false),
    blanket: toTexture(bl.map, true), blanketN: toTexture(bl.normal, false),
    ao: toTexture(aoGradient(), false),
  };
  tex.ao.wrapS = tex.ao.wrapT = THREE.ClampToEdgeWrapping;
  tex.wall.repeat.set(2, 1); tex.wallN.repeat.set(2, 1);
  return tex;
}
