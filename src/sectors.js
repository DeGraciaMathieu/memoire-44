// Secteurs du front (gauche / centre / droite) : 4 / 5 / 4 tuiles de large sur
// les rangées paires. Les deux lignes de séparation sont DROITES et passent
// entre les colonnes 3|4 et 8|9 des rangées paires ; sur les rangées impaires
// (décalées d'un demi-hex) elles traversent le centre des colonnes 3 et 8, qui
// appartiennent alors aux DEUX secteurs qu'elles séparent.

export const SECTORS = ['gauche', 'centre', 'droite'];

export function sectorsOf(c, r) {
  const s = [];
  if (r & 1) {
    if (c <= 3) s.push('gauche');
    if (c >= 3 && c <= 8) s.push('centre');
    if (c >= 8) s.push('droite');
  } else {
    if (c <= 3) s.push('gauche');
    if (c >= 4 && c <= 8) s.push('centre');
    if (c >= 9) s.push('droite');
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
