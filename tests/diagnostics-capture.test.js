import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyDiagnosticSource, createJarvisRuntimeCapture, installJarvisRuntimeCapture
} from "../scripts/diagnostics/runtime-capture.js";
import { downloadJarvisDiagnostics, formatJarvisDiagnostics } from "../scripts/diagnostics/health-check.js";

function fakeTarget() {
  const listeners = new Map();
  const output = [];
  return {
    listeners, output,
    console: { error: (...args) => output.push(args) },
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) { if (listeners.get(name) === listener) listeners.delete(name); },
    emit(name, event) { listeners.get(name)?.(event); }
  };
}

test("diagnostic attribution uses first module frame and flags mixed stacks", () => {
  const entry = classifyDiagnosticSource({ stack:
    "Error: layers\n at a (http://localhost:30000/modules/multi-token-edit/scripts/main.js:3)" +
    "\n at b (http://localhost:30000/modules/fora-do-abismo-foundry/scripts/main.js:8)" });
  assert.equal(entry.owner, "external-module");
  assert.equal(entry.moduleId, "multi-token-edit");
  assert.equal(entry.possibleConflict, true);
  assert.deepEqual(entry.relatedModules, ["multi-token-edit", "fora-do-abismo-foundry"]);
  assert.equal(classifyDiagnosticSource({ source: "/modules/fora-do-abismo-foundry/scripts/main.js" }).owner, "jarvis");
  assert.equal(classifyDiagnosticSource({ source: "/systems/dnd5e/module.js" }).owner, "system");
  assert.equal(classifyDiagnosticSource({ message: "unknown failure" }).owner, "unknown");
});

test("capture records browser errors and rejections without altering the original console", () => {
  const target = fakeTarget();
  const oldError = target.console.error;
  const capture = createJarvisRuntimeCapture({ target, maxEntries: 2, now: () => "2026-10-28T02:00:00Z" }).start();
  target.emit("error", { error: new Error("Jarvis broke"), filename: "/modules/fora-do-abismo-foundry/main.js" });
  target.emit("unhandledrejection", { reason: new Error("External failure\nsecret" ) });
  target.console.error("other module failed", new Error("Stack failure"));
  assert.equal(target.output.length, 1);
  assert.equal(capture.snapshot().length, 2);
  assert.equal(capture.snapshot()[0].kind, "unhandled-rejection");
  assert.equal(capture.snapshot()[1].kind, "console-error");
  capture.stop();
  assert.equal(target.console.error, oldError);
  assert.equal(target.listeners.size, 0);
  target.console.error("after stop");
  assert.equal(capture.snapshot().length, 2);
});

test("capture guards both synchronous and rejected asynchronous operations and rethrows", async () => {
  const capture = createJarvisRuntimeCapture({ target: fakeTarget(), captureConsole: false }).start();
  const sync = capture.guard("action", "macro.execute", () => { throw new Error("unknown tool"); });
  assert.throws(sync, /unknown tool/);
  const asyncFailure = capture.guard("api", "scenes.build", async () => { throw new Error("scene failed"); });
  await assert.rejects(asyncFailure(), /scene failed/);
  assert.deepEqual(capture.snapshot().map(entry => [entry.kind, entry.operation]),
    [["action", "macro.execute"], ["api", "scenes.build"]]);
});

test("installation is idempotent and report lists observed errors without claiming full coverage", () => {
  const target = fakeTarget();
  const first = installJarvisRuntimeCapture(target);
  assert.equal(installJarvisRuntimeCapture(target), first);
  assert.equal(first.active, false);
  assert.equal(target.listeners.size, 0);
  first.start();
  first.recordFailure("action", new Error("Jarvis: botão falhou"), "central.preview");
  const event = first.snapshot()[0];
  const report = { version: "1.1.0-rc.3", checks: [{ id: "erros-em-sessao", status: "fail", detail: "1 erro" }],
    events: [event], counts: { pass: 0, warn: 0, fail: 1, skip: 0 } };
  assert.match(formatJarvisDiagnostics(report), /central\.preview: Jarvis: botão falhou/);
  first.clear();
  assert.deepEqual(first.snapshot(), []);
  first.stop();
});

test("diagnostic report downloads one JSON file locally", async () => {
  let blob = null;
  let clicked = false;
  let revoked = false;
  const report = { version: "1.1.0-rc.3", events: [{ message: "Falha" }], checks: [] };
  const filename = downloadJarvisDiagnostics(report, {
    filename: "auditoria.json",
    documentRef: { createElement: () => ({ click: () => { clicked = true; } }) },
    urlRef: { createObjectURL: value => { blob = value; return "blob:local"; },
      revokeObjectURL: value => { assert.equal(value, "blob:local"); revoked = true; } }
  });
  assert.equal(filename, "auditoria.json");
  assert.equal(clicked, true);
  assert.equal(revoked, true);
  assert.deepEqual(JSON.parse(await blob.text()), report);
});
