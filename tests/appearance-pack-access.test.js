import test from "node:test";
import assert from "node:assert/strict";

import { installAppearancePack, installLocalAppearance } from "../scripts/integrations/appearance-pack.js";

function setup({ owner = true } = {}) {
  const writes = [];
  const actor = {
    id: "actor-1", name: "Heroína", documentName: "Actor", isOwner: !owner,
    testUserPermission(user, level) { return user.id === "player" && level === "OWNER" && owner; },
    getFlag() { return {}; },
    async setFlag(scope, key, value) { writes.push([scope, key, value]); }
  };
  globalThis.game = {
    user: { id: "player", isGM: false },
    modules: new Map([["visage", { active: true }]]),
    actors: { get: id => id === actor.id ? actor : null, getName: () => null }
  };
  globalThis.foundry = { utils: { deepClone: structuredClone, randomID: () => "TestAppearance01" } };
  globalThis.Hooks = { callAll() {} };
  globalThis.ui = { notifications: { info() {}, warn() {} } };
  globalThis.canvas = { tokens: { controlled: [] } };
  return { actor, writes };
}

test("appearance pack uses user-specific OWNER permission instead of actor.isOwner", async () => {
  const { actor, writes } = setup({ owner: false });
  await assert.rejects(installLocalAppearance(actor, { label: "Máscara" }, {
    registerProfile: false
  }), /sem permissão/);
  assert.deepEqual(writes, []);

  const owned = setup({ owner: true });
  const installed = await installLocalAppearance(owned.actor, { label: "Máscara" }, {
    registerProfile: false
  });
  assert.equal(installed.label, "Máscara");
  assert.equal(owned.writes.length, 1);
});

test("appearance pack rejects malformed later entries before writing a partial pack", async () => {
  const { actor, writes } = setup();
  await assert.rejects(installAppearancePack(actor, { profiles: [
    { label: "Válida" },
    { label: "Inválida", effects: [{ type: "visual" }] }
  ] }, { registerProfiles: false }), /path do efeito visual ausente/);
  assert.deepEqual(writes, []);
});
