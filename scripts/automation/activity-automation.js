const MODULE_ID = "fora-do-abismo-foundry";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function getAutomation(activity) {
  return activity?.flags?.[MODULE_ID]?.automation ?? null;
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
