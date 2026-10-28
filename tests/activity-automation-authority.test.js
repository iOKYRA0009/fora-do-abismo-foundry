import test from "node:test";
import assert from "node:assert/strict";

import { registerActivityAutomation } from "../scripts/automation/activity-automation.js";
import {
  approveActivityAutomation, inspectActivityAutomation, registerActivityAutomationSettings,
  revokeActivityAutomation, sha256Text
} from "../scripts/automation/automation-approval.js";

const MODULE_ID = "fora-do-abismo-foundry";

function setup() {
  const callbacks = new Map();
  const settings = new Map();
  const warnings = [];
  globalThis.Hooks = {
    on(name, callback) {
      const entries = callbacks.get(name) ?? [];
      entries.push(callback);
      callbacks.set(name, entries);
    }
  };
  globalThis.game = {
    user: { id: "gm-1", isGM: true },
    users: { activeGM: { id: "gm-1" } },
    settings: {
      register(scope, key, config) {
        assert.equal(scope, MODULE_ID);
        settings.set(key, config.default);
      },
      get(scope, key) {
        assert.equal(scope, MODULE_ID);
        return settings.get(key);
      },
      async set(scope, key, value) {
        assert.equal(scope, MODULE_ID);
        assert.equal(game.user.isGM, true);
        settings.set(key, structuredClone(value));
      }
    }
  };
  globalThis.ui = { notifications: {
    error() { throw new Error("unexpected automation error"); },
    warn(message) { warnings.push(message); }
  } };
  globalThis.canvas = {};
  globalThis.foundry = {};
  globalThis.Roll = class {};
  globalThis.ChatMessage = class {};
  globalThis.fromUuid = async () => null;

  registerActivityAutomationSettings();
  registerActivityAutomation();
  registerActivityAutomation();
  assert.equal(callbacks.get("dnd5e.preUseActivity")?.length, 1);
  assert.equal(callbacks.get("dnd5e.postUseActivity")?.length, 1);

  return {
    pre: callbacks.get("dnd5e.preUseActivity")[0],
    post: callbacks.get("dnd5e.postUseActivity")[0],
    settings,
    warnings
  };
}

function activity(automation) {
  return {
    name: "Atividade", uuid: "Actor.actor-1.Item.item-1.Activity.activity-1",
    item: { name: "Item", uuid: "Actor.actor-1.Item.item-1", actor: { name: "Personagem" } },
    flags: { [MODULE_ID]: { automation } }
  };
}

async function settlePost() {
  await new Promise(resolve => setImmediate(resolve));
}

const automationHooks = setup();

test("Player and Trusted clients cannot use executable Jarvis Activities without the active GM", async () => {
  const { pre, post, warnings } = automationHooks;
  const startWarnings = warnings.length;
  globalThis.__jarvisPlayerAutomation = 0;
  game.users.activeGM = { id: "gm-1" };
  const scripted = activity({
    pre: "globalThis.__jarvisPlayerAutomation += 1;",
    post: "globalThis.__jarvisPlayerAutomation += 1;"
  });

  for (const user of [{ id: "player", isGM: false }, { id: "trusted", isGM: false }]) {
    game.user = user;
    assert.equal(pre(scripted, {}), false);
    post(scripted, {}, {});
    assert.equal(pre(activity({ effects: [{ effectName: "Proteção" }] }), {}), false);
    assert.equal(pre(activity(null), {}), undefined);
    assert.equal(pre(activity({ effects: [], pre: "", post: "" }), {}), undefined);
  }
  await settlePost();
  assert.equal(globalThis.__jarvisPlayerAutomation, 0);
  assert.equal(warnings.length - startWarnings, 4);
  assert.ok(warnings.slice(startWarnings).every(message => /Mestre ativo.*cancelado/.test(message)));
  game.user = { id: "gm-1", isGM: true };
  delete globalThis.__jarvisPlayerAutomation;
});

test("post-script removal by name leaves unrelated Active Effects intact", async () => {
  const { post } = automationHooks;
  game.user = { id: "gm-1", isGM: true };
  game.users.activeGM = { id: "gm-1" };
  const managed = { id: "jarvis-effect", name: "Proteção",
    getFlag: (_module, key) => key === "automationKey" ? "managed-protection" : null };
  const unrelated = { id: "other-effect", name: "Proteção", getFlag: () => null };
  const removed = [];
  const actor = {
    effects: [managed, unrelated],
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "ActiveEffect");
      removed.push(...ids);
      this.effects = this.effects.filter(effect => !ids.includes(effect.id));
      return ids;
    }
  };
  const guarded = activity({ post: "await jarvis.removeActorEffect('Proteção');" });
  guarded.item.actor = actor;
  await approveActivityAutomation(guarded);
  post(guarded, {}, {});
  await settlePost();
  assert.deepEqual(removed, ["jarvis-effect"]);
  assert.deepEqual(actor.effects, [unrelated]);
});

