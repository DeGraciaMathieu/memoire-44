import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defenseReduction,
  diceFor,
  hasLineOfSight,
  reductionOf,
  resolveCombat,
  rollDice,
  targetsFor,
} from '../src/combat.js';
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
  // l'artillerie attaque la forêt sans malus (defArt: 0), le village reste à −1
  const art = { ...atk, type: 'art' };
  assert.equal(defenseReduction(state, 'art', { c: 5, r: 4 }), 0);
  assert.equal(diceFor(state, art, { c: 5, r: 4, type: 'inf' }), 3); // forêt adjacente : 3 dés pleins
  assert.equal(diceFor(state, art, { c: 6, r: 4, type: 'inf' }), 2); // village adjacent : 3 − 1
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

test('la forêt bloque la ligne de mire : plus de tir ni de cible à travers', () => {
  const art = { id: 'a', side: 'allies', type: 'art', c: 2, r: 4, figs: 2 };
  const enemy = inf('e', 'axis', 6, 4);
  const state = battleState({ terrain: { [key(4, 4)]: 'foret' }, units: [art, enemy] });
  assert.ok(!hasLineOfSight(state, art, enemy));
  assert.equal(diceFor(state, art, enemy), 0);
  assert.equal(targetsFor(state, art, 0).length, 0);
  // sans la forêt, le même tir passe (portée 4 → 2 dés)
  state.terrain[key(4, 4)] = 'plaine';
  assert.ok(hasLineOfSight(state, art, enemy));
  assert.equal(diceFor(state, art, enemy), 2);
  // un village interposé coupe aussi la ligne de mire
  state.terrain[key(4, 4)] = 'village';
  assert.ok(!hasLineOfSight(state, art, enemy));
  assert.equal(diceFor(state, art, enemy), 0);
  // une colline bloque aussi quand les deux camps sont en contrebas
  state.terrain[key(4, 4)] = 'colline';
  assert.ok(!hasLineOfSight(state, art, enemy));
});

test("l'hex du tireur et celui de la cible ne bloquent pas la ligne de mire", () => {
  const shooter = inf('a', 'allies', 4, 4);
  const target = inf('e', 'axis', 6, 4);
  const state = battleState({
    terrain: { [key(4, 4)]: 'foret', [key(6, 4)]: 'foret' },
    units: [shooter, target],
  });
  // tireur en forêt, cible en forêt, plaine entre les deux : tir possible
  assert.ok(hasLineOfSight(state, shooter, target));
  assert.equal(diceFor(state, shooter, target), 1); // 2 dés à portée 2, −1 (forêt)
});

test('ligne longeant une arête : bloquée seulement si les DEUX hexes riverains bloquent', () => {
  const shooter = inf('a', 'allies', 5, 5);
  const target = inf('e', 'axis', 5, 3);
  // la ligne (5,5) → (5,3) longe l'arête entre (5,4) et (6,4)
  const one = battleState({ terrain: { [key(5, 4)]: 'foret' }, units: [shooter, target] });
  assert.ok(hasLineOfSight(one, shooter, target));
  const both = battleState({
    terrain: { [key(5, 4)]: 'foret', [key(6, 4)]: 'foret' },
    units: [shooter, target],
  });
  assert.ok(!hasLineOfSight(both, shooter, target));
  // le bord du plateau ne bloque jamais : arête entre (0,1) et le hors-plateau
  const rim = battleState({
    terrain: { [key(0, 1)]: 'foret' },
    units: [inf('a', 'allies', 0, 0), inf('e', 'axis', 0, 2)],
  });
  assert.ok(hasLineOfSight(rim, { c: 0, r: 0 }, { c: 0, r: 2 }));
});

