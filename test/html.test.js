// render/html.js est PUR : ces tests tournent dans Node, sans DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcHTML,
  cardHTML,
  forcePanelHTML,
  homeMapsHTML,
  homeSideHTML,
  ordersLabel,
  tipHTML,
} from '../render/html.js';
import { cardById } from '../src/cards.js';
import { createGame } from '../src/game.js';
import { key } from '../src/hex.js';
import { mulberry32 } from './helpers.js';

const emptyUi = { targets: [], moves: [], orderable: [] };

test('cardHTML : nom, nombre d’unités et secteur', () => {
  const h = cardHTML(cardById('recon-force'));
  assert.match(h, /Reconnaissance en force/);
  assert.match(h, /tout le front/);
  assert.match(h, /par secteur/);
  const h2 = cardHTML(cardById('atk-g'));
  assert.match(h2, /Attaque à gauche/);
  assert.match(h2, /unités/);
  // la tenaille allume les deux bandes de flanc, pas celle du centre
  const h3 = cardHTML(cardById('tenaille'));
  assert.match(h3, /Attaque en tenaille/);
  assert.match(h3, /les flancs/);
  assert.equal(h3.match(/<i class="on"/g).length, 2);
  // l'assaut ordonne toutes les unités du secteur
  const h5 = cardHTML(cardById('ast-c'));
  assert.match(h5, /Assaut au centre/);
  assert.match(h5, /∞/);
  // la reconnaissance annonce son bonus de pioche
  const h6 = cardHTML(cardById('rec-g'));
  assert.match(h6, /pioche 2, garde 1/);
  // carte action : bandeau descriptif, aucune bande de secteur allumée
  const h4 = cardHTML(cardById('barrage'));
  assert.match(h4, /Barrage/);
  assert.match(h4, /action/);
  assert.match(h4, /4 dés sur 1 unité/);
  assert.ok(!h4.includes('class="on"'));
  // carte tactique à ordres : quota, bandeau descriptif, tout le plateau allumé
  const h7 = cardHTML(cardById('hq'));
  assert.match(h7, /Directive du QG/);
  assert.match(h7, /4 unités au choix/);
  assert.equal(h7.match(/<i class="on"/g).length, 3);
  // secteur au choix : aucune bande allumée, le bandeau explique
  const h8 = cardHTML(cardById('infantry-assault'));
  assert.match(h8, /Assaut d’infanterie/);
  assert.match(h8, /∞/);
  assert.ok(!h8.includes('class="on"'));
});

test('homeMapsHTML : un lien par carte vers game.html, message si dossier vide', () => {
  const h = homeMapsHTML([
    { file: 'pointe-du-hoc.json', name: 'Pointe du Hoc', preview: 'data:image/png;base64,xyz' },
    { file: 'sword beach.json', name: 'Sword Beach', preview: null },
  ]);
  assert.equal(h.match(/<a class="maptile"/g).length, 2);
  assert.match(h, /href="game\.html\?map=pointe-du-hoc\.json&side=allies"/);
  assert.match(h, /Pointe du Hoc/);
  // le nom de fichier est encodé dans l'URL
  assert.match(h, /href="game\.html\?map=sword%20beach\.json&side=allies"/);
  // l'aperçu n'apparaît que pour les cartes qui en ont un
  assert.equal(h.match(/<img class="mappreview"/g).length, 1);
  assert.match(h, /src="data:image\/png;base64,xyz" alt="Aperçu de Pointe du Hoc"/);
  // le camp choisi rejoint les liens
  assert.match(
    homeMapsHTML([{ file: 'a.json', name: 'A', preview: null }], 'axis'),
    /href="game\.html\?map=a\.json&side=axis"/,
  );

  assert.match(homeMapsHTML([]), /Aucune carte/);
});

test('ordersLabel : nombre d’unités, « par secteur » quand la carte en couvre plusieurs', () => {
  assert.equal(ordersLabel(cardById('rec-c')), '1 unité');
  assert.equal(ordersLabel(cardById('avance')), '2 unités par secteur');
  assert.equal(ordersLabel(cardById('tenaille')), '2 unités par secteur');
  assert.equal(ordersLabel(cardById('ast-g')), 'toutes les unités du secteur');
});

test('homeSideHTML : deux boutons radio, le camp choisi est coché', () => {
  const h = homeSideHTML();
  assert.match(h, /Alliés/);
  assert.match(h, /Axe/);
  assert.match(h, /value="allies" checked/);
  assert.ok(!/value="axis" checked/.test(h));
  assert.match(homeSideHTML('axis'), /value="axis" checked/);
});

