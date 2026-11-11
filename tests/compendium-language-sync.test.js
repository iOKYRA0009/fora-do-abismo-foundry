import test from "node:test";
import assert from "node:assert/strict";

import { searchCompendiumPack, searchConsole } from "../scripts/ui/console-search.js";
import {
  draftDescription, localizedImportData, validateGlossary
} from "../scripts/translation/compendium-language.js";
import {
  applyCompendiumSync, previewCompendiumSync, trackCompendiumImport
} from "../scripts/translation/compendium-sync.js";

test("Babele and glossary names are searchable in both languages", async () => {
  globalThis.game = { user: { isGM: true } };
  const pack = { collection: "dnd5e.spells", title: "Magias", documentName: "Item", visible: true,
    getIndex: async () => [
      { _id: "a", name: "Bola de Fogo", type: "spell", flags: { babele: { originalName: "Fireball" } } },
      { _id: "b", name: "Magic Missile", type: "spell" }
    ] };
  const english = await searchCompendiumPack(pack, "fireball");
  const portuguese = await searchCompendiumPack(pack, "bola de fogo");
  const fallback = await searchCompendiumPack(pack, "mísseis mágicos");
  assert.equal(english[0].name, "Bola de Fogo");
  assert.equal(portuguese[0].id, "a");
  assert.equal(fallback[0].id, "b");
  assert.equal(fallback[0].name, "Mísseis Mágicos");
  const global = await searchConsole("fireball", { access: { gm: true }, packs: [pack] });
  assert.equal(global[0].id, "dnd5e.spells:a");
});

test("draft translation leaves markup, Foundry links, and dice commands intact", () => {
  const html = '<p data-name="Fireball">Fireball deals Fire damage. @UUID[Compendium.fire.Fireball]{Fireball} [[/damage 8d6 type=fire]]</p>';
  assert.equal(draftDescription(html), '<p data-name="Fireball">Bola de Fogo deals Fogo damage. @UUID[Compendium.fire.Fireball]{Fireball} [[/damage 8d6 type=fire]]</p>');
  const source = { name: "Fireball", system: { description: { value: html }, damage: { formula: "8d6" } } };
  const imported = localizedImportData(source);
  assert.equal(imported.name, "Bola de Fogo");
  assert.equal(imported.system.damage.formula, "8d6");
  assert.equal(source.name, "Fireball", "the original object is not modified");
  assert.throws(() => validateGlossary({ x: 5 }), /tradução curta/);
});

test("sync updates untranslated fields while preserving edited mechanics and later conflicts", async () => {
  globalThis.game = { user: { isGM: true } };
  const oldSource = { name: "Unknown Ritual", img: "old.webp",
    system: { description: { value: "Old text" }, uses: { value: 2, max: 2 } } };
  const newSource = { name: "Unknown Ritual", img: "new.webp",
    system: { description: { value: "New text" }, uses: { value: 3, max: 3 } } };
  let source = oldSource;
  const pack = { collection: "world.spells", documentName: "Item", visible: true,
    getDocument: async () => ({ toObject: () => structuredClone(source) }) };
  const item = { documentName: "Item", id: "imported", name: oldSource.name,
    data: structuredClone(oldSource), flags: {},
    toObject() { return { ...structuredClone(this.data), flags: structuredClone(this.flags) }; },
    async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = structuredClone(value); },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        const bits = path.split(".");
        let target = this.data;
        for (const bit of bits.slice(0, -1)) target = target[bit];
        target[bits.at(-1)] = structuredClone(value);
      }
      this.name = this.data.name;
    } };
  await trackCompendiumImport(item, pack, "ritual", oldSource);
  item.data.system.uses.value = 1; // Player used a charge after importing.
  source = newSource;
  const preview = await previewCompendiumSync(pack, { worldItems: [item], actors: [] });
  assert.deepEqual(Object.keys(preview.rows[0].updates).sort(), ["img", "system.description"]);
  assert.deepEqual(preview.rows[0].conflicts, ["system.uses"]);
  const result = await applyCompendiumSync(preview, pack);
  assert.equal(result.updated, 1);
  assert.equal(item.data.img, "new.webp");
  assert.equal(item.data.system.description.value, "New text");
  assert.equal(item.data.system.uses.value, 1);
  const after = await previewCompendiumSync(pack, { worldItems: [item], actors: [] });
  assert.equal(after.rows[0].status, "conflito");
  assert.deepEqual(after.rows[0].conflicts, ["system.uses"]);
});
