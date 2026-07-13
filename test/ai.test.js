import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiChooseMoves, aiPickCard } from '../src/ai.js';
import { createGame } from '../src/game.js';
import { mulberry32 } from './helpers.js';

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
