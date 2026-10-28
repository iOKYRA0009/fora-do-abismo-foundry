import { validateJarvisActorPayload } from "../importer/validators/payload-validator.js";
import { validateSceneBlueprint } from "../scenes/scene-blueprint-validator.js";
import { inspectExecutorSceneGeometry } from "../scenes/package/executor-scene-geometry.js";
import { calibrateExecutorScene } from "../scenes/package/scene-calibration.js";
import { getAppearanceStatus } from "../integrations/visage-bridge.js";
import { getTransformationStatus } from "../integrations/metamorph-bridge.js";

export const EXECUTOR_VERSION = "jarvis-executor-1";
const IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL = 48 * 1024 * 1024;
const DIRECTORY = "jarvis-executor-assets";
const EXT_MIMES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const MODULE_ID = "fora-do-abismo-foundry";
const HISTORY_KEY = "executorHistory";
const HISTORY_LIMIT = 20;
const planSnapshots = new WeakMap();
let historyWrite = Promise.resolve();
const fallbackHistory = new WeakMap();
function mimeForFile(file) {
  if (IMAGE_TYPES[file?.type]) return file.type;
  const ext = String(file?.name ?? "").split(".").pop().toLowerCase();
  return EXT_MIMES[ext] ?? "";
}

let activeExecution = false;

function activeGM() {
  if (!game.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) {
    throw new Error("Jarvis Executor: apenas o Mestre ativo pode executar macros e pacotes.");
  }
}

