const MODULE_ID = "fora-do-abismo-foundry";
const VISAGE_ID = "visage";
const PROFILE_FLAG = "appearanceProfiles";

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getVisageModule() {
  return game.modules.get(VISAGE_ID) ?? null;
}

function getVisageApi({ required = true } = {}) {
  const module = getVisageModule();
  if (module?.active && module.api) return module.api;
  if (required) {
    throw new Error(
      "Jarvis Appearance: Visage não está ativo. Ative o módulo 'Visage' para usar skins e aparências."
    );
  }
  return null;
}

function resolveToken(tokenOrId) {
  if (!tokenOrId) return null;
  if (typeof tokenOrId === "string") return canvas?.tokens?.get(tokenOrId) ?? null;
  if (tokenOrId.document?.documentName === "Token") return tokenOrId;
  if (tokenOrId.documentName === "Token") return tokenOrId.object ?? canvas?.tokens?.get(tokenOrId.id) ?? null;
  return null;
}

function hasPermission(document, level) {
  const user = globalThis.game?.user;
  return Boolean(user && (user.isGM || document?.testUserPermission?.(user, level)));
}

function assertActorPermission(actor, level) {
  if (hasPermission(actor, level)) return;
  throw new Error(`Jarvis Appearance: sem permissão ${level} para ${actor?.name ?? "este Actor"}.`);
}

function assertTokenPermission(token, level) {
  const document = token.document?.documentName === "Token" ? token.document : token;
  const baseActor = globalThis.game?.actors?.get?.(document.actorId);
  if ([document, token.actor, document.actor, baseActor].some(candidate => hasPermission(candidate, level))) return;
  throw new Error(`Jarvis Appearance: sem permissão ${level} para ${token.name ?? "este Token"}.`);
}

function profilesFromActor(actor) {
  return foundry.utils.deepClone(actor.getFlag(MODULE_ID, PROFILE_FLAG) ?? {});
}

export function getActorTokens(actor) {
  if (!actor || !canvas?.ready) return [];
  return canvas.tokens.placeables.filter(token => {
    if (token.actor?.id === actor.id) return true;
    if (token.document?.actorId === actor.id) return true;
    return false;
  });
}

export function getAppearanceStatus() {
  const module = getVisageModule();
  return {
    installed: Boolean(module),
    active: Boolean(module?.active),
    version: module?.version ?? null,
    apiReady: Boolean(module?.active && module.api)
  };
}

export function getAppearanceProfiles(actor) {
  if (!actor) return {};
  assertActorPermission(actor, "OBSERVER");
  return profilesFromActor(actor);
}

export async function setAppearanceProfile(actor, key, visageId, {
  mode = "identity",
  label = null
} = {}) {
  if (!actor) throw new Error("Jarvis Appearance: Actor ausente.");
  assertActorPermission(actor, "OWNER");
  if (!key) throw new Error("Jarvis Appearance: chave do perfil ausente.");
  if (!visageId) throw new Error("Jarvis Appearance: visageId ausente.");
  if (!["identity", "overlay"].includes(mode)) {
    throw new Error("Jarvis Appearance: mode deve ser 'identity' ou 'overlay'.");
  }

  const profiles = profilesFromActor(actor);
  profiles[normalizeKey(key)] = {
    visageId: String(visageId),
    mode,
    ...(label ? { label: String(label) } : {})
  };
  await actor.setFlag(MODULE_ID, PROFILE_FLAG, profiles);
  return profiles[normalizeKey(key)];
}

export async function removeAppearanceProfile(actor, key) {
  if (!actor) throw new Error("Jarvis Appearance: Actor ausente.");
  assertActorPermission(actor, "OWNER");
  const profiles = profilesFromActor(actor);
  const normalized = normalizeKey(key);
  if (!Object.prototype.hasOwnProperty.call(profiles, normalized)) return false;
  delete profiles[normalized];
  await actor.setFlag(MODULE_ID, PROFILE_FLAG, profiles);
  return true;
}

