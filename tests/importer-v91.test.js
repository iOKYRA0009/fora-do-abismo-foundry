import test from "node:test";
import assert from "node:assert/strict";
import { compileActorBlueprintV91 } from "../scripts/importer/v9/blueprint-v91.js";
import { inspectActorMechanics, verifyPersistedActivities } from "../scripts/importer/v9/mechanics-review.js";
import { Dnd5eV6Adapter } from "../scripts/importer/adapters/dnd5e-adapter.js";
import { importJarvisActorWithImage } from "../scripts/ui/actor-import-with-image.js";
import { previewActivityChatRepair, repairActivityChatDescriptions } from "../scripts/importer/v9/activity-chat-privacy.js";
import { JarvisImporterV9 } from "../scripts/importer/v9/jarvis-importer-v9.js";

globalThis.foundry = { utils: { deepClone: structuredClone, randomID: () => "abcdefghijklmnop" } };
globalThis.CONFIG = { DND5E: { abilities: { str: {}, dex: {}, con: {}, int: {}, wis: {}, cha: {} } } };
globalThis.game = { user: { isGM: true }, system: { id: "dnd5e", version: "6.0.6" }, release: { generation: 14 } };

const blueprint = {
  schemaVersion: "9.1", actor: { name: "Guardião", type: "npc", jarvis: { abilities: { str: 16, dex: 12, con: 14 }, hp: { value: 50, max: 50 }, ac: 16 } },
  actions: [
    { name: "Machado", kind: "attack", toHit: 7, damage: { formula: "1d8+4", type: "slashing" }, description: "Golpe de machado." },
    { name: "Sopro", kind: "save", ability: "dex", dc: 14, damage: { formula: "2d6", type: "fire" }, onSave: "half" },
    { name: "Escapar", kind: "check", ability: "con", dc: 14 }
  ],
  scenarios: [
    { action: "Machado", kind: "attack", d20: 9, targetAC: 16, expected: "hit" },
    { action: "Sopro", kind: "save", d20: 11, modifier: 2, expected: "failure" },
    { action: "Escapar", kind: "check", d20: 12, modifier: 2, expected: "success" }
  ]
};

test("V9.1 compiles attacks, Dex DC 14 saves and checks to native D&D5e activities", () => {
  const payload = compileActorBlueprintV91(blueprint);
  const adapted = Dnd5eV6Adapter.adaptItems(payload.items);
  const [attack, save, check] = adapted.map(item => Object.values(item.system.activities)[0]);
  assert.deepEqual([attack.type, save.type, check.type], ["attack", "save", "check"]);
  assert.equal(attack.attack.flat, true);
  assert.equal(attack.attack.bonus, "7");
  assert.equal(attack.damage.parts[0].custom.formula, "1d8+4");
  assert.deepEqual(save.save.ability, ["dex"]);
  assert.equal(save.save.dc.formula, "14");
  assert.equal(save.damage.onSave, "half");
  assert.equal(check.check.ability, "con");
  assert.equal(check.check.dc.formula, "14");
  assert.equal(attack.description.value, "Golpe de machado.");
  assert.equal(inspectActorMechanics(payload).passed, true);
  assert.deepEqual(inspectActorMechanics(payload).checks.map(row => row.outcome), ["hit", "failure", "success"]);
  assert.equal(compileActorBlueprintV91(blueprint).items[0].jarvis.activities[0]._id, payload.items[0].jarvis.activities[0]._id);
});

test("a wrong mechanical example blocks the V9.1 package before import", () => {
  const bad = structuredClone(blueprint);
  bad.scenarios[0].expected = "miss";
  const result = inspectActorMechanics(compileActorBlueprintV91(bad));
  assert.equal(result.passed, false);
  assert.match(result.errors[0], /calculado 'hit'/);
});

test("V9.1 refuses ambiguous NPC attacks and malformed ability scores", () => {
  const noHit = structuredClone(blueprint);
  delete noHit.actions[0].toHit;
  assert.throws(() => compileActorBlueprintV91(noHit), /NPC precisa de toHit fixo/);
  const score = structuredClone(blueprint);
  score.actor.jarvis.abilities.dex = "muito";
  assert.throws(() => compileActorBlueprintV91(score), /abilities.dex deve ser inteiro/);
});

test("post-import audit reads Foundry activity collections as well as raw objects", () => {
  const expectedActivity = { type: "save", save: { ability: ["dex"], dc: { formula: "14" } } };
  const expected = [{ name: "Sopro", system: { activities: { abc: expectedActivity } } }];
  const actual = [{ system: { activities: new Map([["abc", expectedActivity]]) } }];
  assert.deepEqual(verifyPersistedActivities(expected, actual), []);
});

test("portrait and token upload remain independent in one import", async () => {
  const paths = [];
  const picker = { browse: async () => ({}), createDirectory: async () => ({}),
    upload: async (_source, directory, file) => { const path = `${directory}/${file.name}`; paths.push(path); return { path }; } };
  let received;
  const importer = { importActor: async payload => { received = payload; return payload.actor; } };
  const portrait = new File(["portrait"], "portrait.png", { type: "image/png" });
  const token = new File(["token"], "token.webp", { type: "image/webp" });
  await importJarvisActorWithImage(JSON.stringify(blueprint), { imageFile: portrait, tokenFile: token, importer, picker });
  assert.equal(paths.length, 2);
  assert.notEqual(received.actor.img, received.actor.prototypeToken.texture.src);
  assert.match(received.actor.img, /\.png$/);
  assert.match(received.actor.prototypeToken.texture.src, /\.webp$/);
});

