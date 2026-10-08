import {rowsFromTable,codeOf} from "../shared/grist-common.js";
import {readWorkbook,writeWorkbook} from "./xlsx-lite.js";
import {analyzeSheets,splitMultiValue,isReusableEmptyResponseState} from "./import-core.js";
import {serializeAnswer,generateResumeToken} from "../questionnaire/persistence.js";
const $=s=>document.querySelector(s),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const TABLES=["CAMPAGNES","QUESTIONNAIRES","VERSIONS_QUESTIONNAIRES","QUESTIONS","TYPES_FICHES","CHOIX_QUESTIONS","REFERENTIELS","VALEURS_REFERENTIELS","STRUCTURES","DESTINATAIRES_CAMPAGNE","REPONSES","ELEMENTS_REPONSE","VALEURS_REPONSE","SELECTIONS_REPONSE","SOURCES_IMPORT","LIGNES_IMPORTEES","MAPPINGS_IMPORT","VALEURS_IMPORTEES"];
const S={data:{},analysis:null,workbook:null};
const unique=p=>`${p}_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).slice(2,8).toUpperCase()}`;
async function fetchRows(t){return rowsFromTable(await grist.docApi.fetchTable(t))}
async function load(){try{const pairs=await Promise.all(TABLES.map(async t=>[t,await fetchRows(t)]));S.data=Object.fromEntries(pairs);renderCampaigns();status("")}catch(e){status(`Chargement impossible : ${e?.message||e}`,true)}}
function status(m,bad=false){$("#status").innerHTML=m?`<div class="${bad?"errorbox":"okbox"}">${esc(m)}</div>`:""}
function campaignGroup(c){return String(c?.Groupe_Campagne_Code||c?.Campagne_Code||"")}
function groupRows(c){const g=campaignGroup(c);return (S.data.CAMPAGNES||[]).filter(x=>campaignGroup(x)===g)}
function campaignLabel(c){return `${c.Nom||c.Campagne_Code} · ${String(c.Mode_diffusion||c.Mode_diffusion2||"").toUpperCase()||"mode non indiqué"}`}
function renderCampaigns(){const sel=$("#campaign"),rows=[...(S.data.CAMPAGNES||[])].filter(c=>c.Actif!==false&&String(c.Statut||c.Etat||"").toLowerCase()!=="supprimée"),seen=new Set(),opts=[];for(const c of rows){const g=campaignGroup(c);if(seen.has(g))continue;seen.add(g);opts.push(c)}sel.innerHTML='<option value="">— Sélectionner —</option>'+opts.map(c=>`<option value="${c.id}">${esc(campaignLabel(c))}</option>`).join("");sel.onchange=()=>{S.analysis=null;renderIdentifierTargets();$("#preview").innerHTML='<div class="empty">Aucun fichier analysé.</div>';$("#stage").disabled=true};renderIdentifierTargets()}
function selectedCampaign(){return (S.data.CAMPAGNES||[]).find(c=>String(c.id)===String($("#campaign").value))||null}
function renderIdentifierTargets(){const c=selectedCampaign(),target=$("#identifier-target"),help=$("#campaign-help");if(!c){target.innerHTML='<option value="">— Sélectionnez une campagne —</option>';help.textContent="";return}const mode=String(c.Mode_diffusion||c.Mode_diffusion2||"").toUpperCase(),opts=[];if(mode==="PERSONNALISE"){opts.push(["Valeur_personnalisation","Valeur de personnalisation"],["Valeur_personnalisation_Libelle","Libellé de personnalisation"],["Campagne_Code","Code technique du lien/campagne"]);help.textContent="Pour une campagne personnalisée, chaque ligne CAMPAGNES représente une valeur/participant du groupe."}else{const dest=(S.data.DESTINATAIRES_CAMPAGNE||[]).filter(d=>groupRows(c).some(x=>String(codeOf(d.Campagne_Code))===String(x.id)));if(dest.length){opts.push(["DEST:Identifiant_externe","Identifiant externe du destinataire"],["DEST:Email","E-mail du destinataire"],["DEST:Destinataire_Code","Code destinataire"]);help.textContent="Des destinataires explicites existent pour cette campagne ; ils peuvent être utilisés pour la correspondance."}else{opts.push(["Campagne_Code","Code de campagne"]);help.textContent="Attention : cette campagne ne possède pas de destinataires pré-identifiés. Un lien unique ne permet pas encore de rattacher un pré-remplissage à une personne avant son premier accès."}}target.innerHTML=opts.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join("")}
function expectedIdentifiers(){const c=selectedCampaign(),target=$("#identifier-target").value;if(!c||!target)return[];if(target.startsWith("DEST:")){const f=target.slice(5),ids=new Set(groupRows(c).map(x=>String(x.id)));return (S.data.DESTINATAIRES_CAMPAGNE||[]).filter(d=>ids.has(String(codeOf(d.Campagne_Code)))).map(d=>String(d[f]??"").trim()).filter(Boolean)}return groupRows(c).map(x=>String(x[target]??"").trim()).filter(Boolean)}
function participantCampaign(identifier){
  const c=selectedCampaign(),target=$("#identifier-target").value,id=String(identifier??"").trim();if(!c||!target||!id)return null;const rows=groupRows(c);
  if(target.startsWith("DEST:")){
    const field=target.slice(5),rowIds=new Set(rows.map(x=>String(x.id)));
    const dest=(S.data.DESTINATAIRES_CAMPAGNE||[]).find(d=>rowIds.has(String(codeOf(d.Campagne_Code)))&&String(d[field]??"").trim()===id);
    if(!dest)return null;const raw=String(codeOf(dest.Campagne_Code));return rows.find(x=>String(x.id)===raw||String(codeOf(x.Campagne_Code))===raw)||null;
  }
  const matches=rows.filter(x=>String(x[target]??"").trim()===id);return matches.length===1?matches[0]:null;
}
function responsesForCampaign(campaign){
  return (S.data.REPONSES||[]).filter(r=>!r.Supprime_logiquement).filter(r=>{const raw=String(codeOf(r.Campagne_Code));return raw===String(campaign.id)||raw===String(codeOf(campaign.Campagne_Code));}).sort((a,b)=>{const date=r=>Number(r.Date_modification??r.Modifie_le??r.Date_creation??r.Cree_le??0)||0;return date(b)-date(a)||Number(b.Revision||0)-Number(a.Revision||0)||Number(b.id||0)-Number(a.id||0)})
}
function existingResponseForCampaign(campaign){return responsesForCampaign(campaign)[0]||null}
function refMatchesRow(value,row,codeCol){const raw=String(codeOf(value));return raw===String(row?.id??"")||raw===String(codeOf(row?.[codeCol]))}
function pristineExistingResponse(response){
  if(!response)return null;
  const elements=(S.data.ELEMENTS_REPONSE||[]).filter(e=>!e.Supprime_logiquement&&refMatchesRow(e.Reponse_Code,response,"Reponse_Code"));
  const principal=elements.find(e=>String(e.Type_element||"").trim().toLowerCase()==="principal")||null;
  const valueCount=(S.data.VALEURS_REPONSE||[]).filter(v=>elements.some(e=>refMatchesRow(v.Element_Code,e,"Element_Code"))).length;
  if(!isReusableEmptyResponseState({status:response.Statut,elementTypes:elements.map(e=>e.Type_element),valueCount}))return null;
  return{response,principal,access:String(response.Jeton_acces_ACL||"")};
}
function directChoices(q){const qc=String(q.Question_Code),qid=String(q.id);return (S.data.CHOIX_QUESTIONS||[]).filter(x=>x.Actif!==false&&(String(codeOf(x.Question_Code))===qc||String(codeOf(x.Question_Code))===qid))}
function referentialFor(q){const raw=String(codeOf(q.Referentiel_Code));return (S.data.REFERENTIELS||[]).find(r=>String(r.id)===raw||String(codeOf(r.Referentiel_Code))===raw)||null}
function normalizeOptionValue(q,raw){const wanted=String(raw??"").trim();if(!wanted)return"";const choices=directChoices(q);if(choices.length){const hit=choices.find(x=>[x.Choix_Code,x.Valeur,x.Libelle].some(v=>String(v??"").trim()===wanted));if(!hit)throw new Error(`${q.Question_Code} : modalité « ${wanted} » introuvable.`);return String(codeOf(hit.Choix_Code))}const ref=referentialFor(q);if(ref){if(String(ref.Type_source||"").toUpperCase()==="STRUCTURES"){const hit=(S.data.STRUCTURES||[]).find(x=>x.Active!==false&&[x.Structure_Code,x.Nom].some(v=>String(v??"").trim()===wanted));if(!hit)throw new Error(`${q.Question_Code} : structure « ${wanted} » introuvable.`);return String(codeOf(hit.Structure_Code))}const refRaw=String(ref.id),refCode=String(codeOf(ref.Referentiel_Code));const hit=(S.data.VALEURS_REFERENTIELS||[]).find(x=>x.Actif!==false&&(String(codeOf(x.Referentiel_Code))===refRaw||String(codeOf(x.Referentiel_Code))===refCode)&&[x.ValeurRef_Code,x.Code,x.Libelle].some(v=>String(v??"").trim()===wanted));if(!hit)throw new Error(`${q.Question_Code} : valeur de référentiel « ${wanted} » introuvable.`);return String(codeOf(hit.ValeurRef_Code))}return wanted}
function isMultiQuestion(q){const t=String(q.Type_question||"").toLowerCase();return t.includes("case")||t.includes("checkbox")||((t.includes("liste")||t.includes("déroul")||t.includes("deroul"))&&!!q.Selection_multiple)}
function valueFields(q,raw){const normalized=normalizeOptionValue(q,raw),fields=serializeAnswer(q,normalized,{choices:S.data.CHOIX_QUESTIONS||[],referentials:S.data.REFERENTIELS||[],referentialValues:S.data.VALEURS_REFERENTIELS||[],structures:S.data.STRUCTURES||[]});if(fields.Valeur_reference_Code){const code=String(fields.Valeur_reference_Code);const row=(S.data.VALEURS_REFERENTIELS||[]).find(x=>String(x.id)===code||String(codeOf(x.ValeurRef_Code))===code);if(!row)throw new Error(`${q.Question_Code} : valeur de référentiel « ${raw} » introuvable.`);fields.Valeur_reference_Code=row.id}if(fields.Valeur_structure_Code){const code=String(fields.Valeur_structure_Code);const row=(S.data.STRUCTURES||[]).find(x=>String(x.id)===code||String(codeOf(x.Structure_Code))===code);if(!row)throw new Error(`${q.Question_Code} : structure « ${raw} » introuvable.`);fields.Valeur_structure_Code=row.id}return fields}
function selectionTarget(q,raw){const normalized=normalizeOptionValue(q,raw),choice=directChoices(q).find(x=>String(codeOf(x.Choix_Code))===normalized);if(choice)return{Choix_Code:choice.id,ValeurRef_Code:null,Structure_Code:null};const ref=referentialFor(q);if(ref&&String(ref.Type_source||"").toUpperCase()==="STRUCTURES"){const row=(S.data.STRUCTURES||[]).find(x=>String(codeOf(x.Structure_Code))===normalized);if(row)return{Choix_Code:null,ValeurRef_Code:null,Structure_Code:row.id}}if(ref){const row=(S.data.VALEURS_REFERENTIELS||[]).find(x=>String(codeOf(x.ValeurRef_Code))===normalized);if(row)return{Choix_Code:null,ValeurRef_Code:row.id,Structure_Code:null}}throw new Error(`${q.Question_Code} : modalité « ${raw} » introuvable.`)}
async function reloadResponseTables(){for(const t of ["REPONSES","ELEMENTS_REPONSE","VALEURS_REPONSE","SELECTIONS_REPONSE"])S.data[t]=await fetchRows(t)}
async function createInitialResponse(campaign,versionCode){
  const rc=unique("REP"),now=Date.now()/1000,resume=generateResumeToken(),access=String(campaign.Jeton_acces||"");
  await grist.docApi.applyUserActions([["AddRecord","REPONSES",null,{Reponse_Code:rc,Campagne_Code:campaign.id,Version_Code:versionCode,Statut:"Brouillon",Revision:1,Supprime_logiquement:false,Jeton_reprise:resume,Jeton_acces_ACL:access,Date_creation:now,Date_modification:now}]]);
  await reloadResponseTables();
  const response=(S.data.REPONSES||[]).find(x=>String(codeOf(x.Reponse_Code))===rc);if(!response)throw new Error("réponse créée mais non relisible");
  const ec=unique("ELT");
  await grist.docApi.applyUserActions([["AddRecord","ELEMENTS_REPONSE",null,{Element_Code:ec,Reponse_Code:response.id,Type_element:"Principal",Statut:"Brouillon",Ordre:0,Revision:1,Supprime_logiquement:false,Cle_creation_ACL:access}]]);
  await reloadResponseTables();
  const principal=(S.data.ELEMENTS_REPONSE||[]).find(x=>String(codeOf(x.Element_Code))===ec);if(!principal)throw new Error("élément principal créé mais non relisible");
  return{response,principal,access};
}
function preparedValues(values){
  const usable=(values||[]).filter(v=>!v.question.Est_ligne_matrice&&!codeOf(v.question.Question_parente_Code));
  return usable.map(v=>isMultiQuestion(v.question)?{...v,multi:splitMultiValue(v.raw).map(x=>selectionTarget(v.question,x))}:{...v,fields:valueFields(v.question,v.raw)});
}
async function writePreparedValues(element,prepared,access){
  for(const v of prepared){
    const vc=unique("VAL"),base={Valeur_Code:vc,Cle_creation_ACL:access,Element_Code:element.id,Question_Code:v.question.id};
    if(v.multi){
      await grist.docApi.applyUserActions([["AddRecord","VALEURS_REPONSE",null,{...base,Valeur_texte:null}]]);
      await reloadResponseTables();
      const value=(S.data.VALEURS_REPONSE||[]).find(x=>String(codeOf(x.Valeur_Code))===vc);if(!value)throw new Error(`${v.question.Question_Code} : valeur créée mais non relisible`);
      const actions=v.multi.map(target=>["AddRecord","SELECTIONS_REPONSE",null,{Selection_Code:unique("SEL"),Valeur_Code:value.id,...target}]);if(actions.length)await chunks(actions);
    }else await grist.docApi.applyUserActions([["AddRecord","VALEURS_REPONSE",null,{...base,...v.fields}]]);
  }
}
async function initializeResponsesAndFiches(a){
  const rows=a.parsed.filter(r=>["REPONSES","FICHES","SOUS_FICHES"].includes(r.kind)),byIdentifier=new Map(),results={responsesCreated:0,responsesReused:0,principalRowsApplied:0,fichesCreated:0,subFichesCreated:0,skippedParticipants:0,unmatched:0,errors:[]};
  for(const r of rows){if(!byIdentifier.has(r.identifier))byIdentifier.set(r.identifier,[]);byIdentifier.get(r.identifier).push(r)}
  for(const [identifier,group] of byIdentifier){
    try{
      const campaign=participantCampaign(identifier);if(!campaign){results.unmatched++;continue}
      await reloadResponseTables();
      const existing=existingResponseForCampaign(campaign),reusable=existing?pristineExistingResponse(existing):null;
      if(existing&&!reusable){results.skippedParticipants++;continue}
      const principalRow=group.find(r=>r.kind==="REPONSES")||null;
      const ficheRows=group.filter(r=>r.kind==="FICHES");
      const subRows=group.filter(r=>r.kind==="SOUS_FICHES");
      const principalPrepared=principalRow?preparedValues(principalRow.values):[];
      const prepareRow=r=>{const type=r.type||(a.ctx.ficheTypes||[]).find(t=>String(codeOf(t.TypeFiche_Code))===String(r.typeCode));if(!type)throw new Error(`type de fiche « ${r.typeCode} » introuvable`);return{row:r,type,prepared:preparedValues(r.values)}};
      const preparedFiches=ficheRows.map(prepareRow),preparedSubs=subRows.map(prepareRow);
      const created=reusable||await createInitialResponse(campaign,a.ctx.campaign.Version_Code);if(!reusable)results.responsesCreated++;else results.responsesReused=(results.responsesReused||0)+1;
      if(principalRow){await writePreparedValues(created.principal,principalPrepared,created.access);results.principalRowsApplied++}
      const importedElements=new Map(),orderByType=new Map();
      for(const f of preparedFiches){
        const key=`root::${f.type.id}`,order=(orderByType.get(key)||0)+1;orderByType.set(key,order);
        const ec=unique("ELT");
        await grist.docApi.applyUserActions([["AddRecord","ELEMENTS_REPONSE",null,{Element_Code:ec,Reponse_Code:created.response.id,TypeFiche_Code:f.type.id,Type_element:"Fiche",Statut:"Brouillon",Ordre:order,Revision:1,Supprime_logiquement:false,Cle_creation_ACL:created.access}]]);
        await reloadResponseTables();
        const element=(S.data.ELEMENTS_REPONSE||[]).find(x=>String(codeOf(x.Element_Code))===ec);if(!element)throw new Error(`fiche ${f.row.ficheCode||f.row.line} créée mais non relisible`);
        await writePreparedValues(element,f.prepared,created.access);importedElements.set(String(f.row.ficheCode),element);results.fichesCreated++;
      }
      const pending=[...preparedSubs];
      while(pending.length){
        let progressed=false;
        for(let i=pending.length-1;i>=0;i--){
          const f=pending[i],parent=importedElements.get(String(f.row.parentCode));if(!parent)continue;
          const key=`${parent.id}::${f.type.id}`,order=(orderByType.get(key)||0)+1;orderByType.set(key,order);
          const ec=unique("ELT");
          await grist.docApi.applyUserActions([["AddRecord","ELEMENTS_REPONSE",null,{Element_Code:ec,Reponse_Code:created.response.id,TypeFiche_Code:f.type.id,Parent_Code:parent.id,Type_element:"Sous-fiche",Statut:"Brouillon",Ordre:order,Revision:1,Supprime_logiquement:false,Cle_creation_ACL:created.access}]]);
          await reloadResponseTables();
          const element=(S.data.ELEMENTS_REPONSE||[]).find(x=>String(codeOf(x.Element_Code))===ec);if(!element)throw new Error(`sous-fiche ${f.row.ficheCode||f.row.line} créée mais non relisible`);
          await writePreparedValues(element,f.prepared,created.access);importedElements.set(String(f.row.ficheCode),element);results.subFichesCreated++;pending.splice(i,1);progressed=true;
        }
        if(!progressed)throw new Error(`impossible de rattacher ${pending.length} sous-fiche(s) à leur parent : ${pending.map(x=>x.row.ficheCode||`ligne ${x.row.line}`).join(", ")}`);
      }
    }catch(e){results.errors.push(`${identifier} : ${e?.message||e}`)}
  }
  await reloadResponseTables();return results;
}

