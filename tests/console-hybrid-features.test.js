import test from "node:test";
import assert from "node:assert/strict";

import { buildBuckets, inferActivationGroup } from "../scripts/ui/hybrid-features.js";

test("hybrid feature grouping reads Activity collections by value", () => {
  assert.equal(inferActivationGroup({ system: { activities: new Map([
    ["one", { activation: { type: "action" } }]
  ]) } }), "action");
  assert.equal(inferActivationGroup({ system: { activities: new Map([
    ["one", { activation: { type: "reaction" } }]
  ]) } }), "reaction");
  assert.equal(inferActivationGroup({ system: { activities: new Map([
    ["one", { name: "Atividade sem ativação" }]
  ]) } }), "other", "an Activity without an activation is not a reaction");
  assert.equal(inferActivationGroup({ system: { activities: [] } }), "passive");
});

test("resource features without an explicit origin appear before active feats", () => {
  const resource = { id: "resource", type: "feat", name: "Fôlego", sort: 1,
    system: { activities: [] }, getFlag: () => ({ resource: true }) };
  const action = { id: "action", type: "feat", name: "Golpe", sort: 2,
    system: { activities: new Map([["hit", { activation: { type: "action" } }]]) },
    getFlag: () => ({ origin: "monk" }) };
  const actor = { items: new Map([[resource.id, resource], [action.id, action]]) };
  const rows = [{ dataset: { itemId: action.id } }, { dataset: { itemId: resource.id } }];
  assert.deepEqual(buildBuckets(actor, rows).map(bucket => bucket.key),
    ["resources:resource", "monk:action"]);
});
