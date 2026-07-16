// Test MACRO : un tour complet joué uniquement contre src/, sans navigateur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activableUnits,
  attackUnit,
  canBreakthrough,
  canCutWire,
  createGame,
  cutWire,
  drawCards,
  endAiTurn,
  endPlayerTurn,
  finishUnit,
  keepReconCard,
  moveUnit,
  orderableUnits,
  playCard,
  takeGround,
  takeGroundHex,
} from '../src/game.js';
import { reachable } from '../src/movement.js';
import { parseMap } from '../src/map.js';
import { cardById } from '../src/cards.js';
import { medalCount, targetsFor } from '../src/combat.js';
import { UNITS, HAND_SIZE, MEDALS_TO_WIN } from '../src/config.js';
import { key } from '../src/hex.js';
import { mulberry32 } from './helpers.js';

// Duel sur mesure : une carte minimale, phase d'ordres déjà ouverte.
function duel({ units, terrain = {}, obstacles = {}, objectives = {} }) {
  const map = parseMap({ name: 'duel', terrain, obstacles, objectives, units });
  return createGame({ rng: mulberry32(44), map });
}

const ALL_HITS = () => 0; // FACES[0] = 'inf' : touche l'infanterie à tous les coups
const ALL_FLAGS = () => 0.99; // FACES[5] = 'flag' : repli forcé

test('deux parties créées avec la même graine sont identiques', () => {
  const a = createGame({ rng: mulberry32(44) });
  const b = createGame({ rng: mulberry32(44) });
  assert.deepEqual(a.decks, b.decks);
});

test('choix du camp : le joueur tient l’Axe, l’IA joue les Alliés et ouvre', () => {
  assert.equal(createGame({ rng: mulberry32(44) }).playerSide, 'allies'); // défaut

  const state = createGame({ rng: mulberry32(44), playerSide: 'axis' });
  assert.equal(state.playerSide, 'axis');
  assert.equal(state.aiSide, 'allies');
  assert.equal(state.turn, 'allies'); // les Alliés ouvrent toujours le feu

  // tour de l'IA (Alliés) : carte jouée, repioche, la main passe au joueur
  // (carte sans bonus de pioche, pour une repioche immédiate)
  drawCards(state, 'allies');
  state.hands.allies[0] = 'snd-c';
  playCard(state, 'allies', 'snd-c');
  endAiTurn(state);
  assert.equal(state.hands.allies.length, HAND_SIZE);
  assert.equal(state.turn, 'axis');
  assert.equal(state.phase, 'card');

  // tour du joueur (Axe) : même séquence, retour à l'IA
  drawCards(state, 'axis');
  state.hands.axis[0] = 'snd-c';
  playCard(state, 'axis', 'snd-c');
  endPlayerTurn(state);
  assert.equal(state.hands.axis.length, HAND_SIZE);
  assert.equal(state.turn, 'allies');
  assert.equal(state.phase, 'card');
});

test('un tour allié complet : pioche, carte, mouvement, fin de tour', () => {
  const state = createGame({ rng: mulberry32(44) });
  const events = [];
  for (const e of ['cardsDrawn', 'cardPlayed', 'unitMoved']) {
    state.bus.on(e, (p) => events.push([e, p]));
  }

  assert.equal(state.units.length, 14);
  assert.equal(state.decks.allies.length + state.decks.axis.length, 49);

  drawCards(state, 'allies');
  assert.equal(state.hands.allies.length, HAND_SIZE);
  assert.deepEqual(events[0], ['cardsDrawn', { side: 'allies', count: 5 }]);

  const id = 'snd-c'; // carte connue pour des assertions déterministes
  const cd = cardById(id);
  state.hands.allies[0] = id;
  playCard(state, 'allies', id);
  assert.equal(state.phase, 'orders');
  assert.equal(state.playedCard, id);
  assert.equal(state.hands.allies.length, HAND_SIZE - 1);
  assert.equal(state.ordersLeft, Math.min(cd.n, orderableUnits(state, 'allies', id).length));

  const unit = orderableUnits(state, 'allies', id)[0];
  const dest = reachable(state, unit, UNITS[unit.type].moveNoFire)[0];
  const cost = moveUnit(state, unit, dest);
  assert.equal(cost, dest.cost);
  assert.deepEqual({ c: unit.c, r: unit.r }, { c: dest.c, r: dest.r });
  assert.equal(state.moved[unit.id], cost);
  assert.ok(events.some(([e]) => e === 'unitMoved'));

  // un déplacement illégal est refusé sans toucher à l'état
  assert.equal(moveUnit(state, unit, { c: unit.c, r: unit.r }), null);

  const before = state.ordersLeft;
  finishUnit(state, unit);
  assert.equal(unit.acted, true);
  assert.equal(state.ordersLeft, before - 1);

  endPlayerTurn(state);
  assert.equal(state.turn, 'axis');
  assert.equal(state.phase, 'card');
  assert.equal(state.hands.allies.length, HAND_SIZE);
  assert.ok(state.units.every((u) => !u.acted));
});

