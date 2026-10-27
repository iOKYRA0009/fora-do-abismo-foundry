const indexCache = new WeakMap();
const CACHE_MS = 5 * 60 * 1000;

function list(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  return typeof collection.values === "function" ? Array.from(collection.values()) : [];
}

function plain(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function matches(value, query) {
  return plain(value).includes(query);
}

function visibleActor(actor, access) {
  return Boolean(access?.gm || actor?.testUserPermission?.(game.user, "OBSERVER"));
}

function visibleItem(item, access) {
  return Boolean(access?.gm || item?.testUserPermission?.(game.user, "OBSERVER")
    || item?.parent?.testUserPermission?.(game.user, "OBSERVER"));
}

function visibleScene(scene, access) {
  return Boolean(access?.gm || scene?.testUserPermission?.(game.user, "OBSERVER")
    || (scene?.active && scene?.navigation));
}

function visibleMacro(macro, access) {
  return Boolean(access?.gm || macro?.visibility === "all"
    || (access?.trusted && macro?.visibility === "trusted"));
}

function visiblePack(pack) {
  return pack?.visible !== false && ["Item", "Actor"].includes(pack?.documentName);
}

function visibleTool(tool, access) {
  if (tool?.gmOnly && !access?.gm) return false;
  if (tool?.trustedOnly && !(access?.gm || access?.trusted)) return false;
  return Boolean(tool?.id && tool?.label);
}

async function packRows(pack) {
  const cached = indexCache.get(pack);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.rows;
  const rows = list(await pack.getIndex({ fields: ["type", "img"] }));
  indexCache.set(pack, { at: Date.now(), rows });
  return rows;
}

export async function searchConsole(query, {
  access, actors = [], items = [], scenes = [], macros = [], packs = [], tools = [], limit = 30, signal = null
} = {}) {
  const needle = plain(query).trim();
  if (!needle || signal?.aborted) return [];
  const cap = Math.max(1, Math.min(50, Number(limit) || 30));
  const results = [];
  const add = result => { if (results.length < cap) results.push(result); };

  for (const tool of list(tools)) {
    if (!visibleTool(tool, access)) continue;
    if (matches(`${tool.label} ${tool.description ?? ""}`, needle)) {
      add({ type: "tool", id: tool.id, label: tool.label,
        description: tool.description ?? "Ferramenta Jarvis", action: tool.id });
    }
  }
  for (const actor of list(actors)) {
    if (!visibleActor(actor, access)) continue;
    if (matches(`${actor.name ?? ""} ${actor.type ?? ""}`, needle)) {
      add({ type: "actor", id: actor.id, actorId: actor.id,
        label: actor.name, description: actor.type ?? "Ficha" });
    }
  }
  for (const item of list(items)) {
    if (!visibleItem(item, access)) continue;
    if (matches(`${item.name ?? ""} ${item.type ?? ""}`, needle)) {
      add({ type: "item", id: item.uuid ?? item.id, itemId: item.id,
        actorId: item.parent?.documentName === "Actor" ? item.parent.id : null,
        label: item.name, description: item.type ?? "Item" });
    }
  }
  for (const scene of list(scenes)) {
    if (!visibleScene(scene, access)) continue;
    if (matches(scene.name, needle)) {
      add({ type: "scene", id: scene.id, sceneId: scene.id,
        label: scene.name, description: "Cena" });
    }
  }
  for (const macro of list(macros)) {
    if (!visibleMacro(macro, access)) continue;
    if (matches(`${macro.name ?? ""} ${macro.category ?? ""}`, needle)) {
      add({ type: "macro", id: macro.id, macroId: macro.id,
        label: macro.name, description: `Macro · ${macro.category ?? "geral"}` });
    }
  }
  if (signal?.aborted) return [];
  if (results.length >= cap || needle.length < 2) return results;

  const searchablePacks = list(packs).filter(visiblePack);
  let cursor = 0;
  async function worker() {
    while (cursor < searchablePacks.length && results.length < cap && !signal?.aborted) {
      const pack = searchablePacks[cursor++];
      let entries;
      try { entries = await packRows(pack); }
      catch (error) {
        console.warn(`Jarvis | Índice do compêndio ${pack.collection} indisponível`, error);
        continue;
      }
      if (signal?.aborted) return;
      for (const entry of entries) {
        if (results.length >= cap) break;
        if (!matches(`${entry.name ?? ""} ${entry.type ?? ""}`, needle)) continue;
        const documentId = entry._id ?? entry.id;
        if (!documentId) continue;
        add({ type: "compendium", id: `${pack.collection}:${documentId}`,
          packId: pack.collection, documentId, label: entry.name,
          description: `${pack.title ?? pack.collection} · ${entry.type ?? pack.documentName}` });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, searchablePacks.length) }, () => worker()));
  return signal?.aborted ? [] : results;
}
