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
  };
}
