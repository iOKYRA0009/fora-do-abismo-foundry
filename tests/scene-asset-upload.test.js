import test from "node:test";
import assert from "node:assert/strict";

import { JarvisScenePackageBuilder } from "../scripts/scenes/package/scene-package-builder.js";
import { listSceneAssetLedger, registerSceneAssetLedger } from "../scripts/scenes/package/asset-ledger.js";

const MODULE_ID = "fora-do-abismo-foundry";

function setup({ uploadFails = false, buildFails = false } = {}) {
  const settings = new Map();
  const journals = [];
  let uploads = 0;
  let builds = 0;
  const sceneFlags = new Map();
  const collection = () => ({ contents: [], size: 0, filter: () => [] });
  const scene = {
    id: "built-scene", name: "Mapa novo", documentName: "Scene", grid: { size: 100 },
    background: { src: "worlds/test/maps/upload.webp" },
    regions: collection(), drawings: collection(), tiles: collection(),
    walls: collection(), lights: collection(), sounds: collection(), tokens: collection(),
    getFlag(_module, key) { return sceneFlags.get(key); },
    async setFlag(_module, key, value) { sceneFlags.set(key, value); },
    async unsetFlag(_module, key) { sceneFlags.delete(key); },
    async delete() {},
    async update() {}
  };
  globalThis.game = {
    user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } },
    scenes: [], world: { id: "test" },
    journal: { contents: journals, get: id => journals.find(entry => entry.id === id) },
    settings: {
      register(_module, key, data) { settings.set(key, data.default); },
      get(_module, key) { return settings.get(key); },
      async set(_module, key, value) { settings.set(key, structuredClone(value)); }
    }
  };
  globalThis.JournalEntry = { implementation: { async create(data) {
    const flags = structuredClone(data.flags[MODULE_ID]);
    const journal = {
      id: `journal-${journals.length + 1}`, ownership: data.ownership,
      getFlag(_module, key) { return flags[key]; },
      async setFlag(_module, key, value) { flags[key] = structuredClone(value); },
      async delete() { journals.splice(journals.indexOf(this), 1); }
    };
    journals.push(journal);
    return journal;
  } } };
  globalThis.foundry = { utils: { deepClone: structuredClone } };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 },
    DRAWING_FILL_TYPES: { SOLID: 1 }, WALL_DOOR_TYPES: { NONE: 0 } };
  globalThis.CONFIG = { RegionBehavior: { dataModels: {} }, Canvas: {} };
  globalThis.ui = { notifications: { info() {}, warn() {} } };
  globalThis.FilePicker = class {
    static async createDirectory() {}
    static async browse() {}
    static async upload() {
      uploads += 1;
      if (uploadFails) throw new Error("upload failed");
      return { path: "worlds/test/maps/upload.webp" };
    }
  };
  registerSceneAssetLedger();
  const builder = new JarvisScenePackageBuilder({ builder: {
    async build() {
      builds += 1;
      if (buildFails) throw new Error("build failed");
      game.scenes.push(scene);
      return { scene, existing: null, requestedName: scene.name, requestedNavigation: false };
    },
    async finalize() {}
  } });
  const payload = {
    schemaVersion: "1.0", scene: { name: scene.name, columns: 5, rows: 5 },
    visual: { backgroundBase64: "data:image/png;base64,AA==", mimeType: "image/png" }
  };
  return { builder, payload, get uploads() { return uploads; }, get builds() { return builds; } };
}

test("upload failure is recorded for GM review before scene creation", async () => {
  const fixture = setup({ uploadFails: true });
  await assert.rejects(fixture.builder.build(fixture.payload), /upload failed/);
  assert.equal(fixture.builds, 0);
  assert.equal(fixture.uploads, 1);
  assert.equal(listSceneAssetLedger()[0].status, "review");
  assert.equal(listSceneAssetLedger()[0].reason, "upload-interrupted");
});

test("failed scene build leaves uploaded file in review ledger", async () => {
  const fixture = setup({ buildFails: true });
  await assert.rejects(fixture.builder.build(fixture.payload), /build failed/);
  assert.equal(fixture.uploads, 1);
  assert.equal(listSceneAssetLedger()[0].status, "review");
  assert.equal(listSceneAssetLedger()[0].reason, "scene-build-failed");
});

test("completed scene build links the uploaded image to its scene", async () => {
  const fixture = setup();
  const result = await fixture.builder.build(fixture.payload, { view: false });
  assert.equal(result.backgroundSrc, "worlds/test/maps/upload.webp");
  const [record] = listSceneAssetLedger();
  assert.equal(record.status, "linked");
  assert.equal(record.sceneId, result.scene.id);
});