test("déplacement unique : une unité déjà déplacée ne rebouge pas dans l'activation", () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 5 },
      { side: 'axis', type: 'inf', c: 0, r: 0 },
    ],
  });
  const [inf] = state.units;
  assert.equal(moveUnit(state, inf, { c: 5, r: 6 }), 1);
  // second déplacement refusé, même vers un hex atteignable
  assert.equal(moveUnit(state, inf, { c: 5, r: 7 }), null);
  // activation suivante (moved réinitialisé) : le déplacement redevient possible
  state.moved = {};
  assert.equal(moveUnit(state, inf, { c: 5, r: 7 }), 1);
});

test("attackUnit produit un rapport cohérent avec les dés tirés et l'émet sur le bus", () => {
  const state = createGame({ rng: mulberry32(9) });
  const attacker = state.units.find((u) => u.side === 'allies' && u.type === 'inf');
  const defender = state.units.find((u) => u.side === 'axis' && u.type === 'inf');
  // on rapproche l'attaquant pour un tir à bout portant
  attacker.c = defender.c;
  attacker.r = defender.r + 1;

  let emitted = null;
  state.bus.on('combatResolved', (o) => (emitted = o));
  const outcome = attackUnit(state, attacker, defender);

  assert.equal(emitted, outcome);
  assert.equal(outcome.range, 1);
  assert.equal(outcome.report.faces.length, outcome.dice);
  const expectedHits = outcome.report.faces.filter((f) =>
    UNITS[defender.type].hitOn.includes(f),
  ).length;
  assert.equal(outcome.report.hits, expectedHits);
  if (!outcome.report.killed) {
    assert.equal(
      defender.figs,
      outcome.figsBefore - outcome.report.hits - outcome.report.extraLoss,
    );
  }
});

test("les sacs de sable sont abandonnés quand l'unité quitte volontairement l'hex", () => {
  const state = createGame({ rng: mulberry32(11) });
  const unit = state.units.find((u) => u.side === 'allies' && u.type === 'inf');
  unit.c = 3;
  unit.r = 7; // posée sur les sacs du scénario
  const events = [];
  state.bus.on('obstacleRemoved', (p) => events.push(p));

  assert.equal(moveUnit(state, unit, { c: 3, r: 8 }), 1);
  assert.equal(state.obstacles[key(3, 7)], undefined);
  assert.deepEqual(events, [{ c: 3, r: 7, obstacle: 'sacs' }]);
  // l'autre position de sacs reste en place
  assert.equal(state.obstacles[key(8, 7)], 'sacs');
});

test('createGame accepte une carte de l’éditeur à la place du scénario', () => {
  const map = parseMap({
    name: 'Duel',
    terrain: { [key(6, 4)]: 'village' },
    obstacles: { [key(6, 0)]: 'bunker' },
    units: [
      { side: 'allies', type: 'inf', c: 1, r: 7 },
      { side: 'axis', type: 'inf', c: 6, r: 0 },
    ],
  });
  const state = createGame({ rng: mulberry32(44), map });
  assert.equal(state.units.length, 2);
  assert.equal(state.terrain[key(6, 4)], 'village');
  assert.equal(state.obstacles[key(6, 0)], 'bunker');
  // la carte reste rejouable : une seconde partie repart d'unités neuves
  state.units[0].figs = 1;
  const rematch = createGame({ rng: mulberry32(44), map });
  assert.equal(rematch.units[0].figs, UNITS[rematch.units[0].type].figs);
});

