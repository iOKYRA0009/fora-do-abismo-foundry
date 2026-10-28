import test from "node:test";
import assert from "node:assert/strict";

import { executeJarvisConsoleAction, openJarvisConsole } from "../scripts/ui/jarvis-console.js";
import { JarvisInputError } from "../scripts/ui/console-input-error.js";

const MODULE_ID = "fora-do-abismo-foundry";

function setup(executor = {}) {
  globalThis.game = {
    user: { id: "gm", name: "Mestre", isGM: true, role: 4 },
    users: { contents: [], activeGM: { id: "gm" } },
    actors: { contents: [], get: () => null }, items: { contents: [] },
    scenes: { contents: [] }, packs: { contents: [] }, documentTypes: { Item: ["weapon"] },
    modules: new Map([[MODULE_ID, { api: {
      version: "1.1.0", executor,
      scenes: { framework: { templates: () => [], skins: () => [], presets: () => [] }, lightingPresets: () => [] },
      appearance: { status: () => ({ active: false }) },
      transformation: { status: () => ({ active: false }) },
      macros: { list: () => [], commands: () => [], favorites: () => [] }
    } }]])
  };
  globalThis.document = { createElement: () => ({ innerHTML: "" }) };
  globalThis.foundry = { applications: { api: { DialogV2: class {
    constructor(config) { this.config = config; }
    render() { return Promise.resolve(this); }
    static confirm() { return Promise.resolve(true); }
  } } } };
}

function actionRoot(input = {}) {
  const fields = Object.fromEntries(Object.entries(input).map(([key, value]) => [key,
    typeof value === "object" ? value : { value }]));
  const preview = { innerHTML: "" };
  const history = { innerHTML: "" };
  const heading = { textContent: "" };
  const content = { textContent: "", closest: () => ({ removeAttribute() {} }) };
  const root = { dataset: {}, querySelector(selector) {
    const field = /^\[name="([^"]+)"\]$/.exec(selector)?.[1];
    if (field) return fields[field] ?? null;
    return ({ "[data-jarvis-executor-preview]": preview,
      "[data-jarvis-executor-history]": history,
      ".jarvis-console-result-title": heading,
      ".jarvis-console-result-content": content })[selector] ?? null;
  } };
  return { root, fields, preview, history, heading, content };
}

