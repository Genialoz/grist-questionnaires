(function(){
  if (document.querySelector('.gristionnaire-module-nav')) return;
  const BASE='https://grist.numerique.gouv.fr/o/docs/wquFLHYyyedo/Gristionnaire';
  const HOME='https://genialoz.github.io/grist-questionnaires/navigation/';
  const modules=[
    ['Concepteur',`${BASE}/p/39?style=singlePage`],
    ['Questionnaire',`${BASE}/p/38?style=singlePage&AdminPreview_=1`],
    ['Dashboard — Construction',`${BASE}/p/47?style=singlePage`],
    ['Dashboard — Consultation',`${BASE}/p/50?style=singlePage`],
    ['Bibliothèques',`${BASE}/p/52?style=singlePage`],
    ['Référentiels',`${BASE}/p/51?style=singlePage`],
    ['Pré-remplissage',`${BASE}/p/55?style=singlePage`],
    ['Simulation',`${BASE}/p/54?style=singlePage`]
  ];

  function grantQuestionnairePreview(){
    try{
      const version=String(localStorage.getItem('gristionnaire.previewVersion')||'').trim();
      if(!version)return false;
      localStorage.setItem('gristionnaire.previewGrant',JSON.stringify({version,ts:Date.now(),source:'module-nav'}));
      return true;
    }catch{return false}
  }


  const nav=document.createElement('nav');
  nav.className='gristionnaire-module-nav';
  nav.setAttribute('aria-label','Navigation Gristionnaire');

  const home=document.createElement('a');
  home.className='gristionnaire-module-nav__home';
  home.href=HOME;
  home.target='_top';
  home.textContent='⌂ Accueil';
  home.title='Retour au centre de navigation';
  nav.appendChild(home);

  const label=document.createElement('span');
  label.className='gristionnaire-module-nav__label';
  label.textContent='Aller à';
  nav.appendChild(label);

  const select=document.createElement('select');
  select.className='gristionnaire-module-nav__select';
  select.setAttribute('aria-label','Aller à un module');
  const placeholder=document.createElement('option');
  placeholder.value='';
  placeholder.textContent='Choisir un module…';
  select.appendChild(placeholder);
  modules.forEach(([name,url])=>{
    const opt=document.createElement('option');
    opt.value=url;
    opt.textContent=name;
    select.appendChild(opt);
  });
  select.addEventListener('change',()=>{
    if(!select.value) return;
    if(select.value.includes('/p/38?style=singlePage&AdminPreview_=1')){
      grantQuestionnairePreview();
      window.open(select.value,'_blank','noopener');
      select.value='';
      return;
    }
    window.top.location.href=select.value;
  });
  nav.appendChild(select);

  const quick=document.createElement('div');
  quick.className='gristionnaire-module-nav__quick';
  [
    ['Concepteur',`${BASE}/p/39?style=singlePage`],
    ['Questionnaire',`${BASE}/p/38?style=singlePage&AdminPreview_=1`],
    ['Simulation',`${BASE}/p/54?style=singlePage`],
    ['Dashboard',`${BASE}/p/50?style=singlePage`]
  ].forEach(([name,url])=>{
    const a=document.createElement('a');
    a.className='gristionnaire-module-nav__link';
    a.href=url;
    if(name==='Questionnaire'){
      a.target='_blank';
      a.rel='noopener noreferrer';
      a.title='Ouvrir le Questionnaire dans un nouvel onglet';
      a.addEventListener('click',grantQuestionnairePreview);
    }else{
      a.target='_top';
    }
    a.textContent=name;
    quick.appendChild(a);
  });
  nav.appendChild(quick);

  document.body.prepend(nav);
})();
