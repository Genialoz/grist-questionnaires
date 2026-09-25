import {rowsFromTable, sortByOrder, codeOf, evaluateCondition, isTrue, validateQuestion} from "../shared/grist-common.js";

export const TABLES = [
  "VERSIONS_QUESTIONNAIRES","PAGES","SECTIONS","QUESTIONS","TYPES_FICHES",
  "CHOIX_QUESTIONS","REFERENTIELS","VALEURS_REFERENTIELS","STRUCTURES","CONDITIONS","REGLES_CONDITION"
];

const state = { definition:null, answers:{}, fiches:{}, ficheEditor:null, pageIndex:0, diagnostics:[], selectedRecord:null };

function active(row) { return row.Active === undefined || row.Active === null || row.Active === "" || isTrue(row.Active); }
export function resolveRefCode(value, rows, codeColumn) {
  const raw=codeOf(value);
  if (!raw) return "";
  const byId=(rows ?? []).find(r=>String(r.id)===String(raw));
  if (byId) return codeOf(byId[codeColumn]);
  return raw;
}
function first(row, names, fallback="") { for (const n of names) if (row?.[n] != null && row[n] !== "") return row[n]; return fallback; }
function escapeHtml(v="") { return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }


export function normalizeRules(loaded) {
  return (loaded.REGLES_CONDITION ?? []).map(rule=>({
    ...rule,
    Condition_Code:resolveRefCode(rule.Condition_Code,loaded.CONDITIONS ?? [],"Condition_Code"),
    Question_source_Code:resolveRefCode(rule.Question_source_Code,loaded.QUESTIONS ?? [],"Question_Code"),
    Question_comparaison_Code:resolveRefCode(rule.Question_comparaison_Code,loaded.QUESTIONS ?? [],"Question_Code")
  }));
}

export async function loadDefinition(docApi, selectedRecord=null) {
  const loaded={};
  for (const name of TABLES) {
    try { loaded[name]=rowsFromTable(await docApi.fetchTable(name)); }
    catch (e) { throw new Error(`Table de configuration inaccessible : ${name}\n${e?.message ?? e}`); }
  }
  let versions=loaded.VERSIONS_QUESTIONNAIRES.filter(active);
  let version=null;
  const candidate = selectedRecord && (selectedRecord.Version_Code ?? selectedRecord.version_Code ?? selectedRecord.id);
  if (candidate != null) {
    const c=codeOf(candidate);
    version=versions.find(v => codeOf(v.Version_Code)===c || String(v.id)===c) ?? null;
  }
  version ??= versions.find(v => /brouillon|active|publi/i.test(String(v.Statut ?? ""))) ?? versions[0] ?? null;
  if (!version) throw new Error("Aucune version de questionnaire disponible.");
  const vc=codeOf(version.Version_Code);
  const byVersion = rows => rows.filter(r => !("Version_Code" in r) || resolveRefCode(r.Version_Code, versions, "Version_Code")===vc);
  return {
    version,
    pages:byVersion(loaded.PAGES).filter(active),
    sections:byVersion(loaded.SECTIONS).filter(active),
    questions:byVersion(loaded.QUESTIONS).filter(active),
    ficheTypes:byVersion(loaded.TYPES_FICHES).filter(active),
    choices:loaded.CHOIX_QUESTIONS.filter(active),
    referentials:loaded.REFERENTIELS.filter(active),
    referentialValues:loaded.VALEURS_REFERENTIELS.filter(active),
    structures:loaded.STRUCTURES.filter(active),
    conditions:byVersion(loaded.CONDITIONS).filter(active),
    rules:normalizeRules(loaded)
  };
}

function conditionVisible(conditionCode, def, answers, diagnostics) {
  const cc=resolveRefCode(conditionCode,def.conditions,"Condition_Code");
  if (!cc) return true;
  const condition=def.conditions.find(c=>codeOf(c.Condition_Code)===cc);
  if (!condition) { diagnostics.push(`Condition introuvable : ${cc}`); return false; }
  try { return evaluateCondition(condition, def.rules, answers); }
  catch(e){ diagnostics.push(`Condition ${cc} invalide : ${e.message}`); return false; }
}