function object(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function normalize(value) { return String(value ?? "").trim().toLocaleLowerCase("pt-BR"); }
function collectionValues(collection) {
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection?.contents)) return collection.contents;
  return typeof collection?.values === "function" ? Array.from(collection.values()) : [];
}
function documentFlag(document, key) {
  return document?.getFlag?.(MODULE_ID, key) ?? document?.flags?.[MODULE_ID]?.[key];
}
function recordId() {
  return globalThis.crypto?.randomUUID?.() ?? `jarvis-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function actorMatches(name) { return collectionValues(game.actors).filter(a => normalize(a.name) === normalize(name)); }
function findActor(name) {
  const matches = actorMatches(name);
  if (matches.length > 1) throw new Error(`Jarvis Executor: há ${matches.length} personagens chamados '${name}'. Use nomes únicos antes de adicionar itens ou tokens.`);
  return matches[0] ?? null;
}
function findById(collection, id) {
  return collection?.get?.(id) ?? collectionValues(collection).find(entry => entry.id === id) ?? null;
}
function readHistory(user = game.user) {
  const saved = user?.getFlag?.(MODULE_ID, HISTORY_KEY);
  return Array.isArray(saved) ? saved : fallbackHistory.get(user) ?? [];
}
async function writeHistory(change) {
  const user = game.user;
  const write = historyWrite.catch(() => {}).then(async () => {
    const next = change(readHistory(user).map(entry => ({ ...entry })));
    if (!Array.isArray(next)) throw new Error("Jarvis Executor: histórico inválido.");
    fallbackHistory.set(user, next.slice(0, HISTORY_LIMIT));
    if (typeof user?.setFlag === "function") await user.setFlag(MODULE_ID, HISTORY_KEY, next.slice(0, HISTORY_LIMIT));
    return next;
  });
  historyWrite = write.catch(() => {});
  return write;
}
function modifyHistory(id, patch) {
  return writeHistory(entries => entries.map(entry => entry.id === id ? { ...entry, ...patch } : entry));
}
export function listJarvisExecutionHistory() {
  activeGM();
  return structuredClone(readHistory().map(entry => ({ ...entry })));
}
function marker(document, kind) {
  return kind === "scene" ? documentFlag(document, "sceneBuilder")?.metadata?.executorExecutionId
    : documentFlag(document, "executorExecutionId");
}
function modificationTime(document) { return document?._stats?.modifiedTime ?? null; }
function stampActorPayload(payload, id) {
  const stamped = structuredClone(payload);
  if (!object(stamped.actor.flags)) stamped.actor.flags = {};
  if (!object(stamped.actor.flags[MODULE_ID])) stamped.actor.flags[MODULE_ID] = {};
  stamped.actor.flags[MODULE_ID].executorExecutionId = id;
  return stamped;
}
function stampItems(items, id) {
  return structuredClone(items).map(item => {
    if (!object(item.flags)) item.flags = {};
    if (!object(item.flags[MODULE_ID])) item.flags[MODULE_ID] = {};
    item.flags[MODULE_ID].executorExecutionId = id;
    return item;
  });
}
function stampScene(blueprint, id) {
  const stamped = structuredClone(blueprint);
  if (!object(stamped.metadata)) stamped.metadata = {};
  stamped.metadata.executorExecutionId = id;
  return stamped;
}
function list(value, key, max) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error(`Jarvis Executor: '${key}' deve ser uma lista com até ${max} entradas.`);
  return value;
}
function profileText(value, path, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`Jarvis Executor: '${path}' deve ser texto não vazio com até ${max} caracteres.`);
  }
  return value.trim();
}
function profileKey(value, path) {
  const key = profileText(value, path, 64);
  if (!/^[\p{L}\p{N} _.-]+$/u.test(key) || ["__proto__", "prototype", "constructor"].includes(normalize(key))) {
    throw new Error(`Jarvis Executor: chave de perfil inválida em '${path}'.`);
  }
  return key;
}
function validateIntegrationProfiles(entries, kind, actorNames) {
  const appearance = kind === "appearance";
  const label = appearance ? "appearanceProfiles" : "transformationProfiles";
  const allowed = new Set(appearance
    ? ["actor", "key", "visageId", "mode", "label"]
    : ["actor", "key", "targetActor", "hpMode", "label"]);
  const seen = new Set();
  const summaries = [];
  for (const [index, entry] of entries.entries()) {
    const path = `${label}[${index}]`;
    if (!object(entry) || Object.keys(entry).some(key => !allowed.has(key))) {
      throw new Error(`Jarvis Executor: '${path}' contém campos inválidos.`);
    }
    const actor = profileText(entry.actor, `${path}.actor`);
    if (!actorNames.has(normalize(actor))) {
      throw new Error(`Jarvis Executor: perfil '${path}' exige personagem criado no mesmo pacote; '${actor}' não pode ser alterado.`);
    }
    const key = profileKey(entry.key, `${path}.key`);
    const unique = `${normalize(actor)}:${normalize(key)}`;
    if (seen.has(unique)) throw new Error(`Jarvis Executor: perfil duplicado '${key}' para '${actor}'.`);
    seen.add(unique);
    const extra = appearance
      ? { visageId: profileText(entry.visageId, `${path}.visageId`), mode: entry.mode ?? "identity" }
      : { targetActor: profileText(entry.targetActor, `${path}.targetActor`), hpMode: entry.hpMode ?? "keep-original" };
    if (appearance && !["identity", "overlay"].includes(extra.mode)) {
      throw new Error(`Jarvis Executor: '${path}.mode' deve ser identity ou overlay.`);
    }
    if (!appearance && !["independent", "keep-original", "absolute", "percent"].includes(extra.hpMode)) {
      throw new Error(`Jarvis Executor: '${path}.hpMode' inválido.`);
    }
    if (!appearance && !actorNames.has(normalize(extra.targetActor)) && !findActor(extra.targetActor)) {
      throw new Error(`Jarvis Executor: Actor alvo da transformação não encontrado: '${extra.targetActor}'.`);
    }
    const profileLabel = entry.label === undefined ? null : profileText(entry.label, `${path}.label`, 120);
    summaries.push({ actor, key, ...extra, ...(profileLabel ? { label: profileLabel } : {}) });
  }
  if (entries.length) {
    const status = appearance ? getAppearanceStatus() : getTransformationStatus();
    if (!status.active || !status.apiReady) {
      throw new Error(`Jarvis Executor: ${appearance ? "Visage" : "Metamorph"} precisa estar ativo e com API disponível antes de importar perfis.`);
    }
    return { summaries, status };
  }
  return { summaries, status: null };
}
function imageSignature(bytes, mime) {
  const is = (...header) => header.every((byte, index) => bytes[index] === byte);
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (mime === "image/png") return bytes.length >= 24
    && is(137, 80, 78, 71, 13, 10, 26, 10) && ascii(12, 16) === "IHDR"
    && bytes.slice(16, 20).some(Boolean) && bytes.slice(20, 24).some(Boolean);
  if (mime === "image/jpeg") return bytes.length >= 4 && is(255, 216, 255);
  if (mime === "image/webp") return bytes.length >= 16 && ascii(0, 4) === "RIFF"
    && ascii(8, 12) === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(ascii(12, 16));
  if (mime === "image/gif") return bytes.length >= 13
    && ["GIF87a", "GIF89a"].includes(ascii(0, 6))
    && (bytes[6] || bytes[7]) && (bytes[8] || bytes[9]);
  return false;
}
function assetFileName(asset) {
  const name = asset.fileName;
  if (name === undefined && asset.dataBase64 !== undefined) return null;
  if (typeof name !== "string" || !/^[^\\/\x00-\x1f]{1,180}$/.test(name) || name === "." || name === "..") {
    throw new Error(`Jarvis Executor: fileName inválido na imagem '${asset.id}'.`);
  }
  return name;
}
function validBase64(value, id) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`Jarvis Executor: base64 inválido na imagem '${id}'.`);
  }
  try { return decodeBase64(value); }
  catch { throw new Error(`Jarvis Executor: base64 inválido na imagem '${id}'.`); }
}
function availableAssets(manifest, files) {
  const fileList = Array.from(files ?? []);
  const seen = new Set();
  let total = 0;
  const summary = [];
  for (const asset of manifest) {
    if (!object(asset) || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(asset.id ?? ""))) {
      throw new Error("Jarvis Executor: cada imagem precisa de um id alfanumérico.");
    }
    if (seen.has(asset.id)) throw new Error(`Jarvis Executor: imagem duplicada '${asset.id}'.`);
    seen.add(asset.id);
    const embedded = asset.dataBase64 !== undefined;
    const name = assetFileName(asset);
    const matching = fileList.filter(f => f.name === name);
    if (!embedded && matching.length !== 1) {
      throw new Error(`Jarvis Executor: selecione o arquivo '${name}' para a imagem '${asset.id}'.`);
    }
    const file = matching[0];
    const bytes = embedded ? validBase64(asset.dataBase64, asset.id) : null;
    const mime = embedded ? asset.mimeType : mimeForFile(file);
    const size = embedded ? bytes.length : Number(file.size);
    const extMime = name ? EXT_MIMES[name.split(".").pop().toLowerCase()] : null;
    if (!IMAGE_TYPES[mime] || !Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES
      || (asset.mimeType && asset.mimeType !== mime) || (name && extMime !== mime)) {
      throw new Error(`Jarvis Executor: imagem '${asset.id}' deve ser PNG/JPG/WebP/GIF de até 8 MB.`);
    }
    if (embedded && !imageSignature(bytes, mime)) {
      throw new Error(`Jarvis Executor: formato ou conteúdo inválido na imagem '${asset.id}'.`);
    }
    total += size;
    summary.push({ id: asset.id, fileName: name ?? `${asset.id}.${IMAGE_TYPES[mime]}`, mimeType: mime,
      size, embedded, verified: embedded });
  }
  if (total > MAX_TOTAL) throw new Error("Jarvis Executor: imagens ultrapassam o limite total de 48 MB.");
  return summary;
}

function findRefs(value, result = new Set()) {
  if (typeof value === "string" && value.startsWith("asset://")) result.add(value.slice(8));
  else if (Array.isArray(value)) for (const item of value) findRefs(item, result);
  else if (object(value)) for (const item of Object.values(value)) findRefs(item, result);
  return result;
}
function replaceRefs(value, paths) {
  if (typeof value === "string" && value.startsWith("asset://")) return paths[value.slice(8)];
  if (Array.isArray(value)) return value.map(item => replaceRefs(item, paths));
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceRefs(item, paths)]));
  return value;
}
function parseSource(text, mode) {
  if (typeof text !== "string" || !text.trim() || text.length > 12 * 1024 * 1024) {
    throw new Error("Jarvis Executor: cole um macro ou pacote com até 12 MB.");
  }
  const source = text.trim();
  const type = mode === "javascript" ? "javascript"
    : mode === "package" ? "package" : /^[{[]/.test(source) ? "package" : "javascript";
  if (type === "javascript") return { kind: "javascript", source };
  let data;
  try { data = JSON.parse(source); }
  catch (error) { throw new Error(`Jarvis Executor: JSON inválido. ${error.message}`); }
  return { kind: "package", data };
}

function actorCompleteness(payload, warnings) {
  const actor = payload.actor;
  const semantic = actor.jarvis ?? {};
  const native = actor.system ?? {};
  const abilities = semantic.abilities ?? native.abilities;
  const missing = [];
  for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
    const input = abilities?.[key];
    const value = object(input) ? input.value : input;
    if (!Number.isInteger(Number(value)) || value === null || value === "" || Number(value) < 0) missing.push(key);
  }
  if (missing.length) throw new Error(`Jarvis Executor: '${actor.name}' precisa informar seis atributos válidos; ausentes/inválidos: ${missing.join(", ")}.`);
  const hp = semantic.hp ?? native.attributes?.hp;
  if (!hp || !Number.isFinite(Number(hp.max)) || !Number.isFinite(Number(hp.value))
    || hp.max === null || hp.value === null || Number(hp.max) <= 0
    || Number(hp.value) < 0 || Number(hp.value) > Number(hp.max)) {
    throw new Error(`Jarvis Executor: '${actor.name}' precisa informar PV atuais e máximos válidos.`);
  }
  const ac = semantic.ac ?? native.attributes?.ac;
  const acValue = object(ac) ? (ac.override ?? ac.value ?? ac.flat) : ac;
  if (!Number.isFinite(Number(acValue)) || acValue === null || acValue === "" || Number(acValue) < 0) {
    throw new Error(`Jarvis Executor: '${actor.name}' precisa informar CA válida.`);
  }
  if (!semantic.movement && !native.attributes?.movement) warnings.push(`${actor.name}: deslocamento não informado; confira a ficha após importar.`);
  if (!semantic.skills && !native.skills) warnings.push(`${actor.name}: perícias não informadas; serão usadas as opções padrão do sistema.`);
  if (!semantic.saves && !native.abilities) warnings.push(`${actor.name}: salvaguardas não informadas; serão usadas as opções padrão do sistema.`);
  for (const [index, item] of (payload.items ?? []).entries()) {
    for (const [activityIndex, activity] of (item.jarvis?.activities ?? []).entries()) {
      if (["attack", "damage"].includes(activity.type) && !activity.damage?.parts?.length && !item.system?.damage?.parts?.length) {
        warnings.push(`${actor.name}: ${item.name}, Activity ${activityIndex + 1} sem fórmula de dano explícita.`);
      }
    }
    if (item.jarvis?.uses && !item.jarvis?.uses.max && !item.system?.uses?.max) {
      warnings.push(`${actor.name}: ${item.name}, usos sem máximo explícito.`);
    }
  }
}

function validateActorPayload(payload) {
  try { validateJarvisActorPayload(payload); }
  catch (error) {
    if (Array.isArray(error.details) && error.details.length) {
      error.message = `${error.message} ${error.details.join(" ")}`;
    }
    throw error;
  }
}

export function previewJarvisExecution(source, { mode = "auto", files = [] } = {}) {
  activeGM();
  const parsed = parseSource(source, mode);
  if (parsed.kind === "javascript") {
    const plan = { kind: "javascript", source: parsed.source, files: [], review: {
      kind: "javascript", warning: "JavaScript executa com todas as permissões do Mestre. Não há análise confiável de alterações nem desfazer automático.",
      warnings: ["JavaScript arbitrário tem as permissões do Mestre e não pode ser desfeito pelo Jarvis."],
      errors: [], requiresConfirmation: true, rollbackAvailable: false,
      lines: parsed.source.split("\n").length, characters: parsed.source.length, codePreview: parsed.source.slice(0, 6000)
    } };
    planSnapshots.set(plan, { kind: "javascript", source: parsed.source });
    return plan;
  }
  const pkg = parsed.data;
  if (!object(pkg) || pkg.schemaVersion !== EXECUTOR_VERSION) {
    throw new Error(`Jarvis Executor: schemaVersion deve ser '${EXECUTOR_VERSION}'.`);
  }
  for (const key of Object.keys(pkg)) {
    if (/(visage|metamorph|appearance|transformation)/i.test(key)
      && !["appearanceProfiles", "transformationProfiles"].includes(key)) {
      throw new Error(`Jarvis Executor: campo de integração '${key}' desconhecido; use appearanceProfiles ou transformationProfiles.`);
    }
  }
  const actors = list(pkg.actors, "actors", 20);
  const sceneInputs = list(pkg.scenes, "scenes", 10);
  const calibratedScenes = sceneInputs.map(calibrateExecutorScene);
  const scenes = calibratedScenes.map(row => row.blueprint);
  const additions = list(pkg.itemAdditions, "itemAdditions", 30);
  const assets = list(pkg.assets, "assets", 40);
  const appearanceProfiles = list(pkg.appearanceProfiles, "appearanceProfiles", 40);
  const transformationProfiles = list(pkg.transformationProfiles, "transformationProfiles", 40);
  if (!actors.length && !scenes.length && !additions.length) {
    throw new Error("Jarvis Executor: pacote sem NPCs, cenas ou itens.");
  }
  const warnings = [];
  const actorNames = new Set();
  for (const actor of actors) {
    validateActorPayload(actor);
    actorCompleteness(actor, warnings);
    const name = normalize(actor.actor.name);
    if (actorNames.has(name)) throw new Error(`Jarvis Executor: NPC duplicado no pacote: '${actor.actor.name}'.`);
    actorNames.add(name);
  }
  const appearances = validateIntegrationProfiles(appearanceProfiles, "appearance", actorNames);
  const transformations = validateIntegrationProfiles(transformationProfiles, "transformation", actorNames);
  if (appearanceProfiles.length) warnings.push("Perfis Visage serão registrados em personagens novos, sem aplicar skins automaticamente.");
  if (transformationProfiles.length) warnings.push("Perfis Metamorph serão registrados em personagens novos, sem transformar Tokens automaticamente.");
  const sceneNames = new Set();
  const sceneGeometry = [];
  for (const blueprint of scenes) {
    try { validateSceneBlueprint(blueprint); }
    catch (error) {
      if (Array.isArray(error.details) && error.details.length) error.message += ` ${error.details.join(" ")}`;
      throw error;
    }
    const geometry = inspectExecutorSceneGeometry(blueprint);
    if (geometry.errors.length) throw new Error(`Jarvis Executor: cena '${blueprint.scene.name}' inválida: ${geometry.errors.join(" ")}`);
    warnings.push(...geometry.warnings.map(message => `${blueprint.scene.name}: ${message}`));
    sceneGeometry.push(geometry);
    const name = normalize(blueprint.scene.name);
    if (sceneNames.has(name)) throw new Error(`Jarvis Executor: mapa duplicado: '${blueprint.scene.name}'.`);
    sceneNames.add(name);
    for (const token of blueprint.tokens ?? []) {
      if (token.actor && !actorNames.has(normalize(token.actor)) && !findActor(token.actor)) {
        throw new Error(`Jarvis Executor: Token sem NPC correspondente: '${token.actor}'.`);
      }
      if (token.actorId && !collectionValues(game.actors).some(a => a.id === token.actorId)) {
        throw new Error(`Jarvis Executor: Token com actorId inexistente: '${token.actorId}'.`);
      }
      if (token.actorUuid) warnings.push(`${blueprint.scene.name}: actorUuid do token será conferido pelo Scene Builder na execução.`);
    }
  }
  const additionKeys = new Map();
  for (const addition of additions) {
    if (!object(addition) || !String(addition.actor ?? "").trim()) throw new Error("Jarvis Executor: itemAdditions exige actor.");
    if (!Array.isArray(addition.items) || !addition.items.length || addition.items.length > 60
      || addition.items.some(i => !i.name || !i.type)) {
      throw new Error("Jarvis Executor: cada itemAdditions exige até 60 itens com name e type.");
    }
    validateActorPayload({schemaVersion:"9.0", actor:{name:"Validação de itens", type:"npc"}, items:addition.items});
    if (!actorNames.has(normalize(addition.actor))) {
      if (findActor(addition.actor)) {
        throw new Error(`Jarvis Executor: não é seguro adicionar itens ao personagem existente '${addition.actor}' por pacote; inclua o personagem novo no mesmo pacote.`);
      }
      throw new Error(`Jarvis Executor: personagem não encontrado para itens: '${addition.actor}'.`);
    }
    const key = normalize(addition.actor);
    const seenItems = additionKeys.get(key) ?? new Set([
      ...(actors.find(actor => normalize(actor.actor.name) === key)?.items ?? [])
        .map(item => `${normalize(item.name)}:${item.type}`)
    ]);
    for (const item of addition.items) {
      const itemKey = `${normalize(item.name)}:${item.type}`;
      if (seenItems.has(itemKey)) throw new Error(`Jarvis Executor: Item '${item.name}' já existe em '${addition.actor}'. Não criaremos duplicata.`);
      seenItems.add(itemKey);
    }
    additionKeys.set(key, seenItems);
  }
  const uploadedAssets = availableAssets(assets, files);
  const known = new Set(assets.map(x => x.id));
  const refs = findRefs(pkg);
  for (const ref of refs) if (!known.has(ref)) throw new Error(`Jarvis Executor: falta declarar a imagem asset://${ref}.`);
  for (const asset of assets) if (!refs.has(asset.id)) warnings.push(`Imagem '${asset.id}' declarada mas não usada pelo pacote.`);
  if (uploadedAssets.some(asset => !asset.verified)) warnings.push("Arquivos anexados serão inspecionados byte a byte antes do envio.");
  const existingActors = collectionValues(game.actors);
  const existingScenes = collectionValues(game.scenes);
  for (const actor of actors) if (existingActors.some(x => normalize(x.name) === normalize(actor.actor.name))) {
    throw new Error(`Jarvis Executor: personagem '${actor.actor.name}' já existe. Não sobrescreveremos a ficha.`);
  }
  for (const blueprint of scenes) if (existingScenes.some(x => normalize(x.name) === normalize(blueprint.scene.name))) {
    throw new Error(`Jarvis Executor: cena '${blueprint.scene.name}' já existe. Não sobrescreveremos o mapa.`);
  }
  const plan = { kind: "package", data: pkg, files: Array.from(files), review: {
    kind: "package", name: String(pkg.name ?? "Pacote Jarvis"), actors: actors.map(a => ({
      name: a.actor.name, items: a.items?.length ?? 0, effects: a.effects?.length ?? 0,
      activities: (a.items ?? []).reduce((sum, i) => sum + (i.jarvis?.activities?.length ?? 0), 0)
    })), scenes: scenes.map((s, index) => ({
      name: s.scene.name, walls: s.walls?.length ?? 0, lights: s.lights?.length ?? 0,
      sounds: s.sounds?.length ?? 0, tokens: s.tokens?.length ?? 0,
      doors: s.walls?.filter(w => ["door", "secret"].includes(w.type)).length ?? 0,
      positions: sceneGeometry[index].positions, pixels: sceneGeometry[index].pixels,
      backgroundSrc: sceneInputs[index].scene?.backgroundSrc ?? null,
      calibration: calibratedScenes[index].calibration
    })), itemAdditions: additions.map(x => ({ actor: x.actor, items: x.items.length })),
    appearanceProfiles: appearances.summaries, transformationProfiles: transformations.summaries,
    integrations: {
      ...(appearances.status ? { visage: { active: true, apiReady: true, version: appearances.status.version } } : {}),
      ...(transformations.status ? { metamorph: { active: true, apiReady: true, version: transformations.status.version } } : {})
    },
    images: uploadedAssets, references: Array.from(refs), warnings, errors: [],
    requiresConfirmation: true, rollbackAvailable: true,
    counts: { actors: actors.length, scenes: scenes.length, items: actors.reduce((n,a)=>n+(a.items?.length??0),0)
      + additions.reduce((n,a)=>n+a.items.length,0), images: assets.length,
      appearanceProfiles: appearanceProfiles.length, transformationProfiles: transformationProfiles.length },
    warning: "Cria documentos novos. Se algo falhar, NPCs e cenas novos serão removidos quando possível; arquivos de imagem enviados podem permanecer no armazenamento."
  } };
  planSnapshots.set(plan, { kind: "package", data: JSON.stringify(pkg), files: plan.files.slice() });
  return plan;
}

