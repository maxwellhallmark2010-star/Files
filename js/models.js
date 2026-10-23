// Procedural 3D models for creatures, pickups, props and view-models.
import * as THREE from 'three';

let T = null; // textures
const M = {};

export function initModels(tex) {
  T = tex;
  const skinN = tex.carpetN.clone(); skinN.repeat.set(3, 3); skinN.needsUpdate = true;
  M.spider = new THREE.MeshStandardMaterial({ color: 0x1d1612, roughness: 0.7, normalMap: skinN, normalScale: new THREE.Vector2(1.5, 1.5) });
  M.spiderLeg = new THREE.MeshStandardMaterial({ color: 0x15100d, roughness: 0.6, normalMap: skinN });
  M.eye = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a08, emissiveIntensity: 3, roughness: 0.1 });
  M.fang = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.3, metalness: 0.2 });
  M.pale = new THREE.MeshStandardMaterial({ color: 0xb5ab98, roughness: 0.55, normalMap: skinN, normalScale: new THREE.Vector2(0.5, 0.5) });
  M.bulb = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2a8, emissiveIntensity: 6, roughness: 0.05 });
  M.socket = new THREE.MeshStandardMaterial({ color: 0x9a9384, metalness: 0.9, roughness: 0.35 });
  M.shadow = new THREE.MeshBasicMaterial({ color: 0x000000 });
  M.shadowEye = new THREE.MeshBasicMaterial({ color: 0xffffff });
  M.metal = new THREE.MeshStandardMaterial({ map: tex.metal, normalMap: tex.metalN, metalness: 0.75, roughness: 0.55 });
  M.darkMetal = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, metalness: 0.8, roughness: 0.35 });
  M.circuit = new THREE.MeshStandardMaterial({ map: tex.circuit, roughness: 0.5 });
  M.chip = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
  M.wireR = new THREE.MeshStandardMaterial({ color: 0xa01010, roughness: 0.5 });
  M.wireB = new THREE.MeshStandardMaterial({ color: 0x1030a0, roughness: 0.5 });
  M.powder = new THREE.MeshStandardMaterial({ map: tex.powder, metalness: 0.4, roughness: 0.45 });
  M.paintYellow = new THREE.MeshStandardMaterial({ color: 0xd49a1c, metalness: 0.4, roughness: 0.45 });
  M.paintRed = new THREE.MeshStandardMaterial({ color: 0x9c1c14, metalness: 0.4, roughness: 0.4 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.2 });
  M.wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.7 });
  M.sheet = new THREE.MeshStandardMaterial({ map: tex.sheet, normalMap: tex.sheetN, roughness: 0.95 });
  M.blanket = new THREE.MeshStandardMaterial({ map: tex.blanket, normalMap: tex.blanketN, roughness: 0.95 });
  M.plastic = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.35 });
  M.olive = new THREE.MeshStandardMaterial({ color: 0x4a4f2c, metalness: 0.5, roughness: 0.55 });
  M.ledRed = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2010, emissiveIntensity: 4 });
  M.ledGreen = new THREE.MeshStandardMaterial({ color: 0x003000, emissive: 0x20ff40, emissiveIntensity: 4 });
  M.lens = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dd, emissiveIntensity: 3 });
  M.body = new THREE.MeshStandardMaterial({ color: 0x3c4a5a, roughness: 0.8 });
}
export const materials = M;

const mesh = (geo, mat, x = 0, y = 0, z = 0, shadow = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
};

// ---------------- creatures ----------------

