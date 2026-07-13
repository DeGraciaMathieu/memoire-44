---
description: Vérification allégée du diff — conventions du projet, cohérence tests/doc, run des tests
---

Vérifie que les changements en cours respectent les conventions du projet.

## Périmètre

1. Lis `CLAUDE.md`.
2. Récupère le périmètre : `git diff`, `git diff --cached`, `git status`,
   `git log --oneline -5`.
3. **S'il n'y a aucun changement, arrête-toi** : réponds « Rien à vérifier ».

## Vérifications (point par point)

- **Couches** : pas de DOM/canvas dans `src/` ; pas de règle métier dans `render/`.
- **Aléa** : pas de `Math.random` en dur (grep le diff) — tout via `state.rng`.
- **État** : pas d'état global de module dans `src/` ; état de jeu dans `state`,
  état d'interaction dans `render/uiState.js`.
- **Bus** : nouveaux événements émis depuis `src/`, câblés dans `wireBus` et documentés
  dans le skill `architecture`.
- **Pureté** : HTML en chaînes dans `render/html.js`, calculs graphiques dans
  `render/gfx.js` — pas dans les modules DOM.
- **Langue** : identifiants anglais, UI/commentaires/journaux en français.
- **Cohérence tests/doc** : tout changement de comportement de `src/` a son test
  macro ; les tables des skills et les libellés en dur (`MOVE_LBL`/`RANGE_LBL`,
  `#mGoal`, message de démarrage) reflètent le diff.
- **Propreté** : pas d'import/constante/CSS inutilisé introduit par le diff.

## Sortie

1. Lance `npm test`.
2. Rapport : un statut **OK / VIOLATION / N/A** par item, avec fichier:ligne pour
   chaque VIOLATION.
3. Verdict global : **CONFORME** ou **À CORRIGER**.
