import test from "node:test";
import assert from "node:assert/strict";
import { JarvisSceneBuilder } from "../scripts/scenes/scene-builder.js";

globalThis.game = { user: { isGM: true } };
globalThis.foundry = { utils: { deepClone: structuredClone } };
globalThis.CONST = {
  GRID_TYPES: { SQUARE: 1 },
  WALL_DOOR_TYPES: { NONE: 0 },
  WALL_DOOR_STATES: { CLOSED: 0 },
  EDGE_SENSE_TYPES: { NORMAL: 20, NONE: 0 },
  WALL_MOVEMENT_TYPES: { NORMAL: 20, NONE: 0 }
};
globalThis.ui = { notifications: { info() {}, warn() {} } };

function scene(name, { failOnName = null } = {}) {
  return {
    id: name,
    name,
    navigation: true,
    updates: [],
    async update(changes) {
      if (changes.name === failOnName) throw new Error("update failed");
      Object.assign(this, changes);
      this.updates.push(changes);
    },
    async unsetFlag() {},
    async view() {},
    async activate() {}
  };
}

test("replacement keeps the old scene as a named backup", async () => {
  const oldScene = scene("Forja");
  const newScene = scene("Forja — preparação Jarvis");
  await new JarvisSceneBuilder().finalize({
    scene: newScene, existing: oldScene,
    requestedName: "Forja", requestedNavigation: true, view: false
  });
  assert.match(oldScene.name, /^Forja — backup Jarvis /);
  assert.equal(oldScene.navigation, false);
  assert.equal(newScene.name, "Forja");
  assert.equal(newScene.navigation, true);
});

test("failed finalization restores the previous scene", async () => {
  const oldScene = scene("Forja");
  const newScene = scene("Forja — preparação Jarvis", { failOnName: "Forja" });
  await assert.rejects(
    new JarvisSceneBuilder().finalize({
      scene: newScene, existing: oldScene,
      requestedName: "Forja", requestedNavigation: true, view: false
    }),
    /update failed/
  );
  assert.equal(oldScene.name, "Forja");
  assert.equal(oldScene.navigation, true);
  assert.equal(newScene.name, "Forja — preparação Jarvis");
});

test("failed embedded wall creation leaves the original scene untouched", async () => {
  const oldScene = scene("Forja");
  let preparedDeleted = false;
  globalThis.game.scenes = { find: () => oldScene };
  globalThis.Scene = {
    implementation: {
      async create(data) {
        return {
          ...data,
          async createEmbeddedDocuments(type) {
            if (type === "Wall") throw new Error("invalid wall");
            return [];
          },
          async delete() { preparedDeleted = true; }
        };
      }
    }
  };

  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(new JarvisSceneBuilder().build({
      schemaVersion: "1.0",
      scene: { name: "Forja", columns: 10, rows: 10 },
      walls: [{ a: [0, 0], b: [1, 0] }]
    }, { replaceExisting: true, view: false }), /invalid wall/);
  } finally {
    console.error = originalError;
  }
  assert.equal(oldScene.name, "Forja");
  assert.equal(oldScene.updates.length, 0);
  assert.equal(preparedDeleted, true);
});

test("Scene Builder creates a native ambient sound from package data", async () => {
  let createdSound;
  globalThis.game.scenes = { find: () => null };
  globalThis.Scene = {
    implementation: {
      async create(data) {
        return {
          ...data,
          async createEmbeddedDocuments(type, documents) {
            if (type === "AmbientSound") createdSound = documents[0];
            return documents;
          },
          async update(changes) { Object.assign(this, changes); },
          async view() {},
          async delete() {}
        };
      }
    }
  };

  await new JarvisSceneBuilder().build({
    schemaVersion: "1.0",
    scene: { name: "Caverna", columns: 10, rows: 10 },
    sounds: [{ x: 2, y: 3, radius: 15, path: "sounds/goteira.ogg", volume: 0.4 }]
  }, { view: false });
  assert.equal(createdSound.x, 200);
  assert.equal(createdSound.y, 300);
  assert.equal(createdSound.radius, 15);
  assert.equal(createdSound.path, "sounds/goteira.ogg");
});
