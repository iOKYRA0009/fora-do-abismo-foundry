import test from "node:test";
import assert from "node:assert/strict";

import { searchConsole } from "../scripts/ui/console-search.js";

test("search omits GM tools and inaccessible Actors for players", async () => {
  globalThis.game = { user: { id: "player", isGM: false } };
  const actors = [
    { id: "visible", name: "Aventureiro", type: "character", testUserPermission: () => true },
    { id: "secret", name: "Aventureiro oculto", type: "npc", testUserPermission: () => false }
  ];
  const results = await searchConsole("aventureiro", {
    access: { gm: false, trusted: false }, actors,
    tools: [{ id: "map-audit", label: "Aventureiro mapa", gmOnly: true }]
  });
  assert.deepEqual(results.map(entry => entry.id), ["visible"]);
});

test("search loads visible compendium indexes only for a meaningful query", async () => {
  globalThis.game = { user: { id: "gm", isGM: true } };
  let reads = 0;
  const visible = { collection: "dnd5e.items", title: "Itens", documentName: "Item", visible: true,
    async getIndex() { reads += 1; return [{ _id: "sword", name: "Espada", type: "weapon" }]; } };
  const hidden = { collection: "secret.items", documentName: "Item", visible: false,
    async getIndex() { throw new Error("hidden pack indexed"); } };
  assert.deepEqual(await searchConsole("", { access: { gm: true }, packs: [visible, hidden] }), []);
  assert.equal(reads, 0);
  const result = await searchConsole("espada", { access: { gm: true }, packs: [visible, hidden] });
  assert.equal(reads, 1);
  assert.deepEqual(result.map(entry => entry.id), ["dnd5e.items:sword"]);
  await searchConsole("espada", { access: { gm: true }, packs: [visible] });
  assert.equal(reads, 1, "cached index avoids repeated pack loading");
});

test("aborted search returns no stale compendium results", async () => {
  globalThis.game = { user: { id: "gm", isGM: true } };
  const controller = new AbortController();
  let release;
  const pack = { collection: "pack", documentName: "Item", visible: true,
    getIndex: () => new Promise(resolve => { release = resolve; }) };
  const pending = searchConsole("spell", { access: { gm: true }, packs: [pack], signal: controller.signal });
  controller.abort();
  release([{ _id: "one", name: "Spell", type: "spell" }]);
  assert.deepEqual(await pending, []);
});

test("search obeys result cap before querying compendiums", async () => {
  globalThis.game = { user: { id: "gm", isGM: true } };
  let reads = 0;
  const result = await searchConsole("item", {
    access: { gm: true }, limit: 1,
    tools: [{ id: "item-create", label: "Criar item" }],
    packs: [{ visible: true, documentName: "Item", getIndex: async () => { reads += 1; return []; } }]
  });
  assert.equal(result.length, 1);
  assert.equal(reads, 0);
});
