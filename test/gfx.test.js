// render/gfx.js est PUR : ces tests tournent dans Node, sans canvas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAINE_SHADES,
  boardSize,
  hexCenter,
  hexCorners,
  pickHex,
  plaineShade,
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

test('plaineShade : nuance stable par hex, plusieurs verts sur le plateau', () => {
  const used = new Set();
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const shade = plaineShade(c, r);
      assert.ok(PLAINE_SHADES.includes(shade));
      assert.equal(plaineShade(c, r), shade); // déterministe
      used.add(shade);
    }
  assert.ok(used.size > 1); // le fond n'est pas monotone
});

test('lignes de secteur : deux frontières croissantes, trois étiquettes ordonnées', () => {
  const [left, right] = sectorLinesX();
  assert.ok(left < right);
  const labels = sectorLabelsX();
  assert.ok(labels.gauche < left && left < labels.centre);
  assert.ok(labels.centre < right && right < labels.droite);
});
