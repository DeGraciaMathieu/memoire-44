// Génération aléatoire d'une carte pour l'éditeur. En mode symétrique
// (défaut), terrains, obstacles, objectifs et armées sont posés en miroir
// (symétrie centrale du plateau) : la carte est équitable d'entrée. En mode
// libre (symmetric: false), chaque moitié est tirée indépendamment. Le biome
// choisi oriente le paysage (palette de terrains, densité, fleuve médian).
// La carte produite est toujours valide au sens de parseMap, prête à être
// retouchée.

import { W, H } from './config.js';
import { key, neighbors } from './hex.js';
import { unitAllowedOn } from './map.js';

const pick = (rng, list) => list[(rng() * list.length) | 0];

// Symétrie centrale (rotation à 180°) : les rangées impaires n'ont que W − 1
// colonnes, le miroir horizontal en tient compte.
const mirrorHex = (c, r) => ({ c: W - 1 - (r & 1) - c, r: H - 1 - r });

const randomHex = (rng, rows) => {
  const r = pick(rng, rows);
  return { c: (rng() * (W - (r & 1))) | 0, r };
};

// Biomes : `terrains` = palette des taches (répétition = poids), `patches` =
// nombre de taches en mode symétrique (doublé en mode libre), `river: true` =
// fleuve infranchissable sur la rangée médiane, traversé par 2 ou 3 ponts.
export const BIOMES = {
  campagne: {
    label: 'Campagne',
    terrains: ['foret', 'foret', 'colline', 'village', 'bocage'],
    patches: 5,
  },
  foret: {
    label: 'Forêt profonde',
    terrains: ['foret', 'foret', 'foret', 'colline', 'bocage'],
    patches: 8,
  },
  collines: {
    label: 'Collines',
    terrains: ['colline', 'colline', 'colline', 'foret', 'village'],
    patches: 7,
  },
  fleuve: {
    label: 'Fleuve',
    terrains: ['foret', 'colline', 'village', 'bocage'],
    patches: 5,
    river: true,
  },
};

const OBSTACLE_TYPES = ['sacs', 'barbeles', 'antichar', 'bunker'];

// Fait croître une tache de terrain depuis un hex de plaine ; en mode
// symétrique chaque hex est posé avec son miroir, le plateau reste symétrique
// à tout moment.
function growPatch(terrain, rng, seed, type, size, symmetric) {
  const cells = [seed];
  while (cells.length <= size) {
    const cell = cells.at(-1);
    terrain[key(cell.c, cell.r)] = type;
    if (symmetric) {
      const m = mirrorHex(cell.c, cell.r);
      terrain[key(m.c, m.r)] = type;
    }
    const free = neighbors(cell.c, cell.r).filter((h) => terrain[key(h.c, h.r)] === 'plaine');
    if (!free.length) break;
    cells.push(pick(rng, free));
  }
}

export function generateMap({ rng = Math.random, symmetric = true, biome = 'campagne' } = {}) {
  const preset = BIOMES[biome] ?? BIOMES.campagne;
  const terrain = {};
  const obstacles = {};
  for (let r = 0; r < H; r++) for (let c = 0; c < W - (r & 1); c++) terrain[key(c, r)] = 'plaine';

  // Fleuve médian : la rangée centrale (son propre miroir) devient une rivière
  // infranchissable, traversée par 2 ou 3 ponts.
  if (preset.river) {
    const mid = (H - 1) >> 1;
    for (let c = 0; c < W; c++) terrain[key(c, mid)] = 'riviere';
    const bridges = 2 + ((rng() * 2) | 0);
    for (let i = 0; i < bridges; i++) {
      const c = (rng() * W) | 0;
      obstacles[key(c, mid)] = 'pont';
      if (symmetric) obstacles[key(W - 1 - c, mid)] = 'pont';
    }
  }

  // Taches de terrain (1 à 3 hexes) dans la palette du biome : semées sur la
  // moitié Axe et le milieu puis reflétées, ou deux fois plus nombreuses sur
  // tout le plateau.
  const patchRows = symmetric ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const patches = (symmetric ? preset.patches : preset.patches * 2) + ((rng() * 3) | 0);
  for (let i = 0; i < patches; i++) {
    const seed = randomHex(rng, patchRows);
    if (terrain[key(seed.c, seed.r)] !== 'plaine') continue;
    growPatch(terrain, rng, seed, pick(rng, preset.terrains), 1 + ((rng() * 3) | 0), symmetric);
  }

  // Obstacles devant les lignes (rangées 1-3 et leurs vis-à-vis 5-7).
  const obstacleRows = symmetric ? [1, 2, 3] : [1, 2, 3, 5, 6, 7];
  const nObstacles = (symmetric ? 1 : 2) + ((rng() * 3) | 0);
  for (let i = 0; i < nObstacles; i++) {
    const { c, r } = randomHex(rng, obstacleRows);
    if (obstacles[key(c, r)]) continue;
    const type = pick(rng, OBSTACLE_TYPES);
    obstacles[key(c, r)] = type;
    if (symmetric) {
      const m = mirrorHex(c, r);
      obstacles[key(m.c, m.r)] = type;
    }
  }

  // Objectifs mixtes au milieu du front, uniquement sur des hexes occupables
  // (jamais sur la rivière hors pont — un pont fait un bel objectif). L'hex
  // central est son propre miroir : la paire symétrique s'y réduit à une tuile.
  const objectives = {};
  const goalSpots = [];
  for (const r of [3, 4, 5])
    for (let c = 0; c < W - (r & 1); c++)
      if (unitAllowedOn(terrain, obstacles, 'inf', c, r)) goalSpots.push({ c, r });
  const goals = (symmetric ? 1 : 2) + ((rng() * 2) | 0);
  for (let i = 0; i < goals && goalSpots.length; i++) {
    const [{ c, r }] = goalSpots.splice((rng() * goalSpots.length) | 0, 1);
    objectives[key(c, r)] = 'both';
    if (symmetric) {
      const m = mirrorHex(c, r);
      objectives[key(m.c, m.r)] = 'both';
    }
  }

  // Armées sur les deux rangées de départ de chaque camp. En mode symétrique,
  // une seule armée est tirée puis reflétée (mêmes forces des deux côtés) —
  // terrain et obstacles étant symétriques, un emplacement légal côté allié
  // l'est aussi côté Axe. Sinon chaque camp tire la sienne.
  const rosterFor = () => {
    const roster = [];
    const enlist = (type, n) => {
      for (let i = 0; i < n; i++) roster.push(type);
    };
    enlist('inf', 3 + ((rng() * 2) | 0));
    enlist('arm', 1 + ((rng() * 2) | 0));
    enlist('art', (rng() * 2) | 0);
    return roster;
  };

  const units = [];
  const placeArmy = (side, rows, mirrored) => {
    const spots = [];
    for (const r of rows) for (let c = 0; c < W - (r & 1); c++) spots.push({ c, r });
    for (const type of rosterFor()) {
      while (spots.length) {
        const [spot] = spots.splice((rng() * spots.length) | 0, 1);
        if (!unitAllowedOn(terrain, obstacles, type, spot.c, spot.r)) continue;
        units.push({ side, type, c: spot.c, r: spot.r });
        if (mirrored) {
          const m = mirrorHex(spot.c, spot.r);
          units.push({ side: 'axis', type, c: m.c, r: m.r });
        }
        break;
      }
    }
  };
  placeArmy('allies', [H - 2, H - 1], symmetric);
  if (!symmetric) placeArmy('axis', [0, 1], false);

  return { terrain, obstacles, objectives, units };
}
