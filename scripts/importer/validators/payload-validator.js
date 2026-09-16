export class PayloadValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "PayloadValidationError";
    this.details = details;
  }
}

const IMAGE_SOURCES = new Set(["foundry", "generate", "custom"]);

function validateImgStrategy(strategy, path, errors) {
  if (strategy === undefined) return;

  if (!strategy || typeof strategy !== "object" || Array.isArray(strategy)) {
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
      validateImgStrategy(item.imgStrategy, `items[${index}].imgStrategy`, errors);
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
