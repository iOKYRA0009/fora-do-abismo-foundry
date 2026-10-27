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

function sceneWithLighting({ darkness = 0.85, lights = [], tokens = [], globalLight = null, tokenVision = true } = {}) {
  return {
    documentName: "Scene", id: "lighting-test", name: "Cena escura", width: 400, height: 300,
    grid: { size: 100 }, tokenVision,
    environment: { darknessLevel: darkness, ...(globalLight ? { globalLight } : {}) },
    walls: { contents: [] }, lights: { contents: lights }, sounds: { contents: [] },
    tokens: { contents: tokens }
  };
}

test("scene audit checks ambient light coordinates, radii and intensity without writing", () => {
  const scene = sceneWithLighting({ darkness: 0.2, lights: [{
    name: "Luz defeituosa", x: Infinity, y: 100,
    config: { dim: -2, bright: NaN, alpha: 1.5, luminosity: -0.1 }
  }] });
  const before = structuredClone(scene);
  const result = auditScene(scene);

  assert.deepEqual(scene, before);
  assert.equal(result.mode, "read-only");
  assert.equal(result.ok, false);
  assert.match(result.issues.map(issue => issue.detail).join(" "), /fora da área.*raio dim inválido.*raio bright inválido.*alpha.*luminosidade inválida/);
});

test("scene audit warns about hidden lights in darkness and missing light when token vision is active", () => {
  const hidden = { name: "Tocha apagada", x: 100, y: 100, hidden: true,
    config: { dim: 20, bright: 10, alpha: 0.5, luminosity: 0.5 } };
  const darkScene = sceneWithLighting({ lights: [hidden] });
  const details = auditScene(darkScene).issues.map(issue => issue.detail).join(" ");
  assert.match(details, /Tocha apagada.*oculta/);
  assert.match(details, /sem fonte de luz ativa/);

  const daylight = sceneWithLighting({ darkness: 0.2, lights: [hidden] });
  assert.equal(auditScene(daylight).issues.length, 0);
  const noTokenVision = sceneWithLighting({ lights: [hidden], tokenVision: false });
  assert.doesNotMatch(auditScene(noTokenVision).issues.map(issue => issue.detail).join(" "), /sem fonte de luz ativa/);
});

test("scene audit respects visible ambient, global and token lights", () => {
  const ambient = { name: "Tocha", x: 100, y: 100, hidden: false,
    config: { dim: 20, bright: 0, alpha: 0.5, luminosity: 0.5 } };
  assert.equal(auditScene(sceneWithLighting({ lights: [ambient] })).issues.length, 0);
  assert.equal(auditScene(sceneWithLighting({ globalLight: { enabled: 1 } })).issues.length, 0);
  assert.equal(auditScene(sceneWithLighting({ tokens: [{ x: 100, y: 100, light: { dim: 20, bright: 0 }, sight: { enabled: true } }] })).issues.length, 0);

  const inactive = { ...ambient, config: { ...ambient.config, darkness: { min: 0, max: 0.3 } } };
  assert.match(auditScene(sceneWithLighting({ lights: [inactive] })).issues.map(issue => issue.detail).join(" "), /sem fonte de luz ativa/);
});
