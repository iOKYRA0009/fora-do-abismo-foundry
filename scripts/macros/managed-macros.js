const MODULE_ID = "fora-do-abismo-foundry";
const SETTING_KEY = "managedMacros";
const HISTORY_KEY = "managedMacroHistory";
const FAVORITES_KEY = "managedMacroFavorites";
const CATEGORIES = new Set(["geral", "personagens", "conteudo", "habilidades", "mapas",
  "aparencias", "transformacoes", "efeitos", "biblioteca", "utilidades"]);
const VISIBILITY = new Set(["gm", "trusted", "all"]);
const COMMANDS = Object.freeze({
  "open-console": { label: "Abrir Central Jarvis", category: "geral", gmOnly: false },
  "open-actor": { label: "Abrir ficha acessível", category: "personagens", gmOnly: false },
  "open-item": { label: "Abrir Item acessível", category: "conteudo", gmOnly: false },
  "open-compendium": { label: "Abrir documento de compêndio", category: "biblioteca", gmOnly: false },
  "audit-scene": { label: "Analisar cena", category: "mapas", gmOnly: true },
  "open-map-studio": { label: "Abrir Estúdio de Mapas", category: "mapas", gmOnly: true },
  "run-diagnostics": { label: "Executar diagnóstico", category: "geral", gmOnly: true }
});
let writeQueue = Promise.resolve();
const flagWriteQueues = new Map();

function queueFlagWrite(user, key, operation) {
  const queueKey = `${user.id}:${key}`;
  const previous = flagWriteQueues.get(queueKey) ?? Promise.resolve();
  const queued = previous.catch(() => {}).then(operation);
  flagWriteQueues.set(queueKey, queued.catch(() => {}));
  return queued;
}

function currentUser() {
  if (!game.user?.id) throw new Error("Jarvis Macro: usuário não identificado.");
  return game.user;
}

function activeGM() {
  const user = currentUser();
  if (!user.isGM || game.users?.activeGM?.id !== user.id) {
    throw new Error("Jarvis Macro: esta operação exige o Mestre ativo.");
  }
  return user;
}

function readMacros() {
  const entries = game.settings?.get(MODULE_ID, SETTING_KEY);
  if (!Array.isArray(entries)) throw new Error("Jarvis Macro: biblioteca indisponível.");
  return structuredClone(entries);
}

function writeMacros(mutator) {
  activeGM();
  const operation = writeQueue.catch(() => {}).then(async () => {
    activeGM();
    const entries = readMacros();
    const result = mutator(entries);
    await game.settings.set(MODULE_ID, SETTING_KEY, entries);
    return result;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function collectionValues(collection) {
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection?.contents)) return collection.contents;
  return typeof collection?.values === "function" ? Array.from(collection.values()) : [];
}

function validateParams(command, params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) params = {};
  const result = {};
  if (command === "open-actor") {
    result.actorId = String(params.actorId ?? "").trim();
    if (!result.actorId) throw new Error("Jarvis Macro: escolha um Actor para abrir.");
  } else if (command === "open-item") {
    result.itemId = String(params.itemId ?? "").trim();
    result.actorId = String(params.actorId ?? "").trim();
    if (!result.itemId) throw new Error("Jarvis Macro: escolha um Item para abrir.");
  } else if (command === "open-compendium") {
    result.packId = String(params.packId ?? "").trim();
    result.documentId = String(params.documentId ?? "").trim();
    if (!result.packId || !result.documentId) {
      throw new Error("Jarvis Macro: informe compêndio e documento.");
    }
  } else if (command === "audit-scene" && params.sceneId) {
    result.sceneId = String(params.sceneId).trim();
  }
  return result;
}

function normalize(input, { existingId = null } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || ["script", "code", "javascript", "js"].some(key => key in input)) {
    throw new Error("Jarvis Macro: use um comando autorizado, sem JavaScript livre.");
  }
  const command = String(input.command ?? "").trim();
  if (!Object.hasOwn(COMMANDS, command)) throw new Error("Jarvis Macro: comando não autorizado.");
  const name = String(input.name ?? "").trim().slice(0, 100);
  if (!name) throw new Error("Jarvis Macro: informe um nome.");
  const category = String(input.category ?? COMMANDS[command].category);
  if (!CATEGORIES.has(category)) throw new Error("Jarvis Macro: categoria inválida.");
  const visibility = String(input.visibility ?? "gm");
  if (!VISIBILITY.has(visibility) || (COMMANDS[command].gmOnly && visibility !== "gm")) {
    throw new Error("Jarvis Macro: visibilidade incompatível com o comando.");
  }
  return { id: existingId ?? id(), name, category, visibility, command,
    description: String(input.description ?? "").trim().slice(0, 500),
    params: validateParams(command, input.params), updatedAt: Date.now() };
}

