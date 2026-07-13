// Point d'entrée du rendu : assemble les modules, câble le bus → rendu et
// orchestre le tempo (tours, IA, modale). Aucune règle métier ici : toutes
// les décisions viennent de src/.

import { TERRAIN, UNITS } from '../src/config.js';
import { key } from '../src/hex.js';
import {
  attackUnit,
  createGame,
  drawCards,
  endAxisTurn,
  endPlayerTurn,
  finishUnit,
  moveUnit,
  orderableUnits,
  playCard,
} from '../src/game.js';
import { reachable } from '../src/movement.js';
import { diceFor, targetsFor } from '../src/combat.js';
import { aiChooseMoves, aiPickCard } from '../src/ai.js';
import { createUiState } from './uiState.js';
import { buildBoardLayer } from './board.js';
import { createStage, DPR } from './stage.js';
import { createHud } from './hud.js';
import { createHand } from './hand.js';
import { createCombatModal } from './combatModal.js';
import { attachInput } from './input.js';
import { SYM, SIDE_FR } from './html.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const canvas = document.getElementById('cv');

let state;
let ui;
let boardLayer;

const hud = createHud();
const stage = createStage(canvas, () => ({ state, ui, boardLayer }));
const modal = createCombatModal({ requestDraw: stage.requestDraw, getUi: () => ui });
const hand = createHand({ onPlayCard: playAlliedCard, onEndTurn: endTurn, onNewGame: restart });

attachInput(canvas, {
  getState: () => state,
  getUi: () => ui,
  hud,
  stage,
  actions: { selectUnit, moveTo, attackTarget, clearSelection, refresh },
});

/* --- bus → rendu ------------------------------------------------------- */

function wireBus(bus) {
  bus.on('cardsDrawn', ({ side, count }) => {
    if (side === 'allies') ui.justDrew = count;
  });
  bus.on('cardPlayed', ({ side, card, ordersLeft }) => {
    hud.log(
      side === 'allies'
        ? `▸ ${card.name} — ${ordersLeft} unité(s) activable(s).`
        : `▸ Axe : ${card.name}.`,
      'hi',
    );
  });
  bus.on('unitMoved', ({ unit, cost }) => {
    const label = UNITS[unit.type].label;
    hud.log(
      unit.side === 'allies'
        ? `  ${label} avance de ${cost} hex (${TERRAIN[state.terrain[key(unit.c, unit.r)]].label.toLowerCase()}).`
        : `  Axe · ${label} avance de ${cost} hex.`,
    );
    stage.requestDraw();
  });
  bus.on('combatResolved', (o) => {
    hud.showDice(o.report.faces);
    const attacker = SIDE_FR[o.attacker.side];
    hud.log(
      `  ${attacker} · ${UNITS[o.attacker.type].label} tire à ${o.range} — ${o.dice} dés : ${o.report.faces.map((f) => SYM[f]).join(' ')}`,
    );
    let txt = `  → ${o.report.hits} touche(s)`;
    if (o.report.flags) txt += `, ${o.report.flags} drapeau(x)`;
    if (o.report.flagsIgnored) txt += ` · 1 drapeau ignoré (bunker)`;
    if (o.report.extraLoss) txt += ` · repli impossible : ${o.report.extraLoss} perte(s)`;
    hud.log(txt, o.report.hits || o.report.extraLoss ? 'bad' : '');
    if (o.report.killed) {
      hud.log(
        `  ★ ${UNITS[o.defender.type].label} détruite — médaille pour l’${attacker}.`,
        o.attacker.side === 'allies' ? 'good' : 'bad',
      );
    }
  });
  bus.on('medalAwarded', () => hud.setMedals(state));
}

/* --- actions du joueur (appelées par input.js et hand.js) --------------- */

function refresh() {
  hud.setMedals(state);
  stage.requestDraw();
  hand.render(state, ui);
  if (state.winner) {
    hud.setPrompt(
      state.winner === 'allies' ? '★ Victoire alliée.' : '✖ Les forces de l’Axe l’emportent.',
    );
  } else if (state.phase === 'card') {
    hud.setPrompt('Jouez une carte de commandement.');
  } else {
    hud.setPrompt(
      ui.selected
        ? `${UNITS[ui.selected.type].label} — glissez le pion sur un hex clair pour avancer, sur un contour rouge pour tirer.`
        : `Ordres restants : ${state.ordersLeft}. Attrapez une unité encadrée de blanc et faites-la glisser.`,
    );
  }
}

function playAlliedCard(id) {
  playCard(state, 'allies', id);
  ui.orderable = orderableUnits(state, 'allies', id);
  refresh();
}

function selectUnit(u) {
  ui.selected = u;
  ui.moves = reachable(state, u, UNITS[u.type].moveNoFire);
  ui.targets = targetsFor(state, u, state.moved[u.id] || 0);
  refresh();
}

function clearSelection() {
  ui.selected = null;
  ui.moves = [];
  ui.targets = [];
  refresh();
}

function moveTo(u, hex) {
  const cost = moveUnit(state, u, hex);
  if (cost == null) {
    refresh();
    return;
  }
  ui.moves = [];
  ui.targets = targetsFor(state, u, cost);
  if (!ui.targets.length) finish(u);
  else refresh();
}

async function attackTarget(u, target) {
  const outcome = attackUnit(state, u, target.unit);
  await modal.play(state, outcome, { auto: false });
  finish(u);
}

function finish(u) {
  finishUnit(state, u);
  ui.selected = null;
  ui.moves = [];
  ui.targets = [];
  if (state.winner) {
    refresh();
    return;
  }
  if (state.ordersLeft <= 0) endTurn();
  else refresh();
}

function endTurn() {
  if (state.winner) return;
  Object.assign(ui, { selected: null, moves: [], targets: [], orderable: [], drag: null });
  endPlayerTurn(state);
  refresh();
  setTimeout(playAxisTurn, 700);
}

/* --- tour de l'Axe : l'IA décide, app.js donne le tempo ------------------ */

async function playAxisTurn() {
  if (state.winner) return;
  drawCards(state, 'axis');
  const id = aiPickCard(state);
  playCard(state, 'axis', id);
  const plans = aiChooseMoves(state, id);

  await sleep(450);
  for (const plan of plans) {
    if (state.winner) break;
    if (!plan || !plan.dest) continue;
    const u = plan.unit;
    if (!state.units.includes(u)) continue;
    if (plan.dest.cost > 0) {
      if (moveUnit(state, u, plan.dest) == null) continue;
      await sleep(500);
    }
    if (plan.target && state.units.includes(plan.target) && diceFor(state, u, plan.target) > 0) {
      const outcome = attackUnit(state, u, plan.target);
      await modal.play(state, outcome, { auto: true });
    }
    stage.requestDraw();
    await sleep(350);
  }
  endAxisTurn(state);
  refresh();
}

/* --- cycle de vie -------------------------------------------------------- */

function startGame(message) {
  state = createGame();
  ui = createUiState();
  boardLayer = buildBoardLayer(state, DPR);
  wireBus(state.bus);
  hud.clearLog();
  hud.clearDice();
  drawCards(state, 'allies');
  drawCards(state, 'axis');
  hud.log(message, 'hi');
  refresh();
}

function restart() {
  startGame('Nouvelle partie. Les Alliés ouvrent le feu.');
}

startGame('Secteur bocage. 4 médailles pour l’emporter.');
