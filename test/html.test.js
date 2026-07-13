// render/html.js est PUR : ces tests tournent dans Node, sans DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcHTML, cardHTML, forcePanelHTML, tipHTML } from '../render/html.js';
import { cardById } from '../src/cards.js';
import { createGame } from '../src/game.js';
import { key } from '../src/hex.js';
import { mulberry32 } from './helpers.js';

const emptyUi = { targets: [], moves: [], orderable: [] };

test('cardHTML : nom, nombre d’unités et secteur', () => {
  const h = cardHTML(cardById('recon'));
  assert.match(h, /Reconnaissance/);
  assert.match(h, /tout le front/);
  const h2 = cardHTML(cardById('atk-g'));
  assert.match(h2, /Attaque à gauche/);
  assert.match(h2, /unités/);
});

test('forcePanelHTML : une pip par figurine, les pertes marquées gone', () => {
  const unit = { side: 'axis', type: 'inf' };
  const h = forcePanelHTML(unit, 'plaine', 'Défenseur', 4, 2);
  assert.equal(h.match(/<i class="pip/g).length, 4);
  assert.equal(h.match(/gone/g).length, 2);
  assert.match(h, /Infanterie/);
  assert.match(h, /Plaine/);
});

test('calcHTML : détaille le calcul avec la réduction de terrain', () => {
  const outcome = {
    baseDice: 3,
    range: 1,
    reduction: 1,
    dice: 2,
    defender: { type: 'inf' },
    terrainKey: 'foret',
  };
  const h = calcHTML(outcome);
  assert.match(h, /<b>3<\/b> dés à portée 1/);
  assert.match(h, /forêt/);
  assert.match(h, /<b>2 dés<\/b>/);
});

test('tipHTML : terrain seul, puis terrain + unité', () => {
  const state = createGame({ rng: mulberry32(5) });
  const empty = tipHTML(state, emptyUi, { c: 0, r: 0 });
  assert.match(empty, /Plaine/);
  assert.match(empty, /gauche/);
  assert.match(empty, /Ligne de mire<b>libre/);
  assert.ok(!empty.includes('Figurines'));

  const forest = tipHTML(state, emptyUi, { c: 1, r: 2 }); // forêt du scénario
  assert.match(forest, /Forêt/);
  assert.match(forest, /Ligne de mire<b>bloquée</);
  assert.match(forest, /−2 blindé, artillerie sans malus/);

  const hill = tipHTML(state, emptyUi, { c: 4, r: 4 }); // colline du scénario
  assert.match(hill, /Colline/);
  assert.match(hill, /Ligne de mire<b>bloquée en contrebas/);

  const bunker = tipHTML(state, emptyUi, { c: 4, r: 6 }); // bunker vide du scénario
  assert.match(bunker, /Bunker/);
  assert.match(bunker, /non cumulée/);
  assert.match(bunker, /infanterie seulement/);
  assert.match(bunker, /le premier du jet est ignoré/);

  const hedgehog = tipHTML(state, emptyUi, { c: 10, r: 2 }); // antichar du scénario
  assert.match(hedgehog, /Obstacle antichar/);
  assert.match(hedgehog, /infanterie seulement/);
  assert.match(hedgehog, /le premier du jet est ignoré/);
  assert.ok(!hedgehog.includes('Protection')); // aucun couvert
  assert.ok(!/uname">Obstacle antichar[\s\S]*?Ligne de mire<b>bloquée/.test(hedgehog));

  const sandbags = tipHTML(state, emptyUi, { c: 8, r: 7 }); // sacs de sable du scénario
  assert.match(sandbags, /Sacs de sable/);
  assert.match(sandbags, /Protection<b>−1 \(artillerie sans malus\), non cumulée/);
  assert.match(sandbags, /le premier du jet est ignoré/);
  assert.match(sandbags, /Abandon<b>retirés dès que l'unité sort/);
  assert.ok(!sandbags.includes('infanterie seulement'));

  const hedge = tipHTML(state, emptyUi, { c: 3, r: 3 }); // bocage du scénario
  assert.match(hedge, /Bocage/);
  assert.match(hedge, /entrée adjacente/);
  assert.match(hedge, /Sortie<b>1 hex puis arrêt/);
  assert.match(hedge, /pas de tir le tour d'entrée/);
  assert.match(hedge, /Ligne de mire<b>bloquée</);

  // rivière puis pont, posés à la main (absents du scénario par défaut)
  state.terrain[key(0, 4)] = 'riviere';
  const river = tipHTML(state, emptyUi, { c: 0, r: 4 });
  assert.match(river, /Rivière/);
  assert.match(river, /Mouvement<b>infranchissable sans pont/);
  assert.match(river, /Ligne de mire<b>libre/);

  state.obstacles[key(0, 4)] = 'pont';
  const bridge = tipHTML(state, emptyUi, { c: 0, r: 4 });
  assert.match(bridge, /Pont/);
  assert.match(bridge, /Franchissement<b>rend l'hex franchissable/);
  assert.ok(!bridge.includes('Protection')); // aucun couvert sur un pont

  state.terrain[key(0, 6)] = 'mer';
  const sea = tipHTML(state, emptyUi, { c: 0, r: 6 });
  assert.match(sea, /Mer/);
  assert.match(sea, /Combat<b>aucun tir depuis la mer/);
  assert.match(sea, /Sortie<b>1 hex puis arrêt/);
  assert.match(sea, /Ligne de mire<b>libre/);

  state.terrain[key(0, 5)] = 'plage';
  const beach = tipHTML(state, emptyUi, { c: 0, r: 5 });
  assert.match(beach, /Plage/);
  assert.match(beach, /Mouvement<b>2 hex maximum/);
  assert.match(beach, /Ligne de mire<b>libre/);
  assert.ok(!beach.includes('Combat')); // aucune restriction de combat

  const withUnit = tipHTML(state, emptyUi, { c: 1, r: 7 }); // infanterie alliée
  assert.match(withUnit, /Infanterie/);
  assert.match(withUnit, /Figurines/);
  assert.match(withUnit, /4 \/ 4/);
});