function optionsFor(q, def) {
  const qc=codeOf(q.Question_Code);
  const direct=sortByOrder(def.choices.filter(c=>resolveRefCode(c.Question_Code,def.questions,"Question_Code")===qc))
    .map(c=>({value:codeOf(c.Choix_Code), label:first(c,["Libelle","Libellé","Valeur","Choix_Code"],codeOf(c.Choix_Code))}));
  if (direct.length) return direct;
  const rc=resolveRefCode(q.Referentiel_Code,def.referentials,"Referentiel_Code");
  if (!rc) return [];
  const ref=def.referentials.find(r=>codeOf(r.Referentiel_Code)===rc);
  const source=String(ref?.Type_source ?? "VALEURS_REFERENTIELS").trim().toUpperCase();
  if (source==="STRUCTURES") {
    return sortByOrder((def.structures ?? []).filter(active))
      .map(v=>({value:codeOf(v.Structure_Code), label:first(v,["Nom","Libelle","Libellé","Structure_Code"],codeOf(v.Structure_Code))}));
  }
  if (source!=="VALEURS_REFERENTIELS") return [];
  return sortByOrder(def.referentialValues.filter(v=>resolveRefCode(v.Referentiel_Code,def.referentials,"Referentiel_Code")===rc && active(v)))
    .map(v=>({value:codeOf(v.ValeurRef_Code), label:first(v,["Libelle","Libellé","Valeur","ValeurRef_Code"],codeOf(v.ValeurRef_Code))}));
}



export function createDraftFiche(targetState, typeCode) {
  targetState.ficheEditor={typeCode,index:null,answers:{}};
  return targetState.ficheEditor;
}
export function saveDraftFiche(targetState) {
  const editor=targetState.ficheEditor;
  if (!editor) return null;
  const list=targetState.fiches[editor.typeCode] ??= [];
  const saved={answers:{...editor.answers}};
  if (editor.index===null) list.push(saved); else list[editor.index]=saved;
  targetState.ficheEditor=null;
  return saved;
}
export function deleteFiche(targetState,typeCode,index) {
  const list=targetState.fiches[typeCode] ?? [];
  if (index>=0 && index<list.length) list.splice(index,1);
  if (targetState.ficheEditor?.typeCode===typeCode) targetState.ficheEditor=null;
}

export function buildRepeatableTypes(def, pageCode) {
  return sortByOrder((def.ficheTypes ?? []).filter(active)).map(type=>{
    const code=codeOf(type.TypeFiche_Code);
    const questions=sortByOrder((def.questions ?? []).filter(q=>
      active(q) &&
      resolveRefCode(q.TypeFiche_Code,def.ficheTypes,"TypeFiche_Code")===code &&
      resolveRefCode(q.Page_Code,def.pages,"Page_Code")===pageCode
    ));
    return {
      code,
      labelSingular:first(type,["Libelle_singulier","Libellé_singulier","Libelle","Nom"],"Fiche"),
      labelPlural:first(type,["Libelle_pluriel","Libellé_pluriel"],"Fiches"),
      minimum:Number(type.Minimum || 0),
      maximum:type.Maximum==="" || type.Maximum==null ? null : Number(type.Maximum),
      allowAdd:type.Autoriser_ajout===undefined ? true : isTrue(type.Autoriser_ajout),
      allowDelete:type.Autoriser_suppression===undefined ? true : isTrue(type.Autoriser_suppression),
      questions
    };
  }).filter(type=>type.questions.length>0);
}


export function visibleFicheQuestions(type, def, answers={}) {
  const diagnostics=[];
  return type.questions
    .filter(q=>!isTrue(q.Masquee) && conditionVisible(q.Condition_affichage_Code,def,answers,diagnostics))
    .map(q=>({...q,options:optionsFor(q,def)}));
}

export function buildViewModel(def, answers={}) {
  const diagnostics=[];
  const pages=sortByOrder(def.pages).filter(p=>conditionVisible(p.Condition_Code,def,answers,diagnostics)).map(page=>{
    const pc=codeOf(page.Page_Code);
    const sections=sortByOrder(def.sections.filter(s=>resolveRefCode(s.Page_Code,def.pages,"Page_Code")===pc))
      .filter(s=>conditionVisible(s.Condition_Code,def,answers,diagnostics)).map(section=>{
        const sc=codeOf(section.Section_Code);
        const questions=sortByOrder(def.questions.filter(q=>
          resolveRefCode(q.Section_Code,def.sections,"Section_Code")===sc &&
          !resolveRefCode(q.TypeFiche_Code,def.ficheTypes,"TypeFiche_Code")
        ))
          .filter(q=>!isTrue(q.Masquee) && conditionVisible(q.Condition_affichage_Code,def,answers,diagnostics))
          .map(q=>({...q, options:optionsFor(q,def)}));
        return {...section,questions};
      });
    return {...page,sections,repeatableTypes:buildRepeatableTypes(def,pc)};
  });
  return {version:def.version,pages,diagnostics};
}