test('colline : bloque en contrebas, mais pas si une extrémité est à la même altitude', () => {
  const shooter = { id: 'a', side: 'allies', type: 'art', c: 2, r: 4, figs: 2 };
  const target = inf('e', 'axis', 6, 4);
  const hill = { [key(4, 4)]: 'colline' };

  // tireur et cible en contrebas : bloqué
  const low = battleState({ terrain: { ...hill }, units: [shooter, target] });
  assert.ok(!hasLineOfSight(low, shooter, target));
  assert.equal(diceFor(low, shooter, target), 0);

  // cible sur une colline : la vue passe (même altitude que l'obstacle)
  const onHillTarget = battleState({
    terrain: { ...hill, [key(6, 4)]: 'colline' },
    units: [shooter, target],
  });
  assert.ok(hasLineOfSight(onHillTarget, shooter, target));
  assert.equal(diceFor(onHillTarget, shooter, target), 1); // 2 dés à portée 4, −1 (colline)

  // tireur sur une colline : symétrique, la vue passe aussi
  const onHillShooter = battleState({
    terrain: { ...hill, [key(2, 4)]: 'colline' },
    units: [shooter, target],
  });
  assert.ok(hasLineOfSight(onHillShooter, shooter, target));

  // la forêt reste opaque, même vue depuis une colline
  const forestWall = battleState({
    terrain: { [key(2, 4)]: 'colline', [key(4, 4)]: 'foret' },
    units: [shooter, target],
  });
  assert.ok(!hasLineOfSight(forestWall, shooter, target));
});

test("bocage : couvert par type, ligne de mire coupée, pas de tir le tour d'entrée", () => {
  // défense : inf −1, blindé −2 (plancher 1), artillerie sans malus
  const atk = inf('a', 'allies', 5, 5);
  const state = battleState({ terrain: { [key(4, 5)]: 'bocage' }, units: [atk] });
  assert.equal(diceFor(state, atk, { c: 4, r: 5, type: 'inf' }), 2);
  assert.equal(diceFor(state, { ...atk, type: 'arm' }, { c: 4, r: 5, type: 'inf' }), 1);
  assert.equal(diceFor(state, { ...atk, type: 'art' }, { c: 4, r: 5, type: 'inf' }), 3);

  // un bocage interposé coupe la ligne de mire
  const art = { id: 'b', side: 'allies', type: 'art', c: 2, r: 4, figs: 2 };
  const enemy = inf('e', 'axis', 6, 4);
  const blocked = battleState({ terrain: { [key(4, 4)]: 'bocage' }, units: [art, enemy] });
  assert.ok(!hasLineOfSight(blocked, art, enemy));

  // une unité entrée dans un bocage ce tour-ci ne combat pas ; sur place, si
  const entered = inf('i', 'allies', 6, 5);
  const near = inf('x', 'axis', 6, 4);
  const st = battleState({ terrain: { [key(6, 5)]: 'bocage' }, units: [entered, near] });
  assert.equal(targetsFor(st, entered, 1).length, 0);
  assert.equal(targetsFor(st, entered, 0).length, 1);
});

test('bunker : protection non cumulée avec le terrain, ligne de mire coupée', () => {
  const def = inf('d', 'axis', 5, 4);
  const state = battleState({ terrain: { [key(5, 4)]: 'colline' }, units: [def] });
  state.obstacles = { [key(5, 4)]: 'bunker' };
  // le plus fort des deux couverts, jamais la somme : blindé → max(1, 2) = 2
  assert.equal(defenseReduction(state, 'arm', def), 2);
  assert.equal(defenseReduction(state, 'inf', def), 1);
  assert.equal(defenseReduction(state, 'art', def), 1); // la colline compte encore pour l'artillerie
  assert.equal(reductionOf({ def: 1, defArmor: 2, defArt: 0 }, 'art'), 0);

  // un bunker sur un hex intermédiaire coupe la ligne de mire
  const art = { id: 'b', side: 'allies', type: 'art', c: 2, r: 4, figs: 2 };
  const enemy = inf('e', 'axis', 6, 4);
  const los = battleState({ units: [art, enemy] });
  los.obstacles = { [key(4, 4)]: 'bunker' };
  assert.ok(!hasLineOfSight(los, art, enemy));
});

