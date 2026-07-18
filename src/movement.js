// Occupation du plateau et hexes atteignables.

import { OBSTACLES, TERRAIN, UNITS } from './config.js';
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

// Un obstacle crushedByArmor (barbelés) est retiré du plateau dès qu'un
// blindé entre sur l'hex — mouvement, prise de terrain ou repli — sans lui
// coûter son combat du tour.
export function crushObstacleOnEnter(state, unit) {
  const crushed = obstacleAt(state, unit.c, unit.r);
  if (!UNITS[unit.type].armored || !OBSTACLES[crushed]?.crushedByArmor) return;
  delete state.obstacles[key(unit.c, unit.r)];
  state.bus.emit('obstacleRemoved', { c: unit.c, r: unit.r, obstacle: crushed });
}

// hexes atteignables : coût 1/hex, les terrains et obstacles "stops"
// (forêt, barbelés…) arrêtent le mouvement.
// enterAdjacentOnly (bocage) : entrée possible uniquement comme premier pas ;
// exitAdjacentOnly (bocage) : la sortie s'arrête sur l'hex adjacent.
export function reachable(state, unit, maxMove) {
  // artillerie retranchée dans un bunker : fixe, aucune sortie
  const startObstacle = OBSTACLES[obstacleAt(state, unit.c, unit.r)];
  if (unit.type === 'art' && startObstacle?.fixesArtillery) return [];
  const start = TERRAIN[state.terrain[key(unit.c, unit.r)]];
  let max = start.exitAdjacentOnly ? Math.min(maxMove, 1) : maxMove;
  if (start.moveCap) max = Math.min(max, start.moveCap); // plage : 2 hexes max dans le sable
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
      if (t.moveCap && cost > t.moveCap) continue; // plage : on n'entre jamais au-delà du cap
      if (k in seen && seen[k] <= cost) continue;
      seen[k] = cost;
      out.push({ c: n.c, r: n.r, cost });
      frontier.push({ c: n.c, r: n.r, cost, stopped: t.stops || !!o?.stops });
    }
  }
  return out;
}
