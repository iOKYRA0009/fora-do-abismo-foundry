import test from "node:test";
import assert from "node:assert/strict";

import { applyItemProgression, registerProgressionEngine } from "../scripts/progression/progression-engine.js";
import { JarvisScenePackageBuilder } from "../scripts/scenes/package/scene-package-builder.js";

const MODULE_ID = "fora-do-abismo-foundry";

function progressionFixture(importItems) {
  const flags = {
    progression: [{ id: "level-two", level: 2, grants: [{ name: "Dom do teste", type: "feat" }] }]
  };
  const actor = { name: "Herói", items: [] };
  const item = {
    type: "class", name: "Classe", actor, system: { levels: 2 },
    getFlag: (_module, key) => flags[key],
    async setFlag(_module, key, value) { flags[key] = value; }
  };
  actor.items.push(item);
  globalThis.game = {
    user: { id: "gm-1", isGM: true },
    users: { activeGM: { id: "gm-1" } },
    actors: [actor],
    modules: new Map([[MODULE_ID, { api: { importer: { importItems } } }]])
  };
  globalThis.foundry = { utils: { hasProperty: (object, path) => path === "system.levels" && Boolean(object.system?.levels) } };
  globalThis.ui = { notifications: { info() {}, error() {} } };
  return { actor, item };
}

test("progression runs once for concurrent requests to the same class", async () => {
  let imports = 0;
  const { item } = progressionFixture(async () => {
    imports += 1;
    await new Promise(resolve => setTimeout(resolve, 5));
    return [{}];
  });
  const results = await Promise.all([applyItemProgression(item), applyItemProgression(item)]);
  assert.deepEqual(results, [1, 1]);
  assert.equal(imports, 1);
});

test("automatic progression acts only on the authoritative GM and reconciles at ready", async () => {
  let imports = 0;
  const { item } = progressionFixture(async () => { imports += 1; return [{}]; });
  const handlers = {};
  globalThis.Hooks = {
    on(name, fn) { handlers[name] = fn; },
    once(name, fn) { handlers[name] = fn; }
  };
  registerProgressionEngine();

  game.user = { id: "player", isGM: false };
  handlers.updateItem(item, { "system.levels": 2 });
  game.user = { id: "gm-2", isGM: true };
  handlers.updateItem(item, { "system.levels": 2 });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(imports, 0);

  game.user = { id: "gm-1", isGM: true };
  handlers.ready();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(imports, 1);
});

function regionFixture({ failCreate = false } = {}) {
  globalThis.game = { user: { id: "gm-1", isGM: true }, users: { activeGM: { id: "gm-1" } } };
  globalThis.foundry = { utils: { deepClone: structuredClone } };
  globalThis.CONFIG = { RegionBehavior: { dataModels: {} }, Canvas: {} };
  globalThis.CONST = { DRAWING_FILL_TYPES: { SOLID: 1 } };
  globalThis.ui = { notifications: { info() {} } };
  const flagged = (id, flag) => ({ id, getFlag: (_module, key) => key === flag });
  const oldRegion = flagged("old-region", "scenePackageRegion");
  const oldDrawing = flagged("old-drawing", "scenePackageRegionFallback");
  const calls = [];
  const scene = {
    id: "scene-1", name: "Mapa", documentName: "Scene", grid: { size: 100 },
    regions: { contents: [oldRegion] }, drawings: { contents: [oldDrawing] },
    getFlag: () => ({ manifest: { regions: [{ id: "repair-1", rect: [0, 0, 1, 1] }] } }),
    async createEmbeddedDocuments(type) {
      calls.push(`create ${type}`);
      if (failCreate) throw new Error(`Falhou ${type}`);
      const created = flagged(`new-${type.toLowerCase()}`, type === "Region" ? "scenePackageRegion" : "scenePackageRegionFallback");
      this[type === "Region" ? "regions" : "drawings"].contents.push(created);
      return [created];
    },
    async deleteEmbeddedDocuments(type, ids) {
      calls.push(`delete ${type} ${ids.join(",")}`);
      const collection = this[type === "Region" ? "regions" : "drawings"].contents;
      for (const id of ids) {
        const index = collection.findIndex(entry => entry.id === id);
        if (index >= 0) collection.splice(index, 1);
      }
    },
    async update() { calls.push("update Scene"); }
  };
  return { scene, calls };
}

test("failed Region repair preserves the original Region and Drawing", async () => {
  const { scene, calls } = regionFixture({ failCreate: true });
  const builder = new JarvisScenePackageBuilder({ builder: {} });
  const previousWarn = console.warn;
  console.warn = () => {};
  try {
    await assert.rejects(builder.repairRegions(scene), /não puderam ser reparadas/);
  } finally {
    console.warn = previousWarn;
  }
  assert.deepEqual(scene.regions.contents.map(entry => entry.id), ["old-region"]);
  assert.deepEqual(scene.drawings.contents.map(entry => entry.id), ["old-drawing"]);
  assert.equal(calls.some(call => call.startsWith("delete")), false);
});

test("partial Region repair removes staged replacements and retains originals", async () => {
  const { scene, calls } = regionFixture();
  scene.getFlag = () => ({ manifest: { regions: [
    { id: "first", name: "First", rect: [0, 0, 1, 1] },
    { id: "second", name: "Second", rect: [1, 1, 1, 1] }
  ] } });
  const originalCreate = scene.createEmbeddedDocuments;
  scene.createEmbeddedDocuments = function (type, documents) {
    if (documents[0].flags?.[MODULE_ID]?.packageRegionIndex === 1) {
      calls.push(`create ${type}`);
      throw new Error(`Falhou ${type}`);
    }
    return originalCreate.call(this, type, documents);
  };
  const builder = new JarvisScenePackageBuilder({ builder: {} });
  const previousWarn = console.warn;
  console.warn = () => {};
  try {
    await assert.rejects(builder.repairRegions(scene), /não puderam ser reparadas/);
  } finally {
    console.warn = previousWarn;
  }
  assert.deepEqual(scene.regions.contents.map(entry => entry.id), ["old-region"]);
  assert.deepEqual(scene.drawings.contents.map(entry => entry.id), ["old-drawing"]);
  assert.ok(calls.includes("delete Region new-region"));
  assert.ok(!calls.includes("delete Region old-region"));
});

test("successful Region repair creates replacements before deleting originals", async () => {
  const { scene, calls } = regionFixture();
  const builder = new JarvisScenePackageBuilder({ builder: {} });
  await builder.repairRegions(scene);
  assert.deepEqual(scene.regions.contents.map(entry => entry.id), ["new-region"]);
  assert.deepEqual(scene.drawings.contents.map(entry => entry.id), []);
  assert.deepEqual(calls.slice(0, 3), ["create Region", "delete Region old-region", "delete Drawing old-drawing"]);
});

test("secondary GM skips Region actions", async () => {
  regionFixture();
  game.user = { id: "gm-2", isGM: true };
  const builder = new JarvisScenePackageBuilder({ builder: {} });
  assert.deepEqual(await builder.handleRegionEvent({}), { skipped: true, reason: "not-active-gm" });
});
