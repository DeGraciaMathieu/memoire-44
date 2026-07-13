---
name: testing
description: Use when écrire, modifier ou lancer des tests, vérifier la couverture d'un changement, ou choisir dans quel fichier de test placer une nouvelle assertion.
auto_invoke: true
---

# Testing

## Commandes

| Action          | Commande                          |
| --------------- | --------------------------------- |
| Toute la suite  | `npm test`                        |
| Un seul fichier | `node --test test/combat.test.js` |

Runner : `node --test` natif (aucune dépendance). Assertions : `node:assert/strict`.

## Philosophie

- **Tests MACRO d'abord** : vérifier le comportement fonctionnel observable (un tour
  complet, une attaque cohérente, un repli), pas les détails d'implémentation. Exemple
  de référence : « un tour allié complet » dans `test/game.test.js`.
- **Déterminisme obligatoire** : jamais d'aléa nu dans un test. Injecter
  `mulberry32(seed)` (`test/helpers.js`) via `createGame({ rng })` ou `rollDice(n, rng)`.
- **États minimaux fabriqués** quand `createGame` est trop lourd : voir `battleState()`
  dans `test/combat.test.js` et `flatState()` dans `test/movement.test.js` (terrain
  uniforme + unités posées à la main + `bus: createBus()` si le code testé émet).
- **Événements** : s'abonner au bus et enregistrer les paires `[événement, payload]`
  pour vérifier les émissions (voir `test/combat.test.js`, anéantissement).
- Préférer les assertions de **cohérence** (`hits === faces filtrées par hitOn`) aux
  valeurs en or fragiles quand le RNG intervient.

## Mapping fichier de test → périmètre couvert

| Fichier                 | Couvre                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `test/events.test.js`   | Bus : livraison, payload, désabonnement                                                                                   |
| `test/hex.test.js`      | Coordonnées cube, `hexDistance`, `neighbors`, bords                                                                       |
| `test/sectors.test.js`  | Hexes à cheval (colonnes 4/8), rangées impaires, `inSector`, `cardSectors` (flancs)                                       |
| `test/cards.test.js`    | Composition de la pioche (26 cartes, copies), `cardById`                                                                  |
| `test/scenario.test.js` | Mise en place : 14 unités, terrain du bocage                                                                              |
| `test/map.test.js`      | Cartes de l'éditeur : aller-retour JSON, validation `parseMap`, `setupFromMap`, `unitAllowedOn`                           |
| `test/movement.test.js` | `reachable` : plaine, hex occupé/bloquant, terrains qui stoppent, rivière/pont, mer, plage                                |
| `test/combat.test.js`   | `diceFor`, `targetsFor`, `rollDice`, `resolveCombat` (repli, dos au mur, médaille, victoire, événements)                  |
| `test/ai.test.js`       | `aiPickCard`, `aiChooseMoves` (forme des plans)                                                                           |
| `test/game.test.js`     | **MACRO** : déterminisme par graine, tour allié complet, `attackUnit`, rebattage de pioche, partie sur carte de l'éditeur |
| `test/html.test.js`     | Fragments purs : `cardHTML`, `forcePanelHTML`, `calcHTML`, `tipHTML`                                                      |
| `test/gfx.test.js`      | `boardSize`, aller-retour `hexCenter`/`pickHex`, lignes de secteur, nuances de plaine (`plaineShade`)                     |

## Où placer un nouveau test

1. **Nouvelle règle dans un module existant** → le fichier `test/<module>.test.js`
   correspondant, en style macro (état fabriqué → action → comportement observable).
2. **Nouveau module dans `src/`** → créer `test/<module>.test.js` (convention : un
   fichier de test par module de `src/`, plus `html.js` et `gfx.js`).
3. **Changement de séquence de jeu** (tour, phases) → `test/game.test.js`.
4. **Modules DOM de `render/`** (`stage`, `hud`, `hand`, `input`, `combatModal`,
   `board`, `app`) : pas de test unitaire Node — extraire la partie testable vers
   `render/html.js` ou `render/gfx.js` et la tester là. Aucun outillage navigateur n'est
   versionné dans ce dépôt.

## Rappel de process

Ne jamais déclarer une tâche terminée sans `npm test` vert. Un hook Stop du projet
relance d'ailleurs la suite automatiquement et bloque si elle échoue.
