// Constantes du domaine — aucune logique, aucune dépendance.

export const W = 13;
export const H = 9;
export const MEDALS_TO_WIN = 4;
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
  },
  art: {
    label: 'Artillerie',
    figs: 2,
    move: 0,
    moveNoFire: 1,
    dice: [3, 3, 2, 2, 1, 1],
    hitOn: ['inf', 'grenade'],
  },
};
// Simplification assumée : l'artillerie est touchée sur le symbole infanterie.

export const FACES = ['inf', 'inf', 'arm', 'grenade', 'star', 'flag'];
