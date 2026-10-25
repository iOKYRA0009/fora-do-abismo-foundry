import test from "node:test";
import assert from "node:assert/strict";
import { suggestRasterWalls } from "../scripts/scenes/raster-wall-assist.js";
import { applyLightingPreset, lightFromPreset, listLightingPresets } from "../scripts/scenes/lighting-presets.js";
import { validateSceneBlueprint } from "../scripts/scenes/scene-blueprint-validator.js";

function image(width, height, paint = () => false) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const color = paint(x, y) ? 0 : 255;
    const offset = (y * width + x) * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = color;
    data[offset + 3] = 255;
  }
  return { data, width, height };
}

test("raster assistant suggests and merges a strong grid-aligned wall", () => {
  const sample = image(300, 300, (x, y) => Math.abs(x - 100) <= 2 && y < 200);
  const result = suggestRasterWalls(sample, 100);
  assert.equal(result.columns, 3);
  assert.equal(result.rows, 3);
  assert.deepEqual(result.walls.map(wall => [wall.a, wall.b]), [[ [1, 0], [1, 2] ]]);
  assert.match(result.warnings[0], /sugestões/);
});

test("raster assistant does not hallucinate walls on a uniform dark image", () => {
  const sample = image(200, 200, () => true);
  assert.equal(suggestRasterWalls(sample, 100).walls.length, 0);
});

test("raster assistant refuses uncalibrated image dimensions", () => {
  assert.throws(() => suggestRasterWalls(image(255, 200), 100), /ajuste os pixels/);
});

test("lighting presets preserve original data and use native scene environment", () => {
  const payload = { schemaVersion: "1.0", scene: { name: "Teste", columns: 4, rows: 4 },
    walls: [], lights: [{ x: 1, y: 1, dim: 20, color: "#ffffff" }] };
  const result = applyLightingPreset(payload, "cavern");
  assert.equal(result.scene.environment.darknessLevel, 0.88);
  assert.equal(result.lights[0].color, "#ffffff");
  assert.equal(payload.scene.environment, undefined);
  assert.equal(validateSceneBlueprint(result), true);
  assert.equal(listLightingPresets().length, 4);
  assert.equal(lightFromPreset("torch", 2, 3).animation.type, "torch");
});
