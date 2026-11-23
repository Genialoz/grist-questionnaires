import test from 'node:test';
import assert from 'node:assert/strict';
import {isValidPhoneNumber,validateQuestion} from '../shared/grist-common.js';
const question={Type_question:'Téléphone',Obligatoire:false};
test('Téléphone : formats valides français et internationaux',()=>{
  for (const value of ['0612345678','01 23 45 67 89','06.12.34.56.78','+33 6 12 34 56 78','+33612345678','+44 20 7946 0958']) {
    assert.equal(isValidPhoneNumber(value),true,value);
    assert.equal(validateQuestion(question,value),'',value);
  }
});
test('Téléphone : les caractères illégaux, les numéros incomplets et faux préfixes sont refusés',()=>{
  for (const value of ['123','0612abcd78','06 12 34 56','+33 06 12 34 56 78','+33 6 12 34','06+12345678','0033612345678','+0123456789']) {
    assert.equal(isValidPhoneNumber(value),false,value);
    assert.match(validateQuestion(question,value),/invalide/,value);
  }
});
test('Téléphone facultatif vide, obligatoire vide, longueur personnalisée',()=>{
  assert.equal(validateQuestion(question,''),'');
  assert.match(validateQuestion({...question,Obligatoire:true},''),/obligatoire/);
  assert.match(validateQuestion({...question,Longueur_max:8},'0612345678'),/Maximum/);
});