test("Activity scripts and effects run only on the elected active GM, with no duplicate hooks", async () => {
  const { pre, post } = automationHooks;
  globalThis.__jarvisAutomationCalls = [];
  const guarded = activity({
    pre: "globalThis.__jarvisAutomationCalls.push('pre'); usageConfig.cancelledByJarvis = true; return false;",
    post: "globalThis.__jarvisAutomationCalls.push('post');"
  });
  await approveActivityAutomation(guarded);
  const usageConfig = {};

  game.user = { id: "player-1", isGM: false };
  assert.equal(pre(guarded, usageConfig), false);
  post(guarded, usageConfig, {});
  await settlePost();

  game.user = { id: "gm-2", isGM: true };
  assert.equal(pre(guarded, usageConfig), false);
  post(guarded, usageConfig, {});
  await settlePost();

  game.user = { id: "gm-1", isGM: true };
  game.users.activeGM = null;
  assert.equal(pre(guarded, usageConfig), false);
  post(guarded, usageConfig, {});
  await settlePost();

  assert.deepEqual(globalThis.__jarvisAutomationCalls, []);
  assert.equal(usageConfig.cancelledByJarvis, undefined);

  game.users.activeGM = { id: "gm-1" };
  assert.equal(pre(guarded, usageConfig), false);
  post(guarded, usageConfig, {});
  await settlePost();

  assert.deepEqual(globalThis.__jarvisAutomationCalls, ["pre", "post"]);
  assert.equal(usageConfig.cancelledByJarvis, true);
  delete globalThis.__jarvisAutomationCalls;
});

test("post script stops if active GM changes while an effect is awaiting", async () => {
  const { post } = automationHooks;
  game.user = { id: "gm-1", isGM: true };
  game.users.activeGM = { id: "gm-1" };
  let releaseEffect;
  let effectStarted;
  const started = new Promise(resolve => { effectStarted = resolve; });
  const effectPending = new Promise(resolve => { releaseEffect = resolve; });
  const actor = {
    effects: { size: 1, contents: [] },
    deleteEmbeddedDocuments: async () => [],
    name: "Personagem"
  };
  const sourceEffect = {
    id: "effect-1",
    uuid: "effect-uuid",
    toObject() {
      return { system: { changes: [] }, flags: {}, duration: {} };
    },
    constructor: { getEffectStart: () => null }
  };
  const item = {
    name: "Item", uuid: "Actor.actor-1.Item.item-1", actor,
    effects: { get: () => sourceEffect, find: () => sourceEffect, size: 1, contents: [sourceEffect] }
  };
  const guarded = activity({ effects: [{ effectId: "effect-1", replace: false }], post: "globalThis.__jarvisPostAfterHandoff = true;" });
  guarded.item = item;
  await approveActivityAutomation(guarded);
  globalThis.__jarvisPostAfterHandoff = false;
  globalThis.ActiveEffect = {
    implementation: {
      forApplication: () => {
        effectStarted();
        return effectPending;
      },
      create: async () => ({ id: "created" })
    }
  };

  post(guarded, {}, {});
  await started;
  game.users.activeGM = { id: "gm-2" };
  releaseEffect([]);
  await settlePost();

  assert.equal(globalThis.__jarvisPostAfterHandoff, false);
  delete globalThis.__jarvisPostAfterHandoff;
});

test("approval requires active GM and stores a SHA-256 digest without script source", async () => {
  const guarded = activity({ pre: "return false;", effects: [{ target: "self", key: "effect" }] });
  assert.equal(inspectActivityAutomation(guarded).approved, false);
  game.users.activeGM = { id: "gm-1" };
  assert.equal(automationHooks.pre(guarded, {}), false);
  game.user = { id: "player-1", isGM: false };
  await assert.rejects(approveActivityAutomation(guarded), /Mestre ativo/);
  game.user = { id: "gm-2", isGM: true };
  await assert.rejects(approveActivityAutomation(guarded), /Mestre ativo/);
  game.user = { id: "gm-1", isGM: true };

  const approval = await approveActivityAutomation(guarded);
  assert.equal(approval.approved, true);
  const stored = JSON.stringify(automationHooks.settings.get("approvedActivityAutomations"));
  assert.doesNotMatch(stored, /return false/);
  assert.match(stored, /[a-f0-9]{64}/);

  // Property order does not invalidate structurally identical JSON data.
  guarded.flags[MODULE_ID].automation = { effects: [{ key: "effect", target: "self" }], pre: "return false;" };
  assert.equal(inspectActivityAutomation(guarded).approved, true);
  await revokeActivityAutomation(guarded);
  assert.equal(inspectActivityAutomation(guarded).approved, false);
});

