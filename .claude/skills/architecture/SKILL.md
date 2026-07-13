---
name: architecture
description: Use when naviguer dans le code, décider où placer un changement, ajouter un événement au bus, modifier la forme de l'objet state, ou comprendre les dépendances entre src/ et render/.
auto_invoke: true
---

# Architecture — carte du projet

Deux couches strictement séparées. **Règle d'or** : « ce qui se passe » → `src/` + test ;
« comment ça s'affiche » → `render/`.

**Sens des imports** : `render/` importe `src/` ; jamais l'inverse. `src/` n'importe que
`src/`. Les tests importent `src/` et les deux modules purs `render/html.js` et
`render/gfx.js` — jamais les modules DOM.

## Modules

| Module                  | Rôle                                                                                                                                                                 | Dépendances clés                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/config.js`         | Constantes du domaine (`W`, `H`, `TERRAIN`, `OBSTACLES`, `UNITS`, `FACES`, `MEDALS_TO_WIN`, `HAND_SIZE`)                                                             | —                                                      |
| `src/events.js`         | `createBus()` — on/emit minimaliste                                                                                                                                  | —                                                      |
| `src/hex.js`            | Géométrie pure odd-r : `key`, `inBounds`, `toCube`, `hexDistance`, `neighbors`, `hexLine`                                                                            | `config`                                               |
| `src/sectors.js`        | `SECTORS`, `sectorsOf`, `inSector` (hexes à cheval)                                                                                                                  | —                                                      |
| `src/cards.js`          | `CARDS`, `cardById`, `buildDeck` (24 cartes)                                                                                                                         | —                                                      |
| `src/scenario.js`       | `scenario()` — terrain initial + 14 unités                                                                                                                           | `config`, `hex`                                        |
| `src/map.js`            | Cartes de l'éditeur : `serializeMap`, `parseMap` (validation), `setupFromMap`, `unitAllowedOn`                                                                       | `config`, `hex`                                        |
| `src/movement.js`       | `unitAt`, `obstacleAt`, `dropObstacleOnExit`, `reachable`                                                                                                            | `config`, `hex`                                        |
| `src/combat.js`         | `reductionOf`, `defenseReduction`, `diceFor`, `targetsFor`, `hasLineOfSight`, `rollDice`, `resolveCombat`                                                            | `config`, `hex`, `movement`                            |
| `src/game.js`           | `createGame({ rng, map })` + séquence : `drawCards`, `playCard`, `moveUnit`, `attackUnit`, `finishUnit`, `endPlayerTurn`, `endAxisTurn`, `orderableUnits`, `shuffle` | tous les modules `src/`                                |
| `src/ai.js`             | `aiPickCard`, `aiChooseMoves` (+ `aiPlanUnit` privé)                                                                                                                 | `config`, `hex`, `cards`, `game`, `movement`, `combat` |
| `render/app.js`         | Chef d'orchestre : câble bus → rendu, actions joueur, tempo du tour Axe, cycle de vie (`startGame`), chargement d'une carte JSON                                     | `src/*` + tous les modules `render/`                   |
| `render/editor.js`      | Éditeur de cartes (`editor.html`) : palette d'outils, peinture du plateau, export/import JSON                                                                        | `src/map`, `board`, `stage`, `gfx`, `uiState`, `html`  |
| `render/stage.js`       | Canvas : DPR, rendu à la demande (rAF coalescé), scène dynamique, `drawCounter`                                                                                      | `gfx`, `html`, `src/cards`, `src/sectors`              |
| `render/board.js`       | `buildBoardLayer` — raster statique du plateau, 1× par partie                                                                                                        | `gfx`, `src/hex`, `src/sectors`                        |
| `render/hud.js`         | Journal, plateau de dés, médailles, invite, infobulle (DOM)                                                                                                          | `html`                                                 |
| `render/hand.js`        | Éventail de cartes, survol par bandes fixes, boutons d'action                                                                                                        | `html`, `src/cards`                                    |
| `render/combatModal.js` | Animation d'un combat **déjà résolu** (reçoit l'outcome)                                                                                                             | `html`, `src/config`, `src/hex`                        |
| `render/input.js`       | Pointeur : clic, glisser-déposer, survol/infobulle                                                                                                                   | `gfx`, `html`, `src/movement`                          |
| `render/uiState.js`     | `createUiState()` — état d'interaction, purement visuel                                                                                                              | —                                                      |
| `render/html.js`        | **PUR** : fragments HTML en chaînes (`cardHTML`, `tipHTML`, `calcHTML`, `forcePanelHTML`) + `SYM`, `UNIT_GLYPH`, `SIDE_FR`                                           | `src` (config, hex, sectors, movement, combat)         |
| `render/gfx.js`         | **PUR** : `LAYOUT`, `COL`, `boardSize`, `hexCenter`, `hexPath`, `pickHex`, `sectorLinesX`, `sectorLabelsX`                                                           | `src/config`                                           |

## L'objet `state` (créé par `createGame({ rng, map })`, `src/game.js` — `map` : carte validée par `parseMap`, défaut = `scenario()`)

| Champ        | Contenu                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `terrain`    | `{ "c,r": 'plaine'\|'foret'\|'colline'\|'village'\|'bocage'\|'riviere'\|'mer'\|'plage' }`                                        |
| `obstacles`  | `{ "c,r": 'bunker'\|'antichar'\|'sacs'\|'pont' }` — obstacles posés sur le terrain (`OBSTACLES`), mutable : les sacs se retirent |
| `units`      | `[{ id, side, type, c, r, figs, acted }]`                                                                                        |
| `decks`      | `{ allies: [cardId], axis: [cardId] }` — répartition initiale 10/14                                                              |
| `hands`      | `{ allies: [cardId], axis: [cardId] }`                                                                                           |
| `medals`     | `{ allies, axis }` — victoire à `MEDALS_TO_WIN` (4)                                                                              |
| `turn`       | `'allies'` \| `'axis'`                                                                                                           |
| `phase`      | `'card'` (jouer une carte) \| `'orders'` (activer les unités)                                                                    |
| `playedCard` | id de la carte en cours, ou `null`                                                                                               |
| `ordersLeft` | ordres restants sur la carte jouée                                                                                               |
| `moved`      | `{ unitId: coût }` des déplacements de l'activation en cours                                                                     |
| `winner`     | `null` \| `'allies'` \| `'axis'`                                                                                                 |
| `bus`        | bus d'événements (`createBus()`)                                                                                                 |
| `rng`        | source d'aléa injectable (défaut `Math.random`)                                                                                  |

L'état d'interaction (sélection, drag, hover, `justDrew`, `modalOpen`) vit dans
`render/uiState.js`, **pas** dans `state` : purement visuel ou dérivable de `src/`.

## Événements du bus (seul canal règles → rendu)

| Événement         | Émis par                                                               | Payload                                                                                                 | Consommé par                                                                    |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `cardsDrawn`      | `game.js` `drawCards`                                                  | `{ side, count }`                                                                                       | `app.js` → animation de pioche                                                  |
| `cardPlayed`      | `game.js` `playCard`                                                   | `{ side, card, ordersLeft }`                                                                            | `app.js` → journal                                                              |
| `unitMoved`       | `game.js` `moveUnit`                                                   | `{ unit, from, cost }`                                                                                  | `app.js` → journal + redraw                                                     |
| `combatResolved`  | `game.js` `attackUnit`                                                 | `{ attacker, defender, range, baseDice, reduction, dice, figsBefore, terrainKey, obstacleKey, report }` | `app.js` → dés + journal ; la modale reçoit le même outcome en valeur de retour |
| `medalAwarded`    | `combat.js` `resolveCombat`                                            | `{ side, medals }`                                                                                      | `app.js` → compteurs de médailles                                               |
| `gameWon`         | `combat.js` `resolveCombat`                                            | `{ side }`                                                                                              | aucun (l'invite lit `state.winner`)                                             |
| `obstacleRemoved` | `movement.js` `dropObstacleOnExit` (via `moveUnit` et `resolveCombat`) | `{ c, r, obstacle }`                                                                                    | `app.js` → journal + redraw                                                     |

Tout nouvel événement doit être ajouté à ce tableau (émetteur, payload, consommateurs).

## Cycle de vie et patterns

- `startGame` (`render/app.js`) : `createGame` → `createUiState` → `buildBoardLayer` →
  `wireBus` → pioches → `refresh`. Le bus est **recréé à chaque partie** : tout nouvel
  abonnement se place dans `wireBus`, sinon il meurt au restart.
- Les modules de rendu lisent l'état courant via les closures `getScene()` / `getState()`
  / `getUi()` fournies par `app.js` — jamais par référence directe capturée (elle serait
  périmée après « Nouvelle partie »).
- Le tempo (sleeps, `setTimeout(playAxisTurn, 700)`, modale à attendre) vit exclusivement
  dans `render/app.js`, `hand.js` et `combatModal.js`.

## Où placer du nouveau code

| Type de changement                                | Fichier à toucher                      |
| ------------------------------------------------- | -------------------------------------- |
| Constante du domaine (unité, terrain, face de dé) | `src/config.js`                        |
| Règle de déplacement                              | `src/movement.js` + test               |
| Règle de tir / résolution de combat               | `src/combat.js` + test                 |
| Nouvelle carte / composition de pioche            | `src/cards.js` + test                  |
| Scénario, mise en place                           | `src/scenario.js` + test               |
| Format / validation d'une carte JSON              | `src/map.js` + test                    |
| Outils et export de l'éditeur de cartes           | `render/editor.js` (+ `editor.html`)   |
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
