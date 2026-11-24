/** Gestion préparatoire des accès au portail (aucun lien public émis à ce stade). */
export function genererJetonPortail(cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider || typeof cryptoProvider.getRandomValues !== 'function') {
    throw new Error('Génération sécurisée indisponible : navigateur non compatible.');
  }
  const bytes = new Uint8Array(32);
  cryptoProvider.getRandomValues(bytes);
  return 'ESP_' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
export function etatAccesPortail(space) {
  const jeton = String(space?.Jeton_portail || '');
  if (!jeton) return 'Non préparé';
  return 'Jeton préparé — accès externe désactivé';
}
export function jetonValide(jeton) {
  return /^ESP_[0-9a-f]{64}$/.test(String(jeton ?? ''));
}
