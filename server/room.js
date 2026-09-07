'use strict';
const Body = require('../shared/body');

const CONST = {
  MAP_W: 2400,
  MAP_H: 1600,
  VIEW_RADIUS: 300,      // radio de visión del buscador (unidades de mundo)
  HIT_MARGIN: 5,         // dispersión de la escopeta
  SHOT_COOLDOWN: 900,    // ms entre disparos
  TAUNT_COOLDOWN: 12000, // ms entre silbidos
  RESULTS_TIME: 12000,   // ms mostrando resultados
  SEEKER_BASE: { x: 0, y: 0, w: 340, h: 240 },
  SPEED_MAX: 320,        // límite de velocidad tolerado (u/s)
  MAX_PLAYERS: 12,
  MIN_PLAYERS: 2,
  POINTS: { LOS_PER_SEC: 1, TAUNT: 3, SURVIVE: 30, TAG: 25, ALL_FOUND: 30, MISS: -1 },
};
const THEMES = ['almacen', 'jardin', 'galeria'];
const DEFAULT_SETTINGS = { hideTime: 60, seekTime: 150, theme: 'random' };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

class Room {
  constructor(code, isPublic, onEmpty) {
    this.code = code;
    this.isPublic = !!isPublic;
    this.onEmpty = onEmpty;
    this.players = new Map();
    this.phase = 'lobby';
    this.phaseEnds = 0;
    this.seed = (Math.random() * 0x7fffffff) | 0;
    this.theme = THEMES[(Math.random() * THEMES.length) | 0];
    this.round = 0;
    this.hostId = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.lastRound = null;
    this.lastLosTick = 0;
    this.createdAt = Date.now();
  }

  // ---------- jugadores ----------
  addPlayer(client, name) {
    if (this.players.size >= CONST.MAX_PLAYERS) return { error: 'La sala está llena' };
    const p = {
      id: client.id, client, name,
      x: 0, y: 0, rot: 0, pose: 'stand', flip: false,
      role: null, alive: true,
      score: 0, roundScore: 0, seekerCount: 0,
      parts: {},
      lastShot: 0, lastTaunt: 0, lastMoveAt: 0,
    };
    this.placeInLobby(p);
    this.players.set(p.id, p);
    if (!this.hostId) this.hostId = p.id;
    if (this.phase === 'hide' || this.phase === 'seek') {
      // Se une a mitad de ronda: espectador hasta la próxima ronda.
      p.role = 'spectator';
      p.alive = false;
    }
    this.broadcastRoom();
    return { ok: true };
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (this.hostId === id) this.hostId = this.players.size ? this.players.keys().next().value : null;
    if (!this.players.size) { this.onEmpty && this.onEmpty(this); return; }
    if (this.phase === 'seek' || this.phase === 'hide') this.checkRoundEnd();
    this.broadcastRoom();
  }

  placeInLobby(p) {
    p.x = 600 + Math.random() * 400;
    p.y = 400 + Math.random() * 300;
    p.rot = 0; p.pose = 'stand'; p.flip = false;
  }

  // ---------- serialización ----------
  serializePlayer(p, withParts) {
    const o = {
      id: p.id, name: p.name, x: Math.round(p.x), y: Math.round(p.y), rot: +p.rot.toFixed(3),
      pose: p.pose, flip: p.flip, role: p.role, alive: p.alive,
      score: p.score, roundScore: p.roundScore,
    };
    if (withParts) o.parts = p.parts;
    return o;
  }

  snapshot(forPlayer) {
    const hideHiders = forPlayer && forPlayer.role === 'seeker' && this.phase === 'hide';
    return {
      t: 'room',
      code: this.code, isPublic: this.isPublic,
      phase: this.phase, phaseEnds: this.phaseEnds, now: Date.now(),
      seed: this.seed, theme: this.theme, round: this.round,
      hostId: this.hostId, settings: this.settings,
      map: { w: CONST.MAP_W, h: CONST.MAP_H, viewRadius: CONST.VIEW_RADIUS, base: CONST.SEEKER_BASE },
      lastRound: this.lastRound,
      hidersLeft: this.hidersAlive().length,
      players: [...this.players.values()]
        .filter((p) => !(hideHiders && p.role === 'hider'))
        .map((p) => this.serializePlayer(p, true)),
    };
  }

  send(p, msg) { p.client.send(msg); }
  broadcast(msg, filter) {
    for (const p of this.players.values()) if (!filter || filter(p)) this.send(p, msg);
  }
  broadcastRoom() {
    for (const p of this.players.values()) this.send(p, this.snapshot(p));
  }

  listInfo() {
    return { code: this.code, players: this.players.size, max: CONST.MAX_PLAYERS, phase: this.phase, host: this.players.get(this.hostId)?.name || '' };
  }

