---
name: combat
description: Use when travailler sur les dés, les portées, les réductions de terrain, la résolution de combat, le repli, les médailles, la condition de victoire ou la modale d'engagement.
auto_invoke: true
---

# Combat

## Concepts → implémentation

| Concept              | Implémentation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faces du dé          | `FACES` (`src/config.js`) : `inf`, `inf`, `arm`, `grenade`, `star`, `flag` — symboles d'affichage dans `SYM` (`render/html.js`)                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Qui touche quoi      | `UNITS[type].hitOn` : inf → `['inf','grenade']`, arm → `['arm','grenade']`, art → `['inf','grenade']` (simplification assumée : l'artillerie est touchée sur le symbole infanterie)                                                                                                                                                                                                                                                                                                                                                                                                |
| Dés par portée       | `UNITS[type].dice[distance - 1]` : inf `[3,2,1]`, arm `[3,3,3]`, art `[3,3,2,2,1,1]` — hors de portée si `undefined`                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Réduction de terrain | `defenseReduction(state, attackerType, target)` (`src/combat.js`) : `dice.defArmor` si l'attaquant est un blindé, `dice.defArt` si c'est l'artillerie (forêt, bocage : 0 = sans malus), sinon `dice.def` ; avec un obstacle (`OBSTACLES`), non cumulé : `max(terrain, obstacle)` par type d'attaquant (`reductionOf`)                                                                                                                                                                                                                                                              |
| Dés effectifs        | `diceFor(state, unit, target)` : `max(1, base − réduction)` — jamais moins de 1 dé si à portée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Cibles valides       | `targetsFor(state, unit, movedCost)` : art interdit après tout mouvement, inf interdit après plus de 1 hex ; terrain `noFightOnEnter` (bocage) : aucun tir le tour d'entrée                                                                                                                                                                                                                                                                                                                                                                                                        |
| Ligne de mire        | `hasLineOfSight(state, from, to)` (`src/combat.js`) + `hexLine` (`src/hex.js`) : un hex intermédiaire `blocksSight` — terrain (forêt, village, bocage) ou obstacle (bunker) — coupe le tir → `diceFor` renvoie 0. Une colline (`elevated`) intermédiaire ne bloque que si tireur ET cible sont en contrebas — une extrémité sur colline (même altitude) rétablit la vue, mais ne voit pas à travers une forêt/un village. Hexes du tireur et de la cible exclus ; ligne longeant une arête = bloqué seulement si les DEUX hexes riverains bloquent ; le hors-plateau ne bloque pas |
| Tirage               | `rollDice(n, rng)` — **toujours** `state.rng`, jamais `Math.random`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Résolution           | `resolveCombat(state, attacker, defender, faces)` : touches → `figs` ; drapeaux → repli ; anéantissement → médaille                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Repli                | 1 hex par drapeau vers la ligne de départ (`home` = rangée 8 alliés / 0 Axe), hex libre le plus loin de l'attaquant ; **dos au mur** = perte supplémentaire (`extraLoss`) ; obstacle `ignoreFirstFlag` (bunker, antichar) : le premier drapeau du jet est ignoré (`report.flagsIgnored`, simplification : toujours appliqué), l'artillerie retranchée dans un bunker ne replie jamais et encaisse                                                                                                                                                                                  |
| Victoire             | `MEDALS_TO_WIN` (4) — `resolveCombat` pose `state.winner` et émet `gameWon`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Flux complet d'une attaque

1. `render/app.js` `attackTarget` (joueur) ou `playAxisTurn` (IA) appelle
   `attackUnit(state, attacker, defender)` (`src/game.js`).
2. `attackUnit` capture l'outcome **avant** résolution (`range`, `baseDice`, `reduction`,
   `dice`, `figsBefore`, `terrainKey` — le défenseur peut se replier ensuite), tire les
   faces (`rollDice`), résout (`resolveCombat` → émet `medalAwarded` / `gameWon`), puis
   émet `combatResolved` avec l'outcome complet.
3. `app.js` (abonné `combatResolved`) : plateau de dés (`hud.showDice`) + journal.
4. `combatModal.play(state, outcome, { auto })` anime le résultat déjà connu ; `auto: true`
   pour l'IA (fermeture après 2100 ms).
5. Retour au flux : `finish(u)` → `finishUnit` (joueur) ou boucle des plans (IA).

## Modifier une règle de combat

1. `src/combat.js` — et `src/game.js` `attackUnit` si l'outcome doit transporter de
   nouvelles valeurs pour l'affichage.
2. `test/combat.test.js` : macro avec faces **explicites** (pas de RNG) via `battleState()` ;
   `test/game.test.js` si le flux d'attaque change.
3. **Miroir IA** : `canFire` dans `aiPlanUnit` (`src/ai.js`) duplique les restrictions de
   `targetsFor` — les synchroniser, sinon l'IA planifie des tirs illégaux (refusés au
   runtime mais gaspillés).
4. Affichage : `calcHTML` (`render/html.js`) pour le détail du calcul,
   `render/combatModal.js` pour la chorégraphie.
5. Doc vivante si la règle est visible du joueur : `RANGE_LBL` / `MOVE_LBL`
   (`render/html.js`), `#mGoal` (`index.html`) et message de démarrage (`render/app.js`)
   si l'objectif de médailles change.

## Ajouter un type d'unité

1. `src/config.js` → `UNITS` : `{ label, figs, move, moveNoFire, dice, hitOn }`.
2. `render/html.js` → `UNIT_GLYPH`, `MOVE_LBL`, `RANGE_LBL`.
3. `src/ai.js` → `P_HIT` (probabilité de touche par dé contre ce type).
4. `src/scenario.js` → le poser sur le plateau (`add(side, type, c, r)`).
5. Tests : `test/combat.test.js` (hitOn, dés) + `test/scenario.test.js` (placement).
