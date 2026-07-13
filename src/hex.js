// Géométrie hexagonale pure (offset odd-r, pointy-top). Aucune dépendance à l'état.

import { W, H } from './config.js';

export const key = (c, r) => c + ',' + r;
export const inBounds = (c, r) => c >= 0 && c < W && r >= 0 && r < H;

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
