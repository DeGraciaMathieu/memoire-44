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
import { applyRemote } from '../src/online.js';
import { mulberry32 } from '../src/rng.js';
import { createUiState } from './uiState.js';
import { connectRoom, createRoom, joinRoom } from './net.js';
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
let online = null; // partie en ligne : { role: 'host'|'guest', code, seed, net } — null contre l'IA

const hud = createHud();
const stage = createStage(canvas, () => ({ state, ui, boardLayer }));
const modal = createCombatModal({ requestDraw: stage.requestDraw, getUi: () => ui });
const hand = createHand({
  onPlayCard: playPlayerCard,
  onEndTurn: endTurn,
  onNewGame: restart,
  onCutWire: cutSelectedWire,
});

// Attaché à la première partie : en ligne, l'hôte attend l'adversaire avant
// que `state` existe, et input.js suppose un état présent.
let inputAttached = false;
function attachGameInput() {
  if (inputAttached) return;
  inputAttached = true;
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
}

// Totaux affichés : médailles de destruction + objectifs occupés.
const medalTotals = () => ({
  allies: medalCount(state, 'allies'),
  axis: medalCount(state, 'axis'),
});

// Réplique une action locale chez le joueur distant (no-op contre l'IA).
const send = (msg) =>
  online?.net.send(msg).catch((err) => hud.log(`✖ réseau : ${err.message}`, 'bad'));

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
    hud.setPrompt(online ? 'Tour adverse — en attente du joueur distant…' : 'Tour adverse.');
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
  send({ t: 'play', side: state.playerSide, card: id });
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
    send({ t: 'air', side: state.playerSide, hexes: act.picks });
    if (!resolveAirStrike(state, state.playerSide, act.picks).length)
      hud.log('  Attaque aérienne : aucune unité ennemie sous les bombes.');
    afterAction();
    return;
  }
  const target = act.targets.find((u) => u.c === hex.c && u.r === hex.r);
  if (!target) return;
  ui.action = null;
  if (act.kind === 'barrage') {
    send({ t: 'barrage', side: state.playerSide, target: target.id });
    resolveBarrage(state, state.playerSide, target);
  } else {
    send({ t: 'medics', unit: target.id });
    resolveMedics(state, target);
  }
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
  send({ t: 'move', unit: u.id, c: hex.c, r: hex.r });
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
  send({ t: 'wire', unit: u.id });
  finish(u);
}

async function attackTarget(u, target) {
  ui.breakthrough = null;
  ui.targets = [];
  ui.cutWire = false; // le combat remplace la coupe des barbelés
  const outcome = attackUnit(state, u, target.unit);
  send({ t: 'attack', unit: u.id, target: target.unit.id });
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
  send({ t: 'ground', unit: unit.id, c: hex.c, r: hex.r });
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
  send({ t: 'finish', unit: u.id });
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
  send({ t: 'end', side: state.playerSide });
  refresh();
  if (!online) setTimeout(playAiTurn, 700);
}

/* --- tour du joueur distant (mode en ligne) ------------------------------ */

// Les actions du pair arrivent dans l'ordre où il les a jouées ; on les
// applique une à une avec le même tempo que le tour de l'IA — les événements
// du bus racontent le reste (journal, dés, explosions).
const remoteQueue = [];
let remoteBusy = false;

function onRemoteMessage(msg) {
  if (msg.t === 'joined') {
    startGame(`Partie en ligne — salon ${online.code}. Les Alliés ouvrent le feu.`);
    return;
  }
  if (msg.t === 'restart') {
    online.seed = msg.seed;
    startGame('Nouvelle partie relancée par l’hôte. Les Alliés ouvrent le feu.');
    return;
  }
  remoteQueue.push(msg);
  if (!remoteBusy) drainRemote();
}

async function drainRemote() {
  remoteBusy = true;
  while (remoteQueue.length) {
    try {
      await playRemoteMsg(remoteQueue.shift());
    } catch (err) {
      hud.log(`✖ partie désynchronisée : ${err.message}`, 'bad');
      remoteQueue.length = 0;
    }
  }
  remoteBusy = false;
}

async function playRemoteMsg(msg) {
  const res = applyRemote(state, msg);
  switch (msg.t) {
    case 'attack':
      await playCombat(res.outcome, true);
      break;
    case 'play':
      await sleep(450);
      break;
    case 'move':
    case 'ground':
      await sleep(500);
      break;
    case 'barrage':
    case 'air':
    case 'medics':
      await sleep(900);
      break;
  }
  refresh();
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
    if (plan.dest.cost > 0) {
      if (moveUnit(state, u, plan.dest) == null) continue;
      await sleep(500);
    }
    if (plan.target && state.units.includes(plan.target) && diceFor(state, u, plan.target) > 0) {
      let outcome = attackUnit(state, u, plan.target);
      await playCombat(outcome, true);
      // prise de terrain, puis éventuelle percée de blindés
      let hex = takeGroundHex(state, u, outcome);
      while (hex && !state.winner && aiTakesGround(state, u, hex)) {
        takeGround(state, u, hex);
        stage.requestDraw();
        await sleep(350);
        const next = canBreakthrough(state, u) ? aiBreakthroughTarget(state, u) : null;
        if (!next) break;
        outcome = attackUnit(state, u, next);
        await playCombat(outcome, true);
        hex = takeGroundHex(state, u, outcome);
      }
    }
    stage.requestDraw();
    await sleep(350);
  }
  endAiTurn(state);
  refresh();
}