function resolveProfile(actor, keyOrId, options = {}) {
  const profiles = actor ? profilesFromActor(actor) : {};
  const stored = profiles[normalizeKey(keyOrId)];
  if (stored) return { ...stored };

  return {
    visageId: String(keyOrId ?? ""),
    mode: options.mode ?? "identity"
  };
}

export async function applyAppearance(tokenOrId, keyOrId, options = {}) {
  const token = resolveToken(tokenOrId);
  if (!token) throw new Error("Jarvis Appearance: Token não encontrado no canvas atual.");
  assertTokenPermission(token, "OWNER");
  const api = getVisageApi();

  const profile = resolveProfile(token.actor, keyOrId, options);
  if (!profile.visageId) throw new Error("Jarvis Appearance: perfil/Visage vazio.");

  const switchIdentity = options.switchIdentity ?? profile.mode !== "overlay";
  const success = await api.apply(token, profile.visageId, {
    switchIdentity,
    clearStack: Boolean(options.clearStack)
  });

  if (!success) {
    throw new Error(
      `Jarvis Appearance: Visage '${profile.visageId}' não pôde ser aplicado a ${token.name}. ` +
      "Confirme se a skin existe na biblioteca Local/Global e se o jogador tem permissão."
    );
  }

  return success;
}

export async function applyAppearanceToActor(actor, keyOrId, options = {}) {
  if (!actor) throw new Error("Jarvis Appearance: Actor ausente.");
  assertActorPermission(actor, "OWNER");
  const tokens = getActorTokens(actor);
  if (!tokens.length) {
    throw new Error(`Jarvis Appearance: ${actor.name} não possui Token ativo na cena atual.`);
  }

  for (const token of tokens) assertTokenPermission(token, "OWNER");

  const results = [];
  for (const token of tokens) results.push(await applyAppearance(token, keyOrId, options));
  return results;
}

export async function removeAppearance(tokenOrId, keyOrId) {
  const token = resolveToken(tokenOrId);
  if (!token) throw new Error("Jarvis Appearance: Token não encontrado no canvas atual.");
  assertTokenPermission(token, "OWNER");
  const api = getVisageApi();
  const profile = resolveProfile(token.actor, keyOrId);
  return api.remove(token, profile.visageId);
}

export async function removeAppearanceFromActor(actor, keyOrId) {
  if (!actor) throw new Error("Jarvis Appearance: Actor ausente.");
  assertActorPermission(actor, "OWNER");
  const tokens = getActorTokens(actor);
  for (const token of tokens) assertTokenPermission(token, "OWNER");
  const results = [];
  for (const token of tokens) results.push(await removeAppearance(token, keyOrId));
  return results;
}

export async function revertAppearance(tokenOrId) {
  const token = resolveToken(tokenOrId);
  if (!token) throw new Error("Jarvis Appearance: Token não encontrado no canvas atual.");
  assertTokenPermission(token, "OWNER");
  const api = getVisageApi();
  return api.revert(token);
}

export async function revertAppearanceForActor(actor) {
  if (!actor) throw new Error("Jarvis Appearance: Actor ausente.");
  assertActorPermission(actor, "OWNER");
  const tokens = getActorTokens(actor);
  for (const token of tokens) assertTokenPermission(token, "OWNER");
  const results = [];
  for (const token of tokens) results.push(await revertAppearance(token));
  return results;
}

export async function getAvailableAppearances(tokenOrId) {
  const token = resolveToken(tokenOrId);
  if (!token) throw new Error("Jarvis Appearance: Token não encontrado no canvas atual.");
  assertTokenPermission(token, "OBSERVER");
  const api = getVisageApi();
  return api.getAvailable(token);
}

export async function isAppearanceActive(tokenOrId, keyOrId) {
  const token = resolveToken(tokenOrId);
  if (!token) return false;
  assertTokenPermission(token, "OBSERVER");
  const api = getVisageApi();
  const profile = resolveProfile(token.actor, keyOrId);
  return api.isActive(token, profile.visageId);
}
