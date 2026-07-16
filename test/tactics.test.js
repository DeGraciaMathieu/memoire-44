// Cartes tactiques à ordres : quotas globaux, filtres de type, repli,
// bonus de dés, mouvements modifiés, second tir et retranchement.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activableUnits,
  attackUnit,
  canAttackAgain,
  createGame,
  digIn,
  finishUnit,
  moveUnit,
  orderableUnits,
  playCard,
} from '../src/game.js';
import { moveRange } from '../src/tactics.js';
import { canFight, diceFor, targetsFor } from '../src/combat.js';
import { parseMap } from '../src/map.js';
import { key } from '../src/hex.js';
import { mulberry32 } from './helpers.js';

// Duel sur mesure, comme dans game.test.js.
function duel({ units, terrain = {}, obstacles = {}, objectives = {} }) {
  const map = parseMap({ name: 'duel', terrain, obstacles, objectives, units });
  return createGame({ rng: mulberry32(44), map });
}

test('directive du QG : 4 unités au choix sur tout le plateau', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 1, r: 8 },
      { side: 'allies', type: 'inf', c: 5, r: 8 },
      { side: 'allies', type: 'arm', c: 8, r: 8 },
      { side: 'allies', type: 'art', c: 11, r: 8 },
      { side: 'allies', type: 'inf', c: 3, r: 7 },
      { side: 'axis', type: 'inf', c: 5, r: 0 },
    ],
  });
  state.hands.allies = ['hq'];
  playCard(state, 'allies', 'hq');
  assert.equal(state.ordersLeft, 4); // quota global, pas par secteur
  assert.equal(activableUnits(state, 'allies').length, 5); // toutes candidates
  finishUnit(state, state.units[0]);
  assert.equal(state.ordersLeft, 3);
  assert.equal(activableUnits(state, 'allies').length, 4);
});

test('en avant ! : 4 infanteries, ou 1 unité au choix sans infanterie', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 1, r: 8 },
      { side: 'allies', type: 'inf', c: 11, r: 8 },
      { side: 'allies', type: 'arm', c: 5, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 0 },
    ],
  });
  const [inf1, inf2, arm] = state.units;
  state.hands.allies = ['move-out'];
  playCard(state, 'allies', 'move-out');
  assert.deepEqual(orderableUnits(state, 'allies', 'move-out'), [inf1, inf2]);
  assert.equal(state.ordersLeft, 2); // plafonné aux infanteries présentes

  // sans infanterie : repli sur 1 unité au choix
  state.units = [arm, state.units[3]];
  state.hands.allies = ['move-out'];
  playCard(state, 'allies', 'move-out');
  assert.deepEqual(orderableUnits(state, 'allies', 'move-out'), [arm]);
  assert.equal(state.ordersLeft, 1);
});

test('assaut blindé : les blindés gagnent 1 dé au contact seulement', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'arm', c: 5, r: 7 },
      { side: 'axis', type: 'inf', c: 5, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 5 },
    ],
  });
  const arm = state.units[0];
  state.hands.allies = ['armor-assault'];
  playCard(state, 'allies', 'armor-assault');
  assert.equal(diceFor(state, arm, state.units[1]), 4); // 3 + 1 au contact
  assert.equal(diceFor(state, arm, state.units[2]), 3); // pas de bonus à distance
});

test('assaut d’infanterie : le secteur choisi, bouge 2 et tire ou 3 sans tirer', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 1, r: 8 },
      { side: 'allies', type: 'inf', c: 6, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 0 },
    ],
  });
  const [gauche, centre] = state.units;
  state.hands.allies = ['infantry-assault'];
  playCard(state, 'allies', 'infantry-assault', { sector: 'centre' });
  assert.deepEqual(orderableUnits(state, 'allies', 'infantry-assault'), [centre]);
  assert.equal(moveRange(state, centre), 3); // 2 + tir, ou 3 sans tir
  assert.ok(canFight(state, centre, 2)); // combat conservé après 2 hexes
  assert.ok(!canFight(state, centre, 3));
  // un déplacement de 3 hexes passe, impossible pour une infanterie ordinaire
  assert.equal(moveUnit(state, centre, { c: 6, r: 5 }), 3);
  assert.ok(!gauche.acted && !orderableUnits(state, 'allies', 'infantry-assault').includes(gauche));
});

