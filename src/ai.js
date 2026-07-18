// IA du camp adverse (state.aiSide) — ne parle qu'aux règles. Gloutonne, évaluation 1 coup.

import { FACES, TERRAIN, UNITS } from './config.js';
import { hexDistance, key } from './hex.js';
import { cardById, mirrorId } from './cards.js';
import { SECTORS, sectorsOf } from './sectors.js';
import {
  barrageTargets,
  medicTargets,
  orderableUnits,
  sectorQuota,
  validAirTarget,
} from './game.js';
import { eligibleUnits, moveRange } from './tactics.js';
import { reachable, unitAt } from './movement.js';
import { canFight, defenseReduction, diceFor, objectiveScoresFor, targetsFor } from './combat.js';

// Proba qu'un dé inflige une perte, par type de cible — dérivée des règles :
// faces hitOn parmi FACES, atténuée par la relance (rerollHits, Tigre).
const pFaces = (list) => FACES.filter((f) => list.includes(f)).length / FACES.length;
const P_HIT = Object.fromEntries(
  Object.entries(UNITS).map(([type, u]) => [
    type,
    pFaces(u.hitOn) * (u.rerollHits ? pFaces(u.rerollHits) : 1),
  ]),
);

function objectiveHexes(state, keep) {
  return Object.entries(state.objectives ?? {})
    .filter(([, type]) => keep(type))
    .map(([k]) => {
      const [c, r] = k.split(',').map(Number);
      return { c, r };
    });
}

// Objectifs à prendre : toute tuile qui rapporte à l'IA et qu'elle ne tient pas encore.
function openObjectives(state) {
  return objectiveHexes(state, (type) => objectiveScoresFor(type, state.aiSide)).filter(
    (h) => unitAt(state, h.c, h.r)?.side !== state.aiSide,
  );
}

// Objectifs à protéger : tuiles qui ne rapportent qu'au joueur — l'IA n'y marque
// jamais, elle cherche seulement à en interdire l'accès.
function guardObjectives(state) {
  return objectiveHexes(state, (type) => !objectiveScoresFor(type, state.aiSide));
}

// Secteur choisi pour une carte à choix de secteur : le plus fourni en
// unités éligibles.
export function aiPickSector(state, cd) {
  let best = SECTORS[0];
  let bestCount = -1;
  for (const s of SECTORS) {
    const count = eligibleUnits(state, state.aiSide, cd, s).length;
    if (count > bestCount) {
      bestCount = count;
      best = s;
    }
  }
  return best;
}

// Unités éligibles d'une carte tactique, sur son meilleur secteur pour une
// carte à choix de secteur.
function aiEligible(state, cd) {
  if (cd.sector !== 'pick') return eligibleUnits(state, state.aiSide, cd);
  return eligibleUnits(state, state.aiSide, cd, aiPickSector(state, cd));
}

