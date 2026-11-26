import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {ficheIdentifierSettings, ficheIdentifier, ficheHeading} from "../shared/fiche-identifiant.js";

test("rétrocompatibilité : Fiche 001 par défaut",()=>{
  assert.equal(ficheIdentifier({},0),"Fiche 001");
  assert.equal(ficheIdentifier({},11),"Fiche 012");
  assert.deepEqual(ficheIdentifierSettings({}),{visible:true,prefix:"Fiche",explicit:false});
});
test("préfixe personnalisable et identifiant masqué",()=>{
  assert.equal(ficheIdentifier({Masquer_identifiant:false,Prefixe_identifiant:"Question"},2),"Question 003");
  assert.equal(ficheIdentifier({Masquer_identifiant:true,Prefixe_identifiant:"Question"},2),"");
  assert.equal(ficheIdentifier({Masquer_identifiant:true,Prefixe_identifiant:"Question"},2,{subfiche:true}),"");
  assert.equal(ficheIdentifierSettings({Masquer_identifiant:true,Prefixe_identifiant:"Question"}).prefix,"Question");
});
test("sous-fiches historiques non modifiées et configuration indépendante",()=>{
  assert.equal(ficheIdentifier({},0,{subfiche:true}),"");
  assert.equal(ficheIdentifier({Masquer_identifiant:false,Prefixe_identifiant:"Projet"},0,{subfiche:true}),"Projet 001");
  assert.equal(ficheIdentifier({Masquer_identifiant:true},0),"");
});
test("pas de séparateur inutile quand l’identifiant est masqué",()=>{
  assert.equal(ficheHeading("","Texte de la question"),"Texte de la question");
  assert.equal(ficheHeading("Question 001","Texte de la question"),"Question 001 — Texte de la question");
});
test("concepteur et répondant utilisent la même configuration",()=>{
  const designer=fs.readFileSync(new URL("../concepteur/app.js",import.meta.url),"utf8");
  const respondent=fs.readFileSync(new URL("../questionnaire/app.js",import.meta.url),"utf8");
  for(const field of ["Masquer_identifiant","Prefixe_identifiant"]) {
    assert.match(designer,new RegExp(field)); assert.match(respondent,new RegExp(field));
  }
  assert.match(designer,/await ensureFicheIdentifierColumns\(\)/);
  assert.match(respondent,/ficheHeading\(card.identifier,card.title\)/);
});
