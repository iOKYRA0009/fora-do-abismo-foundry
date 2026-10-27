import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAppearance, applyAppearanceToActor, getAppearanceProfiles, getAvailableAppearances,
  isAppearanceActive, removeAppearance, removeAppearanceFromActor,
  removeAppearanceProfile, revertAppearance, revertAppearanceForActor, setAppearanceProfile
} from "../scripts/integrations/visage-bridge.js";
import {
  getCurrentForm, getMainActor, getTransformationProfiles, morphToken,
  openTransformationPicker, promptForm, removeTransformationProfile,
  revertToken, setTransformationProfile
} from "../scripts/integrations/metamorph-bridge.js";

const MODULE_ID = "fora-do-abismo-foundry";

function documentPermission({ owners = [], observers = [] } = {}) {
  return (user, level) => owners.includes(user.id)
    || (level === "OBSERVER" && observers.includes(user.id));
}

function makeActor({ id = "actor-1", owners = [], observers = [] } = {}) {
  const flags = {
    appearanceProfiles: { sombra: { visageId: "skin-1", mode: "identity" } },
    transformationProfiles: { fera: { target: "wolf-actor", hpMode: "keep-original" } }
  };
  const writes = [];
  return {
    id, name: "Personagem", documentName: "Actor", writes,
    testUserPermission: documentPermission({ owners, observers }),
    getFlag(scope, key) { return scope === MODULE_ID ? flags[key] : undefined; },
    async setFlag(scope, key, value) {
      assert.equal(scope, MODULE_ID);
      flags[key] = structuredClone(value);
      writes.push(key);
    }
  };
}

function makeToken(actor, { id = "token-1", owners = [], observers = [] } = {}) {
  return {
    id, name: "Token", actor,
    document: {
      id, name: "Token", documentName: "Token", actorId: actor.id,
      testUserPermission: documentPermission({ owners, observers })
    }
  };
}

function setup({ user, actor, tokens, integrations = true }) {
  const calls = [];
  const visage = {
    async apply(token, id) { calls.push(["apply", token.id, id]); return true; },
    async remove(token, id) { calls.push(["remove", token.id, id]); return true; },
    async revert(token) { calls.push(["revert-appearance", token.id]); return true; },
    async getAvailable() { return ["skin-1"]; },
    async isActive() { return true; }
  };
  const metamorph = {
    async morph(token, target) { calls.push(["morph", token.id, target]); return true; },
    async revert(token) { calls.push(["revert-form", token.id]); return true; },
    async getForm() { return "wolf-actor"; },
    async getMainActor() { return actor; },
    async promptForm(token) { calls.push(["prompt", token.id]); return true; },
    async openPicker(token) { calls.push(["picker", token.id]); return true; }
  };
  globalThis.foundry = { utils: { deepClone: structuredClone } };
  globalThis.game = {
    user,
    actors: new Map([[actor.id, actor]]),
    modules: new Map([
      ["visage", { active: integrations, api: visage }],
      ["metamorph", { active: integrations, api: metamorph }]
    ])
  };
  globalThis.canvas = {
    ready: true,
    tokens: { placeables: tokens, get: id => tokens.find(token => token.id === id) ?? null }
  };
  return calls;
}

test("OBSERVER can inspect profiles and integrations but cannot mutate them", async () => {
  const actor = makeActor({ observers: ["reader"] });
  const token = makeToken(actor, { observers: ["reader"] });
  const calls = setup({ user: { id: "reader", isGM: false }, actor, tokens: [token] });

  const appearanceProfiles = getAppearanceProfiles(actor);
  appearanceProfiles.sombra.visageId = "modified-copy";
  assert.equal(getAppearanceProfiles(actor).sombra.visageId, "skin-1");
  assert.equal(getTransformationProfiles(actor).fera.target, "wolf-actor");
  assert.deepEqual(await getAvailableAppearances(token), ["skin-1"]);
  assert.equal(await isAppearanceActive(token, "sombra"), true);
  assert.equal(await getCurrentForm(token), "wolf-actor");
  assert.equal(await getMainActor(token), actor);

  await assert.rejects(setAppearanceProfile(actor, "nova", "skin-2"), /permissão OWNER/);
  await assert.rejects(removeAppearanceProfile(actor, "sombra"), /permissão OWNER/);
  await assert.rejects(setTransformationProfile(actor, "nova", "bear-actor"), /permissão OWNER/);
  await assert.rejects(removeTransformationProfile(actor, "fera"), /permissão OWNER/);
  await assert.rejects(applyAppearance(token, "sombra"), /permissão OWNER/);
  await assert.rejects(removeAppearance(token, "sombra"), /permissão OWNER/);
  await assert.rejects(revertAppearance(token), /permissão OWNER/);
  await assert.rejects(morphToken(token, "fera"), /permissão OWNER/);
  await assert.rejects(revertToken(token), /permissão OWNER/);
  await assert.rejects(promptForm(token), /permissão OWNER/);
  await assert.rejects(openTransformationPicker(token), /permissão OWNER/);
  assert.deepEqual(actor.writes, []);
  assert.deepEqual(calls, []);
});

