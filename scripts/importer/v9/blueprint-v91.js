import { validateJarvisActorPayload } from "../validators/payload-validator.js";

const ABILITIES = new Set(["str", "dex", "con", "int", "wis", "cha"]);
const KINDS = new Set(["attack", "save", "check", "damage", "heal", "utility", "teleport"]);
const FORMULA = /^(?:\d+d\d+|\d+|@mod|@prof)(?:\s*[+-]\s*(?:\d+d\d+|\d+|@mod|@prof))*$/i;
const DAMAGE_TYPES_PT = Object.freeze({
  acido: "acid", contundente: "bludgeoning", frio: "cold", fogo: "fire", energia: "force",
  eletrico: "lightning", necrotico: "necrotic", perfurante: "piercing", veneno: "poison",
  psiquico: "psychic", radiante: "radiant", cortante: "slashing", trovejante: "thunder"
});
const DAMAGE_TYPES = new Set([...Object.values(DAMAGE_TYPES_PT), "healing", "temphp"]);
const ACTIVATIONS = new Set(["action", "bonus", "reaction"]);

function copy(value) { return structuredClone(value); }
function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} é obrigatório.`);
  return value.trim();
}
function ability(value, label) {
  if (!ABILITIES.has(value)) throw new Error(`${label} deve ser str, dex, con, int, wis ou cha.`);
  return value;
}
function formula(value, label) {
  const result = required(value, label);
  if (!FORMULA.test(result)) throw new Error(`${label} deve usar dados e modificadores simples, como 2d6+4.`);
  return result;
}
function fixedDC(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > 40) throw new Error(`${label} deve ser inteiro entre 1 e 40.`);
  return value;
}
function validateActorNumbers(actor) {
  for (const [key, value] of Object.entries(actor.jarvis?.abilities ?? {})) {
    if (!ABILITIES.has(key)) throw new Error(`actor.jarvis.abilities.${key} não é atributo D&D5e.`);
    const score = typeof value === "object" && value !== null ? value.value : value;
    if (!Number.isInteger(score) || score < 1 || score > 30) throw new Error(`actor.jarvis.abilities.${key} deve ser inteiro entre 1 e 30.`);
  }
  const hp = actor.jarvis?.hp;
  if (hp) for (const key of ["value", "max"]) {
    if (hp[key] !== undefined && (!Number.isInteger(hp[key]) || hp[key] < 0)) throw new Error(`actor.jarvis.hp.${key} deve ser inteiro não negativo.`);
  }
  if (hp?.value !== undefined && hp?.max !== undefined && hp.value > hp.max) throw new Error("actor.jarvis.hp.value não pode exceder max.");
  if (actor.jarvis?.ac !== undefined && (typeof actor.jarvis.ac !== "number"
    || !Number.isInteger(actor.jarvis.ac) || actor.jarvis.ac < 0)) throw new Error("actor.jarvis.ac deve ser inteiro não negativo.");
}
function damagePart(input, label) {
  if (!input || typeof input !== "object") throw new Error(`${label} precisa de fórmula e tipo.`);
  const roll = formula(input.formula, `${label}.formula`);
  const rawType = required(input.type, `${label}.type`);
  const key = rawType.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const type = DAMAGE_TYPES_PT[key] ?? rawType;
  if (!DAMAGE_TYPES.has(type) && !globalThis.CONFIG?.DND5E?.damageTypes?.[type]) {
    throw new Error(`${label}.type '${rawType}' não é um tipo de dano conhecido pelo D&D5e.`);
  }
  return { number: null, denomination: null, bonus: "", types: [type], custom: { enabled: true, formula: roll } };
}
function stableActivityId(value) {
  const hash = seed => {
    let result = seed;
    for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619) >>> 0;
    return result.toString(36).padStart(8, "0");
  };
  return `${hash(2166136261)}${hash(1565819131)}`;
}

/**
 * V9.1 is a compact authoring contract. It compiles to the existing V9
 * transaction, so old 9.0 payloads keep their behavior.
 */
export function compileActorBlueprintV91(input) {
  if (input?.schemaVersion === "9.0") {
    validateJarvisActorPayload(input);
    return copy(input);
  }
  if (input?.schemaVersion !== "9.1") {
    validateJarvisActorPayload(input);
    throw new Error("Use schemaVersion 9.0 ou 9.1.");
  }
  if (!input.actor || typeof input.actor !== "object") throw new Error("actor é obrigatório.");
  const actor = copy(input.actor);
  required(actor.name, "actor.name");
  if (!["npc", "character"].includes(actor.type)) throw new Error("actor.type deve ser npc ou character.");
  validateActorNumbers(actor);
  const actions = input.actions ?? [];
  if (!Array.isArray(actions)) throw new Error("actions deve ser uma lista.");
  if (input.scenarios !== undefined && !Array.isArray(input.scenarios)) throw new Error("scenarios deve ser uma lista.");
  const items = copy(input.items ?? []);
  if (!Array.isArray(items)) throw new Error("items deve ser uma lista.");
  actions.forEach((action, index) => {
    const label = `actions[${index}]`;
    const name = required(action?.name, `${label}.name`);
    const kind = action.kind;
    if (!KINDS.has(kind)) throw new Error(`${label}.kind desconhecido: ${kind ?? "vazio"}.`);
    if (action.description !== undefined && typeof action.description !== "string") throw new Error(`${label}.description deve ser texto público da habilidade.`);
    if (action.activation !== undefined && !ACTIVATIONS.has(action.activation)) throw new Error(`${label}.activation deve ser action, bonus ou reaction.`);
    const activity = { _id: stableActivityId(`${kind}:${name}`), type: kind, name,
      description: { value: action.description?.trim() || `<p>${name.replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char])}</p>` }, activation: { type: action.activation ?? "action" } };
    if (kind === "attack") {
      if (actor.type === "npc" && action.toHit === undefined) throw new Error(`${label}: NPC precisa de toHit fixo para evitar bônus de ataque ambíguo.`);
      if (action.toHit === undefined && !action.ability) throw new Error(`${label}: informe toHit fixo ou ability.`);
      if (action.range !== undefined && !["melee", "ranged"].includes(action.range)) throw new Error(`${label}.range deve ser melee ou ranged.`);
      if (action.classification !== undefined && !["weapon", "spell", "unarmed"].includes(action.classification)) throw new Error(`${label}.classification deve ser weapon, spell ou unarmed.`);
      if (action.toHit !== undefined && (!Number.isInteger(action.toHit) || action.toHit < -20 || action.toHit > 40)) {
        throw new Error(`${label}.toHit deve ser bônus inteiro entre -20 e 40.`);
      }
      activity.attack = {
        ability: action.ability ? ability(action.ability, `${label}.ability`) : "",
        bonus: action.toHit === undefined ? "" : String(Number(action.toHit)),
        flat: action.toHit !== undefined,
        type: { value: action.range === "ranged" ? "ranged" : "melee", classification: action.classification ?? "weapon" }
      };
      activity.damage = { includeBase: false, parts: [damagePart(action.damage, `${label}.damage`)] };
    } else if (kind === "save") {
      activity.save = { ability: [ability(action.ability, `${label}.ability`)], dc: { calculation: "", formula: String(fixedDC(action.dc, `${label}.dc`)) } };
      if (action.damage) {
        if (!new Set(["none", "half", "full"]).has(action.onSave ?? "none")) throw new Error(`${label}.onSave deve ser none, half ou full.`);
        activity.damage = { onSave: action.onSave ?? "none", parts: [damagePart(action.damage, `${label}.damage`)] };
      }
    } else if (kind === "check") {
      const checkAbility = ability(action.ability, `${label}.ability`);
      activity.check = { ability: checkAbility, associated: [], bonus: "", dc: { calculation: "", formula: String(fixedDC(action.dc, `${label}.dc`)) } };
    } else if (kind === "damage") {
      activity.damage = { parts: [damagePart(action.damage, `${label}.damage`)] };
    } else if (kind === "heal") {
      activity.healing = damagePart({ formula: action.healing, type: action.healingType ?? "healing" }, `${label}.healing`);
    } else if (kind === "teleport") {
      const distance = Number(action.distance);
      if (!Number.isFinite(distance) || distance <= 0) throw new Error(`${label}.distance deve ser uma distância positiva.`);
      activity.teleport = { override: true, units: action.units ?? "ft", value: String(distance) };
    } else if (action.roll) {
      activity.roll = { visible: true, name, formula: formula(action.roll, `${label}.roll`) };
    }
    if (action.uses) {
      activity.uses = copy(action.uses);
      activity.consumption = { targets: [{ type: "activityUses", value: "1", target: "" }] };
    }
    items.push({ name, type: kind === "attack" ? "weapon" : "feat", jarvis: {
      description: action.description ?? "", activities: [activity]
    } });
  });
  const result = { schemaVersion: "9.0", compilerVersion: "9.1", actor, items,
    effects: copy(input.effects ?? []), scenarios: copy(input.scenarios ?? []) };
  validateJarvisActorPayload(result);
  return result;
}
