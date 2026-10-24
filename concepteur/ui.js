const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function matchesStructure(label,search){const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return norm(label).includes(norm(search).trim());}
export function inspectorGroup(title,names=''){if(/appearance-|mise en forme|affichage de la fiche/i.test(title+' '+names))return 'appearance';if(/condition|filtr|obligation|navigation|comportement|nombre de fiches/i.test(title+' '+names))return 'logic';return 'content';}
export function questionPreview({title,type='',description='',choices=[],lines=[],renderRich=esc}){const t=type.toLowerCase();let control='';const options=choices.length?choices:['Modalité 1','Modalité 2'];if(/matrice/.test(t)){control=`<div class="design-matrix"><table><thead><tr><th></th>${options.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${(lines.length?lines:['Ligne 1','Ligne 2']).map(l=>`<tr><th>${esc(l)}</th>${options.map(()=>'<td><span class="design-radio"></span></td>').join('')}</tr>`).join('')}</tbody></table></div>`;}else if(/radio|case|multiple|choix/.test(t)){control=options.map(c=>`<div class="design-option"><span class="${/case|multiple/.test(t)?'design-check':'design-radio'}"></span>${esc(c)}</div>`).join('');}else if(/liste|déroul|deroul/.test(t)){control=`<div class="design-field">Sélectionner une réponse <span>⌄</span></div>${choices.length?`<p class="hint">${choices.map(esc).join(' · ')}</p>`:''}`;}else{control=`<div class="design-field ${/long|paragraphe/.test(t)?'design-textarea':''}">${/date/.test(t)?'jj / mm / aaaa':/nombre|entier|decimal|num/.test(t)?'0':'Votre réponse…'}</div>`;}return `<article class="design-question"><div class="design-type">${esc(type||'Question')}</div><h3>${renderRich(title)}</h3>${description?`<p>${renderRich(description)}</p>`:''}${control}</article>`;}
export function initDesignerUI(actions={}){document.querySelector("#structure-add-fiche").onclick=actions.addFiche;document.querySelector("#structure-add-subfiche").onclick=actions.addSubfiche;const workspace=document.querySelector('.workspace');const savedWidths=(()=>{try{return JSON.parse(localStorage.getItem('gristionnaire.concepteur.workspaceWidths')||'{}')}catch{return{}}})();const setWorkspaceWidths=(left,right)=>{if(!workspace)return;const rect=workspace.getBoundingClientRect(),total=Math.max(1,rect.width),minCanvas=320,minLeft=240,minRight=280,maxSide=Math.max(300,total-minCanvas-24);left=Math.max(minLeft,Math.min(Number(left)||330,maxSide));right=Math.max(minRight,Math.min(Number(right)||390,Math.max(minRight,total-left-minCanvas-24)));workspace.style.setProperty('--structure-width',left+'px');workspace.style.setProperty('--properties-width',right+'px');try{localStorage.setItem('gristionnaire.concepteur.workspaceWidths',JSON.stringify({left,right}))}catch{}};if(workspace&&window.innerWidth>720)setWorkspaceWidths(savedWidths.left||workspace.querySelector('.structure-panel')?.getBoundingClientRect().width||330,savedWidths.right||workspace.querySelector('.properties-panel')?.getBoundingClientRect().width||390);document.querySelectorAll('.workspace-resizer').forEach(handle=>{let startX=0,startLeft=0,startRight=0;const move=e=>{if(!workspace)return;const dx=e.clientX-startX;if(handle.dataset.resizer==='structure')setWorkspaceWidths(startLeft+dx,startRight);else setWorkspaceWidths(startLeft,startRight-dx)};const stop=()=>{handle.classList.remove('is-dragging');workspace?.classList.remove('is-resizing');window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop)};handle.addEventListener('pointerdown',e=>{if(window.innerWidth<=720)return;e.preventDefault();startX=e.clientX;startLeft=workspace.querySelector('.structure-panel')?.getBoundingClientRect().width||330;startRight=workspace.querySelector('.properties-panel')?.getBoundingClientRect().width||390;handle.classList.add('is-dragging');workspace.classList.add('is-resizing');handle.setPointerCapture?.(e.pointerId);window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop)});handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key)||window.innerWidth<=850)return;e.preventDefault();const step=e.shiftKey?40:16,left=workspace.querySelector('.structure-panel')?.getBoundingClientRect().width||330,right=workspace.querySelector('.properties-panel')?.getBoundingClientRect().width||390,dir=e.key==='ArrowRight'?1:-1;if(handle.dataset.resizer==='structure')setWorkspaceWidths(left+dir*step,right);else setWorkspaceWidths(left,right-dir*step)})});const search=document.querySelector('#structure-search');const tree=document.querySelector('#tree');const filter=()=>{let count=0;tree.querySelectorAll('.tree-item').forEach(el=>{el.hidden=!matchesStructure(el.textContent,search.value);if(!el.hidden)count++;});document.querySelector('#structure-count').textContent=`${count} élément${count>1?'s':''}`;};search.addEventListener('input',filter);new MutationObserver(filter).observe(tree,{childList:true});document.querySelectorAll('[data-workspace-view]').forEach(b=>b.addEventListener('click',()=>{document.querySelector('#designer').dataset.view=b.dataset.workspaceView;document.querySelectorAll('[data-workspace-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));}));const selectors=document.querySelector('.selectors');for(const [label,ids] of [['Questionnaire',['manage-questionnaires','general-info','new-questionnaire']],['Collecte et analyse',['manage-campaigns','manage-results']]]){const group=document.createElement('div');group.className='designer-action-group';group.setAttribute('aria-label',label);ids.forEach(id=>group.append(document.getElementById(id)));selectors.append(group);}new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('.condition-builder')||n.querySelector?.('.condition-builder'))))){document.querySelector('[data-workspace-view="canvas"]').click();}}).observe(document.querySelector('#canvas'),{childList:true});filter();}
// Organise uniquement le DOM du panneau : aucun champ ni identifiant Grist n'est modifié.
export function enhanceInspector(updatePreview){
 const form=document.querySelector('#edit-form');if(!form)return;
 const isQuestion=Boolean(form.querySelector('[name="qtype"]'));
 const hasChoices=isQuestion&&Boolean(form.querySelector('#choice-list, #matrix-input-column-list, #matrix-line-list, [data-kind="direct-choices"], [data-kind="matrix-columns"], [data-kind="matrix-input-columns"]'));
 const groups=hasChoices?['content','choices','logic','appearance']:['content','logic','appearance'];
 const labels={content:'Général',choices:'Modalités',logic:'Conditions',appearance:'Apparence'};
 const bar=document.createElement('nav');bar.className='inspector-tabs';bar.setAttribute('aria-label','Réglages de l’élément');
 const panels=Object.fromEntries(groups.map(group=>{const panel=document.createElement('div');panel.className='inspector-group';panel.dataset.inspectorGroup=group;return[group,panel]}));
 const classify=child=>{
  const title=child.querySelector('h3')?.textContent||'';
  const kind=child.dataset.kind||'';
  const names=[...child.querySelectorAll('[name]')].map(x=>x.name).join(' ');
  if(hasChoices&&(/^(direct-choices|matrix-columns|matrix-input-columns|matrix-lines|matrix-multi-headers|referential-precisions)$/.test(kind)||/^(Choix proposés|Colonnes \/ modalités|Colonnes de saisie|Lignes de la matrice|En-têtes multi-niveaux|Précisions par modalité)/i.test(title)))return 'choices';
  if(/appearance-|mise en forme|affichage de la fiche/i.test(title+' '+names))return 'appearance';
  if(/condition|filtr|obligation|navigation|comportement|validation et comportement|nombre de fiches/i.test(title+' '+names))return 'logic';
  return 'content';
 };
 [...form.children].forEach(child=>{if(child.classList.contains('form-actions'))return;panels[classify(child)].append(child)});
 const show=group=>{groups.forEach(g=>{panels[g].hidden=g!==group});bar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===group)))};
 groups.forEach(group=>{const b=document.createElement('button');b.type='button';b.dataset.group=group;b.textContent=labels[group];b.setAttribute('aria-controls','inspector-'+group);b.setAttribute('aria-pressed','false');b.onclick=()=>show(group);bar.append(b);panels[group].id='inspector-'+group;if(!panels[group].children.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='Aucun réglage spécifique pour cet élément.';panels[group].append(empty)}});
 // Guidance visuelle uniquement : les champs existants restent dans le formulaire.
 if(panels.appearance){
  const intro=document.createElement('div');
  intro.className='appearance-intro';
  intro.innerHTML='<strong>Apparence de cet élément</strong><p>Réglez ici la présentation de l’ensemble du titre ou du libellé. Pour modifier uniquement des mots sélectionnés, utilisez l’éditeur de texte de l’onglet Général. Le thème général du questionnaire se règle dans « Informations générales / Apparence ».</p>';
  panels.appearance.prepend(intro);
 }
 form.prepend(bar,...groups.map(g=>panels[g]));show('content');
 const dirty=document.createElement('p');dirty.className='designer-draft';dirty.setAttribute('role','status');dirty.textContent=form.dataset.dirty==='1'?'Modifications à enregistrer':'Réglages de l’élément sélectionné';bar.after(dirty);
 const update=()=>{form.dataset.dirty='1';dirty.textContent='Modifications à enregistrer';updatePreview(form)};
 form.addEventListener('input',update);form.addEventListener('change',update);
 new MutationObserver(()=>updatePreview(form)).observe(form,{childList:true,subtree:true,attributes:true,attributeFilter:['data-deleted']});updatePreview(form);
}

// null means there is no editor list; [] means every draft row was removed.
export function previewDraftLabels(list,labelSelector,orderSelector){
 if(!list)return null;
 return [...list.querySelectorAll('.choice-row')].filter(row=>row.dataset.deleted!=='1').map((row,index)=>({label:row.querySelector(labelSelector)?.value??'',order:Number(row.querySelector(orderSelector||'[data-preview-no-order]')?.value||index+1),index})).sort((a,b)=>a.order-b.order||a.index-b.index).map(row=>row.label);
}


// Progressive enhancement only: keep every existing input and event handler in place.
// Collapsing panels never deletes form fields or changes Grist records.
export function enhanceChoiceLists(){
 const form=document.querySelector('#edit-form');if(!form)return;
 const specs=[['choice-list','Modalités'],['matrix-line-list','Lignes'],['matrix-input-column-list','Colonnes']];
 const activeLists=specs.map(([id,label])=>({id,label,list:form.querySelector('#'+id)})).filter(x=>x.list);
 if(!activeLists.length)return;
 const matrix=Boolean(form.querySelector('[data-kind="matrix-lines"]'));
 if(matrix){
  const sections=[...form.querySelectorAll('.editor-section')].filter(x=>x.matches('[data-kind="matrix-lines"], [data-kind="matrix-columns"], [data-kind="matrix-input-columns"], [data-kind="matrix-multi-headers"]'));
  if(sections.length){
   const bar=document.createElement('nav');bar.className='matrix-editor-tabs';bar.setAttribute('aria-label','Gestion de la matrice');
   const views=[['lines','Lignes'],['columns','Colonnes'],['settings','En-têtes']];
   const show=key=>{sections.forEach(x=>{const kind=x.dataset.kind;const group=kind==='matrix-lines'?'lines':kind==='matrix-multi-headers'?'settings':'columns';x.hidden=group!==key;});bar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===key)));};
   for(const [key,label] of views){if(key==='settings'&&!sections.some(x=>x.dataset.kind==='matrix-multi-headers'))continue;const b=document.createElement('button');b.type='button';b.dataset.view=key;b.textContent=label;b.onclick=()=>show(key);bar.append(b)}
   sections[0].before(bar);show('lines');
  }
 }
 for(const {id,list,label} of activeLists){
  const section=list.closest('.editor-section');
  if(!section)continue;
  const toolbar=document.createElement('div');toolbar.className='compact-list-toolbar';
  const search=document.createElement('input');search.type='search';search.placeholder='Rechercher dans '+label.toLowerCase()+'…';search.setAttribute('aria-label',search.placeholder);
  const counter=document.createElement('span');counter.className='compact-list-count';counter.setAttribute('role','status');
  const clearSearch=document.createElement('button');clearSearch.type='button';clearSearch.className='secondary-btn';clearSearch.textContent='Effacer la recherche';clearSearch.hidden=true;
  const searchEmpty=document.createElement('p');searchEmpty.className='hint compact-search-empty';searchEmpty.setAttribute('role','status');searchEmpty.hidden=true;
  searchEmpty.textContent='Aucun résultat. Effacez la recherche pour afficher toutes les entrées.';
  const all=document.createElement('button');all.type='button';all.className='secondary-btn';all.textContent='Tout déplier';
  const none=document.createElement('button');none.type='button';none.className='secondary-btn';none.textContent='Tout replier';
  toolbar.append(search,clearSearch,counter,all,none);list.before(toolbar);list.after(searchEmpty);list.classList.add('compact-choice-list');
  const isMatrixColumn=id==='matrix-input-column-list'||(id==='choice-list'&&matrix);
  if(isMatrixColumn){
   const bulk=document.createElement('div');bulk.className='compact-bulk-policy';
   const selectionInfo=document.createElement('span');selectionInfo.className='compact-bulk-selection';selectionInfo.setAttribute('role','status');
   const actionButtons=[];
   const actionFeedback=document.createElement('p');
   actionFeedback.className='compact-bulk-feedback';
   actionFeedback.setAttribute('role','status');
   actionFeedback.setAttribute('aria-live','polite');
   actionFeedback.style.cssText='margin:6px 0 0;font-size:0.9em;font-weight:600;';
   const selectedRows=()=>[...list.querySelectorAll(':scope > .choice-row')].filter(row=>row.dataset.deleted!=='1'&&row.querySelector('.compact-bulk-check')?.checked);
   const refreshSelection=()=>{const count=selectedRows().length;selectionInfo.textContent=`${count} colonne${count>1?'s':''} sélectionnée${count>1?'s':''}`;actionButtons.forEach(button=>button.disabled=count===0)};
   const applyButton=(title,handler)=>{const b=document.createElement('button');b.type='button';b.className='secondary-btn';b.textContent=title;b.onclick=()=>{let applied=0;for(const row of selectedRows()){const el=handler(row);if(el){applied++;el.dispatchEvent(new Event('change',{bubbles:true}));}}actionFeedback.textContent=applied?`✓ ${title} : ${applied} colonne${applied>1?'s':''} concernée${applied>1?'s':''}. Pensez à cliquer sur Enregistrer.`:'Aucune colonne modifiable trouvée pour cette action.';b.classList.add('is-applied');b.style.outline='2px solid currentColor';window.setTimeout(()=>{b.classList.remove('is-applied');b.style.outline=''},800);refreshSelection()};bulk.append(b);actionButtons.push(b)};
   applyButton('Rendre visibles',row=>{const select=row.querySelector('[data-choice-visibility],[data-matrix-visibility]');if(select)select.value='Visible';return select});
   applyButton('Masquer',row=>{const select=row.querySelector('[data-choice-visibility],[data-matrix-visibility]');if(select)select.value='Masquée';return select});
   applyButton('Lecture seule',row=>{const check=row.querySelector('[data-choice-readonly],[data-matrix-readonly]');if(check)check.checked=true;return check});
   applyButton('Rendre modifiables',row=>{const check=row.querySelector('[data-choice-readonly],[data-matrix-readonly]');if(check)check.checked=false;return check});
   const selectAll=document.createElement('button');selectAll.type='button';selectAll.className='secondary-btn';selectAll.textContent='Sélectionner les lignes affichées';selectAll.onclick=()=>{list.querySelectorAll(':scope > .choice-row').forEach(row=>{const c=row.querySelector('.compact-bulk-check');if(c&&row.dataset.deleted!=='1'&&!row.hidden)c.checked=true});refreshSelection()};
   const clearSelection=document.createElement('button');clearSelection.type='button';clearSelection.className='secondary-btn';clearSelection.textContent='Tout désélectionner';clearSelection.onclick=()=>{list.querySelectorAll('.compact-bulk-check').forEach(c=>{c.checked=false});refreshSelection()};
   bulk.prepend(selectionInfo,selectAll,clearSelection);
   list.before(bulk);
   bulk.after(actionFeedback);
   list.addEventListener('change',e=>{if(e.target.matches('.compact-bulk-check'))refreshSelection()});
   // Newly added or deleted rows also update the action availability.
   new MutationObserver(refreshSelection).observe(list,{childList:true,subtree:false,attributes:true,attributeFilter:['data-deleted']});
   refreshSelection();
  }

  // Reorder existing records using the same Ordre inputs already saved by app.js.
  // Newly inserted (not yet saved) rows are intentionally excluded: the Grist
  // AddRecord path assigns their order on creation.
  const orderSelector=id==='matrix-line-list'?'[data-matrix-line-order]':id==='matrix-input-column-list'?'[data-matrix-column-order]':'[data-choice-order]';
  const orderedRows=()=>[...list.querySelectorAll(':scope > .choice-row')].filter(r=>r.dataset.deleted!=='1');
  const refreshMoveButtons=()=>{
   const rows=orderedRows();
   rows.forEach((row,index)=>{
    const persisted=Boolean(row.querySelector(orderSelector));
    const up=row.querySelector('.compact-move-up'),down=row.querySelector('.compact-move-down');
    if(up)up.disabled=!persisted||index===0||!rows[index-1]?.querySelector(orderSelector);
    if(down)down.disabled=!persisted||index===rows.length-1||!rows[index+1]?.querySelector(orderSelector);
   });
  };
  const moveRow=(row,delta)=>{
   if(search.value.trim()){
    search.value='';filter();
   }
   const rows=orderedRows(),i=rows.indexOf(row),other=rows[i+delta];
   if(i<0||!other||!row.querySelector(orderSelector)||!other.querySelector(orderSelector))return;
   // Keep the existing field values as the source of truth. Swapping rather
   // than renumbering every row limits changes to two Grist records.
   const a=row.querySelector(orderSelector),b=other.querySelector(orderSelector);
   const oldA=a.value,oldB=b.value;
   a.value=oldB;b.value=oldA;
   if(delta<0)list.insertBefore(row,other);else list.insertBefore(other,row);
   for(const input of [a,b])input.dispatchEvent(new Event('change',{bubbles:true}));
   updateIndexes();refreshMoveButtons();
   row.querySelector('.compact-move-up')?.focus();
  };
  const updateIndexes=()=>[...list.querySelectorAll(':scope > .choice-row')].forEach((row,index)=>{const n=row.querySelector('.compact-choice-number');if(n)n.textContent=String(index+1).padStart(2,'0');});
  const initialize=()=>{
   for(const row of list.querySelectorAll(':scope > .choice-row')){
    if(row.dataset.compactReady==='1')continue;row.dataset.compactReady='1';
    const labelBox=row.querySelector(':scope > .choice-label');const tools=row.querySelector(':scope > .choice-tools');const policy=row.querySelector(':scope > .matrix-column-policy');
    if(!labelBox)continue;
    const head=document.createElement('div');head.className='compact-choice-heading';
    const toggle=document.createElement('button');toggle.type='button';toggle.className='compact-choice-toggle';toggle.textContent='Options ▸';toggle.setAttribute('aria-expanded','false');
    const details=document.createElement('div');details.className='compact-choice-details';details.hidden=true;
    const name=document.createElement('span');name.className='compact-choice-number';
    const moveTools=document.createElement('span');moveTools.className='compact-move-tools';
    for(const [direction,symbol,title] of [[-1,'↑','Monter'],[1,'↓','Descendre']]){
     const button=document.createElement('button');button.type='button';
     button.className=direction<0?'compact-move-up':'compact-move-down';
     button.textContent=symbol;button.title=title+' cet élément';
     button.setAttribute('aria-label',title+' '+label.toLowerCase().replace(/s$/,'')+' '+(labelBox.querySelector('input')?.value||''));
     button.addEventListener('click',()=>moveRow(row,direction));moveTools.append(button);
    }
    head.append(name,labelBox,moveTools,toggle);row.prepend(head);
    if(isMatrixColumn){const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='compact-bulk-check';checkbox.setAttribute('aria-label','Sélectionner cette colonne');head.insertBefore(checkbox,name)}
    if(tools)details.append(tools);if(policy)details.append(policy);
    // Other direct children (e.g. optional custom settings) are retained inside details.
    for(const child of [...row.children])if(child!==head&&child!==details)details.append(child);
    row.append(details);
    const expand=value=>{details.hidden=!value;toggle.setAttribute('aria-expanded',String(value));toggle.textContent=value?'Options ▾':'Options ▸';};
    toggle.addEventListener('click',()=>expand(details.hidden));row._expandCompact=expand;
    const input=labelBox.querySelector('input');if(input)input.setAttribute('aria-label',`Libellé ${label.toLowerCase()}`);
   }
   updateIndexes();filter();refreshMoveButtons();
  };
  function filter(){const query=search.value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();let n=0,total=0;for(const row of list.querySelectorAll(':scope > .choice-row')){if(row.dataset.deleted==='1')continue;total++;const val=row.querySelector('.choice-label input')?.value||row.querySelector('.choice-label')?.textContent||'';const visible=val.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query);row.hidden=!visible;if(visible)n++;}counter.textContent=query?`${n} sur ${total} élément${total>1?'s':''}`:`${total} élément${total>1?'s':''}`;clearSearch.hidden=!query;searchEmpty.hidden=!(query&&n===0);}
  search.addEventListener('input',filter);clearSearch.addEventListener('click',()=>{search.value='';filter();search.focus()});list.addEventListener('input',filter);
  all.addEventListener('click',()=>list.querySelectorAll(':scope > .choice-row').forEach(r=>r._expandCompact?.(true)));
  none.addEventListener('click',()=>list.querySelectorAll(':scope > .choice-row').forEach(r=>r._expandCompact?.(false)));
  const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'&&[...r.addedNodes].some(n=>n.nodeType===1&&n.classList?.contains('choice-row'))))initialize();});
  observer.observe(list,{childList:true});initialize();
 }
}
