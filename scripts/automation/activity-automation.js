import {
  applyEmbeddedEffect,
  applyEmbeddedEffectToActor,
  removeAppliedEmbeddedEffect,
  removeAppliedEmbeddedEffectFromActor
} from "./embedded-effect-engine.js";
import { inspectActivityAutomation } from "./automation-approval.js";
import { playerAbilitiesEnabled } from "./player-ability-setting.js";

const MODULE_ID = "fora-do-abismo-foundry";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let hooksRegistered = false;
const warnedUnapproved = new Set();

function warnUnapproved(activity, reason, phase) {
  const key = `${activity?.uuid ?? activity?.name ?? "unknown"}|${reason}|${phase}`;
  if (warnedUnapproved.has(key)) return;
  warnedUnapproved.add(key);
  const cause = {
    "unstable-uuid": "Activity ou Item sem identificador estável",
    "too-large": "automação acima do limite de 128 KiB",
    "invalid-automation": "dados de automação inválidos",
    "settings-unavailable": "registro de aprovações indisponível",
    "approval-required": "esta Activity ainda precisa de aprovação"
  }[reason] ?? "aprovação ausente";
  ui.notifications?.warn?.(
    `Jarvis: automação de '${activity?.item?.name ?? "Item"} / ${activity?.name ?? "Activity"}' ` +
    (phase === "pre"
      ? `não aprovada (${cause}); uso cancelado até revisão pelo Mestre ativo.`
      : `não aprovada (${cause}); efeitos e script Jarvis não foram executados.`)
  );
}

function canExecute(activity) {
  const user = game.user;
  const activeGm = game.users?.activeGM;
  if (!user?.id) return false;
  if (user.isGM) return activeGm?.id === user.id;
  const actor = activity?.item?.actor ?? activity?.actor;
  return playerAbilitiesEnabled()
    && Boolean(actor?.testUserPermission?.(user, "OWNER"));
}

function getAutomation(activity) {
  return activity?.flags?.[MODULE_ID]?.automation ?? null;
}

function getEffectConfigs(automation) {
  if (!automation) return [];
  const input = automation.effects ?? automation.effect ?? [];
  if (Array.isArray(input)) return input.filter(Boolean);
  return input ? [input] : [];
}

function hasExecutableAutomation(automation) {
  return Boolean(
    String(automation?.pre ?? "").trim()
    || String(automation?.post ?? "").trim()
    || getEffectConfigs(automation).length
  );
}

function getSelectedTargetActors() {
  return Array.from(game.user?.targets ?? [])
    .map(token => token?.actor ?? token?.document?.actor ?? null)
    .filter(Boolean);
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
        return removeAppliedEmbeddedEffectFromActor(actor, keyOrName);
      },
      getTargetActors() {
        return getSelectedTargetActors();
      },
      getSingleTargetActor({ required = true } = {}) {
        const targets = getSelectedTargetActors();
        if (targets.length === 1) return targets[0];
        if (!required && !targets.length) return null;
        throw new Error(`Selecione exatamente 1 alvo no canvas. Alvos atuais: ${targets.length}.`);
      },
      async applyEmbeddedEffect(options = {}) {
        return applyEmbeddedEffect(activity, options);
      },
      async applyEmbeddedEffectToTarget(options = {}) {
        const targetActor = this.getSingleTargetActor();
        return applyEmbeddedEffectToActor(activity, targetActor, options);
      },
      async applyEmbeddedEffectToActor(targetActor, options = {}) {
        return applyEmbeddedEffectToActor(activity, targetActor, options);
      },
      async removeEmbeddedEffect(keyOrEffectName) {
        return removeAppliedEmbeddedEffect(activity, keyOrEffectName);
      },
      async removeEmbeddedEffectFromTarget(keyOrEffectName) {
        const targetActor = this.getSingleTargetActor();
        return removeAppliedEmbeddedEffectFromActor(targetActor, keyOrEffectName);
      },
      async removeEmbeddedEffectFromActor(targetActor, keyOrEffectName) {
        return removeAppliedEmbeddedEffectFromActor(targetActor, keyOrEffectName);
      },
      async applyActorEffect() {
        throw new Error(
          "applyActorEffect(raw) foi desativado no D&D5e 6.x. " +
          "Use um Active Effect embutido no Item e jarvis.applyEmbeddedEffect()."
        );
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
  const approval = inspectActivityAutomation(activity);
  if (!approval.approved) {
    warnUnapproved(activity, approval.reason, "pre");
    // A pre script may enforce cost or prerequisites. Allowing the activity
    // to proceed without an approved pre check could spend or grant resources
    // under different rules from those authored by the GM.
    return false;
  }

  const label = `${activity?.item?.name ?? "Item"} / ${activity?.name ?? "Activity"} / pre`;
  try {
    return executePreScript(script, buildScope(activity, usageConfig, null), label);
  } catch (error) {
    console.error(`${MODULE_ID} | Falha na automação ${label}`, error);
    ui.notifications?.error(`Jarvis Automation: ${label} falhou. Veja o console.`);
    return false;
  }
}

