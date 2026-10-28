const MODULE_ID = "fora-do-abismo-foundry";
const METAMORPH_ID = "metamorph";
const FORMS_FLAG = "transformationProfiles";

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getMetamorphModule() {
  return game.modules.get(METAMORPH_ID) ?? null;
}

function getMetamorphApi({ required = true } = {}) {
  const module = getMetamorphModule();
  const api = module?.active ? (module.api ?? globalThis.Metamorph ?? null) : null;
  if (api) return api;
  if (required) {
    throw new Error(
      "Jarvis Transformation: Metamorph não está ativo. Ative o módulo 'Metamorph' para usar formas completas."
    );
  }
  return null;
}

function resolveToken(tokenOrId) {
  if (!tokenOrId) return null;
  if (typeof tokenOrId === "string") return canvas?.tokens?.get(tokenOrId) ?? null;
  if (tokenOrId.document?.documentName === "Token") return tokenOrId;
  if (tokenOrId.documentName === "Token") return tokenOrId.object ?? canvas?.tokens?.get(tokenOrId.id) ?? tokenOrId;
  return null;
}

function hasPermission(document, level) {
  const user = globalThis.game?.user;
  return Boolean(user && (user.isGM || document?.testUserPermission?.(user, level)));
}

function assertActorPermission(actor, level) {
  if (hasPermission(actor, level)) return;
  throw new Error(`Jarvis Transformation: sem permissão ${level} para ${actor?.name ?? "este Actor"}.`);
}

async function assertTokenPermission(token, level) {
  const document = token.document?.documentName === "Token" ? token.document : token;
  const baseActor = globalThis.game?.actors?.get?.(document.actorId);
  if ([document, token.actor, document.actor, baseActor].some(candidate => hasPermission(candidate, level))) return;

  // Metamorph can replace token.actor and actorId with an unowned form Actor.
  // The original Actor remains the authority for the player's own Token.
  const api = getMetamorphApi({ required: false });
  if (typeof api?.getMainActor === "function") {
    try {
      const mainRef = await api.getMainActor(token);
      const mainActor = typeof mainRef === "string"
        ? globalThis.game?.actors?.get?.(mainRef)
          ?? (typeof globalThis.fromUuid === "function" ? await globalThis.fromUuid(mainRef) : null)
        : mainRef;
      if (hasPermission(mainActor, level)) return;
    } catch (_error) { /* An unavailable original Actor must not grant access. */ }
  }
  throw new Error(`Jarvis Transformation: sem permissão ${level} para ${token.name ?? "este Token"}.`);
}

function profilesFromActor(actor) {
  return foundry.utils.deepClone(actor.getFlag(MODULE_ID, FORMS_FLAG) ?? {});
}

export function getTransformationStatus() {
  const module = getMetamorphModule();
  return {
    installed: Boolean(module),
    active: Boolean(module?.active),
    version: module?.version ?? null,
    apiReady: Boolean(module?.active && (module.api ?? globalThis.Metamorph))
  };
}

export function getTransformationProfiles(actor) {
  if (!actor) return {};
  assertActorPermission(actor, "OBSERVER");
  return profilesFromActor(actor);
}

export async function setTransformationProfile(actor, key, target, {
  hpMode = "keep-original",
  label = null
} = {}) {
  if (!actor) throw new Error("Jarvis Transformation: Actor ausente.");
  assertActorPermission(actor, "OWNER");
  if (!key) throw new Error("Jarvis Transformation: chave da forma ausente.");
  if (!target) throw new Error("Jarvis Transformation: Actor/UUID alvo ausente.");

  const allowedHpModes = new Set(["independent", "keep-original", "absolute", "percent"]);
  if (!allowedHpModes.has(hpMode)) {
    throw new Error(
      "Jarvis Transformation: hpMode inválido. Use independent, keep-original, absolute ou percent."
    );
  }

  let targetRef = target;
  if (typeof target === "object") {
    if (target.uuid) targetRef = target.uuid;
    else if (target.actorId) targetRef = {
      actorId: String(target.actorId),
      packId: target.packId == null ? null : String(target.packId)
    };
    else if (target.id) targetRef = target.id;
    else throw new Error("Jarvis Transformation: não consegui obter id/uuid do Actor alvo.");
  }

  const profiles = profilesFromActor(actor);
  profiles[normalizeKey(key)] = {
    target: typeof targetRef === "string" ? targetRef : foundry.utils.deepClone(targetRef),
    hpMode,
    ...(label ? { label: String(label) } : {})
  };
  await actor.setFlag(MODULE_ID, FORMS_FLAG, profiles);
  return profiles[normalizeKey(key)];
}

