const MODULE_ID = "fora-do-abismo-foundry";
const VISAGE_ID = "visage";
const VISAGE_NAMESPACE = "visage";
const VISAGE_LOCAL_FLAG = "alternateVisages";
const PACK_FORMAT = "jarvis-appearance-pack";
const PACK_VERSION = 1;

function clone(value) {
  return foundry.utils.deepClone(value);
}

function randomId() {
  return foundry.utils.randomID(16);
}

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveActor(actorOrRef, pack = null) {
  if (actorOrRef?.documentName === "Actor") return actorOrRef;
  if (actorOrRef?.actor?.documentName === "Actor") return actorOrRef.actor;

  if (typeof actorOrRef === "string" && actorOrRef.trim()) {
    return game.actors.get(actorOrRef) ?? game.actors.getName(actorOrRef) ?? null;
  }

  const actorId = pack?.actorId ?? pack?.actor?.id ?? null;
  const actorName = pack?.actorName ?? pack?.actor?.name ?? null;
  if (actorId) {
    const actor = game.actors.get(actorId);
    if (actor) return actor;
  }
  if (actorName) {
    const actor = game.actors.getName(actorName);
    if (actor) return actor;
  }

  const controlled = canvas?.tokens?.controlled?.[0]?.actor ?? null;
  if (controlled) return controlled;

  return null;
}

function requireVisage() {
  const module = game.modules.get(VISAGE_ID);
  if (!module?.active) {
    throw new Error("Jarvis Appearance Pack: Visage não está ativo.");
  }
  return module;
}

function getLocalDictionary(actor) {
  const raw = clone(actor.getFlag(VISAGE_NAMESPACE, VISAGE_LOCAL_FLAG) ?? {});
  if (!Array.isArray(raw)) return raw && typeof raw === "object" ? raw : {};

  const dictionary = {};
  for (const item of raw) {
    if (!item) continue;
    const id = item.id || randomId();
    dictionary[id] = { ...item, id };
  }
  return dictionary;
}

function defaultAutomation() {
  return {
    enabled: false,
    logic: "AND",
    conditions: [],
    onEnter: { action: "apply", priority: 0 },
    onExit: { action: "remove", priority: 0 }
  };
}

export function createVisualEffect(path, {
  label = "Visual",
  scale = 1,
  opacity = 1,
  delay = 0,
  rotation = 0,
  rotationRandom = false,
  bindRotation = false,
  bindToSprite = true,
  offsetX = 0,
  offsetY = 0,
  zOrder = "above",
  loop = false,
  tint = null,
  fadeIn = 0,
  fadeOut = 0,
  maskToToken = false,
  constrainedByWalls = false,
  fadeEase = null,
  scaleEase = null,
  scaleIn = null,
  scaleInDuration = null,
  disabled = false
} = {}) {
  if (!path) throw new Error("Jarvis Appearance Pack: path do efeito visual ausente.");
  return {
    id: randomId(),
    type: "visual",
    label,
    path: String(path),
    scale,
    opacity,
    tint,
    rotation,
    rotationRandom,
    bindRotation,
    bindToSprite,
    offsetX,
    offsetY,
    zOrder,
    loop,
    disabled,
    delay,
    fadeIn,
    fadeOut,
    maskToToken,
    constrainedByWalls,
    fadeEase,
    scaleEase,
    scaleIn,
    scaleInDuration
  };
}

export function createAudioEffect(path, {
  label = "Áudio",
  opacity = 1,
  delay = 0,
  loop = false,
  fadeIn = 0,
  fadeOut = 0,
  disabled = false
} = {}) {
  if (!path) throw new Error("Jarvis Appearance Pack: path do áudio ausente.");
  return {
    id: randomId(),
    type: "audio",
    label,
    path: String(path),
    scale: 1,
    opacity,
    bindRotation: false,
    bindToSprite: false,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    rotationRandom: false,
    tint: null,
    zOrder: "above",
    loop,
    disabled,
    delay,
    fadeIn,
    fadeOut,
    maskToToken: false,
    constrainedByWalls: false,
    fadeEase: null,
    scaleEase: null,
    scaleIn: null,
    scaleInDuration: null
  };
}

