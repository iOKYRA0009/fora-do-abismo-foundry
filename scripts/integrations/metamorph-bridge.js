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
  return foundry.utils.deepClone(actor.getFlag(MODULE_ID, FORMS_FLAG) ?? {});
}

export async function setTransformationProfile(actor, key, target, {
  hpMode = "keep-original",
  label = null
} = {}) {
  if (!actor) throw new Error("Jarvis Transformation: Actor ausente.");
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
    else if (target.id) targetRef = target.id;
    else throw new Error("Jarvis Transformation: não consegui obter id/uuid do Actor alvo.");
  }

  const profiles = getTransformationProfiles(actor);
  profiles[normalizeKey(key)] = {
    target: String(targetRef),
    hpMode,
    ...(label ? { label: String(label) } : {})
  };
  await actor.setFlag(MODULE_ID, FORMS_FLAG, profiles);
  return profiles[normalizeKey(key)];
}

export async function removeTransformationProfile(actor, key) {
  if (!actor) throw new Error("Jarvis Transformation: Actor ausente.");
  const profiles = getTransformationProfiles(actor);
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
  const profiles = getTransformationProfiles(owner);
  const stored = profiles[normalizeKey(keyOrTarget)];
  if (stored) return { ...stored };

  return {
    target: keyOrTarget,
    hpMode: options.hpMode ?? "keep-original"
  };
}

export async function morphToken(tokenOrId, keyOrTarget, options = {}) {
  const api = getMetamorphApi();
  const token = resolveToken(tokenOrId);
  if (!token) throw new Error("Jarvis Transformation: Token não encontrado no canvas atual.");

  const profile = await resolveTransformation(token, keyOrTarget, options);
  if (!profile.target) throw new Error("Jarvis Transformation: forma alvo vazia.");

  const hpMode = options.hpMode ?? profile.hpMode ?? "keep-original";
  return api.morph(token, profile.target, { hpMode });
}

export async function revertToken(tokenOrId) {
  const api = getMetamorphApi();
  const token = resolveToken(tokenOrId);
  if (!token) throw new Error("Jarvis Transformation: Token não encontrado no canvas atual.");
  return api.revert(token);
}

export async function getCurrentForm(tokenOrId) {
  const api = getMetamorphApi();
  const token = resolveToken(tokenOrId);
  if (!token) return null;
  return api.getForm(token);
}

export async function getMainActor(tokenOrId) {
  const api = getMetamorphApi();
  const token = resolveToken(tokenOrId);
  if (!token) return null;
  return api.getMainActor(token);
}

export async function promptForm(tokenOrId, options = {}) {
  const api = getMetamorphApi();
  const token = resolveToken(tokenOrId);
  if (!token) throw new Error("Jarvis Transformation: Token não encontrado no canvas atual.");
  return api.promptForm(token, options);
}

export async function openTransformationPicker(tokenOrId, anchorEl = null) {
  const api = getMetamorphApi();
  const token = resolveToken(tokenOrId);
  if (!token) throw new Error("Jarvis Transformation: Token não encontrado no canvas atual.");
  if (typeof api.openPicker !== "function") {
    throw new Error("Jarvis Transformation: esta versão do Metamorph não expõe openPicker().");
  }
  return api.openPicker(token, anchorEl);
}
