// Cartes de commandement, cartes actions et composition de la pioche.

export const CARDS = [
  // Cartes de commandement : `n` = unités activables PAR secteur couvert
  // ('all' = toutes les unités du secteur) ; `recon: true` = bonus de pioche
  // (piocher 2 cartes, en garder 1, défausser l'autre).
  { id: 'rec-g', name: 'Reconnaissance à gauche', sector: 'gauche', n: 1, recon: true },
  { id: 'rec-c', name: 'Reconnaissance au centre', sector: 'centre', n: 1, recon: true },
  { id: 'rec-d', name: 'Reconnaissance à droite', sector: 'droite', n: 1, recon: true },
  { id: 'snd-g', name: 'Sonder à gauche', sector: 'gauche', n: 2 },
  { id: 'snd-c', name: 'Sonder au centre', sector: 'centre', n: 2 },
  { id: 'snd-d', name: 'Sonder à droite', sector: 'droite', n: 2 },
  { id: 'atk-g', name: 'Attaque à gauche', sector: 'gauche', n: 3 },
  { id: 'atk-c', name: 'Attaque au centre', sector: 'centre', n: 3 },
  { id: 'atk-d', name: 'Attaque à droite', sector: 'droite', n: 3 },
  { id: 'ast-g', name: 'Assaut à gauche', sector: 'gauche', n: 'all' },
  { id: 'ast-c', name: 'Assaut au centre', sector: 'centre', n: 'all' },
  { id: 'ast-d', name: 'Assaut à droite', sector: 'droite', n: 'all' },
  { id: 'avance', name: 'Avance générale', sector: '*', n: 2 },
  { id: 'tenaille', name: 'Attaque en tenaille', sector: 'flancs', n: 2 },
  { id: 'recon-force', name: 'Reconnaissance en force', sector: '*', n: 1 },
  // Cartes actions : effet spécial résolu par src/game.js (resolveBarrage,
  // resolveAirStrike, resolveMedics, Contre-attaque dans playCard) ;
  // `desc` est le bandeau affiché sur la carte.
  { id: 'barrage', name: 'Barrage', action: 'barrage', dice: 4, desc: '4 dés sur 1 unité' },
  {
    id: 'air',
    name: 'Attaque aérienne',
    action: 'air',
    hexes: 4,
    dice: { allies: 2, axis: 1 },
    desc: '4 hexs contigus',
  },
  { id: 'medics', name: 'Médecins & mécanos', action: 'medics', dice: 4, desc: 'soigne 1 unité' },
  { id: 'contre', name: 'Contre-attaque', action: 'contre', desc: 'rejoue la carte adverse' },
];

const COPIES = {
  'rec-g': 2,
  'rec-c': 2,
  'rec-d': 2,
  'snd-g': 3,
  'snd-c': 3,
  'snd-d': 3,
  'atk-g': 3,
  'atk-c': 3,
  'atk-d': 3,
  'ast-g': 1,
  'ast-c': 1,
  'ast-d': 1,
  avance: 1,
  tenaille: 2,
  'recon-force': 2,
  barrage: 2,
  air: 2,
  medics: 2,
  contre: 2,
};

export const cardById = (id) => CARDS.find((c) => c.id === id);

export function buildDeck() {
  const deck = [];
  for (const c of CARDS) for (let i = 0; i < COPIES[c.id]; i++) deck.push(c.id);
  return deck;
}
