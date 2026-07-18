// Constantes du domaine — aucune logique, aucune dépendance.

export const W = 13;
export const H = 9;
export const MEDALS_TO_WIN = 6;
export const HAND_SIZE = 5;

export const TERRAIN = {
  plaine: { label: 'Plaine', dice: { def: 0 }, stops: false },
  foret: {
    label: 'Forêt',
    dice: { def: 1, defArmor: 2, defArt: 0 },
    stops: true,
    blocksSight: true,
  },
  colline: { label: 'Colline', dice: { def: 1 }, stops: true, elevated: true },
  village: { label: 'Village', dice: { def: 1, defArmor: 2 }, stops: true, blocksSight: true },
  bocage: {
    label: 'Bocage',
    dice: { def: 1, defArmor: 2, defArt: 0 },
    stops: true,
    blocksSight: true,
    enterAdjacentOnly: true, // entrée seulement depuis l'hex de départ (adjacent)
    exitAdjacentOnly: true, // la sortie s'arrête sur l'hex adjacent
    noFightOnEnter: true, // pas de combat le tour où l'unité y entre
  },
  riviere: {
    label: 'Rivière',
    dice: { def: 0 },
    stops: false,
    impassable: true, // entrée interdite — sauf obstacle makesPassable (pont)
    // jamais de blocksSight : une rivière ne coupe pas la ligne de mire
  },
  mer: {
    label: 'Mer',
    dice: { def: 0 },
    stops: true, // entrer dans l'eau arrête le mouvement du tour
    exitAdjacentOnly: true, // en mer (barge) : 1 hex par tour, jusqu'à la plage
    noFight: true, // aucun tir tant que l'unité est en mer
    noRetreatInto: true, // impossible de battre en retraite dans l'eau
    // jamais de blocksSight : la mer ne coupe pas la ligne de mire
  },
  plage: {
    label: 'Plage',
    dice: { def: 0 },
    stops: false,
    moveCap: 2, // 2 hexes maximum dans le sable, blindés compris
    // aucune restriction de combat, jamais de blocksSight
  },
};

// Obstacles posés SUR un terrain. Leur protection ne se cumule pas avec celle
// du terrain : on retient la plus forte des deux réductions (un bunker sur une
// colline protège de 2 contre un blindé, pas de 3).
export const OBSTACLES = {
  bunker: {
    label: 'Bunker',
    dice: { def: 1, defArmor: 2, defArt: 0 },
    blocksSight: true,
    infantryOnly: true, // blindés et artillerie n'y entrent jamais
    fixesArtillery: true, // une artillerie qui y débute ne peut plus bouger
    ignoreFirstFlag: true, // le premier drapeau de chaque jet est ignoré
  },
  antichar: {
    label: 'Obstacle antichar',
    dice: { def: 0 }, // aucune protection
    infantryOnly: true, // seule l'infanterie y pénètre, sans restriction de mouvement
    ignoreFirstFlag: true,
  },
  sacs: {
    label: 'Sacs de sable',
    dice: { def: 1, defArt: 0 }, // −1 infanterie et blindés, rien contre l'artillerie
    ignoreFirstFlag: true,
    removedOnExit: true, // abandonnés dès que l'unité quitte l'hex (même en repli)
  },
  pont: {
    label: 'Pont',
    dice: { def: 0 }, // aucune protection : on y combat normalement
    makesPassable: true, // rend franchissable un terrain impassable (rivière)
  },
  barbeles: {
    label: 'Barbelés',
    dice: { def: 0 }, // aucune protection — et jamais de blocksSight
    stops: true, // toute unité qui entre s'arrête net
    entanglesInfantry: true, // l'infanterie empêtrée combat avec 1 dé de moins
    cutInsteadOfFight: true, // l'infanterie peut les couper au lieu de combattre
    crushedByArmor: true, // un blindé qui entre les retire et peut encore combattre
  },
};

export const UNITS = {
  inf: {
    label: 'Infanterie',
    figs: 4,
    move: 1,
    moveNoFire: 2,
    dice: [3, 2, 1],
    hitOn: ['inf', 'grenade'],
  },
  arm: {
    label: 'Blindé',
    figs: 3,
    move: 3,
    moveNoFire: 3,
    dice: [3, 3, 3],
    hitOn: ['arm', 'grenade'],
    armored: true, // famille blindée : defArmor, percée, écrase les barbelés
  },
  art: {
    label: 'Artillerie',
    figs: 2,
    move: 0,
    moveNoFire: 1,
    dice: [3, 3, 2, 2, 1, 1],
    hitOn: ['inf', 'grenade'],
  },
  tig: {
    label: 'Tigre',
    figs: 1,
    move: 3,
    moveNoFire: 3,
    dice: [3, 3, 3],
    hitOn: ['arm', 'grenade'],
    armored: true,
    // Touché : l'adversaire relance les dés qui ont touché — seules ces faces
    // confirment, tous les autres résultats sont ignorés (resolveCombat).
    rerollHits: ['grenade'],
  },
};
// Simplification assumée : l'artillerie est touchée sur le symbole infanterie.

export const FACES = ['inf', 'inf', 'arm', 'grenade', 'star', 'flag'];
