import {codeOf, isTrue, sortByOrder} from "../shared/grist-common.js";

const EMPTY={Valeur_texte:null,Valeur_nombre:null,Valeur_date:null,Valeur_booleen:null,Valeur_reference_Code:null,Valeur_structure_Code:null};
function qtype(q){return String(q?.Type_question ?? q?.Type ?? "").trim().toLowerCase();}
function refCode(q){return codeOf(q?.Referentiel_Code);}
function refSource(q,ctx){const rc=refCode(q); const r=(ctx?.referentials??[]).find(x=>codeOf(x.Referentiel_Code)===rc || String(x.id)===rc); return String(r?.Type_source??"VALEURS_REFERENTIELS").toUpperCase();}
export function serializeAnswer(question,value,context={}){
  const out={...EMPTY}; if(value===""||value==null) return out;
  const t=qtype(question);
  if(t.includes("nombre")||t.includes("numérique")||t.includes("numerique")||t.includes("montant")){out.Valeur_nombre=Number(value);return out;}
  if(t.includes("date")){out.Valeur_date=value;return out;}
  if(t.includes("bool")||t.includes("oui/non")){out.Valeur_booleen=isTrue(value);return out;}
  if(t.includes("liste")||t.includes("déroul")||t.includes("deroul")||t.includes("radio")){
    if(refSource(question,context)==="STRUCTURES") out.Valeur_structure_Code=codeOf(value); else out.Valeur_reference_Code=codeOf(value); return out;
  }
  out.Valeur_texte=String(value); return out;
}
export function deserializeAnswer(question,row,context={}){
  if(!row) return ""; const t=qtype(question);
  if(t.includes("nombre")||t.includes("numérique")||t.includes("numerique")||t.includes("montant")) return row.Valeur_nombre ?? "";
  if(t.includes("date")) return row.Valeur_date ?? "";
  if(t.includes("bool")||t.includes("oui/non")) return row.Valeur_booleen ?? "";
  if(t.includes("liste")||t.includes("déroul")||t.includes("deroul")||t.includes("radio")) return refSource(question,context)==="STRUCTURES" ? codeOf(row.Valeur_structure_Code) : codeOf(row.Valeur_reference_Code);
  return row.Valeur_texte ?? "";
}
function sameRef(value,row,codeCol){const raw=codeOf(value); return raw===codeOf(row?.[codeCol]) || String(value)===String(row?.id);}
export function hydrateResponse(rows,definition,reponseCode){
  const response=(rows.REPONSES??[]).find(r=>codeOf(r.Reponse_Code)===codeOf(reponseCode)||String(r.id)===String(reponseCode))??null;
  if(!response) return {response:null,principalAnswers:{},fiches:{},revisions:{response:null,elements:{}}};
  const elements=(rows.ELEMENTS_REPONSE??[]).filter(e=>sameRef(e.Reponse_Code,response,"Reponse_Code"));
  const values=rows.VALEURS_REPONSE??[]; const questions=definition.questions??[];
  const answersFor=el=>{const out={}; for(const v of values.filter(v=>sameRef(v.Element_Code,el,"Element_Code"))){const q=questions.find(q=>sameRef(v.Question_Code,q,"Question_Code")); if(q) out[codeOf(q.Question_Code)]=deserializeAnswer(q,v,definition);} return out;};
  const principal=elements.find(e=>String(e.Type_element??"").toLowerCase()==="principal" && !isTrue(e.Supprime_logiquement));
  const fiches={};
  for(const el of sortByOrder(elements.filter(e=>String(e.Type_element??"").toLowerCase()==="fiche"&&!isTrue(e.Supprime_logiquement)&&String(e.Statut??"").toLowerCase()!=="annulé"))){
    const rawTc=codeOf(el.TypeFiche_Code);
    const ficheType=(definition.ficheTypes??[]).find(t=>String(t.id)===rawTc || codeOf(t.TypeFiche_Code)===rawTc);
    const tc=ficheType ? codeOf(ficheType.TypeFiche_Code) : rawTc;
    if(!tc) continue; (fiches[tc]??=[]).push({elementCode:codeOf(el.Element_Code)||String(el.id),elementId:el.id,revision:Number(el.Revision||0),status:el.Statut||"Brouillon",answers:answersFor(el)});
  }
  return {response,principalAnswers:principal?answersFor(principal):{},principalElement:principal??null,fiches,revisions:{response:Number(response.Revision||0),elements:Object.fromEntries(elements.map(e=>[codeOf(e.Element_Code)||String(e.id),Number(e.Revision||0)]))}};
}
export function assertRevision(expected,actual){if(Number(expected??0)!==Number(actual??0)){const e=new Error("Une version plus récente de cette réponse existe. Rechargez le questionnaire avant de continuer.");e.code="revision_conflict";throw e;} return true;}
export function validateWholeResponse(definition,viewModel,answers,fiches,validateQuestion,visibleFicheQuestions){
  const errors={principal:{},fiches:{}};
  for(const p of viewModel.pages) for(const s of p.sections) for(const q of s.questions){const c=codeOf(q.Question_Code),m=validateQuestion(q,answers[c],true);if(m)errors.principal[c]=m;}
  for(const p of viewModel.pages) for(const t of p.repeatableTypes??[]){const list=fiches[t.code]??[]; if(list.length<t.minimum)errors.fiches[t.code]=`Vous devez saisir au moins ${t.minimum} ${t.minimum>1?t.labelPlural.toLowerCase():t.labelSingular.toLowerCase()}.`; list.forEach((f,i)=>{for(const q of visibleFicheQuestions(t,definition,{...answers,...f.answers})){const c=codeOf(q.Question_Code),m=validateQuestion(q,f.answers[c],true);if(m)(errors.fiches[`${t.code}:${i}`]??={})[c]=m;}});}
  return errors;
}

export function addedRecordId(result){
  const value=Array.isArray(result) ? result[0] : result;
  if(Number.isInteger(value) && value>0) return value;
  if(value && Number.isInteger(value.id) && value.id>0) return value.id;
  throw new Error("Grist n’a pas renvoyé l’identifiant de la ligne créée.");
}

export function generateResumeToken(cryptoLike=globalThis.crypto){
  if(!cryptoLike?.getRandomValues) throw new Error("Génération sécurisée du lien de reprise indisponible.");
  const bytes=new Uint8Array(32); cryptoLike.getRandomValues(bytes);
  let binary=""; for(const b of bytes) binary+=String.fromCharCode(b);
  const base64=typeof btoa==="function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/," ").trim();
}
export function findResponseByResumeToken(responses,token){
  const wanted=String(token??"").trim(); if(!wanted)return null;
  const matches=(responses??[]).filter(r=>String(r.Jeton_reprise??"")===wanted && !isTrue(r.Supprime_logiquement));
  return matches.length===1?matches[0]:null;
}