test("chat repair changes only Jarvis Activities without their own private text", async () => {
  const updates = [];
  const item = { id: "item1", name: "Alvorada", flags: { "fora-do-abismo-foundry": { adapter: "dnd5e-6.0" } },
    system: { description: { value: "Segredos de todas as habilidades" }, activities: {
      id1: { name: "Ratos", type: "utility", description: { value: "" } },
      id2: { name: "Luz", type: "utility", description: { value: "Apenas Luz" } }
    } }, update: async data => updates.push(data) };
  const other = { id: "item2", flags: {}, system: { activities: { id3: { name: "Outro", description: { value: "" } } } } };
  const actor = { documentName: "Actor", name: "Nicolau", items: [item, other] };
  const preview = previewActivityChatRepair(actor);
  assert.equal(preview.fixes.length, 1);
  await repairActivityChatDescriptions(actor);
  assert.deepEqual(updates, [{ "system.activities.id1.description.value": "<p>Ratos</p>" }]);
});

test("class grants become native ItemGrant advancements with compendium UUIDs", () => {
  const item = Dnd5eV6Adapter.adaptItem({ name: "Classe Teste", type: "class", jarvis: {
    grants: [{ level: 3, uuids: ["Compendium.dnd5e.classfeatures.3sYPftQKnbbVnHrh"] }]
  } });
  assert.equal(item.system.advancement[0].type, "ItemGrant");
  assert.equal(item.system.advancement[0].level, 3);
  assert.equal(item.system.advancement[0].configuration.items[0].uuid, "Compendium.dnd5e.classfeatures.3sYPftQKnbbVnHrh");
});

test("V9.1 creates native Heal and Teleport activities and isolates shared item text", () => {
  const payload = compileActorBlueprintV91({ schemaVersion: "9.1", actor: { name: "Curandeiro", type: "npc" }, actions: [
    { name: "Curar", kind: "heal", healing: "1d8+3" },
    { name: "Passo dos ratos", kind: "teleport", distance: 30 }
  ] });
  const [heal, teleport] = Dnd5eV6Adapter.adaptItems(payload.items).map(item => Object.values(item.system.activities)[0]);
  assert.equal(heal.type, "heal");
  assert.equal(heal.healing.custom.formula, "1d8+3");
  assert.equal(teleport.type, "teleport");
  assert.equal(teleport.teleport.value, "30");

  const shared = "Todas as habilidades secretas da Alvorada";
  const item = Dnd5eV6Adapter.adaptItem({ name: "Alvorada", type: "feat", system: {
    description: { value: shared }, activities: {
      one: { _id: "one", type: "utility", name: "Ratos", description: { value: shared } },
      two: { _id: "two", type: "utility", name: "Luz", description: { value: "" } }
    }
  } });
  assert.equal(item.system.activities.one.description.value, "<p>Ratos</p>");
  assert.equal(item.system.activities.two.description.value, "<p>Luz</p>");
  assert.equal(item.system.description.value, shared);
});

test("sync updates Jarvis activities, adds new abilities and preserves live HP and spent uses", async () => {
  const oldActivity = { _id: "oldactivity00001", name: "Machado", type: "attack", uses: { spent: 2, max: "3" } };
  const oldItem = { id: "old-item", name: "Machado", type: "weapon",
    flags: { "fora-do-abismo-foundry": { adapter: "dnd5e-6.0" } },
    system: { activities: { oldactivity00001: oldActivity } },
    toObject() { return { system: structuredClone(this.system) }; },
    async update(changes) { this.system.activities = structuredClone(changes["system.activities"]); } };
  const actor = { id: "actor1", name: "Guardião", type: "npc", documentName: "Actor",
    system: { attributes: { hp: { value: 17, max: 50 } } }, items: [oldItem],
    async createEmbeddedDocuments(_type, data) {
      const created = data.map((entry, index) => ({ ...entry, id: `new-${index}`,
        toObject() { return structuredClone({ system: this.system }); } }));
      this.items.push(...created);
      return created;
    },
    async updateEmbeddedDocuments() {}, async update() {}, async deleteEmbeddedDocuments() {} };
  const importer = new JarvisImporterV9();
  const review = importer.previewActorSync(actor, blueprint);
  assert.equal(review.canImport, true);
  assert.equal(review.additions.length, 2);
  assert.equal(review.updates.length, 1);
  const result = await importer.syncActor(actor, blueprint);
  assert.deepEqual(result, { actor: "Guardião", added: 2, updated: 1 });
  assert.equal(actor.system.attributes.hp.value, 17);
  assert.equal(oldItem.system.activities.oldactivity00001.attack.bonus, "7");
  assert.equal(oldItem.system.activities.oldactivity00001.uses.spent, 2);
  assert.equal(actor.items.length, 3);
});
