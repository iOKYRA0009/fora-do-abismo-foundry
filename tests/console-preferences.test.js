import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOOL_CATALOG } from "../scripts/ui/console-tool-catalog.js";

import {
  loadConsolePreferences, recordConsoleRecent, setConsoleSidebarCollapsed,
  toggleConsoleFavorite
} from "../scripts/ui/console-preferences.js";

function setup() {
  let stored = null;
  const user = {
    id: "user-1",
    getFlag() { return stored; },
    async setFlag(_module, _key, value) { stored = structuredClone(value); }
  };
  globalThis.game = { user };
  return { user, get stored() { return stored; } };
}

test("preferences keep only recognized tool IDs and save recent success order", async () => {
  const fixture = setup();
  assert.deepEqual(loadConsolePreferences(), { favorites: [], recents: [], sidebarCollapsed: false });
  await toggleConsoleFavorite("actor-open");
  await toggleConsoleFavorite("map-audit");
  await recordConsoleRecent("actor-open");
  await recordConsoleRecent("map-audit");
  await recordConsoleRecent("actor-open");
  assert.deepEqual(fixture.stored.favorites, ["map-audit", "actor-open"]);
  assert.deepEqual(fixture.stored.recents, ["actor-open", "map-audit"]);
  await toggleConsoleFavorite("actor-open");
  assert.deepEqual(loadConsolePreferences().favorites, ["map-audit"]);
  assert.throws(() => toggleConsoleFavorite("player-supplied-js"), /desconhecida/);
});

test("preferences serialize concurrent writes and persist sidebar state", async () => {
  setup();
  await Promise.all([toggleConsoleFavorite("actor-open"),
    toggleConsoleFavorite("map-audit"), setConsoleSidebarCollapsed(true)]);
  assert.deepEqual(loadConsolePreferences().favorites, ["map-audit", "actor-open"]);
  assert.equal(loadConsolePreferences().sidebarCollapsed, true);
});

test("preferences discard malformed flag entries", () => {
  const fixture = setup();
  fixture.user.getFlag = () => ({ favorites: ["map-audit", "unknown", "map-audit"],
    recents: "bad", sidebarCollapsed: "true" });
  assert.deepEqual(loadConsolePreferences(), {
    favorites: ["map-audit"], recents: [], sidebarCollapsed: false
  });
});


test("every current Jarvis toolbar action is recognized by favorites and recents", async () => {
  setup();
  const ids = TOOL_CATALOG.map(tool => tool.id);
  assert.equal(new Set(ids).size, ids.length, "tool IDs must be unique");
  for (const id of ids) {
    await recordConsoleRecent(id);
    assert.equal(loadConsolePreferences().recents[0], id);
    await toggleConsoleFavorite(id);
    assert.equal(loadConsolePreferences().favorites[0], id);
  }
  for (const id of ["managed-macro-run", "actor-wizard-preview",
    "item-wizard-preview", "scene-edit-preview"]) {
    assert.ok(ids.includes(id), `Missing action in shared catalog: ${id}`);
  }
  assert.throws(() => recordConsoleRecent("unsafe-action"), /desconhecida/);
});

test("the tool catalog covers every static action button shown in the Central", () => {
  const source = readFileSync(new URL("../scripts/ui/jarvis-console.js", import.meta.url), "utf8");
  const buttonIds = [...source.matchAll(/button\("([^"]+)"/g)].map(match => match[1]);
  const catalogIds = new Set(TOOL_CATALOG.map(tool => tool.id));
  // Clearing output is a panel control, not a tool users can search or favorite.
  const missing = [...new Set(buttonIds)].filter(id => id !== "clear-output" && !catalogIds.has(id));
  assert.deepEqual(missing, []);
  assert.equal(TOOL_CATALOG.find(tool => tool.id === "managed-macro-create")?.gmOnly, true);
  assert.equal(TOOL_CATALOG.find(tool => tool.id === "appearance-apply")?.trustedOnly, true);
  assert.equal(TOOL_CATALOG.find(tool => tool.id === "managed-macro-run")?.gmOnly, undefined);
});
