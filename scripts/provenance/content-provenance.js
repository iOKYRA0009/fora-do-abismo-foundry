import {
  findOfficialFeature,
  findOfficialSubclass,
  normalizeOfficialKey
} from "./official-registry.js";

const MODULE_ID = "fora-do-abismo-foundry";

export const PROVENANCE_KIND = Object.freeze({
  OFFICIAL_SYSTEM: "official-system",
  OFFICIAL_RECREATION: "official-recreation",
  OFFICIAL_MODIFIED: "official-modified",
  HOMEBREW: "homebrew",
  HOMEBREW_EXTENSION: "homebrew-extension",
  UNVERIFIED: "unverified"
});

function clone(value) {
  return foundry.utils.deepClone(value);
}

function sourceIdOf(item) {
  return item?._stats?.compendiumSource
    ?? item?.flags?.dnd5e?.sourceId
    ?? item?.flags?.core?.sourceId
    ?? null;
}

function isTrustedDnd5eSource(sourceId) {
  return typeof sourceId === "string" && sourceId.startsWith("Compendium.dnd5e.");
}

function sourceBookOf(item) {
  return item?.system?.source?.book
    ?? item?.system?.source?.custom
    ?? "";
}

function rulesOf(item) {
  const rules = item?.system?.source?.rules;
  return rules === undefined || rules === null || rules === "" ? null : String(rules);
}

function identifierOf(item) {
  return item?.system?.identifier ? String(item.system.identifier) : "";
}

function classIdentifierOf(item) {
  return item?.system?.classIdentifier ? String(item.system.classIdentifier) : "";
}

function advancementParentId(item) {
  const origin = item?.flags?.dnd5e?.advancementOrigin
    ?? item?.flags?.dnd5e?.advancementRoot
    ?? "";
  if (!origin || typeof origin !== "string") return null;
  return origin.split(".")[0] || null;
}

function explicitProvenance(item) {
  return item?.flags?.[MODULE_ID]?.provenanceOverride
    ?? item?.flags?.[MODULE_ID]?.provenanceInput
    ?? null;
}

function normalizeExplicit(input) {
  if (!input || typeof input !== "object") return null;
  const kind = input.kind ? String(input.kind) : null;
  if (!kind || !Object.values(PROVENANCE_KIND).includes(kind)) return null;
  return {
    kind,
    confidence: Number(input.confidence ?? 1),
    canonicalKey: input.canonicalKey ?? null,
    canonicalName: input.canonicalName ?? null,
    sourceBooks: Array.isArray(input.sourceBooks) ? clone(input.sourceBooks) : [],
    rules: input.rules ? String(input.rules) : null,
    baseOfficial: Boolean(input.baseOfficial),
    reason: input.reason ?? "Proveniência definida explicitamente no payload Jarvis.",
    conflicts: Array.isArray(input.conflicts) ? clone(input.conflicts) : []
  };
}

function parentClassRules(items, classIdentifier) {
  if (!classIdentifier) return null;
  const key = normalizeOfficialKey(classIdentifier);
  const classItem = items.find(item => {
    if (item.type !== "class") return false;
    return normalizeOfficialKey(identifierOf(item) || item.name) === key;
  });
  return classItem ? rulesOf(classItem) : null;
}

