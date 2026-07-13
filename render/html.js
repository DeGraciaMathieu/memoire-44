// Fragments HTML PURS (chaînes) — testables sans navigateur, aucun accès au DOM.

import { OBSTACLES, TERRAIN, UNITS } from '../src/config.js';
import { key } from '../src/hex.js';
import { SECTORS, sectorsOf } from '../src/sectors.js';
import { obstacleAt, unitAt } from '../src/movement.js';
import { reductionOf } from '../src/combat.js';

export const SYM = { inf: '✦', arm: '▮', grenade: '✸', star: '★', flag: '⚑' };
export const UNIT_GLYPH = { inf: '✦', arm: '▮', art: '✜' };
export const SIDE_FR = { allies: 'Alliés', axis: 'Axe' };

// Libellé des dés retirés à l'assaillant pour un couvert (terrain ou obstacle).
function reductionLabel(dice) {
  const red = dice.def;
  const redA = dice.defArmor != null ? dice.defArmor : red;
  const redArt = dice.defArt != null ? dice.defArt : red;
  const extras = [];
  if (redA !== red) extras.push('−' + redA + ' blindé');
  if (redArt !== red) extras.push(redArt ? '−' + redArt + ' artillerie' : 'artillerie sans malus');
  return `${red ? '−' + red : '—'}${extras.length ? ' (' + extras.join(', ') + ')' : ''}`;
}

const RANGE_LBL = { inf: '1 / 2 / 3', arm: '1 à 3', art: '1 à 6' };
const MOVE_LBL = {
  inf: '1 hex + tir, ou 2 sans tir',
  arm: '3 hex, tir conservé',
  art: '1 hex sans tir, ou tir sur place',
};

export function cardHTML(card) {
  return `<div class="n">${card.n}<small>unité${card.n > 1 ? 's' : ''}</small></div>
    <div class="cname">${card.name}</div>
    <div class="secs">${SECTORS.map(
      (s) => `<i class="${card.sector === '*' || card.sector === s ? 'on' : ''}"></i>`,
    ).join('')}</div>
    <div class="ctag">${card.sector === '*' ? 'tout le front' : card.sector}</div>`;
}

export function forcePanelHTML(unit, terrainKey, role, figsShown, lost) {
  const t = TERRAIN[terrainKey];
  const pips = Array.from(
    { length: figsShown },
    (_, i) => `<i class="pip${i >= figsShown - lost ? ' gone' : ''}"></i>`,
  ).join('');
  return `
    <div class="who">${role}</div>
    <div class="name"><span class="chip ${unit.side}">${UNIT_GLYPH[unit.type]}</span>
      ${SIDE_FR[unit.side]} · ${UNITS[unit.type].label}</div>
    <div class="terr">${t.label} · ${figsShown} figurine${figsShown > 1 ? 's' : ''}</div>
    <div class="pips">${pips}</div>`;
}

// Détail du calcul de dés d'un engagement (outcome produit par attackUnit).
// Le couvert affiché est celui qui fournit la réduction retenue (non cumulée) :
// l'obstacle s'il protège au moins autant que le terrain.
export function calcHTML(outcome) {
  const { attacker, baseDice, range, reduction, dice, defender, terrainKey, obstacleKey } = outcome;
  const t = TERRAIN[terrainKey];
  const o = obstacleKey ? OBSTACLES[obstacleKey] : null;
  const coverLabel =
    o && reductionOf(o.dice, attacker.type) >= reductionOf(t.dice, attacker.type)
      ? o.label
      : t.label;
  return (
    `<b>${baseDice}</b> dés à portée ${range}` +
    (reduction ? ` − <b>${reduction}</b> (${coverLabel.toLowerCase()})` : '') +
    ` = <b>${dice} dé${dice > 1 ? 's' : ''}</b> · touche sur ${UNITS[defender.type].hitOn
      .map((f) => SYM[f])
      .join(' ')}`
  );
}

