// Cartes tactiques à résolution dédiée : barrage, attaque aérienne,
// médecins & mécanos, contre-attaque.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activableUnits,
  barrageTargets,
  createGame,
  finishUnit,
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
const ALL_FLAGS = () => 0.99; // FACES[5] = 'flag'

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

test('barrage : les drapeaux ne peuvent pas être ignorés, même retranché', () => {
  const state = duel({
    obstacles: { [key(5, 2)]: 'sacs' },
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 2 },
    ],
  });
  const axis = state.units[1];
  state.hands.allies = ['barrage'];
  playCard(state, 'allies', 'barrage');
  state.rng = ALL_FLAGS;
  const outcome = resolveBarrage(state, 'allies', axis);
  assert.equal(outcome.report.flags, 4);
  assert.equal(outcome.report.flagsIgnored, 0); // les sacs de sable ne couvrent pas
  assert.ok(outcome.report.retreated);
  assert.ok(axis.r < 2); // replié vers sa ligne de départ
});

test('attaque aérienne : jusqu’à 4 unités ennemies adjacentes entre elles', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 2 },
      { side: 'axis', type: 'inf', c: 6, r: 2 },
      { side: 'axis', type: 'inf', c: 10, r: 2 },
    ],
  });
  // seuls les hexs occupés par l'ennemi sont ciblables, en groupe contigu
  assert.ok(validAirTarget(state, 'allies', [], { c: 5, r: 2 }));
  assert.ok(!validAirTarget(state, 'allies', [], { c: 4, r: 2 })); // hex vide
  assert.ok(!validAirTarget(state, 'allies', [], { c: 5, r: 8 })); // unité amie
  assert.ok(validAirTarget(state, 'allies', [{ c: 5, r: 2 }], { c: 6, r: 2 }));
  assert.ok(!validAirTarget(state, 'allies', [{ c: 5, r: 2 }], { c: 10, r: 2 })); // isolée
  assert.ok(!validAirTarget(state, 'allies', [{ c: 5, r: 2 }], { c: 5, r: 2 })); // déjà choisie
  const four = [
    { c: 0, r: 0 },
    { c: 1, r: 0 },
    { c: 2, r: 0 },
    { c: 3, r: 0 },
  ];
  assert.ok(!validAirTarget(state, 'allies', four, { c: 4, r: 0 })); // groupe plein

  // l'étoile touche aussi : 2 dés alliés par unité, 2 touches chacune
  state.rng = ALL_STARS;
  const outcomes = resolveAirStrike(state, 'allies', [
    { c: 5, r: 2 },
    { c: 6, r: 2 },
  ]);
  assert.equal(outcomes.length, 2);
  for (const o of outcomes) {
    assert.equal(o.report.faces.length, 2);
    assert.equal(o.report.hits, 2);
  }
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

test('attaque aérienne : une cible détruite n’interrompt pas la frappe des suivantes', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 2 },
      { side: 'axis', type: 'inf', c: 6, r: 2 },
    ],
  });
  const [, first, second] = state.units;
  first.figs = 1;
  state.rng = ALL_HITS;

  const outcomes = resolveAirStrike(state, 'allies', [
    { c: 5, r: 2 },
    { c: 6, r: 2 },
  ]);
  assert.equal(outcomes.length, 2);
  assert.ok(outcomes[0].report.killed);
  assert.ok(!state.units.includes(first));
  assert.equal(state.medals.allies, 1);
  // la frappe continue sur la seconde cible, à pleine puissance
  assert.equal(outcomes[1].report.hits, 2);
  assert.equal(second.figs, 2);
});

test('médecins & mécanos : 1 dé par carte en main, soigne au symbole ou à l’étoile', () => {
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
  state.hands.allies = ['medics', 'atk-g', 'snd-c'];
  playCard(state, 'allies', 'medics');
  state.rng = ALL_HITS; // faces infanterie, mais 2 figurines manquantes seulement
  const out = resolveMedics(state, inf);
  assert.equal(out.faces.length, 3); // 2 cartes en main + celle jouée
  assert.equal(out.restored, 2);
  assert.equal(inf.figs, UNITS.inf.figs);
  assert.equal(events.length, 1);
  // l'unité soignée peut encore recevoir l'ordre de la carte
  assert.ok(!inf.acted);
  assert.equal(state.ordersLeft, 1);
  assert.deepEqual(activableUnits(state, 'allies'), [inf]);
  finishUnit(state, inf);
  assert.equal(state.ordersLeft, 0);

  // l'artillerie n'a pas de face de dé : elle se répare sur l'étoile
  art.figs = 1;
  state.hands.allies = ['medics'];
  playCard(state, 'allies', 'medics');
  state.rng = ALL_STARS;
  assert.equal(resolveMedics(state, art).restored, 1);
  assert.equal(art.figs, UNITS.art.figs);
});

test('médecins & mécanos : sans figurine récupérée, le tour est perdu', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 5, r: 8 },
      { side: 'axis', type: 'inf', c: 5, r: 2 },
    ],
  });
  const inf = state.units[0];
  inf.figs = 2;
  state.hands.allies = ['medics'];
  playCard(state, 'allies', 'medics');
  state.rng = () => 0.55; // FACES[3] = 'grenade' : aucune face de soin
  const out = resolveMedics(state, inf);
  assert.equal(out.restored, 0);
  assert.ok(inf.acted);
  assert.equal(state.ordersLeft, 0);
  assert.deepEqual(activableUnits(state, 'allies'), []);
});

test('contre-attaque : rejoue la carte adverse en miroir gauche/droite', () => {
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

  // l'Axe attaque à gauche : la contre-attaque rejoue une attaque à DROITE
  state.hands.axis = ['atk-g'];
  playCard(state, 'axis', 'atk-g');
  state.hands.allies = ['contre'];
  cd = playCard(state, 'allies', 'contre');
  assert.equal(cd.id, 'atk-d');
  assert.equal(state.playedCard, 'atk-d');

  // une carte du centre se rejoue telle quelle
  state.hands.axis = ['snd-c'];
  playCard(state, 'axis', 'snd-c');
  state.hands.allies = ['contre'];
  cd = playCard(state, 'allies', 'contre');
  assert.equal(cd.id, 'snd-c');

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

test('contre-attaque d’un assaut d’infanterie : même secteur que l’adversaire', () => {
  const state = duel({
    units: [
      { side: 'allies', type: 'inf', c: 1, r: 8 },
      { side: 'allies', type: 'inf', c: 11, r: 8 },
      { side: 'axis', type: 'inf', c: 1, r: 0 },
    ],
  });
  state.hands.axis = ['infantry-assault'];
  playCard(state, 'axis', 'infantry-assault', { sector: 'gauche' });
  assert.equal(state.lastSector.axis, 'gauche');

  state.hands.allies = ['contre'];
  const cd = playCard(state, 'allies', 'contre');
  assert.equal(cd.id, 'infantry-assault');
  assert.equal(state.pickedSector, 'gauche'); // pas de miroir : même secteur
  // seule l'infanterie alliée du secteur gauche est ordonnable
  assert.deepEqual(orderableUnits(state, 'allies', 'infantry-assault'), [state.units[0]]);
});
