import test from "node:test";
import assert from "node:assert/strict";
import { inspectExecutorSceneGeometry } from "../scripts/scenes/package/executor-scene-geometry.js";

function blueprint() {
  return {
    schemaVersion: "1.0", scene: { name: "Caverna", columns: 10, rows: 8, grid: { size: 100 } },
    walls: [{ a: [0.5, 1], b: [2.5, 1], type: "door" }],
    lights: [{ x: 3.25, y: 2.5, dim: 15 }],
    sounds: [{ x: 4, y: 2, radius: 15, path: "sounds/cave.ogg" }],
    tokens: [{ actor: "Sentinela", x: 6, y: 4, width: 1, height: 1 }]
  };
}

test("Executor scene geometry previews exactly the pixels used by Scene Builder", () => {
  const source = blueprint();
  const original = structuredClone(source);
  const result = inspectExecutorSceneGeometry(source);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.pixels, { width: 1000, height: 800, gridSize: 100 });
  assert.deepEqual(result.positions.walls[0].a, [50, 100]);
  assert.deepEqual(result.positions.walls[0].b, [250, 100]);
  assert.deepEqual(result.positions.lights[0], { index: 0, x: 325, y: 250 });
  assert.deepEqual(result.positions.sounds[0], { index: 0, x: 400, y: 200, radius: 15 });
  assert.deepEqual(result.positions.tokens[0], { index: 0, actor: "Sentinela", x: 600,
    y: 400, width: 1, height: 1 });
  assert.deepEqual(source, original, "prévia não altera o pacote");
});

test("Executor scene geometry rejects missing, null and out-of-map coordinates", () => {
  const source = blueprint();
  source.walls[0].a = [null, 1];
  source.lights[0].x = "";
  source.sounds[0].y = 9;
  source.tokens[0].y = null;
  const result = inspectExecutorSceneGeometry(source);
  assert.equal(result.errors.length, 4);
  assert.match(result.errors.join(" "), /walls\[0\]\.a/);
  assert.match(result.errors.join(" "), /lights\[0\]\.x\/y/);
  assert.match(result.errors.join(" "), /sounds\[0\]\.x\/y/);
  assert.match(result.errors.join(" "), /tokens\[0\]\.x\/y/);
});

test("Executor scene geometry catches rounded-away walls and oversized tokens", () => {
  const source = blueprint();
  source.walls[0].b = [0.5001, 1];
  source.tokens[0] = { actor: "Sentinela", x: 9.5, y: 7, width: 1, height: 2 };
  const result = inspectExecutorSceneGeometry(source);
  assert.match(result.errors.join(" "), /colapsa/);
  assert.match(result.errors.join(" "), /ultrapassa/);
});

test("Executor scene geometry warns about tokens sharing a pixel without moving them", () => {
  const source = blueprint();
  source.tokens.push({ actor: "Eco", x: 6.0001, y: 4.0001 });
  const result = inspectExecutorSceneGeometry(source);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
  assert.deepEqual(result.positions.tokens.map(token => [token.x, token.y]), [[600, 400], [600, 400]]);
});

test("Executor scene geometry permits outer wall edge but rejects an off-canvas token", () => {
  const source = blueprint();
  source.walls[0].b = [10, 8];
  source.tokens[0].x = 10;
  const result = inspectExecutorSceneGeometry(source);
  assert.equal(result.positions.walls[0].b[0], 1000);
  assert.match(result.errors.join(" "), /tokens\[0\]\.x\/y/);
});

test("Executor scene geometry reports malformed lists and missing light/sound measures", () => {
  const source = blueprint();
  source.walls = {};
  source.lights[0].dim = null;
  source.sounds[0].radius = null;
  const result = inspectExecutorSceneGeometry(source);
  assert.match(result.errors.join(" "), /walls deve ser uma lista/);
  assert.match(result.errors.join(" "), /lights\[0\]\.dim/);
  assert.match(result.errors.join(" "), /sounds\[0\]\.radius/);
});
