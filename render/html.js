// Fragments HTML PURS (chaînes) — testables sans navigateur, aucun accès au DOM.

import { OBSTACLES, TERRAIN, UNITS } from '../src/config.js';
import { key } from '../src/hex.js';
import { SECTORS, cardSectors, sectorsOf } from '../src/sectors.js';
import { obstacleAt, unitAt } from '../src/movement.js';
import { reductionOf } from '../src/combat.js';

export const SYM = { inf: '✦', arm: '▮', grenade: '✸', star: '★', flag: '⚑' };
export const UNIT_GLYPH = { inf: '✦', arm: '▮', art: '✜' };
export const SIDE_FR = { allies: 'Alliés', axis: 'Axe' };

// Icônes schématiques des types d'unités (soldat, tank, canon) — SVG inline
// hérités de la couleur du texte, dimensionnés par la classe .icon.
export const UNIT_ICON = {
  inf: `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="6.5" r="3.8"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0z"/></svg>`,
  arm: `<svg class="icon" viewBox="0 0 24 24"><rect x="1.5" y="13" width="21" height="7" rx="3.5"/><path d="M7 13v-3.5A1.5 1.5 0 0 1 8.5 8H14a1.5 1.5 0 0 1 1.5 1.5V13z"/><rect x="15" y="9.6" width="7.5" height="1.8" rx="0.9"/></svg>`,
  art: `<svg class="icon" viewBox="0 0 24 24"><circle cx="8" cy="16.5" r="5"/><rect x="6.3" y="1.5" width="3.4" height="16" rx="1.7" transform="rotate(40 8 9.5)"/></svg>`,
};

// Face de dé : icône schématique pour les unités (infanterie, blindé),
// symbole texte pour les autres faces (grenade, étoile, drapeau).
export const faceHTML = (face) => UNIT_ICON[face] ?? SYM[face];

// Libellé des dés retirés à l'assaillant pour un couvert (terrain ou obstacle).
function reductionLabel(dice) {
  const red = dice.def;
  const redA = dice.defArmor != null ? dice.defArmor : red;
  const redArt = dice.defArt != null ? dice.defArt : red;
  const extras = [];
  if (redA !== red) extras.push('−' + redA + ' blindé');
  if (redArt !== red) extras.push(redArt ? '−' + redArt + ' artillerie' : 'artillerie sans malus');
  return `${red ? '−' + red : '—'}${extras.length ? ' (' + extras.join(', ') + ')' : ''}`;
}

// Protection d'un terrain : une seule valeur quand elle est uniforme, sinon
// schématique — une icône par type d'attaquant (soldat, tank, canon).
function protectionLabel(dice) {
  const types = Object.keys(UNIT_ICON);
  const reds = types.map((ty) => reductionOf(dice, ty));
  if (new Set(reds).size === 1) return reds[0] ? '−' + reds[0] : '—';
  return types.map((ty, i) => `${UNIT_ICON[ty]}${reds[i] ? '−' + reds[i] : '·'}`).join(' ');
}

const RANGE_LBL = { inf: '1 / 2 / 3', arm: '1 à 3', art: '1 à 6' };
const MOVE_LBL = {
  inf: '1 hex + tir, ou 2 sans tir',
  arm: '3 hex, tir conservé',
  art: '1 hex sans tir, ou tir sur place',
};

// Libellé du nombre d'ordres d'une carte de commandement : `n` unités par
// secteur couvert, 'all' = toutes les unités du secteur.
export function ordersLabel(card) {
  const per = cardSectors(card.sector).length > 1 ? ' par secteur' : '';
  if (card.n === 'all') return 'toutes les unités du secteur';
  return `${card.n} unité${card.n > 1 ? 's' : ''}${per}`;
}

export function cardHTML(card) {
  if (card.action)
    return `<div class="n">✸<small>action</small></div>
    <div class="cname">${card.name}</div>
    <div class="secs">${SECTORS.map(() => '<i></i>').join('')}</div>
    <div class="ctag">${card.desc}</div>`;
  // carte tactique : quota global — tout le plateau allumé, sauf secteur au choix
  if (card.tactic) {
    const covered = card.sector === 'pick' ? [] : SECTORS;
    return `<div class="n">${card.n === 'all' ? '∞' : card.n}<small>unité${
      card.n === 'all' || card.n > 1 ? 's' : ''
    }</small></div>
    <div class="cname">${card.name}</div>
    <div class="secs">${SECTORS.map((s) => `<i class="${covered.includes(s) ? 'on' : ''}"></i>`).join('')}</div>
    <div class="ctag">${card.desc}</div>`;
  }
  const multi = cardSectors(card.sector).length > 1;
  return `<div class="n">${card.n === 'all' ? '∞' : card.n}<small>${
    multi ? 'par secteur' : `unité${card.n === 'all' || card.n > 1 ? 's' : ''}`
  }</small></div>
    <div class="cname">${card.name}</div>
    <div class="secs">${SECTORS.map(
      (s) => `<i class="${cardSectors(card.sector).includes(s) ? 'on' : ''}"></i>`,
    ).join('')}</div>
    <div class="ctag">${
      card.sector === '*' ? 'tout le front' : card.sector === 'flancs' ? 'les flancs' : card.sector
    }${card.recon ? ' · pioche 2, garde 1' : ''}</div>`;
}

