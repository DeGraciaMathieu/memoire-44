import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inSector, sectorsOf } from '../src/sectors.js';

test('rangées paires : les colonnes 4 et 8 sont à cheval sur deux secteurs', () => {
  assert.deepEqual(sectorsOf(4, 0), ['gauche', 'centre']);
  assert.deepEqual(sectorsOf(8, 0), ['centre', 'droite']);
  assert.deepEqual(sectorsOf(0, 0), ['gauche']);
  assert.deepEqual(sectorsOf(12, 0), ['droite']);
});

test('rangées impaires : aucun hex partagé', () => {
  assert.deepEqual(sectorsOf(3, 1), ['gauche']);
  assert.deepEqual(sectorsOf(4, 1), ['centre']);
  assert.deepEqual(sectorsOf(7, 1), ['centre']);
  assert.deepEqual(sectorsOf(8, 1), ['droite']);
});

test("inSector : '*' accepte tout, sinon le secteur doit correspondre", () => {
  assert.ok(inSector({ c: 0, r: 0 }, '*'));
  assert.ok(inSector({ c: 4, r: 0 }, 'gauche'));
  assert.ok(inSector({ c: 4, r: 0 }, 'centre'));
  assert.ok(!inSector({ c: 4, r: 1 }, 'gauche'));
});
