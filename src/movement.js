// Occupation du plateau et hexes atteignables.

import { TERRAIN } from './config.js';
import { key, neighbors } from './hex.js';

export const unitAt = (state, c, r) => state.units.find((u) => u.c === c && u.r === r);

// hexes atteignables : coût 1/hex, les terrains "stops" arrêtent le mouvement.
// enterAdjacentOnly (bocage) : entrée possible uniquement comme premier pas ;
// exitAdjacentOnly (bocage) : la sortie s'arrête sur l'hex adjacent.
export function reachable(state, unit, maxMove) {
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
      const cost = cur.cost + 1;
      if (k in seen && seen[k] <= cost) continue;
      seen[k] = cost;
      out.push({ c: n.c, r: n.r, cost });
      frontier.push({ c: n.c, r: n.r, cost, stopped: t.stops });
    }
  }
  return out;
}
