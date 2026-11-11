/** Read-only, exportable summary of a recorded Executor run. */
export function summarizeExecution(row) {
  if (!row?.id) throw new Error("Selecione uma execução registrada para exportar.");
  const state = row.status === "success" ? "PASSOU"
    : ["failed", "partial_rollback", "rollback_incomplete"].includes(row.status) ? "FALHOU"
      : ["rolled_back"].includes(row.status) ? "MANUAL" : "NÃO TESTADO";
  const documents = [
    ...(row.actors ?? []).map(value => ({ type: "Actor", ...value, state })),
    ...(row.items ?? []).map(value => ({ type: "Item", ...value, state })),
    ...(row.scenes ?? []).map(value => ({ type: "Scene", ...value, state }))
  ];
  return {
    schemaVersion: "jarvis-execution-report-1", executionId: row.id,
    name: row.name ?? row.kind ?? "Execução Jarvis", kind: row.kind,
    startedAt: row.at ?? null, finishedAt: row.finishedAt ?? null,
    status: row.status, state, message: row.message ?? "", documents,
    activities: { state: "NÃO TESTADO", note: "O histórico registra documentos, sem ensaio individual de Activities no Foundry." },
    images: Object.values(row.images ?? {}), rollback: row.rollback ?? null,
    notes: row.kind === "javascript" ? ["JavaScript arbitrário não possui reversão automática."]
      : ["Imagens enviadas podem permanecer após falha ou reversão."]
  };
}
