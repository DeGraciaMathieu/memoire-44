// Génération aléatoire d'une carte pour l'éditeur. En mode symétrique
// (défaut), terrains, obstacles, objectifs et armées sont posés en miroir
// (symétrie centrale du plateau) : la carte est équitable d'entrée. En mode
// libre (symmetric: false), chaque moitié est tirée indépendamment. Le biome
// choisi oriente le paysage (palette de terrains, densité, fleuve médian).
// Le profil `attacker` ('allies'/'axis') transforme la rencontre en assaut :
// attaquant en surnombre, défenseur retranché, objectifs réservés à
// l'attaquant dans la profondeur du défenseur — un biome côtier (Débarquement)
// force l'assaut allié depuis la mer. La carte produite est toujours valide
// au sens de parseMap, prête à être retouchée.

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
// fleuve infranchissable sur la rangée médiane traversé par 2 ou 3 ponts,
// `coast: true` = mer et plage côté allié, assaut allié forcé.
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
  littoral: {
    label: 'Débarquement',
    terrains: ['bocage', 'village', 'foret', 'colline'],
    patches: 5,
    coast: true,
  },
};

const OBSTACLE_TYPES = ['sacs', 'barbeles', 'antichar', 'bunker'];
// Défenses d'un camp retranché : bunkers et surtout barbelés devant ses lignes.
const DEFENSE_TYPES = ['bunker', 'barbeles', 'barbeles', 'sacs', 'antichar'];

// Fait croître une tache de terrain depuis un hex de plaine ; en mode miroir
// chaque hex est posé avec son reflet, le plateau reste symétrique à tout
// moment.
function growPatch(terrain, rng, seed, type, size, mirrored) {
  const cells = [seed];
  while (cells.length <= size) {
    const cell = cells.at(-1);
    terrain[key(cell.c, cell.r)] = type;
    if (mirrored) {
      const m = mirrorHex(cell.c, cell.r);
      terrain[key(m.c, m.r)] = type;
    }
    const free = neighbors(cell.c, cell.r).filter((h) => terrain[key(h.c, h.r)] === 'plaine');
    if (!free.length) break;
    cells.push(pick(rng, free));
  }
}

