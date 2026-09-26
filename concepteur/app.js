import {rowsFromTable, sortByOrder, codeOf} from "../shared/grist-common.js";

const TABLES=["QUESTIONNAIRES","VERSIONS_QUESTIONNAIRES","PAGES","SECTIONS","QUESTIONS","TYPES_FICHES"];
const state={data:{},questionnaire:null,version:null,selected:null};

function active(r){return r.Active===undefined||r.Active===null||r.Active===""||r.Active===true||r.Active===1||String(r.Active).toLowerCase()==="true";}
function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function first(r,names,fallback=""){for(const n of names)if(r?.[n]!=null&&r[n]!=="")return r[n];return fallback;}
function refCode(v,rows,col){const raw=codeOf(v);if(!raw)return "";const row=(rows||[]).find(r=>String(r.id)===String(raw));return row?codeOf(row[col]):raw;}
function label(row,type){
 if(type==="questionnaire")return first(row,["Nom","Titre","Questionnaire_Code"],codeOf(row.Questionnaire_Code));
 if(type==="version")return first(row,["Nom","Libelle","Titre","Version_Code"],codeOf(row.Version_Code));
 if(type==="page")return first(row,["Titre","Nom","Libelle","Page_Code"],codeOf(row.Page_Code));
 if(type==="section")return first(row,["Titre","Nom","Libelle","Section_Code"],codeOf(row.Section_Code));
 if(type==="fiche")return first(row,["Libelle_singulier","Libelle","Nom","TypeFiche_Code"],codeOf(row.TypeFiche_Code));
 return first(row,["Libelle","Libellé","Question","Titre","Question_Code"],codeOf(row.Question_Code));
}
async function load(){for(const t of TABLES)state.data[t]=rowsFromTable(await grist.docApi.fetchTable(t));renderSelectors();}
function questionnaireForVersion(v){return refCode(v.Questionnaire_Code,state.data.QUESTIONNAIRES,"Questionnaire_Code");}
function versionRows(){return state.data.VERSIONS_QUESTIONNAIRES.filter(v=>!state.questionnaire||questionnaireForVersion(v)===state.questionnaire);}
function renderSelectors(){
 const qs=state.data.QUESTIONNAIRES;if(!state.questionnaire)state.questionnaire=codeOf(qs[0]?.Questionnaire_Code);
 const qsel=document.querySelector("#questionnaire-select");
 qsel.innerHTML=qs.map(q=>`<option value="${esc(codeOf(q.Questionnaire_Code))}" ${codeOf(q.Questionnaire_Code)===state.questionnaire?"selected":""}>${esc(label(q,"questionnaire"))}</option>`).join("");
 const versions=versionRows();if(!versions.some(v=>codeOf(v.Version_Code)===state.version))state.version=codeOf(versions[0]?.Version_Code);
 document.querySelector("#version-select").innerHTML=versions.map(v=>`<option value="${esc(codeOf(v.Version_Code))}" ${codeOf(v.Version_Code)===state.version?"selected":""}>${esc(label(v,"version"))}</option>`).join("");
 renderTree();
}
function versionMatch(row){return !("Version_Code" in row)||refCode(row.Version_Code,state.data.VERSIONS_QUESTIONNAIRES,"Version_Code")===state.version;}
function item(type,row,text,cls){const selected=state.selected?.type===type&&String(state.selected?.row?.id)===String(row.id);return `<button class="tree-item ${cls} ${selected?"selected":""}" data-type="${type}" data-id="${row.id}">${esc(text)}${type==="fiche"?'<span class="badge">Fiche</span>':""}</button>`;}
function renderTree(){
 const pages=sortByOrder(state.data.PAGES.filter(r=>active(r)&&versionMatch(r)));
 const sections=sortByOrder(state.data.SECTIONS.filter(r=>active(r)&&versionMatch(r)));
 const questions=sortByOrder(state.data.QUESTIONS.filter(r=>active(r)&&versionMatch(r)));
 const fiches=sortByOrder(state.data.TYPES_FICHES.filter(r=>active(r)&&versionMatch(r)));
 let html="";
 for(const p of pages){
  const pc=codeOf(p.Page_Code);html+=item("page",p,label(p,"page"),"tree-page");
  for(const s of sections.filter(s=>refCode(s.Page_Code,state.data.PAGES,"Page_Code")===pc)){
   const sc=codeOf(s.Section_Code);html+=item("section",s,label(s,"section"),"tree-section");
   const sq=questions.filter(q=>refCode(q.Section_Code,state.data.SECTIONS,"Section_Code")===sc);
   for(const q of sq.filter(q=>!refCode(q.TypeFiche_Code,fiches,"TypeFiche_Code")))html+=item("question",q,label(q,"question"),"tree-question");
   const typeCodes=new Set(sq.map(q=>refCode(q.TypeFiche_Code,fiches,"TypeFiche_Code")).filter(Boolean));
   for(const f of fiches.filter(f=>typeCodes.has(codeOf(f.TypeFiche_Code))))html+=item("fiche",f,label(f,"fiche"),"tree-fiche");
  }
 }
 document.querySelector("#tree").innerHTML=html||'<div class="empty-state">Aucune page dans cette version.</div>';
 document.querySelectorAll(".tree-item").forEach(b=>b.onclick=()=>selectItem(b.dataset.type,b.dataset.id));
}
function rowsFor(type){return {page:state.data.PAGES,section:state.data.SECTIONS,question:state.data.QUESTIONS,fiche:state.data.TYPES_FICHES}[type]||[];}
function selectItem(type,id){const row=rowsFor(type).find(r=>String(r.id)===String(id));if(!row)return;state.selected={type,row};renderTree();renderSelection();}
function renderSelection(){
 const {type,row}=state.selected,title=label(row,type);
 document.querySelector("#canvas").innerHTML=`<div class="preview-card"><span class="badge">${esc(type)}</span><h2>${esc(title)}</h2><p>Cette première version du Concepteur est en lecture seule. Elle permet de vérifier la structure avant d’activer l’édition.</p></div>`;
 const ignored=new Set(["id","manualSort"]);
 const props=Object.entries(row).filter(([k,v])=>!ignored.has(k)&&v!==null&&v!=="").map(([k,v])=>`<div class="property"><div class="property-name">${esc(k)}</div><div class="property-value">${esc(Array.isArray(v)?v.join(", "):v)}</div></div>`).join("");
 document.querySelector("#properties").innerHTML=`<div class="property-grid">${props||"Aucune propriété renseignée."}</div>`;
}
function clearSelection(){document.querySelector("#canvas").innerHTML='<div class="empty-state">Sélectionnez un élément dans l’arborescence.</div>';document.querySelector("#properties").innerHTML='<div class="empty-state">Aucun élément sélectionné.</div>';}
function bind(){
 document.querySelector("#questionnaire-select").onchange=e=>{state.questionnaire=e.target.value;state.version=null;state.selected=null;renderSelectors();clearSelection();};
 document.querySelector("#version-select").onchange=e=>{state.version=e.target.value;state.selected=null;renderTree();clearSelection();};
}
async function start(){try{grist.ready({requiredAccess:"read table"});await load();bind();document.querySelector("#status").innerHTML="";}catch(e){document.querySelector("#status").innerHTML=`<div class="status-error">Impossible de charger le Concepteur : ${esc(e?.message||e)}</div>`;}}
start();
