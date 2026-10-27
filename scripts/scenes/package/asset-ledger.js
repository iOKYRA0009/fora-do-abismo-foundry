const MODULE_ID = "fora-do-abismo-foundry";
const SETTING_KEY = "sceneAssetLedger";
const PRIVATE_FLAG = "sceneAssetLedgerPrivate";
const LEDGER_VERSION = 1;
let writeQueue = Promise.resolve();

function assertActiveGM() {
  if (!game.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) {
    throw new Error("Jarvis: somente o Mestre ativo pode gerenciar arquivos de mapas.");
  }
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function settingValue() {
  // A legacy Array must be read before String registration can coerce it.
  const world = game.settings?.storage?.get?.("world");
  const stored = world?.getSetting?.(`${MODULE_ID}.${SETTING_KEY}`)
    ?? world?.get?.(`${MODULE_ID}.${SETTING_KEY}`);
  return stored && stored.value !== undefined
    ? stored.value : game.settings?.get(MODULE_ID, SETTING_KEY);
}

function settingState() {
  const raw = settingValue();
  if (Array.isArray(raw)) return { legacy: copy(raw), id: null };
  if (raw === undefined || raw === null || raw === "") return { legacy: null, id: null };
  if (typeof raw !== "string") throw new Error("Jarvis: referência do registro de mapas inválida.");
  let decoded = raw;
  if (/^[\[{"]/.test(raw.trim())) {
    try { decoded = JSON.parse(raw); }
    catch { throw new Error("Jarvis: registro legado de mapas inválido; nenhuma gravação foi feita."); }
  }
  if (Array.isArray(decoded)) return { legacy: copy(decoded), id: null };
  if (typeof decoded !== "string" || !decoded.trim()) {
    throw new Error("Jarvis: referência do registro de mapas inválida.");
  }
  return { legacy: null, id: decoded };
}

function journals() {
  return Array.from(game.journal?.contents ?? game.journal ?? [], entry =>
    Array.isArray(entry) ? entry[1] : entry);
}

function isPrivate(journal) {
  const ownership = journal?.ownership;
  const none = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0;
  if (!ownership || Number(ownership.default) !== none) return false;
  return Object.entries(ownership).every(([userId, level]) =>
    userId === "default" || Number(level) <= none || Boolean(game.users?.get?.(userId)?.isGM));
}

function ledgerRecord(journal) {
  const data = journal?.getFlag?.(MODULE_ID, PRIVATE_FLAG);
  if (!data || data.version !== LEDGER_VERSION || !Array.isArray(data.records)) return null;
  if (!isPrivate(journal)) {
    throw new Error("Jarvis: o Journal do registro de mapas não é privado; revise as permissões antes de continuar.");
  }
  return data;
}

function candidateJournals() {
  return journals().filter(journal => ledgerRecord(journal));
}

function recoverableJournal(state) {
  const direct = state.id ? game.journal?.get?.(state.id) : null;
  if (direct && ledgerRecord(direct)) return direct;
  const candidates = candidateJournals();
  if (candidates.length > 1) {
    throw new Error("Jarvis: há mais de um Journal privado de mapas; escolha o correto antes de gravar.");
  }
  return candidates[0] ?? null;
}

function readRecords() {
  const state = settingState();
  if (state.legacy) return copy(state.legacy);
  const journal = recoverableJournal(state);
  if (journal) return copy(ledgerRecord(journal).records);
  if (state.id) {
    throw new Error("Jarvis: o Journal privado do registro de mapas não foi encontrado. Uma nova operação pode iniciar a recuperação.");
  }
  return [];
}

async function createPrivateLedger(records, { recoveredFrom = null } = {}) {
  const Journal = globalThis.JournalEntry?.implementation;
  if (!Journal?.create) throw new Error("Jarvis: JournalEntry indisponível para o registro privado de mapas.");
  const data = { version: LEDGER_VERSION, records: copy(records),
    ...(recoveredFrom ? { recoveredFrom, recoveredAt: Date.now() } : {}) };
  const journal = await Journal.create({
    name: "Jarvis — registro privado de arquivos de mapas",
    ownership: { default: globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0 },
    flags: { [MODULE_ID]: { [PRIVATE_FLAG]: data } }
  }, { renderSheet: false });
  if (!journal || !ledgerRecord(journal)
    || JSON.stringify(ledgerRecord(journal).records) !== JSON.stringify(records)) {
    if (journal?.delete) await journal.delete().catch(error =>
      console.error(`${MODULE_ID} | Não foi possível remover Journal de registro inválido`, error));
    throw new Error("Jarvis: registro privado de mapas não foi persistido no Journal.");
  }
  return journal;
}

async function ensureLedger() {
  assertActiveGM();
  const state = settingState();
  let journal;
  if (state.legacy) {
    const matches = candidateJournals().filter(candidate =>
      JSON.stringify(ledgerRecord(candidate).records) === JSON.stringify(state.legacy));
    if (matches.length > 1) throw new Error("Jarvis: Journals privados duplicados para o registro legado.");
    journal = matches[0] ?? await createPrivateLedger(state.legacy);
  } else {
    journal = recoverableJournal(state);
    if (!journal) {
      journal = await createPrivateLedger([], { recoveredFrom: state.id });
      if (state.id) {
        const message = "Jarvis: o Journal anterior do registro de mapas desapareceu. Foi criado um novo registro vazio; revise os arquivos de mapas antes de excluir qualquer um.";
        console.warn(`${MODULE_ID} | ${message}`, { missingJournalId: state.id });
        globalThis.ui?.notifications?.warn?.(message);
      }
    }
  }
  if (state.id !== journal.id || state.legacy) {
    await game.settings.set(MODULE_ID, SETTING_KEY, journal.id);
  }
  return journal;
}

function queueWrite(update) {
  assertActiveGM();
  const operation = writeQueue.catch(() => {}).then(async () => {
    assertActiveGM();
    const journal = await ensureLedger();
    const data = copy(ledgerRecord(journal));
    const result = update(data.records);
    await journal.setFlag(MODULE_ID, PRIVATE_FLAG, data);
    const persisted = ledgerRecord(journal);
    if (!persisted || JSON.stringify(persisted.records) !== JSON.stringify(data.records)) {
      throw new Error("Jarvis: atualização do registro privado de mapas não foi confirmada.");
    }
    return result;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function registerSceneAssetLedger() {
  game.settings.register(MODULE_ID, SETTING_KEY, {
    name: "Journal privado de arquivos de mapas Jarvis",
    hint: "Guarda somente a referência ao Journal privado usado na recuperação de uploads de mapas.",
    scope: "world",
    config: false,
    restricted: true,
    type: String,
    default: ""
  });
  globalThis.Hooks?.once?.("ready", () => {
    if (!game.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) return;
    void (writeQueue = writeQueue.catch(() => {}).then(() => ensureLedger())).catch(error =>
      console.error(`${MODULE_ID} | Não foi possível inicializar registro privado de mapas`, error));
  });
}

export function listSceneAssetLedger() {
  assertActiveGM();
  return readRecords();
}

export async function beginSceneAssetUpload({ source, target, fileName }) {
  const now = Date.now();
  const record = {
    id: makeId(), source: String(source), target: String(target), fileName: String(fileName),
    path: `${target}/${fileName}`, status: "pending", sceneId: null, reason: null,
    createdAt: now, updatedAt: now
  };
  await queueWrite(records => { records.push(record); });
  return copy(record);
}

export async function updateSceneAssetUpload(id, changes) {
  const allowed = ["uploaded", "linked", "review", "failed"];
  if (!allowed.includes(changes?.status)) throw new Error("Jarvis: estado de arquivo inválido.");
  return queueWrite(records => {
    const record = records.find(entry => entry.id === id);
    if (!record) throw new Error("Jarvis: arquivo de mapa não encontrado no registro.");
    record.status = changes.status;
    if (changes.path !== undefined) record.path = String(changes.path);
    if (changes.sceneId !== undefined) record.sceneId = changes.sceneId ? String(changes.sceneId) : null;
    if (changes.reason !== undefined) record.reason = changes.reason ? String(changes.reason) : null;
    record.updatedAt = Date.now();
    return copy(record);
  });
}

function sceneUsesPath(scene, path) {
  if (scene.background?.src === path || scene.img === path || scene.foreground === path) return true;
  return Array.from(scene.tiles?.contents ?? []).some(tile =>
    tile.texture?.src === path || tile.img === path
  );
}

export function inspectSceneAssetLedger({ staleAfterMs = 5 * 60 * 1000 } = {}) {
  assertActiveGM();
  const now = Date.now();
  return readRecords().map(record => {
    const scenes = Array.from(game.scenes ?? [])
      .filter(scene => sceneUsesPath(scene, record.path))
      .map(scene => ({ id: scene.id, name: scene.name }));
    const stale = record.status === "pending" && now - record.updatedAt >= staleAfterMs;
    return { ...record, scenes, needsReview: stale || record.status === "review"
      || record.status === "failed" || (record.status === "linked" && !scenes.length) };
  });
}
