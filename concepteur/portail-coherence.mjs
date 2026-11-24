/** V4.4.6 TEST — Comparaison du suivi réel avec une publication existante.
 * Aucun jeton, lien répondant ou enregistrement nominatif n'est exposé par ce module.
 */
export function verifierPublicationCourante(publication, nouvellePublication) {
  if (!publication) return {etat:'absente',message:'Suivi non publié'};
  let avant, apres;
  try {
    avant=JSON.parse(publication);
    apres=JSON.parse(nouvellePublication);
  } catch {
    return {etat:'invalide',message:'Publication illisible : republier le suivi'};
  }
  if (avant?.version !== 1 || apres?.version !== 1 ||
      !Array.isArray(avant.structures) || !Array.isArray(apres.structures) ||
      !avant.totaux || !apres.totaux) {
    return {etat:'invalide',message:'Format de publication invalide : republier le suivi'};
  }
  // La date de publication n'entre pas dans le contrôle de fraîcheur.
  const normaliser = p => JSON.stringify({
    nom:p.nom,campagne:p.campagne,
    structures:p.structures.map(s=>({structure:s.structure,etat:s.etat,reponses:s.reponses,lienQuestionnaire:s.lienQuestionnaire||""}))
      .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
    totaux:p.totaux
  });
  return normaliser(avant) === normaliser(apres)
    ? {etat:'a-jour',message:'Suivi publié à jour'}
    : {etat:'obsolete',message:'Suivi à republier : données ou périmètre modifiés'};
}

export function doitInvaliderPublication(operations,tableMembres='ESPACES_MEMBRES') {
  return operations.some(a=>a[1]===tableMembres && (a[0]==='AddRecord' || a[0]==='RemoveRecord' || (a[0]==='UpdateRecord' && Object.prototype.hasOwnProperty.call(a[3]||{},'Partager_lien_questionnaire'))));
}
