/** Règles pures du Portail des structures : aucun accès Grist ici. */
export function verifierRattachements({selection, liensCampagne, rattachements, espaceId}) {
  const ids = new Set(selection.map(String));
  const possibles = new Set(liensCampagne.map(String));
  if (ids.size !== selection.length) throw new Error('Sélection de liens en double.');
  for (const id of ids) {
    if (!possibles.has(id)) throw new Error("Ce lien n'appartient plus à cette campagne.");
    if (rattachements.some(m => String(m.lienId) === id && String(m.espaceId) !== String(espaceId))) {
      throw new Error('Structure déjà rattachée à un autre espace : actualisez la liste.');
    }
  }
  return true;
}
