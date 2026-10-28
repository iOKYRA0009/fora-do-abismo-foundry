import test from "node:test";
import assert from "node:assert/strict";
import { moveExecutorMapElement } from "../scripts/ui/executor-map-edit.js";
import { calibrateExecutorScene } from "../scripts/scenes/package/scene-calibration.js";
import { inspectExecutorSceneGeometry } from "../scripts/scenes/package/executor-scene-geometry.js";

function pack() {
  return {
    schemaVersion: "jarvis-executor-1",
    scenes: [{
      schemaVersion: "1.0",
      scene: {name:"Floresta",columns:25,rows:20,grid:{size:64},
        imagePlacement:{width:1600,height:1280}},
      structures:[{
        name:"Cabana",rect:[638,235,350,378],
        doors:[{edge:3,center:0.25,width:76}],
        light:{x:675,y:509,bright:10,dim:20}
      }],
      lights:[{x:1073,y:911,bright:10,dim:25}],
      tokens:[{actor:"Goblin",x:400,y:280,width:2,height:2}],
      walls:[{a:[150,220],b:[160,400],type:"wall"}]
    }]
  };
}

test("drag cabin translates footprint and associated lantern without changing size or door", () => {
  const source=pack(),original=structuredClone(source);
  const revised=moveExecutorMapElement(source,{sceneIndex:0,kind:"structure",index:0,deltaX:32,deltaY:16});
  assert.deepEqual(source,original,"the source package must not mutate");
  const cab=revised.scenes[0].structures[0];
  assert.deepEqual(cab.rect,[670,251,350,378]);
  assert.equal(cab.doors[0].center,0.25);
  assert.equal(cab.light.x,707);
  assert.equal(cab.light.y,525);
  const converted=calibrateExecutorScene(revised).blueprint;
  assert.equal(converted.walls.filter(w=>w.type==="door").length,1);
  assert.deepEqual(inspectExecutorSceneGeometry(converted).errors,[]);
});

test("drag independent campfire or token without moving building", () => {
  const src=pack();
  const camp=moveExecutorMapElement(src,{sceneIndex:0,kind:"light",index:0,deltaX:-32,deltaY:20});
  assert.deepEqual([camp.scenes[0].lights[0].x,camp.scenes[0].lights[0].y],[1041,931]);
  assert.deepEqual(camp.scenes[0].structures,src.scenes[0].structures);
  const moved=moveExecutorMapElement(camp,{sceneIndex:0,kind:"token",index:0,deltaX:32,deltaY:16});
  assert.deepEqual([moved.scenes[0].tokens[0].x,moved.scenes[0].tokens[0].y],[432,296]);
});

test("generated center light can be moved independently without shifting building", () => {
  const source=pack();
  source.scenes[0].structures[0].light={position:"center",bright:12,dim:23};
  const updated=moveExecutorMapElement(source,{sceneIndex:0,kind:"structure-light",index:0,deltaX:16,deltaY:20});
  assert.deepEqual(updated.scenes[0].structures[0].rect,[638,235,350,378]);
  assert.deepEqual([updated.scenes[0].structures[0].light.x,updated.scenes[0].structures[0].light.y],[829,444]);
  assert.equal(updated.scenes[0].structures[0].light.bright,12);
});

test("standalone wall and a single endpoint can move", () => {
  const moved=moveExecutorMapElement(pack(),{sceneIndex:0,kind:"wall",index:0,deltaX:12,deltaY:10});
  assert.deepEqual(moved.scenes[0].walls[0].a,[162,230]);
  assert.deepEqual(moved.scenes[0].walls[0].b,[172,410]);
  const endpoint=moveExecutorMapElement(moved,{sceneIndex:0,kind:"wall-endpoint",index:0,endpoint:"a",deltaX:4,deltaY:2});
  assert.deepEqual(endpoint.scenes[0].walls[0].a,[166,232]);
  assert.deepEqual(endpoint.scenes[0].walls[0].b,[172,410]);
});

test("out-of-bounds drag is refused, preserving original package", () => {
  const source=pack(),original=structuredClone(source);
  assert.throws(()=>moveExecutorMapElement(source,{sceneIndex:0,kind:"structure",index:0,deltaX:1500,deltaY:0}),/limites do mapa/);
  assert.throws(()=>moveExecutorMapElement(source,{sceneIndex:0,kind:"token",index:0,deltaX:-800,deltaY:0}),/limites do mapa/);
  assert.deepEqual(source,original);
});

test("legacy grid-cell coordinates preserve proper preview-to-grid scale", () => {
  const source={schemaVersion:"jarvis-executor-1",scenes:[{scene:{columns:10,rows:10,grid:{size:100}},
    walls:[{a:[1,2],b:[5,2]}]}]};
  const moved=moveExecutorMapElement(source,{sceneIndex:0,kind:"wall",index:0,deltaX:100,deltaY:50});
  assert.deepEqual(moved.scenes[0].walls[0],{a:[2,2.5],b:[6,2.5]});
});
