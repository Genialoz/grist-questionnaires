# grist-questionnaires

Widgets génériques pour l’application de gestion de questionnaires dans Grist.

## Première version : prévisualisation du questionnaire

Le dossier `questionnaire/` contient le premier widget. Il lit la définition du questionnaire dans Grist et construit l’interface dynamiquement. Cette version **n’enregistre aucune réponse**.

### Déposer sur GitHub

Copiez à la racine du dépôt les dossiers/fichiers de cette archive en conservant exactement l’arborescence.

Activez ensuite GitHub Pages dans **Settings → Pages** :
- Source : **Deploy from a branch**
- Branch : `main`
- Dossier : `/ (root)`

Après publication, l’URL du premier widget sera normalement :

`https://genialoz.github.io/grist-questionnaires/questionnaire/`

### Ajouter dans Grist

1. Ajoutez une page/section **Widget personnalisé**.
2. Utilisez l’URL GitHub Pages ci-dessus.
3. Pour cette prévisualisation, le widget doit pouvoir lire plusieurs tables du document. Accordez l’accès document demandé par le widget.
4. Le widget affichera une version disponible et lira les tables de configuration.

> La sécurité fonctionnelle ne repose pas sur le JavaScript du widget. Les ACL Grist devront être configurées et testées séparément avant mise en production.

## Tables lues

`VERSIONS_QUESTIONNAIRES`, `PAGES`, `SECTIONS`, `QUESTIONS`, `TYPES_FICHES`, `CHOIX_QUESTIONS`, `REFERENTIELS`, `VALEURS_REFERENTIELS`, `CONDITIONS`, `REGLES_CONDITION`.

## Test local

Avec Node.js installé :

```bash
npm test
```

## Point à surveiller avant le test FDP

Le modèle actuel contient `REF_STRUCTURES` dans `REFERENTIELS`, alors que les structures elles-mêmes sont stockées dans la table `STRUCTURES`. Cette V0 ne code volontairement aucune exception FDP : un référentiel standard est lu dans `VALEURS_REFERENTIELS`. Il faudra donc régler explicitement la source générique des référentiels système avant que la question Structure puisse être alimentée correctement. Ne dupliquez pas encore les structures : ce point sera traité proprement dans le modèle.