test("prise de terrain : l'infanterie avance sur l'hex d'un ennemi détruit au contact", () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 5 },
      { side: 'axis', type: 'inf', c: 5, r: 4 },
    ],
  });
  const [atk, def] = state.units;
  def.figs = 1;
  state.rng = ALL_HITS;
  const events = [];
  state.bus.on('groundTaken', (p) => events.push(p));

  const outcome = attackUnit(state, atk, def);
  assert.ok(outcome.report.killed);
  assert.equal(state.attacks[atk.id], 1);

  const hex = takeGroundHex(state, atk, outcome);
  assert.deepEqual(hex, { c: 5, r: 4 });
  takeGround(state, atk, hex);
  assert.deepEqual({ c: atk.c, r: atk.r }, { c: 5, r: 4 });
  assert.equal(state.moved[atk.id], 1);
  assert.deepEqual(events, [{ unit: atk, from: { c: 5, r: 5 } }]);
  // l'infanterie n'a jamais droit à une percée
  assert.ok(!canBreakthrough(state, atk));
});

test("prise de terrain : aussi après un repli, jamais pour l'artillerie ni à distance", () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 5 },
      { side: 'allies', type: 'art', c: 6, r: 5 },
      { side: 'axis', type: 'inf', c: 5, r: 4 },
      { side: 'axis', type: 'inf', c: 6, r: 4 },
    ],
  });
  const [inf, art, def, def2] = state.units;

  // repli : l'hex quitté est pris
  state.rng = ALL_FLAGS;
  const retreat = attackUnit(state, inf, def);
  assert.ok(retreat.report.retreated);
  assert.deepEqual(takeGroundHex(state, inf, retreat), { c: 5, r: 4 });

  // artillerie au contact : jamais de prise de terrain
  state.rng = ALL_HITS;
  def2.figs = 1;
  const byArt = attackUnit(state, art, def2);
  assert.ok(byArt.report.killed);
  assert.equal(takeGroundHex(state, art, byArt), null);

  // tir à distance (portée 2) : pas de prise de terrain
  const state2 = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 5 },
      { side: 'axis', type: 'inf', c: 5, r: 3 },
    ],
  });
  const [shooter, farDef] = state2.units;
  farDef.figs = 1;
  state2.rng = ALL_HITS;
  const ranged = attackUnit(state2, shooter, farDef);
  assert.ok(ranged.report.killed);
  assert.equal(ranged.range, 2);
  assert.equal(takeGroundHex(state2, shooter, ranged), null);
});

test("prise de terrain : les restrictions d'entrée du terrain s'appliquent au blindé", () => {
  const setup = () => {
    const state = duel({
      obstacles: { [key(5, 4)]: 'antichar' },
      units: [
        { side: 'allies', type: 'arm', c: 5, r: 5 },
        { side: 'allies', type: 'inf', c: 4, r: 4 },
        { side: 'axis', type: 'inf', c: 5, r: 4 },
      ],
    });
    state.units[2].figs = 1;
    state.rng = ALL_HITS;
    return state;
  };
  // l'obstacle antichar interdit la prise au blindé…
  let state = setup();
  const byArm = attackUnit(state, state.units[0], state.units[2]);
  assert.ok(byArm.report.killed);
  assert.equal(takeGroundHex(state, state.units[0], byArm), null);
  // …mais pas à l'infanterie
  state = setup();
  const byInf = attackUnit(state, state.units[1], state.units[2]);
  assert.ok(byInf.report.killed);
  assert.deepEqual(takeGroundHex(state, state.units[1], byInf), { c: 5, r: 4 });
});

test('percée de blindés : une seconde attaque, puis une prise classique mais pas de troisième', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'arm', c: 5, r: 5 },
      { side: 'axis', type: 'inf', c: 5, r: 4 },
      { side: 'axis', type: 'inf', c: 5, r: 3 },
    ],
  });
  const [arm, e1, e2] = state.units;
  e1.figs = 1;
  e2.figs = 1;
  state.rng = ALL_HITS;

  const first = attackUnit(state, arm, e1);
  assert.ok(first.report.killed);
  takeGround(state, arm, takeGroundHex(state, arm, first));
  assert.ok(canBreakthrough(state, arm)); // percée disponible après la prise

  const second = attackUnit(state, arm, e2);
  assert.ok(second.report.killed);
  assert.ok(!canBreakthrough(state, arm)); // une seule percée par activation
  // la seconde prise de terrain classique reste possible
  const hex = takeGroundHex(state, arm, second);
  assert.deepEqual(hex, { c: 5, r: 3 });
  takeGround(state, arm, hex);
  assert.deepEqual({ c: arm.c, r: arm.r }, { c: 5, r: 3 });
});

