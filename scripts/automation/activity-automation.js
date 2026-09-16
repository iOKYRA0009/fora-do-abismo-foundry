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

async function executeScript(script, scope, label) {
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

async function runPhase(phase, activity, usageConfig, results = null) {
  const automation = getAutomation(activity);
  const script = automation?.[phase];
  if (!script) return undefined;

  const label = `${activity?.item?.name ?? "Item"} / ${activity?.name ?? "Activity"} / ${phase}`;
  try {
    return await executeScript(script, buildScope(activity, usageConfig, results), label);
  } catch (error) {
    console.error(`${MODULE_ID} | Falha na automação ${label}`, error);
    ui.notifications?.error(`Jarvis Automation: ${label} falhou. Veja o console.`);
    if (phase === "pre") return false;
    return undefined;
  }
}

export function registerActivityAutomation() {
  Hooks.on("dnd5e.preUseActivity", async (activity, usageConfig) => {
    const result = await runPhase("pre", activity, usageConfig, null);
    if (result === false) return false;
    return undefined;
  });

  Hooks.on("dnd5e.postUseActivity", async (activity, usageConfig, results) => {
    const result = await runPhase("post", activity, usageConfig, results);
    if (result === false) return false;
    return undefined;
  });
}
