// Factory de l'état + séquence principale du jeu.
// Toutes les fonctions prennent l'état en argument et ne touchent jamais au
// rendu : les effets visuels sont notifiés via state.bus.

import { HAND_SIZE, OBSTACLES, TERRAIN, UNITS } from './config.js';
import { createBus } from './events.js';
import { hexDistance, inBounds, key } from './hex.js';
import { cardSectors, inSector, sectorsOf } from './sectors.js';
import { buildDeck, cardById } from './cards.js';
import { scenario } from './scenario.js';
import { setupFromMap } from './map.js';
import {
  crushObstacleOnEnter,
  dropObstacleOnExit,
  obstacleAt,
  reachable,
  unitAt,
} from './movement.js';
import {
  attackerSnare,
  canFight,
  checkVictory,
  defenseReduction,
  diceFor,
  resolveCombat,
  rollDice,
} from './combat.js';

export function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// `map` : carte validée par parseMap (src/map.js) ; défaut = scénario « bocage ».
// `playerSide` : camp joué par l'humain, l'IA prend l'autre. Les Alliés ouvrent
// toujours le feu, quel que soit le camp choisi.
export function createGame({ rng = Math.random, map = null, playerSide = 'allies' } = {}) {
  const { terrain, units, obstacles, objectives } = map ? setupFromMap(map) : scenario();
  const deck = shuffle(buildDeck(), rng);
  return {
    terrain,
    obstacles,
    objectives,
    units,
    decks: { allies: deck.slice(0, 10), axis: deck.slice(10) },
    hands: { allies: [], axis: [] },
    medals: { allies: 0, axis: 0 },
    playerSide,
    aiSide: playerSide === 'allies' ? 'axis' : 'allies',
    turn: 'allies',
    phase: 'card', // card | orders | done
    playedCard: null,
    lastCard: { allies: null, axis: null }, // dernière carte jouée par chaque camp (Contre-attaque)
    ordersLeft: 0,
    orders: {}, // secteur -> ordres restants pour la carte en cours
    reconDraw: null, // camp qui doit piocher 2 cartes et n'en garder qu'une (Reconnaissance)
    reconChoice: null, // { side, ids } : les 2 cartes piochées en attente de choix
    moved: {}, // id d'unité -> coût du déplacement pendant l'activation en cours
    attacks: {}, // id d'unité -> nombre d'attaques pendant l'activation en cours
    winner: null,
    bus: createBus(),
    rng,
  };
}

export function orderableUnits(state, side, cardId) {
  const cd = cardById(cardId);
  if (cd.action === 'medics') return medicTargets(state, side);
  if (cd.action) return []; // barrage, attaque aérienne : aucune unité ordonnée
  return state.units.filter((u) => u.side === side && inSector(u, cd.sector));
}

// Quota d'ordres par secteur couvert par la carte : `n` unités par secteur,
// 'all' = toutes les unités du secteur, plafonné par les effectifs présents.
export function sectorQuota(state, side, cd) {
  const quota = {};
  for (const s of cardSectors(cd.sector)) {
    const present = state.units.filter(
      (u) => u.side === side && sectorsOf(u.c, u.r).includes(s),
    ).length;
    quota[s] = cd.n === 'all' ? present : Math.min(cd.n, present);
  }
  return quota;
}

// Unités encore activables pendant la phase d'ordres : non jouées et dans un
// secteur dont le quota d'ordres n'est pas épuisé.
export function activableUnits(state, side) {
  return orderableUnits(state, side, state.playedCard).filter(
    (u) => !u.acted && sectorsOf(u.c, u.r).some((s) => (state.orders[s] || 0) > 0),
  );
}

function drawOne(state, side) {
  if (!state.decks[side].length) state.decks[side] = shuffle(buildDeck(), state.rng);
  return state.decks[side].pop();
}

export function drawCards(state, side) {
  let count = 0;
  while (state.hands[side].length < HAND_SIZE) {
    state.hands[side].push(drawOne(state, side));
    count++;
  }
  if (count) state.bus.emit('cardsDrawn', { side, count });
  return count;
}

