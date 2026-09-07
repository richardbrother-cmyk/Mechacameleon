'use strict';
/* Generador procedural de escenarios. Determinista a partir de (semilla, tema),
   de modo que todos los clientes dibujan exactamente el mismo mapa. */
const MapGen = (() => {
  const THEMES = {
    almacen: {
      label: 'Almacén',
      base: 'concrete',
      floors: ['#6b6b6b', '#7a7a72', '#5c5f63', '#8a7f6a', '#4f5a4a'],
      walls: ['#9a3b2b', '#b8583f', '#4a4d52', '#7d8590', '#6c5b3e', '#3f6b5a'],
      accents: ['#e0b000', '#2f6fb0', '#3e7f3e', '#c9c9c9', '#d9532b', '#1d1d1f', '#f2f2f2'],
      big: ['bricks', 'crates', 'tiles', 'planks', 'pipes', 'noise', 'stripes', 'metal'],
      small: ['poster', 'crate', 'sign', 'dots', 'stripes', 'barrel', 'shelf', 'tiles'],
    },
    jardin: {
      label: 'Jardín',
      base: 'grass',
      floors: ['#4f8f3a', '#5f9f45', '#7a6a48', '#9c9a8e', '#6f8f4a', '#3d7a6a'],
      walls: ['#8a5a2b', '#a67c52', '#6d6d6d', '#b4b4a8', '#5b7f3b'],
      accents: ['#e8c44a', '#e05a7a', '#7fb2e5', '#ffffff', '#d17a2a', '#4a2f1a', '#9b59b6'],
      big: ['grass', 'stones', 'bricks', 'planks', 'flowers', 'tiles', 'water', 'hedge'],
      small: ['flowers', 'stones', 'poster', 'dots', 'crate', 'sign', 'barrel', 'hedge'],
    },
    galeria: {
      label: 'Galería',
      base: 'planks',
      floors: ['#c8b08c', '#b89a70', '#8a1e2a', '#3a3a48', '#d9cdb8'],
      walls: ['#f0ece2', '#e6e0d4', '#d8cfc0', '#2b2b33', '#5a3a3a'],
      accents: ['#c9a227', '#4b6fa8', '#c04a4a', '#4c9a6a', '#8c5bb5', '#111111', '#f4a261'],
      big: ['carpet', 'tiles', 'planks', 'marble', 'stripes', 'diamonds', 'shelf', 'noise'],
      small: ['poster', 'painting', 'painting', 'shelf', 'sign', 'dots', 'diamonds', 'stripes'],
    },
  };

  // ---------- patrones ----------
  const P = {};
  P.noise = (c, x, y, w, h, r, t, base) => {
    base = base || r.pick(t.floors);
    c.fillStyle = base; c.fillRect(x, y, w, h);
    const d1 = U.shade(base, 0.85), d2 = U.shade(base, 1.15);
    const n = (w * h) / 18;
    for (let i = 0; i < n; i++) {
      c.fillStyle = r.chance(0.5) ? d1 : d2;
      c.fillRect(x + r.int(0, w - 1), y + r.int(0, h - 1), r.int(1, 3), r.int(1, 2));
    }
  };
  P.concrete = (c, x, y, w, h, r, t) => {
    P.noise(c, x, y, w, h, r, t, r.pick(['#6e6e6e', '#7b7b76', '#66686c']));
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2;
    const s = r.int(180, 260);
    for (let i = x + s; i < x + w; i += s) { c.beginPath(); c.moveTo(i, y); c.lineTo(i, y + h); c.stroke(); }
    for (let j = y + s; j < y + h; j += s) { c.beginPath(); c.moveTo(x, j); c.lineTo(x + w, j); c.stroke(); }
  };
  P.grass = (c, x, y, w, h, r, t) => {
    const base = r.pick(['#4f8f3a', '#579a40', '#5f9f45', '#467f34']);
    c.fillStyle = base; c.fillRect(x, y, w, h);
    const n = (w * h) / 10;
    const shades = [U.shade(base, 0.8), U.shade(base, 1.2), U.mix(base, '#c9c25a', 0.35), U.shade(base, 0.65)];
    for (let i = 0; i < n; i++) {
      c.fillStyle = r.pick(shades);
      const px = x + r.int(0, w - 1), py = y + r.int(0, h - 1);
      c.fillRect(px, py, 1, r.int(1, 4));
    }
  };
  P.bricks = (c, x, y, w, h, r, t) => {
    const col = r.pick(t.walls), mortar = U.shade(col, 0.55);
    const bw = r.int(22, 40), bh = r.int(10, 18), g = 2;
    c.fillStyle = mortar; c.fillRect(x, y, w, h);
    const shades = [col, U.shade(col, 0.9), U.shade(col, 1.08), U.shade(col, 0.82)];
    let row = 0;
    for (let yy = y; yy < y + h; yy += bh, row++) {
      const off = row % 2 ? Math.floor(bw / 2) : 0;
      for (let xx = x - off; xx < x + w; xx += bw) {
        c.fillStyle = r.pick(shades);
        const x0 = Math.max(x, xx), x1 = Math.min(x + w, xx + bw - g);
        if (x1 > x0) c.fillRect(x0, yy, x1 - x0, Math.min(bh - g, y + h - yy));
      }
    }
  };
  P.planks = (c, x, y, w, h, r, t) => {
    const base = r.pick(['#a8825a', '#8f6b45', '#b8956a', '#7a5a3a', '#c8a878']);
    const vertical = r.chance(0.3);
    const ph = r.int(14, 26);
    c.fillStyle = U.shade(base, 0.6); c.fillRect(x, y, w, h);
    const n = vertical ? w : h;
    for (let i = 0; i < n; i += ph) {
      const shade = U.shade(base, 0.85 + r() * 0.3);
      let pos = -r.int(0, 200);
      const len = vertical ? h : w;
      while (pos < len) {
        const l = r.int(120, 320);
        c.fillStyle = shade;
        if (vertical) c.fillRect(x + i, y + Math.max(0, pos), ph - 1, Math.min(l - 1, len - Math.max(0, pos)));
        else c.fillRect(x + Math.max(0, pos), y + i, Math.min(l - 1, len - Math.max(0, pos)), Math.min(ph - 1, h - i));
        // veta
        c.fillStyle = U.shade(shade, 0.88);
        for (let k = 0; k < 3; k++) {
          const vx = r.int(0, l), vy = r.int(1, ph - 3);
          if (vertical) c.fillRect(x + i + vy, y + Math.max(0, pos) + Math.min(vx, l - 20), 1, r.int(6, 24));
          else c.fillRect(x + Math.max(0, pos) + Math.min(vx, l - 20), y + i + vy, r.int(6, 24), 1);
        }
        pos += l;
      }
    }
  };
  P.tiles = (c, x, y, w, h, r, t) => {
    const a = r.pick(t.floors), b = r.chance(0.5) ? r.pick(t.accents) : U.shade(a, 0.7);
    const s = r.pick([16, 24, 32, 48]);
    for (let j = 0, yy = y; yy < y + h; yy += s, j++)
      for (let i = 0, xx = x; xx < x + w; xx += s, i++) {
        c.fillStyle = (i + j) % 2 ? a : b;
        c.fillRect(xx, yy, Math.min(s, x + w - xx), Math.min(s, y + h - yy));
      }
    c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 1;
    for (let xx = x; xx <= x + w; xx += s) { c.beginPath(); c.moveTo(xx + 0.5, y); c.lineTo(xx + 0.5, y + h); c.stroke(); }
    for (let yy = y; yy <= y + h; yy += s) { c.beginPath(); c.moveTo(x, yy + 0.5); c.lineTo(x + w, yy + 0.5); c.stroke(); }
  };
  P.stripes = (c, x, y, w, h, r, t) => {
    const cols = [r.pick(t.walls), r.pick(t.accents)];
    if (r.chance(0.4)) cols.push(r.pick(t.accents));
    const s = r.int(6, 22), vertical = r.chance(0.5);
    let k = 0;
    if (vertical) for (let xx = x; xx < x + w; xx += s, k++) { c.fillStyle = cols[k % cols.length]; c.fillRect(xx, y, Math.min(s, x + w - xx), h); }
    else for (let yy = y; yy < y + h; yy += s, k++) { c.fillStyle = cols[k % cols.length]; c.fillRect(x, yy, w, Math.min(s, y + h - yy)); }
  };
  P.dots = (c, x, y, w, h, r, t) => {
    const bg = r.pick(t.walls), dot = r.pick(t.accents);
    c.fillStyle = bg; c.fillRect(x, y, w, h);
    const sp = r.int(14, 30), rad = r.int(3, Math.max(4, sp / 3));
    c.fillStyle = dot;
    for (let yy = y + sp / 2; yy < y + h; yy += sp)
      for (let xx = x + sp / 2; xx < x + w; xx += sp) {
        c.beginPath(); c.arc(xx, yy, rad, 0, Math.PI * 2); c.fill();
      }
  };
  P.diamonds = (c, x, y, w, h, r, t) => {
    const bg = r.pick(t.floors), fg = r.pick(t.accents);
    c.fillStyle = bg; c.fillRect(x, y, w, h);
    const s = r.int(20, 40);
    c.fillStyle = fg;
    for (let yy = y; yy < y + h + s; yy += s)
      for (let xx = x; xx < x + w + s; xx += s) {
        c.beginPath(); c.moveTo(xx, yy - s / 2); c.lineTo(xx + s / 2, yy); c.lineTo(xx, yy + s / 2); c.lineTo(xx - s / 2, yy); c.closePath(); c.fill();
      }
  };
  P.crates = (c, x, y, w, h, r, t) => {
    const s = r.pick([48, 64, 80]);
    for (let yy = y; yy < y + h; yy += s)
      for (let xx = x; xx < x + w; xx += s) P.crate(c, xx, yy, Math.min(s, x + w - xx), Math.min(s, y + h - yy), r, t);
  };
  P.crate = (c, x, y, w, h, r, t) => {
    const base = r.pick(['#b08a55', '#9a7443', '#c49a63', '#7f6238']);
    c.fillStyle = base; c.fillRect(x, y, w, h);
    c.fillStyle = U.shade(base, 0.7);
    c.fillRect(x, y, w, 3); c.fillRect(x, y, 3, h); c.fillRect(x + w - 3, y, 3, h); c.fillRect(x, y + h - 3, w, 3);
    c.strokeStyle = U.shade(base, 0.75); c.lineWidth = 3;
    c.beginPath(); c.moveTo(x + 4, y + 4); c.lineTo(x + w - 4, y + h - 4); c.moveTo(x + w - 4, y + 4); c.lineTo(x + 4, y + h - 4); c.stroke();
    c.fillStyle = U.shade(base, 1.15);
    for (let i = 0; i < 6; i++) c.fillRect(x + r.int(4, w - 12), y + r.int(4, h - 6), r.int(4, 10), 1);
  };
  P.pipes = (c, x, y, w, h, r, t) => {
    P.noise(c, x, y, w, h, r, t, r.pick(['#4a4d52', '#5a5d62', '#3e4144']));
    const n = r.int(2, 5);
    for (let i = 0; i < n; i++) {
      const col = r.pick(['#7d8590', '#a0a6ad', '#8a6a3a', '#5c7a8a', '#b04a3a']);
      const thick = r.int(8, 18);
      if (r.chance(0.5)) {
        const yy = y + r.int(10, Math.max(11, h - thick - 10));
        c.fillStyle = col; c.fillRect(x, yy, w, thick);
        c.fillStyle = U.shade(col, 1.3); c.fillRect(x, yy + 2, w, 2);
        c.fillStyle = U.shade(col, 0.6); c.fillRect(x, yy + thick - 3, w, 3);
        for (let k = x + r.int(20, 60); k < x + w; k += r.int(60, 140)) { c.fillStyle = U.shade(col, 0.8); c.fillRect(k, yy - 2, 6, thick + 4); }
      } else {
        const xx = x + r.int(10, Math.max(11, w - thick - 10));
        c.fillStyle = col; c.fillRect(xx, y, thick, h);
        c.fillStyle = U.shade(col, 1.3); c.fillRect(xx + 2, y, 2, h);
        c.fillStyle = U.shade(col, 0.6); c.fillRect(xx + thick - 3, y, 3, h);
        for (let k = y + r.int(20, 60); k < y + h; k += r.int(60, 140)) { c.fillStyle = U.shade(col, 0.8); c.fillRect(xx - 2, k, thick + 4, 6); }
      }
    }
  };
  P.metal = (c, x, y, w, h, r, t) => {
    const base = r.pick(['#7d8590', '#6b7078', '#8e949c']);
    c.fillStyle = base; c.fillRect(x, y, w, h);
    const s = r.int(60, 110);
    c.strokeStyle = U.shade(base, 0.7); c.lineWidth = 2;
    for (let xx = x; xx <= x + w; xx += s) { c.beginPath(); c.moveTo(xx, y); c.lineTo(xx, y + h); c.stroke(); }
    for (let yy = y; yy <= y + h; yy += s) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke(); }
    c.fillStyle = U.shade(base, 0.55);
    for (let yy = y + 6; yy < y + h; yy += s) for (let xx = x + 6; xx < x + w; xx += s) { c.beginPath(); c.arc(xx, yy, 2.5, 0, 7); c.fill(); }
    c.fillStyle = U.shade(base, 1.15);
    for (let i = 0; i < (w * h) / 900; i++) c.fillRect(x + r.int(0, w - 8), y + r.int(0, h - 1), r.int(3, 8), 1);
  };
  P.stones = (c, x, y, w, h, r, t) => {
    const base = r.pick(['#8f8f86', '#a3a297', '#7d7c74']);
    c.fillStyle = U.shade(base, 0.6); c.fillRect(x, y, w, h);
    const n = (w * h) / 700;
    for (let i = 0; i < n; i++) {
      const rx = r.int(8, 22), ry = r.int(6, 16);
      c.fillStyle = U.shade(base, 0.8 + r() * 0.45);
      c.beginPath(); c.ellipse(x + r.int(0, w), y + r.int(0, h), rx, ry, r() * 3, 0, 7); c.fill();
    }
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.restore();
  };
  P.flowers = (c, x, y, w, h, r, t) => {
    P.grass(c, x, y, w, h, r, t);
    const cols = ['#e8c44a', '#e05a7a', '#ffffff', '#9b59b6', '#f4a261', '#7fb2e5'];
    const n = (w * h) / 500;
    for (let i = 0; i < n; i++) {
      const px = x + r.int(3, w - 4), py = y + r.int(3, h - 4), col = r.pick(cols);
      c.fillStyle = col;
      c.fillRect(px - 1, py - 3, 3, 2); c.fillRect(px - 1, py + 2, 3, 2); c.fillRect(px - 3, py - 1, 2, 3); c.fillRect(px + 2, py - 1, 2, 3);
      c.fillStyle = '#f7e36b'; c.fillRect(px - 1, py - 1, 3, 3);
    }
  };
  P.hedge = (c, x, y, w, h, r, t) => {
    const base = r.pick(['#2f6b2a', '#3a7a33', '#27582a']);
    c.fillStyle = base; c.fillRect(x, y, w, h);
    const n = (w * h) / 40;
    for (let i = 0; i < n; i++) {
      c.fillStyle = U.shade(base, 0.7 + r() * 0.7);
      c.beginPath(); c.arc(x + r.int(0, w), y + r.int(0, h), r.int(2, 5), 0, 7); c.fill();
    }
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.restore();
  };
  P.water = (c, x, y, w, h, r, t) => {
    const base = r.pick(['#3a7fc1', '#2f6fa8', '#4a90d0']);
    c.fillStyle = base; c.fillRect(x, y, w, h);
    c.strokeStyle = U.shade(base, 1.35); c.lineWidth = 2;
    for (let i = 0; i < (w * h) / 1200; i++) {
      const px = x + r.int(10, w - 10), py = y + r.int(5, h - 5), l = r.int(8, 30);
      c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px + l / 2, py - 3, px + l, py); c.stroke();
    }
    c.fillStyle = U.shade(base, 0.8);
    for (let i = 0; i < (w * h) / 2000; i++) c.fillRect(x + r.int(0, w - 8), y + r.int(0, h - 1), r.int(4, 12), 1);
  };
  P.carpet = (c, x, y, w, h, r, t) => {
    const base = r.pick(['#8a1e2a', '#2b3a6b', '#6b3a8a', '#3a6b4a', '#a0522d']);
    const acc = r.pick(['#c9a227', '#f0e6c8', '#d9532b', '#7fb2e5']);
    c.fillStyle = base; c.fillRect(x, y, w, h);
    const b = 12;
    c.strokeStyle = acc; c.lineWidth = 3; c.strokeRect(x + b, y + b, w - 2 * b, h - 2 * b);
    c.lineWidth = 1; c.strokeRect(x + b + 6, y + b + 6, w - 2 * b - 12, h - 2 * b - 12);
    const s = 28;
    c.fillStyle = U.mix(base, acc, 0.5);
    for (let yy = y + 40; yy < y + h - 30; yy += s)
      for (let xx = x + 40; xx < x + w - 30; xx += s) {
        c.beginPath(); c.moveTo(xx, yy - 6); c.lineTo(xx + 6, yy); c.lineTo(xx, yy + 6); c.lineTo(xx - 6, yy); c.closePath(); c.fill();
      }
    // textura de fibras
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < (w * h) / 60; i++) c.fillRect(x + r.int(0, w - 1), y + r.int(0, h - 1), 1, 1);
  };
  P.marble = (c, x, y, w, h, r, t) => {
    const base = r.pick(['#e8e4dc', '#d8d4cc', '#cfcac0', '#2b2b33']);
    c.fillStyle = base; c.fillRect(x, y, w, h);
    c.strokeStyle = U.shade(base, base === '#2b2b33' ? 1.8 : 0.75); c.lineWidth = 1;
    for (let i = 0; i < (w * h) / 6000 + 3; i++) {
      c.beginPath();
      let px = x + r.int(0, w), py = y + r.int(0, h);
      c.moveTo(px, py);
      for (let k = 0; k < 6; k++) { px += r.int(-60, 60); py += r.int(-40, 40); c.lineTo(px, py); }
      c.stroke();
    }
    const s = r.pick([64, 96]);
    c.strokeStyle = 'rgba(0,0,0,0.2)';
    for (let xx = x; xx <= x + w; xx += s) { c.beginPath(); c.moveTo(xx + 0.5, y); c.lineTo(xx + 0.5, y + h); c.stroke(); }
    for (let yy = y; yy <= y + h; yy += s) { c.beginPath(); c.moveTo(x, yy + 0.5); c.lineTo(x + w, yy + 0.5); c.stroke(); }
  };
  P.shelf = (c, x, y, w, h, r, t) => {
    const wood = r.pick(['#6b4a2b', '#8a6a45', '#4a3a2a']);
    c.fillStyle = U.shade(wood, 0.6); c.fillRect(x, y, w, h);
    const rowH = r.int(34, 48);
    for (let yy = y + 4; yy + rowH <= y + h; yy += rowH) {
      c.fillStyle = wood; c.fillRect(x, yy + rowH - 5, w, 5);
      let xx = x + 4;
      while (xx < x + w - 6) {
        const bw = r.int(5, 12), bh = r.int(rowH * 0.55, rowH - 8);
        c.fillStyle = r.pick(t.accents.concat(t.walls));
        c.fillRect(xx, yy + rowH - 5 - bh, bw, bh);
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(xx + 1, yy + rowH - 5 - bh + 3, bw - 2, 1);
        xx += bw + 1;
        if (r.chance(0.08)) xx += r.int(6, 20);
      }
    }
  };
  P.poster = (c, x, y, w, h, r, t) => {
    const a = r.pick(t.accents), b = r.pick(t.accents.concat(t.walls));
    const g = r.chance(0.5) ? c.createLinearGradient(x, y, r.chance(0.5) ? x + w : x, r.chance(0.5) ? y + h : y)
      : c.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, Math.max(w, h) / 1.5);
    g.addColorStop(0, a); g.addColorStop(1, b);
    c.fillStyle = g; c.fillRect(x, y, w, h);
    if (r.chance(0.6)) {
      c.fillStyle = r.pick(['#ffffff', '#111111', '#f7e36b']);
      const shape = r.int(0, 2);
      if (shape === 0) { c.beginPath(); c.arc(x + w / 2, y + h / 2, Math.min(w, h) / 4, 0, 7); c.fill(); }
      else if (shape === 1) c.fillRect(x + w / 4, y + h / 4, w / 2, h / 2);
      else { c.beginPath(); c.moveTo(x + w / 2, y + h / 5); c.lineTo(x + w * 0.8, y + h * 0.8); c.lineTo(x + w * 0.2, y + h * 0.8); c.closePath(); c.fill(); }
    }
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 3; c.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  };
  P.painting = (c, x, y, w, h, r, t) => {
    const frame = r.pick(['#c9a227', '#3a2a1a', '#e8e4dc', '#111111']);
    c.fillStyle = frame; c.fillRect(x, y, w, h);
    const f = 6;
    const inner = r.pick(['poster', 'dots', 'stripes', 'grass', 'water', 'flowers', 'diamonds']);
    c.save(); c.beginPath(); c.rect(x + f, y + f, w - 2 * f, h - 2 * f); c.clip();
    P[inner](c, x + f, y + f, w - 2 * f, h - 2 * f, r, t);
    c.restore();
    c.strokeStyle = U.shade(frame, 0.6); c.lineWidth = 2; c.strokeRect(x + f - 1, y + f - 1, w - 2 * f + 2, h - 2 * f + 2);
  };
  P.sign = (c, x, y, w, h, r, t) => {
    const bg = r.pick(['#e0b000', '#d9532b', '#2f6fb0', '#1d1d1f', '#f2f2f2', '#3e7f3e']);
    const fg = bg === '#f2f2f2' || bg === '#e0b000' ? '#111111' : '#ffffff';
    c.fillStyle = bg; c.fillRect(x, y, w, h);
    c.strokeStyle = fg; c.lineWidth = 3; c.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
    const words = ['SALIDA', 'ZONA 4', 'PELIGRO', 'NO PASAR', 'ALTO', 'BAR', 'ARTE', 'MUSEO', 'HOY', 'B-12', 'CUIDADO', 'PINTURA', 'ESCONDITE', 'OJO'];
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    const word = r.pick(words);
    c.font = `bold ${Math.min(h * 0.5, (w * 1.6) / word.length)}px sans-serif`;
    c.fillText(word, x + w / 2, y + h / 2);
  };
  P.barrel = (c, x, y, w, h, r, t) => {
    const col = r.pick(['#2f6fb0', '#d9532b', '#e0b000', '#3e7f3e', '#7d8590']);
    const rad = Math.min(w, h) / 2;
    const cx = x + w / 2, cy = y + h / 2;
    c.fillStyle = col; c.beginPath(); c.arc(cx, cy, rad, 0, 7); c.fill();
    c.strokeStyle = U.shade(col, 0.6); c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, rad - 2, 0, 7); c.stroke();
    c.beginPath(); c.arc(cx, cy, rad * 0.6, 0, 7); c.stroke();
    c.fillStyle = U.shade(col, 1.3); c.beginPath(); c.arc(cx - rad * 0.3, cy - rad * 0.3, rad * 0.18, 0, 7); c.fill();
  };

  function drawBase(c, w, h, r, t) {
    const base = t.base === 'grass' ? P.grass : t.base === 'planks' ? P.planks : P.concrete;
    base(c, 0, 0, w, h, r, t);
  }

  function drawSeekerBase(c, base) {
    const { x, y, w, h } = base;
    c.fillStyle = '#23252b'; c.fillRect(x, y, w, h);
    // franjas de peligro
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    for (let i = -h; i < w + h; i += 24) {
      c.fillStyle = (i / 24) % 2 ? '#f2c400' : '#111111';
      c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i + 12, y); c.lineTo(x + i + 12 - h, y + h); c.lineTo(x + i - h, y + h); c.closePath(); c.fill();
    }
    c.restore();
    c.fillStyle = '#23252b'; c.fillRect(x + 14, y + 14, w - 28, h - 28);
    c.fillStyle = '#f2c400'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 26px sans-serif'; c.fillText('BASE DE', x + w / 2, y + h / 2 - 18);
    c.fillText('BUSCADORES', x + w / 2, y + h / 2 + 14);
    c.font = '13px sans-serif'; c.fillStyle = '#c9c9c9'; c.fillText('Los escondidos no pueden estar aquí', x + w / 2, y + h - 30);
  }

  function generate(seed, themeName, w, h, base) {
    const t = THEMES[themeName] || THEMES.almacen;
    const r = U.rng(seed);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    drawBase(c, w, h, r, t);

    // Regiones grandes
    const regions = [];
    const nBig = r.int(22, 30);
    for (let i = 0; i < nBig; i++) {
      const rw = r.int(240, 720), rh = r.int(180, 520);
      regions.push({ x: r.int(0, w - rw), y: r.int(0, h - rh), w: rw, h: rh, kind: r.pick(t.big) });
    }
    regions.sort((a, b) => b.w * b.h - a.w * a.h);
    for (const reg of regions) {
      c.save(); c.beginPath(); c.rect(reg.x, reg.y, reg.w, reg.h); c.clip();
      P[reg.kind](c, reg.x, reg.y, reg.w, reg.h, r, t);
      c.restore();
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 2; c.strokeRect(reg.x + 1, reg.y + 1, reg.w - 2, reg.h - 2);
    }
    // Decoración pequeña
    const nSmall = r.int(45, 65);
    for (let i = 0; i < nSmall; i++) {
      const kind = r.pick(t.small);
      const sw = r.int(50, 190), sh = kind === 'sign' ? r.int(36, 70) : r.int(50, 170);
      const sx = r.int(0, w - sw), sy = r.int(0, h - sh);
      if (sx < base.w + 20 && sy < base.h + 20) continue;
      c.save(); c.beginPath(); c.rect(sx, sy, sw, sh); c.clip();
      P[kind](c, sx, sy, sw, sh, r, t);
      c.restore();
      if (kind !== 'barrel') { c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 2; c.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2); }
    }
    drawSeekerBase(c, base);
    // Borde del mapa
    c.strokeStyle = '#111'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    return canvas;
  }

  return { generate, THEMES };
})();
