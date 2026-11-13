import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { autoInstallThirdThroneV3 } from "../scripts/automation/third-throne-auto-installer.js";

const MODULE = "fora-do-abismo-foundry";
const IDS = ["MxWry5bSpDdH36Z7", "ueUfr5JrOEjLPi2V", "mzoiuTGUwk2zUbHy", "K1VakgpDkbmyE2Cf"];
function setPath(object, path, value) {
  const parts = path.split(".");
  let current = object;
  for (const part of parts.slice(0, -1)) current = current[part] ??= {};
  current[parts.at(-1)] = value;
}
function makeActor(id, name, type, oldItemName) {
  const flags = {};
  const actor = {
    id, name, type, ownership: {}, folder: null,
    system: { details: { biography: { value: "<h2>História</h2><h3>Habilidade</h3>" } },
      traits: { dv: { value: [] } }, resources: { primary: { value: 50 }, secondary: { value: 50 } } },
    items: [], getFlag: (scope, key) => flags[key],
    setFlag: async (scope, key, value) => { flags[key] = structuredClone(value); },
    unsetFlag: async (scope, key) => { delete flags[key]; },
    update: async changes => { for (const [path, value] of Object.entries(changes)) setPath(actor, path, value); },
    createEmbeddedDocuments: async (type, entries) => {
      const created = entries.map(entry => ({ ...entry, id: `item-${actor.items.length + 1}`,
        update: async changes => { for (const [path, value] of Object.entries(changes)) setPath(created[0], path, value); } }));
      actor.items.push(...created);
      return created;
    }
  };
  if (oldItemName) {
    const itemFlags = {};
    actor.items.push({ name: oldItemName, system: { identifier: "old", description: { value: "Original" }, activities: [] },
      getFlag: (scope, key) => itemFlags[key],
      setFlag: async (scope, key, value) => { itemFlags[key] = structuredClone(value); },
      update: async changes => { for (const [path, value] of Object.entries(changes)) setPath(actor.items[0], path, value); } });
  }
  return actor;
}

test("Jarvis installer organizes four existing sheets and keeps summon ownership temporary", async () => {
  const actors = [
    makeActor(IDS[0], "Jack", "character", "O Terceiro Trono — Regente dos Inexistentes"),
    makeActor(IDS[1], "Oswin", "npc", "Laço do Impossível"),
    makeActor(IDS[2], "Procissão", "npc", "Presságio da Morte"),
    makeActor(IDS[3], "Bram", "npc", "Muralha dos Ausentes")
  ];
  const byId = Object.fromEntries(actors.map(actor => [actor.id, actor]));
  const gm = { id: "gm", name: "Mestre", isGM: true };
  const ruan = { id: "ruan", name: "Ruan", isGM: false };
  const folders = [];
  globalThis.Folder = { create: async data => {
    const folder = { ...data, id: "folder" };
    folders.push(folder);
    return folder;
  } };
  globalThis.game = { user: gm, users: { activeGM: gm, contents: [gm, ruan] },
    actors: { get: id => byId[id] }, folders: { contents: folders },
    modules: new Map([[MODULE, { api: { thirdThrone: { command() {}, remoteStatus: () => ({ ready: true }) } } }],
      ["socketlib", { active: true }]]) };
  globalThis.ui = { notifications: { info() {} } };
  const source = await readFile(new URL("../examples/JARVIS_TERCEIRO_TRONO_V3_INSTALAR.js", import.meta.url), "utf8");
  globalThis.fetch = async () => ({ ok: true, text: async () => source });
  const autoResult = await autoInstallThirdThroneV3();
  assert.equal(autoResult.installed, true);
  const result = autoResult.result;
  assert.equal(result.player, "Ruan");
  assert.equal(actors[0].getFlag(MODULE, "thirdThroneV3").fieldExcessCost, 10);
  assert.equal(actors[0].ownership.ruan, 3);
  assert.equal(actors[1].ownership.ruan, undefined);
  assert.deepEqual(actors.slice(1).map(actor => actor.system.traits.dv.value), [["radiant"], ["radiant"], ["radiant"]]);
  assert.equal(actors[0].items.filter(item => item.name.startsWith("Terceiro Trono V3")).length, 2);
  assert.equal(actors[1].items.some(item => item.system.identifier === "terceiro-trono-v3-enforcado"), true);
  assert.equal(actors[2].items.some(item => item.system.identifier === "terceiro-trono-v3-procissao"), true);
  assert.equal(actors[3].items.some(item => item.system.identifier === "terceiro-trono-v3-sentinela"), true);
  for (const actor of actors) for (const item of actor.items) {
    if (!item.system.identifier?.startsWith("terceiro-trono-v3-")) continue;
    for (const id of Object.keys(item.system.activities)) assert.match(id, /^[A-Za-z0-9]{16}$/);
  }
  assert.deepEqual(await autoInstallThirdThroneV3(), { skipped: "already-installed" });
});
