import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenario } from '../src/scenario.js';
import { UNITS, W, H } from '../src/config.js';
import { inBounds, key } from '../src/hex.js';

test('le scénario pose 7 unités par camp, en bon état et dans le plateau', () => {
  const { units } = scenario();
  assert.equal(units.length, 14);
  assert.equal(units.filter((u) => u.side === 'allies').length, 7);
  assert.equal(new Set(units.map((u) => u.id)).size, 14);
  for (const u of units) {
    assert.ok(inBounds(u.c, u.r));
    assert.equal(u.figs, UNITS[u.type].figs);
    assert.equal(u.acted, false);
  }
});

test('le terrain couvre tout le plateau, avec le bocage attendu', () => {
  const { terrain } = scenario();
  assert.equal(Object.keys(terrain).length, W * H);
  assert.equal(terrain[key(1, 2)], 'foret');
  assert.equal(terrain[key(4, 4)], 'colline');
  assert.equal(terrain[key(6, 4)], 'village');
  assert.equal(terrain[key(0, 0)], 'plaine');
});
