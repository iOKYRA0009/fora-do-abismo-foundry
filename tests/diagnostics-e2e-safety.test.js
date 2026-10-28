import test from "node:test";
import assert from "node:assert/strict";
import { assertSafeE2ETarget, assessFoundryPage, parseE2EOptions } from "../scripts/diagnostics/e2e-safety.js";

test("E2E runner accepts only an explicit local audit clone", () => {
  const options = parseE2EOptions(["--world", "jarvis-rc3-audit"]);
  assert.equal(options.world, "jarvis-rc3-audit");
  assert.equal(assertSafeE2ETarget(options), true);
  assert.throws(() => parseE2EOptions([]), /cópia isolada/);
  assert.throws(() => parseE2EOptions(["--world", "fora-do-abismo"]), /cópia isolada/);
  assert.throws(() => parseE2EOptions(["--world", "teste-jarvis"]), /cópia isolada/);
  assert.throws(() => parseE2EOptions(["--world", "jarvis-rc3-audit", "--base-url", "http://example.com"]), /HTTP local/);
  assert.throws(() => parseE2EOptions(["--world", "jarvis-rc3-audit", "--base-url", "http://localhost:30000/?token=secret"]), /HTTP local/);
  assert.throws(() => parseE2EOptions(["--world", "jarvis-rc3-audit", "--report", "C:/FoundryVTT/Data/worlds/main/world.json"]), /somente um nome/);
});

test("E2E runner refuses the main world and never treats join/setup as an executed test", () => {
  assert.equal(assessFoundryPage({ pathname: "/setup", worldId: null, ready: false }, "jarvis-rc3-audit").status, "not-tested");
  assert.equal(assessFoundryPage({ pathname: "/join", worldId: "fora-do-abismo", ready: false }, "jarvis-rc3-audit").status, "refused");
  assert.equal(assessFoundryPage({ pathname: "/join", worldId: null, ready: false }, "jarvis-rc3-audit").status, "not-tested");
  assert.equal(assessFoundryPage({ pathname: "/game", worldId: "jarvis-rc3-audit", ready: true }, "jarvis-rc3-audit").status, "ready");
});
