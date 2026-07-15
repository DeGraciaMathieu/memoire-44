// Point d'entrée du rendu : assemble les modules, câble le bus → rendu et
// orchestre le tempo (tours, IA, modale). Aucune règle métier ici : toutes
// les décisions viennent de src/.

import { OBSTACLES, TERRAIN, UNITS } from '../src/config.js';
import { key } from '../src/hex.js';
import {
  attackUnit,
  barrageTargets,
  canBreakthrough,
  canCutWire,
  createGame,
  cutWire,
  drawCards,
  endAiTurn,
  endPlayerTurn,
  finishUnit,
  medicTargets,
  moveUnit,
  orderableUnits,
  playCard,
  resolveAirStrike,
  resolveBarrage,
  resolveMedics,
  takeGround,
  takeGroundHex,
  validAirTarget,
} from '../src/game.js';
import { reachable } from '../src/movement.js';
import { parseMap } from '../src/map.js';
import { cardById } from '../src/cards.js';
import { diceFor, medalCount, targetsFor } from '../src/combat.js';
import {
  aiAirHexes,
  aiBarrageTarget,
  aiBreakthroughTarget,
  aiChooseMoves,
  aiMedicsTarget,
  aiPickCard,
  aiTakesGround,
} from '../src/ai.js';
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
let currentSide = 'allies'; // camp du joueur, choisi sur la page d'accueil (?side=)

const hud = createHud();
const stage = createStage(canvas, () => ({ state, ui, boardLayer }));
const modal = createCombatModal({ requestDraw: stage.requestDraw, getUi: () => ui });
const hand = createHand({
  onPlayCard: playPlayerCard,
  onEndTurn: endTurn,
  onNewGame: restart,
  onCutWire: cutSelectedWire,
});

attachInput(canvas, {
  getState: () => state,
  getUi: () => ui,
  hud,
  stage,
  actions: {
    selectUnit,
    moveTo,
    attackTarget,
    actionClick,
    clearSelection,
    refresh,
    confirmTakeGround,
    declineTakeGround,
    finishBreakthrough,
  },
});

// Totaux affichés : médailles de destruction + objectifs occupés.
const medalTotals = () => ({
  allies: medalCount(state, 'allies'),
  axis: medalCount(state, 'axis'),
});

/* --- bus → rendu ------------------------------------------------------- */

function wireBus(bus) {
  bus.on('cardsDrawn', ({ side, count }) => {
    if (side === state.playerSide) ui.justDrew = count;
  });
  bus.on('cardPlayed', ({ side, card, as, ordersLeft }) => {
    const name = as ? `${card.name} — rejoue ${as.name}` : card.name;
    hud.log(
      side === state.playerSide
        ? (as ?? card).action
          ? `▸ ${name}.`
          : `▸ ${name} — ${ordersLeft} unité(s) activable(s).`
        : `▸ ${SIDE_FR[side]} : ${name}.`,
      'hi',
    );
  });
  bus.on('unitMoved', ({ unit, cost }) => {
    const label = UNITS[unit.type].label;
    hud.log(
      unit.side === state.playerSide
        ? `  ${label} avance de ${cost} hex (${TERRAIN[state.terrain[key(unit.c, unit.r)]].label.toLowerCase()}).`
        : `  ${SIDE_FR[unit.side]} · ${label} avance de ${cost} hex.`,
    );
    hud.setMedals(medalTotals()); // un objectif a pu changer de main
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
        o.attacker.side === state.playerSide ? 'good' : 'bad',
      );
    }
    hud.setMedals(medalTotals()); // un repli a pu prendre ou libérer un objectif
  });
  bus.on('groundTaken', ({ unit }) => {
    const label = UNITS[unit.type].label;
    hud.log(
      unit.side === state.playerSide
        ? `  ${label} fait une prise de terrain.`
        : `  ${SIDE_FR[unit.side]} · ${label} fait une prise de terrain.`,
    );
    hud.setMedals(medalTotals());
    stage.requestDraw();
  });
  bus.on(
    'actionStruck',
    ({ card, side, defender, defenderHex, obstacleKey, figsBefore, report }) => {
      hud.showDice(report.faces);
      hud.log(
        `  ${card.name} sur ${UNITS[defender.type].label} ${SIDE_FR[defender.side]} — ${report.faces
          .map((f) => SYM[f])
          .join(' ')}`,
      );
      let txt = `  → ${report.hits} touche(s)`;
      if (report.flags) txt += `, ${report.flags} drapeau(x)`;
      if (report.flagsIgnored)
        txt += ` · 1 drapeau ignoré (${OBSTACLES[obstacleKey].label.toLowerCase()})`;
      if (report.extraLoss) txt += ` · repli impossible : ${report.extraLoss} perte(s)`;
      hud.log(txt, report.hits || report.extraLoss ? 'bad' : '');
      if (report.killed) {
        hud.log(
          `  ★ ${UNITS[defender.type].label} détruite — médaille pour l’${SIDE_FR[side]}.`,
          side === state.playerSide ? 'good' : 'bad',
        );
      }
      hud.setMedals(medalTotals());
      if (report.hits + report.extraLoss > 0)
        stage.boom(defenderHex, {
          damage: report.hits + report.extraLoss,
          killed: report.killed,
          retreatedId: report.retreated ? defender.id : null,
          corpse: report.killed ? { ...defender, figs: figsBefore } : null,
        });
      stage.requestDraw();
    },
  );
  bus.on('unitHealed', ({ unit, restored, faces }) => {
    hud.showDice(faces);
    hud.log(
      `  ${SIDE_FR[unit.side]} · ${UNITS[unit.type].label} récupère ${restored} figurine(s).`,
      restored && unit.side === state.playerSide ? 'good' : '',
    );
    stage.requestDraw();
  });
  bus.on('medalAwarded', () => hud.setMedals(medalTotals()));
  bus.on('obstacleRemoved', ({ obstacle }) => {
    const o = OBSTACLES[obstacle];
    hud.log(
      o.removedOnExit
        ? `  ${o.label} abandonnés — protection perdue.`
        : `  ${o.label} retirés du plateau.`,
    );
    stage.requestDraw();
  });
}