// Choix du camp sur la page d'accueil : le camp coché rejoint les liens des
// tuiles via ?side= (home.js).
export function homeSideHTML(side = 'allies') {
  return `<span class="sidelabel">Jouer :</span>
    <label class="sideopt"><input type="radio" name="side" value="allies" ${side === 'allies' ? 'checked' : ''} /> ${SIDE_FR.allies}</label>
    <label class="sideopt"><input type="radio" name="side" value="axis" ${side === 'axis' ? 'checked' : ''} /> ${SIDE_FR.axis}</label>`;
}

// Écran de fin de partie : verdict du point de vue du joueur + score final.
export function endgameHTML(winner, playerSide, medals) {
  const won = winner === playerSide;
  return `<div class="endTitle ${won ? 'won' : 'lost'}">${won ? '★ Victoire' : '✖ Défaite'}</div>
    <div class="endSub">${winner === 'allies' ? 'Les Alliés l’emportent.' : 'Les forces de l’Axe l’emportent.'}</div>
    <div class="endMedals">${SIDE_FR.allies} ${medals.allies} · ${medals.axis} ${SIDE_FR.axis}</div>`;
}

// Bloc « Carte aléatoire » de l'accueil : biome, profil (rencontre ou assaut)
// et graine facultative (champ vide = graine tirée au hasard) — home.js câble
// le bouton avec le camp choisi.
export function homeRandomHTML(biomes) {
  const options = Object.entries(biomes)
    .map(([id, b]) => `<option value="${id}">${b.label}</option>`)
    .join('');
  return `<span class="sidelabel">Carte aléatoire :</span>
    <select id="homeBiome">${options}</select>
    <select id="homeProfile">
      <option value="">Rencontre</option>
      <option value="allies">Assaut allié</option>
      <option value="axis">Assaut de l’Axe</option>
    </select>
    <input id="homeSeed" type="text" inputmode="numeric" maxlength="9" placeholder="graine (hasard)" />
    <button class="act" id="btnRandomPlay">Jouer</button>`;
}

// Liste des cartes proposées par la page d'accueil
// (maps : [{ file, name, preview }] — preview : dataURL d'aperçu, ou null ;
// side : camp joué, ajouté au lien de chaque tuile).
export function homeMapsHTML(maps, side = 'allies') {
  if (!maps.length) return `<p class="empty">Aucune carte dans le dossier maps.</p>`;
  return maps
    .map(
      (m) =>
        `<a class="maptile" href="game.html?map=${encodeURIComponent(m.file)}&side=${side}">
      ${m.preview ? `<img class="mappreview" src="${m.preview}" alt="Aperçu de ${m.name}" />` : ''}
      <span class="mapname">${m.name}</span>
      <span class="mapfile">${m.file}</span>
    </a>`,
    )
    .join('');
}

export function forcePanelHTML(unit, terrainKey, role, figsShown, lost) {
  const t = TERRAIN[terrainKey];
  const pips = Array.from(
    { length: figsShown },
    (_, i) => `<i class="pip${i >= figsShown - lost ? ' gone' : ''}"></i>`,
  ).join('');
  return `
    <div class="who">${role}</div>
    <div class="name"><span class="chip ${unit.side}">${UNIT_ICON[unit.type]}</span>
      ${SIDE_FR[unit.side]} · ${UNITS[unit.type].label}</div>
    <div class="terr">${t.label} · ${figsShown} figurine${figsShown > 1 ? 's' : ''}</div>
    <div class="pips">${pips}</div>`;
}

// Détail du calcul de dés d'un engagement (outcome produit par attackUnit).
// Le couvert affiché est celui qui fournit la réduction retenue (non cumulée) :
// l'obstacle s'il protège au moins autant que le terrain.
export function calcHTML(outcome) {
  const {
    attacker,
    baseDice,
    range,
    reduction,
    snare,
    bonus,
    dice,
    defender,
    terrainKey,
    obstacleKey,
  } = outcome;
  const t = TERRAIN[terrainKey];
  const o = obstacleKey ? OBSTACLES[obstacleKey] : null;
  const coverLabel =
    o && reductionOf(o.dice, attacker.type) >= reductionOf(t.dice, attacker.type)
      ? o.label
      : t.label;
  return (
    `<b>${baseDice}</b> dés à portée ${range}` +
    (reduction ? ` − <b>${reduction}</b> (${coverLabel.toLowerCase()})` : '') +
    (snare ? ` − <b>${snare}</b> (empêtrée dans les barbelés)` : '') +
    (bonus ? ` + <b>${bonus}</b> (carte tactique)` : '') +
    ` = <b>${dice} dé${dice > 1 ? 's' : ''}</b> · touche sur ${UNITS[defender.type].hitOn
      .map(faceHTML)
      .join(' ')}`
  );
}

