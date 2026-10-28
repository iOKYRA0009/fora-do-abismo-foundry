import { validateJarvisActorPayload } from "../importer/validators/payload-validator.js";
import { validateSceneBlueprint } from "../scenes/scene-blueprint-validator.js";

export const EXECUTOR_VERSION = "jarvis-executor-1";
const IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL = 48 * 1024 * 1024;
const DIRECTORY = "jarvis-executor-assets";
let activeExecution = false;

function activeGM() {
  if (!game.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) {
    throw new Error("Jarvis Executor: apenas o Mestre ativo pode executar macros e pacotes.");
  }
}

function object(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function normalize(value) { return String(value ?? "").trim().toLocaleLowerCase("pt-BR"); }
function list(value, key, max) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error(`Jarvis Executor: '${key}' deve ser uma lista com até ${max} entradas.`);
  return value;
}
function availableAssets(manifest, files) {
  const fileList = Array.from(files ?? []);
  const seen = new Set();
  let total = 0;
  for (const asset of manifest) {
    if (!object(asset) || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(asset.id ?? ""))) {
      throw new Error("Jarvis Executor: cada imagem precisa de um id alfanumérico.");
    }
    if (seen.has(asset.id)) throw new Error(`Jarvis Executor: imagem duplicada '${asset.id}'.`);
    seen.add(asset.id);
    const embedded = asset.dataBase64 !== undefined;
    const matching = fileList.filter(f => f.name === asset.fileName);
    if (!embedded && matching.length !== 1) {
      throw new Error(`Jarvis Executor: selecione o arquivo '${asset.fileName}' para a imagem '${asset.id}'.`);
    }
    const file = matching[0];
    const bytes = embedded ? Math.ceil(String(asset.dataBase64).length * 0.75) : Number(file.size);
    const mime = embedded ? asset.mimeType : file?.type;
    if (!IMAGE_TYPES[mime] || !bytes || bytes > MAX_BYTES) {
      throw new Error(`Jarvis Executor: imagem '${asset.id}' deve ser PNG/JPG/WebP/GIF de até 8 MB.`);
    }
    if (embedded && (!/^[A-Za-z0-9+/]+={0,2}$/.test(String(asset.dataBase64)) || String(asset.dataBase64).length % 4)) {
      throw new Error(`Jarvis Executor: base64 inválido na imagem '${asset.id}'.`);
    }
    total += bytes;
  }
  if (total > MAX_TOTAL) throw new Error("Jarvis Executor: imagens ultrapassam o limite total de 48 MB.");
  return manifest.map(asset => ({ id: asset.id, fileName: asset.fileName, mimeType: asset.mimeType ?? fileList.find(f=>f.name === asset.fileName)?.type, size: asset.dataBase64 ? Math.ceil(asset.dataBase64.length * 0.75) : fileList.find(f => f.name === asset.fileName)?.size }));
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

