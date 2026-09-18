import {
  SceneBlueprintValidationError,
  validateSceneBlueprint
} from "./scene-blueprint-validator.js";

const MODULE_ID = "fora-do-abismo-foundry";

function clone(value) {
  return foundry.utils.deepClone(value);
}

function px(value, gridSize) {
  return Math.round(Number(value) * gridSize);
}

function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getDoorType(type) {
  if (type === "door") return CONST.WALL_DOOR_TYPES.DOOR;
  if (type === "secret") return CONST.WALL_DOOR_TYPES.SECRET;
  return CONST.WALL_DOOR_TYPES.NONE;
}

function getDoorState(state) {
  if (state === "open") return CONST.WALL_DOOR_STATES.OPEN;
  if (state === "locked") return CONST.WALL_DOOR_STATES.LOCKED;
  return CONST.WALL_DOOR_STATES.CLOSED;
}

function getDisposition(value) {
  const key = String(value ?? "neutral").toUpperCase();
  return CONST.TOKEN_DISPOSITIONS[key] ?? CONST.TOKEN_DISPOSITIONS.NEUTRAL;
}

async function resolveActor(ref) {
  if (ref.actorUuid) {
    const document = await fromUuid(ref.actorUuid, { strict: false });
    if (document?.documentName === "Actor") return document;
  }

  if (ref.actorId) {
    const byId = game.actors.get(ref.actorId);
    if (byId) return byId;
  }

  const wanted = normalizeName(ref.actor);
  if (!wanted) return null;

  const exact = game.actors.find(actor => normalizeName(actor.name) === wanted) ?? null;
  if (exact) return exact;

  return null;
}

async function resolveFolder(sceneSpec = {}, { createFolder = true } = {}) {
  const folderName = String(sceneSpec.folder ?? "").trim();
  if (!folderName) return null;

  const existing = game.folders.find(folder => folder.type === "Scene" && folder.name === folderName);
  if (existing) return existing;
  if (!createFolder) return null;

  return Folder.implementation.create({
    name: folderName,
    type: "Scene",
    sorting: "a"
  });
}

function buildWallData(walls = [], gridSize) {
  const normalSense = CONST.EDGE_SENSE_TYPES?.NORMAL ?? 20;
  const normalMove = CONST.WALL_MOVEMENT_TYPES?.NORMAL ?? 20;

  return walls.map((wall, index) => ({
    c: [px(wall.a[0], gridSize), px(wall.a[1], gridSize), px(wall.b[0], gridSize), px(wall.b[1], gridSize)],
    door: getDoorType(wall.type),
    ds: getDoorState(wall.state),
    move: wall.move === false ? (CONST.WALL_MOVEMENT_TYPES?.NONE ?? 0) : normalMove,
    light: wall.light === false ? (CONST.EDGE_SENSE_TYPES?.NONE ?? 0) : normalSense,
    sight: wall.sight === false ? (CONST.EDGE_SENSE_TYPES?.NONE ?? 0) : normalSense,
    sound: wall.sound === false ? (CONST.EDGE_SENSE_TYPES?.NONE ?? 0) : normalSense,
    dir: Number(wall.dir ?? 0),
    flags: {
      [MODULE_ID]: {
        sceneBlueprint: true,
        semanticType: wall.type ?? "wall",
        sourceIndex: index
      }
    }
  }));
}

function drawingDefaults(kind) {
  if (kind === "gm") {
    return {
      fillColor: "#6c3483",
      fillAlpha: 0.18,
      strokeColor: "#d2b4de",
      strokeAlpha: 0.9,
      textColor: "#ffffff",
      textAlpha: 1,
      hidden: true
    };
  }
  if (kind === "zone") {
    return {
      fillColor: "#4a3526",
      fillAlpha: 0.28,
      strokeColor: "#8f6f53",
      strokeAlpha: 0.65,
      textColor: "#e8dccb",
      textAlpha: 0.75,
      hidden: false
    };
  }
  return {
    fillColor: "#211c1a",
    fillAlpha: 0.9,
    strokeColor: "#4d4038",
    strokeAlpha: 0.75,
    textColor: "#d8ccc0",
    textAlpha: 0.5,
    hidden: false
  };
}

function getRectangleDrawingType() {
  return foundry.data?.ShapeData?.TYPES?.RECTANGLE
    ?? CONFIG.Canvas?.drawingTypes?.RECTANGLE
    ?? "r";
}

