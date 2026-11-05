// ============================================================================
//  VEHICLES — models, drift physics, deformation damage, parts, AI traffic
// ============================================================================
const CAR_TYPES = {
  lowrider: { name: 'Vaquero Lowrider', len: 5.5, wid: 2.0, h: 0.6, ride: 0.17, cab: { len: 2.5, z: -0.45, h: 0.56, tx: 0.12, tf: 0.55, tr: 0.6 }, wr: 0.32, ww: 0.22, wb: 3.15, power: 13.5, max: 44, mass: 1800, grip: 7.2, steer: 0.62, drift: 0.65, chrome: true, whitewall: true, hydraulics: true, bench: true, colors: [0x6b1fa3, 0x0d4fa0, 0x9b111e, 0x0d7a5f, 0xd4a017, 0x1a1a1a], nose: 0.05, deep: true, trim: true },
  classic57: { name: "Cherry '57", len: 5.1, wid: 1.98, h: 0.72, ride: 0.27, cab: { len: 2.1, z: -0.25, h: 0.56, tx: 0.1, tf: 0.5, tr: 0.45 }, wr: 0.36, ww: 0.22, wb: 2.95, power: 14.5, max: 47, mass: 1650, grip: 7.0, steer: 0.6, drift: 0.6, chrome: true, whitewall: true, fins: true, colors: [0xc8102e], roof: 0xf2efe6, nose: 0.06, roundLights: true, deep: true, trim: true },
  muscle: { name: 'Stallion SS', len: 4.8, wid: 1.96, h: 0.66, ride: 0.23, cab: { len: 1.95, z: -0.35, h: 0.5, tx: 0.12, tf: 0.6, tr: 0.75 }, wr: 0.36, ww: 0.26, wb: 2.8, power: 20, max: 56, mass: 1550, grip: 7.6, steer: 0.6, drift: 0.8, scoop: true, stripes: 0xf4f4f4, colors: [0xff6a00, 0x1c3faa, 0xffd200, 0x111111, 0x2b7a2b], nose: 0.08, deep: true },
  charger: { name: 'Brawler R/T', len: 5.25, wid: 2.0, h: 0.7, ride: 0.24, cab: { len: 1.9, z: -0.5, h: 0.5, tx: 0.12, tf: 0.62, tr: 0.55 }, wr: 0.37, ww: 0.27, wb: 3.0, power: 21, max: 58, mass: 1750, grip: 7.6, steer: 0.58, drift: 0.8, hiddenLights: true, rearStripe: 0xf4f4f4, colors: [0x0d0d0d, 0x6e0b0b, 0xe8e8e8, 0x2f4f2f, 0xb8860b], nose: 0.04, deep: true },
  challenger: { name: 'Defiant 440', len: 5.0, wid: 2.0, h: 0.7, ride: 0.22, cab: { len: 1.85, z: -0.3, h: 0.5, tx: 0.12, tf: 0.6, tr: 0.6 }, wr: 0.37, ww: 0.28, wb: 2.9, power: 22, max: 60, mass: 1700, grip: 7.8, steer: 0.6, drift: 0.8, scoop: true, stripes: 0x111111, spoiler: true, colors: [0xff2a00, 0x5b2a86, 0xf2c200, 0x1e9d32, 0x1560bd], nose: 0.05, deep: true },
  sedan: { name: 'Monarch Sedan', len: 4.7, wid: 1.86, h: 0.68, ride: 0.26, cab: { len: 2.45, z: -0.15, h: 0.62, tx: 0.13, tf: 0.7, tr: 0.6 }, wr: 0.33, ww: 0.22, wb: 2.75, power: 12, max: 42, mass: 1450, grip: 7.4, steer: 0.62, drift: 0.4, colors: [0x8a8f96, 0xe0e0e0, 0x23364f, 0x5a1a1a, 0x2e4a2e, 0xb8b08a, 0x1d1d1d, 0x4a5a6a], nose: 0.06 },
  taxi: { base: 'sedan', name: 'Downtown Cab', colors: [0xf2c200], taxi: true },
  pickup: { name: 'Rancher Pickup', len: 5.2, wid: 2.0, h: 0.82, ride: 0.38, cab: { len: 1.6, z: 0.55, h: 0.68, tx: 0.1, tf: 0.5, tr: 0.04 }, wr: 0.4, ww: 0.27, wb: 3.1, power: 14, max: 44, mass: 1900, grip: 7.0, steer: 0.6, drift: 0.5, bed: true, colors: [0x7a2a1a, 0x2a4a7a, 0xd0d0c8, 0x3a3a3a, 0x5a6a3a], nose: 0.04 },
  van: { name: 'Delivery Van', len: 5.0, wid: 2.05, h: 1.75, ride: 0.3, cab: null, wr: 0.36, ww: 0.24, wb: 3.0, power: 10.5, max: 36, mass: 2300, grip: 6.8, steer: 0.58, drift: 0.3, van: true, colors: [0xeeeeee, 0x2a5aa0, 0x8a1a1a, 0x3a5a3a], nose: 0.2 },
  bus: { name: 'City Bus', len: 11, wid: 2.5, h: 2.65, ride: 0.35, cab: null, wr: 0.5, ww: 0.32, wb: 6.4, power: 8, max: 25, mass: 9000, grip: 6.5, steer: 0.55, drift: 0.2, bus: true, colors: [0x2a6ab0, 0xe0a020], nose: 0.05 },
  motorbike: { name: 'Night Rider 750', bike: true, len: 2.1, wid: 0.7, h: 0.5, ride: 0.3, wr: 0.33, ww: 0.14, wb: 1.45, power: 19, max: 54, mass: 260, grip: 8.4, steer: 0.7, drift: 0.3, colors: [0x111111, 0xc8102e, 0x1a5ab0, 0xe0e0e0] },
  bmx: { name: 'BMX Bike', bike: true, bicycle: true, len: 1.7, wid: 0.5, h: 0.4, ride: 0.3, wr: 0.3, ww: 0.06, wb: 1.05, power: 5.5, max: 10, mass: 90, grip: 8.8, steer: 0.8, drift: 0.2, colors: [0x2ad0ff, 0xff3a8a, 0xf0f020, 0x30e060] }
};
for (const k in CAR_TYPES) { const t = CAR_TYPES[k]; t.id = k; if (t.base) { const b = CAR_TYPES[t.base]; for (const f in b) if (!(f in t)) t[f] = b[f]; } }
const vehicles = [];
const SH = {};
function initVehicleMats() {
  SH.chrome = new THREE.MeshPhongMaterial({ color: 0xd8dde2, specular: 0xffffff, shininess: 120 });
  SH.rubber = new THREE.MeshLambertMaterial({ color: 0x151515 });
  SH.rim = new THREE.MeshPhongMaterial({ color: 0x9a9ea2, specular: 0xaaaaaa, shininess: 60 });
  SH.glass = new THREE.MeshPhongMaterial({ color: 0x48687a, specular: 0xffffff, shininess: 110, transparent: true, opacity: 0.28, depthWrite: false });
  SH.headliner = new THREE.MeshLambertMaterial({ color: 0x8a8274 });
  SH.dark = new THREE.MeshLambertMaterial({ color: 0x161616 });
  SH.interior = new THREE.MeshLambertMaterial({ color: 0x2c2420 });
  SH.seatRed = new THREE.MeshLambertMaterial({ color: 0x7a1a1a });
  SH.head = new THREE.MeshLambertMaterial({ color: 0xdddddd, emissive: 0xfff2cc, emissiveIntensity: 0.2 });
  SH.white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  SH.metal = new THREE.MeshLambertMaterial({ color: 0x5a5e62 });
  SH.taxiSign = new THREE.MeshLambertMaterial({ color: 0xffe066, emissive: 0xffd040, emissiveIntensity: 0.3 });
  SH.busWin = new THREE.MeshLambertMaterial({ color: 0x24323c, emissive: 0xfff0c0, emissiveIntensity: 0 });
  SH.burnt = new THREE.MeshLambertMaterial({ color: 0x141414 });
  SH.skid = new THREE.MeshBasicMaterial({ color: 0x101010, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
}

// ---------------------------------------------------------------- model building
function boxMesh(w, h, d, mat, x, y, z, parent, segs) {
  const g = segs ? new THREE.BoxGeometry(w, h, d, segs[0], segs[1], segs[2]) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); if (parent) parent.add(m); return m;
}
function makeWheel(v, x, y, z, front, parent) {
  const T = v.T, r = T.wr, w = T.ww;
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const steer = new THREE.Group(); g.add(steer); const spin = new THREE.Group(); steer.add(spin);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, T.bike ? 16 : 14).rotateZ(Math.PI / 2), SH.rubber); tire.castShadow = !T.bike; spin.add(tire);
  const rimM = T.chrome || T.bike ? SH.chrome : SH.rim;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * (T.bicycle ? 0.88 : 0.6), r * (T.bicycle ? 0.88 : 0.6), w + 0.02, 12).rotateZ(Math.PI / 2), T.bicycle ? SH.metal : rimM);
  if (T.bicycle) rim.scale.set(0.3, 1, 1);
  spin.add(rim);
  if (T.whitewall) { const ww = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r * 0.82, w + 0.012, 14).rotateZ(Math.PI / 2), SH.white); spin.add(ww); }
  if (!T.bicycle) { const sp = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, r * 1.05, 0.05), rimM); spin.add(sp); const sp2 = sp.clone(); sp2.rotation.x = Math.PI / 2; spin.add(sp2); }
  return { g, steer, spin, tire, rim, x, y, z, front, attached: true, popped: false, side: x > 0 ? 1 : -1, potCD: 0 };
}
function shapeLower(g, T) {
  const p = g.attributes.position, L = T.len, W = T.wid, H = T.h;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ez = Math.abs(z) / (L / 2);
    if (ez > 0.98) { x *= 0.93; if (y > H * 0.9) y -= T.nose || 0.05; if (y < H * 0.1) y += 0.05; }
    if (y < H * 0.05 && ez > 0.6) y += 0.04;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
}
function buildCarModel(v) {
  const T = v.T; const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  v.root = root; v.body = body; v.glass = []; v.deform = []; v.wheels = []; v.bumpers = []; v.lights = [];
  v.paint = new THREE.MeshPhongMaterial({ color: v.color, specular: 0x555555, shininess: T.deep ? 80 : 45 });
  v.tailMat = new THREE.MeshLambertMaterial({ color: 0x5a0000, emissive: 0xff1a00, emissiveIntensity: 0.25 });
  if (T.bike) { buildBikeModel(v); scene.add(root); return; }
  const L = T.len, W = T.wid, H = T.h, roofMat = T.roof ? new THREE.MeshPhongMaterial({ color: T.roof, specular: 0x555555, shininess: 60 }) : v.paint;
  body.position.y = T.ride;
  v.roofMat = roofMat; v.pillars = [];
  const doorLen = T.bus ? 1.0 : (T.van ? 1.0 : Math.min(1.35, (T.cab ? T.cab.len : 2) * 0.6));
  const doorFront = T.cab ? T.cab.z + T.cab.len / 2 - 0.08 : L / 2 - 0.55;
  const deformBox = (w, h, d, x, y, z, segs, shape) => {
    const g = new THREE.BoxGeometry(w, h, d, segs[0], segs[1], segs[2]); g.translate(x, y, z); if (shape) shapeLower(g, T);
    const m = new THREE.Mesh(g, v.paint); m.castShadow = true; m.receiveShadow = true; body.add(m);
    v.deform.push({ mesh: m, orig: Float32Array.from(g.attributes.position.array), W, H, L, y0: 0 }); return m;
  };
  if (T.cab) {
    // hollow shell: nose + tail + floor pan + door-height side panels, so the cabin is open to the windows
    const cf = T.cab.z + T.cab.len / 2, cr = T.cab.z - T.cab.len / 2, fl = H * 0.35, st = 0.07;
    deformBox(W, H, L / 2 - cf, 0, H / 2, (L / 2 + cf) / 2, [4, 3, 6], true);
    deformBox(W, H, cr + L / 2, 0, H / 2, (cr - L / 2) / 2, [4, 3, 5], true);
    deformBox(W, fl, cf - cr, 0, fl / 2, (cf + cr) / 2, [4, 1, 4], false);
    const dr = doorFront - doorLen;
    for (const s of [1, -1]) {
      if (cf - doorFront > 0.01) deformBox(st, H, cf - doorFront, s * (W / 2 - st / 2), H / 2, (cf + doorFront) / 2, [1, 3, 1], false);
      if (dr - cr > 0.02) deformBox(st, H, dr - cr, s * (W / 2 - st / 2), H / 2, (dr + cr) / 2, [1, 3, 3], false);
      deformBox(st, H * 0.1, doorLen, s * (W / 2 - st / 2), H * 0.05, doorFront - doorLen / 2, [1, 1, 2], false); // sill under the door
    }
    boxMesh(W - st * 2, 0.012, cf - cr, SH.interior, 0, fl + 0.006, (cf + cr) / 2, body); // carpet
  } else deformBox(W, H, L, 0, H / 2, 0, [4, 3, 12], true);
  let cabTop = H, seatZ, seatY = H * (T.cab ? 0.38 : 0.45);
  if (T.cab) {
    const c = T.cab;
    const xb = W * 0.43, xt = xb * (1 - c.tx), zf0 = c.z + c.len / 2, zr0 = c.z - c.len / 2, yt = H + c.h, ztf = zf0 - c.tf, ztr = zr0 + c.tr;
    const pillar = (ax, ay, az, bx, by, bz, t) => {
      const a = new V3(ax, ay, az), d = new V3(bx - ax, by - ay, bz - az), len = d.length();
      const m = new THREE.Mesh(new THREE.BoxGeometry(t, len + 0.05, t * 1.3), roofMat);
      m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); m.castShadow = true; body.add(m); v.pillars.push(m);
    };
    const zb = doorFront - doorLen;
    for (const s of [1, -1]) {
      pillar(s * xb, H, zf0, s * xt, yt, ztf, 0.075);           // A pillar
      pillar(s * xb, H, zr0, s * xt, yt, ztr, 0.11);            // C pillar
      if (zb > zr0 + 0.3) pillar(s * xb, H, zb, s * xt, yt, lerp(ztr, ztf, (zb - zr0) / c.len), 0.085); // B pillar
      boxMesh(0.05, 0.05, ztf - ztr, roofMat, s * xt, yt - 0.03, (ztf + ztr) / 2, body); // roof rail
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(xt * 2 + 0.06, 0.05, ztf - ztr + 0.08), [roofMat, roofMat, roofMat, SH.headliner, roofMat, roofMat]);
    roof.position.set(0, yt - 0.01, (ztf + ztr) / 2); roof.castShadow = true; body.add(roof); v.pillars.push(roof);
    cabTop = H + c.h;
    // glass
    const fz = c.z + c.len / 2, rz = c.z - c.len / 2;
    const wsL = Math.hypot(c.h, c.tf), wsA = Math.atan2(c.tf, c.h);
    const ws = boxMesh(W * 0.86 * (1 - c.tx * 0.5) - 0.12, wsL * 0.9, 0.03, SH.glass, 0, H + c.h / 2 + 0.01, fz - c.tf / 2 + 0.03, body); ws.rotation.x = -wsA;
    v.glass.push({ mesh: ws, c: new V3(0, H + c.h / 2, fz - c.tf / 2), name: 'windshield' }); v.windshield = v.glass[0];
    const rwL = Math.hypot(c.h, c.tr), rwA = Math.atan2(c.tr, c.h);
    const rw = boxMesh(W * 0.86 * (1 - c.tx * 0.5) - 0.12, rwL * 0.85, 0.03, SH.glass, 0, H + c.h / 2 + 0.01, rz + c.tr / 2 - 0.03, body); rw.rotation.x = rwA;
    v.glass.push({ mesh: rw, c: new V3(0, H + c.h / 2, rz + c.tr / 2), name: 'rear' });
    const sideLen = c.len - (c.tf + c.tr) * 0.5 - 0.25, sideX = W * 0.43 * (1 - c.tx * 0.5) + 0.012, sideZ = c.z + (c.tr - c.tf) * 0.25, sA = Math.atan2(W * 0.43 * c.tx, c.h);
    const rwin = boxMesh(0.03, c.h * 0.74, sideLen, SH.glass, -sideX, H + c.h * 0.5, sideZ, body); rwin.rotation.z = -sA;
    v.glass.push({ mesh: rwin, c: new V3(-sideX, H + c.h / 2, sideZ), name: 'right' });
    v.cabWin = { sideX, sideZ, sideLen, sA };
    { const z0 = zr0 + c.tr * 0.6 + 0.06, z1 = zb - 0.05; if (z1 - z0 > 0.2) { const lw = boxMesh(0.03, c.h * 0.74, z1 - z0, SH.glass, sideX, H + c.h * 0.5, (z0 + z1) / 2, body); lw.rotation.z = sA; v.glass.push({ mesh: lw, c: new V3(sideX, H + c.h / 2, (z0 + z1) / 2), name: 'leftRear' }); } }
    seatZ = c.z - c.len * 0.1;
    if (T.bed) seatZ = c.z - 0.1;
  } else {
    // van / bus: windows on the box body
    const fwy = T.bus ? H * 0.62 : H * 0.72;
    const ws = boxMesh(W * 0.88, H * (T.bus ? 0.5 : 0.36), 0.03, SH.glass, 0, fwy, L / 2 + 0.01, body); ws.rotation.x = -0.12;
    v.glass.push({ mesh: ws, c: new V3(0, fwy, L / 2), name: 'windshield' }); v.windshield = v.glass[0];
    if (T.bus) {
      for (const s of [1, -1]) { const strip = boxMesh(0.03, H * 0.34, L * 0.78, SH.busWin, s * (W / 2 + 0.01), H * 0.66, -0.4, body); v.glass.push({ mesh: strip, c: new V3(s * W / 2, H * 0.66, -0.4), name: 'side' + s }); }
      boxMesh(W * 1.0, 0.25, L * 1.0, SH.white, 0, H * 0.42, 0, body).scale.set(1.005, 1, 1.001);
      const sign = boxMesh(W * 0.7, 0.3, 0.04, SH.taxiSign, 0, H * 0.92, L / 2 + 0.02, body);
    } else {
      const rwin = boxMesh(0.03, H * 0.3, 0.9, SH.glass, -(W / 2 + 0.01), H * 0.72, L / 2 - 0.85, body); v.glass.push({ mesh: rwin, c: new V3(-W / 2, H * 0.72, L / 2 - 0.85), name: 'right' });
    }
    seatZ = L / 2 - (T.bus ? 1.2 : 1.05); seatY = H * (T.bus ? 0.32 : 0.36);
    cabTop = H;
  }
  // doors (left = driver, right = passenger)
  v.doors = [];
  for (const s of [1, -1]) {
    const piv = new THREE.Group(); piv.position.set(s * (W / 2 + 0.005), 0, doorFront); body.add(piv);
    const dh = T.cab ? H * 0.86 : H * 0.5;
    const pg = new THREE.BoxGeometry(0.05, dh, doorLen, 1, 2, 3); pg.translate(s * 0.02, H * 0.08 + dh / 2, -doorLen / 2);
    const panel = new THREE.Mesh(pg, v.paint); panel.castShadow = true; piv.add(panel);
    const handle = boxMesh(0.03, 0.04, 0.16, T.chrome ? SH.chrome : SH.dark, s * 0.05, H * 0.72, -doorLen + 0.22, piv);
    let win = null;
    if (T.cab && s > 0) {
      const cw = v.cabWin;
      win = boxMesh(0.03, T.cab.h * 0.74, Math.min(doorLen * 0.92, cw.sideLen), SH.glass, cw.sideX - W / 2, H + T.cab.h * 0.5, cw.sideZ - doorFront + 0.05, piv); win.rotation.z = cw.sA;
      v.glass.push({ mesh: win, c: new V3(cw.sideX, H + T.cab.h / 2, cw.sideZ), name: 'driver' });
    } else if (!T.cab && s > 0 && !T.bus) {
      win = boxMesh(0.03, H * 0.3, doorLen * 0.8, SH.glass, 0.01, H * 0.72, -doorLen / 2, piv); v.glass.push({ mesh: win, c: new V3(W / 2, H * 0.72, doorFront - doorLen / 2), name: 'driver' });
    }
    v.doors.push({ piv, panel, side: s, open: 0, target: 0, len: doorLen, handle, attached: true });
  }
  v.doorFront = doorFront; v.doorLen = doorLen;
  // bumpers, grille, lights
  const bm = T.chrome ? SH.chrome : SH.dark;
  for (const s of [1, -1]) {
    const b = boxMesh(W * 1.01, 0.17, 0.18, bm, 0, H * 0.25, s * (L / 2 + 0.04), body);
    v.bumpers.push({ mesh: b, side: s, hp: 160, attached: true });
  }
  if (T.hiddenLights) boxMesh(W * 0.9, H * 0.32, 0.05, SH.dark, 0, H * 0.62, L / 2 + 0.005, body);
  else boxMesh(W * 0.42, H * 0.3, 0.05, T.chrome ? SH.chrome : SH.dark, 0, H * 0.55, L / 2 + 0.005, body);
  for (const s of [1, -1]) {
    let hl;
    if (T.roundLights) { hl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 10).rotateX(Math.PI / 2), SH.head); hl.position.set(s * W * 0.37, H * 0.66, L / 2 + 0.01); body.add(hl); }
    else hl = boxMesh(T.hiddenLights ? 0.18 : 0.32, T.hiddenLights ? 0.1 : 0.16, 0.06, SH.head, s * W * 0.34, H * (T.van || T.bus ? 0.3 : 0.62), L / 2 + 0.01, body);
    v.lights.push(hl);
    boxMesh(0.36, 0.13, 0.05, v.tailMat, s * W * 0.34, H * (T.van || T.bus ? 0.3 : 0.66), -L / 2 - 0.01, body);
  }
  if (T.rearStripe) boxMesh(W * 0.6, H * 0.1, 0.05, v.tailMat, 0, H * 0.66, -L / 2 - 0.012, body);
  // style extras
  if (T.fins) for (const s of [1, -1]) { const f = boxMesh(0.07, 0.2, 1.3, v.paint, s * (W / 2 - 0.06), H + 0.08, -L / 2 + 0.7, body); f.rotation.x = -0.08; }
  if (T.trim) for (const s of [1, -1]) boxMesh(0.02, 0.04, L * 0.86, SH.chrome, s * (W / 2 + 0.012), H * 0.55, 0, body);
  if (T.scoop) boxMesh(0.55, 0.12, 0.9, T.stripes === 0x111111 ? SH.dark : v.paint, 0, H + 0.04, L / 2 - 0.95, body);
  if (T.stripes) {
    const sm = new THREE.MeshLambertMaterial({ color: T.stripes });
    for (const s of [1, -1]) { boxMesh(0.14, 0.012, L * 0.98, sm, s * 0.16, H + 0.005, 0, body); if (T.cab) { const r = boxMesh(0.14, 0.012, T.cab.len - T.cab.tf - T.cab.tr, sm, s * 0.16, H + T.cab.h + 0.006, T.cab.z + (T.cab.tr - T.cab.tf) / 2, body); } }
  }
  if (T.spoiler) { boxMesh(W * 0.9, 0.05, 0.3, v.paint, 0, H + 0.2, -L / 2 + 0.25, body); for (const s of [1, -1]) boxMesh(0.05, 0.18, 0.1, v.paint, s * W * 0.38, H + 0.09, -L / 2 + 0.25, body); }
  if (T.taxi) boxMesh(0.55, 0.18, 0.28, SH.taxiSign, 0, cabTop + 0.09, T.cab.z, body);
  if (T.bed) {
    const bz0 = T.cab.z - T.cab.len / 2, bl = bz0 + L / 2;
    for (const s of [1, -1]) boxMesh(0.06, 0.4, bl - 0.1, v.paint, s * (W / 2 - 0.03), H + 0.2, -L / 2 + bl / 2, body);
    boxMesh(W, 0.4, 0.06, v.paint, 0, H + 0.2, -L / 2 + 0.03, body);
    boxMesh(W - 0.12, 0.02, bl - 0.12, SH.dark, 0, H + 0.01, -L / 2 + bl / 2, body);
  }
  // interior: seat(s), dashboard, steering wheel
  const seatX = T.bus ? W * 0.28 : W * 0.22;
  v.seatLocal = new V3(seatX, seatY, seatZ);
  const seatMat = T.deep ? SH.seatRed : SH.interior;
  if (T.bench) { boxMesh(W * 0.82, 0.14, 0.55, seatMat, 0, seatY - 0.08, seatZ, body); boxMesh(W * 0.82, 0.55, 0.12, seatMat, 0, seatY + 0.22, seatZ - 0.32, body).rotation.x = -0.18; }
  else for (const sx of [seatX, -seatX]) { boxMesh(0.5, 0.14, 0.55, seatMat, sx, seatY - 0.08, seatZ, body); boxMesh(0.5, 0.6, 0.12, seatMat, sx, seatY + 0.24, seatZ - 0.32, body).rotation.x = -0.18; if (T.cab) boxMesh(0.26, 0.17, 0.09, seatMat, sx, seatY + 0.62, seatZ - 0.39, body).rotation.x = -0.18; }
  if (T.cab && !T.bed) {
    const rz = Math.max(seatZ - 0.82, T.cab.z - T.cab.len / 2 + 0.42);
    if (rz <= seatZ - 0.55) { boxMesh(W * 0.8, 0.14, 0.5, seatMat, 0, seatY - 0.06, rz, body); boxMesh(W * 0.8, 0.55, 0.12, seatMat, 0, seatY + 0.24, rz - 0.3, body).rotation.x = -0.2; }
  }
  const wheelZ = seatZ + 0.52, wheelY = seatY + 0.42;
  const dashZ = Math.min((T.cab ? T.cab.z + T.cab.len / 2 : L / 2) - 0.2, wheelZ + 0.4);
  boxMesh(W * 0.86, 0.2, 0.4, SH.interior, 0, Math.max(H - 0.02, wheelY - 0.12), dashZ, body);
  const sw = new THREE.Group(); sw.position.set(seatX, wheelY, wheelZ); sw.rotation.x = 0.42; body.add(sw);
  const swi = new THREE.Group(); sw.add(swi);
  swi.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 6, 18), T.chrome ? SH.chrome : SH.dark));
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.02), SH.dark); swi.add(spoke);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.35, 6).rotateX(Math.PI / 2), SH.dark); col.position.z = 0.17; sw.add(col);
  v.steerWheel = swi; v.steerWheelG = sw;
  // wheels
  const wx = W / 2 - T.ww / 2 + 0.05;
  for (const [x, z, f] of [[wx, T.wb / 2, true], [-wx, T.wb / 2, true], [wx, -T.wb / 2, false], [-wx, -T.wb / 2, false]]) v.wheels.push(makeWheel(v, x, T.wr, z, f, root));
  if (T.bus) { for (const s of [1, -1]) v.wheels.push(makeWheel(v, s * wx, T.wr, -T.wb / 2 - 1.1, false, root)); }
  v.cabTop = cabTop;
  scene.add(root);
}
function buildBikeModel(v) {
  const T = v.T, root = v.root, body = v.body;
  body.position.y = 0;
  if (T.bicycle) {
    const fm = v.paint;
    const tube = (a, b, r = 0.025) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6), fm); const d = new V3().subVectors(b, a); m.scale.y = d.length(); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); body.add(m); return m; };
    const rearA = new V3(0, T.wr, -T.wb / 2), frontA = new V3(0, T.wr, T.wb / 2), crank = new V3(0, 0.32, -0.05), seatT = new V3(0, 0.82, -0.25), headT = new V3(0, 0.82, 0.38);
    tube(rearA, crank); tube(rearA, seatT); tube(crank, seatT, 0.03); tube(crank, headT, 0.03); tube(seatT, headT);
    boxMesh(0.12, 0.05, 0.25, SH.dark, 0, 0.87, -0.27, body);
    v.crank = new THREE.Group(); v.crank.position.copy(crank); body.add(v.crank);
    boxMesh(0.02, 0.36, 0.03, SH.metal, 0.08, 0, 0, v.crank); const ped2 = boxMesh(0.02, 0.36, 0.03, SH.metal, -0.08, 0, 0, v.crank); ped2.rotation.x = Math.PI;
    v.seatLocal = new V3(0, 0.95, -0.3);
    v.barH = 1.02;
  } else {
    boxMesh(0.34, 0.26, 0.62, v.paint, 0, 0.82, 0.12, body).castShadow = true;
    boxMesh(0.3, 0.1, 0.62, SH.dark, 0, 0.8, -0.38, body);
    boxMesh(0.32, 0.34, 0.45, SH.metal, 0, 0.5, 0.05, body).castShadow = true;
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 8).rotateX(Math.PI / 2), SH.chrome); ex.position.set(-0.2, 0.38, -0.45); body.add(ex);
    boxMesh(0.2, 0.12, 0.7, v.paint, 0, T.wr * 2 + 0.03, -T.wb / 2 + 0.1, body);
    boxMesh(0.16, 0.08, 0.04, v.tailMat, 0, 0.82, -0.72, body);
    v.seatLocal = new V3(0, 0.9, -0.32);
    v.barH = 1.05;
  }
  const bar = new THREE.Group(); bar.position.set(0, v.barH, T.bicycle ? 0.4 : 0.55); bar.rotation.x = -0.35; body.add(bar);
  boxMesh(0.66, 0.035, 0.035, SH.dark, 0, 0, 0, bar);
  const fork = boxMesh(0.04, v.barH - T.wr + 0.05, 0.04, T.bicycle ? v.paint : SH.chrome, 0, -(v.barH - T.wr) / 2, 0, bar);
  if (!T.bicycle) { const hl = boxMesh(0.16, 0.13, 0.08, SH.head, 0, -0.12, 0.12, bar); v.lights.push(hl); }
  v.steerWheel = bar; v.bar = bar;
  for (const [z, f] of [[T.wb / 2, true], [-T.wb / 2, false]]) v.wheels.push(makeWheel(v, 0, T.wr, z, f, body));
  v.doors = []; v.cabTop = 1.1;
}

