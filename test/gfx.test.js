// render/gfx.js est PUR : ces tests tournent dans Node, sans canvas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boardSize,
  hexCenter,
  hexCorners,
  pickHex,
  sectorLabelsX,
  sectorLinesX,
} from '../render/gfx.js';
import { W, H } from '../src/config.js';

test('boardSize englobe tous les centres d’hexes', () => {
  const { width, height } = boardSize();
  for (const [c, r] of [
    [0, 0],
    [W - 1, 0],
    [0, H - 1],
    [W - 1, H - 1],
  ]) {
    const p = hexCenter(c, r);
    assert.ok(p.x > 0 && p.x < width);
    assert.ok(p.y > 0 && p.y < height);
  }
});

test('pickHex retrouve l’hex depuis son centre, et null hors plateau', () => {
  for (const [c, r] of [
    [0, 0],
    [6, 4],
    [12, 8],
    [4, 1],
  ]) {
    const p = hexCenter(c, r);
    assert.deepEqual(pickHex(p.x, p.y), { c, r });
  }
  assert.equal(pickHex(-100, -100), null);
});

test('hexCorners : 6 sommets à égale distance du centre', () => {
  const corners = hexCorners(100, 100, 34);
  assert.equal(corners.length, 6);
  for (const [x, y] of corners) {
    assert.ok(Math.abs(Math.hypot(x - 100, y - 100) - 34) < 1e-9);
  }
});

test('lignes de secteur : deux frontières croissantes, trois étiquettes ordonnées', () => {
  const [left, right] = sectorLinesX();
  assert.ok(left < right);
  const labels = sectorLabelsX();
  assert.ok(labels.gauche < left && left < labels.centre);
  assert.ok(labels.centre < right && right < labels.droite);
});
