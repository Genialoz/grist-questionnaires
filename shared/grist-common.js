export function rowsFromTable(table) {
  if (!table || !Array.isArray(table.id)) return [];
  const cols = Object.keys(table).filter(k => k !== "id");
  return table.id.map((id, i) => {
    const row = {id};
    for (const col of cols) row[col] = Array.isArray(table[col]) ? table[col][i] : undefined;
    return row;
  });
}

export function normalizeRef(value) {
  // Grist représente une référence vide par 0 dans les données brutes.
  if (value == null || value === "" || value === 0) return null;
  if (Array.isArray(value)) {
    if (value[0] === "L" || value[0] === "l") return value.slice(1).map(normalizeRef);
    if (value.length === 2 && typeof value[0] === "string") return normalizeRef(value[1]);
  }
  if (typeof value === "object") {
    return value.code ?? value.Code ?? value.id ?? value.value ?? null;
  }
  return value;
}

export function codeOf(value) {
  const n = normalizeRef(value);
  return n == null ? "" : String(n);
}

export function sortByOrder(rows = []) {
  return rows.map((row, index) => ({row,index})).sort((a,b) => {
    const av = Number(a.row.Ordre), bv = Number(b.row.Ordre);
    const ao = Number.isFinite(av) ? av : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(bv) ? bv : Number.MAX_SAFE_INTEGER;
    return ao - bo || a.index - b.index;
  }).map(x => x.row);
}

const norm = v => typeof v === "string" ? v.trim() : v;
const num = v => v === "" || v == null ? NaN : Number(v);

export function evaluateRule(rule, answers = {}) {
  const source = codeOf(rule.Question_source_Code);
  const actual = answers[source];
  const expected = rule.Valeur_comparaison ?? rule.Valeur ?? rule.Valeur_texte ?? rule.Valeur_attendue ?? "";
  const op = String(rule.Operateur ?? "=").trim().toLowerCase();
  if (["vide","empty","est vide"].includes(op)) return actual == null || actual === "" || (Array.isArray(actual) && !actual.length);
  if (["non vide","not empty","pas vide"].includes(op)) return !(actual == null || actual === "" || (Array.isArray(actual) && !actual.length));
  if (["contient","contains"].includes(op)) return Array.isArray(actual) ? actual.map(String).includes(String(expected)) : String(actual ?? "").includes(String(expected));
  if ([">",">=","<","<="].includes(op)) {
    const a=num(actual), b=num(expected); if (!Number.isFinite(a)||!Number.isFinite(b)) return false;
    return op===">"?a>b:op===">="?a>=b:op==="<"?a<b:a<=b;
  }
  const a=norm(actual), b=norm(expected);
  if (["!=","<>","≠"].includes(op)) return String(a ?? "") !== String(b ?? "");
  return String(a ?? "") === String(b ?? "");
}

export function evaluateCondition(condition, rules = [], answers = {}) {
  if (!condition) return true;
  const code = codeOf(condition.Condition_Code);
  const relevant = sortByOrder(rules.filter(r => codeOf(r.Condition_Code) === code));
  if (!relevant.length) return false;
  const results = relevant.map(r => evaluateRule(r, answers));
  const logic = String(condition.Operateur_logique ?? condition.Logique ?? condition.Type_operateur ?? "AND").toUpperCase();
  return logic === "OR" || logic === "OU" ? results.some(Boolean) : results.every(Boolean);
}

export function isTrue(v) {
  return v === true || v === 1 || String(v).toLowerCase() === "true" || String(v).toLowerCase() === "oui";
}

export function isRequiredQuestion(question={}) {
  const mode = String(question.Mode_obligatoire ?? "").trim().toLowerCase();
  if (mode) return mode === "obligatoire";
  return isTrue(question.Obligatoire);
}

export function validateQuestion(question, value, visible=true) {
  if (!visible) return "";
  const required = isRequiredQuestion(question);
  const empty = value == null || value === "" || (Array.isArray(value) && !value.length);
  if (required && empty) return "Ce champ est obligatoire.";
  if (empty) return "";
  const type = String(question.Type_question ?? question.Type ?? "").toLowerCase();
  if (type.includes("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) return "Adresse e-mail invalide.";
  if (type.includes("nombre") || type.includes("montant")) {
    const n=Number(value); if (!Number.isFinite(n)) return "Saisissez un nombre valide.";
    if (question.Valeur_min !== "" && question.Valeur_min != null && n < Number(question.Valeur_min)) return `La valeur minimale est ${question.Valeur_min}.`;
    if (question.Valeur_max !== "" && question.Valeur_max != null && n > Number(question.Valeur_max)) return `La valeur maximale est ${question.Valeur_max}.`;
  }
  const s=String(value);
  if (question.Longueur_min !== "" && question.Longueur_min != null && s.length < Number(question.Longueur_min)) return `Minimum ${question.Longueur_min} caractères.`;
  if (question.Longueur_max !== "" && question.Longueur_max != null && s.length > Number(question.Longueur_max)) return `Maximum ${question.Longueur_max} caractères.`;
  return "";
}