function pickerClass() {
  return globalThis.foundry?.applications?.apps?.FilePicker ?? globalThis.FilePicker;
}

async function ensureDirectory(picker) {
  try { return await picker.browse("data", DIRECTORY); }
  catch {
    try { await picker.createDirectory("data", DIRECTORY); }
    catch (error) {
      try { return await picker.browse("data", DIRECTORY); }
      catch { throw error; }
    }
    return picker.browse("data", DIRECTORY);
  }
}
function decodeBase64(base64) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
async function uploadAssets(assets, files) {
  if (!assets.length) return {};
  const picker = pickerClass();
  if (!picker?.upload || !picker?.browse || !picker?.createDirectory) throw new Error("Jarvis Executor: FilePicker V14 indisponível para imagens.");
  // Inspect every image before the first upload, so an invalid late attachment
  // cannot leave valid earlier attachments behind.
  const prepared = [];
  for (const asset of assets) {
    const file = asset.dataBase64 === undefined ? files.find(f => f.name === asset.fileName) : null;
    const mime = asset.dataBase64 !== undefined ? asset.mimeType : mimeForFile(file);
    let bytes;
    try { bytes = asset.dataBase64 !== undefined
      ? validBase64(asset.dataBase64, asset.id) : new Uint8Array(await file.arrayBuffer()); }
    catch { throw new Error(`Jarvis Executor: não foi possível ler a imagem '${asset.id}'.`); }
    if (bytes.length <= 0 || bytes.length > MAX_BYTES || !imageSignature(bytes, mime)
      || (file && bytes.length !== file.size)) {
      throw new Error(`Jarvis Executor: conteúdo inválido ou alterado na imagem '${asset.id}'.`);
    }
    if (typeof globalThis.createImageBitmap === "function") {
      try {
        const bitmap = await globalThis.createImageBitmap(new Blob([bytes], { type: mime }));
        if (!bitmap.width || !bitmap.height) throw new Error("dimensões vazias");
        bitmap.close?.();
      } catch { throw new Error(`Jarvis Executor: o Foundry não consegue decodificar a imagem '${asset.id}'.`); }
    }
    prepared.push({ asset, mime, bytes });
  }
  const listing = await ensureDirectory(picker);
  const existing = new Set((listing?.files ?? []).map(path => String(path).split("/").pop()));
  const paths = {};
  for (const { asset, mime, bytes } of prepared) {
    let name;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const nonce = globalThis.crypto?.randomUUID?.()
        ?? globalThis.foundry?.utils?.randomID?.(24)
        ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      name = `jarvis-${nonce}.${IMAGE_TYPES[mime]}`;
      if (!existing.has(name)) break;
      name = null;
    }
    if (!name) throw new Error("Jarvis Executor: não foi possível obter nome exclusivo para imagem.");
    existing.add(name);
    try {
      const uploaded = await picker.upload("data", DIRECTORY, new File([bytes], name, { type: mime }),
        { overwrite: false }, { notify: false });
      if (uploaded?.error || uploaded?.success === false || typeof uploaded?.path !== "string"
        || !uploaded.path.startsWith(`${DIRECTORY}/`) || uploaded.path.split("/").pop() !== name) {
        throw new Error("resposta inesperada do FilePicker");
      }
      paths[asset.id] = uploaded.path;
    } catch (cause) {
      const error = new Error(`Jarvis Executor: upload não confirmado para imagem '${asset.id}'. ${cause.message ?? ""}`);
      error.uploadedImages = { ...paths };
      throw error;
    }
  }
  return paths;
}

