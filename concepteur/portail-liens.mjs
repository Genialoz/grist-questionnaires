// Gristionnaire PROD — configuration à finaliser après création de la page du portail.
// Page officielle du portail PROD : 60. Ne pas utiliser la page 61 du TEST.
export const PORTAIL_PAGE_PROD = 60;
export const PORTAIL_LINK_COLUMN = 'Lien_portail';
export const PORTAIL_LINK_FORMULA = 'SELF_HYPERLINK(page=60, LinkKey_Portail=$Jeton_portail) + "&style=singlePage" if $Jeton_portail and $Suivi_public_JSON and $Actif else ""';

export function verifierLienPortailGrist(value, jeton, page = PORTAIL_PAGE_PROD) {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error('Page du portail PROD non configurée. Consultez le guide de déploiement.');
  }
  const texte = String(value ?? '').trim();
  if (!texte) throw new Error('Aucun lien publié : préparez un jeton, puis publiez le suivi.');
  let url;
  try { url = new URL(texte); } catch { throw new Error('Le lien renvoyé par la formule Grist est invalide.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'grist.numerique.gouv.fr' || !url.pathname.startsWith('/o/docs/wquFLHYyyedo/')) {
    throw new Error('Le lien ne cible pas le document PROD Gristionnaire.');
  }
  if (!url.pathname.endsWith(`/p/${page}`)) throw new Error(`Le lien ne cible pas la page ${page} du portail PROD.`);
  if (url.searchParams.get('Portail_') !== jeton || !/^ESP_[0-9a-f]{64}$/.test(String(jeton))) {
    throw new Error('La clé de lien Grist ne correspond pas au jeton de cet espace.');
  }
  if (url.searchParams.get('style') !== 'singlePage') throw new Error('Le lien ne comporte pas le mode singlePage.');
  if (url.searchParams.getAll('Portail_').length !== 1) throw new Error('Plusieurs clés Portail_ sont présentes.');
  return url.href;
}
