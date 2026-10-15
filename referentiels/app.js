import {rowsFromTable,codeOf,isTrue} from "../shared/grist-common.js";
import {readWorkbook,writeWorkbook} from "./xlsx-lite.js";
const $=s=>document.querySelector(s), esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const S={refs:[],values:[],questions:[],selected:null,preview:null,query:"",structures:[],structuresAvailable:false};
function status(msg,bad=false){$("#status").innerHTML=msg?`<div class="${bad?"error":"success"}">${esc(msg)}</div>`:""}
async function fetchRows(t){return rowsFromTable(await grist.docApi.fetchTable(t))}
async function load(){try{const [refs,values,questions]=await Promise.all([fetchRows("REFERENTIELS"),fetchRows("VALEURS_REFERENTIELS"),fetchRows("QUESTIONS")]);S.refs=refs;try{S.structures=await fetchRows("STRUCTURES");S.structuresAvailable=true}catch{S.structures=[];S.structuresAvailable=false}S.values=values;S.questions=questions;if(S.selected&&!refs.some(r=>String(r.id)===String(S.selected)))S.selected=null;render()}catch(e){status(`Chargement impossible : ${e?.message||e}`,true)}}
const source=r=>String(r?.Type_source||"VALEURS_REFERENTIELS").trim().toUpperCase();
const refValues=r=>S.values.filter(v=>String(codeOf(v.Referentiel_Code))===String(r.id));
function render(){renderList();renderContent()}
function renderList(){const host=$("#refs"),rows=[...S.refs].filter(r=>`${r.Nom||""} ${r.Referentiel_Code||""} ${source(r)}`.toLowerCase().includes(S.query.toLowerCase())).sort((a,b)=>Number(a.manualSort||0)-Number(b.manualSort||0));host.innerHTML=rows.map(r=>`<button class="ref-card ${String(r.id)===String(S.selected)?"active":""}" data-id="${r.id}"><strong>${esc(r.Nom||r.Referentiel_Code)}</strong><span class="ref-counts">${source(r)==="STRUCTURES"?catalogValues(r).filter(v=>isTrue(v.Actif)).length:refValues(r).filter(v=>isTrue(v.Actif)).length} valeurs actives · ${referentialUsages(r).length} usages</span><span>${esc(r.Referentiel_Code)} · ${isTrue(r.Hierarchique)?"Hiérarchique":"Simple"}${source(r)!=="VALEURS_REFERENTIELS"?` · Source ${esc(source(r))}`:""}</span></button>`).join("")||'<div class="muted">Aucun référentiel pour cette recherche.</div>';const count=$("#ref-count");if(count)count.textContent=`${rows.length} référentiel(s)`;host.querySelectorAll(".ref-card").forEach(b=>b.onclick=()=>{S.selected=Number(b.dataset.id);S.preview=null;render()})}
function valueTree(rows){const byId=new Map(rows.map(r=>[String(r.id),r]));const depth=r=>{let d=0,p=codeOf(r.Parent_Code),seen=new Set();while(p&&byId.has(String(p))&&!seen.has(String(p))){seen.add(String(p));d++;p=codeOf(byId.get(String(p)).Parent_Code)}return d};return [...rows].sort((a,b)=>Number(a.Ordre||0)-Number(b.Ordre||0)||Number(a.id)-Number(b.id)).map(r=>({...r,_depth:depth(r),_parent:byId.get(String(codeOf(r.Parent_Code)))?.Code||""}))}
// STRUCTURES uses Parent_Code (Ref:STRUCTURES) and Active, unlike managed values.
function catalogValues(r){return valueTree(source(r)==="STRUCTURES"?S.structures.map(v=>({...v,Code:v.Structure_Code||v.Code||v.id,Libelle:v.Nom||v.Libelle||v.Titre||v.Structure_Code,Actif:v.Active===undefined?(v.Actif===undefined?true:v.Actif):v.Active,Ordre:v.Ordre??v.manualSort??0})):refValues(r))}
function renderContent(){const host=$("#content"),r=S.refs.find(x=>String(x.id)===String(S.selected));if(!r){host.className="empty-state";host.innerHTML="Sélectionnez un référentiel ou créez-en un.";return}host.className="";const vals=catalogValues(r),managed=source(r)==="VALEURS_REFERENTIELS";host.innerHTML=`<div class="head"><div><h2>${esc(r.Nom||r.Referentiel_Code)}</h2><div class="meta">${esc(r.Referentiel_Code)} · ${isTrue(r.Hierarchique)?"Hiérarchique":"Simple"} · ${vals.length} valeur${vals.length>1?"s":""} · ${vals.filter(v=>isTrue(v.Actif)).length} actives · ${referentialUsages(r).length} question(s) utilisatrice(s)</div><div class="badges"><span class="badge">Source : ${esc(source(r))}</span><span class="badge">${isTrue(r.Actif)?"Actif":"Inactif"}</span></div>${r.Description?`<p>${esc(r.Description)}</p>`:""}</div><div class="actions"><button class="btn" id="edit-ref">Modifier</button><button class="btn" id="download-model">Télécharger le modèle</button><button class="btn" id="export-ref">Exporter</button><button class="btn danger" id="delete-ref">Supprimer le référentiel</button></div></div>${managed?importHtml(r):`<div class="preview bad">Ce référentiel utilise la source <strong>${esc(source(r))}</strong>. Consultation en lecture seule : les modifications se font dans la table source du document Grist.${source(r)==="STRUCTURES"&&!S.structuresAvailable?" La source STRUCTURES est indisponible ou inaccessible avec vos droits.":""}</div>`}<div class="values-head"><h3>Valeurs actuelles</h3>${managed?'<button class="btn btn-primary" id="add-value">+ Ajouter une valeur</button>':""}</div><div class="table-wrap"><table><thead><tr><th>Code</th><th>Libellé</th>${isTrue(r.Hierarchique)?"<th>Parent</th><th>Niveau</th>":""}<th>Ordre</th><th>Actif</th>${managed?"<th>Actions</th>":""}</tr></thead><tbody>${vals.map(v=>`<tr><td>${`<span class="indent" style="width:${v._depth*14}px"></span>`}${esc(v.Code)}</td><td>${esc(v.Libelle)}</td>${isTrue(r.Hierarchique)?`<td>${esc(v._parent)}</td><td>${esc(v.Niveau??v._depth)}</td>`:""}<td>${esc(v.Ordre)}</td><td>${isTrue(v.Actif)?"Oui":"Non"}</td>${managed?`<td class="row-actions"><button class="mini-btn" data-edit-value="${v.id}">Modifier</button><button class="mini-btn danger" data-delete-value="${v.id}">Supprimer</button></td>`:""}</tr>`).join("")||`<tr><td colspan="${isTrue(r.Hierarchique)?7:5}" class="muted">Aucune valeur.</td></tr>`}</tbody></table></div>`;$("#edit-ref").onclick=()=>openRef(r);$("#download-model").onclick=()=>downloadModel(r);$("#export-ref").onclick=()=>exportRef(r);$("#delete-ref").onclick=()=>deleteReferential(r);if(managed){bindImport(r);$("#add-value").onclick=()=>openValue(r);host.querySelectorAll("[data-edit-value]").forEach(b=>b.onclick=()=>openValue(r,S.values.find(v=>String(v.id)===String(b.dataset.editValue))));host.querySelectorAll("[data-delete-value]").forEach(b=>b.onclick=()=>deleteValue(r,S.values.find(v=>String(v.id)===String(b.dataset.deleteValue))))}}
function importHtml(r){return `<details class="import-box" ${S.preview?"open":""}><summary><strong>Importer des valeurs</strong><span>Fichier → Analyse → Différences → Validation</span></summary><div class="import-intro">Préparez votre fichier à partir du modèle, puis vérifiez les différences avant de les appliquer.</div><div class="import-grid"><label class="file-field">Fichier Excel ou CSV<input id="import-file" type="file" accept=".xlsx,.csv"></label><label>Mode<select id="import-mode"><option value="update">Mettre à jour + ajouter</option><option value="add">Ajouter uniquement</option><option value="sync">Synchroniser avec le fichier</option></select></label><button id="analyze-import" class="btn">Analyser</button></div><div class="hint">Colonnes attendues : <strong>Code, Libelle, Ordre, Actif</strong>${isTrue(r.Hierarchique)?" et <strong>Parent_Code</strong>":""}. En mode Synchroniser, les codes absents du fichier seront supprimés après confirmation.</div><div id="import-preview">${S.preview?previewHtml(S.preview):""}</div></details>`}
function previewHtml(p){return `<div class="preview ${p.errors.length?"bad":"ok"}"><strong>${p.rows.length} ligne${p.rows.length>1?"s":""} détectée${p.rows.length>1?"s":""}</strong> · ${p.newCount} nouvelle${p.newCount>1?"s":""} · ${p.mode==="add"?0:p.updateCount} mises à jour${p.mode==="add"?` · ${p.updateCount} existantes ignorées`:""}${p.removeCount?` · ${p.removeCount} absente${p.removeCount>1?"s":""} du fichier`:""}${p.errors.length?`<div class="danger">${p.errors.map(esc).join("<br>")}</div>`:`<div>Aucune anomalie détectée. ${p.mode==="add"?"Les valeurs existantes restent inchangées.":"Les lignes existantes seront mises à jour."}</div><details class="import-lines"><summary>Voir les lignes analysées</summary><table><thead><tr><th>Action</th><th>Ligne</th><th>Code</th><th>Libellé</th><th>Parent</th></tr></thead><tbody>${p.rows.map(x=>`<tr><td>${esc(x._action||"Analyse")}</td><td>${x.line}</td><td>${esc(x.Code)}</td><td>${esc(x.Libelle)}</td><td>${esc(x.Parent_Code)}</td></tr>`).join("")}${(p.removed||[]).map(x=>`<tr><td>Suppression (absente du fichier)</td><td>—</td><td>${esc(x.Code)}</td><td>${esc(x.Libelle)}</td><td>—</td></tr>`).join("")}</tbody></table></details><button id="run-import" class="btn btn-primary" style="margin-top:8px">Importer maintenant</button>`}</div>`}
function openRef(r=null){const f=$("#ref-form");f.reset();f.elements.id.value=r?.id||"";f.elements.name.value=r?.Nom||"";f.elements.code.value=r?.Referentiel_Code||"";f.elements.description.value=r?.Description||"";f.elements.hierarchical.value=isTrue(r?.Hierarchique)?"1":"0";f.elements.active.checked=r?isTrue(r.Actif):true;$("#ref-dialog-title").textContent=r?"Modifier le référentiel":"Nouveau référentiel";$("#ref-dialog").showModal()}
function normalizeCode(v){return String(v??"").trim()}
function boolVal(v,def=true){const s=String(v??"").trim().toLowerCase();if(v===""||v==null)return def;return !["0","non","false","faux","n"].includes(s)}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
function modelRows(r){const head=isTrue(r.Hierarchique)?["Code","Libelle","Parent_Code","Ordre","Actif"]:["Code","Libelle","Ordre","Actif"];const ex=isTrue(r.Hierarchique)?[["DIRECTION_A","Direction A","",1,"Oui"],["BUREAU_A1","Bureau A1","DIRECTION_A",2,"Oui"]]:[["A","Première valeur",1,"Oui"],["B","Deuxième valeur",2,"Oui"]];return [head,...ex]}
function downloadModel(r){downloadBlob(writeWorkbook([{name:"Valeurs",rows:modelRows(r)}]),`modele_referentiel_${r.Referentiel_Code}.xlsx`)}
function exportRef(r){const rows=catalogValues(r),head=isTrue(r.Hierarchique)?["Code","Libelle","Parent_Code","Ordre","Actif"]:["Code","Libelle","Ordre","Actif"],data=rows.map(v=>isTrue(r.Hierarchique)?[v.Code,v.Libelle,v._parent,v.Ordre,isTrue(v.Actif)?"Oui":"Non"]:[v.Code,v.Libelle,v.Ordre,isTrue(v.Actif)?"Oui":"Non"]);downloadBlob(writeWorkbook([{name:"Valeurs",rows:[head,...data]}]),`referentiel_${r.Referentiel_Code}.xlsx`)}
async function parseImport(file,r,mode){const wb=await readWorkbook(file),sheet=wb.sheets[0],rows=sheet?.rows||[];if(rows.length<2)throw new Error("Le fichier ne contient aucune donnée.");const headers=rows[0].map(x=>String(x??"").trim()),idx=n=>headers.findIndex(h=>h.toLowerCase()===n.toLowerCase()),need=["Code","Libelle"],errors=[];for(const n of need)if(idx(n)<0)errors.push(`Colonne obligatoire manquante : ${n}.`);if(isTrue(r.Hierarchique)&&idx("Parent_Code")<0)errors.push("Colonne obligatoire manquante : Parent_Code.");const data=rows.slice(1).filter(a=>a.some(x=>String(x??"").trim()!=="")).map((a,i)=>({line:i+2,Code:normalizeCode(a[idx("Code")]),Libelle:String(a[idx("Libelle")]??"").trim(),Parent_Code:idx("Parent_Code")>=0?normalizeCode(a[idx("Parent_Code")]):"",Ordre:idx("Ordre")>=0&&String(a[idx("Ordre")]??"").trim()!==""?Number(a[idx("Ordre")]):i+1,Actif:idx("Actif")>=0?boolVal(a[idx("Actif")],true):true}));const seen=new Set();for(const x of data){if(!x.Code)errors.push(`Ligne ${x.line} : Code vide.`);else if(seen.has(x.Code))errors.push(`Code en double dans le fichier : ${x.Code}.`);seen.add(x.Code);if(!x.Libelle)errors.push(`Ligne ${x.line} (${x.Code||"?"}) : Libelle vide.`);if(!Number.isFinite(x.Ordre))errors.push(`Ligne ${x.line} (${x.Code||"?"}) : Ordre invalide.`)}if(isTrue(r.Hierarchique))errors.push(...hierarchyPlan(r,data,mode).errors);const current=refValues(r),byCode=new Map(current.map(v=>[normalizeCode(v.Code),v])),newCount=data.filter(x=>!byCode.has(x.Code)).length,updateCount=data.length-newCount,removeCount=mode==="sync"?current.filter(v=>!seen.has(normalizeCode(v.Code))).length:0;for(const x of data)x._action=byCode.has(x.Code)?(mode==="add"?"Ignorée (existante)":"Mise à jour"):"Ajout";return{removed:mode==="sync"?current.filter(v=>!seen.has(normalizeCode(v.Code))):[],rows:data,errors:[...new Set(errors)],newCount,updateCount,removeCount,mode}}
function bindImport(r){$("#import-mode").onchange=()=>{S.preview=null;$("#import-preview").innerHTML="Mode modifié : relancez l’analyse avant validation."};$("#import-file").onchange=()=>{S.preview=null;$("#import-preview").innerHTML="Fichier sélectionné : cliquez sur Analyser."};$("#analyze-import").onclick=async()=>{const file=$("#import-file").files[0];if(!file){status("Choisissez d’abord un fichier.",true);return}try{S.preview=await parseImport(file,r,$("#import-mode").value);$("#import-preview").innerHTML=previewHtml(S.preview);const b=$("#run-import");if(b)b.onclick=()=>runImport(r,S.preview)}catch(e){status(`Analyse impossible : ${e?.message||e}`,true)}}}
function stableValueCode(r,code,used){const base=`VR_${String(r.Referentiel_Code||"REF").replace(/[^A-Za-z0-9]+/g,"_")}_${String(code).replace(/[^A-Za-z0-9]+/g,"_")}`.slice(0,90);let x=base,n=2;while(used.has(x))x=`${base}_${n++}`;used.add(x);return x}
function computeLevels(rows){const by=new Map(rows.map(x=>[x.Code,x])),memo=new Map();const lev=x=>{if(memo.has(x.Code))return memo.get(x.Code);const n=x.Parent_Code&&by.has(x.Parent_Code)?lev(by.get(x.Parent_Code))+1:0;memo.set(x.Code,n);return n};rows.forEach(lev);return memo}
function hierarchyPlan(r,rows,mode){
  const current=refValues(r),byId=new Map(current.map(v=>[String(v.id),v])),oldByCode=new Map(current.map(v=>[normalizeCode(v.Code),v]));
  const final=new Map(mode==="sync"?[]:current.map(v=>[normalizeCode(v.Code),{Code:normalizeCode(v.Code),Parent_Code:normalizeCode(byId.get(String(codeOf(v.Parent_Code)))?.Code)||"",_missingParent:!!codeOf(v.Parent_Code)&&!byId.has(String(codeOf(v.Parent_Code)))}]));
  for(const x of rows)if(mode!=="add"||!oldByCode.has(x.Code))final.set(x.Code,x);
  const errors=[],visiting=new Set(),levels=new Map();
  function visit(x){if(levels.has(x.Code))return levels.get(x.Code);if(visiting.has(x.Code)){errors.push(`Hiérarchie circulaire détectée autour de ${x.Code}.`);return 0}visiting.add(x.Code);let n=0;if(x._missingParent)errors.push(`Parent introuvable pour ${x.Code}.`);if(x.Parent_Code){const parent=final.get(x.Parent_Code);if(!parent)errors.push(`Parent ${x.Parent_Code} de ${x.Code} absent de la hiérarchie finale.`);else n=visit(parent)+1}visiting.delete(x.Code);levels.set(x.Code,n);return n}
  if(isTrue(r.Hierarchique))for(const x of final.values())visit(x);else for(const x of final.values())levels.set(x.Code,0);
  return {rows:[...final.values()],levels,errors:[...new Set(errors)]};
}
async function assertValuesUnused(values){
  if(!values.length)return;
  const [answers,selections]=await Promise.all([fetchRows("VALEURS_REPONSE"),fetchRows("SELECTIONS_REPONSE")]);
  const used=values.filter(v=>{const keys=new Set([String(v.id),String(codeOf(v.ValeurRef_Code)||"")].filter(Boolean));return answers.some(a=>keys.has(String(codeOf(a.Valeur_reference_Code))))||selections.some(a=>keys.has(String(codeOf(a.ValeurRef_Code))))});
  if(used.length)throw new Error(`Valeur(s) utilisée(s) dans des réponses : ${used.map(v=>v.Code).join(", ")}. Conservez-les et désactivez-les (Actif = Non) pour préserver les réponses.`);
}
async function runImport(r,p){
  if(p.errors.length)return;const msg=p.mode==="sync"?`Synchroniser ce référentiel ? ${p.removeCount} valeur(s) absente(s) du fichier seront supprimées.`:`Importer ${p.rows.length} valeur(s) ?`;if(!confirm(msg))return;
  try{
    S.values=await fetchRows("VALEURS_REFERENTIELS");
    const current=refValues(r),byCode=new Map(current.map(v=>[normalizeCode(v.Code),v])),plan=hierarchyPlan(r,p.rows,p.mode);
    if(plan.errors.length)throw new Error(plan.errors.join(" "));
    const keep=new Set(p.rows.map(x=>x.Code)),removed=p.mode==="sync"?current.filter(v=>!keep.has(normalizeCode(v.Code))):[];
    await assertValuesUnused(removed);
    const used=new Set(S.values.map(v=>String(v.ValeurRef_Code||""))),actions=[];
    for(const x of p.rows){const old=byCode.get(x.Code);if(old&&p.mode==="add")continue;const fields={Code:x.Code,Libelle:x.Libelle,Ordre:x.Ordre,Actif:x.Actif,Niveau:plan.levels.get(x.Code)||0};if(old)actions.push(["UpdateRecord","VALEURS_REFERENTIELS",Number(old.id),fields]);else actions.push(["AddRecord","VALEURS_REFERENTIELS",null,{ValeurRef_Code:stableValueCode(r,x.Code,used),Referentiel_Code:Number(r.id),...fields}])}
    for(const old of removed)actions.push(["RemoveRecord","VALEURS_REFERENTIELS",Number(old.id)]);
    if(actions.length)await grist.docApi.applyUserActions(actions);
    S.values=await fetchRows("VALEURS_REFERENTIELS");
    const freshByCode=new Map(refValues(r).map(v=>[normalizeCode(v.Code),v])),importCodes=new Set(p.rows.filter(x=>p.mode!=="add"||!byCode.has(x.Code)).map(x=>x.Code)),parentActions=[];
    for(const x of plan.rows){const row=freshByCode.get(x.Code);if(!row)continue;const fields={};if(importCodes.has(x.Code)){fields.Parent_Code=x.Parent_Code?Number(freshByCode.get(x.Parent_Code).id):null;fields.Niveau=plan.levels.get(x.Code)||0}else if(p.mode!=="add"&&Number(row.Niveau)!==plan.levels.get(x.Code))fields.Niveau=plan.levels.get(x.Code)||0;if(Object.keys(fields).length)parentActions.push(["UpdateRecord","VALEURS_REFERENTIELS",Number(row.id),fields])}
    if(parentActions.length)await grist.docApi.applyUserActions(parentActions);S.preview=null;await load();status(`Import terminé : ${p.rows.length} ligne(s) traitée(s).`);
  }catch(e){status(`Import impossible : ${e?.message||e}`,true)}
}



