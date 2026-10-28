const MODULE_ID = "fora-do-abismo-foundry";

function asKey(value) {
  return String(value ?? "").trim();
}

function getActor(activity) {
  return activity?.item?.actor ?? activity?.actor ?? null;
}

function getItem(activity) {
  return activity?.item ?? null;
}

export function resolveEmbeddedEffect(activity, { effectId = null, effectName = null } = {}) {
  const item = getItem(activity);
  if (!item) throw new Error("Jarvis Effect Engine: Activity sem Item associado.");

  if (effectId) {
    const byId = item.effects?.get?.(String(effectId));
    if (byId) return byId;
  }

  if (effectName) {
    const wanted = String(effectName).trim().toLowerCase();
    const byName = item.effects?.find?.(effect => String(effect.name ?? "").trim().toLowerCase() === wanted);
    if (byName) return byName;
  }

  const refs = Array.from(activity?.effects ?? []);
  for (const ref of refs) {
    const id = ref?._id ?? ref?.id;
    if (!id) continue;
    const effect = item.effects?.get?.(id);
    if (effect) return effect;
  }

  if (item.effects?.size === 1) return item.effects.contents?.[0] ?? Array.from(item.effects)[0] ?? null;

  throw new Error(
    `Jarvis Effect Engine: não encontrei Active Effect embutido em '${item.name}'. ` +
    "Informe effectId/effectName ou vincule um Effect à Activity."
  );
}

function findAppliedEffects(actor, { key = null, sourceUuid = null } = {}) {
  if (!actor) return [];
  const normalizedKey = asKey(key);

  return actor.effects.filter(effect => {
    const automationKey = asKey(effect.getFlag?.(MODULE_ID, "automationKey"));
    const duplicateSource = effect._stats?.duplicateSource ?? effect._stats?.compendiumSource ?? null;
    if (normalizedKey && automationKey === normalizedKey) return true;
    if (sourceUuid && duplicateSource === sourceUuid) return true;
    return false;
  });
}

export async function prepareEmbeddedEffectForActor(effect, activity, actor, { key = null } = {}) {
  if (!effect) throw new Error("Jarvis Effect Engine: Effect embutido ausente.");
  if (!activity) throw new Error("Jarvis Effect Engine: Activity ausente.");
  if (!actor) throw new Error("Jarvis Effect Engine: Actor ausente.");

  const effectData = effect.toObject();
  effectData.disabled = false;
  effectData.transfer = false;

  effectData.flags ??= {};
  effectData.flags[MODULE_ID] ??= {};
  if (key) effectData.flags[MODULE_ID].automationKey = asKey(key);

  effectData.system ??= {};
  effectData.system.origin ??= {};
  effectData.system.origin.activity = activity.uuid;
  effectData.system.origin.item = activity.item?.uuid ?? null;
  effectData.system.origin.actor = activity.item?.actor?.uuid ?? null;

  effectData.duration ??= {};
  effectData.duration.expired = false;
  effectData.start = effect.constructor?.getEffectStart?.() ?? effectData.start ?? null;

  const forApplication = ActiveEffect.implementation?.forApplication;
  if (typeof forApplication !== "function") {
    throw new Error("Jarvis Effect Engine: D&D5e não expôs ActiveEffect.implementation.forApplication().");
  }

  effectData.system.changes = await forApplication.call(
    ActiveEffect.implementation,
    effectData.system.changes ?? [],
    activity,
    actor
  );

  effectData._stats ??= {};
  effectData._stats.duplicateSource = effect.uuid;
  effectData._stats.compendiumSource = null;

  return effectData;
}

export async function applyEmbeddedEffectToActor(activity, actor, {
  effectId = null,
  effectName = null,
  key = null,
  replace = true
} = {}) {
  if (!actor) throw new Error("Jarvis Effect Engine: Actor alvo ausente.");

  const effect = resolveEmbeddedEffect(activity, { effectId, effectName });
  const normalizedKey = asKey(key) || `embedded:${effect.uuid}`;

  const existing = replace
    ? findAppliedEffects(actor, { key: normalizedKey, sourceUuid: effect.uuid })
    : [];
  const data = await prepareEmbeddedEffectForActor(effect, activity, actor, { key: normalizedKey });
  // Preparing or creating the replacement can fail. Keep the previous Effect
  // until Foundry has confirmed that the new document exists on the Actor.
  const created = await ActiveEffect.implementation.create(data, { parent: actor });
  if (!created) throw new Error("Jarvis Effect Engine: Foundry não criou o Active Effect.");
  if (existing.length) {
    try {
      await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(entry => entry.id));
    } catch (error) {
      // A bulk deletion can fail before or after removing some documents. Only
      // remove the new Effect when at least one predecessor is still present.
      const remainingOld = existing.some(entry => Array.from(actor.effects ?? [])
        .some(current => current.id === entry.id));
      if (remainingOld) {
        try {
          if (typeof created.delete !== "function") {
            throw new Error("o novo Active Effect não expõe delete()");
          }
          await created.delete();
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError],
            "Jarvis Effect Engine: não foi possível remover o Effect antigo nem desfazer o novo. Revise os Effects do Actor.");
        }
      }
      throw new Error("Jarvis Effect Engine: falha ao concluir a substituição. Revise os Effects do Actor.", { cause: error });
    }
  }
  return created;
}

export async function applyEmbeddedEffect(activity, options = {}) {
  const actor = getActor(activity);
  if (!actor) throw new Error("Jarvis Effect Engine: Activity sem Actor associado.");
  return applyEmbeddedEffectToActor(activity, actor, options);
}

export async function removeAppliedEmbeddedEffectFromActor(actor, keyOrEffectName) {
  if (!actor) throw new Error("Jarvis Effect Engine: Actor alvo ausente.");
  const key = asKey(keyOrEffectName).toLowerCase();
  if (!key) throw new Error("Jarvis Effect Engine: informe uma chave ou nome de Effect Jarvis.");
  const ids = actor.effects.filter(effect => {
    const automationKey = asKey(effect.getFlag?.(MODULE_ID, "automationKey")).toLowerCase();
    const name = String(effect.name ?? "").trim().toLowerCase();
    return Boolean(automationKey) && (automationKey === key || name === key);
  }).map(effect => effect.id);

  if (!ids.length) return [];
  return actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

export async function removeAppliedEmbeddedEffect(activity, keyOrEffectName) {
  const actor = getActor(activity);
  if (!actor) throw new Error("Jarvis Effect Engine: Activity sem Actor associado.");
  return removeAppliedEmbeddedEffectFromActor(actor, keyOrEffectName);
}
