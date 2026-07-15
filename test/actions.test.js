// Cartes actions : barrage, attaque aérienne, médecins & mécanos, contre-attaque.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  barrageTargets,
  createGame,
  medicTargets,
  orderableUnits,
  playCard,
  resolveAirStrike,
  resolveBarrage,
  resolveMedics,
  validAirTarget,
} from '../src/game.js';
import { parseMap } from '../src/map.js';
import { key } from '../src/hex.js';
import { UNITS } from '../src/config.js';
import { mulberry32 } from './helpers.js';

// Duel sur mesure, comme dans game.test.js.
function duel({ units, terrain = {}, obstacles = {}, objectives = {} }) {
  const map = parseMap({ name: 'duel', terrain, obstacles, objectives, units });
  return createGame({ rng: mulberry32(44), map });
}

const ALL_HITS = () => 0; // FACES[0] = 'inf'
const ALL_STARS = () => 0.7; // FACES[4] = 'star'

test('barrage : 4 dés sur une unité ennemie, sans protection du terrain', () => {
  const state = duel({
    terrain: { [key(5, 2)]: 'foret' },
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 2 },
    ],
  });
  const axis = state.units[1];
  state.hands.allies = ['barrage'];
  const events = [];
  state.bus.on('actionStruck', (o) => events.push(o));

  const cd = playCard(state, 'allies', 'barrage');
  assert.equal(cd.id, 'barrage');
  assert.equal(state.phase, 'orders');
  assert.equal(state.ordersLeft, 1);
  assert.deepEqual(orderableUnits(state, 'allies', 'barrage'), []); // aucune unité ordonnée
  assert.deepEqual(barrageTargets(state, 'allies'), [axis]);

  state.rng = ALL_HITS;
  const outcome = resolveBarrage(state, 'allies', axis);
  assert.equal(outcome.report.faces.length, 4); // la forêt ne retire aucun dé
  assert.equal(outcome.report.hits, 4);
  assert.ok(outcome.report.killed);
  assert.equal(state.medals.allies, 1);
  assert.equal(state.ordersLeft, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0], outcome);
});

test('attaque aérienne : hexs contigus obligatoires, 2 dés alliés par unité ennemie', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 2 },
      { side: 'axis', type: 'inf', c: 6, r: 2 },
    ],
  });
  // contiguïté : premier hex libre, les suivants collés à la chaîne, jamais deux fois le même
  assert.ok(validAirTarget([], { c: 5, r: 2 }));
  assert.ok(validAirTarget([{ c: 5, r: 2 }], { c: 6, r: 2 }));
  assert.ok(!validAirTarget([{ c: 5, r: 2 }], { c: 9, r: 2 }));
  assert.ok(!validAirTarget([{ c: 5, r: 2 }], { c: 5, r: 2 }));
  assert.ok(!validAirTarget([], { c: 13, r: 0 })); // hors plateau

  state.rng = ALL_HITS;
  const outcomes = resolveAirStrike(state, 'allies', [
    { c: 4, r: 2 },
    { c: 5, r: 2 },
    { c: 6, r: 2 },
    { c: 7, r: 2 },
  ]);
  assert.equal(outcomes.length, 2); // seuls les hexs occupés par l'ennemi frappent
  for (const o of outcomes) {
    assert.equal(o.report.faces.length, 2);
    assert.equal(o.report.hits, 2);
  }
  assert.ok(state.units.filter((u) => u.side === 'axis').every((u) => u.figs === 2));
});

test("attaque aérienne : l'Axe ne lance qu'un dé par unité", () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 2 },
    ],
  });
  state.rng = ALL_HITS;
  const [outcome] = resolveAirStrike(state, 'axis', [{ c: 5, r: 8 }]);
  assert.equal(outcome.report.faces.length, 1);
});

test('médecins & mécanos : soigne au symbole, plafonné aux figurines de départ', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 8 },
      { side: 'allies', type: 'art', c: 6, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 2 },
    ],
  });
  const [inf, art] = state.units;
  assert.deepEqual(medicTargets(state, 'allies'), []); // personne d'amoché
  inf.figs = 2;
  assert.deepEqual(medicTargets(state, 'allies'), [inf]);

  const events = [];
  state.bus.on('unitHealed', (o) => events.push(o));
  state.rng = ALL_HITS; // 4 faces infanterie, mais 2 figurines manquantes seulement
  const out = resolveMedics(state, inf);
  assert.equal(out.restored, 2);
  assert.equal(inf.figs, UNITS.inf.figs);
  assert.ok(inf.acted); // l'unité soignée ne bouge ni ne tire
  assert.equal(state.ordersLeft, 0);
  assert.equal(events.length, 1);

  // l'artillerie n'a pas de face de dé : elle se répare sur l'étoile
  art.figs = 1;
  state.rng = ALL_STARS;
  assert.equal(resolveMedics(state, art).restored, 1);
  assert.equal(art.figs, UNITS.art.figs);
});

test('contre-attaque : rejoue la dernière carte adverse, sinon vaut une reconnaissance', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 2 },
    ],
  });
  const events = [];
  state.bus.on('cardPlayed', (p) => events.push(p));

  // sans carte adverse jouée : reconnaissance en force
  state.hands.allies = ['contre'];
  let cd = playCard(state, 'allies', 'contre');
  assert.equal(cd.id, 'recon-force');
  assert.equal(state.playedCard, 'recon-force');
  assert.equal(state.ordersLeft, 1); // une seule unité alliée sur le plateau
  assert.equal(state.reconDraw, null); // pas de bonus de pioche sur ce repli
  assert.equal(events[0].card.id, 'contre');
  assert.equal(events[0].as.id, 'recon-force');

  // l'Axe joue une attaque à gauche : la contre-attaque suivante la rejoue
  state.hands.axis = ['atk-g'];
  playCard(state, 'axis', 'atk-g');
  state.hands.allies = ['contre'];
  cd = playCard(state, 'allies', 'contre');
  assert.equal(cd.id, 'atk-g');
  assert.equal(state.playedCard, 'atk-g');

  // une contre-attaque adverse ne se rejoue pas : reconnaissance en force
  state.hands.axis = ['contre'];
  playCard(state, 'axis', 'contre');
  state.hands.allies = ['contre'];
  cd = playCard(state, 'allies', 'contre');
  assert.equal(cd.id, 'recon-force');

  // rejouer une Reconnaissance adverse donne aussi son bonus de pioche
  state.hands.axis = ['rec-c'];
  playCard(state, 'axis', 'rec-c');
  assert.equal(state.reconDraw, 'axis');
  state.hands.allies = ['contre'];
  cd = playCard(state, 'allies', 'contre');
  assert.equal(cd.id, 'rec-c');
  assert.equal(state.reconDraw, 'allies');
});