export function makeSpider() {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const abd = mesh(new THREE.SphereGeometry(0.55, 28, 20), M.spider, 0, 0.5, -0.65);
  abd.scale.set(1, 0.78, 1.3);
  const ceph = mesh(new THREE.SphereGeometry(0.36, 24, 16), M.spider, 0, 0.45, 0.15);
  ceph.scale.set(1, 0.7, 1.15);
  rig.add(abd, ceph);
  // red hourglass mark on the abdomen
  const mark = mesh(new THREE.SphereGeometry(0.12, 12, 8), M.ledRed, 0, 0.88, -0.65, false);
  mark.scale.set(0.6, 0.15, 1.4);
  mark.material = M.ledRed.clone(); mark.material.emissiveIntensity = 0.6;
  rig.add(mark);
  const eyeGeo = new THREE.SphereGeometry(0.035, 10, 8);
  [[-0.08, 0.6, 0.5], [0.08, 0.6, 0.5], [-0.15, 0.57, 0.46], [0.15, 0.57, 0.46], [-0.05, 0.66, 0.44], [0.05, 0.66, 0.44], [-0.2, 0.52, 0.4], [0.2, 0.52, 0.4]]
    .forEach(([x, y, z]) => rig.add(mesh(eyeGeo, M.eye, x, y, z, false)));
  const fangGeo = new THREE.ConeGeometry(0.035, 0.22, 8);
  for (const s of [-1, 1]) {
    const f = mesh(fangGeo, M.fang, s * 0.07, 0.3, 0.52);
    f.rotation.x = Math.PI * 0.85;
    rig.add(f);
  }
  const upperGeo = new THREE.CylinderGeometry(0.05, 0.065, 0.95, 8).rotateZ(Math.PI / 2).translate(0.475, 0, 0);
  const lowerGeo = new THREE.CylinderGeometry(0.018, 0.045, 1.25, 8).rotateZ(Math.PI / 2).translate(0.625, 0, 0);
  const legs = [];
  for (const s of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.22, 0.45, 0.32 - i * 0.14);
      const base = s > 0 ? (i - 1.5) * 0.5 : Math.PI - (i - 1.5) * 0.5;
      hip.rotation.y = base;
      const upper = mesh(upperGeo, M.spiderLeg);
      upper.rotation.z = 0.7;
      const knee = new THREE.Group(); knee.position.x = 0.95;
      const lower = mesh(lowerGeo, M.spiderLeg);
      lower.rotation.z = -2.0;
      knee.add(lower); upper.add(knee); hip.add(upper); rig.add(hip);
      legs.push({ hip, upper, lower, base, phase: ((i % 2) ^ (s > 0 ? 1 : 0)) * Math.PI });
    }
  }
  root.userData = { rig, legs, abd };
  return root;
}

export function animateSpider(m, phase, speed, curl = 0) {
  for (const l of m.userData.legs) {
    const p = phase + l.phase;
    l.hip.rotation.y = l.base + Math.sin(p) * 0.25 * speed;
    l.upper.rotation.z = 0.7 + Math.max(0, Math.cos(p)) * 0.4 * speed + curl * 0.8;
    l.lower.rotation.z = -2.0 - curl * 0.9;
  }
  m.userData.abd.position.y = 0.5 + Math.sin(phase * 2) * 0.02 * speed;
}

function humanoid(mat, opts) {
  const { height = 2.6, thin = 1 } = opts;
  const g = new THREE.Group();
  const k = height / 2.6;
  const part = (geo, x, y, z, rx = 0, rz = 0) => { const m = mesh(geo, mat, x * k, y * k, z * k); m.rotation.set(rx, 0, rz); g.add(m); return m; };
  part(new THREE.CapsuleGeometry(0.15 * thin, 0.75 * k, 6, 12), 0, 1.6, 0);          // torso
  part(new THREE.CapsuleGeometry(0.13 * thin, 0.15, 6, 12), 0, 1.1, 0);              // pelvis
  const legL = part(new THREE.CapsuleGeometry(0.055 * thin, 1.0 * k, 4, 8), -0.1, 0.55, 0.02, 0.05, 0.02);
  const legR = part(new THREE.CapsuleGeometry(0.055 * thin, 1.0 * k, 4, 8), 0.1, 0.55, -0.02, -0.05, -0.02);
  const armL = part(new THREE.CapsuleGeometry(0.045 * thin, 1.25 * k, 4, 8), -0.24, 1.35, 0, 0, -0.12);
  const armR = part(new THREE.CapsuleGeometry(0.045 * thin, 1.25 * k, 4, 8), 0.24, 1.35, 0, 0, 0.12);
  part(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 8), 0, 2.15, 0);                // neck
  g.userData = { legL, legR, armL, armR };
  return g;
}

export function makeBulbCreature() {
  const g = humanoid(M.pale, { height: 2.6, thin: 0.9 });
  const socket = mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.14, 16), M.socket, 0, 2.3, 0);
  const bulbMat = M.bulb.clone();
  const bulb = mesh(new THREE.SphereGeometry(0.2, 24, 16), bulbMat, 0, 2.5, 0, false);
  bulb.scale.set(1, 1.15, 1);
  const light = new THREE.PointLight(0xffd9a0, 5, 10, 1.7);
  light.position.set(0, 2.5, 0.1);
  g.add(socket, bulb, light);
  Object.assign(g.userData, { bulb, light, bulbMat });
  return g;
}

