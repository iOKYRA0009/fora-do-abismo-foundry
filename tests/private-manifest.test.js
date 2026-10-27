import test from "node:test";
import assert from "node:assert/strict";

import { JarvisScenePackageBuilder } from "../scripts/scenes/package/scene-package-builder.js";

const MODULE_ID = "fora-do-abismo-foundry";

function setup() {
  const journal = new Map();
  const sceneFlags = new Map();
  const scene = {
    id: "scene-private", name: "Mapa", documentName: "Scene", grid: { size: 100 },
    regions: { contents: [], get size() { return this.contents.length; } },
    drawings: { contents: [], get size() { return this.contents.length; } },
    async createEmbeddedDocuments(type, data) {
      const document = {
        id: `${type}-${this.regions.contents.length + this.drawings.contents.length}`,
        name: data[0].name, text: data[0].text,
        flags: data[0].flags?.[MODULE_ID] ?? {},
        getFlag(_module, key) { return this.flags[key]; },
        async setFlag(_module, key, value) { this.flags[key] = value; },
        async unsetFlag(_module, key) { delete this.flags[key]; },
        async update(changes) { Object.assign(this, changes); }
      };
      this[type === "Region" ? "regions" : "drawings"].contents.push(document);
      return [document];
    },
    getFlag(_module, key) { return sceneFlags.get(key); },
    async setFlag(_module, key, value) { sceneFlags.set(key, value); },
    async unsetFlag(_module, key) { sceneFlags.delete(key); },
    async delete() {},
    async update() {}
  };
  globalThis.game = {
    user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } },
    scenes: [], journal: { get: id => journal.get(id) },
    world: { id: "test-world" }
  };
  globalThis.foundry = { utils: { deepClone: structuredClone } };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 }, DRAWING_FILL_TYPES: { SOLID: 1 }, WALL_DOOR_TYPES: { NONE: 0 } };
  globalThis.CONFIG = { RegionBehavior: { dataModels: {} }, Canvas: {} };
  globalThis.ui = { notifications: { info() {}, warn() {} } };
  const createdJournals = [];
  globalThis.JournalEntry = { implementation: { async create(data) {
    const entry = {
      id: `journal-${createdJournals.length + 1}`, ownership: data.ownership,
      deleteCalls: 0,
      getFlag: (_module, key) => data.flags[MODULE_ID][key],
      async delete() { this.deleteCalls += 1; journal.delete(this.id); }
    };
    journal.set(entry.id, entry);
    createdJournals.push(entry);
    return entry;
  } } };
  return { scene, sceneFlags, createdJournals, journal };
}

const payload = {
  schemaVersion: "1.0", id: "segredo-do-mestre",
  scene: { name: "Mapa", columns: 10, rows: 10 },
  regions: [{ id: "ancora-real", name: "A Verdade", purpose: "Revelar Kairon",
    rect: [1, 1, 2, 2], automation: { actions: [{ type: "notify", text: "Segredo de Kairon" }] } }],
  manualActions: { revelar: [{ type: "notify", text: "Segredo de Kairon" }] },
  puzzles: [{ answer: "Âncora Mental" }],
  metadata: { secret: "Reset" }
};

test("new Scene Package keeps secrets in a GM-only Journal, not Scene or Region flags", async () => {
  const { scene, sceneFlags, createdJournals } = setup();
  let blueprint;
  const builder = new JarvisScenePackageBuilder({ builder: {
    async build(data) {
      blueprint = data;
      return { scene, existing: null, requestedName: scene.name, requestedNavigation: false };
    },
    async finalize() {}
  } });
  await builder.build(structuredClone(payload), { view: false });

  assert.equal(createdJournals.length, 1);
  assert.equal(createdJournals[0].ownership.default, 0);
  assert.equal(createdJournals[0].getFlag(MODULE_ID, "scenePackagePrivate").manifest.puzzles[0].answer, "Âncora Mental");
  assert.equal(sceneFlags.get("scenePackage").manifestJournalId, createdJournals[0].id);
  const publicData = JSON.stringify({ blueprint, sceneFlag: sceneFlags.get("scenePackage"), regions: scene.regions.contents });
  for (const secret of ["segredo-do-mestre", "ancora-real", "A Verdade", "Revelar Kairon", "Segredo de Kairon", "Âncora Mental", "Reset"]) {
    assert.equal(publicData.includes(secret), false, `${secret} leaked into public Scene data`);
  }

  game.user = { id: "player", isGM: false };
  const inspection = builder.inspect(scene);
  assert.equal(inspection.package.manifest, undefined);
  assert.equal(inspection.packageId, null);
});

