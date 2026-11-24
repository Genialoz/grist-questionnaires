/** Édition V4.4.11 — diffusion extérieure, distincte de l'export administratif. */
export function construireDiffusion(espaces, directs){
 const entries=[], names=new Set();
 for(const [type,items] of [["Espace",espaces],["Lien direct",directs]]){
  for(const item of items){
   const name=String(item?.name||"").trim(),url=String(item?.url||"").trim();
   if(!name||!url)throw new Error(`Un ${type.toLowerCase()} ne possède pas de lien valide.`);
   let parsed;try{parsed=new URL(url)}catch{throw new Error(`URL invalide pour « ${name} ».`)}
   if(parsed.protocol!=="https:"||!parsed.hostname||!parsed.pathname)throw new Error(`Lien non sécurisé pour « ${name} ».`);
   if(parsed.hostname!=="grist.numerique.gouv.fr")throw new Error(`Hôte inattendu pour « ${name} ».`);
   if(type==="Espace"&&!parsed.searchParams.has("Portail_"))throw new Error(`Clé portail absente pour « ${name} ».`);
   if(type==="Lien direct"&&!parsed.searchParams.has("Acces_"))throw new Error(`Clé de réponse absente pour « ${name} ».`);
   if(parsed.searchParams.get("style")!=="singlePage")throw new Error(`Affichage singlePage absent pour « ${name} ».`);
   const key=type+"\0"+name.toLowerCase();
   if(names.has(key))throw new Error(`Destinataire en double : « ${name} ».`);
   names.add(key);
   entries.push({type,name,url});
  }
 }
 return entries;
}
export function texteDiffusion(entries){
 const clean=v=>String(v).replace(/[\t\r\n]+/g," ");
 return [["Type de diffusion","Destinataire","Lien"],...entries.map(e=>[e.type,e.name,e.url])].map(row=>row.map(clean).join("\t")).join("\n");
}
