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

| Décision                | Fonction               | Heuristique                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Probabilité de touche   | `P_HIT` (const)        | par dé, selon la CIBLE : inf 3/6, arm 2/6, art 3/6                                                                                                                                                                                                                                                                                                                     |
| Choix de carte          | `aiPickCard`           | `cardScore` (privée) : commandement = `n × 2` (+3 par unité, parmi les `n` premières, ayant déjà une cible via `targetsFor`) ; barrage = meilleure frappe `exp × 2` (+8 si létale) ; attaque aérienne = unités couvertes × 3 ; médecins = figurines perdues × 2 (−1 si personne) ; contre-attaque = score de la carte alliée rejouée (sinon Reconnaissance)            |
| Cible du barrage        | `aiBarrageTarget`      | meilleure espérance de touches sur 4 dés (+2 si létale)                                                                                                                                                                                                                                                                                                                |
| Hexs d'attaque aérienne | `aiAirHexes`           | chaîne de 4 hexs contigus grossie autour de chaque unité alliée (absorbe d'abord les hexs occupés) ; garde la chaîne couvrant le plus d'unités — renvoie `{ hexes, units }`                                                                                                                                                                                            |
| Cible des médecins      | `aiMedicsTarget`       | l'unité de l'IA la plus amochée ; à pertes égales, l'infanterie (meilleure espérance) ; `null` si personne                                                                                                                                                                                                                                                             |
| Choix des unités        | `aiChooseMoves`        | tri : peut frapper (+10), objectif à prendre à portée de mouvement (+5), − distance à l'ennemi le plus proche ; garde les `cd.n` meilleures                                                                                                                                                                                                                            |
| Plan d'une unité        | `aiPlanUnit`           | pour chaque destination (`sur place` + `reachable(moveNoFire)`) : score tir = `espérance × 10` (+12 si létal) ; objectif : +12 sur la tuile (prise ou maintien), sinon `(10 − dObj) × 0.5` vers l'objectif à prendre le plus proche (`openObjectives` : tuiles non tenues par l'IA) ; score position = `(10 − near) × 0.8` + `def × 1.5` ; artillerie −6 si `near < 3` |
| Prise de terrain        | `aiTakesGround`        | ne lâche jamais un objectif tenu ; avance toujours sur un objectif ; sinon le blindé avance toujours (percée possible) et l'infanterie seulement si la couverture de l'hex pris (`defenseReduction` vs inf) est ≥ à celle de son hex                                                                                                                                   |
| Cible de percée         | `aiBreakthroughTarget` | meilleure cible de `targetsFor` : `espérance` (+2 si létal) ; null si aucun tir possible                                                                                                                                                                                                                                                                               |

`aiPlanUnit` et `cardScore` sont **privées** au module ; l'API publique est `aiPickCard`,
`aiChooseMoves`, `aiTakesGround`, `aiBreakthroughTarget`, `aiBarrageTarget`, `aiAirHexes`
et `aiMedicsTarget`.

## Exécution du tour (render/app.js `playAiTurn`)

1. `drawCards(state, state.aiSide)` → `aiPickCard` → `playCard(state, state.aiSide, id)`
   — qui renvoie la carte **effective** (Contre-attaque déjà résolue).
   Carte action → `playAiAction` (cible via `aiBarrageTarget` / `aiAirHexes` /
   `aiMedicsTarget`, résolution `src/game.js`), puis fin de tour immédiate.
2. Les plans sont figés **avant** exécution (`aiChooseMoves`) : une collision entre plans
   est refusée au runtime par `moveUnit`, qui revalide via `reachable` et renvoie `null`
   (l'unité passe alors son activation).
3. Garde-fous par plan : `state.winner`, unité encore vivante (`state.units.includes`),
   tir encore légal (`diceFor > 0`).
4. Après un combat rapproché gagné : boucle prise de terrain (`takeGroundHex` +
   `aiTakesGround` → `takeGround`), puis percée de blindés (`canBreakthrough` +
   `aiBreakthroughTarget` → seconde attaque, une seule fois).
5. Tempo et lisibilité : l'unité activée s'illumine (`ui.aiFocus`, 500 ms), les
   déplacements glissent (`stage.slideUnit`), la cible est désignée avant l'engagement
   (`ui.aiTargets` + traceur, 650 ms — hexes du barrage/attaque aérienne compris) ;
   modale de combat en `auto: true` (fermeture 2100 ms), invite HUD « … joue son tour ».
6. `endAiTurn(state)` → retour au joueur.

## Modifier l'heuristique

1. `src/ai.js` uniquement — ne jamais mettre de décision IA dans `render/app.js`
   (qui ne fait que le tempo) ni de tempo dans `src/ai.js`.
2. `test/ai.test.js` : tests macro sur la forme et la préférence (ex. « toutes les
   unités à gauche → la carte gauche gagne »), pas sur les scores exacts.
3. **Synchronisation obligatoire** : `canFire` dans `aiPlanUnit` duplique les
   restrictions de tir de `targetsFor` (`src/combat.js`) — art après mouvement, inf
   au-delà de 1 hex. Toute évolution des règles de tir doit être répercutée ici.
4. Nouveau type d'unité → compléter `P_HIT` (voir « Ajouter un type d'unité » du skill
   `combat`).