test("Central opens on six main areas with the Executor first", () => {
  setup();
  const dialog = openJarvisConsole();
  const html = dialog.config.content.innerHTML;
  const tabs = [...html.matchAll(/data-jarvis-tab="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(tabs, ["executor", "library", "characters", "scenes", "appearances", "system"]);
  assert.match(html, /data-jarvis-panel="executor"/);
  assert.match(html, /data-jarvis-executor-preview/);
  assert.match(html, /name="executor-js-consent"/);
  assert.match(html, /<details[^>]*>\s*<summary>Histórico e recuperação/);
  assert.match(html, /<summary>Criar, importar e manter fichas<\/summary>/);
  assert.match(html, /<summary>Scene Builder e ferramentas de mapas<\/summary>/);
});

test("player starts in the Library without arbitrary code execution controls", async () => {
  setup();
  game.user = { id: "player", name: "Jogador", isGM: false, role: 1 };
  const { openJarvisConsole: freshOpen } = await import("../scripts/ui/jarvis-console.js?player-layout");
  const html = freshOpen().config.content.innerHTML;
  assert.deepEqual([...html.matchAll(/data-jarvis-tab="([^"]+)"/g)].map(match => match[1]),
    ["library", "characters", "appearances"]);
  assert.match(html, /data-jarvis-panel="library"/);
  assert.doesNotMatch(html, /data-jarvis-panel="executor"/);
  assert.doesNotMatch(html, /name="executor-source"/);
});

test("JavaScript requires a fresh preview, an explicit risk checkbox, and confirmation", async () => {
  const calls = [];
  setup({
    preview(source, options) {
      calls.push(["preview", source, options.mode]);
      return { kind: "javascript", source, review: { kind: "javascript", lines: 1,
        characters: source.length, warning: "Sem desfazer automático." } };
    },
    async run(plan) { calls.push(["run", plan.source]); return { kind: "javascript", output: 7 }; }
  });
  const { root, fields, preview, content } = actionRoot({
    "executor-source": "return 7;", "executor-mode": "javascript", "executor-js-consent": { checked: false }
  });
  const state = {};
  await executeJarvisConsoleAction("executor-preview", root, state);
  assert.match(preview.innerHTML, /Prévia do JavaScript/);
  await assert.rejects(executeJarvisConsoleAction("executor-run", root, state), error => {
    assert.ok(error instanceof JarvisInputError);
    assert.match(error.message, /confirmação de risco/);
    return true;
  });
  assert.deepEqual(calls.map(row => row[0]), ["preview"]);
  fields["executor-js-consent"].checked = true;
  await executeJarvisConsoleAction("executor-run", root, state);
  assert.deepEqual(calls.map(row => row[0]), ["preview", "run"]);
  assert.equal(fields["executor-js-consent"].checked, false);
  assert.match(content.textContent, /7/);
  await assert.rejects(executeJarvisConsoleAction("executor-run", root, state), /Prévia desatualizada/);
});

test("package preview summarizes content and exposes recorded rollback", async () => {
  const calls = [];
  const record = { id: "exec-1", kind: "package", name: "Torre", status: "completed" };
  setup({
    preview: () => ({ kind: "package", data: { assets: [] }, files: [], review: {
      name: "Torre", actors: [{ name: "Sentinela", items: 3, activities: 2 }],
      scenes: [{ name: "Torre", walls: 4, lights: 1, sounds: 0, tokens: 1,
        pixels: { width: 1200, height: 800, gridSize: 100 },
        positions: { walls: [{ index: 0, a: [100, 200], b: [300, 200] }],
          lights: [{ index: 0, x: 500, y: 400 }], sounds: [],
          tokens: [{ index: 0, actor: "Sentinela", x: 600, y: 300, width: 1, height: 1 }] } }],
      itemAdditions: [], images: [], warning: "Imagens enviadas podem permanecer."
    } }),
    history: () => [record],
    async rollback(id) { calls.push(id); return { id, rolledBack: true }; }
  });
  const { root, preview, history, content } = actionRoot({
    "executor-source": '{"schemaVersion":"jarvis-executor-1"}',
    "executor-mode": "package", "executor-rollback-id": "exec-1"
  });
  await executeJarvisConsoleAction("executor-preview", root, {});
  assert.match(preview.innerHTML, /Sentinela/);
  assert.match(preview.innerHTML, /4 parede/);
  assert.match(preview.innerHTML, /100, 200 → 300, 200 px/);
  assert.match(preview.innerHTML, /1200 × 800 px/);
  assert.match(preview.innerHTML, /Ajustar mapa antes de criar/);
  assert.match(preview.innerHTML, /<svg viewBox="0 0 1200 800"/);
  assert.match(preview.innerHTML, /stroke="#fb9d54"/);
  await executeJarvisConsoleAction("executor-history", root);
  assert.match(history.innerHTML, /data-jarvis-execution-id="exec-1"/);
  await executeJarvisConsoleAction("executor-rollback", root);
  assert.deepEqual(calls, ["exec-1"]);
  assert.match(content.textContent, /rolledBack/);
});

test("file picker loads .js code instead of treating it as an image", async () => {
  setup();
  const listeners = new Map();
  const fields = { "executor-source": { value: "" }, "executor-mode": { value: "auto" } };
  const fileStatus = { textContent: "" };
  const root = { dataset: {}, addEventListener(name, callback) { listeners.set(name, callback); },
    querySelector(selector) {
      const field = /^\[name="([^"]+)"\]$/.exec(selector)?.[1];
      return field ? fields[field] ?? null : selector === "[data-jarvis-executor-files]" ? fileStatus : null;
    }
  };
  globalThis.foundry.applications.api.DialogV2 = class {
    constructor(config) { this.config = config; }
    render() {
      this.element = { querySelector: selector => selector === ".jarvis-console" ? root : null };
      return Promise.resolve(this);
    }
  };
  const { openJarvisConsole: freshOpen } = await import("../scripts/ui/jarvis-console.js?file-picker-regression");
  freshOpen();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof listeners.get("change"), "function");
  const script = { name: "ritual.js", size: 9, text: async () => "return 7;" };
  listeners.get("change")({ target: { files: [script], matches: selector => selector === '[name="executor-files"]' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fields["executor-source"].value, "return 7;");
  assert.equal(fields["executor-mode"].value, "javascript");
  assert.match(fileStatus.textContent, /ritual\.js/);
});
