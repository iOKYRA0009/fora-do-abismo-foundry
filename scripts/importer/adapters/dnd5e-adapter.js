const SUPPORTED_ITEM_TYPES = new Set([
  "feat", "weapon", "spell", "consumable", "equipment", "tool", "loot",
  "container", "class", "subclass", "background", "race"
]);

const RECOVERY_PERIODS = Object.freeze({
  shortRest: "sr", sr: "sr", longRest: "lr", lr: "lr",
  day: "day", dawn: "day", recharge: "recharge"
});

const ACTIVITY_TYPES = new Set([
  "attack", "save", "utility", "heal", "check", "damage", "summon",
  "enchant", "cast", "forward"
]);

function clone(value) {
  return foundry.utils.deepClone(value);
}

function slugify(value = "item") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64) || "item";
}

function makeId() {
  if (typeof foundry.utils.randomID === "function") return foundry.utils.randomID(16);

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 16; i += 1) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function normalizeActivityId(value, index) {
  if (value === undefined || value === null || value === "") return makeId();
  const id = String(value);
  if (!/^[A-Za-z0-9]{16}$/.test(id)) {
    throw new Error(`Activity #${index + 1} possui _id inválido. O D&D5e exige exatamente 16 caracteres alfanuméricos.`);
  }
  return id;
}

function normalizeRecoveryEntry(entry) {
  if (typeof entry === "string") {
    const period = RECOVERY_PERIODS[entry] ?? entry;
    return { period, type: "recoverAll" };
  }
  if (!entry || typeof entry !== "object") return null;
  const period = RECOVERY_PERIODS[entry.period] ?? entry.period;
  if (!period) return null;
  return {
    period,
    type: entry.type ?? "recoverAll",
    ...(entry.formula ? { formula: String(entry.formula) } : {})
  };
}

function normalizeUses(uses = {}) {
  const max = uses.max ?? "";
  const spent = Number.isFinite(Number(uses.spent)) ? Number(uses.spent) : 0;
  const recoveryInput = Array.isArray(uses.recovery)
    ? uses.recovery
    : (uses.recovery ? [uses.recovery] : []);

  return {
    max: max === null ? "" : String(max),
    spent,
    recovery: recoveryInput.map(normalizeRecoveryEntry).filter(Boolean)
  };
}

function normalizeConsumptionTarget(target = {}) {
  const normalized = {
    type: target.type ?? "itemUses",
    value: String(target.value ?? "1"),
    target: target.target ?? ""
  };
  if (target.scaling !== undefined) normalized.scaling = target.scaling;
  return normalized;
}

function normalizeConsumption(consumption = {}) {
  return {
    scaling: {
      allowed: Boolean(consumption.scaling?.allowed),
      ...(consumption.scaling?.max !== undefined ? { max: String(consumption.scaling.max) } : {})
    },
    spellSlot: consumption.spellSlot !== false,
    targets: Array.isArray(consumption.targets)
      ? consumption.targets.map(normalizeConsumptionTarget)
      : []
  };
}

function normalizeActivation(activation = {}) {
  return {
    type: activation.type ?? "action",
    ...(activation.value !== undefined ? { value: activation.value } : {}),
    condition: activation.condition ?? "",
    override: Boolean(activation.override)
  };
}

function normalizeDuration(duration = {}) {
  return {
    concentration: Boolean(duration.concentration),
    value: duration.value ?? "",
    units: duration.units ?? "inst",
    special: duration.special ?? "",
    override: Boolean(duration.override)
  };
}

function normalizeRange(range = {}) {
  return {
    value: range.value ?? "",
    units: range.units ?? "self",
    special: range.special ?? "",
    override: Boolean(range.override)
  };
}

