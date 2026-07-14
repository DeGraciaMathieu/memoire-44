// render/gfx.js est PUR : ces tests tournent dans Node, sans canvas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAINE_SHADES,
  boardSize,
  bridgeSpec,
  hexCenter,
  hexCorners,
  pickHex,
  plaineShade,
  sectorLabelsX,
  sectorLinesX,
} from '../render/gfx.js';
import { W, H } from '../src/config.js';
import { key } from '../src/hex.js';

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

// Le bras `spec[i]` pointe-t-il de l'hex `from` vers l'hex `to` ?
function armTowards(arm, from, to) {
  const p = hexCenter(from.c, from.r);
  const q = hexCenter(to.c, to.r);
  const d = Math.hypot(q.x - p.x, q.y - p.y);
  const dot = Math.cos(arm.angle) * (q.x - p.x) + Math.sin(arm.angle) * (q.y - p.y);
  return Math.abs(dot - d) < 1e-9; // colinéaire et de même sens
}

test('bridgeSpec : le tablier du pont est perpendiculaire au fil de la rivière', () => {
  // rivière verticale (voisins haut et bas) → deux bras horizontaux opposés
  const vertical = { [key(3, 2)]: 'riviere', [key(3, 3)]: 'riviere', [key(3, 4)]: 'riviere' };
  for (const arm of bridgeSpec(vertical, {}, 3, 3))
    assert.ok(Math.abs(Math.sin(arm.angle)) < 1e-9 && !arm.join);

  // rivière horizontale (voisins gauche et droite) → bras verticaux
  const horizontal = { [key(2, 3)]: 'riviere', [key(3, 3)]: 'riviere', [key(4, 3)]: 'riviere' };
  for (const arm of bridgeSpec(horizontal, {}, 3, 3))
    assert.ok(Math.abs(Math.cos(arm.angle)) < 1e-9);

  // un seul voisin rivière : bras perpendiculaires à la direction de ce voisin
  const bend = { [key(3, 3)]: 'riviere', [key(4, 4)]: 'riviere' };
  const p = hexCenter(3, 3);
  const q = hexCenter(4, 4);
  for (const arm of bridgeSpec(bend, {}, 3, 3)) {
    const dot = Math.cos(arm.angle) * (q.x - p.x) + Math.sin(arm.angle) * (q.y - p.y);
    assert.ok(Math.abs(dot) < 1e-9);
  }

  // aucune rivière voisine : deux bras horizontaux par défaut, avec culées
  assert.deepEqual(bridgeSpec({}, {}, 3, 3), [
    { angle: 0, join: false },
    { angle: Math.PI, join: false },
  ]);
});

test('bridgeSpec : des ponts successifs se raccordent, même dans les virages', () => {
  // rivière large traversée par deux ponts côte à côte en (3,3) et (4,3)
  const straightObs = { [key(3, 3)]: 'pont', [key(4, 3)]: 'pont' };
  const a = bridgeSpec({}, straightObs, 3, 3);
  const b = bridgeSpec({}, straightObs, 4, 3);
  // un bras de raccord vers l'autre pont, un bras de rive (culée) à l'opposé
  assert.ok(a.find((m) => m.join && armTowards(m, { c: 3, r: 3 }, { c: 4, r: 3 })));
  assert.ok(b.find((m) => m.join && armTowards(m, { c: 4, r: 3 }, { c: 3, r: 3 })));
  assert.equal(a.filter((m) => !m.join).length, 1);
  assert.equal(b.filter((m) => !m.join).length, 1);

  // virage : le pont en (3,3) relie un pont à l'est (4,3) et un autre en (4,4) —
  // chaque bras pointe exactement vers son voisin, pas selon la corde
  const cornerObs = { [key(3, 3)]: 'pont', [key(4, 3)]: 'pont', [key(4, 4)]: 'pont' };
  const corner = bridgeSpec({}, cornerObs, 3, 3);
  assert.equal(corner.length, 2);
  assert.ok(corner.every((m) => m.join));
  assert.ok(corner.some((m) => armTowards(m, { c: 3, r: 3 }, { c: 4, r: 3 })));
  assert.ok(corner.some((m) => armTowards(m, { c: 3, r: 3 }, { c: 4, r: 4 })));
});

test('lignes de secteur : deux frontières croissantes, trois étiquettes ordonnées', () => {
  const [left, right] = sectorLinesX();
  assert.ok(left < right);
  const labels = sectorLabelsX();
  assert.ok(labels.gauche < left && left < labels.centre);
  assert.ok(labels.centre < right && right < labels.droite);
});
