// The Scene Builder interprets positions in grid cells and rounds each position
// to a pixel. Keep this preview in the same coordinate system; do not shift a
// token to the centre of a cell or scale Foundry sound/light radii a second time.
function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function pixel(value, gridSize) {
  return Math.round(value * gridSize);
}

function validPoint(entry, path, columns, rows, gridSize, errors) {
  if (!entry || !isNumber(entry.x) || !isNumber(entry.y)) {
    errors.push(`${path}.x/y devem ser números finitos em células da grade.`);
    return null;
  }
  if (entry.x < 0 || entry.x >= columns || entry.y < 0 || entry.y >= rows) {
    errors.push(`${path}.x/y estão fora da área ${columns}×${rows} células.`);
    return null;
  }
  return { x: pixel(entry.x, gridSize), y: pixel(entry.y, gridSize) };
}

function validWallPoint(value, path, columns, rows, gridSize, errors) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(isNumber)) {
    errors.push(`${path} deve ser [x, y] com números finitos em células da grade.`);
    return null;
  }
  const [x, y] = value;
  if (x < 0 || x > columns || y < 0 || y > rows) {
    errors.push(`${path} está fora da área ${columns}×${rows} células.`);
    return null;
  }
  return [pixel(x, gridSize), pixel(y, gridSize)];
}

/**
 * Dry-run of the Scene Builder's coordinate conversion for Executor packages.
 * Coordinates are grid cells from the top-left. Wall endpoints may touch the
 * outer edge. Token x/y are the token's top-left, not its centre. Light/sound
 * radii are Foundry distance units and therefore remain unchanged.
 */
export function inspectExecutorSceneGeometry(blueprint) {
  const errors = [];
  const warnings = [];
  const positions = { walls: [], lights: [], sounds: [], tokens: [] };
  const scene = blueprint?.scene;
  const columns = scene?.columns;
  const rows = scene?.rows;
  const gridSize = scene?.grid?.size ?? 100;
  if (!Number.isInteger(columns) || columns <= 0 || !Number.isInteger(rows) || rows <= 0
    || !Number.isInteger(gridSize) || gridSize <= 0) {
    return { errors: ["scene.columns, scene.rows e scene.grid.size devem definir uma grade válida."],
      warnings, positions, pixels: null };
  }
  for (const key of ["walls", "lights", "sounds", "tokens"]) {
    if (blueprint[key] !== undefined && !Array.isArray(blueprint[key])) {
      errors.push(`${key} deve ser uma lista.`);
    }
  }
  if (scene.visualMode && !scene.backgroundSrc && !scene.backgroundFallbackSrc && !scene.imageTiles?.length) {
    warnings.push("Cena visual sem imagem de fundo; confira o asset do mapa.");
  }

  for (const [index, wall] of (Array.isArray(blueprint?.walls) ? blueprint.walls : []).entries()) {
    const a = validWallPoint(wall?.a, `walls[${index}].a`, columns, rows, gridSize, errors);
    const b = validWallPoint(wall?.b, `walls[${index}].b`, columns, rows, gridSize, errors);
    if (!a || !b) continue;
    if (a[0] === b[0] && a[1] === b[1]) {
      errors.push(`walls[${index}] colapsa em um único pixel após a conversão.`);
      continue;
    }
    positions.walls.push({ index, type: wall.type ?? "wall", a, b });
  }

  for (const [index, light] of (Array.isArray(blueprint?.lights) ? blueprint.lights : []).entries()) {
    const point = validPoint(light, `lights[${index}]`, columns, rows, gridSize, errors);
    if (!isNumber(light?.dim) || light.dim < 0) errors.push(`lights[${index}].dim deve ser >= 0.`);
    if (light?.bright !== undefined && (!isNumber(light.bright) || light.bright < 0)) {
      errors.push(`lights[${index}].bright deve ser >= 0.`);
    }
    if (point) positions.lights.push({ index, ...point });
  }
  for (const [index, sound] of (Array.isArray(blueprint?.sounds) ? blueprint.sounds : []).entries()) {
    const point = validPoint(sound, `sounds[${index}]`, columns, rows, gridSize, errors);
    if (!isNumber(sound?.radius) || sound.radius <= 0) errors.push(`sounds[${index}].radius deve ser > 0.`);
    if (sound?.volume !== undefined && (!isNumber(sound.volume) || sound.volume < 0 || sound.volume > 1)) {
      errors.push(`sounds[${index}].volume deve estar entre 0 e 1.`);
    }
    if (point) positions.sounds.push({ index, ...point, radius: sound.radius });
  }

  const occupied = new Map();
  for (const [index, token] of (Array.isArray(blueprint?.tokens) ? blueprint.tokens : []).entries()) {
    const point = validPoint(token, `tokens[${index}]`, columns, rows, gridSize, errors);
    for (const dimension of ["width", "height"]) {
      if (token?.[dimension] !== undefined && (!isNumber(token[dimension]) || token[dimension] <= 0)) {
        errors.push(`tokens[${index}].${dimension} deve ser maior que zero.`);
      }
    }
    if (!point) continue;
    if ((isNumber(token.width) && token.x + token.width > columns)
      || (isNumber(token.height) && token.y + token.height > rows)) {
      errors.push(`tokens[${index}] ultrapassa os limites da cena.`);
    }
    if ((token.width === undefined && token.x > columns - 1)
      || (token.height === undefined && token.y > rows - 1)) {
      warnings.push(`tokens[${index}] está junto à borda; confirme as dimensões do token do Actor.`);
    }
    const key = `${point.x},${point.y}`;
    if (occupied.has(key)) {
      warnings.push(`tokens[${occupied.get(key)}] e tokens[${index}] usam a mesma posição em pixels.`);
    } else occupied.set(key, index);
    positions.tokens.push({ index, actor: token.actor ?? token.actorId ?? token.actorUuid ?? null,
      ...point, width: token.width ?? null, height: token.height ?? null });
  }

  return { errors, warnings, positions,
    pixels: { width: columns * gridSize, height: rows * gridSize, gridSize } };
}
