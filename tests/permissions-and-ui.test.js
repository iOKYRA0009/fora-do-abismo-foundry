import test from "node:test";
import assert from "node:assert/strict";

import { JarvisImporterV9 } from "../scripts/importer/v9/jarvis-importer-v9.js";
import { JarvisSceneBuilder } from "../scripts/scenes/scene-builder.js";
import { JarvisScenePackageBuilder } from "../scripts/scenes/package/scene-package-builder.js";
import { JarvisSceneFramework } from "../scripts/scenes/framework/scene-framework.js";
import { openMapStudio, registerMapStudioControl } from "../scripts/ui/map-studio.js";
import { openUniversalVttImporter, registerUniversalVttControl } from "../scripts/ui/universal-vtt-importer.js";
import { assertJarvisAccess, getJarvisAccess, visibleJarvisTabs } from "../scripts/ui/jarvis-console-core.js";
import { executeJarvisConsoleAction } from "../scripts/ui/jarvis-console.js";

const MODULE_ID = "fora-do-abismo-foundry";

const validActor = {
  schemaVersion: "9.0",
  actor: { name: "Teste sem escrita", type: "character" }
};

test("player cannot invoke GM-only importer, scene builders, or map dialogs directly", async () => {
  globalThis.game = { user: { isGM: false } };

  await assert.rejects(new JarvisImporterV9().importActor(validActor), /Mestre/);
  await assert.rejects(new JarvisImporterV9().importItems({ documentName: "Actor" }, [{}]), /Mestre/);
  await assert.rejects(new JarvisSceneBuilder().build({}), /GM/);
  await assert.rejects(new JarvisSceneBuilder().finalize({}), /GM/);
  await assert.rejects(new JarvisSceneBuilder().buildMany([]), /GM/);

  const packageBuilder = new JarvisScenePackageBuilder({ builder: new JarvisSceneBuilder() });
  await assert.rejects(packageBuilder.build({}), /GM/);
  await assert.rejects(packageBuilder.repairRegions(null), /GM/);
  await assert.rejects(packageBuilder.runAction(null, "test"), /GM/);

  const framework = new JarvisSceneFramework({ builder: new JarvisSceneBuilder() });
  await assert.rejects(framework.applySkin(null, "underdark_stone"), /GM/);
  await assert.rejects(openMapStudio(), /Mestre/);
  await assert.rejects(openUniversalVttImporter(), /Mestre/);
});

test("GM-only scene toolbar entries are absent for players and present for GM", () => {
  const handlers = new Map();
  globalThis.Hooks = {
    on(name, handler) {
      const registered = handlers.get(name) ?? [];
      registered.push(handler);
      handlers.set(name, registered);
    }
  };
  registerMapStudioControl();
  registerUniversalVttControl();

  const runHandlers = () => {
    const controls = { walls: { tools: {} } };
    for (const handler of handlers.get("getSceneControlButtons") ?? []) handler(controls);
    return controls.walls.tools;
  };

  globalThis.game = { user: { isGM: false } };
  assert.deepEqual(Object.keys(runHandlers()), []);

  globalThis.game = { user: { isGM: true } };
  assert.deepEqual(Object.keys(runHandlers()), ["jarvisMapStudio", "jarvisUvtt"]);
});

test("Jarvis console exposes the complete tab set only to a GM", () => {
  globalThis.CONST = { USER_ROLES: { TRUSTED: 2 } };
  const gm = { id: "gm", role: 4, isGM: true };
  const access = getJarvisAccess(gm);
  assert.equal(access.gm, true);
  assert.equal(access.trusted, false);
  assert.equal(access.canManageActor, true);
  assert.deepEqual(visibleJarvisTabs(access), [
    "characters", "content", "maps", "appearances", "compendiums", "diagnostics", "players", "macros"
  ]);
});

test("trusted users can manage only owned Actors; ordinary players remain read-only", () => {
  globalThis.CONST = { USER_ROLES: { TRUSTED: 2 } };
  const trusted = { id: "trusted", role: 2, isGM: false };
  const player = { id: "player", role: 1, isGM: false };
  const actor = {
    // isOwner describes the local user and must not authorize the user passed to getJarvisAccess.
    isOwner: true,
    testUserPermission(user, level) {
      return user.id === "trusted" && ["OBSERVER", "OWNER"].includes(level);
    }
  };

  const trustedAccess = getJarvisAccess(trusted, actor);
  assert.equal(trustedAccess.trusted, true);
  assert.equal(trustedAccess.canViewActor, true);
  assert.equal(trustedAccess.canManageActor, true);
  assert.deepEqual(visibleJarvisTabs(trustedAccess), ["characters", "appearances", "compendiums", "players"]);

  const playerAccess = getJarvisAccess(player, actor);
  assert.equal(playerAccess.canViewActor, false);
  assert.equal(playerAccess.canManageActor, false);
  assert.deepEqual(visibleJarvisTabs(playerAccess), ["characters", "appearances", "compendiums", "players"]);
  assert.throws(() => assertJarvisAccess(playerAccess.canManageActor), /não tem permissão/);

  const unrelated = { testUserPermission: () => false, isOwner: true };
  assert.equal(getJarvisAccess(trusted, unrelated).canManageActor, false);
});

