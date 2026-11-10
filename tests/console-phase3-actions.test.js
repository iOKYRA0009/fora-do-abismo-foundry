import test from "node:test";
import assert from "node:assert/strict";
import { executeJarvisConsoleAction } from "../scripts/ui/jarvis-console.js";

function rootFor(input = {}) {
  const fields = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, { value }]));
  const heading = { textContent: "" };
  const content = { textContent: "", closest: () => ({ removeAttribute() {} }) };
  const root = { dataset: {}, querySelector(selector) {
    const name = /^\[name="([^"]+)"\]$/.exec(selector)?.[1];
    if (name) return fields[name] ?? null;
    return ({ ".jarvis-console-result-title": heading,
      ".jarvis-console-result-content": content })[selector] ?? null;
  } };
  return { root, fields, heading, content };
}

function setup(api, { gm = true, actors = [] } = {}) {
  const user = { id: gm ? "gm" : "player", isGM: gm, role: gm ? 4 : 1 };
  globalThis.game = { user, users: { activeGM: { id: "gm" } },
    actors: { contents: actors, get: id => actors.find(row => row.id === id) ?? null },
    modules: new Map([["fora-do-abismo-foundry", { api }]]) };
  globalThis.canvas = { scene: { id: "scene", name: "Mapa" } };
  globalThis.foundry = { applications: { api: { DialogV2: { confirm: async () => true } } } };
}

test("guided Actor creation previews native data, creates and refreshes the selector", async () => {
  const actors = [];
  const calls = [];
  const api = { content: {
    preview(spec) { calls.push(["preview", spec]); return { name: spec.name, type: spec.type,
      actor: { hp: spec.hp } }; },
    async create(spec) {
      calls.push(["create", spec]);
      const document = { id: "new", name: spec.name, type: spec.type, sheet: { render() {} } };
      actors.push(document);
      return { document };
    }
  } };
  setup(api, { actors });
  const { root, fields, content } = rootFor({ "actor-name": "Sentinela", "actor-type": "npc",
    "actor-mode": "simple", "actor-hp": "22", "actor-ac": "15", "jarvis-actor": "" });
  await executeJarvisConsoleAction("actor-wizard-preview", root);
  await executeJarvisConsoleAction("actor-create", root);
  assert.equal(calls[1][1].hp, "22");
  assert.equal(calls[1][1].abilities.str, "10");
  assert.equal(fields["jarvis-actor"].value, "new");
  assert.match(content.textContent, /Sentinela/);
});

test("Item wizard passes charges and destination to the native content service", async () => {
  let received;
  const api = { content: { preview: spec => ({ name: spec.name, type: spec.type,
    destination: "world", effects: 0, activities: 0 }),
    async create(spec) { received = spec; return { document: { name: spec.name, type: spec.type } }; } } };
  setup(api);
  const { root, content } = rootFor({ "item-name": "Ampulheta", "item-type": "consumable",
    "item-mode": "simple", "item-description": "3 usos", "item-uses": "3",
    "item-destination": "world" });
  await executeJarvisConsoleAction("item-wizard-preview", root);
  await executeJarvisConsoleAction("item-create", root);
  assert.equal(received.usesMax, "3");
  assert.equal(received.destinationActorId, null);
  assert.match(content.textContent, /Ampulheta/);
});

test("scene edit requires a preview before applying to the active scene", async () => {
  const calls = [];
  const api = { scenes: { editor: {
    presets: () => [], preview(scene, input) {
      calls.push(["preview", scene.id, input]);
      return { before: null, after: input.data, warnings: [] };
    }, async apply(_scene, input, options) {
      calls.push(["apply", input, options]);
      return { transactionId: "tx", type: input.type };
    }
  } } };
  setup(api);
  const { root, content } = rootFor({ "scene-edit-mode": "create", "scene-edit-type": "Wall",
    "scene-edit-json": '{"c":[0,0,100,0]}', "scene-edit-preset": "" });
  const state = {};
  await executeJarvisConsoleAction("scene-edit-apply", root, state);
  assert.equal(calls.some(call => call[0] === "apply"), false);
  assert.match(content.textContent, /c/);
  await executeJarvisConsoleAction("scene-edit-apply", root, state);
  assert.equal(calls.filter(call => call[0] === "apply").length, 1);
  assert.equal(calls.at(-1)[2].confirmed, true);
});