// Carte action de l'IA : elle choisit la cible, les événements du bus
// (actionStruck, unitHealed) racontent la frappe.
async function playAiAction(cd) {
  await sleep(600);
  if (cd.action === 'barrage') {
    const target = aiBarrageTarget(state);
    if (target) resolveBarrage(state, state.aiSide, target);
  } else if (cd.action === 'air') {
    const strike = aiAirHexes(state);
    if (strike) resolveAirStrike(state, state.aiSide, strike.hexes);
  } else if (cd.action === 'medics') {
    const unit = aiMedicsTarget(state);
    if (unit) resolveMedics(state, unit);
  }
  await sleep(900);
}

/* --- cycle de vie -------------------------------------------------------- */

function startGame(message) {
  remoteQueue.length = 0;
  state = createGame({
    // en ligne, la seed partagée rend les deux clients strictement identiques
    rng: online ? mulberry32(online.seed) : undefined,
    map: currentMap,
    playerSide: currentSide,
  });
  ui = createUiState();
  boardLayer = buildBoardLayer(state, DPR);
  wireBus(state.bus);
  attachGameInput();
  hud.clearLog();
  hud.clearDice();
  drawCards(state, 'allies');
  drawCards(state, 'axis');
  hud.log(message, 'hi');
  if (currentSide === 'axis') hud.log('Vous commandez l’Axe.', 'hi');
  refresh();
  // les Alliés ouvrent toujours : si le joueur tient l'Axe, l'IA joue d'abord
  if (state.turn !== state.playerSide && !online) setTimeout(playAiTurn, 700);
}

function restart() {
  if (online) {
    if (online.role !== 'host') {
      hud.log('Partie en ligne : seul l’hôte peut relancer.', 'bad');
      return;
    }
    online.seed = crypto.getRandomValues(new Uint32Array(1))[0];
    send({ t: 'restart', seed: online.seed });
  }
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

async function fetchMap(file) {
  const res = await fetch(`maps/${file}`);
  if (!res.ok) throw new Error(`carte introuvable (${res.status})`);
  return parseMap(await res.text());
}

// Mode en ligne : l'hôte crée le salon (carte + camp + seed) puis attend que
// l'invité rejoigne avec le code — l'invité reçoit la même configuration et
// le camp laissé libre. La partie démarre des deux côtés à l'arrivée de
// l'invité ; le relais (server.js) ne fait que transporter les messages.
async function initOnline(params) {
  document.getElementById('btnLoadMap').hidden = true;
  try {
    const joinCode = (params.get('join') || '').toUpperCase();
    if (joinCode) {
      const { seed, map, side } = await joinRoom(joinCode);
      currentSide = side;
      if (map) currentMap = await fetchMap(map);
      online = { role: 'guest', code: joinCode, seed };
      online.net = connectRoom(joinCode, 'guest', onRemoteMessage);
      startGame(`Partie en ligne — salon ${joinCode}. Les Alliés ouvrent le feu.`);
    } else {
      const file = params.get('map');
      if (file) currentMap = await fetchMap(file);
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      const { code } = await createRoom({ seed, map: file, hostSide: currentSide });
      online = { role: 'host', code, seed };
      online.net = connectRoom(code, 'host', onRemoteMessage);
      hud.log(`Partie en ligne créée — communiquez le code du salon : ${code}.`, 'hi');
      hud.setPrompt(`Salon ${code} — en attente de l’adversaire…`);
    }
  } catch (err) {
    hud.setPrompt('Partie en ligne impossible.');
    hud.log(`✖ ${err.message}`, 'bad');
  }
}

// Démarrage : la page d'accueil transmet la carte choisie via ?map=<fichier>
// et le camp du joueur via ?side=allies|axis (Alliés par défaut) — plus
// ?online=1 (créer un salon) ou ?join=<code> (le rejoindre). Sans paramètre
// (ou si la carte est illisible), repli sur le scénario par défaut contre l'IA.
async function init() {
  const params = new URLSearchParams(location.search);
  currentSide = params.get('side') === 'axis' ? 'axis' : 'allies';
  if (params.get('online') === '1' || params.get('join')) return initOnline(params);
  const file = params.get('map');
  let error = null;
  if (file) {
    try {
      currentMap = await fetchMap(file);
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