// Joue la modale de combat puis, à sa fermeture, fait exploser l'hex où le
// défenseur a encaissé (touches, pertes de repli ou destruction). Ne rend la
// main qu'une fois le feu éteint et le repli affiché, pour que la prise de
// terrain ou la percée qui suit ne chevauche pas ces animations.
async function playCombat(outcome, auto) {
  await modal.play(state, outcome, { auto });
  const { report, defenderHex, defender, figsBefore } = outcome;
  if (report.hits + report.extraLoss > 0) {
    const ms = stage.boom(defenderHex, {
      damage: report.hits + report.extraLoss,
      killed: report.killed,
      retreatedId: report.retreated ? defender.id : null,
      corpse: report.killed ? { ...defender, figs: figsBefore } : null,
    });
    await sleep(ms + 150); // court battement : le repli se lit avant l'avancée adverse
  }
}

/* --- actions du joueur (appelées par input.js et hand.js) --------------- */

function refresh() {
  hud.setMedals(medalTotals());
  stage.requestDraw();
  hand.render(state, ui);
  if (state.winner) {
    hud.setPrompt(
      (state.winner === state.playerSide ? '★ ' : '✖ ') +
        (state.winner === 'allies' ? 'Victoire alliée.' : 'Les forces de l’Axe l’emportent.'),
    );
  } else if (state.turn !== state.playerSide) {
    hud.setPrompt(
      state.aiSide === 'axis' ? 'L’Axe joue son tour…' : 'Les Alliés jouent leur tour…',
    );
  } else if (state.phase === 'card') {
    hud.setPrompt('Jouez une carte de commandement.');
  } else if (ui.action?.kind === 'barrage') {
    hud.setPrompt('Barrage : cliquez une unité ennemie — 4 dés, sans protection du terrain.');
  } else if (ui.action?.kind === 'air') {
    hud.setPrompt(
      `Attaque aérienne : cliquez encore ${cardById('air').hexes - ui.action.picks.length} hex contigus (2 dés par unité ennemie).`,
    );
  } else if (ui.action?.kind === 'medics') {
    hud.setPrompt('Médecins & mécanos : cliquez l’unité amie à soigner (4 dés à son symbole).');
  } else if (ui.takeGround) {
    hud.setPrompt('Prise de terrain : cliquez l’hex libéré pour avancer, ailleurs pour rester.');
  } else if (ui.breakthrough) {
    hud.setPrompt(
      'Percée de blindés : cliquez une cible au contour rouge pour attaquer encore, ailleurs pour terminer.',
    );
  } else {
    hud.setPrompt(
      ui.selected
        ? `${UNITS[ui.selected.type].label} — glissez le pion sur un hex clair pour avancer, sur un contour rouge pour tirer.` +
            (ui.cutWire ? ' Ou coupez les barbelés (bouton sous les cartes).' : '')
        : `Ordres restants : ${state.ordersLeft}. Attrapez une unité encadrée de blanc et faites-la glisser.`,
    );
  }
}