export function controlKind(question) {
  const t=String(question.Type_question ?? question.Type ?? "").trim().toLowerCase();
  if (t.includes("texte long")) return "textarea";
  if (t.includes("email")) return "email";
  if (t.includes("montant")) return "number";
  if (t.includes("nombre") || t.includes("numérique") || t.includes("numerique")) return "number";
  if (t.includes("date")) return "date";
  if (t.includes("radio")) return "radio";
  if (t.includes("liste") || t.includes("déroul") || t.includes("deroul")) return "select";
  return "text";
}

function renderControl(q, answers=state.answers, ficheMode=false) {
  const code=codeOf(q.Question_Code), kind=controlKind(q), value=answers[code] ?? "";
  const attrs=[
    `data-${ficheMode?"fiche-":""}question="${escapeHtml(code)}"`,
    q.Valeur_min!==""&&q.Valeur_min!=null?`min="${escapeHtml(q.Valeur_min)}"`:"",
    q.Valeur_max!==""&&q.Valeur_max!=null?`max="${escapeHtml(q.Valeur_max)}"`:"",
    q.Longueur_min!==""&&q.Longueur_min!=null?`minlength="${escapeHtml(q.Longueur_min)}"`:"",
    q.Longueur_max!==""&&q.Longueur_max!=null?`maxlength="${escapeHtml(q.Longueur_max)}"`:"",
    isTrue(q.Lecture_seule)?"disabled":""
  ].filter(Boolean).join(" ");
  if (kind==="textarea") return `<textarea ${attrs}>${escapeHtml(value)}</textarea>`;
  if (kind==="select") return `<select ${attrs}><option value="">— Sélectionner —</option>${q.options.map(o=>`<option value="${escapeHtml(o.value)}"${String(value)===String(o.value)?" selected":""}>${escapeHtml(o.label)}</option>`).join("")}</select>`;
  if (kind==="radio") return `<div class="radio-group">${q.options.map(o=>`<label class="radio-option"><input type="radio" name="${escapeHtml(code)}" data-${ficheMode?"fiche-":""}question="${escapeHtml(code)}" value="${escapeHtml(o.value)}"${String(value)===String(o.value)?" checked":""}${isTrue(q.Lecture_seule)?" disabled":""}><span>${escapeHtml(o.label)}</span></label>`).join("")}${!isTrue(q.Lecture_seule)?`<button type="button" class="clear-answer" data-${ficheMode?"clear-fiche-question":"clear-question"}="${escapeHtml(code)}"${value===""?" disabled":""}>Effacer la réponse</button>`:""}</div>`;
  return `<input type="${kind}" ${attrs} value="${escapeHtml(value)}"${kind==="number" && q.Nb_decimales!=null && q.Nb_decimales!=="" ? ` step="${1/(10**Number(q.Nb_decimales))}"` : ""}>`;
}


function renderFicheField(q, answers) {
  const qc=codeOf(q.Question_Code);
  return `<div class="field" data-fiche-field="${escapeHtml(qc)}"><label>${escapeHtml(first(q,["Libelle","Libellé","Titre"],qc))}${isTrue(q.Obligatoire)?' <span class="required" aria-label="obligatoire">*</span>':""}</label>${q.Aide?`<div class="help">${escapeHtml(q.Aide)}</div>`:""}${renderControl(q,answers,true)}<div class="error" data-fiche-error="${escapeHtml(qc)}"></div></div>`;
}
function ficheSummary(fiche,index) {
  const firstValue=Object.values(fiche.answers ?? {}).find(v=>v!=="" && v!=null);
  return firstValue ? String(firstValue) : `Fiche ${index+1}`;
}


export function validateFiche(type,def,answers={}) {
  const errors={};
  for (const q of visibleFicheQuestions(type,def,answers)) {
    const code=codeOf(q.Question_Code);
    const error=validateQuestion(q,answers[code],true);
    if (error) errors[code]=error;
  }
  return errors;
}

