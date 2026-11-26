/** Réglages purement visuels. Les identifiants Grist et Element_Code ne changent jamais. */
export function ficheIdentifierSettings(type = {}) {
  const hidden = type.Masquer_identifiant;
  return {
    visible: !(hidden === true || hidden === 1 || hidden === "1" || String(hidden).toLowerCase() === "true"),
    prefix: String(type.Prefixe_identifiant ?? "").trim() || "Fiche",
    explicit: Boolean(String(type.Prefixe_identifiant ?? "").trim()) || hidden === true || hidden === 1 || hidden === "1",
  };
}
export function ficheIdentifier(type, index, {subfiche = false} = {}) {
  const {visible, prefix, explicit} = ficheIdentifierSettings(type);
  // Les sous-fiches historiques ne comportaient pas ce repère dans leur carte.
  if (!visible || (subfiche && !explicit)) return "";
  const number = Math.max(0, Number(index) + 1);
  return `${prefix} ${String(number).padStart(3, "0")}`;
}
export function ficheHeading(identifier, title) {
  const id = String(identifier || "").trim();
  const label = String(title || "").trim();
  return id && label ? `${id} — ${label}` : id || label;
}
