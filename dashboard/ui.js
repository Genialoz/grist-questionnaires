/** Selection changes visibility only: controls stay in their serialization ancestors. */
export function selectEditor(nodes, requested, key, closed = new Set()) {
  const selected = nodes.find(node => node.dataset[key] === requested) || nodes[0];
  for (const node of nodes) { node.hidden = node !== selected; node.open = node === selected && !closed.has(node.dataset[key]); }
  return selected?.dataset[key] ?? null;
}

export function enhanceDashboard(root) {
  let activeTab = null;
  const activeBlocks = new Map();
  const closedBlocks = new Set();
  const knownTabs = new WeakSet();
  let observer;
  const button = (label, action, value, current) => {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = label; el.dataset[action] = value;
    el.setAttribute('aria-pressed', String(current));
    return el;
  };
  function groupFields(block) {
    const body = block.querySelector('.builder-block-body');
    if (!body || body.dataset.uiGrouped) return;
    body.dataset.uiGrouped = 'true';
    const grid = body.querySelector('.builder-indicator-grid');
    if (grid) {
      const source = document.createElement('fieldset');
      source.className = 'ui-dashboard-fields';
      const legend = document.createElement('legend'); legend.textContent = 'Source et ventilation'; source.append(legend);
      const presentation = source.cloneNode(true); presentation.querySelector('legend').textContent = 'Présentation';
      for (const field of [...grid.children]) {
        (field.querySelector('[data-source],[data-scope],[data-group-by]') ? source : presentation).append(field);
      }
      grid.replaceWith(source, presentation);
    }
    const actions = body.querySelector('.builder-block-head > div');
    if (actions) {
      const close = button('Fermer les réglages', 'uiCloseBlock', '', false);
      actions.append(close);
    }
    body.querySelector('[data-move-up]')?.setAttribute('aria-label','Monter ce bloc');
    body.querySelector('[data-move-down]')?.setAttribute('aria-label','Descendre ce bloc');
  }
  function refresh() {
    observer?.disconnect();
    const shell = root.querySelector('.builder-shell');
    if (!shell) { observe(); return; }
    shell.classList.add('ui-dashboard-workbench');
    const host = shell.querySelector('#builder-tabs');
    const tabs = [...host.querySelectorAll('[data-dashboard-tab]')];
    // A newly added tab/block is explicitly opened by the original builder.
    const newlyOpened = tabs.find(t => t.open && !knownTabs.has(t));
    tabs.forEach(t => knownTabs.add(t));
    if (newlyOpened) activeTab = newlyOpened.dataset.tabId;
    activeTab = selectEditor(tabs, activeTab, 'tabId');
    let nav = shell.querySelector('[data-ui-tab-nav]');
    if (!nav) { nav = document.createElement('nav'); nav.dataset.uiTabNav = ''; nav.className = 'ui-dashboard-tab-nav'; nav.setAttribute('aria-label','Onglets du tableau de bord'); host.before(nav); }
    nav.replaceChildren(...tabs.map(tab => button(tab.querySelector('[data-tab-title]')?.value || 'Onglet', 'uiSelectTab', tab.dataset.tabId, tab.dataset.tabId === activeTab)));
    for (const tab of tabs) {
      const blocks = [...tab.querySelectorAll('[data-builder-block]')];
      const remembered = activeBlocks.get(tab.dataset.tabId);
      const opened = blocks.find(b => b.open && b.dataset.blockId !== remembered && !b.hidden);
      const selected = selectEditor(blocks, opened?.dataset.blockId || remembered, 'blockId', closedBlocks);
      activeBlocks.set(tab.dataset.tabId, selected);
      let list = tab.querySelector('[data-ui-block-nav]');
      if (!list) { list = document.createElement('nav'); list.dataset.uiBlockNav = ''; list.className = 'ui-dashboard-block-nav'; list.setAttribute('aria-label','Blocs de cet onglet'); tab.querySelector('[data-tab-blocks]').before(list); }
      list.replaceChildren(...blocks.map((block,i) => button(`${i+1}. ${block.querySelector('[data-block-title]')?.value || block.querySelector('[data-block-summary-title]')?.textContent || 'Bloc'}`, 'uiSelectBlock', block.dataset.blockId, selected === block.dataset.blockId)));
      blocks.forEach(groupFields);
      tab.querySelector('.builder-tab-summary')?.setAttribute('aria-label', 'Réglages de cet onglet');
    }
    let preview = shell.querySelector('#builder-preview');
    if (preview && !shell.querySelector('[data-ui-preview-empty]')) {
      const empty = document.createElement('aside'); empty.dataset.uiPreviewEmpty = ''; empty.className = 'ui-dashboard-preview-empty';
      const title = document.createElement('h2'); title.textContent = 'Votre restitution, en un regard';
      const text = document.createElement('p'); text.textContent = 'Sélectionnez un bloc à gauche pour le configurer. Actualisez l’aperçu pour visualiser les résultats de la campagne et vérifier le périmètre des réponses.';
      const open = button('Afficher l’aperçu', 'uiPreview', '', false); empty.append(title,text,open); preview.before(empty);
    }
    shell.querySelector('[data-ui-preview-empty]').hidden = !preview.hidden;
    observe();
  }
  function observe() { observer?.observe(root, {childList:true,subtree:true}); }
  root.addEventListener('click', event => {
    const target = event.target.closest('button'); if (!target) return;
    if ('uiSelectTab' in target.dataset) { activeTab = target.dataset.uiSelectTab; refresh(); }
    if ('uiSelectBlock' in target.dataset) {
      const tab = target.closest('[data-dashboard-tab]');
      const id = target.dataset.uiSelectBlock;
      activeBlocks.set(tab.dataset.tabId,id);
      closedBlocks.delete(id);
      tab.querySelectorAll('[data-builder-block]').forEach(b=>{ b.open = b.dataset.blockId === id; });
      refresh();
    }
    if ('uiCloseBlock' in target.dataset) { const block=target.closest('[data-builder-block]'); closedBlocks.add(block.dataset.blockId); block.open = false; }
    if ('uiPreview' in target.dataset) shellPreview();
    if (target.id === 'close-preview') queueMicrotask(refresh);
  });
  function shellPreview() { root.querySelector('#preview-dashboard')?.click(); }
  root.addEventListener('input', event => {
    if (!event.target.matches('[data-block-title],[data-tab-title]')) return;
    // Refresh navigation labels without replacing or blurring the input.
    refresh();
  });
  observer = new MutationObserver(refresh);
  refresh();
  return () => observer.disconnect();
}
if (typeof document !== 'undefined') {
  const root = document.querySelector('#root');
  if (root) enhanceDashboard(root);
}

