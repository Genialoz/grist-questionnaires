import test from 'node:test';import assert from 'node:assert/strict';import {analyzeSheets,sheetKind,boolVal,splitMultiValue,isReusableEmptyResponseState} from '../preremplissage/import-core.js';
test('reconnait les feuilles attendues',()=>{assert.equal(sheetKind('Réponses'),'REPONSES');assert.equal(sheetKind('SOUS_FICHES'),'SOUS_FICHES');assert.equal(sheetKind('Divers'),'')});
test('booléens lecture seule',()=>{assert.equal(boolVal('Oui'),true);assert.equal(boolVal('non'),false)});
test('sépare les valeurs multiples',()=>{assert.deepEqual(splitMultiValue('A | B;C'),['A','B','C'])});
test('analyse questions, fiches et parent',()=>{const q=[{id:1,Question_Code:'VILLE',TypeFiche_Code:0},{id:2,Question_Code:'MONTANT',TypeFiche_Code:10}],t=[{id:10,TypeFiche_Code:'DEP',Version_Code:1}];const sheets=[{name:'REPONSES',rows:[['IDENTIFIANT','VILLE','VILLE__LECTURE_SEULE'],['A1','Paris','Oui']]},{name:'FICHES',rows:[['IDENTIFIANT','TYPE_FICHE','CODE_FICHE','MONTANT'],['A1','DEP','F1','25']]},{name:'SOUS_FICHES',rows:[['IDENTIFIANT','TYPE_FICHE','CODE_FICHE','CODE_PARENT'],['A1','DEP','SF1','F1']]}];const a=analyzeSheets(sheets,{questions:q,ficheTypes:t,identifierColumn:'IDENTIFIANT',expectedIdentifiers:['A1']});assert.deepEqual(a.errors,[]);assert.equal(a.stats.participantsFound,1);assert.equal(a.stats.ficheCount,1);assert.equal(a.stats.subCount,1);assert.equal(a.parsed[0].values[0].readOnly,true)});
test('bloque parent absent',()=>{const a=analyzeSheets([{name:'SOUS_FICHES',rows:[['IDENTIFIANT','TYPE_FICHE','CODE_FICHE','CODE_PARENT'],['A1','DEP','SF1','X']]}],{questions:[],ficheTypes:[{id:10,TypeFiche_Code:'DEP'}],identifierColumn:'IDENTIFIANT',expectedIdentifiers:[]});assert.ok(a.errors.some(x=>x.includes('parent')))});
test('bloque les doublons dans REPONSES',()=>{const a=analyzeSheets([{name:'REPONSES',rows:[['IDENTIFIANT','VILLE'],['A1','Paris'],['A1','Lyon']]}],{questions:[{id:1,Question_Code:'VILLE',TypeFiche_Code:0}],ficheTypes:[],identifierColumn:'IDENTIFIANT',expectedIdentifiers:['A1']});assert.ok(a.errors.some(x=>x.includes('présent plusieurs fois')))});

test('accepte un import contenant uniquement des fiches',()=>{const a=analyzeSheets([{name:'FICHES',rows:[['IDENTIFIANT','TYPE_FICHE','CODE_FICHE','MONTANT'],['A1','DEP','F1','25'],['A1','DEP','F2','40']]}],{questions:[{id:2,Question_Code:'MONTANT',TypeFiche_Code:10}],ficheTypes:[{id:10,TypeFiche_Code:'DEP',Version_Code:1}],identifierColumn:'IDENTIFIANT',expectedIdentifiers:['A1']});assert.deepEqual(a.errors,[]);assert.equal(a.stats.ficheCount,2);assert.equal(a.stats.identifiers,1);assert.equal(a.parsed.filter(x=>x.kind==='FICHES').length,2)});

test('réutilise seulement une réponse existante réellement vide',()=>{assert.equal(isReusableEmptyResponseState({status:'Brouillon',elementTypes:['Principal'],valueCount:0}),true);assert.equal(isReusableEmptyResponseState({status:'Brouillon',elementTypes:['Principal','Fiche'],valueCount:0}),false);assert.equal(isReusableEmptyResponseState({status:'Brouillon',elementTypes:['Principal'],valueCount:1}),false);assert.equal(isReusableEmptyResponseState({status:'Validé',elementTypes:['Principal'],valueCount:0}),false)});


test('valide la hiérarchie de type des sous-fiches',()=>{
  const q=[{id:2,Question_Code:'MONTANT',TypeFiche_Code:10},{id:3,Question_Code:'NOM',TypeFiche_Code:20}],t=[{id:10,TypeFiche_Code:'DEP',Parent_Code:0},{id:20,TypeFiche_Code:'AGENT',Parent_Code:10}];
  const ok=analyzeSheets([{name:'FICHES',rows:[['IDENTIFIANT','TYPE_FICHE','CODE_FICHE'],['A1','DEP','F1']]},{name:'SOUS_FICHES',rows:[['IDENTIFIANT','TYPE_FICHE','CODE_FICHE','CODE_PARENT','NOM'],['A1','AGENT','SF1','F1','Dupont']]}],{questions:q,ficheTypes:t,identifierColumn:'IDENTIFIANT',expectedIdentifiers:['A1']});
  assert.deepEqual(ok.errors,[]);assert.equal(ok.parsed.find(x=>x.kind==='SOUS_FICHES').values[0].raw,'Dupont');
  const bad=analyzeSheets([{name:'FICHES',rows:[['IDENTIFIANT','TYPE_FICHE','CODE_FICHE'],['A1','AGENT','F1']]},{name:'SOUS_FICHES',rows:[['IDENTIFIANT','TYPE_FICHE','CODE_FICHE','CODE_PARENT'],['A1','AGENT','SF1','F1']]}],{questions:q,ficheTypes:t,identifierColumn:'IDENTIFIANT',expectedIdentifiers:['A1']});
  assert.ok(bad.errors.some(x=>x.includes('n’est pas enfant')));
});

test('accepte une sous-fiche avec parent sous-fiche pour une hiérarchie à plusieurs niveaux',()=>{
  const t=[{id:10,TypeFiche_Code:'A',Parent_Code:0},{id:20,TypeFiche_Code:'B',Parent_Code:10},{id:30,TypeFiche_Code:'C',Parent_Code:20}];
  const a=analyzeSheets([{name:'FICHES',rows:[['IDENTIFIANT','TYPE_FICHE','CODE_FICHE'],['A1','A','F1']]},{name:'SOUS_FICHES',rows:[['IDENTIFIANT','TYPE_FICHE','CODE_FICHE','CODE_PARENT'],['A1','B','SF1','F1'],['A1','C','SSF1','SF1']]}],{questions:[],ficheTypes:t,identifierColumn:'IDENTIFIANT',expectedIdentifiers:['A1']});
  assert.deepEqual(a.errors,[]);assert.equal(a.stats.subCount,2);
});
