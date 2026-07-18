---
name: cartes-tours
description: Use when travailler sur les cartes de commandement, les cartes tactiques, la pioche, la main, les phases de jeu, les ordres ou la séquence de tour (joueur puis IA).
auto_invoke: true
---

# Cartes & séquence de tour

## Concepts → implémentation

| Concept               | Implémentation                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carte de commandement | `{ id, name, sector, n, recon? }` dans `CARDS` (`src/cards.js`) — `sector` ∈ `gauche`/`centre`/`droite`/`flancs` (gauche + droite)/`'*'` (tout le front) — expansion via `cardSectors` (`src/sectors.js`), `n` = unités activables **par secteur couvert** (`'all'` = toutes celles du secteur), `recon: true` = bonus de pioche (piocher 2, garder 1)                                                                                                     |
| Carte tactique        | `tactic: true` (à ordres, quota **global**) ou `action` (résolution dédiée) dans `CARDS` — champs et règles transverses dans `src/tactics.js` (éligibilité, repli, mouvement, bonus de dés) ; `desc` = bandeau affiché ; voir « Cartes tactiques » ci-dessous                                                                                                                                                                                              |
| Pioche                | `buildDeck()` : 49 cartes (copies dans `COPIES` — par secteur : `rec-*` ×2, `snd-*` ×3, `atk-*` ×3, `ast-*` ×1 ; `avance` ×1, `tenaille` ×2, `recon-force` ×2 ; tactiques : `hq`/`move-out`/`armor-assault`/`infantry-assault`/`contre` ×2, `close-assault`/`firefight`/`bombard`/`dig-in`/`barrage`/`air`/`medics` ×1)                                                                                                                                    |
| Répartition initiale  | `createGame` : `decks.allies` = 10 premières cartes mélangées, `decks.axis` = les 39 restantes — **asymétrie héritée du proto, question ouverte**                                                                                                                                                                                                                                                                                                          |
| Main                  | `HAND_SIZE` = 5 ; `drawCards(state, side)` complète la main et **rebâtit/remélange** la pioche épuisée (via `state.rng`) ; émet `cardsDrawn`                                                                                                                                                                                                                                                                                                               |
| Jouer une carte       | `playCard(state, side, cardId, opts?)` (`src/game.js`) : retire de la main, `phase = 'orders'`, quotas (`sectorQuota` par secteur, ou global pour une tactique ; 1 pour une carte `action`), pose `reconDraw`/`lastCard`/`lastSector`/`pickedSector`, reset `acted`, `moved` et `healedUnit`, émet `cardPlayed`, renvoie la carte **effective** (≠ jouée pour Contre-attaque) — `opts.sector` : secteur choisi d'une carte `sector: 'pick'`                |
| Quota par secteur     | `sectorQuota(state, side, cd)` : `n` unités par secteur couvert (`'all'` = effectif du secteur), plafonné par les présents ; `state.orders` = restant, décrémenté par `finishUnit` (hex à cheval ou unité sortie du secteur : le secteur couvert le mieux pourvu paie)                                                                                                                                                                                     |
| Quota global          | cartes tactiques : `state.orders = {}` et `ordersLeft = min(n, éligibles)` (`'all'` = toutes les éligibles ; repli : 1) — `finishUnit` ne décrémente que `ordersLeft`                                                                                                                                                                                                                                                                                      |
| Unités activables     | potentiel de la carte : `orderableUnits(state, side, cardId)` — commandement : `inSector` ; tactique : `eligibleUnits` (`src/tactics.js` : secteur, `types`, `adjacent`, hex sans obstacle pour `digIn`) avec repli `fallback` (aucune éligible → toutes, quota 1) ; **pendant** la phase d'ordres : `activableUnits(state, side)` filtre `acted` + quota (secteur ou `ordersLeft`) ; médecins : `medicTargets`, puis l'unité soignée (`state.healedUnit`) |
| Fin d'activation      | `finishUnit(state, unit)` : `acted = true`, `ordersLeft--`, quota du secteur de l'unité décrémenté (cartes de commandement)                                                                                                                                                                                                                                                                                                                                |
| Bonus Reconnaissance  | carte `recon: true` → en fin de tour, `beginReconChoice` pioche 2 cartes (`state.reconChoice`, émet `reconChoice`) au lieu de la pioche normale ; `keepReconCard(state, keptId)` met la gardée en main (l'autre est défaussée) — choix du joueur : picker `hand.showReconChoice` ; choix de l'IA : `aiReconKeep`                                                                                                                                           |
| Fin de tour joueur    | `endPlayerTurn(state)` : reset `acted`, pioche du joueur (ou `beginReconChoice`), `turn = state.aiSide`, `phase = 'card'`                                                                                                                                                                                                                                                                                                                                  |
| Fin de tour IA        | `endAiTurn(state)` : pioche de l'IA (ou `beginReconChoice`, résolu par `app.js` + `aiReconKeep`), retour au joueur (sauf `winner`)                                                                                                                                                                                                                                                                                                                         |
| Camp du joueur        | `state.playerSide` / `state.aiSide` (`createGame({ playerSide })`, `?side=` depuis l'accueil) — les Alliés ouvrent toujours : si le joueur tient l'Axe, `startGame` lance `playAiTurn` d'abord                                                                                                                                                                                                                                                             |
| Phases                | `'card'` (jouer une carte) → `'orders'` (activer) — `state.phase`                                                                                                                                                                                                                                                                                                                                                                                          |

## Cartes tactiques

Basées sur les cartes Tactique de Mémoire 44. Restent à implémenter (gros
changements de gameplay, hors pioche pour l'instant) : Ambush, Their Finest
Hour, Behind Enemy Lines — règles complètes et blocages moteur dans
`docs/cartes-differees.md`.

### À ordres (`tactic: true` — champs lus par `src/tactics.js`)

| Carte (id)                               | Règle                                                                                                                                    | Champs                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Directive du QG (`hq`)                   | 4 unités au choix sur tout le plateau                                                                                                    | `n: 4`                                                                              |
| En avant ! (`move-out`)                  | 4 infanteries                                                                                                                            | `n: 4, types: ['inf'], fallback`                                                    |
| Assaut blindé (`armor-assault`)          | 4 blindés (Tigres compris), +1 dé au contact                                                                                             | `n: 4, types: ['arm','tig'], fallback, bonus: 'close'`                              |
| Assaut d'infanterie (`infantry-assault`) | toute l'infanterie d'un secteur **choisi** (picker joueur `hand.showSectorChoice`, IA `aiPickSector`) ; bouge 2 et tire, ou 3 sans tirer | `sector: 'pick', n: 'all', types: ['inf'], fallback, move: { fight: 2, noFire: 3 }` |
| Assaut rapproché (`close-assault`)       | toutes les inf/blindés (Tigres compris) au contact d'un ennemi, +1 dé, sans bouger (prise de terrain et percée conservées)               | `n: 'all', types: ['inf','arm','tig'], adjacent: true, noMove, bonus: 'all'`        |
| Fusillade (`firefight`)                  | 4 unités hors contact, +1 dé, sans bouger                                                                                                | `n: 4, adjacent: false, noMove, bonus: 'all'`                                       |
| Bombardement (`bombard`)                 | toute l'artillerie : bouge jusqu'à 3 hexes ou tire deux fois (`canAttackAgain`, réutilise l'UI de percée)                                | `n: 'all', types: ['art'], fallback, move: { noFire: 3 }, attacks: 2`               |
| Retranchement (`dig-in`)                 | 4 infanteries (hex sans obstacle) posent des sacs de sable — toute leur activation (`digIn` → `obstaclePlaced`)                          | `n: 4, types: ['inf'], fallback, digIn`                                             |

**Repli** (`fallback: true`) : aucune unité éligible → 1 unité au choix en
activation standard, sans les effets spéciaux de la carte (`cardFallback`,
`activeTactic` renvoie null).

### À résolution dédiée (`action` — résolution dans `src/game.js`)

| Carte              | Règle                                                                                                                                                                                                                                                                                                                           | Résolution                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Barrage            | 4 dés sur 1 unité ennemie au choix (`barrageTargets`), **sans** réduction de terrain ni ligne de mire, **drapeaux non couverts** (`noFlagCover`)                                                                                                                                                                                | `resolveBarrage` → `actionStruck`      |
| Attaque aérienne   | jusqu'à 4 unités ennemies adjacentes entre elles (`validAirTarget` : hex occupé par l'ennemi, collé au groupe) ; 2 dés par unité (Alliés) / 1 (Axe), sans réduction, l'étoile touche (`starHits`), drapeaux non couverts                                                                                                        | `resolveAirStrike` → `actionStruck` ×N |
| Médecins & mécanos | ordonne 1 unité amie éprouvée (`medicTargets`) : 1 dé par carte en main (celle jouée comprise), symbole de l'unité ou étoile = 1 figurine ; si ≥ 1 récupérée, l'unité peut encore recevoir l'ordre (`state.healedUnit`)                                                                                                         | `resolveMedics` → `unitHealed`         |
| Contre-attaque     | rejoue la dernière carte adverse (`state.lastCard`) en **miroir gauche/droite** (`mirrorId`, `src/cards.js`) ; un Assaut d'infanterie se rejoue dans le **même** secteur (`state.lastSector`) ; bonus de pioche inclus ; si absente ou elle-même une Contre-attaque → vaut Reconnaissance en force — résolu **dans** `playCard` | `playCard` renvoie la carte effective  |

Le ciblage joueur vit dans `render/app.js` (`actionClick`) via `ui.action`
(`{ kind, targets | picks }`, `render/uiState.js`) — kinds : `barrage`, `air`
(+ bouton « Déclencher la frappe » avant 4 unités), `medics`, `digin`. Barrage
et attaque aérienne consomment le tour entier (`afterAction` → `endTurn`) ;
médecins enchaîne sur l'ordre de l'unité soignée si le soin a réussi ;
retranchement enchaîne les poses jusqu'à épuisement des ordres.

## Séquence d'un tour du joueur (côté rendu)

1. Phase `card` : clic carte → `hand.js` `playFromHand` (animation 460 ms, cartes
   désactivées) → `app.js` `playPlayerCard` — carte `sector: 'pick'` : picker
   `hand.showSectorChoice` d'abord — → `beginCard` → `playCard` + `ui.orderable =
activableUnits(...)` (carte à ciblage : `ui.action` + `actionClick` ; aucune
   unité éligible : carte perdue, fin de tour).
2. Phase `orders` : `input.js` (clic ou glisser-déposer) → `selectUnit` (aides via
   `reachable(moveRange)`/`targetsFor`) → `moveTo` / `attackTarget` → `finish` — qui
   recalcule `ui.orderable` (le quota vient d'être consommé). Désélectionner une
   unité qui a déjà bougé la `finish` aussi (`commitMovedSelection`, `app.js`) :
   l'ordre est consommé même sans tir, et `moveUnit` refuse de toute façon un
   second déplacement dans la même activation. Après un tir de Bombardement,
   le second tir réutilise `ui.breakthrough`.
3. `ordersLeft` à 0, plus d'unité activable, ou bouton « Fin de tour » → `endTurn` →
   `endPlayerTurn` → `setTimeout(playAiTurn, 700)` — sauf bonus Reconnaissance : le
   picker (`reconChoice` dans `wireBus`) relance l'IA après le choix.

## Ajouter une carte de commandement

1. `src/cards.js` → entrée dans `CARDS` (`id`, `name` en français, `sector`, `n` par
   secteur ou `'all'`, éventuel `recon: true`) + nombre de copies dans `COPIES`.
2. `test/cards.test.js` → ajuster le total (actuellement 49) et la répartition.
3. Carte standard (secteur + n) : `cardHTML` (`render/html.js`) et `playCard` sont
   génériques — ajouter seulement son test fonctionnel dans `test/commands.test.js`
   (un test par carte de commandement).
4. Carte tactique à ordres : `tactic: true` + `desc` + champs déclaratifs (`types`,
   `adjacent`, `noMove`, `bonus`, `move`, `attacks`, `fallback`, `digIn`) — les règles
   transverses de `src/tactics.js` les appliquent ; tests dans `test/tactics.test.js`.
   Un nouveau champ = une règle dans `src/tactics.js` (+ `src/combat.js` ou
   `src/game.js` si besoin) + doc de la table ci-dessus.
5. Carte à résolution dédiée : `action` + `desc`, la règle dans `src/game.js`
   (résolution dédiée + événement bus + tableau des événements du skill
   `architecture`), le ciblage dans `app.js` `actionClick`, les tests dans
   `test/actions.test.js` — suivre le modèle des quatre cartes existantes.
6. L'IA : carte de commandement jouée telle quelle via `aiPickCard` ; tactique à
   ordres : `cardScore` générique (éligibles + cibles), secteur au choix via
   `aiPickSector` ; carte à résolution dédiée → brancher `cardScore` et une
   heuristique de cible dans `src/ai.js` + son exécution dans `playAiAction`
   (`render/app.js`).

## Pièges connus

- `ui.justDrew` (animation de pioche) est posé par l'abonnement `cardsDrawn` dans
  `wireBus` et consommé par `hand.render` — ne pas le manipuler ailleurs.
- `endTurn` (`app.js`) réinitialise l'état d'interaction **avant** `endPlayerTurn`,
  sinon `justDrew` serait écrasé.
- Le bouton « Nouvelle partie » recrée tout (`startGame`), y compris le bus : voir
  « Cycle de vie » dans le skill `architecture`.
- Les effets d'une carte tactique ne s'appliquent qu'aux unités du camp dont c'est
  le tour (`activeTactic` vérifie `state.turn`) — un `diceFor` spéculatif sur une
  unité adverse n'hérite pas du bonus.
