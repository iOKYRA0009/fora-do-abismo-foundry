export class PayloadValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "PayloadValidationError";
    this.details = details;
  }
}

const IMAGE_SOURCES = new Set(["foundry", "generate", "custom"]);
const ACTIVITY_TYPES = new Set([
  "attack", "save", "utility", "heal", "check", "damage", "summon", "enchant", "cast", "forward", "teleport", "transform"
]);
const RESOURCE_SLOTS = new Set(["primary", "secondary", "tertiary"]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateImgStrategy(strategy, path, errors) {
  if (strategy === undefined) return;

  if (!isObject(strategy)) {
    errors.push(`${path} deve ser um objeto.`);
    return;
  }

  if (strategy.source !== undefined && !IMAGE_SOURCES.has(strategy.source)) {
    errors.push(`${path}.source deve ser 'foundry', 'generate' ou 'custom'.`);
  }

  if (strategy.source === "custom" && !strategy.customPath) {
    errors.push(`${path}.customPath é obrigatório quando source = 'custom'.`);
  }

  if (strategy.promptHints !== undefined && !Array.isArray(strategy.promptHints)) {
    errors.push(`${path}.promptHints deve ser uma lista.`);
  }

  if (strategy.tags !== undefined && !Array.isArray(strategy.tags)) {
    errors.push(`${path}.tags deve ser uma lista.`);
  }
}

function validateActorSemantic(jarvis, path, errors) {
  if (jarvis === undefined) return;
  if (!isObject(jarvis)) {
    errors.push(`${path} deve ser um objeto.`);
    return;
  }

  for (const key of ["abilities", "skills", "hp", "movement", "details"]) {
    if (jarvis[key] !== undefined && !isObject(jarvis[key])) {
      errors.push(`${path}.${key} deve ser um objeto.`);
    }
  }

  if (jarvis.saves !== undefined && !Array.isArray(jarvis.saves)) {
    errors.push(`${path}.saves deve ser uma lista.`);
  }

  if (jarvis.resources !== undefined) {
    if (!Array.isArray(jarvis.resources)) {
      errors.push(`${path}.resources deve ser uma lista.`);
    } else {
      if (jarvis.resources.length > 3) {
        errors.push(`${path}.resources aceita no máximo 3 recursos nativos do Actor.`);
      }

      jarvis.resources.forEach((resource, index) => {
        const resourcePath = `${path}.resources[${index}]`;
        if (!isObject(resource)) {
          errors.push(`${resourcePath} deve ser um objeto.`);
          return;
        }
        if (resource.slot !== undefined && !RESOURCE_SLOTS.has(resource.slot)) {
          errors.push(`${resourcePath}.slot deve ser primary, secondary ou tertiary.`);
        }
      });
    }
  }
}

function validateAutomation(automation, path, errors) {
  if (automation === undefined) return;
  if (!isObject(automation)) {
    errors.push(`${path} deve ser um objeto.`);
    return;
  }

  for (const phase of ["pre", "post"]) {
    if (automation[phase] !== undefined && typeof automation[phase] !== "string") {
      errors.push(`${path}.${phase} deve ser texto JavaScript.`);
    }
  }

  if (!automation.pre && !automation.post) {
    errors.push(`${path} precisa definir pelo menos 'pre' ou 'post'.`);
  }
}

function validateUses(uses, path, errors) {
  if (uses === undefined) return;
  if (!isObject(uses)) { errors.push(`${path} deve ser um objeto.`); return; }
  if (uses.spent !== undefined && (!Number.isFinite(Number(uses.spent)) || Number(uses.spent) < 0)) {
    errors.push(`${path}.spent deve ser um número não negativo.`);
  }
  const recovery = uses.recovery === undefined ? [] : Array.isArray(uses.recovery) ? uses.recovery : [uses.recovery];
  recovery.forEach((entry, index) => {
    if (typeof entry === "string" && entry.trim()) return;
    if (!isObject(entry) || typeof entry.period !== "string" || !entry.period.trim()) {
      errors.push(`${path}.recovery[${index}] precisa de period válido.`);
    }
  });
}

function validateActivity(activity, path, errors) {
  if (!isObject(activity)) { errors.push(`${path} deve ser um objeto.`); return; }
  if (activity.type !== undefined && !ACTIVITY_TYPES.has(activity.type)) {
    errors.push(`${path}.type '${activity.type}' ainda não é suportado pelo V9.`);
  }
  if (activity._id !== undefined && !/^[A-Za-z0-9]{16}$/.test(String(activity._id))) {
    errors.push(`${path}._id precisa de exatamente 16 caracteres alfanuméricos.`);
  }
  if (activity.attack !== undefined && !isObject(activity.attack)) errors.push(`${path}.attack deve ser um objeto.`);
  if (activity.save !== undefined && !isObject(activity.save)) errors.push(`${path}.save deve ser um objeto.`);
  if (activity.save?.dc !== undefined && !isObject(activity.save.dc)) errors.push(`${path}.save.dc deve ser um objeto.`);
  if (activity.damage !== undefined && !isObject(activity.damage)) errors.push(`${path}.damage deve ser um objeto.`);
  if (activity.damage?.parts !== undefined) {
    if (!Array.isArray(activity.damage.parts)) errors.push(`${path}.damage.parts deve ser uma lista.`);
    else activity.damage.parts.forEach((part, index) => {
      if (typeof part !== "string" && !isObject(part)) errors.push(`${path}.damage.parts[${index}] deve ser fórmula ou objeto.`);
    });
  }
  if (activity.consumption !== undefined && !isObject(activity.consumption)) errors.push(`${path}.consumption deve ser um objeto.`);
  if (activity.consumption?.targets !== undefined) {
    if (!Array.isArray(activity.consumption.targets)) errors.push(`${path}.consumption.targets deve ser uma lista.`);
    else {
      const seenTargets = new Set();
      activity.consumption.targets.forEach((target, index) => {
        if (!isObject(target) || !String(target.type ?? "itemUses").trim()) {
          errors.push(`${path}.consumption.targets[${index}] deve definir um tipo de recurso.`);
          return;
        }
        const targetKey = `${target.type ?? "itemUses"}:${target.target ?? ""}`;
        if (seenTargets.has(targetKey)) errors.push(`${path}.consumption.targets[${index}] repete o mesmo recurso; pode cobrar duas vezes.`);
        seenTargets.add(targetKey);
      });
    }
  }
  if (activity.effects !== undefined && !Array.isArray(activity.effects)) errors.push(`${path}.effects deve ser uma lista.`);
  validateUses(activity.uses, `${path}.uses`, errors);
  validateAutomation(activity.automation, `${path}.automation`, errors);
  if (activity.automation && !/^[A-Za-z0-9]{16}$/.test(String(activity._id ?? ""))) {
    errors.push(`${path} com automation precisa de _id com exatamente 16 caracteres alfanuméricos.`);
  }
}

function validateProgression(progression, path, errors, depth) {
  if (progression === undefined) return;
  if (!Array.isArray(progression)) {
    errors.push(`${path} deve ser uma lista.`);
    return;
  }

  progression.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isObject(entry)) {
      errors.push(`${entryPath} deve ser um objeto.`);
      return;
    }

    const level = Number(entry.level);
    if (!Number.isInteger(level) || level < 1 || level > 20) {
      errors.push(`${entryPath}.level deve ser um inteiro entre 1 e 20.`);
    }

    if (!Array.isArray(entry.grants)) {
      errors.push(`${entryPath}.grants deve ser uma lista.`);
      return;
    }

    entry.grants.forEach((grant, grantIndex) => {
      const grantPath = `${entryPath}.grants[${grantIndex}]`;
      if (!isObject(grant)) {
        errors.push(`${grantPath} deve ser um Item payload.`);
        return;
      }
      if (!grant.name || typeof grant.name !== "string") errors.push(`${grantPath}.name é obrigatório.`);
      if (!grant.type || typeof grant.type !== "string") errors.push(`${grantPath}.type é obrigatório.`);
      validateImgStrategy(grant.imgStrategy, `${grantPath}.imgStrategy`, errors);
      if (depth < 1) validateItemSemantic(grant.jarvis, `${grantPath}.jarvis`, errors, depth + 1);
      else if (grant.jarvis?.progression !== undefined) errors.push(`${grantPath}.jarvis.progression aninhada não é suportada.`);
    });
  });
}

