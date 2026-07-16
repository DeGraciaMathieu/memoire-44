// Règles transverses des cartes tactiques : éligibilité des unités, repli sur
// « 1 unité au choix », et modificateurs de mouvement/combat portés par la
// carte en cours. Module partagé par game.js et combat.js (aucun cycle).

import { UNITS } from './config.js';
import { hexDistance } from './hex.js';
import { inSector } from './sectors.js';
import { cardById } from './cards.js';
import { obstacleAt } from './movement.js';

const adjacentToEnemy = (state, u) =>
  state.units.some((e) => e.side !== u.side && hexDistance(u, e) === 1);

// Unités éligibles aux ordres d'une carte (commandement ou tactique), avant
// repli éventuel. `sector` surcharge le secteur (évaluation IA d'une carte à
// choix de secteur) ; défaut : celui de la carte, ou le secteur choisi en jeu.
export function eligibleUnits(
  state,
  side,
  cd,
  sector = cd.sector === 'pick' ? state.pickedSector : cd.sector,
) {
  let pool = state.units.filter((u) => u.side === side);
  if (sector) pool = pool.filter((u) => inSector(u, sector));
  if (cd.types) pool = pool.filter((u) => cd.types.includes(u.type));
  if (cd.adjacent != null) pool = pool.filter((u) => adjacentToEnemy(state, u) === cd.adjacent);
  if (cd.digIn) pool = pool.filter((u) => obstacleAt(state, u.c, u.r) == null);
  return pool;
}

// Repli d'une carte tactique : aucune unité éligible → 1 unité au choix, en
// activation standard (les effets spéciaux de la carte ne s'appliquent pas).
export function cardFallback(state, side, cd) {
  return !!cd.fallback && !eligibleUnits(state, side, cd).length;
}

// Carte tactique dont les effets spéciaux s'appliquent à cette unité : la
// carte en cours si elle est tactique, jouée par le camp de l'unité (celui
// dont c'est le tour) et hors repli, sinon null.
export function activeTactic(state, unit) {
  const cd = state.playedCard && cardById(state.playedCard);
  if (!cd?.tactic || state.turn !== unit.side) return null;
  return cardFallback(state, unit.side, cd) ? null : cd;
}

// Distance de déplacement autorisée pour cette unité par la carte en cours.
export function moveRange(state, unit) {
  const cd = activeTactic(state, unit);
  if (cd?.noMove) return 0;
  return cd?.move?.noFire ?? UNITS[unit.type].moveNoFire;
}

// Coût de déplacement maximal permettant encore de combattre : surcharge de
// la carte, sinon la règle du type (artillerie sur place, infanterie 1 hex,
// blindé sans restriction).
export function fightCap(state, unit) {
  const cd = activeTactic(state, unit);
  if (cd?.move?.fight != null) return cd.move.fight;
  return unit.type === 'art' ? 0 : unit.type === 'inf' ? 1 : Infinity;
}

// Dé supplémentaire accordé par la carte en cours ('all' : tout combat,
// 'close' : au contact seulement).
export function bonusDice(state, unit, range) {
  const cd = activeTactic(state, unit);
  if (!cd?.bonus) return 0;
  return cd.bonus === 'all' || range === 1 ? 1 : 0;
}

// Nombre de combats autorisés par activation (Bombardement : 2).
export function attacksAllowed(state, unit) {
  return activeTactic(state, unit)?.attacks ?? 1;
}
