// mulberry32 : le RNG par graine derrière les cartes aléatoires rejouables.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';

test('mulberry32 : même graine même séquence, graines distinctes séquences distinctes', () => {
  const draw = (seed) => Array.from({ length: 20 }, mulberry32(seed));
  assert.deepEqual(draw(4217), draw(4217));
  assert.notDeepEqual(draw(4217), draw(4218));
  assert.ok(draw(4217).every((x) => x >= 0 && x < 1));
});
