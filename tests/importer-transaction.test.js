import test from "node:test";
import assert from "node:assert/strict";
import { JarvisImporterV9 } from "../scripts/importer/v9/jarvis-importer-v9.js";

const payload = {
  schemaVersion: "9.0",
  actor: { name: "Sentinela de teste", type: "character" },
  items: [],
  effects: []
};

function installFoundry(actor) {
  const notifications = [];
  globalThis.foundry = { utils: { deepClone: structuredClone } };
  globalThis.game = {
    user: { isGM: true },
    release: { generation: 14 },
    system: { id: "dnd5e", version: "6.0.2" }
  };
  globalThis.ui = { notifications: {
    error: message => notifications.push({ type: "error", message }),
    info: message => notifications.push({ type: "info", message })
  } };
  globalThis.Actor = { create: async () => actor };
  return notifications;
}

function fakeActor(overrides = {}) {
  return {
    id: "test-actor",
    name: payload.actor.name,
    documentName: "Actor",
    items: [],
    createEmbeddedDocuments: async () => [],
    update: async () => {},
    setFlag: async () => {},
    delete: async () => {},
    ...overrides
  };
}

test("a partial embedded Item creation removes the newly created Actor", async () => {
  const events = [];
  const actor = fakeActor({
    createEmbeddedDocuments: async (type, data) => {
      assert.equal(type, "Item");
      assert.equal(data.length, 2);
      events.push("created-one-item");
      return [{ id: "first-item" }];
    },
    delete: async () => { events.push("deleted-actor"); }
  });
  const notifications = installFoundry(actor);
  const input = { ...payload, items: [
    { name: "Primeiro", type: "feat" },
    { name: "Segundo", type: "feat" }
  ] };

  await assert.rejects(new JarvisImporterV9().importActor(input), /Criação incompleta de Items: esperado 2, criado 1/);
  assert.deepEqual(events, ["created-one-item", "deleted-actor"]);
  assert.match(notifications.at(-1).message, /Actor recém-criado foi removido/);
  assert.equal(notifications.some(entry => entry.type === "info"), false);
});

test("a late provenance failure also removes the newly created Actor", async () => {
  const cause = new Error("Falha ao gravar proveniência");
  let deleted = false;
  const actor = fakeActor({
    update: async () => { throw cause; },
    delete: async () => { deleted = true; }
  });
  installFoundry(actor);

  await assert.rejects(new JarvisImporterV9().importActor(payload), error => error === cause);
  assert.equal(deleted, true);
});

test("a failed rollback reports both failures and tells the GM to remove the incomplete Actor", async () => {
  const rollbackError = new Error("Sem permissão para excluir Actor");
  const actor = fakeActor({
    createEmbeddedDocuments: async () => [],
    delete: async () => { throw rollbackError; }
  });
  const notifications = installFoundry(actor);
  const input = { ...payload, effects: [{ name: "Marca de teste" }] };

  await assert.rejects(new JarvisImporterV9().importActor(input), error => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.errors[0].message, /Criação incompleta de Active Effects/);
    assert.equal(error.errors[1], rollbackError);
    assert.match(error.message, /Remova-o manualmente/);
    return true;
  });
  assert.match(notifications.at(-1).message, /Actor incompleto não pôde ser removido/);
  assert.match(notifications.at(-1).message, /Remova-o manualmente/);
});

test("partial Item import into an existing Actor removes only the newly created Items", async () => {
  const existing = { id: "old-item" };
  const actor = fakeActor({ items: [existing] });
  let removed = [];
  actor.createEmbeddedDocuments = async (_type, data) => {
    assert.equal(data.length, 2);
    actor.items.push({ id: "new-item" });
    return [{ id: "new-item" }];
  };
  actor.deleteEmbeddedDocuments = async (type, ids) => {
    assert.equal(type, "Item");
    removed = ids;
    actor.items = actor.items.filter(item => !ids.includes(item.id));
  };
  installFoundry(actor);

  await assert.rejects(new JarvisImporterV9().importItems(actor, [
    { name: "Primeiro", type: "feat" }, { name: "Segundo", type: "feat" }
  ]), /Criação incompleta de Items/);
  assert.deepEqual(removed, ["new-item"]);
  assert.deepEqual(actor.items, [existing]);
});
