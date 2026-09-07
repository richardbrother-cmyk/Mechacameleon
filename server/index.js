'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Room } = require('./room');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SHARED_DIR = path.join(ROOT, 'shared');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.json': 'application/json',
};
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ---------- servidor estático ----------
function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  let base = PUBLIC_DIR;
  if (urlPath.startsWith('/shared/')) { base = SHARED_DIR; urlPath = urlPath.slice('/shared'.length); }
  const file = path.normalize(path.join(base, urlPath));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// ---------- salas ----------
const rooms = new Map();
function newCode() {
  let code;
  do { code = ''; for (let i = 0; i < 4; i++) code += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0]; } while (rooms.has(code));
  return code;
}
function createRoom(isPublic) {
  const room = new Room(newCode(), isPublic, (r) => rooms.delete(r.code));
  rooms.set(room.code, room);
  return room;
}
function publicRooms() {
  return [...rooms.values()].filter((r) => r.isPublic).map((r) => r.listInfo());
}

// ---------- clientes ----------
let nextId = 1;
class Client {
  constructor(ws) {
    this.ws = ws;
    this.id = String(nextId++);
    this.name = 'Jugador';
    this.room = null;
    this.alive = true;
    this.msgCount = 0;
    ws.on('message', (data) => this.onMessage(data));
    ws.on('close', () => this.leaveRoom());
    ws.on('error', () => this.leaveRoom());
    ws.on('pong', () => { this.alive = true; });
  }
  send(obj) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  error(msg) { this.send({ t: 'error', msg }); }
  player() { return this.room ? this.room.players.get(this.id) : null; }

  onMessage(data) {
    if (data.length > 200000) return;
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'hello': this.send({ t: 'hello', id: this.id, rooms: publicRooms() }); break;
      case 'list': this.send({ t: 'rooms', rooms: publicRooms() }); break;
      case 'create': this.join(m, createRoom(!!m.isPublic)); break;
      case 'join': {
        const code = String(m.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) return this.error('No existe ninguna sala con el código ' + code);
        this.join(m, room);
        break;
      }
      case 'leave': this.leaveRoom(); this.send({ t: 'left' }); break;
      case 'start': {
        const p = this.player(); if (!p) return;
        const r = this.room.start(p, m.settings);
        if (r.error) this.error(r.error);
        break;
      }
      case 'move': { const p = this.player(); if (p) this.room.onMove(p, m); break; }
      case 'paint': { const p = this.player(); if (p) this.room.onPaint(p, m.parts); break; }
      case 'shoot': { const p = this.player(); if (p) this.room.onShoot(p, m); break; }
      case 'taunt': { const p = this.player(); if (p) this.room.onTaunt(p); break; }
      case 'ping': this.send({ t: 'pong', c: m.c, now: Date.now() }); break;
      default: break;
    }
  }

  join(m, room) {
    if (this.room) this.leaveRoom();
    this.name = String(m.name || 'Jugador').replace(/[^\p{L}\p{N} _\-.!?]/gu, '').trim().slice(0, 16) || 'Jugador';
    const r = room.addPlayer(this, this.name);
    if (r.error) { if (!room.players.size) rooms.delete(room.code); return this.error(r.error); }
    this.room = room;
    this.send({ t: 'joined', id: this.id, code: room.code });
    this.send(room.snapshot(room.players.get(this.id)));
  }

  leaveRoom() {
    if (!this.room) return;
    const room = this.room;
    this.room = null;
    room.removePlayer(this.id);
  }
}

// ---------- arranque ----------
function startServer(port) {
  const server = http.createServer(serveStatic);
  const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });
  wss.on('connection', (ws) => new Client(ws));

  const tickTimer = setInterval(() => {
    const now = Date.now();
    for (const room of [...rooms.values()]) room.tick(now);
  }, 50);
  const stateTimer = setInterval(() => {
    for (const room of rooms.values()) room.sendStates();
  }, 50);
  const pingTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false; ws.ping();
    }
  }, 15000);
  wss.on('connection', (ws) => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); });

  server.listen(port, () => console.log(`Mecha Chameleon Online escuchando en http://localhost:${port}`));
  server.closeAll = () => { clearInterval(tickTimer); clearInterval(stateTimer); clearInterval(pingTimer); wss.close(); server.close(); };
  return server;
}

if (require.main === module) startServer(PORT);
module.exports = { startServer, rooms };
