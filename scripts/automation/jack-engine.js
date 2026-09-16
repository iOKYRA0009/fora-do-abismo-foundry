import {
  applyEmbeddedEffectToActor,
  removeAppliedEmbeddedEffectFromActor
} from "./embedded-effect-engine.js";

const MODULE_ID = "fora-do-abismo-foundry";
const ENGINE_FLAG = "jackEngine";
const SOUL_RESOURCE = "primary";
const SOUL_ITEM_ID = "jack-coleta-de-almas";
const ROOT_ITEM_ID = "jack-raizes-do-vazio";
const SOUL_SYNC_ACTIVITY = "JackSoulSync0001";
const ROOT_AUTO_ACTIVITY = "JackRootsAuto001";
const ECOS_KEY = "jack-ecos-underdark";
const ROOT_KEY = "jack-raizes-preso";
const BLOOM_KEY = "jack-raizes-florescimento";

const combatState = new Map();

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getFlag(actor) {
  return actor?.getFlag?.(MODULE_ID, ENGINE_FLAG) ?? actor?.flags?.[MODULE_ID]?.[ENGINE_FLAG] ?? null;
}

function isEnabled(actor) {
  return Boolean(actor && getFlag(actor)?.enabled);
}

function getSouls(actor) {
  return Math.max(0, Math.trunc(asNumber(actor?.system?.resources?.[SOUL_RESOURCE]?.value, 0)));
}

function getIdentifier(item) {
  return String(item?.system?.identifier ?? "").trim().toLowerCase();
}

function findItem(actor, identifier) {
  const wanted = String(identifier ?? "").toLowerCase();
  return actor?.items?.find?.(item => getIdentifier(item) === wanted) ?? null;
}

function findActivity(item, id) {
  if (!item) return null;
  const activities = item.system?.activities;
  return activities?.get?.(id)
    ?? activities?.find?.(activity => activity.id === id || activity._id === id)
    ?? null;
}

function changeValue(changes, path) {
  if (!changes || typeof changes !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(changes, path)) return changes[path];
  return foundry.utils.getProperty(changes, path);
}

function setChange(changes, path, value) {
  if (Object.prototype.hasOwnProperty.call(changes, path)) changes[path] = value;
  else foundry.utils.setProperty(changes, path, value);
}

function getState(actor) {
  const key = actor?.uuid ?? actor?.id;
  if (!key) return {};
  if (!combatState.has(key)) combatState.set(key, {});
  return combatState.get(key);
}

function getTurnKey() {
  const combat = game.combat;
  if (!combat?.started) return null;
  return `${combat.id}:${combat.round ?? 0}:${combat.turn ?? 0}`;
}

function markActivityUse(actor) {
  const state = getState(actor);
  state.useId = foundry.utils.randomID();
  state.nonCombatRootsUsed = false;
  state.nonCombatFomeUsed = false;
  state.startedAt = Date.now();
  return state;
}

function canUseOncePerTurn(actor, field) {
  const state = getState(actor);
  const turnKey = getTurnKey();
  if (turnKey) {
    if (state[field] === turnKey) return false;
    state[field] = turnKey;
    return true;
  }

  const nonCombatField = field === "rootsTurnKey" ? "nonCombatRootsUsed" : "nonCombatFomeUsed";
  if (state[nonCombatField]) return false;
  state[nonCombatField] = true;
  return true;
}

function getSelectedTargetActor() {
  const targets = Array.from(game.user?.targets ?? []);
  if (targets.length !== 1) return null;
  return targets[0]?.actor ?? targets[0]?.document?.actor ?? null;
}

function getNaturalD20(roll) {
  const dice = Array.from(roll?.dice ?? []);
  for (const die of dice) {
    if (Number(die?.faces) !== 20) continue;
    const active = Array.from(die.results ?? []).find(result => result?.active !== false && result?.discarded !== true);
    if (active && Number.isFinite(Number(active.result))) return Number(active.result);
  }
  return null;
}

