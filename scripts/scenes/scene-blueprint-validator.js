export class SceneBlueprintValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "SceneBlueprintValidationError";
    this.details = details;
  }
}

export const SCENE_BLUEPRINT_VERSION = "1.0";

const WALL_TYPES = new Set(["wall", "door", "secret"]);
const DOOR_STATES = new Set(["closed", "open", "locked"]);
const DISPOSITIONS = new Set(["friendly", "neutral", "hostile", "secret"]);
const DRAWING_KINDS = new Set(["floor", "zone", "gm"]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function isPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0;
}

function validatePoint(point, path, errors) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(isFiniteNumber)) {
    errors.push(`${path} deve ser [x, y] com números finitos.`);
  }
}

function validateRect(entry, path, errors) {
  for (const key of ["x", "y", "w", "h"]) {
    if (!isFiniteNumber(entry?.[key])) errors.push(`${path}.${key} deve ser número.`);
  }
  if (isFiniteNumber(entry?.w) && Number(entry.w) <= 0) errors.push(`${path}.w deve ser maior que 0.`);
  if (isFiniteNumber(entry?.h) && Number(entry.h) <= 0) errors.push(`${path}.h deve ser maior que 0.`);
}

export function validateSceneBlueprint(payload) {
  const errors = [];

  if (!isObject(payload)) {
    throw new SceneBlueprintValidationError("Blueprint de Scene inválido: esperado um objeto JSON.");
  }

  if (payload.schemaVersion !== SCENE_BLUEPRINT_VERSION) {
    errors.push(`schemaVersion deve ser exatamente '${SCENE_BLUEPRINT_VERSION}'.`);
  }

  if (!isObject(payload.scene)) {
    errors.push("scene é obrigatório e deve ser um objeto.");
  } else {
    if (!payload.scene.name || typeof payload.scene.name !== "string") errors.push("scene.name é obrigatório.");
    if (!isPositiveInteger(payload.scene.columns)) errors.push("scene.columns deve ser inteiro positivo.");
    if (!isPositiveInteger(payload.scene.rows)) errors.push("scene.rows deve ser inteiro positivo.");

    const size = Number(payload.scene.grid?.size ?? 100);
    if (!Number.isInteger(size) || size < 50) errors.push("scene.grid.size deve ser inteiro >= 50 px.");

    const distance = Number(payload.scene.grid?.distance ?? 5);
    if (!Number.isFinite(distance) || distance <= 0) errors.push("scene.grid.distance deve ser maior que 0.");
  }

  if (payload.walls !== undefined && !Array.isArray(payload.walls)) {
    errors.push("walls deve ser uma lista.");
  }
  payload.walls?.forEach((wall, index) => {
    const path = `walls[${index}]`;
    if (!isObject(wall)) {
      errors.push(`${path} deve ser objeto.`);
      return;
    }
    validatePoint(wall.a, `${path}.a`, errors);
    validatePoint(wall.b, `${path}.b`, errors);
    if (wall.type !== undefined && !WALL_TYPES.has(wall.type)) {
      errors.push(`${path}.type deve ser wall, door ou secret.`);
    }
    if (wall.state !== undefined && !DOOR_STATES.has(wall.state)) {
      errors.push(`${path}.state deve ser closed, open ou locked.`);
    }
  });

  if (payload.drawings !== undefined && !Array.isArray(payload.drawings)) {
    errors.push("drawings deve ser uma lista.");
  }
  payload.drawings?.forEach((drawing, index) => {
    const path = `drawings[${index}]`;
    if (!isObject(drawing)) {
      errors.push(`${path} deve ser objeto.`);
      return;
    }
    validateRect(drawing, path, errors);
    if (drawing.kind !== undefined && !DRAWING_KINDS.has(drawing.kind)) {
      errors.push(`${path}.kind deve ser floor, zone ou gm.`);
    }
  });

  if (payload.lights !== undefined && !Array.isArray(payload.lights)) {
    errors.push("lights deve ser uma lista.");
  }
  payload.lights?.forEach((light, index) => {
    const path = `lights[${index}]`;
    if (!isObject(light)) {
      errors.push(`${path} deve ser objeto.`);
      return;
    }
    if (!isFiniteNumber(light.x) || !isFiniteNumber(light.y)) errors.push(`${path}.x/y devem ser números.`);
    if (!isFiniteNumber(light.dim) || Number(light.dim) < 0) errors.push(`${path}.dim deve ser número >= 0.`);
    if (light.bright !== undefined && (!isFiniteNumber(light.bright) || Number(light.bright) < 0)) {
      errors.push(`${path}.bright deve ser número >= 0.`);
    }
  });

  if (payload.tokens !== undefined && !Array.isArray(payload.tokens)) {
    errors.push("tokens deve ser uma lista.");
  }
  payload.tokens?.forEach((token, index) => {
    const path = `tokens[${index}]`;
    if (!isObject(token)) {
      errors.push(`${path} deve ser objeto.`);
      return;
    }
    if (!token.actor && !token.actorId && !token.actorUuid) {
      errors.push(`${path} precisa de actor, actorId ou actorUuid.`);
    }
    if (!isFiniteNumber(token.x) || !isFiniteNumber(token.y)) errors.push(`${path}.x/y devem ser números.`);
    if (token.disposition !== undefined && !DISPOSITIONS.has(token.disposition)) {
      errors.push(`${path}.disposition deve ser friendly, neutral, hostile ou secret.`);
    }
  });

  if (errors.length) {
    throw new SceneBlueprintValidationError("Jarvis Scene Builder recusou o blueprint.", errors);
  }
  return true;
}