// Bonus de pioche d'une Reconnaissance : le camp pioche 2 cartes et n'en garde
// qu'une — le choix revient à l'appelant (le joueur via le rendu, l'IA via
// aiReconKeep), qui conclut par keepReconCard.
export function beginReconChoice(state, side) {
  state.reconDraw = null;
  state.reconChoice = { side, ids: [drawOne(state, side), drawOne(state, side)] };
  state.bus.emit('reconChoice', state.reconChoice);
  return state.reconChoice;
}

export function keepReconCard(state, keptId) {
  const { side, ids } = state.reconChoice;
  state.reconChoice = null;
  state.hands[side].push(keptId);
  state.bus.emit('cardsDrawn', { side, count: 1 });
  drawCards(state, side); // filet : complète la main si elle restait incomplète
  const rest = ids.slice();
  rest.splice(rest.indexOf(keptId), 1);
  return rest[0]; // la carte défaussée
}

// Joue une carte et renvoie la carte EFFECTIVE : les cartes de commandement
// ouvrent des ordres de secteur, les cartes actions attendent leur cible
// (resolveBarrage, resolveAirStrike, resolveMedics). Contre-attaque rejoue la
// dernière carte adverse — ou vaut une Reconnaissance si elle manque ou était
// elle-même une Contre-attaque.
export function playCard(state, side, cardId) {
  const played = cardById(cardId);
  let cd = played;
  if (cd.action === 'contre') {
    const lastId = state.lastCard[side === 'allies' ? 'axis' : 'allies'];
    const last = lastId && cardById(lastId);
    cd = last && last.action !== 'contre' ? last : cardById('recon-force');
  }
  state.hands[side].splice(state.hands[side].indexOf(cardId), 1);
  state.lastCard[side] = cardId;
  state.playedCard = cd.id;
  state.phase = 'orders';
  state.moved = {};
  state.attacks = {};
  state.units.forEach((u) => (u.acted = false));
  state.reconDraw = cd.recon ? side : null;
  if (cd.action) {
    state.orders = {};
    state.ordersLeft = cd.action === 'medics' ? Math.min(1, medicTargets(state, side).length) : 1;
  } else {
    state.orders = sectorQuota(state, side, cd);
    const total = Object.values(state.orders).reduce((a, b) => a + b, 0);
    // un hex à cheval compte dans les deux secteurs : le total réel est borné
    // par le nombre d'unités effectivement activables
    state.ordersLeft = Math.min(total, orderableUnits(state, side, cd.id).length);
  }
  state.bus.emit('cardPlayed', {
    side,
    card: played,
    as: cd === played ? null : cd,
    ordersLeft: state.ordersLeft,
  });
  return cd;
}

/* --- cartes actions ------------------------------------------------------ */

// Frappe d'une carte action (barrage, attaque aérienne) : dés fixes de la
// carte, sans réduction de terrain ni ligne de mire — l'attaque tombe du ciel.
// Le pseudo-attaquant posé sur l'hex du défenseur oriente le repli.
function strike(state, cardId, side, defender, dice) {
  const outcome = {
    card: cardById(cardId),
    side,
    defender,
    dice,
    figsBefore: defender.figs,
    defenderHex: { c: defender.c, r: defender.r },
    obstacleKey: obstacleAt(state, defender.c, defender.r) ?? null,
  };
  const faces = rollDice(dice, state.rng);
  outcome.report = resolveCombat(state, { side, c: defender.c, r: defender.r }, defender, faces);
  state.bus.emit('actionStruck', outcome);
  return outcome;
}

export function barrageTargets(state, side) {
  return state.units.filter((u) => u.side !== side);
}

export function resolveBarrage(state, side, defender) {
  state.ordersLeft = 0;
  return strike(state, 'barrage', side, defender, cardById('barrage').dice);
}

// Hex ciblable par l'attaque aérienne : dans le plateau, pas déjà choisi,
// adjacent à un hex déjà choisi (le premier est libre).
export function validAirTarget(chosen, hex) {
  if (!inBounds(hex.c, hex.r)) return false;
  if (chosen.some((h) => h.c === hex.c && h.r === hex.r)) return false;
  return !chosen.length || chosen.some((h) => hexDistance(h, hex) === 1);
}