export function makeShadowCreature() {
  const g = humanoid(M.shadow, { height: 2.3, thin: 0.8 });
  const head = mesh(new THREE.SphereGeometry(0.17, 16, 12), M.shadow, 0, 2.38, 0, false);
  head.scale.set(0.85, 1.15, 0.9);
  const eyeGeo = new THREE.SphereGeometry(0.018, 8, 6);
  g.add(head, mesh(eyeGeo, M.shadowEye, -0.055, 2.41, 0.14, false), mesh(eyeGeo, M.shadowEye, 0.055, 2.41, 0.14, false));
  g.traverse((o) => { o.castShadow = false; });
  return g;
}

export function animateWalk(m, phase, amount) {
  const u = m.userData;
  if (!u.legL) return;
  u.legL.rotation.x = Math.sin(phase) * 0.4 * amount;
  u.legR.rotation.x = -Math.sin(phase) * 0.4 * amount;
  u.armL.rotation.x = -Math.sin(phase) * 0.25 * amount;
  u.armR.rotation.x = Math.sin(phase) * 0.25 * amount;
}

// ---------------- pickups & props ----------------

export function makeItem(type) {
  const g = new THREE.Group();
  if (type === 'metal') {
    const plate = mesh(new THREE.BoxGeometry(0.45, 0.02, 0.3), M.metal, 0, 0.06, 0);
    plate.rotation.set(0.15, 0.3, 0.2);
    const pipe = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 12), M.metal, 0.05, 0.04, 0.12);
    pipe.rotation.z = Math.PI / 2; pipe.rotation.y = 0.5;
    const bracket = mesh(new THREE.BoxGeometry(0.12, 0.12, 0.03), M.darkMetal, -0.15, 0.07, -0.1);
    bracket.rotation.y = 0.8;
    g.add(plate, pipe, bracket);
  } else if (type === 'electronics') {
    const board = mesh(new THREE.BoxGeometry(0.3, 0.015, 0.2), M.circuit, 0, 0.01, 0);
    g.add(board);
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.045, 0.012, 0.045), M.chip, -0.09 + i * 0.06, 0.024, 0.03));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.04, 10), i % 2 ? M.wireB : M.chrome, 0.08 - i * 0.04, 0.038, -0.06));
    const w1 = mesh(new THREE.TorusGeometry(0.08, 0.006, 6, 20, Math.PI), M.wireR, 0.15, 0.02, 0); w1.rotation.y = Math.PI / 2;
    const w2 = mesh(new THREE.TorusGeometry(0.1, 0.006, 6, 20, Math.PI), M.wireB, 0.17, 0.02, 0.02); w2.rotation.y = Math.PI / 2;
    g.add(w1, w2);
  } else if (type === 'gunpowder') {
    const can = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 24), M.powder, 0, 0.11, 0);
    const lid = mesh(new THREE.CylinderGeometry(0.093, 0.093, 0.03, 24), M.darkMetal, 0, 0.235, 0);
    g.add(can, lid);
  }
  return g;
}

export function makeGenerator() {
  const g = new THREE.Group();
  const frame = new THREE.CylinderGeometry(0.025, 0.025, 1, 8);
  const bar = (x, y, z, len, axis) => {
    const m = mesh(frame, M.darkMetal, x, y, z);
    m.scale.y = len;
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    g.add(m);
  };
  for (const x of [-0.55, 0.55]) for (const z of [-0.35, 0.35]) bar(x, 0.45, z, 0.9);
  for (const y of [0.05, 0.9]) { for (const z of [-0.35, 0.35]) bar(0, y, z, 1.1, 'x'); for (const x of [-0.55, 0.55]) bar(x, y, 0, 0.7, 'z'); }
  g.add(mesh(new THREE.BoxGeometry(0.75, 0.45, 0.5), M.paintYellow, -0.1, 0.33, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 20).rotateX(Math.PI / 2), M.darkMetal, 0.3, 0.3, 0));
  const tank = mesh(new THREE.CapsuleGeometry(0.2, 0.55, 8, 16).rotateZ(Math.PI / 2), M.paintRed, 0, 0.75, 0);
  g.add(tank);
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 12), M.chrome, -0.25, 0.97, 0));
  const exhaust = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.35, 10), M.metal, 0.45, 0.6, -0.2);
  g.add(exhaust);
  const panel = mesh(new THREE.BoxGeometry(0.3, 0.2, 0.03), M.plastic, -0.15, 0.4, 0.27);
  g.add(panel);
  const led = mesh(new THREE.SphereGeometry(0.02, 10, 8), M.ledGreen.clone(), -0.22, 0.44, 0.29, false);
  const switchM = mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), M.chrome, -0.08, 0.4, 0.29);
  g.add(led, switchM);
  g.userData.led = led;
  return g;
}