function ledgerSnapshot(createdActors, createdScenes, addedItems, images) {
  return {
    actors: createdActors.map(actor => ({ id: actor.id, name: actor.name, modifiedTime: modificationTime(actor) })),
    scenes: createdScenes.map(scene => ({ id: scene.id, name: scene.name, modifiedTime: modificationTime(scene) })),
    items: addedItems.flatMap(({ actor, items }) => items.map(item => ({
      actorId: actor.id, id: item.id, name: item.name, modifiedTime: modificationTime(item)
    }))),
    images: { ...images }
  };
}
function uniqueDocuments(documents) {
  const seen = new Set();
  return documents.filter(document => {
    if (!document?.delete || seen.has(document.id ?? document)) return false;
    seen.add(document.id ?? document);
    return true;
  });
}
async function rollbackCurrent(id, { createdActors, createdScenes, addedItems, beforeActors, beforeScenes, beforeItems }) {
  const errors = [];
  const removed = { actors: [], scenes: [], items: [] };
  const scenes = uniqueDocuments([
    ...createdScenes,
    ...collectionValues(game.scenes).filter(scene => marker(scene, "scene") === id && !beforeScenes.has(scene.id))
  ]);
  for (const scene of scenes.reverse()) {
    if (beforeScenes.has(scene.id)) continue;
    try { await scene.delete(); removed.scenes.push(scene.id); }
    catch (error) { errors.push(`cena ${scene.name ?? scene.id}: ${error.message}`); }
  }
  const createdActorIds = new Set(createdActors.map(actor => actor.id));
  const actorItems = new Map();
  for (const { actor, items } of addedItems) {
    if (!actorItems.has(actor)) actorItems.set(actor, []);
    actorItems.get(actor).push(...items);
  }
  for (const actor of collectionValues(game.actors)) {
    if (createdActorIds.has(actor.id) || marker(actor, "actor") === id) continue;
    const tagged = collectionValues(actor.items).filter(item => marker(item, "item") === id);
    if (tagged.length) actorItems.set(actor, [...(actorItems.get(actor) ?? []), ...tagged]);
  }
  for (const [actor, items] of actorItems) {
    if (createdActorIds.has(actor.id) || marker(actor, "actor") === id) continue;
    const existing = beforeItems.get(actor.id) ?? new Set();
    const ids = [...new Set(items.map(item => item.id).filter(itemId => itemId && !existing.has(itemId)))];
    if (!ids.length) continue;
    try { await actor.deleteEmbeddedDocuments("Item", ids); removed.items.push(...ids); }
    catch (error) { errors.push(`itens de ${actor.name ?? actor.id}: ${error.message}`); }
  }
  const actors = uniqueDocuments([
    ...createdActors,
    ...collectionValues(game.actors).filter(actor => marker(actor, "actor") === id && !beforeActors.has(actor.id))
  ]);
  for (const actor of actors.reverse()) {
    if (beforeActors.has(actor.id)) continue;
    try { await actor.delete(); removed.actors.push(actor.id); }
    catch (error) { errors.push(`personagem ${actor.name ?? actor.id}: ${error.message}`); }
  }
  return { removed, errors };
}

