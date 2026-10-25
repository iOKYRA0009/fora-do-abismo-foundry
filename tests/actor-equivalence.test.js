import test from "node:test";
import assert from "node:assert/strict";
import { compareActorToPayload } from "../scripts/diagnostics/actor-equivalence.js";
import { Dnd5eV6Adapter } from "../scripts/importer/adapters/dnd5e-adapter.js";

globalThis.foundry = { utils: { deepClone: structuredClone } };
globalThis.game = { system: { version: "6.0.6" } };
globalThis.CONFIG = { DND5E: { abilities: { str: {} }, skills: {} } };

const payload = {
  schemaVersion: "9.0", actor: { name: "Sentinela", type: "character",
    jarvis: { hp: { value: 11, max: 15 }, abilities: { str: 14 } } },
  items: []
};

test("actor equivalence finds explicit field changes without modifying Actor", () => {
  const data = Dnd5eV6Adapter.adaptActor(payload.actor);
  const actor = { ...data, id: "actor-test", documentName: "Actor", toObject: () => structuredClone(data) };
  const before = structuredClone(data);
  assert.equal(compareActorToPayload(payload, actor).ok, true);
  data.system.attributes.hp.value = 7;
  const report = compareActorToPayload(payload, actor);
  assert.equal(report.differences[0].path, "system.attributes.hp.value");
  assert.equal(report.differences[0].expected, 11);
  assert.equal(before.system.attributes.hp.value, 11);
});