test("Actor OWNER can manage its profiles, appearance and transformation", async () => {
  const actor = makeActor({ owners: ["owner"] });
  const token = makeToken(actor);
  const calls = setup({ user: { id: "owner", isGM: false }, actor, tokens: [token] });

  await setAppearanceProfile(actor, "nova", "skin-2");
  await applyAppearance(token, "nova");
  await removeAppearance(token, "nova");
  await revertAppearance(token);
  await removeAppearanceProfile(actor, "nova");

  await setTransformationProfile(actor, "nova", "bear-actor");
  await morphToken(token, "nova");
  await revertToken(token);
  await promptForm(token);
  await openTransformationPicker(token);
  await removeTransformationProfile(actor, "nova");

  assert.deepEqual(actor.writes, ["appearanceProfiles", "appearanceProfiles", "transformationProfiles", "transformationProfiles"]);
  assert.deepEqual(calls, [
    ["apply", "token-1", "skin-2"], ["remove", "token-1", "skin-2"],
    ["revert-appearance", "token-1"], ["morph", "token-1", "bear-actor"],
    ["revert-form", "token-1"], ["prompt", "token-1"], ["picker", "token-1"]
  ]);
});

test("Token OWNER may change that token without gaining Actor profile write access", async () => {
  const actor = makeActor();
  const token = makeToken(actor, { owners: ["token-owner"] });
  const calls = setup({ user: { id: "token-owner", isGM: false }, actor, tokens: [token] });

  await assert.rejects(setAppearanceProfile(actor, "nova", "skin-2"), /permissão OWNER/);
  await assert.rejects(setTransformationProfile(actor, "nova", "bear-actor"), /permissão OWNER/);
  await applyAppearance(token, "sombra");
  await morphToken(token, "fera");
  assert.deepEqual(calls, [["apply", "token-1", "skin-1"], ["morph", "token-1", "wolf-actor"]]);
  assert.deepEqual(actor.writes, []);
});

test("Actor OWNER can revert a Token after Metamorph replaces its actor with an unowned form", async () => {
  const actor = makeActor({ owners: ["owner"] });
  const form = makeActor({ id: "foreign-form" });
  const token = makeToken(actor);
  const calls = setup({ user: { id: "owner", isGM: false }, actor, tokens: [token] });
  const metamorph = game.modules.get("metamorph").api;
  metamorph.morph = async () => {
    token.actor = form;
    token.document.actorId = form.id;
    calls.push(["morph", token.id]);
    return true;
  };

  await morphToken(token, "fera");
  assert.equal(await getMainActor(token), actor);
  await revertToken(token);
  assert.deepEqual(calls, [["morph", "token-1"], ["revert-form", "token-1"]]);

  game.user = { id: "intruder", isGM: false };
  await assert.rejects(revertToken(token), /permissão OWNER/);
});

test("unrelated users cannot call direct or bulk mutation APIs", async () => {
  const actor = makeActor();
  const token = makeToken(actor);
  actor.isOwner = true; // Must not override Foundry's user-specific permission check.
  token.isOwner = true;
  const calls = setup({ user: { id: "intruder", isGM: false }, actor, tokens: [token] });

  assert.throws(() => getAppearanceProfiles(actor), /permissão OBSERVER/);
  assert.throws(() => getTransformationProfiles(actor), /permissão OBSERVER/);
  await assert.rejects(getAvailableAppearances(token), /permissão OBSERVER/);
  await assert.rejects(getCurrentForm(token), /permissão OBSERVER/);
  await assert.rejects(applyAppearanceToActor(actor, "sombra"), /permissão OWNER/);
  await assert.rejects(removeAppearanceFromActor(actor, "sombra"), /permissão OWNER/);
  await assert.rejects(revertAppearanceForActor(actor), /permissão OWNER/);
  assert.deepEqual(calls, []);
});

test("GM can run bulk appearance changes for effect automation, even on unowned Actors", async () => {
  const actor = makeActor();
  const tokens = [makeToken(actor, { id: "token-1" }), makeToken(actor, { id: "token-2" })];
  const calls = setup({ user: { id: "gm", isGM: true }, actor, tokens });

  await applyAppearanceToActor(actor, "sombra");
  await removeAppearanceFromActor(actor, "sombra");
  await revertAppearanceForActor(actor);
  assert.deepEqual(calls.map(([action, id]) => [action, id]), [
    ["apply", "token-1"], ["apply", "token-2"],
    ["remove", "token-1"], ["remove", "token-2"],
    ["revert-appearance", "token-1"], ["revert-appearance", "token-2"]
  ]);
});

test("owned profiles remain readable when optional visual modules are inactive", async () => {
  const actor = makeActor({ owners: ["owner"] });
  const token = makeToken(actor);
  setup({ user: { id: "owner", isGM: false }, actor, tokens: [token], integrations: false });

  assert.equal(getAppearanceProfiles(actor).sombra.visageId, "skin-1");
  assert.equal(getTransformationProfiles(actor).fera.target, "wolf-actor");
  await assert.rejects(applyAppearance(token, "sombra"), /Visage não está ativo/);
  await assert.rejects(morphToken(token, "fera"), /Metamorph não está ativo/);
});
