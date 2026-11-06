// ─────────────────────────────────────────────────────────────────────────────
// Furnace Road — constants, math helpers, seeded noise, settings.
// Units: metres, seconds, kilograms. Y is up, the road runs toward +Z forever.
// ─────────────────────────────────────────────────────────────────────────────
const ROAD_HALF = 3.8;          // half width of the asphalt (two 3.6 m lanes + edge)
const LANE_X = -1.8;            // right-hand lane offset (driving +z, right is -x)
const CHUNK_L = 160;            // terrain chunk length
const CHUNK_AHEAD = 7, CHUNK_BEHIND = 2;
const STATION_SPACING = 2300;   // metres between gas stations (± jitter)
const STATION_OFFSET = 24;      // lot centre from road centre
const GRAV = 9.81;
const MPH = 2.23694, KMH = 3.6;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _c1 = new THREE.Color(), _c2 = new THREE.Color();

// deterministic randomness so the same stretch of road always looks the same
function hash1(n) { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 2D value noise, -1..1
function hash2(ix, iz) { let h = ix * 374761393 + iz * 668265263; h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16); return ((h & 0xffff) / 0x8000) - 1; }
function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
function fbm2(x, z, oct = 3) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * noise2(x * f, z * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }

// ── settings (localStorage is optional) ─────────────────────────────────────
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const Store = {
  get(k, d) { try { const s = localStorage.getItem('dv.' + k); return s == null ? d : JSON.parse(s); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('dv.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
const DEFAULTS = {
  units: 'mph', steerRange: 270, assist: true, camera: 'near',
  graphics: IS_TOUCH ? 'medium' : 'high', sound: true, sky: 'cycle', lefty: false,
};
const Settings = Object.assign({}, DEFAULTS, Store.get('settings', {}));
function saveSettings() { Store.set('settings', Settings); }