function playPlayerCard(id) {
  const cd = playCard(state, state.playerSide, id);
  if (cd.action === 'barrage') {
    ui.action = { kind: 'barrage', targets: barrageTargets(state, state.playerSide) };
  } else if (cd.action === 'air') {
    ui.action = { kind: 'air', picks: [] };
  } else if (cd.action === 'medics') {
    const targets = medicTargets(state, state.playerSide);
    if (!targets.length) {
      hud.log('  Aucune unité à soigner : la carte est perdue.');
      endTurn();
      return;
    }
    ui.action = { kind: 'medics', targets };
  } else {
    ui.orderable = orderableUnits(state, state.playerSide, cd.id);
  }
  refresh();
}

// Clic pendant une carte action : choisit la cible (barrage, médecins) ou
// empile les hexs de l'attaque aérienne, puis résout et passe le tour.
function actionClick(hex) {
  const act = ui.action;
  if (!act || !hex) return;
  if (act.kind === 'air') {
    if (!validAirTarget(act.picks, hex)) return;
    act.picks.push(hex);
    if (act.picks.length < cardById('air').hexes) {
      refresh();
      return;
    }
    ui.action = null;
    if (!resolveAirStrike(state, state.playerSide, act.picks).length)
      hud.log('  Attaque aérienne : aucune unité ennemie sous les bombes.');
    afterAction();
    return;
  }
  const target = act.targets.find((u) => u.c === hex.c && u.r === hex.r);
  if (!target) return;
  ui.action = null;
  if (act.kind === 'barrage') resolveBarrage(state, state.playerSide, target);
  else resolveMedics(state, target);
  afterAction();
}

function afterAction() {
  if (state.winner) refresh();
  else endTurn();
}

function selectUnit(u) {
  ui.selected = u;
  ui.moves = reachable(state, u, UNITS[u.type].moveNoFire);
  ui.targets = targetsFor(state, u, state.moved[u.id] || 0);
  ui.cutWire = canCutWire(state, u);
  refresh();
}

function clearSelection() {
  ui.selected = null;
  ui.moves = [];
  ui.targets = [];
  ui.cutWire = false;
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
  ui.cutWire = canCutWire(state, u);
  if (!ui.targets.length && !ui.cutWire) finish(u);
  else refresh();
}

// Le joueur coupe les barbelés de l'unité sélectionnée au lieu de combattre.
function cutSelectedWire() {
  const u = ui.selected;
  cutWire(state, u);
  finish(u);
}

async function attackTarget(u, target) {
  ui.breakthrough = null;
  ui.targets = [];
  ui.cutWire = false; // le combat remplace la coupe des barbelés
  const outcome = attackUnit(state, u, target.unit);
  await playCombat(outcome, false);
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
  ui.cutWire = false;
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
    action: null,
    cutWire: false,
  });
  endPlayerTurn(state);
  refresh();
  setTimeout(playAiTurn, 700);
}

/* --- tour de l'IA : elle décide, app.js donne le tempo ------------------- */

