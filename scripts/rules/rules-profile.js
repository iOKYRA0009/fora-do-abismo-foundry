import { findOfficialSubclass, normalizeOfficialKey } from "../provenance/official-registry.js";

const MODULE_ID = "fora-do-abismo-foundry";
export const DEFAULT_RULES_PROFILE = "2024";

const CLASS_ALIASES = Object.freeze({
  warlock: ["warlock", "bruxo"],
  sorcerer: ["sorcerer", "feiticeiro"],
  fighter: ["fighter", "guerreiro"]
});

function clone(value) {
  return foundry.utils.deepClone(value);
}

function normalize(value = "") {
  return normalizeOfficialKey(value);
}

function itemRules(item) {
  const rules = item?.system?.source?.rules;
  return rules === undefined || rules === null || rules === "" ? null : String(rules);
}

function itemIdentifier(item) {
  return String(item?.system?.identifier ?? "");
}

function canonicalClassIdentifier(item) {
  if (!item || item.type !== "class") return null;
  const probes = [itemIdentifier(item), item.name].map(normalize).filter(Boolean);
  for (const [canonical, aliases] of Object.entries(CLASS_ALIASES)) {
    const accepted = new Set([canonical, ...aliases].map(normalize));
    if (probes.some(probe => accepted.has(probe))) return canonical;
  }
  return probes[0] ?? null;
}

function findParentClass(items, classIdentifier) {
  const key = normalize(classIdentifier);
  return items.find(item => {
    if (item.type !== "class") return false;
    return normalize(canonicalClassIdentifier(item)) === key
      || normalize(itemIdentifier(item)) === key;
  }) ?? null;
}

function analyzeClass(item, target) {
  const currentRules = itemRules(item);
  const status = currentRules === target ? "ready" : "needs-class-migration";
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    canonicalClass: canonicalClassIdentifier(item),
    currentRules,
    targetRules: target,
    mode: currentRules === target ? "native" : "migration-required",
    status,
    note: status === "ready"
      ? `Classe já está no perfil ${target}.`
      : `Classe ainda está marcada como ${currentRules ?? "sem edição"}; deve ser migrada para ${target}.`
  };
}

function analyzeSubclass(item, items, target) {
  const classIdentifier = item.system?.classIdentifier ?? "";
  const entry = findOfficialSubclass({
    name: item.name,
    identifier: itemIdentifier(item),
    classIdentifier
  });

  const parent = findParentClass(items, classIdentifier || entry?.classIdentifier);
  const parentRules = itemRules(parent);
  const currentRules = itemRules(item);

  if (!entry) {
    return {
      id: item.id,
      name: item.name,
      type: item.type,
      canonicalName: null,
      sourceRules: [],
      currentRules,
      parentRules,
      targetRules: target,
      mode: "review",
      status: "preserve-review",
      note: "Subclasse não reconhecida no registro canônico do Jarvis; preservar e revisar antes de qualquer migração automática."
    };
  }

  const mode = entry.profileModes?.[target] ?? (entry.rules?.includes(target) ? "native" : "unsupported");
  let status = "ready";
  const notes = [];

  if (parent && parentRules !== target) {
    status = "needs-class-migration";
    notes.push(`A classe base ainda está em ${parentRules ?? "edição indefinida"} e precisa migrar para ${target}.`);
  }

  if (mode === "legacy-adapted") {
    notes.push(`Conteúdo oficial originalmente ${entry.sourceRules?.join("/") ?? "legado"}, usado com a classe ${target} por compatibilidade.`);
  } else if (mode === "native-updated") {
    if (currentRules !== target) {
      status = "needs-subclass-migration";
      notes.push(`Existe versão oficial ${target}; esta subclasse ainda está marcada como ${currentRules ?? "edição indefinida"}.`);
    } else {
      notes.push(`Usar a versão oficial ${target} da subclasse.`);
    }
  } else if (mode === "native") {
    notes.push(`Subclasse nativa do perfil ${target}.`);
  } else {
    status = "unsupported";
    notes.push(`O registro atual do Jarvis não confirma compatibilidade com o perfil ${target}.`);
  }

  return {
    id: item.id,
    name: item.name,
    type: item.type,
    canonicalName: entry.canonicalName,
    canonicalKey: entry.key,
    sourceBooks: clone(entry.sourceBooks ?? []),
    sourceRules: clone(entry.sourceRules ?? entry.rules ?? []),
    supportedProfiles: clone(entry.rules ?? []),
    currentRules,
    parentRules,
    targetRules: target,
    mode,
    status,
    note: notes.join(" ")
  };
}

export function analyzeActorRulesProfile(actor, { target = null } = {}) {
  if (!actor) throw new Error("analyzeActorRulesProfile exige um Actor.");

  const profile = String(
    target
      ?? actor.getFlag(MODULE_ID, "rulesProfile")
      ?? DEFAULT_RULES_PROFILE
  );

  const items = Array.from(actor.items ?? []);
  const classes = items.filter(item => item.type === "class").map(item => analyzeClass(item, profile));
  const subclasses = items.filter(item => item.type === "subclass").map(item => analyzeSubclass(item, items, profile));

  const all = [...classes, ...subclasses];
  const summary = {};
  for (const entry of all) summary[entry.status] = (summary[entry.status] ?? 0) + 1;

  return {
    actorId: actor.id,
    actorName: actor.name,
    targetRules: profile,
    summary,
    classes,
    subclasses,
    ready: all.every(entry => ["ready", "preserve-review"].includes(entry.status))
  };
}

export async function setActorRulesProfile(actor, target = DEFAULT_RULES_PROFILE) {
  if (!actor) throw new Error("setActorRulesProfile exige um Actor.");
  const profile = String(target || DEFAULT_RULES_PROFILE);
  await actor.setFlag(MODULE_ID, "rulesProfile", profile);
  return analyzeActorRulesProfile(actor, { target: profile });
}

export function formatRulesProfileReport(report) {
  const labels = {
    ready: "PRONTO",
    "needs-class-migration": "MIGRAR CLASSE",
    "needs-subclass-migration": "MIGRAR SUBCLASSE",
    "preserve-review": "PRESERVAR / REVISAR",
    unsupported: "NÃO SUPORTADO"
  };

  const modeLabels = {
    native: "nativo",
    "native-updated": "versão oficial atualizada",
    "legacy-adapted": "oficial legado adaptado",
    "migration-required": "migração necessária",
    review: "revisão manual",
    unsupported: "não suportado"
  };

  const lines = [
    `Jarvis Rules Profile — ${report.actorName}`,
    `Perfil alvo: ${report.targetRules}`
  ];

  for (const entry of [...report.classes, ...report.subclasses]) {
    const source = entry.sourceRules?.length ? ` | origem ${entry.sourceRules.join("/")}` : "";
    const current = entry.currentRules ? ` | ficha ${entry.currentRules}` : "";
    const mode = entry.mode ? ` | ${modeLabels[entry.mode] ?? entry.mode}` : "";
    lines.push(`• ${entry.name} → ${labels[entry.status] ?? entry.status}${source}${current}${mode} | ${entry.note}`);
  }

  return lines.join("\n");
}
