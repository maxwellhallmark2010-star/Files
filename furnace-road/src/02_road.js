// ─────────────────────────────────────────────────────────────────────────────
// Road & terrain as pure functions of position, so any stretch of the endless
// highway can be rebuilt identically: centreline, grade, ground height,
// surface type and the gas-station schedule.
// ─────────────────────────────────────────────────────────────────────────────
function roadX(z) {
  const env = 0.5 + 0.5 * Math.sin(z / 2900 + 0.7);             // long straights between bends
  return env * (70 * Math.sin(z / 820) + 28 * Math.sin(z / 330 + 1.3)) + 9 * env * env * Math.sin(z / 140 + 0.4);
}
function roadY(z) { return 8 * Math.sin(z / 1100) + 3 * Math.sin(z / 420 + 2) + 0.9 * Math.sin(z / 95 + 1) + 0.22 * Math.sin(z / 31); }
function roadDX(z) { return (roadX(z + 0.5) - roadX(z - 0.5)); }   // dx/dz

// ── gas stations ────────────────────────────────────────────────────────────
const _stations = new Map();
function stationInfo(k) {
  let s = _stations.get(k);
  if (!s) {
    const z = 700 + k * STATION_SPACING + (hash1(k) - 0.5) * 500;
    const side = hash1(k * 7 + 3) > 0.45 ? -1 : 1;                  // mostly on the right
    s = { k, z, side, name: STATION_NAMES[((k % STATION_NAMES.length) + STATION_NAMES.length) % STATION_NAMES.length] };
    _stations.set(k, s);
    if (_stations.size > 64) _stations.delete(_stations.keys().next().value);
  }
  return s;
}
const STATION_NAMES = ['STOVEPIPE FUEL', 'LAST CHANCE GAS', 'BADLANDS SERVICE', 'COYOTE FUEL STOP', 'SALT FLAT GAS', 'DRY CREEK STATION', 'FURNACE GAS & WATER', 'BONEYARD FUEL'];
function stationIndexNear(z) { return Math.round((z - 700) / STATION_SPACING); }
function nearestStation(z) {
  const k = stationIndexNear(z);
  let best = null, bd = 1e9;
  for (let i = k - 1; i <= k + 1; i++) { const s = stationInfo(i); const d = Math.abs(s.z - z); if (d < bd) { bd = d; best = s; } }
  return best;
}
function nextStationAhead(z, dir = 1) {
  let k = stationIndexNear(z) - 1;
  for (let i = 0; i < 4; i++, k++) { const s = stationInfo(k); if (dir > 0 ? s.z > z + 10 : s.z < z - 10) return s; }
  return stationInfo(k);
}
// lot rectangle in road-relative coordinates: lateral 6..42 m on the station's side, ±26 m along the road
function lotWeight(d, dz, side) {
  const lat = d * side;
  const a = smoothstep(4.5, 7.5, lat) * (1 - smoothstep(40, 46, lat));
  const b = 1 - smoothstep(22, 30, Math.abs(dz));
  return a * b;
}

// ── ground height & surface ─────────────────────────────────────────────────
function groundH(x, z) {
  const rx = roadX(z), ry = roadY(z), d = x - rx, ad = Math.abs(d);
  let h = ry;
  if (ad > ROAD_HALF) {
    h -= smoothstep(ROAD_HALF, ROAD_HALF + 3, ad) * 0.22;           // shoulder drop
    const w = smoothstep(ROAD_HALF + 1.5, 32, ad);
    const n = fbm2(x * 0.011, z * 0.011, 3) * 2.4 + noise2(x * 0.16, z * 0.16) * 0.18;
    const hills = smoothstep(180, 750, ad) * (35 + 55 * fbm2(x * 0.0028 + 9, z * 0.0028, 2));
    h += w * n + hills;
    const s = nearestStation(z);
    const lw = lotWeight(d, z - s.z, s.side);
    if (lw > 0) h = lerp(h, ry - 0.04, lw);
  }
  return h;
}
function surfaceAt(x, z) {
  const d = x - roadX(z), ad = Math.abs(d);
  if (ad < ROAD_HALF) return 'asphalt';
  const s = nearestStation(z);
  if (lotWeight(d, z - s.z, s.side) > 0.6) return 'lot';
  if (ad < ROAD_HALF + 2.6) return 'gravel';
  return 'sand';
}
const SURFACE = {
  asphalt: { mu: 0.92, roll: 0.014, bump: 0.004 },
  lot: { mu: 0.85, roll: 0.018, bump: 0.008 },
  gravel: { mu: 0.72, roll: 0.035, bump: 0.02 },
  sand: { mu: 0.6, roll: 0.07, bump: 0.035 },
};
// "elevation" readout: Death Valley's floor sits below sea level
function elevationFt(z) { return Math.round(roadY(z) * 3.28 * 9 - 140); }
