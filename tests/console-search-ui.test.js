import test from "node:test";
import assert from "node:assert/strict";

import { openJarvisConsole } from "../scripts/ui/jarvis-console.js";

test("typing a new global query removes stale clickable results immediately", async () => {
  const listeners = new Map();
  const search = { value: "" };
  const results = { innerHTML: "" };
  const status = { textContent: "" };
  const root = {
    dataset: {},
    addEventListener(name, handler) { listeners.set(name, handler); },
    querySelector(selector) {
      return ({ "[data-jarvis-global-search]": search,
        "[data-jarvis-search-results]": results,
        "[data-jarvis-status]": status })[selector] ?? null;
    },
    querySelectorAll() { return []; }
  };
  globalThis.document = { createElement: () => ({ innerHTML: "" }) };
  globalThis.game = {
    user: { id: "gm", name: "Mestre", role: 4, isGM: true },
    actors: { contents: [] }, items: { contents: [] }, scenes: { contents: [] },
    packs: { contents: [] }, users: { contents: [] }, documentTypes: { Item: ["weapon"] },
    modules: new Map([["fora-do-abismo-foundry", { api: {
      version: "1.1.0-rc.3",
      scenes: { framework: { templates: () => [], skins: () => [], presets: () => [] },
        lightingPresets: () => [] },
      appearance: { status: () => ({ active: false }) },
      transformation: { status: () => ({ active: false }) },
      macros: { list: () => [], favorites: () => [] }
    } }]])
  };
  class DialogV2 {
    constructor(config) { this.config = config; }
    render() {
      this.element = { querySelector: selector => selector === ".jarvis-console" ? root : null };
      this.rendered = true;
      return Promise.resolve(this);
    }
  }
  globalThis.foundry = { applications: { api: { DialogV2 } } };

  openJarvisConsole();
  await new Promise(resolve => setImmediate(resolve));
  const input = listeners.get("input");
  assert.equal(typeof input, "function");
  const event = { target: { matches: selector => selector === "[data-jarvis-global-search]" } };

  search.value = "ficha";
  input(event);
  await new Promise(resolve => setTimeout(resolve, 230));
  assert.match(results.innerHTML, /Abrir ficha/);

  search.value = "mapa";
  input(event);
  assert.equal(results.innerHTML, "", "old results cannot be clicked for a different query");
  await new Promise(resolve => setTimeout(resolve, 230));
  assert.match(results.innerHTML, /Estúdio de Mapas/);
  assert.doesNotMatch(results.innerHTML, /Abrir ficha/);

  search.value = "";
  input(event);
  assert.equal(results.innerHTML, "");
  assert.equal(status.textContent, "");
});
