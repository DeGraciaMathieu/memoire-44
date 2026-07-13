// Scénario « secteur bocage » : terrain initial et ordre de bataille.

import { W, H, UNITS } from './config.js';
import { key } from './hex.js';

export function scenario() {
  const terrain = {};
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) terrain[key(c, r)] = 'plaine';
  const put = (t, list) => list.forEach(([c, r]) => (terrain[key(c, r)] = t));
  put('foret', [
    [1, 2],
    [2, 2],
    [2, 3],
    [10, 5],
    [11, 5],
    [11, 6],
    [6, 1],
    [7, 7],
  ]);
  put('colline', [
    [4, 4],
    [5, 4],
    [8, 4],
    [3, 6],
    [9, 2],
  ]);
  put('village', [
    [6, 4],
    [6, 5],
    [2, 7],
    [10, 1],
  ]);
  put('bocage', [
    [3, 3],
    [7, 3],
    [5, 2],
    [9, 6],
  ]);

  // obstacles posés sur le terrain
  const obstacles = {
    [key(6, 0)]: 'bunker', // l'artillerie de l'Axe y est retranchée (fixe)
    [key(4, 6)]: 'bunker',
  };

  const units = [];
  let id = 0;
  const add = (side, type, c, r) =>
    units.push({ id: 'u' + id++, side, type, c, r, figs: UNITS[type].figs, acted: false });
  // Alliés (joueur, en bas)
  add('allies', 'inf', 1, 7);
  add('allies', 'inf', 4, 7);
  add('allies', 'inf', 7, 8);
  add('allies', 'inf', 11, 7);
  add('allies', 'arm', 5, 8);
  add('allies', 'arm', 9, 8);
  add('allies', 'art', 6, 8);
  // Axe (IA, en haut)
  add('axis', 'inf', 1, 1);
  add('axis', 'inf', 4, 1);
  add('axis', 'inf', 8, 1);
  add('axis', 'inf', 11, 1);
  add('axis', 'arm', 3, 0);
  add('axis', 'arm', 9, 0);
  add('axis', 'art', 6, 0);

  return { terrain, units, obstacles };
}
