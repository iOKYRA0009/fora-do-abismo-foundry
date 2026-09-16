export class PayloadValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "PayloadValidationError";
    this.details = details;
  }
}

const IMAGE_SOURCES = new Set(["foundry", "generate", "custom"]);
const ACTIVITY_TYPES = new Set([
  "attack", "save", "utility", "heal", "check", "damage", "summon", "enchant", "cast", "forward"
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

  if (jarvis.uses !== undefined && !isObject(jarvis.uses)) {
    errors.push(`${path}.uses deve ser um objeto.`);
  }

  if (jarvis.activities !== undefined && !Array.isArray(jarvis.activities)) {
    errors.push(`${path}.activities deve ser uma lista.`);
    return;
  }

  if (jarvis.spellcasting !== undefined && !isObject(jarvis.spellcasting)) {
    errors.push(`${path}.spellcasting deve ser um objeto.`);
  }

  validateProgression(jarvis.progression, `${path}.progression`, errors, depth);

  jarvis.activities?.forEach((activity, index) => {
    const activityPath = `${path}.activities[${index}]`;
    if (!isObject(activity)) {
      errors.push(`${activityPath} deve ser um objeto.`);
      return;
    }

    if (activity.type !== undefined && !ACTIVITY_TYPES.has(activity.type)) {
      errors.push(`${activityPath}.type '${activity.type}' ainda não é suportado pelo V9.`);
    }

    if (activity.consumption?.targets !== undefined && !Array.isArray(activity.consumption.targets)) {
      errors.push(`${activityPath}.consumption.targets deve ser uma lista.`);
    }

    validateAutomation(activity.automation, `${activityPath}.automation`, errors);
    if (activity.automation && !/^[A-Za-z0-9]{16}$/.test(String(activity._id ?? ""))) {
      errors.push(`${activityPath} com automation precisa de _id com exatamente 16 caracteres alfanuméricos.`);
    }
  });
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
  }

  if (errors.length) {
    throw new PayloadValidationError("Jarvis Importer V9 recusou o payload.", errors);
  }

  return true;
}
