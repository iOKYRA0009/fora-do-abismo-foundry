import test from "node:test";
import assert from "node:assert/strict";
import { validateImageTiles } from "../scripts/scenes/package/multi-image-tiles.js";
import { calibrateExecutorScene } from "../scripts/scenes/package/scene-calibration.js";
import { inspectExecutorSceneGeometry } from "../scripts/scenes/package/executor-scene-geometry.js";
import { validateSceneBlueprint } from "../scripts/scenes/scene-blueprint-validator.js";

function mosaic(count = 3) {
  return {
    schemaVersion: "1.0",
    scene: {
      name: "Grande Banquete — TESTE", columns: 32, rows: count * 20,
      grid: { size: 128, distance: 5, units: "ft" }, visualMode: true,
      imagePlacement: { width: 4096, height: count * 2560 },
      imageTiles: Array.from({ length: count }, (_, i) => ({
        src: "asset://sector" + i, rect: [0, i*2560, 4096, 2560],
        pixelWidth: 4096, pixelHeight: 2560
      }))
    },
    walls: [{ a: [512, 2560], b: [1024, 2560], type: "door" }],
    lights: [{ x: 512, y: 3000, bright: 10, dim: 25 }],
    tokens: []
  };
}

test("three HD images become one continuous grid with stable wall and light coordinates", () => {
  const source = mosaic();
  const before = structuredClone(source);
  const tiles = validateImageTiles(source.scene, { sourcePixels: true });
  assert.equal(tiles.length, 3);
  const { blueprint, calibration } = calibrateExecutorScene(source);
  assert.deepEqual(source, before);
  assert.equal(calibration.target.width, 4096);
  assert.equal(calibration.target.height, 7680);
  assert.equal(blueprint.scene.imagePlacement, undefined);
  assert.deepEqual(blueprint.scene.imageTiles.map(t => [t.x,t.y,t.width,t.height]), [
    [0,0,32,20], [0,20,32,20], [0,40,32,20]
  ]);
  assert.equal(validateSceneBlueprint(blueprint), true);
  const geometry = inspectExecutorSceneGeometry(blueprint);
  assert.deepEqual(geometry.errors, []);
  assert.deepEqual(geometry.positions.walls[0].a, [512,2560]);
  assert.deepEqual(geometry.positions.lights[0], {index:0,x:512,y:3000});
});

test("four sectors accepted but fifth blocked", () => {
  assert.equal(validateImageTiles(mosaic(4).scene, {sourcePixels:true}).length, 4);
  assert.throws(() => validateImageTiles(mosaic(5).scene, {sourcePixels:true}), /até 4/);
});

test("overlap, missing image dimensions, stretching and out-of-bounds are blocked", () => {
  const a = mosaic();
  a.scene.imageTiles[1].rect[1] = 2500;
  assert.throws(() => calibrateExecutorScene(a), /sobrepõe/);
  const b = mosaic();
  b.scene.imageTiles[0].pixelWidth = 1024;
  assert.throws(() => calibrateExecutorScene(b), /resolução exata/);
  const c = mosaic();
  c.scene.imageTiles[2].rect[1] = 7000;
  assert.throws(() => calibrateExecutorScene(c), /ultrapassa/);
  const d = mosaic();
  delete d.scene.imageTiles[0].pixelHeight;
  assert.throws(() => calibrateExecutorScene(d), /pixelWidth\/pixelHeight/);
});

test("legacy one-image and blank Scene Builder scenes remain valid", () => {
  const legacy = {schemaVersion:"1.0",scene:{name:"Legacy",columns:10,rows:10,
    grid:{size:100},visualMode:true,backgroundSrc:"worlds/test/map.webp"},walls:[],lights:[]};
  assert.equal(validateSceneBlueprint(legacy), true);
  assert.deepEqual(calibrateExecutorScene(legacy).blueprint, legacy);
  const blank = {schemaVersion:"1.0",scene:{name:"Mapa",columns:10,rows:10},walls:[]};
  assert.equal(validateSceneBlueprint(blank), true);
});

test("direct Scene Builder mosaic validates only grid-cell coordinates", () => {
  const direct = {schemaVersion:"1.0",scene:{
    name:"Map",columns:20,rows:15,visualMode:true,imageTiles:[
      {src:"maps/a.webp",x:0,y:0,width:10,height:15},
      {src:"maps/b.webp",x:10,y:0,width:10,height:15}
    ]}};
  assert.equal(validateSceneBlueprint(direct), true);
  direct.scene.imageTiles[1].x = 9;
  assert.throws(() => validateSceneBlueprint(direct), /sobrepõe/);
});
