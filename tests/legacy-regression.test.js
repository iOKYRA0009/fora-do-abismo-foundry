import test from "node:test";
import assert from "node:assert/strict";
import { validateJarvisActorPayload, PayloadValidationError } from "../scripts/importer/validators/payload-validator.js";
import { Dnd5eV6Adapter } from "../scripts/importer/adapters/dnd5e-adapter.js";
import { applyActorResources } from "../scripts/importer/resources/resource-engine.js";
import { resolveDocumentImage } from "../scripts/importer/images/image-strategy.js";
import { analyzeActorRulesProfile } from "../scripts/rules/rules-profile.js";
import { analyzeActorProvenance, PROVENANCE_KIND } from "../scripts/provenance/content-provenance.js";
import { prepareEmbeddedEffectForActor, resolveEmbeddedEffect } from "../scripts/automation/embedded-effect-engine.js";
import { getJackSoulStatus } from "../scripts/automation/jack-engine.js";
import { makeJarvisItemRef } from "../scripts/importer/resources/cross-item-linker.js";
import { JarvisSceneFramework } from "../scripts/scenes/framework/scene-framework.js";
import { getCoreScenePresetDefinitions } from "../scripts/scenes/presets/core-presets.js";
import { validateSceneBlueprint } from "../scripts/scenes/scene-blueprint-validator.js";

function merge(base, override) {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    result[key] = value && typeof value === "object" && !Array.isArray(value)
      ? merge(result[key] ?? {}, value)
      : structuredClone(value);
  }
  return result;
}

globalThis.foundry = { utils: { deepClone: structuredClone, mergeObject: merge } };
globalThis.game = { system: { version: "6.0.6" } };

test("Importer V9 validates semantics and refuses malformed automation", () => {
  const valid = {
    schemaVersion: "9.0",
    actor: {
      name: "Teste em memória", type: "character",
      jarvis: { hp: { value: 8, max: 10 }, resources: [{ slot: "primary", max: 3 }] }
    },
    items: [{ name: "Recurso teste", type: "feat", jarvis: { activities: [{
      _id: "TestActivity0001", type: "utility", automation: { post: "return true;" }
    }] } }]
  };
  assert.equal(validateJarvisActorPayload(valid), true);
  assert.throws(() => validateJarvisActorPayload({
    ...valid,
    items: [{ ...valid.items[0], jarvis: { activities: [{ type: "utility", automation: { post: "return true;" } }] } }]
  }), PayloadValidationError);
});

test("D&D5e adapter preserves actor HP and native resources without creating a document", () => {
  const actor = Dnd5eV6Adapter.adaptActor({
    name: "Teste em memória", type: "character",
    jarvis: { hp: { value: 8, max: 10 }, resources: [{ slot: "primary", label: "Alma", max: 3, value: 2 }] }
  });
  assert.equal(actor.system.attributes.hp.max, 10);
  assert.equal(actor.system.resources.primary.value, 2);
  assert.equal(actor.system.resources.primary.max, 3);
  assert.equal(actor.flags["fora-do-abismo-foundry"].systemVersion, "6.0.6");
});

test("resource slots clamp values and reject a fourth native slot", () => {
  const system = applyActorResources({}, [{ slot: "primary", label: "Alma", value: 8, max: 3, recovery: "shortRest" }]);
  assert.equal(system.resources.primary.value, 3);
  assert.equal(system.resources.primary.sr, true);
  assert.throws(() => applyActorResources({}, Array.from({ length: 4 }, () => ({ max: 1 }))), /3 slots/);
});

test("image strategy keeps a custom path and a deterministic generated fallback", () => {
  assert.equal(resolveDocumentImage({ name: "Ícone" }, { source: "custom", customPath: "worlds/teste/icone.webp" }),
    "worlds/teste/icone.webp");
  assert.equal(resolveDocumentImage({ name: "Ícone" }, { source: "generate", fallbackIcon: "icons/svg/sword.svg" }),
    "icons/svg/sword.svg");
});

test("rules profile flags a 2014 class and preserves an unknown subclass for review", () => {
  const actor = {
    id: "actor-test", name: "Teste em memória", getFlag: () => null,
    items: [
      { id: "class-1", name: "Fighter", type: "class", system: { identifier: "fighter", source: { rules: "2014" } } },
      { id: "sub-1", name: "Subclasse desconhecida", type: "subclass", system: { classIdentifier: "fighter" } }
    ]
  };
  const report = analyzeActorRulesProfile(actor, { target: "2024" });
  assert.equal(report.classes[0].status, "needs-class-migration");
  assert.equal(report.subclasses[0].status, "preserve-review");
  assert.equal(report.ready, false);
});

test("provenance reads explicit homebrew classification without stamping an Actor", () => {
  const actor = {
    id: "actor-test", name: "Teste em memória",
    items: [{ id: "item-test", name: "Talento caseiro", type: "feat", flags: {
      "fora-do-abismo-foundry": { provenanceInput: { kind: PROVENANCE_KIND.HOMEBREW } }
    } }]
  };
  const report = analyzeActorProvenance(actor);
  assert.equal(report.summary[PROVENANCE_KIND.HOMEBREW], 1);
  assert.equal(report.items[0].provenance.kind, PROVENANCE_KIND.HOMEBREW);
});

test("embedded effect resolves by name and prepares a self effect without applying it", async () => {
  const effect = {
    name: "Proteção", uuid: "Item.test.ActiveEffect.effect",
    toObject: () => ({ name: "Proteção", system: { changes: [{ key: "system.attributes.ac.value", value: 1 }] } })
  };
  const activity = {
    uuid: "Item.test.Activity.activity", item: {
      name: "Habilidade teste", uuid: "Item.test", actor: { uuid: "Actor.test" },
      effects: { find: predicate => predicate(effect) ? effect : null }
    }
  };
  assert.equal(resolveEmbeddedEffect(activity, { effectName: "proteção" }), effect);
  globalThis.ActiveEffect = { implementation: { forApplication: async changes => changes } };
  const prepared = await prepareEmbeddedEffectForActor(effect, activity, { id: "actor-test" }, { key: "test-key" });
  assert.equal(prepared.flags["fora-do-abismo-foundry"].automationKey, "test-key");
  assert.equal(prepared.system.origin.actor, "Actor.test");
  assert.equal(prepared._stats.duplicateSource, effect.uuid);
});

test("Jack soul tiers and cross-item references remain deterministic", () => {
  const actor = {
    system: { resources: { primary: { value: 27 } } },
    getFlag: () => ({ enabled: true })
  };
  const status = getJackSoulStatus(actor);
  assert.equal(status.ecos, true);
  assert.equal(status.fome, true);
  assert.equal(status.vitalidade, false);
  assert.equal(makeJarvisItemRef("Coleta de Almas"), "@jarvis:coleta-de-almas");
});

test("all older templates, skins and Forjas presets still validate", async () => {
  const builder = { validate: validateSceneBlueprint };
  const framework = new JarvisSceneFramework({ builder, presets: getCoreScenePresetDefinitions() });
  const result = await framework.selfTest();
  assert.equal(result.ok, true, JSON.stringify(result.failures));
  assert.equal(result.counts.templates, 7);
  assert.equal(result.counts.presets, 3);
  assert.ok(result.counts.skins >= 3);
});
