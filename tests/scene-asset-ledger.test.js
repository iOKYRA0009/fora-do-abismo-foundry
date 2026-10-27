import test from "node:test";
import assert from "node:assert/strict";

import {
  beginSceneAssetUpload,
  inspectSceneAssetLedger,
  listSceneAssetLedger,
  registerSceneAssetLedger,
  updateSceneAssetUpload
} from "../scripts/scenes/package/asset-ledger.js";

function setup({ initialSetting } = {}) {
  const values = new Map();
  const definitions = new Map();
  const journals = new Map();
  let nextJournal = 0;
  if (initialSetting !== undefined) values.set("sceneAssetLedger", structuredClone(initialSetting));
  const createJournal = async data => {
    const journal = {
      id: `journal-${++nextJournal}`,
      ownership: structuredClone(data.ownership),
      flags: structuredClone(data.flags),
      getFlag(module, key) { return this.flags[module]?.[key]; },
      async setFlag(module, key, value) {
        this.flags[module] ??= {};
        this.flags[module][key] = structuredClone(value);
      },
      async delete() { journals.delete(this.id); }
    };
    journals.set(journal.id, journal);
    return journal;
  };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 } };
  globalThis.JournalEntry = { implementation: { create: createJournal } };
  globalThis.game = {
    user: { id: "gm", isGM: true },
    users: { activeGM: { id: "gm" } },
    scenes: [],
    journal: journals,
    settings: {
      register(_module, key, definition) {
        definitions.set(key, definition);
        if (!values.has(key)) values.set(key, definition.default);
      },
      get(_module, key) { return values.get(key); },
      async set(_module, key, value) { values.set(key, structuredClone(value)); },
      storage: { get(scope) {
        assert.equal(scope, "world");
        return { getSetting: key => values.has(key.split(".").slice(1).join("."))
          ? { value: values.get(key.split(".").slice(1).join(".")) } : undefined };
      } }
    }
  };
  registerSceneAssetLedger();
  return { values, definitions, journals, createJournal };
}

test("asset ledger records upload before use and identifies interrupted operations", async () => {
  const { values, definitions, journals } = setup();
  const record = await beginSceneAssetUpload({ source: "data", target: "worlds/test/maps", fileName: "map.webp" });
  const journalId = values.get("sceneAssetLedger");
  assert.equal(typeof journalId, "string");
  assert.equal(JSON.stringify(journalId).includes(record.path), false,
    "the world setting contains only a Journal ID, never an upload path");
  assert.equal(journals.get(journalId).ownership.default, 0);
  assert.equal(definitions.get("sceneAssetLedger").restricted, true);
  assert.equal(definitions.get("sceneAssetLedger").type, String);
  assert.equal(listSceneAssetLedger()[0].status, "pending");
  assert.equal(inspectSceneAssetLedger({ staleAfterMs: 0 })[0].needsReview, true);

  await updateSceneAssetUpload(record.id, { status: "uploaded", path: "worlds/test/maps/map.webp" });
  assert.equal(inspectSceneAssetLedger()[0].needsReview, false);

  game.scenes.push({ id: "scene-1", name: "Mapa", background: { src: record.path } });
  await updateSceneAssetUpload(record.id, { status: "linked", sceneId: "scene-1" });
  assert.deepEqual(inspectSceneAssetLedger()[0].scenes, [{ id: "scene-1", name: "Mapa" }]);
  game.scenes.length = 0;
  assert.equal(inspectSceneAssetLedger()[0].needsReview, true);
});

test("asset ledger serializes concurrent writes without losing uploads", async () => {
  setup();
  await Promise.all(Array.from({ length: 8 }, (_, index) =>
    beginSceneAssetUpload({ source: "data", target: "maps", fileName: `map-${index}.webp` })
  ));
  assert.equal(listSceneAssetLedger().length, 8);
});

test("player and secondary GM cannot read or change asset ledger", async () => {
  setup();
  game.user = { id: "player", isGM: false };
  assert.throws(() => listSceneAssetLedger(), /Mestre ativo/);
  await assert.rejects(beginSceneAssetUpload({ source: "data", target: "maps", fileName: "x.webp" }), /Mestre ativo/);
  game.user = { id: "secondary", isGM: true };
  assert.throws(() => inspectSceneAssetLedger(), /Mestre ativo/);
});

