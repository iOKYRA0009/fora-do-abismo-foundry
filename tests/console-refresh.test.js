import test from "node:test";
import assert from "node:assert/strict";

import { executeJarvisConsoleAction } from "../scripts/ui/jarvis-console.js";

test("creating a character updates the active Actor selector without reopening Jarvis", async () => {
  const actors = [];
  const select = { value: "", innerHTML: "" };
  const count = { textContent: "" };
  const heading = { textContent: "" };
  const resultPanel = { removeAttribute() {} };
  const output = { textContent: "", closest: () => resultPanel };
  const fields = { "actor-name": { value: "Nova heroína" },
    "actor-type": { value: "character" }, "jarvis-actor": select };
  const root = { dataset: {}, querySelector(selector) {
    const field = /^\[name="([^"]+)"\]$/.exec(selector)?.[1];
    if (field) return fields[field] ?? null;
    return ({ "[data-jarvis-actor-count]": count,
      ".jarvis-console-result-title": heading,
      ".jarvis-console-result-content": output })[selector] ?? null;
  } };
  globalThis.game = {
    user: { id: "gm", isGM: true },
    actors: { contents: actors, get: id => actors.find(actor => actor.id === id) },
    modules: new Map([["fora-do-abismo-foundry", { api: {} }]])
  };
  globalThis.Actor = { async create(data) {
    const actor = { ...data, id: "new-actor", sheet: { render() {} } };
    actors.push(actor);
    return actor;
  } };

  await executeJarvisConsoleAction("actor-create", root);
  assert.equal(select.value, "new-actor");
  assert.match(select.innerHTML, /Nova heroína/);
  assert.match(count.textContent, /1 ficha/);
  assert.match(output.textContent, /Nova heroína/);
  assert.doesNotMatch(output.textContent, /Reabra/);
});
