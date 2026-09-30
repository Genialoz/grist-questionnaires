import {rowsFromTable, sortByOrder, codeOf, evaluateCondition, isTrue, isRequiredQuestion, validateQuestion} from "../shared/grist-common.js";
import {serializeAnswer, hydrateResponse, assertRevision, validateWholeResponse, generateResumeToken, findResponseByResumeToken} from "./persistence.js";
import {writeWorkbook} from "./xlsx-lite.js";

export const TABLES = [
  "VERSIONS_QUESTIONNAIRES","PAGES","SECTIONS","QUESTIONS","TYPES_FICHES","FILTRES_TYPES_FICHES",
  "CHOIX_QUESTIONS","COLONNES_MATRICE","REFERENTIELS","VALEURS_REFERENTIELS","STRUCTURES","CONDITIONS","REGLES_CONDITION","FILTRES_CHOIX",
  "CAMPAGNES","REPONSES","ELEMENTS_REPONSE","VALEURS_REPONSE","SELECTIONS_REPONSE"
];

const state = { definition:null, answers:{}, fiches:{}, ficheEditor:null, subFicheEditor:null, pageIndex:0, diagnostics:[], selectedRecord:null, response:null, principalElement:null, principalDirty:false, saving:false, saveError:"", statusMessage:"", validationJustCompleted:false, ficheListUi:{}, previewMode:false, debugEvents:[] };

