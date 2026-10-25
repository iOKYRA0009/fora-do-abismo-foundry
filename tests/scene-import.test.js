import test from "node:test";
import assert from "node:assert/strict";
import { convertUniversalVtt } from "../scripts/scenes/importers/universal-vtt.js";
import { inspectWallGeometry } from "../scripts/scenes/scene-geometry.js";
import { validateSceneBlueprint } from "../scripts/scenes/scene-blueprint-validator.js";

const sample = {
  format: 0.3,
  resolution: {
    map_origin: { x: 2, y: 1 },
    map_size: { x: 10, y: 8 },
    pixels_per_grid: 100
  },
  line_of_sight: [[{ x: 2, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 3 }]],
  portals: [{ bounds: [{ x: 5, y: 3 }, { x: 5, y: 4 }], closed: true }],
  lights: [{ position: { x: 4, y: 2 }, range: 3, intensity: 1, color: "ffeccd8b" }],
  image: "iVBORw0KGgoAAAAN"
};

test("UVTT converts cropped coordinates, doors and lights to Scene Package", () => {
  const { payload, warnings } = convertUniversalVtt(sample, { name: "Forja teste" });
  assert.equal(payload.scene.columns, 10);
  assert.deepEqual(payload.walls[0].a, [0, 0]);
  assert.deepEqual(payload.walls[1].b, [3, 2]);
  assert.deepEqual(payload.walls[2].a, [3, 2]);
  assert.equal(payload.walls[2].type, "door");
  assert.equal(payload.lights[0].dim, 15);
  assert.equal(payload.lights[0].color, "#eccd8b");
  assert.equal(warnings.length, 0);
  assert.equal(validateSceneBlueprint({
    schemaVersion: "1.0", scene: payload.scene,
    walls: payload.walls, lights: payload.lights
  }), true);
});

test("UVTT keeps ambiguous open portals and object blockers visible in warnings", () => {
  const { payload, warnings } = convertUniversalVtt({
    ...sample,
    portals: [{ bounds: [{ x: 5, y: 3 }, { x: 5, y: 4 }], closed: false }],
    objects_line_of_sight: [[{ x: 2, y: 2 }, { x: 3, y: 2 }]],
    environment: { baked_lighting: true }
  });
  assert.equal(payload.walls.length, 3);
  assert.equal(payload.walls[2].state, "open");
  assert.equal(payload.lights[0].hidden, true);
  assert.match(warnings.join(" "), /janela/);
  assert.match(warnings.join(" "), /Obstáculos/);
});

test("UVTT preserves a WEBP image data URI MIME type", () => {
  const { payload } = convertUniversalVtt({ ...sample, image: "data:image/webp;base64,QUJD" });
  assert.equal(payload.visual.backgroundBase64, "QUJD");
  assert.equal(payload.visual.mimeType, "image/webp");
  assert.match(payload.visual.fileName, /\.webp$/);
});

test("UVTT rejects an unsupported embedded image MIME type", () => {
  assert.throws(() => convertUniversalVtt({ ...sample, image: "data:image/gif;base64,QUJD" }), /PNG, WEBP ou JPEG/);
});

test("wall validation catches zero-length and out-of-bounds geometry", () => {
  const { errors, warnings } = inspectWallGeometry([
    { a: [0, 0], b: [0, 0] },
    { a: [0, 0], b: [11, 0] },
    { a: [1, 1], b: [2, 1] },
    { a: [2, 1], b: [1, 1], type: "door" }
  ], 10, 8);
  assert.equal(errors.length, 2);
  assert.equal(warnings.length, 1);
});
