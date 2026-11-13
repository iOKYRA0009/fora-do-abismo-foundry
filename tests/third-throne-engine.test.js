import test from "node:test";
import assert from "node:assert/strict";
import { runThirdThroneOnGm } from "../scripts/automation/third-throne-engine.js";

const MODULE = "fora-do-abismo-foundry";
function fixture() {
  const user = { id: "ruan", active: true, isGM: false, viewedScene: "scene", name: "Ruan" };
  const gm = { id: "gm", active: true, isGM: true };
  const flags = {};
  const jack = {
    id: "jack", name: "Jack", ownership: { ruan: 3 },
    system: { resources: { primary: { value: 60 }, secondary: { value: 50 } } },
    testUserPermission: (u, permission) => u.id === "ruan" && permission === "OWNER",
    getFlag: (scope, key) => flags[key],
    setFlag: async (scope, key, value) => { flags[key] = structuredClone(value); },
    unsetFlag: async (scope, key) => { delete flags[key]; },
    update: async changes => {
      for (const [path, value] of Object.entries(changes)) {
        if (path === "system.resources.primary.value") jack.system.resources.primary.value = value;
        else if (path === "system.resources.secondary.value") jack.system.resources.secondary.value = value;
      }
    }
  };
  flags.thirdThroneV3 = { userId: "ruan", fusionAccepted: true,
    summonIds: { enforcado: "oswin", procissao: "coro", sentinela: "bram" } };
  const createActor = id => ({ id, name: id, ownership: {},
    update: async changes => {
      for (const [path, value] of Object.entries(changes)) {
        if (path.startsWith("ownership.-=")) delete actors[id].ownership[path.slice(12)];
        else if (path.startsWith("ownership.")) actors[id].ownership[path.slice(10)] = value;
      }
    },
    getTokenDocument: async spot => ({ toObject: () => ({ x: spot.x, y: spot.y }) })
  });
  const actors = { jack, oswin: createActor("oswin"), coro: createActor("coro"), bram: createActor("bram") };
  const tokens = new Map([["jack-token", { id: "jack-token", actorId: "jack", x: 100, y: 100 }]]);
  const templates = new Map();
  let nextTemplate = 0;
  const scene = {
    id: "scene", width: 2000, height: 2000, grid: { size: 100 },
    tokens: { get: id => tokens.get(id), get contents() { return [...tokens.values()]; } },
    templates: { get: id => templates.get(id) },
    createEmbeddedDocuments: async (type, data) => {
      if (type === "Token") return data.map((row, i) => {
        const id = `summon-${tokens.size + i}`;
        const actor = actors[row.actorId];
        const token = { ...row, id, actor, getFlag: (scope, key) => row.flags?.[scope]?.[key] };
        tokens.set(id, token);
        return token;
      });
      return data.map((row, i) => {
        const doc = { ...row, id: `template-${nextTemplate++}` };
        templates.set(doc.id, doc);
        return doc;
      });
    },
    deleteEmbeddedDocuments: async (type, ids) => {
      for (const id of ids) (type === "Token" ? tokens : templates).delete(id);
    }
  };
  for (const id of ["oswin", "coro", "bram"]) actors[id].system = { attributes: { hp: { value: 30 } } };
  const combat = { id: "combat", started: true, round: 1, combatant: { actor: jack } };
  globalThis.game = { user: gm, users: { activeGM: gm }, combat, time: { worldTime: 100 },
    actors: { get: id => actors[id], contents: Object.values(actors) }, scenes: { get: id => id === "scene" ? scene : null } };
  globalThis.ChatMessage = { getSpeaker: () => ({}), create: async () => ({}) };
  return { user, gm, jack, actors, tokens, templates, combat, flags };
}

test("trio costs 30 Energy, grants Ruan sheets, and creates three actionable tokens", async () => {
  const f = fixture();
  const result = await runThirdThroneOnGm({ jackId: "jack", action: "summon", kind: "trio", sceneId: "scene", tokenId: "jack-token" }, f.user);
  assert.equal(f.jack.system.resources.secondary.value, 20);
  assert.equal(result.tokenIds.length, 3);
  assert.equal(f.actors.oswin.ownership.ruan, 3);
  assert.equal(f.actors.coro.ownership.ruan, 3);
  assert.equal(f.actors.bram.ownership.ruan, 3);
  assert.equal(f.flags.thirdThroneV3State.reactionSpentRound, "combat:1");
});

