import { inspectWallGeometry } from "../scene-geometry.js";
import { beginSceneAssetUpload, updateSceneAssetUpload } from "./asset-ledger.js";

const MODULE_ID = "fora-do-abismo-foundry";
const PACKAGE_VERSION = "1.0";
const privateJournalDeletes = new WeakMap();
const deletedPrivateJournals = new WeakSet();
const regionEventLocks = new WeakSet();
const regionRepairLocks = new WeakSet();

const REGION_SCRIPT_SOURCE =
  'const api = game.modules.get("' + MODULE_ID + '")?.api?.scenes?.package; ' +
  'if (api?.handleRegionEvent) await api.handleRegionEvent({behavior,event,region,scene});';

function clone(value) {
  return foundry.utils.deepClone(value);
}

function isActiveGM() {
  return Boolean(game.user?.isGM)
    && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
}

async function deletePrivateJournal(journal) {
  if (!journal || deletedPrivateJournals.has(journal)) return false;
  const pending = privateJournalDeletes.get(journal);
  if (pending) return pending;
  const deletion = Promise.resolve().then(() => journal.delete()).then(() => {
    deletedPrivateJournals.add(journal);
    return true;
  });
  privateJournalDeletes.set(journal, deletion);
  try {
    return await deletion;
  } finally {
    privateJournalDeletes.delete(journal);
  }
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
  if (visual.backgroundSrc) return { src: String(visual.backgroundSrc), assetId: null };

  const base64 = String(visual.backgroundBase64 ?? "").trim();
  if (!base64) return { src: "", assetId: null };
  if (base64.length > 40 * 1024 * 1024) {
    throw new Error("Scene Package: imagem Base64 acima do limite de 40 MiB.");
  }

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
  const requestedFileName = String(visual.fileName ?? "jarvis-scene.webp")
    .split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, "-");
  const extensionIndex = requestedFileName.lastIndexOf(".");
  const stem = extensionIndex > 0 ? requestedFileName.slice(0, extensionIndex) : requestedFileName;
  const extension = extensionIndex > 0 ? requestedFileName.slice(extensionIndex) : "";
  const fileName = `${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
  const mimeType = String(visual.mimeType ?? "image/webp");
  if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(mimeType)) {
    throw new Error("Scene Package: tipo de imagem não aceito para upload.");
  }

  await ensureDirectory(source, target);

  const file = base64ToFile(base64, fileName, mimeType);
  const record = await beginSceneAssetUpload({ source, target, fileName });
  try {
    const result = await FilePickerClass.upload(
      source,
      target,
      file,
      {},
      { notify: false }
    );
    const src = String(result?.path ?? result?.url ?? result?.file ?? (target + "/" + fileName));
    await updateSceneAssetUpload(record.id, { status: "uploaded", path: src });
    return { src, assetId: record.id };
  } catch (error) {
    await updateSceneAssetUpload(record.id, { status: "review", reason: "upload-interrupted" })
      .catch(ledgerError => console.error(`${MODULE_ID} | Falha ao registrar upload interrompido`, ledgerError));
    throw error;
  }
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

function publicRegionSummary(summary = {}) {
  return {
    requested: Number(summary.requested ?? 0),
    regions: Number(summary.regions ?? 0),
    fallbacks: Number(summary.fallbacks ?? 0),
    automationFallbacks: Number(summary.automationFallbacks ?? 0),
    failureCount: Number(summary.failureCount ?? summary.failures?.length ?? 0)
  };
}

function publicPackageFlag(packageFlag = {}, journalId = null) {
  return {
    version: packageFlag.version ?? PACKAGE_VERSION,
    builtAt: packageFlag.builtAt ?? Date.now(),
    manifestJournalId: journalId ?? packageFlag.manifestJournalId ?? null,
    regionSummary: publicRegionSummary(packageFlag.regionSummary),
    ...(packageFlag.repairedAt ? { repairedAt: packageFlag.repairedAt } : {})
  };
}

function privateManifestRecord(scene, packageFlag = scene.getFlag(MODULE_ID, "scenePackage")) {
  if (!game.user?.isGM || !packageFlag) return null;
  if (packageFlag.manifestJournalId) {
    const journal = game.journal?.get(packageFlag.manifestJournalId);
    const record = journal?.getFlag(MODULE_ID, "scenePackagePrivate");
    if (!record || record.sceneId !== scene.id || !record.manifest) {
      throw new Error("Scene Package: manifesto privado não encontrado ou não corresponde à Scene.");
    }
    return record;
  }
  // Scenes criadas por versões anteriores mantêm o manifesto no flag até a migração.
  return packageFlag.manifest
    ? { sceneId: scene.id, manifest: packageFlag.manifest, actorResolution: packageFlag.actorResolution ?? null }
    : null;
}

async function createPrivateManifest(scene, record) {
  const Journal = globalThis.JournalEntry?.implementation;
  if (!Journal?.create) throw new Error("Scene Package: JournalEntry não disponível para manifesto privado.");
  const journal = await Journal.create({
    name: `Jarvis — manifesto privado ${scene.id}`,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0 },
    flags: { [MODULE_ID]: { scenePackagePrivate: record } }
  }, { renderSheet: false });
  if (!journal) throw new Error("Scene Package: Foundry não retornou o Journal privado.");
  const saved = journal.getFlag?.(MODULE_ID, "scenePackagePrivate");
  if (saved?.sceneId !== scene.id || !saved?.manifest) {
    await deletePrivateJournal(journal).catch(cleanupError =>
      console.error(`${MODULE_ID} | Falha ao limpar Journal privado inválido`, cleanupError)
    );
    throw new Error("Scene Package: manifesto privado não foi persistido no Journal.");
  }
  return journal;
}

function migrationJournalIndex() {
  const byScene = new Map();
  const entries = Array.from(game.journal?.contents ?? game.journal ?? []);
  for (const journal of entries.map(entry => Array.isArray(entry) ? entry[1] : entry)) {
    const record = journal?.getFlag?.(MODULE_ID, "scenePackagePrivate");
    if (!record?.sceneId || !record.migrationBackup?.scenePackage?.manifest) continue;
    if (!byScene.has(record.sceneId)) byScene.set(record.sceneId, []);
    byScene.get(record.sceneId).push(journal);
  }
  return byScene;
}

function migrationJournals(scene, index = migrationJournalIndex()) {
  return index.get(scene.id) ?? [];
}

function migrationBackup(scene, scenePackage) {
  const documents = [];
  for (const [documentName, collection, flag] of [
    ["Region", scene.regions, "scenePackageRegion"],
    ["Drawing", scene.drawings, "scenePackageRegionFallback"]
  ]) {
    for (const document of collection?.contents ?? []) {
      if (!document.getFlag?.(MODULE_ID, flag)) continue;
      const keys = [flag, "packageRegionId", "packageRegionIndex", "automation", "mechanics", "purpose", "kind", "triggered", "automationState"];
      const flags = {};
      for (const key of keys) {
        const value = document.getFlag(MODULE_ID, key);
        if (value !== undefined) flags[key] = clone(value);
      }
      documents.push({ documentName, id: document.id, name: document.name,
        ...(documentName === "Drawing" ? { text: document.text } : {}), flags });
    }
  }
  return {
    capturedAt: Date.now(),
    scenePackage: clone(scenePackage),
    sceneBuilder: clone(scene.getFlag(MODULE_ID, "sceneBuilder") ?? null),
    documents
  };
}

async function replacePrivateBackedFlag(document, key, value) {
  // Foundry V14's _replace operator avoids the unsetFlag/setFlag crash gap.
  // The fallback is retained for mocks and earlier engines; the private Journal
  // already holds a full recovery copy before this function is called.
  if (typeof globalThis._replace === "function" && typeof document.update === "function") {
    await document.update({ [`flags.${MODULE_ID}.${key}`]: globalThis._replace(clone(value)) });
  } else {
    if (document.getFlag(MODULE_ID, key) !== undefined) await document.unsetFlag(MODULE_ID, key);
    await document.setFlag(MODULE_ID, key, clone(value));
  }
  const persisted = document.getFlag(MODULE_ID, key);
  if (JSON.stringify(persisted) !== JSON.stringify(value)) {
    throw new Error(`Scene Package: falha ao substituir flag ${key} com segurança.`);
  }
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

function getExecuteScriptBehaviorType() {
  const models = CONFIG.RegionBehavior?.dataModels ?? {};

  if (models.executeScript) return "executeScript";
  if (models.script) return "script";

  const target =
    foundry.data?.regionBehaviors?.ExecuteScriptRegionBehaviorType
    ?? foundry.data?.foundry_data_regionBehaviors?.ExecuteScriptRegionBehaviorType
    ?? null;

  if (target) {
    for (const [key, model] of Object.entries(models)) {
      if (model === target) return key;
    }
  }

  const heuristic = Object.entries(models).find(([key, model]) =>
    /execute.*script|script.*execute/i.test(key)
    || /ExecuteScriptRegionBehaviorType/i.test(model?.name ?? "")
  );

  return heuristic?.[0] ?? null;
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

function buildRegionData(spec, gridSize, index, { staged = false } = {}) {
  const rect = spec.rect;
  const x = px(rect[0], gridSize);
  const y = px(rect[1], gridSize);
  const width = px(rect[2], gridSize);
  const height = px(rect[3], gridSize);

  const data = {
    name: `Jarvis Region ${index + 1}`,
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
        packageRegionIndex: index,
        ...(staged ? { repairStaged: true } : {})
      }
    }
  };

  const actions = spec.automation?.actions ?? [];
  if (actions.length) {
    const behaviorType = getExecuteScriptBehaviorType();
    if (behaviorType) {
      const events = (spec.automation?.events ?? ["TOKEN_ENTER"]).map(eventConstant);
      data.behaviors = [{
        name: `Jarvis — Region ${index + 1}`,
        type: behaviorType,
        system: {
          source: REGION_SCRIPT_SOURCE,
          events
        }
      }];
    } else {
      console.warn(
        MODULE_ID + " | Execute Script RegionBehavior não encontrado; região será criada sem automação.",
        spec.id
      );
    }
  }

  return data;
}

function buildRegionFallbackDrawing(spec, gridSize, index, { staged = false } = {}) {
  const rect = spec.rect;
  return {
    name: `Jarvis Region Fallback ${index + 1}`,
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
    text: "",
    textColor: "#ffffff",
    textAlpha: 0.45,
    fontSize: Math.max(18, Math.round(gridSize / 3)),
    hidden: true,
    locked: true,
    flags: {
      [MODULE_ID]: {
        scenePackageRegionFallback: true,
        packageRegionIndex: index,
        ...(staged ? { repairStaged: true } : {})
      }
    }
  };
}

async function createRegions(scene, regions = [], gridSize, { strictRegions = false, staged = false } = {}) {
  const summary = {
    requested: regions.length,
    regions: 0,
    fallbacks: 0,
    automationFallbacks: 0,
    failures: []
  };

  for (const [index, spec] of regions.entries()) {
    const data = buildRegionData(spec, gridSize, index, { staged });

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
        const drawing = buildRegionFallbackDrawing(spec, gridSize, index, { staged });
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

function getRegionSpec(region, scene) {
  const regions = privateManifestRecord(scene)?.manifest?.regions ?? [];
  const storedIndex = region?.getFlag?.(MODULE_ID, "packageRegionIndex");
  const index = Number(storedIndex);
  if (storedIndex !== null && storedIndex !== undefined && Number.isInteger(index) && index >= 0 && regions[index]) {
    return regions[index];
  }
  const id = region?.getFlag?.(MODULE_ID, "packageRegionId");
  if (id) {
    const spec = regions.find(entry => entry.id === id);
    if (spec) return spec;
  }
  // Compatibilidade com Regions antigas sem índice ou ID no manifesto.
  return region?.getFlag?.(MODULE_ID, "automation")
    ? {
        id,
        automation: region.getFlag(MODULE_ID, "automation"),
        mechanics: region.getFlag(MODULE_ID, "mechanics")
      }
    : null;
}

async function scrubLegacyRegionFlags(scene, manifest) {
  const specs = manifest?.regions ?? [];
  for (const collection of [scene.regions, scene.drawings]) {
    for (const document of collection?.contents ?? []) {
      const managed = document.getFlag?.(MODULE_ID, "scenePackageRegion")
        || document.getFlag?.(MODULE_ID, "scenePackageRegionFallback");
      if (!managed) continue;
      const id = document.getFlag(MODULE_ID, "packageRegionId");
      const storedIndex = document.getFlag(MODULE_ID, "packageRegionIndex");
      const knownIndex = Number(storedIndex);
      const index = storedIndex !== null && storedIndex !== undefined
        && Number.isInteger(knownIndex) && specs[knownIndex]
        ? knownIndex
        : specs.findIndex(spec => spec.id === id);
      if (index < 0) {
        throw new Error(`Region legado '${document.name ?? document.id}' não corresponde ao manifesto privado.`);
      }
      const publicName = document.getFlag(MODULE_ID, "scenePackageRegion")
        ? `Jarvis Region ${index + 1}` : `Jarvis Region Fallback ${index + 1}`;
      const legacyKeys = ["packageRegionId", "automation", "mechanics", "purpose", "kind"];
      const dirtyKeys = legacyKeys.filter(key => document.getFlag(MODULE_ID, key) !== undefined);
      const dirtyName = document.name !== publicName
        || Boolean(document.getFlag(MODULE_ID, "scenePackageRegionFallback") && document.text);
      if (storedIndex === index && !dirtyKeys.length && !dirtyName) continue;
      if (storedIndex !== index) await document.setFlag(MODULE_ID, "packageRegionIndex", index);
      for (const key of dirtyKeys) {
        if (document.getFlag(MODULE_ID, key) !== undefined) await document.unsetFlag(MODULE_ID, key);
      }
      if (dirtyName) await document.update({ name: publicName,
        ...(document.getFlag(MODULE_ID, "scenePackageRegionFallback") ? { text: "" } : {}) });
    }
  }
}

function safeSceneBuilderFlag(previous) {
  return Boolean(previous && previous.blueprintId === "scene-package-private"
    && Object.keys(previous).every(key => ["schemaVersion", "blueprintId", "builtAt", "metadata"].includes(key))
    && Object.keys(previous.metadata ?? {}).length === 1
    && previous.metadata?.scenePackage?.version === PACKAGE_VERSION
    && Object.keys(previous.metadata.scenePackage).length === 1);
}

async function scrubLegacySceneBuilderFlag(scene) {
  const previous = scene.getFlag(MODULE_ID, "sceneBuilder");
  if (!previous || safeSceneBuilderFlag(previous)) return;
  const safe = {
    schemaVersion: previous.schemaVersion ?? "1.0",
    blueprintId: "scene-package-private",
    builtAt: previous.builtAt ?? null,
    metadata: { scenePackage: { version: PACKAGE_VERSION } }
  };
  await replacePrivateBackedFlag(scene, "sceneBuilder", safe);
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

  previewLegacyManifests() {
    if (!game.user?.isGM) return { skipped: true, reason: "not-gm", scenes: [], count: 0 };
    const scenes = [];
    const journalIndex = migrationJournalIndex();
    for (const scene of game.scenes ?? []) {
      const flag = scene.getFlag(MODULE_ID, "scenePackage");
      const candidates = migrationJournals(scene, journalIndex);
      if (!flag?.manifest && !flag?.manifestJournalId && !candidates.length) continue;
      const missingJournal = Boolean(flag?.manifestJournalId && !game.journal?.get(flag.manifestJournalId));
      const sceneBuilderFlag = scene.getFlag(MODULE_ID, "sceneBuilder");
      const needsScrub = Boolean(sceneBuilderFlag && !safeSceneBuilderFlag(sceneBuilderFlag))
        || [scene.regions, scene.drawings].some(collection => (collection?.contents ?? []).some(document =>
          (document.getFlag?.(MODULE_ID, "scenePackageRegion")
            || document.getFlag?.(MODULE_ID, "scenePackageRegionFallback"))
          && ["packageRegionId", "automation", "mechanics", "purpose", "kind"]
            .some(key => document.getFlag?.(MODULE_ID, key) !== undefined)
        ));
      if (!flag?.manifest && flag?.manifestJournalId && !needsScrub && !missingJournal) continue;
      scenes.push({
        sceneId: scene.id,
        name: scene.name,
        state: flag?.manifest ? "legacy" : missingJournal ? "missing-journal"
          : flag?.manifestJournalId ? "needs-scrub" : "recoverable",
        backupJournalIds: candidates.map(journal => journal.id),
        needsScrub
      });
    }
    return { skipped: false, count: scenes.length, scenes };
  }

  async migrateLegacyManifests({ confirmed = false, sceneIds = null } = {}) {
    if (!isActiveGM()) return { skipped: true, reason: "not-active-gm", migrated: 0, recovered: 0, failures: [] };
    if (!confirmed) return { skipped: true, reason: "confirmation-required", migrated: 0,
      recovered: 0, failures: [], preview: this.previewLegacyManifests() };

    const selected = Array.isArray(sceneIds) ? new Set(sceneIds) : null;
    const result = { skipped: false, migrated: 0, recovered: 0, failures: [] };
    const journalIndex = migrationJournalIndex();
    for (const scene of game.scenes ?? []) {
      if (selected && !selected.has(scene.id)) continue;
      const originalFlag = scene.getFlag(MODULE_ID, "scenePackage");
      const candidates = migrationJournals(scene, journalIndex);
      if (!originalFlag?.manifest && !originalFlag?.manifestJournalId && !candidates.length) continue;
      let privateJournal = null;
      try {
        if (originalFlag?.manifest) {
          const matching = candidates.filter(journal => JSON.stringify(
            journal.getFlag(MODULE_ID, "scenePackagePrivate").migrationBackup.scenePackage
          ) === JSON.stringify(originalFlag));
          if (matching.length > 1) throw new Error("Scene Package: múltiplos backups privados correspondem ao manifesto legado.");
          privateJournal = matching[0] ?? await createPrivateManifest(scene, {
            sceneId: scene.id,
            manifest: clone(originalFlag.manifest),
            actorResolution: clone(originalFlag.actorResolution ?? null),
            migrationBackup: migrationBackup(scene, originalFlag)
          });
          await replacePrivateBackedFlag(scene, "scenePackage", publicPackageFlag(originalFlag, privateJournal.id));
          if (scene.getFlag(MODULE_ID, "scenePackage")?.manifest) {
            throw new Error("Scene Package: Scene ainda contém manifesto público após a migração.");
          }
        } else if (!originalFlag?.manifestJournalId) {
          if (candidates.length !== 1) throw new Error("Scene Package: recuperação exige um único backup privado correspondente.");
          privateJournal = candidates[0];
          const backup = privateJournal.getFlag(MODULE_ID, "scenePackagePrivate").migrationBackup;
          await replacePrivateBackedFlag(scene, "scenePackage", publicPackageFlag(backup.scenePackage, privateJournal.id));
          result.recovered += 1;
        } else {
          privateJournal = game.journal?.get(originalFlag.manifestJournalId);
          if (!privateJournal && candidates.length === 1) {
            privateJournal = candidates[0];
            await replacePrivateBackedFlag(scene, "scenePackage", publicPackageFlag(originalFlag, privateJournal.id));
            result.recovered += 1;
          }
          if (!privateJournal) throw new Error("Scene Package: Journal privado referenciado pela Scene não encontrado.");
        }
        await scrubLegacyRegionFlags(scene, privateManifestRecord(scene)?.manifest);
        await scrubLegacySceneBuilderFlag(scene);
        if (originalFlag?.manifest) result.migrated += 1;
      } catch (error) {
        result.failures.push({ sceneId: scene.id, name: scene.name,
          backupJournalId: privateJournal?.id ?? null,
          error: error.message ?? String(error) });
      }
    }
    return result;
  }

  async restoreMigrationBackup(sceneRef, { confirmed = false } = {}) {
    if (!isActiveGM()) throw new Error("Scene Package: apenas o GM ativo pode restaurar backups de migração.");
    const scene = resolveScene(sceneRef);
    if (!scene) throw new Error("Scene Package: Scene não encontrada.");
    const publicFlag = scene.getFlag(MODULE_ID, "scenePackage");
    const candidates = migrationJournals(scene);
    const journal = publicFlag?.manifestJournalId
      ? candidates.find(entry => entry.id === publicFlag.manifestJournalId)
      : candidates.length === 1 ? candidates[0] : null;
    if (!journal) throw new Error("Scene Package: backup privado único da migração não encontrado.");
    const backup = journal.getFlag(MODULE_ID, "scenePackagePrivate").migrationBackup;
    const warning = "O rollback recoloca segredos do manifesto e das Regions em flags públicas da Scene.";
    if (!confirmed) return { skipped: true, reason: "confirmation-required", warning,
      sceneId: scene.id, backupJournalId: journal.id };

    // A rollback against replaced Regions could overwrite new work. Check every
    // original document before making the first write.
    const documents = backup.documents.map(entry => {
      const collection = entry.documentName === "Region" ? scene.regions : scene.drawings;
      const document = collection?.contents?.find(candidate => candidate.id === entry.id);
      if (!document) throw new Error(`Scene Package: ${entry.documentName} original ${entry.id} não existe mais; rollback cancelado.`);
      return { entry, document };
    });
    for (const { entry, document } of documents) {
      const keys = new Set([...Object.keys(entry.flags), "packageRegionId", "packageRegionIndex",
        "automation", "mechanics", "purpose", "kind", "triggered", "automationState"]);
      for (const key of keys) {
        if (!(key in entry.flags)) {
          if (document.getFlag(MODULE_ID, key) !== undefined) await document.unsetFlag(MODULE_ID, key);
        } else if (JSON.stringify(document.getFlag(MODULE_ID, key)) !== JSON.stringify(entry.flags[key])) {
          await document.setFlag(MODULE_ID, key, clone(entry.flags[key]));
        }
      }
      const changes = {};
      if (document.name !== entry.name) changes.name = entry.name;
      if (entry.documentName === "Drawing" && document.text !== entry.text) changes.text = entry.text;
      if (Object.keys(changes).length) await document.update(changes);
    }
    if (backup.sceneBuilder) {
      await replacePrivateBackedFlag(scene, "sceneBuilder", backup.sceneBuilder);
    } else if (scene.getFlag(MODULE_ID, "sceneBuilder") !== undefined) {
      await scene.unsetFlag(MODULE_ID, "sceneBuilder");
    }
    await replacePrivateBackedFlag(scene, "scenePackage", backup.scenePackage);
    return { skipped: false, restored: true, warning, sceneId: scene.id, backupJournalId: journal.id };
  }

  async cleanupDeletedSceneManifest(scene) {
    if (!game.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) {
      return { skipped: true, reason: "not-active-gm" };
    }
    const journalId = scene?.getFlag?.(MODULE_ID, "scenePackage")?.manifestJournalId;
    if (!journalId) return { skipped: true, reason: "no-private-manifest" };
    if (Array.from(game.scenes ?? []).some(other =>
      other.id !== scene.id && other.getFlag?.(MODULE_ID, "scenePackage")?.manifestJournalId === journalId
    )) return { skipped: true, reason: "shared-manifest" };
    const journal = game.journal?.get(journalId);
    if (!journal || journal.getFlag(MODULE_ID, "scenePackagePrivate")?.sceneId !== scene.id) {
      return { skipped: true, reason: "manifest-mismatch" };
    }
    await deletePrivateJournal(journal);
    return { skipped: false, deletedJournalId: journalId };
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
      const darkness = payload.scene.environment?.darknessLevel;
      if (darkness !== undefined && (!Number.isFinite(Number(darkness)) || Number(darkness) < 0 || Number(darkness) > 1)) {
        errors.push("scene.environment.darknessLevel deve estar entre 0 e 1.");
      }
    }

    if (payload.walls !== undefined && !Array.isArray(payload.walls)) {
      errors.push("walls deve ser lista.");
    }
    if (payload.lights !== undefined && !Array.isArray(payload.lights)) {
      errors.push("lights deve ser lista.");
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
    if (Array.isArray(payload.walls) && payload.scene) {
      errors.push(...inspectWallGeometry(
        payload.walls, payload.scene.columns, payload.scene.rows
      ).errors);
    }

    if (payload.actors !== undefined && !Array.isArray(payload.actors)) {
      errors.push("actors deve ser lista.");
    }
    if (payload.sounds !== undefined && !Array.isArray(payload.sounds)) {
      errors.push("sounds deve ser lista.");
    }
    (Array.isArray(payload.sounds) ? payload.sounds : []).forEach((sound, index) => {
      if (!sound?.path || typeof sound.path !== "string") errors.push(`sounds[${index}].path é obrigatório.`);
      if (!finite(sound?.x) || !finite(sound?.y) || !finite(sound?.radius) || Number(sound.radius) <= 0) {
        errors.push(`sounds[${index}] precisa de x, y e radius válido.`);
      }
    });
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

  async prepareActors(payload, { allowMissingActors = false, includeOptionalActors = false } = {}) {
    const tokens = [];
    const requiredMissing = [];
    const optionalMissing = [];
    const optionalSkipped = [];
    const resolved = [];

    for (const spec of payload.actors ?? []) {
      if (spec.optional && !includeOptionalActors) {
        optionalSkipped.push(spec.actor ?? spec.actorId ?? spec.actorUuid ?? "Actor opcional");
        continue;
      }

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

    return { tokens, requiredMissing, optionalMissing, optionalSkipped, resolved };
  }

  toBlueprint(payload, backgroundSrc, tokens) {
    const scene = payload.scene;
    const grid = scene.grid ?? {};

    return {
      schemaVersion: "1.0",
      id: "scene-package-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      metadata: {
        scenePackage: { version: PACKAGE_VERSION }
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
        environment: clone(scene.environment ?? {}),
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
      sounds: clone(payload.sounds ?? []),
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
      sounds: payload.sounds?.length ?? 0,
      actors: payload.actors?.length ?? 0,
      resolvedActors: actors.resolved,
      requiredMissing: actors.requiredMissing,
      optionalMissing: actors.optionalMissing,
      optionalSkipped: actors.optionalSkipped,
      regions: payload.regions?.length ?? 0,
      puzzles: payload.puzzles?.length ?? 0,
      rewards: payload.rewards?.length ?? 0,
      hasVisual: Boolean(payload.visual?.backgroundSrc || payload.visual?.backgroundBase64),
      geometryWarnings: inspectWallGeometry(
        payload.walls ?? [], payload.scene.columns, payload.scene.rows
      ).warnings
    };
  }

  async build(payload, {
    replaceExisting = false,
    createFolder = true,
    allowMissingActors = false,
    includeOptionalActors = false,
    activate = false,
    view = true,
    includeBlueprintOverlay = false,
    strictRegions = false
  } = {}) {
    if (!game.user?.isGM) throw new Error("Scene Package: apenas o GM pode construir Scenes.");

    this.validate(payload);

    if (!replaceExisting && game.scenes?.find(scene => normalize(scene.name) === normalize(payload.scene.name))) {
      throw new Error(`Scene Package: a Scene '${payload.scene.name}' já existe. Use replaceExisting: true.`);
    }

    const actors = await this.prepareActors(payload, { allowMissingActors, includeOptionalActors });
    const uploaded = await uploadVisualAsset(payload.visual ?? {});
    const backgroundSrc = uploaded.src;
    let blueprint;
    let built;
    try {
      blueprint = this.toBlueprint(payload, backgroundSrc, actors.tokens);
      built = await this.builder.build(blueprint, {
        replaceExisting,
        deferFinalize: true,
        createFolder,
        allowMissingActors,
        activate: false,
        view: false,
        includeBlueprintOverlay
      });
    } catch (error) {
      if (uploaded.assetId) await updateSceneAssetUpload(uploaded.assetId,
        { status: "review", reason: "scene-build-failed" }).catch(ledgerError =>
          console.error(`${MODULE_ID} | Falha ao registrar imagem órfã`, ledgerError)
        );
      throw error;
    }

    const scene = built.scene;
    let regionSummary;
    let privateJournal;
    try {
      const gridSize = Number(scene.grid?.size ?? payload.scene.grid?.size ?? 100);
      regionSummary = await createRegions(
        scene,
        payload.regions ?? [],
        gridSize,
        { strictRegions }
      );

      const manifest = stripLargePackageData(payload);
      privateJournal = await createPrivateManifest(scene, {
        sceneId: scene.id,
        manifest,
        actorResolution: {
          resolved: actors.resolved,
          requiredMissing: actors.requiredMissing,
          optionalMissing: actors.optionalMissing,
          optionalSkipped: actors.optionalSkipped
        }
      });
      await scene.setFlag(MODULE_ID, "scenePackage", publicPackageFlag({
        version: PACKAGE_VERSION,
        builtAt: Date.now(),
        regionSummary
      }, privateJournal.id));
      await scrubLegacySceneBuilderFlag(scene);

      if (uploaded.assetId) await updateSceneAssetUpload(uploaded.assetId,
        { status: "linked", sceneId: scene.id });

      await this.builder.finalize({
        scene,
        existing: built.existing,
        requestedName: built.requestedName,
        requestedNavigation: built.requestedNavigation,
        activate,
        view
      });
    } catch (error) {
      if (privateJournal) await deletePrivateJournal(privateJournal).catch(cleanupError =>
        console.error(`${MODULE_ID} | Falha ao limpar manifesto privado`, cleanupError)
      );
      await scene.delete().catch(cleanupError =>
        console.error(`${MODULE_ID} | Falha ao limpar pacote preparado`, cleanupError)
      );
      if (uploaded.assetId) await updateSceneAssetUpload(uploaded.assetId,
        { status: "review", reason: "scene-finalization-failed" }).catch(ledgerError =>
          console.error(`${MODULE_ID} | Falha ao registrar imagem órfã`, ledgerError)
        );
      throw error;
    }

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
    const safePackage = packageFlag ? publicPackageFlag(packageFlag) : null;
    const privateRecord = game.user?.isGM ? privateManifestRecord(scene, packageFlag) : null;
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
      packageId: game.user?.isGM ? (privateRecord?.manifest?.id ?? packageFlag?.id ?? null) : null,
      version: packageFlag?.version ?? null,
      counts: {
        walls: scene.walls?.size ?? 0,
        doors: scene.walls?.filter?.(wall => wall.door !== CONST.WALL_DOOR_TYPES.NONE)?.length ?? 0,
        lights: scene.lights?.size ?? 0,
        sounds: scene.sounds?.size ?? 0,
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
        && safePackage.regionSummary.failureCount === 0,
      package: game.user?.isGM && privateRecord
        ? { ...safePackage, id: privateRecord.manifest.id ?? null,
            manifest: privateRecord.manifest, actorResolution: privateRecord.actorResolution }
        : safePackage
    };
  }

  async handleRegionEvent({ behavior, event, region, scene } = {}) {
    if (!game.user?.isGM) return { skipped: true, reason: "not-gm" };
    if (!isActiveGM()) {
      return { skipped: true, reason: "not-active-gm" };
    }
    if (!scene || !region) return { skipped: true, reason: "missing-context" };
    if (region.getFlag?.(MODULE_ID, "repairStaged")) return { skipped: true, reason: "repair-staged" };

    const spec = getRegionSpec(region, scene);
    if (!spec?.automation) return { skipped: true, reason: "no-automation" };

    const token = event?.data?.token ?? null;
    const filter = spec.automation.filter ?? {};

    if (filter.actor && (!token || (
      normalize(token.actor?.name) !== normalize(filter.actor)
      && normalize(token.name) !== normalize(filter.actor)
    ))) {
      return { skipped: true, reason: "actor-filter" };
    }

    const once = Boolean(spec.automation.once);
    if (once && region.getFlag(MODULE_ID, "triggered")) {
      return { skipped: true, reason: "already-triggered" };
    }
    if (once && regionEventLocks.has(region)) return { skipped: true, reason: "in-progress" };
    const state = once ? region.getFlag(MODULE_ID, "automationState") : null;
    if (state?.status === "running" || state?.status === "partial") {
      return { skipped: true, reason: "needs-review", state: state.status };
    }
    if (once) regionEventLocks.add(region);
    try {
      if (once) await region.setFlag(MODULE_ID, "automationState", {
        status: "running", startedAt: Date.now()
      });
      const results = await executeActions(
        scene,
        spec.automation.actions ?? [],
        { behavior, event, region, token }
      );
      const succeeded = results.every(result => result.ok);
      if (once && succeeded) {
        await region.setFlag(MODULE_ID, "triggered", true);
        await region.unsetFlag?.(MODULE_ID, "automationState");
      } else if (once) {
        await region.setFlag(MODULE_ID, "automationState", {
          status: "partial", stoppedAt: Date.now(),
          completed: results.filter(result => result.ok).length,
          failed: results.filter(result => !result.ok).length
        });
      }
      return { skipped: false, results, succeeded };
    } catch (error) {
      if (once && region.getFlag(MODULE_ID, "automationState")?.status === "running") {
        await region.setFlag(MODULE_ID, "automationState", {
          status: "partial", stoppedAt: Date.now(), reason: "execution-error"
        }).catch(stateError => console.error(`${MODULE_ID} | Falha ao registrar ação parcial da Region`, stateError));
      }
      throw error;
    } finally {
      if (once) regionEventLocks.delete(region);
    }
  }

  async resetRegionAutomation(sceneRef, regionRef, { confirmed = false } = {}) {
    if (!isActiveGM()) throw new Error("Scene Package: apenas o GM ativo pode revisar automações de Regions.");
    const scene = resolveScene(sceneRef);
    if (!scene) throw new Error("Scene Package: Scene não encontrada.");
    const region = typeof regionRef === "string"
      ? scene.regions?.contents?.find(entry => entry.id === regionRef)
      : scene.regions?.contents?.find(entry => entry.id === regionRef?.id);
    if (!region || !region.getFlag(MODULE_ID, "scenePackageRegion")) {
      throw new Error("Scene Package: Region gerenciada não encontrada.");
    }
    if (regionEventLocks.has(region)) throw new Error("Scene Package: ação da Region ainda está em andamento.");
    const state = region.getFlag(MODULE_ID, "automationState");
    if (!state || !["running", "partial"].includes(state.status)) {
      return { skipped: true, reason: "no-review-state" };
    }
    const warning = "Confira os efeitos já executados antes de reiniciar: ações anteriores podem ocorrer novamente.";
    if (!confirmed) return { skipped: true, reason: "confirmation-required", warning, state };
    await region.unsetFlag(MODULE_ID, "automationState");
    return { skipped: false, reset: true, warning, regionId: region.id };
  }

  async repairRegions(sceneRef, { strictRegions = false } = {}) {
    if (!game.user?.isGM) throw new Error("Scene Package: apenas o GM pode reparar Regions.");
    if (!isActiveGM()) throw new Error("Scene Package: apenas o GM ativo pode reparar Regions.");

    const scene = resolveScene(sceneRef);
    if (!scene) throw new Error("Scene Package: Scene não encontrada.");
    if (regionRepairLocks.has(scene)) throw new Error("Scene Package: reparo de Regions já está em andamento.");
    regionRepairLocks.add(scene);

    try {
      return await this.#repairRegions(scene, { strictRegions });
    } finally {
      regionRepairLocks.delete(scene);
    }
  }

  async #repairRegions(scene, { strictRegions }) {

    const regions = privateManifestRecord(scene)?.manifest?.regions;

    if (!Array.isArray(regions)) {
      throw new Error("Scene Package: esta Scene não possui manifesto de Regions para reparar.");
    }

    const existingRegions = scene.regions?.contents?.filter(region =>
      Boolean(region.getFlag(MODULE_ID, "scenePackageRegion"))
    ) ?? [];
    if (existingRegions.some(region => regionEventLocks.has(region))) {
      throw new Error("Scene Package: aguarde as ações de Regions em andamento antes do reparo.");
    }
    const fallbackDrawings = scene.drawings?.contents?.filter(drawing =>
      Boolean(drawing.getFlag(MODULE_ID, "scenePackageRegionFallback"))
    ) ?? [];
    const previousRegionIds = new Set(existingRegions.map(region => region.id));
    const previousDrawingIds = new Set(fallbackDrawings.map(drawing => drawing.id));
    const triggeredIndices = new Set();
    const automationStates = new Map();
    for (const region of existingRegions) {
      const stored = region.getFlag(MODULE_ID, "packageRegionIndex");
      const index = stored !== undefined && stored !== null && Number.isInteger(Number(stored))
        ? Number(stored)
        : regions.findIndex(spec => spec.id === region.getFlag(MODULE_ID, "packageRegionId"));
      if (index < 0) continue;
      if (region.getFlag(MODULE_ID, "triggered")) triggeredIndices.add(index);
      const state = region.getFlag(MODULE_ID, "automationState");
      if (state?.status === "running" || state?.status === "partial") automationStates.set(index, clone(state));
    }

    const stagedIds = (collection, previousIds, flag) =>
      collection?.contents?.filter(document =>
        !previousIds.has(document.id) && Boolean(document.getFlag(MODULE_ID, flag))
      ).map(document => document.id) ?? [];

    const gridSize = Number(scene.grid?.size ?? 100);
    let regionSummary;
    try {
      // Build replacements first so a failed Region or Drawing cannot erase working originals.
      regionSummary = await createRegions(scene, regions, gridSize, { strictRegions, staged: true });
      if (regionSummary.failures.length) {
        throw new Error(`Scene Package: ${regionSummary.failures.length} Region(s) não puderam ser reparadas.`);
      }
      for (const region of scene.regions?.contents ?? []) {
        if (previousRegionIds.has(region.id)) continue;
        const index = Number(region.getFlag(MODULE_ID, "packageRegionIndex"));
        if (triggeredIndices.has(index)) await region.setFlag(MODULE_ID, "triggered", true);
        if (automationStates.has(index)) await region.setFlag(MODULE_ID, "automationState", automationStates.get(index));
      }
    } catch (error) {
      const stagedRegions = stagedIds(scene.regions, previousRegionIds, "scenePackageRegion");
      const stagedDrawings = stagedIds(scene.drawings, previousDrawingIds, "scenePackageRegionFallback");
      if (stagedRegions.length) await scene.deleteEmbeddedDocuments("Region", stagedRegions).catch(cleanupError =>
        console.error(`${MODULE_ID} | Falha ao limpar Regions de reparo`, cleanupError)
      );
      if (stagedDrawings.length) await scene.deleteEmbeddedDocuments("Drawing", stagedDrawings).catch(cleanupError =>
        console.error(`${MODULE_ID} | Falha ao limpar Drawings de reparo`, cleanupError)
      );
      throw error;
    }

    // A deletion failure leaves the newly built replacements in place for recovery.
    if (existingRegions.length) {
      await scene.deleteEmbeddedDocuments("Region", [...previousRegionIds]);
    }
    if (fallbackDrawings.length) {
      await scene.deleteEmbeddedDocuments("Drawing", [...previousDrawingIds]);
    }

    for (const region of scene.regions?.contents ?? []) {
      if (!previousRegionIds.has(region.id) && region.getFlag(MODULE_ID, "repairStaged")) {
        await region.unsetFlag(MODULE_ID, "repairStaged");
      }
    }
    for (const drawing of scene.drawings?.contents ?? []) {
      if (!previousDrawingIds.has(drawing.id) && drawing.getFlag(MODULE_ID, "repairStaged")) {
        await drawing.unsetFlag(MODULE_ID, "repairStaged");
      }
    }

    await scene.update({
      ["flags." + MODULE_ID + ".scenePackage.regionSummary"]: publicRegionSummary(regionSummary),
      ["flags." + MODULE_ID + ".scenePackage.repairedAt"]: Date.now()
    });

    const inspection = this.inspect(scene);

    ui.notifications?.info(
      "Jarvis: Regions reparadas — " +
      regionSummary.regions + " Region(s), " +
      regionSummary.automationFallbacks + " sem automação, " +
      regionSummary.fallbacks + " fallback(s)."
    );

    return { scene, regionSummary, inspection };
  }

  async runAction(sceneRef, key) {
    if (!game.user?.isGM) throw new Error("Scene Package: apenas o GM pode executar ações manuais.");
    if (!isActiveGM()) throw new Error("Scene Package: apenas o GM ativo pode executar ações manuais.");

    const scene = resolveScene(sceneRef);
    if (!scene) throw new Error("Scene Package: Scene não encontrada.");

    const actions = privateManifestRecord(scene)?.manifest?.manualActions?.[key];

    if (!Array.isArray(actions)) {
      throw new Error("Scene Package: ação manual desconhecida: '" + key + "'.");
    }

    return executeActions(scene, actions, { manual: true, key });
  }
}
