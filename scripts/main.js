import { JarvisImporterV9 } from "./importer/v9/jarvis-importer-v9.js";
import { registerHybridFeatureLayout } from "./ui/hybrid-features.js";
import { registerMacroFileDrop } from "./ui/macro-file-drop.js";
import { registerActivityAutomation } from "./automation/activity-automation.js";
import { registerProgressionEngine } from "./progression/progression-engine.js";

const MODULE_ID = "fora-do-abismo-foundry";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Inicializando Jarvis Tools`);
  registerHybridFeatureLayout();
  registerMacroFileDrop();
  registerActivityAutomation();
  registerProgressionEngine();
});

Hooks.once("ready", () => {
  if (game.system?.id !== "dnd5e") {
    ui.notifications?.warn("Fora do Abismo — Jarvis Tools foi projetado para o sistema D&D 5e.");
  }

  const module = game.modules.get(MODULE_ID);
  const api = {
    importer: new JarvisImporterV9(),
    version: module?.version ?? "desconhecida"
  };

  if (module) module.api = api;

  console.log(
    `${MODULE_ID} | Jarvis Importer V9 ${api.version} disponível em game.modules.get(\"${MODULE_ID}\").api.importer`
  );
});
