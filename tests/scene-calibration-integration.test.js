import test from "node:test";
import assert from "node:assert/strict";
import { previewJarvisExecution, runJarvisExecution } from "../scripts/macros/macro-executor.js";

function setup() {
  const actors = [{ id: "existing-goblin", name: "Goblin de Teste", flags: {} }];
  const scenes = [];
  globalThis.game = {
    user: { id: "gm", isGM: true },
    users: { activeGM: { id: "gm" } },
    actors: { contents: actors },
    scenes: { contents: scenes }
  };
  globalThis.ui = { notifications: {} };
  globalThis.foundry = { utils: { randomID: () => "test" } };
  return { actors, scenes };
}

function forestPackage() {
  return { schemaVersion: "jarvis-executor-1", name: "Floresta calibrada",
    scenes: [{
      schemaVersion: "1.0",
      scene: { name: "Floresta nova", columns: 25, rows: 20, grid: { size:64 },
        imagePlacement: { width:1600, height:1280 }, visionPreset: "limited" },
      structures: [{ rect:[638,235,350,378], doors:[{edge:3,center:0.25,width:76}],
        light:{x:675,y:509,bright:10,dim:20} }],
      lights: [{x:1073,y:911,bright:10,dim:25}],
      tokens: [{actor:"Goblin de Teste",x:400,y:280}]
    }]
  };
}

test("end-to-end Executor preview and build use image pixel alignment, door and limited vision", async () => {
  const { scenes } = setup();
  const plan = previewJarvisExecution(JSON.stringify(forestPackage()));
  assert.equal(plan.review.scenes[0].calibration.mode,"image-pixels");
  assert.equal(plan.review.scenes[0].doors,1);
  assert.equal(plan.review.scenes[0].walls,6);
  assert.equal(plan.review.scenes[0].positions.lights[0].x,1073);
  assert.equal(plan.review.scenes[0].positions.lights[1].x,675);
  let written;
  const api = { scenes: { async build(blueprint,options) {
    written={blueprint,options};
    const doc = {id:"scene-1",name:blueprint.scene.name,flags:blueprint.flags,
      async delete(){scenes.splice(scenes.indexOf(this),1);} };
    scenes.push(doc);
    return {scene:doc};
  } } };
  const result = await runJarvisExecution(plan,api);
  assert.equal(result.scenes.length,1);
  assert.equal(written.blueprint.walls.length,6);
  assert.equal(written.blueprint.walls.filter(w=>w.type==="door").length,1);
  assert.equal(written.blueprint.lights[1].x,675/64);
  assert.equal(written.blueprint.tokens[0].x,400/64);
  assert.equal(written.blueprint.tokens[0].vision.enabled,true);
  assert.equal(written.blueprint.tokens[0].vision.range,60);
  assert.equal(written.blueprint.scene.tokenVision,true);
  assert.equal(written.options.replaceExisting,false);
  assert.equal(written.blueprint.scene.imagePlacement,undefined);
});