function validateItemSemantic(jarvis, path, errors, depth = 0) {
  if (jarvis === undefined) return;

  if (!isObject(jarvis)) {
    errors.push(`${path} deve ser um objeto.`);
    return;
  }

  if (jarvis.description !== undefined && typeof jarvis.description !== "string") {
    errors.push(`${path}.description deve ser texto.`);
  }

  validateUses(jarvis.uses, `${path}.uses`, errors);

  if (jarvis.activities !== undefined && !Array.isArray(jarvis.activities)) {
    errors.push(`${path}.activities deve ser uma lista.`);
    return;
  }

  if (jarvis.spellcasting !== undefined && !isObject(jarvis.spellcasting)) {
    errors.push(`${path}.spellcasting deve ser um objeto.`);
  }
  if (jarvis.grants !== undefined) {
    if (jarvis.progression?.length) errors.push(`${path}: grants nativos e progression Jarvis não podem coexistir na mesma classe.`);
    if (!Array.isArray(jarvis.grants)) errors.push(`${path}.grants deve ser uma lista.`);
    else jarvis.grants.forEach((grant, index) => {
      const label = `${path}.grants[${index}]`;
      if (!isObject(grant) || !Number.isInteger(grant.level) || grant.level < 1 || grant.level > 20) {
        errors.push(`${label}.level deve ser inteiro entre 1 e 20.`);
      }
      if (!Array.isArray(grant?.uuids) || !grant.uuids.length || grant.uuids.some(uuid => typeof uuid !== "string" || !uuid.startsWith("Compendium."))) {
        errors.push(`${label}.uuids precisa de UUIDs de Items de compêndio.`);
      }
    });
  }

  validateProgression(jarvis.progression, `${path}.progression`, errors, depth);

  jarvis.activities?.forEach((activity, index) => validateActivity(activity, `${path}.activities[${index}]`, errors));
}

