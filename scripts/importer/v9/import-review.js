import { validateJarvisActorPayload } from "../validators/payload-validator.js";
import { inspectActorMechanics } from "./mechanics-review.js";

const MODULE_ID = "fora-do-abismo-foundry";
const key = value => String(value ?? "").trim().toLocaleLowerCase("pt-BR");
const values = collection => Array.from(collection?.contents ?? collection ?? []);

export function itemIdentity(item) {
  const source = item.flags?.core?.sourceId ?? item.flags?.[MODULE_ID]?.sourceId
    ?? item.jarvis?.provenance?.uuid ?? item.uuid;
  if (source) return `source:${source}`;
  const id = item._id ?? item.id;
  if (id) return `id:${id}`;
  const identifier = item.system?.identifier ?? item.jarvis?.identifier;
  if (identifier) return `identifier:${item.type}:${key(identifier)}`;
  return `name:${item.type}:${key(item.name)}`;
}

function actorMatches(source, existing) {
  const sourceId = source._id ?? source.id;
  if (sourceId && sourceId === existing.id) return true;
  const sourceOrigin = source.flags?.core?.sourceId ?? source.flags?.[MODULE_ID]?.sourceId;
  const existingOrigin = existing.flags?.core?.sourceId ?? existing.flags?.[MODULE_ID]?.sourceId;
  if (sourceOrigin && sourceOrigin === existingOrigin) return true;
  return existing.type === source.type && key(existing.name) === key(source.name);
}

export function findItemConflicts(items, existing = []) {
  const seen = new Map();
  const conflicts = [];
  const keys = item => [itemIdentity(item), `name:${item.type}:${key(item.name)}`];
  for (const item of existing) for (const identity of keys(item)) seen.set(identity, item);
  for (const item of items) {
    const identity = keys(item).find(candidate => seen.has(candidate)) ?? itemIdentity(item);
    const previous = seen.get(identity);
    if (previous) conflicts.push({ item: item.name, identity, existing: previous.name ?? item.name });
    else for (const candidate of keys(item)) seen.set(candidate, item);
  }
  return conflicts;
}

function compareExistingActor(payload, actor) {
  const source = payload.actor;
  const actual = typeof actor.toObject === "function" ? actor.toObject() : actor;
  const differences = [];
  const compare = (field, expected, value) => {
    if (expected === undefined) return;
    if (String(expected) !== String(value)) differences.push({ field, imported: expected, existing: value ?? null });
  };
  for (const [ability, input] of Object.entries(source.jarvis?.abilities ?? {})) {
    compare(`system.abilities.${ability}.value`, typeof input === "object" ? input?.value : input,
      actual.system?.abilities?.[ability]?.value);
  }
  for (const field of ["value", "max", "temp"]) {
    compare(`system.attributes.hp.${field}`, source.jarvis?.hp?.[field] ?? source.system?.attributes?.hp?.[field],
      actual.system?.attributes?.hp?.[field]);
  }
  compare("system.attributes.ac", source.jarvis?.ac, actual.system?.attributes?.ac?.value ?? actual.system?.attributes?.ac?.flat);
  return { id: actor.id, name: actor.name, differences,
    itemConflicts: findItemConflicts(payload.items ?? [], values(actor.items)) };
}

function itemWarnings(items) {
  const warnings = [];
  for (const item of items) {
    const activities = item.jarvis?.activities ?? Object.values(item.system?.activities ?? {});
    for (const activity of activities) {
      const label = `${item.name} / ${activity.name ?? activity.type ?? "Activity"}`;
      if (["attack", "damage"].includes(activity.type)
        && !activity.damage?.parts?.length && !item.system?.damage?.parts?.length) {
        warnings.push(`${label}: dano sem fórmula explícita; confira a ficha nativa.`);
      }
      if (activity.type === "save" && !activity.save?.ability?.length) {
        warnings.push(`${label}: salvaguarda sem atributo explícito; confira a CD na ficha nativa.`);
      }
      if (activity.uses?.max && !activity.consumption?.targets?.some(target => target?.type === "activityUses")) {
        warnings.push(`${label}: usos da Activity sem alvo de consumo 'activityUses'; podem não ser descontados.`);
      }
    }
  }
  return warnings;
}

