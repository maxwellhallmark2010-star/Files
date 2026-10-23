// Peer-to-peer co-op over WebRTC (PeerJS). The host's world is authoritative
// for monsters, power and shared objects; each player keeps their own
// objectives. The host relays guest messages to the other guests.
import * as Models from './models.js';

const PREFIX = 'bkrm-lvl0-';
const RELAY = new Set(['p', 'pickup', 'kart', 'mine', 'boom', 'step', 'shot']);

export class Net {
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.conns = new Map();   // peerId -> DataConnection
    this.remotes = new Map(); // peerId -> {state, mesh}
    this.isHost = false;
    this.isClient = false;
    this.sendT = 0; this.monT = 0;
  }

  get active() { return this.isHost || this.isClient; }

  _peerOpts() {
    const h = (this.game.settings.peerHost || '').trim();
    if (!h) return { debug: 1 };
    const [host, port] = h.replace(/^https?:\/\//, '').split(':');
    return { host, port: port ? +port : (location.protocol === 'https:' ? 443 : 80), path: '/', secure: location.protocol === 'https:', debug: 1 };
  }

  host(onCode, onError) {
    if (!window.Peer) return onError('Multiplayer library failed to load.');
    const code = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[(Math.random() * 32) | 0]).join('');
    this.peer = new window.Peer(PREFIX + code, this._peerOpts());
    this.peer.on('open', () => { this.isHost = true; onCode(code); });
    this.peer.on('error', (e) => onError(e.type === 'unavailable-id' ? 'Code clash, try again.' : `Network error: ${e.type || e}`));
    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.conns.set(conn.peer, conn);
        conn.send({ t: 'init', s: this.game.snapshotForGuest() });
        this.game.ui.toast('A player joined your game');
      });
      conn.on('data', (m) => this._onData(conn.peer, m));
      conn.on('close', () => this._drop(conn.peer));
      conn.on('error', () => this._drop(conn.peer));
    });
  }

  join(code, onError) {
    if (!window.Peer) return onError('Multiplayer library failed to load.');
    this.peer = new window.Peer(undefined, this._peerOpts());
    let opened = false;
    this.peer.on('error', (e) => onError(e.type === 'peer-unavailable' ? 'No game found with that code.' : `Network error: ${e.type || e}`));
    this.peer.on('open', () => {
      const conn = this.peer.connect(PREFIX + code.trim().toUpperCase(), { reliable: true });
      conn.on('open', () => { opened = true; this.isClient = true; this.conns.set(conn.peer, conn); });
      conn.on('data', (m) => this._onData(conn.peer, m));
      conn.on('close', () => { this._drop(conn.peer); if (opened) this.game.onHostLost(); });
      setTimeout(() => { if (!opened) onError('Could not reach host.'); }, 15000);
    });
  }

  send(msg) {
    if (!this.active) return;
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  _onData(from, m) {
    const g = this.game;
    if (this.isHost && RELAY.has(m.t)) {
      const fwd = { ...m, from: m.from || from };
      for (const [id, c] of this.conns) if (id !== from && c.open) c.send(fwd);
    }
    const who = m.from || from;
    switch (m.t) {
      case 'init': g.startNetGame(m.s); break;
      case 'p': this._remote(who).state = m; break;
      case 'pickup': g.state.picked.add(m.id); g.entities.removeItem(m.id); break;
      case 'kart': if (g.player.kart?.data.id !== m.k.id) g.entities.syncKart(m.k); break;
      case 'mine': if (!g.state.mines.find((x) => x.id === m.m.id)) g.state.mines.push(m.m); g.entities.placeMine(m.m, false); break;
      case 'boom': g.entities.explodeMine(m.id, false); break;
      case 'mon': g.monsters.applySnapshot(m.l); break;
      case 'hit': if (this.isHost) g.monsters.all[m.i]?.damage(1); break;
      case 'power': g.setPower(m.on, false); break;
      case 'restore': if (this.isHost) g.setPower(true); break;
      case 'step': g.audio.play(m.w ? 'stepWater' : 'step', { x: m.x, y: 0.1, z: m.z }); break;
      case 'shot': g.audio.play('gun', { x: m.x, y: m.y, z: m.z }, { ref: 5 }); break;
      case 'bye': this._drop(who); break;
    }
  }

  _remote(id) {
    let r = this.remotes.get(id);
    if (!r) {
      const mesh = Models.makeRemotePlayer(this.game.explorerModel);
      this.game.scene.add(mesh);
      r = { mesh, state: null };
      this.remotes.set(id, r);
    }
    return r;
  }

  _drop(id) {
    const r = this.remotes.get(id);
    if (r) { this.game.scene.remove(r.mesh); this.remotes.delete(id); this.game.ui.toast('A player left'); }
    this.conns.delete(id);
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game, p = g.player;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / 15;
      this.send({ t: 'p', x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(3), fl: p.flashlight ? 1 : 0, k: p.kart ? 1 : 0, dead: p.dead ? 1 : 0 });
    }
    if (this.isHost) {
      this.monT -= dt;
      if (this.monT <= 0) { this.monT = 0.1; this.send({ t: 'mon', l: g.monsters.snapshot() }); }
    }
    for (const r of this.remotes.values()) {
      const s = r.state;
      if (!s) continue;
      const m = r.mesh;
      const k = Math.min(1, dt * 12);
      m.position.x += (s.x - m.position.x) * k;
      m.position.z += (s.z - m.position.z) * k;
      m.position.y = s.k ? -0.4 : 0;
      let d = s.yaw + Math.PI - m.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      m.rotation.y += d * k;
      m.visible = !s.dead;
      m.userData.spot.intensity = s.fl ? 40 : 0;
    }
  }

  close() {
    try { this.send({ t: 'bye' }); } catch (e) { /* ignore */ }
    for (const r of this.remotes.values()) this.game.scene.remove(r.mesh);
    this.remotes.clear();
    for (const c of this.conns.values()) try { c.close(); } catch (e) { /* ignore */ }
    this.conns.clear();
    try { this.peer?.destroy(); } catch (e) { /* ignore */ }
    this.peer = null;
    this.isHost = this.isClient = false;
  }
}
