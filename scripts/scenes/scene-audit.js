import { inspectWallGeometry } from "./scene-geometry.js";

function contents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  return typeof collection.values === "function" ? Array.from(collection.values()) : [];
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
