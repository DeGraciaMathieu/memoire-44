// Mode en ligne : application des actions du joueur distant.
//
// Les deux clients créent la même partie (même seed, même carte) et rejouent
// les mêmes appels de src/game.js dans le même ordre : l'aléa passant par
// state.rng, les jets restent identiques des deux côtés (lockstep). Chaque
// action locale est envoyée telle quelle au pair, qui l'applique ici.
//
// Messages du protocole (t = type, unités désignées par leur id) :
//   { t: 'play',    side, card }          → playCard
//   { t: 'move',    unit, c, r }          → moveUnit
//   { t: 'attack',  unit, target }        → attackUnit
//   { t: 'ground',  unit, c, r }          → takeGround (prise de terrain)
//   { t: 'wire',    unit }                → cutWire
//   { t: 'finish',  unit }                → finishUnit
//   { t: 'barrage', side, target }        → resolveBarrage
//   { t: 'air',     side, hexes }         → resolveAirStrike
//   { t: 'medics',  unit }                → resolveMedics
//   { t: 'end',     side }                → endTurn

import {
  attackUnit,
  cutWire,
  endTurn,
  finishUnit,
  moveUnit,
  playCard,
  resolveAirStrike,
  resolveBarrage,
  resolveMedics,
  takeGround,
} from './game.js';

const unitById = (state, id) => state.units.find((u) => u.id === id);

// Applique une action distante sur l'état local et renvoie ce que le rendu
// doit mettre en scène (outcome(s) de combat) — les événements du bus
// racontent le reste comme pour une action locale.
export function applyRemote(state, msg) {
  switch (msg.t) {
    case 'play':
      return { card: playCard(state, msg.side, msg.card) };
    case 'move':
      moveUnit(state, unitById(state, msg.unit), { c: msg.c, r: msg.r });
      return {};
    case 'attack':
      return { outcome: attackUnit(state, unitById(state, msg.unit), unitById(state, msg.target)) };
    case 'ground':
      takeGround(state, unitById(state, msg.unit), { c: msg.c, r: msg.r });
      return {};
    case 'wire':
      cutWire(state, unitById(state, msg.unit));
      return {};
    case 'finish':
      finishUnit(state, unitById(state, msg.unit));
      return {};
    case 'barrage':
      return { outcome: resolveBarrage(state, msg.side, unitById(state, msg.target)) };
    case 'air':
      return { outcomes: resolveAirStrike(state, msg.side, msg.hexes) };
    case 'medics':
      return { outcome: resolveMedics(state, unitById(state, msg.unit)) };
    case 'end':
      endTurn(state, msg.side);
      return {};
    default:
      throw new Error(`message en ligne inconnu : ${msg.t}`);
  }
}