function allowed(entry, user = currentUser()) {
  if (user.isGM) return true;
  if (entry.visibility === "all") return true;
  return entry.visibility === "trusted" && Number(user.role ?? 0) >=
    (globalThis.CONST?.USER_ROLES?.TRUSTED ?? 2);
}

function findVisible(id) {
  const entry = readMacros().find(candidate => candidate.id === id);
  if (!entry || !allowed(entry)) throw new Error("Jarvis Macro: macro não disponível para este usuário.");
  return entry;
}

async function recordHistory(entry, ok, message) {
  const user = currentUser();
  try {
    await queueFlagWrite(user, HISTORY_KEY, async () => {
      const previous = user.getFlag?.(MODULE_ID, HISTORY_KEY);
      const rows = Array.isArray(previous) ? previous.slice(0, 19) : [];
      rows.unshift({ id: entry.id, name: entry.name, at: Date.now(), ok,
        message: String(message ?? "").slice(0, 160) });
      await user.setFlag(MODULE_ID, HISTORY_KEY, rows);
    });
  } catch (error) {
    console.warn(`${MODULE_ID} | Histórico de macro não foi salvo`, error);
  }
}

export function registerManagedMacros() {
  game.settings.register(MODULE_ID, SETTING_KEY, {
    name: "Biblioteca de macros gerenciadas Jarvis", scope: "world", config: false,
    type: Array, default: []
  });
}

export function managedMacroCommands() {
  return Object.entries(COMMANDS).map(([key, value]) => ({ key, ...value }));
}

export function listManagedMacros() {
  return readMacros().filter(entry => allowed(entry));
}

export function managedMacroHistory() {
  const value = currentUser().getFlag?.(MODULE_ID, HISTORY_KEY);
  return Array.isArray(value) ? value.slice(0, 20) : [];
}

export function managedMacroFavorites() {
  const visible = new Set(listManagedMacros().map(entry => entry.id));
  const value = currentUser().getFlag?.(MODULE_ID, FAVORITES_KEY);
  return Array.isArray(value) ? value.filter(entry => visible.has(entry)).slice(0, 20) : [];
}

export async function toggleManagedMacroFavorite(macroId) {
  findVisible(macroId);
  const user = currentUser();
  return queueFlagWrite(user, FAVORITES_KEY, async () => {
    const visible = new Set(readMacros().filter(entry => allowed(entry, user)).map(entry => entry.id));
    if (!visible.has(macroId)) throw new Error("Jarvis Macro: macro não disponível para este usuário.");
    const previous = user.getFlag?.(MODULE_ID, FAVORITES_KEY);
    const favorites = Array.isArray(previous) ? previous.filter(entry => visible.has(entry)).slice(0, 20) : [];
    const next = favorites.includes(macroId)
      ? favorites.filter(entry => entry !== macroId)
      : [macroId, ...favorites].slice(0, 20);
    await user.setFlag(MODULE_ID, FAVORITES_KEY, next);
    return next;
  });
}

export function createManagedMacro(input) {
  const entry = normalize(input);
  return writeMacros(entries => { entries.push(entry); return entry; });
}

export function updateManagedMacro(macroId, input) {
  activeGM();
  return writeMacros(entries => {
    const index = entries.findIndex(entry => entry.id === macroId);
    if (index < 0) throw new Error("Jarvis Macro: macro não encontrada.");
    entries[index] = normalize(input, { existingId: macroId });
    return entries[index];
  });
}

export function duplicateManagedMacro(macroId) {
  activeGM();
  return writeMacros(entries => {
    const source = entries.find(entry => entry.id === macroId);
    if (!source) throw new Error("Jarvis Macro: macro não encontrada.");
    const duplicate = normalize({ ...source, name: `${source.name} — cópia` });
    entries.push(duplicate);
    return duplicate;
  });
}

