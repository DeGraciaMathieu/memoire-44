// Géométrie hexagonale pure (offset odd-r, pointy-top). Aucune dépendance à l'état.

import { W, H } from './config.js';

export const key = (c, r) => c + ',' + r;
// Rangées paires : W tuiles ; rangées impaires (décalées d'un demi-hex) :
// W − 1 tuiles — la dernière colonne n'existe pas, comme sur le plateau réel.
export const inBounds = (c, r) => c >= 0 && r >= 0 && r < H && c < W - (r & 1);

export function toCube(c, r) {
  const x = c - (r - (r & 1)) / 2;
  const z = r;
  return [x, -x - z, z];
}

export function hexDistance(a, b) {
  const [ax, ay, az] = toCube(a.c, a.r);
  const [bx, by, bz] = toCube(b.c, b.r);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

function cubeRound(x, y, z) {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return [rx, ry, rz];
}

const cubeToOffset = (x, y, z) => ({ c: x + (z - (z & 1)) / 2, r: z });

// Hexes traversés du centre de a au centre de b, extrémités incluses.
// nudge (±1) écarte la ligne d'un epsilon pour trancher les cas où elle
// longe exactement une arête : chaque signe choisit un des deux hexes riverains.
export function hexLine(a, b, nudge = 1) {
  const n = hexDistance(a, b);
  const [ax, ay, az] = toCube(a.c, a.r);
  const [bx, by, bz] = toCube(b.c, b.r);
  const e = nudge * 1e-6;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    out.push(
      cubeToOffset(
        ...cubeRound(
          ax + (bx - ax) * t + e,
          ay + (by - ay) * t + 2 * e,
          az + (bz - az) * t - 3 * e,
        ),
      ),
    );
  }
  return out;
}

export function neighbors(c, r) {
  const d =
    r & 1
      ? [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
          [1, 1],
          [1, -1],
        ]
      : [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
          [-1, 1],
          [-1, -1],
        ];
  return d.map(([dc, dr]) => ({ c: c + dc, r: r + dr })).filter((h) => inBounds(h.c, h.r));
}
