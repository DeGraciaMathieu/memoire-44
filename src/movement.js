// Occupation du plateau et hexes atteignables.

import { OBSTACLES, TERRAIN } from './config.js';
import { key, neighbors } from './hex.js';

export const unitAt = (state, c, r) => state.units.find((u) => u.c === c && u.r === r);

// Clé de l'obstacle posé sur l'hex ('bunker'…), ou undefined.
export const obstacleAt = (state, c, r) => state.obstacles?.[key(c, r)];

// Un obstacle removedOnExit (sacs de sable) est définitivement retiré du
// plateau quand l'unité quitte l'hex — volontairement ou en repli.
export function dropObstacleOnExit(state, c, r) {
  const dropped = obstacleAt(state, c, r);
  if (!OBSTACLES[dropped]?.removedOnExit) return;
  delete state.obstacles[key(c, r)];
  state.bus.emit('obstacleRemoved', { c, r, obstacle: dropped });
}

// hexes atteignables : coût 1/hex, les terrains "stops" arrêtent le mouvement.
// enterAdjacentOnly (bocage) : entrée possible uniquement comme premier pas ;
// exitAdjacentOnly (bocage) : la sortie s'arrête sur l'hex adjacent.
export function reachable(state, unit, maxMove) {
  // artillerie retranchée dans un bunker : fixe, aucune sortie
  const startObstacle = OBSTACLES[obstacleAt(state, unit.c, unit.r)];
  if (unit.type === 'art' && startObstacle?.fixesArtillery) return [];
  const start = TERRAIN[state.terrain[key(unit.c, unit.r)]];
  const max = start.exitAdjacentOnly ? Math.min(maxMove, 1) : maxMove;
  const seen = { [key(unit.c, unit.r)]: 0 };
  const out = [];
  const frontier = [{ c: unit.c, r: unit.r, cost: 0, stopped: false }];
  while (frontier.length) {
    const cur = frontier.shift();
    if (cur.stopped || cur.cost >= max) continue;
    for (const n of neighbors(cur.c, cur.r)) {
      const k = key(n.c, n.r);
      if (unitAt(state, n.c, n.r)) continue; // hex occupé
      const t = TERRAIN[state.terrain[k]];
      if (t.enterAdjacentOnly && cur.cost > 0) continue; // bocage : premier pas seulement
      const o = OBSTACLES[obstacleAt(state, n.c, n.r)];
      if (t.impassable && !o?.makesPassable) continue; // rivière : pont obligatoire
      if (o?.infantryOnly && unit.type !== 'inf') continue; // bunker : infanterie seulement
      const cost = cur.cost + 1;
      if (k in seen && seen[k] <= cost) continue;
      seen[k] = cost;
      out.push({ c: n.c, r: n.r, cost });
      frontier.push({ c: n.c, r: n.r, cost, stopped: t.stops });
    }
  }
  return out;
}