  // ---------- ciclo de ronda ----------
  start(p, settings) {
    if (p.id !== this.hostId) return { error: 'Solo el anfitrión puede iniciar' };
    if (this.phase !== 'lobby' && this.phase !== 'results') return { error: 'La ronda ya está en curso' };
    if (this.players.size < CONST.MIN_PLAYERS) return { error: `Se necesitan al menos ${CONST.MIN_PLAYERS} jugadores` };
    if (settings) {
      const s = { ...this.settings };
      if (Number.isFinite(+settings.hideTime)) s.hideTime = clamp(Math.round(+settings.hideTime), 15, 300);
      if (Number.isFinite(+settings.seekTime)) s.seekTime = clamp(Math.round(+settings.seekTime), 30, 600);
      if (settings.theme === 'random' || THEMES.includes(settings.theme)) s.theme = settings.theme;
      this.settings = s;
    }
    this.beginHide();
    return { ok: true };
  }

  chooseSeekers() {
    const n = this.players.size;
    const count = Math.max(1, Math.floor(n / 3));
    const list = [...this.players.values()].sort((a, b) => a.seekerCount - b.seekerCount || Math.random() - 0.5);
    return new Set(list.slice(0, count).map((p) => p.id));
  }

  beginHide() {
    this.round++;
    this.seed = (Math.random() * 0x7fffffff) | 0;
    this.theme = this.settings.theme === 'random' ? THEMES[(Math.random() * THEMES.length) | 0] : this.settings.theme;
    const seekers = this.chooseSeekers();
    const base = CONST.SEEKER_BASE;
    for (const p of this.players.values()) {
      p.roundScore = 0;
      p.parts = {};
      p.alive = true;
      p.pose = 'stand'; p.rot = 0; p.flip = false;
      if (seekers.has(p.id)) {
        p.role = 'seeker';
        p.seekerCount++;
        p.x = base.x + 60 + Math.random() * (base.w - 120);
        p.y = base.y + 60 + Math.random() * (base.h - 120);
      } else {
        p.role = 'hider';
        do {
          p.x = 80 + Math.random() * (CONST.MAP_W - 160);
          p.y = 80 + Math.random() * (CONST.MAP_H - 160);
        } while (p.x < base.w + 300 && p.y < base.h + 300);
      }
    }
    this.phase = 'hide';
    this.phaseEnds = Date.now() + this.settings.hideTime * 1000;
    this.broadcastRoom();
  }

  beginSeek() {
    this.phase = 'seek';
    this.phaseEnds = Date.now() + this.settings.seekTime * 1000;
    this.lastLosTick = Date.now();
    this.broadcastRoom();
  }

  hidersAlive() { return [...this.players.values()].filter((p) => p.role === 'hider' && p.alive); }
  seekersList() { return [...this.players.values()].filter((p) => p.role === 'seeker'); }

  checkRoundEnd() {
    if (this.phase !== 'seek' && this.phase !== 'hide') return;
    const hiders = [...this.players.values()].filter((p) => p.role === 'hider');
    const seekers = this.seekersList();
    if (!seekers.length) return this.endRound('no_seekers');
    if (!hiders.length) return this.endRound('no_hiders');
    if (this.phase === 'seek' && !this.hidersAlive().length) return this.endRound('all_found');
  }