function normalizeTarget(target = {}) {
  return {
    template: {
      count: target.template?.count ?? "",
      contiguous: Boolean(target.template?.contiguous),
      stationary: Boolean(target.template?.stationary),
      type: target.template?.type ?? "",
      size: target.template?.size ?? "",
      width: target.template?.width ?? "",
      height: target.template?.height ?? "",
      units: target.template?.units ?? "ft"
    },
    affects: {
      count: target.affects?.count ?? "",
      type: target.affects?.type ?? "",
      choice: Boolean(target.affects?.choice),
      special: target.affects?.special ?? ""
    },
    prompt: target.prompt !== false,
    override: Boolean(target.override)
  };
}

function normalizeDamagePart(part) {
  if (typeof part === "string") {
    return {
      number: null,
      denomination: null,
      bonus: part,
      types: [],
      custom: { enabled: true, formula: part }
    };
  }
  return clone(part ?? {});
}

function buildBaseActivity(activity, id) {
  return {
    _id: id,
    type: activity.type,
    ...(activity.name ? { name: activity.name } : {}),
    img: activity.img ?? "",
    sort: Number(activity.sort ?? 0),
    activation: normalizeActivation(activity.activation),
    consumption: normalizeConsumption(activity.consumption),
    description: { chatFlavor: activity.description?.chatFlavor ?? activity.chatFlavor ?? "" },
    duration: normalizeDuration(activity.duration),
    effects: Array.isArray(activity.effects) ? clone(activity.effects) : [],
    flags: clone(activity.flags ?? {}),
    range: normalizeRange(activity.range),
    target: normalizeTarget(activity.target),
    uses: normalizeUses(activity.uses ?? {}),
    visibility: {
      level: {
        min: activity.visibility?.level?.min ?? null,
        max: activity.visibility?.level?.max ?? null
      },
      requireAttunement: Boolean(activity.visibility?.requireAttunement),
      requireIdentification: Boolean(activity.visibility?.requireIdentification),
      requireMagic: Boolean(activity.visibility?.requireMagic),
      identifier: activity.visibility?.identifier ?? ""
    }
  };
}

function buildAttackActivity(activity, id) {
  const data = buildBaseActivity(activity, id);
  data.attack = {
    ability: activity.attack?.ability ?? "",
    bonus: activity.attack?.bonus ?? "",
    critical: { threshold: activity.attack?.critical?.threshold ?? null },
    flat: Boolean(activity.attack?.flat),
    type: {
      value: activity.attack?.type?.value ?? "melee",
      classification: activity.attack?.type?.classification ?? "weapon"
    }
  };
  data.damage = {
    critical: { bonus: activity.damage?.critical?.bonus ?? "" },
    includeBase: activity.damage?.includeBase !== false,
    parts: Array.isArray(activity.damage?.parts)
      ? activity.damage.parts.map(normalizeDamagePart)
      : []
  };
  return data;
}

function buildSaveActivity(activity, id) {
  const data = buildBaseActivity(activity, id);
  data.damage = {
    onSave: activity.damage?.onSave ?? "none",
    parts: Array.isArray(activity.damage?.parts)
      ? activity.damage.parts.map(normalizeDamagePart)
      : []
  };
  data.save = {
    ability: activity.save?.ability ?? "",
    dc: {
      calculation: activity.save?.dc?.calculation ?? "",
      formula: activity.save?.dc?.formula ?? ""
    }
  };
  return data;
}

function buildUtilityActivity(activity, id) {
  const data = buildBaseActivity(activity, id);
  if (activity.roll) {
    data.roll = {
      prompt: Boolean(activity.roll.prompt),
      visible: Boolean(activity.roll.visible),
      name: activity.roll.name ?? "Roll",
      formula: activity.roll.formula ?? ""
    };
  }
  return data;
}

function buildGenericActivity(activity, id) {
  const data = buildBaseActivity(activity, id);
  for (const key of ["damage", "healing", "check", "save", "attack", "summon", "enchant", "roll"]) {
    if (activity[key] !== undefined) data[key] = clone(activity[key]);
  }
  return data;
}

