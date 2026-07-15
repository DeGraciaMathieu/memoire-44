import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, cardById, CARDS } from '../src/cards.js';

test('la pioche contient 40 cartes avec la bonne répartition', () => {
  const deck = buildDeck();
  assert.equal(deck.length, 40);
  const count = (id) => deck.filter((x) => x === id).length;
  // par secteur : reconnaissance ×2, sonder ×3, attaque ×3, assaut ×1
  for (const s of ['g', 'c', 'd']) {
    assert.equal(count(`rec-${s}`), 2);
    assert.equal(count(`snd-${s}`), 3);
    assert.equal(count(`atk-${s}`), 3);
    assert.equal(count(`ast-${s}`), 1);
  }
  // multi-sections
  assert.equal(count('avance'), 1);
  assert.equal(count('tenaille'), 2);
  assert.equal(count('recon-force'), 2);
  // les quatre cartes actions, deux copies chacune
  for (const id of ['barrage', 'air', 'medics', 'contre']) assert.equal(count(id), 2);
});

test('cardById résout chaque carte de la pioche', () => {
  for (const id of buildDeck()) assert.ok(CARDS.includes(cardById(id)));
});

test('les cartes Reconnaissance portent le bonus de pioche, les autres non', () => {
  for (const id of ['rec-g', 'rec-c', 'rec-d']) assert.equal(cardById(id).recon, true);
  for (const id of ['recon-force', 'snd-c', 'ast-g', 'avance']) assert.ok(!cardById(id).recon);
});
