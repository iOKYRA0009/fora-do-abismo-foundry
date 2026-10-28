import test from "node:test";
import assert from "node:assert/strict";
import { importJarvisActorWithImage, uploadJarvisActorImage } from "../scripts/ui/actor-import-with-image.js";

const payload = {
  schemaVersion: "9.0",
  actor: { name: "Sentinela", type: "npc", img: "icons/svg/mystery-man.svg",
    jarvis: { hp: { value: 32, max: 32 }, ac: 15, abilities: {
      str: 14, dex: 12, con: 14, int: 10, wis: 11, cha: 8
    } } },
  items: [{ name: "Espada", type: "weapon", jarvis: { activities: [
    { type: "attack", name: "Golpe com espada" }
  ] } }],
  effects: []
};

function fakePicker() {
  const actions = [];
  const picker = {
    async browse(source, path) { actions.push(["browse", source, path]); },
    async createDirectory() { throw new Error("No directory create should be needed."); },
    async upload(source, directory, file, body, options) {
      actions.push(["upload", source, directory, file.name, file.type, options.notify]);
      return { path: `${directory}/${file.name}` };
    }
  };
  return { picker, actions };
}

test("V9 Actor import attaches a local portrait while retaining Items, Activities and attributes", async () => {
  let received;
  const importer = { async importActor(data, options) {
    received = { data, options };
    return { id: "new-actor", name: data.actor.name, img: data.actor.img };
  } };
  globalThis.foundry = { utils: { randomID: () => "abcdefgh1234" } };
  const { picker, actions } = fakePicker();
  const image = new File([new Uint8Array([1, 2, 3])], "sentinela.webp", { type: "image/webp" });
  const actor = await importJarvisActorWithImage(JSON.stringify(payload), { imageFile: image, picker, importer });
  assert.equal(actor.id, "new-actor");
  assert.match(actor.img, /^jarvis-actor-images\/jarvis-\d+-abcdefgh1234\.webp$/);
  assert.equal(received.data.actor.prototypeToken.texture.src, actor.img);
  assert.equal(received.data.actor.imgStrategy, undefined);
  assert.deepEqual(received.data.actor.jarvis.hp, { value: 32, max: 32 });
  assert.equal(received.data.items.length, 1);
  assert.equal(received.data.items[0].jarvis.activities[0].type, "attack");
  assert.deepEqual(received.options, { renderSheet: true });
  assert.equal(actions.filter(x => x[0] === "upload").length, 1);
  assert.equal(payload.actor.img, "icons/svg/mystery-man.svg", "source data is not mutated");
});

test("a full V9 Actor without a new portrait uses the same importer without upload", async () => {
  const importer = { async importActor(data) { return data.actor; } };
  const actor = await importJarvisActorWithImage(JSON.stringify(payload), { importer });
  assert.equal(actor.img, "icons/svg/mystery-man.svg");
});

test("an invalid V9 payload must be rejected before a portrait is uploaded", async () => {
  const { picker, actions } = fakePicker();
  const importer = { async importActor() { throw new Error("Must not import"); } };
  const image = new File(["abc"], "sentinela.webp", { type: "image/webp" });
  await assert.rejects(importJarvisActorWithImage(JSON.stringify({ actor: payload.actor }), {
    imageFile: image, importer, picker
  }), /schemaVersion/);
  assert.deepEqual(actions, []);
});

test("invalid or oversized portraits are rejected before any upload", async () => {
  const { picker, actions } = fakePicker();
  await assert.rejects(uploadJarvisActorImage({ type: "image/gif", size: 12 }, { picker }), /PNG, JPG ou WebP/);
  await assert.rejects(uploadJarvisActorImage({ type: "image/png", size: 7 * 1024 * 1024 }, { picker }), /6 MB/);
  assert.deepEqual(actions, []);
});

test("a failed upload prevents importing a partial Actor", async () => {
  const { picker } = fakePicker();
  picker.upload = async () => ({ success: false, error: "sem permissão" });
  const image = new File(["content"], "sentinela.png", { type: "image/png" });
  const importer = { async importActor() { throw new Error("Importer was invoked unexpectedly"); } };
  await assert.rejects(importJarvisActorWithImage(JSON.stringify(payload), { imageFile: image, picker, importer }), /sem permissão/);
});
