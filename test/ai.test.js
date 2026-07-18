import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aiAirHexes,
  aiBarrageTarget,
  aiBreakthroughTarget,
  aiChooseMoves,
  aiMedicsTarget,
  aiPickCard,
  aiPickSector,
  aiReconKeep,
  aiTakesGround,
} from '../src/ai.js';
import { createGame, playCard } from '../src/game.js';
import { cardById } from '../src/cards.js';
import { parseMap } from '../src/map.js';
import { sectorsOf } from '../src/sectors.js';
import { hexDistance, key } from '../src/hex.js';
import { mulberry32 } from './helpers.js';

// Plateau sur mesure pour isoler une préférence de l'IA.
function board({ units, terrain = {}, objectives = {} }) {
  const map = parseMap({ name: 'ia', terrain, obstacles: {}, objectives, units });
  return createGame({ rng: mulberry32(7), map });
}

test('aiPickCard choisit la carte qui active le plus de monde', () => {
  const state = createGame({ rng: mulberry32(1) });
  // toutes les unités de l'Axe à gauche : atk-g doit l'emporter sur atk-d
  state.units = state.units.map((u) => (u.side === 'axis' ? { ...u, c: 1 } : u));
  state.hands.axis = ['atk-d', 'atk-g'];
  assert.equal(aiPickCard(state), 'atk-g');
});

test('l’IA joue les Alliés quand le joueur choisit l’Axe', () => {
  const state = createGame({ rng: mulberry32(3), playerSide: 'axis' });
  // toutes les unités alliées à gauche : atk-g doit l'emporter sur atk-d
  state.units = state.units.map((u) => (u.side === 'allies' ? { ...u, c: 1 } : u));
  state.hands.allies = ['atk-d', 'atk-g'];
  assert.equal(aiPickCard(state), 'atk-g');
  for (const p of aiChooseMoves(state, 'avance')) assert.equal(p.unit.side, 'allies');
});

test('aiChooseMoves respecte le quota par secteur, chaque plan a une unité et une destination', () => {
  const state = createGame({ rng: mulberry32(2) });
  const plans = aiChooseMoves(state, 'avance'); // 2 unités par secteur au plus
  assert.ok(plans.length <= 6);
  assert.ok(plans.length > 0);
  for (const p of plans) {
    assert.equal(p.unit.side, 'axis');
    assert.ok(p.dest);
    assert.ok(p.dest.cost >= 0);
  }

  // plateau sans hex à cheval : 3 unités au centre, 1 à gauche → 2 + 1 plans
  const crafted = board({
    units: [
      { side: 'axis', type: 'inf', c: 5, r: 2 },
      { side: 'axis', type: 'inf', c: 6, r: 2 },
      { side: 'axis', type: 'inf', c: 7, r: 2 },
      { side: 'axis', type: 'inf', c: 1, r: 2 },
      { side: 'allies', type: 'inf', c: 5, r: 8 },
    ],
  });
  const quotas = aiChooseMoves(crafted, 'avance');
  assert.equal(quotas.length, 3);
  const inCentre = quotas.filter((p) => sectorsOf(p.unit.c, p.unit.r).includes('centre')).length;
  assert.equal(inCentre, 2);
});

test("prise d'objectif : sans cible, l'IA avance sur la tuile à portée", () => {
  const state = board({
    objectives: { [key(5, 4)]: true },
    units: [
      { side: 'axis', type: 'inf', c: 5, r: 2 },
      { side: 'allies', type: 'inf', c: 5, r: 8 },
    ],
  });
  const [plan] = aiChooseMoves(state, 'rec-c');
  assert.deepEqual({ c: plan.dest.c, r: plan.dest.r }, { c: 5, r: 4 });
});

test("maintien d'objectif : l'unité qui tient la tuile ne la quitte pas", () => {
  const state = board({
    objectives: { [key(5, 4)]: true },
    units: [
      { side: 'axis', type: 'inf', c: 5, r: 4 },
      { side: 'allies', type: 'inf', c: 5, r: 8 },
    ],
  });
  const [plan] = aiChooseMoves(state, 'rec-c');
  assert.deepEqual({ c: plan.dest.c, r: plan.dest.r }, { c: 5, r: 4 });
  assert.equal(plan.dest.cost, 0);
});

