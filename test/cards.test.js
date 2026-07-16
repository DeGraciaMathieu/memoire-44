import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, cardById, CARDS, mirrorId } from '../src/cards.js';

test('la pioche contient 49 cartes avec la bonne répartition', () => {
  const deck = buildDeck();
  assert.equal(deck.length, 49);
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
  // cartes tactiques : ×2 ou ×1 selon la carte
  for (const id of ['hq', 'move-out', 'armor-assault', 'infantry-assault', 'contre'])
    assert.equal(count(id), 2);
  for (const id of ['close-assault', 'firefight', 'bombard', 'dig-in', 'barrage', 'air', 'medics'])
    assert.equal(count(id), 1);
});

test('cardById résout chaque carte de la pioche', () => {
  for (const id of buildDeck()) assert.ok(CARDS.includes(cardById(id)));
});

test('les cartes Reconnaissance portent le bonus de pioche, les autres non', () => {
  for (const id of ['rec-g', 'rec-c', 'rec-d']) assert.equal(cardById(id).recon, true);
  for (const id of ['recon-force', 'snd-c', 'ast-g', 'avance']) assert.ok(!cardById(id).recon);
});

test('mirrorId inverse gauche et droite, laisse le reste intact', () => {
  assert.equal(mirrorId('atk-g'), 'atk-d');
  assert.equal(mirrorId('rec-d'), 'rec-g');
  assert.equal(mirrorId('atk-c'), 'atk-c');
  assert.equal(mirrorId('barrage'), 'barrage');
});
