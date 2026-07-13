# Ordre de Bataille — proto « secteur bocage »

Jeu de plateau hexagonal type Mémoire 44 : cartes de commandement par secteur,
dés spéciaux, terrain, IA gloutonne pour l'Axe. Un seul scénario pour l'instant.

## Stack

- JavaScript ES modules (ES2022), **aucun bundler** : le code se charge tel quel dans le navigateur.
- Rendu : **Canvas 2D natif** + DOM. Aucune bibliothèque runtime.
- Tests : `node --test` (intégré à Node, zéro dépendance) — `npm test`.
- ESLint 9 (flat config, `eslint.config.js`) + Prettier — `npm run lint`, `npm run format`.
- `npm run dev` sert le projet en local (`npx serve .`) — un serveur HTTP est requis,
  les ES modules ne se chargent pas en `file://`.

## Architecture en deux couches (non négociable)

**`src/` = logique métier, agnostique du rendu.**

- Ne touche JAMAIS au DOM ni au canvas. C'est la couche testée.
- Toutes les fonctions prennent l'état en argument (`state` ou une de ses parties).
  Aucun état global de module : tout vit dans l'objet `state`.
- L'état est créé par la factory unique `createGame({ rng })` dans `src/game.js`.
- Quand une règle doit provoquer un effet visuel, elle ÉMET un événement
  (`state.bus.emit('nomEvenement', payload)`) — elle n'appelle jamais le rendu.
- Tout aléa passe par `state.rng` (jamais `Math.random` en dur) : les tests injectent
  un RNG déterministe (`test/helpers.js` → `mulberry32`).