export function generateMap({
  rng = Math.random,
  symmetric = true,
  biome = 'campagne',
  attacker = null,
} = {}) {
  const preset = BIOMES[biome] ?? BIOMES.campagne;
  // Profil du scénario : `attacker` désigne le camp à l'assaut (l'autre se
  // retranche), null = rencontre. Un débarquement est toujours un assaut
  // allié depuis la mer. Un assaut n'est jamais en miroir.
  const assault = preset.coast ? 'allies' : ['allies', 'axis'].includes(attacker) ? attacker : null;
  const mirrored = symmetric && !assault;
  const terrain = {};
  const obstacles = {};
  for (let r = 0; r < H; r++) for (let c = 0; c < W - (r & 1); c++) terrain[key(c, r)] = 'plaine';

  // Côte : deux rangées de mer côté allié (les barges), deux rangées de plage
  // devant — la terre ferme occupe les rangées hautes, tenues par l'Axe.
  if (preset.coast) {
    for (const r of [H - 2, H - 1])
      for (let c = 0; c < W - (r & 1); c++) terrain[key(c, r)] = 'mer';
    for (const r of [H - 4, H - 3])
      for (let c = 0; c < W - (r & 1); c++) terrain[key(c, r)] = 'plage';
  }

  // Fleuve médian : la rangée centrale (son propre miroir) devient une rivière
  // infranchissable, traversée par 2 ou 3 ponts.
  if (preset.river) {
    const mid = (H - 1) >> 1;
    for (let c = 0; c < W; c++) terrain[key(c, mid)] = 'riviere';
    const bridges = 2 + ((rng() * 2) | 0);
    for (let i = 0; i < bridges; i++) {
      const c = (rng() * W) | 0;
      obstacles[key(c, mid)] = 'pont';
      if (mirrored) obstacles[key(W - 1 - c, mid)] = 'pont';
    }
  }

  // Taches de terrain (1 à 3 hexes) dans la palette du biome : semées sur la
  // moitié Axe et le milieu puis reflétées, sur la terre ferme d'une côte, ou
  // deux fois plus nombreuses sur tout le plateau.
  const patchRows = mirrored || preset.coast ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const patches =
    (mirrored || preset.coast ? preset.patches : preset.patches * 2) + ((rng() * 3) | 0);
  for (let i = 0; i < patches; i++) {
    const seed = randomHex(rng, patchRows);
    if (terrain[key(seed.c, seed.r)] !== 'plaine') continue;
    growPatch(terrain, rng, seed, pick(rng, preset.terrains), 1 + ((rng() * 3) | 0), mirrored);
  }

  if (assault) {
    // Défenses du camp assiégé, devant ses lignes (entre elles et la plage
    // pour un débarquement).
    const defenseRows = preset.coast ? [2, 3, 4] : assault === 'allies' ? [1, 2, 3] : [5, 6, 7];
    const nDefenses = 3 + ((rng() * 3) | 0);
    for (let i = 0; i < nDefenses; i++) {
      const { c, r } = randomHex(rng, defenseRows);
      if (obstacles[key(c, r)]) continue;
      obstacles[key(c, r)] = pick(rng, DEFENSE_TYPES);
    }
  } else {
    // Obstacles devant les lignes (rangées 1-3 et leurs vis-à-vis 5-7).
    const obstacleRows = mirrored ? [1, 2, 3] : [1, 2, 3, 5, 6, 7];
    const nObstacles = (mirrored ? 1 : 2) + ((rng() * 3) | 0);
    for (let i = 0; i < nObstacles; i++) {
      const { c, r } = randomHex(rng, obstacleRows);
      if (obstacles[key(c, r)]) continue;
      const type = pick(rng, OBSTACLE_TYPES);
      obstacles[key(c, r)] = type;
      if (mirrored) {
        const m = mirrorHex(c, r);
        obstacles[key(m.c, m.r)] = type;
      }
    }
  }

  // Objectifs sur des hexes occupables uniquement (jamais la rivière hors
  // pont — un pont fait un bel objectif). Rencontre : objectifs mixtes au
  // milieu du front, en paires miroir le cas échéant (l'hex central, son
  // propre miroir, réduit la paire à une tuile). Assaut : objectifs réservés
  // à l'attaquant, dans la profondeur du défenseur.
  const objectives = {};
  const goalRows = !assault ? [3, 4, 5] : assault === 'allies' ? [0, 1, 2, 3] : [5, 6, 7, 8];
  const goalSpots = [];
  for (const r of goalRows)
    for (let c = 0; c < W - (r & 1); c++)
      if (unitAllowedOn(terrain, obstacles, 'inf', c, r)) goalSpots.push({ c, r });
  const goals = (assault || !mirrored ? 2 : 1) + ((rng() * 2) | 0);
  for (let i = 0; i < goals && goalSpots.length; i++) {
    const [{ c, r }] = goalSpots.splice((rng() * goalSpots.length) | 0, 1);
    objectives[key(c, r)] = assault ?? 'both';
    if (mirrored) {
      const m = mirrorHex(c, r);
      objectives[key(m.c, m.r)] = 'both';
    }
  }

  // Armées sur les rangées de départ. Rencontre en miroir : une seule armée
  // est tirée puis reflétée (mêmes forces des deux côtés) — terrain et
  // obstacles étant symétriques, un emplacement légal côté allié l'est aussi
  // côté Axe. Assaut : l'attaquant est en surnombre (depuis le sable et les
  // barges pour un débarquement), le défenseur retranché plus léger.
  const enlist = (roster, type, n) => {
    for (let i = 0; i < n; i++) roster.push(type);
  };
  const encounterRoster = () => {
    const roster = [];
    enlist(roster, 'inf', 3 + ((rng() * 2) | 0));
    enlist(roster, 'arm', 1 + ((rng() * 2) | 0));
    enlist(roster, 'art', (rng() * 2) | 0);
    return roster;
  };
  const attackerRoster = () => {
    const roster = [];
    enlist(roster, 'inf', 4 + ((rng() * 2) | 0));
    enlist(roster, 'arm', 2);
    enlist(roster, 'art', (rng() * 2) | 0);
    return roster;
  };
  const defenderRoster = () => {
    const roster = [];
    enlist(roster, 'inf', 3);
    enlist(roster, 'arm', (rng() * 2) | 0);
    enlist(roster, 'art', 1);
    return roster;
  };

  const units = [];
  const placeArmy = (side, rows, roster, withMirror) => {
    const spots = [];
    for (const r of rows) for (let c = 0; c < W - (r & 1); c++) spots.push({ c, r });
    for (const type of roster) {
      while (spots.length) {
        const [spot] = spots.splice((rng() * spots.length) | 0, 1);
        if (!unitAllowedOn(terrain, obstacles, type, spot.c, spot.r)) continue;
        units.push({ side, type, c: spot.c, r: spot.r });
        if (withMirror) {
          const m = mirrorHex(spot.c, spot.r);
          units.push({ side: side === 'allies' ? 'axis' : 'allies', type, c: m.c, r: m.r });
        }
        break;
      }
    }
  };

  if (assault) {
    const defender = assault === 'allies' ? 'axis' : 'allies';
    const attackRows = preset.coast
      ? [H - 3, H - 2, H - 1]
      : assault === 'allies'
        ? [H - 2, H - 1]
        : [0, 1];
    const defendRows = defender === 'axis' ? [0, 1] : [H - 2, H - 1];
    placeArmy(assault, attackRows, attackerRoster(), false);
    placeArmy(defender, defendRows, defenderRoster(), false);
  } else {
    placeArmy('allies', [H - 2, H - 1], encounterRoster(), mirrored);
    if (!mirrored) placeArmy('axis', [0, 1], encounterRoster(), false);
  }

  return { terrain, obstacles, objectives, units };
}
