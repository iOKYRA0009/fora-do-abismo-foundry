import test from "node:test";
import assert from "node:assert/strict";
import { applyConfiguredEffectViaGm, registerSocketBridge } from "../scripts/integrations/socketlib-bridge.js";

let onReady;
let gmHandler;
let sent;
globalThis.Hooks = { once(name, callback) {
  assert.equal(name, "socketlib.ready");
  onReady = callback;
} };
const sender = { id: "player", active: true, viewedScene: "scene-1", isGM: false };
const source = { testUserPermission(user, level) {
  return user === sender && level === "OWNER";
} };
const effect = { id: "effect-1", uuid: "Item.Effect.1", name: "Escudo",
  toObject: () => ({ system: { changes: [] } }), constructor: {} };
const targetActor = { uuid: "Actor.target", effects: [] };
const scene = { id: "scene-1", documentName: "Scene" };
const token = { uuid: "Scene.Token.1", documentName: "Token", parent: scene,
  actor: targetActor, hidden: false };
const activity = { uuid: "Activity.1", flags: { "fora-do-abismo-foundry": {
  automation: { effects: [{ target: "selected", effectName: "Escudo" }] }
} }, item: { actor: source, effects: [effect] } };
globalThis.game = { user: { isGM: true }, users: { get: id => id === sender.id ? sender : null },
  modules: { get: id => id === "socketlib" ? { active: true } : null } };
globalThis.socketlib = { registerModule() {
  return { register(name, handler) {
    assert.equal(name, "applyConfiguredEffect");
    gmHandler = handler;
  }, async executeAsGM(name, payload) {
    sent = { name, payload };
    return gmHandler.call({ socketdata: { userId: sender.id } }, payload);
  } };
} };
globalThis.fromUuid = async uuid => ({ [activity.uuid]: activity, [token.uuid]: token })[uuid] ?? null;
globalThis.ActiveEffect = { implementation: {
  async forApplication(changes) { return changes; },
  async create(data, { parent }) {
    assert.equal(parent, targetActor);
    assert.equal(data.system.origin.activity, activity.uuid);
    return { id: "created-effect" };
  }
} };

registerSocketBridge();
onReady();

test("socketlib applies only an effect configured on a controlled Activity", async () => {
  const result = await applyConfiguredEffectViaGm(activity, { document: token }, 0);
  assert.deepEqual(sent, { name: "applyConfiguredEffect", payload: {
    activityUuid: activity.uuid, tokenUuid: token.uuid, effectIndex: 0
  } });
  assert.deepEqual(result, { actorUuid: targetActor.uuid, effectId: "created-effect" });
});

test("socketlib rejects an unauthorized source and an invisible target", async () => {
  source.testUserPermission = () => false;
  await assert.rejects(gmHandler.call({ socketdata: { userId: sender.id } }, sent.payload),
    /não controla a origem/);
  source.testUserPermission = () => true;
  token.hidden = true;
  await assert.rejects(gmHandler.call({ socketdata: { userId: sender.id } }, sent.payload),
    /fora da cena visível/);
  token.hidden = false;
});

test("socketlib rejects a client supplied effect index that is not configured", async () => {
  await assert.rejects(gmHandler.call({ socketdata: { userId: sender.id } },
    { ...sent.payload, effectIndex: 100 }), /efeito de alvo não configurado/);
});
