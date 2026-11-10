import test from "node:test";
import assert from "node:assert/strict";
import { JarvisImporterV9 } from "../scripts/importer/v9/jarvis-importer-v9.js";
import { inspectActivityAutomation, registerActivityAutomationSettings } from "../scripts/automation/automation-approval.js";
import { registerPlayerAbilitySetting, setPlayerAbilitiesEnabled } from "../scripts/automation/player-ability-setting.js";

test("GM Item import authorizes new Jarvis Activities while player use is on", async () => {
  const settings = new Map();
  globalThis.foundry = { utils: { deepClone: structuredClone } };
  globalThis.CONFIG = { DND5E: {} };
  globalThis.game = {
    user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } },
    release: { generation: 14 }, system: { id: "dnd5e", version: "6.0.2" },
    documentTypes: { Item: ["feat"] }, actors: [],
    settings: {
      register(_module, key, config) { settings.set(key, config.default); },
      get(_module, key) { return settings.get(key); },
      async set(_module, key, value) { settings.set(key, structuredClone(value)); }
    }
  };
  globalThis.ui = { notifications: { warn() {}, error() {} } };
  registerActivityAutomationSettings();
  registerPlayerAbilitySetting();
  await setPlayerAbilitiesEnabled(true);

  const actor = {
    id: "jack", name: "Jack", documentName: "Actor", type: "character", items: [],
    system: {}, async update() {}, async updateEmbeddedDocuments() {},
    async deleteEmbeddedDocuments(_type, ids) { this.items = this.items.filter(item => !ids.includes(item.id)); },
    async createEmbeddedDocuments(type, data) {
      assert.equal(type, "Item");
      const created = data.map((entry, index) => {
        const item = { ...entry, id: entry._id ?? `item${index}`, uuid: `Actor.jack.Item.item${index}`,
          effects: [], system: { ...entry.system, activities: {} },
          toObject() { return structuredClone(entry); } };
        for (const [id, activityData] of Object.entries(entry.system.activities ?? {})) {
          item.system.activities[id] = { ...activityData, id, uuid: `${item.uuid}.Activity.${id}`, item };
        }
        return item;
      });
      this.items.push(...created);
      return created;
    }
  };
  const [item] = await new JarvisImporterV9().importItems(actor, [{
    name: "Poder de Jack", type: "feat", jarvis: { activities: [{
      _id: "TestActivity0001", type: "utility", automation: { pre: "return true;" }
    }] }
  }]);
  const activity = item.system.activities.TestActivity0001;
  assert.equal(inspectActivityAutomation(activity).approved, true);
});
