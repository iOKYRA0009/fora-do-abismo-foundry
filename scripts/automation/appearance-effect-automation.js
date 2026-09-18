import {
  applyAppearanceToActor,
  removeAppearanceFromActor
} from "../integrations/visage-bridge.js";

const MODULE_ID = "fora-do-abismo-foundry";

function getAppearanceConfig(effect) {
  const flags = effect?.getFlag?.(MODULE_ID, "appearance") ?? effect?.flags?.[MODULE_ID]?.appearance ?? null;
  if (!flags || typeof flags !== "object") return null;

  const key = String(flags.key ?? "").trim();
  if (!key) return null;

  return {
    key,
    clearStack: Boolean(flags.clearStack),
    switchIdentity: flags.switchIdentity,
    removeOnDelete: flags.removeOnDelete !== false
  };
}

function getActor(effect) {
  const parent = effect?.parent ?? null;
  return parent?.documentName === "Actor" ? parent : null;
}

function shouldHandleForThisClient(userId) {
  if (!userId) return game.user?.isGM ?? false;
  return userId === game.user?.id;
}

function isEffectActive(effect) {
  return !effect?.disabled && effect?.duration?.expired !== true;
}

async function handleApply(effect, userId) {
  if (!shouldHandleForThisClient(userId)) return;

  const actor = getActor(effect);
  const config = getAppearanceConfig(effect);
  if (!actor || !config || !isEffectActive(effect)) return;

  try {
    await applyAppearanceToActor(actor, config.key, {
      clearStack: config.clearStack,
      ...(config.switchIdentity === undefined ? {} : { switchIdentity: Boolean(config.switchIdentity) })
    });

    console.log(
      `${MODULE_ID} | Appearance Effect: '${config.key}' aplicado por ActiveEffect '${effect.name}' em ${actor.name}.`
    );
  } catch (error) {
    console.error(
      `${MODULE_ID} | Falha ao aplicar aparência '${config.key}' via ActiveEffect '${effect.name}'.`,
      error
    );
    ui.notifications?.error(
      `Jarvis Appearance: falha ao aplicar '${config.key}' em ${actor.name}. Veja o console.`
    );
  }
}

async function handleRemove(effect, userId) {
  if (!shouldHandleForThisClient(userId)) return;

  const actor = getActor(effect);
  const config = getAppearanceConfig(effect);
  if (!actor || !config || !config.removeOnDelete) return;

  try {
    await removeAppearanceFromActor(actor, config.key);

    console.log(
      `${MODULE_ID} | Appearance Effect: '${config.key}' removido com ActiveEffect '${effect.name}' em ${actor.name}.`
    );
  } catch (error) {
    console.error(
      `${MODULE_ID} | Falha ao remover aparência '${config.key}' via ActiveEffect '${effect.name}'.`,
      error
    );
    ui.notifications?.error(
      `Jarvis Appearance: falha ao remover '${config.key}' de ${actor.name}. Veja o console.`
    );
  }
}

async function handleUpdate(effect, changes, userId) {
  if (!shouldHandleForThisClient(userId)) return;
  if (!getActor(effect) || !getAppearanceConfig(effect)) return;

  const touchedState =
    Object.prototype.hasOwnProperty.call(changes ?? {}, "disabled") ||
    Object.prototype.hasOwnProperty.call(changes ?? {}, "duration") ||
    Object.keys(changes ?? {}).some(key => key.startsWith("duration."));

  if (!touchedState) return;

  if (isEffectActive(effect)) {
    await handleApply(effect, userId);
  } else {
    await handleRemove(effect, userId);
  }
}

export function registerAppearanceEffectAutomation() {
  Hooks.on("createActiveEffect", (effect, options, userId) => {
    void handleApply(effect, userId);
  });

  Hooks.on("updateActiveEffect", (effect, changes, options, userId) => {
    void handleUpdate(effect, changes, userId);
  });

  Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    void handleRemove(effect, userId);
  });
}
