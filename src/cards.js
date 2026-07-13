// Cartes de commandement et composition de la pioche.

export const CARDS = [
  { id: 'atk-g', name: 'Attaque à gauche', sector: 'gauche', n: 3 },
  { id: 'atk-c', name: 'Attaque au centre', sector: 'centre', n: 3 },
  { id: 'atk-d', name: 'Attaque à droite', sector: 'droite', n: 3 },
  { id: 'snd-g', name: 'Sonder à gauche', sector: 'gauche', n: 2 },
  { id: 'snd-c', name: 'Sonder au centre', sector: 'centre', n: 2 },
  { id: 'snd-d', name: 'Sonder à droite', sector: 'droite', n: 2 },
  { id: 'recon', name: 'Reconnaissance', sector: '*', n: 1 },
  { id: 'assaut', name: 'Assaut général', sector: '*', n: 4 },
];

const COPIES = {
  'atk-g': 3,
  'atk-c': 3,
  'atk-d': 3,
  'snd-g': 3,
  'snd-c': 3,
  'snd-d': 3,
  recon: 4,
  assaut: 2,
};

export const cardById = (id) => CARDS.find((c) => c.id === id);

export function buildDeck() {
  const deck = [];
  for (const c of CARDS) for (let i = 0; i < COPIES[c.id]; i++) deck.push(c.id);
  return deck;
}
