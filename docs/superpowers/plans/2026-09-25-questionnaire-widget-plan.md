# Generic Questionnaire Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire un widget Grist générique de prévisualisation interactive piloté par les tables de configuration.

**Architecture:** JavaScript navigateur sans framework. `shared/grist-common.js` porte les fonctions pures de normalisation/conditions ; `questionnaire/app.js` charge Grist, construit le modèle d’affichage et pilote l’interface. Les tests utilisent `node:test`.

**Tech Stack:** HTML5, CSS3, JavaScript ES modules, Grist Plugin API, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-25-questionnaire-widget-design.md`

## Global Constraints
- Aucun élément métier FDP codé en dur.
- Aucune écriture de réponse dans cette version.
- ACL Grist = seule barrière de sécurité.
- Aucun framework ou build.
- Déploiement statique GitHub Pages.

## Review Focus
- Références Grist : normaliser IDs/valeurs sans dépendre de l’affichage.
- Table ou colonne absente : afficher une erreur exploitable.
- `Ordre` vide/dupliqué : conserver un ordre stable.
- Condition sur réponse vide : résultat déterministe.
- Question obligatoire cachée : ne jamais bloquer.

---

### Task 1: Fonctions pures
**Files:** Create `shared/grist-common.js`; Create `tests/questionnaire.test.mjs`.

**Interfaces:** Produces `rowsFromTable`, `sortByOrder`, `normalizeRef`, `evaluateRule`, `evaluateCondition`, `validateQuestion`.

- [ ] **Step 1:** Écrire des tests `node:test` couvrant normalisation, ordre stable, opérateurs, AND/OR et obligatoire caché.
- [ ] **Step 2:** Exécuter `node --test tests/questionnaire.test.mjs`; attendu : FAIL car module absent.
- [ ] **Step 3:** Implémenter les fonctions exportées avec gestion des valeurs nulles et numériques.
- [ ] **Step 4:** Réexécuter le test ; attendu : PASS.
- [ ] **Step 5:** Commit `feat: add questionnaire core helpers`.

### Task 2: Squelette statique
**Files:** Create `questionnaire/index.html`; Create `questionnaire/styles.css`; Create `shared/common.css`.

**Interfaces:** Produces DOM IDs `app`, `status`, `form-root`, `navigation`.

- [ ] **Step 1:** Ajouter au test une lecture de `index.html` vérifiant les conteneurs et `app.js`.
- [ ] **Step 2:** Exécuter ; attendu : FAIL avant création.
- [ ] **Step 3:** Créer le HTML accessible et les CSS responsives.
- [ ] **Step 4:** Exécuter ; attendu : PASS.
- [ ] **Step 5:** Commit `feat: add questionnaire widget shell`.

### Task 3: Chargement Grist
**Files:** Create `questionnaire/app.js`; Modify `tests/questionnaire.test.mjs`.

**Interfaces:** Produces `loadDefinition(docApi, selectedRecord)` returning `{version,pages,sections,questions,ficheTypes,choices,referentials,referentialValues,conditions,rules}`.

- [ ] **Step 1:** Tester un faux `docApi.fetchTable`, une version sélectionnée, aucune version et une table absente.
- [ ] **Step 2:** Exécuter ; attendu : FAIL.
- [ ] **Step 3:** Implémenter le chargement et les erreurs nommées.
- [ ] **Step 4:** Exécuter ; attendu : PASS.
- [ ] **Step 5:** Commit `feat: load questionnaire definition from grist`.

### Task 4: Modèle d’affichage
**Files:** Modify `questionnaire/app.js`; Modify tests.

**Interfaces:** Produces `buildViewModel(definition, answers)`.

- [ ] **Step 1:** Tester ordre pages/sections/questions, options directes/référentielles et condition fausse/vraie.
- [ ] **Step 2:** Exécuter ; attendu : FAIL.
- [ ] **Step 3:** Implémenter assemblage et filtrage génériques.
- [ ] **Step 4:** Exécuter ; attendu : PASS.
- [ ] **Step 5:** Commit `feat: build questionnaire view model`.

### Task 5: Rendu des champs
**Files:** Modify `questionnaire/app.js`; Modify `questionnaire/styles.css`; Modify tests.

**Interfaces:** Produces contrôles texte court/long, nombre, montant, date, liste, radio, email.

- [ ] **Step 1:** Tester le mapping type → contrôle.
- [ ] **Step 2:** Exécuter ; attendu : FAIL.
- [ ] **Step 3:** Implémenter rendu, aides, contraintes et réponses locales.
- [ ] **Step 4:** Exécuter ; attendu : PASS.
- [ ] **Step 5:** Commit `feat: render questionnaire fields`.

### Task 6: Navigation et validation
**Files:** Modify `questionnaire/app.js`; Modify tests.

**Interfaces:** Produces `validateVisiblePage`, navigation et progression.

- [ ] **Step 1:** Tester obligatoire visible/caché, email invalide, bornes numériques et longueurs.
- [ ] **Step 2:** Exécuter ; attendu : FAIL.
- [ ] **Step 3:** Implémenter validation immédiate, Précédent/Suivant et écran final de prévisualisation.
- [ ] **Step 4:** Exécuter ; attendu : PASS.
- [ ] **Step 5:** Commit `feat: add questionnaire preview navigation`.

### Task 7: Documentation et vérification
**Files:** Create `README.md`.

- [ ] **Step 1:** Documenter arborescence, GitHub Pages, URL du widget et réglages Grist.
- [ ] **Step 2:** Exécuter `node --test tests/questionnaire.test.mjs`; attendu : PASS.
- [ ] **Step 3:** Rechercher toute écriture Grist (`applyUserActions`, add/update/remove) ; attendu : aucune.
- [ ] **Step 4:** Rechercher `Q001`, `Q005`, `Frais de déplacement` dans la logique ; attendu : aucune occurrence métier.
- [ ] **Step 5:** Commit `docs: document questionnaire widget deployment`.