export function previewJarvisExecution(source, { mode = "auto", files = [] } = {}) {
  activeGM();
  const parsed = parseSource(source, mode);
  if (parsed.kind === "javascript") {
    return { kind: "javascript", source: parsed.source, files: [], review: {
      kind: "javascript", warning: "JavaScript executa com todas as permissões do Mestre. Não há análise confiável de alterações nem desfazer automático.",
      lines: parsed.source.split("\n").length, characters: parsed.source.length, codePreview: parsed.source.slice(0, 6000)
    } };
  }
  const pkg = parsed.data;
  if (!object(pkg) || pkg.schemaVersion !== EXECUTOR_VERSION) {
    throw new Error(`Jarvis Executor: schemaVersion deve ser '${EXECUTOR_VERSION}'.`);
  }
  const actors = list(pkg.actors, "actors", 20);
  const scenes = list(pkg.scenes, "scenes", 10);
  const additions = list(pkg.itemAdditions, "itemAdditions", 30);
  const assets = list(pkg.assets, "assets", 40);
  if (!actors.length && !scenes.length && !additions.length) {
    throw new Error("Jarvis Executor: pacote sem NPCs, cenas ou itens.");
  }
  const actorNames = new Set();
  for (const [i, actor] of actors.entries()) {
    validateJarvisActorPayload(actor);
    const name = normalize(actor.actor.name);
    if (actorNames.has(name)) throw new Error(`Jarvis Executor: NPC duplicado no pacote: '${actor.actor.name}'.`);
    actorNames.add(name);
  }
  const sceneNames = new Set();
  for (const blueprint of scenes) {
    validateSceneBlueprint(blueprint);
    const name = normalize(blueprint.scene.name);
    if (sceneNames.has(name)) throw new Error(`Jarvis Executor: mapa duplicado: '${blueprint.scene.name}'.`);
    sceneNames.add(name);
    for (const token of blueprint.tokens ?? []) {
      if (token.actor && !actorNames.has(normalize(token.actor))
        && !game.actors?.contents?.some(a => normalize(a.name) === normalize(token.actor))) {
        throw new Error(`Jarvis Executor: Token sem NPC correspondente: '${token.actor}'.`);
      }
    }
  }
  for (const addition of additions) {
    if (!object(addition) || !String(addition.actor ?? "").trim()) throw new Error("Jarvis Executor: itemAdditions exige actor.");
    if (!Array.isArray(addition.items) || !addition.items.length || addition.items.length > 60
      || addition.items.some(i => !i.name || !i.type)) {
      throw new Error("Jarvis Executor: cada itemAdditions exige até 60 itens com name e type.");
    }
    if (!actorNames.has(normalize(addition.actor)) && !game.actors?.contents?.some(a => normalize(a.name) === normalize(addition.actor))) {
      throw new Error(`Jarvis Executor: personagem não encontrado para itens: '${addition.actor}'.`);
    }
  }
  const uploadedAssets = availableAssets(assets, files);
  const known = new Set(assets.map(x => x.id));
  for (const ref of findRefs(pkg)) if (!known.has(ref)) throw new Error(`Jarvis Executor: falta declarar a imagem asset://${ref}.`);
  const existingActors = game.actors?.contents ?? [];
  const existingScenes = game.scenes?.contents ?? [];
  for (const actor of actors) if (existingActors.some(x => normalize(x.name) === normalize(actor.actor.name))) {
    throw new Error(`Jarvis Executor: personagem '${actor.actor.name}' já existe. Não sobrescreveremos a ficha.`);
  }
  for (const blueprint of scenes) if (existingScenes.some(x => normalize(x.name) === normalize(blueprint.scene.name))) {
    throw new Error(`Jarvis Executor: cena '${blueprint.scene.name}' já existe. Não sobrescreveremos o mapa.`);
  }
  return { kind: "package", data: pkg, files: Array.from(files), review: {
    kind: "package", name: String(pkg.name ?? "Pacote Jarvis"), actors: actors.map(a => ({
      name: a.actor.name, items: a.items?.length ?? 0, effects: a.effects?.length ?? 0,
      activities: (a.items ?? []).reduce((sum, i) => sum + (i.jarvis?.activities?.length ?? 0), 0)
    })), scenes: scenes.map(s => ({
      name: s.scene.name, walls: s.walls?.length ?? 0, lights: s.lights?.length ?? 0,
      sounds: s.sounds?.length ?? 0, tokens: s.tokens?.length ?? 0
    })), itemAdditions: additions.map(x => ({ actor: x.actor, items: x.items.length })),
    images: uploadedAssets, warning: "Cria documentos novos. Se algo falhar, NPCs e cenas novos serão removidos; arquivos de imagem enviados podem permanecer no armazenamento."
  } };
}

function pickerClass() {
  return globalThis.foundry?.applications?.apps?.FilePicker ?? globalThis.FilePicker;
}