export function setGeneratorLed(g, on) {
  const m = g.userData.led.material;
  m.emissive.setHex(on ? 0x20ff40 : 0xff2010);
  m.color.setHex(on ? 0x003000 : 0x300000);
}

export function makeKart(color = 0x9c1c14) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.35 });
  g.add(mesh(new THREE.BoxGeometry(1.0, 0.1, 1.9), M.darkMetal, 0, 0.2, 0));
  g.add(mesh(new THREE.BoxGeometry(1.05, 0.25, 0.5), paint, 0, 0.33, 0.75));        // nose
  g.add(mesh(new THREE.BoxGeometry(0.15, 0.3, 1.2), paint, 0.48, 0.35, -0.15));      // side pods
  g.add(mesh(new THREE.BoxGeometry(0.15, 0.3, 1.2), paint, -0.48, 0.35, -0.15));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.45), M.rubber, 0, 0.33, -0.25));      // seat
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1), M.rubber, 0, 0.55, -0.48));
  g.add(mesh(new THREE.BoxGeometry(0.55, 0.35, 0.35), M.paintYellow, 0, 0.42, -0.78)); // engine
  const col = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), M.chrome, 0, 0.5, 0.32);
  col.rotation.x = -0.6; g.add(col);
  const wheel = mesh(new THREE.TorusGeometry(0.14, 0.02, 8, 20), M.rubber, 0, 0.68, 0.18);
  wheel.rotation.x = -0.6 + Math.PI / 2; g.add(wheel);
  // roll cage (the "roof" from the sketch)
  const tube = new THREE.CylinderGeometry(0.025, 0.025, 1, 8);
  for (const x of [-0.42, 0.42]) {
    const a = mesh(tube, M.chrome, x, 0.75, -0.55); a.scale.y = 1.1; g.add(a);
    const b = mesh(tube, M.chrome, x, 0.75, 0.25); b.scale.y = 1.1; b.rotation.x = 0.25; g.add(b);
    const t = mesh(tube, M.chrome, x, 1.28, -0.12); t.scale.y = 0.75; t.rotation.x = Math.PI / 2; g.add(t);
  }
  const top = mesh(tube, M.chrome, 0, 1.28, -0.5); top.scale.y = 0.84; top.rotation.z = Math.PI / 2; g.add(top);
  const top2 = mesh(tube, M.chrome, 0, 1.28, 0.25); top2.scale.y = 0.84; top2.rotation.z = Math.PI / 2; g.add(top2);
  const wheels = [];
  const wg = new THREE.CylinderGeometry(0.22, 0.22, 0.18, 20).rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.1, 0.1, 0.19, 12).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.6, 0.65], [0.6, 0.65], [-0.6, -0.65], [0.6, -0.65]]) {
    const w = new THREE.Group(); w.position.set(x, 0.22, z);
    w.add(mesh(wg, M.rubber), mesh(hub, M.chrome));
    g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

export function makeMine() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.06, 24), M.olive, 0, 0.03, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16), M.darkMetal, 0, 0.07, 0));
  const led = mesh(new THREE.SphereGeometry(0.012, 8, 6), M.ledRed.clone(), 0.1, 0.065, 0, false);
  g.add(led);
  g.userData.led = led;
  return g;
}

export function makeBed() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.3, 2.1), M.wood, 0, 0.18, 0));
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.7, 0.08), M.wood, 0, 0.45, -1.03));
  g.add(mesh(new THREE.BoxGeometry(1.0, 0.2, 2.0), M.sheet, 0, 0.43, 0));
  const blanket = mesh(new THREE.BoxGeometry(1.04, 0.06, 1.35), M.blanket, 0, 0.55, 0.32);
  g.add(blanket);
  const pillow = mesh(new THREE.SphereGeometry(0.5, 20, 12), M.sheet, 0, 0.58, -0.75);
  pillow.scale.set(0.65, 0.14, 0.32);
  g.add(pillow);
  return g;
}

