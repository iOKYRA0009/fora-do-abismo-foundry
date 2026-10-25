import test from "node:test";
import assert from "node:assert/strict";
import { compareJarvisVersions, runJarvisDiagnostics, formatJarvisDiagnostics } from "../scripts/diagnostics/health-check.js";
import { JarvisSceneBuilder } from "../scripts/scenes/scene-builder.js";
import { JarvisSceneFramework } from "../scripts/scenes/framework/scene-framework.js";
import { JarvisScenePackageBuilder } from "../scripts/scenes/package/scene-package-builder.js";
import { getCoreScenePresetDefinitions } from "../scripts/scenes/presets/core-presets.js";
import { convertUniversalVtt } from "../scripts/scenes/importers/universal-vtt.js";

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

function fakeApi() {
  const noWrite = () => { throw new Error("MÉTODO DE ESCRITA CHAMADO"); };
  return {
    version: "0.2.0-beta.16",
    importer: { importActor: noWrite, importItems: noWrite, importFromJson: noWrite },
    effects: { applyEmbedded: noWrite, removeApplied: noWrite },
    appearance: { status: () => ({ active: false, apiReady: false }) },
    transformation: { status: () => ({ active: false, apiReady: false }) },
    jack: { getSoulStatus: () => ({}) },
    provenance: { analyzeActor: () => ({ summary: {} }) },
    rules: { analyzeActor: () => ({ summary: {} }) },
    diagnostics: { compareActor: () => ({}) },
    scenes: {
      validate: () => true,
      preview: async () => ({ walls: 2, doors: 1, lights: 1, sounds: 1 }),
      build: noWrite,
      openStudio: noWrite,
      suggestRasterWalls: () => ({}),
      lightingPresets: () => [],
      applyLightingPreset: () => ({}),
      audit: () => ({}),
      framework: { selfTest: async () => ({ ok: true, counts: { templates: 7, skins: 4, presets: 3 } }) },
      package: {
        validate: () => true,
        preview: async () => ({ walls: 2, doors: 1, sounds: 1 }),
        build: noWrite,
        fromUvtt: () => ({}),
        previewUvtt: async () => ({ payload: { walls: [{}, {}] }, preview: { doors: 1, lights: 1 } }),
        buildUvtt: noWrite
      }
    }
  };
}

function fakeGame() {
  return {
    release: { generation: 14 }, system: { id: "dnd5e", version: "6.0.6" },
    modules: new Map([["fora-do-abismo-foundry", { active: true, version: "0.2.0-beta.16" }]]),
    actors: { contents: [{ id: "actor-1", name: "Teste em memória" }] }
  };
}

test("diagnostic exercises old and new previews without writing to a world", async () => {
  const report = await runJarvisDiagnostics(fakeApi(), { gameRef: fakeGame() });
  assert.equal(report.mode, "read-only");
  assert.equal(report.ok, true, formatJarvisDiagnostics(report));
  assert.equal(report.checks.find(check => check.id === "runtime").status, "warn");
  assert.equal(report.checks.find(check => check.id === "integracao-de-escrita").status, "skip");
  assert.equal(report.checks.find(check => check.id === "fichas-leitura").status, "pass");
});

test("diagnostic reports a missing old API rather than treating it as tested", async () => {
  const api = fakeApi();
  delete api.scenes.build;
  const report = await runJarvisDiagnostics(api, { gameRef: fakeGame(), inspectActors: false });
  assert.equal(report.ok, false);
  assert.match(report.checks.find(check => check.id === "api-legacy").detail, /scenes\.build/);
});

test("version comparison detects a new beta and treats a stable release as newer", () => {
  assert.equal(compareJarvisVersions("0.2.0-beta.16", "0.2.0-beta.15"), 1);
  assert.equal(compareJarvisVersions("0.2.0", "0.2.0-beta.16"), 1);
  assert.equal(compareJarvisVersions("0.2.0-beta.15", "0.2.0-beta.16"), -1);
  assert.equal(compareJarvisVersions("0.2.0-beta.16", "0.2.0-beta.16"), 0);
});

test("diagnostic reports a newer published manifest without installing anything", async () => {
  const world = fakeGame();
  world.modules.get("fora-do-abismo-foundry").version = "0.2.0-beta.15";
  world.modules.get("fora-do-abismo-foundry").manifest = "https://example.invalid/module.json";
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ version: "0.2.0-beta.16" }) });
  try {
    const report = await runJarvisDiagnostics(fakeApi(), { gameRef: world, inspectActors: false });
    assert.equal(report.checks.find(check => check.id === "updates").status, "warn");
    assert.match(report.checks.find(check => check.id === "updates").detail, /Atualização disponível/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("diagnostic previews pass against the real scene engines", async () => {
  const world = fakeGame();
  world.actors.contents = [];
  globalThis.game = world;
  const builder = new JarvisSceneBuilder();
  const framework = new JarvisSceneFramework({ builder, presets: getCoreScenePresetDefinitions() });
  const scenePackage = new JarvisScenePackageBuilder({ builder, framework });
  const api = fakeApi();
  api.scenes.validate = payload => builder.validate(payload);
  api.scenes.preview = payload => builder.preview(payload);
  api.scenes.framework.selfTest = options => framework.selfTest(options);
  api.scenes.package.validate = payload => scenePackage.validate(payload);
  api.scenes.package.preview = payload => scenePackage.preview(payload);
  api.scenes.package.previewUvtt = async source => {
    const converted = convertUniversalVtt(source);
    return { ...converted, preview: await scenePackage.preview(converted.payload) };
  };
  const report = await runJarvisDiagnostics(api, { gameRef: world, checkUpdates: false });
  assert.equal(report.ok, true, formatJarvisDiagnostics(report));
  for (const id of ["scene-builder-v1", "scene-framework-v2", "scene-package-v1", "universal-vtt", "map-studio"]) {
    assert.equal(report.checks.find(check => check.id === id).status, "pass", id);
  }
});
