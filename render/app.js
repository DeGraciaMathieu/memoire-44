// Point d'entrée du rendu : assemble les modules, câble le bus → rendu et
// orchestre le tempo (tours, IA, modale). Aucune règle métier ici : toutes
// les décisions viennent de src/.

import { OBSTACLES, UNITS } from '../src/config.js';
import {
  activableUnits,
  attackUnit,
  barrageTargets,
  canAttackAgain,
  canBreakthrough,
  canCutWire,
  createGame,
  cutWire,
  digIn,
  drawCards,
  endAiTurn,
  endPlayerTurn,
  finishUnit,
  keepReconCard,
  medicTargets,
  moveUnit,
  playCard,
  resolveAirStrike,
  resolveBarrage,
  resolveMedics,
  takeGround,
  takeGroundHex,
  validAirTarget,
} from '../src/game.js';
import { cardFallback, eligibleUnits, moveRange } from '../src/tactics.js';
import { reachable } from '../src/movement.js';
import { parseMap } from '../src/map.js';
import { BIOMES, generateMap } from '../src/generator.js';
import { mulberry32 } from '../src/rng.js';
import { cardById } from '../src/cards.js';
import { diceFor, medalCount, targetsFor } from '../src/combat.js';
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
import { cardSectors, SECTORS } from '../src/sectors.js';
import { createUiState } from './uiState.js';
import { buildBoardLayer } from './board.js';
import { createStage, DPR } from './stage.js';
import { createHud } from './hud.js';
import { createHand } from './hand.js';
import { createCombatModal } from './combatModal.js';
import { attachInput } from './input.js';
import { endgameHTML, SIDE_FR } from './html.js';

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
  onAirStrike: launchAirStrike,
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

/* --- journal : une ligne par combat, le détail des faces vit dans le
   plateau de dés ; le camp du défenseur est implicite (celui qui n'a pas
   la main dans l'en-tête de tour) ------------------------------------- */

function outcomeSuffix(report) {
  let txt = ` : ${report.hits} touche(s)`;
  if (report.flags) txt += `, ${report.flags} drapeau(x)`;
  if (report.flagsIgnored) txt += ' (1 ignoré)';
  if (report.extraLoss) txt += `, dos au mur : ${report.extraLoss} perte(s)`;
  if (report.killed) txt += ' — ★ détruite, médaille';
  return txt;
}

const combatLine = (attacker, defender, report) =>
  `  ${UNITS[attacker.type].label} ⚔ ${UNITS[defender.type].label}${outcomeSuffix(report)}`;

const combatTone = (side, report) =>
  report.killed ? (side === state.playerSide ? 'good' : 'bad') : '';

