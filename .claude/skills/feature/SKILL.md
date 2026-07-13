---
name: feature
description: Use when l'utilisateur demande d'implémenter une feature, une règle de jeu ou une évolution de l'interface — workflow complet de la compréhension au résumé final.
user_invocable: true
---

# Workflow : implémenter une feature

Suivre les étapes dans l'ordre. Ne pas sauter l'étape 1.

## 1. Comprendre la demande

- Reformuler la demande en une phrase et la faire valider si elle est ambiguë.
- Invoquer le skill `architecture` (et le skill de domaine concerné :
  `plateau-mouvement`, `combat`, `cartes-tours` ou `ia-axe`) pour situer le changement.
- Poser les questions de clarification via `AskUserQuestion`, notamment :
  - **valeurs numériques** (dés, portées, coûts, nombre de copies, seuils) ;
  - **interactions avec l'existant** (terrain × combat, carte × secteurs, IA concernée ?) ;
  - **cas limites** (hex à cheval, dos au mur, pioche vide, dernière figurine, partie gagnée en cours de tour).
- Si la demande relève de la spécification plutôt que de l'implémentation, proposer `/prd`.

## 2. Implémenter

- Respecter `CLAUDE.md` et le tableau « Où placer du nouveau code » du skill
  `architecture` : la règle dans `src/` (+ événement bus si effet visuel), l'affichage
  dans `render/`.
- Suivre la procédure « Ajouter un X » du skill de domaine quand elle existe (terrain,
  type d'unité, carte).
- Tout aléa via `state.rng` ; tout nouvel abonnement bus dans `wireBus` (`render/app.js`).

## 3. Tester jusqu'au vert

- Écrire d'abord le test MACRO du comportement (voir skill `testing` : quel fichier,
  quel style, RNG `mulberry32`).
- `npm test` — corriger jusqu'à ce que la suite passe. Si une approche échoue après
  2 tentatives, reprendre le plan avant de continuer.
- `npm run lint` avant de conclure.

## 4. Synchroniser la doc vivante

Si le périmètre change, mettre à jour dans le même lot :

- les tables des skills touchés (`architecture` : state/événements/où placer ; skill de
  domaine : concepts, totaux — ex. les 24 cartes) ;
- `CLAUDE.md` si une convention ou le vocabulaire évolue ;
- les libellés en dur visibles du joueur : `MOVE_LBL` / `RANGE_LBL` (`render/html.js`),
  `#mGoal` (`index.html`), message de démarrage (`render/app.js`).

## 5. Résumer

Terminer par un résumé : fichiers modifiés (avec leur rôle), tests ajoutés/ajustés,
résultat de `npm test`, et toute question restée ouverte.
