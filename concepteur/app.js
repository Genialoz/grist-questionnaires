import {rowsFromTable,sortByOrder,codeOf} from "../shared/grist-common.js";
const TABLES=["QUESTIONNAIRES","VERSIONS_QUESTIONNAIRES","PAGES","SECTIONS","QUESTIONS","TYPES_FICHES"];
const S={data:{},questionnaire:null,version:null,selected:null};
const $=s=>document.querySelector(s);
function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function active(r){return r.Active===undefined||r.Active===null||r.Active===""||r.Active===true||r.Active===1||String(r.Active).toLowerCase()==="true";}
function first(r,n,f=""){for(const k of n)if(r?.[k]!=null&&r[k]!=="")return r[k];return f}
function ref(v,rows,col){const x=codeOf(v);if(!x)return "";const r=(rows||[]).find(a=>String(a.id)===String(x));return r?codeOf(r[col]):x}
function field(row,candidates){return candidates.find(k=>Object.prototype.hasOwnProperty.call(row||{},k))||null}
function label(r,t){if(t==="page")return first(r,["Titre","Nom","Libelle","Page_Code"],codeOf(r.Page_Code));if(t==="section")return first(r,["Titre","Nom","Libelle","Section_Code"],codeOf(r.Section_Code));if(t==="fiche")return first(r,["Libelle_singulier","Libelle","Nom","TypeFiche_Code"],codeOf(r.TypeFiche_Code));if(t==="question")return first(r,["Libelle","Libellé","Question","Titre","Question_Code"],codeOf(r.Question_Code));if(t==="questionnaire")return first(r,["Nom","Titre","Questionnaire_Code"],codeOf(r.Questionnaire_Code));return first(r,["Nom","Libelle","Titre","Version_Code"],codeOf(r.Version_Code))}
async function reload(){for(const t of TABLES)S.data[t]=rowsFromTable(await grist.docApi.fetchTable(t));renderSelectors()}
function qForV(v){return ref(v.Questionnaire_Code,S.data.QUESTIONNAIRES,"Questionnaire_Code")}
function versions(){return S.data.VERSIONS_QUESTIONNAIRES.filter(v=>!S.questionnaire||qForV(v)===S.questionnaire)}
function renderSelectors(){const qs=S.data.QUESTIONNAIRES;if(!S.questionnaire)S.questionnaire=codeOf(qs[0]?.Questionnaire_Code);$("#questionnaire-select").innerHTML=qs.map(q=>`<option value="${esc(codeOf(q.Questionnaire_Code))}" ${codeOf(q.Questionnaire_Code)===S.questionnaire?"selected":""}>${esc(label(q,"questionnaire"))}</option>`).join("");const vs=versions();if(!vs.some(v=>codeOf(v.Version_Code)===S.version))S.version=codeOf(vs[0]?.Version_Code);$("#version-select").innerHTML=vs.map(v=>`<option value="${esc(codeOf(v.Version_Code))}" ${codeOf(v.Version_Code)===S.version?"selected":""}>${esc(label(v,"version"))}</option>`).join("");renderTree()}
function vm(r){return !("Version_Code" in r)||ref(r.Version_Code,S.data.VERSIONS_QUESTIONNAIRES,"Version_Code")===S.version}
function item(t,r,txt,cls){const on=S.selected?.type===t&&String(S.selected.row.id)===String(r.id);return `<button class="tree-item ${cls} ${on?"selected":""}" data-type="${t}" data-id="${r.id}">${esc(txt)}${t==="fiche"?'<span class="badge">Fiche</span>':""}</button>`}
function current(){return {pages:sortByOrder(S.data.PAGES.filter(r=>active(r)&&vm(r))),sections:sortByOrder(S.data.SECTIONS.filter(r=>active(r)&&vm(r))),questions:sortByOrder(S.data.QUESTIONS.filter(r=>active(r)&&vm(r))),fiches:sortByOrder(S.data.TYPES_FICHES.filter(r=>active(r)&&vm(r)))}}
function renderTree(){const {pages,sections,questions,fiches}=current();let h="";for(const p of pages){const pc=codeOf(p.Page_Code);h+=item("page",p,label(p,"page"),"tree-page");for(const s of sections.filter(x=>ref(x.Page_Code,S.data.PAGES,"Page_Code")===pc)){const sc=codeOf(s.Section_Code);h+=item("section",s,label(s,"section"),"tree-section");const sq=questions.filter(q=>ref(q.Section_Code,S.data.SECTIONS,"Section_Code")===sc);for(const q of sq.filter(q=>!ref(q.TypeFiche_Code,fiches,"TypeFiche_Code")))h+=item("question",q,label(q,"question"),"tree-question");const ft=new Set(sq.map(q=>ref(q.TypeFiche_Code,fiches,"TypeFiche_Code")).filter(Boolean));for(const f of fiches.filter(f=>ft.has(codeOf(f.TypeFiche_Code))))h+=item("fiche",f,label(f,"fiche"),"tree-fiche")}}$("#tree").innerHTML=h||'<div class="empty-state">Aucune page.</div>';document.querySelectorAll(".tree-item").forEach(b=>b.onclick=()=>select(b.dataset.type,b.dataset.id))}
function rows(t){return {page:S.data.PAGES,section:S.data.SECTIONS,question:S.data.QUESTIONS,fiche:S.data.TYPES_FICHES}[t]||[]}
function select(t,id){const r=rows(t).find(x=>String(x.id)===String(id));if(!r)return;S.selected={type:t,row:r};renderTree();renderEditor()}
function input(name,title,value,type="text",help=""){return `<div class="form-field"><label>${esc(title)}<${type==="textarea"?"textarea":"input"} name="${name}" ${type!=="textarea"?`type="${type}"`:""}>${type==="textarea"?esc(value):""}${type==="textarea"?"</textarea>":""}${type!=="textarea"?` value="${esc(value??"")}">`:""}${help?`<div class="hint">${esc(help)}</div>`:""}</label></div>`}
function renderEditor(){const {type,row}=S.selected;$("#canvas").innerHTML=`<div class="preview-card"><span class="badge">${esc(type)}</span><h2>${esc(label(row,type))}</h2><p>Modifiez les propriétés à droite puis enregistrez.</p></div>`;if(type==="fiche"){$("#properties").innerHTML='<div class="empty-state">L’édition des fiches sera activée à l’étape suivante.</div>';return}
 const titleKey=field(row,type==="question"?["Libelle","Libellé","Question","Titre"]:["Titre","Nom","Libelle"]);
 const descKey=field(row,type==="question"?["Aide","Description","Texte_aide"]:["Description","Introduction","Texte"]);
 const orderKey=field(row,["Ordre"]);const activeKey=field(row,["Active"]);
 const requiredKey=type==="question"?field(row,["Mode_obligation"]):null;
 const typeKey=type==="question"?field(row,["Type_question","Type_reponse","Type","Format"]):null;
 let h='<form id="edit-form" class="form-grid">';
 if(titleKey)h+=input("title","Libellé / titre",row[titleKey]??"");
 if(descKey)h+=input("description",type==="question"?"Aide / description":"Description",row[descKey]??"","textarea");
 if(typeKey)h+=input("qtype","Type de question",row[typeKey]??"","text","La valeur actuelle est conservée telle qu’elle existe dans Grist.");
 if(requiredKey)h+=`<div class="form-field"><label>Caractère obligatoire<select name="required"><option value="Facultative" ${String(row[requiredKey])==="Facultative"?"selected":""}>Facultative</option><option value="Obligatoire" ${String(row[requiredKey])==="Obligatoire"?"selected":""}>Obligatoire</option></select></label></div>`;
 if(orderKey)h+=input("order","Ordre",row[orderKey]??0,"number");
 if(activeKey)h+=`<label class="check"><input name="active" type="checkbox" ${active(row)?"checked":""}> Actif</label>`;
 h+='<div class="form-actions"><button class="btn btn-primary" type="submit">Enregistrer</button></div></form>';$("#properties").innerHTML=h;
 $("#edit-form").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),changes={};if(titleKey)changes[titleKey]=f.get("title");if(descKey)changes[descKey]=f.get("description");if(typeKey)changes[typeKey]=f.get("qtype");if(requiredKey)changes[requiredKey]=f.get("required");if(orderKey)changes[orderKey]=Number(f.get("order")||0);if(activeKey)changes[activeKey]=f.get("active")==="on";await update(type,row.id,changes)}
}
function tableFor(t){return {page:"PAGES",section:"SECTIONS",question:"QUESTIONS"}[t]}
async function update(t,id,changes){try{await grist.docApi.applyUserActions([["UpdateRecord",tableFor(t),Number(id),changes]]);status("Modification enregistrée.");await reload();const nr=rows(t).find(x=>String(x.id)===String(id));if(nr){S.selected={type:t,row:nr};renderTree();renderEditor()}}catch(e){status(e?.message||e,true)}}
function code(prefix){return `${prefix}_${Date.now().toString(36).toUpperCase()}`}
function versionRow(){return S.data.VERSIONS_QUESTIONNAIRES.find(v=>codeOf(v.Version_Code)===S.version)}
function maxOrder(arr){return Math.max(0,...arr.map(r=>Number(r.Ordre)||0))+1}
async function add(t){try{const {pages,sections,questions}=current();const v=versionRow();if(!v)throw new Error("Version introuvable.");
 let table,values;
 if(t==="page"){table="PAGES";const sample=S.data.PAGES[0]||{};values={Page_Code:code("PAGE"),Version_Code:v.id,Ordre:maxOrder(pages)};const k=field(sample,["Titre","Nom","Libelle"]);if(k)values[k]="Nouvelle page";if(field(sample,["Active"]))values.Active=true}
 if(t==="section"){const p=S.selected?.type==="page"?S.selected.row:S.selected?.type==="section"?S.data.PAGES.find(x=>String(x.id)===String(S.selected.row.Page_Code)):null;if(!p)throw new Error("Sélectionnez d’abord la page qui doit contenir la nouvelle section.");table="SECTIONS";const sample=S.data.SECTIONS[0]||{};values={Section_Code:code("SEC"),Version_Code:v.id,Page_Code:p.id,Ordre:maxOrder(sections.filter(s=>String(s.Page_Code)===String(p.id)))};const k=field(sample,["Titre","Nom","Libelle"]);if(k)values[k]="Nouvelle section";if(field(sample,["Active"]))values.Active=true}
 if(t==="question"){let s=S.selected?.type==="section"?S.selected.row:S.selected?.type==="question"?S.data.SECTIONS.find(x=>String(x.id)===String(S.selected.row.Section_Code)):null;if(!s)throw new Error("Sélectionnez d’abord la section qui doit contenir la nouvelle question.");const p=S.data.PAGES.find(x=>String(x.id)===String(s.Page_Code));table="QUESTIONS";const sample=S.data.QUESTIONS[0]||{};values={Question_Code:code("Q"),Version_Code:v.id,Section_Code:s.id,Ordre:maxOrder(questions.filter(q=>String(q.Section_Code)===String(s.id)))};if(p&&field(sample,["Page_Code"]))values.Page_Code=p.id;const k=field(sample,["Libelle","Libellé","Question","Titre"]);if(k)values[k]="Nouvelle question";if(field(sample,["Active"]))values.Active=true;if(field(sample,["Mode_obligation"]))values.Mode_obligation="Facultative"}
 await grist.docApi.applyUserActions([["AddRecord",table,null,values]]);status("Élément ajouté.");await reload()
 }catch(e){status(e?.message||e,true)}}
function status(m,err=false){$("#status").innerHTML=`<div class="${err?"status-error":"status-ok"}">${esc(m)}</div>`;if(!err)setTimeout(()=>{$("#status").innerHTML=""},2200)}
function bind(){$("#questionnaire-select").onchange=e=>{S.questionnaire=e.target.value;S.version=null;S.selected=null;renderSelectors()};$("#version-select").onchange=e=>{S.version=e.target.value;S.selected=null;renderTree()};$("#add-page").onclick=()=>add("page");$("#add-section").onclick=()=>add("section");$("#add-question").onclick=()=>add("question")}
async function start(){try{grist.ready({requiredAccess:"full"});await reload();bind()}catch(e){status(`Impossible de charger le Concepteur : ${e?.message||e}`,true)}}
start();