function subclassClassification(item, allItems) {
  const entry = findOfficialSubclass({
    name: item.name,
    identifier: identifierOf(item),
    classIdentifier: classIdentifierOf(item)
  });
  if (!entry) return null;

  const ownRules = rulesOf(item);
  const parentRules = parentClassRules(allItems, entry.classIdentifier);
  const preferredRules = parentRules && entry.rules.includes(parentRules)
    ? parentRules
    : (ownRules && entry.rules.includes(ownRules) ? ownRules : entry.rules[0] ?? null);

  const conflicts = [];
  if (ownRules && !entry.rules.includes(ownRules)) {
    conflicts.push(`A subclasse está marcada como regras ${ownRules}, mas o registro canônico conhecido usa ${entry.rules.join("/")}.`);
  }
  if (parentRules && ownRules && parentRules !== ownRules) {
    conflicts.push(`A classe base está em regras ${parentRules}, enquanto a subclasse está marcada como ${ownRules}.`);
  }

  return {
    kind: PROVENANCE_KIND.OFFICIAL_RECREATION,
    confidence: 0.98,
    canonicalKey: entry.key,
    canonicalName: entry.canonicalName,
    sourceBooks: clone(entry.sourceBooks),
    rules: preferredRules,
    baseOfficial: true,
    reason: "A subclasse corresponde ao registro canônico de conteúdo oficial, mas não veio diretamente de um compêndio dnd5e confiável.",
    conflicts
  };
}

function trustedClassification(item) {
  const sourceId = sourceIdOf(item);
  if (!isTrustedDnd5eSource(sourceId)) return null;

  return {
    kind: PROVENANCE_KIND.OFFICIAL_SYSTEM,
    confidence: 1,
    canonicalKey: null,
    canonicalName: null,
    sourceBooks: sourceBookOf(item) ? [sourceBookOf(item)] : [],
    rules: rulesOf(item),
    baseOfficial: true,
    reason: `Documento originado diretamente do compêndio oficial do sistema D&D5e (${sourceId}).`,
    conflicts: []
  };
}

function srdClassification(item) {
  const book = String(sourceBookOf(item) ?? "");
  if (!/^SRD\s+5\.[12]/i.test(book)) return null;

  return {
    kind: PROVENANCE_KIND.OFFICIAL_SYSTEM,
    confidence: 0.98,
    canonicalKey: null,
    canonicalName: null,
    sourceBooks: [book],
    rules: rulesOf(item),
    baseOfficial: true,
    reason: `Documento declara fonte ${book}.`,
    conflicts: []
  };
}

function childOfCanonicalSubclass(item, allItems, subclassById) {
  const parentId = advancementParentId(item);
  if (!parentId) return null;

  const parent = subclassById.get(parentId);
  if (!parent?.entry) return null;

  const feature = findOfficialFeature(parent.entry, item.name);
  if (feature) {
    return {
      kind: PROVENANCE_KIND.OFFICIAL_RECREATION,
      confidence: 0.94,
      canonicalKey: `${parent.entry.key}:${normalizeOfficialKey(feature.name)}`,
      canonicalName: feature.name,
      sourceBooks: clone(parent.entry.sourceBooks),
      rules: parent.classification.rules,
      baseOfficial: true,
      reason: `Característica reconhecida como parte oficial de ${parent.entry.canonicalName}.`,
      conflicts: []
    };
  }

  return {
    kind: PROVENANCE_KIND.HOMEBREW_EXTENSION,
    confidence: 0.9,
    canonicalKey: parent.entry.key,
    canonicalName: parent.entry.canonicalName,
    sourceBooks: clone(parent.entry.sourceBooks),
    rules: parent.classification.rules,
    baseOfficial: true,
    reason: `Característica anexada à subclasse oficial ${parent.entry.canonicalName}, mas não reconhecida no registro canônico de características dessa subclasse.`,
    conflicts: []
  };
}

function fallbackClassification(item) {
  const semantic = Boolean(item?.flags?.[MODULE_ID]?.semanticSource);
  if (semantic) {
    return {
      kind: PROVENANCE_KIND.HOMEBREW,
      confidence: 0.86,
      canonicalKey: null,
      canonicalName: null,
      sourceBooks: [],
      rules: rulesOf(item),
      baseOfficial: false,
      reason: "Item criado semanticamente pelo Jarvis e sem correspondência oficial conhecida.",
      conflicts: []
    };
  }

  return {
    kind: PROVENANCE_KIND.UNVERIFIED,
    confidence: 0.5,
    canonicalKey: null,
    canonicalName: null,
    sourceBooks: sourceBookOf(item) ? [sourceBookOf(item)] : [],
    rules: rulesOf(item),
    baseOfficial: false,
    reason: "Não há evidência suficiente para classificar automaticamente como conteúdo oficial ou homebrew.",
    conflicts: []
  };
}

