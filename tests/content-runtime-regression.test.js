import test from "node:test";
import assert from "node:assert/strict";

import { resolveCrossItemConsumption } from "../scripts/importer/resources/cross-item-linker.js";
import {
  applyEmbeddedEffectToActor, removeAppliedEmbeddedEffectFromActor
} from "../scripts/automation/embedded-effect-engine.js";

test("cross-item consumption resolves a native identifier with spaces and mixed case", async () => {
  const consumer = {
    id: "consumer", name: "Consumo", system: { activities: {
      TestActivity0001: { consumption: { targets: [{ target: "@jarvis:alma-primal", value: "1" }] } }
    } },
    toObject() { return { system: structuredClone(this.system) }; }
  };
  const actor = {
    items: [{ id: "pool", name: "Reserva", system: { identifier: "Alma Primal" } }, consumer],
    async updateEmbeddedDocuments(type, updates) {
      assert.equal(type, "Item");
      assert.equal(updates.length, 1);
      assert.equal(updates[0]._id, "consumer");
      assert.equal(updates[0].system.activities.TestActivity0001.consumption.targets[0].target, "pool");
    }
  };
  globalThis.foundry = { utils: {
    deepClone: structuredClone,
    setProperty(object, path, value) {
      const parts = path.split(".");
      let current = object;
      for (const part of parts.slice(0, -1)) current = current[part] ??= {};
      current[parts.at(-1)] = value;
    }
  } };
  assert.equal(await resolveCrossItemConsumption(actor, [consumer]), 1);
});

function effectFixture({ createFailure = false, deleteFailure = null } = {}) {
  const calls = [];
  const old = {
    id: "old-effect", name: "Proteção",
    _stats: { duplicateSource: "Item.item.Effect.source" },
    getFlag(_module, key) { return key === "automationKey" ? "protection" : null; }
  };
  const unrelated = { id: "third-party-effect", name: "Proteção", getFlag: () => null };
  const actor = {
    uuid: "Actor.actor", effects: [old, unrelated],
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "ActiveEffect");
      calls.push(["delete", ids]);
      if (deleteFailure === "before") throw new Error("exclusão antiga falhou");
      this.effects = this.effects.filter(effect => !ids.includes(effect.id));
      if (deleteFailure === "after") throw new Error("exclusão antiga falhou");
      return ids;
    }
  };
  const effect = {
    id: "source", uuid: "Item.item.Effect.source", name: "Proteção",
    toObject: () => ({ name: "Proteção", system: { changes: [] }, duration: {} }),
    constructor: { getEffectStart: () => null }
  };
  const activity = {
    uuid: "Item.item.Activity.activity", item: {
      uuid: "Item.item", name: "Item", actor,
      effects: { get: id => id === "source" ? effect : null }
    }
  };
  globalThis.ActiveEffect = { implementation: {
    forApplication: async changes => changes,
    async create(_data, options) {
      assert.equal(options.parent, actor);
      calls.push(["create"]);
      if (createFailure) throw new Error("criação falhou");
      const created = { id: "new-effect", async delete() {
        calls.push(["rollback-new"]);
        actor.effects = actor.effects.filter(entry => entry.id !== this.id);
      } };
      actor.effects.push(created);
      return created;
    }
  } };
  return { actor, activity, calls, old, unrelated };
}

test("replacement keeps the existing Active Effect when creation fails", async () => {
  const { actor, activity, calls, old } = effectFixture({ createFailure: true });
  await assert.rejects(applyEmbeddedEffectToActor(activity, actor, {
    effectId: "source", key: "protection", replace: true
  }), /criação falhou/);
  assert.deepEqual(calls, [["create"]]);
  assert.equal(actor.effects[0], old);
});

test("replacement creates the Active Effect before removing its predecessor", async () => {
  const { actor, activity, calls, unrelated } = effectFixture();
  const created = await applyEmbeddedEffectToActor(activity, actor, {
    effectId: "source", key: "protection", replace: true
  });
  assert.equal(created.id, "new-effect");
  assert.deepEqual(calls, [["create"], ["delete", ["old-effect"]]]);
  assert.deepEqual(actor.effects.map(effect => effect.id), [unrelated.id, "new-effect"]);
});

test("failed old Effect deletion rolls back the new one when the old survives", async () => {
  const { actor, activity, calls, old, unrelated } = effectFixture({ deleteFailure: "before" });
  await assert.rejects(applyEmbeddedEffectToActor(activity, actor, {
    effectId: "source", key: "protection", replace: true
  }), /falha ao concluir a substituição/);
  assert.deepEqual(calls, [["create"], ["delete", ["old-effect"]], ["rollback-new"]]);
  assert.deepEqual(actor.effects, [old, unrelated]);
});

test("failed old Effect deletion keeps the new one when the old was already removed", async () => {
  const { actor, activity, calls } = effectFixture({ deleteFailure: "after" });
  await assert.rejects(applyEmbeddedEffectToActor(activity, actor, {
    effectId: "source", key: "protection", replace: true
  }), /falha ao concluir a substituição/);
  assert.deepEqual(calls, [["create"], ["delete", ["old-effect"]]]);
  assert.deepEqual(actor.effects.map(effect => effect.id), ["third-party-effect", "new-effect"]);
});

test("removal by name only deletes Jarvis-managed Effects and refuses empty keys", async () => {
  const { actor, calls, unrelated } = effectFixture();
  await removeAppliedEmbeddedEffectFromActor(actor, "Proteção");
  assert.deepEqual(calls, [["delete", ["old-effect"]]]);
  assert.deepEqual(actor.effects, [unrelated]);
  await assert.rejects(removeAppliedEmbeddedEffectFromActor(actor, ""), /informe uma chave/);
});
