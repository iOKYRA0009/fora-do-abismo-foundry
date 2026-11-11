import test from "node:test";
import assert from "node:assert/strict";
import { summarizeExecution } from "../scripts/macros/execution-report.js";

test("execution report identifies document status and leaves Activities untested", () => {
  const report = summarizeExecution({ id: "run-1", kind: "package", status: "success", name: "Teste",
    actors: [{ id: "a1", name: "Sentinela" }], scenes: [{ id: "s1", name: "Câmara" }],
    images: { retrato: "uploads/retrato.png" } });
  assert.equal(report.state, "PASSOU");
  assert.equal(report.documents.length, 2);
  assert.equal(report.activities.state, "NÃO TESTADO");
  assert.deepEqual(report.images, ["uploads/retrato.png"]);
});

test("a failed execution never claims a document or Activity passed", () => {
  const report = summarizeExecution({ id: "run-2", status: "partial_rollback", actors: [{ id: "a1" }] });
  assert.equal(report.documents[0].state, "FALHOU");
  assert.equal(report.activities.state, "NÃO TESTADO");
});
