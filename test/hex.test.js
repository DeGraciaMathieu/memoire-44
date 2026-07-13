import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexDistance, hexLine, inBounds, neighbors, toCube } from '../src/hex.js';
import { W, H } from '../src/config.js';

test('les coordonnées cube somment toujours à zéro', () => {
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const [x, y, z] = toCube(c, r);
      assert.equal(x + y + z, 0);
    }
});

test('hexDistance : nulle sur soi-même, 1 entre voisins, symétrique', () => {
  const a = { c: 6, r: 4 };
  assert.equal(hexDistance(a, a), 0);
  for (const n of neighbors(a.c, a.r)) {
    assert.equal(hexDistance(a, n), 1);
    assert.equal(hexDistance(n, a), 1);
  }
  assert.equal(hexDistance({ c: 0, r: 0 }, { c: 3, r: 0 }), 3);
});

test('hexLine : extrémités incluses, hexes traversés dans l’ordre', () => {
  assert.deepEqual(hexLine({ c: 2, r: 4 }, { c: 6, r: 4 }), [
    { c: 2, r: 4 },
    { c: 3, r: 4 },
    { c: 4, r: 4 },
    { c: 5, r: 4 },
    { c: 6, r: 4 },
  ]);
  assert.equal(hexLine({ c: 3, r: 3 }, { c: 3, r: 3 }).length, 1);
  // longueur = distance + 1, pour un tracé oblique aussi
  const a = { c: 1, r: 1 };
  const b = { c: 9, r: 6 };
  assert.equal(hexLine(a, b).length, hexDistance(a, b) + 1);
});

test('neighbors : 6 voisins au centre, moins sur les bords, tous dans le plateau', () => {
  assert.equal(neighbors(6, 4).length, 6);
  assert.ok(neighbors(0, 0).length < 6);
  for (const n of neighbors(0, 0)) assert.ok(inBounds(n.c, n.r));
});