test('percée de blindés : le bocage pris interdit la seconde attaque (noFightOnEnter)', () => {
  const state = duel({
    terrain: { [key(5, 4)]: 'bocage' },
    units: [
      { side: 'allies', type: 'arm', c: 5, r: 5 },
      { side: 'axis', type: 'inf', c: 5, r: 4 },
      { side: 'axis', type: 'inf', c: 5, r: 3 },
    ],
  });
  const [arm, e1] = state.units;
  e1.figs = 1;
  state.rng = ALL_HITS;

  const outcome = attackUnit(state, arm, e1);
  assert.ok(outcome.report.killed);
  takeGround(state, arm, takeGroundHex(state, arm, outcome));
  assert.ok(canBreakthrough(state, arm));
  // la percée est théoriquement ouverte, mais le terrain la bloque
  assert.equal(targetsFor(state, arm, state.moved[arm.id]).length, 0);
});

test("objectif : possédé tant qu'une unité l'occupe, rendu dès qu'elle le quitte", () => {
  const state = duel({
    objectives: { [key(5, 5)]: true },
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 6 },
      { side: 'axis', type: 'inf', c: 0, r: 0 },
    ],
  });
  const [inf] = state.units;
  assert.equal(medalCount(state, 'allies'), 0);

  moveUnit(state, inf, { c: 5, r: 5 });
  assert.equal(medalCount(state, 'allies'), 1);
  assert.equal(medalCount(state, 'axis'), 0);
  assert.equal(state.medals.allies, 0); // pas une médaille de destruction

  state.moved = {}; // activation suivante : l'unité quitte la tuile
  moveUnit(state, inf, { c: 5, r: 6 });
  assert.equal(medalCount(state, 'allies'), 0); // possession perdue en quittant la tuile
});

test("victoire à 6 médailles : l'occupation d'un objectif peut donner la dernière", () => {
  assert.equal(MEDALS_TO_WIN, 6);
  const state = duel({
    objectives: { [key(5, 5)]: true },
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 6 },
      { side: 'axis', type: 'inf', c: 0, r: 0 },
    ],
  });
  state.medals.allies = 5;
  const events = [];
  state.bus.on('gameWon', (p) => events.push(p));

  moveUnit(state, state.units[0], { c: 5, r: 5 });
  assert.equal(medalCount(state, 'allies'), 6);
  assert.equal(state.winner, 'allies');
  assert.deepEqual(events, [{ side: 'allies' }]);
});

test('barbelés : le blindé qui entre les écrase et peut combattre dans la foulée', () => {
  const state = duel({
    obstacles: { [key(5, 5)]: 'barbeles' },
    units: [
      { side: 'allies', type: 'arm', c: 5, r: 6 },
      { side: 'axis', type: 'inf', c: 5, r: 4 },
    ],
  });
  const [tank] = state.units;
  const removed = [];
  state.bus.on('obstacleRemoved', (p) => removed.push(p));

  assert.equal(moveUnit(state, tank, { c: 5, r: 5 }), 1);
  assert.equal(state.obstacles[key(5, 5)], undefined);
  assert.deepEqual(removed, [{ c: 5, r: 5, obstacle: 'barbeles' }]);
  // le combat du tour reste permis, à pleine puissance
  const targets = targetsFor(state, tank, state.moved[tank.id]);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].dice, 3);
  // rien à couper pour un blindé : les barbelés ont déjà disparu
  assert.equal(canCutWire(state, tank), false);
});

test("barbelés : l'infanterie les coupe au lieu de combattre — si elle pouvait combattre", () => {
  const state = duel({
    obstacles: { [key(5, 5)]: 'barbeles' },
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 7 },
      { side: 'axis', type: 'inf', c: 0, r: 0 },
    ],
  });
  const [foot] = state.units;
  assert.equal(canCutWire(state, foot), false); // pas encore sur les barbelés

  // entrée en 2 hexes : trop de mouvement pour combattre, donc pour couper
  assert.equal(moveUnit(state, foot, { c: 5, r: 5 }), 2);
  assert.equal(canCutWire(state, foot), false);

  // activation suivante, sans mouvement : la coupe devient possible
  state.moved = {};
  assert.equal(canCutWire(state, foot), true);
  const removed = [];
  state.bus.on('obstacleRemoved', (p) => removed.push(p));
  cutWire(state, foot);
  assert.equal(state.obstacles[key(5, 5)], undefined);
  assert.deepEqual(removed, [{ c: 5, r: 5, obstacle: 'barbeles' }]);
  assert.equal(state.attacks[foot.id], 1); // la coupe tient lieu de combat
  assert.equal(canCutWire(state, foot), false);
});