test('forcePanelHTML : une pip par figurine, les pertes marquées gone', () => {
  const unit = { side: 'axis', type: 'inf' };
  const h = forcePanelHTML(unit, 'plaine', 'Défenseur', 4, 2);
  assert.equal(h.match(/<i class="pip/g).length, 4);
  assert.equal(h.match(/gone/g).length, 2);
  assert.match(h, /Infanterie/);
  assert.match(h, /Plaine/);
  // la pastille porte l'icône schématique du type d'unité
  assert.match(h, /<span class="chip axis"><svg class="icon"/);
});

test('calcHTML : détaille le calcul avec la réduction de terrain', () => {
  const outcome = {
    baseDice: 3,
    range: 1,
    reduction: 1,
    dice: 2,
    defender: { type: 'inf' },
    terrainKey: 'foret',
  };
  const h = calcHTML(outcome);
  assert.match(h, /<b>3<\/b> dés à portée 1/);
  assert.match(h, /forêt/);
  assert.match(h, /<b>2 dés<\/b>/);
  // l'assaillant empêtré dans les barbelés perd un dé, affiché à part
  const snared = calcHTML({ ...outcome, reduction: 0, snare: 1, terrainKey: 'plaine' });
  assert.match(snared, /− <b>1<\/b> \(empêtrée dans les barbelés\)/);
});

test('tipHTML : terrain seul, puis terrain + unité', () => {
  const state = createGame({ rng: mulberry32(5) });
  const empty = tipHTML(state, emptyUi, { c: 0, r: 0 });
  assert.match(empty, /Plaine/);
  assert.match(empty, /gauche/);
  assert.match(empty, /<b>libre<\/b><small>ligne de mire/);
  assert.ok(!empty.includes('Figurines'));

  const forest = tipHTML(state, emptyUi, { c: 1, r: 2 }); // forêt du scénario
  assert.match(forest, /Forêt/);
  // protection schématique : une icône et une valeur par type d'attaquant
  assert.match(
    forest,
    /<b><svg class="icon".*?<\/svg>−1 <svg class="icon".*?<\/svg>−2 <svg class="icon".*?<\/svg>·<\/b><small>protection/,
  );
  assert.match(forest, /<b>stop<\/b><small>mouvement/);
  assert.match(forest, /<b>bloquée<\/b><small>ligne de mire/);

  const hill = tipHTML(state, emptyUi, { c: 4, r: 4 }); // colline du scénario
  assert.match(hill, /Colline/);
  // protection uniforme : une seule valeur, sans glyphes
  assert.match(hill, /<b>−1<\/b><small>protection/);
  assert.match(hill, /<b>contrebas<\/b><small>ligne de mire/);

  const bunker = tipHTML(state, emptyUi, { c: 4, r: 6 }); // bunker vide du scénario
  assert.match(bunker, /Bunker/);
  assert.match(bunker, /non cumulée/);
  assert.match(bunker, /infanterie seulement/);
  assert.match(bunker, /1er drapeau ignoré/);
  assert.match(bunker, /vue bloquée/);

  const hedgehog = tipHTML(state, emptyUi, { c: 10, r: 2 }); // antichar du scénario
  assert.match(hedgehog, /Obstacle antichar/);
  assert.match(hedgehog, /infanterie seulement/);
  assert.match(hedgehog, /1er drapeau ignoré/);
  assert.ok(!hedgehog.includes('non cumulée')); // aucun couvert
  assert.ok(!hedgehog.includes('vue bloquée'));

  const sandbags = tipHTML(state, emptyUi, { c: 8, r: 7 }); // sacs de sable du scénario
  assert.match(sandbags, /Sacs de sable/);
  assert.match(sandbags, /protection −1 \(artillerie sans malus\), non cumulée/);
  assert.match(sandbags, /1er drapeau ignoré/);
  assert.match(sandbags, /retirés en sortant/);
  assert.ok(!sandbags.includes('infanterie seulement'));

  const wire = tipHTML(state, emptyUi, { c: 3, r: 2 }); // barbelés du scénario
  assert.match(wire, /Barbelés/);
  assert.match(wire, /stoppe net/);
  assert.match(wire, /infanterie : −1 dé/);
  assert.match(wire, /coupe possible au lieu de combattre/);
  assert.match(wire, /écrasés par les blindés/);
  assert.ok(!wire.includes('non cumulée')); // aucun couvert

  const hedge = tipHTML(state, emptyUi, { c: 3, r: 3 }); // bocage du scénario
  assert.match(hedge, /Bocage/);
  assert.match(hedge, /entrée en 1er pas/);
  assert.match(hedge, /sortie : 1 hex/);
  assert.match(hedge, /pas de tir le tour d'entrée/);
  assert.match(hedge, /<b>bloquée<\/b><small>ligne de mire/);

  // rivière puis pont, posés à la main (absents du scénario par défaut)
  state.terrain[key(0, 4)] = 'riviere';
  const river = tipHTML(state, emptyUi, { c: 0, r: 4 });
  assert.match(river, /Rivière/);
  assert.match(river, /<b>pont requis<\/b><small>mouvement/);
  assert.match(river, /<b>libre<\/b><small>ligne de mire/);

  state.obstacles[key(0, 4)] = 'pont';
  const bridge = tipHTML(state, emptyUi, { c: 0, r: 4 });
  assert.match(bridge, /Pont/);
  assert.match(bridge, /rend l'hex franchissable/);
  assert.ok(!bridge.includes('non cumulée')); // aucun couvert sur un pont

  state.terrain[key(0, 6)] = 'mer';
  const sea = tipHTML(state, emptyUi, { c: 0, r: 6 });
  assert.match(sea, /Mer/);
  assert.match(sea, /aucun tir/);
  assert.match(sea, /sortie : 1 hex/);
  assert.match(sea, /pas de retraite/);

  state.terrain[key(0, 5)] = 'plage';
  const beach = tipHTML(state, emptyUi, { c: 0, r: 5 });
  assert.match(beach, /Plage/);
  assert.match(beach, /<b>2 hex max<\/b><small>mouvement/);
  assert.ok(!beach.includes('aucun tir')); // aucune restriction de combat

  const withUnit = tipHTML(state, emptyUi, { c: 1, r: 7 }); // infanterie alliée
  assert.match(withUnit, /Infanterie/);
  assert.match(withUnit, /Figurines/);
  assert.match(withUnit, /4 \/ 4/);
  // pastille et faces « touchée sur » : icônes schématiques d'unités
  assert.match(withUnit, /<span class="chip allies"><svg class="icon"/);
  assert.match(withUnit, /Touchée sur<b>(<svg class="icon"[^]*?<\/svg>|[✸★⚑]| )+<\/b>/);
});
