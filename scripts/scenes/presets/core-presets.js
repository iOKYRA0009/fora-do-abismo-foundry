import { getForjasScenePreset } from "../forjas-presets.js";

function clone(value) {
  return foundry.utils.deepClone(value);
}

function annotateForFramework(blueprint, template, skin) {
  const result = clone(blueprint);
  result.metadata ??= {};
  result.metadata.sceneFramework = {
    version: "2.0",
    template,
    skin,
    migratedFrom: "scene-blueprint-v1"
  };
  return result;
}

export function getCoreScenePresetDefinitions() {
  return {
    "forjas-01": {
      loader: () => annotateForFramework(
        getForjasScenePreset("forjas-01"),
        "industrial_forge",
        "dark_forge"
      ),
      meta: {
        template: "industrial_forge",
        skin: "dark_forge",
        tags: ["forjas", "industrial", "social", "exploration"]
      }
    },

    "forjas-02": {
      loader: () => annotateForFramework(
        getForjasScenePreset("forjas-02"),
        "investigation_site",
        "eldritch_archive"
      ),
      meta: {
        template: "investigation_site",
        skin: "eldritch_archive",
        tags: ["forjas", "investigation", "elf", "archive"]
      }
    },

    "forjas-03": {
      loader: () => annotateForFramework(
        getForjasScenePreset("forjas-03"),
        "boss_arena",
        "dark_forge"
      ),
      meta: {
        template: "boss_arena",
        skin: "dark_forge",
        tags: ["forjas", "boss", "revelation", "nicolau"]
      }
    }
  };
}
