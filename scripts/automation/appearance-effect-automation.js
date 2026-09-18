import {
  applyAppearanceToActor,
  removeAppearanceFromActor
} from "../integrations/visage-bridge.js";

const MODULE_ID = "fora-do-abismo-foundry";
const choreographyState = new Map();

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

function getChoreographyConfig(effect) {
  const flags =
    effect?.getFlag?.(MODULE_ID, "appearanceChoreography") ??
    effect?.flags?.[MODULE_ID]?.appearanceChoreography ??
    null;

  if (!flags || typeof flags !== "object") return null;

  const variants = Array.from(flags.variants ?? [])
    .map(value => String(value ?? "").trim())
    .filter(Boolean);

  const overlays = Array.from(flags.overlays ?? [])
    .map(value => String(value ?? "").trim())
    .filter(Boolean);

  if (!variants.length && !overlays.length) return null;

  return {
    variants,
    overlays,
    intervalMs: Math.max(700, Number(flags.intervalMs ?? 1800)),
    random: flags.random !== false,
    clearStackOnStart: Boolean(flags.clearStackOnStart),
    removeOnDelete: flags.removeOnDelete !== false,
    startIndex: Math.max(0, Number(flags.startIndex ?? 0)),
    notify: Boolean(flags.notify)
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

function stateKey(effect) {
  return effect?.uuid ?? effect?.id ?? null;
}

function getNextVariantIndex(config, currentIndex) {
  if (!config.variants.length) return -1;
  if (config.variants.length === 1) return 0;

  if (!config.random) {
    return (currentIndex + 1) % config.variants.length;
  }

  let next = currentIndex;
  let attempts = 0;
  while (next === currentIndex && attempts < 12) {
    next = Math.floor(Math.random() * config.variants.length);
    attempts += 1;
  }
  return next === currentIndex ? (currentIndex + 1) % config.variants.length : next;
}

async function handleSimpleApply(effect, actor, config) {
  await applyAppearanceToActor(actor, config.key, {
    clearStack: config.clearStack,
    ...(config.switchIdentity === undefined ? {} : { switchIdentity: Boolean(config.switchIdentity) })
  });

  console.log(
    `${MODULE_ID} | Appearance Effect: '${config.key}' aplicado por ActiveEffect '${effect.name}' em ${actor.name}.`
  );
}

async function handleSimpleRemove(effect, actor, config) {
  if (!config.removeOnDelete) return;
  await removeAppearanceFromActor(actor, config.key);

  console.log(
    `${MODULE_ID} | Appearance Effect: '${config.key}' removido com ActiveEffect '${effect.name}' em ${actor.name}.`
  );
}

async function stopChoreography(effect, actor, config) {
  const key = stateKey(effect);
  const state = key ? choreographyState.get(key) : null;

  if (state?.timer) clearTimeout(state.timer);
  if (key) choreographyState.delete(key);

  const overlays = state?.overlays ?? config?.overlays ?? [];
  for (const overlayKey of overlays) {
    try {
      await removeAppearanceFromActor(actor, overlayKey);
    } catch (error) {
      console.warn(`${MODULE_ID} | Não foi possível remover overlay '${overlayKey}' durante teardown.`, error);
    }
  }

  const currentVariant = state?.currentVariant ?? null;
  if (currentVariant) {
    try {
      await removeAppearanceFromActor(actor, currentVariant);
    } catch (error) {
      console.warn(`${MODULE_ID} | Não foi possível remover variante '${currentVariant}' durante teardown.`, error);
    }
  }
}

async function startChoreography(effect, actor, config) {
  const key = stateKey(effect);
  if (!key) throw new Error("Jarvis Appearance Choreography: ActiveEffect sem UUID/ID.");

  await stopChoreography(effect, actor, config);

  for (const overlayKey of config.overlays) {
    await applyAppearanceToActor(actor, overlayKey, {
      switchIdentity: false,
      clearStack: false
    });
  }

  let currentIndex = -1;
  let currentVariant = null;

  if (config.variants.length) {
    currentIndex = Math.min(config.startIndex, config.variants.length - 1);
    currentVariant = config.variants[currentIndex];

    await applyAppearanceToActor(actor, currentVariant, {
      switchIdentity: true,
      clearStack: config.clearStackOnStart
    });
  }

  const state = {
    timer: null,
    busy: false,
    currentIndex,
    currentVariant,
    overlays: [...config.overlays],
    actorId: actor.id
  };
  choreographyState.set(key, state);

  const tick = async () => {
    const live = choreographyState.get(key);
    if (!live) return;

    const freshActor = game.actors?.get(live.actorId) ?? actor;
    const freshEffect = freshActor?.effects?.get(effect.id) ?? null;
    if (!freshEffect || !isEffectActive(freshEffect)) {
      await stopChoreography(effect, freshActor ?? actor, config);
      return;
    }

    if (!live.busy && config.variants.length > 1) {
      live.busy = true;
      try {
        const nextIndex = getNextVariantIndex(config, live.currentIndex);
        const nextVariant = config.variants[nextIndex];

        await applyAppearanceToActor(freshActor, nextVariant, {
          switchIdentity: true,
          clearStack: false
        });

        live.currentIndex = nextIndex;
        live.currentVariant = nextVariant;
      } catch (error) {
        console.error(`${MODULE_ID} | Appearance Choreography falhou em '${effect.name}'.`, error);
      } finally {
        live.busy = false;
      }
    }

    live.timer = setTimeout(tick, config.intervalMs);
  };

  if (config.variants.length > 1) {
    state.timer = setTimeout(tick, config.intervalMs);
  }

  if (config.notify) {
    ui.notifications?.info(`Jarvis: coreografia visual '${effect.name}' ativada em ${actor.name}.`);
  }

  console.log(
    `${MODULE_ID} | Appearance Choreography ativa em ${actor.name}: variants=${config.variants.join(", ")} overlays=${config.overlays.join(", ")}.`
  );
}

async function handleApply(effect, userId) {
  if (!shouldHandleForThisClient(userId)) return;

  const actor = getActor(effect);
  if (!actor || !isEffectActive(effect)) return;

  const choreography = getChoreographyConfig(effect);
  const appearance = getAppearanceConfig(effect);

  try {
    if (choreography) {
      await startChoreography(effect, actor, choreography);
      return;
    }

    if (appearance) {
      await handleSimpleApply(effect, actor, appearance);
    }
  } catch (error) {
    console.error(
      `${MODULE_ID} | Falha na automação visual do ActiveEffect '${effect.name}'.`,
      error
    );
    ui.notifications?.error(
      `Jarvis Appearance: falha ao aplicar efeitos visuais em ${actor.name}. Veja o console.`
    );
  }
}

async function handleRemove(effect, userId) {
  if (!shouldHandleForThisClient(userId)) return;

  const actor = getActor(effect);
  if (!actor) return;

  const choreography = getChoreographyConfig(effect);
  const appearance = getAppearanceConfig(effect);

  try {
    if (choreography) {
      if (choreography.removeOnDelete) {
        await stopChoreography(effect, actor, choreography);
      }
      return;
    }

    if (appearance) {
      await handleSimpleRemove(effect, actor, appearance);
    }
  } catch (error) {
    console.error(
      `${MODULE_ID} | Falha ao remover automação visual do ActiveEffect '${effect.name}'.`,
      error
    );
    ui.notifications?.error(
      `Jarvis Appearance: falha ao remover efeitos visuais de ${actor.name}. Veja o console.`
    );
  }
}

async function handleUpdate(effect, changes, userId) {
  if (!shouldHandleForThisClient(userId)) return;
  if (!getActor(effect)) return;

  const hasConfig = Boolean(getAppearanceConfig(effect) || getChoreographyConfig(effect));
  if (!hasConfig) return;

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

export function getAppearanceChoreographyStatus() {
  return {
    active: choreographyState.size,
    effects: Array.from(choreographyState.keys())
  };
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

  Hooks.on("canvasTearDown", () => {
    for (const state of choreographyState.values()) {
      if (state?.timer) clearTimeout(state.timer);
    }
    choreographyState.clear();
  });
}