export async function removeTransformationProfile(actor, key) {
  if (!actor) throw new Error("Jarvis Transformation: Actor ausente.");
  assertActorPermission(actor, "OWNER");
  const profiles = profilesFromActor(actor);
  const normalized = normalizeKey(key);
  if (!Object.prototype.hasOwnProperty.call(profiles, normalized)) return false;
  delete profiles[normalized];
  await actor.setFlag(MODULE_ID, FORMS_FLAG, profiles);
  return true;
}

async function getProfileOwner(token, api) {
  const currentActor = token?.actor ?? token?.document?.actor ?? null;
  try {
    const main = await Promise.resolve(api.getMainActor(token));
    return main ?? currentActor;
  } catch (_error) {
    return currentActor;
  }
}

async function resolveTransformation(token, keyOrTarget, options = {}) {
  const api = getMetamorphApi();
  const owner = await getProfileOwner(token, api);
  const profiles = owner ? profilesFromActor(owner) : {};
  const stored = profiles[normalizeKey(keyOrTarget)];
  if (stored) return { ...stored };

  return {
    target: keyOrTarget,
    hpMode: options.hpMode ?? "keep-original"
  };
}

export async function morphToken(tokenOrId, keyOrTarget, options = {}) {
  const token = resolveToken(tokenOrId);
  if (!token) throw new Error("Jarvis Transformation: Token não encontrado no canvas atual.");
  await assertTokenPermission(token, "OWNER");
  const api = getMetamorphApi();

  const profile = await resolveTransformation(token, keyOrTarget, options);
  if (!profile.target) throw new Error("Jarvis Transformation: forma alvo vazia.");

  const hpMode = options.hpMode ?? profile.hpMode ?? "keep-original";
  const result = await api.morph(token, profile.target, { hpMode });
  if (result === false || result?.ok === false) {
    throw new Error(`Jarvis Transformation: Metamorph recusou a transformação${result?.reason ? ` (${result.reason})` : ""}.`);
  }
  return result;
}

export async function revertToken(tokenOrId) {
  const token = resolveToken(tokenOrId);
  if (!token) throw new Error("Jarvis Transformation: Token não encontrado no canvas atual.");
  await assertTokenPermission(token, "OWNER");
  const api = getMetamorphApi();
  const result = await api.revert(token);
  if (result === false || result?.ok === false) {
    throw new Error(`Jarvis Transformation: Metamorph recusou a reversão${result?.reason ? ` (${result.reason})` : ""}.`);
  }
  return result;
}

export async function getCurrentForm(tokenOrId) {
  const token = resolveToken(tokenOrId);
  if (!token) return null;
  await assertTokenPermission(token, "OBSERVER");
  const api = getMetamorphApi();
  return api.getForm(token);
}

export async function getMainActor(tokenOrId) {
  const token = resolveToken(tokenOrId);
  if (!token) return null;
  await assertTokenPermission(token, "OBSERVER");
  const api = getMetamorphApi();
  return api.getMainActor(token);
}

export async function promptForm(tokenOrId, options = {}) {
  const token = resolveToken(tokenOrId);
  if (!token) throw new Error("Jarvis Transformation: Token não encontrado no canvas atual.");
  await assertTokenPermission(token, "OWNER");
  const api = getMetamorphApi();
  return api.promptForm(token, options);
}

export async function openTransformationPicker(tokenOrId, anchorEl = null) {
  const token = resolveToken(tokenOrId);
  if (!token) throw new Error("Jarvis Transformation: Token não encontrado no canvas atual.");
  await assertTokenPermission(token, "OWNER");
  const api = getMetamorphApi();
  if (typeof api.openPicker !== "function") {
    throw new Error("Jarvis Transformation: esta versão do Metamorph não expõe openPicker().");
  }
  return api.openPicker(token, anchorEl);
}
