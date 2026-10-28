import test from "node:test";
import assert from "node:assert/strict";

import { executeJarvisConsoleAction } from "../scripts/ui/jarvis-console.js";

function makeRoot() {
  const heading = { textContent: "" };
  const output = { textContent: "", closest: () => ({ removeAttribute() {} }) };
  const captureStatus = { textContent: "" };
  const root = { dataset: {}, querySelector(selector) {
    return ({ ".jarvis-console-result-title": heading,
      ".jarvis-console-result-content": output,
      "[data-jarvis-capture-status]": captureStatus })[selector] ?? null;
  } };
  return { root, heading, output, captureStatus };
}

test("Diagnostics controls capture action errors and export a local JSON report", async () => {
  const calls = [];
  const events = [{ kind: "action", operation: "map-audit", message: "falha controlada" }];
  const capture = {
    active: false,
    start() { this.active = true; calls.push("start"); },
    stop() { this.active = false; calls.push("stop"); },
    events: () => events
  };
  const report = { events };
  globalThis.game = { user: { id: "gm", isGM: true, role: 4 },
    modules: new Map([["fora-do-abismo-foundry", { api: { diagnostics: {
      capture,
      async run(options) { calls.push(["run", options]); return report; },
      download(value) { calls.push(["download", value]); return "jarvis-diagnostico.json"; }
    } } }]]) };
  const { root, heading, output, captureStatus } = makeRoot();

  await executeJarvisConsoleAction("diagnostics-capture-start", root);
  assert.equal(capture.active, true);
  assert.match(captureStatus.textContent, /ativa · 1 evento/);
  await executeJarvisConsoleAction("diagnostics-capture-stop", root);
  assert.equal(capture.active, false);
  assert.match(output.textContent, /ausência de erros não comprova/);
  await executeJarvisConsoleAction("diagnostics-export", root);
  assert.equal(heading.textContent, "Relatório exportado");
  assert.match(output.textContent, /jarvis-diagnostico.json/);
  assert.deepEqual(calls, ["start", "stop", "stop", ["run", { checkUpdates: false }], ["download", report]]);
});

test("Diagnostics capture controls are rejected for a player before invoking the API", async () => {
  let started = false;
  globalThis.game = { user: { id: "player", isGM: false, role: 1 },
    modules: new Map([["fora-do-abismo-foundry", { api: { diagnostics: {
      capture: { start() { started = true; } }
    } } }]]) };
  await assert.rejects(executeJarvisConsoleAction("diagnostics-capture-start", makeRoot().root), /Mestre/);
  assert.equal(started, false);
});