function attackHit(roll, targetActor) {
  if (!roll) return false;
  if (roll.isCritical) return true;

  let ac = asNumber(roll.options?.target, NaN);
  if (!Number.isFinite(ac)) ac = asNumber(targetActor?.system?.attributes?.ac?.value, NaN);
  if (!Number.isFinite(ac)) return false;

  return asNumber(roll.total, -Infinity) >= ac;
}

async function rollTypedDamage(actor, formula, type, flavor) {
  const DamageRoll = CONFIG.Dice?.DamageRoll;
  if (typeof DamageRoll !== "function") {
    const fallback = await new Roll(formula, actor?.getRollData?.() ?? {}).evaluate();
    await fallback.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor });
    return fallback;
  }

  const roll = await new DamageRoll(formula, actor?.getRollData?.() ?? {}, { type }).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor });
  return roll;
}

function hasEffectKey(actor, key) {
  return actor?.effects?.some?.(effect => effect.getFlag?.(MODULE_ID, "automationKey") === key) ?? false;
}

export async function syncJackSoulTiers(actor, { notify = false } = {}) {
  if (!isEnabled(actor)) return { enabled: false, souls: 0, ecos: false };

  const souls = getSouls(actor);
  const soulItem = findItem(actor, SOUL_ITEM_ID);
  const activity = findActivity(soulItem, SOUL_SYNC_ACTIVITY);

  if (!soulItem || !activity) {
    if (notify) ui.notifications?.warn("Jarvis Jack Engine: Coleta de Almas ainda não está pronta na ficha.");
    return { enabled: true, souls, ecos: false, missingSoulItem: true };
  }

  const shouldHaveEcos = souls >= 10;
  const hasEcos = hasEffectKey(actor, ECOS_KEY);

  if (shouldHaveEcos && !hasEcos) {
    await applyEmbeddedEffectToActor(activity, actor, {
      effectName: "Ecos do Underdark",
      key: ECOS_KEY,
      replace: true
    });
  } else if (!shouldHaveEcos && hasEcos) {
    await removeAppliedEmbeddedEffectFromActor(actor, ECOS_KEY);
  }

  if (notify) {
    ui.notifications?.info(
      `Jack — Almas ${souls}/100 | Ecos ${souls >= 10 ? "ATIVO" : "inativo"} | ` +
      `Fome ${souls >= 25 ? "ATIVA" : "inativa"} | Vitalidade ${souls >= 50 ? "ATIVA" : "inativa"} | ` +
      `Arauto ${souls >= 100 ? "ATIVO" : "inativo"}.`
    );
  }

  return { enabled: true, souls, ecos: shouldHaveEcos };
}

async function handleEldritchHit(actor, roll, targetActor) {
  const souls = getSouls(actor);

  if (souls >= 25 && canUseOncePerTurn(actor, "fomeTurnKey")) {
    await rollTypedDamage(
      actor,
      "1d4",
      "necrotic",
      `<strong>Fome de Orcus</strong> — +1d4 necrótico em ${targetActor.name}. Este dano ignora resistência, conforme a regra da campanha.`
    );
  }

  const rootsItem = findItem(actor, ROOT_ITEM_ID);
  const rootsActivity = findActivity(rootsItem, ROOT_AUTO_ACTIVITY);
  if (!rootsActivity) return;

  if (canUseOncePerTurn(actor, "rootsTurnKey")) {
    await applyEmbeddedEffectToActor(rootsActivity, targetActor, {
      effectName: "Raízes do Vazio — Preso",
      key: ROOT_KEY,
      replace: true
    });
    ui.notifications?.info(`Raízes do Vazio: ${targetActor.name} sofre -10 ft de deslocamento até o início do próximo turno de Jack.`);
  }

  if (getNaturalD20(roll) === 20) {
    await rollTypedDamage(
      actor,
      "1d8",
      "necrotic",
      `<strong>Florescimento do Vazio</strong> — 20 natural em Eldritch Blast contra ${targetActor.name}.`
    );
    await applyEmbeddedEffectToActor(rootsActivity, targetActor, {
      effectName: "Florescimento do Vazio — Sem Reações",
      key: BLOOM_KEY,
      replace: true
    });
    ui.notifications?.info(`Florescimento do Vazio: ${targetActor.name} não pode realizar Reações até o início do próximo turno de Jack.`);
  }
}

