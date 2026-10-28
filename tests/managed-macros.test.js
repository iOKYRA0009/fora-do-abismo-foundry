import test from "node:test";
import assert from "node:assert/strict";

import {
  createManagedMacro, duplicateManagedMacro, executeManagedMacro,
  importManagedMacros, installManagedMacroHotbar, listManagedMacros,
  managedMacroFavorites, managedMacroHistory, previewManagedMacroImport,
  registerManagedMacros, removeManagedMacro, toggleManagedMacroFavorite,
  updateManagedMacro
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
  let opened = 0;
  game.modules.get("fora-do-abismo-foundry").api.ui.open = () => { opened += 1; };
  game.modules.get("fora-do-abismo-foundry").api.macros = { execute: executeManagedMacro };
  const dispatch = new Function("game", `return ${native.command}`);
  assert.deepEqual(await dispatch(game), { opened: "console" });
  assert.equal(opened, 1);
});

test("hotbar reuses a native Macro from a Foundry Collection", async () => {
  setup();
  const entry = await createManagedMacro({ name: "Central", command: "open-console" });
  const command = `game.modules.get("fora-do-abismo-foundry")?.api?.macros?.execute(${JSON.stringify(entry.id)})`;
  game.macros = new Map([["existing", { id: "existing", type: "script", command }]]);
  globalThis.Macro = { async create() { throw new Error("duplicate Macro"); } };
  assert.equal((await installManagedMacroHotbar(entry.id, 3)).nativeMacroId, "existing");
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

test("an Item macro never falls back to an unrelated world Item when its Actor is gone", async () => {
  setup();
  const worldItem = { id: "same-id", name: "Outro Item", sheet: { render() { throw new Error("wrong Item"); } } };
  game.items = { get: id => id === "same-id" ? worldItem : null };
  const entry = await createManagedMacro({ name: "Item da ficha", command: "open-item",
    params: { actorId: "deleted-actor", itemId: "same-id" } });
  await assert.rejects(executeManagedMacro(entry.id), /Personagem da macro não encontrado/);
  assert.equal(managedMacroHistory()[0].ok, false);
});

test("a rejected sheet render is reported as a failed macro execution", async () => {
  setup();
  game.actors.get("actor").sheet.render = async () => { throw new Error("Falha ao abrir ficha"); };
  const entry = await createManagedMacro({ name: "Abrir ficha", command: "open-actor",
    params: { actorId: "actor" } });
  await assert.rejects(executeManagedMacro(entry.id), /Falha ao abrir ficha/);
  assert.equal(managedMacroHistory()[0].ok, false);
});

test("simultaneous macro favorites and executions preserve every user flag update", async () => {
  setup();
  const first = await createManagedMacro({ name: "Primeira", command: "open-console" });
  const second = await createManagedMacro({ name: "Segunda", command: "open-console" });
  await Promise.all([toggleManagedMacroFavorite(first.id), toggleManagedMacroFavorite(second.id)]);
  assert.deepEqual(managedMacroFavorites(), [second.id, first.id]);
  await Promise.all([executeManagedMacro(first.id), executeManagedMacro(second.id)]);
  assert.deepEqual(managedMacroHistory().map(row => row.id), [second.id, first.id]);
});
