// Secteurs du front (gauche / centre / droite).
// Les deux lignes de séparation sont DROITES et passent par le centre des
// colonnes 4 et 8 des rangées paires. Une case traversée par une ligne
// appartient aux DEUX secteurs qu'elle sépare ; sur les rangées impaires
// (décalées d'un demi-hex) la ligne longe une arête et ne partage rien.

export const SECTORS = ['gauche', 'centre', 'droite'];

export function sectorsOf(c, r) {
  const s = [];
  if (r & 1) {
    if (c <= 3) s.push('gauche');
    if (c >= 4 && c <= 7) s.push('centre');
    if (c >= 8) s.push('droite');
  } else {
    if (c <= 4) s.push('gauche');
    if (c >= 4 && c <= 8) s.push('centre');
    if (c >= 8) s.push('droite');
  }
  return s;
}

// Secteurs couverts par la valeur de secteur d'une carte :
// '*' = tout le front, 'flancs' = gauche + droite, sinon le secteur nommé.
export const cardSectors = (sector) =>
  sector === '*' ? SECTORS : sector === 'flancs' ? ['gauche', 'droite'] : [sector];

export const inSector = (unit, sector) => {
  const covered = cardSectors(sector);
  return sectorsOf(unit.c, unit.r).some((s) => covered.includes(s));
};
