import { inspectWallGeometry } from "./scene-geometry.js";

const MODULE_ID = "fora-do-abismo-foundry";
const HISTORY_FLAG = "sceneEditHistory";
const COLLECTIONS = { Wall: "walls", AmbientLight: "lights", AmbientSound: "sounds", SceneEnvironment: null };
const EDITABLE = {
  Wall: new Set(["c", "door", "ds", "move", "sight", "light", "sound", "dir", "threshold", "flags"]),
  AmbientLight: new Set(["x", "y", "config", "hidden", "flags"]),
  AmbientSound: new Set(["x", "y", "path", "radius", "volume", "repeat", "easing", "hidden", "flags"]),
  SceneEnvironment: new Set(["environment", "backgroundColor"])
};
const sceneLocks = new WeakSet();

function activeGM() {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) {
    throw new Error("Jarvis Cena: apenas o Mestre ativo pode editar cenas.");
  }
}

function clone(value) { return foundry.utils.deepClone(value); }

function resolveScene(ref) {
  if (!ref) return globalThis.canvas?.scene ?? null;
  if (typeof ref === "string") return game.scenes.get(ref) ?? null;
  return ref.documentName === "Scene" ? ref : null;
}

function contents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection.contents)) return collection.contents;
  return Array.from(collection);
}

function merge(base, patch) {
  const next = clone(base);
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)
      && next[key] && typeof next[key] === "object" && !Array.isArray(next[key])) {
      next[key] = merge(next[key], value);
    } else next[key] = clone(value);
  }
  return next;
}

function getDocument(scene, type, id) {
  return contents(scene[COLLECTIONS[type]]).find(document => document.id === id) ?? null;
}

function environmentSnapshot(scene) {
  const data = scene.toObject?.() ?? scene;
  return { environment: clone(data.environment ?? {}), backgroundColor: data.backgroundColor ?? "#000000" };
}

function validateGeometry(scene, type, data) {
  if (type === "SceneEnvironment") {
    if (data.environment && (typeof data.environment !== "object" || Array.isArray(data.environment))) {
      throw new Error("Jarvis Cena: ambiente inválido.");
    }
    const darkness = Number(data.environment?.darknessLevel);
    if (!Number.isFinite(darkness) || darkness < 0 || darkness > 1
      || !/^#[0-9a-f]{6}$/i.test(String(data.backgroundColor ?? ""))) {
      throw new Error("Jarvis Cena: escuridão deve ser 0–1 e cor em formato #RRGGBB.");
    }
    return;
  }
  const width = Number(scene.width);
  const height = Number(scene.height);
  if (![width, height].every(Number.isFinite)) throw new Error("Jarvis Cena: dimensões da cena indisponíveis.");
  const within = (x, y) => Number.isFinite(x) && Number.isFinite(y)
    && x >= 0 && y >= 0 && x <= width && y <= height;
  if (type === "Wall") {
    const c = data.c;
    if (!Array.isArray(c) || c.length !== 4 || !c.every(value => Number.isFinite(Number(value)))
      || !within(Number(c[0]), Number(c[1])) || !within(Number(c[2]), Number(c[3]))
      || (Number(c[0]) === Number(c[2]) && Number(c[1]) === Number(c[3]))) {
      throw new Error("Jarvis Cena: parede inválida ou fora da área do mapa.");
    }
    if (data.door !== undefined && ![0, 1, 2].includes(Number(data.door))) {
      throw new Error("Jarvis Cena: tipo de porta inválido.");
    }
  } else {
    if (!within(Number(data.x), Number(data.y))) {
      throw new Error("Jarvis Cena: luz ou som fora da área do mapa.");
    }
    if (type === "AmbientLight") {
      const dim = Number(data.config?.dim ?? 0);
      const bright = Number(data.config?.bright ?? 0);
      if (![dim, bright].every(value => Number.isFinite(value) && value >= 0)
        || (dim === 0 && bright === 0)) {
        throw new Error("Jarvis Cena: luz precisa de raios válidos e maior que zero.");
      }
    }
    if (type === "AmbientSound" && !String(data.path ?? "").trim()) {
      throw new Error("Jarvis Cena: informe o caminho do áudio hospedado.");
    }
  }
}

