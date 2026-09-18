import { JarvisImporterV9 } from "./importer/v9/jarvis-importer-v9.js";
import { registerHybridFeatureLayout } from "./ui/hybrid-features.js";
import { registerMacroFileDrop } from "./ui/macro-file-drop.js";
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
import { registerProgressionEngine } from "./progression/progression-engine.js";
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
import {
  getForjasScenePreset,
  listForjasScenePresets
} from "./scenes/forjas-presets.js";

const MODULE_ID = "fora-do-abismo-foundry";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Inicializando Jarvis Tools`);
  registerHybridFeatureLayout();
  registerMacroFileDrop();
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
  const forjasKeys = ["forjas-01", "forjas-02", "forjas-03"];

  const api = {
    importer: new JarvisImporterV9(),
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
      validate: payload => sceneBuilder.validate(payload),
      preview: payload => sceneBuilder.preview(payload),
      build: (payload, options = {}) => sceneBuilder.build(payload, options),
      buildMany: (payloads, options = {}) => sceneBuilder.buildMany(payloads, options),
      presets: listForjasScenePresets,
      getPreset: getForjasScenePreset,
      previewPreset: key => sceneBuilder.preview(getForjasScenePreset(key)),
      buildPreset: (key, options = {}) => sceneBuilder.build(getForjasScenePreset(key), options),
      buildForjas: (options = {}) => sceneBuilder.buildMany(
        forjasKeys.map(getForjasScenePreset),
        options
      )
    },
    version: module?.version ?? "desconhecida"
  };

  if (module) module.api = api;

  const appearance = getAppearanceStatus();
  const transformation = getTransformationStatus();
  console.log(
    `${MODULE_ID} | Jarvis Importer V9 ${api.version} disponível. ` +
    `Visage=${appearance.active ? appearance.version : "inativo"} | ` +
    `Metamorph=${transformation.active ? transformation.version : "inativo"} | ` +
    `SceneBuilder=${listForjasScenePresets().length} preset(s)`
  );
});
