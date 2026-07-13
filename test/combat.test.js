import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defenseReduction, diceFor, resolveCombat, rollDice, targetsFor } from '../src/combat.js';
import { createBus } from '../src/events.js';
import { FACES, W, H } from '../src/config.js';
import { key } from '../src/hex.js';
import { mulberry32 } from './helpers.js';

function battleState({ terrain = {}, units }) {
  const full = {};
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) full[key(c, r)] = 'plaine';
  Object.assign(full, terrain);
  return { terrain: full, units, medals: { allies: 0, axis: 0 }, winner: null, bus: createBus() };
}

const inf = (id, side, c, r, figs = 4) => ({ id, side, type: 'inf', c, r, figs, acted: false });

test('diceFor : portée, couvert du terrain, et minimum de 1 dé', () => {
  const atk = inf('a', 'allies', 5, 5);
  const state = battleState({
    terrain: { [key(5, 4)]: 'foret', [key(6, 4)]: 'village' },
    units: [atk],
  });
  assert.equal(diceFor(state, atk, { c: 6, r: 5, type: 'inf' }), 3); // adjacent en plaine
  assert.equal(diceFor(state, atk, { c: 5, r: 4, type: 'inf' }), 2); // adjacent en forêt (−1)
  assert.equal(diceFor(state, atk, { c: 5, r: 8, type: 'inf' }), 1); // portée 3 : 1 dé
  assert.equal(diceFor(state, atk, { c: 5, r: 1, type: 'inf' }), 0); // hors de portée
  // un blindé subit defArmor mais ne descend jamais sous 1 dé
  const arm = { ...atk, type: 'arm' };
  assert.equal(defenseReduction(state, 'arm', { c: 6, r: 4 }), 2);
  assert.equal(diceFor(state, arm, { c: 6, r: 4, type: 'inf' }), 1);
});

test("targetsFor : l'artillerie ne tire pas après un mouvement, l'infanterie après 2 hexes", () => {
  const enemy = inf('e', 'axis', 6, 4);
  const state = battleState({ units: [enemy] });
  const art = { id: 'a', side: 'allies', type: 'art', c: 6, r: 6, figs: 2 };
  assert.equal(targetsFor({ ...state, units: [art, enemy] }, art, 0).length, 1);
  assert.equal(targetsFor({ ...state, units: [art, enemy] }, art, 1).length, 0);
  const foot = inf('i', 'allies', 6, 5);
  assert.equal(targetsFor({ ...state, units: [foot, enemy] }, foot, 1).length, 1);
  assert.equal(targetsFor({ ...state, units: [foot, enemy] }, foot, 2).length, 0);
});

test('rollDice est déterministe avec un RNG injecté et ne tire que des faces valides', () => {
  const a = rollDice(20, mulberry32(7));
  const b = rollDice(20, mulberry32(7));
  assert.deepEqual(a, b);
  for (const f of a) assert.ok(FACES.includes(f));
});

test('resolveCombat : les touches retirent des figurines', () => {
  const atk = inf('a', 'allies', 5, 5);
  const def = inf('d', 'axis', 6, 5);
  const state = battleState({ units: [atk, def] });
  const report = resolveCombat(state, atk, def, ['inf', 'grenade', 'star']);
  assert.equal(report.hits, 2);
  assert.equal(def.figs, 2);
  assert.equal(report.killed, false);
});

test('resolveCombat : un drapeau fait replier vers la ligne de départ', () => {
  const atk = inf('a', 'allies', 5, 5);
  const def = inf('d', 'axis', 5, 4);
  const state = battleState({ units: [atk, def] });
  const report = resolveCombat(state, atk, def, ['flag']);
  assert.ok(report.retreated);
  assert.ok(def.r < 4); // remonte vers la rangée 0
  assert.equal(def.figs, 4);
});

test('resolveCombat : repli impossible dos au mur = perte supplémentaire', () => {
  const atk = inf('a', 'allies', 3, 1);
  const def = inf('d', 'axis', 3, 0);
  const state = battleState({ units: [atk, def] });
  const report = resolveCombat(state, atk, def, ['flag']);
  assert.equal(report.extraLoss, 1);
  assert.equal(def.figs, 3);
});

test("resolveCombat : l'anéantissement retire l'unité, décerne une médaille et peut gagner la partie", () => {
  const atk = inf('a', 'allies', 5, 5);
  const def = inf('d', 'axis', 6, 5, 1);
  const state = battleState({ units: [atk, def] });
  state.medals.allies = 3;
  const events = [];
  state.bus.on('medalAwarded', (p) => events.push(['medalAwarded', p]));
  state.bus.on('gameWon', (p) => events.push(['gameWon', p]));

  const report = resolveCombat(state, atk, def, ['inf']);
  assert.equal(report.killed, true);
  assert.ok(!state.units.includes(def));
  assert.equal(state.medals.allies, 4);
  assert.equal(state.winner, 'allies');
  assert.deepEqual(events, [
    ['medalAwarded', { side: 'allies', medals: 4 }],
    ['gameWon', { side: 'allies' }],
  ]);
});
