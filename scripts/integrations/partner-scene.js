import { requireGm, requirePartner } from "./partner-status.js";

function tagValue(label) {
  const value = String(label ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  if (!value || value.length > 64) throw new Error("Jarvis: etiqueta precisa ter entre 1 e 64 caracteres.");
  return `jarvis:${value}`;
}

export async function tagSceneObject(object, label) {
  requireGm();
  requirePartner("tagger", () => typeof globalThis.Tagger?.addTags === "function");
  const document = object?.document ?? object;
  if (!document?.parent || document.parent.documentName !== "Scene") {
    throw new Error("Jarvis: selecione um objeto de uma cena para etiquetar.");
  }
  const tag = tagValue(label);
  await globalThis.Tagger.addTags(document, tag);
  return { uuid: document.uuid, tag };
}

export function findSceneObjects(label, scene = globalThis.canvas?.scene) {
  requirePartner("tagger", () => typeof globalThis.Tagger?.getByTag === "function");
  if (!scene?.id) throw new Error("Jarvis: abra uma cena válida.");
  return globalThis.Tagger.getByTag(tagValue(label), { sceneId: scene.id }) ?? [];
}

export async function playSceneCue({ file, sound = null, at = null, tag = null,
  scene = globalThis.canvas?.scene, duration = 2500, name = "jarvis-cue" } = {}) {
  requirePartner("sequencer", () => typeof globalThis.Sequence === "function");
  if (typeof file !== "string" || !file.trim()) throw new Error("Jarvis: informe o arquivo visual do efeito.");
  if (!Number.isFinite(duration) || duration < 100 || duration > 120000) {
    throw new Error("Jarvis: duração do efeito deve ficar entre 100 ms e 2 minutos.");
  }
  const location = tag ? findSceneObjects(tag, scene)[0] : at;
  if (!location) throw new Error("Jarvis: informe um token/local ou uma etiqueta existente na cena.");
  const cueName = `jarvis:${String(name).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64)}`;
  const sequence = new globalThis.Sequence();
  sequence.effect().file(file).atLocation(location).duration(duration).name(cueName);
  if (sound) sequence.sound().file(sound);
  await sequence.play();
  return { name: cueName, location: location.uuid ?? location.document?.uuid ?? null };
}

export async function stopSceneCue(name = "jarvis-cue") {
  requirePartner("sequencer", () => typeof globalThis.Sequencer?.EffectManager?.endEffects === "function");
  const cueName = `jarvis:${String(name).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64)}`;
  return globalThis.Sequencer.EffectManager.endEffects({ name: cueName });
}

export async function applyTokenFx(token, preset) {
  requirePartner("tokenmagic", () => typeof globalThis.TokenMagic?.addFilters === "function");
  if (!token?.document || token.document.documentName !== "Token") {
    throw new Error("Jarvis: selecione um token no mapa.");
  }
  if (!game.user?.isGM && !token.actor?.testUserPermission?.(game.user, "OWNER")) {
    throw new Error("Jarvis: você precisa controlar o token para aplicar este efeito.");
  }
  if (!globalThis.TokenMagic.getPreset?.(preset)) throw new Error(`Jarvis: preset Token Magic '${preset}' não encontrado.`);
  return globalThis.TokenMagic.addFilters(token, preset);
}

export async function removeTokenFx(token, filterId) {
  requirePartner("tokenmagic", () => typeof globalThis.TokenMagic?.deleteFilters === "function");
  if (!token?.document || token.document.documentName !== "Token") throw new Error("Jarvis: selecione um token no mapa.");
  if (!game.user?.isGM && !token.actor?.testUserPermission?.(game.user, "OWNER")) {
    throw new Error("Jarvis: você precisa controlar o token para remover este efeito.");
  }
  if (!filterId || typeof filterId !== "string") throw new Error("Jarvis: informe o ID do filtro; outros filtros serão preservados.");
  return globalThis.TokenMagic.deleteFilters(token, filterId);
}

export async function playWeather(preset, scene = globalThis.canvas?.scene, options = {}) {
  requireGm();
  requirePartner("fxmaster", () => typeof globalThis.FXMASTER?.api?.presets?.play === "function");
  if (!scene?.id || !preset || typeof preset !== "string") throw new Error("Jarvis: informe uma cena e um preset FXMaster.");
  return globalThis.FXMASTER.api.presets.play(preset, { ...options, scene });
}

export async function stopWeather(preset, scene = globalThis.canvas?.scene) {
  requireGm();
  requirePartner("fxmaster", () => typeof globalThis.FXMASTER?.api?.presets?.stop === "function");
  if (!scene?.id || !preset || typeof preset !== "string") throw new Error("Jarvis: informe uma cena e um preset FXMaster.");
  return globalThis.FXMASTER.api.presets.stop(preset, { scene });
}

export function listWeatherPresets() {
  requirePartner("fxmaster", () => typeof globalThis.FXMASTER?.api?.presets?.listValid === "function");
  return globalThis.FXMASTER.api.presets.listValid();
}
