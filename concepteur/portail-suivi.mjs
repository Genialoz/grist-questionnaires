// V4.4.2 TEST — Prévisualisation interne, sans droits de consultation délégués.
// Toutes les données sont issues des liens de campagne rattachés à l'espace.
export function resumeEspace(entries, responses, corresponds, statut) {
  if (!Array.isArray(entries) || !Array.isArray(responses) ||
      typeof corresponds !== "function" || typeof statut !== "function") {
    throw new TypeError("Données de suivi non disponibles");
  }
  const ids=new Set();
  const items=entries.map(({member,campaign})=>{
    if(!campaign || !member) throw new Error("Rattachement invalide : lien de campagne introuvable");
    const id=String(campaign.id);
    if(ids.has(id)) throw new Error("Double rattachement détecté dans l'espace");
    ids.add(id);
    const matches=responses.filter(r=>corresponds(r,campaign));
    // Ne jamais confondre plusieurs brouillons avec plusieurs structures.
    const state=matches.some(r=>statut(r)==="completed")?"completed":matches.length?"in-progress":"not-started";
    return {member,campaign,state,count:matches.length};
  });
  return {items,total:items.length,notStarted:items.filter(i=>i.state==="not-started").length,
    inProgress:items.filter(i=>i.state==="in-progress").length,
    completed:items.filter(i=>i.state==="completed").length};
}
