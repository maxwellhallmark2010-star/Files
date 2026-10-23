// Co-op multiplayer with two transports behind one interface:
//  - "room": the Claude page's built-in live room. Works inside the Claude
//    link for signed-in players the artifact is shared with. Everything
//    travels in each player's presence object (anyone may set presence,
//    while broadcast events are owner-only), including a short rolling log
//    of actions that the others replay once each.
//  - "peer": WebRTC via PeerJS, for copies of the game hosted on a normal
//    website (GitHub Pages, Netlify, localhost).
// The host's world is authoritative for monsters, power and shared objects;
// each player keeps their own objectives.
import * as Models from './models.js';

const PREFIX = 'bkrm-lvl0-';
// Where the full game is hosted for peer-to-peer play.
export const PLAY_URL = 'https://maxwellhallmark2010-star.github.io/Files/';
const RELAY = new Set(['p', 'pickup', 'kart', 'mine', 'boom', 'step', 'shot']);
const ROOM_EVENTS = new Set(['pickup', 'mine', 'boom', 'power', 'restore', 'hit', 'step', 'shot']);
const EV_KEEP = 14;       // actions kept in presence for others to replay
const PRESENCE_MAX = 3900; // bytes; the platform's cap is 4 KiB

const codeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 5 }, () => codeChars[(Math.random() * 32) | 0]).join('');

