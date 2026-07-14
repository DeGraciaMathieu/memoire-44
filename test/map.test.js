import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMap, serializeMap, setupFromMap, unitAllowedOn } from '../src/map.js';
import { UNITS, W, H } from '../src/config.js';
import { key } from '../src/hex.js';

const sampleMap = () => ({
  name: 'Test',
  terrain: { [key(2, 3)]: 'foret', [key(5, 5)]: 'colline' },
  obstacles: { [key(6, 0)]: 'bunker' },
  objectives: { [key(5, 5)]: true },
  units: [
    { side: 'allies', type: 'inf', c: 1, r: 7 },
    { side: 'allies', type: 'arm', c: 4, r: 8 },
    { side: 'axis', type: 'inf', c: 6, r: 0 },
  ],
});

test('aller-retour sérialisation → parse : la carte est reconstruite à l’identique', () => {
  const map = parseMap(sampleMap());
  const again = parseMap(JSON.stringify(serializeMap(map)));
  assert.deepEqual(again, map);
});

test('parseMap complète le terrain en plaine et valide les unités', () => {
  const map = parseMap(sampleMap());
  assert.equal(Object.keys(map.terrain).length, W * H - (H >> 1)); // rangées impaires : W − 1 tuiles
  assert.equal(map.terrain[key(2, 3)], 'foret');
  assert.equal(map.terrain[key(0, 0)], 'plaine');
  assert.equal(map.obstacles[key(6, 0)], 'bunker');
  assert.deepEqual(map.objectives, { [key(5, 5)]: true });
  assert.equal(map.units.length, 3);
});

test('parseMap rejette les cartes invalides avec un message en français', () => {
  const bad = (mutate) => {
    const data = sampleMap();
    mutate(data);
    assert.throws(() => parseMap(data), /Carte invalide/);
  };
  bad((d) => (d.terrain[key(1, 1)] = 'marais')); // terrain inconnu
  bad((d) => (d.terrain['99,0'] = 'foret')); // hex hors plateau
  bad((d) => (d.obstacles[key(1, 1)] = 'mur')); // obstacle inconnu
  bad((d) => d.units.push({ side: 'allies', type: 'inf', c: 1, r: 7 })); // hex déjà occupé
  bad((d) => d.units.push({ side: 'allies', type: 'jeep', c: 2, r: 8 })); // type inconnu
  bad((d) => d.units.push({ side: 'france', type: 'inf', c: 2, r: 8 })); // camp inconnu
  bad((d) => d.units.push({ side: 'allies', type: 'inf', c: -1, r: 8 })); // hors plateau
  bad((d) => (d.units = d.units.filter((u) => u.side !== 'axis'))); // camp vide
  bad((d) => (d.units[1] = { side: 'allies', type: 'arm', c: 6, r: 0 })); // blindé sur bunker
  bad((d) => (d.terrain[key(1, 7)] = 'riviere')); // unité sur une rivière sans pont
  assert.throws(() => parseMap('{pas du json'), /Carte invalide/);

  // la même unité sur la rivière devient valide dès qu'un pont est posé
  const bridged = sampleMap();
  bridged.terrain[key(1, 7)] = 'riviere';
  bridged.obstacles[key(1, 7)] = 'pont';
  assert.equal(parseMap(bridged).obstacles[key(1, 7)], 'pont');
});

test('unitAllowedOn : obstacles réservés à l’infanterie et rivière sans pont', () => {
  const terrain = { [key(5, 5)]: 'riviere', [key(6, 6)]: 'riviere' };
  const obstacles = { [key(3, 3)]: 'bunker', [key(4, 4)]: 'sacs', [key(6, 6)]: 'pont' };
  assert.equal(unitAllowedOn(terrain, obstacles, 'inf', 3, 3), true);
  assert.equal(unitAllowedOn(terrain, obstacles, 'arm', 3, 3), false);
  assert.equal(unitAllowedOn(terrain, obstacles, 'art', 3, 3), true); // artillerie retranchée au départ
  assert.equal(unitAllowedOn(terrain, obstacles, 'art', 4, 4), true); // sacs : accès libre
  assert.equal(unitAllowedOn(terrain, obstacles, 'arm', 0, 0), true); // hex sans obstacle
  assert.equal(unitAllowedOn(terrain, obstacles, 'inf', 5, 5), false); // rivière sans pont
  assert.equal(unitAllowedOn(terrain, obstacles, 'arm', 6, 6), true); // rivière avec pont
  terrain[key(2, 2)] = 'mer';
  assert.equal(unitAllowedOn(terrain, obstacles, 'arm', 2, 2), true); // mer : débarquement permis
});

test('setupFromMap matérialise des unités neuves sans partager la carte', () => {
  const map = parseMap(sampleMap());
  const a = setupFromMap(map);
  const b = setupFromMap(map);
  assert.equal(new Set(a.units.map((u) => u.id)).size, a.units.length);
  for (const u of a.units) {
    assert.equal(u.figs, UNITS[u.type].figs);
    assert.equal(u.acted, false);
  }
  // les mutations d'une partie ne fuient ni vers la carte ni vers l'autre partie
  a.units[0].figs = 1;
  a.terrain[key(0, 0)] = 'village';
  delete a.obstacles[key(6, 0)];
  assert.equal(b.units[0].figs, UNITS[b.units[0].type].figs);
  assert.equal(b.terrain[key(0, 0)], 'plaine');
  assert.equal(b.obstacles[key(6, 0)], 'bunker');
  assert.equal(map.units[0].figs, undefined);
});
