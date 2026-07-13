// Règles de tir et résolution du combat.

import { FACES, H, MEDALS_TO_WIN, TERRAIN, UNITS } from './config.js';
import { hexDistance, hexLine, key, neighbors } from './hex.js';
import { unitAt } from './movement.js';

// Un terrain blocksSight (forêt, village) entre le tireur et la cible coupe
// le tir. Une colline (elevated) intermédiaire ne bloque que si le tireur ET
// la cible sont en contrebas : dès qu'une extrémité est elle-même sur une
// colline (même altitude), la vue passe. Les hexes du tireur et de la cible
// ne comptent pas. Quand la ligne longe exactement une arête, le tir n'est
// bloqué que si les DEUX hexes riverains bloquent (d'où les deux tracés
// nudge ±1) ; le hors-plateau ne bloque pas.
export function hasLineOfSight(state, from, to) {
  const elevated = (h) => {
    const t = state.terrain[key(h.c, h.r)];
    return !!t && !!TERRAIN[t].elevated;
  };
  const lowEnds = !elevated(from) && !elevated(to);
  const blocks = (h) => {
    const t = state.terrain[key(h.c, h.r)];
    return !!t && (TERRAIN[t].blocksSight || (TERRAIN[t].elevated && lowEnds));
  };
  const clear = (nudge) =>
    hexLine(from, to, nudge)
      .slice(1, -1)
      .every((h) => !blocks(h));
  return clear(1) || clear(-1);
}

// Dés retirés par le terrain du défenseur, selon le type de l'attaquant :
// defArmor pour les blindés, defArt pour l'artillerie (0 = sans malus),
// def sinon.
export function defenseReduction(state, attackerType, target) {
  const t = TERRAIN[state.terrain[key(target.c, target.r)]];
  if (attackerType === 'arm' && t.dice.defArmor != null) return t.dice.defArmor;
  if (attackerType === 'art' && t.dice.defArt != null) return t.dice.defArt;
  return t.dice.def;
}

export function diceFor(state, unit, target) {
  const base = UNITS[unit.type].dice[hexDistance(unit, target) - 1];
  if (base === undefined) return 0;
  if (!hasLineOfSight(state, unit, target)) return 0;
  return Math.max(1, base - defenseReduction(state, unit.type, target));
}

export function targetsFor(state, unit, movedCost) {
  if (unit.type === 'art' && movedCost > 0) return [];
  if (unit.type === 'inf' && movedCost > 1) return [];
  const here = TERRAIN[state.terrain[key(unit.c, unit.r)]];
  if (here.noFightOnEnter && movedCost > 0) return []; // bocage : pas de combat le tour d'entrée
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
