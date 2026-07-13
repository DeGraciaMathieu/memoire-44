// Règles de tir et résolution du combat.

import { FACES, H, MEDALS_TO_WIN, TERRAIN, UNITS } from './config.js';
import { hexDistance, key, neighbors } from './hex.js';
import { unitAt } from './movement.js';

// Dés retirés par le terrain du défenseur (les blindés subissent defArmor).
export function defenseReduction(state, attackerType, target) {
  const t = TERRAIN[state.terrain[key(target.c, target.r)]];
  return attackerType === 'arm' && t.dice.defArmor != null ? t.dice.defArmor : t.dice.def;
}

export function diceFor(state, unit, target) {
  const base = UNITS[unit.type].dice[hexDistance(unit, target) - 1];
  if (base === undefined) return 0;
  return Math.max(1, base - defenseReduction(state, unit.type, target));
}

export function targetsFor(state, unit, movedCost) {
  if (unit.type === 'art' && movedCost > 0) return [];
  if (unit.type === 'inf' && movedCost > 1) return [];
  return state.units
    .filter((e) => e.side !== unit.side && diceFor(state, unit, e) > 0)
    .map((e) => ({ unit: e, dice: diceFor(state, unit, e), range: hexDistance(unit, e) }));
}

export function rollDice(n, rng) {
  const faces = [];
  for (let i = 0; i < n; i++) faces.push(FACES[(rng() * 6) | 0]);
  return faces;
}

// Résolution : mutations de l'état + rapport. Zéro rendu, les effets
// visuels sont notifiés via state.bus.
export function resolveCombat(state, attacker, defender, faces) {
  const hitOn = UNITS[defender.type].hitOn;
  let hits = 0;
  let flags = 0;
  for (const f of faces) {
    if (hitOn.includes(f)) hits++;
    else if (f === 'flag') flags++;
  }
  const report = { hits, flags, retreated: null, extraLoss: 0, killed: false, faces };

  defender.figs -= hits;

  // repli : 1 hex vers sa ligne de départ par drapeau ; sinon perte
  if (defender.figs > 0 && flags > 0) {
    const home = defender.side === 'allies' ? H - 1 : 0;
    for (let i = 0; i < flags; i++) {
      const opts = neighbors(defender.c, defender.r)
        .filter((h) => !unitAt(state, h.c, h.r))
        .filter((h) => Math.abs(h.r - home) < Math.abs(defender.r - home))
        .sort((a, b) => hexDistance(b, attacker) - hexDistance(a, attacker));
      if (opts.length) {
        defender.c = opts[0].c;
        defender.r = opts[0].r;
        report.retreated = { c: defender.c, r: defender.r };
      } else {
        defender.figs--;
        report.extraLoss++; // dos au mur
      }
      if (defender.figs <= 0) break;
    }
  }

  if (defender.figs <= 0) {
    report.killed = true;
    state.units = state.units.filter((x) => x.id !== defender.id);
    state.medals[attacker.side]++;
    state.bus.emit('medalAwarded', { side: attacker.side, medals: state.medals[attacker.side] });
    if (state.medals[attacker.side] >= MEDALS_TO_WIN) {
      state.winner = attacker.side;
      state.bus.emit('gameWon', { side: attacker.side });
    }
  }
  return report;
}
