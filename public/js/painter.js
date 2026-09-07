'use strict';
/* Texturas pintables del cuerpo de un jugador. Cada parte es un canvas
   pequeño; solo se pinta sobre los píxeles que ya forman la silueta. */
class BodyPaint {
  constructor() {
    this.parts = {};
    for (const name of Body.PART_NAMES) this.parts[name] = this._make(name);
    this.dirty = new Set();
  }
  _make(name) {
    const p = Body.PARTS[name];
    const cv = document.createElement('canvas');
    cv.width = p.w; cv.height = p.h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    this._fillShape(ctx, p, '#ffffff');
    return cv;
  }
  _fillShape(ctx, p, color) {
    ctx.clearRect(0, 0, p.w, p.h);
    ctx.fillStyle = color;
    ctx.beginPath();
    if (p.shape === 'ellipse') ctx.ellipse(p.w / 2, p.h / 2, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
    else ctx.roundRect(0, 0, p.w, p.h, 2.5);
    ctx.fill();
  }
  reset() {
    for (const name of Body.PART_NAMES) {
      this._fillShape(this.parts[name].getContext('2d'), Body.PARTS[name], '#ffffff');
      this.dirty.add(name);
    }
  }
  fillPart(name, color) {
    const ctx = this.parts[name].getContext('2d');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, Body.PARTS[name].w, Body.PARTS[name].h);
    ctx.globalCompositeOperation = 'source-over';
    this.dirty.add(name);
  }
  // Pinta un punto en coordenadas locales de la parte.
  dot(name, lx, ly, radius, color) {
    const p = Body.PARTS[name];
    const cx = lx + p.w / 2, cy = ly + p.h / 2;
    if (cx < -radius || cy < -radius || cx > p.w + radius || cy > p.h + radius) return false;
    const ctx = this.parts[name].getContext('2d');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = color;
    if (radius <= 0.75) ctx.fillRect(Math.floor(cx), Math.floor(cy), 1, 1);
    else { ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    this.dirty.add(name);
    return true;
  }
  // Trazo en coordenadas de mundo sobre el cuerpo de `player`.
  stroke(player, x0, y0, x1, y1, radius, color) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(d / Math.max(0.5, radius * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wx = x0 + (x1 - x0) * t, wy = y0 + (y1 - y0) * t;
      for (const name of Body.PART_NAMES) {
        const l = Body.worldToPart(player, name, wx, wy);
        this.dot(name, l.x, l.y, radius, color);
      }
    }
  }
  takeDirty() {
    if (!this.dirty.size) return null;
    const out = {};
    for (const name of this.dirty) out[name] = this.parts[name].toDataURL('image/png');
    this.dirty.clear();
    return out;
  }
  serializeAll() {
    const out = {};
    for (const name of Body.PART_NAMES) out[name] = this.parts[name].toDataURL('image/png');
    return out;
  }
  load(parts) {
    if (!parts) return;
    for (const name of Object.keys(parts)) {
      if (!this.parts[name]) continue;
      const src = parts[name];
      const img = new Image();
      img.onload = () => {
        const ctx = this.parts[name].getContext('2d');
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, this.parts[name].width, this.parts[name].height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = src;
    }
  }
}

/* Dibujo del cuerpo en un contexto ya transformado a coordenadas de mundo. */
const BodyDraw = {
  hider(ctx, player, paint) {
    const pose = Body.POSES[player.pose] || Body.POSES.stand;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.rot || 0);
    if (player.flip) ctx.scale(-1, 1);
    for (const name of Body.DRAW_ORDER) {
      const off = pose[name], p = Body.PARTS[name];
      ctx.save();
      ctx.translate(off.x, off.y); ctx.rotate(off.r);
      ctx.drawImage(paint.parts[name], -p.w / 2, -p.h / 2);
      ctx.restore();
    }
    ctx.restore();
  },
  seeker(ctx, player) {
    const pose = Body.POSES[player.pose] || Body.POSES.stand;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.rot || 0);
    if (player.flip) ctx.scale(-1, 1);
    for (const name of Body.DRAW_ORDER) {
      const off = pose[name], p = Body.PARTS[name];
      ctx.save();
      ctx.translate(off.x, off.y); ctx.rotate(off.r);
      ctx.fillStyle = '#1c1c22';
      ctx.beginPath();
      if (p.shape === 'ellipse') ctx.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
      else ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 2.5);
      ctx.fill();
      ctx.strokeStyle = '#ff7a00'; ctx.lineWidth = 1; ctx.stroke();
      if (name === 'head') { ctx.fillStyle = '#ff7a00'; ctx.fillRect(-5, -2, 10, 3); }
      if (name === 'armR') { ctx.fillStyle = '#444'; ctx.fillRect(-2, 8, 4, 12); ctx.fillStyle = '#ff7a00'; ctx.fillRect(-1, 18, 2, 3); }
      ctx.restore();
    }
    ctx.restore();
  },
  outline(ctx, player, color) {
    const pose = Body.POSES[player.pose] || Body.POSES.stand;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.rot || 0);
    if (player.flip) ctx.scale(-1, 1);
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
    for (const name of Body.DRAW_ORDER) {
      const off = pose[name], p = Body.PARTS[name];
      ctx.save();
      ctx.translate(off.x, off.y); ctx.rotate(off.r);
      ctx.beginPath();
      if (p.shape === 'ellipse') ctx.ellipse(0, 0, p.w / 2 + 1, p.h / 2 + 1, 0, 0, Math.PI * 2);
      else ctx.roundRect(-p.w / 2 - 1, -p.h / 2 - 1, p.w + 2, p.h + 2, 3);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  },
};
