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

test("progression does not mark a level granted when item creation is incomplete", async () => {
  const { item } = progressionFixture(async () => []);
  await assert.rejects(applyItemProgression(item), /importação incompleta/);
  assert.equal(item.getFlag(MODULE_ID, "progressionState"), undefined);
});

test("progression fails closed without an elected active GM", async () => {
  let imports = 0;
  const { item } = progressionFixture(async () => { imports += 1; return [{}]; });
  game.users.activeGM = null;
  await assert.rejects(applyItemProgression(item), /Mestre ativo/);
  assert.equal(imports, 0);
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
  const flagged = (id, flag) => {
    const flags = { [flag]: true };
    return { id,
      getFlag: (_module, key) => flags[key],
      async setFlag(_module, key, value) { flags[key] = value; },
      async unsetFlag(_module, key) { delete flags[key]; }
    };
  };
  const oldRegion = flagged("old-region", "scenePackageRegion");
  const oldDrawing = flagged("old-drawing", "scenePackageRegionFallback");
  const calls = [];
  const scene = {
    id: "scene-1", name: "Mapa", documentName: "Scene", grid: { size: 100 },
    regions: { contents: [oldRegion] }, drawings: { contents: [oldDrawing] },
    getFlag: () => ({ manifest: { regions: [{ id: "repair-1", rect: [0, 0, 1, 1] }] } }),
    async createEmbeddedDocuments(type, documents) {
      calls.push(`create ${type}`);
      if (failCreate) throw new Error(`Falhou ${type}`);
      const created = flagged(`new-${type.toLowerCase()}`, type === "Region" ? "scenePackageRegion" : "scenePackageRegionFallback");
      for (const [key, value] of Object.entries(documents[0].flags?.[MODULE_ID] ?? {})) {
        await created.setFlag(MODULE_ID, key, value);
      }
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
  await assert.rejects(builder.repairRegions({ documentName: "Scene" }), /GM ativo/);
});

test("Region repair carries the once-triggered state to replacement Regions", async () => {
  const { scene } = regionFixture();
  const original = scene.regions.contents[0];
  await original.setFlag(MODULE_ID, "packageRegionIndex", 0);
  await original.setFlag(MODULE_ID, "triggered", true);
  await original.setFlag(MODULE_ID, "automationState", { status: "partial", completed: 1, failed: 1 });
  const builder = new JarvisScenePackageBuilder({ builder: {} });
  await builder.repairRegions(scene);
  assert.equal(scene.regions.contents.length, 1);
  assert.equal(scene.regions.contents[0].getFlag(MODULE_ID, "triggered"), true);
  assert.equal(scene.regions.contents[0].getFlag(MODULE_ID, "automationState").status, "partial");
  assert.equal(scene.regions.contents[0].getFlag(MODULE_ID, "repairStaged"), undefined);
});

test("replacement Regions remain inert until old Regions are deleted", async () => {
  const { scene } = regionFixture();
  const originalDelete = scene.deleteEmbeddedDocuments;
  scene.deleteEmbeddedDocuments = async function (type, ids) {
    if (type === "Region") {
      const replacement = this.regions.contents.find(entry => entry.id === "new-region");
      assert.equal(replacement.getFlag(MODULE_ID, "repairStaged"), true);
    }
    return originalDelete.call(this, type, ids);
  };
  const builder = new JarvisScenePackageBuilder({ builder: {} });
  await builder.repairRegions(scene);
  assert.equal(scene.regions.contents[0].getFlag(MODULE_ID, "repairStaged"), undefined);
});

function onceRegionFixture(actions, filter = {}) {
  const { scene } = regionFixture();
  const spec = { id: "once", rect: [0, 0, 1, 1], automation: { once: true, filter, actions } };
  scene.getFlag = () => ({ manifest: { regions: [spec] } });
  scene.tokens = [];
  const flags = { packageRegionIndex: 0 };
  const region = {
    id: "event-region",
    getFlag: (_module, key) => flags[key],
    async setFlag(_module, key, value) { flags[key] = value; },
    async unsetFlag(_module, key) { delete flags[key]; }
  };
  flags.scenePackageRegion = true;
  scene.regions.contents = [region];
  return { scene, region, flags, builder: new JarvisScenePackageBuilder({ builder: {} }) };
}

test("once Region is consumed only after every action succeeds", async () => {
  const { scene, region, flags, builder } = onceRegionFixture([
    { type: "setTokenHidden", tokenId: "actor-token" }
  ]);
  const first = await builder.handleRegionEvent({ scene, region });
  assert.equal(first.succeeded, false);
  assert.equal(flags.triggered, undefined);
  assert.equal(flags.automationState.status, "partial");
  const token = { id: "actor-token", name: "Herói", async update(changes) { this.hidden = changes.hidden; } };
  scene.tokens.push(token);
  assert.equal((await builder.handleRegionEvent({ scene, region })).reason, "needs-review");
  assert.equal((await builder.resetRegionAutomation(scene, region)).reason, "confirmation-required");
  assert.equal((await builder.resetRegionAutomation(scene, region, { confirmed: true })).reset, true);
  const second = await builder.handleRegionEvent({ scene, region });
  assert.equal(second.succeeded, true);
  assert.equal(flags.triggered, true);
  assert.equal(flags.automationState, undefined);
  assert.equal(token.hidden, false);
  assert.equal((await builder.handleRegionEvent({ scene, region })).reason, "already-triggered");
});

test("actor-filtered Region ignores events without a matching token", async () => {
  const { scene, region, flags, builder } = onceRegionFixture([
    { type: "sceneFlag", key: "test", value: 1 }
  ], { actor: "Herói" });
  assert.equal((await builder.handleRegionEvent({ scene, region })).reason, "actor-filter");
  assert.equal(flags.triggered, undefined);
});

test("concurrent Region events on the active GM execute once", async () => {
  const { scene, region, flags, builder } = onceRegionFixture([
    { type: "gmWhisper", text: "Evento" }
  ]);
  let finish;
  let messages = 0;
  globalThis.ChatMessage = {
    getWhisperRecipients: () => [{ id: "gm-1" }],
    async create() { messages += 1; await new Promise(resolve => { finish = resolve; }); }
  };
  const first = builder.handleRegionEvent({ scene, region });
  const second = await builder.handleRegionEvent({ scene, region });
  assert.equal(second.reason, "in-progress");
  assert.equal(messages, 1);
  finish();
  assert.equal((await first).succeeded, true);
  assert.equal(flags.triggered, true);
  assert.equal(messages, 1);
});

test("interrupted once action remains blocked for GM review", async () => {
  const { scene, region, flags, builder } = onceRegionFixture([
    { type: "gmWhisper", text: "Evento" }
  ]);
  let messages = 0;
  globalThis.ChatMessage = {
    getWhisperRecipients: () => [{ id: "gm-1" }],
    async create() { messages += 1; throw new Error("rede interrompida"); }
  };
  await assert.rejects(builder.handleRegionEvent({ scene, region }), /rede interrompida/);
  assert.equal(flags.automationState.status, "partial");
  assert.equal(flags.triggered, undefined);
  assert.equal((await builder.handleRegionEvent({ scene, region })).reason, "needs-review");
  assert.equal(messages, 1);
});

test("a successful action is not replayed after a later once action fails", async () => {
  const { scene, region, flags, builder } = onceRegionFixture([
    { type: "gmWhisper", text: "Primeira ação" },
    { type: "setTokenHidden", tokenId: "ausente" }
  ]);
  let messages = 0;
  globalThis.ChatMessage = {
    getWhisperRecipients: () => [{ id: "gm-1" }],
    async create() { messages += 1; }
  };
  const result = await builder.handleRegionEvent({ scene, region });
  assert.equal(result.succeeded, false);
  assert.equal(flags.automationState.completed, 1);
  assert.equal(flags.automationState.failed, 1);
  assert.equal((await builder.handleRegionEvent({ scene, region })).reason, "needs-review");
  assert.equal(messages, 1);
});

test("a persisted running Region state remains blocked after an interrupted client", async () => {
  const { scene, region, flags, builder } = onceRegionFixture([
    { type: "notify", text: "Não repetir" }
  ]);
  flags.automationState = { status: "running", startedAt: 1 };
  assert.deepEqual(await builder.handleRegionEvent({ scene, region }), {
    skipped: true, reason: "needs-review", state: "running"
  });
  assert.equal(flags.triggered, undefined);
});