function buildActivity(activity, index) {
  if (!activity || typeof activity !== "object") {
    throw new Error(`Activity #${index + 1} inválida.`);
  }

  const type = activity.type ?? "utility";
  if (!ACTIVITY_TYPES.has(type)) {
    throw new Error(`Activity type '${type}' ainda não é suportado pelo Jarvis V9.`);
  }

  const id = normalizeActivityId(activity._id, index);
  const normalized = { ...activity, type };

  if (type === "attack") return buildAttackActivity(normalized, id);
  if (type === "save") return buildSaveActivity(normalized, id);
  if (type === "utility") return buildUtilityActivity(normalized, id);
  return buildGenericActivity(normalized, id);
}

function mergeActivities(existing = {}, semantic = []) {
  const result = clone(existing ?? {});
  semantic.forEach((activity, index) => {
    const built = buildActivity(activity, index);
    result[built._id] = built;
  });
  return result;
}

function getDocumentTypes() {
  const types = game.documentTypes?.Item;
  if (Array.isArray(types)) return new Set(types);
  return SUPPORTED_ITEM_TYPES;
}

export class Dnd5eV6Adapter {
  static get id() {
    return "dnd5e-5.3+";
  }

  static getTargetInfo() {
    return {
      foundryGeneration: game.release?.generation ?? null,
      systemId: game.system?.id ?? null,
      systemVersion: game.system?.version ?? null
    };
  }

  static assertRuntime() {
    const info = this.getTargetInfo();
    if (info.systemId !== "dnd5e") {
      throw new Error(`Adaptador D&D5e recebeu sistema '${info.systemId ?? "desconhecido"}'.`);
    }
    if (info.foundryGeneration && Number(info.foundryGeneration) < 14) {
      throw new Error(`Foundry V${info.foundryGeneration} não é suportado pelo Jarvis V9. Alvo: V14+.`);
    }
    return info;
  }

  static adaptActor(actorData = {}) {
    const data = clone(actorData);
    data.flags ??= {};
    data.flags["fora-do-abismo-foundry"] ??= {};
    data.flags["fora-do-abismo-foundry"].adapter = this.id;
    data.flags["fora-do-abismo-foundry"].systemVersion = game.system?.version ?? null;
    return data;
  }

  static adaptItems(items = []) {
    const supportedTypes = getDocumentTypes();
    return items.map((item, index) => this.adaptItem(item, { index, supportedTypes }));
  }

  static adaptItem(itemData = {}, { index = 0, supportedTypes = getDocumentTypes() } = {}) {
    const data = clone(itemData);
    const semantic = clone(data.jarvis ?? {});
    delete data.jarvis;

    if (!data.name || !data.type) {
      throw new Error(`Item #${index + 1} precisa de name e type antes da adaptação D&D5e.`);
    }
    if (!supportedTypes.has(data.type)) {
      throw new Error(`Item '${data.name}' usa type '${data.type}', indisponível nesta instalação do D&D5e.`);
    }

    data.system ??= {};

    if (semantic.description !== undefined) {
      data.system.description ??= {};
      data.system.description.value = String(semantic.description ?? "");
      data.system.description.chat ??= "";
    }

    if (semantic.uses) {
      data.system.uses = { ...(data.system.uses ?? {}), ...normalizeUses(semantic.uses) };
    }

    if (Array.isArray(semantic.activities) && semantic.activities.length) {
      data.system.activities = mergeActivities(data.system.activities, semantic.activities);
    }

    if (semantic.identifier && !data.system.identifier) {
      data.system.identifier = slugify(semantic.identifier);
    } else if (!data.system.identifier && ["feat", "spell", "weapon"].includes(data.type)) {
      data.system.identifier = slugify(data.name);
    }

    data.flags ??= {};
    data.flags["fora-do-abismo-foundry"] ??= {};
    data.flags["fora-do-abismo-foundry"].adapter = this.id;
    data.flags["fora-do-abismo-foundry"].semanticSource = Boolean(itemData.jarvis);

    return data;
  }
}
