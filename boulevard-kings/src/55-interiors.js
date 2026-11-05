// ============================================================================
//  INTERIORS — enterable stores, built far from the city and swapped in
// ============================================================================
const interiors = {};
const ROOM_W = 14, ROOM_D = 12, ROOM_H = 4.2;
function floorTex(kind) {
  return canvasTex(128, 128, (g, w, h) => {
    if (kind === 'checker') { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#e8e4dc' : '#2a2a2e'; g.fillRect(x * 32, y * 32, 32, 32); } }
    else if (kind === 'wood') { noiseFill(g, w, h, '#8a5a34', 0.12, 2000, 2); g.fillStyle = 'rgba(40,20,10,0.35)'; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 2); }
    else noiseFill(g, w, h, '#77746c', 0.15, 3000, 2);
  });
}
function buildInterior(store) {
  if (interiors[store.id]) return interiors[store.id];
  const idx = STORES.indexOf(store), ox = 3000 + idx * 60, oz = 3000;
  const grp = new THREE.Group(); grp.position.set(ox, 0, oz); scene.add(grp);
  const type = store.type;
  const fk = type === 'diner' || type === 'mart' ? 'checker' : (type === 'clothes' ? 'wood' : 'concrete');
  const ft = floorTex(fk); ft.repeat.set(ROOM_W / 2, ROOM_D / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), new THREE.MeshLambertMaterial({ map: ft })); floor.rotation.x = -Math.PI / 2; floor.position.y = CURB + 0.001; floor.receiveShadow = true; grp.add(floor);
  const wallCol = { mart: 0xe9e2cf, guns: 0x5a5148, diner: 0xf1d9a8, clothes: 0xe6d6e6 }[type];
  const wm = new THREE.MeshLambertMaterial({ color: wallCol });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), new THREE.MeshLambertMaterial({ color: 0xdedad2 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = ROOM_H; grp.add(ceil);
  const hw = ROOM_W / 2, hd = ROOM_D / 2;
  const walls = [[-hw - 0.2, -hd, -hw, hd], [hw, -hd, hw + 0.2, hd], [-hw, hd, hw, hd + 0.2], [-hw, -hd - 0.2, -1.1, -hd], [1.1, -hd - 0.2, hw, -hd]];
  for (const [x0, z0, x1, z1] of walls) { boxMesh(x1 - x0, ROOM_H, z1 - z0, wm, (x0 + x1) / 2, ROOM_H / 2, (z0 + z1) / 2, grp); addBox(ox + x0, oz + z0, ox + x1, oz + z1, ROOM_H); }
  boxMesh(2.2, ROOM_H - 2.5, 0.2, wm, 0, 2.5 + (ROOM_H - 2.5) / 2, -hd - 0.1, grp);
  const door = boxMesh(2.2, 2.5, 0.06, new THREE.MeshLambertMaterial({ color: 0x9ab8c8, emissive: 0xfff0d0, emissiveIntensity: 0.55 }), 0, 1.25, -hd - 0.15, grp);
  addBox(ox - 1.1, oz - hd - 0.6, ox + 1.1, oz - hd - 0.25, 3);
  // lights
  const lm = new THREE.MeshBasicMaterial({ color: 0xfffbea });
  for (const x of [-4, 0, 4]) for (const z of [-3, 1.5]) boxMesh(1.6, 0.05, 0.5, lm, x, ROOM_H - 0.03, z, grp);
  // trim
  boxMesh(ROOM_W, 0.3, 0.05, new THREE.MeshLambertMaterial({ color: new THREE.Color(store.color) }), 0, ROOM_H - 0.5, hd - 0.03, grp);
  const solid = (w, h, d, mat, x, y, z) => { const m = boxMesh(w, h, d, mat, x, y, z, grp); m.castShadow = true; addBox(ox + x - w / 2, oz + z - d / 2, ox + x + w / 2, oz + z + d / 2, h + y - h / 2); return m; };
  const counterMat = new THREE.MeshLambertMaterial({ color: type === 'guns' ? 0x2a2a2a : (type === 'diner' ? 0xb02a20 : 0x7a5a3a) });
  solid(7, 1.05, 0.8, counterMat, 0, 0.52 + CURB, 3.4);
  boxMesh(7.1, 0.06, 0.9, new THREE.MeshLambertMaterial({ color: type === 'diner' ? 0xe8e8e8 : 0x3a3a3a }), 0, 1.08 + CURB, 3.4, grp);
  boxMesh(0.45, 0.3, 0.35, SH.dark, 2, 1.26 + CURB, 3.4, grp); // register
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshBasicMaterial({ map: signTexture(store.name, store.color) })); sign.position.set(0, 3.2, hd - 0.06); sign.rotation.y = Math.PI; grp.add(sign);
  const npcSpots = [];
  const colorBoxes = (cx, cz, w, d, h, rows, horiz) => {
    const gb = new GeoB(true);
    for (let r = 0; r < rows; r++) for (let k = 0; k < 10; k++) {
      gb.color(new THREE.Color().setHSL(Math.random(), 0.65, 0.5).getHex());
      const y = 0.35 + r * (h / rows) + CURB, sz = rand(0.15, 0.3);
      if (horiz) { const x = cx - w / 2 + (k + 0.5) * w / 10; gb.box(x - 0.1, y, cz - d / 2 + 0.05, x + 0.1, y + sz, cz + d / 2 - 0.05, {}); }
      else { const z = cz - d / 2 + (k + 0.5) * d / 10; gb.box(cx - w / 2 + 0.05, y, z - 0.1, cx + w / 2 - 0.05, y + sz, z + 0.1, {}); }
    }
    grp.add(new THREE.Mesh(gb.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
  };
  if (type === 'mart') {
    for (const x of [-3.6, 3.6]) { solid(0.9, 1.9, 5.2, new THREE.MeshLambertMaterial({ color: 0xcfcfcf }), x, 0.95 + CURB, -1.2); colorBoxes(x, -1.2, 1.0, 5.0, 1.6, 4, false); }
    const fridge = new THREE.MeshLambertMaterial({ color: 0xbfe4ff, emissive: 0x8ac8ff, emissiveIntensity: 0.6 });
    solid(0.8, 2.3, 8, fridge, -hw + 0.45, 1.15 + CURB, -0.5); colorBoxes(-hw + 0.95, -0.5, 0.1, 7.6, 1.8, 5, false);
    npcSpots.push(new V3(0, 0, -1.2), new V3(-5, 0, 2), new V3(5.6, 0, -3), new V3(-2, 0, -4));
  } else if (type === 'guns') {
    const glassTop = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 0.8), new THREE.MeshPhongMaterial({ color: 0x99bbcc, transparent: true, opacity: 0.4, shininess: 100 })); glassTop.position.set(0, 1.25 + CURB, 3.4); grp.add(glassTop);
    const pegs = boxMesh(10, 2.2, 0.08, new THREE.MeshLambertMaterial({ color: 0x8a6a4a }), 0, 2.3, hd - 0.1, grp);
    for (let k = 0; k < 6; k++) { const g = makeGunMesh(k % 2 ? 'rifle' : 'pistol'); scene.remove(g); g.scale.setScalar(1.7); g.position.set(-4 + k * 1.6, 2.6 - (k % 2) * 0.7, hd - 0.2); g.rotation.y = Math.PI / 2; grp.add(g); }
    for (let k = 0; k < 4; k++) boxMesh(0.4, 0.25, 0.3, new THREE.MeshLambertMaterial({ color: 0x4a5a2a }), -2.4 + k * 1.2, 1.25 + CURB, 3.4, grp);
    const tgt = canvasTex(128, 128, g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); for (let r = 60; r > 0; r -= 12) { g.fillStyle = (r / 12) % 2 ? '#c0281e' : '#fff'; g.beginPath(); g.arc(64, 64, r, 0, TAU); g.fill(); } }, false);
    for (const x of [-6.9, 6.9]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshLambertMaterial({ map: tgt })); p.position.set(x, 2.2, 0); p.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; grp.add(p); }
    npcSpots.push(new V3(-4, 0, 0), new V3(4, 0, 1));
  } else if (type === 'diner') {
    const red = new THREE.MeshLambertMaterial({ color: 0xc0281e }), white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    for (let k = -2; k <= 2; k++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10), red); st.position.set(k * 1.3, 0.72 + CURB, 2.6); grp.add(st); boxMesh(0.06, 0.65, 0.06, SH.chrome, k * 1.3, 0.35 + CURB, 2.6, grp); }
    for (const s of [-1, 1]) for (const z of [-3.5, -0.5]) {
      solid(1.4, 0.06, 1.0, white, s * 5.6, 0.78 + CURB, z);
      solid(1.6, 0.5, 0.6, red, s * 5.6, 0.25 + CURB, z - 1.0); solid(1.6, 0.5, 0.6, red, s * 5.6, 0.25 + CURB, z + 1.0);
      boxMesh(1.6, 0.6, 0.15, red, s * 5.6, 0.8 + CURB, z - 1.3, grp); boxMesh(1.6, 0.6, 0.15, red, s * 5.6, 0.8 + CURB, z + 1.3, grp);
      npcSpots.push(new V3(s * 5.6, 0, z - 1.0));
    }
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.2), new THREE.MeshBasicMaterial({ map: signTexture('BURGERS · TACOS · SHAKES', '#ffe070') })); menu.position.set(0, 2.3, hd - 0.07); menu.rotation.y = Math.PI; grp.add(menu);
  } else if (type === 'clothes') {
    for (const [x, z] of [[-4, -2], [4, -2], [-4, 1.2], [4, 1.2]]) {
      boxMesh(2.6, 0.04, 0.04, SH.chrome, x, 1.6 + CURB, z, grp); boxMesh(0.04, 1.6, 0.04, SH.chrome, x - 1.3, 0.8 + CURB, z, grp); boxMesh(0.04, 1.6, 0.04, SH.chrome, x + 1.3, 0.8 + CURB, z, grp);
      addBox(ox + x - 1.3, oz + z - 0.3, ox + x + 1.3, oz + z + 0.3, 1.7);
      for (let k = 0; k < 8; k++) boxMesh(0.06, 0.7, 0.5, new THREE.MeshLambertMaterial({ color: pick(SHIRTS) }), x - 1.1 + k * 0.31, 1.2 + CURB, z, grp);
    }
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), new THREE.MeshPhongMaterial({ color: 0xcfe0ea, shininess: 120, specular: 0xffffff })); mirror.position.set(hw - 0.06, 1.4, -3.5); mirror.rotation.y = -Math.PI / 2; grp.add(mirror);
    npcSpots.push(new V3(-4, 0, -0.4), new V3(4, 0, -0.4), new V3(0, 0, -2));
  }
  grp.visible = false;
  const I = { store, grp, origin: new V3(ox, 0, oz), entry: new V3(ox, CURB, oz - hd + 1.4), exit: new V3(ox, CURB, oz - hd + 0.6), shop: new V3(ox, CURB, oz + 2.3), npcSpots: npcSpots.map(p => p.add(new V3(ox, 0, oz))), npcs: [] };
  interiors[store.id] = I;
  return I;
}
function populateInterior(I) {
  const clerk = spawnPed(I.origin.x + rand(-1, 1), I.origin.z + 4.4, { mode: 'clerk', face: Math.PI, colors: Object.assign(randomColors(), I.store.type === 'guns' ? { shirt: 0x3a4a2a } : (I.store.type === 'diner' ? { shirt: 0xffffff, hat: 0xc0281e } : {})) });
  clerk.inside = I.store.id; clerk.ai.face = Math.PI; I.npcs.push(clerk);
  if (I.store.type === 'guns') { equipGun(clerk, 'pistol'); clerk.hideGun = true; clerk.ai.armed = true; }
  const n = I.store.type === 'guns' ? 1 : randi(1, 3);
  for (let k = 0; k < n; k++) {
    const p = pick(I.npcSpots);
    const c = spawnPed(p.x + rand(-0.5, 0.5), p.z + rand(-0.5, 0.5), { mode: 'browse' });
    c.inside = I.store.id; c.ai.points = I.npcSpots; c.ai.target.copy(pick(I.npcSpots)); c.ai.timer = rand(0, 3); I.npcs.push(c);
  }
  if (I.store.type === 'clothes') for (const x of [-1.5, 1.5]) { const m = spawnPed(I.origin.x + x, I.origin.z + 0.3, { mode: 'still', face: Math.PI }); m.inside = I.store.id; m.colors = { skin: 0xdddddd, shirt: pick(SHIRTS), pants: pick(PANTS), shoes: 0x222222, hair: 0xdddddd }; m.noCollide = false; I.npcs.push(m); }
  for (const c of I.npcs) c.pos.y = CURB;
}
function clearInterior(I) { for (const c of I.npcs) removePed(c); I.npcs.length = 0; }
