// Couche statique du plateau (terrain, quadrillage, glyphes),
// rasterisée une seule fois par partie dans un canvas hors écran.
// Les obstacles sont dessinés par stage.js : ils peuvent disparaître
// en cours de partie (sacs de sable abandonnés).

import { W, H } from '../src/config.js';
import { key } from '../src/hex.js';
import { sectorsOf } from '../src/sectors.js';
import { COL, boardSize, hexCenter, hexPath, plaineShade } from './gfx.js';

export function buildBoardLayer(state, dpr) {
  const { width, height } = boardSize();
  const layer = document.createElement('canvas');
  layer.width = width * dpr;
  layer.height = height * dpr;
  const ctx = layer.getContext('2d');
  ctx.scale(dpr, dpr);

  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
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
    }
  return layer;
}
