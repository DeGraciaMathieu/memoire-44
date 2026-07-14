import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardSectors, inSector, sectorsOf } from '../src/sectors.js';

test('rangées paires : partition nette 4 / 5 / 4, aucun hex partagé', () => {
  assert.deepEqual(sectorsOf(0, 0), ['gauche']);
  assert.deepEqual(sectorsOf(3, 0), ['gauche']);
  assert.deepEqual(sectorsOf(4, 0), ['centre']);
  assert.deepEqual(sectorsOf(8, 0), ['centre']);
  assert.deepEqual(sectorsOf(9, 0), ['droite']);
  assert.deepEqual(sectorsOf(12, 0), ['droite']);
});

test('rangées impaires : les colonnes 3 et 8 sont à cheval sur deux secteurs', () => {
  assert.deepEqual(sectorsOf(2, 1), ['gauche']);
  assert.deepEqual(sectorsOf(3, 1), ['gauche', 'centre']);
  assert.deepEqual(sectorsOf(4, 1), ['centre']);
  assert.deepEqual(sectorsOf(7, 1), ['centre']);
  assert.deepEqual(sectorsOf(8, 1), ['centre', 'droite']);
  assert.deepEqual(sectorsOf(9, 1), ['droite']);
});

test("inSector : '*' accepte tout, sinon le secteur doit correspondre", () => {
  assert.ok(inSector({ c: 0, r: 0 }, '*'));
  assert.ok(inSector({ c: 3, r: 1 }, 'gauche'));
  assert.ok(inSector({ c: 3, r: 1 }, 'centre'));
  assert.ok(!inSector({ c: 3, r: 0 }, 'centre'));
});

test("'flancs' couvre les secteurs gauche et droite, jamais le centre seul", () => {
  assert.deepEqual(cardSectors('flancs'), ['gauche', 'droite']);
  assert.deepEqual(cardSectors('*'), ['gauche', 'centre', 'droite']);
  assert.deepEqual(cardSectors('centre'), ['centre']);
  assert.ok(inSector({ c: 0, r: 0 }, 'flancs')); // gauche
  assert.ok(inSector({ c: 12, r: 0 }, 'flancs')); // droite
  assert.ok(!inSector({ c: 6, r: 0 }, 'flancs')); // plein centre
  assert.ok(inSector({ c: 3, r: 1 }, 'flancs')); // hex à cheval gauche/centre
});
