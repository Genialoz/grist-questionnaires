/** Fonctions sans dépendance Grist pour le pilotage du portail. V4.4.8 TEST. */
export const ETATS = Object.freeze({
  'not-started': 'Pas commencé',
  'in-progress': 'En cours',
  'completed': 'Complété'
});
export function normaliserRecherche(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();
}
export function filtrerStructures(structures, options={}) {
  if (!Array.isArray(structures)) throw new Error('Liste de structures invalide.');
  const recherche=normaliserRecherche(options.recherche);
  const etat=String(options.etat || 'tous');
  const ordre=String(options.ordre || 'nom');
  if (etat!=='tous' && !Object.hasOwn(ETATS,etat)) throw new Error('Filtre invalide.');
  const resultat=structures.filter(s =>
    (etat==='tous' || s.etat===etat) &&
    (!recherche || normaliserRecherche(s.structure).includes(recherche))
  );
  const fr=new Intl.Collator('fr', {numeric:true,sensitivity:'base'});
  if (ordre==='nom') resultat.sort((a,b)=>fr.compare(a.structure,b.structure));
  else if (ordre==='nom-desc') resultat.sort((a,b)=>fr.compare(b.structure,a.structure));
  else if (ordre==='reponses') resultat.sort((a,b)=>b.reponses-a.reponses||fr.compare(a.structure,b.structure));
  else if (ordre==='etat') resultat.sort((a,b)=>['not-started','in-progress','completed'].indexOf(a.etat)-['not-started','in-progress','completed'].indexOf(b.etat)||fr.compare(a.structure,b.structure));
  else throw new Error('Tri invalide.');
  return resultat;
}
export function calculerPilotage(publication){
  const {structures,totaux}=publication;
  if(!Array.isArray(structures)||!totaux||totaux.total!==structures.length)throw new Error('Suivi publié incohérent.');
  const compte={ 'not-started':0,'in-progress':0,'completed':0};
  let reponses=0,liens=0;
  for(const s of structures){
    if(!Object.hasOwn(compte,s.etat)||!Number.isSafeInteger(s.reponses)||s.reponses<0)throw new Error('Suivi publié invalide.');
    compte[s.etat]++;reponses+=s.reponses;
    if(s.lienQuestionnaire)liens++;
  }
  if(compte['not-started']!==totaux.nonCommence||compte['in-progress']!==totaux.enCours||compte['completed']!==totaux.complete)throw new Error('Totaux incohérents.');
  return {total:structures.length,demarrees:compte['in-progress']+compte['completed'],terminees:compte['completed'],nonCommence:compte['not-started'],enCours:compte['in-progress'],complete:compte['completed'],reponses,liens,
    pctDemarrees:structures.length?Math.round(100*(compte['in-progress']+compte['completed'])/structures.length):0,
    pctTerminees:structures.length?Math.round(100*compte['completed']/structures.length):0};
}
function protegerCSV(value){
  const brut=String(value??'');
  // Préfixer les contenus dangereux même après espaces / contrôles, avant de citer la cellule.
  const safe=/^[\s\u0000-\u001f]*[=+@\-\t\r]/.test(brut)?`'${brut}`:brut;
  return `"${safe.replaceAll('"','""')}"`;
}
export function exporterSuiviCSV(publication, lignes=publication.structures){
  // N'exporter aucun jeton de saisie ni URL, y compris lorsqu'une ligne est autorisée.
  const entetes=['Espace','Campagne','Structure','État','Réponses enregistrées','Date de publication'];
  const data=[entetes,...lignes.map(s=>[publication.nom,publication.campagne,s.structure,ETATS[s.etat],s.reponses,publication.datePublication])];
  return '\ufeff'+data.map(l=>l.map(protegerCSV).join(';')).join('\r\n')+'\r\n';
}
