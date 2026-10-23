// Shared constants and deterministic random helpers.

export const CELL = 4;            // metres per grid cell
export const CHUNK = 12;          // cells per chunk side
export const CHUNK_SIZE = CELL * CHUNK;
export const WALL_H = 3.1;
export const WALL_T = 0.24;
export const PILLAR = 0.7;

// Integer hash -> float in [0, 1). Same inputs always give the same output,
// which is what makes the infinite map reproducible from a seed.
export function hash(seed, a, b, c = 0) {
  let h = (seed | 0) ^ 0x5bd1e995;
  h = Math.imul(h ^ Math.imul(a | 0, 0x27d4eb2d), 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h ^ Math.imul(b | 0, 0x85ebca6b), 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h ^ Math.imul(c | 0, 0x9e3779b1), 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const cellOf = (v) => Math.floor(v / CELL);
export const chunkOf = (cell) => Math.floor(cell / CHUNK);

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function randomSeed() {
  return (Math.random() * 2147483647) | 0;
}
