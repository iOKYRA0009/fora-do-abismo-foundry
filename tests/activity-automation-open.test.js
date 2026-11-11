import test from "node:test";
import assert from "node:assert/strict";
import { registerActivityAutomation } from "../scripts/automation/activity-automation.js";

const callbacks = new Map();
globalThis.Hooks = { on(name, callback) {
  callbacks.set(name, [...(callbacks.get(name) ?? []), callback]);
} };
globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } } };
globalThis.ui = { notifications: { warn() { throw new Error("Unexpected approval warning"); },
  error(message) { throw new Error(message); } } };
globalThis.canvas = {};
globalThis.foundry = {};
globalThis.Roll = class {};
globalThis.ChatMessage = class {};
globalThis.fromUuid = async () => null;

registerActivityAutomation();
registerActivityAutomation();
const pre = callbacks.get("dnd5e.preUseActivity")[0];
const post = callbacks.get("dnd5e.postUseActivity")[0];

function activity(automation) {
  return { name: "Habilidade", item: { name: "Item", actor: {} },
    flags: { "fora-do-abismo-foundry": { automation } } };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
}

test("GM and player Activities execute without approval or toggle", async () => {
  assert.equal(callbacks.get("dnd5e.preUseActivity").length, 1);
  assert.equal(callbacks.get("dnd5e.postUseActivity").length, 1);
  globalThis.__jarvisCalls = [];
  const scripted = activity({ pre: "globalThis.__jarvisCalls.push('pre');",
    post: "globalThis.__jarvisCalls.push('post');" });
  for (const user of [{ id: "gm", isGM: true }, { id: "player", isGM: false }]) {
    game.user = user;
    assert.equal(pre(scripted, {}), undefined);
    post(scripted, {}, {});
    await settle();
  }
  assert.deepEqual(globalThis.__jarvisCalls, ["pre", "post", "pre", "post"]);
  delete globalThis.__jarvisCalls;
});

test("an Activity without Jarvis automation is not cancelled", () => {
  game.user = { id: "player", isGM: false };
  assert.equal(pre(activity(null), {}), undefined);
  assert.equal(pre(activity({ pre: "", post: "", effects: [] }), {}), undefined);
});

test("a scripted prerequisite may still intentionally cancel an Activity", () => {
  const scripted = activity({ pre: "return false;" });
  assert.equal(pre(scripted, {}), false);
});

test("post script can remove a managed Effect without touching an unrelated Effect", async () => {
  const managed = { id: "managed", name: "Proteção",
    getFlag: (_module, key) => key === "automationKey" ? "managed" : null };
  const unrelated = { id: "unrelated", name: "Proteção", getFlag: () => null };
  const actor = { effects: [managed, unrelated],
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "ActiveEffect");
      this.effects = this.effects.filter(effect => !ids.includes(effect.id));
    } };
  const scripted = activity({ post: "await jarvis.removeActorEffect('Proteção');" });
  scripted.item.actor = actor;
  post(scripted, {}, {});
  await settle();
  assert.deepEqual(actor.effects, [unrelated]);
});
