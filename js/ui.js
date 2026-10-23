// Menus, HUD, crafting screen, map and subtitles.
import { CELL, CHUNK } from './util.js';
import { listSaves, deleteSave, SLOTS } from './save.js';
import { ITEM_NAMES } from './entities.js';

export const RECIPES = [
  { key: 'gun', name: 'Gun', desc: 'Pistol with 8 rounds (crafting again adds 8 more)', cost: { metal: 3, gunpowder: 1 } },
  { key: 'kart', name: 'Go-Kart', desc: 'Fast vehicle. Never despawns, always pinged on the map', cost: { metal: 10, electronics: 2 } },
  { key: 'landmine', name: 'Landmine', desc: 'Place on the floor. Kills any creature that steps on it', cost: { metal: 1, electronics: 1 } },
];

const CONTROLS = [
  ['W A S D', 'Move'], ['Mouse', 'Look'], ['Shift', 'Sprint'], ['C / Ctrl', 'Crouch'], ['E', 'Interact / pick up / enter vehicle'],
  ['F', 'Flashlight'], ['Left click', 'Shoot / place landmine'], ['1 2 3', 'Flashlight · Gun · Landmine'],
  ['Tab / I', 'Inventory & crafting'], ['M', 'Map'], ['Esc', 'Pause'],
];

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.mapZoom = 5;
    this.subQueue = null;
    $('map').addEventListener('wheel', (e) => { this.mapZoom = Math.max(1.5, Math.min(16, this.mapZoom * (e.deltaY > 0 ? 0.85 : 1.18))); this.drawMap(); });
  }

  setLoading(p, text) { $('loadfill').style.width = `${p * 100}%`; if (text) $('loadtext').textContent = text; }

  show(id, on = true) { $(id).classList.toggle('hidden', !on); }

  showMenu() {
    ['loading', 'pause', 'hud', 'craft', 'mapview'].forEach((s) => this.show(s, false));
    this.show('menu');
    this.closePanel();
    $('btn-continue').disabled = !listSaves().some(Boolean);
  }

  closePanel() { this.show('panel', false); this.show('ppanel', false); }

  openPanel(kind, inPause = false) {
    const el = $(inPause ? 'ppanel' : 'panel');
    el.classList.remove('hidden');
    const g = this.game;
    if (kind === 'new' || kind === 'load') {
      const saves = listSaves();
      el.innerHTML = `<h2>${kind === 'new' ? 'NEW GAME — PICK A SLOT' : 'LOAD GAME'}</h2>` +
        (kind === 'new' ? `<div class="row"><label>Seed (optional)</label><input type="text" id="seed" placeholder="random" style="width:200px"></div>` : '') +
        Array.from({ length: SLOTS }, (_, i) => {
          const s = saves[i];
          const meta = s ? `Day ${s.day} · seed ${s.seed} · ${new Date(s.savedAt).toLocaleString()}` : 'Empty';
          const can = kind === 'new' || s;
          return `<div class="slot"><div><div>Slot ${i + 1}</div><div class="meta">${meta}</div></div><div>` +
            (s ? `<button class="del" data-del="${i}">Delete</button> ` : '') +
            `<button class="btn" data-slot="${i}" ${can ? '' : 'disabled'}>${kind === 'new' ? (s ? 'Overwrite' : 'Start') : 'Load'}</button></div></div>`;
        }).join('');
      el.querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => {
        const i = +b.dataset.slot;
        if (kind === 'new') {
          if (saves[i] && !confirm('Overwrite this save?')) return;
          const raw = ($('seed')?.value || '').trim();
          const seed = raw ? (/^-?\d+$/.test(raw) ? +raw : [...raw].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) : null;
          g.newGame(i, seed);
        } else g.loadGame(i);
      });
      el.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
        if (confirm('Delete this save permanently?')) { deleteSave(+b.dataset.del); this.openPanel(kind, inPause); $('btn-continue').disabled = !listSaves().some(Boolean); }
      });
    } else if (kind === 'mp') {
      el.innerHTML = `<h2>CO-OP MULTIPLAYER</h2>
        <p class="hint">Peer-to-peer over the internet. The host's world, monsters, power and vehicles are shared; each player keeps their own objectives. Host progress saves to the host's slot.</p>
        <div class="row"><button class="btn" id="mp-host">Host a game</button><span class="hint">uses your most recent save, or a new world</span></div>
        <div class="row"><input type="text" id="mp-code" placeholder="ROOM CODE" maxlength="5" style="text-transform:uppercase"><button class="btn" id="mp-join">Join</button></div>
        <div id="mp-status" class="hint"></div>`;
      $('mp-host').onclick = () => g.hostGame((msg) => { $('mp-status').textContent = msg; });
      $('mp-join').onclick = () => {
        const c = $('mp-code').value.trim();
        if (c.length < 5) { $('mp-status').textContent = 'Enter the 5-letter code from the host.'; return; }
        $('mp-status').textContent = 'Connecting…';
        g.joinGame(c, (msg) => { $('mp-status').textContent = msg; });
      };
    } else if (kind === 'settings') {
      const s = g.settings;
      el.innerHTML = `<h2>SETTINGS</h2>
        <div class="row"><label>Mouse sensitivity</label><input type="range" id="s-sens" min="0.2" max="3" step="0.05" value="${s.sensitivity}"></div>
        <div class="row"><label>Invert Y</label><input type="checkbox" id="s-inv" ${s.invertY ? 'checked' : ''}></div>
        <div class="row"><label>Field of view</label><input type="range" id="s-fov" min="60" max="100" step="1" value="${s.fov}"></div>
        <div class="row"><label>Volume</label><input type="range" id="s-vol" min="0" max="1" step="0.05" value="${s.volume}"></div>
        <div class="row"><label>Graphics quality</label><select id="s-q">${['low', 'medium', 'high'].map((q) => `<option ${q === s.quality ? 'selected' : ''}>${q}</option>`).join('')}</select></div>
        <div class="row"><label>Film grain</label><input type="checkbox" id="s-grain" ${s.grain ? 'checked' : ''}></div>
        <div class="row"><label>Phone voice (speech)</label><input type="checkbox" id="s-voice" ${s.voice ? 'checked' : ''}></div>
        <div class="row"><label>Custom PeerJS server</label><input type="text" id="s-peer" value="${s.peerHost}" placeholder="default (cloud)" style="width:200px"></div>
        <p class="hint">Texture quality changes apply after reloading the page.</p>`;
      const bind = (id, key, conv) => { $(id).oninput = $(id).onchange = (e) => { s[key] = conv(e.target); g.applySettings(); }; };
      bind('s-sens', 'sensitivity', (t) => +t.value);
      bind('s-inv', 'invertY', (t) => t.checked);
      bind('s-fov', 'fov', (t) => +t.value);
      bind('s-vol', 'volume', (t) => +t.value);
      bind('s-q', 'quality', (t) => t.value);
      bind('s-grain', 'grain', (t) => t.checked);
      bind('s-voice', 'voice', (t) => t.checked);
      bind('s-peer', 'peerHost', (t) => t.value);
    } else if (kind === 'controls') {
      el.innerHTML = `<h2>CONTROLS</h2><table class="controls">${CONTROLS.map(([k, v]) => `<tr><td><span class="key">${k}</span></td><td>${v}</td></tr>`).join('')}</table>
        <h2 style="margin-top:20px">SURVIVAL NOTES</h2>
        <p class="hint">• The bed in your base is your respawn point. Dying keeps your inventory and objectives.<br>
        • Answer the phone each day for objectives. You can't sleep until they're finished.<br>
        • Giant spiders crawl on walls and hunt by sight — take turns to lose them.<br>
        • Never stare at the light-bulb creature.<br>
        • The shadow creature only wants to scare you.<br>
        • If the lights cut out, press F and find the generator highlighted on your map.</p>`;
    }
  }

  toast(msg) {
    const d = document.createElement('div');
    d.textContent = msg;
    $('toast').appendChild(d);
    setTimeout(() => d.remove(), 4000);
  }

  setPrompt(target, hold) {
    if (!target) { this.show('prompt', false); return; }
    this.show('prompt');
    $('prompt-text').textContent = target.label;
    $('hold').style.display = target.hold ? '' : 'none';
    $('holdfill').style.width = `${(hold || 0) * 100}%`;
  }

  refresh() {
    const g = this.game, st = g.state;
    if (!st) return;
    const obj = st.objectives;
    let html = `<div class="day">DAY ${st.day}</div>`;
    if (st.phone === 'ringing') html += `<div class="o">☎ The phone in your base is ringing…</div>`;
    else {
      html += obj.map((o) => `<div class="o ${o.done ? 'done' : ''}">${o.done ? '☑' : '☐'} ${o.label}${o.target > 1 && !o.done ? ` (${Math.floor(o.n)}/${o.target})` : ''}</div>`).join('');
      if (obj.length && obj.every((o) => o.done)) html += `<div class="tip">All done. Return to your bed to sleep.</div>`;
    }
    $('objectives').innerHTML = html;
    const inv = st.inv, p = g.player;
    const slots = [
      [1, 'Flashlight', p.flashlight ? 'ON' : 'OFF', true],
      [2, 'Gun', inv.gun ? `${inv.ammo} rds` : '—', inv.gun],
      [3, 'Landmine', `x${inv.mines}`, inv.mines > 0],
    ];
    $('hotbar').innerHTML = slots.map(([n, name, sub, ok]) => `<div class="hs ${p.slot === n ? 'sel' : ''} ${ok ? '' : 'off'}">${n} · ${name}<br>${sub}</div>`).join('');
  }

  bars() {
    const p = this.game.player;
    $('hp').style.width = `${Math.max(0, p.health)}%`;
    $('st').style.width = `${p.stamina}%`;
  }

  setPower(on) { this.show('power', !on); }

  renderCraft() {
    const g = this.game, inv = g.state.inv;
    $('inv').innerHTML = ['metal', 'electronics', 'gunpowder'].map((k) => `<div class="invc"><b>${inv[k]}</b>${ITEM_NAMES[k]}</div>`).join('');
    $('recipes').innerHTML = RECIPES.map((r) => {
      const ok = Object.entries(r.cost).every(([k, n]) => inv[k] >= n);
      const cost = Object.entries(r.cost).map(([k, n]) => `<span class="${inv[k] >= n ? '' : 'miss'}">${ITEM_NAMES[k]} ×${n}</span>`).join(' + ');
      return `<div class="recipe"><div><div class="name">${r.name}</div><div class="cost">${cost}</div><div class="hint">${r.desc}</div></div><button class="btn" data-craft="${r.key}" ${ok ? '' : 'disabled'}>Craft</button></div>`;
    }).join('');
    $('recipes').querySelectorAll('[data-craft]').forEach((b) => b.onclick = () => g.craft(b.dataset.craft));
  }

  // Show lines one after another; resolves when finished.
  async subtitles(lines, who = 'PHONE') {
    const token = {};
    this.subQueue = token;
    for (const line of lines) {
      if (this.subQueue !== token) return;
      $('subtitles').innerHTML = `<span class="who">${who}:</span> ${line}`;
      this.game.audio.speak(line, this.game.settings.voice);
      await new Promise((r) => setTimeout(r, 1400 + line.length * 62));
    }
    if (this.subQueue === token) $('subtitles').innerHTML = '';
  }
  clearSubtitles() { this.subQueue = null; $('subtitles').innerHTML = ''; this.game.audio.stopSpeech(); }

  fade(on, html = '') {
    $('fade').classList.toggle('on', on);
    $('fadetext').innerHTML = html;
  }

  drawMap() {
    const g = this.game, w = g.world, p = g.player, st = g.state;
    const cv = $('map'), dpr = Math.min(2, devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const s = this.mapZoom;
    const sx = (x) => W / 2 + (x - p.pos.x) * s, sz = (z) => H / 2 + (z - p.pos.z) * s;
    const halfW = W / 2 / s, halfH = H / 2 / s;
    const gx0 = Math.floor((p.pos.x - halfW) / CELL) - 1, gx1 = Math.floor((p.pos.x + halfW) / CELL) + 1;
    const gz0 = Math.floor((p.pos.z - halfH) / CELL) - 1, gz1 = Math.floor((p.pos.z + halfH) / CELL) + 1;
    const ex = st.explored;
    ctx.lineWidth = Math.max(1, s * 0.25);
    ctx.strokeStyle = '#c9b77a';
    for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
      if (!ex.has(`${gx},${gz}`)) continue;
      const t = w.cellType(gx, gz);
      ctx.fillStyle = w.waterAt(gx, gz) ? '#1d4a5a' : t === 'pool' ? '#3a4a4c' : t === 'jackpot' ? '#4a3d18' : '#2b2616';
      ctx.fillRect(sx(gx * CELL), sz(gz * CELL), CELL * s + 0.5, CELL * s + 0.5);
    }
    ctx.beginPath();
    for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
      if (!ex.has(`${gx},${gz}`)) continue;
      const x = gx * CELL, z = gz * CELL;
      const edge = (x1, z1, x2, z2) => { ctx.moveTo(sx(x1), sz(z1)); ctx.lineTo(sx(x2), sz(z2)); };
      if (w.wallW(gx, gz)) edge(x, z, x, z + CELL);
      if (w.wallW(gx + 1, gz)) edge(x + CELL, z, x + CELL, z + CELL);
      if (w.wallN(gx, gz)) edge(x, z, x + CELL, z);
      if (w.wallN(gx, gz + 1)) edge(x, z + CELL, x + CELL, z + CELL);
    }
    ctx.stroke();
    // base
    ctx.strokeStyle = '#6fd36f'; ctx.lineWidth = 2;
    ctx.strokeRect(sx(0), sz(0), 3 * CELL * s, 3 * CELL * s);
    ctx.fillStyle = '#6fd36f'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
    ctx.fillText('BASE / BED', sx(6), sz(6));
    // generators
    const t = performance.now() / 1000;
    const cs = CELL * CHUNK;
    const near = g.entities.nearestGenerator(p.pos.x, p.pos.z);
    for (let cx = Math.floor((p.pos.x - halfW) / cs); cx <= Math.floor((p.pos.x + halfW) / cs); cx++) {
      for (let cz = Math.floor((p.pos.z - halfH) / cs); cz <= Math.floor((p.pos.z + halfH) / cs); cz++) {
        const gen = w.genForChunk(cx, cz);
        if (!gen || !ex.has(`${gen.gx},${gen.gz}`)) continue;
        this._dot(ctx, sx(gen.x), sz(gen.z), 4, '#f2c230');
      }
    }
    if (!st.power && near) {
      const x = sx(near.x), z = sz(near.z);
      ctx.strokeStyle = `rgba(242,194,48,${0.5 + 0.5 * Math.sin(t * 6)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, z, 12 + Math.sin(t * 6) * 4, 0, 7); ctx.stroke();
      ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(x, z); ctx.stroke(); ctx.setLineDash([]);
      this._pin(ctx, near.x, near.z, sx, sz, W, H, '#f2c230', `GENERATOR ${Math.round(Math.hypot(near.x - p.pos.x, near.z - p.pos.z))}m`);
    }
    for (const m of st.mines) this._dot(ctx, sx(m.x), sz(m.z), 3, '#a0a060');
    for (const k of g.entities.karts.values()) this._pin(ctx, k.data.x, k.data.z, sx, sz, W, H, '#ff5a3c', `GO-KART ${Math.round(Math.hypot(k.data.x - p.pos.x, k.data.z - p.pos.z))}m`);
    for (const r of g.net.remotes.values()) if (r.state) this._pin(ctx, r.state.x, r.state.z, sx, sz, W, H, '#4fb8ff', 'PLAYER');
    // you
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-p.yaw);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#efe6c4'; ctx.textAlign = 'left'; ctx.font = '14px monospace';
    ctx.fillText(`DAY ${st.day}   ${Math.round(p.pos.x)}, ${Math.round(p.pos.z)}   ${w.cellType(Math.floor(p.pos.x / CELL), Math.floor(p.pos.z / CELL)).toUpperCase()}`, 20, 30);
  }

  _dot(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }

  // A ping that sticks to the screen edge when off-map.
  _pin(ctx, wx, wz, sx, sz, W, H, color, label) {
    let x = sx(wx), y = sz(wz);
    const pad = 30;
    const off = x < pad || x > W - pad || y < pad || y > H - pad;
    if (off) {
      const dx = x - W / 2, dy = y - H / 2;
      const k = Math.min((W / 2 - pad) / Math.abs(dx || 1e-6), (H / 2 - pad) / Math.abs(dy || 1e-6));
      x = W / 2 + dx * k; y = H / 2 + dy * k;
    }
    this._dot(ctx, x, y, 6, color);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 9 + (performance.now() / 120) % 8, 0, 7); ctx.stroke();
    ctx.fillStyle = color; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText(label, x, y - 14);
  }
}