test('la pioche épuisée est rebattue automatiquement', () => {
  const state = createGame({ rng: mulberry32(3) });
  state.decks.allies = [];
  state.hands.allies = [];
  drawCards(state, 'allies');
  assert.equal(state.hands.allies.length, HAND_SIZE);
  assert.equal(state.decks.allies.length, 49 - HAND_SIZE);
});

test('avance générale : 2 ordres par secteur, le quota du secteur épuisé ferme ses unités', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 6 },
      { side: 'allies', type: 'inf', c: 6, r: 6 },
      { side: 'allies', type: 'inf', c: 7, r: 6 }, // trois au centre
      { side: 'allies', type: 'inf', c: 1, r: 6 }, // une à gauche
      { side: 'axis', type: 'inf', c: 5, r: 0 },
    ],
  });
  const [c1, c2, c3, g1] = state.units;
  state.hands.allies = ['avance'];
  playCard(state, 'allies', 'avance');

  // 2 par secteur, plafonné par les effectifs présents : 1 gauche + 2 centre
  assert.deepEqual(state.orders, { gauche: 1, centre: 2, droite: 0 });
  assert.equal(state.ordersLeft, 3);
  assert.deepEqual(activableUnits(state, 'allies'), [c1, c2, c3, g1]);

  // les deux ordres du centre consommés : la troisième unité du centre se ferme
  finishUnit(state, c1);
  finishUnit(state, c2);
  assert.equal(state.orders.centre, 0);
  assert.deepEqual(activableUnits(state, 'allies'), [g1]);
  assert.equal(state.ordersLeft, 1);

  finishUnit(state, g1);
  assert.equal(state.ordersLeft, 0);
  assert.deepEqual(activableUnits(state, 'allies'), []);
});

test("assaut : toutes les unités du secteur sont activables, pas celles d'ailleurs", () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 0, r: 6 },
      { side: 'allies', type: 'arm', c: 1, r: 6 },
      { side: 'allies', type: 'art', c: 2, r: 6 }, // trois à gauche
      { side: 'allies', type: 'inf', c: 6, r: 6 }, // une au centre
      { side: 'axis', type: 'inf', c: 5, r: 0 },
    ],
  });
  state.hands.allies = ['ast-g'];
  playCard(state, 'allies', 'ast-g');
  assert.equal(state.ordersLeft, 3);
  assert.deepEqual(state.orders, { gauche: 3 });
  assert.deepEqual(
    activableUnits(state, 'allies'),
    state.units.filter((u) => u.side === 'allies' && u.c <= 2),
  );
});

test('reconnaissance : en fin de tour, piocher 2 cartes, en garder 1, défausser l’autre', () => {
  const state = createGame({ rng: mulberry32(44) });
  drawCards(state, 'allies');
  state.hands.allies[0] = 'rec-c';
  const events = [];
  state.bus.on('reconChoice', (p) => events.push(p));

  playCard(state, 'allies', 'rec-c');
  assert.equal(state.reconDraw, 'allies');
  const unit = orderableUnits(state, 'allies', 'rec-c')[0];
  finishUnit(state, unit);

  const deckBefore = state.decks.allies.length;
  endPlayerTurn(state);
  // pas de pioche normale : deux cartes en attente de choix
  assert.equal(state.hands.allies.length, HAND_SIZE - 1);
  assert.equal(state.reconChoice.side, 'allies');
  assert.equal(state.reconChoice.ids.length, 2);
  assert.equal(state.decks.allies.length, deckBefore - 2);
  assert.deepEqual(events, [state.reconChoice]);
  assert.equal(state.turn, 'axis');

  const [kept, other] = state.reconChoice.ids;
  const discarded = keepReconCard(state, kept);
  assert.equal(discarded, other);
  assert.equal(state.reconChoice, null);
  assert.equal(state.hands.allies.length, HAND_SIZE);
  assert.equal(state.hands.allies.at(-1), kept);
  // la carte défaussée n'est ni en main ni remise sur la pioche
  assert.equal(state.decks.allies.length, deckBefore - 2);
});

test('sans carte Reconnaissance, la fin de tour pioche normalement', () => {
  const state = createGame({ rng: mulberry32(44) });
  drawCards(state, 'allies');
  state.hands.allies[0] = 'snd-c';
  playCard(state, 'allies', 'snd-c');
  endPlayerTurn(state);
  assert.equal(state.reconChoice, null);
  assert.equal(state.hands.allies.length, HAND_SIZE);
});
