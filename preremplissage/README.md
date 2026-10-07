# Données initiales / Pré-remplissage — Étape 2

Cette version conserve l’étape 1 (modèle Excel, analyse et stockage dans les tables d’import) et ajoute l’initialisation réelle des questions simples depuis la feuille `REPONSES`.

## Initialisation unique
- Une réponse est créée seulement si aucune réponse active n’existe déjà pour la ligne de campagne/participant correspondante.
- Si une réponse existe déjà, elle est ignorée et n’est jamais écrasée.
- Les réimports ne réappliquent donc pas les valeurs sur une réponse commencée.

## Types pris en charge à cette étape
- texte ;
- numérique / montant ;
- date ;
- booléen ;
- radio / liste simple ;
- cases à cocher / liste multiple (`|` ou `;` pour séparer plusieurs codes/modalités) ;
- référentiels et Structures.

Les matrices, fiches et sous-fiches ne sont pas initialisées à cette étape.

## Lecture seule
Les marqueurs `__LECTURE_SEULE` restent enregistrés dans l’import mais ne sont pas encore appliqués au Questionnaire. Leur application appartient à l’étape 3.

## Tables existantes utilisées
- SOURCES_IMPORT
- MAPPINGS_IMPORT
- LIGNES_IMPORTEES
- VALEURS_IMPORTEES
- REPONSES
- ELEMENTS_REPONSE
- VALEURS_REPONSE
- SELECTIONS_REPONSE

Aucune nouvelle table ni colonne Grist n’est requise.