// Pastilles courtes pour les règles spéciales d'un terrain.
function terrainTags(t) {
  const out = [];
  if (t.enterAdjacentOnly) out.push('entrée en 1er pas');
  if (t.exitAdjacentOnly) out.push('sortie : 1 hex');
  if (t.noFight) out.push('aucun tir');
  if (t.noFightOnEnter) out.push("pas de tir le tour d'entrée");
  if (t.noRetreatInto) out.push('pas de retraite');
  return out;
}

// Pastilles courtes pour les capacités d'un obstacle, dérivées de sa config.
function obstacleTags(o) {
  const out = [];
  if (o.dice.def || o.dice.defArmor || o.dice.defArt)
    out.push(`protection ${reductionLabel(o.dice)}, non cumulée`);
  if (o.makesPassable) out.push("rend l'hex franchissable");
  if (o.infantryOnly) out.push('infanterie seulement');
  if (o.stops) out.push('stoppe net');
  if (o.entanglesInfantry) out.push('infanterie : −1 dé');
  if (o.cutInsteadOfFight) out.push('coupe possible au lieu de combattre');
  if (o.crushedByArmor) out.push('écrasés par les blindés');
  if (o.fixesArtillery) out.push('artillerie retranchée fixe');
  if (o.ignoreFirstFlag) out.push('1er drapeau ignoré');
  if (o.removedOnExit) out.push('retirés en sortant');
  if (o.blocksSight) out.push('vue bloquée');
  return out;
}

const tagsHTML = (list) =>
  list.length
    ? `<div class="tags">${list.map((x) => `<span class="tag">${x}</span>`).join('')}</div>`
    : '';

// Infobulle de plateau : terrain + unité sous le curseur.
export function tipHTML(state, ui, hex) {
  const tkey = state.terrain[key(hex.c, hex.r)];
  const t = TERRAIN[tkey];
  const secs = sectorsOf(hex.c, hex.r);
  const u = unitAt(state, hex.c, hex.r);

  // trois cellules fixes : protection, mouvement, ligne de mire
  const move = t.impassable
    ? 'pont requis'
    : t.stops
      ? 'stop'
      : t.moveCap
        ? `${t.moveCap} hex max`
        : 'libre';
  const sight = t.blocksSight ? 'bloquée' : t.elevated ? 'contrebas' : 'libre';
  let h = `<div class="thead ${tkey}">${t.label}<em>${secs.join(' + ')}</em></div>
    <div class="tbody">
      <div class="stats">
        <div class="stat"><b>${protectionLabel(t.dice)}</b><small>protection</small></div>
        <div class="stat"><b>${move}</b><small>mouvement</small></div>
        <div class="stat"><b>${sight}</b><small>ligne de mire</small></div>
      </div>${tagsHTML(terrainTags(t))}
    </div>`;

  const obj = state.objectives?.[key(hex.c, hex.r)];
  if (obj)
    h += `<div class="unit">
      <div class="uname">★ Objectif — médaille : ${obj === 'both' ? 'les deux camps' : SIDE_FR[obj]}</div>
    </div>`;

  const oKey = obstacleAt(state, hex.c, hex.r);
  if (oKey) {
    const o = OBSTACLES[oKey];
    h += `<div class="unit">
      <div class="uname">${o.label}</div>${tagsHTML(obstacleTags(o))}
    </div>`;
  }

  if (u) {
    const U = UNITS[u.type];
    h += `<div class="unit">
      <div class="uname"><span class="chip ${u.side}">${UNIT_ICON[u.type]}</span>
        ${SIDE_FR[u.side]} · ${U.label}</div>
      <div class="row">Figurines<b>${u.figs} / ${U.figs}</b></div>
      <div class="row">Déplacement<b>${MOVE_LBL[u.type]}</b></div>
      <div class="row">Portée<b>${RANGE_LBL[u.type]}</b></div>
      <div class="row">Dés<b>${U.dice.join(' / ')}</b></div>
      <div class="row">Touchée sur<b>${U.hitOn.map(faceHTML).join(' ')}</b></div>`;

    // contexte : que se passe-t-il si je vise / si je vais là ?
    const tgt = ui.targets.find((x) => x.unit.id === u.id);
    if (tgt)
      h += `<div class="row fire">Tir possible<b>${tgt.dice} dé${tgt.dice > 1 ? 's' : ''} à ${tgt.range}</b></div>`;
    else if (u.acted && u.side === state.playerSide)
      h += `<div class="row">État<b>a déjà agi</b></div>`;
    else if (ui.orderable.some((z) => z.id === u.id) && state.phase === 'orders')
      h += `<div class="row go">Activable<b>oui</b></div>`;
    h += `</div>`;
  } else {
    const mv = ui.moves.find((m) => m.c === hex.c && m.r === hex.r);
    if (mv)
      h += `<div class="unit"><div class="row go">Déplacement<b>${mv.cost} hex</b></div></div>`;
  }
  return h;
}
