---
name: prd
description: Use when l'utilisateur veut spécifier une feature avant de la coder — produit un PRD structuré, sans rien implémenter.
user_invocable: true
---

# Workflow : rédiger un PRD

**N'implémente rien** : le livrable est un document de spécification.

## 1. Explorer l'existant technique

- Invoquer le skill `architecture` et le(s) skill(s) de domaine concerné(s).
- Lire les fichiers réels touchés par le sujet (`src/…`, `render/…`, tests) pour remplir
  la section « Existant technique » avec des faits : fonctions, valeurs actuelles
  (`src/config.js`), événements du bus existants, tests couvrant la zone.
- Ne poser AUCUNE question dont la réponse est dans le code.

## 2. Poser uniquement les décisions produit

Via `AskUserQuestion` (options cliquables) : valeurs de gameplay, comportements voulus,
priorités, hors-scope. Regrouper les questions (max 4 par appel), proposer une option
recommandée argumentée.

## 3. Rédiger le PRD (format fixe)

```markdown
# PRD — <titre>

## Objectif

<le problème / la valeur, en 2-3 phrases>

## Existant technique

<faits vérifiés dans le code : modules, fonctions, valeurs, événements, tests>

## Comportement

<spécification précise, cas nominaux ET cas limites (hex à cheval, dos au mur,
pioche vide, victoire en cours de tour…)>

## Hors-scope

<ce qu'on ne fait explicitement pas>

## Impacts par couche

- src/ : <modules, nouvelles fonctions, événements bus à ajouter au tableau du skill architecture>
- render/ : <affichage, libellés en dur à synchroniser (MOVE_LBL/RANGE_LBL, #mGoal…)>
- test/ : <fichiers, scénarios macro>
- doc : <skills et CLAUDE.md à mettre à jour>

## Critères d'acceptation

<liste vérifiable, comportements observables>

## Tests

<tests macro prévus : fichier cible, état fabriqué, assertion>

## Risques & questions ouvertes

<dont les questions ouvertes connues du projet si elles touchent le sujet :
répartition des pioches 10/14, colonnes de secteurs codées en dur>
```

## 4. Livrer

Présenter le PRD dans la conversation et proposer de l'enregistrer sous
`docs/prd/<slug>.md`. Rappeler que l'implémentation se lance ensuite avec `/feature`.
