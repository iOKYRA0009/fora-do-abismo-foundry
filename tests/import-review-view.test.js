import test from "node:test";
import assert from "node:assert/strict";
import { importReviewMarkup } from "../scripts/ui/import-review-view.js";

test("V9 preview keeps severity and escapes imported names", () => {
  const markup = importReviewMarkup({ canImport: false, actor: { name: "<script>", type: "npc" },
    items: [{ name: "Espada", type: "weapon", activities: [{ name: "Golpe", type: "attack" }] }],
    warnings: ["Conflito"], duplicates: { actors: [{ id: "a1", name: "Antigo" }] } });
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /Importação bloqueada/);
  assert.match(markup, /Golpe/);
  assert.match(markup, /Actor existente/);
});
