// RNG déterministe injecté à la place de Math.random dans les tests —
// désormais un module de jeu (les cartes aléatoires par graine l'utilisent).

export { mulberry32 } from '../src/rng.js';
