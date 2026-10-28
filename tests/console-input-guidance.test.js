import test from "node:test";
import assert from "node:assert/strict";

import { executeJarvisConsoleAction } from "../scripts/ui/jarvis-console.js";
import { JarvisInputError } from "../scripts/ui/console-input-error.js";

function root(fields = {}) {
  const data = Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, { value }]));
  return { dataset: {}, querySelector(selector) {
    if (!selector.startsWith('[name="') || !selector.endsWith('"]')) return null;
    return data[selector.slice(7, -2)] ?? null;
  } };
}

function setup(actors = []) {
  let previews = 0;
  const api = { content: { preview() { previews += 1; throw new Error("Unexpected content preview"); } } };
  globalThis.game = {
    user: { id: "gm", isGM: true, role: 4 },
    actors: { contents: actors, get: id => actors.find(actor => actor.id === id) ?? null },
    modules: new Map([["fora-do-abismo-foundry", { api }]])
  };
  globalThis.canvas = { tokens: { controlled: [], placeables: [] } };
  return { get previews() { return previews; } };
}

async function expectIncomplete(action, form, message) {
  await assert.rejects(executeJarvisConsoleAction(action, root(form)), error => {
    assert.ok(error instanceof JarvisInputError);
    assert.equal(error.code, "JARVIS_INPUT_REQUIRED");
    assert.match(error.message, message);
    return true;
  });
}

test("missing Actor and Item selections are input guidance, not runtime errors", async () => {
  setup();
  await expectIncomplete("actor-open", {}, /Selecione um personagem/);
  await expectIncomplete("player-item-open", {}, /Selecione um personagem/);
  await expectIncomplete("appearance-list", {}, /Selecione um personagem/);

  const actor = { id: "a", name: "Exemplo", items: { get: () => null } };
  setup([actor]);
  await expectIncomplete("player-item-open", { "jarvis-actor": "a" }, /Selecione um Item/);
  await expectIncomplete("appearance-available", { "jarvis-actor": "a" }, /Selecione o Token/);
});

test("empty content form does not start a write or content preview", async () => {
  const fixture = setup();
  await expectIncomplete("item-create", { "item-mode": "simple", "item-name": "" }, /Informe um nome/);
  await expectIncomplete("actor-create", { "actor-mode": "simple", "actor-name": "" }, /Informe um nome/);
  await expectIncomplete("item-wizard-preview", { "item-mode": "simple", "item-name": "" }, /Informe um nome/);
  assert.equal(fixture.previews, 0);
});

test("input guidance has an explicit machine-readable error identity", () => {
  const error = new JarvisInputError("Informe os dados.");
  assert.equal(error.name, "JarvisInputError");
  assert.equal(error.code, "JARVIS_INPUT_REQUIRED");
  assert.ok(error instanceof Error);
});
