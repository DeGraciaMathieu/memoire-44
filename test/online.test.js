// Mode en ligne : les deux clients partagent la seed et rejouent les mêmes
// appels dans le même ordre (lockstep). On simule ici les deux clients : les
// actions du joueur actif sont appliquées chez l'autre via applyRemote, et
// les deux états doivent rester strictement identiques.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attackUnit,
  createGame,
  cutWire,
  drawCards,
  endTurn,
  finishUnit,
  moveUnit,
  playCard,
  resolveAirStrike,
  resolveBarrage,
  resolveMedics,
  takeGround,
  takeGroundHex,
} from '../src/game.js';
import { applyRemote } from '../src/online.js';
import { parseMap } from '../src/map.js';
import { mulberry32 } from '../src/rng.js';

const MAP = {
  name: 'duel en ligne',
  terrain: {},
  obstacles: {},
  objectives: {},
  units: [
    { side: 'allies', type: 'inf', c: 4, r: 4 }, // u0
    { side: 'axis', type: 'inf', c: 6, r: 4 }, // u1
    { side: 'axis', type: 'inf', c: 9, r: 7 }, // u2
  ],
};

const ALL_HITS = () => 0; // FACES[0] = 'inf' : que des touches sur l'infanterie

// Les deux clients : hôte allié, invité axe, même seed et même carte.
function pair(seed = 44) {
  const clients = ['allies', 'axis'].map((playerSide) =>
    createGame({ rng: mulberry32(seed), map: parseMap(MAP), playerSide }),
  );
  for (const s of clients) {
    drawCards(s, 'allies');
    drawCards(s, 'axis');
  }
  return clients;
}

// Tout ce qui doit converger (bus et rng exclus).
const snapshot = (s) =>
  JSON.parse(
    JSON.stringify({
      units: s.units,
      obstacles: s.obstacles,
      medals: s.medals,
      hands: s.hands,
      decks: s.decks,
      turn: s.turn,
      phase: s.phase,
      playedCard: s.playedCard,
      ordersLeft: s.ordersLeft,
      moved: s.moved,
      attacks: s.attacks,
      winner: s.winner,
    }),
  );

test('en ligne : un tour allié complet (carte, mouvement, combat, prise de terrain, fin) converge', () => {
  const [a, b] = pair();
  a.hands.allies = ['recon'];
  b.hands.allies = ['recon'];
  for (const s of [a, b]) {
    s.units.find((u) => u.id === 'u1').figs = 1; // la cible tombera d'un coup
    s.rng = ALL_HITS;
  }

  playCard(a, 'allies', 'recon');
  applyRemote(b, { t: 'play', side: 'allies', card: 'recon' });

  const atk = a.units.find((u) => u.id === 'u0');
  moveUnit(a, atk, { c: 5, r: 4 });
  applyRemote(b, { t: 'move', unit: 'u0', c: 5, r: 4 });

  const outcome = attackUnit(a, atk, a.units.find((u) => u.id === 'u1'));
  applyRemote(b, { t: 'attack', unit: 'u0', target: 'u1' });
  assert.ok(outcome.report.killed);

  const hex = takeGroundHex(a, atk, outcome);
  assert.deepEqual(hex, { c: 6, r: 4 });
  takeGround(a, atk, hex);
  applyRemote(b, { t: 'ground', unit: 'u0', c: hex.c, r: hex.r });

  finishUnit(a, atk);
  applyRemote(b, { t: 'finish', unit: 'u0' });
  endTurn(a, 'allies');
  applyRemote(b, { t: 'end', side: 'allies' });

  assert.deepEqual(snapshot(b), snapshot(a));
  assert.equal(b.turn, 'axis');
  assert.equal(b.phase, 'card');
  assert.equal(b.medals.allies, 1);
  assert.equal(b.hands.allies.length, 5); // la fin de tour a bien fait repiocher
});

test('en ligne : la seed partagée donne les mêmes dés des deux côtés (barrage)', () => {
  const [a, b] = pair(7);
  a.hands.axis = ['barrage'];
  b.hands.axis = ['barrage'];

  playCard(b, 'axis', 'barrage');
  applyRemote(a, { t: 'play', side: 'axis', card: 'barrage' });

  const local = resolveBarrage(b, 'axis', b.units.find((u) => u.id === 'u0'));
  const { outcome: mirrored } = applyRemote(a, { t: 'barrage', side: 'axis', target: 'u0' });

  assert.deepEqual(mirrored.report.faces, local.report.faces);
  assert.deepEqual(snapshot(a), snapshot(b));
});

test('en ligne : attaque aérienne et médecins & mécanos convergent', () => {
  const [a, b] = pair(11);
  a.hands.allies = ['air'];
  b.hands.allies = ['air'];
  playCard(a, 'allies', 'air');
  applyRemote(b, { t: 'play', side: 'allies', card: 'air' });
  const hexes = [
    { c: 6, r: 4 },
    { c: 7, r: 4 },
    { c: 8, r: 4 },
    { c: 9, r: 4 },
  ];
  resolveAirStrike(a, 'allies', hexes);
  applyRemote(b, { t: 'air', side: 'allies', hexes });
  assert.deepEqual(snapshot(b), snapshot(a));

  for (const s of [a, b]) {
    s.units.find((u) => u.id === 'u0').figs = 2;
    s.hands.allies = ['medics'];
  }
  playCard(a, 'allies', 'medics');
  applyRemote(b, { t: 'play', side: 'allies', card: 'medics' });
  resolveMedics(a, a.units.find((u) => u.id === 'u0'));
  applyRemote(b, { t: 'medics', unit: 'u0' });
  assert.deepEqual(snapshot(b), snapshot(a));
});

test('en ligne : couper les barbelés se réplique', () => {
  const [a, b] = pair();
  for (const s of [a, b]) s.obstacles['4,4'] = 'barbeles';
  cutWire(a, a.units.find((u) => u.id === 'u0'));
  applyRemote(b, { t: 'wire', unit: 'u0' });
  assert.deepEqual(snapshot(b), snapshot(a));
  assert.equal(b.obstacles['4,4'], undefined);
});

test('en ligne : un message inconnu est refusé', () => {
  const [a] = pair();
  assert.throws(() => applyRemote(a, { t: 'sabotage' }), /message en ligne inconnu/);
});
