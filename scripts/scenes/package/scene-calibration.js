/**
 * Map-pixel placement for Jarvis Executor packages.
 *
 * An authored footprint is geometry, not image recognition: the creator marks
 * building corners once in the package and Jarvis derives walls, doors and
 * lights at the matching pixels. Without an annotated footprint the engine
 * MUST NOT guess where opaque walls are in an arbitrary painted map.
 */
const isNumber = n => typeof n === "number" && Number.isFinite(n);
const point = p => Array.isArray(p) && p.length === 2 && p.every(isNumber);
const clone = value => structuredClone(value);

function fail(message) { throw new Error(`Jarvis Mapa: ${message}`); }

export function calibrateExecutorScene(input) {
  const result = clone(input);
  const scene = result.scene ?? {};
  const image = scene.imagePlacement;
  if (!image && !result.structures?.length) return { blueprint: result, calibration: null };
  if (!image || !["width", "height"].every(k => isNumber(image[k]) && image[k] > 0)) {
    fail("scene.imagePlacement exige width e height positivos da imagem original.");
  }
  const gridSize = Number(scene.grid?.size ?? 100);
  const columns = Number(scene.columns), rows = Number(scene.rows);
  if (![gridSize, columns, rows].every(n => Number.isFinite(n) && n > 0)) {
    fail("a cena precisa de grade, colunas e linhas válidas.");
  }
  const width = columns * gridSize, height = rows * gridSize;
  const ratioError = Math.abs(width / height - image.width / image.height) / (image.width / image.height);
  if (ratioError > 0.02) {
    fail(`a proporção do mapa (${image.width}×${image.height}) difere da cena (${width}×${height}); ajuste a grade ou o tamanho antes da importação.`);
  }
  const scaleX = columns / image.width, scaleY = rows / image.height;
  const within = ([x, y]) => x >= 0 && y >= 0 && x <= image.width && y <= image.height;
  const toGrid = p => p.map((n, i) => Number((n * (i === 0 ? scaleX : scaleY)).toFixed(6)));
  const convertXY = (entry, label) => {
    if (!isNumber(entry?.x) || !isNumber(entry?.y) || !within([entry.x, entry.y])) {
      fail(`${label} está fora da imagem ou não possui coordenadas x/y em pixels.`);
    }
    const [x, y] = toGrid([entry.x, entry.y]);
    return { ...entry, x, y };
  };
  const convertWall = (wall, label) => {
    if (!point(wall?.a) || !point(wall?.b) || !within(wall.a) || !within(wall.b)) {
      fail(`${label} possui endpoints inválidos em pixels.`);
    }
    return { ...wall, a: toGrid(wall.a), b: toGrid(wall.b) };
  };
  const walls = [...(result.walls ?? [])];
  const structures = result.structures ?? [];
  if (!Array.isArray(structures) || structures.length > 40) fail("structures deve ter até 40 construções.");
  for (const [index, structure] of structures.entries()) {
    let corners = structure?.outline;
    if (structure?.rect) {
      const rect = structure.rect;
      if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(isNumber) || rect[2] <= 0 || rect[3] <= 0) {
        fail(`structures[${index}].rect deve ser [x, y, largura, altura] em pixels.`);
      }
      const [x, y, w, h] = rect;
      corners = [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
    }
    if (!Array.isArray(corners) || corners.length < 3 || corners.length > 24 || !corners.every(point)
      || corners.some(p => !within(p))) {
      fail(`structures[${index}] precisa de um contorno com 3 a 24 cantos dentro da imagem.`);
    }
    const doors = structure.doors ?? [];
    if (!Array.isArray(doors) || doors.length > corners.length) fail(`structures[${index}].doors inválido.`);
    const assigned = new Set();
    for (const door of doors) {
      if (!Number.isInteger(door.edge) || door.edge < 0 || door.edge >= corners.length
        || assigned.has(door.edge) || !(door.center > 0 && door.center < 1)
        || !isNumber(door.width) || door.width <= 0) {
        fail(`structures[${index}]: porta exige edge único, center entre 0 e 1 e width em pixels.`);
      }
      assigned.add(door.edge);
    }
    for (let edge = 0; edge < corners.length; edge++) {
      const start = corners[edge], end = corners[(edge + 1) % corners.length];
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      if (length < 2) fail(`structures[${index}] contém uma parede de tamanho insuficiente.`);
      const door = doors.find(x => x.edge === edge);
      if (!door) { walls.push({ a: start, b: end, type: "wall" }); continue; }
      const half = door.width / (2 * length);
      if (door.center - half <= 0.02 || door.center + half >= 0.98) {
        fail(`structures[${index}]: porta não cabe na parede do edge ${edge}.`);
      }
      const lerp = t => [start[0] + (end[0]-start[0])*t, start[1] + (end[1]-start[1])*t];
      const left = lerp(door.center - half), right = lerp(door.center + half);
      walls.push({ a: start, b: left, type: "wall" });
      walls.push({ a: left, b: right, type: door.secret ? "secret" : "door", state: door.state ?? "closed" });
      walls.push({ a: right, b: end, type: "wall" });
    }
    if (structure.light) {
      let light = structure.light;
      if (light === true || light.position === "center") {
        const x = corners.reduce((sum, p) => sum + p[0], 0) / corners.length;
        const y = corners.reduce((sum, p) => sum + p[1], 0) / corners.length;
        light = { ...(light === true ? {} : light), x, y };
      }
      if (!isNumber(light?.x) || !isNumber(light?.y)) fail(`structures[${index}].light exige posição.`);
      (result.lights ??= []).push({ name: structure.name ? `Luz - ${structure.name}` : `Luz da construção ${index+1}`,
        bright: 10, dim: 20, color: "#f6ae64", ...light });
    }
  }
  result.walls = walls.map((wall, index) => convertWall(wall, `walls[${index}]`));
  for (const key of ["lights", "sounds", "tokens"]) {
    if (result[key] !== undefined && !Array.isArray(result[key])) fail(`${key} deve ser uma lista.`);
    if (result[key]) result[key] = result[key].map((v, i) => convertXY(v, `${key}[${i}]`));
  }
  if (scene.visionPreset !== undefined) {
    if (scene.visionPreset !== "limited") fail("scene.visionPreset aceita apenas 'limited'.");
    scene.tokenVision = true;
    scene.environment ??= {};
    scene.environment.globalLight ??= { enabled: false };
    // This changes only newly created tokens in packages opting into limited vision.
    result.tokens = (result.tokens ?? []).map(token => ({
      ...token,
      vision: token.vision ?? { enabled: true, range: 60 }
    }));
  }
  delete result.structures;
  // Source metadata is diagnostic, not a Foundry Scene document property.
  delete result.scene.imagePlacement;
  return { blueprint: result, calibration: {
    mode: "image-pixels", source: { width: image.width, height: image.height },
    target: { width, height }, structures: structures.length, walls: result.walls.length,
    lights: result.lights?.length ?? 0
  } };
}