async function applyConfiguredEffect(activity, config) {
  const options = typeof config === "string" ? { effectName: config } : { ...(config ?? {}) };
  const targetMode = options.target ?? "self";
  delete options.target;

  if (targetMode === "self") return applyEmbeddedEffect(activity, options);
  if (targetMode === "selected") {
    const targets = getSelectedTargetActors();
    if (targets.length !== 1) {
      throw new Error(`Effect target='selected' exige exatamente 1 alvo. Alvos atuais: ${targets.length}.`);
    }
    return applyEmbeddedEffectToActor(activity, targets[0], options);
  }
  if (targetMode === "selected-all") {
    const targets = getSelectedTargetActors();
    if (!targets.length) throw new Error("Effect target='selected-all' exige ao menos 1 alvo.");
    const created = [];
    for (const target of targets) created.push(await applyEmbeddedEffectToActor(activity, target, options));
    return created;
  }

  throw new Error(`Modo de alvo de Effect desconhecido '${targetMode}'. Use self, selected ou selected-all.`);
}

async function runPost(activity, usageConfig, results) {
  const automation = getAutomation(activity);
  if (!automation) return undefined;
  const approval = inspectActivityAutomation(activity);
  if (!approval.approved) {
    warnUnapproved(activity, approval.reason, "post");
    return undefined;
  }

  const label = `${activity?.item?.name ?? "Item"} / ${activity?.name ?? "Activity"}`;
  const scope = buildScope(activity, usageConfig, results);

  try {
    for (const config of getEffectConfigs(automation)) {
      if (!canExecute(activity) || !inspectActivityAutomation(activity).approved) return undefined;
      await applyConfiguredEffect(activity, config);
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Falha no Jarvis Effect Engine ${label}`, error);
    ui.notifications?.error(`Jarvis Effect Engine: ${label} falhou. Veja o console.`);
    return undefined;
  }

  const script = automation?.post;
  if (!script) return undefined;
  if (!canExecute(activity) || !inspectActivityAutomation(activity).approved) return undefined;

  try {
    return await executePostScript(script, scope, `${label} / post`);
  } catch (error) {
    console.error(`${MODULE_ID} | Falha na automação ${label} / post`, error);
    ui.notifications?.error(`Jarvis Automation: ${label} / post falhou. Veja o console.`);
    return undefined;
  }
}

export function registerActivityAutomation() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  Hooks.on("dnd5e.preUseActivity", (activity, usageConfig) => {
    if (!canExecute(activity)) {
      if (!hasExecutableAutomation(getAutomation(activity))) return undefined;
      ui.notifications?.warn?.(
        `Jarvis: '${activity?.item?.name ?? "Item"} / ${activity?.name ?? "Activity"}' usa automação Jarvis. ` +
        "O Mestre precisa habilitar o uso pelos jogadores e aprovar a automação; a ficha também precisa estar sob seu controle. Uso cancelado."
      );
      return false;
    }
    const result = runPre(activity, usageConfig);
    if (result === false) return false;
    return undefined;
  });

  Hooks.on("dnd5e.postUseActivity", (activity, usageConfig, results) => {
    if (!canExecute(activity)) return undefined;
    void runPost(activity, usageConfig, results);
    return undefined;
  });
}