function openValue(r,v=null){
  const d=$("#value-dialog"),f=$("#value-form"),vals=valueTree(refValues(r));
  f.elements.id.value=v?.id||"";f.elements.ref_id.value=r.id;f.elements.code.value=v?.Code||"";f.elements.label.value=v?.Libelle||"";f.elements.order.value=v?.Ordre??(vals.length+1);f.elements.active.checked=v?isTrue(v.Actif):true;
  $("#value-dialog-title").textContent=v?"Modifier la valeur":"Ajouter une valeur";
  const pf=$("#parent-field"),sel=f.elements.parent;pf.style.display=isTrue(r.Hierarchique)?"":"none";
  sel.innerHTML='<option value="">Aucun parent</option>'+vals.filter(x=>!v||String(x.id)!==String(v.id)).map(x=>`<option value="${x.id}">${esc(x.Code)} — ${esc(x.Libelle)}</option>`).join("");
  sel.value=String(codeOf(v?.Parent_Code)||"");let impact=$("#descendant-impact");if(!impact){impact=document.createElement("p");impact.id="descendant-impact";pf.appendChild(impact)}impact.textContent=v?`${valueDescendants(r,v.id).size} descendant(s) dans cette branche. Le parent choisi doit préserver une hiérarchie sans boucle.`:"Choisissez un parent existant pour ajouter une branche.";d.showModal();
}
function valueDescendants(r,id){
  const vals=refValues(r),out=new Set(),walk=x=>{for(const v of vals)if(String(codeOf(v.Parent_Code))===String(x)&&!out.has(String(v.id))){out.add(String(v.id));walk(v.id)}};walk(id);return out;
}
async function saveValue(e){
  e.preventDefault();const f=e.currentTarget,fd=new FormData(f),r=S.refs.find(x=>String(x.id)===String(fd.get("ref_id")));if(!r)return;
  const id=String(fd.get("id")||""),code=normalizeCode(fd.get("code")),label=String(fd.get("label")||"").trim(),parentId=String(fd.get("parent")||""),order=Number(fd.get("order")||0);
  if(!code||!label){status("Le code et le libellé sont obligatoires.",true);return}
  const duplicate=refValues(r).find(v=>normalizeCode(v.Code)===code&&String(v.id)!==id);if(duplicate){status(`Le code ${code} existe déjà dans ce référentiel.`,true);return}
  if(id&&parentId){const descendants=valueDescendants(r,id);if(parentId===id||descendants.has(parentId)){status("Ce parent créerait une boucle dans la hiérarchie.",true);return}}
  let level=0;if(parentId){let cur=refValues(r).find(v=>String(v.id)===parentId),seen=new Set();while(cur&&!seen.has(String(cur.id))){seen.add(String(cur.id));level++;const p=codeOf(cur.Parent_Code);cur=p?refValues(r).find(v=>String(v.id)===String(p)):null}}
  const vals={Code:code,Libelle:label,Parent_Code:parentId?Number(parentId):null,Ordre:Number.isFinite(order)?order:0,Actif:fd.get("active")==="on",Niveau:level};
  try{
    if(id)await grist.docApi.applyUserActions([["UpdateRecord","VALEURS_REFERENTIELS",Number(id),vals]]);
    else{const used=new Set(S.values.map(v=>String(v.ValeurRef_Code||"")));await grist.docApi.applyUserActions([["AddRecord","VALEURS_REFERENTIELS",null,{ValeurRef_Code:stableValueCode(r,code,used),Referentiel_Code:Number(r.id),...vals}]])}
    $("#value-dialog").close();await load();status(id?"Valeur modifiée.":"Valeur ajoutée.");
  }catch(err){status(`Enregistrement impossible : ${err?.message||err}`,true)}
}
async function deleteValue(r,v){
  if(!v)return;if(!confirm(`Supprimer la valeur « ${v.Code} — ${v.Libelle} » ?`))return;
  try{S.values=await fetchRows("VALEURS_REFERENTIELS");const children=refValues(r).filter(x=>String(codeOf(x.Parent_Code))===String(v.id));if(children.length)throw new Error(`${children.length} valeur(s) ont « ${v.Code} » comme parent. Modifiez ou supprimez d’abord ces valeurs.`);await assertValuesUnused([v]);await grist.docApi.applyUserActions([["RemoveRecord","VALEURS_REFERENTIELS",Number(v.id)]]);await load();status(`Valeur ${v.Code} supprimée.`)}catch(e){status(`Suppression impossible : ${e?.message||e}`,true)}
}