export function canAddFiche(type,list=[]) {
  if (!type.allowAdd) return false;
  return type.maximum==null || list.length<type.maximum;
}
export function validateFicheCounts(types=[],fiches={}) {
  const errors={};
  for (const type of types) {
    const count=(fiches[type.code] ?? []).length;
    if (count<type.minimum) {
      const singular=String(type.labelSingular || "fiche").toLowerCase();
      const plural=String(type.labelPlural || `${singular}s`).toLowerCase();
      errors[type.code]=`Vous devez saisir au moins ${type.minimum} ${type.minimum>1?plural:singular}.`;
    }
  }
  return errors;
}

export function renderRepeatableType(type,targetState,def) {
  const list=targetState.fiches[type.code] ?? [];
  const editor=targetState.ficheEditor?.typeCode===type.code ? targetState.ficheEditor : null;
  const atMax=!canAddFiche(type,list);
  const cards=list.map((fiche,index)=>`<article class="fiche-card"><div><strong>${escapeHtml(type.labelSingular)} ${index+1}</strong><div class="fiche-summary">${escapeHtml(ficheSummary(fiche,index))}</div></div><div class="fiche-actions"><button type="button" class="btn btn-small" data-edit-fiche="${escapeHtml(type.code)}" data-index="${index}">Modifier</button>${type.allowDelete?`<button type="button" class="btn btn-small" data-delete-fiche="${escapeHtml(type.code)}" data-index="${index}">Supprimer</button>`:""}</div></article>`).join("");
  const editorHtml=editor ? `<div class="fiche-editor" data-fiche-editor="${escapeHtml(type.code)}"><h3>${editor.index===null?`Ajouter ${escapeHtml(type.labelSingular.toLowerCase())}`:`Modifier ${escapeHtml(type.labelSingular.toLowerCase())}`}</h3>${visibleFicheQuestions(type,def,editor.answers).map(q=>renderFicheField(q,editor.answers)).join("")}<div class="fiche-editor-actions"><button type="button" class="btn" data-cancel-fiche>Annuler</button><button type="button" class="btn btn-primary" data-save-fiche>Enregistrer la fiche</button></div></div>`:"";
  return `<section class="repeatable" data-fiche-type="${escapeHtml(type.code)}"><div class="repeatable-heading"><h3>${escapeHtml(type.labelPlural)}</h3><span>${list.length} ${list.length>1?"fiches":"fiche"}</span></div>${cards || `<p class="empty-fiches">Aucune ${escapeHtml(type.labelSingular.toLowerCase())} saisie.</p>`}<div class="fiche-count-error" data-fiche-count-error="${escapeHtml(type.code)}"></div>${!editor && type.allowAdd?`<button type="button" class="btn add-fiche" data-add-fiche="${escapeHtml(type.code)}"${atMax?" disabled":""}>+ Ajouter un ${escapeHtml(type.labelSingular.toLowerCase())}</button>`:""}${editorHtml}</section>`;
}