function classifyItems(items = []) {
  const plainItems = items.map(item => item?.toObject ? item.toObject() : item);
  const subclassById = new Map();

  for (const item of plainItems) {
    if (item?.type !== "subclass") continue;
    const entry = findOfficialSubclass({
      name: item.name,
      identifier: identifierOf(item),
      classIdentifier: classIdentifierOf(item)
    });
    if (!entry) continue;
    const classification = subclassClassification(item, plainItems);
    if (item._id) subclassById.set(item._id, { entry, classification });
  }

  return plainItems.map(item => {
    const explicit = normalizeExplicit(explicitProvenance(item));
    if (explicit) return { item, provenance: explicit };

    const trusted = trustedClassification(item);
    if (trusted) return { item, provenance: trusted };

    const srd = srdClassification(item);
    if (srd) return { item, provenance: srd };

    if (item.type === "subclass") {
      const subclass = subclassClassification(item, plainItems);
      if (subclass) return { item, provenance: subclass };
    }

    const child = childOfCanonicalSubclass(item, plainItems, subclassById);
    if (child) return { item, provenance: child };

    return { item, provenance: fallbackClassification(item) };
  });
}

export function analyzeActorProvenance(actor) {
  if (!actor) throw new Error("analyzeActorProvenance exige um Actor.");
  const items = Array.from(actor.items ?? []);
  const results = classifyItems(items);

  const summary = {};
  for (const { provenance } of results) {
    summary[provenance.kind] = (summary[provenance.kind] ?? 0) + 1;
  }

  return {
    actorId: actor.id,
    actorName: actor.name,
    summary,
    items: results.map(({ item, provenance }) => ({
      id: item._id ?? item.id ?? null,
      name: item.name,
      type: item.type,
      provenance
    }))
  };
}

export async function stampActorProvenance(actor) {
  const report = analyzeActorProvenance(actor);
  const updates = report.items
    .filter(entry => entry.id)
    .map(entry => ({
      _id: entry.id,
      [`flags.${MODULE_ID}.provenance`]: clone(entry.provenance)
    }));

  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);

  await actor.update({
    [`flags.${MODULE_ID}.provenanceSummary`]: clone(report.summary),
    [`flags.${MODULE_ID}.provenanceVersion`]: 1
  });

  return report;
}

export function formatProvenanceReport(report) {
  const labels = {
    [PROVENANCE_KIND.OFFICIAL_SYSTEM]: "D&D OFICIAL — sistema/compêndio",
    [PROVENANCE_KIND.OFFICIAL_RECREATION]: "D&D OFICIAL — recriação manual",
    [PROVENANCE_KIND.OFFICIAL_MODIFIED]: "D&D OFICIAL + modificado",
    [PROVENANCE_KIND.HOMEBREW]: "HOMEBREW",
    [PROVENANCE_KIND.HOMEBREW_EXTENSION]: "HOMEBREW sobre base oficial",
    [PROVENANCE_KIND.UNVERIFIED]: "NÃO VERIFICADO"
  };

  const lines = [`Jarvis Provenance — ${report.actorName}`];
  for (const entry of report.items) {
    const p = entry.provenance;
    const source = p.sourceBooks?.length ? ` | ${p.sourceBooks.join(" / ")}` : "";
    const rules = p.rules ? ` | regras ${p.rules}` : "";
    const conflicts = p.conflicts?.length ? ` | ⚠ ${p.conflicts.join(" ")}` : "";
    lines.push(`• ${entry.name} [${entry.type}] → ${labels[p.kind] ?? p.kind}${source}${rules}${conflicts}`);
  }
  return lines.join("\n");
}
