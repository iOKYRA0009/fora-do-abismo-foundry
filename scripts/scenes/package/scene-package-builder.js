const MODULE_ID = "fora-do-abismo-foundry";
const PACKAGE_VERSION = "1.0";

const REGION_SCRIPT_SOURCE =
  'const api = game.modules.get("' + MODULE_ID + '")?.api?.scenes?.package; ' +
  'if (api?.handleRegionEvent) await api.handleRegionEvent({behavior,event,region,scene});';

function clone(value) {
  return foundry.utils.deepClone(value);
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function px(value, gridSize) {
  return Math.round(Number(value) * gridSize);
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function requireRect(rect, path, errors) {
  if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(finite)) {
    errors.push(path + " deve ser [x, y, largura, altura].");
    return;
  }
  if (Number(rect[2]) <= 0 || Number(rect[3]) <= 0) {
    errors.push(path + " precisa de largura e altura maiores que zero.");
  }
}

function resolveScene(sceneRef) {
  if (!sceneRef) return globalThis.canvas?.scene ?? null;
  if (typeof sceneRef === "string") {
    return game.scenes.get(sceneRef)
      ?? game.scenes.find(scene => normalize(scene.name) === normalize(sceneRef))
      ?? null;
  }
  return sceneRef?.documentName === "Scene" ? sceneRef : null;
}

async function resolveActor(ref = {}) {
  if (ref.actorUuid) {
    const actor = await fromUuid(ref.actorUuid, { strict: false });
    if (actor?.documentName === "Actor") return actor;
  }

  if (ref.actorId) {
    const actor = game.actors.get(ref.actorId);
    if (actor) return actor;
  }

  const wanted = normalize(ref.actor);
  if (!wanted) return null;
  return game.actors.find(actor => normalize(actor.name) === wanted) ?? null;
}

function getFilePickerClass() {
  return foundry.applications?.apps?.FilePicker ?? globalThis.FilePicker ?? null;
}

async function ensureDirectory(source, path) {
  const FilePickerClass = getFilePickerClass();
  if (!FilePickerClass?.createDirectory || !FilePickerClass?.browse) {
    throw new Error("Scene Package: FilePicker não oferece criação/navegação de diretórios.");
  }

  const parts = String(path ?? "").split("/").filter(Boolean);
  let current = "";

  for (const part of parts) {
    current = current ? current + "/" + part : part;
    try {
      await FilePickerClass.createDirectory(source, current);
    } catch (error) {
      try {
        await FilePickerClass.browse(source, current);
      } catch {
        throw error;
      }
    }
  }
}

function base64ToFile(base64, fileName, mimeType) {
  const clean = String(base64 ?? "").replace(/^data:[^;]+;base64,/, "");
  const binary = atob(clean);
  const chunks = [];
  const chunkSize = 1024 * 1024;

  for (let offset = 0; offset < binary.length; offset += chunkSize) {
    const slice = binary.slice(offset, offset + chunkSize);
    const bytes = new Uint8Array(slice.length);
    for (let index = 0; index < slice.length; index += 1) {
      bytes[index] = slice.charCodeAt(index);
    }
    chunks.push(bytes);
  }

  return new File(chunks, fileName, { type: mimeType });
}

async function uploadVisualAsset(visual = {}) {
  if (visual.backgroundSrc) return String(visual.backgroundSrc);

  const base64 = String(visual.backgroundBase64 ?? "").trim();
  if (!base64) return "";

  const FilePickerClass = getFilePickerClass();
  if (!FilePickerClass?.upload) {
    throw new Error("Scene Package: API de upload do FilePicker não encontrada.");
  }

  const source = String(visual.source ?? "data");
  const worldId = game.world?.id ?? "world";
  const target = String(
    visual.target
    ?? ("worlds/" + worldId + "/assets/fora-do-abismo/maps")
  );
  const fileName = String(visual.fileName ?? "jarvis-scene.webp");
  const mimeType = String(visual.mimeType ?? "image/webp");

  await ensureDirectory(source, target);

  const file = base64ToFile(base64, fileName, mimeType);
  const result = await FilePickerClass.upload(
    source,
    target,
    file,
    {},
    { notify: false }
  );

  return String(
    result?.path
    ?? result?.url
    ?? result?.file
    ?? (target + "/" + fileName)
  );
}

function normalizeWall(wall = {}) {
  const result = clone(wall);

  if (result.type === "low_barrier") {
    result.type = "wall";
    result.move = result.move !== false;
    result.sight = false;
    result.light = false;
    result.sound = false;
    result.semanticType = "low_barrier";
  }

  return result;
}

function stripLargePackageData(payload) {
  const result = clone(payload);
  if (result.visual) {
    delete result.visual.backgroundBase64;
  }
  return result;
}

function eventConstant(name) {
  const E = CONST.REGION_EVENTS ?? {};
  const key = String(name ?? "TOKEN_ENTER").trim().toUpperCase();

  const aliases = {
    TOKENENTER: "TOKEN_ENTER",
    TOKEN_ENTER: "TOKEN_ENTER",
    TOKENEXIT: "TOKEN_EXIT",
    TOKEN_EXIT: "TOKEN_EXIT",
    TOKENMOVEIN: "TOKEN_MOVE_IN",
    TOKEN_MOVE_IN: "TOKEN_MOVE_IN",
    TOKENMOVEOUT: "TOKEN_MOVE_OUT",
    TOKEN_MOVE_OUT: "TOKEN_MOVE_OUT",
    TOKENMOVEWITHIN: "TOKEN_MOVE_WITHIN",
    TOKEN_MOVE_WITHIN: "TOKEN_MOVE_WITHIN",
    TOKENSTARTSTURN: "TOKEN_TURN_START",
    TOKEN_TURN_START: "TOKEN_TURN_START",
    TOKENENDSTURN: "TOKEN_TURN_END",
    TOKEN_TURN_END: "TOKEN_TURN_END",
    TOKENSTARTSROUND: "TOKEN_ROUND_START",
    TOKEN_ROUND_START: "TOKEN_ROUND_START",
    TOKENENDSROUND: "TOKEN_ROUND_END",
    TOKEN_ROUND_END: "TOKEN_ROUND_END"
  };

  const resolved = aliases[key.replace(/[^A-Z_]/g, "")] ?? key;
  return E[resolved] ?? E.TOKEN_ENTER ?? "tokenEnter";
}

function getRectangleDrawingType() {
  return foundry.data?.ShapeData?.TYPES?.RECTANGLE
    ?? CONFIG.Canvas?.drawingTypes?.RECTANGLE
    ?? "r";
}

function regionColor(kind) {
  const colors = {
    hazard: "#b03a2e",
    trap: "#c0392b",
    puzzle: "#b7950b",
    narrative: "#6c3483",
    safe: "#2471a3",
    reward: "#117864",
    spawn: "#1e8449"
  };
  return colors[normalize(kind)] ?? "#6c757d";
}

function buildRegionData(spec, gridSize) {
  const rect = spec.rect;
  const x = px(rect[0], gridSize);
  const y = px(rect[1], gridSize);
  const width = px(rect[2], gridSize);
  const height = px(rect[3], gridSize);

  const data = {
    name: spec.name ?? spec.id ?? "Jarvis Region",
    color: spec.color ?? regionColor(spec.kind),
    hidden: spec.hidden !== false,
    locked: spec.locked !== false,
    shapes: [{
      type: "rectangle",
      x,
      y,
      width,
      height,
      rotation: 0,
      anchorX: 0,
      anchorY: 0,
      hole: false
    }],
    flags: {
      [MODULE_ID]: {
        scenePackageRegion: true,
        packageRegionId: spec.id ?? null,
        kind: spec.kind ?? "narrative",
        purpose: spec.purpose ?? "",
        automation: clone(spec.automation ?? null),
        mechanics: clone(spec.mechanics ?? null)
      }
    }
  };

  const actions = spec.automation?.actions ?? [];
  if (actions.length) {
    const events = (spec.automation?.events ?? ["TOKEN_ENTER"]).map(eventConstant);
    data.behaviors = [{
      name: "Jarvis — " + (spec.name ?? spec.id ?? "Região"),
      type: "script",
      system: {
        source: REGION_SCRIPT_SOURCE,
        events
      }
    }];
  }

  return data;
}

function buildRegionFallbackDrawing(spec, gridSize) {
  const rect = spec.rect;
  return {
    name: "Jarvis Region Fallback — " + (spec.name ?? spec.id ?? "Região"),
    x: px(rect[0], gridSize),
    y: px(rect[1], gridSize),
    shape: {
      type: getRectangleDrawingType(),
      width: px(rect[2], gridSize),
      height: px(rect[3], gridSize)
    },
    fillType: CONST.DRAWING_FILL_TYPES.SOLID,
    fillColor: spec.color ?? regionColor(spec.kind),
    fillAlpha: 0.08,
    strokeColor: spec.color ?? regionColor(spec.kind),
    strokeAlpha: 0.35,
    strokeWidth: Math.max(2, Math.round(gridSize / 25)),
    text: spec.name ?? spec.id ?? "",
    textColor: "#ffffff",
    textAlpha: 0.45,
    fontSize: Math.max(18, Math.round(gridSize / 3)),
    hidden: true,
    locked: true,
    flags: {
      [MODULE_ID]: {
        scenePackageRegionFallback: true,
        packageRegionId: spec.id ?? null,
        kind: spec.kind ?? "narrative",
        automation: clone(spec.automation ?? null),
        mechanics: clone(spec.mechanics ?? null)
      }
    }
  };
}

async function createRegions(scene, regions = [], gridSize, { strictRegions = false } = {}) {
  const summary = {
    requested: regions.length,
    regions: 0,
    fallbacks: 0,
    automationFallbacks: 0,
    failures: []
  };

  for (const spec of regions) {
    const data = buildRegionData(spec, gridSize);

    try {
      const created = await scene.createEmbeddedDocuments("Region", [data]);
      if (!created?.length) throw new Error("Foundry não retornou o Region criado.");
      summary.regions += 1;
      continue;
    } catch (regionError) {
      if (data.behaviors?.length) {
        try {
          const safeData = clone(data);
          delete safeData.behaviors;
          const created = await scene.createEmbeddedDocuments("Region", [safeData]);
          if (!created?.length) throw new Error("Foundry não retornou o Region sem automação.");
          summary.regions += 1;
          summary.automationFallbacks += 1;
          console.warn(MODULE_ID + " | Region criado sem Behavior automático", spec.id, regionError);
          continue;
        } catch (plainRegionError) {
          console.warn(MODULE_ID + " | Region nativo recusado; tentando Drawing fallback", spec.id, plainRegionError);
        }
      }

      try {
        const drawing = buildRegionFallbackDrawing(spec, gridSize);
        const created = await scene.createEmbeddedDocuments("Drawing", [drawing]);
        if (!created?.length) throw new Error("Foundry não retornou o Drawing fallback.");
        summary.fallbacks += 1;
      } catch (fallbackError) {
        summary.failures.push({
          id: spec.id ?? null,
          error: fallbackError.message ?? String(fallbackError)
        });
        if (strictRegions) throw fallbackError;
      }
    }
  }

  return summary;
}

function getRegionSpec(region) {
  return region?.getFlag?.(MODULE_ID, "automation")
    ? {
        id: region.getFlag(MODULE_ID, "packageRegionId"),
        automation: region.getFlag(MODULE_ID, "automation"),
        mechanics: region.getFlag(MODULE_ID, "mechanics")
      }
    : null;
}

function gmRecipients() {
  try {
    return ChatMessage.getWhisperRecipients("GM").map(user => user.id);
  } catch {
    return game.users.filter(user => user.isGM).map(user => user.id);
  }
}

async function executeActions(scene, actions = [], context = {}) {
  const results = [];

  for (const action of actions) {
    const type = normalize(action.type);

    if (type === "gmalert" || type === "notify") {
      const text = String(action.text ?? "Jarvis Scene Package: evento acionado.");
      ui.notifications?.warn(text);
      results.push({ type, ok: true });
      continue;
    }

    if (type === "gmwhisper" || type === "whisper") {
      const content = String(action.text ?? action.content ?? "Evento Jarvis acionado.");
      await ChatMessage.create({
        speaker: { alias: "Jarvis — Scene Package" },
        content,
        whisper: gmRecipients()
      });
      results.push({ type, ok: true });
      continue;
    }

    if (type === "settokenhidden" || type === "revealtoken" || type === "hidetoken") {
      const hidden = type === "revealtoken" ? false : type === "hidetoken" ? true : Boolean(action.hidden);
      const target = scene.tokens.find(token => {
        if (action.tokenId && token.id === action.tokenId) return true;
        if (action.role && token.getFlag(MODULE_ID, "role") === action.role) return true;
        if (action.actor && normalize(token.name) === normalize(action.actor)) return true;
        return false;
      });

      if (!target) {
        results.push({ type, ok: false, error: "Token alvo não encontrado." });
        continue;
      }

      await target.update({ hidden });
      results.push({ type, ok: true, token: target.name, hidden });
      continue;
    }

    if (type === "sceneflag") {
      const key = String(action.key ?? "").trim();
      if (!key) {
        results.push({ type, ok: false, error: "sceneFlag sem key." });
        continue;
      }
      await scene.setFlag(MODULE_ID, "runtime." + key, clone(action.value));
      results.push({ type, ok: true, key });
      continue;
    }

    results.push({ type: action.type ?? "unknown", ok: false, error: "Ação não reconhecida." });
  }

  return results;
}

export class JarvisScenePackageBuilder {
  constructor({ builder, framework } = {}) {
    if (!builder) throw new Error("Scene Package exige JarvisSceneBuilder.");
    this.builder = builder;
    this.framework = framework ?? null;
  }

  get version() {
    return PACKAGE_VERSION;
  }

  validate(payload) {
    const errors = [];

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Scene Package: esperado um objeto.");
    }

    if (payload.schemaVersion !== PACKAGE_VERSION) {
      errors.push("schemaVersion deve ser '" + PACKAGE_VERSION + "'.");
    }

    if (!payload.scene || typeof payload.scene !== "object") {
      errors.push("scene é obrigatório.");
    } else {
      if (!payload.scene.name) errors.push("scene.name é obrigatório.");
      if (!Number.isInteger(Number(payload.scene.columns)) || Number(payload.scene.columns) <= 0) {
        errors.push("scene.columns deve ser inteiro positivo.");
      }
      if (!Number.isInteger(Number(payload.scene.rows)) || Number(payload.scene.rows) <= 0) {
        errors.push("scene.rows deve ser inteiro positivo.");
      }
    }

    if (payload.walls !== undefined && !Array.isArray(payload.walls)) {
      errors.push("walls deve ser lista.");
    }

    const wallTypes = new Set(["wall", "door", "secret", "low_barrier"]);
    payload.walls?.forEach((wall, index) => {
      if (!Array.isArray(wall.a) || wall.a.length !== 2 || !wall.a.every(finite)) {
        errors.push("walls[" + index + "].a inválido.");
      }
      if (!Array.isArray(wall.b) || wall.b.length !== 2 || !wall.b.every(finite)) {
        errors.push("walls[" + index + "].b inválido.");
      }
      if (!wallTypes.has(wall.type ?? "wall")) {
        errors.push("walls[" + index + "].type inválido.");
      }
    });

    if (payload.actors !== undefined && !Array.isArray(payload.actors)) {
      errors.push("actors deve ser lista.");
    }
    payload.actors?.forEach((actor, index) => {
      if (!actor.actor && !actor.actorId && !actor.actorUuid) {
        errors.push("actors[" + index + "] precisa de actor, actorId ou actorUuid.");
      }
      if (!finite(actor.x) || !finite(actor.y)) {
        errors.push("actors[" + index + "].x/y inválidos.");
      }
    });

    if (payload.regions !== undefined && !Array.isArray(payload.regions)) {
      errors.push("regions deve ser lista.");
    }
    payload.regions?.forEach((region, index) => {
      requireRect(region.rect, "regions[" + index + "].rect", errors);
    });

    if (errors.length) {
      const error = new Error("Jarvis Scene Package recusou o pacote.");
      error.details = errors;
      throw error;
    }

    return true;
  }

  async prepareActors(payload, { allowMissingActors = false } = {}) {
    const tokens = [];
    const requiredMissing = [];
    const optionalMissing = [];
    const resolved = [];

    for (const spec of payload.actors ?? []) {
      const actor = await resolveActor(spec);
      if (!actor) {
        if (spec.optional) optionalMissing.push(spec.actor ?? spec.actorId ?? spec.actorUuid);
        else requiredMissing.push(spec.actor ?? spec.actorId ?? spec.actorUuid);
        continue;
      }

      tokens.push({
        actorId: actor.id,
        actor: actor.name,
        x: Number(spec.x),
        y: Number(spec.y),
        width: spec.width,
        height: spec.height,
        hidden: Boolean(spec.hidden),
        disposition: spec.disposition ?? "neutral",
        role: spec.role ?? null,
        elevation: spec.elevation ?? 0,
        rotation: spec.rotation ?? 0,
        actorLink: spec.actorLink
      });
      resolved.push({ actor: actor.name, id: actor.id, role: spec.role ?? null });
    }

    if (requiredMissing.length && !allowMissingActors) {
      throw new Error(
        "Scene Package: Actors obrigatórios não encontrados: " + requiredMissing.join(", ")
      );
    }

    return { tokens, requiredMissing, optionalMissing, resolved };
  }

  toBlueprint(payload, backgroundSrc, tokens) {
    const scene = payload.scene;
    const grid = scene.grid ?? {};

    return {
      schemaVersion: "1.0",
      id: payload.id ?? ("scene-package-" + Date.now()),
      metadata: {
        ...(clone(payload.metadata ?? {})),
        scenePackage: {
          version: PACKAGE_VERSION,
          id: payload.id ?? null,
          purpose: payload.purpose ?? ""
        }
      },
      scene: {
        name: scene.name,
        folder: scene.folder ?? "",
        columns: Number(scene.columns),
        rows: Number(scene.rows),
        padding: Number(scene.padding ?? 0),
        navigation: Boolean(scene.navigation),
        navName: scene.navName ?? scene.name,
        tokenVision: scene.tokenVision !== false,
        backgroundColor: scene.backgroundColor ?? "#090807",
        visualMode: Boolean(backgroundSrc),
        backgroundSrc: backgroundSrc || undefined,
        grid: {
          size: Number(grid.size ?? 100),
          distance: Number(grid.distance ?? 5),
          units: grid.units ?? "ft",
          color: grid.color ?? "#000000",
          alpha: Number(grid.alpha ?? 0.08),
          thickness: Number(grid.thickness ?? 1)
        }
      },
      walls: (payload.walls ?? []).map(normalizeWall),
      drawings: clone(payload.drawings ?? []),
      lights: clone(payload.lights ?? []),
      tokens: clone(tokens ?? [])
    };
  }

  async preview(payload, options = {}) {
    this.validate(payload);
    const actors = await this.prepareActors(payload, options);

    return {
      id: payload.id ?? null,
      name: payload.scene.name,
      size: payload.scene.columns + "x" + payload.scene.rows,
      walls: payload.walls?.length ?? 0,
      doors: payload.walls?.filter(wall => wall.type === "door" || wall.type === "secret").length ?? 0,
      lights: payload.lights?.length ?? 0,
      actors: payload.actors?.length ?? 0,
      resolvedActors: actors.resolved,
      requiredMissing: actors.requiredMissing,
      optionalMissing: actors.optionalMissing,
      regions: payload.regions?.length ?? 0,
      puzzles: payload.puzzles?.length ?? 0,
      rewards: payload.rewards?.length ?? 0,
      hasVisual: Boolean(payload.visual?.backgroundSrc || payload.visual?.backgroundBase64)
    };
  }

  async build(payload, {
    replaceExisting = false,
    createFolder = true,
    allowMissingActors = false,
    activate = false,
    view = true,
    includeBlueprintOverlay = false,
    strictRegions = false
  } = {}) {
    if (!game.user?.isGM) throw new Error("Scene Package: apenas o GM pode construir Scenes.");

    this.validate(payload);

    const actors = await this.prepareActors(payload, { allowMissingActors });
    const backgroundSrc = await uploadVisualAsset(payload.visual ?? {});
    const blueprint = this.toBlueprint(payload, backgroundSrc, actors.tokens);

    const built = await this.builder.build(blueprint, {
      replaceExisting,
      createFolder,
      allowMissingActors,
      activate,
      view: false,
      includeBlueprintOverlay
    });

    const scene = built.scene;
    const gridSize = Number(scene.grid?.size ?? payload.scene.grid?.size ?? 100);

    const regionSummary = await createRegions(
      scene,
      payload.regions ?? [],
      gridSize,
      { strictRegions }
    );

    const manifest = stripLargePackageData(payload);
    await scene.setFlag(MODULE_ID, "scenePackage", {
      version: PACKAGE_VERSION,
      id: payload.id ?? null,
      builtAt: Date.now(),
      manifest,
      actorResolution: {
        resolved: actors.resolved,
        requiredMissing: actors.requiredMissing,
        optionalMissing: actors.optionalMissing
      },
      regionSummary
    });

    if (activate) await scene.activate({ pullUsers: false });
    else if (view) await scene.view();

    const inspection = this.inspect(scene);

    ui.notifications?.info(
      "Jarvis: pacote '" + scene.name + "' construído — " +
      inspection.counts.walls + " paredes, " +
      inspection.counts.doors + " portas, " +
      inspection.counts.tokens + " tokens, " +
      inspection.counts.packageRegions + " regiões."
    );

    if (regionSummary.automationFallbacks) {
      ui.notifications?.warn(
        "Jarvis: " + regionSummary.automationFallbacks +
        " região(ões) foram criadas sem Behavior automático. A geometria foi preservada."
      );
    }

    if (regionSummary.fallbacks) {
      ui.notifications?.warn(
        "Jarvis: " + regionSummary.fallbacks +
        " região(ões) usaram marcador Drawing de fallback."
      );
    }

    return {
      scene,
      backgroundSrc,
      blueprint,
      actors,
      regionSummary,
      inspection
    };
  }

  inspect(sceneRef) {
    const scene = resolveScene(sceneRef);
    if (!scene) throw new Error("Scene Package: Scene não encontrada.");

    const packageFlag = scene.getFlag(MODULE_ID, "scenePackage") ?? null;
    const regions = scene.regions?.contents?.filter(region =>
      Boolean(region.getFlag(MODULE_ID, "scenePackageRegion"))
    ) ?? [];
    const fallbackDrawings = scene.drawings?.contents?.filter(drawing =>
      Boolean(drawing.getFlag(MODULE_ID, "scenePackageRegionFallback"))
    ) ?? [];
    const backgrounds = scene.tiles?.contents?.filter(tile =>
      Boolean(tile.getFlag(MODULE_ID, "sceneBackground"))
    ) ?? [];

    return {
      id: scene.id,
      name: scene.name,
      packageId: packageFlag?.id ?? null,
      version: packageFlag?.version ?? null,
      counts: {
        walls: scene.walls?.size ?? 0,
        doors: scene.walls?.filter?.(wall => wall.door !== CONST.WALL_DOOR_TYPES.NONE)?.length ?? 0,
        lights: scene.lights?.size ?? 0,
        tokens: scene.tokens?.size ?? 0,
        drawings: scene.drawings?.size ?? 0,
        tiles: scene.tiles?.size ?? 0,
        backgrounds: backgrounds.length,
        packageRegions: regions.length,
        regionFallbacks: fallbackDrawings.length
      },
      healthy:
        backgrounds.length <= 1
        && Boolean(packageFlag)
        && (packageFlag.regionSummary?.failures?.length ?? 0) === 0,
      package: packageFlag
    };
  }

  async handleRegionEvent({ behavior, event, region, scene } = {}) {
    if (!game.user?.isGM) return { skipped: true, reason: "not-gm" };
    if (!scene || !region) return { skipped: true, reason: "missing-context" };

    const spec = getRegionSpec(region);
    if (!spec?.automation) return { skipped: true, reason: "no-automation" };

    const token = event?.data?.token ?? null;
    const filter = spec.automation.filter ?? {};

    if (filter.actor && token && normalize(token.name) !== normalize(filter.actor)) {
      return { skipped: true, reason: "actor-filter" };
    }

    if (spec.automation.once) {
      const triggered = region.getFlag(MODULE_ID, "triggered");
      if (triggered) return { skipped: true, reason: "already-triggered" };
      await region.setFlag(MODULE_ID, "triggered", true);
    }

    const results = await executeActions(
      scene,
      spec.automation.actions ?? [],
      { behavior, event, region, token }
    );

    return { skipped: false, results };
  }

  async runAction(sceneRef, key) {
    if (!game.user?.isGM) throw new Error("Scene Package: apenas o GM pode executar ações manuais.");

    const scene = resolveScene(sceneRef);
    if (!scene) throw new Error("Scene Package: Scene não encontrada.");

    const packageFlag = scene.getFlag(MODULE_ID, "scenePackage");
    const actions = packageFlag?.manifest?.manualActions?.[key];

    if (!Array.isArray(actions)) {
      throw new Error("Scene Package: ação manual desconhecida: '" + key + "'.");
    }

    return executeActions(scene, actions, { manual: true, key });
  }
}