export function makePhoneTable() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.04, 0.55), M.wood, 0, 0.75, 0));
  for (const x of [-0.4, 0.4]) for (const z of [-0.23, 0.23]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), M.wood, x, 0.375, z));
  g.add(mesh(new THREE.BoxGeometry(0.24, 0.08, 0.2), M.plastic, 0, 0.81, 0));
  const dial = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 20), M.chrome, 0, 0.855, 0.03);
  dial.rotation.x = -0.3; g.add(dial);
  const handset = new THREE.Group();
  handset.position.set(0, 0.88, -0.03);
  const hs = mesh(new THREE.CapsuleGeometry(0.025, 0.2, 4, 10), M.plastic); hs.rotation.z = Math.PI / 2;
  handset.add(hs, mesh(new THREE.SphereGeometry(0.04, 12, 8), M.plastic, -0.12, -0.01, 0), mesh(new THREE.SphereGeometry(0.04, 12, 8), M.plastic, 0.12, -0.01, 0));
  g.add(handset);
  const led = mesh(new THREE.SphereGeometry(0.012, 8, 6), M.ledRed.clone(), 0.09, 0.85, 0.08, false);
  g.add(led);
  g.userData = { handset, led };
  return g;
}

export function makeWorkbench() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.06, 0.7), M.wood, 0, 0.9, 0));
  for (const x of [-0.75, 0.75]) for (const z of [-0.3, 0.3]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), M.darkMetal, x, 0.45, z));
  g.add(mesh(new THREE.BoxGeometry(1.5, 0.03, 0.6), M.wood, 0, 0.25, 0));
  const vise = mesh(new THREE.BoxGeometry(0.15, 0.12, 0.12), M.paintRed, -0.6, 0.99, 0.2); g.add(vise);
  const tool = mesh(new THREE.BoxGeometry(0.3, 0.02, 0.04), M.chrome, 0.3, 0.94, 0.1); tool.rotation.y = 0.4; g.add(tool);
  const box = mesh(new THREE.BoxGeometry(0.4, 0.2, 0.25), M.paintRed, 0.5, 0.36, 0); g.add(box);
  return g;
}

export function makeRemotePlayer(gltfScene) {
  const g = new THREE.Group();
  if (gltfScene) {
    const m = gltfScene.clone(true);
    m.scale.setScalar(1.75);
    m.position.y = 0.88;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.metalness = 0.15; } });
    g.add(m);
  } else {
    g.add(mesh(new THREE.CapsuleGeometry(0.28, 0.9, 6, 12), M.body, 0, 0.9, 0));
    g.add(mesh(new THREE.SphereGeometry(0.2, 16, 12), M.body, 0, 1.6, 0));
  }
  const spot = new THREE.SpotLight(0xfff2dd, 0, 25, 0.45, 0.5, 1.5);
  spot.position.set(0.25, 1.45, 0.3);
  const target = new THREE.Object3D(); target.position.set(0.25, 1.4, 5);
  spot.target = target;
  g.add(spot, target);
  g.userData.spot = spot;
  return g;
}

// ---------------- first person view models ----------------

export function makeViewFlashlight() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 16).rotateX(Math.PI / 2), M.darkMetal, 0, 0, 0, false));
  g.add(mesh(new THREE.CylinderGeometry(0.034, 0.026, 0.06, 16).rotateX(Math.PI / 2), M.darkMetal, 0, 0, -0.12, false));
  const lens = mesh(new THREE.CircleGeometry(0.03, 16), M.lens.clone(), 0, 0, -0.151, false);
  lens.rotation.y = Math.PI;
  g.add(lens);
  g.userData.lens = lens;
  return g;
}

export function makeViewGun() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.034, 0.04, 0.2), M.darkMetal, 0, 0, -0.05, false));
  const grip = mesh(new THREE.BoxGeometry(0.03, 0.11, 0.045), M.plastic, 0, -0.065, 0.02, false);
  grip.rotation.x = -0.25; g.add(grip);
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8).rotateX(Math.PI / 2), M.chrome, 0, 0.005, -0.165, false));
  g.add(mesh(new THREE.BoxGeometry(0.008, 0.012, 0.008), M.chrome, 0, 0.026, -0.14, false));
  const flash = new THREE.PointLight(0xffb060, 0, 8, 2);
  flash.position.set(0, 0, -0.25);
  g.add(flash);
  g.userData.flash = flash;
  return g;
}

export function makeViewMine() {
  const g = makeMine();
  g.rotation.x = 0.7;
  return g;
}