function wallWarnings(scene, operation, after) {
  const grid = Number(scene.grid?.size);
  if (!Number.isFinite(grid) || grid <= 0) return [];
  const walls = contents(scene.walls).filter(wall =>
    operation.mode !== "delete" || wall.id !== operation.documentId
  ).filter(wall => operation.mode !== "update" || wall.id !== operation.documentId)
    .map(wall => ({ a: [wall.c[0] / grid, wall.c[1] / grid],
      b: [wall.c[2] / grid, wall.c[3] / grid], type: Number(wall.door) ? "door" : "wall" }));
  if (after) walls.push({ a: [after.c[0] / grid, after.c[1] / grid],
    b: [after.c[2] / grid, after.c[3] / grid], type: Number(after.door) ? "door" : "wall" });
  const geometry = inspectWallGeometry(walls, scene.width / grid, scene.height / grid);
  const loose = new Map();
  for (const wall of walls) for (const point of [wall.a, wall.b]) {
    const key = `${point[0].toFixed(3)},${point[1].toFixed(3)}`;
    const previous = loose.get(key) ?? { point, count: 0 };
    previous.count += 1;
    loose.set(key, previous);
  }
  const ends = [...loose.values()].filter(row => row.count === 1).map(row => row.point);
  const nearby = [];
  const buckets = new Map();
  for (const point of ends) {
    const bx = Math.floor(point[0] * 4);
    const by = Math.floor(point[1] * 4);
    for (let dx = -1; dx <= 1 && nearby.length < 10; dx += 1) {
      for (let dy = -1; dy <= 1 && nearby.length < 10; dy += 1) {
        for (const other of buckets.get(`${bx + dx},${by + dy}`) ?? []) {
          const distance = Math.hypot(point[0] - other[0], point[1] - other[1]);
          if (distance > 0.001 && distance <= 0.25) {
            nearby.push(`Possível abertura de ${distance.toFixed(2)} quadrado(s) entre pontas de paredes; revise no mapa.`);
            break;
          }
        }
      }
    }
    const key = `${bx},${by}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(point);
  }
  return [...geometry.errors, ...geometry.warnings, ...nearby];
}

function normalizeOperation(scene, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Jarvis Cena: operação inválida.");
  const type = String(input.type ?? "");
  const mode = String(input.mode ?? "");
  if (!Object.hasOwn(COLLECTIONS, type) || !["create", "update", "delete"].includes(mode)
    || (type === "SceneEnvironment" && mode !== "update")) {
    throw new Error("Jarvis Cena: escolha parede, luz ou som e uma operação válida.");
  }
  const documentId = type === "SceneEnvironment" ? scene.id : input.documentId ? String(input.documentId) : null;
  const document = type === "SceneEnvironment" ? scene
    : mode === "create" ? null : getDocument(scene, type, documentId);
  if (mode !== "create" && !document) throw new Error("Jarvis Cena: documento a editar não encontrado.");
  const before = type === "SceneEnvironment" ? environmentSnapshot(scene) : document?.toObject?.() ?? null;
  const changes = mode === "delete" ? null : clone(input.data ?? {});
  if (changes && (typeof changes !== "object" || Array.isArray(changes))) {
    throw new Error("Jarvis Cena: dados da operação inválidos.");
  }
  if (changes && Object.keys(changes).some(key => !EDITABLE[type].has(key))) {
    throw new Error("Jarvis Cena: campo não editável nesta ferramenta.");
  }
  if (mode === "update" && !Object.keys(changes).length) {
    throw new Error("Jarvis Cena: informe ao menos um campo para modificar.");
  }
  if (type === "SceneEnvironment" && changes.environment
    && Object.keys(changes.environment).some(key => key !== "darknessLevel")) {
    throw new Error("Jarvis Cena: somente o nível de escuridão pode ser alterado no ambiente.");
  }
  const after = mode === "delete" ? null : mode === "update" ? merge(before, changes) : changes;
  if (after) validateGeometry(scene, type, after);
  return { type, mode, documentId, before, after, changes };
}

function id() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

function privateHistoryJournal(scene) {
  const candidates = contents(game.journal).filter(journal =>
    journal.getFlag?.(MODULE_ID, HISTORY_FLAG)?.sceneId === scene.id);
  if (candidates.length > 1) throw new Error("Jarvis Cena: históricos privados duplicados para esta cena.");
  const journal = candidates[0] ?? null;
  if (journal && (Number(journal.ownership?.default) !== (CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0)
    || Object.entries(journal.ownership ?? {}).some(([userId, level]) =>
      userId !== "default" && Number(level) > (CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0)))) {
    throw new Error("Jarvis Cena: histórico não está privado; corrija a permissão do Journal.");
  }
  return journal;
}

async function ensureHistory(scene) {
  const existing = privateHistoryJournal(scene);
  if (existing) return existing;
  const Journal = globalThis.JournalEntry?.implementation;
  if (!Journal?.create) throw new Error("Jarvis Cena: Journal privado indisponível para desfazer.");
  const journal = await Journal.create({
    name: `Jarvis — histórico privado da cena ${scene.id}`,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0 },
    flags: { [MODULE_ID]: { [HISTORY_FLAG]: { sceneId: scene.id, entries: [] } } }
  }, { renderSheet: false });
  if (!journal?.getFlag?.(MODULE_ID, HISTORY_FLAG)) {
    throw new Error("Jarvis Cena: histórico privado não foi persistido.");
  }
  return journal;
}

async function writeHistory(journal, mutate) {
  const record = clone(journal.getFlag(MODULE_ID, HISTORY_FLAG));
  mutate(record.entries);
  record.entries = record.entries.slice(-30);
  await journal.setFlag(MODULE_ID, HISTORY_FLAG, record);
  if (!journal.getFlag(MODULE_ID, HISTORY_FLAG)) throw new Error("Jarvis Cena: histórico não foi confirmado.");
}

export function sceneEditPresets() {
  const sense = CONST.EDGE_SENSE_TYPES?.NORMAL ?? 20;
  const move = CONST.WALL_MOVEMENT_TYPES?.NORMAL ?? 20;
  return [
    { key: "wall", label: "Parede sólida", type: "Wall", data: { door: 0, move, sight: sense, light: sense, sound: sense } },
    { key: "door", label: "Porta comum", type: "Wall", data: { door: 1, ds: 0, move, sight: sense, light: sense, sound: sense } },
    { key: "torch", label: "Tocha", type: "AmbientLight", data: { config: { bright: 10, dim: 20, color: "#ffb866", alpha: 0.35 } } },
    { key: "day", label: "Dia claro", type: "SceneEnvironment", data: { environment: { darknessLevel: 0 }, backgroundColor: "#243041" } },
    { key: "underdark", label: "Subterrâneo escuro", type: "SceneEnvironment", data: { environment: { darknessLevel: 0.8 }, backgroundColor: "#101521" } }
  ];
}

export function previewSceneEdit(sceneRef, input) {
  activeGM();
  const scene = resolveScene(sceneRef);
  if (!scene) throw new Error("Jarvis Cena: cena não encontrada.");
  const operation = normalizeOperation(scene, input);
  return { sceneId: scene.id, sceneName: scene.name,
    type: operation.type, mode: operation.mode, documentId: operation.documentId,
    before: operation.before, after: operation.after,
    warnings: operation.type === "Wall" ? wallWarnings(scene, operation, operation.after) : [] };
}

export async function applySceneEdit(sceneRef, input, { confirmed = false, expectedBefore = undefined } = {}) {
  activeGM();
  if (!confirmed) throw new Error("Jarvis Cena: confirme a prévia antes de editar.");
  const scene = resolveScene(sceneRef);
  if (!scene) throw new Error("Jarvis Cena: cena não encontrada.");
  if (sceneLocks.has(scene)) throw new Error("Jarvis Cena: outra edição desta cena está em andamento.");
  sceneLocks.add(scene);
  try {
    const operation = normalizeOperation(scene, input);
    if (expectedBefore !== undefined && JSON.stringify(expectedBefore) !== JSON.stringify(operation.before)) {
      throw new Error("Jarvis Cena: o documento mudou após a prévia; revise novamente antes de salvar.");
    }
    const journal = await ensureHistory(scene);
    const entry = { id: id(), at: Date.now(), status: "pending", type: operation.type,
      mode: operation.mode, documentId: operation.documentId,
      before: operation.before, after: null };
    await writeHistory(journal, entries => entries.push(entry));
    let document;
    try {
      if (operation.type === "SceneEnvironment") {
        await scene.update({ ...(operation.changes.backgroundColor ? { backgroundColor: operation.changes.backgroundColor } : {}),
          ...(operation.changes.environment?.darknessLevel !== undefined
            ? { "environment.darknessLevel": operation.changes.environment.darknessLevel } : {}) });
        document = scene;
      } else if (operation.mode === "create") {
        [document] = await scene.createEmbeddedDocuments(operation.type, [operation.after]);
      } else if (operation.mode === "update") {
        [document] = await scene.updateEmbeddedDocuments(operation.type,
          [{ _id: operation.documentId, ...operation.changes }]);
      } else {
        await scene.deleteEmbeddedDocuments(operation.type, [operation.documentId]);
      }
      if (operation.mode !== "delete" && !document) throw new Error("Jarvis Cena: Foundry não retornou o documento alterado.");
      const after = operation.mode === "delete" ? null
        : operation.type === "SceneEnvironment" ? environmentSnapshot(scene) : document.toObject();
      await writeHistory(journal, entries => {
        const target = entries.find(row => row.id === entry.id);
        target.status = "committed";
        target.documentId = document?.id ?? operation.documentId;
        target.after = after;
      });
      return { transactionId: entry.id, type: entry.type, mode: entry.mode,
        documentId: document?.id ?? operation.documentId, before: entry.before, after };
    } catch (error) {
      await writeHistory(journal, entries => {
        const target = entries.find(row => row.id === entry.id);
        if (target) target.status = "needs-review";
      }).catch(historyError => console.error(`${MODULE_ID} | Falha no histórico de cena`, historyError));
      throw error;
    }
  } finally { sceneLocks.delete(scene); }
}

export function listSceneEditHistory(sceneRef) {
  activeGM();
  const scene = resolveScene(sceneRef);
  if (!scene) throw new Error("Jarvis Cena: cena não encontrada.");
  return clone(privateHistoryJournal(scene)?.getFlag(MODULE_ID, HISTORY_FLAG)?.entries ?? []);
}

export async function undoSceneEdit(sceneRef, transactionId, { confirmed = false } = {}) {
  activeGM();
  if (!confirmed) throw new Error("Jarvis Cena: confirme o desfazer depois de revisar o histórico.");
  const scene = resolveScene(sceneRef);
  if (!scene) throw new Error("Jarvis Cena: cena não encontrada.");
  if (sceneLocks.has(scene)) throw new Error("Jarvis Cena: outra edição desta cena está em andamento.");
  sceneLocks.add(scene);
  try {
    const journal = privateHistoryJournal(scene);
    const entry = journal?.getFlag(MODULE_ID, HISTORY_FLAG)?.entries?.find(row => row.id === transactionId);
    if (!entry || entry.status !== "committed") throw new Error("Jarvis Cena: alteração não disponível para desfazer.");
    const current = entry.type === "SceneEnvironment" ? scene : getDocument(scene, entry.type, entry.documentId);
    if (entry.mode === "delete") {
      if (current) throw new Error("Jarvis Cena: ID foi reutilizado; desfazer exige revisão manual.");
      const [restored] = await scene.createEmbeddedDocuments(entry.type, [entry.before], { keepId: true });
      if (!restored) throw new Error("Jarvis Cena: Foundry não restaurou o documento.");
    } else {
      const currentData = entry.type === "SceneEnvironment" ? environmentSnapshot(scene) : current?.toObject();
      if (!current || JSON.stringify(currentData) !== JSON.stringify(entry.after)) {
        throw new Error("Jarvis Cena: documento mudou depois da operação; desfazer bloqueado.");
      }
      if (entry.type === "SceneEnvironment") await scene.update({
        "environment.darknessLevel": entry.before.environment.darknessLevel,
        backgroundColor: entry.before.backgroundColor
      });
      else if (entry.mode === "create") await scene.deleteEmbeddedDocuments(entry.type, [entry.documentId]);
      else await scene.updateEmbeddedDocuments(entry.type, [entry.before], { diff: false });
    }
    await writeHistory(journal, entries => {
      const target = entries.find(row => row.id === transactionId);
      target.status = "undone";
      target.undoneAt = Date.now();
    });
    return { undone: transactionId, type: entry.type, mode: entry.mode };
  } finally { sceneLocks.delete(scene); }
}
