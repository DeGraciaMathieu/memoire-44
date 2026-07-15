// État d'interaction partagé entre les modules de rendu.
// Rien ici n'est une règle : tout est dérivable de src/ ou purement visuel.

export function createUiState() {
  return {
    selected: null, // unité alliée sélectionnée
    moves: [], // hexes atteignables affichés
    targets: [], // cibles de tir affichées
    orderable: [], // unités activables par la carte jouée
    drag: null, // { unit, x, y, hover, hoverKind } pendant un glisser
    hover: null, // hex sous le curseur (infobulle)
    justDrew: 0, // nombre de cartes fraîchement piochées (animation)
    modalOpen: false, // la modale de combat bloque les entrées plateau
    takeGround: null, // { unit, hex } : prise de terrain proposée au joueur
    breakthrough: null, // unité blindée dont la percée attend une cible
    action: null, // { kind, targets | picks } : carte action en attente de cible
    cutWire: false, // l'unité sélectionnée peut couper les barbelés de son hex
    aiFocus: null, // unité que l'IA active (contour doré, comme la sélection)
    aiTargets: [], // hexes visés par l'IA (contour rouge, traceur si unique)
  };
}