test("objectif réservé au joueur : l'IA lui préfère la tuile qui lui rapporte", () => {
  const state = board({
    objectives: { [key(5, 2)]: 'axis', [key(5, 5)]: 'allies' },
    units: [
      { side: 'axis', type: 'inf', c: 5, r: 4 },
      { side: 'allies', type: 'inf', c: 0, r: 8 },
    ],
  });
  // la tuile alliée est plus proche de l'ennemi, mais ne rapporte rien à l'IA
  const [plan] = aiChooseMoves(state, 'rec-c');
  assert.deepEqual({ c: plan.dest.c, r: plan.dest.r }, { c: 5, r: 2 });
});

test("protection : l'IA vise l'occupant d'un objectif qui fait marquer le joueur", () => {
  const state = board({
    objectives: { [key(4, 4)]: 'allies' },
    units: [
      { side: 'axis', type: 'inf', c: 5, r: 4 },
      { side: 'allies', type: 'inf', c: 5, r: 3 }, // à portée, hors objectif
      { side: 'allies', type: 'inf', c: 4, r: 4 }, // tient l'objectif allié
    ],
  });
  // à dés égaux, déloger l'occupant qui marque passe avant l'autre cible
  const [plan] = aiChooseMoves(state, 'rec-c');
  assert.equal(plan.target, state.units[2]);
});

test('aiReconKeep garde la carte qui active le plus de monde', () => {
  const state = board({
    units: [
      { side: 'axis', type: 'inf', c: 1, r: 2 },
      { side: 'axis', type: 'inf', c: 2, r: 2 }, // tout le monde à gauche
      { side: 'allies', type: 'inf', c: 5, r: 8 },
    ],
  });
  state.reconChoice = { side: 'axis', ids: ['atk-d', 'atk-g'] };
  assert.equal(aiReconKeep(state), 'atk-g');
  state.reconChoice = { side: 'axis', ids: ['atk-g', 'atk-d'] };
  assert.equal(aiReconKeep(state), 'atk-g');
});

test('aiPickCard préfère le barrage quand une médaille est à portée de dés', () => {
  const state = board({
    units: [
      { side: 'axis', type: 'inf', c: 1, r: 0 },
      { side: 'allies', type: 'inf', c: 12, r: 8 },
    ],
  });
  state.units[1].figs = 1; // 4 dés suffisent à l'achever
  state.hands.axis = ['atk-d', 'barrage'];
  assert.equal(aiPickCard(state), 'barrage');
});

test("aiBarrageTarget vise l'unité que 4 dés peuvent achever", () => {
  const state = board({
    units: [
      { side: 'axis', type: 'inf', c: 5, r: 2 },
      { side: 'allies', type: 'inf', c: 4, r: 8 },
      { side: 'allies', type: 'inf', c: 6, r: 8 },
    ],
  });
  state.units[2].figs = 1;
  assert.equal(aiBarrageTarget(state), state.units[2]);
});

test("aiAirHexes vise le plus grand groupe d'unités alliées adjacentes entre elles", () => {
  const state = board({
    units: [
      { side: 'axis', type: 'inf', c: 0, r: 0 },
      { side: 'allies', type: 'inf', c: 5, r: 8 },
      { side: 'allies', type: 'inf', c: 6, r: 8 },
      { side: 'allies', type: 'inf', c: 12, r: 0 },
    ],
  });
  const strike = aiAirHexes(state);
  assert.equal(strike.units, 2); // la paire, pas l'unité isolée
  assert.equal(strike.hexes.length, 2); // uniquement des hexs occupés par l'ennemi
  // chaque hex du groupe touche un hex choisi avant lui
  for (let i = 1; i < strike.hexes.length; i++) {
    assert.ok(strike.hexes.slice(0, i).some((h) => hexDistance(h, strike.hexes[i]) === 1));
  }
});

