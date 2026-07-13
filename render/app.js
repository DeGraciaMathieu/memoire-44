// Point d'entrée du rendu : assemble les modules, câble le bus → rendu et
// orchestre le tempo (tours, IA, modale). Aucune règle métier ici : toutes
// les décisions viennent de src/.

import { OBSTACLES, TERRAIN, UNITS } from '../src/config.js';
import { key } from '../src/hex.js';
import {
  attackUnit,
  canBreakthrough,
  createGame,
  drawCards,
  endAxisTurn,
  endPlayerTurn,
  finishUnit,
  moveUnit,
  orderableUnits,
  playCard,
  takeGround,
  takeGroundHex,
} from '../src/game.js';
import { reachable } from '../src/movement.js';
import { parseMap } from '../src/map.js';
import { diceFor, targetsFor } from '../src/combat.js';
import { aiBreakthroughTarget, aiChooseMoves, aiPickCard, aiTakesGround } from '../src/ai.js';
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
let currentMap = null; // carte de l'éditeur chargée, null = scénario par défaut

const hud = createHud();
const stage = createStage(canvas, () => ({ state, ui, boardLayer }));
const modal = createCombatModal({ requestDraw: stage.requestDraw, getUi: () => ui });
const hand = createHand({ onPlayCard: playAlliedCard, onEndTurn: endTurn, onNewGame: restart });

attachInput(canvas, {
  getState: () => state,
  getUi: () => ui,
  hud,
  stage,
  actions: {
    selectUnit,
    moveTo,
    attackTarget,
    clearSelection,
    refresh,
    confirmTakeGround,
    declineTakeGround,
    finishBreakthrough,
  },
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
    if (o.report.flagsIgnored)
      txt += ` · 1 drapeau ignoré (${OBSTACLES[o.obstacleKey].label.toLowerCase()})`;
    if (o.report.extraLoss) txt += ` · repli impossible : ${o.report.extraLoss} perte(s)`;
    hud.log(txt, o.report.hits || o.report.extraLoss ? 'bad' : '');
    if (o.report.killed) {
      hud.log(
        `  ★ ${UNITS[o.defender.type].label} détruite — médaille pour l’${attacker}.`,
        o.attacker.side === 'allies' ? 'good' : 'bad',
      );
    }
  });
  bus.on('groundTaken', ({ unit }) => {
    const label = UNITS[unit.type].label;
    hud.log(
      unit.side === 'allies'
        ? `  ${label} fait une prise de terrain.`
        : `  Axe · ${label} fait une prise de terrain.`,
    );
    stage.requestDraw();
  });
  bus.on('medalAwarded', () => hud.setMedals(state));
  bus.on('obstacleRemoved', ({ obstacle }) => {
    hud.log(`  ${OBSTACLES[obstacle].label} abandonnés — protection perdue.`);
    stage.requestDraw();
  });
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
  } else if (ui.takeGround) {
    hud.setPrompt('Prise de terrain : cliquez l’hex libéré pour avancer, ailleurs pour rester.');
  } else if (ui.breakthrough) {
    hud.setPrompt(
      'Percée de blindés : cliquez une cible au contour rouge pour attaquer encore, ailleurs pour terminer.',
    );
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
  ui.breakthrough = null;
  ui.targets = [];
  const outcome = attackUnit(state, u, target.unit);
  await modal.play(state, outcome, { auto: false });
  const hex = state.winner ? null : takeGroundHex(state, u, outcome);
  if (hex) {
    ui.takeGround = { unit: u, hex };
    ui.selected = u;
    ui.moves = [{ ...hex, cost: 1 }];
    refresh();
    return;
  }
  finish(u);
}

// Le joueur accepte la prise de terrain ; si le blindé peut percer, on lui
// propose aussitôt ses nouvelles cibles.
function confirmTakeGround() {
  const { unit, hex } = ui.takeGround;
  ui.takeGround = null;
  ui.moves = [];
  takeGround(state, unit, hex);
  if (canBreakthrough(state, unit)) {
    const targets = targetsFor(state, unit, state.moved[unit.id]);
    if (targets.length) {
      ui.breakthrough = unit;
      ui.selected = unit;
      ui.targets = targets;
      refresh();
      return;
    }
  }
  finish(unit);
}

function declineTakeGround() {
  const { unit } = ui.takeGround;
  ui.takeGround = null;
  ui.moves = [];
  finish(unit);
}

function finishBreakthrough() {
  const unit = ui.breakthrough;
  ui.breakthrough = null;
  finish(unit);
}

function finish(u) {
  finishUnit(state, u);
  ui.selected = null;
  ui.moves = [];
  ui.targets = [];
  ui.takeGround = null;
  ui.breakthrough = null;
  if (state.winner) {
    refresh();
    return;
  }
  if (state.ordersLeft <= 0) endTurn();
  else refresh();
}

function endTurn() {
  if (state.winner) return;
  Object.assign(ui, {
    selected: null,
    moves: [],
    targets: [],
    orderable: [],
    drag: null,
    takeGround: null,
    breakthrough: null,
  });
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
      let outcome = attackUnit(state, u, plan.target);
      await modal.play(state, outcome, { auto: true });
      // prise de terrain, puis éventuelle percée de blindés
      let hex = takeGroundHex(state, u, outcome);
      while (hex && !state.winner && aiTakesGround(state, u, hex)) {
        takeGround(state, u, hex);
        stage.requestDraw();
        await sleep(350);
        const next = canBreakthrough(state, u) ? aiBreakthroughTarget(state, u) : null;
        if (!next) break;
        outcome = attackUnit(state, u, next);
        await modal.play(state, outcome, { auto: true });
        hex = takeGroundHex(state, u, outcome);
      }
    }
    stage.requestDraw();
    await sleep(350);
  }
  endAxisTurn(state);
  refresh();
}

/* --- cycle de vie -------------------------------------------------------- */

function startGame(message) {
  state = createGame({ map: currentMap });
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

// Charger une carte JSON de l'éditeur : la partie (et les suivantes via
// « Nouvelle partie ») se joue alors sur cette carte.
const mapFile = document.getElementById('mapFile');
document.getElementById('btnLoadMap').onclick = () => mapFile.click();
mapFile.onchange = async () => {
  const file = mapFile.files[0];
  mapFile.value = '';
  if (!file) return;
  try {
    currentMap = parseMap(await file.text());
  } catch (err) {
    hud.log(`✖ ${err.message}`, 'bad');
    return;
  }
  startGame(`Carte « ${currentMap.name || file.name} ». Les Alliés ouvrent le feu.`);
};

startGame('Secteur bocage. 4 médailles pour l’emporter.');