async function playAiTurn() {
  if (state.winner) return;
  drawCards(state, state.aiSide);
  const id = aiPickCard(state);
  const cd = playCard(state, state.aiSide, id);
  if (cd.action) {
    await playAiAction(cd);
    endAiTurn(state);
    refresh();
    return;
  }
  const plans = aiChooseMoves(state, cd.id);

  await sleep(450);
  for (const plan of plans) {
    if (state.winner) break;
    if (!plan || !plan.dest) continue;
    const u = plan.unit;
    if (!state.units.includes(u)) continue;
    // l'unité activée s'illumine un instant avant d'agir
    ui.aiFocus = u;
    stage.requestDraw();
    await sleep(500);
    if (plan.dest.cost > 0) {
      const from = { c: u.c, r: u.r };
      if (moveUnit(state, u, plan.dest) == null) {
        ui.aiFocus = null;
        stage.requestDraw();
        continue;
      }
      await sleep(stage.slideUnit(u, from) + 150);
    }
    if (plan.target && state.units.includes(plan.target) && diceFor(state, u, plan.target) > 0) {
      // la cible est désignée (contour rouge + traceur) avant l'engagement
      ui.aiTargets = [{ c: plan.target.c, r: plan.target.r }];
      stage.requestDraw();
      await sleep(650);
      let outcome = attackUnit(state, u, plan.target);
      await playCombat(outcome, true);
      ui.aiTargets = [];
      // prise de terrain, puis éventuelle percée de blindés
      let hex = takeGroundHex(state, u, outcome);
      while (hex && !state.winner && aiTakesGround(state, u, hex)) {
        const from = { c: u.c, r: u.r };
        takeGround(state, u, hex);
        await sleep(stage.slideUnit(u, from) + 150);
        const next = canBreakthrough(state, u) ? aiBreakthroughTarget(state, u) : null;
        if (!next) break;
        ui.aiTargets = [{ c: next.c, r: next.r }];
        stage.requestDraw();
        await sleep(650);
        outcome = attackUnit(state, u, next);
        await playCombat(outcome, true);
        ui.aiTargets = [];
        hex = takeGroundHex(state, u, outcome);
      }
    }
    ui.aiFocus = null;
    ui.aiTargets = [];
    stage.requestDraw();
    await sleep(350);
  }
  ui.aiFocus = null;
  ui.aiTargets = [];
  endAiTurn(state);
  refresh();
}

// Carte action de l'IA : elle choisit la cible, les événements du bus
// (actionStruck, unitHealed) racontent la frappe.
async function playAiAction(cd) {
  await sleep(600);
  if (cd.action === 'barrage') {
    const target = aiBarrageTarget(state);
    if (target) {
      ui.aiTargets = [{ c: target.c, r: target.r }];
      stage.requestDraw();
      await sleep(650);
      resolveBarrage(state, state.aiSide, target);
    }
  } else if (cd.action === 'air') {
    const strike = aiAirHexes(state);
    if (strike) {
      ui.aiTargets = strike.hexes.map((h) => ({ c: h.c, r: h.r }));
      stage.requestDraw();
      await sleep(800);
      resolveAirStrike(state, state.aiSide, strike.hexes);
    }
  } else if (cd.action === 'medics') {
    const unit = aiMedicsTarget(state);
    if (unit) resolveMedics(state, unit);
  }
  await sleep(900);
  ui.aiTargets = [];
}

/* --- cycle de vie -------------------------------------------------------- */

function startGame(message) {
  state = createGame({ map: currentMap, playerSide: currentSide });
  ui = createUiState();
  boardLayer = buildBoardLayer(state, DPR);
  wireBus(state.bus);
  hud.clearLog();
  hud.clearDice();
  drawCards(state, 'allies');
  drawCards(state, 'axis');
  hud.log(message, 'hi');
  if (currentSide === 'axis') hud.log('Vous commandez l’Axe.', 'hi');
  refresh();
  // les Alliés ouvrent toujours : si le joueur tient l'Axe, l'IA joue d'abord
  if (state.turn !== state.playerSide) setTimeout(playAiTurn, 700);
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

// Démarrage : la page d'accueil transmet la carte choisie via ?map=<fichier>
// et le camp du joueur via ?side=allies|axis (Alliés par défaut). Sans
// paramètre (ou si la carte est illisible), repli sur le scénario par défaut.
async function init() {
  const params = new URLSearchParams(location.search);
  currentSide = params.get('side') === 'axis' ? 'axis' : 'allies';
  const file = params.get('map');
  let error = null;
  if (file) {
    try {
      const res = await fetch(`maps/${file}`);
      if (!res.ok) throw new Error(`carte introuvable (${res.status})`);
      currentMap = parseMap(await res.text());
      startGame(`Carte « ${currentMap.name || file} ». Les Alliés ouvrent le feu.`);
      return;
    } catch (err) {
      error = err;
    }
  }
  startGame('Secteur bocage. 6 médailles pour l’emporter — tenez les villages objectifs.');
  if (error) hud.log(`✖ ${error.message}`, 'bad');
}

init();