test("legacy Scene manifest migrates only after Journal persistence succeeds", async () => {
  const { scene, sceneFlags, createdJournals } = setup();
  game.scenes.push(scene);
  sceneFlags.set("scenePackage", { version: "1.0", id: "segredo-do-mestre", manifest: structuredClone(payload), regionSummary: { failures: [] } });
  sceneFlags.set("sceneBuilder", { schemaVersion: "1.0", blueprintId: "segredo-do-mestre",
    metadata: { secret: "Reset", scenePackage: { purpose: "Revelar Kairon" } } });
  const [legacyRegion] = await scene.createEmbeddedDocuments("Region", [{
    name: "A Verdade", flags: { [MODULE_ID]: {
      scenePackageRegion: true, packageRegionId: "ancora-real",
      purpose: "Revelar Kairon", automation: { actions: [{ text: "Segredo de Kairon" }] }
    } }
  }]);
  const builder = new JarvisScenePackageBuilder({ builder: {} });
  const result = await builder.migrateLegacyManifests();
  assert.equal(result.migrated, 1);
  assert.deepEqual(result.failures, []);
  assert.equal(createdJournals.length, 1);
  assert.equal(sceneFlags.get("scenePackage").manifest, undefined);
  assert.equal(sceneFlags.get("scenePackage").manifestJournalId, createdJournals[0].id);
  assert.equal(sceneFlags.get("sceneBuilder").metadata.secret, undefined);
  assert.equal(sceneFlags.get("sceneBuilder").blueprintId, "scene-package-private");
  assert.equal(legacyRegion.getFlag(MODULE_ID, "packageRegionIndex"), 0);
  assert.equal(legacyRegion.getFlag(MODULE_ID, "automation"), undefined);
  assert.equal(legacyRegion.getFlag(MODULE_ID, "purpose"), undefined);
  assert.equal(legacyRegion.name, "Jarvis Region 1");
  assert.equal(builder.inspect(scene).package.manifest.puzzles[0].answer, "Âncora Mental");

  let repeatedWrites = 0;
  for (const document of [scene, legacyRegion]) {
    for (const method of ["setFlag", "unsetFlag", "update"]) {
      const original = document[method];
      document[method] = function (...args) { repeatedWrites += 1; return original.apply(this, args); };
    }
  }
  const second = await builder.migrateLegacyManifests();
  assert.equal(second.migrated, 0);
  assert.equal(repeatedWrites, 0);

  game.user = { id: "player", isGM: false };
  assert.equal(builder.inspect(scene).package.manifest, undefined);
});

test("failed private Journal verification leaves legacy Scene manifest intact", async () => {
  const { scene, sceneFlags } = setup();
  game.scenes.push(scene);
  sceneFlags.set("scenePackage", { version: "1.0", manifest: structuredClone(payload) });
  globalThis.JournalEntry.implementation.create = async () => ({
    id: "bad-journal", getFlag: () => null, async delete() {}
  });
  const builder = new JarvisScenePackageBuilder({ builder: {} });
  const result = await builder.migrateLegacyManifests();
  assert.equal(result.migrated, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(sceneFlags.get("scenePackage").manifest.puzzles[0].answer, "Âncora Mental");
});

test("failed Scene finalization removes the prepared Scene and its private Journal", async () => {
  const { scene, createdJournals, journal } = setup();
  let sceneDeleted = false;
  const builder = new JarvisScenePackageBuilder({ builder: {
    async build() { return { scene, existing: null, requestedName: scene.name, requestedNavigation: false }; },
    async finalize() { throw new Error("finalização falhou"); }
  } });
  scene.delete = async () => {
    sceneDeleted = true;
    await builder.cleanupDeletedSceneManifest(scene);
  };
  const previousWarn = console.warn;
  console.warn = () => {};
  try {
    await assert.rejects(builder.build(structuredClone(payload)), /finalização falhou/);
  } finally {
    console.warn = previousWarn;
  }
  assert.equal(sceneDeleted, true);
  assert.equal(createdJournals.length, 1);
  assert.equal(journal.has(createdJournals[0].id), false);
  assert.equal(createdJournals[0].deleteCalls, 1);
});

test("duplicate Scene name is rejected before any image upload or Journal creation", async () => {
  const { scene, createdJournals } = setup();
  game.scenes.push(scene);
  let builderCalls = 0;
  const builder = new JarvisScenePackageBuilder({ builder: { async build() { builderCalls += 1; } } });
  const source = structuredClone(payload);
  source.visual = { backgroundBase64: "image-data", mimeType: "image/png" };
  await assert.rejects(builder.build(source), /já existe/);
  assert.equal(builderCalls, 0);
  assert.equal(createdJournals.length, 0);
});

test("deleting a Scene removes only its matching private Journal", async () => {
  const { scene, sceneFlags, journal } = setup();
  const record = { sceneId: scene.id, manifest: structuredClone(payload) };
  const entry = await JournalEntry.implementation.create({
    ownership: { default: 0 }, flags: { [MODULE_ID]: { scenePackagePrivate: record } }
  });
  sceneFlags.set("scenePackage", { manifestJournalId: entry.id });
  const builder = new JarvisScenePackageBuilder({ builder: {} });

  game.user = { id: "gm-2", isGM: true };
  assert.equal((await builder.cleanupDeletedSceneManifest(scene)).skipped, true);
  assert.equal(journal.has(entry.id), true);

  game.user = { id: "gm", isGM: true };
  assert.equal((await builder.cleanupDeletedSceneManifest(scene)).deletedJournalId, entry.id);
  assert.equal(journal.has(entry.id), false);
});