// Valeur d'une carte en main : unités activables + celles qui ont déjà une
// cible ; les cartes à résolution dédiée sont évaluées par leur meilleure frappe.
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
    return cardScore(state, last && last.action !== 'contre' ? mirrorId(last.id) : 'recon-force');
  }
  if (cd.tactic) {
    const pool = aiEligible(state, cd);
    if (!pool.length) return cd.fallback ? 2 : 0; // repli : 1 unité au choix, ou carte perdue
    const cap = cd.n === 'all' ? pool.length : Math.min(cd.n, pool.length);
    let s = cap * 2;
    for (const u of pool.slice(0, cap)) {
      if (targetsFor(state, u, 0).length) s += 3;
    }
    return s;
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

// Attaque aérienne : vise le plus grand groupe d'unités du joueur adjacentes
// entre elles (au plus 4), en grossissant une chaîne depuis chaque unité.
// Renvoie { hexes, units } ou null.
export function aiAirHexes(state) {
  const enemies = state.units.filter((u) => u.side === state.playerSide);
  let best = null;
  for (const seed of enemies) {
    const hexes = [{ c: seed.c, r: seed.r }];
    let next;
    while (
      (next = enemies.find((e) => validAirTarget(state, state.aiSide, hexes, { c: e.c, r: e.r })))
    ) {
      hexes.push({ c: next.c, r: next.r });
    }
    if (!best || hexes.length > best.units) best = { hexes, units: hexes.length };
  }
  return best;
}

// Soigner l'unité la plus amochée ; à pertes égales, l'infanterie
// (3 faces sur 6, la meilleure espérance de réparation).
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
  const pool = orderableUnits(state, state.aiSide, cardId).filter((u) => !u.acted);
  const open = openObjectives(state);
  // priorité : unités qui peuvent frapper ou prendre un objectif > unités proches de l'ennemi
  const scored = pool
    .map((u) => {
      const near = Math.min(
        ...state.units.filter((e) => e.side === state.playerSide).map((e) => hexDistance(u, e)),
      );
      let s = (targetsFor(state, u, 0).length ? 10 : 0) - near;
      if (open.some((o) => hexDistance(u, o) <= moveRange(state, u))) s += 5;
      return { u, s };
    })
    .sort((a, b) => b.s - a.s);

  // cartes tactiques : quota global — les meilleures unités dans la limite
  // des ordres ; cartes de commandement : quota par secteur
  let picked;
  if (cd.tactic || cd.action) {
    picked = scored.slice(0, state.ordersLeft);
  } else {
    const quota = sectorQuota(state, state.aiSide, cd);
    picked = [];
    for (const x of scored) {
      const secs = sectorsOf(x.u.c, x.u.r).filter((s) => (quota[s] || 0) > 0);
      const s = secs.sort((a, b) => quota[b] - quota[a])[0];
      if (!s) continue;
      quota[s]--;
      picked.push(x);
    }
  }
  return picked.map((x) => aiPlanUnit(state, x.u));
}

// Prise de terrain : ne jamais lâcher un objectif tenu, toujours avancer sur
// un objectif — même réservé au joueur : l'occuper en interdit l'accès —
// sinon le blindé avance toujours (percée possible) et
// l'infanterie n'abandonne jamais une couverture meilleure que l'hex pris.
export function aiTakesGround(state, unit, hex) {
  const objective = (h) => !!state.objectives?.[key(h.c, h.r)];
  if (objective(unit)) return objective(hex);
  if (objective(hex)) return true;
  if (UNITS[unit.type].armored) return true;
  return defenseReduction(state, 'inf', hex) >= defenseReduction(state, 'inf', unit);
}

// Meilleure cible pour un combat supplémentaire (percée de blindés, second
// tir du Bombardement), ou null si aucun tir possible.
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
  const guard = guardObjectives(state);
  const dests = [
    { c: unit.c, r: unit.r, cost: 0 },
    ...reachable(state, unit, moveRange(state, unit)),
  ];
  let best = null;

  for (const d of dests) {
    const ghost = { ...unit, c: d.c, r: d.r };
    const destT = TERRAIN[state.terrain[key(d.c, d.r)]];
    const canFire = canFight(state, ghost, d.cost);

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
        const holds = state.objectives?.[key(e.c, e.r)];
        // bonus si le tir peut achever l'unité, ou déloger l'occupant d'un
        // objectif qui fait marquer le joueur
        const s =
          exp * 10 +
          (exp >= e.figs ? 12 : 0) +
          (holds && objectiveScoresFor(holds, state.playerSide) ? 10 : 0);
        if (s > score) {
          score = s;
          target = e;
        }
      }
    }
    // prendre ou tenir un objectif qui rapporte à l'IA vaut une médaille ;
    // sinon s'en rapprocher
    const objType = state.objectives?.[key(d.c, d.r)];
    if (objType && objectiveScoresFor(objType, state.aiSide)) score += 12;
    else if (open.length) {
      const dObj = Math.min(...open.map((o) => hexDistance(ghost, o)));
      score += (10 - dObj) * 0.5;
    }
    // protéger un objectif réservé au joueur : rester à proximité pour en
    // interdire l'accès (l'occuper n'est qu'un blocage, pas une médaille)
    if (guard.length) {
      const dGuard = Math.min(...guard.map((o) => hexDistance(ghost, o)));
      score += (10 - dGuard) * 0.4;
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
