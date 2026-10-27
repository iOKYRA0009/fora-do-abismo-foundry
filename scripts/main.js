import { JarvisImporterV9 } from "./importer/v9/jarvis-importer-v9.js";
import { registerHybridFeatureLayout } from "./ui/hybrid-features.js";
import { registerMacroFileDrop } from "./ui/macro-file-drop.js";
import { openJarvisConsole, registerJarvisConsoleControl } from "./ui/jarvis-console.js";
import { openUniversalVttImporter, registerUniversalVttControl } from "./ui/universal-vtt-importer.js";
import { openMapStudio, registerMapStudioControl } from "./ui/map-studio.js";
import { suggestRasterWalls } from "./scenes/raster-wall-assist.js";
import { applyLightingPreset, listLightingPresets } from "./scenes/lighting-presets.js";
import { auditScene } from "./scenes/scene-audit.js";
import { registerActivityAutomation } from "./automation/activity-automation.js";
import { getAppearanceChoreographyStatus, registerAppearanceEffectAutomation } from "./automation/appearance-effect-automation.js";
import {
  applyEmbeddedEffect,
  applyEmbeddedEffectToActor,
  prepareEmbeddedEffectForActor,
  removeAppliedEmbeddedEffect,
  removeAppliedEmbeddedEffectFromActor,
  resolveEmbeddedEffect
} from "./automation/embedded-effect-engine.js";
import {
  getJackSoulStatus,
  registerJackEngine,
  syncJackSoulTiers
} from "./automation/jack-engine.js";
import {
  applyAppearance,
  applyAppearanceToActor,
  getAppearanceProfiles,
  getAppearanceStatus,
  getAvailableAppearances,
  isAppearanceActive,
  removeAppearance,
  removeAppearanceFromActor,
  removeAppearanceProfile,
  revertAppearance,
  revertAppearanceForActor,
  setAppearanceProfile
} from "./integrations/visage-bridge.js";
import {
  buildLocalAppearance,
  createAudioEffect,
  createVisualEffect,
  getAppearancePackStatus,
  importVisageExport,
  installAppearancePack,
  installLocalAppearance,
  makeAppearancePack
} from "./integrations/appearance-pack.js";
import {
  getCurrentForm,
  getMainActor,
  getTransformationProfiles,
  getTransformationStatus,
  morphToken,
  openTransformationPicker,
  promptForm,
  removeTransformationProfile,
  revertToken,
  setTransformationProfile
} from "./integrations/metamorph-bridge.js";
import { applyActorProgressions, registerProgressionEngine } from "./progression/progression-engine.js";
import {
  analyzeActorProvenance,
  formatProvenanceReport,
  stampActorProvenance
} from "./provenance/content-provenance.js";
import {
  analyzeActorRulesProfile,
  DEFAULT_RULES_PROFILE,
  formatRulesProfileReport,
  setActorRulesProfile
} from "./rules/rules-profile.js";
import { JarvisSceneBuilder } from "./scenes/scene-builder.js";
import { JarvisSceneFramework } from "./scenes/framework/scene-framework.js";
import { getCoreScenePresetDefinitions } from "./scenes/presets/core-presets.js";
import { JarvisScenePackageBuilder } from "./scenes/package/scene-package-builder.js";
import { convertUniversalVtt } from "./scenes/importers/universal-vtt.js";
import { formatJarvisDiagnostics, runJarvisDiagnostics } from "./diagnostics/health-check.js";
import { compareActorToPayload } from "./diagnostics/actor-equivalence.js";

