import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reachable, unitAt } from '../src/movement.js';
import { hexDistance, key } from '../src/hex.js';
import { W, H } from '../src/config.js';

function flatState(terrainType, units) {
  const terrain = {};
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) terrain[key(c, r)] = terrainType;
  return { terrain, units };
}

test('en plaine, tout hex libre à distance ≤ 2 est atteignable', () => {
  const u = { id: 'a', side: 'allies', type: 'inf', c: 6, r: 4 };
  const out = reachable(flatState('plaine', [u]), u, 2);
  assert.equal(out.length, 18); // 6 voisins + 12 hexes du second anneau
  for (const h of out) assert.ok(h.cost === hexDistance(u, h));
});

test('un hex occupé est infranchissable et exclu des destinations', () => {
  const u = { id: 'a', side: 'allies', type: 'inf', c: 6, r: 4 };
  const blocker = { id: 'b', side: 'axis', type: 'inf', c: 7, r: 4 };
  const state = flatState('plaine', [u, blocker]);
  const out = reachable(state, u, 2);
  // 18 hexes moins l'hex occupé et (8,4), dont l'unique chemin passe par le bloqueur
  assert.equal(out.length, 16);
  assert.ok(!out.some((h) => h.c === 7 && h.r === 4));
  assert.ok(!out.some((h) => h.c === 8 && h.r === 4));
  assert.equal(unitAt(state, 7, 4), blocker);
});

test('bocage : entrée seulement en premier pas, sortie stoppée à 1 hex', () => {
  const u = { id: 'a', side: 'allies', type: 'arm', c: 6, r: 4 };
  const state = flatState('plaine', [u]);
  state.terrain[key(7, 4)] = 'bocage';
  state.terrain[key(8, 4)] = 'bocage';
  const out = reachable(state, u, 3);
  // adjacent au départ : entrée possible (et arrêt net, stops)
  assert.ok(out.some((h) => h.c === 7 && h.r === 4 && h.cost === 1));
  // à 2 hexes du départ : entrée refusée, même par un chemin dégagé
  assert.ok(!out.some((h) => h.c === 8 && h.r === 4));

  // une unité qui sort d'un bocage s'arrête sur l'hex adjacent, malgré 3 de mouvement
  const inside = { id: 'b', side: 'allies', type: 'arm', c: 2, r: 2 };
  const st2 = flatState('plaine', [inside]);
  st2.terrain[key(2, 2)] = 'bocage';
  const exits = reachable(st2, inside, 3);
  assert.equal(exits.length, 6);
  for (const h of exits) assert.equal(h.cost, 1);
});

test("bunker : seule l'infanterie entre, l'artillerie retranchée est fixe", () => {
  const foot = { id: 'a', side: 'allies', type: 'inf', c: 6, r: 4 };
  const state = flatState('plaine', [foot]);
  state.obstacles = { [key(7, 4)]: 'bunker' };
  assert.ok(reachable(state, foot, 2).some((h) => h.c === 7 && h.r === 4));

  const tank = { id: 'b', side: 'allies', type: 'arm', c: 6, r: 4 };
  const st2 = flatState('plaine', [tank]);
  st2.obstacles = { [key(7, 4)]: 'bunker' };
  assert.ok(!reachable(st2, tank, 3).some((h) => h.c === 7 && h.r === 4));

  const gun = { id: 'g', side: 'axis', type: 'art', c: 6, r: 4 };
  const st3 = flatState('plaine', [gun]);
  st3.obstacles = { [key(6, 4)]: 'bunker' };
  assert.equal(reachable(st3, gun, 1).length, 0);
});

test('les terrains qui stoppent arrêtent net le mouvement', () => {
  const u = { id: 'a', side: 'allies', type: 'arm', c: 6, r: 4 };
  const out = reachable(flatState('foret', [u]), u, 3);
  // chaque premier pas entre en forêt et s'y arrête : seul l'anneau 1 est atteignable
  assert.equal(out.length, 6);
  for (const h of out) assert.equal(h.cost, 1);
});
