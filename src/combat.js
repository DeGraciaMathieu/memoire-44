// Règles de tir et résolution du combat.

import { FACES, H, MEDALS_TO_WIN, OBSTACLES, TERRAIN, UNITS } from './config.js';
import { hexDistance, hexLine, key, neighbors } from './hex.js';
import { crushObstacleOnEnter, dropObstacleOnExit, obstacleAt, unitAt } from './movement.js';
import { bonusDice, fightCap } from './tactics.js';

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
    if (!t) return false;
    const o = OBSTACLES[obstacleAt(state, h.c, h.r)];
    return TERRAIN[t].blocksSight || !!o?.blocksSight || (TERRAIN[t].elevated && lowEnds);
  };
  const clear = (nudge) =>
    hexLine(from, to, nudge)
      .slice(1, -1)
      .every((h) => !blocks(h));
  return clear(1) || clear(-1);
}

// Dés retirés par un couvert (terrain ou obstacle), selon le type de
// l'attaquant : defArmor pour les blindés, defArt pour l'artillerie
// (0 = sans malus), def sinon.
export function reductionOf(dice, attackerType) {
  if (attackerType === 'arm' && dice.defArmor != null) return dice.defArmor;
  if (attackerType === 'art' && dice.defArt != null) return dice.defArt;
  return dice.def;
}

// Terrain et obstacle ne se cumulent pas : seule la plus forte des deux
// réductions est retenue.
export function defenseReduction(state, attackerType, target) {
  const t = TERRAIN[state.terrain[key(target.c, target.r)]];
  const o = OBSTACLES[obstacleAt(state, target.c, target.r)];
  const fromTerrain = reductionOf(t.dice, attackerType);
  return o ? Math.max(fromTerrain, reductionOf(o.dice, attackerType)) : fromTerrain;
}

// Malus de l'assaillant : une infanterie empêtrée dans un obstacle
// entanglesInfantry (barbelés) combat avec 1 dé de moins.
export function attackerSnare(state, unit) {
  const o = OBSTACLES[obstacleAt(state, unit.c, unit.r)];
  return unit.type === 'inf' && o?.entanglesInfantry ? 1 : 0;
}

export function diceFor(state, unit, target) {
  const range = hexDistance(unit, target);
  const base = UNITS[unit.type].dice[range - 1];
  if (base === undefined) return 0;
  if (!hasLineOfSight(state, unit, target)) return 0;
  return (
    Math.max(1, base - defenseReduction(state, unit.type, target) - attackerSnare(state, unit)) +
    bonusDice(state, unit, range)
  );
}

// Éligibilité au combat pour l'activation en cours : restrictions liées au
// mouvement effectué et au terrain occupé — indépendante des cibles. Le coût
// de mouvement toléré vient du type, ou de la carte tactique en cours.
export function canFight(state, unit, movedCost) {
  if (movedCost > fightCap(state, unit)) return false;
  const here = TERRAIN[state.terrain[key(unit.c, unit.r)]];
  if (here.noFight) return false; // mer : aucun combat à bord d'une barge
  if (here.noFightOnEnter && movedCost > 0) return false; // bocage : pas de combat le tour d'entrée
  return true;
}

export function targetsFor(state, unit, movedCost) {
  if (!canFight(state, unit, movedCost)) return [];
  const targets = state.units
    .filter((e) => e.side !== unit.side && diceFor(state, unit, e) > 0)
    .map((e) => ({ unit: e, dice: diceFor(state, unit, e), range: hexDistance(unit, e) }));
  // combat rapproché obligatoire : au contact d'un ennemi, pas de tir plus loin
  return targets.some((t) => t.range === 1) ? targets.filter((t) => t.range === 1) : targets;
}

