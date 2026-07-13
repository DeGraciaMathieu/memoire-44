// Factory de l'état + séquence principale du jeu.
// Toutes les fonctions prennent l'état en argument et ne touchent jamais au
// rendu : les effets visuels sont notifiés via state.bus.

import { HAND_SIZE, OBSTACLES, TERRAIN, UNITS } from './config.js';
import { createBus } from './events.js';
import { hexDistance, key } from './hex.js';
import { inSector } from './sectors.js';
import { buildDeck, cardById } from './cards.js';
import { scenario } from './scenario.js';
import { setupFromMap } from './map.js';
import { dropObstacleOnExit, obstacleAt, reachable, unitAt } from './movement.js';
import { defenseReduction, diceFor, resolveCombat, rollDice } from './combat.js';

export function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// `map` : carte validée par parseMap (src/map.js) ; défaut = scénario « bocage ».
export function createGame({ rng = Math.random, map = null } = {}) {
  const { terrain, units, obstacles } = map ? setupFromMap(map) : scenario();
  const deck = shuffle(buildDeck(), rng);
  return {
    terrain,
    obstacles,
    units,
    decks: { allies: deck.slice(0, 10), axis: deck.slice(10) },
    hands: { allies: [], axis: [] },
    medals: { allies: 0, axis: 0 },
    turn: 'allies',
    phase: 'card', // card | orders | done
    playedCard: null,
    ordersLeft: 0,
    moved: {}, // id d'unité -> coût du déplacement pendant l'activation en cours
    attacks: {}, // id d'unité -> nombre d'attaques pendant l'activation en cours
    winner: null,
    bus: createBus(),
    rng,
  };
}

export function orderableUnits(state, side, cardId) {
  const cd = cardById(cardId);
  return state.units.filter((u) => u.side === side && inSector(u, cd.sector));
}

export function drawCards(state, side) {
  let count = 0;
  while (state.hands[side].length < HAND_SIZE) {
    if (!state.decks[side].length) state.decks[side] = shuffle(buildDeck(), state.rng);
    state.hands[side].push(state.decks[side].pop());
    count++;
  }
  if (count) state.bus.emit('cardsDrawn', { side, count });
  return count;
}

export function playCard(state, side, cardId) {
  const cd = cardById(cardId);
  state.hands[side].splice(state.hands[side].indexOf(cardId), 1);
  state.playedCard = cardId;
  state.phase = 'orders';
  state.moved = {};
  state.attacks = {};
  state.ordersLeft = Math.min(cd.n, orderableUnits(state, side, cardId).length);
  state.units.forEach((u) => (u.acted = false));
  state.bus.emit('cardPlayed', { side, card: cd, ordersLeft: state.ordersLeft });
  return cd;
}

// Déplace l'unité si l'hex est réellement atteignable ; renvoie le coût, ou
// null si le déplacement est illégal.
export function moveUnit(state, unit, hex) {
  const step = reachable(state, unit, UNITS[unit.type].moveNoFire).find(
    (m) => m.c === hex.c && m.r === hex.r,
  );
  if (!step) return null;
  const from = { c: unit.c, r: unit.r };
  unit.c = hex.c;
  unit.r = hex.r;
  state.moved[unit.id] = step.cost;
  state.bus.emit('unitMoved', { unit, from, cost: step.cost });
  dropObstacleOnExit(state, from.c, from.r);
  return step.cost;
}

// Tire les dés, résout le combat et renvoie tout ce que le rendu doit
// mettre en scène (les valeurs sont capturées AVANT résolution).
export function attackUnit(state, attacker, defender) {
  const range = hexDistance(attacker, defender);
  const outcome = {
    attacker,
    defender,
    range,
    baseDice: UNITS[attacker.type].dice[range - 1],
    reduction: defenseReduction(state, attacker.type, defender),
    dice: diceFor(state, attacker, defender),
    figsBefore: defender.figs,
    defenderHex: { c: defender.c, r: defender.r },
    terrainKey: state.terrain[key(defender.c, defender.r)],
    obstacleKey: obstacleAt(state, defender.c, defender.r) ?? null,
  };
  state.attacks[attacker.id] = (state.attacks[attacker.id] || 0) + 1;
  const faces = rollDice(outcome.dice, state.rng);
  outcome.report = resolveCombat(state, attacker, defender, faces);
  state.bus.emit('combatResolved', outcome);
  return outcome;
}

export function finishUnit(state, unit) {
  unit.acted = true;
  state.ordersLeft--;
}

// Prise de terrain : après un combat rapproché gagné (défenseur détruit ou en
// retraite), infanterie et blindés peuvent avancer sur l'hex laissé vacant —
// jamais l'artillerie. Les restrictions d'entrée du terrain s'appliquent.
// Renvoie l'hex à occuper, ou null si la prise est impossible.
export function takeGroundHex(state, attacker, outcome) {
  if (attacker.type === 'art') return null;
  if (outcome.range !== 1) return null;
  if (!outcome.report.killed && !outcome.report.retreated) return null;
  const { c, r } = outcome.defenderHex;
  if (unitAt(state, c, r)) return null;
  const t = TERRAIN[state.terrain[key(c, r)]];
  const o = OBSTACLES[obstacleAt(state, c, r)];
  if (t.impassable && !o?.makesPassable) return null; // rivière sans pont
  if (o?.infantryOnly && attacker.type !== 'inf') return null; // bunker, antichar
  return { c, r };
}

// Avance l'unité sur l'hex pris. Le pas compte comme mouvement de
// l'activation : les restrictions de combat du terrain (bocage) s'appliquent
// à une éventuelle percée.
export function takeGround(state, unit, hex) {
  const from = { c: unit.c, r: unit.r };
  unit.c = hex.c;
  unit.r = hex.r;
  state.moved[unit.id] = (state.moved[unit.id] || 0) + 1;
  state.bus.emit('groundTaken', { unit, from });
  dropObstacleOnExit(state, from.c, from.r);
}

// Percée de blindés : après sa première attaque (suivie d'une prise de
// terrain), un blindé peut attaquer une seconde fois — une seule percée
// par activation, jamais pour l'infanterie ni l'artillerie.
export function canBreakthrough(state, unit) {
  return unit.type === 'arm' && (state.attacks[unit.id] || 0) === 1;
}

export function endPlayerTurn(state) {
  state.units.forEach((u) => (u.acted = false));
  state.playedCard = null;
  state.ordersLeft = 0;
  state.moved = {};
  state.attacks = {};
  drawCards(state, 'allies');
  state.turn = 'axis';
  state.phase = 'card';
}

export function endAxisTurn(state) {
  drawCards(state, 'axis');
  if (!state.winner) {
    state.turn = 'allies';
    state.phase = 'card';
    state.playedCard = null;
    state.units.forEach((u) => (u.acted = false));
  }
}
