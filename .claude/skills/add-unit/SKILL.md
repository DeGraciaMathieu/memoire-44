---
name: add-unit
description: Use when l'utilisateur veut ajouter un nouveau type d'unité à partir de sa fiche (nom, figurines, déplacement, combat, règles spéciales) — étude de faisabilité, implémentation, visuel, IA et cas limites.
user_invocable: true
---

# Workflow : ajouter un type d'unité

L'argument est la **fiche de l'unité** en texte libre, par exemple :

```
TIGRES
1 figurine
• Se déplace de 0 à 3 et combat
Lorsque le Tigre est touché, l'adversaire relance les dés qui ont touché
S'il obtient une grenade, le Tigre est éliminé
```

Suivre les étapes dans l'ordre. **Ne pas coder avant la fin de l'étape 2** : le
verdict de faisabilité vient d'abord.

## 1. Lire la fiche et la normaliser

Extraire (et compléter via `AskUserQuestion` si la fiche est muette) :

| Champ                | Cible dans `UNITS` (`src/config.js`)                                  |
| -------------------- | ---------------------------------------------------------------------- |
| Nom français         | `label` (l'id reste un code anglais court, style `inf`/`arm`/`tig`)   |
| Figurines            | `figs`                                                                 |
| Déplacement          | `move` (bouge et combat) / `moveNoFire` (bouge sans combattre)        |
| Dés par portée       | `dice: [d1, d2, …]` — l'index est la portée, sa longueur la portée max |
| Qui la touche ?      | `hitOn` : faces parmi `FACES` (`inf`, `arm`, `grenade`, `star`)       |
| Règles spéciales     | voir l'étape 2 — chacune se classe a/b/c/d                             |

Questions à poser systématiquement si absentes de la fiche : dés à chaque
portée, faces qui la touchent, droit à la prise de terrain / percée, nombre
d'exemplaires dans le scénario. **Ne jamais inventer une valeur de dé.**

## 2. Verdict de faisabilité

Invoquer `architecture`, `combat`, `plateau-mouvement`, `ia-axe`. Classer
chaque ligne de la fiche :

- **(a) Champ existant** de `UNITS` → gratuit (`figs`, `move`, `dice`, `hitOn`).
- **(b) Mécanisme existant à brancher** → un test décide du comportement
  (bunker `infantryOnly`, prise de terrain, percée, `moveCap` de la plage…).
- **(c) Nouvelle règle** → code dans `src/` (souvent `resolveCombat` via `opts`,
  ou `src/game.js`) + événement bus si effet visible + tests. Ex. Tigre :
  « l'adversaire relance les dés qui ont touché » = nouvelle branche de
  `resolveCombat`, déterministe via `state.rng`.
- **(d) Infaisable sans refonte** (ex. nouvelle face de dé physique) → proposer
  une simplification assumée et la documenter, modèle `docs/cartes-differees.md`.

Rendre le verdict à l'utilisateur : plan par couche, simplifications
proposées, questions ouvertes. Attendre son accord si un point (c) ou (d)
change la règle demandée.

## 3. Auditer la surface d'intégration

Un type d'unité n'est **pas** qu'une entrée dans `UNITS` : le moteur
particularise `'inf'` / `'arm'` / `'art'` en dur. Audit obligatoire :

```
grep -rn "'inf'\|'arm'\|'art'" src/ render/
```

Chaque occurrence est une décision « la nouvelle unité se comporte comme
qui ? ». Points connus :

| Fichier           | Décision à prendre                                                                 |
| ----------------- | ----------------------------------------------------------------------------------- |
| `src/combat.js`   | `defenseReduction` (`defArmor`/`defArt` : quelle réduction de terrain la vise ?), barbelés (`attackerSnare`), repli (`fixesArtillery`, `infantryOnly`)     |
| `src/game.js`     | `takeGroundHex` (l'artillerie est exclue), `canBreakthrough` (blindés seuls), `resolveMedics` (quelle face la soigne — symbole ou étoile)                   |
| `src/movement.js` | `reachable` : `moveCap` (plage), `fixesArtillery` (bunker), `crushedByArmor` (barbelés écrasés ?)                                                           |
| `src/map.js`      | `unitAllowedOn` : peut-elle être posée sur bunker/antichar dans l'éditeur ?                                                                                 |
| `src/tactics.js`  | cartes à `types` (En avant !, Assaut blindé, Bombardement, Retranchement, Assaut rapproché) : la nouvelle unité est-elle éligible à chacune ?               |
| `src/ai.js`       | `aiPlanUnit` (l'artillerie reste en retrait, tri infanterie d'abord), `aiTakesGround`                                                                       |
| `src/generator.js`| entre-t-elle dans les rosters des cartes aléatoires (rencontre / assaut) ? à quelle fréquence ?                                                             |
| `src/scenario.js` | figure-t-elle dans le scénario par défaut ?                                                                                                                 |

## 4. Aspect visuel

Tout dans `render/`, aucun choix de règle ici :

- `render/html.js` : `UNIT_GLYPH` (glyphe canvas), `UNIT_ICON` (SVG),
  `RANGE_LBL` et `MOVE_LBL` (libellés français de l'infobulle) — **obligatoires**,
  toute l'UI les lit.
- `render/stage.js` `drawCounter` : vérifier le rendu du pion (glyphe lisible,
  compteur de figurines — 1 figurine doit rester lisible).
- Gratuit si les points ci-dessus sont faits : boutons de l'éditeur (générés
  depuis `UNITS`), infobulle `tipHTML`, panneau `forcePanelHTML` (pips = figs),
  modale de combat, `calcHTML`, aperçus de l'accueil.
- Contrôle final : lancer `npm run dev`, poser l'unité dans l'éditeur, survoler
  le pion en jeu, ouvrir un engagement.

## 5. IA

- L'IA doit **ordonner et jouer** la nouvelle unité sans plan illégal :
  vérifier `aiChooseMoves`/`aiPlanUnit` (faut-il un cas dédié ? ex. rester en
  retrait comme l'artillerie, ou chercher le contact comme les blindés).
- Cartes tactiques : `cardScore` est générique mais repose sur l'éligibilité —
  revalider après l'étape 3.
- Test macro dans `test/ai.test.js` : un état avec la nouvelle unité, l'IA
  produit un plan légal qui l'utilise (quota consommé, destination atteignable).

## 6. Implémenter et verrouiller les cas limites

Règle d'or de `CLAUDE.md` : la règle dans `src/` (+ bus), l'affichage dans
`render/`, tout aléa via `state.rng`. Tests MACRO (skill `testing`) — la
checklist des cas limites à couvrir explicitement :

- [ ] dernière figurine : destruction, médaille, **anéantissement** (victoire immédiate si c'était la dernière unité du camp) ;
- [ ] repli : dos au mur (perte), mer (`noRetreatInto`), obstacle réservé ;
- [ ] médecins & mécanos : la face qui la soigne (une unité sans face propre se soigne à l'étoile, comme l'artillerie) ;
- [ ] barbelés : empêtrée ? les écrase ? peut les couper ?
- [ ] bunker/antichar : entrée autorisée ? éditeur et repli cohérents (`unitAllowedOn`) ;
- [ ] mer/plage : comportement sur une carte Débarquement générée ;
- [ ] prise de terrain et percée : accordées ou refusées, et testées dans les deux sens ;
- [ ] chaque carte tactique à `types` : éligible ou pas, repli `fallback` si plus aucune éligible ;
- [ ] éditeur : pose acceptée/refusée + aller-retour `serializeMap`/`parseMap` (`test/map.test.js`) ;
- [ ] générateur : si elle entre dans les rosters, la boucle de validité de `test/generator.test.js` reste verte ;
- [ ] règle spéciale (c) : un test par formulation de la fiche, RNG forcé (`ALL_HITS`-style) pour chaque branche.

`npm test` et `npm run lint` jusqu'au vert — 2 échecs sur la même piste =
retour au plan.

## 7. Doc vivante et résumé

Dans le même lot : `CLAUDE.md` (ligne « Types d'unités »), skill `combat`
(dés/portées), `plateau-mouvement` (déplacement), `ia-axe` (heuristique
ajoutée), `architecture`/`testing` si état, événement ou fichier de test
nouveaux. Terminer par le résumé : verdict initial vs réalisé,
simplifications assumées, fichiers, tests, questions ouvertes.