test("aiMedicsTarget répare l'unité la plus amochée, ou personne", () => {
  const state = board({
    units: [
      { side: 'axis', type: 'inf', c: 1, r: 1 },
      { side: 'axis', type: 'arm', c: 3, r: 1 },
      { side: 'allies', type: 'inf', c: 5, r: 8 },
    ],
  });
  assert.equal(aiMedicsTarget(state), null); // personne d'amoché
  state.units[0].figs = 3; // 1 perte
  state.units[1].figs = 1; // 2 pertes
  assert.equal(aiMedicsTarget(state), state.units[1]);
});

test('aiPickSector choisit le secteur le plus fourni en unités éligibles', () => {
  const state = board({
    units: [
      { side: 'axis', type: 'inf', c: 5, r: 2 },
      { side: 'axis', type: 'inf', c: 6, r: 2 }, // deux infanteries au centre
      { side: 'axis', type: 'inf', c: 1, r: 2 }, // une à gauche
      { side: 'axis', type: 'arm', c: 11, r: 2 }, // blindé à droite : inéligible
      { side: 'allies', type: 'inf', c: 5, r: 8 },
    ],
  });
  // Assaut d'infanterie (secteur au choix, infanteries seulement) : le centre l'emporte
  assert.equal(aiPickSector(state, cardById('infantry-assault')), 'centre');
});

test('aiChooseMoves avec une carte tactique : quota global, pas de quota par secteur', () => {
  const state = board({
    units: [
      { side: 'axis', type: 'inf', c: 4, r: 2 },
      { side: 'axis', type: 'inf', c: 5, r: 2 },
      { side: 'axis', type: 'inf', c: 6, r: 2 }, // trois unités du même secteur
      { side: 'allies', type: 'inf', c: 5, r: 8 },
    ],
  });
  state.turn = 'axis';
  state.hands.axis = ['hq'];
  playCard(state, 'axis', 'hq');
  assert.equal(state.ordersLeft, 3); // n = 4, plafonné par les unités éligibles

  // une carte de commandement aurait plafonné le centre à 2 ; la Directive
  // du QG active les trois
  const plans = aiChooseMoves(state, 'hq');
  assert.equal(plans.length, 3);
  for (const p of plans) {
    assert.equal(p.unit.side, 'axis');
    assert.ok(p.dest);
  }
});

test('aiBreakthroughTarget vise la cible que le tir peut achever, ou personne', () => {
  const state = board({
    units: [
      { side: 'axis', type: 'arm', c: 5, r: 4 },
      { side: 'axis', type: 'arm', c: 12, r: 0 }, // isolé, aucune cible à portée
      { side: 'allies', type: 'inf', c: 5, r: 3 }, // intacte
      { side: 'allies', type: 'inf', c: 5, r: 5 }, // 1 figurine : achevable
    ],
  });
  const [arm, lone, , weak] = state.units;
  weak.figs = 1;
  assert.equal(aiBreakthroughTarget(state, arm), weak);
  assert.equal(aiBreakthroughTarget(state, lone), null);
});

test('aiTakesGround : ne lâche jamais un objectif tenu, avance toujours sur un objectif', () => {
  const state = board({
    terrain: { [key(5, 5)]: 'foret' },
    objectives: { [key(5, 4)]: true },
    units: [
      { side: 'axis', type: 'inf', c: 5, r: 5 },
      { side: 'axis', type: 'arm', c: 5, r: 4 },
      { side: 'allies', type: 'inf', c: 5, r: 8 },
    ],
  });
  const [inf, arm] = state.units;
  // l'infanterie quitte sa forêt pour un objectif en plaine…
  assert.equal(aiTakesGround(state, inf, { c: 5, r: 4 }), true);
  // …mais pas pour une plaine ordinaire
  assert.equal(aiTakesGround(state, inf, { c: 4, r: 4 }), false);
  // le blindé qui tient l'objectif refuse d'avancer, même lui
  assert.equal(aiTakesGround(state, arm, { c: 5, r: 3 }), false);
});
