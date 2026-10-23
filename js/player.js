// First-person controller: walking, sprinting, crouching, head bob,
// flashlight, held items, shooting and driving.
import * as THREE from 'three';
import { clamp, damp, cellOf, WALL_H } from './util.js';
import * as Models from './models.js';
import { preset } from './quality.js';

const RADIUS = 0.33;

export class Player {
  constructor(game) {
    this.game = game;
    this.cam = game.camera;
    this.pos = { x: 2, z: 3.4 };
    this.vel = { x: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.health = 100; this.stamina = 100;
    this.dead = false;
    this.flashlight = false;
    this.slot = 1;
    this.eye = 1.65;
    this.bob = 0; this.stepDist = 0;
    this.kart = null;
    this.sprinting = false;
    this.recoil = 0;
    this.regenDelay = 0;

    // flashlight sits just right of the eyes so its shadows read as 3D
    this.light = new THREE.SpotLight(0xfff2dd, 0, 30, 0.44, 0.55, 1.4);
    this.light.position.set(0.18, -0.12, 0);
    this.light.target.position.set(0.1, -0.15, -6);
    this.cam.add(this.light, this.light.target);
    this.applyQuality();

    this.hand = new THREE.Group();
    this.hand.position.set(0.24, -0.24, -0.5);
    this.hand.visible = false;
    this.cam.add(this.hand);
    this.vm = { 1: Models.makeViewFlashlight(), 2: Models.makeViewGun(), 3: Models.makeViewMine() };
    for (const k in this.vm) { this.vm[k].visible = false; this.hand.add(this.vm[k]); }
    this.vm[1].visible = true;
  }

  applyQuality() {
    const q = preset(this.game.settings);
    this.light.castShadow = q.shadows;
    this.light.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    this.light.shadow.map?.dispose();
    this.light.shadow.map = null;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.03;
    this.light.shadow.camera.near = 0.2;
    this.light.shadow.camera.far = 30;
  }

  get inBase() { return this.game.world.inBaseWorld(this.pos.x, this.pos.z); }

  place(x, z, yaw = this.yaw) {
    this.pos.x = x; this.pos.z = z; this.yaw = yaw; this.pitch = 0;
    this.vel.x = this.vel.z = 0;
  }

  look(dx, dy) {
    const s = this.game.settings.sensitivity * 0.0022;
    this.yaw -= dx * s;
    this.pitch = clamp(this.pitch - dy * s * (this.game.settings.invertY ? -1 : 1), -1.45, 1.45);
  }

  selectSlot(n) {
    const inv = this.game.state.inv;
    if (n === 2 && !inv.gun) { this.game.ui.toast('You have no gun. Craft one (Tab).'); return; }
    if (n === 3 && inv.mines <= 0) { this.game.ui.toast('No landmines. Craft some (Tab).'); return; }
    this.slot = n;
    for (const k in this.vm) this.vm[k].visible = +k === n;
    this.game.audio.play('click', null, { gain: 0.6 });
  }

  toggleFlashlight() {
    this.flashlight = !this.flashlight;
    this.game.audio.play('click', null);
  }

  use() {
    const g = this.game, inv = g.state.inv;
    if (this.dead || this.kart) return;
    if (this.slot === 2) {
      if (inv.ammo <= 0) { g.audio.play('click', null); g.ui.toast('Out of ammo — craft another gun for more rounds'); return; }
      inv.ammo--;
      g.audio.play('gun', null);
      this.recoil = 1;
      const origin = this.cam.getWorldPosition(new THREE.Vector3());
      const dir = this.cam.getWorldDirection(new THREE.Vector3());
      g.effects.pulse(origin.clone().addScaledVector(dir, 0.6), 0xffb060, 40, 30);
      const m = g.monsters.shoot(origin, dir);
      g.net.send({ t: 'shot', x: origin.x, y: origin.y, z: origin.z });
      if (m) {
        if (g.net.isClient) g.net.send({ t: 'hit', i: g.monsters.all.indexOf(m) });
        else m.damage(1);
      }
      g.ui.refresh();
    } else if (this.slot === 3) {
      if (inv.mines <= 0) return;
      const x = this.pos.x - Math.sin(this.yaw) * 1.3, z = this.pos.z - Math.cos(this.yaw) * 1.3;
      if (g.world.pointBlocked(x, z) || !g.world.los(this.pos.x, this.pos.z, x, z)) { g.ui.toast('No room to place it there'); return; }
      inv.mines--;
      const data = { id: `m${Date.now().toString(36)}${(Math.random() * 1e4) | 0}`, x, z };
      g.state.mines.push(data);
      g.entities.placeMine(data);
      g.audio.play('click', { x, y: 0.1, z });
      g.ui.toast('Landmine armed');
      if (inv.mines <= 0) this.selectSlot(1);
      g.ui.refresh();
    }
  }

  update(dt, input) {
    const g = this.game, w = g.world;
    this.light.intensity = this.flashlight && !this.dead ? 22 * (g.monsters.stare > 0.3 && Math.random() < g.monsters.stare * 0.4 ? 0.1 : 1) : 0;
    this.vm[1].userData.lens.material.emissiveIntensity = this.flashlight ? 3 : 0;
    // only redraw the flashlight's shadow map while it's actually on
    g.renderer.shadowMap.autoUpdate = this.light.castShadow && this.light.intensity > 0;

    if (this.dead) { this._applyCamera(dt, 0); return; }

    if (this.kart) {
      g.entities.driveKart(this.kart, input, dt);
      const d = this.kart.data;
      this.pos.x = d.x; this.pos.z = d.z;
      this.eye = damp(this.eye, 1.2, 8, dt);
      this._applyCamera(dt, 0);
      this.hand.visible = false;
      return;
    }
    this.hand.visible = !g.effects.scare;

    // movement
    const water = w.waterAt(cellOf(this.pos.x), cellOf(this.pos.z));
    const crouch = input.crouch;
    const wantsSprint = input.sprint && input.fwd > 0 && !crouch;
    if (wantsSprint && this.stamina > 0) { this.stamina -= dt * 16; this.regenDelay = 1.2; }
    else { this.regenDelay -= dt; if (this.regenDelay <= 0) this.stamina = Math.min(100, this.stamina + dt * 14); }
    this.stamina = Math.max(0, this.stamina);
    this.sprinting = wantsSprint && this.stamina > 0;
    let speed = crouch ? 1.5 : this.sprinting ? 5.8 : 3.0;
    if (water) speed *= 0.65;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = fx * input.fwd + rx * input.side, mz = fz * input.fwd + rz * input.side;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    const accel = ml > 0 ? 10 : 12;
    this.vel.x = damp(this.vel.x, mx * speed, accel, dt);
    this.vel.z = damp(this.vel.z, mz * speed, accel, dt);
    const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt };
    w.collideCircle(p, RADIUS);
    const moved = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    this.pos.x = p.x; this.pos.z = p.z;

    // head bob + footsteps
    const hs = moved / Math.max(dt, 1e-4);
    this.bob += hs * dt * (this.sprinting ? 1.9 : 2.2);
    this.stepDist += moved;
    const stride = this.sprinting ? 2.0 : crouch ? 1.0 : 1.6;
    if (this.stepDist > stride) {
      this.stepDist = 0;
      g.audio.play(water ? 'stepWater' : 'step', null, { gain: crouch ? 0.35 : this.sprinting ? 1.2 : 0.8 });
      g.net.send({ t: 'step', x: this.pos.x, z: this.pos.z, w: water ? 1 : 0 }, true);
    }
    this.eye = damp(this.eye, crouch ? 1.05 : water ? 1.5 : 1.65, 10, dt);
    this._applyCamera(dt, Math.min(1, hs / 3));

    // hand sway
    const sway = Math.min(1, hs / 3);
    this.hand.position.set(0.24 + Math.cos(this.bob) * 0.008 * sway, -0.24 - Math.abs(Math.sin(this.bob)) * 0.01 * sway + this.recoil * 0.02, -0.5 + this.recoil * 0.06);
    this.hand.rotation.x = this.recoil * 0.4;
    this.recoil = damp(this.recoil, 0, 10, dt);

    // health regen when out of danger for a while
    this.hurtT = (this.hurtT ?? 99) + dt;
    if (this.hurtT > 6 && this.health < 100) this.health = Math.min(100, this.health + dt * 4);
  }

  _applyCamera(dt, bobAmt) {
    const by = Math.sin(this.bob * 2) * 0.035 * bobAmt;
    const bx = Math.cos(this.bob) * 0.025 * bobAmt;
    this.cam.position.set(this.pos.x + Math.cos(this.yaw) * bx, Math.min(WALL_H - 0.2, this.eye + by), this.pos.z - Math.sin(this.yaw) * bx);
    this.cam.rotation.set(this.pitch + this.recoil * 0.03, this.yaw, Math.cos(this.bob) * 0.004 * bobAmt, 'YXZ');
  }
}
