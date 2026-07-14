// Helpers graphiques PURS : layout du plateau, palette, picking.
// Testables sans navigateur — aucun accès au DOM ni au contexte canvas
// (hexPath reçoit le contexte en argument).

import { W, H } from '../src/config.js';
import { inBounds, key, neighbors } from '../src/hex.js';

export const LAYOUT = { size: 42, mx: 26, my: 26 };

export const COL = {
  plaine: '#B5C98C',
  foret: '#55703F',
  colline: '#B08D5B',
  village: '#9A9086',
  bocage: '#8CA061',
  riviere: '#527D98',
  mer: '#3D6480',
  plage: '#D9CCA3',
  allies: '#4E7A4B',
  axis: '#7A736B',
  ink: '#E8E2D0',
  line: '#8C8264',
  objective: '#C9A227',
};

// Nuances de vert autour de COL.plaine pour casser la monotonie du fond.
export const PLAINE_SHADES = [COL.plaine, '#ADC282', '#BCCF96', '#A8BD7E'];

// Nuance de plaine d'un hex : déterministe (même hex → même teinte), le hash
// évite les rayures qu'un simple modulo sur c et r dessinerait.
export function plaineShade(c, r) {
  let h = Math.imul(c + 1, 2654435761) ^ Math.imul(r + 1, 1597334677);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return PLAINE_SHADES[(h >>> 16) % PLAINE_SHADES.length];
}

export function boardSize(layout = LAYOUT) {
  // les rangées impaires (12 tuiles, décalées) ne dépassent plus à droite
  return {
    width: Math.round(layout.size * Math.sqrt(3) * W) + layout.mx * 2,
    height: Math.round(layout.size * 1.5 * (H - 1) + layout.size * 2) + layout.my * 2,
  };
}

export function hexCenter(c, r, layout = LAYOUT) {
  const { size, mx, my } = layout;
  return {
    x: mx + size * Math.sqrt(3) * (c + 0.5 * (r & 1)) + (size * Math.sqrt(3)) / 2,
    y: my + size * 1.5 * r + size,
  };
}

export function hexCorners(x, y, size = LAYOUT.size) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    out.push([x + size * Math.cos(a), y + size * Math.sin(a)]);
  }
  return out;
}

export function hexPath(ctx, x, y, size = LAYOUT.size) {
  ctx.beginPath();
  hexCorners(x, y, size).forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
}

// Tablier du pont posé en (c, r) : liste de bras { angle, join } partant du
// centre de la tuile. Un bras par pont voisin (join — il court jusqu'au bord de
// la tuile pour rejoindre l'autre tablier, y compris dans les virages de la
// rivière) ; un pont voisin unique ajoute un bras opposé vers la rive ; sans
// pont voisin, deux bras opposés perpendiculaires au fil de la rivière déduit
// des hexes rivière voisins (horizontaux à défaut). Les bras !join portent la
// culée.
export function bridgeSpec(terrain, obstacles, c, r, layout = LAYOUT) {
  const p = hexCenter(c, r, layout);
  const nbs = neighbors(c, r);
  const dirTo = (h) => {
    const q = hexCenter(h.c, h.r, layout);
    return Math.atan2(q.y - p.y, q.x - p.x);
  };
  const ponts = nbs.filter((h) => obstacles[key(h.c, h.r)] === 'pont');
  if (ponts.length >= 2) return ponts.map((h) => ({ angle: dirTo(h), join: true }));
  if (ponts.length === 1) {
    const angle = dirTo(ponts[0]);
    return [
      { angle, join: true },
      { angle: angle + Math.PI, join: false },
    ];
  }
  const rivers = nbs.filter((h) => terrain[key(h.c, h.r)] === 'riviere');
  let deck = 0;
  if (rivers.length) {
    const a = hexCenter(rivers[0].c, rivers[0].r, layout);
    const b = rivers[1] ? hexCenter(rivers[1].c, rivers[1].r, layout) : p;
    deck = Math.atan2(a.y - b.y, a.x - b.x) + Math.PI / 2;
  }
  return [
    { angle: deck, join: false },
    { angle: deck + Math.PI, join: false },
  ];
}

// Hex le plus proche du point (x, y), ou null si le point tombe hors plateau.
export function pickHex(x, y, layout = LAYOUT) {
  let best = null;
  let bd = Infinity;
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      if (!inBounds(c, r)) continue;
      const p = hexCenter(c, r, layout);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = { c, r };
      }
    }
  return bd <= (layout.size * 0.95) ** 2 ? best : null;
}

// Les lignes de secteur : deux droites verticales entre les colonnes 3|4 et
// 8|9 des rangées paires — soit le centre des colonnes 3 et 8 des rangées
// impaires (secteurs 4 / 5 / 4).
export function sectorLinesX(layout = LAYOUT) {
  return [hexCenter(3, 1, layout).x, hexCenter(8, 1, layout).x];
}

export function sectorLabelsX(layout = LAYOUT) {
  const [left, right] = sectorLinesX(layout);
  const { width } = boardSize(layout);
  return {
    gauche: (layout.mx + left) / 2,
    centre: (left + right) / 2,
    droite: (right + (width - layout.mx)) / 2,
  };
}
