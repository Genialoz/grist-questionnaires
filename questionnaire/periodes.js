// V2.1 : rattachement non destructif des nouvelles fiches aux périodes.
// Les périodes doivent être ouvertes pour autoriser les nouvelles fiches.
const text = v => String(v??"");
const escapeHtml = v => text(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rows = raw => (raw?.id??[]).map((id,i)=>Object.fromEntries([["id",id],...Object.entries(raw).filter(([k])=>k!=="id").map(([k,values])=>[k,values[i]])]));
const code = v => Array.isArray(v)?String(v[1]??""):text(v);
const norm = v => text(v).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
export async function readPeriodConfiguration(api,definition){
  const questionnaireRef=code(definition?.version?.Questionnaire_Code);
  if(!questionnaireRef)return null;
  try {
    // Questionnaire_Code is a Grist Ref in VERSIONS_QUESTIONNAIRES (numeric row id),
    // while PERIODES_QUESTIONNAIRE.Questionnaire_Code stores the business code.
    const [periodTable,elementTable,questionnaireTable]=await Promise.all([
      api.fetchTable("PERIODES_QUESTIONNAIRE"),
      api.fetchTable("ELEMENTS_REPONSE"),
      api.fetchTable("QUESTIONNAIRES")
    ]);
    if(!Object.prototype.hasOwnProperty.call(elementTable,"Periode_Code"))return {enabled:false,reason:"La colonne Texte ELEMENTS_REPONSE.Periode_Code est nécessaire pour activer le rattachement."};
    const questionnaire=rows(questionnaireTable).find(q=>text(q.id)===questionnaireRef||code(q.Questionnaire_Code)===questionnaireRef);
    if(!questionnaire)return {enabled:false,reason:"Le questionnaire associé à cette version est introuvable dans QUESTIONNAIRES."};
    // Le mode classique masque le sélecteur, mais conserve les périodes en mémoire
    // pour empêcher l'édition des fiches archivées.
    const permanent = !Object.prototype.hasOwnProperty.call(questionnaireTable,'Mode_permanent') ||
      questionnaire.Mode_permanent===true || questionnaire.Mode_permanent===1;
    const businessCode=code(questionnaire.Questionnaire_Code);
    const periods=rows(periodTable).filter(p=>code(p.Questionnaire_Code)===businessCode || code(p.Questionnaire_Code)===text(questionnaire.id))
      .sort((a,b)=>text(a.Date_debut).localeCompare(text(b.Date_debut)));
    if(!periods.length)return null;
    const selectable=periods.filter(p=>norm(p.Statut)==="ouverte");
    const today=new Date().toISOString().slice(0,10);
    const defaultPeriod=selectable.find(p=>text(p.Date_debut)<=today&&text(p.Date_fin)>=today)?.Periode_Code ?? selectable.at(-1)?.Periode_Code ?? "";
    return {enabled:permanent,protectArchives:!permanent,periods,selectable,defaultPeriod:permanent?text(defaultPeriod):""};
  }catch(err){
    console.warn("Périodes : lecture indisponible",err);
    return {enabled:false,reason:`Impossible de charger les périodes : ${err?.message??err}`};
  }
}
export function periodLabel(config,codeValue){
  if(!codeValue)return "Sans période (historique)";
  return text(config?.periods?.find(p=>text(p.Periode_Code)===text(codeValue))?.Libelle||codeValue);
}
// Navigation à deux espaces : les archives ne sont plus mélangées aux périodes ouvertes.
export function periodSelectionHtml(config, selected, fiches={}, pages=[]){
 if(!config || config.protectArchives)return "";
 if(!config.enabled)return `<section class="fiche-period-selector"><p class="help">${escapeHtml(config.reason||"Configuration des périodes indisponible.")}</p></section>`;
 const open=config.periods.filter(p=>norm(p.Statut)==="ouverte");
 const closed=config.periods.filter(p=>norm(p.Statut)==="cloturee").slice().reverse();
 const isArchive=selected==="__archives__" || selected==="__historique__" || closed.some(p=>text(p.Periode_Code)===text(selected));
 const cardsCount=periodCode=>Object.values(fiches??{}).reduce((n,list)=>n+(list??[]).filter(f=>!f.parentElementId && text(f.periodeCode)===text(periodCode)).length,0);
 const legacyCount=Object.values(fiches??{}).reduce((n,list)=>n+(list??[]).filter(f=>!f.parentElementId && !f.periodeCode).length,0);
 const hasArchives=closed.length>0 || legacyCount>0;
 const activeOptions=open.map(p=>`<option value="${escapeHtml(p.Periode_Code)}"${text(p.Periode_Code)===text(selected)?" selected":""}>${escapeHtml(p.Libelle||p.Periode_Code)}</option>`).join("");
 const nav=`<div class="period-space-tabs" role="group" aria-label="Espaces du questionnaire"><button type="button" class="period-space-tab${!isArchive?" is-active":""}" data-period-space="active" aria-pressed="${!isArchive}">Périodes en cours</button>${hasArchives?`<button type="button" class="period-space-tab${isArchive?" is-active":""}" data-period-space="archives" aria-pressed="${isArchive}">📁 Archives</button>`:""}</div>`;
 if(!isArchive)return `<section class="fiche-period-selector period-space">${nav}<div class="period-space-content"><label for="respondent-period">Période en cours</label><select id="respondent-period" data-period-select${open.length?"":" disabled"}><option value="">${open.length?"Choisir une période":"Aucune période ouverte"}</option>${activeOptions}</select><p class="help">Les fiches sont enregistrées dans la période sélectionnée. Les périodes clôturées se trouvent dans l’espace Archives.</p></div></section>`;
 const cards=closed.map(p=>{const key=text(p.Periode_Code),count=cardsCount(key),editable=periodEditable(config,key),chosen=selected===key;return `<article class="period-archive-card${chosen?" is-selected":""}"><div><div class="period-archive-title">${escapeHtml(p.Libelle||key)}</div><div class="period-archive-meta">${count} ${count>1?"fiches":"fiche"} · ${editable?"Modifications autorisées":"Lecture seule"}</div></div><button type="button" class="btn btn-small${chosen?" btn-primary":""}" data-archive-open="${escapeHtml(key)}">${chosen?"Période affichée":"Consulter"}</button></article>`;}).join("");
 const legacyCard=legacyCount?`<article class="period-archive-card${selected==="__historique__"?" is-selected":""}"><div><div class="period-archive-title">Sans période (historique)</div><div class="period-archive-meta">${legacyCount} ${legacyCount>1?"fiches":"fiche"} · Consultation</div></div><button type="button" class="btn btn-small" data-archive-open="__historique__">Consulter</button></article>`:"";
 const chosen=closed.find(p=>text(p.Periode_Code)===text(selected));
 // Toutes les pages ont leur place dans une archive : questions générales,
 // fiches et indicateurs, même si une page ne contient aucune fiche.
 const pageCards=pages.map((page,index)=>{
   const types=page.repeatableTypes||[];
   const count=types.reduce((n,type)=>n+(fiches[type.code]||[]).filter(f=>!f.parentElementId && (selected==="__historique__"?!f.periodeCode:text(f.periodeCode)===text(selected))).length,0);
   return {index,title:page.Titre||page.Libelle||page.Nom||`Page ${index+1}`,count};
 });
 const pageLinks=(chosen || selected==="__historique__") && pageCards.length>1?`<div class="period-archive-pages"><strong>Pages du questionnaire archivé</strong><div class="period-archive-list">${pageCards.map(p=>`<article class="period-archive-card"><div><div class="period-archive-title">${escapeHtml(p.title)}</div><div class="period-archive-meta">${p.count?`${p.count} ${p.count>1?"fiches":"fiche"}`:"Questions générales / indicateurs"}</div></div><button type="button" class="btn btn-small" data-archive-page="${p.index}">Consulter cette page</button></article>`).join("")}</div></div>`:"";
 const exportActions=`<div class="period-archive-export"><strong>Télécharger mes réponses</strong><div class="period-archive-export-buttons">${chosen||selected==="__historique__"?`<button type="button" class="btn btn-small" data-period-export="excel" data-export-period="${escapeHtml(selected)}">Cette période (Excel)</button><button type="button" class="btn btn-small" data-period-export="pdf" data-export-period="${escapeHtml(selected)}">Cette période (PDF)</button>`:""}<button type="button" class="btn btn-small" data-period-export="all-excel">Toutes les périodes (Excel)</button><button type="button" class="btn btn-small" data-period-export="all-pdf">Toutes les périodes (PDF)</button></div></div>`;
 const detail=chosen?`<div class="period-archive-detail"><strong>📁 Archives — ${escapeHtml(chosen.Libelle||chosen.Periode_Code)}</strong><span>${periodEditable(config,selected)?"La correction des fiches existantes est autorisée. Ajout et suppression restent indisponibles.":"Cette période est clôturée : les fiches sont consultables en lecture seule."}</span><button type="button" class="btn btn-small" data-archive-back>← Retour aux archives</button></div>`:selected==="__historique__"?`<div class="period-archive-detail"><strong>Sans période (historique)</strong><span>Consultation des fiches enregistrées avant la mise en place des périodes.</span><button type="button" class="btn btn-small" data-archive-back>← Retour aux archives</button></div>`:"";
 return `<section class="fiche-period-selector period-space">${nav}<div class="period-space-content"><h3>Mes archives</h3><div class="period-archive-list">${cards}${legacyCard||""}${!cards&&!legacyCard?'<p class="help">Aucune archive disponible.</p>':""}</div>${detail}${pageLinks}${exportActions}</div></section>`;
}
export function periodForNewFiche(config,selected,parentElementId,elements=[]){
 if(!config?.enabled)return "";
 if(parentElementId){const parent=elements.find(el=>String(el.id)===String(parentElementId));if(!parent)throw Error("Fiche parente introuvable pour le rattachement à la période.");return text(parent.Periode_Code||"");}
 const p=config.selectable.find(p=>text(p.Periode_Code)===text(selected));
 if(!p)throw Error("Sélectionnez une période ouverte avant d'ajouter une nouvelle fiche.");
 return text(p.Periode_Code);
}

// La protection est basée sur la période réelle de la fiche, jamais sur la seule sélection à l’écran.
export function periodEditable(config, periodCode) {
 if (!config?.enabled && !config?.protectArchives) return true;
 if (!periodCode) return !config?.enabled; // historique : ne pas modifier sans migration explicite
 const p=config.periods.find(x=>text(x.Periode_Code)===text(periodCode));
 if (!p) return false;
 if(norm(p.Statut)==="cloturee")return p.Modification_archives_autorisee===true || p.Modification_archives_autorisee===1;
 if(norm(p.Statut)!=="ouverte")return false;
 const today=new Date().toISOString().slice(0,10);
 const date=v=>{if(typeof v==="number"&&Number.isFinite(v))return new Date(v*1000).toISOString().slice(0,10);return text(v).slice(0,10)};
 const open=date(p.Date_ouverture),close=date(p.Date_cloture);
 return (!open || today>=open)&&(!close || today<=close);
}
export function periodMatches(config, selected, fiche){
 if(!config?.enabled)return true;
 const codeValue=text(fiche?.periodeCode);
 return selected==="__all__"?true:selected==="__historique__"?!codeValue:codeValue===text(selected);
}

// Actions destructrices et créations interdites sur toute période non ouverte, même déverrouillée.
export function periodCanChangeStructure(config, periodCode){
 if(!config?.enabled&&!config?.protectArchives)return true;
 if(!periodCode)return !config?.enabled;
 const p=config.periods.find(x=>text(x.Periode_Code)===text(periodCode));
 if(!p || norm(p.Statut)!=="ouverte")return false;
 const today=new Date().toISOString().slice(0,10);
 const asDate=v=>typeof v==="number"&&Number.isFinite(v)?new Date(v*1000).toISOString().slice(0,10):text(v).slice(0,10);
 return (!asDate(p.Date_ouverture)||today>=asDate(p.Date_ouverture))&&(!asDate(p.Date_cloture)||today<=asDate(p.Date_cloture));
}
