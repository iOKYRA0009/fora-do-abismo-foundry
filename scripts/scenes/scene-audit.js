import { inspectWallGeometry } from "./scene-geometry.js";

// A heuristic for GM review, not a simulation of the Foundry lighting engine.
const HIGH_DARKNESS = 0.7;

function contents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  return typeof collection.values === "function" ? Array.from(collection.values()) : [];
}

function numberOrNaN(value) {
  if (value === null || value === "" || typeof value === "boolean") return NaN;
  return Number(value);
}

function inDarknessRange(config, darkness) {
  const range = config?.darkness;
  if (!range) return true;
  const minimum = range.min === undefined ? 0 : numberOrNaN(range.min);
  const maximum = range.max === undefined ? 1 : numberOrNaN(range.max);
  return Number.isFinite(minimum) && Number.isFinite(maximum)
    && minimum <= darkness && darkness <= maximum;
}

function emitsLight(light, darkness, width, height) {
  if (light.hidden || light.config?.negative) return false;
  const x = numberOrNaN(light.x);
  const y = numberOrNaN(light.y);
  const dim = light.config?.dim === undefined ? 0 : numberOrNaN(light.config.dim);
  const bright = light.config?.bright === undefined ? 0 : numberOrNaN(light.config.bright);
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= 0 && x <= width && y >= 0 && y <= height
    && Number.isFinite(dim) && dim >= 0
    && Number.isFinite(bright) && bright >= 0
    && (dim > 0 || bright > 0)
    && inDarknessRange(light.config, darkness);
}

function auditLights(lights, scene, width, height, issues) {
  for (const [index, light] of lights.entries()) {
    const label = `Luz '${light.name ?? light.id ?? index + 1}'`;
    const config = light.config;
    if (!config) continue;

    for (const radius of ["dim", "bright"]) {
      if (config[radius] === undefined) continue;
      const value = numberOrNaN(config[radius]);
      if (!Number.isFinite(value) || value < 0) {
        issues.push({ severity: "error", category: "lighting",
          detail: `${label} tem raio ${radius} inválido.` });
      }
    }

    if (config.alpha !== undefined) {
      const alpha = numberOrNaN(config.alpha);
      if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
        issues.push({ severity: "error", category: "lighting",
          detail: `${label} tem intensidade de cor (alpha) inválida; use valor entre 0 e 1.` });
      }
    }
    if (config.luminosity !== undefined) {
      const luminosity = numberOrNaN(config.luminosity);
      if (!Number.isFinite(luminosity) || luminosity < 0) {
        issues.push({ severity: "error", category: "lighting",
          detail: `${label} tem luminosidade inválida; use valor não negativo.` });
      }
    }

    const dim = numberOrNaN(config.dim);
    const bright = numberOrNaN(config.bright);
    if (!light.hidden && dim === 0 && bright === 0) {
      issues.push({ severity: "warning", category: "lighting",
        detail: `${label} tem os dois raios em zero e não ilumina a cena.` });
    }
  }

  const darkness = numberOrNaN(scene.environment?.darknessLevel);
  if (!Number.isFinite(darkness) || darkness < HIGH_DARKNESS) return;

  for (const [index, light] of lights.entries()) {
    if (light.hidden && !light.config?.negative) {
      issues.push({ severity: "warning", category: "lighting",
        detail: `Luz '${light.name ?? light.id ?? index + 1}' está oculta em uma cena muito escura.` });
    }
  }

  if (scene.tokenVision === false) return;

  const globalLight = scene.environment?.globalLight;
  const hasGlobalLight = Boolean(globalLight?.enabled) && inDarknessRange(globalLight, darkness);
  const hasAmbientLight = lights.some(light => emitsLight(light, darkness, width, height));
  const hasTokenLight = contents(scene.tokens).some(token => {
    if (token.hidden) return false;
    const dim = numberOrNaN(token.light?.dim);
    const bright = numberOrNaN(token.light?.bright);
    return ((Number.isFinite(dim) && dim > 0) || (Number.isFinite(bright) && bright > 0))
      && inDarknessRange(token.light, darkness);
  });
  if (!hasGlobalLight && !hasAmbientLight && !hasTokenLight) {
    issues.push({ severity: "warning", category: "lighting",
      detail: "Cena muito escura sem fonte de luz ativa; confira visão dos Tokens e se a escuridão é intencional." });
  }
}

/** Inspect an existing Foundry Scene without selecting tokens or writing documents. */
export function auditScene(scene) {
  if (!scene || scene.documentName !== "Scene") throw new Error("Auditoria: informe uma Scene válida.");
  const gridSize = Number(scene.grid?.size);
  const width = Number(scene.width);
  const height = Number(scene.height);
  if (!Number.isFinite(gridSize) || gridSize <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("Auditoria: dimensões ou grade da Scene inválidas.");
  }
  const columns = width / gridSize;
  const rows = height / gridSize;
  const issues = [];
  const walls = contents(scene.walls);
  const lights = contents(scene.lights);
  const sounds = contents(scene.sounds);
  const tokens = contents(scene.tokens);
  const normalizedWalls = walls.map(wall => ({
    a: [Number(wall.c?.[0]) / gridSize, Number(wall.c?.[1]) / gridSize],
    b: [Number(wall.c?.[2]) / gridSize, Number(wall.c?.[3]) / gridSize],
    type: Number(wall.door) ? "door" : "wall"
  }));
  normalizedWalls.forEach((wall, index) => {
    if (![...wall.a, ...wall.b].every(Number.isFinite)) {
      issues.push({ severity: "error", category: "wall", detail: `Parede ${index + 1} tem coordenadas inválidas.` });
    }
  });
  const geometry = inspectWallGeometry(normalizedWalls, columns, rows);
  issues.push(...geometry.errors.map(detail => ({ severity: "error", category: "wall", detail })));
  issues.push(...geometry.warnings.map(detail => ({ severity: "warning", category: "wall", detail })));
  const outside = (document, kind) => {
    const x = Number(document.x);
    const y = Number(document.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > width || y > height) {
      issues.push({ severity: "warning", category: kind,
        detail: `${kind} '${document.name ?? document.id ?? "sem nome"}' está fora da área do mapa.` });
    }
  };
  lights.forEach(light => outside(light, "Luz"));
  sounds.forEach(sound => outside(sound, "Som"));
  tokens.forEach(token => outside(token, "Token"));
  auditLights(lights, scene, width, height, issues);
  if (scene.tokenVision !== false && tokens.length && !tokens.some(token => token.sight?.enabled)) {
    issues.push({ severity: "warning", category: "vision",
      detail: "Nenhum Token na cena tem visão habilitada; confira com um Token de jogador." });
  }
  return {
    sceneId: scene.id, name: scene.name, mode: "read-only",
    size: { columns, rows, gridSize },
    counts: { walls: walls.length, doors: normalizedWalls.filter(wall => wall.type === "door").length,
      lights: lights.length, sounds: sounds.length, tokens: tokens.length },
    issues,
    ok: !issues.some(issue => issue.severity === "error")
  };
}
