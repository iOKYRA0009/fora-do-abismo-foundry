import test from "node:test";
import assert from "node:assert/strict";
import { JarvisScenePackageBuilder } from "../scripts/scenes/package/scene-package-builder.js";

const builder = new JarvisScenePackageBuilder({ builder: {} });

function payload() {
  return {
    schemaVersion: "1.0",
    scene: { name: "Mapa", columns: 10, rows: 8, grid: { size: 100 } },
    walls: [{ a: [0, 0], b: [1, 0], type: "door" }],
    lights: [{ x: 2, y: 3, dim: 15 }],
    sounds: [{ x: 4, y: 2, path: "sounds/eco.ogg", radius: 15 }],
    actors: [{ actor: "Sentinela", x: 5, y: 3, width: 1, height: 1 }],
    regions: [{ rect: [1, 1, 2, 2] }]
  };
}

test("Scene Package accepts explicit positions within the grid", () => {
  assert.equal(builder.validate(payload()), true);
});

test("Scene Package refuses null, missing and out-of-map positions before building", () => {
  const source = payload();
  source.walls[0].a = [null, 0];
  source.lights[0].x = undefined;
  source.sounds[0].y = 9;
  source.actors[0].x = "";
  source.regions[0].rect = [9, 7, 2, 2];
  assert.throws(() => builder.validate(source), error => {
    assert.match(error.details.join(" "), /walls\[0\]\.a/);
    assert.match(error.details.join(" "), /lights\[0\]\.x\/y/);
    assert.match(error.details.join(" "), /sounds\[0\]/);
    assert.match(error.details.join(" "), /actors\[0\]\.x\/y/);
    assert.match(error.details.join(" "), /regions\[0\]\.rect fora da cena/);
    return true;
  });
});

test("Scene Package reports malformed collections instead of throwing a raw TypeError", () => {
  const source = payload();
  source.walls = {};
  source.lights = {};
  source.sounds = {};
  source.actors = {};
  source.regions = {};
  assert.throws(() => builder.validate(source), error => {
    assert.match(error.details.join(" "), /walls deve ser lista/);
    assert.match(error.details.join(" "), /regions deve ser lista/);
    return true;
  });
});

test("Scene Package blocks conflicting visual sources", () => {
  const source = payload();
  source.visual = { backgroundSrc: "maps/existing.webp", backgroundBase64: "AA==" };
  assert.throws(() => builder.validate(source), error => {
    assert.match(error.details.join(" "), /backgroundSrc ou backgroundBase64/);
    return true;
  });
});

test("Scene Package preserves legacy numeric strings by normalizing before pixel preview", async () => {
  globalThis.foundry = { utils: { deepClone: structuredClone } };
  const source = payload();
  source.walls[0].a = ["0", "0"];
  source.lights[0].x = "2";
  source.sounds[0].radius = "15";
  source.actors = [];
  const result = await builder.preview(source);
  assert.deepEqual(result.positions.walls[0].a, [0, 0]);
  assert.equal(result.positions.lights[0].x, 200);
  assert.equal(result.positions.sounds[0].radius, 15);
});
