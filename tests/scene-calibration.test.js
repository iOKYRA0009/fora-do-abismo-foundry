import test from "node:test";
import assert from "node:assert/strict";
import { calibrateExecutorScene } from "../scripts/scenes/package/scene-calibration.js";
import { inspectExecutorSceneGeometry } from "../scripts/scenes/package/executor-scene-geometry.js";

function input() {
  return {
    schemaVersion: "1.0",
    scene: {
      name: "Floresta de teste",
      columns: 25, rows: 20, grid: { size: 64 },
      imagePlacement: { width: 1600, height: 1280 },
      tokenVision: true, visionPreset: "limited"
    },
    structures: [{
      name: "Cabana",
      rect: [520, 240, 460, 440],
      doors: [{ edge: 2, center: 0.5, width: 70, state: "closed" }],
      light: { position: "center", bright: 10, dim: 20 }
    }],
    walls: [{ a: [10,20], b: [100,20], type: "wall" }],
    lights: [{ x: 620, y: 500, dim: 25, bright: 10 }],
    tokens: [{ actor: "Goblin", x: 1000, y: 700, width: 1, height: 1 }],
    sounds: [{ path: "wind.ogg", x: 100, y: 200, radius: 10 }]
  };
}

test("calibrate map pixels, automatic rectangular cabin, door, lantern and limited vision", () => {
  const source = input();
  const original = structuredClone(source);
  const { blueprint, calibration } = calibrateExecutorScene(source);
  assert.deepEqual(source, original, "source package must not mutate");
  assert.equal(calibration.mode, "image-pixels");
  assert.equal(calibration.structures, 1);
  assert.equal(blueprint.walls.length, 7, "one existing wall + four cabin edges with door splits");
  assert.equal(blueprint.walls.filter(w => w.type === "door").length, 1);
  assert.equal(blueprint.lights.length, 2);
  assert.equal(blueprint.lights[1].x, (520 + 980) / 2 / 64);
  assert.equal(blueprint.tokens[0].x, 1000 / 64);
  assert.equal(blueprint.tokens[0].y, 700 / 64);
  assert.equal(blueprint.tokens[0].vision.enabled, true);
  assert.equal(blueprint.tokens[0].vision.range, 60);
  assert.equal(blueprint.scene.tokenVision, true);
  assert.equal(blueprint.scene.environment.globalLight.enabled, false);
  assert.equal(blueprint.scene.imagePlacement, undefined);
  assert.equal(blueprint.structures, undefined);
  const geometry = inspectExecutorSceneGeometry(blueprint);
  assert.deepEqual(geometry.errors, []);
  assert.equal(geometry.positions.lights[0].x, 620);
  assert.equal(geometry.positions.tokens[0].x, 1000);
});

test("calibrator refuses inconsistent aspect ratio before any scene mutation", () => {
  const src = input();
  src.scene.columns = 18;
  assert.throws(() => calibrateExecutorScene(src), /proporção do mapa/);
});

test("calibrator validates footprint and door location instead of guessing", () => {
  const src = input();
  src.structures[0].doors[0].width = 900;
  assert.throws(() => calibrateExecutorScene(src), /porta não cabe/);
  src.structures[0].doors[0].width = 70;
  src.structures[0].rect[0] = -8;
  assert.throws(() => calibrateExecutorScene(src), /contorno/);
});

test("legacy scene blueprints remain unchanged when no image calibration is requested", () => {
  const src = { schemaVersion: "1.0", scene: { name:"Legacy", columns: 10, rows: 8 },
    walls:[{a:[1,1],b:[5,1]}], tokens:[{actor:"Goblin",x:5,y:3}] };
  const { blueprint, calibration } = calibrateExecutorScene(src);
  assert.deepEqual(blueprint,src);
  assert.equal(calibration,null);
});

test("explicit vision specification overrides limited preset defaults", () => {
  const src = input();
  src.tokens[0].vision = { enabled:true, range:120 };
  assert.deepEqual(calibrateExecutorScene(src).blueprint.tokens[0].vision, {enabled:true,range:120});
});
