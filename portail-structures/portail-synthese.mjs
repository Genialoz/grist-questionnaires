/** V4.4.9 TEST — tableaux de synthèse calculés uniquement sur les lignes publiées. */
import {calculerPilotage} from './portail-pilotage.mjs';
export const LIBELLES = Object.freeze({ 'not-started':'Pas commencé','in-progress':'En cours','completed':'Complété' });
export const ORDRE = Object.freeze(['not-started','in-progress','completed']);
export function syntheseSelection(publication, selection) {
  // Valider d'abord les totaux de la publication ; sélection uniquement par identité
  // des objets publiés, aucune donnée supplémentaire récupérée depuis Grist.
  const global = calculerPilotage(publication);
  if (!Array.isArray(selection) || selection.some(s=>!publication.structures.includes(s))) throw new Error('Sélection de suivi non autorisée.');
  const comptes = {'not-started':0,'in-progress':0,'completed':0};
  let reponses = 0;
  for (const s of selection){
    if (!Object.hasOwn(comptes, s.etat) || !Number.isSafeInteger(s.reponses) || s.reponses < 0) throw new Error('Ligne de suivi invalide.');
    comptes[s.etat]++; reponses += s.reponses;
  }
  const total=selection.length;
  const series=ORDRE.map(etat=>({etat,libelle:LIBELLES[etat],nombre:comptes[etat],pourcentage:total?Math.round(100*comptes[etat]/total):0}));
  return {global, total, series, reponses, demarrees:total-comptes['not-started'],
    terminees:comptes.completed, pctDemarrees:total?Math.round(100*(total-comptes['not-started'])/total):0,
    pctTerminees:total?Math.round(100*comptes.completed/total):0};
}
export function prioritesSuivi(selection, limite=6){
  if (!Array.isArray(selection)||!Number.isSafeInteger(limite)||limite<0||limite>100)throw new Error('Paramètres de priorisation invalides.');
  const rang={'not-started':0,'in-progress':1,'completed':2};
  return selection.filter(s=>s.etat!=='completed').slice().sort((a,b)=>
    rang[a.etat]-rang[b.etat] || a.reponses-b.reponses || String(a.structure).localeCompare(String(b.structure),'fr',{numeric:true,sensitivity:'base'})).slice(0,limite)
    .map(s=>({structure:s.structure,etat:s.etat,reponses:s.reponses})); // Ne jamais transmettre lienQuestionnaire
}