function buildDrawingData(drawings = [], gridSize) {
  return drawings.map((drawing, index) => {
    const defaults = drawingDefaults(drawing.kind ?? "floor");
    return {
      name: drawing.name ?? `Blueprint ${index + 1}`,
      x: px(drawing.x, gridSize),
      y: px(drawing.y, gridSize),
      shape: {
        type: getRectangleDrawingType(),
        width: px(drawing.w, gridSize),
        height: px(drawing.h, gridSize)
      },
      fillType: CONST.DRAWING_FILL_TYPES.SOLID,
      fillColor: drawing.fillColor ?? defaults.fillColor,
      fillAlpha: Number(drawing.fillAlpha ?? defaults.fillAlpha),
      strokeColor: drawing.strokeColor ?? defaults.strokeColor,
      strokeAlpha: Number(drawing.strokeAlpha ?? defaults.strokeAlpha),
      strokeWidth: Number(drawing.strokeWidth ?? Math.max(2, Math.round(gridSize / 25))),
      text: String(drawing.text ?? drawing.name ?? ""),
      textColor: drawing.textColor ?? defaults.textColor,
      textAlpha: Number(drawing.textAlpha ?? defaults.textAlpha),
      fontSize: Number(drawing.fontSize ?? Math.max(18, Math.round(gridSize / 3))),
      hidden: Boolean(drawing.hidden ?? defaults.hidden),
      locked: Boolean(drawing.locked ?? true),
      flags: {
        [MODULE_ID]: {
          sceneBlueprint: true,
          semanticType: drawing.kind ?? "floor",
          sourceIndex: index
        }
      }
    };
  });
}

function buildBackgroundTileData(scene = {}, gridSize) {
  const preferred = String(scene.backgroundSrc ?? "").trim();
  const fallback = String(scene.backgroundFallbackSrc ?? "").trim();
  const sources = [];

  if (fallback && fallback !== preferred) {
    sources.push({ src: fallback, name: "Jarvis — Background Fallback", sort: -100001, fallback: true });
  }
  if (preferred) {
    sources.push({ src: preferred, name: "Jarvis — Background Visual", sort: -100000, fallback: false });
  } else if (fallback) {
    sources.push({ src: fallback, name: "Jarvis — Background Visual", sort: -100000, fallback: true });
  }

  return sources.map(source => ({
    name: source.name,
    x: 0,
    y: 0,
    width: Number(scene.columns) * gridSize,
    height: Number(scene.rows) * gridSize,
    anchorX: 0,
    anchorY: 0,
    alpha: 1,
    rotation: 0,
    hidden: false,
    locked: true,
    sort: source.sort,
    texture: {
      src: source.src
    },
    flags: {
      [MODULE_ID]: {
        sceneBackground: true,
        fallback: source.fallback,
        rasterPreferred: preferred || null,
        fallbackSrc: fallback || null
      }
    }
  }));
}

function buildLightData(lights = [], gridSize) {
  return lights.map((light, index) => ({
    name: light.name ?? `Luz ${index + 1}`,
    x: px(light.x, gridSize),
    y: px(light.y, gridSize),
    hidden: Boolean(light.hidden),
    locked: true,
    walls: light.walls !== false,
    vision: Boolean(light.vision),
    config: {
      dim: Number(light.dim ?? 0),
      bright: Number(light.bright ?? 0),
      angle: Number(light.angle ?? 360),
      alpha: Number(light.alpha ?? 0.45),
      color: light.color ?? "#d46a2f",
      attenuation: Number(light.attenuation ?? 0.45),
      luminosity: Number(light.luminosity ?? 0.35),
      saturation: Number(light.saturation ?? 0),
      contrast: Number(light.contrast ?? 0.15),
      shadows: Number(light.shadows ?? 0.35),
      animation: clone(light.animation ?? {})
    },
    flags: {
      [MODULE_ID]: {
        sceneBlueprint: true,
        sourceIndex: index
      }
    }
  }));
}

async function buildTokenData(tokens = [], gridSize) {
  const resolved = [];
  const missing = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const spec = tokens[index];
    const actor = await resolveActor(spec);
    if (!actor) {
      missing.push(spec.actor ?? spec.actorId ?? spec.actorUuid ?? `token #${index + 1}`);
      continue;
    }

    const tokenDocument = await actor.getTokenDocument({
      x: px(spec.x, gridSize),
      y: px(spec.y, gridSize),
      hidden: Boolean(spec.hidden),
      disposition: getDisposition(spec.disposition),
      name: spec.name ?? actor.name,
      elevation: Number(spec.elevation ?? 0),
      rotation: Number(spec.rotation ?? 0)
    });

    const data = tokenDocument.toObject();
    delete data._id;
    data.actorId = actor.id;
    data.actorLink = spec.actorLink ?? data.actorLink ?? false;
    if (spec.width !== undefined) data.width = Number(spec.width);
    if (spec.height !== undefined) data.height = Number(spec.height);
    data.flags ??= {};
    data.flags[MODULE_ID] = {
      ...(data.flags[MODULE_ID] ?? {}),
      sceneBlueprint: true,
      sourceIndex: index,
      role: spec.role ?? null
    };
    resolved.push(data);
  }

  return { resolved, missing };
}