function wireBus(bus) {
  bus.on('cardsDrawn', ({ side, count }) => {
    if (side === state.playerSide) ui.justDrew = count;
  });
  bus.on('reconChoice', ({ side, ids }) => {
    if (side !== state.playerSide) return; // le choix de l'IA passe par aiReconKeep
    hud.log('▸ Reconnaissance : deux cartes piochées, gardez-en une.', 'hi');
    hand.showReconChoice(ids, (kept) => {
      keepReconCard(state, kept);
      refresh();
      setTimeout(playAiTurn, 700);
    });
  });
  bus.on('cardPlayed', ({ side, card, as, ordersLeft }) => {
    const name = as ? `${card.name} → ${as.name}` : card.name;
    const who = side === state.playerSide ? 'Vous' : SIDE_FR[side];
    const orders = (as ?? card).action ? '' : ` · ${ordersLeft} ordre(s)`;
    hud.log(`${who} — ${name}${orders}`, 'turn');
  });
  bus.on('unitMoved', ({ unit, cost }) => {
    // les déplacements du joueur se lisent sur le plateau : seule l'IA journalise
    if (unit.side === state.aiSide) hud.log(`  ${UNITS[unit.type].label} avance de ${cost} hex.`);
    hud.setMedals(medalTotals()); // un objectif a pu changer de main
    stage.requestDraw();
  });
  bus.on('combatResolved', (o) => {
    hud.showDice(o.report.faces); // le détail des faces vit dans le plateau de dés
    hud.log(combatLine(o.attacker, o.defender, o.report), combatTone(o.attacker.side, o.report));
    hud.setMedals(medalTotals()); // un repli a pu prendre ou libérer un objectif
  });
  bus.on('groundTaken', ({ unit }) => {
    if (unit.side === state.aiSide) hud.log(`  ${UNITS[unit.type].label} prend le terrain.`);
    hud.setMedals(medalTotals());
    stage.requestDraw();
  });
  bus.on('actionStruck', ({ card, side, defender, defenderHex, figsBefore, report }) => {
    hud.showDice(report.faces);
    hud.log(
      `  ${card.name} sur ${UNITS[defender.type].label}${outcomeSuffix(report)}`,
      combatTone(side, report),
    );
    hud.setMedals(medalTotals());
    if (report.hits + report.extraLoss > 0)
      stage.boom(defenderHex, {
        damage: report.hits + report.extraLoss,
        killed: report.killed,
        retreatedId: report.retreated ? defender.id : null,
        corpse: report.killed ? { ...defender, figs: figsBefore } : null,
      });
    stage.requestDraw();
  });
  bus.on('unitHealed', ({ unit, restored, faces }) => {
    hud.showDice(faces);
    hud.log(
      `  ${SIDE_FR[unit.side]} · ${UNITS[unit.type].label} récupère ${restored} figurine(s).`,
      restored && unit.side === state.playerSide ? 'good' : '',
    );
    stage.requestDraw();
  });
  bus.on('medalAwarded', () => hud.setMedals(medalTotals()));
  bus.on('obstaclePlaced', ({ obstacle }) => {
    hud.log(`  ${OBSTACLES[obstacle].label} posés — l’unité se retranche.`);
    stage.requestDraw();
  });
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

/* --- écran de fin de partie ---------------------------------------------
   Affiché une seule fois par partie, avec un battement pour laisser la
   dernière animation (explosion, repli) se terminer sous les yeux du joueur. */

const endScrim = document.getElementById('endScrim');
const endBody = document.getElementById('endBody');
let endShown = false;
document.getElementById('endReplay').onclick = () => {
  endScrim.classList.remove('on');
  restart();
};
document.getElementById('endLook').onclick = () => endScrim.classList.remove('on');

function showEndScreen() {
  if (endShown) return;
  endShown = true;
  setTimeout(() => {
    endBody.innerHTML = endgameHTML(state.winner, state.playerSide, medalTotals());
    endScrim.classList.add('on');
  }, 900);
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
    showEndScreen();
  } else if (state.turn !== state.playerSide) {
    hud.setPrompt(
      state.aiSide === 'axis' ? 'L’Axe joue son tour…' : 'Les Alliés jouent leur tour…',
    );
  } else if (state.phase === 'card') {
    hud.setPrompt('Jouez une carte de commandement.');
  } else if (ui.action?.kind === 'barrage') {
    hud.setPrompt(
      'Barrage : cliquez une unité ennemie — 4 dés, sans protection du terrain ni des drapeaux.',
    );
  } else if (ui.action?.kind === 'air') {
    hud.setPrompt(
      `Attaque aérienne : cliquez jusqu’à ${cardById('air').units - ui.action.picks.length} unité(s) ennemie(s) groupée(s), puis « Déclencher la frappe ».`,
    );
  } else if (ui.action?.kind === 'medics') {
    hud.setPrompt('Médecins & mécanos : cliquez l’unité amie à soigner (1 dé par carte en main).');
  } else if (ui.action?.kind === 'digin') {
    hud.setPrompt('Retranchement : cliquez chaque infanterie qui pose ses sacs de sable.');
  } else if (ui.takeGround) {
    hud.setPrompt('Prise de terrain : cliquez l’hex libéré pour avancer, ailleurs pour rester.');
  } else if (ui.breakthrough) {
    hud.setPrompt(
      ui.breakthrough.type === 'art'
        ? 'Bombardement : cliquez une cible au contour rouge pour le second tir, ailleurs pour terminer.'
        : 'Percée de blindés : cliquez une cible au contour rouge pour attaquer encore, ailleurs pour terminer.',
    );
  } else {
    hud.setPrompt(
      ui.selected
        ? `${UNITS[ui.selected.type].label} — glissez le pion sur un hex clair pour avancer, sur un contour rouge pour tirer.` +
            (ui.cutWire ? ' Ou coupez les barbelés (bouton sous les cartes).' : '')
        : `Ordres restants : ${ordersPrompt()}. Attrapez une unité encadrée de blanc et faites-la glisser.`,
    );
  }
}

