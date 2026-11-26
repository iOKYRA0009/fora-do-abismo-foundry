import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSheetAppearance, getSheetAppearance, setSheetAppearance, applySheetAppearance } from "../scripts/ui/sheet-appearance.js";

function actor(id) {
  let saved;
  return { id, documentName: "Actor", type: "character",
    getFlag: () => saved, setFlag: async (_module, _key, value) => { saved = structuredClone(value); },
    unsetFlag: async () => { saved = undefined; } };
}

test("normalizes default opacity and size, disables explicitly", () => {
  assert.deepEqual(normalizeSheetAppearance({ image: "jarvis-actor-images/orgulho.webp" }),
    { enabled: true, image: "jarvis-actor-images/orgulho.webp", opacity: 0.10, size: 65 });
  assert.equal(normalizeSheetAppearance({ enabled: false }), null);
});

test("rejects external paths, invalid sizes and opacity", () => {
  for (const image of ["https://example.org/a.png", "../a.webp", "/a.png", "a.svg", 'a".png']) {
    assert.throws(() => normalizeSheetAppearance({ image }));
  }
  for (const config of [{ opacity: -1 }, { opacity: 0.9 }, { opacity: NaN }, { size: 101 }]) {
    assert.throws(() => normalizeSheetAppearance({ image: "a.png", ...config }));
  }
});

test("stores themes independently, removal leaves other characters unchanged, players cannot write", async () => {
  const previous = globalThis.game;
  try {
    globalThis.game = { user: { isGM: true } };
    const pride = actor("pride"), wrath = actor("wrath");
    await setSheetAppearance(pride, { image: "pride.png" });
    await setSheetAppearance(wrath, { image: "wrath.webp", opacity: .15 });
    assert.equal(getSheetAppearance(pride).image, "pride.png");
    assert.equal(getSheetAppearance(wrath).opacity, .15);
    await setSheetAppearance(pride, null);
    assert.equal(getSheetAppearance(pride), null);
    assert.equal(getSheetAppearance(wrath).image, "wrath.webp");
    globalThis.game.user.isGM = false;
    await assert.rejects(setSheetAppearance(wrath, null), /Mestre/);
  } finally { globalThis.game = previous; }
});

test("sheet renders one decorative layer, updates and removes it without touching other children", async () => {
  const previous = globalThis.game;
  try {
    globalThis.game = { user: { isGM: true } };
    const a = actor("pride");
    const layers = [];
    const host = {
      matches: () => true,
      querySelectorAll: () => [...layers],
      classList: { add() {}, remove() {} },
      ownerDocument: { createElement: () => ({
        style: {}, setAttribute() {}, remove() { layers.splice(layers.indexOf(this), 1); }
      }) },
      prepend(node) { layers.unshift(node); }
    };
    const root = { matches: selector => selector === ".sheet, .actor", querySelector: () => host };
    const app = { actor: a };
    await setSheetAppearance(a, { image: "pride.png" });
    applySheetAppearance(app, root);
    applySheetAppearance(app, root);
    assert.equal(layers.length, 1);
    assert.equal(layers[0].style.opacity, "0.1");
    assert.equal(layers[0].style.backgroundImage, 'url("pride.png")');
    await setSheetAppearance(a, null);
    applySheetAppearance(app, root);
    assert.equal(layers.length, 0);
  } finally { globalThis.game = previous; }
});