// ---------------------------------------------------------------- skid marks
let skidMesh = null, skidI = 0; const SKID_N = 700;
function initSkids() {
  skidMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), SH.skid, SKID_N);
  for (let i = 0; i < SKID_N; i++) skidMesh.setMatrixAt(i, _zeroM);
  skidMesh.frustumCulled = false; skidMesh.renderOrder = 1; scene.add(skidMesh);
}
function addSkid(x, z, px, pz, w) {
  const dx = x - px, dz = z - pz, l = Math.hypot(dx, dz); if (l < 0.05 || l > 3) return;
  _m4.compose(_v1.set((x + px) / 2, groundH(x, z) + 0.016, (z + pz) / 2), _q1.setFromAxisAngle(UP, Math.atan2(dx, dz)), _v2.set(w, 1, l + 0.05));
  skidMesh.setMatrixAt(skidI, _m4); skidI = (skidI + 1) % SKID_N; skidMesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- debris
const debris = [];
function spawnDebris(mesh, pos, vel, r = 0.3, life = 30, dispose = false) {
  if (pos) mesh.position.copy(pos);
  if (!mesh.parent) scene.add(mesh);
  debris.push({ mesh, vel: vel.clone(), av: new V3(rand(-7, 7), rand(-7, 7), rand(-7, 7)), r, life, dispose });
  while (debris.length > 50) removeDebris(0);
}
function removeDebris(i) { const d = debris[i]; scene.remove(d.mesh); if (d.dispose) d.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); }); debris.splice(i, 1); }
const _dq = new THREE.Quaternion();
function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.life -= dt; if (d.life <= 0) { removeDebris(i); continue; }
    d.vel.y -= 9.8 * dt; d.mesh.position.addScaledVector(d.vel, dt);
    const gh = groundH(d.mesh.position.x, d.mesh.position.z) + d.r * 0.5;
    if (d.mesh.position.y < gh) { d.mesh.position.y = gh; if (d.vel.y < 0) d.vel.y *= -0.3; d.vel.x *= 0.9; d.vel.z *= 0.9; d.av.multiplyScalar(0.85); }
    pushOutCircle(d.mesh.position, d.r, d.mesh.position.y, (c, nx, nz) => { const vn = d.vel.x * nx + d.vel.z * nz; if (vn < 0) { d.vel.x -= 1.5 * vn * nx; d.vel.z -= 1.5 * vn * nz; } });
    const al = d.av.length(); if (al > 0.01) { _dq.setFromAxisAngle(_v1.copy(d.av).multiplyScalar(1 / al), al * dt); d.mesh.quaternion.premultiply(_dq); }
  }
}
function detachPart(v, mesh, extraVel, r = 0.3) {
  if (!mesh || !mesh.parent) return;
  mesh.updateWorldMatrix(true, false);
  scene.attach(mesh);
  const vel = v.vel.clone().add(extraVel || _v1.set(rand(-2, 2), rand(2, 4), rand(-2, 2)));
  spawnDebris(mesh, null, vel, r, 35, false);
}

