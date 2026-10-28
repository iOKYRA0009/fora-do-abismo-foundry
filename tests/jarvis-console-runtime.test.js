import test from "node:test";
import assert from "node:assert/strict";

import { openJarvisConsole, registerJarvisConsoleControl } from "../scripts/ui/jarvis-console.js";

function makeTab(id) {
  const classes = new Set();
  return {
    dataset: { jarvisTab: id },
    classes,
    attributes: {},
    classList: { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); } },
    setAttribute(name, value) { this.attributes[name] = value; }
  };
}

test("DialogV2 installs console listeners after its first render", async () => {
  const tabs = [makeTab("characters"), makeTab("compendiums")];
  const panels = [
    { dataset: { jarvisPanel: "characters" }, hidden: false },
    { dataset: { jarvisPanel: "compendiums" }, hidden: true }
  ];
  const result = { hidden: false, setAttribute(name) { if (name === "hidden") this.hidden = true; } };
  const body = { scrollTop: 360 };
  const listeners = new Map();
  const root = {
    dataset: {},
    addEventListener(name, handler) { listeners.set(name, handler); },
    querySelectorAll(selector) {
      if (selector === "[data-jarvis-tab]") return tabs;
      if (selector === "[data-jarvis-panel]") return panels;
      return [];
    },
    querySelector(selector) { return ({ ".jarvis-console-result": result,
      ".jarvis-console-body": body })[selector] ?? null; }
  };

  globalThis.document = { createElement: () => ({ innerHTML: "" }) };
  globalThis.game = {
    user: { id: "gm", name: "Mestre", role: 4, isGM: true },
    actors: { contents: [] }, packs: { contents: [] }, users: { contents: [] },
    documentTypes: { Item: ["class", "weapon"] },
    modules: new Map([["fora-do-abismo-foundry", { api: {
      version: "1.0.0",
      scenes: { framework: { templates: () => [], skins: () => [], presets: () => [] }, lightingPresets: () => [] },
      appearance: { status: () => ({ active: false }) },
      transformation: { status: () => ({ active: false }) }
    } }]])
  };

  class DialogV2 {
    constructor(config) {
      this.config = config;
      this.rendered = false;
    }
    render({ force }) {
      assert.equal(force, true);
      this.renderPromise = Promise.resolve().then(() => {
        this.element = { querySelector: selector => selector === ".jarvis-console" ? root : null };
        this.rendered = true;
        return this;
      });
      return this.renderPromise;
    }
  }
  globalThis.foundry = { applications: { api: { DialogV2 } } };

  const dialog = openJarvisConsole();
  assert.ok(dialog instanceof DialogV2);
  assert.match(dialog.config.content.innerHTML, /data-jarvis-tab="compendiums"/);
  assert.match(dialog.config.content.innerHTML, /data-jarvis-tab="overview"/);
  assert.match(dialog.config.content.innerHTML, /role="tab"/);
  assert.match(dialog.config.content.innerHTML, /data-jarvis-global-search/);
  assert.match(dialog.config.content.innerHTML, /data-jarvis-action="diagnostics-capture-start"/);
  assert.equal(listeners.has("click"), false, "the DOM is not available until render finishes");

  await dialog.renderPromise;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof listeners.get("click"), "function");

  await listeners.get("click")({ target: {
    closest(selector) { return selector === "[data-jarvis-tab]" ? { dataset: { jarvisTab: "compendiums" } } : null; }
  } });
  assert.equal(panels[0].hidden, true);
  assert.equal(panels[1].hidden, false);
  assert.equal(tabs[1].attributes["aria-selected"], "true");
  assert.equal(body.scrollTop, 0, "a new tab starts at its heading instead of the previous tab's scroll position");

  let prevented = false;
  listeners.get("keydown")({ key: "Home", preventDefault() { prevented = true; },
    target: { closest(selector) { return selector === "[data-jarvis-tab]" ? tabs[1] : null; } } });
  assert.equal(prevented, true);
  assert.equal(tabs[0].attributes["aria-selected"], "true");
  assert.equal(tabs[0].attributes.tabindex, "0");
  assert.equal(panels[0].hidden, false);

  await listeners.get("click")({ target: {
    closest(selector) { return selector === "[data-jarvis-action]" ? {
      dataset: { jarvisAction: "clear-output" }, disabled: false
    } : null; }
  } });
  assert.equal(result.hidden, true, "action buttons dispatch after the listener is attached");

  const captured = [];
  game.actors.get = () => null;
  game.modules.get("fora-do-abismo-foundry").api.diagnostics = { capture: {
    recordFailure(kind, error, operation) { captured.push({ kind, message: error.message, operation }); }
  } };
  const warnings = [];
  globalThis.ui = { notifications: { error() {}, warn(message) { warnings.push(message); } } };
  const originalError = console.error;
  console.error = () => {};
  try {
    await listeners.get("click")({ target: {
      closest(selector) { return selector === "[data-jarvis-action]" ? {
        dataset: { jarvisAction: "actor-open" }, disabled: false
      } : null; }
    } });
  } finally { console.error = originalError; }
  assert.deepEqual(captured, [], "missing selections are guidance and do not pollute the error capture");
  assert.match(warnings[0], /Selecione um personagem acessível/);
});

test("Jarvis registers a Tokens toolbar button in the V14 control structure", () => {
  const handlers = new Map();
  globalThis.Hooks = { on(name, handler) { handlers.set(name, handler); } };
  registerJarvisConsoleControl();

  const controls = { tokens: { tools: { select: { name: "select" } } } };
  handlers.get("getSceneControlButtons")(controls);
  const tool = controls.tokens.tools.jarvisConsole;
  assert.equal(tool.name, "jarvisConsole");
  assert.equal(tool.button, true);
  assert.equal(tool.visible, true);
  assert.equal(typeof tool.onChange, "function");
  assert.equal(tool.order, 1);
});
