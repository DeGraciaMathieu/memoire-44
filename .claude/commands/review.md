---
description: Revue complète du diff courant — conventions, tests, maintenabilité, cohérence système
---

Effectue une revue complète des changements en cours.

## Périmètre

1. Lis `CLAUDE.md` (conventions et comportement attendus).
2. Récupère le périmètre : `git diff`, `git diff --cached`, `git status`,
   `git log --oneline -5`.
3. **S'il n'y a aucun changement (diff et index vides), arrête-toi** : réponds
   « Rien à revoir » et n'invente pas de travail.

## Vérifications (point par point)

### A. Conventions (CLAUDE.md + skill `architecture`)

- Séparation des couches : pas de DOM/canvas dans `src/`, pas de règle métier dans
  `render/` (la légalité vient de `reachable`/`targetsFor`/`diceFor`…).
- Pas de `Math.random` en dur : tout aléa via `state.rng`.
- Pas d'état global de module dans `src/` : tout dans `state` (`createGame`).
- Bus : tout nouvel événement est émis depuis `src/`, câblé dans `wireBus`
  (`render/app.js`) et documenté dans le tableau du skill `architecture`.
- HTML en chaînes dans `render/html.js`, calculs graphiques purs dans `render/gfx.js`.
- Identifiants anglais / UI et commentaires français.

### B. Couverture de tests (skill `testing`)

- Chaque changement de comportement dans `src/` a un test macro dans le fichier
  `test/<module>.test.js` correspondant.
- Les tests sont déterministes (RNG injecté `mulberry32`, faces explicites pour
  `resolveCombat`).
- Les totaux impactés sont ajustés (ex. 24 cartes dans `test/cards.test.js`).

### C. Maintenabilité

- Couplage : le changement respecte le sens des imports (`render/` → `src/`, jamais l'inverse).
- Responsabilité unique : chaque fonction fait une chose ; le tempo reste dans
  `app.js`/`hand.js`/`combatModal.js`, les décisions dans `src/`.
- Duplication : signaler toute nouvelle duplication de règle (le miroir connu
  `canFire` ↔ `targetsFor` doit rester synchronisé, pas s'étendre).
- Complexité / longueur de fonction, nommage flou, magic values (les constantes du
  domaine vont dans `src/config.js`, celles du rendu dans `render/gfx.js` `LAYOUT`).

### D. Cohérence système

- Intégration : le changement s'appuie sur l'existant (`hexDistance`, `unitAt`,
  `cardById`…) au lieu de le réinventer.
- Forme de l'état : nouvelles données au bon endroit (`state` = jeu, `uiState` = visuel).
- Patterns respectés : factories `create*`, closures `getState()/getUi()`,
  recâblage du bus dans `wireBus` à chaque partie.
- Doc vivante synchronisée : tables des skills, `MOVE_LBL`/`RANGE_LBL`, `#mGoal`,
  message de démarrage.

## Sortie

1. Lance `npm test` et `npm run lint`.
2. Rapport structuré : pour chaque item ci-dessus, statut **OK / VIOLATION / N/A**
   avec fichier:ligne et justification courte pour chaque VIOLATION.
3. Verdict global : **APPROUVÉ** ou **À CORRIGER** (avec la liste ordonnée des
   corrections attendues).
