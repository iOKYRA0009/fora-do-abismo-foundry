const MODULE_ID = "fora-do-abismo-foundry";
const FLAG_KEY = "consolePreferences";
const MAX_FAVORITES = 12;
const MAX_RECENTS = 10;

export const CONSOLE_TOOL_IDS = Object.freeze([
  "actor-open", "actor-create", "actor-import", "actor-provenance", "actor-rules",
  "actor-progression", "item-create", "items-import", "map-studio", "map-uvtt",
  "map-audit", "map-template-preview", "map-template-create", "map-preset-preview",
  "map-preset-create", "map-skin-apply", "map-lighting-apply", "scene-package-preview",
  "scene-package-create", "scene-package-inspect", "scene-package-repair",
  "scene-migration-preview", "scene-assets-review", "appearance-list", "appearance-available",
  "appearance-apply", "appearance-revert", "form-picker", "form-apply", "form-revert",
  "pack-search", "diagnostics-run", "modules-list", "macro-install"
]);

const validTools = new Set(CONSOLE_TOOL_IDS);
let writeQueue = Promise.resolve();

function user() {
  if (!game.user?.id) throw new Error("Jarvis: usuário não identificado.");
  return game.user;
}

function normalizeList(input, max) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter(id => typeof id === "string" && validTools.has(id)))].slice(0, max);
}

function normalize(value) {
  return {
    favorites: normalizeList(value?.favorites, MAX_FAVORITES),
    recents: normalizeList(value?.recents, MAX_RECENTS),
    sidebarCollapsed: value?.sidebarCollapsed === true
  };
}

function assertTool(id) {
  if (!validTools.has(id)) throw new Error("Jarvis: ferramenta desconhecida.");
}

export function loadConsolePreferences() {
  return normalize(user().getFlag?.(MODULE_ID, FLAG_KEY));
}

function writePreferences(mutator) {
  const current = user();
  const operation = writeQueue.catch(() => {}).then(async () => {
    if (game.user?.id !== current.id) throw new Error("Jarvis: usuário mudou durante a atualização.");
    const next = normalize(current.getFlag?.(MODULE_ID, FLAG_KEY));
    mutator(next);
    await current.setFlag(MODULE_ID, FLAG_KEY, next);
    return normalize(next);
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

export function toggleConsoleFavorite(id) {
  assertTool(id);
  return writePreferences(next => {
    next.favorites = next.favorites.includes(id)
      ? next.favorites.filter(entry => entry !== id)
      : [id, ...next.favorites].slice(0, MAX_FAVORITES);
  });
}

export function recordConsoleRecent(id) {
  assertTool(id);
  return writePreferences(next => {
    next.recents = [id, ...next.recents.filter(entry => entry !== id)].slice(0, MAX_RECENTS);
  });
}

export function setConsoleSidebarCollapsed(value) {
  return writePreferences(next => { next.sidebarCollapsed = Boolean(value); });
}
