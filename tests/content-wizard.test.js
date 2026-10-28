import test from "node:test";
import assert from "node:assert/strict";

import { createContent, previewContent, contentTemplates } from "../scripts/content/content-wizard.js";

function setup({ effectFailure = false, rollbackFailure = false } = {}) {
  const created = [];
  const deleted = [];
  const errors = [];
  const document = data => ({ ...data, id: `created-${created.length + 1}`,
    sheet: { render() {} },
    async createEmbeddedDocuments(type, entries) {
      assert.equal(type, "ActiveEffect");
      return effectFailure ? [] : entries.map(entry => ({ ...entry, id: "effect-1" }));
    },
    async setFlag(_module, key, value) { this.flags ??= {}; this.flags[key] = value; },
    async delete() {
      if (rollbackFailure) throw new Error("exclusão falhou");
      deleted.push(this.id);
    }
  });
  globalThis.game = {
    user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } },
    release: { generation: 14 }, system: { id: "dnd5e", version: "6.0.2" },
    documentTypes: { Item: ["feat", "class", "subclass", "spell", "equipment"] },
    actors: { get: () => null }
  };
  globalThis.CONFIG = { DND5E: {} };
  globalThis.foundry = { utils: { deepClone: structuredClone, randomID: () => "TestActivity0001" } };
  globalThis.ui = { notifications: { warn() {}, error(message) { errors.push(message); } } };
  globalThis.Item = { async create(data) { const item = document(data); created.push(item); return item; } };
  globalThis.Actor = { async create(data) { const actor = document(data); created.push(actor); return actor; } };
  return { created, deleted, errors };
}

test("simple wizard creates a native homebrew Item with escaped description and uses", async () => {
  const fixture = setup();
  const spec = { kind: "item", mode: "simple", name: "Lâmina", type: "feat",
    description: "<script>não</script>", usesMax: 3 };
  const preview = previewContent(spec);
  assert.equal(preview.type, "feat");
  const result = await createContent(spec, { openSheet: false });
  assert.equal(fixture.created.length, 1);
  assert.equal(result.document.system.uses.max, "3");
  assert.match(result.document.system.description.value, /&lt;script&gt;/);
  assert.equal(result.document.flags["fora-do-abismo-foundry"].provenanceInput.kind, "homebrew");
  assert.equal(contentTemplates().some(entry => entry.key === "class"), true);
});

test("advanced class preserves native Activity, Effect and progression metadata", async () => {
  setup();
  const result = await createContent({ kind: "item", mode: "advanced", name: "Guardião", type: "class",
    data: { jarvis: { hitDie: "d8", activities: [{ _id: "TestActivity0001", type: "utility", name: "Vigília" }] } },
    effects: [{ name: "Proteção", changes: [] }],
    progression: [{ id: "lvl2", level: 2, grants: [] }] }, { openSheet: false });
  assert.equal(result.document.system.hd.denomination, "d8");
  assert.ok(result.document.system.activities.TestActivity0001);
  assert.equal(result.document.flags.progression.length, 1);
  assert.equal(result.preview.effects, 1);
});

test("failed embedded Effect creation rolls back only the new Item", async () => {
  const fixture = setup({ effectFailure: true });
  await assert.rejects(createContent({ kind: "item", name: "Talento", type: "feat",
    effects: [{ name: "Efeito" }] }), /incompletos/);
  assert.deepEqual(fixture.deleted, [fixture.created[0].id]);
});

test("failed rollback reports the incomplete document and both causes", async () => {
  const fixture = setup({ effectFailure: true, rollbackFailure: true });
  const previousError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(createContent({ kind: "item", name: "Talento incompleto", type: "feat",
      effects: [{ name: "Efeito" }] }, { openSheet: false }), error => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.errors[0].message, /incompletos/);
      assert.match(error.errors[1].message, /exclusão falhou/);
      assert.match(error.message, /Revise a ficha/);
      return true;
    });
  } finally {
    console.error = previousError;
  }
  assert.equal(fixture.created.length, 1);
  assert.deepEqual(fixture.deleted, []);
  assert.match(fixture.errors[0], /Talento incompleto/);
});

test("wizard rejects player mutations and class progression on unrelated Items", async () => {
  setup();
  assert.throws(() => previewContent({ kind: "item", name: "Erro", type: "feat",
    progression: [{ level: 2, grants: [] }] }), /só pode/);
  game.user = { id: "player", isGM: false };
  await assert.rejects(createContent({ kind: "item", name: "Injeção", type: "feat" }), /Mestre ativo/);
});

test("simple character wizard maps six abilities, HP and AC through the V9 adapter", async () => {
  setup();
  const spec = { kind: "actor", mode: "simple", name: "Sentinela", type: "npc",
    hp: 30, ac: 16, abilities: { str: 14, dex: 12, con: 13, int: 10, wis: 11, cha: 8 },
    biography: "<script>segredo</script>" };
  const preview = previewContent(spec);
  assert.equal(preview.actor.hp.max, 30);
  const { document } = await createContent(spec, { openSheet: false });
  assert.equal(document.system.abilities.str.value, 14);
  assert.equal(document.system.attributes.ac.override, 16);
  assert.match(document.system.details.biography.value, /&lt;script&gt;/);
});
