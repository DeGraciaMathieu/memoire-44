---
name: cartes-tours
description: Use when travailler sur les cartes de commandement, la pioche, la main, les phases de jeu, les ordres ou la séquence de tour (alliés puis Axe).
auto_invoke: true
---

# Cartes & séquence de tour

## Concepts → implémentation

| Concept               | Implémentation                                                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carte de commandement | `{ id, name, sector, n }` dans `CARDS` (`src/cards.js`) — `sector` ∈ `gauche`/`centre`/`droite`/`flancs` (gauche + droite)/`'*'` (tout le front) — expansion via `cardSectors` (`src/sectors.js`), `n` = unités activables                                                                   |
| Carte action          | `{ id, name, action, desc, … }` dans `CARDS` — pas de secteur ; `desc` = bandeau affiché ; paramètres portés par la carte (`dice`, `hexes`) ; résolution dans `src/game.js` (voir « Cartes actions »)                                                                                        |
| Pioche                | `buildDeck()` : 34 cartes (copies dans `COPIES`, ex. `recon` ×4, `assaut` ×2, `tenaille` ×2, cartes actions ×2 chacune)                                                                                                                                                                      |
| Répartition initiale  | `createGame` : `decks.allies` = 10 premières cartes mélangées, `decks.axis` = les 24 restantes — **asymétrie héritée du proto, question ouverte**                                                                                                                                            |
| Main                  | `HAND_SIZE` = 5 ; `drawCards(state, side)` complète la main et **rebâtit/remélange** la pioche épuisée (via `state.rng`) ; émet `cardsDrawn`                                                                                                                                                 |
| Jouer une carte       | `playCard(state, side, cardId)` (`src/game.js`) : retire de la main, `phase = 'orders'`, `ordersLeft = min(n, activables)` (1 pour une carte action), reset `acted` et `moved`, pose `state.lastCard[side]`, émet `cardPlayed`, renvoie la carte **effective** (≠ jouée pour Contre-attaque) |
| Unités activables     | `orderableUnits(state, side, cardId)` — `inSector` (`src/sectors.js`) ; un hex à cheval est activable par les cartes des DEUX secteurs ; cartes actions : `medicTargets` pour Médecins & mécanos, sinon `[]`                                                                                 |
| Fin d'activation      | `finishUnit(state, unit)` : `acted = true`, `ordersLeft--`                                                                                                                                                                                                                                   |
| Fin de tour allié     | `endPlayerTurn(state)` : reset `acted`, pioche alliée, `turn = 'axis'`, `phase = 'card'`                                                                                                                                                                                                     |
| Fin de tour Axe       | `endAxisTurn(state)` : pioche Axe, retour aux alliés (sauf `winner`)                                                                                                                                                                                                                         |
| Phases                | `'card'` (jouer une carte) → `'orders'` (activer) — `state.phase`                                                                                                                                                                                                                            |

## Cartes actions (`src/game.js`)

| Carte              | Règle                                                                                                                                                   | Résolution                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Barrage            | 4 dés sur 1 unité ennemie au choix (`barrageTargets`), **sans** réduction de terrain ni ligne de mire ; drapeaux et médaille normaux                    | `resolveBarrage` → `actionStruck`      |
| Attaque aérienne   | 4 hexs contigus (`validAirTarget` : premier libre, les suivants adjacents à la chaîne) ; 2 dés par unité ennemie (Alliés) / 1 (Axe), sans réduction     | `resolveAirStrike` → `actionStruck` ×N |
| Médecins & mécanos | ordonne 1 unité amie éprouvée (`medicTargets`) : 4 dés, chaque face au symbole de l'unité (étoile pour l'artillerie) rend une figurine ; `acted = true` | `resolveMedics` → `unitHealed`         |
| Contre-attaque     | rejoue la dernière carte adverse (`state.lastCard`) ; si absente ou elle-même une Contre-attaque → vaut Reconnaissance — résolu **dans** `playCard`     | `playCard` renvoie la carte effective  |

Le ciblage joueur vit dans `render/app.js` (`actionClick`) via `ui.action`
(`{ kind, targets | picks }`, `render/uiState.js`) ; une carte action consomme le tour
entier (`afterAction` → `endTurn`).

## Séquence d'un tour allié (côté rendu)

1. Phase `card` : clic carte → `hand.js` `playFromHand` (animation 460 ms, cartes
   désactivées) → `app.js` `playAlliedCard` → `playCard` + `ui.orderable`
   (carte action : `ui.action` + ciblage par `actionClick`).
2. Phase `orders` : `input.js` (clic ou glisser-déposer) → `selectUnit` (aides via
   `reachable`/`targetsFor`) → `moveTo` / `attackTarget` → `finish`.
3. `ordersLeft` à 0 (ou bouton « Fin de tour ») → `endTurn` → `endPlayerTurn` →
   `setTimeout(playAxisTurn, 700)`.

## Ajouter une carte de commandement

1. `src/cards.js` → entrée dans `CARDS` (`id`, `name` en français, `sector`, `n`) +
   nombre de copies dans `COPIES`.
2. `test/cards.test.js` → ajuster le total (actuellement 34) et la répartition.
3. Carte standard (secteur + n) : **rien d'autre** — `cardHTML` (`render/html.js`) et
   `playCard` sont génériques.
4. Carte à effet spécial (au-delà de secteur + n) : `action` + `desc` sur la carte, la
   règle dans `src/game.js` (résolution dédiée + événement bus + tableau des événements
   du skill `architecture`), le ciblage dans `app.js` `actionClick`, les tests dans
   `test/actions.test.js` — suivre le modèle des quatre cartes actions existantes.
5. L'IA : carte de commandement jouée telle quelle via `aiPickCard` (score = activables
   - cibles) ; carte action → brancher `cardScore` et une heuristique de cible dans
     `src/ai.js` + son exécution dans `playAxisAction` (`render/app.js`).

## Pièges connus

- `ui.justDrew` (animation de pioche) est posé par l'abonnement `cardsDrawn` dans
  `wireBus` et consommé par `hand.render` — ne pas le manipuler ailleurs.
- `endTurn` (`app.js`) réinitialise l'état d'interaction **avant** `endPlayerTurn`,
  sinon `justDrew` serait écrasé.
- Le bouton « Nouvelle partie » recrée tout (`startGame`), y compris le bus : voir
  « Cycle de vie » dans le skill `architecture`.
