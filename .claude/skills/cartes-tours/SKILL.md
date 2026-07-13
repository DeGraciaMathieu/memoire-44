---
name: cartes-tours
description: Use when travailler sur les cartes de commandement, la pioche, la main, les phases de jeu, les ordres ou la séquence de tour (alliés puis Axe).
auto_invoke: true
---

# Cartes & séquence de tour

## Concepts → implémentation

| Concept              | Implémentation                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carte                | `{ id, name, sector, n }` dans `CARDS` (`src/cards.js`) — `sector` ∈ `gauche`/`centre`/`droite`/`'*'` (tout le front), `n` = unités activables                          |
| Pioche               | `buildDeck()` : 24 cartes (copies dans `COPIES`, ex. `recon` ×4, `assaut` ×2)                                                                                           |
| Répartition initiale | `createGame` : `decks.allies` = 10 premières cartes mélangées, `decks.axis` = les 14 restantes — **asymétrie héritée du proto, question ouverte**                       |
| Main                 | `HAND_SIZE` = 5 ; `drawCards(state, side)` complète la main et **rebâtit/remélange** la pioche épuisée (via `state.rng`) ; émet `cardsDrawn`                            |
| Jouer une carte      | `playCard(state, side, cardId)` (`src/game.js`) : retire de la main, `phase = 'orders'`, `ordersLeft = min(n, activables)`, reset `acted` et `moved`, émet `cardPlayed` |
| Unités activables    | `orderableUnits(state, side, cardId)` — `inSector` (`src/sectors.js`) ; un hex à cheval est activable par les cartes des DEUX secteurs                                  |
| Fin d'activation     | `finishUnit(state, unit)` : `acted = true`, `ordersLeft--`                                                                                                              |
| Fin de tour allié    | `endPlayerTurn(state)` : reset `acted`, pioche alliée, `turn = 'axis'`, `phase = 'card'`                                                                                |
| Fin de tour Axe      | `endAxisTurn(state)` : pioche Axe, retour aux alliés (sauf `winner`)                                                                                                    |
| Phases               | `'card'` (jouer une carte) → `'orders'` (activer) — `state.phase`                                                                                                       |

## Séquence d'un tour allié (côté rendu)

1. Phase `card` : clic carte → `hand.js` `playFromHand` (animation 460 ms, cartes
   désactivées) → `app.js` `playAlliedCard` → `playCard` + `ui.orderable`.
2. Phase `orders` : `input.js` (clic ou glisser-déposer) → `selectUnit` (aides via
   `reachable`/`targetsFor`) → `moveTo` / `attackTarget` → `finish`.
3. `ordersLeft` à 0 (ou bouton « Fin de tour ») → `endTurn` → `endPlayerTurn` →
   `setTimeout(playAxisTurn, 700)`.

## Ajouter une carte de commandement

1. `src/cards.js` → entrée dans `CARDS` (`id`, `name` en français, `sector`, `n`) +
   nombre de copies dans `COPIES`.
2. `test/cards.test.js` → ajuster le total (actuellement 24) et la répartition.
3. Carte standard (secteur + n) : **rien d'autre** — `cardHTML` (`render/html.js`) et
   `playCard` sont génériques.
4. Carte à effet spécial (au-delà de secteur + n) : la règle va dans `src/game.js`
   `playCard` (+ événement bus si effet visuel + tableau des événements du skill
   `architecture`), l'affichage éventuel dans `cardHTML`.
5. L'IA la jouera telle quelle via `aiPickCard` (score = activables + cibles) ; vérifier
   que l'heuristique reste pertinente pour un effet spécial (`src/ai.js`).

## Pièges connus

- `ui.justDrew` (animation de pioche) est posé par l'abonnement `cardsDrawn` dans
  `wireBus` et consommé par `hand.render` — ne pas le manipuler ailleurs.
- `endTurn` (`app.js`) réinitialise l'état d'interaction **avant** `endPlayerTurn`,
  sinon `justDrew` serait écrasé.
- Le bouton « Nouvelle partie » recrée tout (`startGame`), y compris le bus : voir
  « Cycle de vie » dans le skill `architecture`.
