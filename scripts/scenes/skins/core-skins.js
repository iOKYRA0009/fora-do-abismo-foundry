function clone(value) {
  return foundry.utils.deepClone(value);
}

function mergeObjects(base = {}, override = {}) {
  return foundry.utils.mergeObject(clone(base), clone(override), {
    inplace: false,
    insertKeys: true,
    overwrite: true,
    recursive: true
  });
}

export const CORE_SCENE_SKINS = Object.freeze({
  neutral_dark: {
    label: "Dark Neutral",
    description: "Base escura neutra para qualquer cena de fantasia sombria.",
    tags: ["dark-fantasy", "neutral", "generic"],
    scene: {
      backgroundColor: "#0b0a0b",
      grid: { color: "#59535a", alpha: 0.07, thickness: 1 }
    },
    light: {
      color: "#c9925a",
      alpha: 0.20,
      luminosity: 0.18,
      contrast: 0.08,
      shadows: 0.30
    }
  },

  underdark_stone: {
    label: "Pedra do Underdark",
    description: "Pedra profunda, umidade, fungos discretos e arquitetura subterrânea de D&D.",
    tags: ["underdark", "stone", "dnd", "dark-fantasy"],
    scene: {
      backgroundColor: "#08090b",
      grid: { color: "#495158", alpha: 0.065, thickness: 1 }
    },
    light: {
      color: "#7b9ea3",
      alpha: 0.18,
      luminosity: 0.16,
      contrast: 0.10,
      shadows: 0.34
    }
  },

  dark_forge: {
    label: "Forja Sombria",
    description: "Pedra vulcânica, ferro antigo, escória, fuligem e calor localizado.",
    tags: ["forge", "industrial", "underdark", "fire", "dark-fantasy"],
    scene: {
      backgroundColor: "#090705",
      grid: { color: "#59483e", alpha: 0.07, thickness: 1 }
    },
    light: {
      color: "#d65f27",
      alpha: 0.23,
      luminosity: 0.20,
      contrast: 0.08,
      shadows: 0.30
    }
  },

  eldritch_archive: {
    label: "Arquivo Arcano Decadente",
    description: "Arquivo antigo, cristais frios, conhecimento aprisionado e estranheza sutil.",
    tags: ["archive", "arcane", "eldritch", "investigation", "dark-fantasy"],
    scene: {
      backgroundColor: "#08090b",
      grid: { color: "#534b63", alpha: 0.065, thickness: 1 }
    },
    light: {
      color: "#7257a8",
      alpha: 0.20,
      luminosity: 0.18,
      contrast: 0.08,
      shadows: 0.34
    }
  },

  ancient_elf_ruin: {
    label: "Ruína Élfica Antiga",
    description: "Elegância élfica quebrada, pedra clara suja, metal velho e inscrições antigas.",
    tags: ["elf", "ruin", "ancient", "underdark", "mystery"],
    scene: {
      backgroundColor: "#0b0d0f",
      grid: { color: "#5d6068", alpha: 0.06, thickness: 1 }
    },
    light: {
      color: "#8c79b5",
      alpha: 0.18,
      luminosity: 0.17,
      contrast: 0.08,
      shadows: 0.31
    }
  },

  warm_tavern: {
    label: "Taverna Quente",
    description: "Madeira, pedra, braseiros e iluminação quente de descanso.",
    tags: ["tavern", "social", "warm", "fantasy"],
    scene: {
      backgroundColor: "#110c08",
      grid: { color: "#6a5848", alpha: 0.055, thickness: 1 }
    },
    light: {
      color: "#e2a25f",
      alpha: 0.20,
      luminosity: 0.20,
      contrast: 0.05,
      shadows: 0.24
    }
  },

  cosmic_corruption: {
    label: "Corrupção Cósmica",
    description: "Estranheza de geometria, material e sombra sem depender de gore ou tentáculos.",
    tags: ["cosmic-horror", "surreal", "corruption", "dark-fantasy"],
    scene: {
      backgroundColor: "#08070a",
      grid: { color: "#61566f", alpha: 0.055, thickness: 1 }
    },
    light: {
      color: "#76548f",
      alpha: 0.17,
      luminosity: 0.14,
      contrast: 0.14,
      shadows: 0.42
    }
  }
});

export function listCoreSceneSkins() {
  return Object.entries(CORE_SCENE_SKINS).map(([key, skin]) => ({
    key,
    label: skin.label,
    description: skin.description,
    tags: [...(skin.tags ?? [])]
  }));
}

export function getCoreSceneSkin(key) {
  const skin = CORE_SCENE_SKINS[String(key ?? "").trim().toLowerCase()];
  if (!skin) throw new Error(`Skin de Scene desconhecida: '${key}'.`);
  return skin;
}

export function applySceneSkinToBlueprint(blueprint, key, overrides = {}) {
  const skin = getCoreSceneSkin(key);
  const result = clone(blueprint);

  result.metadata ??= {};
  result.metadata.sceneFramework ??= {};
  result.metadata.sceneFramework.skin = String(key);

  result.scene = mergeObjects(skin.scene ?? {}, result.scene ?? {});

  if (overrides.scene) result.scene = mergeObjects(result.scene, overrides.scene);

  if (overrides.backgroundSrc !== undefined) {
    result.scene.backgroundSrc = overrides.backgroundSrc;
    result.scene.visualMode = Boolean(overrides.backgroundSrc);
  }
  if (overrides.backgroundFallbackSrc !== undefined) {
    result.scene.backgroundFallbackSrc = overrides.backgroundFallbackSrc;
  }

  result.lights = (result.lights ?? []).map(light =>
    mergeObjects(skin.light ?? {}, light)
  );

  result.metadata.sceneFramework.skinDescriptor = {
    label: skin.label,
    tags: [...(skin.tags ?? [])],
    defaultLight: clone(skin.light ?? {})
  };

  return result;
}
