# Ordre de Bataille — proto « secteur bocage »

Jeu de plateau hexagonal type Mémoire 44 en JavaScript pur : cartes de commandement
par secteur, dés spéciaux, terrain, IA gloutonne pour l'Axe.

## Stack

| Quoi    | Comment                                                                          |
| ------- | -------------------------------------------------------------------------------- |
| Langage | JavaScript ES2022, ES modules, **aucun bundler** (chargé tel quel)               |
| Rendu   | Canvas 2D natif + DOM — zéro dépendance runtime                                  |
| Dev     | `npm run dev` (`npx serve .`) — HTTP requis, `file://` ne charge pas les modules |
| Tests   | `npm test` → `node --test test/*.test.js`                                        |
| Lint    | `npm run lint` (ESLint 9, flat config `eslint.config.js`)                        |
| Format  | `npm run format` (Prettier)                                                      |

## Conventions de code (non négociables)

Deux couches strictement séparées — détail complet dans le skill `architecture` :

- **JAMAIS** de DOM, de canvas ni d'API navigateur dans `src/`. C'est la couche testée.
- **JAMAIS** de règle métier dans `render/` : la légalité d'une action vient toujours
  d'une fonction de `src/` (`reachable`, `targetsFor`, `diceFor`…).
- **JAMAIS** `Math.random` en dur : tout aléa passe par `state.rng` (injectable en test).
- **JAMAIS** d'état global de module dans `src/` : tout vit dans l'objet `state` créé par
  la factory unique `createGame()` (`src/game.js`).
- Le bus (`state.bus`, `src/events.js`) est le **seul** canal règles → rendu ; `src/`
  n'appelle jamais le rendu. Tout nouvel événement est documenté dans le tableau du
  skill `architecture`.
- Fragments HTML (chaînes) dans `render/html.js`, calculs graphiques purs dans
  `render/gfx.js` — jamais dans les modules DOM : ces deux modules restent testables sans navigateur.
- Identifiants en anglais, verbes explicites du domaine (`resolveCombat`,
  `orderableUnits`) ; UI, journaux et commentaires en français.

**Règle d'or** : si un changement décide « ce qui se passe », il va dans `src/` et se
teste. S'il décide « comment ça s'affiche », il va dans `render/`.

## Conventions du domaine

- Camps : `allies` / `axis` — affichés « Alliés » / « Axe » (`SIDE_FR`, `render/html.js`).
- Types d'unités : `inf` / `arm` / `art` (Infanterie, Blindé, Artillerie) — définis dans
  `UNITS` (`src/config.js`).
- Vocabulaire : figurines (`figs`), médailles (victoire à `MEDALS_TO_WIN` = 6 — total
  `medalCount` = destructions et objectifs occupés), objectifs (tuiles `state.objectives`),
  secteurs `gauche` / `centre` / `droite`, cartes de commandement, drapeaux (repli), combat
  rapproché / tir, prise de terrain (`takeGround`), percée de blindés (`canBreakthrough`),
  phases `card` / `orders`.
- Visuel : palette CSS dans `styles.css` (`:root`), doublée côté canvas par `COL`
  (`render/gfx.js`) ; symboles `SYM` / `UNIT_GLYPH` (`render/html.js`) ; typographies
  Courier New (texte) et Impact (titres).

## Comportement

- Ne **jamais** déclarer une tâche terminée sans avoir lancé `npm test` et vérifié que
  la suite passe.
- Si une approche échoue après **2 tentatives**, reprendre le plan avant de continuer —
  ne pas s'acharner sur la même piste.
- Implémenter uniquement ce qui est demandé, sans features/métriques/visualisations non
  requises.
- Privilégier des tests MACRO (comportement fonctionnel observable) plutôt que des tests
  de détails d'implémentation — voir le skill `testing`.
- Après édition, nettoyer imports/constantes/CSS inutilisés et lignes vides superflues.
- Quand une règle visible du joueur change, synchroniser la **doc vivante** : tables des
  skills, libellés `MOVE_LBL` / `RANGE_LBL` (`render/html.js`), objectif de médailles
  `#mGoal` (`index.html`) et message de démarrage (`render/app.js`).

## Skills disponibles

| Skill               | Périmètre                                                              |
| ------------------- | ---------------------------------------------------------------------- |
| `architecture`      | Carte des modules, objet `state`, événements du bus, où placer le code |
| `testing`           | Commande de test, philosophie macro, mapping tests, où placer un test  |
| `plateau-mouvement` | Hexes, secteurs, terrains, déplacement, scénario, picking              |
| `combat`            | Dés, portées, réductions de terrain, résolution, repli, médailles      |
| `cartes-tours`      | Pioche, main, cartes, phases, séquence de tour                         |
| `ia-axe`            | Heuristiques de l'IA et tempo du tour de l'Axe                         |
| `feature`           | Workflow d'implémentation d'une feature (invocable : `/feature`)       |
| `prd`               | Rédaction d'un PRD sans implémentation (invocable : `/prd`)            |

Commands : `/review` (revue complète du diff), `/check-conventions` (revue allégée),
`/check-tests` (analyse de couverture + propositions de tests).
