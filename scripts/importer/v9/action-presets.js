import { compileActorBlueprintV91 } from "./blueprint-v91.js";

const KEY = "jarvis-v91-action-presets";
const builtin = Object.freeze([
  { name: "Golpe de espada", kind: "attack", toHit: 5, damage: { formula: "1d8+3", type: "slashing" } },
  { name: "Explosão arcana", kind: "save", ability: "dex", dc: 14, damage: { formula: "2d6", type: "force" }, onSave: "half" },
  { name: "Teste de resistência", kind: "check", ability: "con", dc: 14 }
]);

export function listV91ActionPresets(storage = globalThis.localStorage) {
  let custom = [];
  try { custom = JSON.parse(storage?.getItem(KEY) ?? "[]"); } catch { /* damaged local storage */ }
  if (!Array.isArray(custom)) custom = [];
  return [...builtin.map((action, index) => ({ id: `builtin-${index}`, action: structuredClone(action) })),
    ...custom.filter(row => row?.id && row?.action).map(row => ({ id: row.id, action: structuredClone(row.action) }))];
}

export function saveV91ActionPreset(action, storage = globalThis.localStorage) {
  compileActorBlueprintV91({ schemaVersion: "9.1", actor: { name: "Validação", type: "npc" }, actions: [action] });
  if (!storage?.setItem) throw new Error("Armazenamento local indisponível.");
  const custom = listV91ActionPresets(storage).filter(row => !row.id.startsWith("builtin-"));
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  custom.push({ id, action: structuredClone(action) });
  storage.setItem(KEY, JSON.stringify(custom));
  return id;
}

export function getV91ActionPreset(id, storage = globalThis.localStorage) {
  const entry = listV91ActionPresets(storage).find(row => row.id === id);
  if (!entry) throw new Error("Modelo de habilidade não encontrado.");
  return structuredClone(entry.action);
}