export async function rollbackJarvisExecution(executionId) {
  activeGM();
  if (activeExecution) throw new Error("Jarvis Executor: há uma execução em andamento.");
  const id = String(executionId ?? "").trim();
  const entry = readHistory().find(item => item.id === id);
  if (!entry || entry.kind !== "package") throw new Error("Jarvis Executor: execução estruturada não encontrada no histórico.");
  if (entry.status === "rolled_back") throw new Error("Jarvis Executor: esta execução já foi revertida.");
  activeExecution = true;
  try {
    const skipped = [];
    const errors = [];
    const removed = { actors: [], scenes: [], items: [] };
    const changed = (document, saved) => saved.modifiedTime !== null
      && modificationTime(document) !== null && modificationTime(document) !== saved.modifiedTime;
    // A browser interruption can occur between document creation and the next
    // history write. The execution marker lets us recover those documents too.
    const sceneRows = [...(entry.scenes ?? [])];
    for (const scene of collectionValues(game.scenes)) {
      if (marker(scene, "scene") === id && !sceneRows.some(saved => saved.id === scene.id)) {
        sceneRows.push({ id: scene.id, name: scene.name, modifiedTime: null });
      }
    }
    for (const saved of sceneRows.reverse()) {
      const scene = findById(game.scenes, saved.id);
      if (!scene) continue;
      if (marker(scene, "scene") !== id || changed(scene, saved)) { skipped.push(`Cena '${saved.name}' foi alterada ou não pertence à execução.`); continue; }
      try { await scene.delete(); removed.scenes.push(saved.id); }
      catch (error) { errors.push(`Cena '${saved.name}': ${error.message}`); }
    }
    const itemRows = [...(entry.items ?? [])];
    for (const actor of collectionValues(game.actors)) {
      for (const item of collectionValues(actor.items)) {
        if (marker(item, "item") === id && !itemRows.some(saved => saved.actorId === actor.id && saved.id === item.id)) {
          itemRows.push({ actorId: actor.id, id: item.id, name: item.name, modifiedTime: null });
        }
      }
    }
    const itemGroups = new Map();
    for (const saved of itemRows.reverse()) {
      const actor = findById(game.actors, saved.actorId);
      if (!actor || (entry.actors ?? []).some(created => created.id === actor.id)) continue;
      const item = findById(actor.items, saved.id);
      if (!item) continue;
      if (marker(item, "item") !== id || changed(item, saved)) { skipped.push(`Item '${saved.name}' foi alterado ou não pertence à execução.`); continue; }
      if (!itemGroups.has(actor)) itemGroups.set(actor, []);
      itemGroups.get(actor).push(saved.id);
    }
    for (const [actor, ids] of itemGroups) {
      try { await actor.deleteEmbeddedDocuments("Item", ids); removed.items.push(...ids); }
      catch (error) { errors.push(`Itens de '${actor.name}': ${error.message}`); }
    }
    const actorRows = [...(entry.actors ?? [])];
    for (const actor of collectionValues(game.actors)) {
      if (marker(actor, "actor") === id && !actorRows.some(saved => saved.id === actor.id)) {
        actorRows.push({ id: actor.id, name: actor.name, modifiedTime: null });
      }
    }
    for (const saved of actorRows.reverse()) {
      const actor = findById(game.actors, saved.id);
      if (!actor) continue;
      if (marker(actor, "actor") !== id || changed(actor, saved)) { skipped.push(`Personagem '${saved.name}' foi alterado ou não pertence à execução.`); continue; }
      try { await actor.delete(); removed.actors.push(saved.id); }
      catch (error) { errors.push(`Personagem '${saved.name}': ${error.message}`); }
    }
    const ok = !skipped.length && !errors.length;
    await modifyHistory(id, { status: ok ? "rolled_back" : "partial_rollback", rolledBackAt: Date.now(),
      rollback: { removed, skipped, errors }, message: ok ? "Documentos criados removidos; imagens permanecem no armazenamento."
        : "Reversão parcial; veja os documentos não removidos. Imagens permanecem no armazenamento." });
    return { executionId: id, ok, removed, skipped, errors,
      imagesRemaining: { ...(entry.images ?? {}) } };
  } finally { activeExecution = false; }
}

