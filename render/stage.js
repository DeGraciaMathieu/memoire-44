// Scène canvas : mise à l'échelle, rendu à la demande (rAF coalescé)
// et dessin de la couche dynamique par-dessus le raster du plateau.

import { W, H } from '../src/config.js';
import { inBounds } from '../src/hex.js';
import { cardSectors, sectorsOf } from '../src/sectors.js';
import { cardById } from '../src/cards.js';
import { obstacleAt } from '../src/movement.js';
import { UNIT_GLYPH } from './html.js';
import {
  COL,
  LAYOUT,
  boardSize,
  bridgeSpec,
  hexCenter,
  hexCorners,
  hexPath,
  sectorLabelsX,
  sectorLinesX,
} from './gfx.js';

export const DPR = Math.min(window.devicePixelRatio || 1, 2);

// Glyphe de la pastille d'obstacle affichée sur le pion qui l'occupe.
const OBSTACLE_BADGE = { bunker: '⌂', antichar: '✕', sacs: '◠', pont: '=', barbeles: '#' };

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

  // explosions en cours : { x, y, start, scale } — dessinées tant qu'elles vivent,
  // le draw() se réarme lui-même jusqu'à extinction
  const FX_MS = 700;
  const fx = [];

  // glissements en cours : { id, x, y, start, ms } — le pion est dessiné en
  // interpolation depuis (x, y) vers son hex courant, l'entrée expire ensuite
  const slides = [];

  // Fait glisser un pion depuis son hex d'origine (l'état l'a déjà déplacé)
  // vers sa position courante. Renvoie la durée (ms) pour caler le tempo.
  function slideUnit(u, from) {
    const a = hexCenter(from.c, from.r);
    const b = hexCenter(u.c, u.r);
    const ms = Math.min(900, 240 + Math.hypot(b.x - a.x, b.y - a.y));
    slides.push({ id: u.id, x: a.x, y: a.y, start: performance.now(), ms });
    requestDraw();
    return ms;
  }

  // pion replié maintenu sur son hex d'origine tant que les explosions jouent :
  // { id, c, r, until } — l'état a déjà déplacé l'unité, seul l'affichage attend
  let hold = null;

  // pion détruit encore affiché le temps du feu : { unit, c, r, until } —
  // l'état l'a déjà retiré, il ne disparaît qu'après la dernière explosion
  let ghost = null;

  // Le résultat de l'attaque dicte les explosions : une par coin de la tuile
  // pour chaque dégât encaissé, puis une explosion centrale plus large si
  // l'unité est détruite. Un pion qui recule ne bouge qu'une fois le feu éteint.
  // Renvoie la durée totale (ms) pour que l'appelant attende la fin du feu.
  function boom(hex, { damage, killed, retreatedId, corpse }) {
    const now = performance.now();
    const p = hexCenter(hex.c, hex.r);
    const corners = hexCorners(p.x, p.y, LAYOUT.size * 0.45);
    const n = Math.min(damage, corners.length);
    for (let i = 0; i < n; i++) {
      const [x, y] = corners[i];
      fx.push({ x, y, start: now + i * 120, scale: 0.9 });
    }
    const total = (killed ? n : n - 1) * 120 + FX_MS;
    if (killed) fx.push({ x: p.x, y: p.y, start: now + n * 120, scale: 2 });
    if (retreatedId != null) hold = { id: retreatedId, c: hex.c, r: hex.r, until: now + total };
    if (corpse) ghost = { unit: corpse, c: hex.c, r: hex.r, until: now + total };
    requestDraw();
    return total;
  }

  function draw() {
    const now = performance.now(); // horloge unique : maintien, fantôme, glissements et explosions
    const { state, ui, boardLayer } = getScene();
    if (hold && now >= hold.until) {
      // le feu est éteint : le pion replié rejoint son hex en glissant
      const u = state.units.find((v) => v.id === hold.id);
      if (u && (u.c !== hold.c || u.r !== hold.r)) slideUnit(u, hold);
      hold = null;
    }
    if (ghost && now >= ghost.until) ghost = null;
    for (let i = slides.length - 1; i >= 0; i--)
      if (now >= slides[i].start + slides[i].ms) slides.splice(i, 1);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(boardLayer, 0, 0, width, height);

    // obstacles — dynamiques : les sacs de sable disparaissent en cours de partie
    for (const [k, o] of Object.entries(state.obstacles)) {
      const [c, r] = k.split(',').map(Number);
      const p = hexCenter(c, r);
      drawObstacle(
        o,
        p.x,
        p.y,
        o === 'pont' ? bridgeSpec(state.terrain, state.obstacles, c, r) : null,
      );
    }

    // secteurs activés par la carte en cours ('flancs' en couvre deux)
    const cd = state.playedCard && cardById(state.playedCard);
    const live =
      state.phase === 'orders' &&
      state.turn === state.playerSide &&
      cd &&
      cd.sector &&
      cd.sector !== '*'
        ? cardSectors(cd.sector)
        : null;
    if (live) {
      for (let r = 0; r < H; r++)
        for (let c = 0; c < W; c++) {
          if (!inBounds(c, r)) continue;
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
    // tour adverse : hexes visés par l'IA, et traceur depuis l'unité activée
    for (const h of ui.aiTargets) {
      const p = hexCenter(h.c, h.r);
      hexPath(ctx, p.x, p.y);
      ctx.fillStyle = 'rgba(176,58,46,.22)';
      ctx.fill();
      ctx.strokeStyle = '#B03A2E';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (ui.aiFocus && ui.aiTargets.length === 1) {
      const a = hexCenter(ui.aiFocus.c, ui.aiFocus.r);
      const b = hexCenter(ui.aiTargets[0].c, ui.aiTargets[0].r);
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#B03A2E';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
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
      const held = hold && hold.id === u.id;
      let p = held ? hexCenter(hold.c, hold.r) : hexCenter(u.c, u.r);
      const sl = !held && slides.find((s) => s.id === u.id);
      if (sl) {
        const t = Math.min(1, (now - sl.start) / sl.ms);
        const e = t * t * (3 - 2 * t); // départ et arrivée en douceur
        p = { x: sl.x + (p.x - sl.x) * e, y: sl.y + (p.y - sl.y) * e };
      }
      const sel =
        (ui.selected && ui.selected.id === u.id) || (ui.aiFocus && ui.aiFocus.id === u.id);
      const canOrder =
        state.phase === 'orders' &&
        state.turn === state.playerSide &&
        ui.orderable.some((x) => x.id === u.id) &&
        !u.acted;
      drawCounter(u, p.x, p.y, {
        sel,
        canOrder,
        obstacle: obstacleAt(state, u.c, u.r),
        playerSide: state.playerSide,
      });
    }
    if (ghost) {
      const p = hexCenter(ghost.c, ghost.r);
      drawCounter(ghost.unit, p.x, p.y, {});
    }
    if (ui.drag) {
      const u = ui.drag.unit;
      drawCounter(u, ui.drag.x, ui.drag.y, {
        sel: true,
        canOrder: true,
        lifted: true,
        obstacle: obstacleAt(state, u.c, u.r),
      });
    }

    // explosions par-dessus tout, puis prochaine frame tant qu'il en reste
    for (let i = fx.length - 1; i >= 0; i--) {
      const t = (now - fx[i].start) / FX_MS;
      if (t >= 1) {
        fx.splice(i, 1);
        continue;
      }
      if (t >= 0) drawExplosion(fx[i].x, fx[i].y, t, fx[i].scale);
    }
    if (fx.length || slides.length) requestDraw();
  }

  function drawExplosion(x, y, t, s) {
    const ease = 1 - (1 - t) * (1 - t); // expansion vive puis amortie
    ctx.save();
    ctx.globalAlpha = 1 - t;
    // boule de feu
    ctx.fillStyle = '#E8B33A';
    ctx.beginPath();
    ctx.arc(x, y, (4 + ease * 10) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#B03A2E';
    ctx.beginPath();
    ctx.arc(x, y, (2 + ease * 5) * s, 0, Math.PI * 2);
    ctx.fill();
    // onde de choc
    ctx.strokeStyle = '#E8E2D0';
    ctx.lineWidth = 2 * (1 - t);
    ctx.beginPath();
    ctx.arc(x, y, (8 + ease * 22) * s, 0, Math.PI * 2);
    ctx.stroke();
    // éclats projetés en étoile
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + 0.4;
      const d = (10 + ease * 24) * s;
      ctx.fillStyle = i % 2 ? '#E8B33A' : '#B03A2E';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.4 * (1 - t) * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawObstacle(type, x, y, bridge = null) {
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
      // tablier plein en bras partant du centre : d'une rive à l'autre quand le
      // pont est seul, prolongé jusqu'au bord de tuile vers chaque pont voisin —
      // dans les virages, les bras forment un coude au centre de la tuile
      const edge = (Math.sqrt(3) / 2) * LAYOUT.size;
      const armLen = (arm) => (arm.join ? edge : LAYOUT.size * 0.82);
      const planks = (from, to) => {
        ctx.strokeStyle = 'rgba(0,0,0,.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let px = from; px < to; px += 6) {
          ctx.moveTo(px, -9);
          ctx.lineTo(px, 9);
        }
        ctx.stroke();
      };
      const parapets = (from, to) => {
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(from, -9);
        ctx.lineTo(to, -9);
        ctx.moveTo(from, 9);
        ctx.lineTo(to, 9);
        ctx.stroke();
      };
      const cap = (at) => {
        ctx.fillStyle = 'rgba(0,0,0,.35)'; // culée en pierre ancrée sur la rive
        ctx.fillRect(at, -12, 5, 24);
      };
      ctx.save();
      ctx.translate(x, y);
      const [back, front] = bridge;
      if (bridge.length === 2 && Math.cos(back.angle - front.angle) < -0.999) {
        // bras opposés : un seul tenant, planches et parapets continus
        ctx.rotate(front.angle);
        const left = armLen(back);
        const right = armLen(front);
        ctx.fillStyle = COL.plage;
        ctx.fillRect(-left, -9, left + right, 18);
        planks(-left + 6, right - 2);
        parapets(-left, right);
        if (!back.join) cap(-left - 3);
        if (!front.join) cap(right - 2);
      } else {
        // coude : les tabliers d'abord, puis les traits — sinon les parapets
        // d'un bras rayeraient le tablier de l'autre au niveau du joint
        for (const arm of bridge) {
          ctx.save();
          ctx.rotate(arm.angle);
          ctx.fillStyle = COL.plage;
          ctx.fillRect(0, -9, armLen(arm), 18);
          ctx.restore();
        }
        for (const arm of bridge) {
          ctx.save();
          ctx.rotate(arm.angle);
          planks(12, armLen(arm) - 2);
          parapets(6, armLen(arm));
          if (!arm.join) cap(armLen(arm) - 2);
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  function drawCounter(u, x, y, { sel, canOrder, lifted, obstacle, playerSide }) {
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
    // pastille au coin supérieur droit : rappel de l'obstacle que le pion cache
    if (obstacle) {
      ctx.fillStyle = COL.ink;
      ctx.strokeStyle = 'rgba(0,0,0,.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(21, -18, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.75)';
      ctx.font = 'bold 13px "Courier New"';
      ctx.fillText(OBSTACLE_BADGE[obstacle] ?? '•', 21, -13);
    }
    if (u.acted && u.side === playerSide && !lifted) {
      ctx.fillStyle = 'rgba(0,0,0,.40)';
      ctx.beginPath();
      ctx.roundRect(-22, -19, 44, 38, 4);
      ctx.fill();
    }
    ctx.restore();
  }

  return { width, height, requestDraw, draw, boom, slideUnit };
}
