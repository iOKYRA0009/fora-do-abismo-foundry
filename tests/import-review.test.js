import test from "node:test";
import assert from "node:assert/strict";
import { reviewActorImport, reviewItemImport } from "../scripts/importer/v9/import-review.js";
import { validateJarvisActorPayload } from "../scripts/importer/validators/payload-validator.js";

const payload = { schemaVersion: "9.0", actor: { name: "Sentinela", type: "npc",
  jarvis: { hp: { value: 12, max: 20 }, abilities: { str: 14 } } },
items: [{ name: "Espada", type: "weapon", jarvis: { activities: [
  { type: "attack", name: "Golpe", damage: { parts: ["1d8 + @mod"] } }
] } }], effects: [{ name: "Marca", changes: [] }] };

test("review exposes complete V9 content, differences and blocks an existing Actor before creation", () => {
  const review = reviewActorImport(payload, { actors: [{ id: "old", name: "sentinela", type: "npc",
    system: { attributes: { hp: { value: 4 } }, abilities: { str: { value: 10 } } } }] });
  assert.equal(review.canImport, false);
  assert.equal(review.duplicates.actors[0].id, "old");
  assert.equal(review.actor.hp.value, 12);
  assert.equal(review.items[0].activities[0].name, "Golpe");
  assert.equal(review.effects[0].name, "Marca");
  assert.ok(review.existingComparisons[0].differences.some(row => row.field === "system.attributes.hp.value"));
});

test("Item review catches reimports despite a generated native identifier", () => {
  const actor = { id: "actor", name: "Sentinela", documentName: "Actor", items: [
    { id: "old-item", name: "Espada", type: "weapon", system: { identifier: "espada" } }
  ] };
  const review = reviewItemImport(payload.items, actor);
  assert.equal(review.canImport, false);
  assert.match(review.warnings[0], /Espada/);
});

test("validation locates malformed Activity consumption and recovery", () => {
  const malformed = structuredClone(payload);
  malformed.items[0].jarvis.uses = { spent: -1, recovery: [{ type: "recoverAll" }] };
  malformed.items[0].jarvis.activities[0].consumption = { targets: [null] };
  assert.throws(() => validateJarvisActorPayload(malformed), error =>
    error.details.some(detail => detail.includes("uses.spent"))
    && error.details.some(detail => detail.includes("recovery[0]"))
    && error.details.some(detail => detail.includes("consumption.targets[0]")));
});