function normalizeEffect(effect) {
  if (!effect || typeof effect !== "object") return null;
  const type = effect.type ?? "visual";

  if (type === "visual") {
    return {
      ...createVisualEffect(effect.path, effect),
      id: effect.id || randomId()
    };
  }

  if (type === "audio") {
    return {
      ...createAudioEffect(effect.path, effect),
      id: effect.id || randomId()
    };
  }

  if (type === "macro") {
    return {
      id: effect.id || randomId(),
      type: "macro",
      label: effect.label ?? "Macro",
      disabled: Boolean(effect.disabled),
      delay: Number(effect.delay ?? 0),
      uuid: effect.uuid ?? null,
      path: null,
      scale: 1,
      opacity: 1,
      bindRotation: false,
      bindToSprite: false,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      rotationRandom: false,
      tint: null,
      zOrder: "above",
      loop: false,
      fadeIn: 0,
      fadeOut: 0,
      maskToToken: false,
      constrainedByWalls: false,
      fadeEase: null,
      scaleEase: null,
      scaleIn: null,
      scaleInDuration: null
    };
  }

  if (type === "tmfx") {
    return {
      id: effect.id || randomId(),
      type: "tmfx",
      label: effect.label ?? "Token Magic FX",
      disabled: Boolean(effect.disabled),
      delay: Number(effect.delay ?? 0),
      tmfxPreset: effect.tmfxPreset ?? null,
      tmfxPayload: effect.tmfxPayload ?? null,
      path: null,
      scale: 1,
      opacity: 1,
      bindRotation: false,
      bindToSprite: false,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      rotationRandom: false,
      tint: null,
      zOrder: "above",
      loop: false,
      fadeIn: 0,
      fadeOut: 0,
      maskToToken: false,
      constrainedByWalls: false,
      fadeEase: null,
      scaleEase: null,
      scaleIn: null,
      scaleInDuration: null
    };
  }

  throw new Error(`Jarvis Appearance Pack: tipo de efeito desconhecido '${type}'.`);
}

function buildChanges(spec = {}) {
  if (spec.changes && typeof spec.changes === "object") {
    const changes = clone(spec.changes);
    changes.effects = Array.isArray(changes.effects)
      ? changes.effects.map(normalizeEffect).filter(Boolean)
      : [];
    return changes;
  }

  const textureSpec = spec.texture && typeof spec.texture === "object" ? spec.texture : {};
  const tokenPath = spec.tokenPath ?? spec.token ?? textureSpec.src ?? null;

  return {
    name: spec.name ?? null,
    width: spec.width ?? null,
    height: spec.height ?? null,
    depth: spec.depth ?? null,
    scale: spec.scale ?? null,
    alpha: spec.alpha ?? null,
    disposition: spec.disposition ?? null,
    lockRotation: spec.lockRotation ?? null,
    animateTransition: spec.animateTransition ?? true,
    portrait: spec.portraitPath ?? spec.portrait ?? null,
    texture: {
      src: tokenPath,
      anchorX: spec.anchorX ?? textureSpec.anchorX ?? null,
      anchorY: spec.anchorY ?? textureSpec.anchorY ?? null,
      fit: spec.fit ?? textureSpec.fit ?? null
    },
    mirrorX: spec.mirrorX ?? null,
    mirrorY: spec.mirrorY ?? null,
    light: spec.light ? clone(spec.light) : {},
    ring: spec.ring ? clone(spec.ring) : null,
    effects: Array.isArray(spec.effects)
      ? spec.effects.map(normalizeEffect).filter(Boolean)
      : []
  };
}

export function buildLocalAppearance(spec = {}, { id = null } = {}) {
  const label = String(spec.label ?? "").trim();
  if (!label) throw new Error("Jarvis Appearance Pack: label da aparência ausente.");

  return {
    id: id || spec.id || randomId(),
    label,
    category: spec.category ?? "",
    tags: Array.isArray(spec.tags) ? [...spec.tags] : [],
    mode: spec.mode === "overlay" ? "overlay" : "identity",
    public: Boolean(spec.public),
    playerVisibility: spec.playerVisibility ?? "visible",
    automation: spec.automation ? clone(spec.automation) : defaultAutomation(),
    changes: buildChanges(spec),
    deleted: false,
    updated: Date.now()
  };
}

function entriesFromPack(pack) {
  if (Array.isArray(pack)) return pack;
  if (!pack || typeof pack !== "object") {
    throw new Error("Jarvis Appearance Pack: pacote inválido.");
  }

  if (pack.label && pack.changes) return [pack];

  const entries = pack.profiles ?? pack.visages ?? pack.layers ?? pack.appearances;
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error("Jarvis Appearance Pack: nenhuma aparência encontrada no pacote.");
  }
  return entries;
}

