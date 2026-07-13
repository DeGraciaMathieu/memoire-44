// IA de l'Axe — ne parle qu'aux règles. Gloutonne, évaluation 1 coup.

import { TERRAIN, UNITS } from './config.js';
import { hexDistance, key } from './hex.js';
import { cardById } from './cards.js';
import { orderableUnits } from './game.js';
import { reachable, unitAt } from './movement.js';
import { defenseReduction, diceFor, targetsFor } from './combat.js';

const P_HIT = { inf: 3 / 6, arm: 2 / 6, art: 3 / 6 }; // proba par dé selon la cible

// Objectifs à prendre : toute tuile objectif que l'Axe ne tient pas encore.
function openObjectives(state) {
  return Object.keys(state.objectives ?? {})
    .map((k) => {
      const [c, r] = k.split(',').map(Number);
      return { c, r };
    })
    .filter((h) => unitAt(state, h.c, h.r)?.side !== 'axis');
}

export function aiPickCard(state) {
  const hand = state.hands.axis;
  let best = hand[0];
  let bestScore = -1;
  for (const id of hand) {
    const cd = cardById(id);
    const us = orderableUnits(state, 'axis', id);
    const n = Math.min(us.length, cd.n);
    // valeur = unités activables + celles qui ont déjà une cible
    let s = n * 2;
    for (const u of us.slice(0, cd.n)) {
      if (targetsFor(state, u, 0).length) s += 3;
    }
    if (s > bestScore) {
      bestScore = s;
      best = id;
    }
  }
  return best;
}

export function aiChooseMoves(state, cardId) {
  const cd = cardById(cardId);
  const pool = orderableUnits(state, 'axis', cardId);
  const open = openObjectives(state);
  // priorité : unités qui peuvent frapper ou prendre un objectif > unités proches de l'ennemi
  const scored = pool
    .map((u) => {
      const near = Math.min(
        ...state.units.filter((e) => e.side === 'allies').map((e) => hexDistance(u, e)),
      );
      let s = (targetsFor(state, u, 0).length ? 10 : 0) - near;
      if (open.some((o) => hexDistance(u, o) <= UNITS[u.type].moveNoFire)) s += 5;
      return { u, s };
    })
    .sort((a, b) => b.s - a.s);

  return scored.slice(0, cd.n).map((x) => aiPlanUnit(state, x.u));
}

// Prise de terrain : ne jamais lâcher un objectif tenu, toujours avancer sur
// un objectif ; sinon le blindé avance toujours (percée possible) et
// l'infanterie n'abandonne jamais une couverture meilleure que l'hex pris.
export function aiTakesGround(state, unit, hex) {
  const objective = (h) => !!state.objectives?.[key(h.c, h.r)];
  if (objective(unit)) return objective(hex);
  if (objective(hex)) return true;
  if (unit.type === 'arm') return true;
  return defenseReduction(state, 'inf', hex) >= defenseReduction(state, 'inf', unit);
}

// Meilleure cible pour une percée de blindés, ou null si aucun tir possible.
export function aiBreakthroughTarget(state, unit) {
  let best = null;
  let bestScore = 0;
  for (const t of targetsFor(state, unit, state.moved[unit.id] || 0)) {
    const exp = t.dice * P_HIT[t.unit.type];
    const s = exp + (exp >= t.unit.figs ? 2 : 0);
    if (s > bestScore) {
      bestScore = s;
      best = t.unit;
    }
  }
  return best;
}

function aiPlanUnit(state, unit) {
  const enemies = state.units.filter((e) => e.side === 'allies');
  const open = openObjectives(state);
  const dests = [
    { c: unit.c, r: unit.r, cost: 0 },
    ...reachable(state, unit, UNITS[unit.type].moveNoFire),
  ];
  let best = null;

  for (const d of dests) {
    const ghost = { ...unit, c: d.c, r: d.r };
    const destT = TERRAIN[state.terrain[key(d.c, d.r)]];
    const canFire =
      !(unit.type === 'art' && d.cost > 0) &&
      !(unit.type === 'inf' && d.cost > 1) &&
      !(unit.type === 'arm' && d.cost > UNITS.arm.move) &&
      !destT.noFight &&
      !(destT.noFightOnEnter && d.cost > 0);
    if (unit.type === 'inf' && d.cost > UNITS.inf.moveNoFire) continue;

    let score = 0;
    let target = null;
    if (canFire) {
      // combat rapproché obligatoire : au contact, seuls les adjacents sont ciblables
      const contact = enemies.some((e) => hexDistance(ghost, e) === 1);
      for (const e of enemies) {
        if (contact && hexDistance(ghost, e) > 1) continue;
        const dd = diceFor(state, ghost, e);
        if (!dd) continue;
        const exp = dd * P_HIT[e.type];
        // bonus si le tir peut achever l'unité
        const s = exp * 10 + (exp >= e.figs ? 12 : 0);
        if (s > score) {
          score = s;
          target = e;
        }
      }
    }
    // prendre ou tenir un objectif vaut une médaille ; sinon s'en rapprocher
    if (state.objectives?.[key(d.c, d.r)]) score += 12;
    else if (open.length) {
      const dObj = Math.min(...open.map((o) => hexDistance(ghost, o)));
      score += (10 - dObj) * 0.5;
    }
    // avancer vers l'ennemi le plus proche, se couvrir en terrain
    const near = Math.min(...enemies.map((e) => hexDistance(ghost, e)));
    score += (10 - near) * 0.8;
    score += (destT.dice.def || 0) * 1.5;
    if (unit.type === 'art') score -= near < 3 ? 6 : 0; // l'artillerie reste en retrait

    if (!best || score > best.score) best = { score, dest: d, target };
  }
  return { unit, ...best };
}
