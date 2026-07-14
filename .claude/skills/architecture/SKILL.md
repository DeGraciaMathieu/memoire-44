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

| Module                  | Rôle                                                                                                                                                                                                                                                                                                                                                                                   | Dépendances clés                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `src/config.js`         | Constantes du domaine (`W`, `H`, `TERRAIN`, `OBSTACLES`, `UNITS`, `FACES`, `MEDALS_TO_WIN`, `HAND_SIZE`)                                                                                                                                                                                                                                                                               | —                                                         |
| `src/events.js`         | `createBus()` — on/emit minimaliste                                                                                                                                                                                                                                                                                                                                                    | —                                                         |
| `src/hex.js`            | Géométrie pure odd-r : `key`, `inBounds`, `toCube`, `hexDistance`, `neighbors`, `hexLine`                                                                                                                                                                                                                                                                                              | `config`                                                  |
| `src/sectors.js`        | `SECTORS`, `sectorsOf`, `cardSectors`, `inSector` (hexes à cheval)                                                                                                                                                                                                                                                                                                                     | —                                                         |
| `src/cards.js`          | `CARDS` (commandement + actions), `cardById`, `buildDeck` (34 cartes)                                                                                                                                                                                                                                                                                                                  | —                                                         |
| `src/scenario.js`       | `scenario()` — terrain initial, 2 objectifs + 14 unités                                                                                                                                                                                                                                                                                                                                | `config`, `hex`                                           |
| `src/map.js`            | Cartes de l'éditeur : `serializeMap`, `parseMap` (validation), `setupFromMap`, `unitAllowedOn`                                                                                                                                                                                                                                                                                         | `config`, `hex`                                           |
| `src/movement.js`       | `unitAt`, `obstacleAt`, `dropObstacleOnExit`, `crushObstacleOnEnter`, `reachable`                                                                                                                                                                                                                                                                                                      | `config`, `hex`                                           |
| `src/combat.js`         | `reductionOf`, `defenseReduction`, `attackerSnare`, `diceFor`, `canFight`, `targetsFor`, `hasLineOfSight`, `objectivesHeld`, `medalCount`, `checkVictory`, `rollDice`, `resolveCombat`                                                                                                                                                                                                 | `config`, `hex`, `movement`                               |
| `src/game.js`           | `createGame({ rng, map, playerSide })` + séquence : `drawCards`, `playCard`, `moveUnit`, `attackUnit`, `takeGroundHex`, `takeGround`, `canBreakthrough`, `canCutWire`, `cutWire`, `finishUnit`, `endPlayerTurn`, `endAiTurn`, `orderableUnits`, `shuffle` + cartes actions : `barrageTargets`, `resolveBarrage`, `validAirTarget`, `resolveAirStrike`, `medicTargets`, `resolveMedics` | tous les modules `src/`                                   |
| `src/ai.js`             | `aiPickCard`, `aiChooseMoves`, `aiTakesGround`, `aiBreakthroughTarget`, `aiBarrageTarget`, `aiAirHexes`, `aiMedicsTarget` (+ `aiPlanUnit`, `cardScore` privés)                                                                                                                                                                                                                         | `config`, `hex`, `cards`, `game`, `movement`, `combat`    |
| `render/app.js`         | Chef d'orchestre (`game.html`) : câble bus → rendu, actions joueur, tempo du tour Axe, cycle de vie (`startGame`), chargement d'une carte JSON (`?map=<fichier>` de l'accueil ou fichier local)                                                                                                                                                                                        | `src/*` + tous les modules `render/`                      |
| `render/home.js`        | Page d'accueil (`index.html`) : liste les cartes du manifeste `maps/index.json` avec un aperçu du plateau (raster réduit + pastilles d'unités) et le choix du camp, liens vers `game.html?map=<fichier>&side=<camp>`                                                                                                                                                                   | `src/map`, `board`, `gfx`, `html`                         |
| `render/editor.js`      | Éditeur de cartes (`editor.html`) : palette d'outils, peinture du plateau, export/import JSON                                                                                                                                                                                                                                                                                          | `src/map`, `board`, `stage`, `gfx`, `uiState`, `html`     |
| `render/stage.js`       | Canvas : DPR, rendu à la demande (rAF coalescé), scène dynamique, `drawCounter`, obstacles (pastille `OBSTACLE_BADGE` au coin du pion qui en occupe un), explosions `boom(hexes)` auto-animées                                                                                                                                                                                         | `gfx`, `html`, `src/cards`, `src/sectors`, `src/movement` |
| `render/board.js`       | `buildBoardLayer` — raster statique du plateau, 1× par partie                                                                                                                                                                                                                                                                                                                          | `gfx`, `src/hex`, `src/sectors`                           |
| `render/hud.js`         | Journal, plateau de dés, médailles, invite, infobulle (DOM)                                                                                                                                                                                                                                                                                                                            | `html`                                                    |
| `render/hand.js`        | Éventail de cartes, survol par bandes fixes, boutons d'action                                                                                                                                                                                                                                                                                                                          | `html`, `src/cards`                                       |
| `render/combatModal.js` | Animation d'un combat **déjà résolu** (reçoit l'outcome)                                                                                                                                                                                                                                                                                                                               | `html`, `src/config`, `src/hex`                           |
| `render/input.js`       | Pointeur : clic, glisser-déposer, survol/infobulle                                                                                                                                                                                                                                                                                                                                     | `gfx`, `html`, `src/movement`                             |
| `render/uiState.js`     | `createUiState()` — état d'interaction, purement visuel                                                                                                                                                                                                                                                                                                                                | —                                                         |
| `render/html.js`        | **PUR** : fragments HTML en chaînes (`cardHTML`, `tipHTML`, `calcHTML`, `forcePanelHTML`) + `SYM`, `UNIT_GLYPH`, `SIDE_FR`                                                                                                                                                                                                                                                             | `src` (config, hex, sectors, movement, combat)            |
| `render/gfx.js`         | **PUR** : `LAYOUT`, `COL`, `boardSize`, `hexCenter`, `hexPath`, `pickHex`, `bridgeSpec`, `sectorLinesX`, `sectorLabelsX`                                                                                                                                                                                                                                                               | `src/config`, `src/hex`                                   |