export class Net {
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.conns = new Map();   // peerId -> DataConnection
    this.remotes = new Map(); // peerId -> {state, mesh}
    this.isHost = false;
    this.isClient = false;
    this.mode = null;         // 'room' | 'peer'
    this.sendT = 0; this.monT = 0; this.snapT = 0;
    // the Claude page's live room, if this page is running inside one
    this.roomApi = null;
    this.roomReady = false;
    const use = window.claude?.use;
    if (typeof use === 'function') {
      Promise.race([use.call(window.claude, 'room'), new Promise((r) => setTimeout(() => r(null), 12000))])
        .then((r) => { this.roomApi = r; })
        .catch(() => {})
        .finally(() => { this.roomReady = true; });
    } else this.roomReady = true;
  }

  get active() { return this.isHost || this.isClient; }

  get inClaude() { return typeof window.claude?.use === 'function' || /claude|anthropic/i.test(location.hostname); }

  // Why multiplayer can't run on this page, or '' if it can.
  unavailableReason() {
    if (this.roomApi) return '';
    if (this.inClaude) {
      if (!this.roomReady) return 'Connecting to the multiplayer service… try again in a few seconds.';
      return 'Multiplayer needs you to be signed in to Claude with this game shared to you (Share menu → invite). '
        + `Or play the hosted version: ${PLAY_URL}`;
    }
    if (!window.RTCPeerConnection) return 'This browser blocks peer-to-peer connections, so multiplayer is unavailable here.';
    if (!window.Peer) return 'The multiplayer library failed to download. Check your internet connection and reload the page.';
    return '';
  }

  // ======================= hosting & joining =======================

  host(onCode, onError) {
    const why = this.unavailableReason();
    if (why) return onError(why);
    if (this.roomApi) return this._roomHost(onCode, onError);
    const code = newCode();
    this.mode = 'peer';
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
    const why = this.unavailableReason();
    if (why) return onError(why);
    if (this.roomApi) return this._roomJoin(code, onError);
    this.mode = 'peer';
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

  _peerOpts() {
    const h = (this.game.settings.peerHost || '').trim();
    if (!h) return { debug: 1 };
    const [host, port] = h.replace(/^https?:\/\//, '').split(':');
    return { host, port: port ? +port : (location.protocol === 'https:' ? 443 : 80), path: '/', secure: location.protocol === 'https:', debug: 1 };
  }

  // ======================= Claude room transport =======================

  async _roomOpen(code) {
    this.mode = 'room';
    this.code = code;
    this.room = await this.roomApi.join(`bkrm-${code.toLowerCase()}`);
    this.me = { role: null, p: null, mon: null, kart: null, s: null, ev: [] };
    this.evSeq = 0;
    this.seen = new Map(); // peer -> last event seq replayed
    this.unsubs = [this.room.onPeers((c) => this._roomPeers(c))];
  }

  async _roomHost(onCode, onError) {
    try {
      const code = newCode();
      await this._roomOpen(code);
      this.isHost = true;
      this.me.role = 'host';
      this._roomSnapshot();
      onCode(code);
    } catch (e) { onError(roomError(e)); }
  }

  async _roomJoin(code, onError) {
    try {
      await this._roomOpen(code.trim().toUpperCase());
      this.me.role = 'guest';
      this._push({});
      // the host's presence carries the world; wait for it
      const t0 = Date.now();
      const look = () => {
        if (this.isClient || this.mode !== 'room') return;
        const host = this.room.peers().find((p) => !p.sameTab && p.presence?.role === 'host' && p.presence.s);
        if (host) {
          this.isClient = true;
          this.hostPeer = host.peer;
          this.game.startNetGame(host.presence.s);
          // treat everyone as just met: their earlier actions are already in the snapshot
          this._roomPeers({ joined: this.room.peers(), updated: [], left: [] });
        } else if (Date.now() - t0 > 12000) {
          this.close();
          onError('No game found with that code. Check it, and make sure the host is still in the game.');
        } else setTimeout(look, 300);
      };
      look();
    } catch (e) { onError(roomError(e)); }
  }

  // Write my presence, trimming the world snapshot if it would not fit.
  _push(patch) {
    Object.assign(this.me, patch);
    let body = { role: this.me.role, p: this.me.p, mon: this.me.mon, kart: this.me.kart, s: this.me.s, ev: this.me.ev };
    let size = JSON.stringify(body).length;
    while (size > PRESENCE_MAX && body.s?.picked?.length) {
      body = { ...body, s: { ...body.s, picked: body.s.picked.slice(Math.ceil(body.s.picked.length / 4)) } };
      size = JSON.stringify(body).length;
    }
    while (size > PRESENCE_MAX && body.ev.length > 2) { body = { ...body, ev: body.ev.slice(2) }; size = JSON.stringify(body).length; }
    this.room.presence(body).catch(() => {});
  }

  _roomSnapshot() {
    const s = this.game.snapshotForGuest();
    this._push({ s: { ...s, picked: s.picked.slice(-300) } });
  }

  _roomSend(msg) {
    const p = this.me;
    if (msg.t === 'p') { p.p = msg; return this._push({}); }
    if (msg.t === 'mon') { p.mon = msg.l; return this._push({}); }
    if (msg.t === 'kart') {
      p.kart = msg.k;
      // a newly built kart also goes in the action log so nobody misses it
      if (!this.kartsSent) this.kartsSent = new Set();
      if (!this.kartsSent.has(msg.k.id)) { this.kartsSent.add(msg.k.id); this._addEvent(msg); }
      return this._push({});
    }
    if (ROOM_EVENTS.has(msg.t)) this._addEvent(msg);
  }

  _addEvent(msg) {
    this.me.ev = [...this.me.ev, { ...msg, n: ++this.evSeq }].slice(-EV_KEEP);
    this._push({});
  }

  _roomPeers(change) {
    for (const peer of [...(change.joined || []), ...(change.updated || [])]) {
      if (peer.isMe && peer.sameTab) continue;
      const pr = peer.presence || {};
      const id = peer.peer;
      if (change.joined?.includes(peer) && this.isHost && pr.role === 'guest' && this.seen.has(peer.peer) === false) this.game.ui.toast('A player joined your game');
      if (pr.p && this.active) this._onData(id, pr.p);
      if (pr.kart && this.active) this._onData(id, { t: 'kart', k: pr.kart });
      if (pr.mon && this.isClient && pr.role === 'host') this.game.monsters.applySnapshot(pr.mon);
      if (Array.isArray(pr.ev) && this.active) {
        const last = this.seen.get(id) ?? (change.joined?.includes(peer) ? Math.max(0, ...pr.ev.map((e) => e.n || 0)) : 0);
        for (const e of pr.ev) if (e && e.n > last && typeof e.t === 'string') this._onData(id, e);
        this.seen.set(id, Math.max(last, ...pr.ev.map((e) => e.n || 0)));
      }
    }
    for (const peer of change.left || []) {
      this._drop(peer.peer);
      if (this.isClient && peer.peer === this.hostPeer) this.game.onHostLost();
    }
  }

  // ======================= shared =======================

  send(msg) {
    if (!this.active && !(this.mode === 'room' && this.me?.role)) return;
    if (this.mode === 'room') return this._roomSend(msg);
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  _onData(from, m) {
    const g = this.game;
    if (!m || typeof m.t !== 'string') return;
    if (this.mode === 'peer' && this.isHost && RELAY.has(m.t)) {
      const fwd = { ...m, from: m.from || from };
      for (const [id, c] of this.conns) if (id !== from && c.open) c.send(fwd);
    }
    const who = m.from || from;
    if (!g.state && m.t !== 'init') return;
    switch (m.t) {
      case 'init': g.startNetGame(m.s); break;
      case 'p': this._remote(who).state = m; break;
      case 'pickup': g.state.picked.add(m.id); g.entities.removeItem(m.id); break;
      case 'kart': if (m.k && g.player.kart?.data.id !== m.k.id) g.entities.syncKart(m.k); break;
      case 'mine': if (!g.state.mines.find((x) => x.id === m.m.id)) g.state.mines.push(m.m); g.entities.placeMine(m.m, false); break;
      case 'boom': g.entities.explodeMine(m.id, false); break;
      case 'mon': g.monsters.applySnapshot(m.l); break;
      case 'hit': if (this.isHost) g.monsters.all[m.i]?.damage(1); break;
      case 'power': if (!this.isHost) g.setPower(m.on, false); break;
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
      // keep the world snapshot fresh for players who join later
      if (this.mode === 'room') { this.snapT -= dt; if (this.snapT <= 0) { this.snapT = 2; this._roomSnapshot(); } }
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
    if (this.mode === 'room') {
      for (const u of this.unsubs || []) try { u(); } catch (e) { /* ignore */ }
      this.room?.leave().catch(() => {});
      this.room = null; this.me = null; this.unsubs = null; this.kartsSent = null;
    } else {
      try { this.send({ t: 'bye' }); } catch (e) { /* ignore */ }
    }
    for (const r of this.remotes.values()) this.game.scene.remove(r.mesh);
    this.remotes.clear();
    for (const c of this.conns.values()) try { c.close(); } catch (e) { /* ignore */ }
    this.conns.clear();
    try { this.peer?.destroy(); } catch (e) { /* ignore */ }
    this.peer = null;
    this.mode = null;
    this.isHost = this.isClient = false;
  }
}

function roomError(e) {
  const c = e?.code;
  if (c === 'not_permitted' || c === 'not_granted') return 'You can\'t join rooms on this page. Sign in to Claude and ask the owner to share the game with you (Share menu → invite).';
  if (c === 'limit_reached') return 'Too many rooms open right now. Try again in a moment.';
  return 'Couldn\'t reach the multiplayer service. Check your connection and try again.';
}
