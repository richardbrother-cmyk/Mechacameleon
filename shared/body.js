/* Modelo del cuerpo del jugador: partes, poses y test de impacto.
   Se usa tanto en el servidor (CommonJS) como en el navegador (global Body). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Body = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Tamaño de cada parte en unidades de mundo (= píxeles de textura).
  const PARTS = {
    head:  { w: 14, h: 14, shape: 'ellipse' },
    torso: { w: 18, h: 26, shape: 'rect' },
    armL:  { w: 7,  h: 24, shape: 'rect' },
    armR:  { w: 7,  h: 24, shape: 'rect' },
    legL:  { w: 8,  h: 26, shape: 'rect' },
    legR:  { w: 8,  h: 26, shape: 'rect' },
  };
  const PART_NAMES = Object.keys(PARTS);
  const DRAW_ORDER = ['legL', 'legR', 'armL', 'armR', 'torso', 'head'];

  // Cada pose define desplazamiento (x,y) y rotación (r) de cada parte
  // respecto al centro del jugador.
  const POSES = {
    stand: {
      label: 'De pie',
      head: { x: 0, y: -27, r: 0 }, torso: { x: 0, y: -7, r: 0 },
      armL: { x: -13, y: -6, r: 0.08 }, armR: { x: 13, y: -6, r: -0.08 },
      legL: { x: -5, y: 19, r: 0 }, legR: { x: 5, y: 19, r: 0 },
    },
    arms_up: {
      label: 'Brazos arriba',
      head: { x: 0, y: -27, r: 0 }, torso: { x: 0, y: -7, r: 0 },
      armL: { x: -13, y: -26, r: 2.95 }, armR: { x: 13, y: -26, r: -2.95 },
      legL: { x: -5, y: 19, r: 0 }, legR: { x: 5, y: 19, r: 0 },
    },
    star: {
      label: 'Estrella',
      head: { x: 0, y: -27, r: 0 }, torso: { x: 0, y: -7, r: 0 },
      armL: { x: -18, y: -16, r: 0.95 }, armR: { x: 18, y: -16, r: -0.95 },
      legL: { x: -11, y: 17, r: -0.45 }, legR: { x: 11, y: 17, r: 0.45 },
    },
    crouch: {
      label: 'Agachado',
      head: { x: 0, y: -15, r: 0 }, torso: { x: 0, y: 3, r: 0.25 },
      armL: { x: -12, y: 7, r: 0.7 }, armR: { x: 12, y: 7, r: -0.7 },
      legL: { x: -9, y: 15, r: 1.35 }, legR: { x: 9, y: 15, r: -1.35 },
    },
    ball: {
      label: 'Ovillo',
      head: { x: 0, y: -13, r: 0 }, torso: { x: 0, y: 3, r: 0 },
      armL: { x: -9, y: 2, r: 1.25 }, armR: { x: 9, y: 2, r: -1.25 },
      legL: { x: -6, y: 12, r: 1.5 }, legR: { x: 6, y: 12, r: -1.5 },
    },
  };
  const POSE_NAMES = Object.keys(POSES);
  const BOUND_RADIUS = 42;

  // Convierte un punto de mundo a coordenadas locales (centradas) de una parte.
  function worldToPart(player, part, wx, wy) {
    const rot = player.rot || 0;
    const c = Math.cos(-rot), s = Math.sin(-rot);
    const dx = wx - player.x, dy = wy - player.y;
    let lx = dx * c - dy * s;
    let ly = dx * s + dy * c;
    if (player.flip) lx = -lx;
    const pose = POSES[player.pose] || POSES.stand;
    const off = pose[part];
    lx -= off.x; ly -= off.y;
    const c2 = Math.cos(-off.r), s2 = Math.sin(-off.r);
    return { x: lx * c2 - ly * s2, y: lx * s2 + ly * c2 };
  }

  function partContains(part, lx, ly, margin) {
    const p = PARTS[part];
    const m = margin || 0;
    if (p.shape === 'ellipse') {
      const rx = p.w / 2 + m, ry = p.h / 2 + m;
      return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
    }
    return Math.abs(lx) <= p.w / 2 + m && Math.abs(ly) <= p.h / 2 + m;
  }

  // Devuelve el nombre de la parte golpeada o null.
  function hitTest(player, wx, wy, margin) {
    const dx = wx - player.x, dy = wy - player.y;
    if (dx * dx + dy * dy > (BOUND_RADIUS + (margin || 0)) ** 2) return null;
    for (let i = DRAW_ORDER.length - 1; i >= 0; i--) {
      const name = DRAW_ORDER[i];
      const l = worldToPart(player, name, wx, wy);
      if (partContains(name, l.x, l.y, margin)) return name;
    }
    return null;
  }

  return { PARTS, PART_NAMES, DRAW_ORDER, POSES, POSE_NAMES, BOUND_RADIUS, worldToPart, partContains, hitTest };
});
