import test from "node:test";
import assert from "node:assert/strict";
import { auditScene } from "../scripts/scenes/scene-audit.js";

test("scene audit reports duplicate walls and out-of-bounds lights without writing", () => {
  const scene = {
    documentName: "Scene", id: "scene-test", name: "Teste", width: 400, height: 300,
    grid: { size: 100 }, tokenVision: true,
    walls: { contents: [
      { c: [0, 0, 100, 0], door: 0 },
      { c: [100, 0, 0, 0], door: 1 }
    ] },
    lights: { contents: [{ name: "Luz perdida", x: 500, y: 100 }] },
    sounds: { contents: [] },
    tokens: { contents: [{ name: "Herói", x: 100, y: 100, sight: { enabled: true } }] }
  };
  const result = auditScene(scene);
  assert.equal(result.mode, "read-only");
  assert.equal(result.counts.doors, 1);
  assert.equal(result.issues.length, 2);
  assert.match(result.issues.map(issue => issue.detail).join(" "), /sobreposta/);
  assert.match(result.issues.map(issue => issue.detail).join(" "), /Luz perdida/);
});
