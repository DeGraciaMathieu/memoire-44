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
  assert.equal(Object.keys(terrain).length, W * H - (H >> 1)); // rangées impaires : W − 1 tuiles
  assert.equal(terrain[key(1, 2)], 'foret');
  assert.equal(terrain[key(4, 4)], 'colline');
  assert.equal(terrain[key(6, 4)], 'village');
  assert.equal(terrain[key(3, 3)], 'bocage');
  assert.equal(terrain[key(0, 0)], 'plaine');
});

test('les objectifs du scénario : les deux villages du centre, mixtes', () => {
  const { objectives } = scenario();
  assert.deepEqual(objectives, { [key(6, 4)]: 'both', [key(6, 5)]: 'both' });
});

test("les bunkers du scénario, dont celui de l'artillerie de l'Axe", () => {
  const { obstacles, units } = scenario();
  assert.equal(obstacles[key(6, 0)], 'bunker');
  assert.equal(obstacles[key(4, 6)], 'bunker');
  assert.equal(obstacles[key(2, 1)], 'antichar');
  assert.equal(obstacles[key(10, 2)], 'antichar');
  assert.equal(obstacles[key(3, 7)], 'sacs');
  assert.equal(obstacles[key(8, 7)], 'sacs');
  assert.equal(obstacles[key(3, 2)], 'barbeles');
  assert.equal(obstacles[key(8, 2)], 'barbeles');
  const gun = units.find((u) => u.side === 'axis' && u.type === 'art');
  assert.deepEqual({ c: gun.c, r: gun.r }, { c: 6, r: 0 }); // retranchée dès le départ
});