test('bunker : le premier drapeau de chaque jet est ignoré', () => {
  const atk = inf('a', 'allies', 5, 5);
  const def = inf('d', 'axis', 5, 4);
  const state = battleState({ units: [atk, def] });
  state.obstacles = { [key(5, 4)]: 'bunker' };

  const one = resolveCombat(state, atk, def, ['flag']);
  assert.equal(one.flagsIgnored, 1);
  assert.equal(one.retreated, null);
  assert.deepEqual({ c: def.c, r: def.r }, { c: 5, r: 4 }); // il tient la position
  assert.equal(def.figs, 4);

  // deux drapeaux : le premier est ignoré, le second fait replier
  const two = resolveCombat(state, atk, def, ['flag', 'flag']);
  assert.equal(two.flagsIgnored, 1);
  assert.ok(two.retreated);
});

test("bunker : l'artillerie retranchée ne peut pas replier et encaisse", () => {
  const atk = inf('a', 'allies', 6, 4);
  const gun = { id: 'g', side: 'axis', type: 'art', c: 6, r: 3, figs: 2 };
  const state = battleState({ units: [atk, gun] });
  state.obstacles = { [key(6, 3)]: 'bunker' };

  const rep = resolveCombat(state, atk, gun, ['flag', 'flag']);
  assert.equal(rep.flagsIgnored, 1); // le bunker annule le premier
  assert.equal(rep.extraLoss, 1); // le second : fixe, donc perte
  assert.equal(gun.figs, 1);
  assert.deepEqual({ c: gun.c, r: gun.r }, { c: 6, r: 3 });
});

test('antichar : aucune protection ni blocage de vue, mais premier drapeau ignoré', () => {
  const atk = inf('a', 'allies', 5, 5);
  const def = inf('d', 'axis', 5, 4);
  const state = battleState({ units: [atk, def] });
  state.obstacles = { [key(5, 4)]: 'antichar' };
  // pas de couvert : 3 dés pleins à bout portant
  assert.equal(defenseReduction(state, 'inf', def), 0);
  assert.equal(diceFor(state, atk, def), 3);

  // ne coupe pas la ligne de mire
  const art = { id: 'b', side: 'allies', type: 'art', c: 2, r: 4, figs: 2 };
  const enemy = inf('e', 'axis', 6, 4);
  const los = battleState({ units: [art, enemy] });
  los.obstacles = { [key(4, 4)]: 'antichar' };
  assert.ok(hasLineOfSight(los, art, enemy));

  // premier drapeau du jet ignoré, comme au bunker
  const rep = resolveCombat(state, atk, def, ['flag']);
  assert.equal(rep.flagsIgnored, 1);
  assert.equal(rep.retreated, null);
  assert.equal(def.figs, 4);
});

test('sacs de sable : −1 sauf artillerie, vue libre, abandonnés au repli', () => {
  const atk = inf('a', 'allies', 5, 5);
  const def = inf('d', 'axis', 5, 4);
  const state = battleState({ units: [atk, def] });
  state.obstacles = { [key(5, 4)]: 'sacs' };
  // protégé de tous les côtés : −1 contre infanterie et blindés, rien contre l'artillerie
  assert.equal(defenseReduction(state, 'inf', def), 1);
  assert.equal(defenseReduction(state, 'arm', def), 1);
  assert.equal(defenseReduction(state, 'art', def), 0);
  assert.equal(diceFor(state, atk, def), 2);

  // ne coupe pas la ligne de mire
  const art = { id: 'b', side: 'allies', type: 'art', c: 2, r: 4, figs: 2 };
  const enemy = inf('e', 'axis', 6, 4);
  const los = battleState({ units: [art, enemy] });
  los.obstacles = { [key(4, 4)]: 'sacs' };
  assert.ok(hasLineOfSight(los, art, enemy));

  // premier drapeau ignoré ; le second force le repli et les sacs sont retirés
  const events = [];
  state.bus.on('obstacleRemoved', (p) => events.push(p));
  const rep = resolveCombat(state, atk, def, ['flag', 'flag']);
  assert.equal(rep.flagsIgnored, 1);
  assert.ok(rep.retreated);
  assert.equal(state.obstacles[key(5, 4)], undefined);
  assert.deepEqual(events, [{ c: 5, r: 4, obstacle: 'sacs' }]);
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