function questionUsesReferential(q,r){
  const raw=codeOf(q?.Referentiel_Code);
  if(raw===null||raw===undefined||String(raw)==="")return false;
  return String(raw)===String(r.id)||String(raw)===String(codeOf(r.Referentiel_Code));
}
function referentialUsages(r){return (S.questions||[]).filter(q=>questionUsesReferential(q,r))}
async function deleteReferential(r){
  const code=String(codeOf(r.Referentiel_Code)||"");
  if(code==="REF_STRUCTURES"||source(r)==="STRUCTURES"){
    status("Ce référentiel est lié à STRUCTURES et ne peut pas être supprimé depuis ce widget.",true);return;
  }
  try{S.questions=await fetchRows("QUESTIONS");S.values=await fetchRows("VALEURS_REFERENTIELS")}catch(e){status(`Suppression impossible : ${e?.message||e}`,true);return}
  const uses=referentialUsages(r);
  if(uses.length){
    const labels=uses.slice(0,8).map(q=>String(q.Libelle||q.Question||q.Variable||q.Question_Code||`Question ${q.id}`));
    const more=uses.length>8?` (+${uses.length-8} autre(s))`:"";
    status(`Suppression impossible : ce référentiel est utilisé par ${uses.length} question(s) : ${labels.join(" ; ")}${more}.`,true);return;
  }
  const vals=refValues(r);
  const typed=prompt(`Suppression définitive du référentiel « ${r.Nom||code} » et de ses ${vals.length} valeur(s).\n\nPour confirmer, saisissez exactement : ${code}`);
  if(typed===null)return;
  if(String(typed).trim()!==code){status("Suppression annulée : le code saisi ne correspond pas.",true);return;}
  try{
    S.questions=await fetchRows("QUESTIONS");S.values=await fetchRows("VALEURS_REFERENTIELS");if(referentialUsages(r).length)throw new Error("Ce référentiel est utilisé par des questions.");const freshValues=refValues(r);await assertValuesUnused(freshValues);
    const actions=freshValues.map(v=>["RemoveRecord","VALEURS_REFERENTIELS",Number(v.id)]);
    actions.push(["RemoveRecord","REFERENTIELS",Number(r.id)]);
    await grist.docApi.applyUserActions(actions);
    S.selected=null;S.preview=null;await load();status(`Référentiel ${code} supprimé.`);
  }catch(e){status(`Suppression impossible : ${e?.message||e}`,true)}
}
$("#new-ref").onclick=()=>openRef();$("#refresh").onclick=load;$("#close-ref").onclick=$("#cancel-ref").onclick=()=>$("#ref-dialog").close();
$("#ref-form").onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,fd=new FormData(f),id=fd.get("id"),code=normalizeCode(fd.get("code")),name=String(fd.get("name")||"").trim();if(!code||!name)return;const duplicate=S.refs.find(r=>String(r.Referentiel_Code)===code&&String(r.id)!==String(id));if(duplicate){status(`Le code ${code} existe déjà.`,true);return}const existing=id?S.refs.find(r=>String(r.id)===String(id)):null;const vals={Referentiel_Code:code,Nom:name,Description:String(fd.get("description")||"").trim(),Hierarchique:fd.get("hierarchical")==="1",Actif:fd.get("active")==="on",Type_source:existing?String(existing.Type_source||"VALEURS_REFERENTIELS"):"VALEURS_REFERENTIELS"};try{if(id)await grist.docApi.applyUserActions([["UpdateRecord","REFERENTIELS",Number(id),vals]]);else await grist.docApi.applyUserActions([["AddRecord","REFERENTIELS",null,vals]]);$("#ref-dialog").close();await load();if(!id){const nr=S.refs.find(r=>String(r.Referentiel_Code)===code);if(nr)S.selected=nr.id;render()}status(id?"Référentiel modifié.":"Référentiel créé.")}catch(err){status(`Enregistrement impossible : ${err?.message||err}`,true)}};
$("#close-value").onclick=$("#cancel-value").onclick=()=>$("#value-dialog").close();
$("#value-form").onsubmit=saveValue;
grist.ready({requiredAccess:"full"});load();

const catalogSearch=$("#ref-search");if(catalogSearch)catalogSearch.oninput=e=>{S.query=e.target.value;renderList()};
