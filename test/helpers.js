// RNG déterministe injecté à la place de Math.random dans les tests —
// désormais dans src/rng.js (partagé avec le mode en ligne).

export { mulberry32 } from '../src/rng.js';