function effectWarnings(entry) {
  const warnings = [];
  for (const effect of entry?.changes?.effects ?? []) {
    if (effect.type === "visual" && effect.path && !game.modules.get("sequencer")?.active) {
      warnings.push(`${entry.label}: efeito visual '${effect.path}' requer Sequencer ativo.`);
    }
    if (effect.type === "tmfx" && !game.modules.get("tokenmagic")?.active) {
      warnings.push(`${entry.label}: efeito Token Magic requer Token Magic FX ativo.`);
    }
  }
  return warnings;
}

async function registerJarvisProfile(actor, key, visageId, mode, label) {
  const jarvis = game.modules.get(MODULE_ID)?.api?.appearance;
  if (!jarvis?.setProfile) return false;
  await jarvis.setProfile(actor, key, visageId, { mode, label });
  return true;
}

export async function installLocalAppearance(actorOrRef, spec, {
  replaceByLabel = true,
  registerProfile = true,
  profileKey = null,
  requireVisageActive = true
} = {}) {
  if (requireVisageActive) requireVisage();

  const actor = resolveActor(actorOrRef);
  if (!actor) throw new Error("Jarvis Appearance Pack: Actor não encontrado.");
  if (!actor.isOwner && !game.user.isGM) {
    throw new Error(`Jarvis Appearance Pack: sem permissão para alterar ${actor.name}.`);
  }

  const dictionary = getLocalDictionary(actor);
  let id = spec?.id ?? null;

  if (replaceByLabel) {
    const sameLabel = Object.values(dictionary).find(item =>
      item && String(item.label ?? "").trim().toLowerCase() === String(spec?.label ?? "").trim().toLowerCase()
    );
    if (sameLabel?.id) id = sameLabel.id;
  }

  const entry = buildLocalAppearance(spec, { id });
  dictionary[entry.id] = entry;

  await actor.setFlag(VISAGE_NAMESPACE, VISAGE_LOCAL_FLAG, dictionary);
  Hooks.callAll("visageDataChanged");

  const key = profileKey ?? spec?.key ?? normalizeKey(entry.label);
  if (registerProfile && key) {
    await registerJarvisProfile(actor, key, entry.id, entry.mode, entry.label);
  }

  return {
    actorId: actor.id,
    actorName: actor.name,
    key,
    visageId: entry.id,
    label: entry.label,
    mode: entry.mode,
    warnings: effectWarnings(entry)
  };
}

export async function installAppearancePack(actorOrRef, pack, {
  replaceByLabel = true,
  registerProfiles = true,
  requireVisageActive = true
} = {}) {
  if (requireVisageActive) requireVisage();

  const actor = resolveActor(actorOrRef, pack);
  if (!actor) {
    throw new Error(
      "Jarvis Appearance Pack: Actor não encontrado. Passe o Actor, ID/nome, use actorName/actorId no pacote ou selecione um Token."
    );
  }

  const entries = entriesFromPack(pack);
  const installed = [];
  const warnings = [];

  for (const spec of entries) {
    const result = await installLocalAppearance(actor, spec, {
      replaceByLabel,
      registerProfile: registerProfiles,
      profileKey: spec?.key ?? null,
      requireVisageActive: false
    });
    installed.push(result);
    warnings.push(...result.warnings);
  }

  ui.notifications?.info(
    `Jarvis: ${installed.length} aparência(s) instalada(s) no armário de ${actor.name}.`
  );
  if (warnings.length) {
    console.warn("Jarvis Appearance Pack | Avisos", warnings);
    ui.notifications?.warn(
      `Jarvis: pacote instalado com ${warnings.length} aviso(s). Veja o console.`
    );
  }

  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    actorId: actor.id,
    actorName: actor.name,
    installed,
    warnings
  };
}

export async function importVisageExport(actorOrRef, exportedData, options = {}) {
  return installAppearancePack(actorOrRef, exportedData, options);
}

export function makeAppearancePack({
  actorId = null,
  actorName = null,
  profiles = [],
  metadata = {}
} = {}) {
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    actorId,
    actorName,
    profiles: clone(profiles),
    metadata: clone(metadata)
  };
}

export function getAppearancePackStatus() {
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    visageActive: Boolean(game.modules.get(VISAGE_ID)?.active),
    sequencerActive: Boolean(game.modules.get("sequencer")?.active),
    tokenMagicActive: Boolean(game.modules.get("tokenmagic")?.active)
  };
}