  endRound(reason) {
    const hidersWin = reason !== 'all_found';
    for (const p of this.players.values()) {
      if (p.role === 'hider' && p.alive && hidersWin && reason !== 'no_seekers') {
        p.roundScore += CONST.POINTS.SURVIVE; p.score += CONST.POINTS.SURVIVE;
      }
      if (p.role === 'seeker' && reason === 'all_found') {
        p.roundScore += CONST.POINTS.ALL_FOUND; p.score += CONST.POINTS.ALL_FOUND;
      }
    }
    this.lastRound = {
      round: this.round, reason, winners: hidersWin ? 'hiders' : 'seekers',
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, role: p.role, alive: p.alive, roundScore: p.roundScore, score: p.score })),
    };
    this.phase = 'results';
    this.phaseEnds = Date.now() + CONST.RESULTS_TIME;
    this.broadcastRoom();
  }

  backToLobby() {
    this.phase = 'lobby';
    this.phaseEnds = 0;
    for (const p of this.players.values()) {
      p.role = null; p.alive = true; p.parts = {};
      this.placeInLobby(p);
    }
    this.broadcastRoom();
  }

  tick(now) {
    if (this.phase === 'hide' && now >= this.phaseEnds) this.beginSeek();
    else if (this.phase === 'seek') {
      if (now >= this.phaseEnds) return this.endRound('timeout');
      // Puntos por estar a la vista de un buscador.
      if (now - this.lastLosTick >= 1000) {
        this.lastLosTick = now;
        const seekers = this.seekersList();
        const r2 = CONST.VIEW_RADIUS * CONST.VIEW_RADIUS;
        for (const h of this.hidersAlive()) {
          if (seekers.some((s) => dist2(s, h) <= r2)) { h.roundScore += CONST.POINTS.LOS_PER_SEC; h.score += CONST.POINTS.LOS_PER_SEC; }
        }
      }
    } else if (this.phase === 'results' && now >= this.phaseEnds) this.backToLobby();
  }

  // ---------- acciones ----------
  canMove(p) {
    if (this.phase === 'lobby') return true;
    if (p.role === 'hider') return p.alive && (this.phase === 'hide' || this.phase === 'seek');
    if (p.role === 'seeker') return this.phase === 'seek';
    return false;
  }

  onMove(p, m) {
    if (!this.canMove(p)) return;
    const x = clamp(+m.x || 0, 20, CONST.MAP_W - 20);
    const y = clamp(+m.y || 0, 20, CONST.MAP_H - 20);
    const now = Date.now();
    const dt = Math.max(0.02, (now - (p.lastMoveAt || now - 50)) / 1000);
    const dx = x - p.x, dy = y - p.y;
    const maxD = CONST.SPEED_MAX * dt + 8;
    if (dx * dx + dy * dy > maxD * maxD) {
      // Demasiado rápido: acotamos el movimiento al máximo permitido.
      const d = Math.sqrt(dx * dx + dy * dy);
      p.x += (dx / d) * maxD; p.y += (dy / d) * maxD;
    } else { p.x = x; p.y = y; }
    p.lastMoveAt = now;
    if (Number.isFinite(+m.rot)) p.rot = +m.rot;
    if (Body.POSES[m.pose]) p.pose = m.pose;
    p.flip = !!m.flip;
  }

  canPaint(p) {
    if (this.phase === 'lobby') return true;
    return p.role === 'hider' && p.alive && (this.phase === 'hide' || this.phase === 'seek');
  }

  onPaint(p, parts) {
    if (!this.canPaint(p) || !parts || typeof parts !== 'object') return;
    const clean = {};
    for (const k of Object.keys(parts)) {
      if (!Body.PARTS[k]) continue;
      const v = parts[k];
      if (typeof v !== 'string' || !v.startsWith('data:image/png;base64,') || v.length > 40000) continue;
      clean[k] = v; p.parts[k] = v;
    }
    if (!Object.keys(clean).length) return;
    const msg = { t: 'paint', id: p.id, parts: clean };
    // Durante la fase de escondite los buscadores no reciben nada.
    this.broadcast(msg, (q) => q.id !== p.id && !(this.phase === 'hide' && q.role === 'seeker'));
  }

  onShoot(p, m) {
    if (p.role !== 'seeker' || this.phase !== 'seek') return;
    const now = Date.now();
    if (now - p.lastShot < CONST.SHOT_COOLDOWN) return;
    const x = +m.x, y = +m.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // Solo se puede disparar dentro del radio de visión.
    const dx = x - p.x, dy = y - p.y;
    if (dx * dx + dy * dy > (CONST.VIEW_RADIUS + 20) ** 2) return;
    p.lastShot = now;
    let hit = null;
    for (const h of this.hidersAlive()) {
      if (Body.hitTest(h, x, y, CONST.HIT_MARGIN)) { hit = h; break; }
    }
    if (hit) {
      hit.alive = false;
      p.roundScore += CONST.POINTS.TAG; p.score += CONST.POINTS.TAG;
    } else {
      p.roundScore += CONST.POINTS.MISS; p.score += CONST.POINTS.MISS;
    }
    this.broadcast({ t: 'event', kind: 'shot', x: Math.round(x), y: Math.round(y), by: p.id, hit: hit ? hit.id : null, hitName: hit ? hit.name : null, left: this.hidersAlive().length });
    if (hit) this.checkRoundEnd();
  }

  onTaunt(p) {
    if (p.role !== 'hider' || !p.alive || this.phase !== 'seek') return;
    const now = Date.now();
    if (now - p.lastTaunt < CONST.TAUNT_COOLDOWN) return;
    p.lastTaunt = now;
    p.roundScore += CONST.POINTS.TAUNT; p.score += CONST.POINTS.TAUNT;
    // El silbido revela una posición aproximada.
    const jx = (Math.random() - 0.5) * 120, jy = (Math.random() - 0.5) * 120;
    this.broadcast({ t: 'event', kind: 'taunt', x: Math.round(p.x + jx), y: Math.round(p.y + jy), id: p.id });
  }

  // Estado ligero a 20 Hz.
  stateFor(target) {
    const seekerInHide = target.role === 'seeker' && this.phase === 'hide';
    const seekerInSeek = target.role === 'seeker' && this.phase === 'seek';
    const seekers = seekerInSeek ? this.seekersList() : null;
    const r2 = (CONST.VIEW_RADIUS * 1.3) ** 2;
    const arr = [];
    for (const p of this.players.values()) {
      if (p.role === 'hider') {
        if (seekerInHide) continue;
        if (seekerInSeek && p.alive && !seekers.some((s) => dist2(s, p) <= r2)) continue;
      }
      arr.push([p.id, Math.round(p.x), Math.round(p.y), +p.rot.toFixed(3), p.pose, p.flip ? 1 : 0, p.alive ? 1 : 0, p.score, p.roundScore]);
    }
    return { t: 'state', now: Date.now(), phaseEnds: this.phaseEnds, hl: this.hidersAlive().length, p: arr };
  }

  sendStates() {
    for (const p of this.players.values()) this.send(p, this.stateFor(p));
  }
}

module.exports = { Room, CONST, THEMES };
