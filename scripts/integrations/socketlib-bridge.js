import { applyEmbeddedEffectToActor } from "../automation/embedded-effect-engine.js";

const MODULE_ID = "fora-do-abismo-foundry";
let socket = null;
let registered = false;

function configs(activity) {
  const automation = activity?.flags?.[MODULE_ID]?.automation;
  const input = automation?.effects ?? automation?.effect ?? [];
  return Array.isArray(input) ? input.filter(Boolean) : input ? [input] : [];
}

function effectOptions(config) {
  const options = typeof config === "string" ? { effectName: config } : { ...config };
  delete options.target;
  return options;
}

async function applyOnGm({ activityUuid, tokenUuid, effectIndex }) {
  // socketlib supplies the authenticated sender in `this.socketdata.userId`.
  const senderId = this?.socketdata?.userId;
  const sender = game.users?.get?.(senderId);
  if (!game.user?.isGM || !sender?.active) throw new Error("Jarvis: usuário ou Mestre indisponível.");
  const activity = await fromUuid(activityUuid, { strict: false });
  const source = activity?.item?.actor;
  if (!source?.testUserPermission?.(sender, "OWNER")) {
    throw new Error("Jarvis: usuário não controla a origem da habilidade.");
  }
  const config = configs(activity)[effectIndex];
  const targetMode = typeof config === "string" ? "self" : config?.target ?? "self";
  if (!Number.isSafeInteger(effectIndex) || effectIndex < 0
    || !["selected", "selected-all"].includes(targetMode)) {
    throw new Error("Jarvis: efeito de alvo não configurado na habilidade.");
  }
  const token = await fromUuid(tokenUuid, { strict: false });
  const scene = token?.parent;
  if (token?.documentName !== "Token" || scene?.documentName !== "Scene"
    || (!sender.isGM && (scene.id !== sender.viewedScene || token.hidden))) {
    throw new Error("Jarvis: alvo fora da cena visível ao jogador.");
  }
  if (!token.actor) throw new Error("Jarvis: token alvo sem Actor.");
  const result = await applyEmbeddedEffectToActor(activity, token.actor, effectOptions(config));
  return { actorUuid: token.actor.uuid, effectId: result?.id ?? null };
}

export function registerSocketBridge() {
  if (registered) return;
  registered = true;
  Hooks.once("socketlib.ready", () => {
    if (!game.modules?.get?.("socketlib")?.active || !globalThis.socketlib?.registerModule) return;
    socket = globalThis.socketlib.registerModule(MODULE_ID);
    socket.register("applyConfiguredEffect", applyOnGm);
  });
}

export function socketBridgeStatus() {
  return { active: Boolean(game.modules?.get?.("socketlib")?.active), ready: Boolean(socket),
    version: game.modules?.get?.("socketlib")?.version ?? null };
}

export async function applyConfiguredEffectViaGm(activity, token, effectIndex) {
  if (!socket) throw new Error("Jarvis: instale e ative socketlib para efeitos em alvos que o jogador não controla.");
  if (!activity?.uuid || !token?.document?.uuid) {
    throw new Error("Jarvis: Activity ou token alvo sem UUID.");
  }
  return socket.executeAsGM("applyConfiguredEffect", {
    activityUuid: activity.uuid,
    tokenUuid: token.document.uuid,
    effectIndex
  });
}
