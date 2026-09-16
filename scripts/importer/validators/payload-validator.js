export class PayloadValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "PayloadValidationError";
    this.details = details;
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
  }

  if (payload.items !== undefined && !Array.isArray(payload.items)) {
    errors.push("items deve ser uma lista quando fornecido.");
  }

  if (payload.effects !== undefined && !Array.isArray(payload.effects)) {
    errors.push("effects deve ser uma lista quando fornecido.");
  }

  if (errors.length) {
    throw new PayloadValidationError("Jarvis Importer V9 recusou o payload.", errors);
  }

  return true;
}
