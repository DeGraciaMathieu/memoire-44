// Couche statique du plateau (terrain, quadrillage, glyphes),
// rasterisée une seule fois par partie dans un canvas hors écran.
// Les obstacles sont dessinés par stage.js : ils peuvent disparaître
// en cours de partie (sacs de sable abandonnés).

import { W, H } from '../src/config.js';
import { inBounds, key } from '../src/hex.js';
import { sectorsOf } from '../src/sectors.js';
import { COL, boardSize, hash2d, hexCenter, hexPath, plaineShade } from './gfx.js';

export function buildBoardLayer(state, dpr) {
  const { width, height } = boardSize();
  const layer = document.createElement('canvas');
  layer.width = width * dpr;
  layer.height = height * dpr;
  const ctx = layer.getContext('2d');
  ctx.scale(dpr, dpr);

  // fond : toile kaki grainée derrière les tuiles, encadrée d'un liseré laiton
  ctx.fillStyle = '#383D2F';
  ctx.fillRect(0, 0, width, height);
  for (let y = 3; y < height; y += 6)
    for (let x = 3; x < width; x += 6) {
      const h = hash2d(x, y);
      if (h % 7) continue; // grain épars, déterministe
      ctx.fillStyle = h % 14 ? 'rgba(232,226,208,.05)' : 'rgba(0,0,0,.16)';
      ctx.fillRect(x + (h % 5) - 2, y + ((h >> 3) % 5) - 2, 2, 2);
    }
  ctx.strokeStyle = 'rgba(201,162,39,.28)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(6.5, 6.5, width - 13, height - 13);

  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      if (!inBounds(c, r)) continue;
      const p = hexCenter(c, r);
      const t = state.terrain[key(c, r)];
      hexPath(ctx, p.x, p.y);
      ctx.fillStyle = t === 'plaine' ? plaineShade(c, r) : COL[t];
      ctx.fill();
      if (sectorsOf(c, r).includes('centre')) {
        ctx.fillStyle = 'rgba(0,0,0,.06)';
        ctx.fill();
      }
      ctx.strokeStyle = COL.line;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (t === 'foret') {
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.font = '16px serif';
        ctx.textAlign = 'center';
        ctx.fillText('▲▲', p.x, p.y + 5);
      }
      if (t === 'colline') {
        ctx.strokeStyle = 'rgba(0,0,0,.30)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      if (t === 'village') {
        ctx.fillStyle = 'rgba(0,0,0,.30)';
        ctx.fillRect(p.x - 9, p.y - 6, 18, 12);
      }
      if (t === 'bocage') {
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.font = '16px serif';
        ctx.textAlign = 'center';
        ctx.fillText('▦', p.x, p.y + 5);
      }
      if (t === 'riviere') {
        ctx.fillStyle = 'rgba(232,226,208,.45)';
        ctx.font = '16px serif';
        ctx.textAlign = 'center';
        ctx.fillText('≈≈', p.x, p.y + 5);
      }
      if (t === 'mer') {
        ctx.fillStyle = 'rgba(232,226,208,.40)';
        ctx.font = '15px serif';
        ctx.textAlign = 'center';
        ctx.fillText('≈ ≈', p.x, p.y - 2);
        ctx.fillText('≈ ≈', p.x, p.y + 10);
      }
      if (t === 'plage') {
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.font = 'bold 11px serif';
        ctx.textAlign = 'center';
        ctx.fillText('· · ·', p.x, p.y - 1);
        ctx.fillText('· ·', p.x, p.y + 9);
      }
      // pastille en haut de l'hex : tuile objectif (médaille à occuper) —
      // dorée : mixte, aux couleurs du camp : seul ce camp y marque
      const obj = state.objectives?.[key(c, r)];
      if (obj) {
        ctx.fillStyle = obj === 'both' ? COL.objective : COL[obj];
        ctx.beginPath();
        ctx.arc(p.x, p.y - 26, 8, 0, Math.PI * 2); // au-dessus du pion (haut à y − 19)
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = obj === 'both' ? 'rgba(0,0,0,.75)' : 'rgba(232,226,208,.9)';
        ctx.font = 'bold 10px serif';
        ctx.textAlign = 'center';
        ctx.fillText('★', p.x, p.y - 22.5);
      }
    }
  return layer;
}