test("any changed script or effect flags invalidate approved automation before execution", async () => {
  const { pre, post } = automationHooks;
  game.user = { id: "gm-1", isGM: true };
  game.users.activeGM = { id: "gm-1" };
  const guarded = activity({ pre: "globalThis.__jarvisTamperCount += 1; return false;", post: "globalThis.__jarvisTamperCount += 1;" });
  globalThis.__jarvisTamperCount = 0;
  assert.equal(pre(guarded, {}), false);
  await approveActivityAutomation(guarded);
  assert.equal(pre(guarded, {}), false);
  assert.equal(globalThis.__jarvisTamperCount, 1);

  guarded.flags[MODULE_ID].automation.post = "globalThis.__jarvisTamperCount += 100;";
  assert.equal(inspectActivityAutomation(guarded).approved, false);
  assert.equal(pre(guarded, {}), false);
  post(guarded, {}, {});
  await settlePost();
  assert.equal(globalThis.__jarvisTamperCount, 1);

  await approveActivityAutomation(guarded);
  guarded.flags[MODULE_ID].automation.effects = [{ target: "selected-all" }];
  assert.equal(inspectActivityAutomation(guarded).approved, false);
  assert.equal(pre(guarded, {}), false);
  post(guarded, {}, {});
  await settlePost();
  assert.equal(globalThis.__jarvisTamperCount, 1);
  delete globalThis.__jarvisTamperCount;
});

test("editing an embedded Effect invalidates approval before GM automation runs", async () => {
  const { pre } = automationHooks;
  game.user = { id: "gm-1", isGM: true };
  game.users.activeGM = { id: "gm-1" };
  let change = { key: "system.attributes.ac.bonus", value: "1" };
  const guarded = activity({ pre: "globalThis.__jarvisEffectSourceCount += 1;" });
  guarded.item.effects = { contents: [{
    toObject() { return { _id: "effect-1", system: { changes: [change] } }; }
  }] };
  globalThis.__jarvisEffectSourceCount = 0;
  await approveActivityAutomation(guarded);
  pre(guarded, {});
  assert.equal(globalThis.__jarvisEffectSourceCount, 1);

  change = { key: "system.attributes.ac.bonus", value: "99" };
  assert.equal(inspectActivityAutomation(guarded).approved, false);
  assert.equal(pre(guarded, {}), false);
  assert.equal(globalThis.__jarvisEffectSourceCount, 1);
  delete globalThis.__jarvisEffectSourceCount;
});

test("approval fails closed for missing stable UUID and SHA-256 matches published vectors", async () => {
  assert.equal(sha256Text(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Text("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const guarded = activity({ post: "globalThis.__jarvisUnsafe = true;" });
  guarded.uuid = null;
  assert.equal(inspectActivityAutomation(guarded).reason, "unstable-uuid");
  await assert.rejects(approveActivityAutomation(guarded), /UUIDs estáveis/);
});

test("oversized automation is rejected before hashing or execution", async () => {
  game.user = { id: "gm-1", isGM: true };
  game.users.activeGM = { id: "gm-1" };
  const guarded = activity({ pre: `return "${"x".repeat(129 * 1024)}";` });
  assert.equal(inspectActivityAutomation(guarded).reason, "too-large");
  await assert.rejects(approveActivityAutomation(guarded), /128 KiB/);
  assert.equal(automationHooks.pre(guarded, {}), false);

  const largeEffect = activity({ post: "return true;" });
  largeEffect.item.effects = { contents: [{ toObject: () => ({ description: "x".repeat(129 * 1024) }) }] };
  assert.equal(inspectActivityAutomation(largeEffect).reason, "too-large");
  await assert.rejects(approveActivityAutomation(largeEffect), /128 KiB/);
});

test("concurrent approvals retain both Activity records", async () => {
  game.user = { id: "gm-1", isGM: true };
  game.users.activeGM = { id: "gm-1" };
  const first = activity({ post: "return 1;" });
  const second = activity({ post: "return 2;" });
  second.uuid = "Actor.actor-1.Item.item-1.Activity.activity-2";
  await Promise.all([approveActivityAutomation(first), approveActivityAutomation(second)]);
  assert.equal(inspectActivityAutomation(first).approved, true);
  assert.equal(inspectActivityAutomation(second).approved, true);
});