function render() {
  const root=document.querySelector("#form-root"), nav=document.querySelector("#navigation"), status=document.querySelector("#status");
  const vm=buildViewModel(state.definition,state.answers); state.diagnostics=vm.diagnostics;
  if (!vm.pages.length) {
    const d=state.definition;
    const pageSample=(d.pages ?? []).slice(0,3).map(p=>({
      id:p.id, Page_Code:p.Page_Code, Version_Code:p.Version_Code,
      Condition_Code:p.Condition_Code, Active:p.Active, Ordre:p.Ordre
    }));
    const versionSample={
      id:d.version?.id, Version_Code:d.version?.Version_Code,
      Questionnaire_Code:d.version?.Questionnaire_Code, Statut:d.version?.Statut
    };
    root.innerHTML=`<div class="card">
      <h2>Diagnostic du widget</h2>
      <p><strong>Aucune page visible.</strong></p>
      <p>Le widget communique bien avec Grist. Voici ce qu'il a réellement chargé :</p>
      <pre style="white-space:pre-wrap;overflow:auto;background:#f5f5f7;padding:12px;border-radius:8px">${escapeHtml(JSON.stringify({
        version:versionSample,
        nombres:{
          pages:d.pages?.length ?? 0,
          sections:d.sections?.length ?? 0,
          questions:d.questions?.length ?? 0,
          conditions:d.conditions?.length ?? 0,
          regles:d.rules?.length ?? 0
        },
        pages_exemple:pageSample,
        diagnostics:vm.diagnostics
      },null,2))}</pre>
      <p>Copiez ce bloc ou envoyez-en une capture d'écran.</p>
    </div>`;
    nav.innerHTML=""; return;
  }
  if (state.pageIndex>=vm.pages.length) state.pageIndex=vm.pages.length-1;
  const page=vm.pages[state.pageIndex];
  const title=first(vm.version,["Titre","Titre_affiche","Nom"],"Questionnaire");
  const intro=first(vm.version,["Introduction","Texte_introduction"],"");
  status.innerHTML="";
  root.innerHTML=`<div class="card">
    <header class="header"><span class="preview-badge">Prévisualisation</span><h1>${escapeHtml(title)}</h1>${intro?`<div class="intro">${escapeHtml(intro)}</div>`:""}
    <div class="progress"><div style="width:${((state.pageIndex+1)/vm.pages.length)*100}%"></div></div><div class="progress-label">Page ${state.pageIndex+1} sur ${vm.pages.length}</div></header>
    <h2>${escapeHtml(first(page,["Titre","Libelle","Libellé","Nom"],codeOf(page.Page_Code)))}</h2>
    ${page.sections.map(s=>`<section class="section"><h2>${escapeHtml(first(s,["Titre","Libelle","Libellé","Nom"],""))}</h2>
      ${s.questions.map(q=>{const qc=codeOf(q.Question_Code);return `<div class="field" data-field="${escapeHtml(qc)}"><label>${escapeHtml(first(q,["Libelle","Libellé","Titre"],qc))}${isTrue(q.Obligatoire)?' <span class="required" aria-label="obligatoire">*</span>':""}</label>${q.Aide?`<div class="help">${escapeHtml(q.Aide)}</div>`:""}${renderControl(q)}<div class="error" data-error="${escapeHtml(qc)}"></div></div>`}).join("")}
    </section>`).join("")}
    ${(page.repeatableTypes ?? []).map(type=>renderRepeatableType(type,state,state.definition)).join("")}
    ${vm.diagnostics.length?`<div class="diagnostic">Diagnostic : ${vm.diagnostics.map(escapeHtml).join(" · ")}</div>`:""}
  </div>`;
  nav.innerHTML=`<button class="btn" id="prev"${state.pageIndex===0?" disabled":""}>Précédent</button><button class="btn btn-primary" id="next">${state.pageIndex===vm.pages.length-1?"Terminer la prévisualisation":"Suivant"}</button>`;
  root.querySelectorAll("[data-question]").forEach(el=>el.addEventListener("change", onAnswer));
  root.querySelectorAll("input[data-question],textarea[data-question]").forEach(el=>el.addEventListener("input", onAnswer));
  root.querySelectorAll("[data-clear-question]").forEach(el=>el.addEventListener("click", e=>{
    const code=e.currentTarget.dataset.clearQuestion;
    state.answers[code]="";
    render();
  }));
  root.querySelectorAll("[data-add-fiche]").forEach(el=>el.addEventListener("click",e=>{createDraftFiche(state,e.currentTarget.dataset.addFiche);render()}));
  root.querySelectorAll("[data-edit-fiche]").forEach(el=>el.addEventListener("click",e=>{
    const typeCode=e.currentTarget.dataset.editFiche, index=Number(e.currentTarget.dataset.index);
    state.ficheEditor={typeCode,index,answers:{...(state.fiches[typeCode]?.[index]?.answers ?? {})}}; render();
  }));
  root.querySelectorAll("[data-delete-fiche]").forEach(el=>el.addEventListener("click",e=>{deleteFiche(state,e.currentTarget.dataset.deleteFiche,Number(e.currentTarget.dataset.index));render()}));
  root.querySelectorAll("[data-fiche-question]").forEach(el=>el.addEventListener("change",onFicheAnswer));
  root.querySelectorAll("input[data-fiche-question],textarea[data-fiche-question]").forEach(el=>el.addEventListener("input",onFicheAnswer));
  root.querySelectorAll("[data-clear-fiche-question]").forEach(el=>el.addEventListener("click",e=>{if(state.ficheEditor){state.ficheEditor.answers[e.currentTarget.dataset.clearFicheQuestion]="";render()}}));
  root.querySelector("[data-cancel-fiche]")?.addEventListener("click",()=>{state.ficheEditor=null;render()});
  root.querySelector("[data-save-fiche]")?.addEventListener("click",()=>saveCurrentFiche());
  document.querySelector("#prev")?.addEventListener("click",()=>{state.pageIndex--;render()});
  document.querySelector("#next")?.addEventListener("click",()=>nextPage(vm,page));
}