// Détail par secteur quand la carte en couvre plusieurs (Avance générale,
// Attaque en tenaille, Reconnaissance en force).
function ordersPrompt() {
  const cd = state.playedCard && cardById(state.playedCard);
  const secs = cd && !cd.action ? cardSectors(cd.sector) : [];
  if (secs.length < 2) return `${state.ordersLeft}`;
  return `${state.ordersLeft} (${secs.map((s) => `${state.orders[s]} ${s === 'centre' ? 'au centre' : 'à ' + s}`).join(', ')})`;
}

// Une carte à choix de secteur (Assaut d'infanterie) passe par le picker si
// plusieurs secteurs ont des unités éligibles ; les autres se jouent direct.
function playPlayerCard(id) {
  const cd = cardById(id);
  if (cd.sector === 'pick') {
    const options = SECTORS.filter((s) => eligibleUnits(state, state.playerSide, cd, s).length > 0);
    if (options.length > 1) {
      hand.showSectorChoice(options, (sector) => beginCard(id, { sector }));
      return;
    }
    beginCard(id, { sector: options[0] ?? null });
    return;
  }
  beginCard(id, {});
}

function beginCard(id, opts) {
  const cd = playCard(state, state.playerSide, id, opts);
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
  } else if (cd.digIn && !cardFallback(state, state.playerSide, cd)) {
    ui.action = { kind: 'digin', targets: activableUnits(state, state.playerSide) };
  } else {
    ui.orderable = activableUnits(state, state.playerSide);
    if (!ui.orderable.length) {
      hud.log('  Aucune unité éligible : la carte est perdue.');
      endTurn();
      return;
    }
  }
  refresh();
}

// Clic pendant une carte tactique : choisit la cible (barrage, médecins,
// retranchement) ou empile les unités de l'attaque aérienne.
function actionClick(hex) {
  const act = ui.action;
  if (!act || !hex) return;
  if (act.kind === 'air') {
    if (!validAirTarget(state, state.playerSide, act.picks, hex)) return;
    act.picks.push(hex);
    if (act.picks.length < cardById('air').units) refresh();
    else launchAirStrike();
    return;
  }
  const target = act.targets.find((u) => u.c === hex.c && u.r === hex.r);
  if (!target) return;
  if (act.kind === 'digin') {
    digIn(state, target);
    act.targets = activableUnits(state, state.playerSide);
    if (state.ordersLeft <= 0 || !act.targets.length) {
      ui.action = null;
      endTurn();
    } else refresh();
    return;
  }
  ui.action = null;
  if (act.kind === 'barrage') {
    resolveBarrage(state, state.playerSide, target);
    afterAction();
    return;
  }
  resolveMedics(state, target);
  // soin réussi : l'unité soignée peut encore recevoir l'ordre de la carte
  if (state.healedUnit && !state.winner) {
    ui.orderable = activableUnits(state, state.playerSide);
    refresh();
  } else afterAction();
}

// Le joueur déclenche l'attaque aérienne sur les unités déjà désignées.
function launchAirStrike() {
  const picks = ui.action?.picks;
  if (!picks?.length) return;
  ui.action = null;
  resolveAirStrike(state, state.playerSide, picks);
  afterAction();
}

function afterAction() {
  if (state.winner) refresh();
  else endTurn();
}

// Une unité déplacée a consommé son ordre : la désélectionner sans tirer clôt
// son activation, sinon le joueur pourrait activer plus d'unités que la carte
// n'en autorise.
function commitMovedSelection() {
  const u = ui.selected;
  if (u && !u.acted && state.moved[u.id] != null) finish(u);
}

function selectUnit(u) {
  if (ui.selected && ui.selected.id !== u.id) commitMovedSelection();
  if (state.phase !== 'orders' || state.turn !== state.playerSide) return; // le tour s'est clos
  if (!ui.orderable.some((z) => z.id === u.id)) {
    refresh(); // le quota du secteur vient de s'épuiser
    return;
  }
  ui.selected = u;
  ui.moves = state.moved[u.id] == null ? reachable(state, u, moveRange(state, u)) : [];
  ui.targets = targetsFor(state, u, state.moved[u.id] || 0);
  ui.cutWire = canCutWire(state, u);
  refresh();
}