test("Coral uses only souls above 50, lasts two rounds, and reactivation costs again", async () => {
  const f = fixture();
  await runThirdThroneOnGm({ jackId: "jack", action: "summon", kind: "trio", sceneId: "scene", tokenId: "jack-token" }, f.user);
  const first = await runThirdThroneOnGm({ jackId: "jack", action: "field", sceneId: "scene", tokenId: "jack-token" }, f.user);
  assert.equal(f.jack.system.resources.primary.value, 50);
  assert.equal(f.templates.size, 1);
  assert.equal(f.templates.get(first.templateId).distance, 90);
  assert.equal(first.expiresRound, 3);
  await assert.rejects(() => runThirdThroneOnGm({ jackId: "jack", action: "field", sceneId: "scene", tokenId: "jack-token" }, f.user), /mínimo 60/);
  f.jack.system.resources.primary.value = 70;
  f.combat.round = 3;
  game.time.worldTime = 112;
  const second = await runThirdThroneOnGm({ jackId: "jack", action: "field", sceneId: "scene", tokenId: "jack-token" }, f.user);
  assert.equal(f.jack.system.resources.primary.value, 60);
  assert.equal(f.templates.size, 1);
  assert.notEqual(second.templateId, first.templateId);
});

test("paid powers share a round limit, and dismissal removes tokens and temporary ownership", async () => {
  const f = fixture();
  await runThirdThroneOnGm({ jackId: "jack", action: "summon", kind: "trio", sceneId: "scene", tokenId: "jack-token" }, f.user);
  await runThirdThroneOnGm({ jackId: "jack", action: "power", power: "laco", sceneId: "scene" }, f.user);
  assert.equal(f.jack.system.resources.primary.value, 55);
  await assert.rejects(() => runThirdThroneOnGm({ jackId: "jack", action: "power", power: "coro", sceneId: "scene" }, f.user), /já usaram/);
  await runThirdThroneOnGm({ jackId: "jack", action: "dismiss" }, f.user);
  assert.equal(f.tokens.size, 1);
  assert.equal(f.actors.oswin.ownership.ruan, undefined);
  assert.equal(f.flags.thirdThroneV3State, undefined);
});

test("each manifestation has one action, while Bram has a separate single reaction", async () => {
  const f = fixture();
  await runThirdThroneOnGm({ jackId: "jack", action: "summon", kind: "trio", sceneId: "scene", tokenId: "jack-token" }, f.user);
  await runThirdThroneOnGm({ jackId: "jack", action: "power", power: "correntes", sceneId: "scene" }, f.user);
  await assert.rejects(() => runThirdThroneOnGm({ jackId: "jack", action: "power", power: "laco", sceneId: "scene" }, f.user), /já usou sua ação/);
  await runThirdThroneOnGm({ jackId: "jack", action: "power", power: "guarda", sceneId: "scene" }, f.user);
  await assert.rejects(() => runThirdThroneOnGm({ jackId: "jack", action: "power", power: "muralha", sceneId: "scene" }, f.user), /já usou sua reação/);
  assert.equal(f.jack.system.resources.primary.value, 60);
});

test("basic NPC actions consume the manifestation action without Souls", async () => {
  const f = fixture();
  await runThirdThroneOnGm({ jackId: "jack", action: "summon", kind: "procissao", sceneId: "scene", tokenId: "jack-token" }, f.user);
  await runThirdThroneOnGm({ jackId: "jack", action: "power", power: "basic", kind: "procissao", basic: "esquivar", sceneId: "scene" }, f.user);
  await assert.rejects(() => runThirdThroneOnGm({ jackId: "jack", action: "power", power: "refrao", sceneId: "scene" }, f.user), /já usou sua ação/);
  assert.equal(f.jack.system.resources.primary.value, 60);
});
