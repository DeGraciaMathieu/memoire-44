---
name: ia-axe
description: Use when travailler sur l'IA de l'Axe — choix de carte, sélection des unités, plans de déplacement/tir, ou le tempo du tour automatique.
auto_invoke: true
---

# IA de l'Axe

Gloutonne, évaluation à 1 coup, aucun état propre : elle ne parle qu'aux règles de
`src/`. Décisions dans `src/ai.js`, exécution et tempo dans `render/app.js`
(`playAxisTurn`).

## Heuristiques → implémentation

| Décision              | Fonction               | Heuristique                                                                                                                                                                                      |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Probabilité de touche | `P_HIT` (const)        | par dé, selon la CIBLE : inf 3/6, arm 2/6, art 3/6                                                                                                                                               |
| Choix de carte        | `aiPickCard`           | score = `n × 2` (+3 par unité, parmi les `n` premières, ayant déjà une cible via `targetsFor`)                                                                                                   |
| Choix des unités      | `aiChooseMoves`        | tri : peut frapper (+10) − distance à l'ennemi le plus proche ; garde les `cd.n` meilleures                                                                                                      |
| Plan d'une unité      | `aiPlanUnit`           | pour chaque destination (`sur place` + `reachable(moveNoFire)`) : score tir = `espérance × 10` (+12 si létal) ; score position = `(10 − near) × 0.8` + `def × 1.5` ; artillerie −6 si `near < 3` |
| Prise de terrain      | `aiTakesGround`        | le blindé avance toujours (percée possible) ; l'infanterie seulement si la couverture de l'hex pris (`defenseReduction` vs inf) est ≥ à celle de son hex                                         |
| Cible de percée       | `aiBreakthroughTarget` | meilleure cible de `targetsFor` : `espérance` (+2 si létal) ; null si aucun tir possible                                                                                                         |

`aiPlanUnit` est **privée** au module ; l'API publique est `aiPickCard`, `aiChooseMoves`,
`aiTakesGround` et `aiBreakthroughTarget`.

## Exécution du tour (render/app.js `playAxisTurn`)

1. `drawCards(state, 'axis')` → `aiPickCard` → `playCard(state, 'axis', id)`.
2. Les plans sont figés **avant** exécution (`aiChooseMoves`) : une collision entre plans
   est refusée au runtime par `moveUnit`, qui revalide via `reachable` et renvoie `null`
   (l'unité passe alors son activation).
3. Garde-fous par plan : `state.winner`, unité encore vivante (`state.units.includes`),
   tir encore légal (`diceFor > 0`).
4. Après un combat rapproché gagné : boucle prise de terrain (`takeGroundHex` +
   `aiTakesGround` → `takeGround`), puis percée de blindés (`canBreakthrough` +
   `aiBreakthroughTarget` → seconde attaque, une seule fois).
5. Tempo : sleeps 450/500/350 ms, modale de combat en `auto: true` (fermeture 2100 ms).
6. `endAxisTurn(state)` → retour aux alliés.

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
