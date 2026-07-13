import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiChooseMoves, aiPickCard, aiTakesGround } from '../src/ai.js';
import { createGame } from '../src/game.js';
import { parseMap } from '../src/map.js';
import { key } from '../src/hex.js';
import { mulberry32 } from './helpers.js';

// Plateau sur mesure pour isoler une préférence de l'IA.
function board({ units, terrain = {}, objectives = {} }) {
  const map = parseMap({ name: 'ia', terrain, obstacles: {}, objectives, units });
  return createGame({ rng: mulberry32(7), map });
}

test('aiPickCard choisit la carte qui active le plus de monde', () => {
  const state = createGame({ rng: mulberry32(1) });
  // toutes les unités de l'Axe à gauche : atk-g doit l'emporter sur atk-d
  state.units = state.units.map((u) => (u.side === 'axis' ? { ...u, c: 1 } : u));
  state.hands.axis = ['atk-d', 'atk-g'];
  assert.equal(aiPickCard(state), 'atk-g');
});

test('aiChooseMoves produit au plus n plans, chacun avec une unité et une destination', () => {
  const state = createGame({ rng: mulberry32(2) });
  const plans = aiChooseMoves(state, 'assaut');
  assert.ok(plans.length <= 4);
  assert.ok(plans.length > 0);
  for (const p of plans) {
    assert.equal(p.unit.side, 'axis');
    assert.ok(p.dest);
    assert.ok(p.dest.cost >= 0);
  }
});

test("prise d'objectif : sans cible, l'IA avance sur la tuile à portée", () => {
  const state = board({
    objectives: { [key(5, 4)]: true },
    units: [
      { side: 'axis', type: 'inf', c: 5, r: 2 },
      { side: 'allies', type: 'inf', c: 5, r: 8 },
    ],
  });
  const [plan] = aiChooseMoves(state, 'recon');
  assert.deepEqual({ c: plan.dest.c, r: plan.dest.r }, { c: 5, r: 4 });
});

test("maintien d'objectif : l'unité qui tient la tuile ne la quitte pas", () => {
  const state = board({
    objectives: { [key(5, 4)]: true },
    units: [
      { side: 'axis', type: 'inf', c: 5, r: 4 },
      { side: 'allies', type: 'inf', c: 5, r: 8 },
    ],
  });
  const [plan] = aiChooseMoves(state, 'recon');
  assert.deepEqual({ c: plan.dest.c, r: plan.dest.r }, { c: 5, r: 4 });
  assert.equal(plan.dest.cost, 0);
});

test('aiTakesGround : ne lâche jamais un objectif tenu, avance toujours sur un objectif', () => {
  const state = board({
    terrain: { [key(5, 5)]: 'foret' },
    objectives: { [key(5, 4)]: true },
    units: [
      { side: 'axis', type: 'inf', c: 5, r: 5 },
      { side: 'axis', type: 'arm', c: 5, r: 4 },
      { side: 'allies', type: 'inf', c: 5, r: 8 },
    ],
  });
  const [inf, arm] = state.units;
  // l'infanterie quitte sa forêt pour un objectif en plaine…
  assert.equal(aiTakesGround(state, inf, { c: 5, r: 4 }), true);
  // …mais pas pour une plaine ordinaire
  assert.equal(aiTakesGround(state, inf, { c: 4, r: 4 }), false);
  // le blindé qui tient l'objectif refuse d'avancer, même lui
  assert.equal(aiTakesGround(state, arm, { c: 5, r: 3 }), false);
});