test("failed uploads remain visible for review without automatic deletion", async () => {
  setup();
  const record = await beginSceneAssetUpload({ source: "data", target: "maps", fileName: "maybe.webp" });
  await updateSceneAssetUpload(record.id, { status: "review", reason: "build-failed" });
  const [entry] = inspectSceneAssetLedger();
  assert.equal(entry.needsReview, true);
  assert.equal(entry.reason, "build-failed");
  assert.equal(entry.path, "maps/maybe.webp");
});

test("legacy world-setting records migrate into the private Journal without loss", async () => {
  const legacy = [{ id: "legacy-1", path: "worlds/test/maps/old.webp", status: "review",
    updatedAt: 1 }];
  const { values, journals } = setup({ initialSetting: JSON.stringify(legacy) });
  assert.deepEqual(listSceneAssetLedger(), legacy);
  await beginSceneAssetUpload({ source: "data", target: "maps", fileName: "new.webp" });
  const journalId = values.get("sceneAssetLedger");
  assert.equal(typeof journalId, "string");
  assert.deepEqual(journals.get(journalId).getFlag("fora-do-abismo-foundry", "sceneAssetLedgerPrivate")
    .records[0], legacy[0]);
  assert.equal(listSceneAssetLedger().length, 2);
});

test("interrupted legacy migration reuses its verified Journal on retry", async () => {
  const legacy = [{ id: "legacy-2", path: "maps/keep.webp", status: "review" }];
  const { values, journals } = setup({ initialSetting: legacy });
  const set = game.settings.set;
  game.settings.set = async () => { throw new Error("setting indisponível"); };
  await assert.rejects(beginSceneAssetUpload({ source: "data", target: "maps", fileName: "new.webp" }),
    /setting indisponível/);
  assert.deepEqual(values.get("sceneAssetLedger"), legacy);
  assert.equal(journals.size, 1);
  game.settings.set = set;
  await beginSceneAssetUpload({ source: "data", target: "maps", fileName: "new.webp" });
  assert.equal(journals.size, 1);
  assert.equal(listSceneAssetLedger().length, 2);
});

test("stale setting reconnects an existing private Journal and preserves records", async () => {
  const { values, journals, createJournal } = setup();
  const record = await beginSceneAssetUpload({ source: "data", target: "maps", fileName: "keep.webp" });
  const missingId = values.get("sceneAssetLedger");
  const oldJournal = journals.get(missingId);
  journals.delete(missingId);
  const recovered = await createJournal({ ownership: oldJournal.ownership, flags: oldJournal.flags });
  assert.equal(listSceneAssetLedger()[0].id, record.id);
  await updateSceneAssetUpload(record.id, { status: "uploaded" });
  assert.equal(values.get("sceneAssetLedger"), recovered.id);
  assert.equal(listSceneAssetLedger()[0].status, "uploaded");
});

test("missing private Journal creates a marked recovery ledger and warns the GM", async () => {
  const { values, journals } = setup();
  values.set("sceneAssetLedger", "missing-journal");
  const warnings = [];
  globalThis.ui = { notifications: { warn: message => warnings.push(message) } };
  assert.throws(() => listSceneAssetLedger(), /não foi encontrado/);
  const record = await beginSceneAssetUpload({ source: "data", target: "maps", fileName: "new.webp" });
  const journal = journals.get(values.get("sceneAssetLedger"));
  const privateData = journal.getFlag("fora-do-abismo-foundry", "sceneAssetLedgerPrivate");
  assert.equal(privateData.recoveredFrom, "missing-journal");
  assert.equal(listSceneAssetLedger()[0].id, record.id);
  assert.equal(warnings.length, 1);
});

test("ledger refuses a Journal visible to players", async () => {
  const { values, journals } = setup();
  await beginSceneAssetUpload({ source: "data", target: "maps", fileName: "private.webp" });
  journals.get(values.get("sceneAssetLedger")).ownership.default = 1;
  assert.throws(() => listSceneAssetLedger(), /não é privado/);
  await assert.rejects(beginSceneAssetUpload({ source: "data", target: "maps", fileName: "x.webp" }), /não é privado/);
});
