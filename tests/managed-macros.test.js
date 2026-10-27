import test from "node:test";
import assert from "node:assert/strict";

import {
  createManagedMacro, duplicateManagedMacro, executeManagedMacro,
  importManagedMacros, installManagedMacroHotbar, listManagedMacros,
  managedMacroHistory, previewManagedMacroImport, registerManagedMacros,
  removeManagedMacro, updateManagedMacro
} from "../scripts/macros/managed-macros.js";

function setup() {
  const settings = new Map();
  const flags = new Map();
  const gm = { id: "gm", isGM: true, role: 4,
    getFlag: (_m, key) => flags.get(`gm:${key}`),
    async setFlag(_m, key, value) { flags.set(`gm:${key}`, structuredClone(value)); },
    async assignHotbarMacro() {} };
  const player = { id: "player", isGM: false, role: 1,
    getFlag: (_m, key) => flags.get(`player:${key}`),
    async setFlag(_m, key, value) { flags.set(`player:${key}`, structuredClone(value)); },
    async assignHotbarMacro() {} };
  const actor = { id: "actor", name: "Herói", sheet: { render() {} },
    testUserPermission: user => user.id === "player" };
  const moduleApi = { ui: { open() {} }, scenes: { audit: () => ({ ok: true }) },
    diagnostics: { run: async () => ({ ok: true }) } };
  globalThis.game = {
    user: gm, users: { activeGM: gm },
    settings: {
      register(_m, key, definition) { settings.set(key, definition.default); },
      get(_m, key) { return settings.get(key); },
      async set(_m, key, value) { settings.set(key, structuredClone(value)); }
    },
    actors: { get: id => id === "actor" ? actor : null },
    packs: { get: () => null }, scenes: { get: () => null }, macros: [],
    modules: new Map([["fora-do-abismo-foundry", { api: moduleApi }]])
  };
  globalThis.CONST = { USER_ROLES: { TRUSTED: 2 } };
  registerManagedMacros();
  return { gm, player, settings };
}

test("managed macros execute only registered commands and respect player visibility", async () => {
  const { player } = setup();
  const shared = await createManagedMacro({ name: "Abrir herói", command: "open-actor",
    params: { actorId: "actor" }, visibility: "all" });
  const privateMacro = await createManagedMacro({ name: "Diagnóstico", command: "run-diagnostics" });
  game.user = player;
  assert.deepEqual(listManagedMacros().map(row => row.id), [shared.id]);
  assert.equal((await executeManagedMacro(shared.id)).opened, "actor");
  await assert.rejects(executeManagedMacro(privateMacro.id), /não disponível/);
  assert.equal(managedMacroHistory()[0].ok, true);
  assert.throws(() => createManagedMacro({ name: "Injeção", command: "open-actor",
    params: { actorId: "actor" }, script: "globalThis.hacked=true" }), /sem JavaScript/);
});

test("macro import validates declarative descriptors before changing the library", async () => {
  setup();
  assert.throws(() => previewManagedMacroImport([{ name: "Ataque", command: "eval", code: "x" }]), /sem JavaScript/);
  assert.equal(listManagedMacros().length, 0);
  const preview = previewManagedMacroImport([{ name: "Central", command: "open-console", visibility: "all" }]);
  assert.equal(preview.count, 1);
  await importManagedMacros([{ name: "Central", command: "open-console", visibility: "all" }]);
  assert.equal(listManagedMacros().length, 1);
});

test("GM can edit, duplicate and remove entries; secondary GM cannot write", async () => {
  const { gm } = setup();
  const created = await createManagedMacro({ name: "Central", command: "open-console" });
  const changed = await updateManagedMacro(created.id, { name: "Central nova", command: "open-console" });
  assert.equal(changed.id, created.id);
  const copy = await duplicateManagedMacro(created.id);
  assert.notEqual(copy.id, created.id);
  await removeManagedMacro(copy.id);
  assert.equal(listManagedMacros().length, 1);
  game.user = { ...gm, id: "gm-2" };
  assert.throws(() => createManagedMacro({ name: "Outra", command: "open-console" }), /Mestre ativo/);
});

test("hotbar wrapper contains only fixed Jarvis dispatcher and a managed ID", async () => {
  setup();
  const entry = await createManagedMacro({ name: "Central", command: "open-console" });
  let native;
  globalThis.Macro = { async create(data) { native = { ...data, id: "native" }; return native; } };
  const result = await installManagedMacroHotbar(entry.id, 2);
  assert.equal(result.slot, 2);
  assert.match(native.command, /api\?\.macros\?\.execute/);
  assert.doesNotMatch(native.command, /Function|eval/);
});

test("an Item macro rechecks document permission when a player executes it", async () => {
  const { player } = setup();
  const item = { id: "item", name: "Relíquia", sheet: { render() {} },
    testUserPermission: user => user.id === "player" };
  game.items = { get: id => id === "item" ? item : null };
  const entry = await createManagedMacro({ name: "Relíquia", command: "open-item",
    visibility: "all", params: { itemId: "item" } });
  game.user = player;
  assert.equal((await executeManagedMacro(entry.id)).opened, "item");
  item.testUserPermission = () => false;
  await assert.rejects(executeManagedMacro(entry.id), /não acessível/);
});
