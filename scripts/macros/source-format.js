/** Recognize structured JSON data without executing it as JavaScript. */
export function inspectJsonSource(source) {
  const text = String(source ?? "").trim();
  if (!/^[\[{]/.test(text)) return null;
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object") return null;
    return { data, destination: data.schemaVersion === "jarvis-executor-1" ? "Executor → Pacote Jarvis JSON"
      : data.actor ? "Personagens → Importar ficha Jarvis V9"
      : Array.isArray(data) || Array.isArray(data.items) ? "Personagens → Adicionar Items de um JSON V9 (se forem Items)"
      : "importador JSON correspondente ao tipo de pacote" };
  } catch { return null; }
}
export function rejectJsonAsScript(source) {
  const result = inspectJsonSource(source);
  if (result) throw new Error("Este conteúdo é JSON, não uma macro JavaScript. Use " + result.destination + ".");
  if (/^\s*```/.test(source)) throw new Error("Remova as cercas de código Markdown antes de importar ou executar.");
}
