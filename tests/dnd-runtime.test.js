import test from "node:test";
import assert from "node:assert/strict";
import { Dnd5eV6Adapter } from "../scripts/importer/adapters/dnd5e-adapter.js";

test("runtime accepts Foundry 14 with dnd5e 6.0.6 and warns it is not verified", () => {
  const warnings = [];
  globalThis.game = {
    release: { generation: 14 },
    system: { id: "dnd5e", version: "6.0.6" }
  };
  globalThis.ui = { notifications: { warn: message => warnings.push(message) } };
  assert.equal(Dnd5eV6Adapter.assertRuntime().systemVersion, "6.0.6");
  assert.match(warnings[0], /6\.0\.2/);
});

test("runtime refuses future major versions without an adapter review", () => {
  globalThis.game.system.version = "7.0.0";
  assert.throws(() => Dnd5eV6Adapter.assertRuntime(), /não é suportado/);
  globalThis.game.release.generation = 15;
  assert.throws(() => Dnd5eV6Adapter.assertRuntime(), /Foundry V15/);
});
