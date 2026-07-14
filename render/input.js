// Entrées joueur sur le plateau : survol (infobulle), clic et glisser-déposer.
// Aucune règle ici : la légalité vient de ui.moves / ui.targets, calculés
// par les actions de app.js à partir de src/.

import { unitAt } from '../src/movement.js';
import { hexCenter, pickHex } from './gfx.js';
import { tipHTML } from './html.js';

export function attachInput(canvas, { getState, getUi, hud, stage, actions }) {
  let dragMoved = false;

  // Échelles séparées par axe : max-width ET max-height peuvent contraindre le
  // canvas indépendamment (écran bas), l'échelle n'est alors plus uniforme.
  const toCanvas = (e) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * stage.width) / rect.width,
      y: ((e.clientY - rect.top) * stage.height) / rect.height,
    };
  };

  const playerCanAct = () => {
    const s = getState();
    return !s.winner && s.turn === s.playerSide && s.phase === 'orders' && !getUi().modalOpen;
  };

  const grabbable = (h) => {
    const u = h && unitAt(getState(), h.c, h.r);
    return !!(
      u &&
      u.side === getState().playerSide &&
      !u.acted &&
      getUi().orderable.some((z) => z.id === u.id)
    );
  };

  function showTip(e, hex) {
    const ui = getUi();
    if (!hex) {
      hud.hideTip();
      ui.hover = null;
      return;
    }
    if (!ui.hover || ui.hover.c !== hex.c || ui.hover.r !== hex.r) {
      ui.hover = hex;
      hud.setTip(tipHTML(getState(), ui, hex));
      stage.requestDraw();
    }
    hud.moveTip(e.clientX, e.clientY);
  }

  canvas.addEventListener('pointerleave', () => {
    hud.hideTip();
    getUi().hover = null;
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (!playerCanAct()) return;
    const { x, y } = toCanvas(e);
    const hex = pickHex(x, y);
    if (!grabbable(hex)) return;
    const ui = getUi();
    if (ui.takeGround) return; // choix de prise de terrain en cours : clic seulement
    const u = unitAt(getState(), hex.c, hex.r);
    if (ui.breakthrough && ui.breakthrough.id !== u.id) return; // percée : seul le blindé agit

    if (!ui.selected || ui.selected.id !== u.id) actions.selectUnit(u);
    canvas.setPointerCapture(e.pointerId);
    dragMoved = false;
    const p = hexCenter(u.c, u.r);
    ui.drag = { unit: u, x: p.x, y: p.y, hover: null, hoverKind: null };
    canvas.style.cursor = 'grabbing';
    stage.requestDraw();
  });

  canvas.addEventListener('pointermove', (e) => {
    const ui = getUi();
    const { x, y } = toCanvas(e);
    showTip(e, pickHex(x, y));
    if (!ui.drag) {
      if (playerCanAct()) canvas.style.cursor = grabbable(pickHex(x, y)) ? 'grab' : 'pointer';
      return;
    }
    if (Math.hypot(x - ui.drag.x, y - ui.drag.y) > 4) dragMoved = true;
    ui.drag.x = x;
    ui.drag.y = y;

    const h = pickHex(x, y);
    ui.drag.hover = null;
    ui.drag.hoverKind = null;
    if (h) {
      if (ui.targets.some((t) => t.unit.c === h.c && t.unit.r === h.r)) {
        ui.drag.hover = h;
        ui.drag.hoverKind = 'attack';
      } else if (ui.moves.some((m) => m.c === h.c && m.r === h.r)) {
        ui.drag.hover = h;
        ui.drag.hoverKind = 'move';
      }
    }
    stage.requestDraw();
  });

  function endDrag(e) {
    const ui = getUi();
    if (!ui.drag) return;
    const u = ui.drag.unit;
    const hover = ui.drag.hover;
    const kind = ui.drag.hoverKind;
    ui.drag = null;
    canvas.style.cursor = 'pointer';
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // capture déjà relâchée
    }

    if (!dragMoved) {
      stage.requestDraw(); // simple clic : la sélection reste
      return;
    }
    if (kind === 'attack') {
      actions.attackTarget(
        u,
        ui.targets.find((t) => t.unit.c === hover.c && t.unit.r === hover.r),
      );
    } else if (kind === 'move') {
      actions.moveTo(u, hover);
    } else {
      actions.refresh(); // lâché dans le vide : le pion revient
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('click', (e) => {
    if (dragMoved) {
      dragMoved = false; // le glisser a déjà tranché
      return;
    }
    if (!playerCanAct()) return;
    const ui = getUi();
    const { x, y } = toCanvas(e);
    const hex = pickHex(x, y);

    if (ui.action) {
      actions.actionClick(hex);
      return;
    }
    if (ui.takeGround) {
      const tg = ui.takeGround.hex;
      if (hex && hex.c === tg.c && hex.r === tg.r) actions.confirmTakeGround();
      else actions.declineTakeGround();
      return;
    }
    if (ui.breakthrough) {
      const tgt = hex && ui.targets.find((t) => t.unit.c === hex.c && t.unit.r === hex.r);
      if (tgt) actions.attackTarget(ui.breakthrough, tgt);
      else actions.finishBreakthrough();
      return;
    }
    if (!hex) return;

    const tgt = ui.targets.find((t) => t.unit.c === hex.c && t.unit.r === hex.r);
    if (ui.selected && tgt) {
      actions.attackTarget(ui.selected, tgt);
      return;
    }
    const mv = ui.moves.find((m) => m.c === hex.c && m.r === hex.r);
    if (ui.selected && mv) {
      actions.moveTo(ui.selected, hex);
      return;
    }
    if (grabbable(hex)) {
      actions.selectUnit(unitAt(getState(), hex.c, hex.r));
      return;
    }
    actions.clearSelection();
  });
}
