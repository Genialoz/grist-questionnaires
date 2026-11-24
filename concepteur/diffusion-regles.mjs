/** Contrôles purs de diffusion : les liens d'espace ne sont jamais fabriqués ici. */
export function verifierDiffusion({liens,espaces,membres}){
 const ids=new Set(liens.map(l=>String(l.id)));
 const espacesIds=new Set(espaces.map(e=>String(e.id)));
 const attribution=new Map();
 for(const m of membres){
  if(!espacesIds.has(String(m.Espace_Id)))throw new Error('Rattachement à un espace inconnu.');
  const id=String(m.Campagne_Lien_Id);
  if(!ids.has(id))throw new Error('Rattachement vers un lien absent de la campagne.');
  if(attribution.has(id))throw new Error('Lien rattaché plusieurs fois : diffusion bloquée.');
  attribution.set(id,String(m.Espace_Id));
 }
 return {attribution,directs:liens.filter(l=>!attribution.has(String(l.id)))};
}