## L'objet `state` (créé par `createGame({ rng, map })`, `src/game.js` — `map` : carte validée par `parseMap`, défaut = `scenario()`)

| Champ        | Contenu                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `terrain`    | `{ "c,r": 'plaine'\|'foret'\|'colline'\|'village'\|'bocage'\|'riviere'\|'mer'\|'plage' }`                                                            |
| `obstacles`  | `{ "c,r": 'bunker'\|'antichar'\|'sacs'\|'pont'\|'barbeles' }` — obstacles posés sur le terrain (`OBSTACLES`), mutable : sacs et barbelés se retirent |
| `objectives` | `{ "c,r": true }` — tuiles objectif : une médaille au camp dont une unité occupe la tuile (`objectivesHeld`, `src/combat.js`)                        |
| `units`      | `[{ id, side, type, c, r, figs, acted }]`                                                                                                            |
| `decks`      | `{ allies: [cardId], axis: [cardId] }` — répartition initiale 10/24                                                                                  |
| `hands`      | `{ allies: [cardId], axis: [cardId] }`                                                                                                               |
| `medals`     | `{ allies, axis }` — médailles de destruction seulement ; total affiché/victoire = `medalCount` (+ objectifs), `MEDALS_TO_WIN` (6)                   |
| `playerSide` | `'allies'` \| `'axis'` — camp de l'humain, choisi sur la page d'accueil (`?side=`)                                                                   |
| `aiSide`     | l'autre camp — celui que joue l'IA (`src/ai.js`)                                                                                                     |
| `turn`       | `'allies'` \| `'axis'`                                                                                                                               |
| `phase`      | `'card'` (jouer une carte) \| `'orders'` (activer les unités)                                                                                        |
| `playedCard` | id de la carte **effective** en cours (une Contre-attaque pose la carte rejouée), ou `null`                                                          |
| `lastCard`   | `{ allies, axis }` — id de la dernière carte jouée par chaque camp (cible de la Contre-attaque)                                                      |
| `ordersLeft` | ordres restants sur la carte jouée                                                                                                                   |
| `moved`      | `{ unitId: coût }` des déplacements de l'activation en cours (prise de terrain incluse)                                                              |
| `attacks`    | `{ unitId: nombre }` d'attaques de l'activation en cours — pilote la percée de blindés                                                               |
| `winner`     | `null` \| `'allies'` \| `'axis'`                                                                                                                     |
| `bus`        | bus d'événements (`createBus()`)                                                                                                                     |
| `rng`        | source d'aléa injectable (défaut `Math.random`)                                                                                                      |