export function removeManagedMacro(macroId) {
  activeGM();
  return writeMacros(entries => {
    const index = entries.findIndex(entry => entry.id === macroId);
    if (index < 0) throw new Error("Jarvis Macro: macro não encontrada.");
    return entries.splice(index, 1)[0];
  });
}

export function previewManagedMacroImport(input) {
  activeGM();
  const source = typeof input === "string" ? JSON.parse(input) : input;
  const rows = Array.isArray(source) ? source : source?.macros;
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) {
    throw new Error("Jarvis Macro: importe de 1 a 100 comandos gerenciados.");
  }
  const entries = rows.map(row => normalize(row));
  return { count: entries.length, entries };
}

export async function importManagedMacros(input) {
  const preview = previewManagedMacroImport(input);
  await writeMacros(entries => { entries.push(...preview.entries); });
  return preview;
}

export async function executeManagedMacro(macroId) {
  const entry = findVisible(macroId);
  const moduleApi = game.modules.get(MODULE_ID)?.api;
  if (!moduleApi) throw new Error("Jarvis Macro: módulo ainda não está pronto.");
  try {
    let result;
    if (entry.command === "open-console") {
      await moduleApi.ui.open();
      result = { opened: "console" };
    } else if (entry.command === "open-actor") {
      const actor = game.actors.get(entry.params.actorId);
      if (!actor || !(game.user.isGM || actor.testUserPermission?.(game.user, "OBSERVER"))) {
        throw new Error("Ficha não acessível.");
      }
      await actor.sheet?.render(true);
      result = { opened: "actor", id: actor.id, name: actor.name };
    } else if (entry.command === "open-item") {
      const actor = entry.params.actorId ? game.actors.get(entry.params.actorId) : null;
      if (entry.params.actorId && !actor) throw new Error("Personagem da macro não encontrado.");
      if (actor && !(game.user.isGM || actor.testUserPermission?.(game.user, "OBSERVER"))) {
        throw new Error("Item não acessível.");
      }
      const item = actor ? actor.items?.get?.(entry.params.itemId) : game.items?.get?.(entry.params.itemId);
      if (!item || (!actor && !game.user.isGM && !item.testUserPermission?.(game.user, "OBSERVER"))) {
        throw new Error("Item não acessível.");
      }
      await item.sheet?.render(true);
      result = { opened: "item", id: item.id, name: item.name };
    } else if (entry.command === "open-compendium") {
      const pack = game.packs.get(entry.params.packId);
      if (!pack || pack.visible === false) throw new Error("Compêndio não acessível.");
      const document = await pack.getDocument(entry.params.documentId);
      if (!document) throw new Error("Documento de compêndio não encontrado.");
      await document.sheet?.render(true);
      result = { opened: "compendium", name: document.name };
    } else if (entry.command === "audit-scene") {
      activeGM();
      const scene = entry.params.sceneId ? game.scenes.get(entry.params.sceneId) : globalThis.canvas?.scene;
      result = await moduleApi.scenes.audit(scene);
    } else if (entry.command === "open-map-studio") {
      activeGM();
      result = await moduleApi.scenes.openStudio();
    } else if (entry.command === "run-diagnostics") {
      activeGM();
      result = await moduleApi.diagnostics.run();
    } else throw new Error("Jarvis Macro: comando não autorizado.");
    await recordHistory(entry, true, "Concluída");
    return result;
  } catch (error) {
    await recordHistory(entry, false, error.message);
    throw error;
  }
}

export async function installManagedMacroHotbar(macroId, slot) {
  const entry = findVisible(macroId);
  const number = Number(slot);
  if (!Number.isInteger(number) || number < 1 || number > 10) throw new Error("Jarvis Macro: atalho deve ser 1–10.");
  const command = `game.modules.get("${MODULE_ID}")?.api?.macros?.execute(${JSON.stringify(entry.id)})`;
  let macro = collectionValues(game.macros).find(candidate => candidate.command === command && candidate.type === "script");
  if (!macro) {
    macro = await Macro.create({ name: `Jarvis — ${entry.name}`, type: "script",
      command, img: "icons/svg/book.svg" });
  }
  if (!macro) throw new Error("Jarvis Macro: o Foundry não criou o atalho.");
  await game.user.assignHotbarMacro(macro, number);
  return { macroId: entry.id, slot: number, nativeMacroId: macro.id };
}