function clearSelection() {
  commitMovedSelection();
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
  // second tir du Bombardement : mêmes interactions que la percée de blindés
  if (!state.winner && canAttackAgain(state, u)) {
    const targets = targetsFor(state, u, state.moved[u.id] || 0);
    if (targets.length) {
      ui.breakthrough = u;
      ui.selected = u;
      ui.targets = targets;
      refresh();
      return;
    }
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
  // le quota du secteur de l'unité vient d'être consommé : recalcul des activables
  ui.orderable = activableUnits(state, state.playerSide);
  if (state.ordersLeft <= 0 || !ui.orderable.length) endTurn();
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
  // bonus Reconnaissance : le picker (abonnement reconChoice) relancera l'IA
  if (state.reconChoice) return;
  setTimeout(playAiTurn, 700);
}

/* --- tour de l'IA : elle décide, app.js donne le tempo ------------------- */

async function playAiTurn() {
  if (state.winner) return;
  drawCards(state, state.aiSide);
  const id = aiPickCard(state);
  const picked = cardById(id);
  const opts = picked.sector === 'pick' ? { sector: aiPickSector(state, picked) } : {};
  const cd = playCard(state, state.aiSide, id, opts);
  if (cd.action) {
    await playAiAction(cd);
  } else if (cd.digIn && !cardFallback(state, state.aiSide, cd)) {
    await playAiDigIn();
  } else {
    await executePlans(aiChooseMoves(state, cd.id));
  }
  endAiTurn(state);
  if (state.reconChoice) keepReconCard(state, aiReconKeep(state));
  refresh();
}

// Déroule les activations planifiées par l'IA, avec le tempo des animations.
async function executePlans(plans) {
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
      // second tir du Bombardement
      while (!state.winner && state.units.includes(u) && canAttackAgain(state, u)) {
        const next = aiBreakthroughTarget(state, u);
        if (!next) break;
        ui.aiTargets = [{ c: next.c, r: next.r }];
        stage.requestDraw();
        await sleep(650);
        outcome = attackUnit(state, u, next);
        await playCombat(outcome, true);
        ui.aiTargets = [];
      }
    }
    ui.aiFocus = null;
    ui.aiTargets = [];
    stage.requestDraw();
    await sleep(350);
  }
  ui.aiFocus = null;
  ui.aiTargets = [];
}

// Retranchement de l'IA : chaque infanterie ordonnée pose ses sacs.
async function playAiDigIn() {
  await sleep(450);
  while (!state.winner && state.ordersLeft > 0) {
    const pool = activableUnits(state, state.aiSide);
    if (!pool.length) break;
    const u = pool[0];
    ui.aiFocus = u;
    stage.requestDraw();
    await sleep(500);
    digIn(state, u);
    ui.aiFocus = null;
    stage.requestDraw();
    await sleep(250);
  }
}

// Carte tactique de l'IA : elle choisit la cible, les événements du bus
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
    if (unit) {
      resolveMedics(state, unit);
      // soin réussi : l'unité soignée reçoit l'ordre de la carte
      if (state.healedUnit && !state.winner) {
        await sleep(600);
        await executePlans(aiChooseMoves(state, 'medics'));
      }
    }
  }
  await sleep(900);
  ui.aiTargets = [];
}

/* --- cycle de vie -------------------------------------------------------- */

function startGame(message) {
  state = createGame({ map: currentMap, playerSide: currentSide });
  ui = createUiState();
  endShown = false;
  endScrim.classList.remove('on');
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
// — ou une carte aléatoire via ?random=<graine>&biome=<biome>, régénérée à
// l'identique depuis la graine — et le camp du joueur via ?side=allies|axis
// (Alliés par défaut). Sans paramètre (ou si la carte est illisible), repli
// sur le scénario par défaut.
async function init() {
  const params = new URLSearchParams(location.search);
  currentSide = params.get('side') === 'axis' ? 'axis' : 'allies';
  const seedRaw = params.get('random');
  if (seedRaw !== null) {
    const seed = /^\d+$/.test(seedRaw) ? Number(seedRaw) : (Math.random() * 1e6) | 0;
    const biome = BIOMES[params.get('biome')] ? params.get('biome') : 'campagne';
    const attacker = params.get('attacker');
    currentMap = generateMap({ rng: mulberry32(seed), biome, attacker });
    const profile = BIOMES[biome].coast
      ? ''
      : attacker === 'allies'
        ? ' · assaut allié'
        : attacker === 'axis'
          ? ' · assaut de l’Axe'
          : '';
    currentMap.name = `${BIOMES[biome].label}${profile} · graine ${seed}`;
    startGame(`Carte aléatoire « ${currentMap.name} ». Les Alliés ouvrent le feu.`);
    return;
  }
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