export function reviewActorImport(payload, { actors = globalThis.game?.actors, imageFile = null, tokenFile = null } = {}) {
  validateJarvisActorPayload(payload);
  const existing = values(actors).filter(actor => actorMatches(payload.actor, actor));
  const items = payload.items ?? [];
  const conflicts = findItemConflicts(items);
  const warnings = [];
  const mechanics = inspectActorMechanics(payload);
  if (existing.length) warnings.push(`Já existe Actor correspondente a '${payload.actor.name}' por nome ou identificador estável. A importação criaria outra ficha.`);
  if (conflicts.length) warnings.push(`${conflicts.length} Item(s) repetido(s) no JSON.`);
  for (const item of items.filter(row => ["class", "subclass"].includes(row.type))) {
    if (!item.jarvis?.grants?.length && !item.system?.advancement?.length && !item.jarvis?.progression?.length) {
      warnings.push(`${item.name}: classe/subclasse sem progressão definida; configure Advancement na ficha nativa.`);
    }
  }
  if (imageFile) warnings.push("O retrato enviado pode permanecer no armazenamento mesmo se a criação da ficha falhar.");
  if (tokenFile) warnings.push("O token enviado pode permanecer no armazenamento mesmo se a criação da ficha falhar.");
  warnings.push(...itemWarnings(items));
  return {
    schemaVersion: payload.schemaVersion, actor: {
      name: payload.actor.name, type: payload.actor.type,
      image: imageFile?.name ?? payload.actor.img ?? payload.actor.imgStrategy ?? null,
      tokenImage: tokenFile?.name ?? imageFile?.name ?? payload.actor.prototypeToken?.texture?.src ?? null,
      attributes: payload.actor.jarvis?.abilities ?? payload.actor.system?.abilities ?? {},
      hp: payload.actor.jarvis?.hp ?? payload.actor.system?.attributes?.hp ?? null,
      ac: payload.actor.jarvis?.ac ?? payload.actor.system?.attributes?.ac ?? null,
      resources: payload.actor.jarvis?.resources ?? payload.actor.system?.resources ?? []
    },
    items: items.map(item => ({ name: item.name, type: item.type, identity: itemIdentity(item),
      image: item.img ?? item.imgStrategy ?? null,
      activities: item.jarvis?.activities ?? Object.values(item.system?.activities ?? {}),
      effects: item.effects ?? [], uses: item.jarvis?.uses ?? item.system?.uses ?? null })),
    effects: payload.effects ?? [], duplicates: { actors: existing.map(actor => ({ id: actor.id, name: actor.name })), items: conflicts },
    existingComparisons: existing.map(actor => compareExistingActor(payload, actor)),
    warnings, mechanics, errors: mechanics.errors, canImport: !existing.length && !conflicts.length && mechanics.passed,
    protection: "Cria um Actor novo. Não altera PV, recursos, slots, condições, imagens ou configurações de fichas existentes."
  };
}

export function reviewItemImport(items, actor) {
  if (!actor || actor.documentName !== "Actor") throw new Error("Selecione um Actor válido.");
  validateJarvisActorPayload({ schemaVersion: "9.0", actor: { name: "Validação de Items", type: "npc" }, items });
  const conflicts = findItemConflicts(items, values(actor.items));
  const warnings = conflicts.map(row => `Item '${row.item}' coincide com '${row.existing}' (${row.identity}).`);
  if (items.some(item => ["class", "subclass"].includes(item.type))) {
    warnings.push("Classe, subclasse e Advancement exigem revisão e conclusão na ficha nativa D&D5e.");
  }
  warnings.push(...itemWarnings(items));
  return { actor: { id: actor.id, name: actor.name },
    items: items.map(item => ({ name: item.name, type: item.type, identity: itemIdentity(item),
      image: item.img ?? item.imgStrategy ?? null,
      activities: item.jarvis?.activities ?? Object.values(item.system?.activities ?? {}),
      effects: item.effects ?? [], uses: item.jarvis?.uses ?? item.system?.uses ?? null })),
    duplicates: conflicts, warnings,
    errors: [], canImport: !conflicts.length,
    protection: "Apenas Items novos serão criados; dados atuais do Actor e de seus Items não serão substituídos." };
}
