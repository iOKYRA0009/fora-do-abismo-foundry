import { localizedImportData } from "./compendium-language.js";

const MODULE_ID = "fora-do-abismo-foundry";
const FLAG = "compendiumSync";

function clone(value) { return structuredClone(value); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function snapshot(data) {
  return { name: data.name ?? null, img: data.img ?? null, system: clone(data.system ?? {}) };
}
function sourceKey(pack, id) { return `${pack.collection}:${id}`; }
function flagOf(item) { return item.flags?.[MODULE_ID]?.[FLAG] ?? null; }

export async function trackCompendiumImport(created, pack, sourceId, sourceData) {
  if (!created || created.documentName !== "Item") return;
  await created.setFlag(MODULE_ID, FLAG, {
    source: sourceKey(pack, sourceId),
    baseline: snapshot(created.toObject()),
    sourceSnapshot: snapshot(sourceData)
  });
}

function candidateItems(pack, worldItems, actors) {
  const prefix = `${pack.collection}:`;
  return [...worldItems, ...actors.flatMap(actor => Array.from(actor.items ?? []))]
    .filter(item => item?.documentName === "Item" && flagOf(item)?.source?.startsWith(prefix));
}

function compareItem(item, sourceData) {
  const tracking = flagOf(item);
  const current = snapshot(item.toObject());
  const source = snapshot(sourceData);
  const previous = tracking?.sourceSnapshot;
  const baseline = tracking?.baseline;
  if (!previous || !baseline) return { status: "sem-base", updates: {}, conflicts: [] };
  const updates = {};
  const conflicts = [];
  for (const key of ["name", "img"]) {
    if (same(source[key], previous[key])) continue;
    if (same(current[key], baseline[key])) updates[key] = source[key];
    else conflicts.push(key);
  }
  const keys = new Set([...Object.keys(previous.system ?? {}), ...Object.keys(source.system ?? {})]);
  for (const key of keys) {
    if (!Object.hasOwn(source.system, key) || same(source.system[key], previous.system?.[key])) continue;
    if (same(current.system?.[key], baseline.system?.[key])) updates[`system.${key}`] = clone(source.system[key]);
    else conflicts.push(`system.${key}`);
  }
  return { status: Object.keys(updates).length ? "atualizar" : conflicts.length ? "conflito" : "atual",
    updates, conflicts };
}

export async function previewCompendiumSync(pack, { worldItems = game.items,
  actors = game.actors, terms } = {}) {
  if (!game.user?.isGM) throw new Error("Somente o Mestre pode sincronizar Items importados.");
  if (!pack || pack.documentName !== "Item" || pack.visible === false) {
    throw new Error("Selecione um compêndio de Items visível.");
  }
  const candidates = candidateItems(pack, Array.from(worldItems ?? []), Array.from(actors ?? []));
  const sources = new Map();
  const rows = [];
  for (const item of candidates.slice(0, 200)) {
    const tracking = flagOf(item);
    const sourceId = tracking.source.slice(`${pack.collection}:`.length);
    let source = sources.get(sourceId);
    if (!source) {
      const document = await pack.getDocument(sourceId);
      if (!document) {
        rows.push({ item, status: "fonte-ausente", updates: {}, conflicts: [] });
        continue;
      }
      source = localizedImportData(document.toObject(), terms);
      sources.set(sourceId, source);
    }
    const result = compareItem(item, source);
    rows.push({ item, sourceId, source, ...result });
  }
  return { packId: pack.collection, rows, truncated: Math.max(0, candidates.length - 200) };
}

export async function applyCompendiumSync(preview, pack) {
  if (!game.user?.isGM) throw new Error("Somente o Mestre pode sincronizar Items importados.");
  if (!preview || preview.packId !== pack?.collection || pack.documentName !== "Item") {
    throw new Error("A prévia não corresponde ao compêndio selecionado.");
  }
  let updated = 0;
  const skipped = [];
  for (const row of preview.rows) {
    if (row.status !== "atualizar") continue;
    const item = row.item;
    const tracking = flagOf(item);
    if (!tracking || tracking.source !== sourceKey(pack, row.sourceId)) {
      skipped.push(item.name);
      continue;
    }
    const latest = await pack.getDocument(row.sourceId);
    if (!latest || !same(snapshot(localizedImportData(latest.toObject())), snapshot(row.source))) {
      skipped.push(item.name);
      continue;
    }
    const fresh = compareItem(item, row.source);
    if (fresh.status !== "atualizar" || !same(fresh.updates, row.updates)) {
      skipped.push(item.name);
      continue;
    }
    // Keep conflicts untouched. Only the fields still equal to their import baseline are updated.
    await item.update(row.updates);
    const baseline = snapshot(item.toObject());
    const sourceSnapshot = snapshot(row.source);
    for (const key of fresh.conflicts) {
      if (key.startsWith("system.")) {
        const field = key.slice(7);
        baseline.system[field] = clone(tracking.baseline.system[field]);
        sourceSnapshot.system[field] = clone(tracking.sourceSnapshot.system[field]);
      } else {
        baseline[key] = tracking.baseline[key];
        sourceSnapshot[key] = tracking.sourceSnapshot[key];
      }
    }
    await item.setFlag(MODULE_ID, FLAG, {
      source: tracking.source,
      baseline, sourceSnapshot
    });
    updated += 1;
  }
  return { updated, skipped, conflicts: preview.rows.filter(row => row.conflicts.length).length };
}
