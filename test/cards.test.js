import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, cardById, CARDS } from '../src/cards.js';

test('la pioche contient 24 cartes avec la bonne répartition', () => {
  const deck = buildDeck();
  assert.equal(deck.length, 24);
  const count = (id) => deck.filter((x) => x === id).length;
  assert.equal(count('atk-g'), 3);
  assert.equal(count('snd-c'), 3);
  assert.equal(count('recon'), 4);
  assert.equal(count('assaut'), 2);
});

test('cardById résout chaque carte de la pioche', () => {
  for (const id of buildDeck()) assert.ok(CARDS.includes(cardById(id)));
});