export function resolveAirStrike(state, side, hexes) {
  const dice = cardById('air').dice[side];
  state.ordersLeft = 0;
  const outcomes = [];
  for (const h of hexes) {
    if (state.winner) break;
    const u = unitAt(state, h.c, h.r);
    if (u && u.side !== side) outcomes.push(strike(state, 'air', side, u, dice));
  }
  return outcomes;
}

// L'artillerie n'a pas de face de dé : elle se répare sur l'étoile.
const HEAL_FACE = { inf: 'inf', arm: 'arm', art: 'star' };

export function medicTargets(state, side) {
  return state.units.filter((u) => u.side === side && u.figs < UNITS[u.type].figs);
}

// Médecins & mécanos : 4 dés, chaque face au symbole de l'unité rend une
// figurine perdue ; l'unité soignée ne bouge ni ne tire ce tour.
export function resolveMedics(state, unit) {
  const faces = rollDice(cardById('medics').dice, state.rng);
  const max = UNITS[unit.type].figs;
  let restored = 0;
  for (const f of faces) if (f === HEAL_FACE[unit.type] && unit.figs + restored < max) restored++;
  unit.figs += restored;
  unit.acted = true;
  state.ordersLeft = 0;
  const outcome = { unit, restored, faces };
  state.bus.emit('unitHealed', outcome);
  return outcome;
}

// Déplace l'unité si l'hex est réellement atteignable ; renvoie le coût, ou
// null si le déplacement est illégal. Un seul déplacement par activation.
export function moveUnit(state, unit, hex) {
  if (state.moved[unit.id] != null) return null;
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
  crushObstacleOnEnter(state, unit); // un blindé écrase les barbelés
  checkVictory(state); // l'occupation d'un objectif peut donner la 6e médaille
  return step.cost;
}

// Barbelés : une infanterie qui pourrait combattre ce tour-ci peut préférer
// couper les barbelés de son hex — cela remplace son combat.
export function canCutWire(state, unit) {
  if (unit.type !== 'inf') return false;
  if (!OBSTACLES[obstacleAt(state, unit.c, unit.r)]?.cutInsteadOfFight) return false;
  if (state.attacks[unit.id]) return false;
  return canFight(state, unit, state.moved[unit.id] || 0);
}

export function cutWire(state, unit) {
  const obstacle = state.obstacles[key(unit.c, unit.r)];
  delete state.obstacles[key(unit.c, unit.r)];
  state.attacks[unit.id] = (state.attacks[unit.id] || 0) + 1; // tient lieu de combat
  state.bus.emit('obstacleRemoved', { c: unit.c, r: unit.r, obstacle });
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
    snare: attackerSnare(state, attacker),
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
  // L'ordre consomme le quota du secteur de l'unité ; hex à cheval, ou unité
  // sortie de son secteur en cours d'activation : le secteur couvert le mieux
  // pourvu paie l'ordre, pour garder quotas et ordersLeft cohérents.
  const here = sectorsOf(unit.c, unit.r).filter((s) => (state.orders[s] || 0) > 0);
  const pool = here.length ? here : Object.keys(state.orders).filter((s) => state.orders[s] > 0);
  const s = pool.sort((a, b) => state.orders[b] - state.orders[a])[0];
  if (s) state.orders[s]--;
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
  crushObstacleOnEnter(state, unit); // un blindé écrase les barbelés
  checkVictory(state);
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
  state.orders = {};
  state.moved = {};
  state.attacks = {};
  if (state.reconDraw === state.playerSide) beginReconChoice(state, state.playerSide);
  else drawCards(state, state.playerSide);
  state.turn = state.aiSide;
  state.phase = 'card';
}

export function endAiTurn(state) {
  if (state.reconDraw === state.aiSide) beginReconChoice(state, state.aiSide);
  else drawCards(state, state.aiSide);
  if (!state.winner) {
    state.turn = state.playerSide;
    state.phase = 'card';
    state.playedCard = null;
    state.orders = {};
    state.units.forEach((u) => (u.acted = false));
  }
}
