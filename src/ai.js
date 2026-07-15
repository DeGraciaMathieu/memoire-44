// IA du camp adverse (state.aiSide) — ne parle qu'aux règles. Gloutonne, évaluation 1 coup.

import { TERRAIN, UNITS } from './config.js';
import { hexDistance, key, neighbors } from './hex.js';
import { cardById } from './cards.js';
import { sectorsOf } from './sectors.js';
import { barrageTargets, medicTargets, orderableUnits, sectorQuota, validAirTarget } from './game.js';
import { reachable, unitAt } from './movement.js';
import { defenseReduction, diceFor, targetsFor } from './combat.js';

const P_HIT = { inf: 3 / 6, arm: 2 / 6, art: 3 / 6 }; // proba par dé selon la cible

// Objectifs à prendre : toute tuile objectif que l'IA ne tient pas encore.
function openObjectives(state) {
  return Object.keys(state.objectives ?? {})
    .map((k) => {
      const [c, r] = k.split(',').map(Number);
      return { c, r };
    })
    .filter((h) => unitAt(state, h.c, h.r)?.side !== state.aiSide);
}

// Valeur d'une carte en main : unités activables + celles qui ont déjà une
// cible ; les cartes actions sont évaluées par leur meilleure frappe.
function cardScore(state, id) {
  const cd = cardById(id);
  if (cd.action === 'barrage') {
    let s = 0;
    for (const e of barrageTargets(state, state.aiSide)) {
      const exp = cd.dice * P_HIT[e.type];
      s = Math.max(s, exp * 2 + (exp >= e.figs ? 8 : 0));
    }
    return s;
  }
  if (cd.action === 'air') {
    const strike = aiAirHexes(state);
    return strike ? strike.units * 3 : 0;
  }
  if (cd.action === 'medics') {
    const worst = aiMedicsTarget(state);
    return worst ? (UNITS[worst.type].figs - worst.figs) * 2 : -1;
  }
  if (cd.action === 'contre') {
    const last = state.lastCard[state.playerSide] && cardById(state.lastCard[state.playerSide]);
    return cardScore(state, last && last.action !== 'contre' ? last.id : 'recon-force');
  }
  const us = orderableUnits(state, state.aiSide, id);
  const cap = Object.values(sectorQuota(state, state.aiSide, cd)).reduce((a, b) => a + b, 0);
  let s = Math.min(us.length, cap) * 2;
  for (const u of us.slice(0, cap)) {
    if (targetsFor(state, u, 0).length) s += 3;
  }
  return s;
}

// Bonus de pioche d'une Reconnaissance : garder la carte au meilleur score.
export function aiReconKeep(state) {
  const { ids } = state.reconChoice;
  return cardScore(state, ids[1]) > cardScore(state, ids[0]) ? ids[1] : ids[0];
}

export function aiPickCard(state) {
  const hand = state.hands[state.aiSide];
  let best = hand[0];
  let bestScore = -Infinity;
  for (const id of hand) {
    const s = cardScore(state, id);
    if (s > bestScore) {
      bestScore = s;
      best = id;
    }
  }
  return best;
}

// Cible du barrage : maximiser les touches attendues, bonus si les 4 dés
// peuvent détruire l'unité (médaille).
export function aiBarrageTarget(state) {
  let best = null;
  let bestScore = -Infinity;
  for (const e of barrageTargets(state, state.aiSide)) {
    const exp = cardById('barrage').dice * P_HIT[e.type];
    const s = exp + (exp >= e.figs ? 2 : 0);
    if (s > bestScore) {
      bestScore = s;
      best = e;
    }
  }
  return best;
}

// Attaque aérienne : fait grossir une chaîne d'hexs autour de chaque unité
// alliée, en absorbant d'abord les hexs occupés par l'ennemi, et garde la
// chaîne qui couvre le plus d'unités. Renvoie { hexes, units } ou null.
export function aiAirHexes(state) {
  const card = cardById('air');
  const enemies = state.units.filter((u) => u.side === state.playerSide);
  let best = null;
  for (const seed of enemies) {
    const hexes = [{ c: seed.c, r: seed.r }];
    while (hexes.length < card.hexes) {
      const options = hexes
        .flatMap((h) => neighbors(h.c, h.r))
        .filter((h) => validAirTarget(hexes, h));
      if (!options.length) break;
      const withEnemy = options.find((h) => unitAt(state, h.c, h.r)?.side === state.playerSide);
      hexes.push(withEnemy ?? options[0]);
    }
    const units = hexes.filter((h) => unitAt(state, h.c, h.r)?.side === state.playerSide).length;
    if (!best || units > best.units) best = { hexes, units };
  }
  return best;
}

// Soigner l'unité la plus amochée ; à pertes égales, l'infanterie
// (2 faces sur 6, la meilleure espérance de réparation).
export function aiMedicsTarget(state) {
  const hurt = medicTargets(state, state.aiSide);
  if (!hurt.length) return null;
  return hurt.sort(
    (a, b) =>
      UNITS[b.type].figs - b.figs - (UNITS[a.type].figs - a.figs) ||
      (b.type === 'inf') - (a.type === 'inf'),
  )[0];
}

export function aiChooseMoves(state, cardId) {
  const cd = cardById(cardId);
  const pool = orderableUnits(state, state.aiSide, cardId);
  const open = openObjectives(state);
  // priorité : unités qui peuvent frapper ou prendre un objectif > unités proches de l'ennemi
  const scored = pool
    .map((u) => {
      const near = Math.min(
        ...state.units.filter((e) => e.side === state.playerSide).map((e) => hexDistance(u, e)),
      );
      let s = (targetsFor(state, u, 0).length ? 10 : 0) - near;
      if (open.some((o) => hexDistance(u, o) <= UNITS[u.type].moveNoFire)) s += 5;
      return { u, s };
    })
    .sort((a, b) => b.s - a.s);

  // les meilleures unités d'abord, dans la limite du quota de leur secteur
  const quota = sectorQuota(state, state.aiSide, cd);
  const picked = [];
  for (const x of scored) {
    const secs = sectorsOf(x.u.c, x.u.r).filter((s) => (quota[s] || 0) > 0);
    const s = secs.sort((a, b) => quota[b] - quota[a])[0];
    if (!s) continue;
    quota[s]--;
    picked.push(x);
  }
  return picked.map((x) => aiPlanUnit(state, x.u));
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
  const enemies = state.units.filter((e) => e.side === state.playerSide);
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