test("map editor loads editable fields from an existing wall without copying its ID", async () => {
  setup({});
  canvas.scene.walls = [{ id: "wall-1", c: [0, 0, 100, 0],
    toObject: () => ({ _id: "wall-1", c: [0, 0, 100, 0], door: 0, flags: { secret: true } }) }];
  const { root, fields } = rootFor({ "scene-edit-type": "Wall", "scene-edit-id": "wall-1",
    "scene-edit-json": "", "scene-edit-mode": "create" });
  await executeJarvisConsoleAction("scene-edit-load", root);
  assert.deepEqual(JSON.parse(fields["scene-edit-json"].value), { c: [0, 0, 100, 0], door: 0 });
  assert.equal(fields["scene-edit-mode"].value, "update");
});

test("managed macro UI runs a visible entry and blocks player administration", async () => {
  const entry = { id: "macro-1", name: "Abrir ficha", category: "personagens" };
  const api = { macros: { list: () => [entry], execute: async id => ({ executed: id }),
    create: async () => { throw new Error("should not create"); } } };
  setup(api, { gm: false });
  const { root, content } = rootFor({ "managed-macro": "macro-1" });
  await executeJarvisConsoleAction("managed-macro-run", root);
  assert.match(content.textContent, /macro-1/);
  await assert.rejects(executeJarvisConsoleAction("managed-macro-create", root), /Mestre/);
});

test("removing a favorite macro immediately clears its dashboard shortcut", async () => {
  const rows = [{ id: "macro-1", name: "Antiga", category: "geral" }];
  const api = { macros: { list: () => rows, favorites: () => ["macro-1"],
    async remove(id) { rows.splice(rows.findIndex(row => row.id === id), 1); return { id }; } } };
  setup(api);
  const { root, fields } = rootFor({ "managed-macro": "macro-1" });
  const favoriteHost = { innerHTML: '<button data-jarvis-macro-run="macro-1">Antiga</button>' };
  const originalQuery = root.querySelector;
  root.querySelector = selector => selector === "[data-jarvis-macro-favorites]"
    ? favoriteHost : originalQuery(selector);
  await executeJarvisConsoleAction("managed-macro-remove", root);
  assert.equal(rows.length, 0);
  assert.match(favoriteHost.innerHTML, /Nenhuma macro favorita/);
  assert.equal(fields["managed-macro"].value, "");
});

test("player area reports only Items of an accessible selected Actor", async () => {
  const actor = { id: "owned", name: "Lia", system: { attributes: { hp: { value: 9, max: 12 } } },
    items: [{ id: "item", name: "Arco", type: "weapon", system: { uses: { max: 2 } } }],
    testUserPermission: () => true };
  setup({}, { gm: false, actors: [actor] });
  const { root, content } = rootFor({ "jarvis-actor": "owned" });
  await executeJarvisConsoleAction("player-overview", root);
  assert.match(content.textContent, /Arco/);
  assert.match(content.textContent, /"value": 9/);
});

test("Activity approval requires the GM to inspect its automation first", async () => {
  const calls = [];
  const activity = { id: "act", uuid: "Actor.a.Item.i.Activity.act", name: "Ritual",
    flags: { "fora-do-abismo-foundry": { automation: { pre: "return true;" } } } };
  const item = { id: "item", name: "Relíquia", system: { activities: new Map([["act", activity]]) },
    effects: [], uuid: "Actor.a.Item.i" };
  const actor = { id: "a", name: "Mago", items: new Map([["item", item]]),
    testUserPermission: () => true };
  const api = { automation: {
    inspect: () => ({ approved: false }),
    async approve() { calls.push("approve"); return { approved: true }; }
  } };
  setup(api, { actors: [actor] });
  const { root, content } = rootFor({ "jarvis-actor": "a", "automation-item": "item",
    "automation-activity": "act" });
  const state = {};
  await executeJarvisConsoleAction("automation-approve", root, state);
  assert.deepEqual(calls, []);
  assert.match(content.textContent, /return true/);
  await executeJarvisConsoleAction("automation-approve", root, state);
  assert.deepEqual(calls, ["approve"]);
});
