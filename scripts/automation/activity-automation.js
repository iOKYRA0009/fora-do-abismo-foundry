const MODULE_ID = "fora-do-abismo-foundry";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function getAutomation(activity) {
  return activity?.flags?.[MODULE_ID]?.automation ?? null;
}

function clone(value) {
  return foundry.utils.deepClone(value);
}

function normalizeEffectChange(change = {}) {
  return {
    _id: change._id ?? foundry.utils.randomID(),
    key: String(change.key ?? ""),
    value: change.value ?? "",
    type: change.type ?? "add",
    phase: change.phase ?? "initial",
    priority: change.priority ?? null,
    conditions: change.conditions ?? "{}",
    replacement: change.replacement ?? ""
  };
}

function normalizeActorEffectData(effectData = {}, { key = null } = {}) {
  const data = clone(effectData ?? {});

  // Active Effects applied by Jarvis are actor-side buffs/debuffs, not item
  // transfer effects. Foundry V14 uses typed ActiveEffect system data. When
  // creating effects programmatically with an explicit `system` object, the
  // discriminator must be present in the payload on our D&D5e 6.x runtime.
  delete data._id;
  data.type ??= "base";
  data.disabled = false;
  data.transfer = false;
  data.statuses = Array.from(data.statuses ?? []);

  data.system ??= {};
  data.system.type ??= data.type ?? "base";
  data.system.changes = Array.from(data.system.changes ?? []).map(normalizeEffectChange);
  data.system.magical ??= true;

  data.duration ??= {
    value: null,
    units: "seconds",
    expiry: null,
    expired: false
  };

  data.flags ??= {};
  data.flags[MODULE_ID] ??= {};
  if (key) data.flags[MODULE_ID].automationKey = String(key);

  return data;
}

function buildScope(activity, usageConfig, results = null) {
  const item = activity?.item ?? null;
  const actor = item?.actor ?? activity?.actor ?? null;

  return {
    actor,
    item,
    activity,
    usageConfig,
    results,
    game,
    ui,
    canvas,
    foundry,
    Roll,
    ChatMessage,
    fromUuid,
    jarvis: {
      moduleId: MODULE_ID,
      notify(message, type = "info") {
        const method = ui.notifications?.[type] ?? ui.notifications?.info;
        method?.call(ui.notifications, message);
      },
      async updateActor(changes = {}) {
        if (!actor) throw new Error("Automação Jarvis sem Actor associado.");
        return actor.update(changes);
      },
      async updateItem(changes = {}) {
        if (!item) throw new Error("Automação Jarvis sem Item associado.");
        return item.update(changes);
      },
      getItem(identifierOrName) {
        if (!actor) return null;
        const key = String(identifierOrName ?? "").trim().toLowerCase();
        return actor.items.find(candidate => {
          const identifier = String(candidate.system?.identifier ?? "").toLowerCase();
          const name = String(candidate.name ?? "").toLowerCase();
          return identifier === key || name === key;
        }) ?? null;
      },
      getActorEffect(keyOrName) {
        if (!actor) return null;
        const key = String(keyOrName ?? "").trim().toLowerCase();
        return actor.effects.find(effect => {
          const automationKey = String(effect.getFlag?.(MODULE_ID, "automationKey") ?? "").toLowerCase();
          const name = String(effect.name ?? "").toLowerCase();
          return automationKey === key || name === key;
        }) ?? null;
      },
      hasActorEffect(keyOrName) {
        if (!actor) return false;
        const key = String(keyOrName ?? "").trim().toLowerCase();
        return actor.effects.some(effect => {
          const automationKey = String(effect.getFlag?.(MODULE_ID, "automationKey") ?? "").toLowerCase();
          const name = String(effect.name ?? "").toLowerCase();
          return automationKey === key || name === key;
        });
      },
      async removeActorEffect(keyOrName) {
        if (!actor) throw new Error("Automação Jarvis sem Actor associado.");
        const key = String(keyOrName ?? "").trim().toLowerCase();
        const ids = actor.effects.filter(effect => {
          const automationKey = String(effect.getFlag?.(MODULE_ID, "automationKey") ?? "").toLowerCase();
          const name = String(effect.name ?? "").toLowerCase();
          return automationKey === key || name === key;
        }).map(effect => effect.id);
        if (!ids.length) return [];
        return actor.deleteEmbeddedDocuments("ActiveEffect", ids);
      },
      async applyActorEffect(effectData = {}, { key = null, replace = true } = {}) {
        if (!actor) throw new Error("Automação Jarvis sem Actor associado.");

        const normalizedKey = key ? String(key) : null;
        if (replace && normalizedKey) {
          const oldIds = actor.effects.filter(effect =>
            String(effect.getFlag?.(MODULE_ID, "automationKey") ?? "") === normalizedKey
          ).map(effect => effect.id);
          if (oldIds.length) await actor.deleteEmbeddedDocuments("ActiveEffect", oldIds);
        }

        const source = normalizeActorEffectData(effectData, { key: normalizedKey });
        const [created] = await actor.createEmbeddedDocuments("ActiveEffect", [source]);
        return created ?? null;
      }
    }
  };
}

function executePreScript(script, scope, label) {
  if (!script || typeof script !== "string") return undefined;

  let fn;
  try {
    fn = new Function(
      "scope",
      `"use strict";\nconst { actor, item, activity, usageConfig, results, game, ui, canvas, foundry, Roll, ChatMessage, fromUuid, jarvis } = scope;\n${script}`
    );
  } catch (error) {
    throw new Error(`${label}: código inválido — ${error.message}`);
  }

  return fn(scope);
}

async function executePostScript(script, scope, label) {
  if (!script || typeof script !== "string") return undefined;

  let fn;
  try {
    fn = new AsyncFunction(
      "scope",
      `"use strict";\nconst { actor, item, activity, usageConfig, results, game, ui, canvas, foundry, Roll, ChatMessage, fromUuid, jarvis } = scope;\n${script}`
    );
  } catch (error) {
    throw new Error(`${label}: código inválido — ${error.message}`);
  }

  return fn(scope);
}

function runPre(activity, usageConfig) {
  const automation = getAutomation(activity);
  const script = automation?.pre;
  if (!script) return undefined;

  const label = `${activity?.item?.name ?? "Item"} / ${activity?.name ?? "Activity"} / pre`;
  try {
    return executePreScript(script, buildScope(activity, usageConfig, null), label);
  } catch (error) {
    console.error(`${MODULE_ID} | Falha na automação ${label}`, error);
    ui.notifications?.error(`Jarvis Automation: ${label} falhou. Veja o console.`);
    return false;
  }
}

async function runPost(activity, usageConfig, results) {
  const automation = getAutomation(activity);
  const script = automation?.post;
  if (!script) return undefined;

  const label = `${activity?.item?.name ?? "Item"} / ${activity?.name ?? "Activity"} / post`;
  try {
    return await executePostScript(script, buildScope(activity, usageConfig, results), label);
  } catch (error) {
    console.error(`${MODULE_ID} | Falha na automação ${label}`, error);
    ui.notifications?.error(`Jarvis Automation: ${label} falhou. Veja o console.`);
    return undefined;
  }
}

export function registerActivityAutomation() {
  Hooks.on("dnd5e.preUseActivity", (activity, usageConfig) => {
    const result = runPre(activity, usageConfig);
    if (result === false) return false;
    return undefined;
  });

  Hooks.on("dnd5e.postUseActivity", (activity, usageConfig, results) => {
    void runPost(activity, usageConfig, results);
    return undefined;
  });
}
