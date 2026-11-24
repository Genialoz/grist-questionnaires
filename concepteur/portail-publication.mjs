/** V4.4.4 TEST : photographie minimale du suivi, sans données individuelles ni jetons répondants. */
export function creerPublicationSuivi(summary, nom, campagne, autorisations=[]) {
  if (!summary || !Array.isArray(summary.items)) throw new Error('Suivi non disponible. Publication annulée.');
  if (!Number.isSafeInteger(summary.total) || summary.total !== summary.items.length) {
    throw new Error('Suivi incohérent. Publication annulée.');
  }
  if(!Array.isArray(autorisations))throw new Error('Autorisations invalides.');
  const parMembre=new Map();
  for(const entree of autorisations){
    const id=String(entree?.member?.id??'');
    if(!id || parMembre.has(id))throw new Error('Autorisations de questionnaire incohérentes.');
    parMembre.set(id,entree);
  }
  const items = summary.items.map(item => {
    const nomStructure = String(item.campaign?.Valeur_personnalisation_Libelle || item.campaign?.Valeur_personnalisation || '').trim();
    if (!nomStructure) throw new Error('Structure sans libellé. Publication annulée.');
    if (!['completed','in-progress','not-started'].includes(item.state)) throw new Error('Statut invalide.');
    if (!Number.isSafeInteger(item.count) || item.count < 0) throw new Error('Comptage invalide.');
    let lien="";
    const autorisation=parMembre.get(String(item.member?.id??''));
    if(autorisation?.lien){
      // Le jeton de questionnaire permet la saisie : ne publier QUE les domaines et chemins attendus.
      // Toute URL de redirection ou domaine tiers doit être refusé en bloc.
      let u;
      try{u=new URL(String(autorisation.lien))}catch{throw new Error('Lien de questionnaire invalide. Publication annulée.');}
      if(u.protocol!=='https:' || u.hostname!=='grist.numerique.gouv.fr' ||
         !/^\/o\/docs\/[^/]+\/[^/]+\/p\/\d+$/.test(u.pathname) ||
         !u.searchParams.get('Acces_') || u.searchParams.get('style')!=='singlePage'){
        throw new Error('Lien de questionnaire non conforme. Publication annulée.');
      }
      lien=u.toString();
    }
    return {structure: nomStructure.slice(0, 200), etat:item.state, reponses:item.count,...(lien?{lienQuestionnaire:lien}:{})};
  });
  return JSON.stringify({version:1,nom:String(nom||'').slice(0,120),campagne:String(campagne||'').slice(0,200),
    datePublication:new Date().toISOString(),structures:items,
    totaux:{total:summary.total,nonCommence:summary.notStarted,enCours:summary.inProgress,complete:summary.completed}});
}
export function lirePublicationSuivi(json) {
  const p=JSON.parse(json);
  if(p?.version!==1||!Array.isArray(p.structures)||p.structures.length>10000)throw new Error('Format de publication invalide.');
  for(const s of p.structures){
    if(typeof s.structure!=='string'||!['completed','in-progress','not-started'].includes(s.etat)||!Number.isSafeInteger(s.reponses)||s.reponses<0)throw new Error('Données publiées invalides.');
    if(s.lienQuestionnaire){
      let u;try{u=new URL(s.lienQuestionnaire)}catch{throw new Error('Lien publié invalide.');}
      if(u.protocol!=='https:'||u.hostname!=='grist.numerique.gouv.fr'||
        !/^\/o\/docs\/[^/]+\/[^/]+\/p\/\d+$/.test(u.pathname)||
        !u.searchParams.get('Acces_')||u.searchParams.get('style')!=='singlePage')throw new Error('Lien publié invalide.');
    }
  }
  return p;
}