// Infobulle de plateau : terrain + unité sous le curseur.
export function tipHTML(state, ui, hex) {
  const tkey = state.terrain[key(hex.c, hex.r)];
  const t = TERRAIN[tkey];
  const secs = sectorsOf(hex.c, hex.r);
  const u = unitAt(state, hex.c, hex.r);

  let h = `<div class="thead ${tkey}">${t.label}<em>${secs.join(' + ')}</em></div>
    <div class="tbody">
      <div class="row">Dés retirés à l'assaillant<b>${reductionLabel(t.dice)}</b></div>
      <div class="row">Mouvement<b>${
        t.enterAdjacentOnly ? 'entrée adjacente, stoppe net' : t.stops ? 'stoppe net' : 'libre'
      }</b></div>${
        t.exitAdjacentOnly ? `<div class="row">Sortie<b>1 hex puis arrêt</b></div>` : ''
      }${t.noFightOnEnter ? `<div class="row">Combat<b>pas de tir le tour d'entrée</b></div>` : ''}
      <div class="row">Ligne de mire<b>${
        t.blocksSight ? 'bloquée' : t.elevated ? 'bloquée en contrebas' : 'libre'
      }</b></div>
    </div>`;

  const oKey = obstacleAt(state, hex.c, hex.r);
  if (oKey) {
    const o = OBSTACLES[oKey];
    h += `<div class="unit">
      <div class="uname">${o.label}</div>`;
    if (o.dice.def || o.dice.defArmor || o.dice.defArt)
      h += `<div class="row">Protection<b>${reductionLabel(o.dice)}, non cumulée</b></div>`;
    if (o.infantryOnly) h += `<div class="row">Accès<b>infanterie seulement</b></div>`;
    if (o.fixesArtillery) h += `<div class="row">Artillerie<b>retranchée, ne sort plus</b></div>`;
    if (o.ignoreFirstFlag)
      h += `<div class="row">Drapeaux<b>le premier du jet est ignoré</b></div>`;
    if (o.removedOnExit) h += `<div class="row">Abandon<b>retirés dès que l'unité sort</b></div>`;
    if (o.blocksSight) h += `<div class="row">Ligne de mire<b>bloquée</b></div>`;
    h += `</div>`;
  }

  if (u) {
    const U = UNITS[u.type];
    h += `<div class="unit">
      <div class="uname"><span class="chip ${u.side}">${UNIT_GLYPH[u.type]}</span>
        ${SIDE_FR[u.side]} · ${U.label}</div>
      <div class="row">Figurines<b>${u.figs} / ${U.figs}</b></div>
      <div class="row">Déplacement<b>${MOVE_LBL[u.type]}</b></div>
      <div class="row">Portée<b>${RANGE_LBL[u.type]}</b></div>
      <div class="row">Dés<b>${U.dice.join(' / ')}</b></div>
      <div class="row">Touchée sur<b>${U.hitOn.map((f) => SYM[f]).join(' ')}</b></div>`;

    // contexte : que se passe-t-il si je vise / si je vais là ?
    const tgt = ui.targets.find((x) => x.unit.id === u.id);
    if (tgt)
      h += `<div class="row fire">Tir possible<b>${tgt.dice} dé${tgt.dice > 1 ? 's' : ''} à ${tgt.range}</b></div>`;
    else if (u.acted && u.side === 'allies') h += `<div class="row">État<b>a déjà agi</b></div>`;
    else if (ui.orderable.some((z) => z.id === u.id) && state.phase === 'orders')
      h += `<div class="row go">Activable<b>oui</b></div>`;
    h += `</div>`;
  } else {
    const mv = ui.moves.find((m) => m.c === hex.c && m.r === hex.r);
    if (mv)
      h += `<div class="unit"><div class="row go">Déplacement<b>${mv.cost} hex</b></div></div>`;
  }
  return h;
}