// ---------------------------------------------------------------- Vehicle class
let headSpot = null;
const _dmgLP = new V3(), _dmgDL = new V3(), _dmgWP = new V3();
class Vehicle {
  constructor(type, x, z, h, color) {
    this.T = CAR_TYPES[type]; this.type = type;
    this.color = color != null ? color : pick(this.T.colors);
    this.pos = new V3(x, 0, z); this.h = h || 0; this.vel = new V3(); this.prevVel = new V3(); this.yawRate = 0; this.steer = 0; this.vF = 0; this.vL = 0;
    this.health = 1000; this.dead = false; this.exploded = false; this.burnT = 0; this.smokeT = 0;
    this.susp = { y: 0, vy: 0, p: 0, vp: 0, r: 0, vr: 0 }; this.prevVF = 0;
    this.driver = null; this.ai = null; this.slip = 0; this.rpm = 0; this.braking = false; this.horn = false;
    this.pull = 0; this.poppedCount = 0; this.missingWheels = 0; this.impactCD = 0; this.honkCD = 0; this.hopCD = 0;
    this.lastSkid = [null, null]; this.lean = 0; this.parked = true; this.mission = false; this.lastHitByPlayer = 0;
    buildCarModel(this);
    const T = this.T;
    this.cr = T.bike ? 0.36 : T.wid / 2;
    const n = T.bike ? 2 : Math.max(2, Math.round(T.len / T.wid));
    this.coffs = []; for (let i = 0; i < n; i++) this.coffs.push(lerp(-(T.len / 2 - this.cr), T.len / 2 - this.cr, n === 1 ? 0.5 : i / (n - 1)));
    this.inertia = T.mass * (T.len * T.len + T.wid * T.wid) / 12;
    vehicles.push(this);
    this.syncVisual(0);
  }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  fwd(out = new V3()) { return out.set(Math.sin(this.h), 0, Math.cos(this.h)); }
  destroy() {
    const i = vehicles.indexOf(this); if (i >= 0) vehicles.splice(i, 1);
    scene.remove(this.root); this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.paint.dispose(); this.tailMat.dispose();
    if (this.driver && !this.driver.isPlayer) { this.driver.destroy(); const k = peds.indexOf(this.driver); if (k >= 0) peds.splice(k, 1); }
    this.destroyed = true;
  }
  seatMatrix(out) {
    this.body.updateMatrixWorld(true);
    _m4.makeTranslation(this.seatLocal.x, this.seatLocal.y, this.seatLocal.z);
    return out.multiplyMatrices(this.body.matrixWorld, _m4);
  }
  sideOf(p) { return ((p.x - this.pos.x) * Math.cos(this.h) - (p.z - this.pos.z) * Math.sin(this.h)) >= 0 ? 1 : -1; }
  localToWorld(x, y, z, out = new V3()) { return out.set(x, y, z).applyMatrix4(this.body.matrixWorld); }
  doorWorld(out = new V3(), outward = 0.65, side = 1) { // standing spot next to a door (side 1 = driver/left)
    const T = this.T, s = Math.sin(this.h), c = Math.cos(this.h);
    const lx = side * (T.bike ? 0.55 : T.wid / 2 + outward), lz = T.bike ? -0.1 : (this.doorFront !== undefined ? this.doorFront - this.doorLen * 0.75 : 0);
    return out.set(this.pos.x + lx * c + lz * s, 0, this.pos.z - lx * s + lz * c);
  }
  wake() { if (this.ai && (this.ai.mode === 'drive' || this.ai.mode === 'parked')) { this.ai.mode = 'phys'; this.ai.wakeT = 0; } this.parked = false; }
  // -------------------------------------------------- physics
  physicsStep(dt, ctrl) {
    const T = this.T;
    const fx = Math.sin(this.h), fz = Math.cos(this.h), lx = Math.cos(this.h), lz = -Math.sin(this.h);
    let vF = this.vel.x * fx + this.vel.z * fz, vL = this.vel.x * lx + this.vel.z * lz;
    const dead = this.health <= 0;
    const thr = dead ? 0 : ctrl.throttle, brk = ctrl.brake;
    const rate = ctrl.analog ? 7 : (2.0 + 2.6 / (1 + Math.abs(vF) * 0.08));
    this.steer += clamp(clamp(ctrl.steer, -1, 1) - this.steer, -rate * dt, rate * dt);
    const steerAng = this.steer * T.steer / (1 + Math.abs(vF) / 26);
    let acc = 0;
    const sf = clamp(vF / T.max, -1, 1);
    if (thr > 0) acc += vF < -0.5 ? thr * 18 : thr * T.power * (1 - sf * sf);
    if (brk > 0) { if (vF > 0.6) acc -= brk * 22; else if (vF > -T.max * 0.3) acc -= brk * T.power * 0.6; }
    acc -= vF * 0.12 + Math.sign(vF) * 0.3 + vF * Math.abs(vF) * 0.0012;
    if (ctrl.handbrake) acc -= Math.sign(vF) * Math.min(Math.abs(vF) / dt, 6);
    acc -= Math.sign(vF) * this.missingWheels * 3 + Math.sign(vF) * this.poppedCount * 0.6;
    if (this.ai && this.ai.mode === 'race') acc *= this.ai.rubber || 1;
    const vF0 = vF; vF += acc * dt;
    if (Math.sign(vF0) !== Math.sign(vF) && thr === 0 && brk === 0) vF = 0;
    if (Math.abs(vF) < 0.05 && thr === 0) vF = 0;
    const grip = T.grip * gripMult() * clamp(1 - this.poppedCount * 0.12 - this.missingWheels * 0.18, 0.3, 1);
    const slideK = clamp(Math.abs(vL) / 6, 0, 1);
    let latGrip = grip * (1 - 0.5 * slideK * T.drift);
    if (ctrl.handbrake) latGrip = grip * 0.16;
    if (thr > 0.5 && Math.abs(this.steer) > 0.45 && vF > 4 && vF < 32) latGrip *= 1 - T.drift * 0.4;
    vL *= Math.exp(-latGrip * dt);
    const maxLat = 10.5 * gripMult() * (ctrl.handbrake ? 1.7 : 1);
    let tgt = -vF * Math.tan(steerAng) / T.wb;
    const lim = maxLat / Math.max(2, Math.abs(vF)); tgt = clamp(tgt, -lim, lim);
    if (ctrl.handbrake && Math.abs(vF) > 6) tgt *= 1.6;
    tgt += this.pull * vF * 0.006;
    const yawGrip = ctrl.handbrake ? 2.4 : (4 + grip * 0.55) * (1 - 0.45 * slideK * T.drift);
    this.yawRate += (tgt - this.yawRate) * (1 - Math.exp(-yawGrip * dt));
    this.h += this.yawRate * dt;
    this.vel.set(fx * vF + lx * vL, 0, fz * vF + lz * vL);
    this.pos.addScaledVector(this.vel, dt);
    this.vF = vF; this.vL = vL;
    this.slip = Math.abs(vL) + (ctrl.handbrake && Math.abs(vF) > 3 ? 3 : 0) + (thr > 0.8 && vF > 0.3 && vF < 7 && T.power > 17 ? 4 : 0) + (brk > 0.5 && vF > 12 ? 1.5 : 0);
    this.braking = brk > 0 && vF > 0.5;
    const spf = Math.abs(vF) / T.max * 4, g = Math.min(3, Math.floor(spf));
    this.rpm = lerp(this.rpm, clamp((thr > 0.5 && Math.abs(vF) < 6 ? 0.9 : 0.25 + (spf - g) * 0.7) + thr * 0.1, 0, 1), 1 - Math.exp(-8 * dt));
    this.throttleVis = thr;
  }
  aiKinematic(dt) { // pos/heading set externally; keep velocity consistent
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    this.vel.set(fx * this.ai.speed, 0, fz * this.ai.speed); this.vF = this.ai.speed; this.vL = 0; this.slip = 0;
    this.braking = this.ai.braking;
  }
  syncVisual(dt) {
    const T = this.T, s = this.susp;
    this.root.position.set(this.pos.x, 0, this.pos.z); this.root.rotation.set(0, this.h, 0);
    // ground follow (curbs)
    const fx = Math.sin(this.h), fz = Math.cos(this.h), lx = Math.cos(this.h), lz = -Math.sin(this.h);
    const hw = T.bike ? 0 : T.wid * 0.4, hb = T.wb / 2;
    const gFL = groundH(this.pos.x + fx * hb + lx * hw, this.pos.z + fz * hb + lz * hw), gFR = groundH(this.pos.x + fx * hb - lx * hw, this.pos.z + fz * hb - lz * hw);
    const gRL = groundH(this.pos.x - fx * hb + lx * hw, this.pos.z - fz * hb + lz * hw), gRR = groundH(this.pos.x - fx * hb - lx * hw, this.pos.z - fz * hb - lz * hw);
    let sag = 0, sagP = 0, sagR = 0;
    this.wheels.forEach((w, i) => { if (!w.attached) { sag += 0.12; sagP += (w.front ? 1 : -1) * 0.1; sagR += w.side * 0.1; } else if (w.popped) { sag += 0.03; sagP += (w.front ? 1 : -1) * 0.025; sagR += w.side * 0.025; } });
    const gy = (gFL + gFR + gRL + gRR) / 4;
    this.groundY = lerp(this.groundY === undefined ? gy : this.groundY, gy, dt > 0 ? 1 - Math.exp(-18 * dt) : 1);
    this.root.position.y = this.groundY - sag * 0.5;
    const pitchG = Math.atan2(((gRL + gRR) - (gFL + gFR)) / 2, T.wb) + sagP * 0.5;
    const rollG = T.bike ? 0 : Math.atan2(((gFR + gRR) - (gFL + gRL)) / 2, T.wid) + sagR * 0.4;
    if (dt > 0) {
      const aLong = (this.vF - this.prevVF) / dt; this.prevVF = this.vF;
      const aLat = this.vF * this.yawRate;
      const kp = T.bike ? 0.002 : 0.006;
      const tp = clamp(-aLong * kp, -0.08, 0.08), tr = T.bike ? 0 : clamp(aLat * 0.009, -0.09, 0.09);
      s.vp += (90 * (tp - s.p) - 9 * s.vp) * dt; s.p += s.vp * dt;
      s.vr += (80 * (tr - s.r) - 8 * s.vr) * dt; s.r += s.vr * dt;
      s.vy += (-120 * s.y - 7 * s.vy) * dt; s.y += s.vy * dt;
      if (s.y < -0.12) { s.y = -0.12; s.vy = Math.abs(s.vy) * 0.3; }
    }
    if (T.bike) {
      const want = this.driver ? clamp(-this.steer * Math.abs(this.vF) * 0.035, -0.7, 0.7) : (this.fallen ? 1.35 : 0.22);
      this.lean = lerp(this.lean, want, dt > 0 ? 1 - Math.exp(-(this.fallen ? 4 : 6) * dt) : 1);
      this.body.position.y = s.y + (this.fallen ? 0.08 : 0);
      this.body.rotation.set(pitchG + s.p, 0, this.lean);
    } else {
      this.body.position.y = T.ride + s.y;
      this.body.rotation.set(pitchG + s.p, 0, rollG + s.r);
    }
    // wheels
    const steerAng = this.steer * T.steer / (1 + Math.abs(this.vF) / 26);
    for (const w of this.wheels) {
      if (!w.attached) continue;
      if (w.front) w.steer.rotation.y = -steerAng;
      w.spin.rotation.x += this.vF / T.wr * dt;
    }
    if (this.bar) this.bar.rotation.y = -steerAng * 0.9;
    else if (this.steerWheel) this.steerWheel.rotation.z = this.steer * 2.2;
    if (this.crank) this.crank.rotation.x += this.vF / 0.9 * dt;
    for (const d of this.doors) { d.open = lerp(d.open, d.target, dt > 0 ? 1 - Math.exp(-10 * dt) : 1); d.piv.rotation.y = -d.side * d.open * 1.15; }
    this.tailMat.emissiveIntensity = this.braking ? 1.4 : (env.night > 0.3 || this.lightsOn ? 0.55 : 0.18);
    if (this.exploded) this.tailMat.emissiveIntensity = 0;
  }
  // -------------------------------------------------- damage
  applyDamage(amount, wp, inX, inZ, opts = {}) {
    if (amount <= 0) return;
    const T = this.T;
    if (this.mission && this.invuln) amount *= 0.2;
    this.health -= amount;
    this.body.updateMatrixWorld(true);
    wp = _dmgWP.copy(wp);
    const lp = this.body.worldToLocal(_dmgLP.copy(wp));
    // inward direction to body-local
    const s = Math.sin(-this.h), c = Math.cos(-this.h);
    const dl = _dmgDL.set(inX * c + inZ * s, 0, -inX * s + inZ * c).normalize();
    if (!opts.noDent && !T.bike) {
      const depth = Math.min(0.32, amount * 0.0013);
      for (const d of this.deform) this.dent(d, lp, dl, depth, opts.radius || 1.1);
      for (const door of this.doors) if (door.attached && lp.x * door.side > T.wid / 2 - 0.4 && Math.abs(lp.z - (this.doorFront - door.len / 2)) < door.len) this.dentDoor(door, amount);
    }
    // glass
    for (const g of this.glass) {
      if (g.broken) continue;
      const d = g.c.distanceTo(lp);
      if ((d < 1.4 && amount > 35 + Math.random() * 50) || (amount > 160 && d < 2.4) || opts.shot && d < 0.8) this.breakGlass(g);
    }
    // bumpers
    for (const b of this.bumpers) {
      if (!b.attached) continue;
      if (lp.z * b.side > T.len / 2 - 0.9) { b.hp -= amount; if (b.hp < 0) { b.attached = false; detachPart(this, b.mesh, _v3.set(rand(-1.5, 1.5), rand(1, 3), rand(-1.5, 1.5)), 0.12); } }
    }
    // headlights
    if (lp.z > T.len / 2 - 0.6 && amount > 70) for (const l of this.lights) if (l.visible && Math.abs(l.position.x - lp.x) < 0.9 && chance(0.6)) { l.visible = false; fxGlass(wp, 6); }
    // wheels
    for (const w of this.wheels) {
      if (!w.attached) continue;
      const dx = w.x - lp.x, dz = w.z - lp.z, d = Math.hypot(dx, dz) - (T.bike ? 0 : 0.1);
      if (d < 1.0) {
        if (amount > 230 && chance(0.45)) this.detachWheel(w);
        else if (amount > 110 && !w.popped && chance(0.55)) this.popTire(w);
      }
    }
    // doors falling off
    if (amount > 260) for (const door of this.doors) if (door.attached && lp.x * door.side > T.wid / 2 - 0.3 && chance(0.35)) { door.attached = false; detachPart(this, door.piv, _v3.set(door.side * rand(1, 3), rand(1, 3), rand(-1, 1)), 0.5); }
    if (this.health <= 0 && !this.burning && !this.exploded) { this.burning = true; this.burnT = 0; }
    if (this.onDamage) this.onDamage(amount);
  }
  dent(d, lp, dl, depth, radius) {
    const pa = d.mesh.geometry.attributes.position, arr = pa.array, o = d.orig;
    let changed = false;
    for (let i = 0; i < pa.count; i++) {
      const ix = i * 3, x = arr[ix], y = arr[ix + 1], z = arr[ix + 2];
      const dx = x - lp.x, dy = (y - lp.y) * 0.8, dz = z - lp.z, dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dd > radius) continue;
      const f = (1 - dd / radius); const k = f * f * depth * (0.75 + Math.random() * 0.5);
      let nx = x + dl.x * k, ny = y - k * 0.25 * (y > d.y0 + 0.05 ? 1 : 0), nz = z + dl.z * k;
      // limit total displacement & keep from passing center
      const ox = o[ix], oy = o[ix + 1], oz = o[ix + 2];
      const mx = Math.abs(ox) * 0.55, mz = 0.7;
      nx = clamp(nx, ox - mx, ox + mx); nz = clamp(nz, oz - mz, oz + mz); ny = clamp(ny, Math.max(d.y0, oy - 0.25), oy + 0.05);
      if (Math.sign(nx) !== Math.sign(ox) && Math.abs(ox) > 0.05) nx = ox * 0.1;
      arr[ix] = nx; arr[ix + 1] = ny; arr[ix + 2] = nz; changed = true;
    }
    if (changed) { pa.needsUpdate = true; d.mesh.geometry.computeVertexNormals(); }
  }
  dentDoor(door, amount) {
    const pa = door.panel.geometry.attributes.position, arr = pa.array, k = Math.min(0.12, amount * 0.0006);
    for (let i = 0; i < pa.count; i++) if (arr[i * 3] * door.side > 0) arr[i * 3] -= door.side * k * Math.random();
    pa.needsUpdate = true; door.panel.geometry.computeVertexNormals();
  }
  breakGlass(g) {
    if (g.broken) return; g.broken = true; g.mesh.visible = false;
    g.mesh.updateWorldMatrix(true, false); const wp = new V3().setFromMatrixPosition(g.mesh.matrixWorld);
    fxGlass(wp, 30); Sound.glass(distToCam(wp.x, wp.z));
  }
  popTire(w) {
    if (w.popped || !w.attached) return; w.popped = true; this.poppedCount++;
    w.tire.scale.set(1, 0.78, 0.78); w.g.position.y = this.T.wr * 0.8;
    this.pull += w.side * 1.0;
    const wp = this.wheelWorld(w); fxDust(wp, 8, 0.4); Sound.burst({ dur: 0.3, f: 900, type: 'highpass', gain: 0.6, dist: distToCam(wp.x, wp.z) });
  }
  detachWheel(w) {
    if (!w.attached) return; w.attached = false; this.missingWheels++; if (w.popped) this.poppedCount--;
    this.pull += w.side * 2.2;
    const out = _v3.set(Math.cos(this.h) * w.side, 0, -Math.sin(this.h) * w.side).multiplyScalar(rand(2, 4)); out.y = rand(1, 3);
    detachPart(this, w.g, out, this.T.wr);
    const d = debris[debris.length - 1]; if (d) d.av.set(rand(-1, 1), 0, rand(-1, 1)).add(_v1.set(Math.cos(this.h), 0, -Math.sin(this.h)).multiplyScalar(this.vF / this.T.wr));
    const wp = this.wheelWorld(w); fxSparks(wp, 16);
  }
  wheelWorld(w, out = new V3()) { return out.set(w.x, w.y, w.z).applyMatrix4(this.root.matrixWorld); }
  onImpact(dv, point, inX, inZ, other) {
    if (dv < 2.2) return;
    const T = this.T;
    const dmg = Math.pow(Math.max(0, dv - 2.2), 1.3) * 5 * (T.bike ? 0.6 : 1);
    this.applyDamage(dmg, point, inX, inZ);
    if (this.impactCD <= 0) {
      Sound.crash(dv / 18, distToCam(point.x, point.z)); this.impactCD = 0.15;
      if (dv > 5) fxSparks(point, Math.min(30, dv * 1.5)); fxDust(point, 4, 0.5);
    }
    if (this.isPlayerCar()) { game.shake = Math.max(game.shake, Math.min(1.2, dv / 14)); if (typeof onPlayerCarImpact === 'function') onPlayerCarImpact(this, dv, inX, inZ); }
    else if (this.driver && !this.driver.dead && dv > 21 && chance(0.6) && !T.bus) ejectDriver(this, this.prevVel);
    if (this.ai && (this.ai.mode === 'drive' || this.ai.mode === 'parked') && dv > 0.5) this.wake();
  }
  isPlayerCar() { return this.driver && this.driver.isPlayer; }
  explode() {
    if (this.exploded) return;
    this.exploded = true; this.burning = false; this.health = -1;
    const p = this.pos.clone(); p.y = 1;
    this.paint.color.setHex(0x161616); this.paint.shininess = 5; this.paint.specular.setHex(0x111111);
    if (this.roofMat && this.roofMat !== this.paint) this.roofMat.color.setHex(0x1a1a1a);
    for (const g of this.glass) this.breakGlass(g);
    for (const w of this.wheels) if (w.attached && !w.popped) this.popTire(w);
    for (const l of this.lights) l.visible = false;
    this.susp.vy += 6; this.vel.y = 0; this.vel.x += rand(-2, 2); this.vel.z += rand(-2, 2);
    for (const d of this.doors) if (d.attached && chance(0.5)) { d.attached = false; detachPart(this, d.piv, _v3.set(d.side * rand(3, 6), rand(4, 8), rand(-3, 3)), 0.5); }
    for (const b of this.bumpers) if (b.attached) { b.attached = false; detachPart(this, b.mesh, _v3.set(rand(-5, 5), rand(4, 9), rand(-5, 5)), 0.12); }
    explosionAt(p, 9, this);
    if (this.ai) this.ai.mode = 'phys';
  }
  updateDamageFX(dt) {
    const T = this.T;
    this.impactCD -= dt; this.honkCD -= dt; this.hopCD -= dt;
    const near = distToCam(this.pos.x, this.pos.z) < 120;
    if (!near) { if (this.burning) { this.burnT += dt; if (this.burnT > 7.5) this.explode(); } return; }
    const ep = this.localToWorld(0, (T.bike ? 0.6 : T.h + 0.05), T.bike ? 0.1 : T.len / 2 - 0.7, _v3);
    if (this.health < 420 && !this.exploded) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) { const dark = this.health < 180; this.smokeT = dark ? 0.06 : 0.16; fxSmoke(ep.x, ep.y, ep.z, dark, dark ? 1.4 : 0.9); }
    }
    if (this.burning) {
      this.burnT += dt;
      for (let i = 0; i < 3; i++) fxFire(ep.x, ep.y, ep.z, 1.2);
      if (Math.random() < 0.5) fxSmoke(ep.x, ep.y + 0.5, ep.z, true, 1.6);
      if (this.burnT > 7.5) this.explode();
    }
    if (this.exploded) {
      this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = 0.12; fxSmoke(ep.x + rand(-1, 1), ep.y, ep.z + rand(-1, 1), true, 1.5); if (chance(0.4)) fxFire(ep.x + rand(-1, 1), ep.y, ep.z + rand(-1, 1), 0.8); }
    }
    // skids & tire smoke
    if (this.slip > 3.6 && this.speed > 2 && !T.bicycle) {
      const rear = this.wheels.filter(w => !w.front);
      rear.forEach((w, k) => {
        if (!w.attached) return;
        const wp = this.wheelWorld(w, _v4);
        const last = this.lastSkid[k];
        if (last) addSkid(wp.x, wp.z, last.x, last.z, T.ww * 0.9);
        this.lastSkid[k] = { x: wp.x, z: wp.z };
        if (Math.random() < 0.6) FX.smoke.spawn(wp.x, 0.2, wp.z, rand(-0.5, 0.5), rand(0.3, 0.9), rand(-0.5, 0.5), rand(0.5, 0.9), rand(0.8, 1.6), 0.82, 0.82, 0.84, 0.32, 1.6, 0.8, -0.2);
      });
    } else { this.lastSkid[0] = this.lastSkid[1] = null; }
    // sparks from bare rims / missing wheels
    if ((this.missingWheels > 0 || this.poppedCount > 0) && this.speed > 8) for (const w of this.wheels) if ((!w.attached || w.popped) && Math.random() < (w.attached ? 0.3 : 0.8)) { const wp = this.wheelWorld(w, _v4); wp.y = 0.05; fxSparks(wp, 2, 2); }
    // potholes
    for (const w of this.wheels) {
      w.potCD -= dt; if (!w.attached || w.potCD > 0 || this.speed < 3) continue;
      const wp = this.wheelWorld(w, _v4);
      for (const ph of world.potholes) {
        if (Math.abs(wp.x - ph.x) < ph.r && Math.abs(wp.z - ph.z) < ph.r) {
          w.potCD = 0.6; const sp = this.speed;
          this.susp.vy -= 0.6 + sp * 0.06; this.susp.vp += (w.front ? 1 : -1) * sp * 0.04; this.susp.vr += w.side * sp * 0.03;
          Sound.thud(0.35 + sp * 0.01, distToCam(wp.x, wp.z));
          if (this.isPlayerCar()) game.shake = Math.max(game.shake, 0.25 + sp * 0.012);
          if (sp > 12) this.applyDamage(sp * 0.4, wp, 0, 0, { noDent: true });
          if (sp > 24 && !w.popped && chance(0.2)) this.popTire(w);
          if (T.bike && sp > 20 && this.isPlayerCar() && chance(0.25)) onPlayerCarImpact(this, 20, 0, 0, true);
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------- collisions
const _tmpList = [];
function collideStatic(v) {
  const T = v.T, fx = Math.sin(v.h), fz = Math.cos(v.h), r = v.cr;
  let best = 0, bp = null, bnx = 0, bnz = 0;
  for (const off of v.coffs) {
    const cx = v.pos.x + fx * off, cz = v.pos.z + fz * off;
    const list = queryArea(cx - r, cz - r, cx + r, cz + r, _tmpList);
    for (const c of list) {
      const h = circleVs(v.pos.x + fx * off, v.pos.z + fz * off, r, c); if (!h) continue;
      const sp = v.speed;
      if (c.prop && sp > 3 && T.mass > 150) {
        hitProp(c.prop, v.vel.x, v.vel.z, sp);
        const k = c.prop.kind === 'lamp' ? 0.8 : 0.95; v.vel.multiplyScalar(k);
        v.applyDamage(c.prop.kind === 'lamp' ? sp * 3.5 : sp * 1.0, _v1.set(cx - h.nx * r, 0.6, cz - h.nz * r), h.nx, h.nz);
        if (v.isPlayerCar()) game.shake = Math.max(game.shake, 0.3);
        continue;
      }
      v.pos.x += h.nx * h.pen; v.pos.z += h.nz * h.pen;
      const vn = v.vel.x * h.nx + v.vel.z * h.nz;
      if (vn < 0) {
        const e = 0.2, J = -(1 + e) * vn;
        v.vel.x += J * h.nx; v.vel.z += J * h.nz;
        const tx = -h.nz, tz = h.nx, vt = v.vel.x * tx + v.vel.z * tz; v.vel.x -= tx * vt * 0.12; v.vel.z -= tz * vt * 0.12;
        const rx = (cx - h.nx * r) - v.pos.x, rz = (cz - h.nz * r) - v.pos.z;
        v.yawRate += (rz * h.nx - rx * h.nz) * J * T.mass / v.inertia * 0.6;
        if (J > best) { best = J; bp = new V3(cx - h.nx * r, T.ride + T.h * 0.5, cz - h.nz * r); bnx = h.nx; bnz = h.nz; }
      }
    }
  }
  if (bp) v.onImpact(best, bp, bnx, bnz, null);
}
function collideVehicles(a, b) {
  const dx0 = a.pos.x - b.pos.x, dz0 = a.pos.z - b.pos.z, rr0 = (a.T.len + b.T.len) / 2 + 0.5;
  if (dx0 * dx0 + dz0 * dz0 > rr0 * rr0) return;
  const fax = Math.sin(a.h), faz = Math.cos(a.h), fbx = Math.sin(b.h), fbz = Math.cos(b.h);
  let best = null;
  for (const oa of a.coffs) for (const ob of b.coffs) {
    const ax = a.pos.x + fax * oa, az = a.pos.z + faz * oa, bx = b.pos.x + fbx * ob, bz = b.pos.z + fbz * ob;
    const dx = ax - bx, dz = az - bz, rr = a.cr + b.cr, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-4, pen = rr - d; if (!best || pen > best.pen) best = { pen, nx: dx / d, nz: dz / d, px: bx + dx / d * b.cr, pz: bz + dz / d * b.cr }; }
  }
  if (!best) return;
  const ma = a.T.mass, mb = b.T.mass, inv = 1 / ma + 1 / mb;
  const { nx, nz, pen } = best;
  a.pos.x += nx * pen * (1 / ma) / inv; a.pos.z += nz * pen * (1 / ma) / inv;
  b.pos.x -= nx * pen * (1 / mb) / inv; b.pos.z -= nz * pen * (1 / mb) / inv;
  const vn = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
  a.wake(); b.wake();
  if (vn >= 0) return;
  const e = 0.22, j = -(1 + e) * vn / inv;
  a.vel.x += nx * j / ma; a.vel.z += nz * j / ma; b.vel.x -= nx * j / mb; b.vel.z -= nz * j / mb;
  const rax = best.px - a.pos.x, raz = best.pz - a.pos.z, rbx = best.px - b.pos.x, rbz = best.pz - b.pos.z;
  a.yawRate += (raz * nx - rax * nz) * j / a.inertia * 0.7;
  b.yawRate -= (rbz * nx - rbx * nz) * j / b.inertia * 0.7;
  const p = new V3(best.px, Math.min(a.T.h, b.T.h) * 0.5 + 0.3, best.pz);
  if (a.isPlayerCar()) b.lastHitByPlayer = game.time; if (b.isPlayerCar()) a.lastHitByPlayer = game.time;
  a.onImpact(j / ma, p, nx, nz, b); b.onImpact(j / mb, p, -nx, -nz, a);
}
function collideVehicleChars(v) {
  const T = v.T, fx = Math.sin(v.h), fz = Math.cos(v.h), lx = Math.cos(v.h), lz = -Math.sin(v.h);
  const hl = T.len / 2 + 0.25, hw = T.wid / 2 + 0.25, R = hl + 1.5;
  const sp = v.speed;
  for (const ch of chars) {
    if (ch.vehicle || ch.sitMatrix || ch.inside || ch.destroyed || ch.noCollide) continue;
    const c = ch.ragdoll ? ch.ragdoll.p[J.PELV] : ch.pos;
    const dx = c.x - v.pos.x, dz = c.z - v.pos.z; if (dx * dx + dz * dz > R * R) continue;
    if (ch.ragdoll) { if (ch.ignoreVehicle !== v) ragdollVsVehicle(ch, v); continue; }
    const lf = dx * fx + dz * fz, ll = dx * lx + dz * lz;
    if (Math.abs(lf) > hl || Math.abs(ll) > hw) continue;
    const pf = hl - Math.abs(lf), pl = hw - Math.abs(ll);
    let nx, nz, pen;
    if (pf < pl) { const s = Math.sign(lf) || 1; nx = fx * s; nz = fz * s; pen = pf; } else { const s = Math.sign(ll) || 1; nx = lx * s; nz = lz * s; pen = pl; }
    const rel = (v.vel.x - ch.vel.x) * nx + (v.vel.z - ch.vel.z) * nz;
    if (rel > 2.6 && sp > 2.4) hitCharByCar(ch, v, rel, nx, nz);
    else { ch.pos.x += nx * pen; ch.pos.z += nz * pen; if (ch.ai && rel > 0.8) pedScare(ch, v.pos); }
  }
}
function hitCharByCar(ch, v, rel, nx, nz) {
  const byPlayer = v.isPlayerCar();
  const T = v.T;
  if (rel < 4.6 && !ch.dead) {
    ch.vel.set(v.vel.x * 0.7 + nx * 1.5, 0, v.vel.z * 0.7 + nz * 1.5);
    ch.hitJerk(_v1.set(nx, 0, nz), 0.9); ch.stumbleT = 0.8;
    ch.takeDamage(rel * 3, _v1, byPlayer ? 'player' : 'car');
    if (ch.ai) pedFlee(ch, v.pos);
    Sound.thud(0.4, distToCam(ch.pos.x, ch.pos.z));
  } else {
    const up = 1.2 + rel * (T.bike ? 0.2 : 0.3);
    const vel = _v1.set(v.vel.x * 1.05 + nx * 1.5, up, v.vel.z * 1.05 + nz * 1.5);
    ch.goRagdoll(vel, rel * 0.7);
    const dmg = rel * rel * 0.9 + rel * 2;
    ch.takeDamage(dmg, _v2.set(nx, 0, nz), byPlayer ? 'player' : 'car');
    fxBlood(ch.center(_v3), _v2, Math.min(30, rel * 2));
    Sound.thud(Math.min(1, 0.4 + rel * 0.04), distToCam(ch.pos.x, ch.pos.z)); Sound.flesh(distToCam(ch.pos.x, ch.pos.z));
    const slow = Math.min(0.3, 75 / T.mass); v.vel.multiplyScalar(1 - slow);
    v.applyDamage(rel * 1.4, _v3.set(ch.pos.x, 0.7, ch.pos.z), -nx, -nz, { noDent: rel < 9 });
    if (rel > 12 && v.windshield && !v.windshield.broken && chance(0.6) && !T.bike) v.breakGlass(v.windshield);
    if (byPlayer) game.shake = Math.max(game.shake, 0.35);
    if (T.bike && byPlayer && rel > 9 && typeof onPlayerCarImpact === 'function') onPlayerCarImpact(v, rel * 1.3, -nx, -nz, true);
  }
  if (ch.ai) pedsPanic(ch.pos, 25, v.pos);
  if (ch.isPlayer && typeof onPlayerHitByCar === 'function') onPlayerHitByCar(v, rel);
}
function ragdollVsVehicle(ch, v) {
  const T = v.T, fx = Math.sin(v.h), fz = Math.cos(v.h), lx = Math.cos(v.h), lz = -Math.sin(v.h);
  const rd = ch.ragdoll, top = v.root.position.y + (T.bike ? 1.0 : (v.cabTop + T.ride));
  const hl = T.len / 2, hw = T.wid / 2;
  let hits = 0;
  for (let i = 0; i < NJ; i++) {
    const p = rd.p[i]; if (p.y > top + 0.1) continue;
    const dx = p.x - v.pos.x, dz = p.z - v.pos.z, lf = dx * fx + dz * fz, ll = dx * lx + dz * lz;
    if (Math.abs(lf) > hl || Math.abs(ll) > hw) continue;
    const pf = hl - Math.abs(lf), pl = hw - Math.abs(ll), pt = top - p.y;
    if (pt < Math.min(pf, pl) || p.y > top * 0.55) { p.y = top + 0.02; }
    else if (pf < pl) { const s = Math.sign(lf) || 1; p.x += fx * s * pf; p.z += fz * s * pf; }
    else { const s = Math.sign(ll) || 1; p.x += lx * s * pl; p.z += lz * s * pl; }
    const o = rd.o[i]; o.x = p.x - v.vel.x * RD_DT * 0.9; o.z = p.z - v.vel.z * RD_DT * 0.9; if (o.y > p.y) o.y = p.y - 0.01;
    hits++;
  }
  if (hits > 2 && v.speed > 3) {
    rd.restT = 0;
    v.susp.vy += 0.25; if (v.isPlayerCar() && Math.random() < 0.1) game.shake = Math.max(game.shake, 0.25);
    ch.runOverCD = (ch.runOverCD || 0) - 1 / 60;
    if (ch.runOverCD <= 0) { ch.runOverCD = 0.3; ch.takeDamage(v.speed * 2.5, null, v.isPlayerCar() ? 'player' : 'car'); fxBlood(rd.p[J.PELV], null, 6); Sound.thud(0.3, distToCam(v.pos.x, v.pos.z)); }
  }
}
function explosionAt(p, radius, srcVehicle) {
  for (let i = 0; i < 70; i++) FX.glow.spawn(p.x + rand(-1, 1), p.y + rand(-0.5, 1), p.z + rand(-1, 1), rand(-8, 8), rand(2, 12), rand(-8, 8), rand(1, 2.2), rand(0.4, 1.0), 1, rand(0.4, 0.8), 0.1, 1, 1.5, 2.2, 2);
  for (let i = 0; i < 40; i++) FX.smoke.spawn(p.x + rand(-2, 2), p.y + rand(0, 2), p.z + rand(-2, 2), rand(-3, 3), rand(2, 6), rand(-3, 3), rand(1.5, 3), rand(2.5, 5), 0.08, 0.08, 0.08, 0.75, 1.5, 1.2, -0.3);
  fxSparks(p, 40, 10);
  const d = distToCam(p.x, p.z); Sound.explosion(d);
  game.shake = Math.max(game.shake, clamp(2.2 - d / 25, 0, 2));
  if (typeof flashLight === 'function') flashLight(p, 1);
  for (const ch of chars) {
    if (ch.inside || ch.destroyed) continue;
    const c = ch.center(_v1), dd = c.distanceTo(p); if (dd > radius) continue;
    const k = 1 - dd / radius; const dir = _v2.subVectors(c, p).normalize();
    if (ch.vehicle) { if (ch.vehicle === srcVehicle) { if (ch.isPlayer) playerExplodedInCar(ch.vehicle); else ch.takeDamage(999); } continue; }
    ch.goRagdoll(_v3.copy(dir).multiplyScalar(k * 14).add(_v4.set(0, 4 + k * 8, 0)), 6);
    ch.takeDamage(k * 160, dir, srcVehicle && srcVehicle.lastHitByPlayer > game.time - 30 ? 'player' : 'boom');
    if (ch.ai) pedFlee(ch, p);
  }
  for (const v of vehicles) {
    if (v === srcVehicle) continue;
    const dd = Math.hypot(v.pos.x - p.x, v.pos.z - p.z); if (dd > radius + 2) continue;
    const k = 1 - dd / (radius + 2), nx = (v.pos.x - p.x) / (dd || 1), nz = (v.pos.z - p.z) / (dd || 1);
    v.vel.x += nx * k * 9000 / v.T.mass; v.vel.z += nz * k * 9000 / v.T.mass; v.yawRate += rand(-2, 2) * k; v.susp.vy += k * 4;
    v.applyDamage(k * 420, _v1.set(v.pos.x - nx, 0.8, v.pos.z - nz), nx, nz); v.wake();
  }
  pedsPanic(p, 60, p);
}
function ejectDriver(v, vel) {
  const d = v.driver; if (!d || d.isPlayer) return;
  v.driver = null;
  if (v.windshield) v.breakGlass(v.windshield);
  d.vehicle = null; d.sitMatrix = null;
  const f = v.fwd(_v1);
  d.goRagdoll(_v2.copy(vel).multiplyScalar(0.9).add(_v3.set(0, 3.5, 0)).addScaledVector(f, 2), 5);
  for (const j of d.ragdoll.p) j.addScaledVector(f, 0.5).y += 0.5;
  for (const j of d.ragdoll.o) j.addScaledVector(f, 0.5).y += 0.5;
  d.takeDamage(rand(40, 120), f, 'car');
  if (d.ai) d.ai.mode = 'flee';
}

// ---------------------------------------------------------------- AI traffic
function aiNextNode(axis, along, dir) { const t = (along + HALF) / PITCH; return dir > 0 ? Math.floor(t + 1e-6) + 1 : Math.ceil(t - 1e-6) - 1; }
function aiPlace(v) {
  const a = v.ai, fixed = laneFixed(a.axis, a.roadK, a.dir, a.lane) + a.lat;
  if (a.axis === 'x') v.pos.set(a.along, 0, fixed); else v.pos.set(fixed, 0, a.along);
  v.h = axisHeading(a.axis, a.dir);
}
function setupAI(v, axis, roadK, dir, lane, along, driver) {
  v.ai = { mode: 'drive', axis, roadK, dir, lane, along, next: aiNextNode(axis, along, dir), turn: null, plan: null, speed: 0, cruise: rand(10, 14.5) * (v.T.bus ? 0.75 : 1) * (v.T.bicycle ? 0.5 : 1), lat: 0, honkT: 0, blockT: 0, wakeT: 0, braking: false };
  v.driver = driver; v.parked = false; aiPlace(v);
}
const RIGHT_TURN = { 'z1': ['x', -1], 'z-1': ['x', 1], 'x1': ['z', 1], 'x-1': ['z', -1] };
function aiDecide(v) {
  const a = v.ai, n = a.next, opts = [];
  if (n + a.dir >= 0 && n + a.dir <= NB) opts.push(['S', 0.58]);
  const r = RIGHT_TURN[a.axis + a.dir];
  if (a.roadK + r[1] >= 0 && a.roadK + r[1] <= NB) opts.push(['R', 0.22]);
  if (a.roadK - r[1] >= 0 && a.roadK - r[1] <= NB && !v.T.bus) opts.push(['L', 0.2]);
  let tot = opts.reduce((s, o) => s + o[1], 0), x = Math.random() * tot;
  for (const o of opts) { x -= o[1]; if (x <= 0) { a.plan = o[0]; break; } }
  if (!a.plan) a.plan = opts[0] ? opts[0][0] : 'R';
  const wantLane = a.plan === 'R' ? 1 : (a.plan === 'L' ? 0 : a.lane);
  if (wantLane !== a.lane) { const old = laneFixed(a.axis, a.roadK, a.dir, a.lane); a.lane = wantLane; a.lat += old - laneFixed(a.axis, a.roadK, a.dir, a.lane); }
}
function aiStartTurn(v) {
  const a = v.ai, n = a.next, r = RIGHT_TURN[a.axis + a.dir];
  const nAxis = r[0], nDir = a.plan === 'R' ? r[1] : -r[1], nLane = a.plan === 'R' ? 1 : 0;
  const F0 = laneFixed(a.axis, a.roadK, a.dir, a.lane), F1 = laneFixed(nAxis, n, nDir, nLane);
  const along0 = a.along, along1 = rp(a.roadK) + nDir * RH;
  const P0 = a.axis === 'x' ? new V3(along0, 0, F0 + a.lat) : new V3(F0 + a.lat, 0, along0);
  const P2 = nAxis === 'x' ? new V3(along1, 0, F1) : new V3(F1, 0, along1);
  const Cp = a.axis === 'z' ? new V3(F0, 0, F1) : new V3(F1, 0, F0);
  let len = 0, prev = P0.clone(); for (let i = 1; i <= 8; i++) { const t = i / 8; const p = bez(P0, Cp, P2, t, new V3()); len += p.distanceTo(prev); prev = p; }
  a.turn = { P0, Cp, P2, t: 0, len, axis: nAxis, dir: nDir, lane: nLane, roadK: n, along: along1 };
  a.lat = 0;
}
function bez(a, b, c, t, out) { const u = 1 - t; return out.set(u * u * a.x + 2 * u * t * b.x + t * t * c.x, 0, u * u * a.z + 2 * u * t * b.z + t * t * c.z); }
function aiDrive(v, dt) {
  const a = v.ai, T = v.T;
  let target = a.cruise;
  const f = v.fwd(_v1), lx = f.z, lz = -f.x;
  // obstacles ahead
  let blockedByPlayer = false;
  for (const o of vehicles) {
    if (o === v) continue;
    const rx = o.pos.x - v.pos.x, rz = o.pos.z - v.pos.z; if (rx * rx + rz * rz > 38 * 38) continue;
    const ahead = rx * f.x + rz * f.z; if (ahead <= 0) continue;
    const lat = rx * lx + rz * lz; if (Math.abs(lat) > (a.turn ? 3.2 : 2.3)) continue;
    const gap = ahead - (T.len + o.T.len) / 2;
    const t = Math.max(0, gap - 2.6) * 1.1 + (o.ai && o.ai.mode === 'drive' ? Math.min(o.ai.speed, 6) * 0.5 : 0);
    if (t < target) { target = t; blockedByPlayer = o.isPlayerCar(); }
  }
  for (const ch of chars) {
    if (ch.vehicle || ch.sitMatrix || ch.inside || ch.destroyed) continue;
    const c = ch.ragdoll ? ch.ragdoll.p[J.PELV] : ch.pos;
    const rx = c.x - v.pos.x, rz = c.z - v.pos.z; if (rx * rx + rz * rz > 18 * 18) continue;
    const ahead = rx * f.x + rz * f.z; if (ahead <= 0) continue;
    const lat = rx * lx + rz * lz; if (Math.abs(lat) > T.wid / 2 + 0.8) continue;
    const t = Math.max(0, ahead - T.len / 2 - 1.8) * 1.4; if (t < target) { target = t; blockedByPlayer = blockedByPlayer || ch.isPlayer; }
  }
  if (a.turn) {
    target = Math.min(target, a.plan === 'R' ? 6.5 : 8);
    a.speed = target > a.speed ? Math.min(target, a.speed + 3 * dt) : Math.max(target, a.speed - 10 * dt);
    const tr = a.turn; tr.t += a.speed * dt / tr.len;
    if (tr.t >= 1) {
      a.axis = tr.axis; a.dir = tr.dir; a.lane = tr.lane; a.roadK = tr.roadK; a.along = tr.along + tr.dir * (tr.t - 1) * tr.len; a.turn = null; a.plan = null;
      a.next = aiNextNode(a.axis, a.along, a.dir); aiPlace(v);
    } else {
      const p = bez(tr.P0, tr.Cp, tr.P2, tr.t, _v2), p2 = bez(tr.P0, tr.Cp, tr.P2, Math.min(1, tr.t + 0.02), _v3);
      v.pos.set(p.x, 0, p.z); const nh = Math.atan2(p2.x - p.x, p2.z - p.z);
      v.yawRate = wrapAng(nh - v.h) / Math.max(dt, 1e-3); v.h = nh; v.steer = clamp(-v.yawRate * 0.6, -1, 1);
    }
  } else {
    const c = rp(a.next), distC = (c - a.along) * a.dir;
    if (!a.plan && distC < 30) aiDecide(v);
    if (distC > RH && distC < 50) {
      const s = lightState(a.axis), stopAt = distC - STOP_D - T.len / 2;
      if (s !== 'G' && !(s === 'Y' && stopAt < 4) && stopAt > -1.5) { const t = stopAt < 0.4 ? 0 : Math.sqrt(2 * 5 * Math.max(0, stopAt - 0.4)); target = Math.min(target, t); }
      if (a.plan !== 'S' && distC < 22) target = Math.min(target, 8);
    }
    a.speed = target > a.speed ? Math.min(target, a.speed + 3.2 * dt) : Math.max(target, a.speed - 10 * dt);
    a.along += a.dir * a.speed * dt;
    a.lat *= Math.exp(-1.6 * dt);
    const ndist = (c - a.along) * a.dir;
    if (a.plan && a.plan !== 'S' && ndist <= RH) aiStartTurn(v);
    else if (ndist < 0) { a.next += a.dir; a.plan = null; if (a.next < 0 || a.next > NB) { a.next = clamp(a.next, 0, NB); a.dir = -a.dir; } }
    if (!a.turn) { aiPlace(v); v.yawRate = 0; v.steer = lerp(v.steer, clamp(-a.lat * 0.3, -0.4, 0.4), 0.1); }
  }
  a.braking = a.speed < a.cruise - 1 && target < a.speed + 0.1;
  // honk at the player
  if (blockedByPlayer && a.speed < 0.5) { a.blockT += dt; if (a.blockT > 2.2 && v.honkCD <= 0) { v.honkCD = rand(2.5, 4.5); Sound.honk(distToCam(v.pos.x, v.pos.z)); } } else a.blockT = 0;
  v.aiKinematic(dt);
}
function aiTryRejoin(v) {
  const a = v.ai, x = v.pos.x, z = v.pos.z, f = v.fwd(_v1);
  let axis = null, dir = 0;
  if (inRoadBand(x) && !inRoadBand(z) && Math.abs(f.z) > 0.8) { axis = 'z'; dir = Math.sign(f.z); }
  else if (inRoadBand(z) && !inRoadBand(x) && Math.abs(f.x) > 0.8) { axis = 'x'; dir = Math.sign(f.x); }
  if (!axis) return false;
  const fixed = axis === 'z' ? x : z, along = axis === 'z' ? z : x, roadK = Math.round((fixed + HALF) / PITCH);
  let bestL = -1, bd = 99;
  for (let l = 0; l < 2; l++) { const d = Math.abs(laneFixed(axis, roadK, dir, l) - fixed); if (d < bd) { bd = d; bestL = l; } }
  if (bd > 2.6) return false;
  a.mode = 'drive'; a.axis = axis; a.dir = dir; a.roadK = roadK; a.lane = bestL; a.along = along; a.lat = fixed - laneFixed(axis, roadK, dir, bestL);
  a.next = aiNextNode(axis, along, dir); a.turn = null; a.plan = null; a.speed = 0; v.vel.set(0, 0, 0); v.yawRate = 0;
  return true;
}
function updateVehicleAI(v, dt) {
  const a = v.ai;
  if (a.mode === 'drive') {
    if (!v.driver || v.driver.dead || v.health <= 0) { v.wake(); return; }
    aiDrive(v, dt);
  } else if (a.mode === 'phys') {
    v.physicsStep(dt, { throttle: 0, brake: v.driver && !v.driver.dead ? 0.6 : 0.15, steer: 0, handbrake: false });
    a.wakeT += dt;
    if (a.wakeT > 3 && v.speed < 0.8 && v.driver && !v.driver.dead) {
      if (v.health > 480 && v.poppedCount === 0 && v.missingWheels === 0 && a.wakeT < 12 && chance(0.03)) { aiTryRejoin(v); }
      else if (a.wakeT > 4.5 && chance(0.02)) driverExits(v, true);
    }
  } else if (a.mode === 'parked') {
    // nothing
  } else if (a.mode === 'race' && typeof raceAI === 'function') raceAI(v, dt);
}
function driverExits(v, scared) {
  const d = v.driver; if (!d || d.isPlayer) return;
  v.driver = null; d.vehicle = null; d.sitMatrix = null; d.anim.reach = d.anim.reachL = d.anim.footL = d.anim.footR = null;
  v.doorWorld(d.pos); d.pos.y = groundH(d.pos.x, d.pos.z); d.yaw = v.h + Math.PI / 2;
  d.startBlend(0.45);
  if (v.doors[0]) { v.doors[0].target = 1; setTimeout(() => { if (v.doors[0]) v.doors[0].target = 0; }, 900); }
  if (d.ai) { if (scared) pedFlee(d, v.pos); else d.ai.mode = 'return'; }
  if (v.ai) v.ai.mode = 'phys';
}
function spawnTrafficCar(type, axis, roadK, dir, lane, along) {
  const v = new Vehicle(type, 0, 0, 0);
  const drv = spawnPed(0, 0, { driver: true });
  drv.vehicle = v; drv.seatKind = v.T.bike ? 'bike' : 'car'; drv.sitMatrix = new THREE.Matrix4(); drv.ai.mode = 'driving';
  setupAI(v, axis, roadK, dir, lane, along, drv);
  v.syncVisual(0);
  return v;
}
