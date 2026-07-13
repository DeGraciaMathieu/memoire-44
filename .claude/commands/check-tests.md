---
description: Analyse la couverture de tests du diff, propose les tests macro manquants et attend validation avant de les écrire
---

Analyse la couverture de tests des changements en cours et propose les tests manquants.

## Périmètre

1. Lis `CLAUDE.md` et le skill `testing` (philosophie macro, mapping fichier → périmètre).
2. Récupère le périmètre : `git diff`, `git diff --cached`, `git status`,
   `git log --oneline -5`.
3. **S'il n'y a aucun changement, arrête-toi** : réponds « Rien à analyser ».

## Analyse (point par point)

Pour chaque fichier de `src/` (et `render/html.js` / `render/gfx.js`) touché par le diff :

- Quel comportement a changé, et quel fichier `test/<module>.test.js` le couvre ?
- Le comportement modifié est-il exercé par un test existant (le citer), partiellement,
  ou pas du tout ?
- Les cas limites du domaine sont-ils couverts quand ils sont concernés : hex à cheval,
  terrain qui stoppe, hex occupé, repli dos au mur, dernière figurine, pioche vide,
  victoire en cours de tour ?
- Statut par fichier : **OK / VIOLATION** (comportement non couvert) **/ N/A**
  (changement sans comportement : doc, style, rendu DOM).

## Propositions

- Pour chaque manque : proposer un test MACRO — fichier cible, nom du test en français,
  état fabriqué (`createGame` + `mulberry32`, ou `battleState`/`flatState`), action,
  assertion sur le comportement observable. Pas de test de détail d'implémentation.
- **Présenter la liste et attendre ma validation (`AskUserQuestion`) avant d'écrire
  quoi que ce soit.**

## Après validation

1. Écrire uniquement les tests validés.
2. Relancer `npm test` et rapporter le résultat (compte avant/après).
3. Verdict global : **COUVERT** ou **MANQUES RESTANTS** (liste).