function onFicheAnswer(e) {
  if (!state.ficheEditor) return;
  const code=e.target.dataset.ficheQuestion;
  if (!code) return;
  state.ficheEditor.answers[code]=e.target.value;
  if (e.target.type==="radio" || state.definition.rules.some(r=>codeOf(r.Question_source_Code)===code)) render();
}
function saveCurrentFiche() {
  if (!state.ficheEditor) return;
  const vm=buildViewModel(state.definition,state.answers);
  const page=vm.pages[state.pageIndex];
  const type=(page?.repeatableTypes ?? []).find(t=>t.code===state.ficheEditor.typeCode);
  if (!type) return;
  const errors=validateFiche(type,state.definition,state.ficheEditor.answers);
  document.querySelectorAll("[data-fiche-field]").forEach(x=>x.classList.remove("invalid"));
  document.querySelectorAll("[data-fiche-error]").forEach(x=>x.textContent="");
  for (const [code,msg] of Object.entries(errors)) {
    document.querySelector(`[data-fiche-field="${CSS.escape(code)}"]`)?.classList.add("invalid");
    const node=document.querySelector(`[data-fiche-error="${CSS.escape(code)}"]`);
    if(node) node.textContent=msg;
  }
  if (Object.keys(errors).length) return;
  saveDraftFiche(state);
  render();
}

function onAnswer(e) {
  const code=e.target.dataset.question;
  if (!code) return;
  state.answers[code]=e.target.value;
  // A radio must re-render immediately so its clear button reflects the new state.
  // Conditional source questions also re-render to update dependent visibility.
  if (e.target.type==="radio" || state.definition.rules.some(r=>codeOf(r.Question_source_Code)===code)) render();
}

export function validateVisiblePage(page, answers={}) {
  const errors={};
  for (const section of page.sections) for (const q of section.questions) {
    const code=codeOf(q.Question_Code);
    const error=validateQuestion(q,answers[code],true);
    if (error) errors[code]=error;
  }
  return errors;
}

function nextPage(vm,page) {
  const errors=validateVisiblePage(page,state.answers);
  const ficheErrors=validateFicheCounts(page.repeatableTypes ?? [],state.fiches);
  document.querySelectorAll(".field").forEach(x=>x.classList.remove("invalid"));
  document.querySelectorAll("[data-error]").forEach(x=>x.textContent="");
  for (const [code,msg] of Object.entries(errors)) {
    document.querySelector(`[data-field="${CSS.escape(code)}"]`)?.classList.add("invalid");
    const node=document.querySelector(`[data-error="${CSS.escape(code)}"]`); if(node) node.textContent=msg;
  }
  for (const [typeCode,msg] of Object.entries(ficheErrors)) {
    const node=document.querySelector(`[data-fiche-count-error="${CSS.escape(typeCode)}"]`);
    if(node) node.textContent=msg;
  }
  if (Object.keys(errors).length || Object.keys(ficheErrors).length) return;
  if (state.pageIndex < vm.pages.length-1) { state.pageIndex++; render(); return; }
  document.querySelector("#form-root").innerHTML=`<div class="card"><span class="preview-badge">Prévisualisation</span><h1>Fin de la prévisualisation</h1><p>Aucune réponse n’a été enregistrée dans Grist.</p></div>`;
  document.querySelector("#navigation").innerHTML=`<button class="btn" id="restart-preview">Revenir au questionnaire</button>`;
  document.querySelector("#restart-preview").addEventListener("click",()=>{state.pageIndex=0;render()});
}

async function boot() {
  try {
    if (!window.grist) throw new Error("API Grist indisponible. Ouvrez ce widget depuis Grist.");
    grist.ready({requiredAccess:"full"});
    grist.onRecord(record=>{ state.selectedRecord=record; });
    state.definition=await loadDefinition(grist.docApi,state.selectedRecord);
    render();
  } catch(e) {
    document.querySelector("#status").innerHTML=`<div class="status-error">${escapeHtml(e.message ?? e)}</div>`;
    document.querySelector("#form-root").innerHTML="";
  }
}

if (typeof window!=="undefined" && typeof document!=="undefined") boot();