test('assaut rapproché : unités au contact, +1 dé, sans bouger', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 7 },
      { side: 'allies', type: 'inf', c: 1, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 8 },
    ],
  });
  const [contact, loin] = state.units;
  state.hands.allies = ['close-assault'];
  playCard(state, 'allies', 'close-assault');
  assert.deepEqual(orderableUnits(state, 'allies', 'close-assault'), [contact]);
  assert.ok(!orderableUnits(state, 'allies', 'close-assault').includes(loin));
  assert.equal(moveRange(state, contact), 0); // aucun déplacement
  assert.equal(moveUnit(state, contact, { c: 5, r: 6 }), null);
  assert.equal(diceFor(state, contact, state.units[2]), 4); // 3 + 1
});

test('fusillade : 4 unités hors contact, +1 dé, sans bouger', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 6 },
      { side: 'allies', type: 'inf', c: 5, r: 7 },
      { side: 'axis', type: 'inf', c: 5, r: 8 },
    ],
  });
  const [distant, contact] = state.units;
  state.hands.allies = ['firefight'];
  playCard(state, 'allies', 'firefight');
  assert.deepEqual(orderableUnits(state, 'allies', 'firefight'), [distant]);
  assert.ok(!orderableUnits(state, 'allies', 'firefight').includes(contact));
  assert.equal(moveRange(state, distant), 0);
  assert.equal(diceFor(state, distant, state.units[2]), 3); // 2 à portée 2, +1
});

test('bombardement : l’artillerie bouge jusqu’à 3 hexes ou tire deux fois', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'art', c: 5, r: 6 },
      { side: 'axis', type: 'inf', c: 5, r: 2 },
    ],
  });
  const art = state.units[0];
  state.hands.allies = ['bombard'];
  playCard(state, 'allies', 'bombard');
  assert.equal(moveRange(state, art), 3); // 1 hex en temps normal

  // tire deux fois sur place, pas trois
  state.rng = () => 0.55; // grenades : touche sans détruire les 4 figurines d'un coup
  attackUnit(state, art, state.units[1]);
  assert.ok(canAttackAgain(state, art));
  assert.ok(targetsFor(state, art, 0).length);
  attackUnit(state, art, state.units[1]);
  assert.ok(!canAttackAgain(state, art));

  // mais pas de tir après un déplacement
  assert.ok(!canFight(state, art, 1));
});

test('retranchement : les infanteries ordonnées posent des sacs de sable', () => {
  const state = duel({
    obstacles: { [key(1, 8)]: 'sacs' },
    units: [
      { side: 'allies', type: 'inf', c: 1, r: 8 }, // déjà un obstacle : inéligible
      { side: 'allies', type: 'inf', c: 5, r: 8 },
      { side: 'allies', type: 'arm', c: 8, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 0 },
    ],
  });
  const inf = state.units[1];
  const events = [];
  state.bus.on('obstaclePlaced', (o) => events.push(o));
  state.hands.allies = ['dig-in'];
  playCard(state, 'allies', 'dig-in');
  assert.deepEqual(orderableUnits(state, 'allies', 'dig-in'), [inf]);
  assert.equal(state.ordersLeft, 1);

  digIn(state, inf);
  assert.equal(state.obstacles[key(5, 8)], 'sacs');
  assert.ok(inf.acted);
  assert.equal(state.ordersLeft, 0);
  assert.deepEqual(events, [{ c: 5, r: 8, obstacle: 'sacs' }]);
});

test('repli d’une carte tactique : 1 unité au choix, sans les effets spéciaux', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 8 },
      { side: 'allies', type: 'inf', c: 6, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 0 },
    ],
  });
  const inf = state.units[0];
  state.hands.allies = ['bombard']; // aucune artillerie alliée
  playCard(state, 'allies', 'bombard');
  assert.equal(state.ordersLeft, 1);
  assert.equal(orderableUnits(state, 'allies', 'bombard').length, 2); // au choix
  assert.equal(moveRange(state, inf), 2); // pas le bonus de mouvement de la carte
  attackUnit(state, inf, state.units[2]);
  assert.ok(!canAttackAgain(state, inf)); // pas de second tir hors artillerie ordonnée
});
