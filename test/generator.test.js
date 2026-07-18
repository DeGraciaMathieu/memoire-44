// Génération aléatoire de cartes : déterminisme par graine, validité
// systématique au sens de parseMap, symétrie des forces, mode asymétrique
// et biomes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES, generateMap } from '../src/generator.js';
import { parseMap, serializeMap, unitAllowedOn } from '../src/map.js';
import { W, H } from '../src/config.js';
import { key } from '../src/hex.js';
import { mulberry32 } from './helpers.js';

const mirrorKey = (c, r) => key(W - 1 - (r & 1) - c, H - 1 - r);

test('même graine, même carte', () => {
  assert.deepEqual(generateMap({ rng: mulberry32(7) }), generateMap({ rng: mulberry32(7) }));
});

test('la carte générée est toujours valide et jouable, quels que soient graine, mode et biome', () => {
  for (const biome of Object.keys(BIOMES)) {
    for (const symmetric of [true, false]) {
      for (let seed = 1; seed <= 50; seed++) {
        const map = generateMap({ rng: mulberry32(seed), symmetric, biome });
        // parseMap vérifie bornes, hexes doublés, camps présents, emplacements légaux
        const parsed = parseMap(serializeMap({ name: 'aléatoire', ...map }));
        const label = `${biome}, graine ${seed}`;
        assert.ok(parsed.units.length >= 2, `${label} : armées manquantes`);
        assert.ok(Object.keys(parsed.objectives).length >= 1, `${label} : aucun objectif`);
        // chaque objectif est occupable, donc marquable
        for (const k of Object.keys(parsed.objectives)) {
          const [c, r] = k.split(',').map(Number);
          assert.ok(
            unitAllowedOn(parsed.terrain, parsed.obstacles, 'inf', c, r),
            `${label} : objectif inoccupable en ${k}`,
          );
        }
      }
    }
  }
});

test('mode symétrique : armées identiques, chacune dans son camp du plateau', () => {
  const map = generateMap({ rng: mulberry32(3) });
  const roster = (side) =>
    map.units
      .filter((u) => u.side === side)
      .map((u) => u.type)
      .sort();
  assert.deepEqual(roster('allies'), roster('axis'));
  assert.ok(roster('allies').length >= 4); // au moins 3 infanteries + 1 blindé
  assert.ok(map.units.filter((u) => u.side === 'allies').every((u) => u.r >= H - 2));
  assert.ok(map.units.filter((u) => u.side === 'axis').every((u) => u.r <= 1));
});

test('mode symétrique : terrain, obstacles et objectifs en symétrie centrale, tous biomes', () => {
  for (const biome of Object.keys(BIOMES)) {
    const map = generateMap({ rng: mulberry32(9), biome });
    for (const layer of [map.terrain, map.obstacles, map.objectives]) {
      for (const [k, v] of Object.entries(layer)) {
        const [c, r] = k.split(',').map(Number);
        assert.equal(layer[mirrorKey(c, r)], v, `${biome} : hex ${k} sans miroir`);
      }
    }
  }
});

test('le biome oriente le paysage : la forêt domine en Forêt profonde, la colline en Collines', () => {
  const tally = (biome) => {
    const counts = {};
    for (const t of Object.values(generateMap({ rng: mulberry32(21), biome }).terrain))
      if (t !== 'plaine') counts[t] = (counts[t] ?? 0) + 1;
    return counts;
  };
  const foret = tally('foret');
  assert.ok(Object.entries(foret).every(([t, n]) => t === 'foret' || n <= foret.foret));
  const collines = tally('collines');
  assert.ok(Object.entries(collines).every(([t, n]) => t === 'colline' || n <= collines.colline));
});

test('biome Fleuve : une rivière médiane continue, traversable par au moins un pont', () => {
  const map = generateMap({ rng: mulberry32(13), biome: 'fleuve' });
  const mid = (H - 1) >> 1;
  for (let c = 0; c < W; c++) assert.equal(map.terrain[key(c, mid)], 'riviere');
  const bridges = Object.entries(map.obstacles).filter(([, o]) => o === 'pont');
  assert.ok(bridges.length >= 1);
  // chaque pont est bien posé sur la rivière et franchissable
  for (const [k] of bridges) {
    const [c, r] = k.split(',').map(Number);
    assert.equal(r, mid);
    assert.ok(unitAllowedOn(map.terrain, map.obstacles, 'arm', c, r));
  }
});

test('mode asymétrique : le plateau n’est plus en miroir, les camps restent en place', () => {
  const map = generateMap({ rng: mulberry32(9), symmetric: false });
  const broken = Object.entries(map.terrain).some(([k, v]) => {
    const [c, r] = k.split(',').map(Number);
    return map.terrain[mirrorKey(c, r)] !== v;
  });
  assert.ok(broken); // au moins un hex sans reflet
  const allies = map.units.filter((u) => u.side === 'allies');
  const axis = map.units.filter((u) => u.side === 'axis');
  assert.ok(allies.length >= 4 && axis.length >= 4); // deux armées complètes
  assert.ok(allies.every((u) => u.r >= H - 2) && axis.every((u) => u.r <= 1));
});

test('le plateau généré est garni : terrain varié et obstacles présents', () => {
  const map = generateMap({ rng: mulberry32(5) });
  assert.ok(Object.values(map.terrain).some((t) => t !== 'plaine'));
  assert.ok(Object.keys(map.obstacles).length >= 2); // au moins une paire
});
