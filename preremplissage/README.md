# Données initiales / Pré-remplissage — Étape 3 (fiches)

Cette version conserve les étapes validées précédentes et ajoute l’initialisation réelle des fiches depuis la feuille `FICHES`.

## Initialisation unique
- Les lignes `REPONSES` et `FICHES` sont regroupées par identifiant participant.
- Si aucune réponse active n’existe, le module crée une réponse support et son élément `Principal`.
- Les réponses simples éventuelles sont appliquées au Principal.
- Les lignes `FICHES` créent de vrais `ELEMENTS_REPONSE` avec `Type_element = Fiche`.
- Si une réponse active existait déjà avant l’import, le participant est ignoré intégralement afin de ne pas écraser ni compléter une réponse déjà commencée.
- Un fichier peut donc contenir uniquement `FICHES` : la réponse support est créée automatiquement.

## Valeurs de fiches
Les valeurs utilisent les mécanismes existants `VALEURS_REPONSE` et `SELECTIONS_REPONSE`, avec les mêmes conversions que les réponses simples.

## Pas encore pris en charge
- sous-fiches réelles ;
- application des marqueurs de lecture seule ;
- matrices.

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

## Correctif V3.1
Une réponse déjà créée par simple ouverture du lien peut désormais être réutilisée si elle est encore réellement vide (Principal uniquement, aucune valeur, aucune fiche/sous-fiche, non validée). Une réponse déjà commencée reste protégée et est ignorée.
