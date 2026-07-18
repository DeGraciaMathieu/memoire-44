---
name: combat
description: Use when travailler sur les dés, les portées, les réductions de terrain, la résolution de combat, le repli, les médailles, la condition de victoire ou la modale d'engagement.
auto_invoke: true
---

# Combat

## Concepts → implémentation

| Concept              | Implémentation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faces du dé          | `FACES` (`src/config.js`) : `inf`, `inf`, `arm`, `grenade`, `star`, `flag` — symboles d'affichage dans `SYM` (`render/html.js`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Qui touche quoi      | `UNITS[type].hitOn` : inf → `['inf','grenade']`, arm → `['arm','grenade']`, art → `['inf','grenade']` (simplification assumée : l'artillerie est touchée sur le symbole infanterie)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Dés par portée       | `UNITS[type].dice[distance - 1]` : inf `[3,2,1]`, arm `[3,3,3]`, art `[3,3,2,2,1,1]` — hors de portée si `undefined`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Réduction de terrain | `defenseReduction(state, attackerType, target)` (`src/combat.js`) : `dice.defArmor` si l'attaquant est un blindé, `dice.defArt` si c'est l'artillerie (forêt, bocage : 0 = sans malus), sinon `dice.def` ; avec un obstacle (`OBSTACLES`), non cumulé : `max(terrain, obstacle)` par type d'attaquant (`reductionOf`)                                                                                                                                                                                                                                                                                                                                                                                                         |
| Dés effectifs        | `diceFor(state, unit, target)` : `max(1, base − réduction − empêtrement) + bonus de carte tactique` (`bonusDice`, `src/tactics.js` : +1 dé, `'all'` tout combat ou `'close'` au contact) — jamais moins de 1 dé si à portée ; l'empêtrement (`attackerSnare`) retire 1 dé à une infanterie sur des barbelés (`entanglesInfantry`), qui peut préférer les couper au lieu de combattre (`canCutWire`/`cutWire`, `src/game.js` — consomme le combat via `state.attacks`)                                                                                                                                                                                                                                                         |
| Cibles valides       | `targetsFor(state, unit, movedCost)` — éligibilité factorisée dans `canFight` (réutilisée par `canCutWire` et `aiPlanUnit`) : coût de mouvement toléré via `fightCap` (`src/tactics.js` — art sur place, inf 1 hex, blindé libre, surcharge `move.fight` de la carte tactique) ; terrain `noFight` (mer) : aucun tir tant que l'unité y est ; terrain `noFightOnEnter` (bocage) : aucun tir le tour d'entrée ; **combat rapproché obligatoire** : au contact d'un ennemi (portée 1), seules les cibles adjacentes sont proposées, pas de tir plus distant — miroir IA : `canFire` + filtre contact (`aiPlanUnit`)                                                                                                             |
| Ligne de mire        | `hasLineOfSight(state, from, to)` (`src/combat.js`) + `hexLine` (`src/hex.js`) : un hex intermédiaire `blocksSight` — terrain (forêt, village, bocage) ou obstacle (bunker) — coupe le tir → `diceFor` renvoie 0. Une colline (`elevated`) intermédiaire ne bloque que si tireur ET cible sont en contrebas — une extrémité sur colline (même altitude) rétablit la vue, mais ne voit pas à travers une forêt/un village. Hexes du tireur et de la cible exclus ; ligne longeant une arête = bloqué seulement si les DEUX hexes riverains bloquent ; le hors-plateau ne bloque pas ; rivière, mer et plage ne bloquent jamais (pas de `blocksSight`)                                                                          |
| Tirage               | `rollDice(n, rng)` — **toujours** `state.rng`, jamais `Math.random`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Résolution           | `resolveCombat(state, attacker, defender, faces, opts?)` : touches → `figs` ; drapeaux → repli ; anéantissement → médaille — opts des frappes tactiques : `starHits` (l'étoile touche, attaque aérienne), `noFlagCover` (aucun obstacle n'ignore de drapeau, barrage et attaque aérienne)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Repli                | 1 hex par drapeau vers la ligne de départ (`home` = rangée 8 alliés / 0 Axe), hex libre le plus loin de l'attaquant ; **dos au mur** = perte supplémentaire (`extraLoss`) ; obstacle `ignoreFirstFlag` (bunker, antichar, sacs de sable) : le premier drapeau du jet est ignoré (`report.flagsIgnored`, simplification : toujours appliqué), l'artillerie retranchée dans un bunker ne replie jamais et encaisse ; un repli hors d'un obstacle `removedOnExit` (sacs de sable) le retire du plateau (`dropObstacleOnExit`) ; un blindé qui replie sur des barbelés (`crushedByArmor`) les écrase (`crushObstacleOnEnter`) ; un terrain `impassable` (rivière) sans pont ou `noRetreatInto` (mer) est exclu des hexes de repli |
| Prise de terrain     | `takeGroundHex(state, attacker, outcome)` (`src/game.js`) : après un combat rapproché gagné (défenseur détruit ou en retraite), inf et arm peuvent avancer sur l'hex laissé vacant (`outcome.defenderHex`) — jamais l'artillerie ; restrictions d'entrée du terrain appliquées (`impassable` sans pont, obstacle `infantryOnly`) ; `takeGround` déplace l'unité, incrémente `state.moved` (le bocage pris bloque donc la percée via `noFightOnEnter`) et émet `groundTaken` ; optionnelle : le joueur clique l'hex ou ailleurs, l'IA décide via `aiTakesGround`                                                                                                                                                               |
| Percée de blindés    | `canBreakthrough(state, unit)` (`src/game.js`) : après sa première attaque suivie d'une prise de terrain, un blindé (`state.attacks[id] === 1`) peut attaquer une seconde fois (priorité au combat rapproché via `targetsFor`) ; une seconde attaque gagnée ouvre une prise de terrain classique, jamais une seconde percée ; second tir tactique : `canAttackAgain(state, unit)` (`src/game.js`) — la carte Bombardement (`attacks: 2`, `attacksAllowed` dans `src/tactics.js`) laisse l'artillerie qui n'a pas bougé tirer une seconde fois, UI de la percée réutilisée (`ui.breakthrough`), IA via `aiBreakthroughTarget`                                                                                                  |
| Objectifs            | `state.objectives` (`{ "c,r": 'both'\|'allies'\|'axis' }`) : la tuile vaut une médaille au camp dont une unité l'occupe **si elle lui rapporte** (`objectiveScoresFor` : `'both'` mixte, sinon seul le camp désigné marque — l'autre ne peut qu'occuper pour bloquer), rendue dès qu'elle la quitte — `objectivesHeld` / `medalCount` (`src/combat.js`) : total = `state.medals` (destructions) + objectifs occupés                                                                                                                                                                                                                                                                                                           |
| Victoire             | `MEDALS_TO_WIN` (6) — `checkVictory(state)` (`src/combat.js`) recompte `medalCount` des deux camps, pose `state.winner` et émet `gameWon` ; appelé après chaque destruction/repli (`resolveCombat`) et chaque mouvement (`moveUnit`, `takeGround`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Flux complet d'une attaque

1. `render/app.js` `attackTarget` (joueur) ou `playAiTurn` (IA) appelle
   `attackUnit(state, attacker, defender)` (`src/game.js`).
2. `attackUnit` capture l'outcome **avant** résolution (`range`, `baseDice`, `reduction`,
   `dice`, `figsBefore`, `defenderHex`, `terrainKey` — le défenseur peut se replier
   ensuite), incrémente `state.attacks`, tire les faces (`rollDice`), résout
   (`resolveCombat` → émet `medalAwarded` / `gameWon`), puis émet `combatResolved`
   avec l'outcome complet.