test("Jarvis console shows no tabs without an authenticated user", () => {
  assert.deepEqual(visibleJarvisTabs(getJarvisAccess(null)), []);
});

function consoleRoot(values = {}) {
  return { querySelector: selector => {
    const name = /^\[name="([^"]+)"\]$/.exec(selector)?.[1];
    return name && name in values ? { value: values[name] } : null;
  } };
}

test("direct console calls cannot bypass GM actions hidden from the player UI", async () => {
  globalThis.game = { user: { id: "player", role: 1, isGM: false },
    modules: new Map([[MODULE_ID, { api: {} }]]) };
  const root = consoleRoot();
  for (const action of ["actor-create", "actor-import", "actor-compare", "actor-progression",
    "actor-rules-set", "actor-provenance-stamp", "actor-jack-sync", "item-create", "items-import",
    "map-studio", "map-uvtt", "map-audit", "scene-package-create", "scene-package-inspect",
    "scene-package-repair", "scene-package-action",
    "diagnostics-run", "macro-install"]) {
    await assert.rejects(executeJarvisConsoleAction(action, root), /Mestre/, action);
  }
});

test("direct appearance and compendium mutations require actor ownership and trusted role", async () => {
  const actor = {
    id: "actor-1", name: "Herói",
    testUserPermission(user, level) { return level === "OBSERVER" || user.id === "trusted-owner"; },
    async createEmbeddedDocuments() { throw new Error("não deveria criar"); }
  };
  const document = { documentName: "Item", name: "Item", toObject: () => ({ name: "Item", type: "feat" }) };
  const pack = { visible: true, documentName: "Item", collection: "dnd5e.items",
    metadata: { packageName: "dnd5e" }, getDocument: async () => document };
  globalThis.game = {
    user: { id: "player", role: 1, isGM: false },
    modules: new Map([[MODULE_ID, { api: {} }]]),
    actors: { get: id => id === actor.id ? actor : null }, packs: [pack]
  };
  const root = consoleRoot({ "jarvis-actor": actor.id });
  const state = { actionIndex: "0", packRows: [{ pack, id: "item-1" }] };

  await assert.rejects(executeJarvisConsoleAction("appearance-save", root, state), /permissão/);
  await assert.rejects(executeJarvisConsoleAction("pack-import", root, state), /exige Mestre/);

  game.user = { id: "trusted-other", role: 2, isGM: false };
  await assert.rejects(executeJarvisConsoleAction("appearance-save", root, state), /permissão/);
  await assert.rejects(executeJarvisConsoleAction("pack-import", root, state), /exige Mestre/);
});

test("trusted owner imports only official dnd5e Items into their own Actor", async () => {
  let creations = 0;
  const actor = {
    id: "actor-1", name: "Herói", documentName: "Actor",
    testUserPermission: (_user, level) => ["OBSERVER", "OWNER"].includes(level),
    async createEmbeddedDocuments(type, entries) {
      creations += 1;
      assert.equal(type, "Item");
      return [{ name: entries[0].name, sheet: null }];
    }
  };
  const document = { documentName: "Item", name: "Item", toObject: () => ({ name: "Item", type: "feat" }) };
  const pack = { visible: true, documentName: "Item", collection: "third-party.items",
    metadata: { packageName: "third-party" }, getDocument: async () => document };
  globalThis.game = {
    user: { id: "trusted-owner", role: 2, isGM: false },
    modules: new Map([[MODULE_ID, { api: {} }]]),
    actors: { get: id => id === actor.id ? actor : null }, packs: [pack]
  };
  const root = consoleRoot({ "jarvis-actor": actor.id });
  const state = { actionIndex: "0", packRows: [{ pack, id: "item-1" }] };

  await assert.rejects(executeJarvisConsoleAction("pack-import", root, state), /oficiais D&D5e/);
  assert.equal(creations, 0);
  pack.metadata.packageName = "dnd5e";
  await executeJarvisConsoleAction("pack-import", root, state);
  assert.equal(creations, 1);
});

test("trusted owner validates a Visage pack before installing it through the unified window", async () => {
  const actor = { id: "actor-1", name: "Herói",
    testUserPermission: (_user, level) => ["OBSERVER", "OWNER"].includes(level) };
  const calls = [];
  const appearance = {
    status: () => ({ active: true }),
    buildLocal: spec => {
      calls.push(["validate", spec.label]);
      if (!spec.label) throw new Error("label ausente");
      return spec;
    },
    importVisageExport: async (target, pack) => {
      calls.push(["install", target.id, pack.profiles.length]);
      return { installed: pack.profiles.length };
    }
  };
  globalThis.CONST = { USER_ROLES: { TRUSTED: 2 } };
  globalThis.foundry = { applications: { api: { DialogV2: { confirm: async () => true } } } };
  globalThis.game = {
    user: { id: "trusted-owner", role: 2, isGM: false },
    actors: { get: id => id === actor.id ? actor : null },
    modules: new Map([[MODULE_ID, { api: { appearance } }]])
  };
  const root = consoleRoot({ "jarvis-actor": actor.id,
    "appearance-pack-json": JSON.stringify({ profiles: [{ label: "Armadura" }] }) });

  await executeJarvisConsoleAction("appearance-pack-import", root);
  assert.deepEqual(calls, [["validate", "Armadura"], ["install", actor.id, 1]]);
});