export async function runJarvisExecution(plan, api) {
  activeGM();
  if (activeExecution) throw new Error("Jarvis Executor: já existe uma execução em andamento.");
  const snapshot = object(plan) ? planSnapshots.get(plan) : null;
  if (!snapshot || !["javascript", "package"].includes(plan.kind)) {
    throw new Error("Jarvis Executor: realize a prévia primeiro.");
  }
  if (plan.kind !== snapshot.kind || plan.kind === "javascript" && plan.source !== snapshot.source
    || plan.kind === "package" && (JSON.stringify(plan.data) !== snapshot.data
      || plan.files?.length !== snapshot.files.length
      || plan.files.some((file, index) => file !== snapshot.files[index]))) {
    throw new Error("Jarvis Executor: o conteúdo mudou depois da prévia. Analise novamente antes de executar.");
  }
  planSnapshots.delete(plan); // Each reviewed plan may be executed only once.
  activeExecution = true;
  const executionId = recordId();
  try {
    if (plan.kind === "javascript") {
      await writeHistory(entries => [{ id: executionId, at: Date.now(), kind: "javascript", name: "Macro JavaScript",
        status: "running", lines: plan.review?.lines ?? null, message: "Execução iniciada; código não tem desfazer automático." }, ...entries]);
      try {
        // Same authority as a native Foundry script macro. The confirmation is
        // explicit in the UI; direct API invocation is itself a GM script action.
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const script = new AsyncFunction("jarvis", "game", "canvas", "ui", plan.source);
        const output = await script(api, game, globalThis.canvas, globalThis.ui);
        await modifyHistory(executionId, { status: "success", finishedAt: Date.now(),
          message: "Macro JavaScript concluída; alterações não têm desfazer automático." });
        return { kind: "javascript", executionId, output };
      } catch (cause) {
        await modifyHistory(executionId, { status: "failed", finishedAt: Date.now(),
          message: `Macro JavaScript: ${String(cause.message ?? cause).slice(0, 250)}` });
        throw new Error(`Jarvis Executor: macro JavaScript falhou: ${cause.message ?? cause}`, { cause });
      }
    }
    if ((plan.data.actors?.length && typeof api?.importer?.importActor !== "function")
      || (plan.data.itemAdditions?.length && typeof api?.importer?.importItems !== "function")
      || (plan.data.scenes?.length && typeof api?.scenes?.build !== "function")) {
      throw new Error("Jarvis Executor: Importer V9 ou Scene Builder indisponível para este pacote.");
    }
    if ((plan.data.appearanceProfiles?.length && typeof api?.appearance?.setProfile !== "function")
      || (plan.data.transformationProfiles?.length && typeof api?.transformation?.setProfile !== "function")) {
      throw new Error("Jarvis Executor: API de perfil Visage ou Metamorph indisponível para este pacote.");
    }
    // Revalidate immediately before any mutation or upload, including names,
    // references and scene geometry, then track every new document by run ID.
    const verified = previewJarvisExecution(JSON.stringify(plan.data), { mode: "package", files: plan.files });
    const payload = verified.data;
    const beforeActors = new Set(collectionValues(game.actors).map(actor => actor.id));
    const beforeScenes = new Set(collectionValues(game.scenes).map(scene => scene.id));
    const beforeItems = new Map(collectionValues(game.actors).map(actor =>
      [actor.id, new Set(collectionValues(actor.items).map(item => item.id))]));
    const createdActors = [];
    const createdScenes = [];
    const addedItems = [];
    let images = {};
    let operation = "envio das imagens";
    await writeHistory(entries => [{ id: executionId, at: Date.now(), kind: "package",
      name: String(payload.name ?? "Pacote Jarvis"), status: "running", actors: [], scenes: [], items: [], images: {},
      message: "Importação iniciada; documentos novos serão rastreados." }, ...entries]);
    try {
      images = await uploadAssets(payload.assets ?? [], plan.files);
      await modifyHistory(executionId, { images: { ...images } });
      const resolved = replaceRefs(payload, images);
      for (const actorPayload of resolved.actors ?? []) {
        operation = `criação do personagem '${actorPayload.actor.name}'`;
        const actor = await api.importer.importActor(stampActorPayload(actorPayload, executionId), { renderSheet: false });
        if (!actor?.id || typeof actor.delete !== "function") throw new Error("Importer V9 não retornou um personagem rastreável.");
        createdActors.push(actor);
        await modifyHistory(executionId, ledgerSnapshot(createdActors, createdScenes, addedItems, images));
      }
      for (const addition of resolved.itemAdditions ?? []) {
        operation = `adição de itens em '${addition.actor}'`;
        const actor = createdActors.find(a => normalize(a.name) === normalize(addition.actor));
        if (!actor) throw new Error(`Jarvis Executor: não foi possível localizar o personagem novo '${addition.actor}' após criação.`);
        const items = await api.importer.importItems(actor, stampItems(addition.items, executionId), { sourceLabel: "Jarvis Executor" });
        if (!Array.isArray(items) || items.length !== addition.items.length || items.some(item => !item.id)) {
          throw new Error("Importer V9 não retornou todos os itens rastreáveis.");
        }
        addedItems.push({ actor, items });
        await modifyHistory(executionId, ledgerSnapshot(createdActors, createdScenes, addedItems, images));
      }
      for (const profile of resolved.appearanceProfiles ?? []) {
        operation = `registro do perfil Visage '${profile.key}' em '${profile.actor}'`;
        const actor = createdActors.find(a => normalize(a.name) === normalize(profile.actor));
        if (!actor) throw new Error(`Jarvis Executor: personagem novo '${profile.actor}' não localizado para Visage.`);
        await api.appearance.setProfile(actor, profile.key, profile.visageId,
          { mode: profile.mode ?? "identity", label: profile.label ?? null });
        await modifyHistory(executionId, ledgerSnapshot(createdActors, createdScenes, addedItems, images));
      }
      for (const profile of resolved.transformationProfiles ?? []) {
        operation = `registro da forma Metamorph '${profile.key}' em '${profile.actor}'`;
        const actor = createdActors.find(a => normalize(a.name) === normalize(profile.actor));
        const target = createdActors.find(a => normalize(a.name) === normalize(profile.targetActor))
          ?? findActor(profile.targetActor);
        if (!actor || !target) throw new Error(`Jarvis Executor: Actor de '${profile.key}' não localizado para Metamorph.`);
        await api.transformation.setProfile(actor, profile.key, target,
          { hpMode: profile.hpMode ?? "keep-original", label: profile.label ?? null });
        await modifyHistory(executionId, ledgerSnapshot(createdActors, createdScenes, addedItems, images));
      }
      for (const originalBlueprint of resolved.scenes ?? []) {
        const blueprint = calibrateExecutorScene(originalBlueprint).blueprint;
        operation = `criação da cena '${blueprint.scene.name}'`;
        const result = await api.scenes.build(stampScene(blueprint, executionId), {
          replaceExisting: false, activate: false, view: false, allowMissingActors: false
        });
        const scene = result?.scene ?? result;
        if (scene?.id && scene?.delete) createdScenes.push(scene);
        else throw new Error("Jarvis Executor: Scene Builder não retornou uma cena rastreável.");
        await modifyHistory(executionId, ledgerSnapshot(createdActors, createdScenes, addedItems, images));
      }
      const ledger = ledgerSnapshot(createdActors, createdScenes, addedItems, images);
      await modifyHistory(executionId, { ...ledger, status: "success", finishedAt: Date.now(),
        message: "Concluído. Documentos rastreados; imagens enviadas permanecem no armazenamento mesmo após reversão." });
      return {
        kind: "package", executionId, name: resolved.name ?? "Pacote Jarvis",
        actors: createdActors.map(a => ({ id:a.id, name:a.name, items:a.items?.size ?? a.items?.length ?? null })),
        scenes: createdScenes.map(s => ({ id:s.id, name:s.name })), itemAdditions: addedItems.map(a=>a.items.length),
        appearanceProfiles: resolved.appearanceProfiles?.length ?? 0,
        transformationProfiles: resolved.transformationProfiles?.length ?? 0,
        images, created: ledger, rollbackAvailable: true,
        note: "Concluído. Os arquivos enviados ficam no armazenamento do Foundry, inclusive após reversão."
      };
    } catch (error) {
      images = { ...images, ...(error.uploadedImages ?? {}) };
      const rollback = await rollbackCurrent(executionId, { createdActors, createdScenes, addedItems,
        beforeActors, beforeScenes, beforeItems });
      const message = `Jarvis Executor: falha em ${operation}. ${error.message ?? error}`;
      await modifyHistory(executionId, { ...ledgerSnapshot(createdActors, createdScenes, addedItems, images),
        status: rollback.errors.length ? "partial_rollback" : "failed", finishedAt: Date.now(), rollback,
        message: `${message} ${Object.keys(images).length ? "Imagens enviadas permanecem no armazenamento." : ""}`.slice(0, 500) });
      if (rollback.errors.length) throw new AggregateError([error, ...rollback.errors.map(text => new Error(text))],
        `${message} Reversão incompleta: ${rollback.errors.join("; ")}`);
      throw new Error(message, { cause: error });
    }
  } finally { activeExecution = false; }
}