3. `app.js` (abonné `combatResolved`) : plateau de dés (`hud.showDice`) + journal.
4. `playCombat` (`app.js`) enveloppe `combatModal.play(state, outcome, { auto })` — le
   résultat est déjà connu, `auto: true` pour l'IA (fermeture après 2100 ms) — puis, à la
   fermeture de la modale, appelle `stage.boom(outcome.defenderHex, { damage, killed,
retreatedId, corpse })` si le défenseur a encaissé (touches, pertes de repli ou
   destruction) : une explosion par coin de la tuile par dégât, une explosion centrale
   plus large si l'unité est détruite, le pion replié reste affiché sur son hex
   d'origine tant que le feu brûle, et le pion détruit (`corpse`, avec ses figurines
   d'avant l'attaque) ne disparaît qu'après la dernière explosion. `boom` **renvoie**
   la durée totale des explosions, et `playCombat` attend `ms + 150 ms` avant de rendre
   la main, de sorte que le repli du défenseur est affiché à l'écran avant que la prise
   de terrain ou la percée ne s'enclenche.
5. Si `takeGroundHex` renvoie un hex : prise de terrain proposée (joueur : `ui.takeGround`,
   clic ; IA : `aiTakesGround`), puis éventuelle percée de blindés (`canBreakthrough` →
   nouvelle attaque, retour au point 2).
6. Retour au flux : `finish(u)` → `finishUnit` (joueur) ou boucle des plans (IA).

## Modifier une règle de combat

1. `src/combat.js` — et `src/game.js` `attackUnit` si l'outcome doit transporter de
   nouvelles valeurs pour l'affichage.
2. `test/combat.test.js` : macro avec faces **explicites** (pas de RNG) via `battleState()` ;
   `test/game.test.js` si le flux d'attaque change.
3. **Miroir IA** : `aiPlanUnit` (`src/ai.js`) réutilise `canFight` pour ses destinations —
   seule la règle du combat rapproché obligatoire y est dupliquée (filtre contact) ; la
   synchroniser si elle évolue.
4. Affichage : `calcHTML` (`render/html.js`) pour le détail du calcul,
   `render/combatModal.js` pour la chorégraphie.
5. Doc vivante si la règle est visible du joueur : `RANGE_LBL` / `MOVE_LBL`
   (`render/html.js`), `#mGoal` (`game.html`) et message de démarrage (`render/app.js`)
   si l'objectif de médailles change.

## Ajouter un type d'unité

1. `src/config.js` → `UNITS` : `{ label, figs, move, moveNoFire, dice, hitOn }`.
2. `render/html.js` → `UNIT_GLYPH`, `UNIT_ICON` (icône SVG des pastilles chip de
   `forcePanelHTML` / `tipHTML`), `MOVE_LBL`, `RANGE_LBL`.
3. `src/ai.js` → `P_HIT` (probabilité de touche par dé contre ce type).
4. `src/scenario.js` → le poser sur le plateau (`add(side, type, c, r)`).
5. Tests : `test/combat.test.js` (hitOn, dés) + `test/scenario.test.js` (placement).