function context(){const c=selectedCampaign();if(!c)throw new Error("Sélectionnez une campagne.");const versionId=String(codeOf(c.Version_Code)),questions=(S.data.QUESTIONS||[]).filter(q=>String(codeOf(q.Version_Code))===versionId),ficheTypes=(S.data.TYPES_FICHES||[]).filter(t=>String(codeOf(t.Version_Code))===versionId),identifierColumn=String($("#identifier-column").value||"").trim();if(!identifierColumn)throw new Error("Indiquez le nom de la colonne identifiant.");return{campaign:c,versionId,questions,ficheTypes,identifierColumn,expectedIdentifiers:expectedIdentifiers()}}
function previewHtml(a){const s=a.stats,err=a.errors,warn=a.warnings;return `<div class="stats"><div class="stat"><strong>${s.lines}</strong>Lignes détectées</div><div class="stat"><strong>${s.identifiers}</strong>Identifiants distincts</div><div class="stat"><strong>${s.participantsFound}</strong>Participants trouvés</div><div class="stat"><strong>${s.participantsNotFound}</strong>Non trouvés</div><div class="stat"><strong>${s.recognizedQuestions}</strong>Colonnes questions reconnues</div><div class="stat"><strong>${s.unknownColumns}</strong>Colonnes inconnues</div><div class="stat"><strong>${s.ficheCount}</strong>Fiches</div><div class="stat"><strong>${s.subCount}</strong>Sous-fiches</div></div>${err.length?`<div class="errorbox"><strong>${err.length} erreur(s) bloquante(s)</strong><ul class="list">${err.slice(0,40).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>${err.length>40?`<div>… ${err.length-40} autre(s)</div>`:""}</div>`:'<div class="okbox">Aucune erreur bloquante détectée.</div>'}${warn.length?`<div class="warnbox"><strong>${warn.length} avertissement(s)</strong><ul class="list">${warn.slice(0,40).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>${warn.length>40?`<div>… ${warn.length-40} autre(s)</div>`:""}</div>`:""}<div class="table-wrap"><table><thead><tr><th>Feuille</th><th>Ligne</th><th>Identifiant</th><th>Type</th><th>Code fiche</th><th>Parent</th><th>Lecture seule</th><th>Valeurs</th></tr></thead><tbody>${a.parsed.slice(0,200).map(r=>`<tr><td>${esc(r.sheet)}</td><td>${r.line}</td><td>${esc(r.identifier)}</td><td>${esc(r.kind==="REPONSES"?"Principal":r.typeCode)}</td><td>${esc(r.ficheCode)}</td><td>${esc(r.parentCode)}</td><td>${r.readOnlyElement?"Oui":"Non"}</td><td>${r.values.length}</td></tr>`).join("")}</tbody></table></div>`}
async function analyze(){try{const file=$("#file").files?.[0];if(!file)throw new Error("Choisissez un fichier Excel.");const ctx=context();S.workbook=await readWorkbook(file);S.analysis=analyzeSheets(S.workbook.sheets,ctx);S.analysis.ctx=ctx;S.analysis.fileName=file.name;$("#preview").innerHTML=previewHtml(S.analysis);$("#stage").disabled=!!S.analysis.errors.length;status(S.analysis.errors.length?"Le fichier contient des erreurs à corriger avant import.":"Analyse terminée. Les données peuvent être préparées.",!!S.analysis.errors.length)}catch(e){S.analysis=null;$("#stage").disabled=true;status(e?.message||e,true)}}
function typedFields(q,raw){const t=String(q?.Type_question||"").toLowerCase(),v=raw;if(t.includes("nombre")||t.includes("numérique")||t.includes("numerique")||t.includes("montant")){const n=Number(String(v).replace(",","."));return Number.isFinite(n)?{Valeur_nombre:n}:{Valeur_texte:String(v)}}if(t.includes("date"))return{Valeur_texte:String(v)};if(t.includes("bool")||t.includes("oui/non"))return{Valeur_booleen:["1","oui","true","vrai","yes","x"].includes(String(v).trim().toLowerCase())};if(q.Referentiel_Code)return{Valeur_reference:String(v)};return{Valeur_texte:String(v)}}
async function chunks(actions,size=150){for(let i=0;i<actions.length;i+=size)await grist.docApi.applyUserActions(actions.slice(i,i+size))}
async function stageImport(){if(!S.analysis||S.analysis.errors.length)return;try{$("#stage").disabled=true;const a=S.analysis,c=a.ctx.campaign,identifierTarget=$("#identifier-target").value,srcCode=unique("SRC_INIT"),description=`Pré-remplissage depuis ${a.fileName}. Identifiant Excel: ${a.ctx.identifierColumn}; cible: ${$("#identifier-target").value}. Réponses simples, fiches et sous-fiches initialisées uniquement si aucune réponse active n’existe déjà pour le participant.`;const result=await grist.docApi.applyUserActions([["AddRecord","SOURCES_IMPORT",null,{Source_Code:srcCode,Nom:`Pré-remplissage — ${c.Nom||c.Campagne_Code}`,Description:description,Campagne_Code:c.id,Actif:true}]]);S.data.SOURCES_IMPORT=await fetchRows("SOURCES_IMPORT");const src=(S.data.SOURCES_IMPORT||[]).find(x=>String(x.Source_Code)===srcCode);if(!src)throw new Error("La source d’import a été créée mais n’a pas pu être relue.");const headers=[...new Set(a.parsed.flatMap(r=>Object.keys(r.raw)))],qBy=new Map(a.ctx.questions.map(q=>[String(q.Question_Code).toUpperCase(),q]));const mapActions=[];headers.forEach((h,i)=>{let logic=h,type="META";const hu=h.toUpperCase();if(qBy.has(hu)){logic=String(qBy.get(hu).Question_Code);type="QUESTION"}else if(hu.endsWith("__LECTURE_SEULE")){logic=hu.slice(0,-"__LECTURE_SEULE".length);type="LECTURE_SEULE"}mapActions.push(["AddRecord","MAPPINGS_IMPORT",null,{Mapping_Code:unique("MAP"),Source_Code:src.id,Colonne_source:h,Champ_logique:logic,Libelle_affichage:h,Afficher:true,Ordre:i+1,Type_donnee:type}])});mapActions.push(["AddRecord","MAPPINGS_IMPORT",null,{Mapping_Code:unique("MAP"),Source_Code:src.id,Colonne_source:a.ctx.identifierColumn,Champ_logique:"__IDENTIFIANT__",Libelle_affichage:`Correspondance: ${identifierTarget}`,Afficher:false,Ordre:0,Type_donnee:"IDENTIFIANT"}]);await chunks(mapActions);
      for(const r of a.parsed){const lineCode=unique("LIG_INIT"),json=JSON.stringify({version:1,sourceFile:a.fileName,sheet:r.sheet,kind:r.kind,identifier:r.identifier,identifierColumn:a.ctx.identifierColumn,identifierTarget,typeFiche:r.typeCode||null,codeFiche:r.ficheCode||null,codeParent:r.parentCode||null,lectureSeuleElement:!!r.readOnlyElement,lectureSeuleQuestions:Object.fromEntries(r.values.filter(v=>v.readOnly).map(v=>[String(v.question.Question_Code),true])),raw:r.raw});await grist.docApi.applyUserActions([["AddRecord","LIGNES_IMPORTEES",null,{Ligne_Code:lineCode,Source_Code:src.id,Numero_ligne_source:r.line,Ligne_source_complete2:json}]]);const lineRows=await fetchRows("LIGNES_IMPORTEES"),line=lineRows.find(x=>String(x.Ligne_Code)===lineCode);if(!line)throw new Error(`Impossible de relire la ligne ${r.line}.`);const vals=r.values.map(v=>["AddRecord","VALEURS_IMPORTEES",null,{ValeurImportee_Code:unique("VIMP"),Ligne_Code:line.id,Champ_logique:String(v.question.Question_Code),...typedFields(v.question,v.raw)}]);if(vals.length)await chunks(vals)}
      const init=await initializeResponsesAndFiches(a);const parts=[`${a.parsed.length} ligne(s) enregistrée(s) dans les tables d’import`,`${init.responsesCreated} réponse(s) support créée(s)`,`${init.responsesReused||0} réponse(s) vide(s) existante(s) réutilisée(s)`,`${init.principalRowsApplied} ligne(s) REPONSES appliquée(s)`,`${init.fichesCreated} fiche(s) créée(s)`,`${init.subFichesCreated||0} sous-fiche(s) créée(s)`,`${init.skippedParticipants} participant(s) ignoré(s) car une réponse existait déjà`,`${init.unmatched} identifiant(s) non rattaché(s)`];if(init.errors.length)parts.push(`${init.errors.length} erreur(s) d’initialisation`);status(parts.join(" · "),!!init.errors.length);S.analysis=null;$("#preview").innerHTML=`<div class="${init.errors.length?"warnbox":"okbox"}"><strong>Import enregistré et initialisation des réponses, fiches et sous-fiches terminée.</strong><div>${esc(parts.join(" · "))}</div>${init.errors.length?`<ul class="list">${init.errors.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}<div>Les marqueurs de lecture seule sont conservés dans l’import mais ne sont pas encore appliqués.</div></div>`}catch(e){status(`Enregistrement impossible : ${e?.message||e}`,true);$("#stage").disabled=false}}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
function downloadModel(){
  const c=selectedCampaign();if(!c){status("Sélectionnez d’abord une campagne.",true);return}
  const versionId=String(codeOf(c.Version_Code)),qs=(S.data.QUESTIONS||[]).filter(q=>String(codeOf(q.Version_Code))===versionId),types=(S.data.TYPES_FICHES||[]).filter(t=>String(codeOf(t.Version_Code))===versionId);
  const typeById=new Map(types.map(t=>[String(t.id),t])),hasParent=t=>{const raw=String(codeOf(t.Parent_Code));return !!raw&&(typeById.has(raw)||types.some(x=>String(codeOf(x.TypeFiche_Code))===raw))};
  const roots=types.filter(t=>!hasParent(t)),children=types.filter(hasParent),firstRoot=roots[0]||types[0],firstChild=children[0]||null;
  const qCodesFor=selected=>[...new Set(qs.filter(q=>selected.some(t=>String(codeOf(q.TypeFiche_Code))===String(t.id))&&!q.Est_ligne_matrice).map(q=>String(q.Question_Code)))];
  const principal=qs.filter(q=>!codeOf(q.TypeFiche_Code)&&!q.Est_ligne_matrice).map(q=>String(q.Question_Code)),ficheQs=qCodesFor(roots.length?roots:types),subQs=qCodesFor(children);
  const id=String($("#identifier-column").value||"IDENTIFIANT").trim()||"IDENTIFIANT",sheets=[
    {name:"REPONSES",rows:[[id,...principal.flatMap(q=>[q,`${q}__LECTURE_SEULE`])],["EXEMPLE_001",...principal.flatMap(()=>["","Non"])]]},
    {name:"FICHES",rows:[[id,"TYPE_FICHE","CODE_FICHE","LECTURE_SEULE_FICHE",...ficheQs.flatMap(q=>[q,`${q}__LECTURE_SEULE`])],["EXEMPLE_001",firstRoot?.TypeFiche_Code||"TYPE_FICHE","F001","Non",...ficheQs.flatMap(()=>["","Non"])]]},
    {name:"SOUS_FICHES",rows:[[id,"TYPE_FICHE","CODE_FICHE","CODE_PARENT","LECTURE_SEULE_FICHE",...subQs.flatMap(q=>[q,`${q}__LECTURE_SEULE`])],["EXEMPLE_001",firstChild?.TypeFiche_Code||"TYPE_SOUS_FICHE","SF001","F001","Non",...subQs.flatMap(()=>["","Non"])]]}
  ];downloadBlob(writeWorkbook(sheets),"modele_preremplissage_gristionnaire.xlsx")
}
$("#refresh").onclick=load;$("#analyze").onclick=analyze;$("#stage").onclick=stageImport;$("#download-model").onclick=downloadModel;$("#identifier-column").onchange=()=>{S.analysis=null;$("#stage").disabled=true};$("#identifier-target").onchange=()=>{S.analysis=null;$("#stage").disabled=true};
grist.ready({requiredAccess:"full"});load();
