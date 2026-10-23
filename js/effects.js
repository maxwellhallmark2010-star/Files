// Post-processing (bloom, film grain, chromatic aberration, vignette, damage
// and "stare" distortion) plus the jumpscare / camera-shake system.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as Models from './models.js';
import { preset } from './quality.js';

const FilmShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, grain: { value: 0.045 }, vig: { value: 1.15 },
    aberr: { value: 0.0025 }, damage: { value: 0 }, stare: { value: 0 }, fade: { value: 0 }, flash: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, grain, vig, aberr, damage, stare, fade, flash;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      uv.x += sin(uv.y * 38.0 + time * 14.0) * 0.004 * stare * stare;
      vec2 dir = uv - 0.5;
      float ab = aberr + stare * 0.012 + damage * 0.01;
      vec3 c;
      c.r = texture2D(tDiffuse, uv + dir * ab).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - dir * ab).b;
      float n = rand(uv * vec2(1.0, 1.7) + fract(time * 1.3)) - 0.5;
      c += n * (grain + stare * 0.25) * (0.35 + dot(c, vec3(0.33)));
      float line = rand(vec2(floor(uv.y * 240.0), floor(time * 30.0)));
      c = mix(c, vec3(line) * 0.6, stare * stare * 0.22);
      float v = smoothstep(0.95, 0.25, length(dir) * vig);
      c *= mix(0.25, 1.0, v);
      c = mix(c, c * vec3(1.3, 0.25, 0.2) + vec3(0.12, 0.0, 0.0), clamp(damage, 0.0, 1.0) * (1.0 - v * 0.5));
      c += flash;
      c *= 1.0 - fade;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Effects {
  constructor(game) {
    this.game = game;
    const { renderer, scene, camera } = game;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.92);
    // bloom is a blur, so computing it at half resolution looks the same for a quarter of the cost
    const bloomSize = this.bloom.setSize.bind(this.bloom);
    this.bloom.setSize = (w, h) => bloomSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.composer.addPass(this.bloom);
    this.film = new ShaderPass(FilmShader);
    this.composer.addPass(this.film);
    this.composer.addPass(new OutputPass());
    this.u = this.film.uniforms;
    this.shakeAmt = 0; this.shakeT = 0;
    this.scare = null;
    this.scareModels = {
      spider: Models.makeSpider(),
      bulb: Models.makeBulbCreature(),
      shadow: Models.makeShadowCreature(),
    };
    // the bulb creature's own light would change the light count when toggled; drop it
    const bl = this.scareModels.bulb.userData.light;
    bl.parent.remove(bl);
    this.scareGroup = new THREE.Group();
    camera.add(this.scareGroup);
    for (const m of Object.values(this.scareModels)) { m.visible = false; this.scareGroup.add(m); m.traverse((o) => { o.castShadow = false; }); }
    // One shared light for muzzle flashes, explosions and jumpscares: every
    // light in the scene costs every pixel, even at zero intensity.
    this.fx = new THREE.PointLight(0xffffff, 0, 25, 1.5);
    this.fxRate = 6;
    scene.add(this.fx);
    this.applyQuality(game.settings);
  }

  applyQuality(s) {
    const q = preset(s);
    this.bloom.enabled = q.bloom;
    this.post = q.post;
    this.u.grain.value = s.grain ? 0.045 : 0;
  }

  setSize(w, h) { this.composer.setSize(w, h); }

  pulse(pos, color, intensity, rate) {
    if (this.scare) return;
    this.fx.position.set(pos.x, pos.y, pos.z);
    this.fx.color.setHex(color);
    this.fx.intensity = intensity;
    this.fxRate = rate;
  }

  shake(amount, dur) { this.shakeAmt = Math.max(this.shakeAmt, amount); this.shakeT = Math.max(this.shakeT, dur); }
  hurt(v = 1) { this.u.damage.value = Math.min(1.2, this.u.damage.value + v); }

  // Creature lunges into the camera. Lethal scares end in the death screen.
  jumpscare(kind, lethal, onDone) {
    if (this.scare) { this.scare.onDone?.(); }
    for (const m of Object.values(this.scareModels)) m.visible = false;
    const m = this.scareModels[kind];
    m.visible = true;
    const cfg = {
      spider: { pos: [0, -0.75, -1.25], rot: [-0.9, 0, 0], head: 0 },
      bulb: { pos: [0, 0, -1.1], rot: [0.12, 0, 0], head: 2.42 },
      shadow: { pos: [0, 0, -0.75], rot: [0.05, 0, 0], head: 2.38 },
    }[kind];
    m.position.set(...cfg.pos);
    m.rotation.set(...cfg.rot);
    this.scare = { kind, m, t: 0, dur: lethal ? 1.25 : 0.8, onDone, base: cfg.pos, head: cfg.head };
    this.u.flash.value = 0.6;
    this.shake(lethal ? 0.09 : 0.06, this.scare.dur);
    this.game.audio.play('sting', null, { gain: lethal ? 1.2 : 0.9 });
    if (kind === 'spider') this.game.audio.play('screech', null);
    if (kind === 'bulb') this.game.audio.play('shatter', null);
  }

  update(dt, time) {
    const g = this.game;
    this.u.time.value = time;
    this.u.damage.value = Math.max(0, this.u.damage.value - dt * 0.9);
    this.u.flash.value = Math.max(0, this.u.flash.value - dt * 2.5);
    this.u.stare.value = g.monsters ? g.monsters.stare : 0;
    // low health keeps a red edge
    if (g.player && !g.player.dead && g.player.health < 35) this.u.damage.value = Math.max(this.u.damage.value, 0.25 + Math.sin(time * 5) * 0.08);

    if (!this.scare) this.fx.intensity *= Math.exp(-dt * this.fxRate);
    if (this.scare) {
      const s = this.scare;
      s.t += dt;
      const k = Math.min(1, s.t / 0.22);
      const lunge = 1 - Math.pow(1 - k, 3);
      const sc = 0.8 + lunge * 0.35;
      s.m.scale.setScalar(sc);
      // keep the creature's face at eye level as it grows
      const y = s.head ? -s.head * sc - 0.05 : s.base[1];
      s.m.position.set(s.base[0] + (Math.random() - 0.5) * 0.04, y + (Math.random() - 0.5) * 0.04, s.base[2] * (1.6 - lunge * 0.75));
      if (s.kind === 'spider') Models.animateSpider(s.m, time * 30, 1.5);
      if (s.kind === 'bulb') s.m.userData.bulbMat.emissiveIntensity = 1.2 + Math.random() * 1.5;
      g.camera.localToWorld(this.fx.position.set(0, 0.4, -0.2));
      this.fx.color.setHex(0xffd0b0);
      this.fx.intensity = s.kind === 'shadow' ? 1 : s.kind === 'bulb' ? 3 : 8;
      if (s.t >= s.dur) {
        s.m.visible = false;
        this.fx.intensity = 0;
        this.scare = null;
        s.onDone?.();
      }
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmt * Math.min(1, this.shakeT * 3);
      g.camera.rotation.x += (Math.random() - 0.5) * a;
      g.camera.rotation.y += (Math.random() - 0.5) * a;
      g.camera.rotation.z += (Math.random() - 0.5) * a * 0.5;
      if (this.shakeT <= 0) this.shakeAmt = 0;
    }
  }

  // Low quality skips the full-screen passes and draws straight to the screen
  // (the renderer still applies tone mapping); only jumpscare flashes need them.
  render() {
    if (this.post || this.u.flash.value > 0.01 || this.u.damage.value > 0.01) this.composer.render();
    else this.game.renderer.render(this.game.scene, this.game.camera);
  }
}
