// Scène canvas : mise à l'échelle, rendu à la demande (rAF coalescé)
// et dessin de la couche dynamique par-dessus le raster du plateau.

import { W, H } from '../src/config.js';
import { cardSectors, sectorsOf } from '../src/sectors.js';
import { cardById } from '../src/cards.js';
import { UNIT_GLYPH } from './html.js';
import { COL, LAYOUT, boardSize, hexCenter, hexPath, sectorLabelsX, sectorLinesX } from './gfx.js';

export const DPR = Math.min(window.devicePixelRatio || 1, 2);

export function createStage(canvas, getScene) {
  const { width, height } = boardSize();
  const ctx = canvas.getContext('2d');
  canvas.width = width * DPR;
  canvas.height = height * DPR;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.scale(DPR, DPR);

  let pending = false;
  function requestDraw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      draw();
    });
  }

  // explosions en cours : { x, y, start } — dessinées tant qu'elles vivent,
  // le draw() se réarme lui-même jusqu'à extinction
  const FX_MS = 700;
  const fx = [];

  function boom(hexes) {
    const now = performance.now();
    hexes.forEach((h, i) => {
      const p = hexCenter(h.c, h.r);
      fx.push({ x: p.x, y: p.y, start: now + i * 120 });
    });
    requestDraw();
  }

  function draw() {
    const { state, ui, boardLayer } = getScene();
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(boardLayer, 0, 0, width, height);

    // obstacles — dynamiques : les sacs de sable disparaissent en cours de partie
    for (const [k, o] of Object.entries(state.obstacles)) {
      const [c, r] = k.split(',').map(Number);
      const p = hexCenter(c, r);
      drawObstacle(o, p.x, p.y);
    }

    // secteurs activés par la carte en cours ('flancs' en couvre deux)
    const cd = state.playedCard && cardById(state.playedCard);
    const live =
      state.phase === 'orders' && state.turn === 'allies' && cd && cd.sector && cd.sector !== '*'
        ? cardSectors(cd.sector)
        : null;
    if (live) {
      for (let r = 0; r < H; r++)
        for (let c = 0; c < W; c++) {
          const p = hexCenter(c, r);
          hexPath(ctx, p.x, p.y);
          ctx.fillStyle = sectorsOf(c, r).some((s) => live.includes(s))
            ? 'rgba(201,162,39,.14)'
            : 'rgba(12,14,11,.24)';
          ctx.fill();
        }
    }

    // frontières : deux droites, tracées par-dessus les hexes
    ctx.save();
    ctx.setLineDash([10, 7]);
    ctx.lineCap = 'round';
    for (const x of sectorLinesX()) {
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x, height - 4);
      ctx.strokeStyle = 'rgba(20,22,18,.60)';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = '#E8E2D0';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();

    // étiquettes de secteur
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px "Courier New"';
    for (const [name, x] of Object.entries(sectorLabelsX())) {
      ctx.fillStyle = live && live.includes(name) ? '#C9A227' : 'rgba(232,226,208,.45)';
      ctx.letterSpacing = '3px';
      ctx.fillText(name.toUpperCase(), x, 15);
      ctx.fillText(name.toUpperCase(), x, height - 7);
    }
    ctx.restore();

    // aides visuelles
    for (const h of ui.moves) {
      const p = hexCenter(h.c, h.r);
      hexPath(ctx, p.x, p.y);
      ctx.fillStyle = 'rgba(232,226,208,.25)';
      ctx.fill();
      ctx.strokeStyle = '#E8E2D0';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    for (const t of ui.targets) {
      const p = hexCenter(t.unit.c, t.unit.r);
      hexPath(ctx, p.x, p.y);
      ctx.strokeStyle = '#B03A2E';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#B03A2E';
      ctx.font = 'bold 12px "Courier New"';
      ctx.textAlign = 'center';
      ctx.fillText(t.dice + 'D', p.x, p.y - LAYOUT.size + 13);
    }
    // carte action en attente de cible : unités ciblables ou hexs déjà choisis
    if (ui.action) {
      for (const u of ui.action.targets ?? []) {
        const p = hexCenter(u.c, u.r);
        hexPath(ctx, p.x, p.y);
        ctx.strokeStyle = ui.action.kind === 'medics' ? '#C9A227' : '#B03A2E';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      for (const h of ui.action.picks ?? []) {
        const p = hexCenter(h.c, h.r);
        hexPath(ctx, p.x, p.y);
        ctx.fillStyle = 'rgba(176,58,46,.35)';
        ctx.fill();
        ctx.strokeStyle = '#B03A2E';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
    // hex survolé (inspection)
    if (ui.hover) {
      const p = hexCenter(ui.hover.c, ui.hover.r);
      hexPath(ctx, p.x, p.y);
      ctx.strokeStyle = 'rgba(232,226,208,.75)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // hex survolé pendant un glisser
    if (ui.drag && ui.drag.hover) {
      const p = hexCenter(ui.drag.hover.c, ui.drag.hover.r);
      hexPath(ctx, p.x, p.y);
      ctx.fillStyle =
        ui.drag.hoverKind === 'attack' ? 'rgba(176,58,46,.35)' : 'rgba(201,162,39,.30)';
      ctx.fill();
      ctx.strokeStyle = ui.drag.hoverKind === 'attack' ? '#B03A2E' : '#C9A227';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // unités
    for (const u of state.units) {
      if (ui.drag && ui.drag.unit.id === u.id) continue; // dessinée au curseur
      const p = hexCenter(u.c, u.r);
      const sel = ui.selected && ui.selected.id === u.id;
      const canOrder =
        state.phase === 'orders' &&
        state.turn === 'allies' &&
        ui.orderable.some((x) => x.id === u.id) &&
        !u.acted;
      drawCounter(u, p.x, p.y, { sel, canOrder });
    }
    if (ui.drag) {
      drawCounter(ui.drag.unit, ui.drag.x, ui.drag.y, { sel: true, canOrder: true, lifted: true });
    }

    // explosions par-dessus tout, puis prochaine frame tant qu'il en reste
    const now = performance.now();
    for (let i = fx.length - 1; i >= 0; i--) {
      const t = (now - fx[i].start) / FX_MS;
      if (t >= 1) {
        fx.splice(i, 1);
        continue;
      }
      if (t >= 0) drawExplosion(fx[i].x, fx[i].y, t);
    }
    if (fx.length) requestDraw();
  }

  function drawExplosion(x, y, t) {
    const ease = 1 - (1 - t) * (1 - t); // expansion vive puis amortie
    ctx.save();
    ctx.globalAlpha = 1 - t;
    // boule de feu
    ctx.fillStyle = '#E8B33A';
    ctx.beginPath();
    ctx.arc(x, y, 4 + ease * 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#B03A2E';
    ctx.beginPath();
    ctx.arc(x, y, 2 + ease * 5, 0, Math.PI * 2);
    ctx.fill();
    // onde de choc
    ctx.strokeStyle = '#E8E2D0';
    ctx.lineWidth = 2 * (1 - t);
    ctx.beginPath();
    ctx.arc(x, y, 8 + ease * 22, 0, Math.PI * 2);
    ctx.stroke();
    // éclats projetés en étoile
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + 0.4;
      const d = 10 + ease * 24;
      ctx.fillStyle = i % 2 ? '#E8B33A' : '#B03A2E';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.4 * (1 - t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawObstacle(type, x, y) {
    if (type === 'bunker') {
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 11, y - 8, 22, 16);
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(x - 5, y - 2, 10, 3); // meurtrière
    }
    if (type === 'antichar') {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.font = 'bold 13px serif';
      ctx.textAlign = 'center';
      ctx.fillText('✕✕', x, y + 4); // hérissons tchèques
    }
    if (type === 'sacs') {
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(x + i * 9, y + 12, 4.5, Math.PI, 0); // rangée de sacs empilés
        ctx.fill();
      }
    }
    if (type === 'barbeles') {
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 15, y - 6);
      ctx.lineTo(x - 15, y + 6); // piquets
      ctx.moveTo(x + 15, y - 6);
      ctx.lineTo(x + 15, y + 6);
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 15, y);
      ctx.lineTo(x + 15, y); // fil tendu
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.font = 'bold 9px serif';
      ctx.textAlign = 'center';
      ctx.fillText('× × ×', x, y + 3); // ardillons
    }
    if (type === 'pont') {
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 15, y - 9);
      ctx.lineTo(x + 15, y - 9); // parapets
      ctx.moveTo(x - 15, y + 9);
      ctx.lineTo(x + 15, y + 9);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(x + i * 9, y - 9); // madriers
        ctx.lineTo(x + i * 9, y + 9);
      }
      ctx.stroke();
    }
  }

  function drawCounter(u, x, y, { sel, canOrder, lifted }) {
    ctx.save();
    ctx.translate(x, y);
    if (lifted) {
      ctx.scale(1.12, 1.12);
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 8;
    }
    ctx.fillStyle = COL[u.side];
    ctx.strokeStyle = sel ? '#C9A227' : canOrder ? '#E8E2D0' : 'rgba(0,0,0,.45)';
    ctx.lineWidth = sel ? 3 : canOrder ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(-22, -19, 44, 38, 4);
    ctx.fill();
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = COL.ink;
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px "Courier New"';
    ctx.fillText(UNIT_GLYPH[u.type], 0, -2);
    for (let i = 0; i < u.figs; i++) {
      ctx.fillStyle = COL.ink;
      ctx.beginPath();
      ctx.arc(-13 + i * 8.5, 12, 2.6, 0, 7);
      ctx.fill();
    }
    if (u.acted && u.side === 'allies' && !lifted) {
      ctx.fillStyle = 'rgba(0,0,0,.40)';
      ctx.beginPath();
      ctx.roundRect(-22, -19, 44, 38, 4);
      ctx.fill();
    }
    ctx.restore();
  }

  return { width, height, requestDraw, draw, boom };
}
