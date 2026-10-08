import {codeOf,isTrue,sortByOrder,evaluateCondition} from "../shared/grist-common.js";

export function mulberry32(seed){let a=(Number(seed)||1)>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function hashSeed(value){let h=2166136261;for(const ch of String(value??"")){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
export function pick(rng,arr){return arr?.length?arr[Math.floor(rng()*arr.length)]:null}
export function intBetween(rng,min,max){min=Math.ceil(Number(min));max=Math.floor(Number(max));if(!Number.isFinite(min))min=0;if(!Number.isFinite(max))max=min+100;if(max<min)[min,max]=[max,min];return min+Math.floor(rng()*(max-min+1))}
export function decimalBetween(rng,min,max,decimals=0){let lo=Number(min),hi=Number(max);if(!Number.isFinite(lo))lo=0;if(!Number.isFinite(hi))hi=100;if(hi<lo)[lo,hi]=[hi,lo];const d=Math.max(0,Math.min(6,Number(decimals)||0)),p=10**d;return Math.round((lo+rng()*(hi-lo))*p)/p}
export function matrixKind(q){const t=String(q?.Type_question??q?.Type??"").trim().toLowerCase();if(!t.includes("matrice"))return"";if(t.includes("checkbox"))return"checkbox";if(t.includes("radio"))return"radio";if(t.includes("nombre")||t.includes("numérique")||t.includes("numerique"))return"number";if(t.includes("texte"))return"text";return""}
export function isMultiQuestion(q){const t=String(q?.Type_question??"").toLowerCase();return t.includes("case")||t.includes("checkbox")||((t.includes("liste")||t.includes("déroul")||t.includes("deroul"))&&isTrue(q.Selection_multiple))}
export function isDisplayBlock(q){const t=String(q?.Type_question??q?.Type??"").trim().toLowerCase();return t==="description"||t==="sommaire"||t.includes("tableau de données")||t.includes("tableau de donnees")}
export function resolveRow(value,rows,codeField){const raw=codeOf(value);return(rows??[]).find(r=>String(r.id)===raw||codeOf(r?.[codeField])===raw)||null}
export function activeChoices(q,ctx){return sortByOrder((ctx.choices??[]).filter(c=>c.Actif!==false&&resolveRow(c.Question_Code,[q],"Question_Code")))}
function choicesFor(q,ctx){const qid=String(q.id),qc=codeOf(q.Question_Code);return sortByOrder((ctx.choices??[]).filter(c=>c.Actif!==false&&[String(codeOf(c.Question_Code)),String(c.Question_Code)].some(v=>v===qid||v===qc)))}
function refFor(q,ctx){return resolveRow(q.Referentiel_Code,ctx.referentials??[],"Referentiel_Code")}
export function optionPool(q,ctx){const direct=choicesFor(q,ctx);if(direct.length)return direct.map(c=>({kind:"choice",row:c,code:codeOf(c.Choix_Code),label:String(c.Libelle??c.Valeur??c.Choix_Code??"")}));const ref=refFor(q,ctx);if(!ref)return[];if(String(ref.Type_source??"").toUpperCase()==="STRUCTURES")return(ctx.structures??[]).filter(s=>s.Active!==false).map(s=>({kind:"structure",row:s,code:codeOf(s.Structure_Code),label:String(s.Nom??s.Structure_Code??"")}));const rr=String(ref.id),rc=codeOf(ref.Referentiel_Code);return(ctx.referentialValues??[]).filter(v=>v.Actif!==false&&(codeOf(v.Referentiel_Code)===rr||codeOf(v.Referentiel_Code)===rc)).map(v=>({kind:"reference",row:v,code:codeOf(v.ValeurRef_Code),label:String(v.Libelle??v.Code??v.ValeurRef_Code??"")}))}
const cities=["Paris","Lyon","Lille","Nantes","Bordeaux","Toulouse","Rennes","Dijon","Tours","Strasbourg","Rouen","Montpellier"];
const services=["Service pilotage","Département études","Mission appui","Pôle ressources","Bureau coordination","Unité projets"];
const comments=["Réponse fictive générée pour tester le questionnaire.","Donnée de simulation pour la préparation du tableau de bord.","Exemple fictif destiné aux tests fonctionnels.","Valeur générée automatiquement pour la simulation."];
export function fakeText(q,rng,index=1){const label=String(q.Libelle??q.Question_Code??"").toLowerCase();if(label.includes("ville"))return pick(rng,cities);if(label.includes("service")||label.includes("bureau")||label.includes("département")||label.includes("departement"))return pick(rng,services);if(label.includes("nom"))return `Personne fictive ${String(index).padStart(3,"0")}`;if(label.includes("prénom")||label.includes("prenom"))return `Prénom${index}`;if(label.includes("email")||label.includes("courriel"))return `simulation${index}@example.invalid`;if(label.includes("code postal"))return String(75000+(index%20));if(label.includes("comment")||label.includes("précis")||label.includes("precis")||label.includes("observ"))return pick(rng,comments);return `Valeur fictive ${index}`}
export function fakeSimpleValue(q,ctx,rng,index=1,mode="realiste"){
  const pool=optionPool(q,ctx),t=String(q.Type_question??"").toLowerCase();
  if(pool.length){if(isMultiQuestion(q)){const max=Math.min(pool.length,mode==="diversite"?Math.max(1,Math.ceil(pool.length/2)):3),n=intBetween(rng,1,max),copy=[...pool],out=[];while(out.length<n&&copy.length){const i=Math.floor(rng()*copy.length);out.push(copy.splice(i,1)[0].code)}return out}return pick(rng,pool)?.code??""}
  if(t.includes("nombre")||t.includes("numérique")||t.includes("numerique")||t.includes("montant")){const min=q.Valeur_min??(t.includes("montant")?50:0),max=q.Valeur_max??(t.includes("montant")?2500:100);return decimalBetween(rng,min,max,q.Nb_decimales)}
  if(t.includes("date")){const year=new Date().getFullYear()+1,month=intBetween(rng,1,12),day=intBetween(rng,1,28);return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`}
  if(t.includes("bool")||t.includes("oui/non"))return rng()>=0.5;
  return fakeText(q,rng,index)
}
export function conditionVisible(q,ctx,answers){const raw=codeOf(q.Condition_affichage_Code);if(!raw)return true;const condition=resolveRow(q.Condition_affichage_Code,ctx.conditions??[],"Condition_Code");if(!condition||condition.Active===false)return true;return evaluateCondition(condition,ctx.rules??[],answers)}
export function generateAnswers(questions,ctx,rng,index=1,mode="realiste"){
  const answers={};
  for(const q of sortByOrder((questions??[]).filter(q=>q.Active!==false&&!isTrue(q.Est_ligne_matrice)&&!isDisplayBlock(q)))){
    if(!conditionVisible(q,ctx,answers))continue;
    const optional=String(q.Mode_obligation??"").toLowerCase()!=="obligatoire";
    if(optional&&mode==="realiste"&&rng()<0.18)continue;
    answers[codeOf(q.Question_Code)]=matrixKind(q)?null:fakeSimpleValue(q,ctx,rng,index,mode);
  }
  return answers;
}
export function rootFicheTypes(types=[]){const active=types.filter(t=>t.Active!==false),ids=new Set(active.map(t=>String(t.id))),codes=new Set(active.map(t=>codeOf(t.TypeFiche_Code)));return sortByOrder(active.filter(t=>{const p=codeOf(t.Parent_Code);return !p||(!ids.has(p)&&!codes.has(p))}))}
export function childTypes(parent,types=[]){const pids=new Set([String(parent.id),codeOf(parent.TypeFiche_Code)]);return sortByOrder(types.filter(t=>t.Active!==false&&pids.has(codeOf(t.Parent_Code))))}
export function safeCountRange(type,defaultMax=3){const min=Math.max(0,Number(type.Minimum)||0),raw=type.Maximum,declared=(raw===null||raw===undefined||raw==="")?null:Number(raw);const hasRealMaximum=Number.isFinite(declared)&&declared>0;const max=hasRealMaximum?Math.max(min,declared):Math.max(min,defaultMax);return{min,max:Math.min(max,10)}}
