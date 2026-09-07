'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const net = new Net();
  const BRUSHES = [0.6, 1.2, 2, 3.5, 6];
  const SPEED = 200;
  const ZOOM_MIN = 0.4, ZOOM_MAX = 10;

  const G = {
    id: null, room: null, players: new Map(),
    map: { canvas: null, seed: null, theme: null, w: 2400, h: 1600, viewRadius: 300, base: { x: 0, y: 0, w: 340, h: 240 } },
    cam: { x: 1200, y: 800, zoom: 1.6 },
    keys: {},
    mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false, button: -1, lastWx: 0, lastWy: 0 },
    tool: { color: '#ff4040', size: 2, recent: [] },
    effects: [],
    offset: 0,
    lastMoveSent: 0, lastPaintSent: 0, lastShot: 0, lastTaunt: 0,
    lastPhase: null, practicing: false,
    hidersLeft: 0,
  };
  let W = 0, H = 0, DPR = 1;
  const dark = document.createElement('canvas');

  // ---------- utilidades ----------
  const me = () => G.players.get(G.id);
  const now = () => Date.now() + G.offset;
  const phase = () => (G.room ? G.room.phase : 'none');
  function canMove(p) {
    const ph = phase();
    if (ph === 'lobby') return true;
    if (p.role === 'hider') return p.alive && (ph === 'hide' || ph === 'seek');
    if (p.role === 'seeker') return ph === 'seek';
    return false;
  }
  function canPaint(p) { return phase() === 'lobby' || (p.role === 'hider' && p.alive && (phase() === 'hide' || phase() === 'seek')); }
  function isSeekerView() { const m = me(); return m && m.role === 'seeker' && phase() === 'seek'; }
  function toast(msg, ms = 3000) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), ms); }
  function showMsg(msg, ms = 2500) { const e = $('hud-msg'); e.innerHTML = msg; e.classList.add('show'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('show'), ms); }
  function show(id, on) { $(id).classList.toggle('hidden', !on); }
  function screenToWorld(sx, sy) { return { x: (sx - W / 2) / G.cam.zoom + G.cam.x, y: (sy - H / 2) / G.cam.zoom + G.cam.y }; }
  function worldToScreen(wx, wy) { return { x: (wx - G.cam.x) * G.cam.zoom + W / 2, y: (wy - G.cam.y) * G.cam.zoom + H / 2 }; }

  // ---------- sonido ----------
  let audio = null;
  function beep(freq, dur, type = 'square', vol = 0.08) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + dur);
    } catch { /* sin audio */ }
  }
  function whistle() { beep(1200, 0.15, 'sine', 0.1); setTimeout(() => beep(1600, 0.25, 'sine', 0.1), 120); }
  function shotSound() { beep(90, 0.25, 'sawtooth', 0.15); beep(400, 0.05, 'square', 0.08); }

  // ---------- jugadores ----------
  function ensurePlayer(d) {
    let p = G.players.get(d.id);
    if (!p) {
      p = { id: d.id, name: d.name, x: d.x, y: d.y, tx: d.x, ty: d.y, rot: d.rot || 0, trot: d.rot || 0, pose: d.pose || 'stand', flip: !!d.flip, role: d.role, alive: d.alive !== false, score: d.score || 0, roundScore: d.roundScore || 0, paint: new BodyPaint(), lastSeen: performance.now(), visible: true };
      G.players.set(d.id, p);
    }
    return p;
  }

  function applyRoom(m) {
    const prevPhase = G.room ? G.room.phase : null;
    G.room = m;
    G.offset = m.now - Date.now();
    G.map.w = m.map.w; G.map.h = m.map.h; G.map.viewRadius = m.map.viewRadius; G.map.base = m.map.base;
    if (G.map.seed !== m.seed || G.map.theme !== m.theme || !G.map.canvas) {
      G.map.seed = m.seed; G.map.theme = m.theme;
      G.map.canvas = MapGen.generate(m.seed, m.theme, m.map.w, m.map.h, m.map.base);
    }
    const seen = new Set();
    for (const d of m.players) {
      seen.add(d.id);
      const p = ensurePlayer(d);
      p.name = d.name; p.role = d.role; p.alive = d.alive; p.score = d.score; p.roundScore = d.roundScore;
      p.visible = true; p.lastSeen = performance.now();
      const isMe = d.id === G.id;
      // Al empezar una ronda el servidor manda las posiciones nuevas: las aplicamos también a nosotros.
      if (!isMe || prevPhase !== m.phase) {
        p.x = p.tx = d.x; p.y = p.ty = d.y; p.rot = p.trot = d.rot; p.pose = d.pose; p.flip = d.flip;
      }
      if (isMe) {
        // Nuestra pintura es local; solo se reinicia al empezar ronda o volver al lobby.
        if (prevPhase !== m.phase && (m.phase === 'hide' || m.phase === 'lobby')) p.paint.reset();
      } else if (d.parts && Object.keys(d.parts).length) p.paint.load(d.parts);
      else if (prevPhase !== m.phase) p.paint.reset();
    }
    // Los que no están en la lista se van, salvo cuando somos buscador en fase de
    // escondite: entonces el servidor omite a los escondidos a propósito.
    const seekerHiding = m.phase === 'hide' && me() && me().role === 'seeker';
    for (const id of [...G.players.keys()]) {
      if (seen.has(id)) continue;
      if (seekerHiding) G.players.get(id).visible = false; else G.players.delete(id);
    }
    G.hidersLeft = m.hidersLeft;
    if (prevPhase !== m.phase) onPhaseChange(prevPhase, m.phase);
    updateLobby();
    updateHud();
  }

  function onPhaseChange(prev, ph) {
    const m = me();
    G.practicing = false;
    show('screen-lobby', ph === 'lobby');
    show('screen-results', ph === 'results');
    show('screen-wait', ph === 'hide' && m && m.role === 'seeker');
    show('hud', ph !== 'results');
    show('hud-left', m && canPaint(m) && ph !== 'results');
    if (ph === 'hide') {
      if (m.role === 'hider') { showMsg('¡Eres <span class="hider">ESCONDIDO</span>! Copia colores del escenario (clic derecho) y píntate.', 5000); G.cam.zoom = 3; }
      else if (m.role === 'seeker') showMsg('Eres <span class="seeker">BUSCADOR</span>. Espera en la base.', 4000);
      else showMsg('Te has unido a mitad de ronda: eres espectador.', 4000);
      updatePoseButtons();
    } else if (ph === 'seek') {
      if (m.role === 'seeker') { showMsg('¡A CAZAR! Clic para disparar.', 3000); G.cam.zoom = 1.6; beep(300, 0.3, 'square'); }
      else if (m.role === 'hider') { showMsg('¡Los buscadores han salido! Quieto…', 3000); beep(200, 0.4, 'sawtooth'); }
      else showMsg('Comienza la búsqueda.', 2000);
    } else if (ph === 'results') renderResults();
    else if (ph === 'lobby') { G.cam.zoom = 1.6; if (prev === 'results') showMsg('Ronda terminada. El anfitrión puede iniciar otra.', 3000); }
  }

  // ---------- red ----------
  net.on('open', () => { $('conn-status').textContent = 'Conectado.'; net.send({ t: 'hello' }); if (G.room) { /* reconexión */ show('screen-join', true); G.room = null; G.players.clear(); toast('Conexión restablecida. Vuelve a unirte a una sala.'); } });
  net.on('close', () => { $('conn-status').textContent = 'Sin conexión. Reintentando…'; });
  net.on('hello', (m) => renderRooms(m.rooms));
  net.on('rooms', (m) => renderRooms(m.rooms));
  net.on('error', (m) => toast(m.msg));
  net.on('joined', (m) => {
    G.id = m.id; G.players.clear(); G.lastPhase = null;
    show('screen-join', false);
    history.replaceState(null, '', '?room=' + m.code);
    $('lobby-code').textContent = m.code;
  });
  net.on('left', () => { G.room = null; G.players.clear(); show('screen-join', true); show('screen-lobby', false); show('hud', false); show('screen-results', false); show('screen-wait', false); history.replaceState(null, '', '/'); });
  net.on('room', applyRoom);
  net.on('paint', (m) => { const p = G.players.get(m.id); if (p) p.paint.load(m.parts); });
  net.on('state', (m) => {
    if (!G.room) return;
    G.offset = m.now - Date.now();
    G.room.phaseEnds = m.phaseEnds;
    G.hidersLeft = m.hl;
    const t = performance.now();
    for (const a of m.p) {
      const [id, x, y, rot, pose, flip, alive, score, roundScore] = a;
      const p = G.players.get(id);
      if (!p) continue;
      p.lastSeen = t; p.visible = true;
      p.score = score; p.roundScore = roundScore;
      p.alive = !!alive;
      if (id === G.id) continue;
      p.tx = x; p.ty = y; p.trot = rot; p.pose = pose; p.flip = !!flip;
    }
  });
  net.on('event', (m) => {
    if (m.kind === 'shot') {
      G.effects.push({ kind: 'shot', x: m.x, y: m.y, t: performance.now(), hit: !!m.hit });
      shotSound();
      G.hidersLeft = m.left;
      const shooter = G.players.get(m.by);
      if (m.hit) {
        const victim = G.players.get(m.hit);
        if (victim) victim.alive = false;
        if (m.hit === G.id) { showMsg('¡Te han encontrado! Ahora eres espectador.', 4000); beep(120, 0.6, 'sawtooth', 0.2); }
        else showMsg(`${U.esc(shooter ? shooter.name : '?')} ha encontrado a ${U.esc(m.hitName || '?')} (${m.left} restantes)`, 3000);
      }
    } else if (m.kind === 'taunt') {
      G.effects.push({ kind: 'taunt', x: m.x, y: m.y, t: performance.now() });
      whistle();
    }
  });

  // ---------- pantallas ----------
  function renderRooms(rooms) {
    const ul = $('room-list');
    ul.innerHTML = '';
    if (!rooms || !rooms.length) { ul.innerHTML = '<li class="muted">No hay salas públicas. ¡Crea una!</li>'; return; }
    for (const r of rooms) {
      const li = document.createElement('li');
      const ph = { lobby: 'en el lobby', hide: 'escondiéndose', seek: 'buscando', results: 'resultados' }[r.phase] || r.phase;
      li.innerHTML = `<span><b>${r.code}</b> · ${U.esc(r.host)} · ${r.players}/${r.max} · ${ph}</span>`;
      const b = document.createElement('button'); b.className = 'small'; b.textContent = 'Unirse';
      b.onclick = () => joinRoom(r.code);
      li.appendChild(b); ul.appendChild(li);
    }
  }
  function playerName() { const n = $('name').value.trim() || 'Camaleón'; localStorage.setItem('mc_name', n); return n; }
  function joinRoom(code) { net.send({ t: 'join', code, name: playerName() }); }
  $('btn-create').onclick = () => net.send({ t: 'create', isPublic: $('is-public').checked, name: playerName() });
  $('btn-join').onclick = () => { const c = $('code').value.trim().toUpperCase(); if (c.length === 4) joinRoom(c); else toast('El código tiene 4 caracteres'); };
  $('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
  $('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-create').click(); });
  $('btn-refresh').onclick = () => net.send({ t: 'list' });
  $('btn-leave').onclick = () => net.send({ t: 'leave' });
  $('btn-copy').onclick = () => { const url = `${location.origin}/?room=${G.room.code}`; navigator.clipboard?.writeText(url).then(() => toast('Enlace copiado: ' + url)); };
  $('btn-start').onclick = () => net.send({ t: 'start', settings: { hideTime: +$('set-hide').value, seekTime: +$('set-seek').value, theme: $('set-theme').value } });
  $('name').value = localStorage.getItem('mc_name') || '';
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) $('code').value = urlRoom.toUpperCase();

  function updateLobby() {
    if (!G.room) return;
    const ul = $('lobby-players');
    ul.innerHTML = '';
    for (const p of G.room.players) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${U.esc(p.name)}${p.id === G.id ? ' (tú)' : ''}</span><span class="tag">${p.id === G.room.hostId ? 'ANFITRIÓN · ' : ''}${p.score} pts</span>`;
      ul.appendChild(li);
    }
    $('lobby-count').textContent = G.room.players.length;
    const host = G.room.hostId === G.id;
    $('btn-start').disabled = !host;
    $('btn-start').textContent = host ? (G.room.players.length < 2 ? 'Esperando a más jugadores…' : `Iniciar ronda ${G.room.round + 1}`) : 'Esperando al anfitrión…';
    for (const id of ['set-hide', 'set-seek', 'set-theme']) $(id).disabled = !host;
    if (!host) { $('set-hide').value = G.room.settings.hideTime; $('set-seek').value = G.room.settings.seekTime; $('set-theme').value = G.room.settings.theme; }
  }
  // Botón para practicar en el lobby (ocultar el panel)
  (() => {
    const b = document.createElement('button'); b.textContent = 'Practicar en el escenario (Esc para volver)'; b.className = 'small'; b.style.marginTop = '8px';
    b.onclick = () => { G.practicing = true; show('screen-lobby', false); show('hud-left', true); };
    $('lobby-hint').after(b);
  })();

  function renderResults() {
    const lr = G.room.lastRound; if (!lr) return;
    const hw = lr.winners === 'hiders';
    $('results-title').innerHTML = hw ? 'Ganan los <span class="hider">ESCONDIDOS</span>' : 'Ganan los <span class="seeker">BUSCADORES</span>';
    $('results-sub').textContent = { all_found: 'Todos los escondidos fueron encontrados.', timeout: 'Se acabó el tiempo con escondidos aún libres.', no_seekers: 'Los buscadores abandonaron la partida.', no_hiders: 'No quedaban escondidos.' }[lr.reason] || '';
    const tb = $('results-table').querySelector('tbody'); tb.innerHTML = '';
    for (const p of [...lr.players].sort((a, b) => b.roundScore - a.roundScore)) {
      const tr = document.createElement('tr');
      if (p.id === G.id) tr.classList.add('me');
      if (p.role === 'hider' && !p.alive) tr.classList.add('dead');
      const role = p.role === 'seeker' ? '<span class="seeker">Buscador</span>' : p.role === 'hider' ? (p.alive ? '<span class="hider">Escondido</span>' : 'Encontrado') : 'Espectador';
      tr.innerHTML = `<td>${U.esc(p.name)}</td><td>${role}</td><td>${p.roundScore}</td><td>${p.score}</td>`;
      tb.appendChild(tr);
    }
  }
  function renderScoreboard() {
    const tb = $('scoreboard').querySelector('tbody'); tb.innerHTML = '';
    const list = [...G.players.values()].sort((a, b) => b.score - a.score);
    for (const p of list) {
      const tr = document.createElement('tr');
      if (p.id === G.id) tr.classList.add('me');
      const role = p.role === 'seeker' ? '<span class="seeker">Buscador</span>' : p.role === 'hider' ? (p.alive ? '<span class="hider">Escondido</span>' : 'Encontrado') : '—';
      tr.innerHTML = `<td>${U.esc(p.name)}</td><td>${role}</td><td>${p.roundScore}</td><td>${p.score}</td>`;
      tb.appendChild(tr);
    }
  }

  // ---------- herramientas de pintura ----------
  function setColor(c) {
    G.tool.color = c; $('swatch').style.background = c; $('color-input').value = c;
    if (!G.tool.recent.includes(c)) { G.tool.recent.unshift(c); G.tool.recent = G.tool.recent.slice(0, 10); renderPalette(); }
  }
  function renderPalette() {
    const el = $('palette'); el.innerHTML = '';
    for (const c of G.tool.recent) { const d = document.createElement('div'); d.className = 'pal'; d.style.background = c; d.title = c; d.onclick = () => setColor(c); el.appendChild(d); }
  }
  function renderBrushes() {
    const el = $('brush-sizes'); el.innerHTML = '';
    BRUSHES.forEach((r, i) => {
      const d = document.createElement('div'); d.className = 'brush' + (i === G.tool.size ? ' active' : '');
      const s = document.createElement('span'); const px = Math.max(3, r * 3); s.style.width = px + 'px'; s.style.height = px + 'px'; d.appendChild(s);
      d.title = `Pincel ${i + 1}`; d.onclick = () => { G.tool.size = i; renderBrushes(); };
      el.appendChild(d);
    });
  }
  function updatePoseButtons() {
    const el = $('poses'); el.innerHTML = '';
    const m = me();
    Body.POSE_NAMES.forEach((name, i) => {
      const b = document.createElement('div'); b.className = 'pose' + (m && m.pose === name ? ' active' : '');
      b.textContent = `${i + 1} ${Body.POSES[name].label}`; b.onclick = () => setPose(name);
      el.appendChild(b);
    });
  }
  function setPose(name) { const m = me(); if (!m || !canMove(m)) return; m.pose = name; updatePoseButtons(); sendMove(true); }
  $('color-input').addEventListener('input', (e) => setColor(e.target.value));
  $('btn-clear').onclick = () => { const m = me(); if (m && canPaint(m)) { m.paint.reset(); flushPaint(true); } };
  $('btn-fill').onclick = () => fillUnderCursor();
  $('btn-taunt').onclick = () => taunt();
  renderBrushes(); setColor('#ff4040');

  function eyedrop(wx, wy) {
    if (!G.map.canvas) return;
    const x = Math.floor(wx), y = Math.floor(wy);
    if (x < 0 || y < 0 || x >= G.map.w || y >= G.map.h) return;
    const d = G.map.canvas.getContext('2d').getImageData(x, y, 1, 1).data;
    setColor(U.hex(d[0], d[1], d[2]));
    showMsg(`<span style="color:${G.tool.color};text-shadow:0 0 4px #000">■</span> ${G.tool.color}`, 800);
  }
  function fillUnderCursor() {
    const m = me(); if (!m || !canPaint(m)) return;
    const part = Body.hitTest(m, G.mouse.wx, G.mouse.wy, 3);
    if (part) { m.paint.fillPart(part, G.tool.color); flushPaint(); }
  }
  function flushPaint(force) {
    const m = me(); if (!m) return;
    const t = performance.now();
    if (!force && t - G.lastPaintSent < 150) return;
    const parts = m.paint.takeDirty();
    if (parts) { net.send({ t: 'paint', parts }); G.lastPaintSent = t; }
  }
  function taunt() {
    const m = me(); if (!m || m.role !== 'hider' || !m.alive || phase() !== 'seek') return;
    const t = performance.now(); if (t - G.lastTaunt < 12000) { showMsg('Silbido en recarga…', 800); return; }
    G.lastTaunt = t; net.send({ t: 'taunt' });
  }
  function shoot() {
    const m = me(); if (!m || m.role !== 'seeker' || phase() !== 'seek') return;
    const t = performance.now(); if (t - G.lastShot < 900) return;
    if (U.dist(m.x, m.y, G.mouse.wx, G.mouse.wy) > G.map.viewRadius) { showMsg('Fuera del alcance de la linterna', 700); return; }
    G.lastShot = t; net.send({ t: 'shoot', x: G.mouse.wx, y: G.mouse.wy });
  }

  // ---------- entrada ----------
  function updateMouseWorld() { const w = screenToWorld(G.mouse.x, G.mouse.y); G.mouse.wx = w.x; G.mouse.wy = w.y; }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousemove', (e) => {
    G.mouse.x = e.clientX; G.mouse.y = e.clientY; updateMouseWorld();
    const m = me();
    if (G.mouse.down && G.mouse.button === 0 && m && canPaint(m)) {
      m.paint.stroke(m, G.mouse.lastWx, G.mouse.lastWy, G.mouse.wx, G.mouse.wy, BRUSHES[G.tool.size], G.tool.color);
      flushPaint();
    } else if (G.mouse.down && G.mouse.button === 0 && m && !canMove(m)) {
      // cámara libre (espectador): arrastrar
      G.cam.x -= e.movementX / G.cam.zoom; G.cam.y -= e.movementY / G.cam.zoom;
    }
    G.mouse.lastWx = G.mouse.wx; G.mouse.lastWy = G.mouse.wy;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!G.room) return;
    G.mouse.x = e.clientX; G.mouse.y = e.clientY; updateMouseWorld();
    G.mouse.down = true; G.mouse.button = e.button; G.mouse.lastWx = G.mouse.wx; G.mouse.lastWy = G.mouse.wy;
    const m = me(); if (!m) return;
    if (e.button === 2) { if (canPaint(m)) eyedrop(G.mouse.wx, G.mouse.wy); return; }
    if (e.button === 0) {
      if (canPaint(m)) { m.paint.stroke(m, G.mouse.wx, G.mouse.wy, G.mouse.wx, G.mouse.wy, BRUSHES[G.tool.size], G.tool.color); flushPaint(); }
      else if (m.role === 'seeker') shoot();
    }
  });
  window.addEventListener('mouseup', () => { if (G.mouse.down) flushPaint(true); G.mouse.down = false; G.mouse.button = -1; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.shiftKey) { G.tool.size = U.clamp(G.tool.size + (e.deltaY < 0 ? 1 : -1), 0, BRUSHES.length - 1); renderBrushes(); return; }
    const before = screenToWorld(e.clientX, e.clientY);
    G.cam.zoom = U.clamp(G.cam.zoom * Math.pow(1.15, -Math.sign(e.deltaY)), ZOOM_MIN, ZOOM_MAX);
    const after = screenToWorld(e.clientX, e.clientY);
    const m = me();
    if (m && !canMove(m)) { G.cam.x += before.x - after.x; G.cam.y += before.y - after.y; }
    updateMouseWorld();
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    G.keys[e.code] = true;
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!G.room) return;
    if (e.code === 'Tab') { show('scoreboard', true); renderScoreboard(); }
    if (e.code === 'Escape' && phase() === 'lobby') { G.practicing = !G.practicing; show('screen-lobby', !G.practicing); }
    if (e.code === 'KeyR') { const m = me(); if (m && canMove(m)) { m.flip = !m.flip; sendMove(true); } }
    if (/^Digit[1-5]$/.test(e.code)) setPose(Body.POSE_NAMES[+e.code.slice(5) - 1]);
    if (e.code === 'BracketLeft') { G.tool.size = Math.max(0, G.tool.size - 1); renderBrushes(); }
    if (e.code === 'BracketRight') { G.tool.size = Math.min(BRUSHES.length - 1, G.tool.size + 1); renderBrushes(); }
    if (e.code === 'KeyG') fillUnderCursor();
    if (e.code === 'KeyT') taunt();
    if (e.code === 'Space') { const m = me(); if (m && m.role === 'seeker') shoot(); }
  });
  window.addEventListener('keyup', (e) => { G.keys[e.code] = false; if (e.code === 'Tab') show('scoreboard', false); });
  window.addEventListener('blur', () => { G.keys = {}; });

  function sendMove(force) {
    const m = me(); if (!m || !canMove(m)) return;
    const t = performance.now();
    if (!force && t - G.lastMoveSent < 50) return;
    G.lastMoveSent = t;
    net.send({ t: 'move', x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10, rot: m.rot, pose: m.pose, flip: m.flip });
  }

  // ---------- bucle ----------
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }
  window.addEventListener('resize', resize); resize();

  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    update(dt, t);
    render(t);
    requestAnimationFrame(frame);
  }

  function update(dt, t) {
    const m = me();
    if (G.room && m) {
      const k = G.keys;
      let dx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      let dy = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
      if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
      if (canMove(m)) {
        let changed = false;
        if (dx || dy) {
          m.x = U.clamp(m.x + dx * SPEED * dt, 20, G.map.w - 20);
          m.y = U.clamp(m.y + dy * SPEED * dt, 20, G.map.h - 20);
          // Los escondidos no pueden entrar en la base de los buscadores.
          if (m.role === 'hider') {
            const b = G.map.base;
            if (m.x < b.x + b.w + 30 && m.y < b.y + b.h + 30) {
              if (b.x + b.w + 30 - m.x < b.y + b.h + 30 - m.y) m.x = b.x + b.w + 30; else m.y = b.y + b.h + 30;
            }
          }
          changed = true;
        }
        const rotDir = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
        if (rotDir) { m.rot += rotDir * 2.2 * dt; changed = true; }
        if (changed) sendMove(false);
        // Cámara sigue al jugador
        G.cam.x = U.lerp(G.cam.x, m.x, Math.min(1, dt * 10));
        G.cam.y = U.lerp(G.cam.y, m.y, Math.min(1, dt * 10));
      } else {
        // cámara libre
        const cs = 600 / G.cam.zoom;
        G.cam.x += dx * cs * dt; G.cam.y += dy * cs * dt;
      }
      G.cam.x = U.clamp(G.cam.x, 0, G.map.w); G.cam.y = U.clamp(G.cam.y, 0, G.map.h);
      // Interpolación de los demás
      const f = Math.min(1, dt * 14);
      for (const p of G.players.values()) {
        if (p.id === G.id) continue;
        p.x = U.lerp(p.x, p.tx, f); p.y = U.lerp(p.y, p.ty, f); p.rot = U.lerp(p.rot, p.trot, f);
        if (isSeekerView() && p.role === 'hider' && t - p.lastSeen > 600) p.visible = false;
      }
    }
    G.effects = G.effects.filter((e) => t - e.t < 1500);
    if (m && m.paint.dirty.size) flushPaint(false);
    updateHud();
  }

  function updateHud() {
    if (!G.room) return;
    const ph = phase(), m = me();
    const remaining = G.room.phaseEnds ? (G.room.phaseEnds - now()) / 1000 : 0;
    $('hud-phase').textContent = { lobby: 'Lobby', hide: 'Escondite', seek: 'Búsqueda', results: 'Resultados' }[ph] || ph;
    const timer = $('hud-timer');
    timer.textContent = ph === 'lobby' ? '—' : U.fmtTime(remaining);
    timer.classList.toggle('warn', ph !== 'lobby' && remaining < 15);
    if (ph === 'hide' && m && m.role === 'seeker') $('wait-timer').textContent = U.fmtTime(remaining);
    if (ph === 'results') $('results-timer').textContent = Math.max(0, Math.ceil(remaining));
    if (m) {
      $('hud-role').innerHTML = ph === 'lobby' ? `Sala ${G.room.code}` : m.role === 'seeker' ? '<span class="seeker">Buscador</span>' : m.role === 'hider' ? (m.alive ? '<span class="hider">Escondido</span>' : 'Encontrado (espectador)') : 'Espectador';
      $('hud-info').textContent = ph === 'lobby' ? `${G.room.players.length} jugadores` : `Escondidos libres: ${G.hidersLeft} · Puntos: ${m.roundScore}`;
    }
    $('hud-zoom').textContent = 'zoom x' + G.cam.zoom.toFixed(1);
    let tip = '';
    if (ph === 'lobby') tip = 'Lobby: muévete con WASD, haz zoom con la rueda y practica la pintura. Esc muestra/oculta el panel.';
    else if (m && m.role === 'hider' && m.alive) tip = ph === 'hide' ? 'Clic derecho copia un color · clic izquierdo pinta · [ ] pincel · 1-5 poses · Q/E girar · R voltear' : 'Puedes seguir pintando. Ganas 1 pt/s dentro del haz de un buscador sin ser visto. T = silbar (+3).';
    else if (m && m.role === 'seeker') tip = ph === 'seek' ? 'Clic izquierdo o Espacio dispara · rueda = zoom · busca siluetas que no encajen en el escenario' : '';
    else tip = 'Espectador: arrastra con el ratón o usa WASD para mover la cámara.';
    $('hud-tip').textContent = tip;
    if (ph === 'lobby' && !G.practicing) show('hud-left', false);
  }

  function render(t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0a0b0e'; ctx.fillRect(0, 0, W, H);
    if (!G.room || !G.map.canvas) return;
    const m = me();
    const z = G.cam.zoom;
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-G.cam.x, -G.cam.y);
    ctx.imageSmoothingEnabled = false;
    // Mapa (solo la parte visible)
    const vx0 = Math.max(0, Math.floor(G.cam.x - W / 2 / z) - 1), vy0 = Math.max(0, Math.floor(G.cam.y - H / 2 / z) - 1);
    const vx1 = Math.min(G.map.w, Math.ceil(G.cam.x + W / 2 / z) + 1), vy1 = Math.min(G.map.h, Math.ceil(G.cam.y + H / 2 / z) + 1);
    if (vx1 > vx0 && vy1 > vy0) ctx.drawImage(G.map.canvas, vx0, vy0, vx1 - vx0, vy1 - vy0, vx0, vy0, vx1 - vx0, vy1 - vy0);

    const ph = phase();
    const seekerView = isSeekerView();
    // Radio de visión de los buscadores (visible para escondidos y espectadores)
    if (!seekerView && ph === 'seek') {
      for (const p of G.players.values()) {
        if (p.role !== 'seeker') continue;
        ctx.beginPath(); ctx.arc(p.x, p.y, G.map.viewRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,200,60,0.07)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,200,60,0.5)'; ctx.lineWidth = 1 / z; ctx.setLineDash([6 / z, 6 / z]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // Jugadores
    const list = [...G.players.values()].sort((a, b) => (a.role === 'seeker') - (b.role === 'seeker'));
    for (const p of list) {
      if (!p.visible) continue;
      const isMe = p.id === G.id;
      if (p.role === 'seeker' && ph !== 'lobby') {
        BodyDraw.seeker(ctx, p);
        drawLabel(p.name, p.x, p.y - 40, '#ff7a00', z);
      } else {
        if (p.role === 'hider' && !p.alive) {
          if (seekerView) continue;
          ctx.globalAlpha = 0.35; BodyDraw.hider(ctx, p, p.paint); ctx.globalAlpha = 1;
          drawLabel('✕ ' + p.name, p.x, p.y - 40, '#aaa', z);
          continue;
        }
        BodyDraw.hider(ctx, p, p.paint);
        if (isMe && (ph === 'lobby' || ph === 'hide' || (ph === 'seek' && G.keys.KeyH))) BodyDraw.outline(ctx, p, 'rgba(62,196,109,0.9)');
        if (ph === 'lobby' || (!seekerView && (!m || m.role !== 'hider' || !m.alive) && !isMe)) drawLabel(p.name, p.x, p.y - 40, '#fff', z);
      }
    }
    // Efectos
    for (const e of G.effects) {
      const age = (t - e.t) / 1000;
      if (e.kind === 'shot') {
        const r = 6 + age * 60;
        ctx.strokeStyle = e.hit ? `rgba(255,80,60,${1 - age})` : `rgba(255,220,120,${1 - age})`; ctx.lineWidth = 2 / z;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke();
        if (age < 0.3) { ctx.fillStyle = 'rgba(255,240,200,0.8)'; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.fillRect(e.x + Math.cos(a) * 4 - 0.5, e.y + Math.sin(a) * 4 - 0.5, 1.5, 1.5); } }
      } else if (e.kind === 'taunt') {
        for (let k = 0; k < 3; k++) {
          const r = ((age + k * 0.25) % 1) * 90;
          ctx.strokeStyle = `rgba(120,200,255,${1 - r / 90})`; ctx.lineWidth = 2 / z;
          ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke();
        }
        drawLabel('♪ silbido', e.x, e.y - 50, '#8cf', z);
      }
    }
    ctx.restore();

    // Oscuridad para el buscador
    if (seekerView && m) {
      const s = worldToScreen(m.x, m.y), R = G.map.viewRadius * z;
      // La oscuridad se compone en un lienzo aparte para no borrar el mapa al recortar el haz.
      if (dark.width !== canvas.width || dark.height !== canvas.height) { dark.width = canvas.width; dark.height = canvas.height; }
      const dc = dark.getContext('2d');
      dc.setTransform(DPR, 0, 0, DPR, 0, 0);
      dc.globalCompositeOperation = 'source-over';
      dc.fillStyle = 'rgba(2,3,5,0.95)'; dc.fillRect(0, 0, W, H);
      dc.globalCompositeOperation = 'destination-out';
      const g = dc.createRadialGradient(s.x, s.y, R * 0.75, s.x, s.y, R);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = g; dc.beginPath(); dc.arc(s.x, s.y, R, 0, Math.PI * 2); dc.fill();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(dark, 0, 0); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.strokeStyle = 'rgba(255,200,60,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, Math.PI * 2); ctx.stroke();
      // mira
      ctx.strokeStyle = t - G.lastShot < 900 ? 'rgba(255,255,255,0.3)' : '#ff7a00'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(G.mouse.x, G.mouse.y, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(G.mouse.x - 16, G.mouse.y); ctx.lineTo(G.mouse.x - 5, G.mouse.y); ctx.moveTo(G.mouse.x + 5, G.mouse.y); ctx.lineTo(G.mouse.x + 16, G.mouse.y);
      ctx.moveTo(G.mouse.x, G.mouse.y - 16); ctx.lineTo(G.mouse.x, G.mouse.y - 5); ctx.moveTo(G.mouse.x, G.mouse.y + 5); ctx.lineTo(G.mouse.x, G.mouse.y + 16); ctx.stroke();
    } else if (m && canPaint(m)) {
      // Vista previa del pincel
      const r = BRUSHES[G.tool.size] * z;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(G.mouse.x, G.mouse.y, Math.max(2, r), 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(G.mouse.x, G.mouse.y, Math.max(2, r) + 1, 0, Math.PI * 2); ctx.stroke();
    }
    // Fase de escondite: el escondido ve el tiempo grande
    if (ph === 'hide' && m && m.role === 'hider') {
      const rem = (G.room.phaseEnds - now()) / 1000;
      if (rem < 10) { ctx.fillStyle = 'rgba(255,80,60,0.9)'; ctx.font = 'bold 40px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`¡Los buscadores salen en ${Math.ceil(rem)}!`, W / 2, H - 60); }
    }
  }

  function drawLabel(text, x, y, color, z) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(1 / z, 1 / z);
    ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-w / 2, -9, w, 18);
    ctx.fillStyle = color; ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  net.connect();
  requestAnimationFrame(frame);
})();
