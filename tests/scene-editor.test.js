import test from "node:test";
import assert from "node:assert/strict";
import {
  applySceneEdit, listSceneEditHistory, previewSceneEdit, sceneEditPresets, undoSceneEdit
} from "../scripts/scenes/scene-editor.js";

const MODULE_ID = "fora-do-abismo-foundry";

function setup() {
  const journal = [];
  const data = { Wall: new Map(), AmbientLight: new Map(), AmbientSound: new Map() };
  const document = (type, object) => ({ id: object._id,
    get c() { return object.c; }, get door() { return object.door; },
    toObject: () => structuredClone(object) });
  const collection = type => ({ get contents() { return [...data[type].values()].map(row => document(type, row)); } });
  const scene = { id: "scene-1", name: "Cena de teste", documentName: "Scene", width: 1000, height: 800,
    environment: { darknessLevel: 0.2 }, backgroundColor: "#101010",
    toObject() { return { environment: structuredClone(this.environment), backgroundColor: this.backgroundColor }; },
    async update(changes) {
      if (changes["environment.darknessLevel"] !== undefined) {
        this.environment.darknessLevel = changes["environment.darknessLevel"];
      }
      if (changes.backgroundColor !== undefined) this.backgroundColor = changes.backgroundColor;
    },
    grid: { size: 100 }, walls: collection("Wall"), lights: collection("AmbientLight"), sounds: collection("AmbientSound"),
    async createEmbeddedDocuments(type, rows) {
      return rows.map((row, index) => {
        const object = structuredClone(row);
        object._id ??= `${type}-${data[type].size + index + 1}`;
        data[type].set(object._id, object);
        return document(type, object);
      });
    },
    async updateEmbeddedDocuments(type, rows) {
      return rows.map(row => {
        const object = data[type].get(row._id);
        assert.ok(object);
        for (const [key, value] of Object.entries(row)) {
          if (key !== "_id") object[key] = structuredClone(value);
        }
        return document(type, object);
      });
    },
    async deleteEmbeddedDocuments(type, ids) { ids.forEach(id => data[type].delete(id)); }
  };
  globalThis.foundry = { utils: { deepClone: structuredClone } };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 } };
  globalThis.game = {
    user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } },
    scenes: { get: id => id === scene.id ? scene : null },
    journal,
  };
  globalThis.JournalEntry = { implementation: { async create(input) {
    const flags = structuredClone(input.flags);
    const entry = { ownership: input.ownership,
      getFlag(module, key) { return flags[module]?.[key]; },
      async setFlag(module, key, value) { flags[module][key] = structuredClone(value); }
    };
    journal.push(entry);
    return entry;
  } } };
  return { scene, data, journal };
}

test("edits walls with preview and restores a committed creation", async () => {
  const { scene, data } = setup();
  const input = { type: "Wall", mode: "create", data: { c: [0, 0, 100, 0], door: 0 } };
  const preview = previewSceneEdit(scene, input);
  assert.equal(preview.sceneId, scene.id);
  await assert.rejects(applySceneEdit(scene, input), /confirme/);
  const applied = await applySceneEdit(scene, input, { confirmed: true, expectedBefore: preview.before });
  assert.equal(data.Wall.size, 1);
  assert.equal(listSceneEditHistory(scene)[0].status, "committed");
  await undoSceneEdit(scene, applied.transactionId, { confirmed: true });
  assert.equal(data.Wall.size, 0);
  assert.equal(listSceneEditHistory(scene)[0].status, "undone");
});

test("preview detects near openings and rejects invalid or hostile geometry", () => {
  const { scene, data } = setup();
  data.Wall.set("old", { _id: "old", c: [0, 0, 100, 0], door: 0 });
  const preview = previewSceneEdit(scene, { type: "Wall", mode: "create",
    data: { c: [120, 0, 200, 0] } });
  assert.match(preview.warnings.join(" "), /Possível abertura/);
  assert.throws(() => previewSceneEdit(scene, { type: "Wall", mode: "create",
    data: { c: [0, 0, 0, 0] } }), /parede inválida/);
  assert.throws(() => previewSceneEdit(scene, { type: "Wall", mode: "update", documentId: "old",
    data: { _id: "another" } }), /campo não editável/);
});

test("stale preview blocks update and undo does not overwrite later edits", async () => {
  const { scene, data } = setup();
  data.AmbientLight.set("light", { _id: "light", x: 200, y: 200, config: { bright: 10, dim: 20 } });
  const input = { type: "AmbientLight", mode: "update", documentId: "light",
    data: { config: { bright: 15 } } };
  const preview = previewSceneEdit(scene, input);
  data.AmbientLight.get("light").config.bright = 12;
  await assert.rejects(applySceneEdit(scene, input,
    { confirmed: true, expectedBefore: preview.before }), /mudou após a prévia/);
  const current = previewSceneEdit(scene, input);
  const applied = await applySceneEdit(scene, input,
    { confirmed: true, expectedBefore: current.before });
  data.AmbientLight.get("light").config.bright = 99;
  await assert.rejects(undoSceneEdit(scene, applied.transactionId, { confirmed: true }), /documento mudou/);
});

test("sound edit can be undone; player and nonprivate history are blocked", async () => {
  const { scene, data, journal } = setup();
  const input = { type: "AmbientSound", mode: "create",
    data: { x: 100, y: 100, path: "worlds/test/ambience.ogg", radius: 8 } };
  const operation = await applySceneEdit(scene, input, { confirmed: true });
  assert.equal(data.AmbientSound.size, 1);
  await undoSceneEdit(scene, operation.transactionId, { confirmed: true });
  assert.equal(data.AmbientSound.size, 0);
  assert.equal(sceneEditPresets().some(row => row.key === "torch"), true);
  game.user = { id: "player", isGM: false };
  assert.throws(() => previewSceneEdit(scene, input), /Mestre ativo/);
  game.user = { id: "gm", isGM: true };
  journal[0].ownership = { default: 0, player: 2 };
  assert.throws(() => listSceneEditHistory(scene), /não está privado/);
});

test("scene darkness and background color use the same preview and undo history", async () => {
  const { scene } = setup();
  const input = { type: "SceneEnvironment", mode: "update",
    data: { environment: { darknessLevel: 0.8 }, backgroundColor: "#202030" } };
  const preview = previewSceneEdit(scene, input);
  const result = await applySceneEdit(scene, input,
    { confirmed: true, expectedBefore: preview.before });
  assert.equal(scene.environment.darknessLevel, 0.8);
  await undoSceneEdit(scene, result.transactionId, { confirmed: true });
  assert.equal(scene.environment.darknessLevel, 0.2);
  assert.equal(scene.backgroundColor, "#101010");
});
