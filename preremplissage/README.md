# Données initiales / Pré-remplissage — Étape 1

Ce widget prépare et contrôle les imports de données initiales sans écrire dans les tables de réponses.

## Tables réutilisées
- SOURCES_IMPORT
- MAPPINGS_IMPORT
- LIGNES_IMPORTEES
- VALEURS_IMPORTEES

Aucune nouvelle table ni colonne n'est nécessaire à cette étape.

## Feuilles Excel reconnues
- REPONSES
- FICHES
- SOUS_FICHES

Le nom de la colonne identifiant est paramétrable dans le widget.

### REPONSES
Colonnes : IDENTIFIANT (ou nom choisi), puis codes exacts des questions.
Une colonne `QUESTION_CODE__LECTURE_SEULE` peut accompagner chaque question.

### FICHES
Colonnes techniques : IDENTIFIANT, TYPE_FICHE, CODE_FICHE, LECTURE_SEULE_FICHE.
Les autres colonnes doivent être des codes exacts de questions du type de fiche.

### SOUS_FICHES
Colonnes techniques : IDENTIFIANT, TYPE_FICHE, CODE_FICHE, CODE_PARENT, LECTURE_SEULE_FICHE.

## Important
Cette version ne crée ni REPONSES, ni ELEMENTS_REPONSE, ni VALEURS_REPONSE, ni SELECTIONS_REPONSE.
Elle enregistre uniquement un import préparé après contrôle.
