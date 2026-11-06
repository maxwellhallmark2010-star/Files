// ─────────────────────────────────────────────────────────────────────────────
// Street Hoops 3D — configuration, court geometry and small math helpers.
// All units are metres / seconds. Y is up. The hoop sits near z = 0 (baseline)
// and the half court runs toward +z (midcourt line at z = 14).
// ─────────────────────────────────────────────────────────────────────────────

const COURT = { halfW: 7.5, len: 14 };                 // FIBA half court: 15 m x 14 m
const HOOP = new THREE.Vector3(0, 3.05, 1.575);        // rim centre
const RIM_R = 0.225;                                    // inner radius (45 cm rim)
const RIM_TUBE = 0.011;                                 // rim steel radius
const BALL_R = 0.12;                                    // size-7 ball, 24 cm
const BOARD = { x0: -0.9, x1: 0.9, y0: 2.9, y1: 3.95, z0: 1.15, z1: 1.2 };
const POLE = { x: 0, z: -1.05, r: 0.11, h: 3.5 };
const THREE_R = 6.75;                                   // three-point radius
const CORNER_X = 6.6;                                   // corner three line
const CORNER_Z = HOOP.z + Math.sqrt(THREE_R * THREE_R - CORNER_X * CORNER_X);
const KEY = { halfW: 2.45, ftZ: 5.8, ftR: 1.8, restricted: 1.25 };
const CHECK_SPOT = new THREE.Vector3(0, 0, 8.8);
const WORLD = { x: 10.1, zMin: -3.2, zMax: 19.5 };      // fence / play-area limits
const GRAV = 9.81;
const SHOT_CLOCK = 14;

// ── math helpers ────────────────────────────────────────────────────────────
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;
function gauss() { // standard normal (Box–Muller)
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function dampAngle(a, b, k, dt) { return a + wrapAngle(b - a) * (1 - Math.exp(-k * dt)); }
function dist2D(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
function hoopDist(p) { return dist2D(p, HOOP); }
function isBeyondArc(x, z) {
  if (z <= CORNER_Z) return Math.abs(x) >= CORNER_X;
  const dx = x - HOOP.x, dz = z - HOOP.z;
  return dx * dx + dz * dz >= THREE_R * THREE_R;
}
function inBounds(x, z, margin = 0) {
  return Math.abs(x) <= COURT.halfW + margin && z >= -margin && z <= COURT.len + margin;
}
// shared scratch vectors (avoid per-frame allocation)
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();

// ── persistent settings (localStorage is optional — never trust it) ─────────
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const Store = {
  get(key, fallback) {
    try { const s = localStorage.getItem('sh3d.' + key); return s == null ? fallback : JSON.parse(s); }
    catch (e) { return fallback; }
  },
  set(key, val) { try { localStorage.setItem('sh3d.' + key, JSON.stringify(val)); } catch (e) { /* private mode */ } },
};

const DEFAULT_SETTINGS = {
  difficulty: 'pro',          // rookie | pro | allstar
  target: 11,                 // game to 11 / 15 / 21
  scoring: '23',              // '23' = 2s & 3s, '12' = 1s & 2s (streetball)
  makeItTakeIt: false,
  timing: 'normal',           // forgiving | normal | tight (shot meter window)
  graphics: IS_TOUCH ? 'medium' : 'high',
  camera: 'broadcast',        // broadcast | close
  sound: true,
  meter: true,
  lefty: false,               // mirror the touch layout
};
const Settings = Object.assign({}, DEFAULT_SETTINGS, Store.get('settings', {}));
function saveSettings() { Store.set('settings', Settings); }

const DIFFICULTY = {
  rookie: { speed: 0.86, react: 0.42, steal: 0.25, shoot: 0.32, block: 0.45, gapAdj: 0.35, aggression: 0.7 },
  pro: { speed: 0.96, react: 0.27, steal: 0.5, shoot: 0.5, block: 0.65, gapAdj: 0.1, aggression: 1.0 },
  allstar: { speed: 1.04, react: 0.16, steal: 0.8, shoot: 0.68, block: 0.85, gapAdj: -0.05, aggression: 1.25 },
};
const TIMING_WINDOW = { forgiving: 1.45, normal: 1.0, tight: 0.7 };