export function validateJarvisActorPayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new PayloadValidationError("Payload inválido: esperado um objeto JSON.");
  }

  if (payload.schemaVersion !== "9.0") {
    errors.push("schemaVersion deve ser exatamente '9.0'.");
  }

  if (!payload.actor || typeof payload.actor !== "object") {
    errors.push("actor é obrigatório e deve ser um objeto.");
  } else {
    if (!payload.actor.name || typeof payload.actor.name !== "string") {
      errors.push("actor.name é obrigatório.");
    }

    if (!payload.actor.type || typeof payload.actor.type !== "string") {
      errors.push("actor.type é obrigatório.");
    }

    if (payload.actor.system && typeof payload.actor.system !== "object") {
      errors.push("actor.system deve ser um objeto quando fornecido.");
    }

    validateImgStrategy(payload.actor.imgStrategy, "actor.imgStrategy", errors);
    validateActorSemantic(payload.actor.jarvis, "actor.jarvis", errors);
  }

  if (payload.items !== undefined && !Array.isArray(payload.items)) {
    errors.push("items deve ser uma lista quando fornecido.");
  }

  if (Array.isArray(payload.items)) {
    payload.items.forEach((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`items[${index}] deve ser um objeto.`);
        return;
      }

      if (!item.name || typeof item.name !== "string") {
        errors.push(`items[${index}].name é obrigatório.`);
      }

      if (!item.type || typeof item.type !== "string") {
        errors.push(`items[${index}].type é obrigatório.`);
      }

      validateImgStrategy(item.imgStrategy, `items[${index}].imgStrategy`, errors);
      validateItemSemantic(item.jarvis, `items[${index}].jarvis`, errors);
    });
  }

  if (payload.effects !== undefined && !Array.isArray(payload.effects)) {
    errors.push("effects deve ser uma lista quando fornecido.");
  } else if (Array.isArray(payload.effects)) {
    payload.effects.forEach((effect, index) => {
      if (!isObject(effect) || !effect.name) errors.push(`effects[${index}] precisa de nome e estrutura de efeito.`);
      if (effect?.changes !== undefined && !Array.isArray(effect.changes)) errors.push(`effects[${index}].changes deve ser uma lista.`);
    });
  }

  if (errors.length) {
    throw new PayloadValidationError("Jarvis Importer V9 recusou o payload.", errors);
  }

  return true;
}