function buildSceneData(payload, folder, tokenData, { includeBlueprintOverlay = false } = {}) {
  const scene = payload.scene;
  const grid = scene.grid ?? {};
  const size = Number(grid.size ?? 100);

  const includeDrawings = includeBlueprintOverlay || !Boolean(scene.visualMode);

  return {
    name: scene.name,
    folder: folder?.id ?? null,
    width: Number(scene.columns) * size,
    height: Number(scene.rows) * size,
    padding: Number(scene.padding ?? 0),
    navigation: Boolean(scene.navigation ?? false),
    navName: scene.navName ?? scene.name,
    tokenVision: scene.tokenVision !== false,
    backgroundColor: scene.backgroundColor ?? "#090807",
    initial: {
      x: Math.round((Number(scene.columns) * size) / 2),
      y: Math.round((Number(scene.rows) * size) / 2),
      scale: null
    },
    grid: {
      type: CONST.GRID_TYPES.SQUARE,
      size,
      distance: Number(grid.distance ?? 5),
      units: grid.units ?? "ft",
      color: grid.color ?? "#000000",
      alpha: Number(grid.alpha ?? 0.2),
      thickness: Number(grid.thickness ?? 1)
    },
    tiles: Boolean(scene.visualMode) ? buildBackgroundTileData(scene, size) : [],
    walls: buildWallData(payload.walls ?? [], size),
    drawings: includeDrawings ? buildDrawingData(payload.drawings ?? [], size) : [],
    lights: buildLightData(payload.lights ?? [], size),
    tokens: tokenData,
    flags: {
      [MODULE_ID]: {
        sceneBuilder: {
          schemaVersion: payload.schemaVersion,
          blueprintId: payload.id ?? null,
          builtAt: Date.now(),
          metadata: clone(payload.metadata ?? {})
        }
      }
    }
  };
}

function findExistingScene(name) {
  const wanted = normalizeName(name);
  return game.scenes.find(scene => normalizeName(scene.name) === wanted) ?? null;
}

function formatSummary(payload, { missing = [] } = {}) {
  return {
    id: payload.id ?? null,
    name: payload.scene?.name ?? "Sem nome",
    size: `${payload.scene?.columns ?? "?"}x${payload.scene?.rows ?? "?"}`,
    walls: payload.walls?.length ?? 0,
    doors: payload.walls?.filter(w => w.type === "door" || w.type === "secret").length ?? 0,
    drawings: payload.drawings?.length ?? 0,
    lights: payload.lights?.length ?? 0,
    tokens: payload.tokens?.length ?? 0,
    missingActors: [...missing]
  };
}

export class JarvisSceneBuilder {
  validate(payload) {
    return validateSceneBlueprint(payload);
  }

  async preview(payload) {
    validateSceneBlueprint(payload);
    const gridSize = Number(payload.scene.grid?.size ?? 100);
    const { missing } = await buildTokenData(payload.tokens ?? [], gridSize);
    return formatSummary(payload, { missing });
  }

