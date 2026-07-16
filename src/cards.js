// Cartes de commandement, cartes tactiques et composition de la pioche.

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
  // Cartes tactiques à ordres (`tactic: true`) : quota GLOBAL `n` ('all' = toutes
  // les unités éligibles), pas de quota par secteur. Champs optionnels :
  // - sector: 'pick' → le secteur est choisi au moment de jouer la carte ;
  //   absent → tout le plateau ;
  // - types → types d'unités éligibles ; fallback: true → si aucune unité
  //   éligible, 1 unité au choix en activation standard (sans effets spéciaux) ;
  // - adjacent: true/false → éligible seulement au contact / hors contact d'un ennemi ;
  // - noMove → les unités ordonnées ne se déplacent pas ;
  // - bonus: 'all' | 'close' → +1 dé de combat (close : au contact seulement) ;
  // - move: { fight, noFire } → distances de déplacement modifiées ;
  // - attacks: 2 → deux combats par activation ;
  // - digIn → l'ordre pose des sacs de sable au lieu d'agir.
  { id: 'hq', name: 'Directive du QG', tactic: true, n: 4, desc: '4 unités au choix' },
  {
    id: 'move-out',
    name: 'En avant !',
    tactic: true,
    n: 4,
    types: ['inf'],
    fallback: true,
    desc: '4 infanteries',
  },
  {
    id: 'armor-assault',
    name: 'Assaut blindé',
    tactic: true,
    n: 4,
    types: ['arm'],
    fallback: true,
    bonus: 'close',
    desc: '4 blindés · +1 dé au contact',
  },
  {
    id: 'infantry-assault',
    name: 'Assaut d’infanterie',
    tactic: true,
    sector: 'pick',
    n: 'all',
    types: ['inf'],
    fallback: true,
    move: { fight: 2, noFire: 3 },
    desc: 'l’infanterie d’un secteur · bouge 2 et tire, ou 3',
  },
  {
    id: 'close-assault',
    name: 'Assaut rapproché',
    tactic: true,
    n: 'all',
    types: ['inf', 'arm'],
    adjacent: true,
    noMove: true,
    bonus: 'all',
    desc: 'unités au contact · +1 dé, sans bouger',
  },
  {
    id: 'firefight',
    name: 'Fusillade',
    tactic: true,
    n: 4,
    adjacent: false,
    noMove: true,
    bonus: 'all',
    desc: '4 unités hors contact · +1 dé, sans bouger',
  },
  {
    id: 'bombard',
    name: 'Bombardement',
    tactic: true,
    n: 'all',
    types: ['art'],
    fallback: true,
    move: { noFire: 3 },
    attacks: 2,
    desc: 'l’artillerie · bouge 3 ou tire deux fois',
  },
  {
    id: 'dig-in',
    name: 'Retranchement',
    tactic: true,
    n: 4,
    types: ['inf'],
    fallback: true,
    digIn: true,
    desc: '4 infanteries posent des sacs de sable',
  },
  // Cartes tactiques à résolution dédiée (`action`) dans src/game.js
  // (resolveBarrage, resolveAirStrike, resolveMedics, Contre-attaque dans
  // playCard) ; `desc` est le bandeau affiché sur la carte.
  {
    id: 'barrage',
    name: 'Barrage',
    action: 'barrage',
    dice: 4,
    desc: '4 dés sur 1 unité · drapeaux non couverts',
  },
  {
    id: 'air',
    name: 'Attaque aérienne',
    action: 'air',
    units: 4,
    dice: { allies: 2, axis: 1 },
    desc: 'jusqu’à 4 unités groupées',
  },
  {
    id: 'medics',
    name: 'Médecins & mécanos',
    action: 'medics',
    desc: '1 dé par carte en main · soigne puis ordonne',
  },
  {
    id: 'contre',
    name: 'Contre-attaque',
    action: 'contre',
    desc: 'rejoue la carte adverse en miroir',
  },
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
  hq: 2,
  'move-out': 2,
  'armor-assault': 2,
  'infantry-assault': 2,
  contre: 2,
  'close-assault': 1,
  firefight: 1,
  bombard: 1,
  'dig-in': 1,
  barrage: 1,
  air: 1,
  medics: 1,
};

export const cardById = (id) => CARDS.find((c) => c.id === id);

export function buildDeck() {
  const deck = [];
  for (const c of CARDS) for (let i = 0; i < COPIES[c.id]; i++) deck.push(c.id);
  return deck;
}

// Miroir gauche/droite d'une Contre-attaque : une carte de secteur droite se
// rejoue à gauche et inversement (convention d'id : suffixe -g / -d).
export function mirrorId(id) {
  if (id.endsWith('-g')) return `${id.slice(0, -2)}-d`;
  if (id.endsWith('-d')) return `${id.slice(0, -2)}-g`;
  return id;
}
