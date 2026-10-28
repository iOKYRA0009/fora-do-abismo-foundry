/**
 * Jarvis Production Snapshot: a read-only, portable record of one Scene's
 * visual and environmental documents. No Tokens, actors or player secrets.
 * Inspired by the review/backup workflow of visual editors, not copied code.
 */
export const SNAPSHOT_SCHEMA = "jarvis-scene-snapshot-1";
const MODULE = "Jarvis Registro";
const collections = ["tiles","walls","lights","sounds"];
const arr = x => Array.isArray(x) ? x : Array.isArray(x?.contents) ? x.contents : x?.values ? Array.from(x.values()) : [];
const copy = x => x === undefined ? null : structuredClone(x);
const pick = (obj, names) => Object.fromEntries(names.map(name => [name,copy(obj?.[name])]));
const select = {
  tiles: ["x","y","width","height","rotation","elevation","overhead","occlusion","alpha","hidden","texture","sort"],
  walls: ["c","door","ds","move","sight","light","sound","dir","threshold"],
  lights: ["x","y","hidden","config","elevation"],
  sounds: ["x","y","radius","path","volume","hidden","elevation"]
};
function authorize() {
  if (!globalThis.game?.user?.isGM) throw new Error(`${MODULE}: somente o Mestre pode acessar snapshots.`);
}
function assertScene(scene) {
  if (!scene || scene.documentName !== "Scene" || !String(scene.id ?? "").trim()) {
    throw new Error(`${MODULE}: abra uma Scene válida.`);
  }
}
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
}
function signature(value) { return JSON.stringify(sorted(value)); }
function extract(scene, kind) {
  const docs = arr(scene[kind]);
  if (docs.length > 5000) throw new Error(`${MODULE}: quantidade excessiva de ${kind}.`);
  return docs.map((doc, i) => ({
    id: String(doc.id ?? doc._id ?? `ordinal-${i}`),
    ...pick(doc, select[kind])
  })).sort((a,b) => a.id.localeCompare(b.id));
}

export function captureSceneSnapshot(scene) {
  authorize(); assertScene(scene);
  const result = {
    schemaVersion: SNAPSHOT_SCHEMA,
    sceneId: String(scene.id), name: String(scene.name ?? ""),
    scene: {
      width: Number(scene.width), height: Number(scene.height),
      grid: copy({size:scene.grid?.size, type:scene.grid?.type, distance:scene.grid?.distance, units:scene.grid?.units}),
      environment: copy(scene.environment),
      backgroundColor: copy(scene.backgroundColor),
      background: copy(scene.background?.src ?? null)
    }
  };
  if (!Number.isFinite(result.scene.width) || !Number.isFinite(result.scene.height)) {
    throw new Error(`${MODULE}: Scene sem dimensões válidas.`);
  }
  for (const kind of collections) result[kind] = extract(scene, kind);
  return result;
}

export function compareSceneSnapshot(snapshot, scene) {
  authorize(); assertScene(scene);
  if (!snapshot || snapshot.schemaVersion !== SNAPSHOT_SCHEMA || snapshot.sceneId !== String(scene.id)) {
    throw new Error(`${MODULE}: snapshot incompatível com a Scene aberta. Nenhuma alteração foi feita.`);
  }
  const current = captureSceneSnapshot(scene);
  const summary = {};
  for (const kind of collections) {
    if (!Array.isArray(snapshot[kind]) || !Array.isArray(current[kind])) {
      throw new Error(`${MODULE}: coleção ${kind} inválida no snapshot.`);
    }
    const prior = new Map(snapshot[kind].map(doc => [doc.id,signature(doc)]));
    const after = new Map(current[kind].map(doc => [doc.id,signature(doc)]));
    const added = [...after.keys()].filter(id=>!prior.has(id));
    const removed = [...prior.keys()].filter(id=>!after.has(id));
    const changed = [...after.keys()].filter(id=>prior.has(id) && after.get(id)!==prior.get(id));
    summary[kind] = { before:prior.size, after:after.size, added, removed, changed };
  }
  const environmentalChanges = Object.keys(current.scene).filter(key =>
    signature(current.scene[key]) !== signature(snapshot.scene?.[key]));
  return {
    sceneId:current.sceneId, name:current.name,
    changed:environmentalChanges.length>0 || Object.values(summary).some(row=>row.added.length||row.removed.length||row.changed.length),
    environmentChanges:environmentalChanges, collections:summary, mode:"read-only"
  };
}
