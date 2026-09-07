'use strict';
/* Test de humo: levanta el servidor, conecta dos clientes, crea/une sala,
   inicia una ronda corta y comprueba fases, pintura y disparo. */
const assert = require('assert');
const WebSocket = require('ws');
const { startServer, rooms } = require('../server/index');

const PORT = 3999;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const c = { ws, name, msgs: [], id: null, room: null, step: "" };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    c.msgs.push(m);
    if (m.t === 'joined') c.id = m.id;
    if (m.t === 'room') c.room = m;
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.until = (pred, timeout = 5000) => new Promise((res, rej) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const f = c.msgs.find(pred);
      if (f) { clearInterval(iv); res(f); }
      else if (Date.now() - t0 > timeout) { clearInterval(iv); rej(new Error(`${name}: timeout esperando mensaje (${pred.toString()}); últimos: ${c.msgs.slice(-5).map((m) => m.t + (m.msg ? ":" + m.msg : "")).join(",")}`)); }
    }, 20);
  });
  return new Promise((res) => ws.on('open', () => res(c)));
}

(async () => {
  const server = startServer(PORT);
  try {
    const a = await client('Ana');
    const b = await client('Beto');
    a.send({ t: 'create', isPublic: true, name: 'Ana' });
    const joined = await a.until((m) => m.t === 'joined');
    assert.strictEqual(joined.code.length, 4, 'código de sala de 4 letras');
    b.send({ t: 'join', code: joined.code, name: 'Beto' });
    await b.until((m) => m.t === 'joined');
    await a.until((m) => m.t === 'room' && m.players.length === 2);
    assert.strictEqual(a.room.hostId, a.id, 'el creador es anfitrión');

    // Lista pública
    b.send({ t: 'list' });
    const list = await b.until((m) => m.t === 'rooms');
    assert.ok(list.rooms.some((r) => r.code === joined.code), 'sala visible en la lista pública');

    // Solo el anfitrión inicia
    b.send({ t: 'start' });
    await b.until((m) => m.t === 'error');

    a.send({ t: 'start', settings: { hideTime: 15, seekTime: 30, theme: 'almacen' } });
    await a.until((m) => m.t === 'room' && m.phase === 'hide');
    await b.until((m) => m.t === 'room' && m.phase === 'hide');
    const room = rooms.get(joined.code);
    const hider = [...room.players.values()].find((p) => p.role === 'hider');
    const seeker = [...room.players.values()].find((p) => p.role === 'seeker');
    assert.ok(hider && seeker, 'hay un escondido y un buscador');
    const hc = hider.id === a.id ? a : b, sc = seeker.id === a.id ? a : b;
    assert.ok(!sc.room.players.some((p) => p.role === 'hider'), 'el buscador no ve a los escondidos durante el escondite');

    // Pintura
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    hc.send({ t: 'paint', parts: { head: png, bogus: png } });
    await wait(100);
    assert.strictEqual(hider.parts.head, png, 'pintura guardada');
    assert.ok(!hider.parts.bogus, 'parte inválida ignorada');
    assert.ok(!sc.msgs.some((m) => m.t === 'paint'), 'el buscador no recibe pintura en fase de escondite');

    // El buscador no se mueve durante el escondite
    const sx = seeker.x;
    sc.send({ t: 'move', x: sx + 100, y: seeker.y });
    await wait(100);
    assert.strictEqual(seeker.x, sx, 'buscador inmóvil en fase de escondite');

    // Forzamos el paso a búsqueda
    room.phaseEnds = Date.now() - 1;
    await sc.until((m) => m.t === 'room' && m.phase === 'seek');
    assert.ok(sc.room.players.some((p) => p.role === 'hider' && p.parts.head === png), 'el buscador recibe la pintura al empezar la búsqueda');

    // Disparo fallido fuera del alcance: ignorado; disparo cerca acierta
    seeker.x = hider.x + 100; seeker.y = hider.y;
    sc.send({ t: 'shoot', x: hider.x + 2000, y: hider.y });
    await wait(50);
    assert.ok(hider.alive, 'disparo fuera de alcance no cuenta');
    sc.send({ t: 'shoot', x: hider.x, y: hider.y - 27 });
    const shot = await sc.until((m) => m.t === 'event' && m.kind === 'shot');
    assert.strictEqual(shot.hit, hider.id, 'el disparo a la cabeza acierta');
    await sc.until((m) => m.t === 'room' && m.phase === 'results');
    assert.strictEqual(sc.room.lastRound.winners, 'seekers');
    assert.ok(seeker.score >= 25, 'puntos por captura');

    a.ws.close(); b.ws.close();
    await wait(100);
    assert.ok(!rooms.has(joined.code), 'la sala vacía se elimina');
    console.log('OK: todas las comprobaciones pasaron');
    server.closeAll();
    process.exit(0);
  } catch (e) {
    console.error('FALLO:', e);
    server.closeAll();
    process.exit(1);
  }
})();
