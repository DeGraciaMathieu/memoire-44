# Cartes tactiques différées

Trois cartes du set Tactique de Mémoire 44 ont été écartées du lot implémenté
en juillet 2026 (voir skill `cartes-tours`) car elles demandent des
modifications importantes du moteur. À reprendre plus tard, idéalement dans
l'ordre ci-dessous (de la moins à la plus structurante).

## Behind Enemy Lines — Derrière les lignes ennemies (×1)

**Règle** : ordre à 1 unité d'INFANTERIE. Elle peut se déplacer jusqu'à
3 hexes, combattre avec 1 dé supplémentaire, puis se déplacer à nouveau
jusqu'à 3 hexes. Les restrictions de mouvement du terrain sont ignorées
(celles de combat s'appliquent). Si aucune infanterie, ordre à 1 unité au
choix.

**Blocages moteur** :

- un seul déplacement par activation (`state.moved`, `moveUnit` refuse un
  second mouvement) — il faut une activation en phases
  mouvement → combat → second mouvement ;
- `reachable` (`src/movement.js`) ne sait pas ignorer les restrictions de
  terrain (`stops`, `enterAdjacentOnly`, `moveCap`…) — prévoir un mode
  « infiltration » ;
- côté rendu, le flux `finish(u)` clôt l'activation après le combat — il
  faudrait proposer le second déplacement avant de finir ; côté IA,
  `aiPlanUnit` évalue « destination + tir », pas « destination + tir +
  repli ».

**Acquis réutilisables** : filtre `types: ['inf']` + `fallback`, bonus
`bonus: 'all'` (`src/tactics.js`).

## Their Finest Hour — Leur heure de gloire (×1)

**Règle** : lancez 1 dé de combat par carte de commandement en main, y
compris celle-ci. Chaque symbole d'unité obtenu ordonne 1 unité de ce type ;
chaque étoile, 1 unité au choix. Les unités ordonnées combattent avec 1 dé
supplémentaire. Remélangez la pioche et la défausse.

**Blocages moteur** :

- les ordres sont déterminés par un jet de dés APRÈS avoir joué la carte —
  `playCard` calcule aujourd'hui `ordersLeft`/`orders` immédiatement ; il
  faut un quota par TYPE d'unité (`{ inf: n, arm: n, art: n, joker: n }`)
  alimenté par le tirage ;
- il n'existe pas de défausse suivie : les cartes jouées disparaissent et
  `drawCards` rebâtit simplement une pioche neuve quand elle est vide — le
  « remélange pioche + défausse » demande de tracer la défausse (ou
  d'assumer la simplification) ;
- l'IA doit scorer une carte à l'espérance (nombre de cartes en main ×
  probabilité par face) et répartir des ordres typés.

**Acquis réutilisables** : dés = cartes en main (déjà fait pour Médecins &
mécanos), bonus `bonus: 'all'`.

## Ambush — Embuscade (×1)

**Règle** : après que l'adversaire a déclaré un Close Assault, mais avant
qu'il ne lance ses dés, jouez cette carte. Lancez vos dés de combat en
premier. Si l'unité adverse n'est ni éliminée ni forcée de battre en
retraite, elle peut attaquer normalement. En fin de tour, piochez votre
carte de commandement en premier.

**Blocages moteur** :

- première carte RÉACTIVE : elle se joue pendant le tour adverse — le moteur
  est strictement tour par tour (`state.turn`, `phase` `card`/`orders`) et
  aucun point du flux ne rend la main au défenseur ;
- il faut une fenêtre d'interruption dans `attackUnit` (ou juste avant) :
  pause de la résolution, prompt joueur si c'est l'IA qui attaque, décision
  IA (`cardScore` réactif) si c'est le joueur qui attaque — avec le tempo
  asynchrone de `render/app.js` à revoir (la modale de combat suppose un
  outcome déjà résolu) ;
- « piochez en premier » en fin de tour : l'ordre de pioche est aujourd'hui
  sans importance — impact réel seulement quand la pioche s'épuise.