// Objectifs possédés : une tuile objectif compte pour le camp dont une unité
// l'occupe — possession perdue dès que l'unité la quitte.
export function objectivesHeld(state, side) {
  let held = 0;
  for (const k of Object.keys(state.objectives ?? {})) {
    const [c, r] = k.split(',').map(Number);
    if (unitAt(state, c, r)?.side === side) held++;
  }
  return held;
}

// Total de médailles d'un camp : unités détruites + objectifs occupés.
export function medalCount(state, side) {
  return state.medals[side] + objectivesHeld(state, side);
}

// À appeler après tout événement qui change le décompte (destruction, repli,
// mouvement, prise de terrain) : pose state.winner et émet gameWon.
export function checkVictory(state) {
  if (state.winner) return;
  for (const side of ['allies', 'axis']) {
    if (medalCount(state, side) >= MEDALS_TO_WIN) {
      state.winner = side;
      state.bus.emit('gameWon', { side });
      return;
    }
  }
}

export function rollDice(n, rng) {
  const faces = [];
  for (let i = 0; i < n; i++) faces.push(FACES[(rng() * 6) | 0]);
  return faces;
}

// Résolution : mutations de l'état + rapport. Zéro rendu, les effets
// visuels sont notifiés via state.bus. Options des frappes tactiques :
// `starHits` : l'étoile touche aussi ; `noFlagCover` : aucun obstacle ne
// permet d'ignorer un drapeau.
export function resolveCombat(state, attacker, defender, faces, opts = {}) {
  const hitOn = UNITS[defender.type].hitOn;
  let hits = 0;
  let flags = 0;
  for (const f of faces) {
    if (hitOn.includes(f) || (opts.starHits && f === 'star')) hits++;
    else if (f === 'flag') flags++;
  }
  const report = {
    hits,
    flags,
    flagsIgnored: 0,
    retreated: null,
    extraLoss: 0,
    killed: false,
    faces,
  };

  defender.figs -= hits;

  // un obstacle ignoreFirstFlag (bunker) annule le premier drapeau du jet
  // (simplification assumée : toujours appliqué, sans choix du défenseur)
  const cover = opts.noFlagCover ? null : OBSTACLES[obstacleAt(state, defender.c, defender.r)];
  let effectiveFlags = flags;
  if (cover?.ignoreFirstFlag && flags > 0) {
    effectiveFlags--;
    report.flagsIgnored = 1;
  }

  // repli : 1 hex vers sa ligne de départ par drapeau ; sinon perte
  if (defender.figs > 0 && effectiveFlags > 0) {
    const home = defender.side === 'allies' ? H - 1 : 0;
    for (let i = 0; i < effectiveFlags; i++) {
      // artillerie retranchée : aucun repli possible
      const here = OBSTACLES[obstacleAt(state, defender.c, defender.r)];
      const fixed = defender.type === 'art' && here?.fixesArtillery;
      const opts = fixed
        ? []
        : neighbors(defender.c, defender.r)
            .filter((h) => !unitAt(state, h.c, h.r))
            .filter((h) => {
              const t = TERRAIN[state.terrain[key(h.c, h.r)]];
              const ob = OBSTACLES[obstacleAt(state, h.c, h.r)];
              if (t.impassable && !ob?.makesPassable) return false; // rivière sans pont
              if (t.noRetreatInto) return false; // mer : pas de retraite dans l'eau
              return !ob?.infantryOnly || defender.type === 'inf';
            })
            .filter((h) => Math.abs(h.r - home) < Math.abs(defender.r - home))
            .sort((a, b) => hexDistance(b, attacker) - hexDistance(a, attacker));
      if (opts.length) {
        const from = { c: defender.c, r: defender.r };
        defender.c = opts[0].c;
        defender.r = opts[0].r;
        report.retreated = { c: defender.c, r: defender.r };
        dropObstacleOnExit(state, from.c, from.r);
        crushObstacleOnEnter(state, defender);
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
  }
  // destruction, mais aussi repli sur/hors d'un objectif : on recompte tout
  checkVictory(state);
  return report;
}