  async build(payload, {
    replaceExisting = false,
    createFolder = true,
    allowMissingActors = false,
    activate = false,
    view = true,
    includeBlueprintOverlay = false
  } = {}) {
    if (!game.user?.isGM) throw new Error("Jarvis Scene Builder: apenas o GM pode criar Scenes.");
    validateSceneBlueprint(payload);

    const existing = findExistingScene(payload.scene.name);
    if (existing && !replaceExisting) {
      throw new Error(`Jarvis Scene Builder: a Scene '${payload.scene.name}' já existe. Use replaceExisting: true para recriá-la.`);
    }

    const gridSize = Number(payload.scene.grid?.size ?? 100);
    const { resolved: tokenData, missing } = await buildTokenData(payload.tokens ?? [], gridSize);
    if (missing.length && !allowMissingActors) {
      throw new Error(
        `Jarvis Scene Builder: Actors não encontrados: ${missing.join(", ")}. ` +
        "A Scene não foi criada; corrija os nomes ou use allowMissingActors: true."
      );
    }

    const folder = await resolveFolder(payload.scene, { createFolder });

    if (existing && replaceExisting) await existing.delete();

    const sceneData = buildSceneData(payload, folder, tokenData, { includeBlueprintOverlay });
    const embedded = {
      tiles: sceneData.tiles ?? [],
      walls: sceneData.walls ?? [],
      drawings: sceneData.drawings ?? [],
      lights: sceneData.lights ?? [],
      tokens: sceneData.tokens ?? []
    };
    delete sceneData.tiles;
    delete sceneData.walls;
    delete sceneData.drawings;
    delete sceneData.lights;
    delete sceneData.tokens;

    let created;
    try {
      created = await Scene.implementation.create(sceneData, { renderSheet: false });
      if (!created) throw new Error("Foundry não retornou o documento Scene base.");

      const batches = [
        ["Tile", embedded.tiles],
        ["Wall", embedded.walls],
        ["Drawing", embedded.drawings],
        ["AmbientLight", embedded.lights],
        ["Token", embedded.tokens]
      ];

      for (const [documentName, documents] of batches) {
        if (!documents.length) continue;
        try {
          const result = await created.createEmbeddedDocuments(documentName, documents);
          if (!Array.isArray(result) || result.length !== documents.length) {
            throw new Error(
              `criação incompleta de ${documentName}: esperado ${documents.length}, criado ${result?.length ?? 0}`
            );
          }
        } catch (embeddedError) {
          embeddedError.message = `Jarvis Scene Builder — ${documentName}: ${embeddedError.message}`;
          throw embeddedError;
        }
      }
    } catch (error) {
      if (created) {
        try {
          await created.delete();
        } catch (cleanupError) {
          console.error(`${MODULE_ID} | Falha ao limpar Scene parcial`, cleanupError);
        }
      }
      if (error instanceof SceneBlueprintValidationError) throw error;
      console.error(`${MODULE_ID} | Scene Builder falhou`, error, sceneData, embedded);
      throw new Error(
        `Jarvis Scene Builder: Foundry recusou a Scene '${payload.scene.name}'. ${error.message ?? "Veja o console."}`
      );
    }

    if (activate) await created.activate({ pullUsers: false });
    else if (view) await created.view();

    const summary = formatSummary(payload, { missing });
    ui.notifications?.info(
      `Jarvis: Scene '${created.name}' criada — ${summary.walls} paredes, ${summary.doors} portas, ` +
      `${tokenData.length} tokens, ${summary.lights} luzes, ${embedded.tiles.length} background tile(s).`
    );
    if (missing.length) {
      ui.notifications?.warn(`Jarvis: ${missing.length} Actor(s) não foram posicionados. Veja o console.`);
      console.warn(`${MODULE_ID} | Actors ausentes na Scene '${created.name}':`, missing);
    }

    return { scene: created, summary };
  }

  async buildMany(payloads = [], {
    replaceExisting = false,
    createFolder = true,
    allowMissingActors = false,
    activateLast = false,
    viewLast = true,
    includeBlueprintOverlay = false
  } = {}) {
    if (!game.user?.isGM) throw new Error("Jarvis Scene Builder: apenas o GM pode criar Scenes.");
    if (!Array.isArray(payloads) || !payloads.length) {
      throw new Error("Jarvis Scene Builder: buildMany exige pelo menos um blueprint.");
    }

    const previews = [];
    const existingConflicts = [];
    for (const payload of payloads) {
      validateSceneBlueprint(payload);
      const preview = await this.preview(payload);
      previews.push(preview);
      if (preview.missingActors.length && !allowMissingActors) {
        throw new Error(
          `Jarvis Scene Builder: '${preview.name}' possui Actors não encontrados: ${preview.missingActors.join(", ")}. ` +
          "Nenhuma Scene foi criada."
        );
      }
      if (findExistingScene(payload.scene.name) && !replaceExisting) existingConflicts.push(payload.scene.name);
    }

    if (existingConflicts.length) {
      throw new Error(
        `Jarvis Scene Builder: Scenes já existentes: ${existingConflicts.join(", ")}. ` +
        "Nenhuma Scene foi criada. Use replaceExisting: true para recriar o pacote."
      );
    }

    const results = [];
    for (let index = 0; index < payloads.length; index += 1) {
      const isLast = index === payloads.length - 1;
      results.push(await this.build(payloads[index], {
        replaceExisting,
        createFolder,
        allowMissingActors,
        activate: isLast && activateLast,
        view: isLast && !activateLast && viewLast,
        includeBlueprintOverlay
      }));
    }
    return { results, previews };
  }
}
