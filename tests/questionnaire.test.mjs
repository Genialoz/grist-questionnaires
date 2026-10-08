import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {rowsFromTable, sortByOrder, normalizeRef, evaluateRule, evaluateCondition, validateQuestion} from "../shared/grist-common.js";
import {controlKind, buildViewModel, validateVisiblePage, buildMatrixHeaderLevels} from "../questionnaire/app.js";
import {hydrateResponse} from "../questionnaire/persistence.js";

test("rowsFromTable converts Grist columnar data",()=>assert.deepEqual(rowsFromTable({id:[1,2],Code:["A","B"]}),[{id:1,Code:"A"},{id:2,Code:"B"}]));
test("normalizeRef handles common reference/list shapes",()=>{assert.equal(normalizeRef(["Ref",12]),12);assert.deepEqual(normalizeRef(["L","A","B"]),["A","B"])});
test("sortByOrder is stable with missing or equal order",()=>assert.deepEqual(sortByOrder([{x:"b",Ordre:2},{x:"a",Ordre:1},{x:"c",Ordre:2},{x:"z"}]).map(x=>x.x),["a","b","c","z"]));
test("rules support equality, numeric and empty operators",()=>{
  assert.equal(evaluateRule({Question_source_Code:"Q",Operateur:"=",Valeur_comparaison:"A"},{Q:"A"}),true);
  assert.equal(evaluateRule({Question_source_Code:"Q",Operateur:">",Valeur_comparaison:"3"},{Q:4}),true);
  assert.equal(evaluateRule({Question_source_Code:"Q",Operateur:"vide"},{Q:""}),true);
});
test("conditions support OR",()=>{
  const c={Condition_Code:"C",Operateur_logique:"OR"};
  const rules=[{Condition_Code:"C",Question_source_Code:"Q",Operateur:"=",Valeur_comparaison:"A"},{Condition_Code:"C",Question_source_Code:"Q",Operateur:"=",Valeur_comparaison:"B"}];
  assert.equal(evaluateCondition(c,rules,{Q:"B"}),true);
});
test("hidden required question never blocks",()=>assert.equal(validateQuestion({Obligatoire:true},"",false),""));
test("email and numeric limits validate",()=>{
  assert.match(validateQuestion({Type_question:"Email"},"x",true),/invalide/);
  assert.match(validateQuestion({Type_question:"Nombre",Valeur_min:2},1,true),/minimale/);
});
test("HTML shell contains required nodes",()=>{
  const html=fs.readFileSync(new URL("../questionnaire/index.html",import.meta.url),"utf8");
  for(const id of ["app","status","form-root","navigation"]) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/app\.js/);
});
test("control mapping covers base types",()=>{
  assert.equal(controlKind({Type_question:"Texte long"}),"textarea");
  assert.equal(controlKind({Type_question:"Liste"}),"select");
  assert.equal(controlKind({Type_question:"Radio"}),"radio");
  assert.equal(controlKind({Type_question:"Montant"}),"number");
  assert.equal(controlKind({Type_question:"Email"}),"email");
});
test("view model orders and applies generic conditions",()=>{
  const def={
    version:{Version_Code:"V",Titre:"T"},
    pages:[{Page_Code:"P",Ordre:1,Active:true}],
    sections:[{Section_Code:"S",Page_Code:"P",Ordre:1,Active:true}],
    questions:[
      {Question_Code:"Q1",Section_Code:"S",Ordre:1,Active:true,Type_question:"Radio",Referentiel_Code:"R"},
      {Question_Code:"Q2",Section_Code:"S",Ordre:2,Active:true,Condition_affichage_Code:"C"}
    ],
    choices:[], referentials:[{Referentiel_Code:"R"}],
    referentialValues:[{ValeurRef_Code:"A",Referentiel_Code:"R",Libelle:"Alpha",Ordre:1,Active:true}],
    conditions:[{Condition_Code:"C",Operateur_logique:"AND"}],
    rules:[{Condition_Code:"C",Question_source_Code:"Q1",Operateur:"=",Valeur_comparaison:"A"}]
  };
  assert.equal(buildViewModel(def,{}).pages[0].sections[0].questions.length,1);
  const vm=buildViewModel(def,{Q1:"A"});
  assert.equal(vm.pages[0].sections[0].questions.length,2);
  assert.equal(vm.pages[0].sections[0].questions[0].options[0].label,"Alpha");
});
test("visible page validation ignores questions absent from view",()=>{
  const page={sections:[{questions:[{Question_Code:"Q1",Obligatoire:true}]}]};
  assert.deepEqual(validateVisiblePage(page,{}),{Q1:"Ce champ est obligatoire."});
});


test("multi-level matrix headers group common parents",()=>{
  const levels=buildMatrixHeaderLevels(["Missions permanentes-CDI-F","Missions permanentes-CDI-H","Missions permanentes-CDD-F","Missions temporaires-CDD-F"],"-");
  assert.equal(levels.length,3);
  assert.deepEqual(levels[0].map(x=>[x.label,x.colSpan]),[["Missions permanentes",3],["Missions temporaires",1]]);
  assert.deepEqual(levels[1].map(x=>[x.label,x.colSpan]),[["CDI",2],["CDD",1],["CDD",1]]);
  assert.deepEqual(levels[2].map(x=>[x.label,x.colSpan]),[["F",1],["H",1],["F",1],["F",1]]);
});

test("multi-level matrix headers stay disabled without hierarchy",()=>{
  assert.equal(buildMatrixHeaderLevels(["Femme","Homme"],"-"),null);
});


test("hydrateResponse exposes imported read-only locks",()=>{
  const def={questions:[{id:10,Question_Code:"VILLE",Type_question:"Texte"},{id:11,Question_Code:"MONTANT",Type_question:"Nombre",TypeFiche_Code:20}],ficheTypes:[{id:20,TypeFiche_Code:"DEP"}],choices:[],referentialValues:[],structures:[],matrixColumns:[]};
  const rows={
    REPONSES:[{id:1,Reponse_Code:"R1",Revision:1}],
    ELEMENTS_REPONSE:[{id:2,Element_Code:"E0",Reponse_Code:1,Type_element:"Principal",Revision:1},{id:3,Element_Code:"E1",Reponse_Code:1,Type_element:"Fiche",TypeFiche_Code:20,Revision:1,Lecture_seule_import:true}],
    VALEURS_REPONSE:[{id:4,Valeur_Code:"V1",Element_Code:2,Question_Code:10,Valeur_texte:"Paris",Lecture_seule_import:true},{id:5,Valeur_Code:"V2",Element_Code:3,Question_Code:11,Valeur_nombre:25}],
    SELECTIONS_REPONSE:[]
  };
  const h=hydrateResponse(rows,def,"R1");
  assert.equal(h.principalAnswers.VILLE,"Paris");
  assert.equal(h.principalReadOnlyQuestions.VILLE,true);
  assert.equal(h.fiches.DEP[0].readOnlyImport,true);
  assert.equal(h.fiches.DEP[0].answers.MONTANT,25);
});
