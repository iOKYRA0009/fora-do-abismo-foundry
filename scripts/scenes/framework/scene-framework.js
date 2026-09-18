import {
  getCoreSceneTemplate,
  listCoreSceneTemplates
} from "../templates/core-templates.js";
import {
  applySceneSkinToBlueprint,
  getCoreSceneSkin,
  listCoreSceneSkins
} from "../skins/core-skins.js";

const MODULE_ID = "fora-do-abismo-foundry";
const FRAMEWORK_VERSION = "2.0";

function clone(value) {
  return foundry.utils.deepClone(value);
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function merge(base = {}, override = {}) {
  return foundry.utils.mergeObject(clone(base), clone(override), {
    inplace: false,
    insertKeys: true,
    overwrite: true,
    recursive: true
  });
}

function sceneByRef(ref) {
  if (!ref) return globalThis.canvas?.scene ?? null;
  if (typeof ref === "string") {
    return game.scenes.get(ref)
      ?? game.scenes.find(scene => scene.name === ref)
      ?? null;
  }
  if (ref.documentName === "Scene") return ref;
  return null;
}

function backgroundTiles(scene) {
  return scene?.tiles?.contents?.filter(tile =>
    Boolean(tile.getFlag(MODULE_ID, "sceneBackground"))
  ) ?? [];
}

function getGridData(scene) {
  const raw = scene?.grid?.toObject?.() ?? scene?.grid ?? {};
  return clone(raw);
}

function arrayMode(base, override, replace = false) {
  if (replace) return clone(override ?? []);
  return [...clone(base ?? []), ...clone(override ?? [])];
}

export class JarvisSceneFramework {
  constructor({ builder, presets = {} } = {}) {
    if (!builder) throw new Error("Jarvis Scene Framework exige uma instância de JarvisSceneBuilder.");
    this.builder = builder;
    this.presets = new Map();

    for (const [key, definition] of Object.entries(presets)) {
      this.registerPreset(key, definition);
    }
  }

  get version() {
    return FRAMEWORK_VERSION;
  }

  registerPreset(key, definition) {
    const normalized = normalizeKey(key);
    if (!normalized) throw new Error("Preset precisa de uma chave não vazia.");

    let loader;
    let meta = {};

    if (typeof definition === "function") {
      loader = definition;
    } else if (definition && typeof definition === "object") {
      if (typeof definition.loader === "function") loader = definition.loader;
      else if (definition.blueprint) loader = () => clone(definition.blueprint);
      else loader = () => clone(definition);
      meta = clone(definition.meta ?? {});
    }

    if (!loader) throw new Error(`Preset '${key}' não possui loader ou blueprint válido.`);

    this.presets.set(normalized, { key: normalized, loader, meta });
    return normalized;
  }

  unregisterPreset(key) {
    return this.presets.delete(normalizeKey(key));
  }

  listPresets() {
    return [...this.presets.values()].map(entry => {
      const blueprint = entry.loader();
      return {
        key: entry.key,
        id: blueprint.id ?? null,
        name: blueprint.scene?.name ?? entry.key,
        template: blueprint.metadata?.sceneFramework?.template ?? entry.meta.template ?? null,
        skin: blueprint.metadata?.sceneFramework?.skin ?? entry.meta.skin ?? null,
        purpose: blueprint.metadata?.purpose ?? entry.meta.purpose ?? "",
        tags: [...(entry.meta.tags ?? [])]
      };
    });
  }

  getPreset(key) {
    const entry = this.presets.get(normalizeKey(key));
    if (!entry) throw new Error(`Preset de Scene desconhecido: '${key}'.`);
    return clone(entry.loader());
  }

  listTemplates() {
    return listCoreSceneTemplates();
  }

  listSkins() {
    return listCoreSceneSkins();
  }

  compose(spec = {}) {
    if (!spec || typeof spec !== "object") {
      throw new Error("Scene Framework: compose exige um objeto.");
    }

    if (spec.schemaVersion && spec.schemaVersion !== FRAMEWORK_VERSION) {
      throw new Error(`Scene Framework: schemaVersion esperado '${FRAMEWORK_VERSION}'.`);
    }

    const templateKey = normalizeKey(spec.template ?? "blank");
    const template = getCoreSceneTemplate(templateKey);
    const templateConfig = merge(spec.scene ?? {}, spec.config ?? {});
    const generated = template.generate(templateConfig);

    const sceneOverrides = spec.scene ?? {};
    const replaceGeometry = Boolean(spec.replaceTemplateGeometry);

    let blueprint = {
      schemaVersion: "1.0",
      id: spec.id ?? `scene-${crypto.randomUUID?.() ?? Date.now()}`,
      metadata: merge(spec.metadata ?? {}, {
        sceneFramework: {
          version: FRAMEWORK_VERSION,
          template: templateKey,
          skin: spec.skin ? normalizeKey(spec.skin) : null
        }
      }),
      scene: merge(generated.scene ?? {}, sceneOverrides),
      walls: arrayMode(generated.walls, spec.walls, replaceGeometry),
      drawings: arrayMode(generated.drawings, spec.drawings, replaceGeometry),
      lights: arrayMode(generated.lights, spec.lights, replaceGeometry),
      tokens: arrayMode(generated.tokens, spec.tokens, replaceGeometry)
    };

    if (!blueprint.scene.name) {
      blueprint.scene.name = spec.name ?? template.label;
    }

    if (spec.folder && !blueprint.scene.folder) blueprint.scene.folder = spec.folder;

    if (spec.skin) {
      blueprint = applySceneSkinToBlueprint(
        blueprint,
        normalizeKey(spec.skin),
        spec.visual ?? {}
      );
    } else if (spec.visual) {
      blueprint.scene = merge(blueprint.scene, spec.visual.scene ?? {});
      if (spec.visual.backgroundSrc !== undefined) {
        blueprint.scene.backgroundSrc = spec.visual.backgroundSrc;
        blueprint.scene.visualMode = Boolean(spec.visual.backgroundSrc);
      }
      if (spec.visual.backgroundFallbackSrc !== undefined) {
        blueprint.scene.backgroundFallbackSrc = spec.visual.backgroundFallbackSrc;
      }
    }

    return blueprint;
  }

  async previewSpec(spec) {
    return this.builder.preview(this.compose(spec));
  }

  async buildSpec(spec, options = {}) {
    return this.builder.build(this.compose(spec), options);
  }

  async buildFromTemplate(templateKey, config = {}, options = {}) {
    const spec = {
      schemaVersion: FRAMEWORK_VERSION,
      template: templateKey,
      ...clone(config)
    };
    return this.buildSpec(spec, options);
  }

  async previewPreset(key) {
    return this.builder.preview(this.getPreset(key));
  }

  async buildPreset(key, options = {}) {
    return this.builder.build(this.getPreset(key), options);
  }

  async buildPresets(keys = [], options = {}) {
    if (!Array.isArray(keys) || !keys.length) {
      throw new Error("Scene Framework: buildPresets exige pelo menos uma chave.");
    }
    return this.builder.buildMany(keys.map(key => this.getPreset(key)), options);
  }

  async applySkin(sceneRef, skinKey, {
    backgroundSrc,
    backgroundFallbackSrc,
    replaceBackground = true
  } = {}) {
    if (!game.user?.isGM) throw new Error("Scene Framework: apenas o GM pode alterar skins.");

    const scene = sceneByRef(sceneRef);
    if (!scene) throw new Error("Scene Framework: Scene não encontrada.");

    const skin = getCoreSceneSkin(skinKey);
    const sceneDefaults = skin.scene ?? {};
    const grid = merge(getGridData(scene), sceneDefaults.grid ?? {});

    await scene.update({
      backgroundColor: sceneDefaults.backgroundColor ?? scene.backgroundColor,
      grid
    });

    if (replaceBackground && (backgroundSrc || backgroundFallbackSrc)) {
      const existing = backgroundTiles(scene);
      if (existing.length) {
        await scene.deleteEmbeddedDocuments("Tile", existing.map(tile => tile.id));
      }

      const src = String(backgroundSrc ?? backgroundFallbackSrc ?? "").trim();
      if (src) {
        await scene.createEmbeddedDocuments("Tile", [{
          name: "Jarvis — Background Visual",
          x: Math.round(scene.width / 2),
          y: Math.round(scene.height / 2),
          width: scene.width,
          height: scene.height,
          anchorX: 0.5,
          anchorY: 0.5,
          alpha: 1,
          rotation: 0,
          hidden: false,
          locked: true,
          sort: -100000,
          overhead: false,
          texture: { src, scaleX: 1, scaleY: 1 },
          flags: {
            [MODULE_ID]: {
              sceneBackground: true,
              frameworkVersion: FRAMEWORK_VERSION,
              skin: normalizeKey(skinKey),
              fallbackSrc: backgroundFallbackSrc ?? null
            }
          }
        }]);
      }
    }

    await scene.setFlag(MODULE_ID, "sceneFramework", {
      version: FRAMEWORK_VERSION,
      skin: normalizeKey(skinKey),
      updatedAt: Date.now()
    });

    return this.inspect(scene);
  }

  inspect(sceneRef) {
    const scene = sceneByRef(sceneRef);
    if (!scene) throw new Error("Scene Framework: Scene não encontrada.");

    const tiles = backgroundTiles(scene);
    const diagnostics = tiles.map(tile => ({
      id: tile.id,
      name: tile.name,
      src: tile.texture?.src ?? "",
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
      anchorX: tile.anchorX,
      anchorY: tile.anchorY,
      fullCanvas:
        tile.x === Math.round(scene.width / 2)
        && tile.y === Math.round(scene.height / 2)
        && tile.width === scene.width
        && tile.height === scene.height
        && tile.anchorX === 0.5
        && tile.anchorY === 0.5
    }));

    return {
      id: scene.id,
      name: scene.name,
      width: scene.width,
      height: scene.height,
      grid: getGridData(scene),
      counts: {
        walls: scene.walls?.size ?? 0,
        doors: scene.walls?.filter?.(wall => wall.door !== CONST.WALL_DOOR_TYPES.NONE)?.length ?? 0,
        lights: scene.lights?.size ?? 0,
        tokens: scene.tokens?.size ?? 0,
        drawings: scene.drawings?.size ?? 0,
        tiles: scene.tiles?.size ?? 0,
        backgroundTiles: tiles.length
      },
      backgroundTiles: diagnostics,
      healthy: tiles.length <= 1 && diagnostics.every(tile => tile.fullCanvas)
    };
  }

  async selfTest({ checkActors = false } = {}) {
    const checks = [];
    const failures = [];

    for (const template of this.listTemplates()) {
      try {
        const blueprint = this.compose({
          schemaVersion: FRAMEWORK_VERSION,
          template: template.key,
          scene: {
            name: `Self Test — ${template.key}`,
            columns: template.defaults?.columns,
            rows: template.defaults?.rows
          }
        });
        this.builder.validate(blueprint);
        checks.push({ type: "template", key: template.key, ok: true });
      } catch (error) {
        failures.push({ type: "template", key: template.key, error: error.message });
      }
    }

    for (const skin of this.listSkins()) {
      try {
        const blueprint = this.compose({
          schemaVersion: FRAMEWORK_VERSION,
          template: "blank",
          skin: skin.key,
          scene: { name: `Self Test Skin — ${skin.key}` }
        });
        this.builder.validate(blueprint);
        checks.push({ type: "skin", key: skin.key, ok: true });
      } catch (error) {
        failures.push({ type: "skin", key: skin.key, error: error.message });
      }
    }

    for (const preset of this.listPresets()) {
      try {
        const blueprint = this.getPreset(preset.key);
        if (checkActors) await this.builder.preview(blueprint);
        else this.builder.validate(blueprint);
        checks.push({ type: "preset", key: preset.key, ok: true });
      } catch (error) {
        failures.push({ type: "preset", key: preset.key, error: error.message });
      }
    }

    return {
      ok: failures.length === 0,
      version: FRAMEWORK_VERSION,
      checks,
      failures,
      counts: {
        templates: this.listTemplates().length,
        skins: this.listSkins().length,
        presets: this.listPresets().length
      }
    };
  }

  status() {
    return {
      version: FRAMEWORK_VERSION,
      presets: this.listPresets(),
      templates: this.listTemplates(),
      skins: this.listSkins()
    };
  }
}