function active(row) {
  const value = Object.prototype.hasOwnProperty.call(row ?? {}, "Actif") ? row.Actif : row?.Active;
  return value === undefined || value === null || value === "" || isTrue(value);
}
export function resolveRefCode(value, rows, codeColumn) {
  const raw=codeOf(value);
  if (!raw) return "";
  const byId=(rows ?? []).find(r=>String(r.id)===String(raw));
  if (byId) return codeOf(byId[codeColumn]);
  return raw;
}
function resolveRefCodes(value, rows, codeColumn) {
  const rawValues=Array.isArray(value) ? (value[0]==="L" ? value.slice(1) : value) : (value==null||value==="" ? [] : [value]);
  return rawValues.map(v=>resolveRefCode(v,rows,codeColumn)).filter(Boolean);
}
function first(row, names, fallback="") { for (const n of names) if (row?.[n] != null && row[n] !== "") return row[n]; return fallback; }
function cssColor(value){const v=String(value||"").trim();return /^#[0-9a-f]{3,8}$/i.test(v)||/^(rgb|hsl)a?\(/i.test(v)?v:""}
function alignCss(v){const a=String(v||"").trim().toLowerCase();return a==="gauche"||a==="left"?"left":a==="centre"||a==="center"||a==="centré"?"center":a==="droite"||a==="right"?"right":""}
function titleStyle(row,themeColor=""){const c=cssColor(row?.Couleur_titre)||cssColor(themeColor),parts=[],align=alignCss(row?.Alignement_titre);if(align)parts.push(`text-align:${align}`);if(c)parts.push(`color:${c}`);if(row?.Titre_gras)parts.push("font-weight:700");if(row?.Titre_souligne)parts.push("text-decoration:underline");const kind=String(row?.Style_titre||"").toLowerCase();if(kind==="encadre")parts.push("border:1px solid currentColor","padding:10px 14px","border-radius:8px");if(kind==="bandeau")parts.push("padding:10px 14px","border-radius:8px","background:color-mix(in srgb, currentColor 12%, transparent)");return parts.join(";")}
function labelStyle(q){const parts=[],c=cssColor(q?.Couleur_libelle),align=alignCss(q?.Alignement_libelle);if(align)parts.push(`text-align:${align}`,"display:block");if(c)parts.push(`color:${c}`);if(q?.Libelle_gras)parts.push("font-weight:700");if(q?.Libelle_italique)parts.push("font-style:italic");if(q?.Libelle_souligne)parts.push("text-decoration:underline");return parts.join(";")}
function escapeHtml(v="") { return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function debugPush(type,data={}){
  state.debugEvents.push({heure:new Date().toLocaleTimeString(),type,...data});
  if(state.debugEvents.length>30)state.debugEvents=state.debugEvents.slice(-30);
  // Keep the diagnostic textarea live even when the event happens after render().
  try{
    const area=document.querySelector("[data-debug-output]");
    if(area) area.value=JSON.stringify(debugSnapshot(),null,2);
  }catch{}
}
function debugParamSource(name){
  const out={widget:"",parent:""};
  try{out.widget=String(new URL(globalThis.location?.href||"", "http://local/").searchParams.get(name)||"").trim()}catch{}
  try{out.parent=String(new URL(globalThis.document?.referrer||"", "http://local/").searchParams.get(name)||"").trim()}catch{}
  return out;
}
function debugQuestionSnapshot(editor){
  if(!editor)return null;
  const type=findRepeatableType(buildRepeatableTypes(state.definition||{}),editor.typeCode);
  const combined={...state.answers,...(state.ficheEditor?.answers??{}),...editor.answers};
  const questions=type?visibleFicheQuestions(type,state.definition,combined):[];
  return {
    typeCode:editor.typeCode||"", index:editor.index??null, parentElementId:editor.parentElementId??null,
    answers:{...(editor.answers||{})},
    questions:questions.map(q=>({
      code:codeOf(q.Question_Code), libelle:first(q,["Libelle","Libellé","Titre"],""),
      type:String(q.Type_question??q.Type??""), valeur:editor.answers?.[codeOf(q.Question_Code)]??null,
      options:(q.options||[]).map(o=>({value:String(o.value??""),label:String(o.label??"") }))
    }))
  };
}
function debugSnapshot(){
  let campaign=null, personalization=null;
  try{campaign=selectedCampaign()}catch(e){campaign={erreur:String(e?.message||e)}}
  try{personalization=campaignPersonalization()}catch(e){personalization={erreur:String(e?.message||e)}}
  const qc=personalization?.questionCode||"";
  const q=qc?(state.definition?.questions||[]).find(x=>String(codeOf(x.Question_Code))===String(qc)):null;
  const currentOptions=q?(q.options||[]).map(o=>({value:String(o.value??""),label:String(o.label??"")})):[];
  return {
    acces:debugParamSource("Acces_"),
    campagnes_visibles:(state.definition?.campaigns||[]).map(c=>({id:c.id,code:codeOf(c.Campagne_Code),jeton:String(c.Jeton_acces||""),question:codeOf(c.Question_personnalisation_Code),valeur:String(c.Valeur_personnalisation??""),libelle:String(c.Valeur_personnalisation_Libelle??"")})),
    campagne_selectionnee:campaign?{id:campaign.id,code:codeOf(campaign.Campagne_Code),jeton:String(campaign.Jeton_acces||""),question:codeOf(campaign.Question_personnalisation_Code),valeur:String(campaign.Valeur_personnalisation??""),libelle:String(campaign.Valeur_personnalisation_Libelle??"")}:null,
    personnalisation:personalization?{questionCode:qc,value:String(personalization.value??""),label:String(personalization.label??"")}:null,
    question_personnalisee:q?{code:codeOf(q.Question_Code),libelle:first(q,["Libelle","Libellé","Titre"],""),type:String(q.Type_question??q.Type??""),valeur_etat:state.answers[qc]??null,options:currentOptions}:null,
    editeur_fiche:debugQuestionSnapshot(state.ficheEditor),
    editeur_sous_fiche:debugQuestionSnapshot(state.subFicheEditor),
    derniers_evenements:state.debugEvents
  };
}
function debugPanelHtml(){
  const data=debugSnapshot();
  return `<details class="card" style="margin-top:16px;border:2px dashed #999"><summary style="cursor:pointer;font-weight:700">Diagnostic temporaire</summary><p class="help">Ouvrez ce bloc après avoir reproduit le problème, puis copiez tout son contenu.</p><textarea readonly data-debug-output style="width:100%;min-height:420px;font-family:monospace;font-size:12px">${escapeHtml(JSON.stringify(data,null,2))}</textarea></details>`;
}

export function buildResumeUrl(gristPageUrl, accessToken, resumeToken) {
  const access=String(accessToken??"").trim(), resume=String(resumeToken??"").trim();
  if(!access || !resume) throw new Error("Le lien de reprise ne peut pas être généré : jeton manquant.");
  let url;
  try { url=new URL(String(gristPageUrl??"")); } catch { throw new Error("Adresse de la page Grist indisponible pour générer le lien de reprise."); }
  if(!/^https?:$/.test(url.protocol) || !/(?:\/o\/docs\/|\/doc\/)/.test(url.pathname)) throw new Error("Adresse Grist invalide pour générer le lien de reprise.");
  url.search=""; url.hash="";
  url.searchParams.set("style","singlePage");
  url.searchParams.set("Acces_",access);
  url.searchParams.set("Reprise_",resume);
  return url.toString();
}


export function normalizeRules(loaded) {
  return (loaded.REGLES_CONDITION ?? []).map(rule=>({
    ...rule,
    Condition_Code:resolveRefCode(rule.Condition_Code,loaded.CONDITIONS ?? [],"Condition_Code"),
    Question_source_Code:resolveRefCode(rule.Question_source_Code,loaded.QUESTIONS ?? [],"Question_Code"),
    Question_comparaison_Code:resolveRefCode(rule.Question_comparaison_Code,loaded.QUESTIONS ?? [],"Question_Code")
  }));
}

function hasRealResponseContext(){return Boolean(requestedParam("Acces_")||requestedResumeToken()||requestedParam("Reponse_")||requestedParam("Campagne_"));}
function storedPreviewVersion(){
  try{return String(localStorage.getItem("gristionnaire.previewVersion")||"").trim()}catch{return ""}
}
function hasExplicitResponseParams(){
  return Boolean(requestedParam("Acces_")||requestedParam("Reprise_")||requestedParam("Reprise")||requestedParam("Reponse_")||requestedParam("Campagne_"));
}
function isInternalGristPreviewContext(){
  // Le widget p/38 ouvert depuis Grist n'est pas un lien répondant singlePage.
  // Les vrais liens générés (PERSONNALISE et LIEN_UNIQUE) utilisent singlePage.
  return Boolean(storedPreviewVersion()) && !hasExplicitResponseParams() && String(requestedParam("style")||"").toLowerCase()!=="singlepage";
}
function requestedPreviewVersion(){
  const explicit=requestedParam("Apercu_")||requestedParam("Preview_");
  if(explicit)return explicit;
  if(isInternalGristPreviewContext())return storedPreviewVersion();
  if(hasRealResponseContext())return "";
  return storedPreviewVersion();
}
function hasExplicitPreviewContext(){return Boolean(requestedParam("Apercu_")||requestedParam("Preview_"));}
function hasAclPersonalizedCampaignContext(def){
  // Acces_ is an ACL LinkKey and is not guaranteed to be exposed to the iframe.
  // A single PERSONNALISE campaign exposed by ACLs is therefore authoritative:
  // it must restore respondent mode so campaign personalization is applied/locked.
  // LIEN_UNIQUE is deliberately excluded here: its mere visibility must never
  // hijack the internal p/38 preview selected from the Concepteur.
  const campaigns=(def?.campaigns??[]).filter(active);
  if(campaigns.length!==1)return false;
  const c=campaigns[0];
  return !isUniqueLinkCampaign(c) && Boolean(codeOf(c.Question_personnalisation_Code) && String(c.Valeur_personnalisation??"").trim());
}
export async function loadDefinition(docApi, selectedRecord=null) {
  const loaded={};
  for (const name of TABLES) {
    try { loaded[name]=rowsFromTable(await docApi.fetchTable(name)); }
    catch (e) { throw new Error(`Table de configuration inaccessible : ${name}\n${e?.message ?? e}`); }
  }
  let versions=loaded.VERSIONS_QUESTIONNAIRES.filter(active);
  let version=null;
  // Une reprise désigne une réponse précise : sa version est prioritaire sur tout
  // contexte de campagne, de session ou de sélection Grist.
  const resumeToken=requestedResumeToken();
  const resumeResponse=resumeToken ? findResponseByResumeToken(loaded.REPONSES,resumeToken) : null;
  if(resumeResponse?.Version_Code!=null && resumeResponse.Version_Code!==""){
    const c=resolveRefCode(resumeResponse.Version_Code,versions,"Version_Code");
    version=versions.find(v=>codeOf(v.Version_Code)===c || String(v.id)===String(codeOf(resumeResponse.Version_Code))) ?? null;
  }
  // Sans reprise, un lien personnalisé est autoritaire : résoudre sa campagne AVANT la version.
  // This avoids opening an unrelated questionnaire when an OWNER can read several campaigns/versions.
  const requestedAccess=requestedParam("Acces_");
  const accessCampaign=requestedAccess
    ? (loaded.CAMPAGNES ?? []).find(c=>active(c) && String(c.Jeton_acces??"").trim()===requestedAccess)
    : null;
  const accessVersion=accessCampaign?.Version_Code;
  if(!version && accessVersion!=null && accessVersion!==""){
    const c=resolveRefCode(accessVersion,versions,"Version_Code");
    version=versions.find(v=>codeOf(v.Version_Code)===c || String(v.id)===String(codeOf(accessVersion))) ?? null;
  }
  // LinkKey Acces_ may be hidden from widget JS. If ACLs expose exactly one
  // active campaign, its version is authoritative over stale preview context.
  const aclCampaigns=(loaded.CAMPAGNES??[]).filter(active);
  // En aperçu interne p/38, la simple visibilité ACL d'une campagne LIEN_UNIQUE
  // ne doit jamais imposer sa version : le Concepteur (previewVersion) reste prioritaire.
  // Sur un vrai lien répondant singlePage, isInternalGristPreviewContext() est faux
  // et la campagne LIEN_UNIQUE conserve donc son comportement normal.
  const aclCampaignHijacksInternalPreview = aclCampaigns.length===1
    && isInternalGristPreviewContext()
    && isUniqueLinkCampaign(aclCampaigns[0]);
  if(!version && aclCampaigns.length===1 && !aclCampaignHijacksInternalPreview){
    const av=aclCampaigns[0].Version_Code,c=resolveRefCode(av,versions,"Version_Code");
    version=versions.find(v=>codeOf(v.Version_Code)===c || String(v.id)===String(codeOf(av))) ?? null;
  }
  const previewVersion=requestedPreviewVersion();
  if(!version && previewVersion){
    version=versions.find(v=>codeOf(v.Version_Code)===previewVersion || String(v.id)===previewVersion) ?? null;
  }
  const candidate = selectedRecord && (selectedRecord.Version_Code ?? selectedRecord.version_Code ?? selectedRecord.id);
  if (!version && candidate != null) {
    const c=codeOf(candidate);
    version=versions.find(v => codeOf(v.Version_Code)===c || String(v.id)===c) ?? null;
  }
  version ??= versions.find(v => /brouillon|active|publi/i.test(String(v.Statut ?? ""))) ?? versions[0] ?? null;
  if (!version) throw new Error("Aucune version de questionnaire disponible.");
  const vc=codeOf(version.Version_Code);
  const byVersion = rows => rows.filter(r => !("Version_Code" in r) || resolveRefCode(r.Version_Code, versions, "Version_Code")===vc);
  const versionQuestions=byVersion(loaded.QUESTIONS).filter(active);
  const dataTables={};
  for(const q of versionQuestions){const src=String(q.TD_Table_Source||"").trim();if(!src||dataTables[src])continue;try{dataTables[src]=rowsFromTable(await docApi.fetchTable(src));}catch{dataTables[src]=[]}}
  return {
    version,
    pages:byVersion(loaded.PAGES).filter(active),
    sections:byVersion(loaded.SECTIONS).filter(active),
    questions:versionQuestions,
    ficheTypes:byVersion(loaded.TYPES_FICHES).filter(active),
    ficheFilters:(loaded.FILTRES_TYPES_FICHES ?? []),
    choices:loaded.CHOIX_QUESTIONS.filter(active),
    matrixColumns:(loaded.COLONNES_MATRICE ?? []).filter(active),
    referentials:loaded.REFERENTIELS.filter(active),
    referentialValues:loaded.VALEURS_REFERENTIELS.filter(active),
    structures:loaded.STRUCTURES.filter(active),
    conditions:byVersion(loaded.CONDITIONS).filter(active),
    rules:normalizeRules(loaded),
    choiceFilters:loaded.FILTRES_CHOIX.filter(active),
    campaigns:byVersion(loaded.CAMPAGNES).filter(active),
    responses:loaded.REPONSES,
    responseElements:loaded.ELEMENTS_REPONSE,
    responseValues:loaded.VALEURS_REPONSE,
    responseSelections:loaded.SELECTIONS_REPONSE,
    dataTables
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

function choiceFiltersForQuestion(q,def) {
  const qc=codeOf(q.Question_Code);
  return sortByOrder((def.choiceFilters ?? []).filter(f=>active(f) && resolveRefCode(f.Question_Code,def.questions,"Question_Code")===qc));
}

function hierarchyCodes(rows,codeCol,parentCol,start,mode) {
  const startCode=codeOf(start);
  if (!startCode) return new Set();
  const children=new Map();
  for (const row of rows ?? []) {
    const code=codeOf(row[codeCol]);
    if (!code) continue;
    const parent=resolveRefCode(row[parentCol],rows,codeCol);
    if (parent) {
      const list=children.get(parent) ?? [];
      list.push(code); children.set(parent,list);
    }
  }
  const direct=children.get(startCode) ?? [];
  const descendants=[];
  const seen=new Set();
  const walk=code=>{
    for (const child of children.get(code) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child); descendants.push(child); walk(child);
    }
  };
  walk(startCode);
  if (mode==="Valeur") return new Set([startCode]);
  if (mode==="Enfants") return new Set(direct);
  if (mode==="Valeur_et_enfants") return new Set([startCode,...direct]);
  if (mode==="Descendants") return new Set(descendants);
  return new Set([startCode,...descendants]);
}

function applyChoiceFilters(q,def,answers,options,sourceRows,codeCol,parentCol) {
  let out=options;
  for (const filter of choiceFiltersForQuestion(q,def)) {
    // Source=Contexte sera branchée quand le contexte sécurisé sera disponible.
    if (String(filter.Source ?? "Question") !== "Question") continue;
    const sourceCode=resolveRefCode(filter.Question_source_Code,def.questions,"Question_Code");
    const selected=answers?.[sourceCode] ?? "";
    if (!selected) { out=[]; continue; }
    const allowed=hierarchyCodes(sourceRows,codeCol,parentCol,selected,String(filter.Mode_filtrage ?? "Valeur_et_descendants"));
    out=out.filter(o=>allowed.has(codeOf(o.value)));
  }
  return out;
}

export function optionsFor(q, def, answers={}) {
  const qc=codeOf(q.Question_Code);
  const local=sortByOrder(def.choices.filter(c=>resolveRefCode(c.Question_Code,def.questions,"Question_Code")===qc))
    .filter(c=>conditionVisible(c.Condition_Code,def,answers,[]))
    .map(c=>({value:codeOf(c.Choix_Code),label:first(c,["Libelle","Libellé","Valeur","Choix_Code"],codeOf(c.Choix_Code)),source:"choice",rowId:c.id,exclusive:isTrue(c.Exclusif)}));
  const rc=resolveRefCode(q.Referentiel_Code,def.referentials,"Referentiel_Code");
  let refs=[];
  if (rc) {
    const ref=def.referentials.find(r=>codeOf(r.Referentiel_Code)===rc);
    const source=String(ref?.Type_source ?? "VALEURS_REFERENTIELS").trim().toUpperCase();
    if (source==="STRUCTURES") {
      const rows=sortByOrder((def.structures ?? []).filter(active));
      refs=applyChoiceFilters(q,def,answers,rows.map(v=>({value:codeOf(v.Structure_Code),label:first(v,["Nom","Libelle","Libellé","Structure_Code"],codeOf(v.Structure_Code)),source:"structure",rowId:v.id,exclusive:false})),rows,"Structure_Code","Parent_Code");
    } else if (source==="VALEURS_REFERENTIELS") {
      const rows=sortByOrder(def.referentialValues.filter(v=>resolveRefCode(v.Referentiel_Code,def.referentials,"Referentiel_Code")===rc && active(v)));
      refs=applyChoiceFilters(q,def,answers,rows.map(v=>({value:codeOf(v.ValeurRef_Code),label:first(v,["Libelle","Libellé","Valeur","ValeurRef_Code"],codeOf(v.ValeurRef_Code)),source:"reference",rowId:v.id,exclusive:false})),rows,"ValeurRef_Code","Parent_Code");
    }
  }
  const seen=new Set();
  return [...refs,...local].filter(o=>{const k=String(o.value);if(seen.has(k))return false;seen.add(k);return true;});
}
export function sanitizeDependentAnswers(def,answers={}) {
  let changed=true, passes=0;
  while (changed && passes++<10) {
    changed=false;
    for (const q of def.questions ?? []) {
      const qc=codeOf(q.Question_Code), current=answers[qc];
      if (current==="" || current==null || !choiceFiltersForQuestion(q,def).length) continue;
      const allowed=new Set(optionsFor(q,def,answers).map(o=>String(o.value)));
      if(Array.isArray(current)){const next=current.filter(v=>allowed.has(String(v)));if(next.length!==current.length){answers[qc]=next;changed=true;}}
      else if (!allowed.has(String(current))) { answers[qc]=""; changed=true; }
    }
  }
  return answers;
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
  const all=sortByOrder((def.ficheTypes ?? []).filter(active)).map(type=>{
    const code=codeOf(type.TypeFiche_Code);
    const parentCode=resolveRefCode(type.Parent_Code,def.ficheTypes,"TypeFiche_Code");
    const questions=sortByOrder((def.questions ?? []).filter(q=>
      active(q) &&
      resolveRefCode(q.TypeFiche_Code,def.ficheTypes,"TypeFiche_Code")===code &&
      resolveRefCode(q.Page_Code,def.pages,"Page_Code")===pageCode
    ));
    return {
      code,parentCode,
      labelSingular:first(type,["Libelle_singulier","Libellé_singulier","Libelle","Nom"],"Fiche"),
      labelPlural:first(type,["Libelle_pluriel","Libellé_pluriel"],"Fiches"),
      counterLabel:first(type,["Libelle_compteur"],""),
      emptyMessage:first(type,["Message_aucune_fiche"],""),
      filterThreshold:(()=>{const n=Number(type.Seuil_affichage_filtres);return !Number.isFinite(n)||n<=0?5:Math.floor(n)})(),
      filterConfigDefined:(def.ficheFilters ?? []).some(f=>resolveRefCode(f.TypeFiche_Code,def.ficheTypes,"TypeFiche_Code")===code),
      filterRows:sortByOrder((def.ficheFilters ?? []).filter(f=>active(f)&&resolveRefCode(f.TypeFiche_Code,def.ficheTypes,"TypeFiche_Code")===code)),
      minimum:Number(type.Minimum || 0),
      maximum:type.Maximum==="" || type.Maximum==null || Number(type.Maximum)<=0 ? null : Number(type.Maximum),
      allowAdd:type.Autoriser_ajout===undefined ? true : isTrue(type.Autoriser_ajout),
      allowDelete:type.Autoriser_suppression===undefined ? true : isTrue(type.Autoriser_suppression),
      titleQuestionCode:resolveRefCode(type.Question_titre_Code,def.questions,"Question_Code"),
      summaryQuestionCodes:resolveRefCodes(type.Question_resume_Code,def.questions,"Question_Code"),
      questions,children:[]
    };
  }).filter(type=>type.questions.length>0);
  const byCode=Object.fromEntries(all.map(t=>[t.code,t]));
  for(const t of all) if(t.parentCode && byCode[t.parentCode]) byCode[t.parentCode].children.push(t);
  return all.filter(t=>!t.parentCode);
}

function findRepeatableType(types,code){for(const t of types??[]){if(t.code===code)return t;const c=findRepeatableType(t.children,code);if(c)return c;}return null;}
function childFiches(type,parentFiche){return (state.fiches[type.code]??[]).filter(f=>String(f.parentElementId??"")===String(parentFiche?.elementId??""));}
function renderSubFiches(parentType,parentFiche,readOnly=false){
  if(!parentFiche?.elementId || !(parentType.children??[]).length) return "";
  return `<div class="subfiches subfiches-inline">${parentType.children.map(type=>{
    const list=childFiches(type,parentFiche);
    const cards=list.map((fiche,index)=>{const card=ficheCardText(type,state.definition,fiche,index);return `<article class="fiche-card subfiche-card"><div class="fiche-card-main"><strong class="fiche-title">${escapeHtml(card.title)}</strong>${card.summaries.length?`<div class="fiche-summary">${card.summaries.map(i=>`<div><span class="fiche-summary-label">${escapeHtml(i.label)} :</span> ${escapeHtml(i.value)}</div>`).join("")}</div>`:""}</div><div class="fiche-actions"><button type="button" class="btn btn-small" data-edit-subfiche="${escapeHtml(type.code)}" data-parent-element="${parentFiche.elementId}" data-sub-index="${index}">${readOnly?"Consulter":"Modifier"}</button>${!readOnly&&type.allowDelete?`<button type="button" class="btn btn-small" data-delete-subfiche="${escapeHtml(type.code)}" data-parent-element="${parentFiche.elementId}" data-sub-index="${index}">Supprimer</button>`:""}</div></article>`}).join("");
    const canAdd=!readOnly&&type.allowAdd&&(type.maximum==null||list.length<type.maximum);
    const ed=state.subFicheEditor?.typeCode===type.code&&String(state.subFicheEditor.parentElementId)===String(parentFiche.elementId)?state.subFicheEditor:null;
    const editorHtml=ed?`<div class="fiche-editor subfiche-editor" data-subfiche-editor="${escapeHtml(type.code)}"><h4>${ed.index==null?`Ajouter ${escapeHtml(type.labelSingular.toLowerCase())}`:`Modifier ${escapeHtml(type.labelSingular.toLowerCase())}`}</h4>${visibleFicheQuestions(type,state.definition,{...state.answers,...(state.ficheEditor?.answers??{}),...ed.answers}).map(q=>renderFicheField(q,ed.answers)).join("")}<div class="fiche-validation-summary" data-subfiche-validation-summary role="alert" hidden></div><div class="fiche-editor-actions"><button type="button" class="btn" data-cancel-subfiche>Annuler</button><button type="button" class="btn btn-primary" data-save-subfiche>Enregistrer la sous-fiche</button></div></div>`:"";
    return `<section class="repeatable subfiche-group" data-subfiche-group="${escapeHtml(type.code)}"><div class="repeatable-heading"><h4>${escapeHtml(type.labelPlural)}</h4><span>${list.length}${type.counterLabel?` ${escapeHtml(type.counterLabel)}`:""}</span></div>${cards||`<p class="empty-fiches">${escapeHtml(type.emptyMessage||`Aucun ${type.labelSingular.toLowerCase()} saisi.`)}</p>`}${canAdd&&!ed?`<button type="button" class="btn btn-primary btn-small" data-add-subfiche="${escapeHtml(type.code)}" data-parent-element="${parentFiche.elementId}">+ Ajouter un ${escapeHtml(type.labelSingular.toLowerCase())}</button>`:""}${editorHtml}</section>`;
  }).join("")}</div>`;
}


export function visibleFicheQuestions(type, def, answers={}) {
  const diagnostics=[];
  // Re-resolve the fiche questions from the authoritative questionnaire definition.
  // A repeatable type embedded in a page can be a derived view; relying only on
  // type.questions made completeness incorrectly report "Complet" when that
  // derived list was absent/stale while the QUESTIONS table still contained the
  // required fiche questions.
  const typeCode=codeOf(type?.code ?? type?.TypeFiche_Code);
  const authoritative=sortByOrder((def.questions ?? []).filter(q=>
    active(q) && resolveRefCode(q.TypeFiche_Code,def.ficheTypes ?? [],"TypeFiche_Code")===typeCode
  ));
  const questions=authoritative.length ? authoritative : (type.questions ?? []);
  applySingleChoiceAutomation(def,answers);
  return questions
    .filter(q=>!isTrue(q.Masquee) && !isTrue(q.Est_ligne_matrice) && !isDisplayBlock(q) && conditionVisible(q.Condition_affichage_Code,def,answers,diagnostics) && !shouldAutoHideSingleChoice(q,def,answers))
    .map(q=>({...q,options:optionsFor(q,def,answers)}));
}

export function buildViewModel(def, answers={}) {
  applySingleChoiceAutomation(def,answers);
  const diagnostics=[];
  const pages=sortByOrder(def.pages).filter(p=>conditionVisible(p.Condition_Code,def,answers,diagnostics)).map(page=>{
    const pc=codeOf(page.Page_Code);
    const sections=sortByOrder(def.sections.filter(s=>resolveRefCode(s.Page_Code,def.pages,"Page_Code")===pc))
      .filter(s=>conditionVisible(s.Condition_Code,def,answers,diagnostics)).map(section=>{
        const sc=codeOf(section.Section_Code);
        const questions=sortByOrder(def.questions.filter(q=>
          resolveRefCode(q.Section_Code,def.sections,"Section_Code")===sc &&
          !resolveRefCode(q.TypeFiche_Code,def.ficheTypes,"TypeFiche_Code") &&
          !isTrue(q.Est_ligne_matrice)
        ))
          .filter(q=>!isTrue(q.Masquee) && conditionVisible(q.Condition_affichage_Code,def,answers,diagnostics) && !shouldAutoHideSingleChoice(q,def,answers))
          .map(q=>({...q, options:optionsFor(q,def,answers)}));
        return {...section,questions};
      });
    return {...page,sections,repeatableTypes:buildRepeatableTypes(def,pc)};
  });
  return {version:def.version,pages,diagnostics};
}

export function allowsPostValidationEdit(version={}) {
  return isTrue(first(version,["Autoriser_modification_apres_validation","Modification_apres_validation","Modifiable_apres_validation"],false));
}
function responseIsLocked(){return String(state.response?.Statut??"").toLowerCase()==="validé" && !allowsPostValidationEdit(state.definition?.version);}

function exportHasValue(value){return !(value==null||value===""||(Array.isArray(value)&&!value.length));}
function exportAnswerLabel(q,value,answers={}){
  if(!exportHasValue(value))return "";
  const labels=new Map(optionsFor(q,state.definition,answers).map(o=>[String(o.value),String(o.label)]));
  if(Array.isArray(value))return value.map(v=>labels.get(String(v))??String(v)).join(", ");
  return labels.get(String(value))??String(value);
}
function exportMatrixModel(q,answers={}){
  const qc=codeOf(q.Question_Code),kind=matrixKind(q),rows=matrixRows(q,state.definition),cols=matrixCols(q,state.definition),data=answers?.[qc]??{};
  if(kind==="radio"||kind==="checkbox"){
    const headers=["Ligne",...cols.map(c=>c.label)];
    const body=rows.map(r=>{const rc=codeOf(r.Question_Code),rv=data?.[rc],selected=kind==="checkbox"?(Array.isArray(rv)?rv.map(String):[]):[String(rv??"")];return [first(r,["Libelle","Libellé","Titre"],rc),...cols.map(c=>selected.includes(String(c.code))?"✓":"")];});
    return {headers,body};
  }
  return {headers:["Ligne",...cols.map(c=>c.label)],body:rows.map(r=>{const rc=codeOf(r.Question_Code),rv=data?.[rc]??{};return [first(r,["Libelle","Libellé","Titre"],rc),...cols.map(c=>rv?.[c.code]??"")];})};
}
function exportQuestionHtml(q,answers={}){
  if(isDisplayBlock(q)||isDataTableQuestion(q))return "";
  const qc=codeOf(q.Question_Code),label=first(q,["Libelle","Libellé","Titre"],qc);
  if(matrixKind(q)){
    const model=exportMatrixModel(q,answers),has=model.body.some(r=>r.slice(1).some(exportHasValue));if(!has)return "";
    return `<div class="q"><div class="ql">${escapeHtml(label)}</div><table><thead><tr>${model.headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${model.body.map(r=>`<tr>${r.map((v,i)=>`<${i?"td":"th"}>${escapeHtml(v)}</${i?"td":"th"}>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  const value=answers?.[qc];if(!exportHasValue(value))return "";
  return `<div class="q"><div class="ql">${escapeHtml(label)}</div><div class="qa">${escapeHtml(exportAnswerLabel(q,value,answers)).replace(/\n/g,"<br>")}</div></div>`;
}
function exportFicheHtml(type,fiche,index){
  const combined={...state.answers,...(fiche.answers??{})},questions=visibleFicheQuestions(type,state.definition,combined),content=questions.map(q=>exportQuestionHtml(q,fiche.answers??{})).join("");
  const children=(type.children??[]).map(child=>{const list=childFiches(child,fiche);if(!list.length)return "";return `<div class="sub"><h5>${escapeHtml(child.labelPlural)}</h5>${list.map((f,i)=>exportFicheHtml(child,f,i)).join("")}</div>`}).join("");
  const card=ficheCardText(type,state.definition,fiche,index);return `<article class="fiche"><h4>${escapeHtml(card.identifier)} — ${escapeHtml(card.title)}</h4>${content||'<div class="empty">Aucune réponse renseignée.</div>'}${children}</article>`;
}
function individualExportModel(){
  if(!state.response)throw new Error("Aucune réponse n’est chargée.");
  const vm=buildViewModel(state.definition,state.answers),campaign=(()=>{try{return selectedCampaign()}catch{return null}})(),version=state.definition.version||{};
  return {vm,campaign,title:first(version,["Titre","Titre_affiche","Nom"],"Questionnaire"),campaignTitle:first(campaign,["Libelle","Libellé","Nom","Titre"],codeOf(campaign?.Campagne_Code)||""),responseCode:codeOf(state.response.Reponse_Code)||String(state.response.id||""),status:String(state.response.Statut||""),created:state.response.Date_creation||state.response.Cree_le||"",modified:state.response.Date_modification||state.response.Modifie_le||"",validated:state.response.Date_validation||state.response.Valide_le||""};
}
function exportDate(v){if(v==null||v==="")return "";const n=Number(v),d=Number.isFinite(n)?new Date(n<1e12?n*1000:n):new Date(v);return isNaN(d)?String(v):d.toLocaleString("fr-FR");}
function individualPrintHtml(){
  const m=individualExportModel(),pages=m.vm.pages.map(page=>{const sections=page.sections.map(sec=>{const qs=sec.questions.map(q=>exportQuestionHtml(q,state.answers)).join("");const st=first(sec,["Titre","Libelle","Libellé","Nom"],"");return (qs?`<section>${st?`<h3>${escapeHtml(st)}</h3>`:""}${qs}</section>`:"")}).join("");const fiches=(page.repeatableTypes??[]).map(type=>{const list=(state.fiches[type.code]??[]).filter(f=>!f.parentElementId);if(!list.length)return "";return `<section><h3>${escapeHtml(type.labelPlural)}</h3>${list.map((f,i)=>exportFicheHtml(type,f,i)).join("")}</section>`}).join("");if(!sections&&!fiches)return "";return `<div class="page"><h2>${escapeHtml(first(page,["Titre","Libelle","Libellé","Nom"],codeOf(page.Page_Code)))}</h2>${sections}${fiches}</div>`}).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(m.title)}</title><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{font:11pt Arial,sans-serif;color:#222;line-height:1.35}h1{font-size:22pt;margin:0 0 4mm}h2{font-size:16pt;border-bottom:2px solid #444;padding-bottom:2mm;margin-top:9mm}h3{font-size:13pt;margin:6mm 0 3mm}h4{font-size:11.5pt;margin:0 0 3mm}.meta{background:#f3f4f6;padding:4mm;border-radius:2mm;margin:0 0 7mm}.q{break-inside:avoid;page-break-inside:avoid;margin:0 0 4mm}.ql{font-weight:700;margin-bottom:1mm;break-after:avoid;page-break-after:avoid}.qa{padding:2.5mm 3mm;background:#f7f7f7;border-left:3px solid #777;white-space:normal;break-inside:avoid;page-break-inside:avoid}.fiche{break-inside:auto;page-break-inside:auto;border:1px solid #bbb;border-radius:2mm;padding:4mm;margin:0 0 5mm}.fiche h4{break-after:avoid;page-break-after:avoid}.sub{margin:4mm 0 0 5mm;border-left:2px solid #bbb;padding-left:4mm}table{width:100%;border-collapse:collapse;margin-top:2mm;font-size:9.5pt;break-inside:auto;page-break-inside:auto}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{border:1px solid #bbb;padding:2mm;text-align:left;vertical-align:top}thead th{background:#eee}.empty{font-style:italic;color:#666}@media print{button{display:none}}</style></head><body><h1>${escapeHtml(m.title)}</h1><div class="meta">${m.campaignTitle?`<div><strong>Campagne :</strong> ${escapeHtml(m.campaignTitle)}</div>`:""}<div><strong>Réponse :</strong> ${escapeHtml(m.responseCode)}</div><div><strong>Statut :</strong> ${escapeHtml(m.status)}</div>${m.validated?`<div><strong>Validation :</strong> ${escapeHtml(exportDate(m.validated))}</div>`:""}${m.modified?`<div><strong>Dernière modification :</strong> ${escapeHtml(exportDate(m.modified))}</div>`:""}</div>${pages}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150));<\/script></body></html>`;
}
function exportMyPdf(){try{const w=window.open("","_blank");if(!w)throw new Error("Le navigateur a bloqué l’ouverture de la vue PDF.");w.document.open();w.document.write(individualPrintHtml());w.document.close();}catch(e){alert(`Export PDF impossible : ${e?.message||e}`)}}
function individualWorkbook(){
  const m=individualExportModel(),main=[["Questionnaire",m.title],["Campagne",m.campaignTitle],["Réponse",m.responseCode],["Statut",m.status],["Création",exportDate(m.created)],["Dernière modification",exportDate(m.modified)],["Validation",exportDate(m.validated)],[],["Page","Section","Question","Réponse"]],fiches=[["Type","N°","Parent","Question","Réponse"]],matrices=[["Contexte","Matrice","Ligne","Colonne","Valeur"]];
  for(const page of m.vm.pages)for(const sec of page.sections)for(const q of sec.questions){if(isDisplayBlock(q)||isDataTableQuestion(q))continue;const qc=codeOf(q.Question_Code);if(matrixKind(q)){const mx=exportMatrixModel(q,state.answers);mx.body.forEach(r=>r.slice(1).forEach((v,i)=>{if(exportHasValue(v))matrices.push(["Principal",first(q,["Libelle","Libellé","Titre"],qc),r[0],mx.headers[i+1],v])}));}else if(exportHasValue(state.answers[qc]))main.push([first(page,["Titre","Libelle","Libellé","Nom"],""),first(sec,["Titre","Libelle","Libellé","Nom"],""),first(q,["Libelle","Libellé","Titre"],qc),exportAnswerLabel(q,state.answers[qc],state.answers)]);}
  const roots=m.vm.pages.flatMap(p=>p.repeatableTypes??[]);const walk=(type,parent="")=>{const list=(state.fiches[type.code]??[]).filter(f=>parent?String(f.parentElementId)===String(parent.elementId):!f.parentElementId);list.forEach((f,i)=>{const combined={...state.answers,...f.answers};for(const q of visibleFicheQuestions(type,state.definition,combined)){const qc=codeOf(q.Question_Code);if(matrixKind(q)){const mx=exportMatrixModel(q,f.answers);mx.body.forEach(r=>r.slice(1).forEach((v,j)=>{if(exportHasValue(v))matrices.push([`${type.labelSingular} ${i+1}`,first(q,["Libelle","Libellé","Titre"],qc),r[0],mx.headers[j+1],v])}));}else if(exportHasValue(f.answers?.[qc]))fiches.push([type.labelSingular,i+1,parent?codeOf(parent.elementId):"",first(q,["Libelle","Libellé","Titre"],qc),exportAnswerLabel(q,f.answers[qc],f.answers)]);}for(const child of type.children??[])walk(child,f);});};roots.forEach(t=>walk(t));return [{name:"REPONSE",rows:main},{name:"FICHES",rows:fiches},{name:"MATRICES",rows:matrices}];
}
function downloadExportBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);}
function exportMyExcel(){try{const m=individualExportModel(),safe=String(m.responseCode||"reponse").replace(/[^a-z0-9_-]+/gi,"_");downloadExportBlob(writeWorkbook(individualWorkbook()),`Mes_reponses_${safe}.xlsx`);}catch(e){alert(`Export Excel impossible : ${e?.message||e}`)}}
function respondentExportButtons(){return !state.previewMode&&state.response?`<button type="button" class="btn btn-small" data-export-my-pdf>Télécharger mes réponses en PDF</button><button type="button" class="btn btn-small" data-export-my-excel>Excel</button>`:"";}

export function responseCompleteness(definition,viewModel,answers={},fiches={},response=null) {
  if (String(response?.Statut ?? "").toLowerCase() === "validé") return {state:"validated",label:"Validé",ready:true};
  const errors=validateWholeResponse(definition,viewModel,answers,fiches,validateQuestion,visibleFicheQuestions);
  const incomplete=Object.keys(errors.principal).length>0 || Object.keys(errors.fiches).length>0;
  return incomplete
    ? {state:"incomplete",label:"Brouillon · À compléter",ready:false}
    : {state:"ready",label:"Brouillon · Prêt à valider",ready:true};
}
function assertResponseEditable(){if(responseIsLocked())throw new Error("Cette réponse a été validée et n’est plus modifiable.");}

export function controlKind(question) {
  const t=String(question.Type_question ?? question.Type ?? "").trim().toLowerCase();
  if (t.includes("texte long")) return "textarea";
  if (t.includes("email")) return "email";
  if (t.includes("montant")) return "number";
  if (t.includes("nombre") || t.includes("numérique") || t.includes("numerique")) return "number";
  if (t.includes("date")) return "date";
  if (t.includes("radio")) return "radio";
  if (t.includes("case")) return "checkbox";
  if (t.includes("liste") || t.includes("déroul") || t.includes("deroul")) return "select";
  return "text";
}

function shouldAutoHideSingleChoice(q,def,answers={}) {
  if(!isTrue(q?.Masquer_si_choix_unique) || controlKind(q)!=="select" || !choiceFiltersForQuestion(q,def).length) return false;
  return optionsFor(q,def,answers).length===1;
}
function applySingleChoiceAutomation(def,answers={}) {
  let changed=true,passes=0;
  while(changed && passes++<10){
    changed=false;
    for(const q of def.questions??[]){
      if(!active(q)||isTrue(q.Est_ligne_matrice)||isDisplayBlock(q)||!isTrue(q.Masquer_si_choix_unique)||controlKind(q)!=="select"||!choiceFiltersForQuestion(q,def).length)continue;
      const opts=optionsFor(q,def,answers),qc=codeOf(q.Question_Code);
      if(opts.length===1 && String(answers[qc]??"")!==String(opts[0].value)){answers[qc]=opts[0].value;changed=true;}
      else if(opts.length!==1 && answers[qc]!=null && answers[qc]!==""){
        const allowed=new Set(opts.map(o=>String(o.value)));
        if(!allowed.has(String(answers[qc]))){answers[qc]="";changed=true;}
      }
    }
  }
  return answers;
}
function finalValidationLabel(version={}){return String(version.Libelle_bouton_validation||"").trim()||"Valider le questionnaire";}
function finalValidationMessage(version={}){return String(version.Message_validation||"").trim()||"Votre questionnaire a bien été validé.";}
function showValidationFeedback(){
  document.querySelector("[data-validation-toast]")?.remove();
  const el=document.createElement("div");el.dataset.validationToast="1";el.setAttribute("role","status");
  el.textContent=`✓ ${finalValidationMessage(state.definition?.version)}`;
  Object.assign(el.style,{position:"fixed",left:"50%",bottom:"28px",transform:"translateX(-50%)",zIndex:"9999",maxWidth:"min(680px,calc(100vw - 32px))",padding:"14px 18px",borderRadius:"10px",background:"#fff",border:"1px solid #b8c5b8",boxShadow:"0 6px 24px rgba(0,0,0,.18)",fontWeight:"600",textAlign:"center"});
  document.body.appendChild(el);setTimeout(()=>el.remove(),5000);
}

function displayBlockKind(q){const t=String(q?.Type_question??q?.Type??"").trim().toLowerCase();return t==="description"?"description":t==="sommaire"?"toc":t==="indicateurs"?"indicators":"";}
function isDisplayBlock(q){return Boolean(displayBlockKind(q));}
function indicatorQuestionCodes(q){try{const x=JSON.parse(q?.Indicateurs_Questions||"[]");return Array.isArray(x)?x.map(String):[]}catch{return []}}
function indicatorConfig(q){try{const x=JSON.parse(q?.Indicateurs_Config||"{}");return x&&typeof x==="object"&&!Array.isArray(x)?x:{}}catch{return {}}}
function indicatorLegacyStats(q){return String(q?.Indicateurs_Stats||"count,percent,sum,mean,min,max").split(",").map(x=>x.trim()).filter(Boolean)}
function indicatorSourceConfig(q,token,kind){const c=indicatorConfig(q)[token];if(c&&Array.isArray(c.stats))return {stats:new Set(c.stats.map(String)),chart:String(c.chart||"none").toLowerCase(),groupBy:String(c.groupBy||"")};const legacy=new Set(indicatorLegacyStats(q));return {stats:kind==="f"?new Set(["total"]):legacy,chart:String(q?.Indicateurs_Graphique||"none").toLowerCase(),groupBy:""}}
function indicatorResponses(){const all=(state.definition?.responses||[]).filter(r=>!isTrue(r.Supprime_logiquement));let campaign=null;try{campaign=selectedCampaign()}catch{}if(!campaign)return [];return all.filter(r=>{const raw=codeOf(r.Campagne_Code);return String(raw)===String(campaign.id)||String(raw)===String(codeOf(campaign.Campagne_Code))})}
function indicatorHasCampaign(){try{return !!selectedCampaign()}catch{return false}}
function indicatorHydratedResponses(){const tables={REPONSES:state.definition?.responses||[],ELEMENTS_REPONSE:state.definition?.responseElements||[],VALEURS_REPONSE:state.definition?.responseValues||[],SELECTIONS_REPONSE:state.definition?.responseSelections||[]};const out=[];for(const r of indicatorResponses()){try{out.push(hydrateResponse(tables,state.definition,codeOf(r.Reponse_Code)||String(r.id)))}catch{}}return out}
function indicatorQuestionType(q){return String(first(q,["Type_question","Type_reponse","Type","Format"],"")).toLowerCase()}
function indicatorNumeric(q){return /nombre|montant|num|decimal|décimal|entier|float|currency/.test(indicatorQuestionType(q))}
function indicatorBar(items,total,showPercent){const max=Math.max(1,...items.map(x=>x.n));return `<div class="indicator-chart indicator-bars">${items.map(x=>`<div style="display:grid;grid-template-columns:minmax(100px,1fr) 3fr auto;gap:8px;align-items:center;margin:7px 0"><span>${escapeHtml(x.label)}</span><span style="height:12px;background:#eef1f4;border-radius:999px;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(2,100*x.n/max)}%;background:currentColor;opacity:.55"></span></span><strong>${x.n}${showPercent&&total?` (${(100*x.n/total).toFixed(1)} %)` : ""}</strong></div>`).join("")}</div>`}
function indicatorPie(items,total){if(!total)return "";let acc=0;const stops=items.map((x,i)=>{const a=acc,b=acc+100*x.n/total;acc=b;return `hsl(${(i*67)%360} 55% 62%) ${a}% ${b}%`}).join(",");return `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div style="width:130px;height:130px;border-radius:50%;background:conic-gradient(${stops})"></div><div>${items.map(x=>`<div>${escapeHtml(x.label)} — <strong>${x.n}</strong> (${(100*x.n/total).toFixed(1)} %)</div>`).join("")}</div></div>`}
function indicatorKpis(parts){return `<div style="display:flex;gap:10px;flex-wrap:wrap">${parts.map(([l,v])=>`<div style="padding:10px 14px;border:1px solid #d9dee5;border-radius:8px"><small>${escapeHtml(l)}</small><div style="font-size:1.25rem;font-weight:700">${typeof v==="number"&&!Number.isInteger(v)?v.toLocaleString(undefined,{maximumFractionDigits:2}):escapeHtml(String(v))}</div></div>`).join("")}</div>`}
function indicatorNumericBlock(vals,stats,title){const nums=vals.map(Number).filter(Number.isFinite).sort((a,b)=>a-b),parts=[];if(stats.has("count"))parts.push(["Valeurs renseignées",nums.length]);if(nums.length){if(stats.has("sum"))parts.push(["Somme",nums.reduce((a,b)=>a+b,0)]);if(stats.has("mean"))parts.push(["Moyenne",nums.reduce((a,b)=>a+b,0)/nums.length]);if(stats.has("median")){const m=Math.floor(nums.length/2);parts.push(["Médiane",nums.length%2?nums[m]:(nums[m-1]+nums[m])/2])}if(stats.has("min"))parts.push(["Minimum",nums[0]]);if(stats.has("max"))parts.push(["Maximum",nums[nums.length-1]])}return `<div class="indicator-card"><h4>${escapeHtml(title)}</h4>${indicatorKpis(parts)}</div>`}
function indicatorCategoricalBlock(src,vals,stats,chart,title){const labels=questionChoiceLabels(src),counts=new Map();for(const v of vals){const arr=Array.isArray(v)?v:[v];for(const z of arr){const k=String(codeOf(z)||z);counts.set(k,(counts.get(k)||0)+1)}}const items=[...counts].map(([k,n])=>({label:labels.get(k)||k,n})).sort((a,b)=>b.n-a.n),total=vals.length,showPercent=stats.has("percent");let graph="";if(chart==="pie")graph=indicatorPie(items,total);else if(chart==="bar")graph=indicatorBar(items,total,showPercent);const table=(stats.has("count")||showPercent)?`<div>${items.map(x=>`<div>${escapeHtml(x.label)}${stats.has("count")?` : <strong>${x.n}</strong>`:""}${showPercent&&total?` (${(100*x.n/total).toFixed(1)} %)` : ""}</div>`).join("")}</div>`:"";return `<div class="indicator-card"><h4>${escapeHtml(title)}</h4>${graph}${table}</div>`}
function indicatorFicheType(code){return (state.definition?.ficheTypes||[]).find(ft=>String(codeOf(ft.TypeFiche_Code))===String(code))}
function indicatorFicheQuestion(code,typeCode){return (state.definition?.questions||[]).find(x=>String(codeOf(x.Question_Code))===String(code)&&String(resolveRefCode(x.TypeFiche_Code,state.definition?.ficheTypes||[],"TypeFiche_Code"))===String(typeCode))}
function indicatorGroupLabel(q,value){const labels=questionChoiceLabels(q);const k=String(codeOf(value)||value||"");return labels.get(k)||k||"(Non renseigné)"}
function indicatorCrossRows(src,groupSrc,pairs,stats){const groups=new Map();for(const [g,v] of pairs){if(g===undefined||g===null||g===""||v===undefined||v===null||v==="")continue;const values=Array.isArray(g)?g:[g];for(const gv of values){const key=indicatorGroupLabel(groupSrc,gv);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(v)}}const rows=[];for(const [label,vals] of groups){if(indicatorNumeric(src)){const nums=vals.map(Number).filter(Number.isFinite).sort((a,b)=>a-b),r={label};if(stats.has("count"))r.count=nums.length;if(nums.length){if(stats.has("sum"))r.sum=nums.reduce((a,b)=>a+b,0);if(stats.has("mean"))r.mean=nums.reduce((a,b)=>a+b,0)/nums.length;if(stats.has("median")){const m=Math.floor(nums.length/2);r.median=nums.length%2?nums[m]:(nums[m-1]+nums[m])/2}if(stats.has("min"))r.min=nums[0];if(stats.has("max"))r.max=nums[nums.length-1]}rows.push(r)}else{const flat=vals.flatMap(v=>Array.isArray(v)?v:[v]);rows.push({label,count:flat.length})}}return rows.sort((a,b)=>String(a.label).localeCompare(String(b.label),"fr"))}
function indicatorCrossBlock(src,groupSrc,pairs,stats,chart,title){const rows=indicatorCrossRows(src,groupSrc,pairs,stats);if(!rows.length)return `<div class="indicator-card"><h4>${escapeHtml(title)}</h4><div class="help">Aucune donnée croisée disponible.</div></div>`;if(!indicatorNumeric(src)){const total=rows.reduce((a,r)=>a+(r.count||0),0),items=rows.map(r=>({label:r.label,n:r.count||0}));const graph=chart==="pie"?indicatorPie(items,total):chart==="bar"?indicatorBar(items,total,stats.has("percent")):"";return `<div class="indicator-card"><h4>${escapeHtml(title)} — par ${escapeHtml(first(groupSrc,["Libelle","Libellé","Titre"],codeOf(groupSrc.Question_Code)))}</h4>${graph}<div>${items.map(x=>`<div>${escapeHtml(x.label)}${stats.has("count")?` : <strong>${x.n}</strong>`:""}${stats.has("percent")&&total?` (${(100*x.n/total).toFixed(1)} %)` : ""}</div>`).join("")}</div></div>`}const cols=[["count","Valeurs renseignées"],["sum","Somme"],["mean","Moyenne"],["median","Médiane"],["min","Minimum"],["max","Maximum"]].filter(([k])=>stats.has(k));const metric=cols.find(([k])=>k!=="count")?.[0]||cols[0]?.[0];const graph=chart==="bar"&&metric?indicatorBar(rows.filter(r=>Number.isFinite(r[metric])).map(r=>({label:r.label,n:r[metric]})),1,false):"";return `<div class="indicator-card"><h4>${escapeHtml(title)} — par ${escapeHtml(first(groupSrc,["Libelle","Libellé","Titre"],codeOf(groupSrc.Question_Code)))}</h4>${graph}<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:6px">${escapeHtml(first(groupSrc,["Libelle","Libellé","Titre"],"Groupe"))}</th>${cols.map(([,l])=>`<th style="text-align:right;padding:6px">${escapeHtml(l)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr><td style="padding:6px;border-top:1px solid #e5e7eb">${escapeHtml(r.label)}</td>${cols.map(([k])=>`<td style="text-align:right;padding:6px;border-top:1px solid #e5e7eb">${r[k]===undefined?"":(typeof r[k]==="number"&&!Number.isInteger(r[k])?r[k].toLocaleString(undefined,{maximumFractionDigits:2}):escapeHtml(String(r[k])))}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`}

function renderIndicators(q){const tokens=indicatorQuestionCodes(q),hydrated=indicatorHydratedResponses(),title=first(q,["Libelle","Libellé","Titre"],"Indicateurs"),blocks=[];if(!indicatorHasCampaign())return `<section class="content-indicators" id="indicator-${escapeHtml(codeOf(q.Question_Code))}" data-display-block="${escapeHtml(codeOf(q.Question_Code))}"><h3 style="${escapeHtml(labelStyle(q))}">📊 ${escapeHtml(title)}</h3><div class="help">Aucune campagne n’est identifiable dans cet aperçu. Les indicateurs ne mélangent pas automatiquement les données de plusieurs campagnes. Ouvrez un lien de campagne pour afficher ses résultats.</div></section>`;for(const raw of tokens){let kind="q",typeCode="",qc=raw;if(raw.startsWith("f:")){kind="f";typeCode=raw.slice(2)}else if(raw.startsWith("fq:")){kind="fq";const rest=raw.slice(3),i=rest.indexOf(":");if(i<0)continue;typeCode=rest.slice(0,i);qc=rest.slice(i+1)}else if(raw.startsWith("q:"))qc=raw.slice(2);const cfg=indicatorSourceConfig(q,raw,kind);if(kind==="f"){const ft=indicatorFicheType(typeCode);if(!ft)continue;const counts=hydrated.map(h=>(h.fiches?.[typeCode]||[]).length),total=counts.reduce((a,b)=>a+b,0),withAny=counts.filter(n=>n>0).length,parts=[];if(cfg.stats.has("total"))parts.push([resolveRefCode(ft.Parent_Code,state.definition?.ficheTypes||[],"TypeFiche_Code")?"Nombre total de sous-fiches":"Nombre total de fiches",total]);if(cfg.stats.has("withAny"))parts.push(["Répondants avec au moins une fiche",withAny]);if(counts.length&&cfg.stats.has("mean"))parts.push(["Nombre moyen de fiches par répondant",total/counts.length]);if(counts.length&&cfg.stats.has("min"))parts.push(["Nombre minimum de fiches par répondant",Math.min(...counts)]);if(counts.length&&cfg.stats.has("max"))parts.push(["Nombre maximum de fiches par répondant",Math.max(...counts)]);blocks.push(`<div class="indicator-card"><h4>${escapeHtml(first(ft,["Libelle_pluriel","Libellé_pluriel","Libelle_singulier","Libellé_singulier","Libelle","Nom"],typeCode))}</h4>${indicatorKpis(parts)}</div>`);continue}let src,vals,pairs=[];if(kind==="fq"){src=indicatorFicheQuestion(qc,typeCode);if(!src)continue;const rows=hydrated.flatMap(h=>(h.fiches?.[typeCode]||[]));vals=rows.map(f=>f.answers?.[qc]).filter(v=>v!==undefined&&v!==null&&v!==""&&!(Array.isArray(v)&&!v.length));if(cfg.groupBy)pairs=rows.map(f=>[f.answers?.[cfg.groupBy],f.answers?.[qc]])}else{src=(state.definition?.questions||[]).find(x=>String(codeOf(x.Question_Code))===String(qc)&&!resolveRefCode(x.TypeFiche_Code,state.definition?.ficheTypes||[],"TypeFiche_Code"));if(!src)continue;vals=hydrated.map(h=>h.principalAnswers?.[qc]).filter(v=>v!==undefined&&v!==null&&v!==""&&!(Array.isArray(v)&&!v.length));if(cfg.groupBy)pairs=hydrated.map(h=>[h.principalAnswers?.[cfg.groupBy],h.principalAnswers?.[qc]])}const ft=kind==="fq"?indicatorFicheType(typeCode):null,labelText=`${kind==="fq"&&ft?`${first(ft,["Libelle_singulier","Libellé_singulier","Libelle","Nom"],typeCode)} — `:""}${first(src,["Libelle","Libellé","Titre"],qc)}`;if(cfg.groupBy){const groupSrc=kind==="fq"?indicatorFicheQuestion(cfg.groupBy,typeCode):(state.definition?.questions||[]).find(x=>String(codeOf(x.Question_Code))===String(cfg.groupBy)&&!resolveRefCode(x.TypeFiche_Code,state.definition?.ficheTypes||[],"TypeFiche_Code"));if(groupSrc){blocks.push(indicatorCrossBlock(src,groupSrc,pairs,cfg.stats,cfg.chart,labelText));continue}}blocks.push(indicatorNumeric(src)?indicatorNumericBlock(vals,cfg.stats,labelText):indicatorCategoricalBlock(src,vals,cfg.stats,cfg.chart,labelText))}return `<section class="content-indicators" id="indicator-${escapeHtml(codeOf(q.Question_Code))}" data-display-block="${escapeHtml(codeOf(q.Question_Code))}"><h3 style="${escapeHtml(labelStyle(q))}">📊 ${escapeHtml(title)}</h3><div style="display:grid;gap:14px">${blocks.join("")||'<div class="help">Aucune donnée disponible pour les indicateurs sélectionnés dans cette campagne.</div>'}</div></section>`}
function personalizedDescriptionText(q,answers){const fallback=first(q,["Aide","Description","Texte_aide"],"");if(!isTrue(q.MP_Actif))return fallback;const rules=(()=>{try{const x=JSON.parse(q.MP_Regles||"[]");return Array.isArray(x)?x:[]}catch{return []}})(),source=String(q.MP_Question_Source||""),srcQ=(state.definition?.questions||[]).find(x=>codeOf(x.Question_Code)===source);let value=source?answers?.[source]:"";if((value===""||value==null)&&srcQ&&campaignLocksQuestion(srcQ)){const p=campaignPersonalization();if(p&&String(p.questionCode)===source)value=p.value}value=String(codeOf(value)||value||"");let hit=rules.find(r=>String(r.value)===value);if(!hit&&isTrue(q.MP_Heritage_Descendants)&&value&&srcQ){hit=rules.find(r=>hierarchyMatchSet(String(r.value),"value_descendants",srcQ).has(value))}return String(hit?.text??q.MP_Texte_Defaut??fallback??"")}


function campaignMode(c){return String(c?.Mode_diffusion||"PERSONNALISE").trim().toUpperCase()||"PERSONNALISE";}
function isUniqueLinkCampaign(c){return campaignMode(c)==="LIEN_UNIQUE";}
function campaignPersonalization(){
  if(!state.definition)return null;
  let campaign=null;
  try{campaign=selectedCampaign()}catch{return null}
  const questionCode=resolveRefCode(campaign?.Question_personnalisation_Code,state.definition.questions,"Question_Code");
  const raw=String(campaign?.Valeur_personnalisation??"").trim();
  if(!questionCode||raw==="")return null;
  const q=(state.definition.questions??[]).find(x=>String(codeOf(x.Question_Code))===String(questionCode));
  const storedLabel=String(campaign?.Valeur_personnalisation_Libelle??"").trim();
  let value=raw, label=storedLabel||raw;
  if(q){
    // A question backed by a referential must resolve campaign personalization
    // against the CURRENT referential first. Old CHOIX_QUESTIONS rows may still
    // exist after a question is migrated to a referential; letting those win
    // would inject a Choix_Code (e.g. an old A1 choice id) instead of the
    // Structure_Code/ValueRef_Code expected by hierarchical descendant filters.
    const rc=resolveRefCode(q.Referentiel_Code,state.definition.referentials,"Referentiel_Code");
    let resolved=false;
    if(rc){
      const ref=(state.definition.referentials??[]).find(r=>codeOf(r.Referentiel_Code)===rc);
      const source=String(ref?.Type_source??"VALEURS_REFERENTIELS").trim().toUpperCase();
      const rows=source==="STRUCTURES" ? (state.definition.structures??[]) : (state.definition.referentialValues??[]).filter(v=>resolveRefCode(v.Referentiel_Code,state.definition.referentials,"Referentiel_Code")===rc);
      const codeCol=source==="STRUCTURES"?"Structure_Code":"ValeurRef_Code";
      const row=rows.find(r=>[codeOf(r[codeCol]),String(r.Valeur??""),String(r.Nom??""),String(r.Libelle??r["Libellé"]??"")].some(v=>String(v)===raw || (storedLabel&&String(v)===storedLabel)));
      if(row){
        value=String(codeOf(row[codeCol]));
        label=String(first(row,["Nom","Libelle","Libellé","Valeur",codeCol],storedLabel||raw));
        resolved=true;
      }
    }
    if(!resolved){
      const choice=(state.definition.choices??[]).find(c=>
        resolveRefCode(c.Question_Code,state.definition.questions,"Question_Code")===questionCode &&
        [codeOf(c.Choix_Code),String(c.Valeur??""),String(c.Libelle??c["Libellé"]??"")].some(v=>String(v)===raw || (storedLabel&&String(v)===storedLabel))
      );
      if(choice){
        value=String(codeOf(choice.Choix_Code));
        label=String(choice.Libelle??choice["Libellé"]??choice.Valeur??storedLabel??raw);
      } else {
        const options=optionsFor(q,state.definition,state.answers);
        const match=options.find(o=>[raw,storedLabel].filter(Boolean).some(v=>String(o.value)===String(v)||String(o.label)===String(v)));
        if(match){value=String(match.value);label=String(match.label??storedLabel??raw);}
      }
    }
  }
  return {campaign,questionCode,value,label};
}
function applyCampaignPersonalization(){const p=campaignPersonalization();if(p)state.answers[p.questionCode]=p.value;return p}
function campaignLocksQuestion(q){const p=campaignPersonalization();return Boolean(p&&p.questionCode===codeOf(q.Question_Code))}

function renderControl(q, answers=state.answers, ficheMode=false) {
  const code=codeOf(q.Question_Code), kind=controlKind(q), value=answers[code] ?? "", locked=!ficheMode&&campaignLocksQuestion(q), readOnly=isTrue(q.Lecture_seule)||locked;
  const attrs=[
    `data-${ficheMode?"fiche-":""}question="${escapeHtml(code)}"`,
    q.Valeur_min!==""&&q.Valeur_min!=null?`min="${escapeHtml(q.Valeur_min)}"`:"",
    q.Valeur_max!==""&&q.Valeur_max!=null?`max="${escapeHtml(q.Valeur_max)}"`:"",
    q.Longueur_min!==""&&q.Longueur_min!=null?`minlength="${escapeHtml(q.Longueur_min)}"`:"",
    q.Longueur_max!==""&&q.Longueur_max!=null&&Number(q.Longueur_max)>0?`maxlength="${escapeHtml(q.Longueur_max)}"`:"",
    readOnly?"disabled":""
  ].filter(Boolean).join(" ");
  if (kind==="textarea") return `<textarea ${attrs}>${escapeHtml(value)}</textarea>`;
  if (kind==="select") {const forced=locked?campaignPersonalization():null;const opts=[...(q.options??[])];if(locked&&forced&&String(forced.value)!==""&&!opts.some(o=>String(o.value)===String(forced.value)))opts.unshift({value:forced.value,label:forced.label||forced.value});return `<div class="select-group"><select ${attrs}><option value="">— Sélectionner —</option>${opts.map(o=>`<option value="${escapeHtml(o.value)}"${String(value)===String(o.value)?" selected":""}>${escapeHtml(o.label)}</option>`).join("")}</select>${!readOnly?`<button type="button" class="clear-answer" data-${ficheMode?"clear-fiche-question":"clear-question"}="${escapeHtml(code)}">Effacer la réponse</button>`:""}</div>`;}
  if (kind==="radio") return `<div class="radio-group">${q.options.map(o=>`<label class="radio-option"><input type="radio" name="${escapeHtml(code)}" data-${ficheMode?"fiche-":""}question="${escapeHtml(code)}" value="${escapeHtml(o.value)}"${String(value)===String(o.value)?" checked":""}${readOnly?" disabled":""}><span>${escapeHtml(o.label)}</span></label>`).join("")}${!readOnly?`<button type="button" class="clear-answer" data-${ficheMode?"clear-fiche-question":"clear-question"}="${escapeHtml(code)}">Effacer la réponse</button>`:""}</div>`;
  if (kind==="checkbox") {const selected=new Set(Array.isArray(value)?value.map(String):value?[String(value)]:[]);return `<div class="checkbox-group">${q.options.map(o=>`<label class="radio-option"><input type="checkbox" data-${ficheMode?"fiche-":""}question="${escapeHtml(code)}" value="${escapeHtml(o.value)}" data-exclusive="${o.exclusive?"1":"0"}"${selected.has(String(o.value))?" checked":""}${readOnly?" disabled":""}><span>${escapeHtml(o.label)}</span></label>`).join("")}${!readOnly?`<button type="button" class="clear-answer" data-${ficheMode?"clear-fiche-question":"clear-question"}="${escapeHtml(code)}">Effacer la réponse</button>`:""}</div>`;}
  return `<input type="${kind}" ${attrs} value="${escapeHtml(value)}"${kind==="number" && q.Nb_decimales!=null && q.Nb_decimales!=="" ? ` step="${1/(10**Number(q.Nb_decimales))}"` : ""}>`;
}


function matrixKind(q){
  const t=String(q?.Type_question ?? q?.Type ?? "").trim().toLowerCase();
  if(!t.includes("matrice")) return "";
  if(t.includes("checkbox")) return "checkbox";
  if(t.includes("radio")) return "radio";
  if(t.includes("nombre")||t.includes("numérique")||t.includes("numerique")) return "number";
  if(t.includes("texte")) return "text";
  return "";
}
function matrixRows(q,def){
  const qc=codeOf(q.Question_Code);
  return sortByOrder((def.questions??[]).filter(r=>active(r)&&isTrue(r.Est_ligne_matrice)&&resolveRefCode(r.Question_parente_Code,def.questions,"Question_Code")===qc));
}
function matrixCols(q,def){
  const qc=codeOf(q.Question_Code);
  if(["radio","checkbox"].includes(matrixKind(q))) return sortByOrder((def.choices??[]).filter(c=>active(c)&&resolveRefCode(c.Question_Code,def.questions,"Question_Code")===qc)).map(c=>({id:c.id,code:codeOf(c.Choix_Code),label:first(c,["Libelle","Libellé","Valeur","Choix_Code"],codeOf(c.Choix_Code)),exclusive:isTrue(c.Exclusif)}));
  return sortByOrder((def.matrixColumns??[]).filter(c=>active(c)&&resolveRefCode(c.Question_Code,def.questions,"Question_Code")===qc)).map(c=>({id:c.id,code:codeOf(c.ColonneMatrice_Code),label:first(c,["Libelle","Libellé","ColonneMatrice_Code"],codeOf(c.ColonneMatrice_Code)),required:isTrue(c.Obligatoire),min:c.Minimum,max:c.Maximum,decimals:c.Decimales,maxLength:c.Longueur_max}));
}
function matrixValue(answers,qc,rc,cc){return answers?.[qc]?.[rc]?.[cc] ?? "";}
function renderMatrix(q,answers=state.answers,ficheMode=false){
  const kind=matrixKind(q), qc=codeOf(q.Question_Code), rows=matrixRows(q,state.definition), cols=matrixCols(q,state.definition);
  const ro=isTrue(q.Lecture_seule)||responseIsLocked();
  if(!rows.length||!cols.length) return `<div class="matrix-empty">Matrice à configurer : ${!rows.length?"aucune ligne":"aucune colonne"}.</div>`;
  const head=cols.map(c=>`<th scope="col">${escapeHtml(c.label)}</th>`).join("");
  const body=rows.map(r=>{const rc=codeOf(r.Question_Code); const cells=cols.map(c=>{const v=kind==="radio"?(answers?.[qc]?.[rc] ?? ""):matrixValue(answers,qc,rc,c.code); const base=`data-matrix-question="${escapeHtml(qc)}" data-matrix-row="${escapeHtml(rc)}" data-matrix-col="${escapeHtml(c.code)}"${ficheMode?' data-matrix-fiche="1"':''}`;
    if(kind==="radio") return `<td><input type="radio" name="mx_${escapeHtml(qc)}_${escapeHtml(rc)}" ${base} value="${escapeHtml(c.code)}"${String(v)===String(c.code)?" checked":""}${ro?" disabled":""}><span class="matrix-mobile-label">${escapeHtml(c.label)}</span></td>`;
    if(kind==="checkbox"){const arr=Array.isArray(answers?.[qc]?.[rc])?answers[qc][rc]:[];return `<td><input type="checkbox" ${base} value="${escapeHtml(c.code)}" data-exclusive="${c.exclusive?"1":"0"}"${arr.map(String).includes(String(c.code))?" checked":""}${ro?" disabled":""}><span class="matrix-mobile-label">${escapeHtml(c.label)}</span></td>`;}
    const attrs=[c.min!==""&&c.min!=null?`min="${escapeHtml(c.min)}"`:"",c.max!==""&&c.max!=null?`max="${escapeHtml(c.max)}"`:"",kind==="number"&&c.decimals!==""&&c.decimals!=null?`step="${1/(10**Number(c.decimals))}"`:"",kind==="text"&&Number(c.maxLength)>0?`maxlength="${escapeHtml(c.maxLength)}"`:"",ro?"disabled":""].filter(Boolean).join(" ");
    return `<td><span class="matrix-mobile-label">${escapeHtml(c.label)}</span><input class="matrix-input" type="${kind}" ${base} ${attrs} value="${escapeHtml(v)}"></td>`;
  }).join("");
  const total=kind==="number"&&isTrue(q.Afficher_total_ligne)?`<td class="matrix-total" data-matrix-row-total="${escapeHtml(qc)}:${escapeHtml(rc)}">0</td>`:"";
  return `<tr><th scope="row">${escapeHtml(first(r,["Libelle","Libellé","Titre"],rc))}${isRequiredQuestion(r)?' <span class="required">*</span>':""}</th>${cells}${total}</tr>`;}).join("");
  const totalHead=kind==="number"&&isTrue(q.Afficher_total_ligne)?'<th scope="col">Total</th>':"";
  const foot=kind==="number"&&isTrue(q.Afficher_total_colonne)?`<tfoot><tr><th scope="row">Total</th>${cols.map(c=>`<td class="matrix-total" data-matrix-col-total="${escapeHtml(qc)}:${escapeHtml(c.code)}">0</td>`).join("")}${isTrue(q.Afficher_total_ligne)?`<td class="matrix-total" data-matrix-grand-total="${escapeHtml(qc)}">0</td>`:""}</tr></tfoot>`:"";
  return `<div class="matrix-wrap" data-matrix="${escapeHtml(qc)}"><table class="matrix-table"><thead><tr><th></th>${head}${totalHead}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
}

function isDataTableQuestion(q){return String(q?.Type_question??q?.Type??"").toLowerCase()==="tableau_donnees"}
function dataTableColumns(q){try{return JSON.parse(q?.TD_Columns_Config||"[]").filter(c=>c.show!==false).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0))}catch{return []}}
function dataContextValue(q,answers){if(String(q.TD_Mode||"all")!=="personalized")return "";if(String(q.TD_Context_Source||"campaign")==="question"){const questionCode=String(q.TD_Context_Question||""),raw=answers?.[questionCode]??"";if(raw===""||raw==null)return "";const choice=(state.definition?.choices||[]).find(c=>resolveRefCode(c.Question_Code,state.definition?.questions||[],"Question_Code")===questionCode&&String(codeOf(c.Choix_Code))===String(codeOf(raw)));if(choice){const business=first(choice,["Valeur"],"");if(String(business??"").trim())return String(business).trim()}return codeOf(raw)||String(raw)}const rec=state.selectedRecord||{},campaign=(state.definition?.campaigns||[]).length===1?(state.definition.campaigns||[])[0]:null;return codeOf(rec.Valeur_personnalisation??campaign?.Valeur_personnalisation??rec.Structure_Code??rec.Structure??rec.Contexte_Code??rec.Unite_Code??campaign?.Structure_Code??"")}
function hierarchySourceForQuestion(q){
  const rc=resolveRefCode(q?.Referentiel_Code,state.definition?.referentials||[],"Referentiel_Code");
  if(!rc)return null;
  const rr=(state.definition?.referentials||[]).find(r=>codeOf(r.Referentiel_Code)===rc);
  const source=String(rr?.Type_source??"VALEURS_REFERENTIELS").trim().toUpperCase();
  if(source==="STRUCTURES")return{rows:state.definition?.structures||[],codeCol:"Structure_Code",parentCol:"Parent_Code",businessCol:"Structure_Code"};
  const rows=(state.definition?.referentialValues||[]).filter(v=>resolveRefCode(v.Referentiel_Code,state.definition?.referentials||[],"Referentiel_Code")===rc&&active(v));
  return{rows,codeCol:"ValeurRef_Code",parentCol:"Parent_Code",businessCol:"Code"};
}
function hierarchyMatchSet(value,mode,q){
  const start=String(codeOf(value)||"");if(!start)return new Set();if(mode==="exact")return new Set([start]);
  const src=hierarchySourceForQuestion(q);if(!src?.rows?.length)return new Set([start]);
  const {rows,codeCol,parentCol,businessCol}=src,byAny=new Map();
  for(const r of rows){const id=String(codeOf(r[codeCol])||"");if(!id)continue;byAny.set(id,id);const business=String(r[businessCol]??"").trim();if(business)byAny.set(business,id)}
  const startId=byAny.get(start)||start,children=new Map();
  for(const r of rows){const c=String(codeOf(r[codeCol])||"");const p=String(resolveRefCode(r[parentCol],rows,codeCol)||"");if(p&&c){const a=children.get(p)||[];a.push(c);children.set(p,a)}}
  const ids=new Set([startId]),direct=children.get(startId)||[];direct.forEach(x=>ids.add(x));
  if(mode==="value_descendants"){const stack=[...direct];while(stack.length){const x=stack.pop();for(const c of children.get(x)||[])if(!ids.has(c)){ids.add(c);stack.push(c)}}}
  const out=new Set();for(const r of rows){const id=String(codeOf(r[codeCol])||"");if(!ids.has(id))continue;out.add(id);const business=String(r[businessCol]??"").trim();if(business)out.add(business)}return out;
}
function dataTotalColumns(q){try{const v=JSON.parse(q?.TD_Total_Columns||"[]");return Array.isArray(v)?v:[]}catch{return []}}
function parseDataNumber(v){if(typeof v==="number")return Number.isFinite(v)?v:null;let x=String(v??"").trim().replace(/\s/g,"").replace(/€/g,"");if(!x)return null;if(x.includes(",")&&x.includes(".")){if(x.lastIndexOf(",")>x.lastIndexOf("."))x=x.replace(/\./g,"").replace(",",".");else x=x.replace(/,/g,"")}else x=x.replace(",",".");const n=Number(x);return Number.isFinite(n)?n:null}
function renderDataTable(q,answers){const src=String(q.TD_Table_Source||""),all=state.definition?.dataTables?.[src]||[],cols=dataTableColumns(q);if(!src||!cols.length)return `<div class="data-table-empty">Tableau de données non configuré.</div>`;let rows=all;if(String(q.TD_Mode||"all")==="personalized"){const value=dataContextValue(q,answers),sourceQuestion=String(q.TD_Context_Source||"campaign")==="question"?(state.definition?.questions||[]).find(x=>codeOf(x.Question_Code)===String(q.TD_Context_Question||"")):(()=>{const rec=state.selectedRecord||{},campaign=(state.definition?.campaigns||[]).length===1?(state.definition.campaigns||[])[0]:null,raw=rec.Question_personnalisation_Code??campaign?.Question_personnalisation_Code;return(state.definition?.questions||[]).find(x=>String(x.id)===String(codeOf(raw))||codeOf(x.Question_Code)===String(codeOf(raw)))})();const allowed=hierarchyMatchSet(value,String(q.TD_Hierarchy_Mode||"exact"),sourceQuestion),key=String(q.TD_Key_Column||"");rows=value&&key?all.filter(r=>allowed.has(String(codeOf(r[key])??r[key]??""))):[]}if(!rows.length)return `<div class="data-table-empty">${escapeHtml(q.TD_NoData_Message||"Aucune donnée à afficher.")}</div>`;const totalCols=dataTotalColumns(q),showTotal=Boolean(q.TD_Show_Total);const totalRow=showTotal?`<tr class="data-total-row">${cols.map((c,i)=>{if(totalCols.includes(c.id)){const nums=rows.map(r=>parseDataNumber(r[c.id])).filter(n=>n!==null);return `<td><strong>${escapeHtml(nums.reduce((a,b)=>a+b,0))}</strong></td>`}return `<td>${i===0?`<strong>${escapeHtml(q.TD_Total_Label||"Total")}</strong>`:""}</td>`}).join("")}</tr>`:"";return `<div class="readonly-data-table"><table><thead><tr>${cols.map(c=>`<th>${escapeHtml(c.label||c.id)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${escapeHtml(r[c.id]??"")}</td>`).join("")}</tr>`).join("")}${totalRow}</tbody></table></div>`}

function renderQuestionControl(q,answers=state.answers,ficheMode=false){return isDataTableQuestion(q)?renderDataTable(q,answers):matrixKind(q)?renderMatrix(q,answers,ficheMode):renderControl(q,answers,ficheMode);}
function matrixErrors(q,answers={}){
  const errors=[]; const qc=codeOf(q.Question_Code), kind=matrixKind(q), rows=matrixRows(q,state.definition), cols=matrixCols(q,state.definition), data=answers?.[qc]??{};
  for(const r of rows){const rc=codeOf(r.Question_Code), row=data[rc]??{};
    if(kind==="radio"||kind==="checkbox"){const empty=kind==="checkbox"?!(Array.isArray(row)&&row.length):!row; if(isRequiredQuestion(r)&&empty)errors.push(`${first(r,["Libelle","Libellé","Titre"],rc)} : réponse obligatoire.`); continue;}
    for(const c of cols){const v=row?.[c.code]??""; if((isRequiredQuestion(r)||c.required)&&(v===""||v==null))errors.push(`${first(r,["Libelle","Libellé","Titre"],rc)} / ${c.label} : champ obligatoire.`); if(v!==""&&kind==="number"){const n=Number(v);if(!Number.isFinite(n))errors.push(`${c.label} : nombre invalide.`);else{if(c.min!==""&&c.min!=null&&n<Number(c.min))errors.push(`${c.label} : minimum ${c.min}.`);if(c.max!==""&&c.max!=null&&n>Number(c.max))errors.push(`${c.label} : maximum ${c.max}.`);}}}
  } return errors;
}
function updateMatrixTotals(root=document){
  root.querySelectorAll('[data-matrix]').forEach(w=>{const qc=w.dataset.matrix;const vals=[...w.querySelectorAll('input[data-matrix-question]')].filter(i=>i.type==='number');const n=i=>{const x=Number(i.value);return Number.isFinite(x)?x:0};
    w.querySelectorAll('[data-matrix-row-total]').forEach(el=>{const rc=el.dataset.matrixRowTotal.split(':').slice(1).join(':');el.textContent=String(vals.filter(i=>i.dataset.matrixRow===rc).reduce((a,i)=>a+n(i),0));});
    w.querySelectorAll('[data-matrix-col-total]').forEach(el=>{const cc=el.dataset.matrixColTotal.split(':').slice(1).join(':');el.textContent=String(vals.filter(i=>i.dataset.matrixCol===cc).reduce((a,i)=>a+n(i),0));});
    const g=w.querySelector('[data-matrix-grand-total]');if(g)g.textContent=String(vals.reduce((a,i)=>a+n(i),0));
  });
}


function renderFicheField(q, answers) {
  const qc=codeOf(q.Question_Code);
  return `<div class="field" data-fiche-field="${escapeHtml(qc)}"><label style="${escapeHtml(labelStyle(q))}">${escapeHtml(first(q,["Libelle","Libellé","Titre"],qc))}${isRequiredQuestion(q)?' <span class="required" aria-label="obligatoire">*</span>':""}</label>${q.Aide?`<div class="help">${escapeHtml(q.Aide)}</div>`:""}${renderQuestionControl(q,answers,true)}<div class="error" data-fiche-error="${escapeHtml(qc)}"></div></div>`;
}
function displayFicheAnswer(type,def,fiche,questionCode) {
  if(!questionCode)return "";
  const q=(type.questions??[]).find(x=>codeOf(x.Question_Code)===codeOf(questionCode));
  if(!q)return "";
  const value=fiche.answers?.[codeOf(q.Question_Code)];
  if(value==null||value===""||(Array.isArray(value)&&!value.length))return "";
  const labels=new Map(optionsFor(q,def,{...(fiche.answers??{})}).map(o=>[String(o.value),String(o.label)]));
  if(Array.isArray(value))return value.map(v=>labels.get(String(v))??String(v)).join(", ");
  return labels.get(String(value))??String(value);
}
function ficheCardText(type,def,fiche,index) {
  const fallback=`${type.labelSingular} ${index+1}`;
  const summaries=(type.summaryQuestionCodes??[]).map(questionCode=>{
    const q=(type.questions??[]).find(x=>codeOf(x.Question_Code)===codeOf(questionCode));
    if(!q)return null;
    const value=displayFicheAnswer(type,def,fiche,questionCode);
    if(!value)return null;
    return {label:first(q,["Libelle","Libellé","Titre"],codeOf(q.Question_Code)),value};
  }).filter(Boolean);
  return {identifier:`Fiche ${String(index+1).padStart(3,"0")}`,title:displayFicheAnswer(type,def,fiche,type.titleQuestionCode)||fallback,summaries};
}

export function filterAndSortFiches(list=[], ui={}) {
  const query=String(ui.query ?? "").trim().toLocaleLowerCase("fr");
  const filters=ui.filters ?? {};
  let rows=list.map((fiche,index)=>({fiche,index}));
  if(query) rows=rows.filter(({fiche})=>Object.values(fiche.answers ?? {}).some(v=>(Array.isArray(v)?v.join(" "):String(v ?? "")).toLocaleLowerCase("fr").includes(query)));
  for (const [questionCode,wanted] of Object.entries(filters)) {
    if (wanted!=="" && wanted!=null) rows=rows.filter(({fiche})=>(Array.isArray(fiche.answers?.[questionCode])?fiche.answers[questionCode].map(String).includes(String(wanted)):String(fiche.answers?.[questionCode] ?? "")===String(wanted)));
  }
  const sort=ui.sort ?? "recent";
  if(sort==="oldest") rows.sort((a,b)=>a.index-b.index);
  else rows.sort((a,b)=>b.index-a.index);
  return rows;
}

function ficheFilterQuestions(type,def) {
  const configured=sortByOrder(type.filterRows ?? []);
  if(type.filterConfigDefined){
    const wanted=configured.map(f=>resolveRefCode(f.Question_Code,def.questions,"Question_Code"));
    return wanted.map(qc=>(type.questions ?? []).find(q=>codeOf(q.Question_Code)===qc)).filter(Boolean);
  }
  // Backward compatibility: questionnaires created before FILTRES_TYPES_FICHES
  // keep the former automatic categorical filters until an explicit selection exists.
  const explicit=(type.questions ?? []).filter(q=>isTrue(first(q,["Filtre_fiche","Utiliser_filtre_fiche","Afficher_filtre_fiche"],false)));
  if (explicit.length) return explicit;
  return (type.questions ?? []).filter(q=>["select","radio"].includes(controlKind(q)));
}
function ficheFilterTools(type,ui,def,list=[]) {
  return ficheFilterQuestions(type,def).map(q=>{
    const qc=codeOf(q.Question_Code), current=ui.filters?.[qc] ?? "";
    const label=first(q,["Libelle","Libellé","Titre"],qc);
    // A list filter must reflect values that actually exist in saved fiches.
    // Using optionsFor(q,def) without fiche answers can yield no options for
    // dynamically-filtered questions (e.g. a child referential).
    const values=new Map();
    for(const fiche of list){
      const raw=fiche.answers?.[qc];
      const raws=Array.isArray(raw)?raw:[raw];
      for(const value of raws){
        if(value==null||value==="")continue;
        const key=String(value);
        if(values.has(key))continue;
        const readable=displayFicheAnswer(type,def,{answers:{...(fiche.answers??{}),[qc]:value}},qc);
        values.set(key,readable||key);
      }
    }
    const opts=[...values.entries()].map(([value,label])=>({value,label})).sort((a,b)=>String(a.label).localeCompare(String(b.label),"fr",{sensitivity:"base"}));
    if(!opts.length) return "";
    return `<label class="fiche-filter"><span>${escapeHtml(label)}</span><select data-fiche-filter="${escapeHtml(type.code)}" data-question-code="${escapeHtml(qc)}"><option value="">Tous</option>${opts.map(o=>`<option value="${escapeHtml(o.value)}"${String(current)===String(o.value)?" selected":""}>${escapeHtml(o.label)}</option>`).join("")}</select></label>`;
  }).join("");
}


export function validateFiche(type,def,answers={},principalAnswers={}) {
  const errors={};
  const conditionAnswers={...principalAnswers,...answers};
  for (const q of visibleFicheQuestions(type,def,conditionAnswers)) {
    const code=codeOf(q.Question_Code);
    if(matrixKind(q)){const mx=matrixErrors(q,answers);if(mx.length)errors[code]=mx.join(" ");}
    else {const error=validateQuestion(q,answers[code],true); if (error) errors[code]=error;}
  }
  return errors;
}

export function ficheCompleteness(type,def,fiche={},principalAnswers={}) {
  const errors=validateFiche(type,def,fiche.answers ?? {},principalAnswers);
  const complete=Object.keys(errors).length===0;
  return complete ? {state:"complete",label:"Complet",complete:true} : {state:"incomplete",label:"À compléter",complete:false};
}

export function canAddFiche(type,list=[]) {
  if (!type.allowAdd) return false;
  return type.maximum==null || list.length<type.maximum;
}
export function validateFicheCounts(types=[],fiches={}) {
  const errors={};
  for (const type of types) {
    const count=(fiches[type.code] ?? []).length;
    const singular=String(type.labelSingular || "fiche").toLowerCase();
    const plural=String(type.labelPlural || `${singular}s`).toLowerCase();
    if (count<type.minimum) errors[type.code]=`Vous devez saisir au moins ${type.minimum} ${type.minimum>1?plural:singular}.`;
    else if (type.maximum!=null && count>type.maximum) errors[type.code]=`Vous ne pouvez pas saisir plus de ${type.maximum} ${type.maximum>1?plural:singular}.`;
  }
  return errors;
}

export function renderRepeatableType(type,targetState,def,readOnly=false) {
  const list=targetState.fiches[type.code] ?? [];
  const editor=targetState.ficheEditor?.typeCode===type.code ? targetState.ficheEditor : null;
  const atMax=!canAddFiche(type,list);
  const ui=targetState.ficheListUi?.[type.code] ?? {query:"",sort:"recent"};
  const visibleRows=filterAndSortFiches(list,ui);
  const hasActiveFilters=Object.values(ui.filters ?? {}).some(v=>v!=="" && v!=null);
  const showTools=list.length>=type.filterThreshold || Boolean(ui.query) || hasActiveFilters;
  const filters=ficheFilterTools(type,ui,def,list);
  const tools=showTools ? `<div class="fiche-list-tools"><label class="fiche-search"><span class="sr-only">Rechercher dans les ${escapeHtml(type.labelPlural.toLowerCase())}</span><input type="search" placeholder="Rechercher…" value="${escapeHtml(ui.query ?? "")}" data-fiche-search="${escapeHtml(type.code)}"></label>${filters}<label class="fiche-sort"><span>Trier</span><select data-fiche-sort="${escapeHtml(type.code)}"><option value="recent"${ui.sort!=="oldest"?" selected":""}>Plus récentes</option><option value="oldest"${ui.sort==="oldest"?" selected":""}>Plus anciennes</option></select></label>${(ui.query||hasActiveFilters)?`<button type="button" class="btn btn-small fiche-reset" data-fiche-reset="${escapeHtml(type.code)}">Réinitialiser</button>`:""}</div>` : "";
  const cards=visibleRows.map(({fiche,index})=>{const completeness=ficheCompleteness(type,def,fiche,targetState.answers??{}),card=ficheCardText(type,def,fiche,index);return `<article class="fiche-card"><div class="fiche-card-main"><div class="fiche-title-row"><strong class="fiche-title">${escapeHtml(card.title)}</strong> <span class="fiche-status fiche-status-${escapeHtml(completeness.state)}">${escapeHtml(completeness.label)}</span></div><div class="fiche-identifier">${escapeHtml(card.identifier)}</div>${card.summaries.length?`<div class="fiche-summary">${card.summaries.map(item=>`<div class="fiche-summary-item"><span class="fiche-summary-label">${escapeHtml(item.label)} :</span> ${escapeHtml(item.value)}</div>`).join("")}</div>`:""}</div><div class="fiche-actions"><button type="button" class="btn btn-small" data-edit-fiche="${escapeHtml(type.code)}" data-index="${index}">${readOnly?"Consulter":"Modifier"}</button>${!readOnly && type.allowDelete?`<button type="button" class="btn btn-small" data-delete-fiche="${escapeHtml(type.code)}" data-index="${index}">Supprimer</button>`:""}</div></article>`;}).join("");
  const empty=list.length===0 ? `<p class="empty-fiches">${escapeHtml(type.emptyMessage||`Aucun ${type.labelSingular.toLowerCase()} saisi.`)}</p>` : visibleRows.length===0 ? `<p class="empty-fiches">Aucune fiche ne correspond aux critères.</p>` : "";
  const editorHtml=editor ? `<div class="fiche-editor" data-fiche-editor="${escapeHtml(type.code)}"><h3>${readOnly?`Consulter ${escapeHtml(type.labelSingular.toLowerCase())}`:editor.index===null?`Ajouter ${escapeHtml(type.labelSingular.toLowerCase())}`:`Modifier ${escapeHtml(type.labelSingular.toLowerCase())}`}</h3>${visibleFicheQuestions(type,def,{...(targetState.answers??{}),...editor.answers}).map(q=>renderFicheField(q,editor.answers)).join("")}${editor.index!==null && list[editor.index]?.elementId ? renderSubFiches(type,list[editor.index],readOnly) : (type.children?.length ? `<p class="help">Enregistrez d’abord cette fiche pour pouvoir ajouter ses sous-fiches.</p>` : "")}${readOnly?"":`<div class="fiche-validation-summary" data-fiche-validation-summary role="alert" hidden></div>`}<div class="fiche-editor-actions"><button type="button" class="btn" data-cancel-fiche>${readOnly?"Fermer":"Annuler"}</button>${readOnly?"":`<button type="button" class="btn btn-primary" data-save-fiche>Enregistrer la fiche</button>`}</div></div>`:"";
  const addLabel=`+ Ajouter un ${escapeHtml(type.labelSingular.toLowerCase())}`;
  const canShowAdd=!readOnly && !editor && type.allowAdd;
  const addButton=canShowAdd?`<button type="button" class="btn btn-primary add-fiche" data-add-fiche="${escapeHtml(type.code)}" data-add-fiche-normal="${escapeHtml(type.code)}"${atMax?" disabled":""}>${addLabel}</button>`:"";
  const floatingAdd=canShowAdd && list.length>=5 && !atMax ? `<button type="button" class="btn btn-primary add-fiche-floating" data-add-fiche="${escapeHtml(type.code)}" data-add-fiche-floating="${escapeHtml(type.code)}" aria-label="${addLabel}">+ Ajouter</button>` : "";
  return `<section class="repeatable" data-fiche-type="${escapeHtml(type.code)}"><div class="repeatable-heading"><h3>${escapeHtml(type.labelPlural)}</h3><span>${list.length}${type.counterLabel?` ${escapeHtml(type.counterLabel)}`:` ${list.length>1?"fiches":"fiche"}`}</span></div>${tools}${cards}${empty}<div class="fiche-count-error" data-fiche-count-error="${escapeHtml(type.code)}"></div>${canShowAdd?`<div class="fiche-add-bottom">${addButton}</div>`:""}${editorHtml}${floatingAdd}</section>`;
}

function scrollToEditor(selector){
  requestAnimationFrame(()=>document.querySelector(selector)?.scrollIntoView({behavior:"smooth",block:"start"}));
}

function render() {
  if(!state.previewMode)applyCampaignPersonalization();
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
    const locked=responseIsLocked();
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
  const logo=first(vm.version,["Logo_Data","Logo_URL","Logo","Url_logo"],"");
  const logoSize=first(vm.version,["Logo_Taille"],"moyen");
  const logoAlign=first(vm.version,["Logo_Alignement"],"gauche");
  const footer=first(vm.version,["Pied_de_page","Pied_page","Footer"],"");
  status.innerHTML=(state.previewMode?`<div class="status-info">Mode aperçu — aucune réponse ne sera enregistrée.</div>`:"")+(state.saving?`<div class="status-info">Enregistrement…</div>`:"")+(state.statusMessage?`<div class="status-info">${escapeHtml(state.statusMessage)}</div>`:"")+(state.saveError?`<div class="status-error">${escapeHtml(state.saveError)}</div>`:"")+(state.previewMode?"":resumeNotice());
  const showProgress=isTrue(first(vm.version,["Afficher_progression","Afficher_barre_progression","Barre_progression"],true));
  const legacyShowToc=isTrue(first(vm.version,["Afficher_sommaire","Sommaire"],false));
  const tocMode=String(first(vm.version,["Mode_sommaire"],legacyShowToc?"toujours":"desactive"));
  const positionedTocPages=vm.pages.map((p,pi)=>({pi,has:(p.sections??[]).some(s=>(s.questions??[]).some(q=>displayBlockKind(q)==="toc"))})).filter(x=>x.has);
  const hasPositionedToc=positionedTocPages.length>0;
  const positionedTocPage=positionedTocPages[0]?.pi??0;
  const showToc=!hasPositionedToc&&(tocMode==="toujours"||(tocMode==="accueil"&&state.pageIndex===0));
  const showReturnToc=tocMode==="accueil"&&state.pageIndex!==positionedTocPage&&isTrue(page.Afficher_retour_sommaire);
  const showValidationToc=(showToc||hasPositionedToc)&&isTrue(vm.version.Afficher_validation_sommaire);
  const locked=responseIsLocked();
  const completionBadge=status=>status?`<span class="toc-completion toc-completion-${status.state}">${escapeHtml(status.label)}</span>`:"";
  const questionHasRequiredPart=q=>{
    if(isDisplayBlock(q)||isDataTableQuestion(q))return false;
    if(isRequiredQuestion(q))return true;
    if(matrixKind(q))return matrixRows(q,state.definition).some(r=>isRequiredQuestion(r))||matrixCols(q,state.definition).some(c=>c.required);
    return false;
  };
  const sectionCompletionCore=section=>{
    const answerable=(section.questions??[]).filter(q=>!isDisplayBlock(q)&&!isDataTableQuestion(q));
    if(!answerable.length)return null;
    const required=answerable.filter(questionHasRequiredPart);
    if(!required.length)return {state:"pending",label:"En attente",hasRequired:false};
    const errors=required.some(q=>matrixKind(q)?matrixErrors(q,state.answers).length>0:Boolean(validateQuestion(q,state.answers[codeOf(q.Question_Code)],true)));
    return errors?{state:"pending",label:"En attente",hasRequired:true}:{state:"complete",label:"Complété",hasRequired:true};
  };
  const confirmationCompletion=(holder,base,questions=[])=>{
    if(!base)return null;
    const mode=String(holder?.Mode_badge_completion||"automatique").trim().toLowerCase();
    if(mode!=="question")return base;
    if(base.hasRequired&&base.state==="pending")return base;
    const questionCode=String(holder?.Question_badge_completion_Code||"").trim(),choiceCode=String(holder?.Choix_badge_completion_Code||"").trim();
    if(!questionCode||!choiceCode)return {state:"pending",label:"En attente",hasRequired:base.hasRequired};
    const q=questions.find(x=>codeOf(x.Question_Code)===questionCode);
    if(!q)return {state:"pending",label:"En attente",hasRequired:base.hasRequired};
    const answer=state.answers[questionCode],confirmed=Array.isArray(answer)?answer.map(String).includes(choiceCode):String(answer??"")===choiceCode;
    return confirmed?{state:"complete",label:"Complété",hasRequired:base.hasRequired}:{state:"pending",label:"En attente",hasRequired:base.hasRequired};
  };
  const sectionCompletion=section=>isTrue(section?.Afficher_badge_completion)?confirmationCompletion(section,sectionCompletionCore(section),section.questions??[]):null;
  const repeatableCompletion=type=>{
    const list=state.fiches[type.code]??[];
    const hasRequired=type.minimum>0;
    if(!hasRequired)return list.length?{state:"complete",label:"Complété",hasRequired:false}:{state:"pending",label:"En attente",hasRequired:false};
    if(list.length<type.minimum)return {state:"pending",label:"En attente",hasRequired:true};
    for(const fiche of list){if(Object.keys(validateFiche(type,state.definition,fiche.answers??{},state.answers)).length)return {state:"pending",label:"En attente",hasRequired:true};}
    return {state:"complete",label:"Complété",hasRequired:true};
  };
  const pageCompletion=page=>{
    if(!isTrue(page?.Afficher_badge_completion))return null;
    const statuses=[...(page.sections??[]).map(sectionCompletionCore),...(page.repeatableTypes??[]).map(repeatableCompletion)].filter(Boolean);
    if(!statuses.length)return null;
    const requiredStatuses=statuses.filter(x=>x.hasRequired);
    const automatic=requiredStatuses.length?(requiredStatuses.some(x=>x.state==="pending")?{state:"pending",label:"En attente",hasRequired:true}:{state:"complete",label:"Complété",hasRequired:true}):{state:"pending",label:"En attente",hasRequired:false};
    const pageQuestions=(page.sections??[]).flatMap(s=>s.questions??[]);
    return confirmationCompletion(page,automatic,pageQuestions);
  };
  const renderTocHtml=(title="Sommaire",tocQuestion=null)=>{let ordered=vm.pages.map((p,pi)=>({p,pi}));if(tocQuestion){let saved=[];try{const x=JSON.parse(tocQuestion.Sommaire_Ordre||"[]");if(Array.isArray(x))saved=x.map(String)}catch{}const rank=new Map(saved.map((c,i)=>[c,i]));ordered.sort((a,b)=>{const ac=String(codeOf(a.p.Page_Code)),bc=String(codeOf(b.p.Page_Code)),ai=rank.has(ac)?rank.get(ac):9999,bi=rank.has(bc)?rank.get(bc):9999;return ai-bi||a.pi-b.pi})}const cols=tocQuestion?Math.max(1,Math.min(3,Number(tocQuestion.Sommaire_Colonnes||1))):1,intro=tocQuestion?first(tocQuestion,["Aide","Description","Texte_aide"],""):"";return `<nav class="questionnaire-toc toc-cols-${cols}" aria-label="Sommaire du questionnaire">${title?`<div class="questionnaire-toc-title">${escapeHtml(title)}</div>`:""}${intro?`<div class="questionnaire-toc-intro">${escapeHtml(intro).replace(/\n/g,"<br>")}</div>`:""}<div class="toc-grid">${ordered.map(({p,pi})=>{const pc=codeOf(p.Page_Code);const pt=first(p,["Titre","Libelle","Libellé","Nom"],pc);const pageStatus=pageCompletion(p);const visibleSections=(p.sections??[]).filter(s=>{const st=first(s,["Titre","Libelle","Libellé","Nom"],"");const sd=first(s,["Description","Texte","Introduction","Texte_introduction"],"");const showInToc=!(s.Afficher_dans_sommaire===false||s.Afficher_dans_sommaire===0||String(s.Afficher_dans_sommaire).toLowerCase()==="false");return showInToc&&Boolean(st&&(s.questions?.length||sd));});const indicators=(p.sections??[]).flatMap(sec=>(sec.questions??[]).filter(q=>displayBlockKind(q)==="indicators"&&!(q.Indicateurs_Dans_Sommaire===false||q.Indicateurs_Dans_Sommaire===0||String(q.Indicateurs_Dans_Sommaire).toLowerCase()==="false")));return `<div class="toc-page${pi===state.pageIndex?" is-current":""}"><button type="button" class="toc-page-link" data-toc-page="${pi}"${pi===state.pageIndex?' aria-current="page"':''}><span class="toc-link-label">${escapeHtml(pt)}</span>${completionBadge(pageStatus)}</button>${visibleSections.length||indicators.length?`<div class="toc-sections">${visibleSections.map(sec=>{const sc=codeOf(sec.Section_Code);const st=first(sec,["Titre","Libelle","Libellé","Nom"],sc);return `<button type="button" class="toc-section-link" data-toc-page="${pi}" data-toc-section="${escapeHtml(sc)}"><span class="toc-link-label">${escapeHtml(st)}</span>${completionBadge(sectionCompletion(sec))}</button>`}).join("")}${indicators.map(iq=>`<button type="button" class="toc-section-link" data-toc-page="${pi}" data-toc-indicator="${escapeHtml(codeOf(iq.Question_Code))}"><span class="toc-link-label">📊 ${escapeHtml(first(iq,["Libelle","Libellé","Titre"],"Indicateurs"))}</span></button>`).join("")}</div>`:""}</div>`}).join("")}</div>${showValidationToc?`<div class="toc-validation"><button type="button" class="btn btn-primary" data-validate-toc>${escapeHtml(finalValidationLabel(vm.version))}</button></div>`:""}</nav>`};
  const tocHtml=showToc?renderTocHtml("Sommaire"):"";
  const completeness=responseCompleteness(state.definition,vm,state.answers,state.fiches,state.response);
  const themeBg=cssColor(state.definition.version?.Couleur_arriere_plan),themeBlocks=cssColor(state.definition.version?.Couleur_blocs),themePrimary=cssColor(state.definition.version?.Couleur_principale),themeTitles=cssColor(state.definition.version?.Couleur_titres);
  root.style.background=themeBg||"";root.style.minHeight=themeBg?"100vh":"";root.style.padding=themeBg?"16px":"";
  const mainTitleStyle=titleStyle({...state.definition.version,Couleur_titre:state.definition.version?.Couleur_titres},themeTitles);
  const themeCss=`<style data-questionnaire-theme>${themeBlocks?`.card,.section,.repeatable{background:${themeBlocks}!important}`:""}${themePrimary?`.btn-primary{background:${themePrimary}!important;border-color:${themePrimary}!important}.progress>div{background:${themePrimary}!important}`:""}${mainTitleStyle?`.questionnaire-title-row h1{${mainTitleStyle}}`:""}</style>`;
  root.innerHTML=themeCss+`<div class="card">
    <div class="respondent-toolbar"><div class="respondent-toolbar-status">${state.previewMode?'<span class="response-status">Aperçu</span>':`<span class="response-status response-status-${escapeHtml(completeness.state)}">${escapeHtml(completeness.label)}</span>`}</div><div class="respondent-toolbar-actions">${respondentExportButtons()}${!state.previewMode&&state.response?.Jeton_reprise?`<button type="button" class="btn btn-small" data-copy-resume>Copier le lien de reprise</button>`:""}${!state.previewMode&&!locked?`<button type="button" class="btn btn-primary btn-small" data-save-quit${(state.ficheEditor||state.subFicheEditor)?' disabled title="Enregistrez d’abord la fiche en cours"':''}>Enregistrer</button>${(state.ficheEditor||state.subFicheEditor)?`<span class="help">Enregistrez d’abord la fiche en cours.</span>`:""}`:""}</div></div>
    <header class="header">${logo?`<div class="questionnaire-logo logo-${escapeHtml(logoSize)} align-${escapeHtml(logoAlign)}"><img src="${escapeHtml(logo)}" alt=""></div>`:""}<div class="questionnaire-title-row"><h1>${escapeHtml(title)}</h1></div>${intro?`<div class="intro">${escapeHtml(intro)}</div>`:""}
    ${showProgress?`<div class="progress"><div style="width:${((state.pageIndex+1)/vm.pages.length)*100}%"></div></div><div class="progress-label">Page ${state.pageIndex+1} sur ${vm.pages.length}</div>`:""}</header>
    ${tocHtml}
    ${showReturnToc?`<div class="return-toc-wrap"><button type="button" class="btn return-toc" data-return-toc>← Retour au sommaire</button></div>`:""}
    <h2 style="${escapeHtml(titleStyle(page,themeTitles))}">${escapeHtml(first(page,["Titre","Libelle","Libellé","Nom"],codeOf(page.Page_Code)))}</h2>
    ${page.sections.map(s=>{
      const sectionTitle=first(s,["Titre","Libelle","Libellé","Nom"],"");
      const sectionDescription=first(s,["Description","Texte","Introduction","Texte_introduction"],"");
      if(!s.questions.length && !sectionDescription) return "";
      return `<section class="section" id="section-${escapeHtml(codeOf(s.Section_Code))}">${sectionTitle?`<h2 style="${escapeHtml(titleStyle(s,themeTitles))}">${escapeHtml(sectionTitle)}</h2>`:""}${sectionDescription?`<div class="section-description">${escapeHtml(sectionDescription)}</div>`:""}
      ${s.questions.map(q=>{const qc=codeOf(q.Question_Code),displayKind=displayBlockKind(q);if(displayKind==="toc")return `<div class="content-toc" data-display-block="${escapeHtml(qc)}">${renderTocHtml(first(q,["Libelle","Libellé","Titre"],""),q)}</div>`;if(displayKind==="description"){const title=first(q,["Libelle","Libellé","Titre"],""),text=personalizedDescriptionText(q,state.answers);return `<div class="content-description" data-display-block="${escapeHtml(qc)}">${title?`<div class="content-description-title" style="${escapeHtml(labelStyle(q))}">${escapeHtml(title)}</div>`:""}${text?`<div class="content-description-text">${escapeHtml(text).replace(/\n/g,"<br>")}</div>`:""}</div>`;}if(displayKind==="indicators")return renderIndicators(q);return `<div class="field" data-field="${escapeHtml(qc)}"><label style="${escapeHtml(labelStyle(q))}">${escapeHtml(first(q,["Libelle","Libellé","Titre"],qc))}${isRequiredQuestion(q)?' <span class="required" aria-label="obligatoire">*</span>':""}</label>${q.Aide?`<div class="help">${escapeHtml(q.Aide)}</div>`:""}${renderQuestionControl(q)}<div class="error" data-error="${escapeHtml(qc)}"></div></div>`}).join("")}
    </section>`;
    }).join("")}
    ${(page.repeatableTypes ?? []).map(type=>renderRepeatableType(type,state,state.definition,locked)).join("")}
    ${footer?`<footer class="questionnaire-footer">${escapeHtml(footer)}</footer>`:""}
    ${!locked?`<div class="fiche-validation-summary" data-page-validation-summary role="alert" hidden></div>`:""}
    ${vm.diagnostics.length?`<div class="diagnostic">Diagnostic : ${vm.diagnostics.map(escapeHtml).join(" · ")}</div>`:""}
  </div>`;
  const customNextLabel=String(page.Libelle_bouton_suivant||"").trim();
  const navModeForLabel=String(page.Navigation_apres||"").trim();
  let automaticNextLabel="Suivant";
  if(navModeForLabel==="validation_finale" || state.pageIndex===vm.pages.length-1) automaticNextLabel=finalValidationLabel(vm.version);
  else if(navModeForLabel==="retour_page"){
    const targetRaw=codeOf(page.Page_cible_Code);
    const targetPage=vm.pages.find(p=>String(p.id)===String(targetRaw)||String(codeOf(p.Page_Code))===String(targetRaw));
    const targetLabel=targetPage?first(targetPage,["Titre","Libelle","Libellé","Nom"],codeOf(targetPage.Page_Code)):"";
    automaticNextLabel=targetLabel?`Retour à ${targetLabel}`:"Retour";
  }
  const nextButtonLabel=customNextLabel||automaticNextLabel;
  nav.innerHTML=locked
    ? `<div class="readonly-nav">${state.validationJustCompleted?`<div class="status-info" role="status">✓ ${escapeHtml(finalValidationMessage(vm.version))}</div>`:""}<div class="status-info">Cette réponse est validée et n’est plus modifiable.</div><div class="respondent-export-actions">${respondentExportButtons()}</div><div><button class="btn" id="prev"${state.pageIndex===0?" disabled":""}>Précédent</button><button class="btn btn-primary" id="next"${state.pageIndex===vm.pages.length-1?" disabled":""}>Suivant</button></div></div>`
    : `<button class="btn" id="prev"${state.pageIndex===0?" disabled":""}>Précédent</button><button class="btn btn-primary" id="next">${escapeHtml(nextButtonLabel)}</button>`;
  if(locked) root.querySelectorAll("input,select,textarea").forEach(el=>{el.disabled=true;});
  root.querySelectorAll("[data-question]").forEach(el=>el.addEventListener("change", onAnswer));
  root.querySelectorAll("input[data-question],textarea[data-question]").forEach(el=>el.addEventListener("input", onAnswer));
  root.querySelectorAll("[data-matrix-question]").forEach(el=>{el.addEventListener("change",onMatrixAnswer);if(el.type==="text"||el.type==="number")el.addEventListener("input",onMatrixAnswer);});
  updateMatrixTotals(root);
  root.querySelectorAll("[data-clear-question]").forEach(el=>el.addEventListener("click", e=>{
    e.preventDefault();
    e.stopPropagation();
    clearPrincipalAnswer(e.currentTarget.dataset.clearQuestion);
  }));
  root.querySelectorAll("[data-fiche-search]").forEach(el=>el.addEventListener("input",e=>{const code=e.currentTarget.dataset.ficheSearch; state.ficheListUi[code]={...(state.ficheListUi[code]??{}),query:e.currentTarget.value}; render(); const next=root.querySelector(`[data-fiche-search="${CSS.escape(code)}"]`); next?.focus(); if(next) next.setSelectionRange(next.value.length,next.value.length);}));
  root.querySelectorAll("[data-fiche-sort]").forEach(el=>el.addEventListener("change",e=>{const code=e.currentTarget.dataset.ficheSort; state.ficheListUi[code]={...(state.ficheListUi[code]??{}),sort:e.currentTarget.value}; render();}));
  root.querySelectorAll("[data-fiche-filter]").forEach(el=>el.addEventListener("change",e=>{const code=e.currentTarget.dataset.ficheFilter,qc=e.currentTarget.dataset.questionCode; const current=state.ficheListUi[code]??{}; state.ficheListUi[code]={...current,filters:{...(current.filters??{}),[qc]:e.currentTarget.value}}; render();}));
  root.querySelectorAll("[data-fiche-reset]").forEach(el=>el.addEventListener("click",e=>{const code=e.currentTarget.dataset.ficheReset; state.ficheListUi[code]={query:"",sort:state.ficheListUi[code]?.sort??"recent",filters:{}}; render();}));
  root.querySelectorAll("[data-toc-page]").forEach(el=>el.addEventListener("click",async e=>{
    const targetPage=Number(e.currentTarget.dataset.tocPage);
    const targetSection=e.currentTarget.dataset.tocSection||"";const targetIndicator=e.currentTarget.dataset.tocIndicator||"";
    if(!Number.isInteger(targetPage)||targetPage<0||targetPage>=vm.pages.length)return;
    if(targetPage!==state.pageIndex){
      if(!locked && !state.previewMode && !(await savePrincipal()))return;
      state.pageIndex=targetPage; render();
    }
    if(targetIndicator)requestAnimationFrame(()=>document.getElementById(`indicator-${CSS.escape(targetIndicator)}`)?.scrollIntoView({behavior:"smooth",block:"start"}));
    else if(targetSection)requestAnimationFrame(()=>document.getElementById(`section-${CSS.escape(targetSection)}`)?.scrollIntoView({behavior:"smooth",block:"start"}));
    else requestAnimationFrame(()=>root.scrollIntoView({behavior:"smooth",block:"start"}));
  }));
  root.querySelector("[data-validate-toc]")?.addEventListener("click",()=>{if(!locked)finalizeFromToc(vm);});
  root.querySelector("[data-return-toc]")?.addEventListener("click",async()=>{
    if(!locked && !state.previewMode && !(await savePrincipal()))return;
    state.pageIndex=positionedTocPage;render();
    requestAnimationFrame(()=>root.querySelector(".questionnaire-toc")?.scrollIntoView({behavior:"smooth",block:"start"}));
  });
  root.querySelectorAll("[data-copy-resume]").forEach(el=>el.addEventListener("click",()=>copyResumeLink(false)));
  root.querySelectorAll("[data-export-my-pdf]").forEach(el=>el.addEventListener("click",exportMyPdf));
  root.querySelectorAll("[data-export-my-excel]").forEach(el=>el.addEventListener("click",exportMyExcel));
  root.querySelectorAll("[data-save-quit]").forEach(el=>el.addEventListener("click",()=>saveAndQuit()));
  root.querySelectorAll("[data-add-fiche]").forEach(el=>el.addEventListener("click",e=>{createDraftFiche(state,e.currentTarget.dataset.addFiche);render()}));
  root.querySelectorAll("[data-add-subfiche]").forEach(el=>el.addEventListener("click",e=>{state.subFicheEditor={typeCode:e.currentTarget.dataset.addSubfiche,index:null,parentElementId:Number(e.currentTarget.dataset.parentElement),answers:{}};render();scrollToEditor("[data-subfiche-editor]")}));
  root.querySelectorAll("[data-edit-subfiche]").forEach(el=>el.addEventListener("click",e=>{const typeCode=e.currentTarget.dataset.editSubfiche,parentElementId=Number(e.currentTarget.dataset.parentElement),index=Number(e.currentTarget.dataset.subIndex),list=(state.fiches[typeCode]??[]).filter(f=>String(f.parentElementId)===String(parentElementId));state.subFicheEditor={typeCode,index,parentElementId,answers:{...(list[index]?.answers??{})}};render();scrollToEditor("[data-subfiche-editor]")}));
  root.querySelectorAll("[data-delete-subfiche]").forEach(el=>el.addEventListener("click",e=>cancelCurrentSubFiche(e.currentTarget.dataset.deleteSubfiche,Number(e.currentTarget.dataset.parentElement),Number(e.currentTarget.dataset.subIndex))));
  root.querySelectorAll("[data-add-fiche-floating]").forEach(floating=>{
    const code=floating.dataset.addFicheFloating;
    const normal=root.querySelector(`[data-add-fiche-normal="${CSS.escape(code)}"]`);
    if(!normal || typeof IntersectionObserver==="undefined") return;
    const observer=new IntersectionObserver(entries=>{floating.classList.toggle("is-visible",!entries[0].isIntersecting);},{threshold:.05});
    observer.observe(normal);
  });
  root.querySelectorAll("[data-edit-fiche]").forEach(el=>el.addEventListener("click",e=>{
    const typeCode=e.currentTarget.dataset.editFiche, index=Number(e.currentTarget.dataset.index);
    state.ficheEditor={typeCode,index,answers:{...(state.fiches[typeCode]?.[index]?.answers ?? {})}}; state.subFicheEditor=null; render(); scrollToEditor(`[data-fiche-editor="${CSS.escape(typeCode)}"]`);
  }));
  root.querySelectorAll("[data-delete-fiche]").forEach(el=>el.addEventListener("click",e=>cancelCurrentFiche(e.currentTarget.dataset.deleteFiche,Number(e.currentTarget.dataset.index))));
  root.querySelectorAll("[data-fiche-question]").forEach(el=>el.addEventListener("change",onFicheAnswer));
  root.querySelectorAll("input[data-fiche-question],textarea[data-fiche-question]").forEach(el=>el.addEventListener("input",onFicheAnswer));
  root.querySelectorAll("[data-clear-fiche-question]").forEach(el=>el.addEventListener("pointerdown",e=>{
    const btn=e.currentTarget, isSub=!!btn.closest("[data-subfiche-editor]");
    const ed=isSub?state.subFicheEditor:state.ficheEditor, code=btn.dataset.clearFicheQuestion||"";
    const scope=btn.closest(isSub?"[data-subfiche-editor]":"[data-fiche-editor]");
    const control=scope?.querySelector(`[data-fiche-question="${CSS.escape(code)}"]`);
    debugPush(isSub?"clic_effacer_sous_fiche":"clic_effacer_fiche",{
      question:code,typeEditeur:ed?.typeCode||"",valeurEtatAvant:ed?.answers?.[code]??null,
      valeurDOMAvant:control?.value??null,typeDOM:control?.type??control?.tagName??null,
      optionsDOM:control?.tagName==="SELECT"?[...control.options].map(o=>({value:o.value,label:o.text,selected:o.selected})):[]
    });
  },true));
  root.querySelectorAll("[data-clear-fiche-question]").forEach(el=>el.addEventListener("click",e=>{
    e.preventDefault();
    e.stopPropagation();
    const ed=e.currentTarget.closest("[data-subfiche-editor]")?state.subFicheEditor:state.ficheEditor;
    if(ed) clearFicheAnswer(ed,e.currentTarget.dataset.clearFicheQuestion);
  }));
  root.querySelector("[data-cancel-fiche]")?.addEventListener("click",()=>{state.ficheEditor=null;state.subFicheEditor=null;render()});
  root.querySelector("[data-save-fiche]")?.addEventListener("click",()=>saveCurrentFiche());
  root.querySelector("[data-cancel-subfiche]")?.addEventListener("click",()=>{state.subFicheEditor=null;render();scrollToEditor("[data-fiche-editor]")});
  root.querySelector("[data-save-subfiche]")?.addEventListener("click",()=>saveCurrentSubFiche());
  status.querySelector("[data-copy-resume]")?.addEventListener("click",()=>copyResumeLink(false));
  status.querySelector("[data-save-quit]")?.addEventListener("click",()=>saveAndQuit());
  nav.querySelectorAll("[data-export-my-pdf]").forEach(el=>el.addEventListener("click",exportMyPdf));
  nav.querySelectorAll("[data-export-my-excel]").forEach(el=>el.addEventListener("click",exportMyExcel));
  document.querySelector("#prev")?.addEventListener("click",async()=>{if(locked||state.previewMode){state.pageIndex--;render();return;}if(await savePrincipal()){state.pageIndex--;render()}});
  document.querySelector("#next")?.addEventListener("click",()=>{if(locked){if(state.pageIndex<vm.pages.length-1){state.pageIndex++;render();}return;}nextPage(vm,page)});

}


function renderPreservingInputFocus(target) {
  const questionCode=target?.dataset?.ficheQuestion ?? target?.dataset?.question;
  if (!questionCode) { render(); return; }
  const isFiche=Boolean(target?.dataset?.ficheQuestion);
  const inSubFiche=Boolean(target?.closest?.("[data-subfiche-editor]"));
  const start=typeof target.selectionStart==="number" ? target.selectionStart : null;
  const end=typeof target.selectionEnd==="number" ? target.selectionEnd : null;
  render();
  let scope=document;
  if (isFiche) scope=document.querySelector(inSubFiche ? "[data-subfiche-editor]" : "[data-fiche-editor]") ?? document;
  const attr=isFiche ? "data-fiche-question" : "data-question";
  const next=scope.querySelector(`[${attr}="${CSS.escape(questionCode)}"]`);
  if (!next) return;
  next.focus({preventScroll:true});
  if (start!==null && typeof next.setSelectionRange==="function") {
    try { next.setSelectionRange(start,end ?? start); } catch (_) {}
  }
}

function emptyAnswerForQuestion(code){
  const q=(state.definition?.questions??[]).find(x=>String(codeOf(x.Question_Code))===String(code));
  return controlKind(q)==="checkbox" ? [] : "";
}

function clearRenderedAnswer(scope,attr,code){
  const controls=[...(scope??document).querySelectorAll(`[${attr}="${CSS.escape(code)}"]`)];
  for(const el of controls){
    if(el.type==="checkbox"||el.type==="radio")el.checked=false;
    else el.value="";
  }
}
function clearPrincipalAnswer(code){
  if(!code)return;
  state.principalDirty=true;
  const before=state.answers[code];
  clearRenderedAnswer(document,"data-question",code);
  state.answers[code]=emptyAnswerForQuestion(code);
  sanitizeDependentAnswers(state.definition,state.answers);
  debugPush("effacement_question_normale",{question:code,avant:before,apres:state.answers[code]});
  render();
}

function clearFicheAnswer(editor,code){
  if(!editor||!code)return;
  const isSub=editor===state.subFicheEditor;
  const scopeSelector=isSub?"[data-subfiche-editor]":"[data-fiche-editor]";
  const scope=document.querySelector(scopeSelector)??document;

  // Fiches and sub-fiches keep their answers in a draft editor, separate from
  // state.answers. Clear both the rendered control and that draft before the
  // dependency pass so a full render cannot restore the previous selection.
  const before=editor.answers[code];
  clearRenderedAnswer(scope,"data-fiche-question",code);
  editor.answers[code]=emptyAnswerForQuestion(code);

  const combined={...state.answers,...(state.ficheEditor?.answers??{}),...editor.answers};
  sanitizeDependentAnswers(state.definition,combined);
  for(const key of Object.keys(editor.answers)){
    editor.answers[key]=combined[key] ?? emptyAnswerForQuestion(key);
  }
  // The cleared question is authoritative even when the same Question_Code is
  // present in another draft context.
  editor.answers[code]=emptyAnswerForQuestion(code);
  debugPush(isSub?"effacement_sous_fiche":"effacement_fiche",{question:code,avant:before,apres:editor.answers[code],typeEditeur:editor.typeCode||""});

  render();
  // Re-apply the empty value to the newly rendered editor. This is harmless
  // for radio/checkbox and makes select clearing deterministic after rerender.
  requestAnimationFrame(()=>{
    const freshScope=document.querySelector(scopeSelector);
    if(freshScope){
      clearRenderedAnswer(freshScope,"data-fiche-question",code);
      const control=freshScope.querySelector(`[data-fiche-question="${CSS.escape(code)}"]`);
      debugPush(isSub?"apres_rendu_sous_fiche":"apres_rendu_fiche",{question:code,valeurEtat:editor.answers[code],valeurDOM:control?.value??null,typeDOM:control?.type??control?.tagName??null});
    }
  });
}

function onFicheAnswer(e) {
  const editor=e.target.closest("[data-subfiche-editor]") ? state.subFicheEditor : state.ficheEditor;
  if (!editor) return;
  const code=e.target.dataset.ficheQuestion;
  if (!code) return;
  if(e.target.type==="checkbox"){
    let selected=[...(Array.isArray(editor.answers[code])?editor.answers[code]:[])].map(String);
    if(e.target.checked){if(e.target.dataset.exclusive==="1")selected=[String(e.target.value)];else{selected=selected.filter(v=>document.querySelector(`[data-fiche-question="${CSS.escape(code)}"][value="${CSS.escape(v)}"]`)?.dataset.exclusive!=="1");if(!selected.includes(String(e.target.value)))selected.push(String(e.target.value));}}
    else selected=selected.filter(v=>v!==String(e.target.value));
    editor.answers[code]=selected;
  } else editor.answers[code]=e.target.value;
  const combined={...state.answers,...(state.ficheEditor?.answers??{}),...editor.answers};
  sanitizeDependentAnswers(state.definition,combined);
  for (const key of Object.keys(editor.answers)) editor.answers[key]=combined[key] ?? "";
  const drivesFilter=(state.definition.choiceFilters ?? []).some(f=>String(f.Source ?? "Question")==="Question" && resolveRefCode(f.Question_source_Code,state.definition.questions,"Question_Code")===code);
  if (e.target.type==="radio" || e.target.type==="checkbox" || state.definition.rules.some(r=>codeOf(r.Question_source_Code)===code) || drivesFilter) renderPreservingInputFocus(e.target);
}
export function collectFicheAnswers(root, currentAnswers={}) {
  const answers={...currentAnswers};
  if (!root?.querySelectorAll) return answers;
  const controls=[...root.querySelectorAll("[data-fiche-question]")];
  const codes=new Set(controls.map(el=>el.dataset?.ficheQuestion).filter(Boolean));
  for (const code of codes) {
    const group=controls.filter(el=>el.dataset?.ficheQuestion===code);
    const checkboxes=group.filter(el=>el.type==="checkbox");
    const radio=group.find(el=>el.type==="radio" && el.checked);
    const nonChoice=group.find(el=>el.type!=="radio" && el.type!=="checkbox");
    if(checkboxes.length) answers[code]=checkboxes.filter(el=>el.checked).map(el=>el.value);
    else if (radio) answers[code]=radio.value;
    else if (nonChoice) answers[code]=nonChoice.value;
    else if (group.some(el=>el.type==="radio")) answers[code]="";
  }
  return answers;
}

async function saveCurrentFiche() {
  if (!state.ficheEditor) return;
  if (state.subFicheEditor) { showSaveError(new Error("Enregistrez ou annulez la sous-fiche en cours avant d’enregistrer la fiche.")); return; }
  // Read the rendered controls once more at save time. This makes radio/select
  // persistence independent from change/input event timing and re-renders.
  state.ficheEditor.answers=collectFicheAnswers(document.querySelector("[data-fiche-editor]"),state.ficheEditor.answers);
  state.saveError="";
  const vm=buildViewModel(state.definition,state.answers);
  const page=vm.pages[state.pageIndex];
  const type=findRepeatableType(page?.repeatableTypes ?? [],state.ficheEditor.typeCode);
  if (!type) return;
  const errors=validateFiche(type,state.definition,state.ficheEditor.answers,state.answers);
  document.querySelectorAll("[data-fiche-field]").forEach(x=>x.classList.remove("invalid"));
  document.querySelectorAll("[data-fiche-error]").forEach(x=>x.textContent="");
  for (const [code,msg] of Object.entries(errors)) {
    document.querySelector(`[data-fiche-field="${CSS.escape(code)}"]`)?.classList.add("invalid");
    const node=document.querySelector(`[data-fiche-error="${CSS.escape(code)}"]`);
    if(node) node.textContent=msg;
  }
  if (Object.keys(errors).length) {
    const summary=document.querySelector("[data-fiche-validation-summary]");
    if(summary){const count=Object.keys(errors).length;summary.textContent=count===1?"1 réponse obligatoire ou invalide est à corriger dans cette fiche.":`${count} réponses obligatoires ou invalides sont à corriger dans cette fiche.`;summary.hidden=false;}
    const firstInvalid=document.querySelector("[data-fiche-editor] .field.invalid, [data-fiche-editor] [data-fiche-field].invalid");
    firstInvalid?.scrollIntoView?.({behavior:"smooth",block:"center"});
    firstInvalid?.querySelector?.("input,select,textarea")?.focus?.({preventScroll:true});
    return;
  }
  if(state.previewMode){saveDraftFiche(state);render();return;}
  try {
    state.saving=true; render();
    await persistFiche(type,state.ficheEditor);
    state.ficheEditor=null; state.saving=false; render();
  } catch(e) { state.saving=false; showSaveError(e); render(); }
}

async function saveCurrentSubFiche() {
  if (!state.subFicheEditor) return;
  const editor=state.subFicheEditor;
  const root=document.querySelector("[data-subfiche-editor]");
  editor.answers=collectFicheAnswers(root,editor.answers);
  const vm=buildViewModel(state.definition,state.answers);
  const page=vm.pages[state.pageIndex];
  const type=findRepeatableType(page?.repeatableTypes ?? [],editor.typeCode);
  if (!type) return;
  const parentAnswers=state.ficheEditor?.answers ?? {};
  const errors=validateFiche(type,state.definition,editor.answers,{...state.answers,...parentAnswers});
  root?.querySelectorAll("[data-fiche-field]").forEach(x=>x.classList.remove("invalid"));
  root?.querySelectorAll("[data-fiche-error]").forEach(x=>x.textContent="");
  for (const [code,msg] of Object.entries(errors)) {
    root?.querySelector(`[data-fiche-field="${CSS.escape(code)}"]`)?.classList.add("invalid");
    const node=root?.querySelector(`[data-fiche-error="${CSS.escape(code)}"]`); if(node) node.textContent=msg;
  }
  if (Object.keys(errors).length) {
    const summary=root?.querySelector("[data-subfiche-validation-summary]");
    if(summary){const count=Object.keys(errors).length;summary.textContent=count===1?"1 réponse obligatoire ou invalide est à corriger dans cette sous-fiche.":`${count} réponses obligatoires ou invalides sont à corriger dans cette sous-fiche.`;summary.hidden=false;}
    const firstInvalid=root?.querySelector(".field.invalid, [data-fiche-field].invalid");
    firstInvalid?.scrollIntoView?.({behavior:"smooth",block:"center"});
    firstInvalid?.querySelector?.("input,select,textarea")?.focus?.({preventScroll:true});
    return;
  }
  if(state.previewMode){
    const list=state.fiches[editor.typeCode]??=[];
    const scoped=list.filter(f=>String(f.parentElementId??"")===String(editor.parentElementId??""));
    const saved={answers:{...editor.answers},parentElementId:editor.parentElementId,elementId:`preview-sub-${Date.now()}`};
    if(editor.index==null)list.push(saved);else{const old=scoped[editor.index],idx=list.indexOf(old);if(idx>=0)list[idx]=saved;}
    state.subFicheEditor=null;render();return;
  }
  try {
    state.saving=true; render();
    await persistFiche(type,editor);
    state.subFicheEditor=null; state.saving=false; render(); scrollToEditor(`[data-subfiche-group="${CSS.escape(editor.typeCode)}"]`);
  } catch(e) { state.saving=false; showSaveError(e); render(); }
}

function onMatrixAnswer(e){
  const el=e.target,qc=el.dataset.matrixQuestion,rc=el.dataset.matrixRow,cc=el.dataset.matrixCol;if(!qc||!rc||!cc)return;
  if(!el.dataset.matrixFiche)state.principalDirty=true;
  const target=el.dataset.matrixFiche?(el.closest("[data-subfiche-editor]")?state.subFicheEditor:state.ficheEditor):null;
  const answers=target?target.answers:state.answers; answers[qc]??={};
  const kind=matrixKind((state.definition.questions??[]).find(q=>codeOf(q.Question_Code)===qc));
  if(kind==="radio")answers[qc][rc]=el.checked?cc:"";
  else if(kind==="checkbox"){let arr=Array.isArray(answers[qc][rc])?[...answers[qc][rc]].map(String):[];if(el.checked){if(el.dataset.exclusive==="1")arr=[cc];else{arr=arr.filter(v=>{const x=el.closest('[data-matrix]')?.querySelector(`[data-matrix-row="${CSS.escape(rc)}"][data-matrix-col="${CSS.escape(v)}"]`);return x?.dataset.exclusive!=="1"});if(!arr.includes(cc))arr.push(cc);}}else arr=arr.filter(v=>v!==cc);answers[qc][rc]=arr; if(el.checked&&el.dataset.exclusive==="1"){el.closest('tr')?.querySelectorAll('input[type="checkbox"]').forEach(x=>{if(x!==el)x.checked=false;});}else if(el.checked){el.closest('tr')?.querySelectorAll('input[type="checkbox"][data-exclusive="1"]').forEach(x=>x.checked=false);}}
  else {answers[qc][rc]??={};answers[qc][rc][cc]=el.value;updateMatrixTotals(el.closest('[data-matrix]')??document);}
}

function collectPrincipalMatrixAnswers(root=document, answers=state.answers){
  root.querySelectorAll('[data-matrix-question]:not([data-matrix-fiche="1"])').forEach(el=>{
    const qc=el.dataset.matrixQuestion, rc=el.dataset.matrixRow, cc=el.dataset.matrixCol;
    if(!qc||!rc||!cc) return;
    answers[qc]??={};
    const q=(state.definition.questions??[]).find(x=>codeOf(x.Question_Code)===qc);
    const kind=matrixKind(q);
    if(kind==="radio"){
      if(el.checked) answers[qc][rc]=cc;
      else if(answers[qc][rc]===undefined) answers[qc][rc]="";
    } else if(kind==="checkbox"){
      const checked=[...root.querySelectorAll(`[data-matrix-question="${CSS.escape(qc)}"][data-matrix-row="${CSS.escape(rc)}"][type="checkbox"]:checked`)].map(x=>x.dataset.matrixCol);
      answers[qc][rc]=checked;
    } else {
      answers[qc][rc]??={};
      answers[qc][rc][cc]=el.value;
    }
  });
  return answers;
}

function onAnswer(e) {
  const code=e.target.dataset.question;
  if (!code) return;
  state.principalDirty=true;
  if(e.target.type==="checkbox"){
    let selected=[...(Array.isArray(state.answers[code])?state.answers[code]:[])].map(String);
    if(e.target.checked){if(e.target.dataset.exclusive==="1")selected=[String(e.target.value)];else{selected=selected.filter(v=>document.querySelector(`[data-question="${CSS.escape(code)}"][value="${CSS.escape(v)}"]`)?.dataset.exclusive!=="1");if(!selected.includes(String(e.target.value)))selected.push(String(e.target.value));}}
    else selected=selected.filter(v=>v!==String(e.target.value));
    state.answers[code]=selected;
  } else state.answers[code]=e.target.value;
  sanitizeDependentAnswers(state.definition,state.answers);
  const drivesFilter=(state.definition.choiceFilters ?? []).some(f=>String(f.Source ?? "Question")==="Question" && resolveRefCode(f.Question_source_Code,state.definition.questions,"Question_Code")===code);
  const drivesDataTable=(state.definition.questions ?? []).some(q=>isDataTableQuestion(q)&&String(q.TD_Mode||"all")==="personalized"&&String(q.TD_Context_Source||"campaign")==="question"&&String(q.TD_Context_Question||"")===String(code));
  if (e.target.type==="radio" || e.target.type==="checkbox" || state.definition.rules.some(r=>codeOf(r.Question_source_Code)===code) || drivesFilter || drivesDataTable) renderPreservingInputFocus(e.target);
}

export function validateVisiblePage(page, answers={}) {
  const errors={};
  for (const section of page.sections) for (const q of section.questions) {
    if(isDisplayBlock(q)) continue;
    const code=codeOf(q.Question_Code);
    if(matrixKind(q)){const mx=matrixErrors(q,answers);if(mx.length)errors[code]=mx.join(" ");}
    else {const error=validateQuestion(q,answers[code],true); if (error) errors[code]=error;}
  }
  return errors;
}

async function finalizeFromToc(vm) {
  state.statusMessage="";
  if(state.ficheEditor||state.subFicheEditor){showSaveError(new Error("Enregistrez ou annulez la fiche en cours avant de valider le questionnaire."));return;}
  if(!state.previewMode && !await savePrincipal()) return;
  const allErrors=validateWholeResponse(state.definition,vm,state.answers,state.fiches,validateQuestion,visibleFicheQuestions);
  if(Object.keys(allErrors.principal).length || Object.keys(allErrors.fiches).length){showSaveError(new Error("Le questionnaire contient encore des réponses obligatoires à compléter."));return;}
  if(state.previewMode){state.saveError="";state.statusMessage="Aperçu : le questionnaire peut être validé — aucune réponse n’a été enregistrée.";render();return;}
  try { state.saving=true; render(); await finalizeResponse(); state.saving=false; state.saveError=""; state.validationJustCompleted=true; state.statusMessage=finalValidationMessage(state.definition?.version); render(); showValidationFeedback(); }
  catch(e){state.saving=false;showSaveError(e);render();}
}

async function nextPage(vm,page) {
  state.statusMessage="";
  if(state.ficheEditor||state.subFicheEditor){showSaveError(new Error("Enregistrez ou annulez la fiche en cours avant de continuer."));return;}
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
  if (Object.keys(errors).length || Object.keys(ficheErrors).length) {
    const summary=document.querySelector("[data-page-validation-summary]");
    if(summary){
      const count=Object.keys(errors).length+Object.keys(ficheErrors).length;
      summary.textContent=count===1 ? "1 réponse obligatoire ou invalide est à corriger avant de continuer." : `${count} réponses obligatoires ou invalides sont à corriger avant de continuer.`;
      summary.hidden=false;
    }
    const firstInvalid=document.querySelector(".field.invalid, [data-fiche-count-error]:not(:empty)");
    firstInvalid?.scrollIntoView?.({behavior:"smooth",block:"center"});
    return;
  }
  if (!state.previewMode && !await savePrincipal()) return;
  const navMode=String(page.Navigation_apres||"").trim();
  if(navMode==="retour_page"){
    const targetRaw=codeOf(page.Page_cible_Code);
    const targetIndex=vm.pages.findIndex(p=>String(p.id)===String(targetRaw)||String(codeOf(p.Page_Code))===String(targetRaw));
    if(targetIndex<0){showSaveError(new Error("La page cible configurée n’est pas visible actuellement."));return;}
    state.pageIndex=targetIndex;state.saveError="";render();return;
  }
  const mustFinalize=navMode==="validation_finale" || state.pageIndex>=vm.pages.length-1;
  if(!mustFinalize){state.pageIndex++;render();return;}
  const allErrors=validateWholeResponse(state.definition,vm,state.answers,state.fiches,validateQuestion,visibleFicheQuestions);
  if(Object.keys(allErrors.principal).length || Object.keys(allErrors.fiches).length){showSaveError(new Error("Le questionnaire contient encore des réponses obligatoires à compléter."));return;}
  if(state.previewMode){state.saveError="";state.statusMessage="Fin de l’aperçu — aucune réponse n’a été enregistrée.";render();return;}
  try { state.saving=true; render(); await finalizeResponse(); state.saving=false; state.saveError=""; state.validationJustCompleted=true; state.statusMessage=finalValidationMessage(state.definition?.version); render(); showValidationFeedback(); }
  catch(e){state.saving=false;showSaveError(e);render();}
}


function requestedParam(name){
  // Dans un widget Grist, les paramètres du lien répondant peuvent être portés
  // soit par l’URL du widget, soit par l’URL Grist parente (document.referrer).
  // Lire les deux évite de dépendre des droits de l’utilisateur connecté.
  for(const raw of [globalThis.location?.href, globalThis.document?.referrer]){
    if(!raw)continue;
    try{const value=String(new URL(raw, "http://local/").searchParams.get(name)||"").trim();if(value)return value}catch{}
  }
  return "";
}
function pendingUniqueResumeToken(){
  try{return String(sessionStorage.getItem("gristionnaire.pendingUniqueResume")||"").trim()}catch{return ""}
}
function setPendingUniqueResumeToken(token){
  try{if(token)sessionStorage.setItem("gristionnaire.pendingUniqueResume",String(token));else sessionStorage.removeItem("gristionnaire.pendingUniqueResume")}catch{}
}
function requestedResumeToken(){return requestedParam("Reprise_")||requestedParam("Reprise")||pendingUniqueResumeToken()}
function accessibleResponse(def){
  const rows=(def.responses??[]).filter(r=>!isTrue(r.Supprime_logiquement));
  const resume=requestedResumeToken();
  if(resume){const match=findResponseByResumeToken(rows,resume);if(match)return match;}
  const requested=requestedParam("Reponse_");
  if(requested){const match=rows.find(r=>String(r.id)===requested||String(codeOf(r.Reponse_Code))===requested);if(match)return match;}
  // Acces_ n’est pas toujours exposé à l’iframe du widget Grist (notamment
  // lorsqu’un OWNER est connecté). Les ACL de CAMPAGNES filtrent alors déjà
  // la définition à la campagne autorisée : son Jeton_acces devient la clé
  // collective de reprise.
  let access=requestedParam("Acces_");
  let campaign=null;
  if(access) campaign=(def.campaigns??[]).find(c=>String(c.Jeton_acces??"").trim()===access)??null;
  if(!campaign && (def.campaigns??[]).length===1) campaign=def.campaigns[0];
  if(!access && campaign) access=String(campaign.Jeton_acces??"").trim();
  if(access && !isUniqueLinkCampaign(campaign)){
    const matches=rows.filter(r=>{
      if(String(r.Jeton_acces_ACL||"").trim()!==access)return false;
      if(!campaign)return true;
      const raw=codeOf(r.Campagne_Code);
      return String(raw)===String(campaign.id)||String(raw)===String(codeOf(campaign.Campagne_Code));
    }).sort((a,b)=>{
      const date=r=>Number(r.Date_modification??r.Modifie_le??r.Date_creation??r.Cree_le??0)||0;
      return date(b)-date(a)||Number(b.Revision||0)-Number(a.Revision||0)||Number(b.id||0)-Number(a.id||0);
    });
    if(matches.length)return matches[0];
  }
  // A public LIEN_UNIQUE must never adopt another response merely because it is
  // the only row visible to an OWNER. Only Reprise_/Reponse_ may resume it.
  if(isUniqueLinkCampaign(campaign))return null;
  return rows.length===1 ? rows[0] : null;
}
function resumeNotice(){
  if(!state.response?.Jeton_reprise)return "";
  if(responseIsLocked()) return `<div class="resume-notice"><strong>Votre réponse est validée et enregistrée</strong><p>Votre questionnaire a bien été transmis. Vous pouvez conserver ce lien pour consulter votre réponse ultérieurement.</p><div class="resume-actions"><button type="button" class="btn btn-small" data-copy-resume>Copier mon lien de consultation</button></div></div>`;
  return `<div class="resume-notice"><strong>Votre réponse est enregistrée</strong><p>Conservez votre lien personnel pour reprendre ce questionnaire plus tard, y compris depuis un autre navigateur.</p><div class="resume-actions"><button type="button" class="btn btn-small" data-copy-resume>Copier mon lien de reprise</button><button type="button" class="btn btn-small" data-save-quit${(state.ficheEditor||state.subFicheEditor)?' disabled title="Enregistrez d’abord la fiche en cours"':''}>Enregistrer</button></div></div>`;
}
export function campaignResumeBaseUrl(campaign, referrer="") {
  const configured=String(campaign?.URL_reprise ?? campaign?.Url_reprise ?? campaign?.URL_page_Grist ?? "").trim();
  if(configured) return configured;
  const fallback=String(referrer??"").trim();
  if(fallback && /(?:\/o\/docs\/|\/doc\/)/.test((()=>{try{return new URL(fallback).pathname}catch{return ""}})())) return fallback;
  throw new Error("Adresse Grist de reprise non configurée pour cette campagne.");
}
function currentResumeUrl(){const campaign=selectedCampaign();return buildResumeUrl(campaignResumeBaseUrl(campaign,document.referrer),campaign.Jeton_acces,state.response?.Jeton_reprise);}
async function copyText(text){
  if(globalThis.navigator?.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}
  const area=document.createElement("textarea");area.value=text;area.setAttribute("readonly","");area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);area.select();const ok=document.execCommand?.("copy");area.remove();if(!ok)throw new Error("La copie automatique du lien a échoué.");
}
function temporaryButtonFeedback(selector,label,delay=2200){
  document.querySelectorAll(selector).forEach(button=>{
    const original=button.textContent;
    button.textContent=label;
    button.disabled=true;
    globalThis.setTimeout?.(()=>{if(button.isConnected){button.textContent=original;button.disabled=false;}},delay);
  });
}
async function copyResumeLink(afterSave=false){
  try{
    const url=currentResumeUrl();
    await copyText(url);
    state.saveError="";
    temporaryButtonFeedback("[data-copy-resume]","✓ Lien copié");
    if(afterSave) temporaryButtonFeedback("[data-save-quit]","✓ Réponse enregistrée");
  }catch(e){showSaveError(e);}
}
async function saveAndQuit(){
  if(state.ficheEditor||state.subFicheEditor){showSaveError(new Error("Enregistrez ou annulez la fiche en cours avant d’enregistrer."));return;}
  if(await savePrincipal()){render();temporaryButtonFeedback("[data-save-quit]","✓ Réponse enregistrée");}
}
function uniqueCode(prefix){return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;}
function rowIdByCode(rows,col,code){return (rows??[]).find(r=>codeOf(r[col])===codeOf(code))?.id ?? null;}
async function refreshPersistenceRows(){for(const [key,table] of [["responses","REPONSES"],["responseElements","ELEMENTS_REPONSE"],["responseValues","VALEURS_REPONSE"],["responseSelections","SELECTIONS_REPONSE"]]) state.definition[key]=rowsFromTable(await grist.docApi.fetchTable(table));}
function creationAclKey(){return selectedCampaign().Jeton_acces ?? "";}
function selectedCampaign(){const cs=state.definition.campaigns??[]; /* The URL access token is authoritative for personalized links; ACL still controls which rows are readable. */ const access=requestedParam("Acces_");if(access){const c=cs.find(x=>String(x.Jeton_acces??"").trim()===access);if(c)return c;}const requested=requestedParam("Campagne_");if(requested){const c=cs.find(x=>String(x.id)===requested||String(codeOf(x.Campagne_Code))===requested);if(c)return c;}const candidate=state.selectedRecord?.Campagne_Code;if(candidate!=null){const raw=codeOf(candidate);const c=cs.find(x=>String(x.id)===raw||codeOf(x.Campagne_Code)===raw);if(c)return c;}if(cs.length===1)return cs[0];throw new Error("Impossible d’identifier la campagne de réponse. Sélectionnez une campagne unique pour ce questionnaire.");}
async function ensureResponse(){
  if(state.response&&state.principalElement)return;
  const campaign=selectedCampaign(), vc=state.definition.version.id;
  /* Re-read persistence immediately before creation. With a personalized access link,
     the access token is the collective response key: reuse an existing readable
     response instead of creating another one. ACLs remain authoritative. */
  if(!state.response){
    await refreshPersistenceRows();
    const existing=accessibleResponse(state.definition);
    if(existing) state.response=existing;
  }
  if(!state.response){
    const code=uniqueCode("REP");
    const now=Date.now()/1000,fields={Reponse_Code:code,Campagne_Code:campaign.id,Version_Code:vc,Statut:"Brouillon",Revision:1,Supprime_logiquement:false,Jeton_reprise:(isUniqueLinkCampaign(campaign)?requestedResumeToken():"")||generateResumeToken(),Jeton_acces_ACL:campaign.Jeton_acces,Date_creation:now,Date_modification:now};
    await grist.docApi.applyUserActions([["AddRecord","REPONSES",null,fields]]);
    await refreshPersistenceRows();
    state.response=state.definition.responses.find(r=>codeOf(r.Reponse_Code)===codeOf(code))??null;
    if(state.response && isUniqueLinkCampaign(campaign))setPendingUniqueResumeToken("");
  }
  if(!state.response)throw new Error("La réponse a été créée mais n’est pas relisible dans cette session Grist.");
  let principal=state.definition.responseElements.find(e=>String(e.Reponse_Code)===String(state.response.id)&&String(e.Type_element??"").toLowerCase()==="principal"&&!isTrue(e.Supprime_logiquement));
  if(!principal){
    const ec=uniqueCode("ELT"),fields={Element_Code:ec,Reponse_Code:state.response.id,Type_element:"Principal",Statut:"Brouillon",Ordre:0,Revision:1,Supprime_logiquement:false,Cle_creation_ACL:creationAclKey()};
    await grist.docApi.applyUserActions([["AddRecord","ELEMENTS_REPONSE",null,fields]]);
    await refreshPersistenceRows();
    principal=state.definition.responseElements.find(e=>codeOf(e.Element_Code)===codeOf(ec))??null;
  }
  if(!principal)throw new Error("L’élément principal a été créé mais n’est pas relisible dans cette session Grist.");
  state.principalElement=principal;
}
function gristValueFields(question,value){const fields=serializeAnswer(question,value,state.definition);if(fields.Valeur_reference_Code)fields.Valeur_reference_Code=rowIdByCode(state.definition.referentialValues,"ValeurRef_Code",fields.Valeur_reference_Code);if(fields.Valeur_structure_Code)fields.Valeur_structure_Code=rowIdByCode(state.definition.structures,"Structure_Code",fields.Valeur_structure_Code);return fields;}
async function checkResponseRevision(){await refreshPersistenceRows();const fresh=state.definition.responses.find(r=>r.id===state.response?.id);if(state.response&&fresh)assertRevision(state.response.Revision,fresh.Revision);return fresh;}
function isMultiQuestion(q){return controlKind(q)==="checkbox";}
function selectionTarget(q,value){
  const option=optionsFor(q,state.definition,state.answers).find(o=>String(o.value)===String(value));
  if(!option)return null;
  if(option.source==="choice")return {Choix_Code:option.rowId,ValeurRef_Code:null,Structure_Code:null};
  if(option.source==="reference")return {Choix_Code:null,ValeurRef_Code:option.rowId,Structure_Code:null};
  if(option.source==="structure")return {Choix_Code:null,ValeurRef_Code:null,Structure_Code:option.rowId};
  return null;
}

async function writeMatrixAnswer(element,q,answers){
  const qc=codeOf(q.Question_Code),kind=matrixKind(q),rows=matrixRows(q,state.definition),cols=matrixCols(q,state.definition),data=answers?.[qc]??{};
  const existing=state.definition.responseValues.filter(v=>String(v.Element_Code)===String(element.id));const actions=[];
  for(const r of rows){const rc=codeOf(r.Question_Code),rv=data[rc];
    if(kind==="radio"||kind==="checkbox"){
      let valueRow=existing.find(v=>String(v.Question_Code)===String(r.id)&&!v.ColonneMatrice_Code);if(!valueRow){await grist.docApi.applyUserActions([["AddRecord","VALEURS_REPONSE",null,{Valeur_Code:uniqueCode("VAL"),Cle_creation_ACL:creationAclKey(),Element_Code:element.id,Question_Code:r.id,Valeur_texte:null}]]);await refreshPersistenceRows();valueRow=state.definition.responseValues.find(v=>String(v.Element_Code)===String(element.id)&&String(v.Question_Code)===String(r.id)&&!v.ColonneMatrice_Code);}if(!valueRow)continue;
      for(const x of (state.definition.responseSelections??[]).filter(x=>String(x.Valeur_Code)===String(valueRow.id)))actions.push(["RemoveRecord","SELECTIONS_REPONSE",x.id]);
      const selected=kind==="checkbox"?(Array.isArray(rv)?rv:[]):(rv?[rv]:[]);
      // Pour une matrice radio, conserver aussi le code technique dans VALEURS_REPONSE.
      // SELECTIONS_REPONSE reste la représentation relationnelle principale ; Valeur_texte
      // permet une réhydratation fiable après sauvegarde et reste vide pour les checkbox.
      actions.push(["UpdateRecord","VALEURS_REPONSE",valueRow.id,{Valeur_texte:kind==="radio"?(selected[0]??null):null}]);
      for(const c of selected){const col=cols.find(x=>String(x.code)===String(c));if(col)actions.push(["AddRecord","SELECTIONS_REPONSE",null,{Selection_Code:uniqueCode("SEL"),Valeur_Code:valueRow.id,Choix_Code:col.id,ValeurRef_Code:null,Structure_Code:null}]);}
    }else for(const c of cols){const old=existing.find(v=>String(v.Question_Code)===String(r.id)&&String(v.ColonneMatrice_Code)===String(c.id));const val=rv?.[c.code]??"";const fields={Element_Code:element.id,Question_Code:r.id,ColonneMatrice_Code:c.id,Valeur_texte:kind==="text"?(val===""?null:String(val)):null,Valeur_nombre:kind==="number"&&(val!==""&&val!=null)?Number(val):null,Valeur_date:null,Valeur_booleen:null,Valeur_reference_Code:null,Valeur_structure_Code:null};if(old)actions.push(["UpdateRecord","VALEURS_REPONSE",old.id,fields]);else if(val!==""&&val!=null)actions.push(["AddRecord","VALEURS_REPONSE",null,{Valeur_Code:uniqueCode("VAL"),Cle_creation_ACL:creationAclKey(),...fields}]);}
  }
  if(actions.length)await grist.docApi.applyUserActions(actions);
}
async function writeAnswers(element,questions,answers){
  const actions=[]; const existing=state.definition.responseValues.filter(v=>String(v.Element_Code)===String(element.id));
  for(const q of questions){
    if(isDisplayBlock(q))continue;
    const qc=codeOf(q.Question_Code); if(matrixKind(q)){await writeMatrixAnswer(element,q,answers);continue;} if(isTrue(q.Est_ligne_matrice))continue;
    const old=existing.find(v=>String(v.Question_Code)===String(q.id));
    if(isMultiQuestion(q)){
      let valueRow=old;
      if(!valueRow){
        const created=await grist.docApi.applyUserActions([["AddRecord","VALEURS_REPONSE",null,{Valeur_Code:uniqueCode("VAL"),Cle_creation_ACL:creationAclKey(),Element_Code:element.id,Question_Code:q.id,...gristValueFields(q,"")}]]); 
        await refreshPersistenceRows();
        valueRow=state.definition.responseValues.find(v=>String(v.Element_Code)===String(element.id)&&String(v.Question_Code)===String(q.id));
      }
      if(!valueRow)throw new Error(`Impossible de créer la valeur technique pour ${qc}.`);
      const oldSelections=(state.definition.responseSelections??[]).filter(s=>String(s.Valeur_Code)===String(valueRow.id));
      for(const s of oldSelections)actions.push(["RemoveRecord","SELECTIONS_REPONSE",s.id]);
      for(const selected of (Array.isArray(answers[qc])?answers[qc]:[])){
        const target=selectionTarget(q,selected); if(!target)continue;
        actions.push(["AddRecord","SELECTIONS_REPONSE",null,{Selection_Code:uniqueCode("SEL"),Valeur_Code:valueRow.id,...target}]);
      }
      continue;
    }
    const fields={...gristValueFields(q,answers[qc]),Element_Code:element.id,Question_Code:q.id};
    if(old)actions.push(["UpdateRecord","VALEURS_REPONSE",old.id,fields]);
    else if(answers[qc]!==undefined&&answers[qc]!=="")actions.push(["AddRecord","VALEURS_REPONSE",null,{Valeur_Code:uniqueCode("VAL"),Cle_creation_ACL:creationAclKey(),...fields}]);
  }
  if(actions.length)await grist.docApi.applyUserActions(actions);
}
async function bumpElementRevision(element){const er=Number(element.Revision||0)+1,now=Date.now()/1000;await grist.docApi.applyUserActions([["UpdateRecord","ELEMENTS_REPONSE",element.id,{Revision:er}],["UpdateRecord","REPONSES",state.response.id,{Date_modification:now}]]);state.response={...state.response,Date_modification:now};element.Revision=er;}
async function savePrincipal(){try{
  state.saveError="";
  assertResponseEditable();
  // La navigation ne doit pas écrire le bloc principal s'il n'a pas été modifié
  // dans ce navigateur. Sur un lien collectif, une autre personne peut avoir
  // créé/enregistré une fiche entre-temps sans rendre cette session obsolète.
  if(!state.principalDirty){
    await ensureResponse();
    await refreshPersistenceRows();
    const h=hydrateResponse({REPONSES:state.definition.responses,ELEMENTS_REPONSE:state.definition.responseElements,VALEURS_REPONSE:state.definition.responseValues,SELECTIONS_REPONSE:state.definition.responseSelections},state.definition,state.response.Reponse_Code);
    state.response=h.response;state.principalElement=h.principalElement;state.answers=h.principalAnswers;state.fiches=h.fiches;
    applyCampaignPersonalization();
    return true;
  }
  collectPrincipalMatrixAnswers(document,state.answers);
  state.saving=true;render();
  await ensureResponse();
  // Concurrence optimiste au bon niveau : seule une modification concurrente
  // du même élément principal bloque. Une fiche indépendante ne bloque plus.
  await refreshPersistenceRows();
  const freshPrincipal=state.definition.responseElements.find(e=>e.id===state.principalElement?.id);
  if(state.principalElement&&freshPrincipal)assertRevision(state.principalElement.Revision,freshPrincipal.Revision);
  if(freshPrincipal)state.principalElement=freshPrincipal;
  const qs=state.definition.questions.filter(q=>!resolveRefCode(q.TypeFiche_Code,state.definition.ficheTypes,"TypeFiche_Code"));
  await writeAnswers(state.principalElement,qs,state.answers);
  await bumpElementRevision(state.principalElement);
  await refreshPersistenceRows();
  const h=hydrateResponse({REPONSES:state.definition.responses,ELEMENTS_REPONSE:state.definition.responseElements,VALEURS_REPONSE:state.definition.responseValues,SELECTIONS_REPONSE:state.definition.responseSelections},state.definition,state.response.Reponse_Code);
  state.response=h.response;state.principalElement=h.principalElement;state.answers=h.principalAnswers;state.fiches=h.fiches;state.principalDirty=false;
  applyCampaignPersonalization();
  state.saving=false;
  return true;
}catch(e){state.saving=false;showSaveError(e);render();return false;}}
async function persistFiche(type,editor){assertResponseEditable();await ensureResponse();await refreshPersistenceRows();const scoped=(state.fiches[type.code]??[]).filter(f=>!editor.parentElementId||String(f.parentElementId)===String(editor.parentElementId));let fiche=editor.index==null?null:scoped[editor.index];let el=fiche?state.definition.responseElements.find(e=>e.id===fiche.elementId||codeOf(e.Element_Code)===fiche.elementCode):null;if(el){assertRevision(fiche.revision,el.Revision);}else{const ec=uniqueCode("ELT");const typeId=rowIdByCode(state.definition.ficheTypes,"TypeFiche_Code",type.code);const fields={Element_Code:ec,Reponse_Code:state.response.id,TypeFiche_Code:typeId,Type_element:editor.parentElementId?"Sous-fiche":"Fiche",Statut:"Brouillon",Ordre:scoped.length+1,Revision:1,Supprime_logiquement:false,Cle_creation_ACL:creationAclKey()};if(editor.parentElementId)fields.Parent_Code=editor.parentElementId;await grist.docApi.applyUserActions([["AddRecord","ELEMENTS_REPONSE",null,fields]]);await refreshPersistenceRows();el=state.definition.responseElements.find(e=>codeOf(e.Element_Code)===ec);}
  await writeAnswers(el,type.questions,editor.answers);await bumpElementRevision(el);await refreshPersistenceRows();const h=hydrateResponse({REPONSES:state.definition.responses,ELEMENTS_REPONSE:state.definition.responseElements,VALEURS_REPONSE:state.definition.responseValues,SELECTIONS_REPONSE:state.definition.responseSelections},state.definition,state.response.Reponse_Code);state.fiches=h.fiches;state.response=h.response;state.principalElement=h.principalElement;
}
async function cancelCurrentFiche(typeCode,index){if(state.previewMode){deleteFiche(state,typeCode,index);render();return;}assertResponseEditable();const fiche=state.fiches[typeCode]?.[index];if(!fiche)return;try{state.saving=true;render();await refreshPersistenceRows();const el=state.definition.responseElements.find(e=>e.id===fiche.elementId);assertRevision(fiche.revision,el?.Revision);await grist.docApi.applyUserActions([["UpdateRecord","ELEMENTS_REPONSE",el.id,{Statut:"Annulé",Supprime_logiquement:true,Revision:Number(el.Revision||0)+1}],["UpdateRecord","REPONSES",state.response.id,{Date_modification:Date.now()/1000}]]);await refreshPersistenceRows();deleteFiche(state,typeCode,index);state.response=state.definition.responses.find(r=>r.id===state.response.id);state.saving=false;render();}catch(e){state.saving=false;showSaveError(e);render();}}
async function cancelCurrentSubFiche(typeCode,parentElementId,index){const list=(state.fiches[typeCode]??[]).filter(f=>String(f.parentElementId)===String(parentElementId));const fiche=list[index];if(!fiche)return;if(state.previewMode){const all=state.fiches[typeCode]??[];const pos=all.indexOf(fiche);if(pos>=0)all.splice(pos,1);state.subFicheEditor=null;render();return;}try{state.saving=true;render();await refreshPersistenceRows();const el=state.definition.responseElements.find(e=>e.id===fiche.elementId);assertRevision(fiche.revision,el?.Revision);await grist.docApi.applyUserActions([["UpdateRecord","ELEMENTS_REPONSE",el.id,{Statut:"Annulé",Supprime_logiquement:true,Revision:Number(el.Revision||0)+1}],["UpdateRecord","REPONSES",state.response.id,{Date_modification:Date.now()/1000}]]);await refreshPersistenceRows();const h=hydrateResponse({REPONSES:state.definition.responses,ELEMENTS_REPONSE:state.definition.responseElements,VALEURS_REPONSE:state.definition.responseValues,SELECTIONS_REPONSE:state.definition.responseSelections},state.definition,state.response.Reponse_Code);state.fiches=h.fiches;state.response=h.response;state.saving=false;render();}catch(e){state.saving=false;showSaveError(e);render();}}
async function finalizeResponse(){await ensureResponse();await checkResponseRevision();const activeElements=state.definition.responseElements.filter(e=>String(e.Reponse_Code)===String(state.response.id)&&!isTrue(e.Supprime_logiquement));const actions=activeElements.map(e=>["UpdateRecord","ELEMENTS_REPONSE",e.id,{Statut:"Validé",Revision:Number(e.Revision||0)+1}]);const now=Date.now()/1000;actions.push(["UpdateRecord","REPONSES",state.response.id,{Statut:"Validé",Revision:Number(state.response.Revision||0)+1,Date_modification:now,Date_validation:now}]);await grist.docApi.applyUserActions(actions);await refreshPersistenceRows();state.response=state.definition.responses.find(r=>r.id===state.response.id);const h=hydrateResponse({REPONSES:state.definition.responses,ELEMENTS_REPONSE:state.definition.responseElements,VALEURS_REPONSE:state.definition.responseValues,SELECTIONS_REPONSE:state.definition.responseSelections},state.definition,state.response.Reponse_Code);state.fiches=h.fiches;state.principalElement=h.principalElement;}
function showSaveError(e){state.saveError=String(e?.message??e);const node=document.querySelector("#status");if(node)node.innerHTML=`<div class="status-error">${escapeHtml(state.saveError)}</div>`;}

function uniqueLinkAclVisibleResponse(){
  let campaign;try{campaign=selectedCampaign()}catch{return null}
  if(!isUniqueLinkCampaign(campaign))return null;
  const rows=(state.definition?.responses??[]).filter(r=>{
    if(isTrue(r.Supprime_logiquement))return false;
    const raw=codeOf(r.Campagne_Code);
    return String(raw)===String(campaign.id)||String(raw)===String(codeOf(campaign.Campagne_Code));
  });
  // With the LIEN_UNIQUE ACLs, a Reprise_ link exposes only its own response.
  // A bare public Acces_ link must expose none (including to OWNER; see ACL rule).
  return rows.length===1?rows[0]:null;
}
function ensureUniqueLinkPrivateResume(){
  let campaign;try{campaign=selectedCampaign()}catch{return false}
  if(!isUniqueLinkCampaign(campaign)||requestedResumeToken()||uniqueLinkAclVisibleResponse())return false;
  const token=generateResumeToken();
  setPendingUniqueResumeToken(token);
  const url=buildResumeUrl(campaignResumeBaseUrl(campaign,document.referrer),campaign.Jeton_acces,token);
  try{const u=new URL(url);u.searchParams.set("style","singlePage");globalThis.top.location.href=u.toString();return true}catch{setPendingUniqueResumeToken("");return false}
}

async function boot() {
  try {
    if (!window.grist) throw new Error("API Grist indisponible. Ouvrez ce widget depuis Grist.");
    grist.ready({requiredAccess:"full"});
    grist.onRecord(record=>{ state.selectedRecord=record; });
    const internalPreview=isInternalGristPreviewContext();
    // Un ancien jeton technique LIEN_UNIQUE ne doit pas transformer l'ouverture
    // normale de p/38 en reprise. Les vrais liens singlePage ne passent pas ici.
    if(internalPreview)setPendingUniqueResumeToken("");
    state.previewMode=internalPreview || (Boolean(requestedPreviewVersion()) && !hasRealResponseContext());
    state.definition=await loadDefinition(grist.docApi,state.selectedRecord);
    if(state.previewMode && !hasExplicitPreviewContext() && hasAclPersonalizedCampaignContext(state.definition)){
      state.previewMode=false;
    }
    // For a public unique link, mint the respondent-private Reprise_ before any
    // answer is entered. The reload gives ACLs an individual key from the start.
    if(!state.previewMode && ensureUniqueLinkPrivateResume())return;
    const resumed=state.previewMode?null:(accessibleResponse(state.definition)||uniqueLinkAclVisibleResponse());
    const rc=state.previewMode?null:(resumed?.Reponse_Code ?? state.selectedRecord?.Reponse_Code);
    if(rc){const h=hydrateResponse({REPONSES:state.definition.responses,ELEMENTS_REPONSE:state.definition.responseElements,VALEURS_REPONSE:state.definition.responseValues,SELECTIONS_REPONSE:state.definition.responseSelections},state.definition,rc); state.response=h.response; state.principalElement=h.principalElement; state.answers=h.principalAnswers; state.fiches=h.fiches;}
    if(!state.previewMode)applyCampaignPersonalization();
    render();
  } catch(e) {
    document.querySelector("#status").innerHTML=`<div class="status-error">${escapeHtml(e.message ?? e)}</div>`;
    document.querySelector("#form-root").innerHTML="";
  }
}

if (typeof window!=="undefined" && typeof document!=="undefined") boot();