- La géométrie pure vit dans `src/hex.js` (aucune dépendance à l'état).

**`render/` = rendu & interaction.**

- Importe la logique depuis `src/`, lit l'état, s'abonne au bus. AUCUNE règle métier :
  la légalité d'une action vient toujours d'une fonction de `src/`.
- Deux modules PURS et testables sans navigateur : `render/html.js` (fragments HTML
  sous forme de chaînes) et `render/gfx.js` (layout du plateau, palette, picking).
  Toute génération de HTML ou tout calcul graphique testable va là, pas dans les modules DOM.
- `render/app.js` est le seul chef d'orchestre : il câble le bus, séquence le tempo
  (tour de l'IA, modale de combat) et appelle les fonctions de `src/` pour chaque décision.

**Règle d'or** : si un changement décide « ce qui se passe », il va dans `src/` et se teste.
S'il décide « comment ça s'affiche », il va dans `render/`.

## Structure

```
index.html            # bootstrap : DOM squelette + <script type="module" src="render/app.js">
styles.css            # tout le CSS
src/
  config.js           # constantes du domaine (plateau, terrains, unités, faces de dé)
  events.js           # createBus() — on/emit minimaliste
  hex.js              # géométrie hexagonale pure (offset odd-r) : key, distance, voisins
  sectors.js          # secteurs gauche/centre/droite, hexes à cheval
  cards.js            # cartes de commandement, composition de la pioche
  scenario.js         # terrain initial + ordre de bataille
  movement.js         # unitAt, reachable (terrains bloquants, hexes occupés)
  combat.js           # dés de tir, cibles, rollDice, resolveCombat (repli, médailles)
  game.js             # createGame + séquence : pioche, carte, mouvement, attaque, tours
  ai.js               # IA de l'Axe (choix de carte, plans d'unités)
render/
  app.js              # assemble tout, câble bus → rendu, tempo des tours
  stage.js            # canvas : mise à l'échelle DPR, rendu à la demande, scène dynamique
  board.js            # couche statique du plateau, rasterisée une fois par partie
  hud.js              # journal, plateau de dés, médailles, invite, infobulle (DOM)
  hand.js             # éventail de cartes, boutons d'action, survol par bandes fixes
  combatModal.js      # mise en scène d'un combat déjà résolu (animations, dés)
  input.js            # clic, glisser-déposer, survol du plateau
  uiState.js          # état d'interaction (sélection, drag, hover…)
  html.js             # PUR : fragments HTML en chaînes
  gfx.js              # PUR : layout, palette, pickHex, lignes de secteur
test/
  <module>.test.js    # un fichier par module de src/ + html.js et gfx.js
  helpers.js          # mulberry32 (RNG déterministe)
```

## L'objet `state` (créé par `createGame`)

| Champ        | Contenu                                                       |
| ------------ | ------------------------------------------------------------- |
| `terrain`    | `{ "c,r": 'plaine'\|'foret'\|'colline'\|'village' }`          |
| `units`      | `[{ id, side, type, c, r, figs, acted }]`                     |
| `decks`      | `{ allies: [cardId], axis: [cardId] }`                        |
| `hands`      | `{ allies: [cardId], axis: [cardId] }`                        |
| `medals`     | `{ allies, axis }` — 4 médailles = victoire                   |
| `turn`       | `'allies'` \| `'axis'`                                        |
| `phase`      | `'card'` (jouer une carte) \| `'orders'` (activer les unités) |
| `playedCard` | id de la carte en cours, ou `null`                            |
| `ordersLeft` | ordres restants sur la carte jouée                            |
| `moved`      | `{ unitId: coût }` des déplacements de l'activation en cours  |
| `winner`     | `null` \| `'allies'` \| `'axis'`                              |
| `bus`        | bus d'événements (`createBus()`)                              |
| `rng`        | source d'aléa injectable (défaut `Math.random`)               |

L'état d'interaction (sélection, drag, hover, cartes fraîchement piochées) vit dans
`render/uiState.js`, PAS dans `state` : il est purement visuel ou dérivable de `src/`.

## Événements du bus (seul canal règles → rendu)

| Événement        | Émis par                    | Payload                                                                                    | Consommé par                                                                    |
| ---------------- | --------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `cardsDrawn`     | `game.js` `drawCards`       | `{ side, count }`                                                                          | `app.js` → animation de pioche                                                  |
| `cardPlayed`     | `game.js` `playCard`        | `{ side, card, ordersLeft }`                                                               | `app.js` → journal                                                              |
| `unitMoved`      | `game.js` `moveUnit`        | `{ unit, from, cost }`                                                                     | `app.js` → journal + redraw                                                     |
| `combatResolved` | `game.js` `attackUnit`      | `{ attacker, defender, range, baseDice, reduction, dice, figsBefore, terrainKey, report }` | `app.js` → dés + journal ; la modale reçoit le même outcome en valeur de retour |
| `medalAwarded`   | `combat.js` `resolveCombat` | `{ side, medals }`                                                                         | `app.js` → compteurs de médailles                                               |
| `gameWon`        | `combat.js` `resolveCombat` | `{ side }`                                                                                 | aucun (l'invite lit `state.winner`)                                             |

Tout nouvel événement doit être ajouté à ce tableau (émetteur, payload, consommateurs).

## Où placer du nouveau code

| Type de changement                                | Fichier à toucher                      |
| ------------------------------------------------- | -------------------------------------- |
| Constante du domaine (unité, terrain, face de dé) | `src/config.js`                        |
| Règle de déplacement                              | `src/movement.js` + test               |
| Règle de tir / résolution de combat               | `src/combat.js` + test                 |
| Nouvelle carte / composition de pioche            | `src/cards.js` + test                  |
| Scénario, mise en place                           | `src/scenario.js` + test               |
| Séquence de tour, nouvelle action de jeu          | `src/game.js` + test (+ événement bus) |
| Comportement de l'IA                              | `src/ai.js` + test                     |
| Géométrie hexagonale                              | `src/hex.js` + test                    |
| Fragment HTML (carte, infobulle, panneau)         | `render/html.js` + test                |
| Calcul graphique (layout, picking, couleurs)      | `render/gfx.js` + test                 |
| Dessin canvas dynamique (unités, aides visuelles) | `render/stage.js`                      |
| Dessin statique du plateau                        | `render/board.js`                      |
| Journal, dés, médailles, invite, infobulle        | `render/hud.js`                        |
| Main de cartes, boutons d'action                  | `render/hand.js`                       |
| Animation de la modale de combat                  | `render/combatModal.js`                |
| Souris / glisser-déposer sur le plateau           | `render/input.js`                      |
| Nouvel état d'interaction                         | `render/uiState.js`                    |
| Câblage bus → rendu, tempo, orchestration         | `render/app.js`                        |
| Styles                                            | `styles.css`                           |

## Conventions

- Identifiants en anglais, verbes explicites du domaine (`resolveCombat`, `orderableUnits`).
- UI, journaux et commentaires en français.
- Après édition, nettoyer imports/constantes/CSS inutilisés et lignes vides superflues.

## Process

- Ne jamais déclarer une tâche terminée sans avoir lancé `npm test` et vérifié que la suite passe.
- Privilégier des tests MACRO (comportement fonctionnel observable, ex. « un tour allié
  complet » dans `test/game.test.js`) plutôt que des tests de détails d'implémentation.
- Implémenter uniquement ce qui est demandé, sans features/métriques/visualisations non requises.