L'état d'interaction (sélection, drag, hover, `justDrew`, `modalOpen`, `takeGround`,
`breakthrough`, `action`, `cutWire`) vit dans `render/uiState.js`, **pas** dans `state` :
purement visuel ou dérivable de `src/`.

## Événements du bus (seul canal règles → rendu)

| Événement         | Émis par                                                                                                                           | Payload                                                                                                                     | Consommé par                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `cardsDrawn`      | `game.js` `drawCards`                                                                                                              | `{ side, count }`                                                                                                           | `app.js` → animation de pioche                                                  |
| `cardPlayed`      | `game.js` `playCard`                                                                                                               | `{ side, card, as, ordersLeft }` — `as` : carte effective d'une Contre-attaque, sinon `null`                                | `app.js` → journal                                                              |
| `unitMoved`       | `game.js` `moveUnit`                                                                                                               | `{ unit, from, cost }`                                                                                                      | `app.js` → journal + redraw                                                     |
| `combatResolved`  | `game.js` `attackUnit`                                                                                                             | `{ attacker, defender, range, baseDice, reduction, snare, dice, figsBefore, defenderHex, terrainKey, obstacleKey, report }` | `app.js` → dés + journal ; la modale reçoit le même outcome en valeur de retour |
| `groundTaken`     | `game.js` `takeGround`                                                                                                             | `{ unit, from }`                                                                                                            | `app.js` → journal + redraw                                                     |
| `actionStruck`    | `game.js` `resolveBarrage` et `resolveAirStrike` (une frappe par unité)                                                            | `{ card, side, defender, dice, figsBefore, defenderHex, obstacleKey, report }`                                              | `app.js` → dés + journal + boom + redraw                                        |
| `unitHealed`      | `game.js` `resolveMedics`                                                                                                          | `{ unit, restored, faces }`                                                                                                 | `app.js` → dés + journal + redraw                                               |
| `medalAwarded`    | `combat.js` `resolveCombat`                                                                                                        | `{ side, medals }`                                                                                                          | `app.js` → compteurs de médailles                                               |
| `gameWon`         | `combat.js` `checkVictory` (via `resolveCombat`, `moveUnit`, `takeGround`)                                                         | `{ side }`                                                                                                                  | aucun (l'invite lit `state.winner`)                                             |
| `obstacleRemoved` | `movement.js` `dropObstacleOnExit` / `crushObstacleOnEnter` (via `moveUnit`, `takeGround`, `resolveCombat`) et `game.js` `cutWire` | `{ c, r, obstacle }`                                                                                                        | `app.js` → journal + redraw                                                     |

Tout nouvel événement doit être ajouté à ce tableau (émetteur, payload, consommateurs).

## Cycle de vie et patterns

- `startGame` (`render/app.js`) : `createGame` → `createUiState` → `buildBoardLayer` →
  `wireBus` → pioches → `refresh`. Le bus est **recréé à chaque partie** : tout nouvel
  abonnement se place dans `wireBus`, sinon il meurt au restart.
- Les modules de rendu lisent l'état courant via les closures `getScene()` / `getState()`
  / `getUi()` fournies par `app.js` — jamais par référence directe capturée (elle serait
  périmée après « Nouvelle partie »).
- Le tempo (sleeps, `setTimeout(playAiTurn, 700)`, modale à attendre) vit exclusivement
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
| Page d'accueil, liste des cartes proposées        | `render/home.js` (+ `maps/index.json`) |
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
