// Cartes de commandement : un test fonctionnel par carte — seules les unités
// du secteur couvert reçoivent des ordres, dans la limite du quota de la carte.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activableUnits, createGame, finishUnit, moveUnit, playCard } from '../src/game.js';
import { reachable } from '../src/movement.js';
import { parseMap } from '../src/map.js';
import { cardById } from '../src/cards.js';
import { mulberry32 } from './helpers.js';

// Trois infanteries alliées par secteur, pour éprouver le quota de chaque carte.
const COLS = { gauche: [0, 1, 2], centre: [5, 6, 7], droite: [10, 11, 12] };

function frontState() {
  const units = Object.values(COLS)
    .flat()
    .map((c) => ({ side: 'allies', type: 'inf', c, r: 8 }));
  units.push({ side: 'axis', type: 'inf', c: 6, r: 0 });
  const map = parseMap({ name: 'front', terrain: {}, obstacles: {}, objectives: {}, units });
  const state = createGame({ rng: mulberry32(44), map });
  const bySector = Object.fromEntries(
    Object.entries(COLS).map(([s, cols]) => [
      s,
      state.units.filter((u) => u.side === 'allies' && cols.includes(u.c)),
    ]),
  );
  return { state, bySector };
}

// Une carte de secteur simple par famille et par flanc : jouer la carte, vérifier
// le quota et le bonus de pioche, puis ordonner une unité (déplacement + fin
// d'activation) et voir le quota se consommer.
const KINDS = [
  { prefix: 'rec', n: 1, recon: true },
  { prefix: 'snd', n: 2 },
  { prefix: 'atk', n: 3 },
  { prefix: 'ast', n: 'all' },
];
const SECTOR_OF = { g: 'gauche', c: 'centre', d: 'droite' };

for (const { prefix, n, recon } of KINDS) {
  for (const [suffix, sector] of Object.entries(SECTOR_OF)) {
    const id = `${prefix}-${suffix}`;
    test(`${cardById(id).name} : ordres réservés au secteur ${sector}`, () => {
      const { state, bySector } = frontState();
      state.hands.allies = [id];
      playCard(state, 'allies', id);
      assert.equal(state.phase, 'orders');

      const quota = n === 'all' ? bySector[sector].length : n;
      assert.equal(state.ordersLeft, quota);
      assert.deepEqual(activableUnits(state, 'allies'), bySector[sector]);
      // bonus de pioche des seules cartes Reconnaissance
      assert.equal(state.reconDraw, recon ? 'allies' : null);

      // une unité ordonnée se déplace, puis son activation consomme le quota
      const unit = bySector[sector][0];
      const dest = reachable(state, unit, 1)[0];
      assert.equal(moveUnit(state, unit, dest), dest.cost);
      finishUnit(state, unit);
      assert.equal(state.ordersLeft, quota - 1);
      assert.ok(!activableUnits(state, 'allies').includes(unit));
    });
  }
}

test('attaque en tenaille : 2 ordres sur chaque flanc, le centre reste fermé', () => {
  const { state, bySector } = frontState();
  state.hands.allies = ['tenaille'];
  playCard(state, 'allies', 'tenaille');

  assert.deepEqual(state.orders, { gauche: 2, droite: 2 });
  assert.equal(state.ordersLeft, 4);
  assert.deepEqual(activableUnits(state, 'allies'), [...bySector.gauche, ...bySector.droite]);

  // les deux ordres de gauche consommés : le flanc se ferme, la droite reste ouverte
  finishUnit(state, bySector.gauche[0]);
  finishUnit(state, bySector.gauche[1]);
  assert.deepEqual(activableUnits(state, 'allies'), bySector.droite);
});

test('reconnaissance en force : 1 ordre par secteur, sans bonus de pioche', () => {
  const { state, bySector } = frontState();
  state.hands.allies = ['recon-force'];
  playCard(state, 'allies', 'recon-force');

  assert.deepEqual(state.orders, { gauche: 1, centre: 1, droite: 1 });
  assert.equal(state.ordersLeft, 3);
  assert.equal(state.reconDraw, null); // pas le bonus des cartes Reconnaissance
  assert.deepEqual(
    activableUnits(state, 'allies'),
    state.units.filter((u) => u.side === 'allies'),
  );

  // l'ordre du centre consommé, ses deux autres unités se ferment
  finishUnit(state, bySector.centre[0]);
  assert.deepEqual(activableUnits(state, 'allies'), [...bySector.gauche, ...bySector.droite]);
});
