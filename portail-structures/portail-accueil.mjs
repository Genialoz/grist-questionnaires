/** Portail TEST : modèle de présentation, basé exclusivement sur la publication ACL. */
export function accesQuestionnaires(structures) {
  if (!Array.isArray(structures)) throw new Error('Structures invalides.');
  return structures.filter(s => typeof s.lienQuestionnaire === 'string' && s.lienQuestionnaire.length > 0)
    .map(s => ({structure:s.structure,etat:s.etat,lien:s.lienQuestionnaire}));
}
export function situationPublication(dateISO, maintenant=Date.now()) {
  const date = Date.parse(dateISO);
  if (!Number.isFinite(date) || !Number.isFinite(maintenant)) throw new Error('Date de publication invalide.');
  const age = Math.max(0, maintenant-date);
  const heures=Math.floor(age/3600000);
  const jours=Math.floor(age/86400000);
  return {jours,heures,ancienne:age>86400000,
    texte:age<3600000?'Publication récente':jours===0?`Publication datant de ${heures} h`: `Publication datant de ${jours} jour${jours>1?'s':''}`};
}
export function lienQuestionnaireValide(value) {
  let u;
  try {u=new URL(value);} catch {return false;}
  return u.protocol==='https:' && u.hostname==='grist.numerique.gouv.fr' &&
    /^\/o\/docs\/[^/]+\/[^/]+\/p\/\d+$/.test(u.pathname) &&
    u.searchParams.has('Acces_') && u.searchParams.get('style')==='singlePage' &&
    !u.username && !u.password;
}