async function ensureDirectory(picker) {
  try { await picker.browse("data", DIRECTORY); }
  catch {
    try { await picker.createDirectory("data", DIRECTORY); }
    catch (error) {
      try { await picker.browse("data", DIRECTORY); }
      catch { throw error; }
    }
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
  await ensureDirectory(picker);
  const paths = {};
  for (const asset of assets) {
    const file = asset.dataBase64
      ? new File([decodeBase64(asset.dataBase64)], asset.fileName ?? `${asset.id}.${IMAGE_TYPES[asset.mimeType]}`, { type: asset.mimeType })
      : files.find(f => f.name === asset.fileName);
    const ext = IMAGE_TYPES[file.type];
    const name = `jarvis-${Date.now()}-${globalThis.foundry?.utils?.randomID?.(12) ?? Math.random().toString(36).slice(2)}.${ext}`;
    const uploaded = await picker.upload("data", DIRECTORY, new File([file], name, { type: file.type }), {}, { notify: false });
    if (uploaded?.error || uploaded?.success === false || typeof uploaded?.path !== "string"
      || !uploaded.path.startsWith(`${DIRECTORY}/`)) {
      throw new Error(`Jarvis Executor: upload não confirmado para imagem '${asset.id}'.`);
    }
    paths[asset.id] = uploaded.path;
  }
  return paths;
}

export async function runJarvisExecution(plan, api) {
  activeGM();
  if (activeExecution) throw new Error("Jarvis Executor: já existe uma execução em andamento.");
  if (!plan || !["javascript", "package"].includes(plan.kind)) throw new Error("Jarvis Executor: realize a prévia primeiro.");
  activeExecution = true;
  try {
    if (plan.kind === "javascript") {
      // Explicit GM-only opt-in. Browser-side JS is deliberately NOT sandboxed.
      // Same authority as a native Foundry script macro.
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const script = new AsyncFunction("jarvis", "game", "canvas", "ui", plan.source);
      return { kind: "javascript", output: await script(api, game, globalThis.canvas, globalThis.ui) };
    }
    // Revalidate immediately before any mutation or upload.
    const verified = previewJarvisExecution(JSON.stringify(plan.data), { mode: "package", files: plan.files });
    const payload = verified.data;
    const images = await uploadAssets(payload.assets ?? [], plan.files);
    const resolved = replaceRefs(payload, images);
    const createdActors = [];
    const createdScenes = [];
    const addedItems = [];
    try {
      for (const actorPayload of resolved.actors ?? []) {
        const actor = await api.importer.importActor(actorPayload, { renderSheet: false });
        createdActors.push(actor);
      }
      for (const addition of resolved.itemAdditions ?? []) {
        const actor = (game.actors?.contents ?? []).find(a => normalize(a.name) === normalize(addition.actor))
          ?? createdActors.find(a => normalize(a.name) === normalize(addition.actor));
        if (!actor) throw new Error(`Jarvis Executor: não foi possível localizar '${addition.actor}' após criação.`);
        const items = await api.importer.importItems(actor, addition.items, { sourceLabel: "Jarvis Executor" });
        addedItems.push({ actor, items });
      }
      for (const blueprint of resolved.scenes ?? []) {
        const result = await api.scenes.build(blueprint, {
          replaceExisting: false, activate: false, view: false, allowMissingActors: false
        });
        const scene = result?.scene ?? result;
        if (scene?.delete) createdScenes.push(scene);
        else throw new Error("Jarvis Executor: Scene Builder não retornou uma cena rastreável.");
      }
    } catch (error) {
      const rollbackErrors = [];
      for (const scene of createdScenes.reverse()) try { await scene.delete(); } catch (e) { rollbackErrors.push(e); }
      for (const addition of addedItems.reverse()) {
        if (createdActors.includes(addition.actor)) continue;
        try { await addition.actor.deleteEmbeddedDocuments("Item", addition.items.map(i=>i.id)); }
        catch (e) { rollbackErrors.push(e); }
      }
      for (const actor of createdActors.reverse()) try { await actor.delete(); } catch (e) { rollbackErrors.push(e); }
      if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "Jarvis Executor: falha e reversão incompleta. Revise os documentos criados.");
      throw error;
    }
    return {
      kind: "package", name: resolved.name ?? "Pacote Jarvis", actors: createdActors.map(a => ({ id:a.id, name:a.name, items:a.items?.size ?? a.items?.length ?? null })),
      scenes: createdScenes.map(s => ({ id:s.id, name:s.name })), itemAdditions: addedItems.map(a=>a.items.length),
      images, note: "Concluído. Os arquivos enviados ficam no armazenamento do Foundry."
    };
  } finally { activeExecution = false; }
}
