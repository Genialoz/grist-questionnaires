# Widget Questionnaire générique — Spécification

**Date :** 25 septembre 2026

## Objectif
Créer le premier widget générique de GRIST FDP : une prévisualisation interactive construite à partir de la configuration Grist, sans logique métier FDP codée en dur.

## Périmètre V0
Le widget lit `VERSIONS_QUESTIONNAIRES`, `PAGES`, `SECTIONS`, `QUESTIONS`, `TYPES_FICHES`, `CHOIX_QUESTIONS`, `REFERENTIELS`, `VALEURS_REFERENTIELS`, `CONDITIONS` et `REGLES_CONDITION`.

Il affiche Pages → Sections → Questions selon `Ordre`, prend en charge texte court/long, nombre, montant, date, liste, radio et email, alimente les choix depuis la configuration, évalue les conditions simples AND/OR et contrôle les questions obligatoires visibles.

Cette version ne crée ni ne modifie `REPONSES`, `ELEMENTS_REPONSE` ou `VALEURS_REPONSE`. Fiches multiples, matrices, pièces jointes, calculs avancés, quotas, anonymisation et ACL seront traités plus tard.

## Généricité
Aucun code question, libellé, page, section, valeur de référentiel ou règle propre aux frais de déplacement ne doit être codé en dur.

## Sélection de version
Le widget privilégie une version fournie par le contexte Grist lorsqu’elle est exploitable, sinon une version disponible pour prévisualisation. L’absence de version produit un état explicite.

## Conditions
Première prise en charge : AND/OR et opérateurs `=`, `!=`, `>`, `>=`, `<`, `<=`, `contient`, `vide`, `non vide`. Une condition mal configurée échoue de façon sûre et génère un diagnostic.

## Validation
Sur Suivant, seules les questions visibles obligatoires sont contrôlées. Email, min/max numériques et longueurs min/max sont utilisés lorsqu’ils sont configurés. Une question cachée ne bloque jamais.

## Sécurité
Le widget n’est pas une barrière d’autorisation. Les ACL Grist restent la protection réelle.

## Structure
```text
grist-questionnaires/
├── questionnaire/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── shared/
│   ├── grist-common.js
│   └── common.css
├── tests/
│   └── questionnaire.test.mjs
├── docs/superpowers/specs/
├── docs/superpowers/plans/
└── README.md
```

## Technique
HTML/CSS/JavaScript sans framework ni build afin de rester simple à héberger sur GitHub Pages. Les fonctions de normalisation, conditions et validation sont pures autant que possible et testables avec Node.

## Réussite
Le même code doit afficher le questionnaire FDP à partir des tables, réagir aux modifications de configuration, résoudre les choix/référentiels, appliquer une condition comme celle actuellement configurée pour la précision géographique, contrôler les obligatoires visibles, afficher les erreurs et ne sauvegarder aucune réponse.
