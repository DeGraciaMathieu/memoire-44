// Test MACRO : un tour complet joué uniquement contre src/, sans navigateur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attackUnit,
  createGame,
  drawCards,
  endPlayerTurn,
  finishUnit,
  moveUnit,
  orderableUnits,
  playCard,
} from '../src/game.js';
import { reachable } from '../src/movement.js';
import { parseMap } from '../src/map.js';
import { cardById } from '../src/cards.js';
import { UNITS, HAND_SIZE } from '../src/config.js';
import { key } from '../src/hex.js';
import { mulberry32 } from './helpers.js';

test('deux parties créées avec la même graine sont identiques', () => {
  const a = createGame({ rng: mulberry32(44) });
  const b = createGame({ rng: mulberry32(44) });
  assert.deepEqual(a.decks, b.decks);
});

test('un tour allié complet : pioche, carte, mouvement, fin de tour', () => {
  const state = createGame({ rng: mulberry32(44) });
  const events = [];
  for (const e of ['cardsDrawn', 'cardPlayed', 'unitMoved']) {
    state.bus.on(e, (p) => events.push([e, p]));
  }

  assert.equal(state.units.length, 14);
  assert.equal(state.decks.allies.length + state.decks.axis.length, 24);

  drawCards(state, 'allies');
  assert.equal(state.hands.allies.length, HAND_SIZE);
  assert.deepEqual(events[0], ['cardsDrawn', { side: 'allies', count: 5 }]);

  const id = state.hands.allies[0];
  const cd = cardById(id);
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

test('la pioche épuisée est rebattue automatiquement', () => {
  const state = createGame({ rng: mulberry32(3) });
  state.decks.allies = [];
  state.hands.allies = [];
  drawCards(state, 'allies');
  assert.equal(state.hands.allies.length, HAND_SIZE);
  assert.equal(state.decks.allies.length, 24 - HAND_SIZE);
});
