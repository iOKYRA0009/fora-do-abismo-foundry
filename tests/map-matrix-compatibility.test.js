/**
 * Permanent compatibility guard for the map-creation contract users validated
 * in Jarvis 1.2.2. Future releases may migrate the schema, but should keep
 * the one-package, preview, drag and scene geometry workflow.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { previewJarvisExecution } from "../scripts/macros/macro-executor.js";
import { moveExecutorMapElement } from "../scripts/ui/executor-map-edit.js";
import { calibrateExecutorScene } from "../scripts/scenes/package/scene-calibration.js";
import { inspectExecutorSceneGeometry } from "../scripts/scenes/package/executor-scene-geometry.js";

const sample=JSON.parse(readFileSync(new URL("../examples/MATRIZ-JARVIS-MAPA-COM-TOKENS.json", import.meta.url),"utf8"));
const referencedActor=sample.scenes[0].tokens[0].actor;

function setup() {
  globalThis.game={
    user:{id:"gm",isGM:true},
    users:{activeGM:{id:"gm"}},
    actors:{contents:[{id:"actor-matriz",name:referencedActor}]},
    scenes:{contents:[]}
  };
  globalThis.ui={notifications:{}};
}

test("map matrix remains previewable with a referenced existing Actor and a map image",()=>{
  setup();
  const file={name:sample.assets[0].fileName,type:"image/webp",size:9000,lastModified:0};
  const plan=previewJarvisExecution(JSON.stringify(sample),{mode:"package",files:[file]});
  assert.equal(plan.kind,"package");
  assert.equal(plan.review.scenes.length,1);
  assert.equal(plan.review.actors.length,0);
  assert.equal(plan.review.scenes[0].walls,6);
  assert.equal(plan.review.scenes[0].doors,1);
  assert.equal(plan.review.scenes[0].lights,2);
  assert.equal(plan.review.scenes[0].tokens,1);
  assert.equal(plan.review.scenes[0].calibration.mode,"image-pixels");
  assert.equal(plan.review.scenes[0].positions.tokens[0].x,358);
  assert.equal(plan.review.scenes[0].positions.lights[0].x,1073);
});

test("map matrix building can be dragged without resizing; door and lighting stay functional",()=>{
  setup();
  const original=structuredClone(sample);
  const adjusted=moveExecutorMapElement(sample,{sceneIndex:0,kind:"structure",index:0,deltaX:32,deltaY:16});
  assert.deepEqual(sample,original);
  const structure=adjusted.scenes[0].structures[0];
  assert.deepEqual(structure.rect,[670,251,350,378]);
  assert.deepEqual([structure.light.x,structure.light.y],[707,525]);
  const converted=calibrateExecutorScene(adjusted.scenes[0]).blueprint;
  assert.equal(converted.walls.filter(w=>w.type==="door").length,1);
  assert.deepEqual(inspectExecutorSceneGeometry(converted).errors,[]);
  assert.equal(converted.tokens[0].vision.enabled,true);
});