async function onPostRollAttack(rolls, { subject } = {}) {
  try {
    const actor = subject?.item?.actor ?? subject?.actor ?? null;
    if (!isEnabled(actor)) return;

    const targetActor = getSelectedTargetActor();
    if (!targetActor) return;

    const hitRolls = Array.from(rolls ?? []).filter(roll => attackHit(roll, targetActor));
    if (!hitRolls.length) return;

    const identifier = getIdentifier(subject?.item);

    if (identifier !== "eldritch-blast") {
      const souls = getSouls(actor);
      if (souls >= 25 && canUseOncePerTurn(actor, "fomeTurnKey")) {
        await rollTypedDamage(
          actor,
          "1d4",
          "necrotic",
          `<strong>Fome de Orcus</strong> — +1d4 necrótico em ${targetActor.name}. Este dano ignora resistência, conforme a regra da campanha.`
        );
      }
      return;
    }

    for (const roll of hitRolls) await handleEldritchHit(actor, roll, targetActor);
  } catch (error) {
    console.error(`${MODULE_ID} | Jack Engine falhou no pós-ataque`, error);
    ui.notifications?.error("Jarvis Jack Engine: falha ao processar ataque. Veja o console.");
  }
}

function onPostUseActivity(activity) {
  const actor = activity?.item?.actor ?? activity?.actor ?? null;
  if (!isEnabled(actor)) return;
  markActivityUse(actor);
}

function onPreUpdateActor(actor, changes) {
  if (!isEnabled(actor)) return;

  const hpChange = changeValue(changes, "system.attributes.hp.value");
  if (hpChange === undefined) return;

  const previousHp = asNumber(actor.system?.attributes?.hp?.value, 0);
  const nextHp = asNumber(hpChange, previousHp);
  if (!(previousHp > 0 && nextHp <= 0)) return;

  const explicitSoulChange = changeValue(changes, `system.resources.${SOUL_RESOURCE}.value`);
  const currentSouls = explicitSoulChange === undefined ? getSouls(actor) : Math.max(0, Math.trunc(asNumber(explicitSoulChange, 0)));
  const lostToZero = Math.floor(currentSouls / 2);
  setChange(changes, `system.resources.${SOUL_RESOURCE}.value`, lostToZero);

  ui.notifications?.warn(`Jack caiu a 0 PV: Almas reduzidas de ${currentSouls} para ${lostToZero}.`);
}

function onUpdateActor(actor, changes) {
  if (!isEnabled(actor)) return;
  const soulChange = changeValue(changes, `system.resources.${SOUL_RESOURCE}.value`);
  if (soulChange === undefined) return;

  Promise.resolve().then(() => syncJackSoulTiers(actor)).catch(error => {
    console.error(`${MODULE_ID} | Jack Engine falhou ao sincronizar tiers`, error);
  });
}

export function registerJackEngine() {
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  Hooks.on("dnd5e.postRollAttack", onPostRollAttack);
  Hooks.on("preUpdateActor", onPreUpdateActor);
  Hooks.on("updateActor", onUpdateActor);
}

export function getJackSoulStatus(actor) {
  const souls = getSouls(actor);
  return {
    enabled: isEnabled(actor),
    souls,
    ecos: souls >= 10,
    fome: souls >= 25,
    vitalidade: souls >= 50,
    arauto: souls >= 100
  };
}