const MODULE_ID = "fora-do-abismo-foundry";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Inicializando Jarvis Tools`);
  registerHybridFeatureLayout();
  registerMacroFileDrop();
  registerJarvisConsoleControl();
  registerUniversalVttControl();
  registerMapStudioControl();
  registerActivityAutomation();
  registerAppearanceEffectAutomation();
  registerJackEngine();
  registerProgressionEngine();
});

Hooks.once("ready", () => {
  if (game.system?.id !== "dnd5e") {
    ui.notifications?.warn("Fora do Abismo — Jarvis Tools foi projetado para o sistema D&D 5e.");
  }

  const module = game.modules.get(MODULE_ID);
  const sceneBuilder = new JarvisSceneBuilder();
  const sceneFramework = new JarvisSceneFramework({
    builder: sceneBuilder,
    presets: getCoreScenePresetDefinitions()
  });
  const scenePackageBuilder = new JarvisScenePackageBuilder({
    builder: sceneBuilder,
    framework: sceneFramework
  });
  Hooks.on("deleteScene", scene => {
    void scenePackageBuilder.cleanupDeletedSceneManifest(scene).catch(error =>
      console.error(`${MODULE_ID} | Falha ao limpar Journal de Scene excluída`, error)
    );
  });
  const forjasKeys = ["forjas-01", "forjas-02", "forjas-03"];

  const api = {
    ui: { open: openJarvisConsole },
    importer: new JarvisImporterV9(),
    progression: { applyActor: applyActorProgressions },
    effects: {
      applyEmbedded: applyEmbeddedEffect,
      applyEmbeddedToActor: applyEmbeddedEffectToActor,
      prepareEmbedded: prepareEmbeddedEffectForActor,
      removeApplied: removeAppliedEmbeddedEffect,
      removeAppliedFromActor: removeAppliedEmbeddedEffectFromActor,
      resolveEmbedded: resolveEmbeddedEffect
    },
    appearance: {
      status: getAppearanceStatus,
      getProfiles: getAppearanceProfiles,
      setProfile: setAppearanceProfile,
      removeProfile: removeAppearanceProfile,
      apply: applyAppearance,
      applyToActor: applyAppearanceToActor,
      remove: removeAppearance,
      removeFromActor: removeAppearanceFromActor,
      revert: revertAppearance,
      revertActor: revertAppearanceForActor,
      getAvailable: getAvailableAppearances,
      isActive: isAppearanceActive,
      packStatus: getAppearancePackStatus,
      buildLocal: buildLocalAppearance,
      makePack: makeAppearancePack,
      visualEffect: createVisualEffect,
      audioEffect: createAudioEffect,
      installLocal: installLocalAppearance,
      installPack: installAppearancePack,
      importVisageExport,
      choreographyStatus: getAppearanceChoreographyStatus
    },
    transformation: {
      status: getTransformationStatus,
      getProfiles: getTransformationProfiles,
      setProfile: setTransformationProfile,
      removeProfile: removeTransformationProfile,
      morph: morphToken,
      revert: revertToken,
      getForm: getCurrentForm,
      getMainActor,
      promptForm,
      openPicker: openTransformationPicker
    },
    jack: {
      syncActor: syncJackSoulTiers,
      getSoulStatus: getJackSoulStatus
    },
    provenance: {
      analyzeActor: analyzeActorProvenance,
      stampActor: stampActorProvenance,
      formatReport: formatProvenanceReport
    },
    rules: {
      defaultProfile: DEFAULT_RULES_PROFILE,
      analyzeActor: analyzeActorRulesProfile,
      setActorProfile: setActorRulesProfile,
      formatReport: formatRulesProfileReport
    },
    scenes: {
      openImporter: openUniversalVttImporter,
      openStudio: openMapStudio,
      suggestRasterWalls,
      lightingPresets: listLightingPresets,
      applyLightingPreset,
      audit: (scene = globalThis.canvas?.scene) => auditScene(scene),
      // API V1 mantida por compatibilidade.
      validate: payload => sceneBuilder.validate(payload),
      preview: payload => sceneBuilder.preview(payload),
      build: (payload, options = {}) => sceneBuilder.build(payload, options),
      buildMany: (payloads, options = {}) => sceneBuilder.buildMany(payloads, options),

      // Scene Package V1 — pacote completo de Scene, visual, geometria e conteúdo.
      package: {
        version: scenePackageBuilder.version,
        fromUvtt: (source, options = {}) => convertUniversalVtt(source, options),
        previewUvtt: async (source, options = {}) => {
          const converted = convertUniversalVtt(source, options);
          return { ...converted, preview: await scenePackageBuilder.preview(converted.payload) };
        },
        buildUvtt: async (source, conversionOptions = {}, buildOptions = {}) => {
          const converted = convertUniversalVtt(source, conversionOptions);
          const result = await scenePackageBuilder.build(converted.payload, buildOptions);
          return { ...result, warnings: converted.warnings };
        },
        validate: payload => scenePackageBuilder.validate(payload),
        preview: (payload, options = {}) => scenePackageBuilder.preview(payload, options),
        build: (payload, options = {}) => scenePackageBuilder.build(payload, options),
        inspect: sceneRef => scenePackageBuilder.inspect(sceneRef),
        migrateLegacyManifests: () => scenePackageBuilder.migrateLegacyManifests(),
        cleanupDeletedSceneManifest: sceneRef => scenePackageBuilder.cleanupDeletedSceneManifest(sceneRef),
        repairRegions: (sceneRef, options = {}) => scenePackageBuilder.repairRegions(sceneRef, options),
        handleRegionEvent: context => scenePackageBuilder.handleRegionEvent(context),
        runAction: (sceneRef, key) => scenePackageBuilder.runAction(sceneRef, key)
      },

      // Scene Framework V2 — genérico e reutilizável.
      framework: {
        status: () => sceneFramework.status(),
        version: sceneFramework.version,
        templates: () => sceneFramework.listTemplates(),
        skins: () => sceneFramework.listSkins(),
        presets: () => sceneFramework.listPresets(),
        getPreset: key => sceneFramework.getPreset(key),
        previewPreset: key => sceneFramework.previewPreset(key),
        buildPreset: (key, options = {}) => sceneFramework.buildPreset(key, options),
        buildPresets: (keys, options = {}) => sceneFramework.buildPresets(keys, options),
        compose: spec => sceneFramework.compose(spec),
        previewSpec: spec => sceneFramework.previewSpec(spec),
        buildSpec: (spec, options = {}) => sceneFramework.buildSpec(spec, options),
        buildFromTemplate: (templateKey, config = {}, options = {}) =>
          sceneFramework.buildFromTemplate(templateKey, config, options),
        applySkin: (sceneRef, skinKey, options = {}) =>
          sceneFramework.applySkin(sceneRef, skinKey, options),
        inspect: sceneRef => sceneFramework.inspect(sceneRef),
        selfTest: (options = {}) => sceneFramework.selfTest(options),
        registerPreset: (key, definition) => sceneFramework.registerPreset(key, definition),
        unregisterPreset: key => sceneFramework.unregisterPreset(key)
      },

      // Atalhos de presets agora passam pelo Framework.
      presets: () => sceneFramework.listPresets(),
      getPreset: key => sceneFramework.getPreset(key),
      previewPreset: key => sceneFramework.previewPreset(key),
      buildPreset: (key, options = {}) => sceneFramework.buildPreset(key, options),
      buildForjas: (options = {}) => sceneFramework.buildPresets(forjasKeys, options),
      buildForjasVisual: (options = {}) => sceneFramework.buildPresets(
        forjasKeys,
        { ...options, includeBlueprintOverlay: false }
      ),
      buildForjasBlueprint: (options = {}) => sceneFramework.buildPresets(
        forjasKeys,
        { ...options, includeBlueprintOverlay: true }
      ),
      buildFromTemplate: (templateKey, config = {}, options = {}) =>
        sceneFramework.buildFromTemplate(templateKey, config, options),
      applySkin: (sceneRef, skinKey, options = {}) =>
        sceneFramework.applySkin(sceneRef, skinKey, options),
      inspect: sceneRef => sceneFramework.inspect(sceneRef)
    },
    version: module?.version ?? "desconhecida"
  };

  api.diagnostics = {
    run: options => runJarvisDiagnostics(api, options),
    format: formatJarvisDiagnostics,
    compareActor: compareActorToPayload
  };

  if (module) module.api = api;

  if (game.user?.isGM && game.users?.activeGM?.id === game.user.id) {
    void api.scenes.package.migrateLegacyManifests().then(report => {
      if (report.migrated) ui.notifications?.info(`Jarvis: ${report.migrated} manifesto(s) de mapa migrado(s) para Journal privado.`);
      if (report.failures.length) {
        ui.notifications?.warn(`Jarvis: ${report.failures.length} manifesto(s) antigo(s) exigem revisão. Veja o console.`);
        console.warn(`${MODULE_ID} | Migração de manifestos incompleta`, report.failures);
      }
    }).catch(error => {
      ui.notifications?.error(`Jarvis: falha ao migrar manifestos privados. ${error.message}`);
      console.error(`${MODULE_ID} | Migração de manifestos falhou`, error);
    });
  }

  const appearance = getAppearanceStatus();
  const transformation = getTransformationStatus();
  console.log(
    `${MODULE_ID} | Jarvis Importer V9 ${api.version} disponível. ` +
    `Visage=${appearance.active ? appearance.version : "inativo"} | ` +
    `Metamorph=${transformation.active ? transformation.version : "inativo"} | ` +
    `SceneFramework=${sceneFramework.version} | ScenePackage=${scenePackageBuilder.version} | Presets=${sceneFramework.listPresets().length} | Templates=${sceneFramework.listTemplates().length} | Skins=${sceneFramework.listSkins().length}`
  );
});
