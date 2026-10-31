// Gestion des périodes — configuration du questionnaire permanent.
const TABLE = 'PERIODES_QUESTIONNAIRE';
const COLS = ['Periode_Code','Questionnaire_Code','Libelle','Date_debut','Date_fin','Date_ouverture','Date_cloture','Statut'];
const MODE_COLUMN = 'Mode_permanent';
const ARCHIVE_COLUMN = 'Modification_archives_autorisee';
const $ = (s,root=document) => root.querySelector(s);
const e = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const code = x => Array.isArray(x)?x[1]:x;
const iso = x => /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T12:00:00Z`)) && new Date(`${x}T12:00:00Z`).toISOString().slice(0,10)===x;
function shiftYear(date){const [y,m,d]=date.split('-').map(Number);const yy=y+1;const max=new Date(Date.UTC(yy,m,0)).getUTCDate();return `${yy}-${String(m).padStart(2,'0')}-${String(Math.min(d,max)).padStart(2,'0')}`;}
function rows(raw){const ids=raw?.id||[];return ids.map((id,i)=>({id,...Object.fromEntries(Object.entries(raw).filter(([k])=>k!=='id').map(([k,a])=>[k,a[i]]))}));}
export function initPeriodManager(getQuestionnaire){
 const dialog=$('#periods-dialog'),content=$('#periods-content'),open=$('#manage-periods');if(!dialog||!content||!open)return;
 let current=[]; let archiveColumnPresent=false; let ready=false; let modeEnabled=false; let currentQuestionnaireId=null;
 const note=(message,error=false)=>{const el=$('#periods-note');if(el){el.textContent=message;el.style.color=error?'#b91c1c':'#166534';}};
 async function fetchPeriods(){try{const raw=await grist.docApi.fetchTable(TABLE);const missing=COLS.filter(x=>!(x in raw));if(missing.length)throw new Error(`Colonnes manquantes : ${missing.join(', ')}`);archiveColumnPresent=ARCHIVE_COLUMN in raw;ready=true;return rows(raw);}catch(err){ready=false;if(/Colonnes manquantes/.test(String(err)))throw err;return null;}}
 async function loadMode(q){
  const raw=await grist.docApi.fetchTable('QUESTIONNAIRES');
  if(!(MODE_COLUMN in raw))throw new Error(`Créez d'abord la colonne Booléen QUESTIONNAIRES.${MODE_COLUMN} dans Gristionnaire (sans formule).`);
  const item=rows(raw).find(r=>String(code(r.Questionnaire_Code))===String(q)||String(r.id)===String(q));
  if(!item)throw new Error('Questionnaire introuvable dans QUESTIONNAIRES.');
  currentQuestionnaireId=item.id;
  modeEnabled=item[MODE_COLUMN]===true||item[MODE_COLUMN]===1;
 }
 async function usageCount(codes){
  const raw=await grist.docApi.fetchTable('ELEMENTS_REPONSE');
  if(!('Periode_Code' in raw))throw new Error('La colonne ELEMENTS_REPONSE.Periode_Code est introuvable : vérification impossible.');
  const set=new Set(codes.map(String));
  return (raw.Periode_Code||[]).filter(v=>set.has(String(code(v)||''))).length;
 }
 // Affectation contrôlée des fiches historiques, limitée aux réponses du questionnaire sélectionné.
 async function historicalRows(q){
  const [rawElements,rawResponses,rawVersions]=await Promise.all([
   grist.docApi.fetchTable('ELEMENTS_REPONSE'),grist.docApi.fetchTable('REPONSES'),grist.docApi.fetchTable('VERSIONS_QUESTIONNAIRES')
  ]);
  for(const [raw,columns] of [[rawElements,['Reponse_Code','Periode_Code','Parent_Code']],[rawResponses,['Version_Code']],[rawVersions,['Questionnaire_Code']]]){
   const missing=columns.filter(k=>!(k in raw));if(missing.length)throw Error(`Colonnes nécessaires absentes : ${missing.join(', ')}`);
  }
  const versionIds=new Set(rows(rawVersions).filter(v=>String(code(v.Questionnaire_Code))===String(currentQuestionnaireId)||String(code(v.Questionnaire_Code))===String(q)).map(v=>String(v.id)));
  const responseIds=new Set(rows(rawResponses).filter(r=>versionIds.has(String(code(r.Version_Code)))).map(r=>String(r.id)));
  const own=rows(rawElements).filter(f=>responseIds.has(String(code(f.Reponse_Code))) && f.Supprime_logiquement!==true && f.Supprime_logiquement!==1 && String(f.Statut||'').toLowerCase()!=='annulé');
  const isChild=f=>Boolean(code(f.Parent_Code))&&String(code(f.Parent_Code))!=='0';
  return {all:own,roots:own.filter(f=>!isChild(f)&&!String(code(f.Periode_Code)||'').trim())};
 }
 async function showHistory(q){
  const host=$('#periods-history-host');if(!host)return;
  host.textContent='Recherche des fiches historiques…';
  try{
   const {roots}=await historicalRows(q);
   const options=current.filter(p=>String(code(p.Questionnaire_Code))===String(q)).map(p=>`<option value="${e(p.Periode_Code)}">${e(p.Libelle)} (${e(p.Statut)})</option>`).join('');
   if(!options){host.innerHTML='<p class="field-help">Créez d’abord une période de destination.</p>';return;}
   if(!roots.length){host.innerHTML='<p class="field-help">Aucune fiche principale sans période pour ce questionnaire.</p>';return;}
   host.innerHTML=`<div class="editor-section"><h4>Affecter des fiches historiques</h4><p class="field-help">Choisissez les fiches à affecter ; leurs sous-fiches non classées suivront automatiquement. Cette opération ne modifie pas les réponses enregistrées.</p><div style="max-height:300px;overflow:auto;border:1px solid #ddd;padding:.6rem">${roots.map(f=>`<label style="display:flex;gap:.5rem;align-items:center;padding:.3rem"><input type="checkbox" data-history-id="${f.id}"> Fiche ${e(f.Element_Code||f.id)} · Réponse ${e(f.Reponse_Code)}</label>`).join('')}</div><label>Période de destination<select id="history-target">${options}</select></label><div class="form-actions"><button type="button" class="btn btn-primary" id="history-assign">Affecter les fiches sélectionnées</button><button type="button" class="secondary-btn" id="history-cancel">Fermer</button></div></div>`;
   $('#history-cancel').onclick=()=>host.replaceChildren();
   $('#history-assign').onclick=async()=>{
    try{
    const selected=[...host.querySelectorAll('[data-history-id]:checked')].map(x=>Number(x.dataset.historyId));
    const target=$('#history-target')?.value;
    if(!selected.length){note('Sélectionnez au moins une fiche.',true);return;}
    const period=current.find(p=>String(p.Periode_Code)===target&&String(code(p.Questionnaire_Code))===String(q));
    if(!period)throw Error('La période sélectionnée est introuvable.');
    const latest=await historicalRows(q);const picked=latest.roots.filter(f=>selected.includes(f.id));
    if(picked.length!==selected.length)throw Error('Certaines fiches ont été modifiées. Actualisez la liste.');
    const children=[];const done=new Set(selected.map(String));let frontier=picked;
    while(frontier.length){const ids=new Set(frontier.map(f=>String(f.id)));const following=latest.all.filter(f=>!done.has(String(f.id))&&ids.has(String(code(f.Parent_Code)))&&!String(code(f.Periode_Code)||'').trim());for(const f of following){done.add(String(f.id));children.push(f);}frontier=following;}
    const affected=[...picked,...children];
    if(!confirm(`Affecter ${picked.length} fiche(s) et ${children.length} sous-fiche(s) à « ${period.Libelle} » ?\n\nLes réponses seront conservées. Le rattachement à une période pourra modifier les droits de consultation et de modification.`))return;
    const currentPeriods=await fetchPeriods();
    if(!currentPeriods.some(p=>String(p.Periode_Code)===target&&String(code(p.Questionnaire_Code))===String(q)))throw Error('La période de destination a changé.');
    // Revérifier les fiches juste avant écriture pour ne pas écraser une affectation concurrente.
    const check=await historicalRows(q);
    if(affected.some(f=>!check.all.some(v=>v.id===f.id&&!String(code(v.Periode_Code)||'').trim())))throw Error('Certaines fiches ont changé entre-temps. Opération annulée.');
    await grist.docApi.applyUserActions(affected.map(f=>['UpdateRecord','ELEMENTS_REPONSE',f.id,{Periode_Code:target}]));
    note(`${affected.length} fiche(s) et sous-fiche(s) rattachée(s) à « ${period.Libelle} ».`);
    await showHistory(q);
    }catch(err){note(`Affectation impossible : ${err?.message||err}`,true);}
   };
  }catch(err){host.textContent=`Classement impossible : ${err?.message||err}`;note(err?.message||String(err),true);}
 }
 async function changeMode(enabled,q){
  if(!currentQuestionnaireId)throw new Error('Questionnaire non identifié.');
  if(!enabled){
    const own=current.filter(p=>String(code(p.Questionnaire_Code))===String(q));
    const used=await usageCount(own.map(p=>p.Periode_Code));
    if(used && !confirm(`Passer au mode classique ?\n\n${used} fiche(s) ou sous-fiche(s) restent rattachées à leurs périodes. Elles seront toutes visibles ; celles des périodes clôturées resteront en lecture seule.\n\nLa validation globale sera indisponible tant que cette réponse contient des fiches périodisées, afin de protéger les archives.`))return false;
  }
  await grist.docApi.applyUserActions([['UpdateRecord','QUESTIONNAIRES',currentQuestionnaireId,{[MODE_COLUMN]:enabled}]]);
  await loadMode(q);
  return true;
 }
 // Retour contrôlé au mode classique : détache uniquement les éléments appartenant
 // aux réponses des versions du questionnaire sélectionné (y compris périodes supprimées).
 async function resetToClassic(q){
  if(!currentQuestionnaireId)throw new Error('Questionnaire non identifié.');
  const [elements, responses, versions, questionnaires, livePeriods]=await Promise.all([
   grist.docApi.fetchTable('ELEMENTS_REPONSE'),
   grist.docApi.fetchTable('REPONSES'),
   grist.docApi.fetchTable('VERSIONS_QUESTIONNAIRES'),
   grist.docApi.fetchTable('QUESTIONNAIRES'),
   grist.docApi.fetchTable(TABLE)
  ]);
  for(const [raw,cols] of [[elements,['Periode_Code','Reponse_Code']],[responses,['Version_Code']],[versions,['Questionnaire_Code']]]){
   const missing=cols.filter(c=>!(c in raw));if(missing.length)throw new Error(`Colonnes nécessaires absentes : ${missing.join(', ')}.`);
  }
  const questionnaire=rows(questionnaires).find(r=>r.id===currentQuestionnaireId);
  if(!questionnaire||String(code(questionnaire.Questionnaire_Code))!==String(q))throw new Error('Le questionnaire sélectionné a changé. Actualisez.');
  const versionIds=new Set(rows(versions).filter(v=>String(code(v.Questionnaire_Code))===String(currentQuestionnaireId)||String(code(v.Questionnaire_Code))===String(q)).map(v=>String(v.id)));
  const responseIds=new Set(rows(responses).filter(r=>versionIds.has(String(code(r.Version_Code)))).map(r=>String(r.id)));
  const linked=rows(elements).filter(el=>responseIds.has(String(code(el.Reponse_Code)))&&String(code(el.Periode_Code)||'').trim());
  const owned=rows(livePeriods).filter(p=>String(code(p.Questionnaire_Code))===String(q)||String(code(p.Questionnaire_Code))===String(currentQuestionnaireId));
  const knownCodes=new Set(owned.map(p=>String(code(p.Periode_Code))));
  const orphanCount=linked.filter(el=>!knownCodes.has(String(code(el.Periode_Code)))).length;
  const textConfirm=`REVENIR DÉFINITIVEMENT AU MODE CLASSIQUE ?\n\n${linked.length} fiche(s) / sous-fiche(s) seront détachées de leurs périodes, dont ${orphanCount} avec une période déjà supprimée.\n${owned.length} période(s) encore configurée(s) seront supprimée(s).\n\nLes fiches, sous-fiches et leurs réponses seront conservées. Le rattachement historique des fiches aux périodes sera perdu.\n\nCette action concerne uniquement le questionnaire « ${q} ». Effectuez une sauvegarde du document Grist auparavant.\n\nConfirmer ?`;
  if(!confirm(textConfirm))return false;
  // Un second contrôle limite les risques en cas de modification concurrente.
  const [checkElements,checkResponses,checkVersions,checkPeriods]=await Promise.all([
   grist.docApi.fetchTable('ELEMENTS_REPONSE'),grist.docApi.fetchTable('REPONSES'),
   grist.docApi.fetchTable('VERSIONS_QUESTIONNAIRES'),grist.docApi.fetchTable(TABLE)
  ]);
  const freshVersionIds=new Set(rows(checkVersions).filter(v=>String(code(v.Questionnaire_Code))===String(currentQuestionnaireId)||String(code(v.Questionnaire_Code))===String(q)).map(v=>String(v.id)));
  const freshResponseIds=new Set(rows(checkResponses).filter(r=>freshVersionIds.has(String(code(r.Version_Code)))).map(r=>String(r.id)));
  const freshLinked=rows(checkElements).filter(el=>freshResponseIds.has(String(code(el.Reponse_Code)))&&String(code(el.Periode_Code)||'').trim());
  const freshPeriods=rows(checkPeriods).filter(p=>String(code(p.Questionnaire_Code))===String(q)||String(code(p.Questionnaire_Code))===String(currentQuestionnaireId));
  if(freshLinked.length!==linked.length||freshPeriods.length!==owned.length||freshLinked.some(el=>!linked.some(old=>old.id===el.id&&String(code(old.Periode_Code))===String(code(el.Periode_Code)))))throw new Error('Des rattachements ont changé pendant la confirmation. Recommencez après actualisation.');
  // Ordre : détacher, supprimer les définitions, puis désactiver le mode permanent.
  // Les fiches et les valeurs de réponse ne sont jamais supprimées.
  const actions=[
   ...freshLinked.map(el=>['UpdateRecord','ELEMENTS_REPONSE',el.id,{Periode_Code:''}]),
   ...freshPeriods.map(p=>['RemoveRecord',TABLE,p.id]),
   ['UpdateRecord','QUESTIONNAIRES',currentQuestionnaireId,{[MODE_COLUMN]:false}]
  ];
  if(actions.length)await grist.docApi.applyUserActions(actions);
  current=await fetchPeriods();await loadMode(q);
  return {detached:freshLinked.length,removed:freshPeriods.length};
 }
 function editor(row={}){return `<form id="periods-form" class="periods-editor"><input type="hidden" name="rowId" value="${e(row.id||'')}"><div class="periods-grid"><label>Libellé de la période<input name="Libelle" required maxlength="120" value="${e(row.Libelle||'')}" placeholder="Ex. 2026-2027"></label><label>Début de la période<input type="date" name="Date_debut" required value="${e(row.Date_debut||'')}"></label><label>Fin de la période<input type="date" name="Date_fin" required value="${e(row.Date_fin||'')}"></label><label>Date à partir de laquelle les répondants peuvent saisir des fiches<input type="date" name="Date_ouverture" value="${e(row.Date_ouverture||'')}"><small class="field-help" style="font-weight:400">Facultatif : si aucune date n’est indiquée, ce champ ne limite pas le début de la saisie.</small></label><label>Date limite de saisie et de modification des fiches<input type="date" name="Date_cloture" value="${e(row.Date_cloture||'')}"><small class="field-help" style="font-weight:400">Facultatif : date jusqu’à laquelle il sera possible d’ajouter ou corriger des fiches.</small></label><label>État administratif<select name="Statut">${['Prévue','Ouverte','Clôturée'].map(x=>`<option value="${x}" ${row.Statut===x?'selected':''}>${x}</option>`).join('')}</select></label></div><label style="display:flex;gap:.5rem;align-items:center;margin:1rem 0"><input type="checkbox" name="${ARCHIVE_COLUMN}" value="1" ${row[ARCHIVE_COLUMN]===true||row[ARCHIVE_COLUMN]===1?'checked':''} ${archiveColumnPresent?'':'disabled'}> Autoriser la modification des fiches archivées de cette période</label><p class="field-help">Cette autorisation s'applique aux fiches et sous-fiches existantes, en mode classique ou permanent. Elle ne permet ni de créer, ni de dupliquer, ni de supprimer des fiches archivées. ${archiveColumnPresent?'':'Ajoutez d’abord la colonne Booléen '+ARCHIVE_COLUMN+' dans PERIODES_QUESTIONNAIRE (sans formule).'}</p><p class="field-help">L'état et les dates de la période déterminent l'accès aux fiches dans le Questionnaire permanent.</p><div class="form-actions"><button type="submit" class="btn btn-primary">${row.id?'Enregistrer la période':'Créer la période'}</button><button type="button" class="secondary-btn" id="periods-cancel-edit">Annuler</button></div></form>`;}
 function list(q){const selected=current.filter(x=>String(code(x.Questionnaire_Code))===String(q));return selected.length?selected.sort((a,b)=>String(a.Date_debut).localeCompare(String(b.Date_debut))).map(p=>`<div class="period-row"><div><strong>${e(p.Libelle)}</strong><div class="hint">${e(p.Date_debut)} → ${e(p.Date_fin)} · ${e(p.Statut||'Prévue')}${p[ARCHIVE_COLUMN]?' · Archives modifiables':''}${p.Date_ouverture?' · Ouverture : '+e(p.Date_ouverture):''}${p.Date_cloture?' · Fin des modifications : '+e(p.Date_cloture):''}</div></div><div class="period-actions"><button type="button" class="secondary-btn" data-period-delete="${p.id}">Supprimer</button><button type="button" class="secondary-btn" data-period-edit="${p.id}">Modifier</button><button type="button" class="secondary-btn" data-period-next="${p.id}">Période suivante</button></div></div>`).join(''):'<p class="hint">Aucune période créée pour ce questionnaire.</p>';}
 function display(q){content.innerHTML=`<div class="editor-section"><h3>Mode de fonctionnement</h3><label for="period-mode-select">Type de questionnaire</label><select id="period-mode-select"><option value="classic" ${!modeEnabled?"selected":""}>Questionnaire classique</option><option value="permanent" ${modeEnabled?"selected":""}>Questionnaire permanent avec périodes</option></select><p class="field-help">En mode classique, toutes les fiches réapparaissent. Les archives clôturées restent en lecture seule ; les périodes et leurs rattachements sont conservés. La validation globale est protégée si des fiches périodisées existent.</p></div><p class="field-help">Configuration des périodes de « ${e(q)} ». Les périodes et le mode sont configurés par questionnaire. Aucun lien de campagne n’est modifié.</p>${archiveColumnPresent?'':'<p class="field-help" style="color:#b91c1c">Pour autoriser les modifications des archives, créez dans PERIODES_QUESTIONNAIRE la colonne Booléen Modification_archives_autorisee (sans formule). Les archives restent protégées tant que cette colonne est absente.</p>'}<div id="periods-note" role="status" aria-live="polite"></div><div class="editor-section"><h3>Périodes configurées</h3><div id="periods-list">${list(q)}</div><button type="button" class="secondary-btn" id="periods-new">+ Nouvelle période</button></div><div class="editor-section" style="margin-top:1.3rem;border:1px solid #f3c6b9;border-radius:10px;padding:1rem"><h3>Revenir entièrement au mode classique</h3><p class="field-help">Détache les fiches et sous-fiches des périodes (y compris celles déjà supprimées), supprime les périodes restantes de ce questionnaire et désactive le mode permanent. Aucune fiche ni réponse n’est supprimée. <strong>Le classement historique par période sera perdu.</strong> Faites une sauvegarde avant cette opération.</p><button type="button" class="secondary-btn" id="periods-reset-classic">Détacher les fiches et supprimer les périodes…</button></div><div class="editor-section"><h3>Classement des fiches historiques</h3><p class="field-help">Affecter à une période existante les anciennes fiches sans période, sans supprimer leurs réponses.</p><button type="button" class="secondary-btn" id="periods-history-open">Classer les fiches historiques…</button><div id="periods-history-host"></div></div><div id="periods-editor-host"></div>`;
 const modeSelect=$('#period-mode-select');
 modeSelect.onchange=async()=>{
  const enabled=modeSelect.value==='permanent';modeSelect.disabled=true;
  try{const changed=await changeMode(enabled,q);if(!changed){modeSelect.value=modeEnabled?'permanent':'classic';return;}display(q);note(enabled?'Mode permanent activé.':'Mode classique activé.');}
  catch(err){modeSelect.value=modeEnabled?'permanent':'classic';note(err?.message||String(err),true);}
  finally{modeSelect.disabled=false;}
 };
 const resetButton=$('#periods-reset-classic');
 resetButton.onclick=async()=>{
  resetButton.disabled=true;
  try{const result=await resetToClassic(q);if(result){display(q);note(`Mode classique rétabli : ${result.detached} fiche(s) / sous-fiche(s) détachée(s), ${result.removed} période(s) supprimée(s).`);}}
  catch(err){note(`Remise en mode classique impossible : ${err?.message||err}`,true);}
  finally{resetButton.disabled=false;}
 };
 $('#periods-history-open').onclick=()=>showHistory(q);
 $('#periods-new').onclick=()=>showEditor({Statut:'Prévue'});
 content.querySelectorAll('[data-period-delete]').forEach(b=>b.onclick=async()=>{
  const p=current.find(item=>String(item.id)===b.dataset.periodDelete);if(!p)return;
  b.disabled=true;
  try{
   const used=await usageCount([p.Periode_Code]);
   if(used)throw new Error(`Suppression refusée : ${used} fiche(s) ou sous-fiche(s) utilisent « ${p.Libelle} ».`);
   if(!confirm(`Supprimer la période « ${p.Libelle} » ? Cette opération est irréversible.`))return;
   // Relire immédiatement avant suppression pour éviter d'agir sur un état périmé.
   const refreshed=await fetchPeriods();
   const still=refreshed.find(x=>String(x.id)===String(p.id)&&String(x.Periode_Code)===String(p.Periode_Code));
   if(!still)throw new Error('La période a été modifiée ou supprimée : actualisez.');
   if(await usageCount([p.Periode_Code]))throw new Error('Une fiche utilise désormais cette période : suppression annulée.');
   await grist.docApi.applyUserActions([['RemoveRecord',TABLE,p.id]]);
   current=await fetchPeriods();display(q);note('Période inutilisée supprimée.');
  }catch(err){note(err?.message||String(err),true);}finally{b.disabled=false;}
 });content.querySelectorAll('[data-period-edit]').forEach(b=>b.onclick=()=>showEditor(current.find(p=>String(p.id)===b.dataset.periodEdit)||{}));content.querySelectorAll('[data-period-next]').forEach(b=>b.onclick=()=>{const p=current.find(x=>String(x.id)===b.dataset.periodNext);if(!p)return;const start=shiftYear(p.Date_debut),end=shiftYear(p.Date_fin);showEditor({Libelle:String(p.Libelle||'').replace(/\d{4}/g,y=>String(Number(y)+1)),Date_debut:start,Date_fin:end,Statut:'Prévue'});});}
 function showEditor(row){const host=$('#periods-editor-host');host.innerHTML=editor(row);$('#periods-cancel-edit').onclick=()=>host.replaceChildren();$('#periods-form').onsubmit=async ev=>{ev.preventDefault();const form=ev.currentTarget,fd=new FormData(form),q=getQuestionnaire(),id=Number(fd.get('rowId')||0);const values=Object.fromEntries(COLS.filter(x=>x!=='Periode_Code'&&x!=='Questionnaire_Code').map(x=>[x,String(fd.get(x)||'').trim()]));if(archiveColumnPresent)values[ARCHIVE_COLUMN]=fd.has(ARCHIVE_COLUMN);if(!q){note('Sélectionnez un questionnaire.',true);return;}if(!iso(values.Date_debut)||!iso(values.Date_fin)||values.Date_debut>values.Date_fin){note('Vérifiez les dates de début et de fin.',true);return;}for(const k of ['Date_ouverture','Date_cloture'])if(values[k]&&!iso(values[k])){note(`Date invalide : ${k}`,true);return;}if(values.Date_ouverture&&values.Date_cloture&&values.Date_ouverture>values.Date_cloture){note('La date de fin des modifications précède la date d’ouverture.',true);return;}if(current.some(x=>String(code(x.Questionnaire_Code))===String(q)&&x.id!==id&&String(x.Libelle).toLocaleLowerCase()===values.Libelle.toLocaleLowerCase())){note('Une période porte déjà ce nom pour ce questionnaire.',true);return;}const action=id?['UpdateRecord',TABLE,id,values]:['AddRecord',TABLE,null,{...values,Periode_Code:`PER_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,Questionnaire_Code:q}];const btn=form.querySelector('[type="submit"]');btn.disabled=true;try{await grist.docApi.applyUserActions([action]);current=await fetchPeriods();display(q);note('Période enregistrée. Aucun questionnaire répondant n’a été modifié.');}catch(err){note(`Enregistrement impossible : ${err?.message||err}`,true);btn.disabled=false;}};}
 async function show(){const q=getQuestionnaire();if(!q){alert('Sélectionnez d’abord un questionnaire.');return;}dialog.showModal();content.textContent='Chargement des périodes…';try{const found=await fetchPeriods();if(found){current=found;await loadMode(q);display(q);return;}content.innerHTML=`<div class="editor-section"><h3>Configuration des périodes indisponible</h3><p>La table <code>${TABLE}</code> est absente ou inaccessible. Vérifiez sa présence et les autorisations Grist avant de continuer.</p><p class="field-help">Aucune table ni donnée ne sera créée automatiquement en production.</p></div>`;}catch(err){content.textContent=`Impossible de lire les périodes : ${err.message||err}`;}}
 open.onclick=show;$('#close-periods').onclick=()=>dialog.close();
}
