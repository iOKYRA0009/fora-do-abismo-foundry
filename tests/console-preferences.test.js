import test from "node:test";
import assert from "node:assert/strict";

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
