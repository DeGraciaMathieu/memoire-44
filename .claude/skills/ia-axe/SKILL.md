---
name: ia-axe
description: Use when travailler sur l'IA adverse — choix de carte, sélection des unités, plans de déplacement/tir, ou le tempo du tour automatique.
auto_invoke: true
---

# IA du camp adverse

Gloutonne, évaluation à 1 coup, aucun état propre : elle ne parle qu'aux règles de
`src/`. Décisions dans `src/ai.js`, exécution et tempo dans `render/app.js`
(`playAiTurn`). L'IA joue `state.aiSide` — l'Axe par défaut, les Alliés si le
joueur a choisi l'Axe sur la page d'accueil ; ses heuristiques n'ont aucune
hypothèse directionnelle (distances uniquement).

## Heuristiques → implémentation

| Décision                | Fonction               | Heuristique                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Probabilité de touche   | `P_HIT` (const)        | par dé, selon la CIBLE : inf 3/6, arm 2/6, art 3/6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Choix de carte          | `aiPickCard`           | `cardScore` (privée) : commandement = `min(activables, somme des quotas sectorQuota) × 2` (+3 par unité, dans cette limite, ayant déjà une cible via `targetsFor`) ; tactique à ordres = `quota effectif × 2` (+3 par unité à cible ; repli : 2, carte sans repli et sans éligible : 0) sur le meilleur secteur pour une carte `'pick'` ; barrage = meilleure frappe `exp × 2` (+8 si létale) ; attaque aérienne = unités couvertes × 3 ; médecins = figurines perdues × 2 (−1 si personne) ; contre-attaque = score de la carte adverse rejouée **en miroir** (`mirrorId`, sinon Reconnaissance en force) |
| Choix du secteur        | `aiPickSector`         | carte `sector: 'pick'` (Assaut d'infanterie) : le secteur le plus fourni en unités éligibles (`eligibleUnits`, `src/tactics.js`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Cible du barrage        | `aiBarrageTarget`      | meilleure espérance de touches sur 4 dés (+2 si létale)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Hexs d'attaque aérienne | `aiAirHexes`           | plus grand groupe (≤ 4) d'unités du joueur adjacentes entre elles, grossi depuis chaque unité (`validAirTarget`) — renvoie `{ hexes, units }`                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Cible des médecins      | `aiMedicsTarget`       | l'unité de l'IA la plus amochée ; à pertes égales, l'infanterie (meilleure espérance) ; `null` si personne                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Choix des unités        | `aiChooseMoves`        | tri : peut frapper (+10), objectif à prendre à portée de mouvement (+5), − distance à l'ennemi le plus proche ; commandement : les meilleures dans la limite du quota de leur secteur (`sectorQuota`, hex à cheval : le secteur le mieux pourvu paie) ; tactique : les `ordersLeft` meilleures (quota global)                                                                                                                                                                                                                                                                                              |
| Bonus Reconnaissance    | `aiReconKeep`          | entre les 2 cartes piochées (`state.reconChoice`), garde celle au meilleur `cardScore`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Plan d'une unité        | `aiPlanUnit`           | pour chaque destination (`sur place` + `reachable(moveRange)` — la carte tactique peut modifier ou interdire le mouvement) : tir éligible via `canFight` ; score tir = `espérance × 10` (+12 si létal) ; objectif : +12 sur la tuile (prise ou maintien), sinon `(10 − dObj) × 0.5` vers l'objectif à prendre le plus proche (`openObjectives` : tuiles non tenues par l'IA) ; score position = `(10 − near) × 0.8` + `def × 1.5` ; artillerie −6 si `near < 3`                                                                                                                                            |
| Prise de terrain        | `aiTakesGround`        | ne lâche jamais un objectif tenu ; avance toujours sur un objectif ; sinon le blindé avance toujours (percée possible) et l'infanterie seulement si la couverture de l'hex pris (`defenseReduction` vs inf) est ≥ à celle de son hex                                                                                                                                                                                                                                                                                                                                                                       |
| Cible de percée         | `aiBreakthroughTarget` | meilleure cible de `targetsFor` : `espérance` (+2 si létal) ; null si aucun tir possible — aussi utilisée pour le second tir du Bombardement (`canAttackAgain`)                                                                                                                                                                                                                                                                                                                                                                                                                                            |

`aiPlanUnit` et `cardScore` sont **privées** au module ; l'API publique est `aiPickCard`,
`aiPickSector`, `aiChooseMoves`, `aiTakesGround`, `aiBreakthroughTarget`, `aiBarrageTarget`,
`aiAirHexes`, `aiMedicsTarget` et `aiReconKeep`.

## Exécution du tour (render/app.js `playAiTurn`)

1. `drawCards(state, state.aiSide)` → `aiPickCard` → `playCard(state, state.aiSide, id,
opts)` — `opts.sector` via `aiPickSector` pour une carte `'pick'` ; renvoie la carte
   **effective** (Contre-attaque déjà résolue).
   Carte à résolution dédiée → `playAiAction` (cible via `aiBarrageTarget` / `aiAirHexes`
   / `aiMedicsTarget`, résolution `src/game.js` ; après un soin réussi, l'unité soignée
   joue son ordre via `aiChooseMoves` + `executePlans`) ; Retranchement hors repli →
   `playAiDigIn` (pose des sacs unité par unité) ; sinon `executePlans(aiChooseMoves)`.
2. Les plans sont figés **avant** exécution (`aiChooseMoves`) : une collision entre plans
   est refusée au runtime par `moveUnit`, qui revalide via `reachable` et renvoie `null`
   (l'unité passe alors son activation).
3. Garde-fous par plan : `state.winner`, unité encore vivante (`state.units.includes`),
   tir encore légal (`diceFor > 0`).
4. Après un combat rapproché gagné : boucle prise de terrain (`takeGroundHex` +
   `aiTakesGround` → `takeGround`), puis percée de blindés (`canBreakthrough` +
   `aiBreakthroughTarget` → seconde attaque, une seule fois) ; après tout combat,
   second tir du Bombardement (`canAttackAgain` + `aiBreakthroughTarget`).
5. Tempo et lisibilité : l'unité activée s'illumine (`ui.aiFocus`, 500 ms), les
   déplacements glissent (`stage.slideUnit`), la cible est désignée avant l'engagement
   (`ui.aiTargets` + traceur, 650 ms — hexes du barrage/attaque aérienne compris) ;
   modale de combat en `auto: true` (fermeture 2100 ms), invite HUD « … joue son tour ».
6. `endAiTurn(state)` → retour au joueur ; si l'IA avait joué une Reconnaissance,
   `app.js` résout aussitôt le choix de pioche : `keepReconCard(state, aiReconKeep(state))`.

## Modifier l'heuristique

1. `src/ai.js` uniquement — ne jamais mettre de décision IA dans `render/app.js`
   (qui ne fait que le tempo) ni de tempo dans `src/ai.js`.
2. `test/ai.test.js` : tests macro sur la forme et la préférence (ex. « toutes les
   unités à gauche → la carte gauche gagne »), pas sur les scores exacts.
3. **Synchronisation** : `aiPlanUnit` réutilise `canFight` et `moveRange` — seule la
   règle du combat rapproché obligatoire (filtre contact) y est dupliquée depuis
   `targetsFor` (`src/combat.js`) ; la répercuter si elle évolue.
4. Nouveau type d'unité → compléter `P_HIT` (voir « Ajouter un type d'unité » du skill
   `combat`).
