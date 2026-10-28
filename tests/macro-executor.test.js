import test from "node:test";
import assert from "node:assert/strict";
import { previewJarvisExecution, runJarvisExecution, listJarvisExecutionHistory,
  rollbackJarvisExecution, EXECUTOR_VERSION } from "../scripts/macros/macro-executor.js";

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlHd3wAAAAASUVORK5CYII=";

function actorPayload(name = "Guarda") {
  return {
    schemaVersion: "9.0",
    actor: { name, type: "npc", img: "asset://portrait", prototypeToken: {
      texture: { src: "asset://portrait" }
    }, jarvis: { abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 11, cha: 8 },
      hp: { value: 32, max: 32 }, ac: 15 } },
    items: [{
      name: "Espada", type: "weapon", img: "asset://sword",
      jarvis: { activities: [{
        type: "attack", name: "Golpe", img: "asset://sword"
      }] }
    }],
    effects: []
  };
}
function sceneBlueprint() {
  return {
    schemaVersion: "1.0",
    scene: { name: "Cena de Teste", columns: 12, rows: 10, grid: { size: 100 } },
    walls: [{ a: [1,1], b:[9,1], type:"wall" }],
    lights: [{ x: 4, y: 4, dim: 20, bright: 10 }],
    tokens: [{ actor: "Guarda", x: 4, y: 6 }]
  };
}
function packageData({ actor = true, scene = true, assets = true } = {}) {
  return {
    schemaVersion: EXECUTOR_VERSION,
    name: "Cena de teste completa",
    actors: actor ? [actorPayload()] : [],
    scenes: scene ? [sceneBlueprint()] : [],
    assets: assets ? [
      { id:"portrait", fileName:"portrait.png", mimeType:"image/png", dataBase64:PNG_1PX },
      { id:"sword", fileName:"sword.png", mimeType:"image/png", dataBase64:PNG_1PX }
    ] : []
  };
}
function actorWithoutAssets(name = "Guarda") {
  const actor = actorPayload(name);
  delete actor.actor.img;
  delete actor.actor.prototypeToken;
  actor.items = [];
  return actor;
}
function setup() {
  const registry = { actors: [], scenes: [] };
  globalThis.game = {
    user: { id:"gm", isGM:true },
    users: { activeGM: { id:"gm" } },
    actors: { contents: registry.actors },
    scenes: { contents: registry.scenes }
  };
  globalThis.ui = { notifications: {} };
  globalThis.canvas = { scene: null };
  globalThis.foundry = { utils: { randomID: () => "abcd01234567" } };
  return registry;
}
test("unified executor previews NPC, Item/Activity icons, walls, lights and token position without modifying game", () => {
  const registry = setup();
  const plan = previewJarvisExecution(JSON.stringify(packageData()));
  assert.equal(plan.review.actors[0].items, 1);
  assert.equal(plan.review.actors[0].activities, 1);
  assert.equal(plan.review.scenes[0].name, "Cena de Teste");
  assert.equal(plan.review.scenes[0].walls, 1);
  assert.equal(plan.review.scenes[0].tokens, 1);
  assert.deepEqual(plan.review.scenes[0].positions.tokens[0], {
    index:0, actor:"Guarda", x:400, y:600, width:null, height:null
  });
  assert.equal(plan.review.images.length, 2);
  assert.deepEqual(registry.actors, []);
  assert.deepEqual(registry.scenes, []);
});

test("multi-megabyte embedded map base64 previews without JavaScript call stack overflow", () => {
  setup();
  // Valid PNG header plus a large payload makes a ~4.8 MB base64 field.
  // This specifically reproduces the 1.2.2 stack overflow before decoding.
  const bigBytes = Buffer.concat([
    Buffer.from(PNG_1PX, "base64"),
    Buffer.alloc(3_610_000, 0x5a)
  ]);
  const bigData = bigBytes.toString("base64");
  const pkg = {
    schemaVersion: EXECUTOR_VERSION,
    name: "Mapa grande com base64",
    assets: [{ id: "mapa", fileName: "mapa.png", mimeType: "image/png", dataBase64: bigData }],
    scenes: [{ schemaVersion: "1.0",
      scene: { name: "Cena grande", columns: 20, rows: 16, grid: { size: 100 },
        visualMode: true, backgroundSrc: "asset://mapa" } }]
  };
  assert.ok(bigData.length > 4_800_000);
  const plan = previewJarvisExecution(JSON.stringify(pkg));
  assert.equal(plan.review.images.length, 1);
  assert.equal(plan.review.images[0].size, bigBytes.length);
  assert.equal(plan.review.scenes[0].name, "Cena grande");
  // Invalid middle padding must still be rejected by the non-recursive validator.
  pkg.assets[0].dataBase64 = "AQ=I";
  assert.throws(() => previewJarvisExecution(JSON.stringify(pkg)), /base64 inválido/);
});

test("executor rejects missing images, duplicate NPCs, non-V9 payload and existing scenes before changing documents", () => {
  const registry = setup();
  const missing = packageData();
  missing.assets.pop();
  assert.throws(() => previewJarvisExecution(JSON.stringify(missing)), /falta declarar.*sword/);
  const duplicate = packageData();
  duplicate.actors.push(actorPayload());
  assert.throws(() => previewJarvisExecution(JSON.stringify(duplicate)), /duplicado/);
  const bad = packageData();
  bad.actors[0].schemaVersion = "8.0";
  assert.throws(() => previewJarvisExecution(JSON.stringify(bad)), /V9 recusou/);
  registry.scenes.push({ name:"Cena de Teste" });
  assert.throws(() => previewJarvisExecution(JSON.stringify(packageData())), /já existe/);
});

test("item additions to an existing Actor are blocked before upload or mutation", () => {
  const registry = setup();
  let mutations = 0;
  const priorItem = { id: "prior-item", name: "Item oficial", type: "feat", flags: { official: true } };
  const prior = { id: "prior-actor", name: "Personagem oficial", items: { contents: [priorItem] },
    flags: { official: true },
    async update() { mutations += 1; },
    async updateEmbeddedDocuments() { mutations += 1; },
    async createEmbeddedDocuments() { mutations += 1; } };
  registry.actors.push(prior);
  const before = structuredClone({ flags: prior.flags, item: priorItem, scenes: registry.scenes });
  const pkg = { schemaVersion: EXECUTOR_VERSION,
    itemAdditions: [{ actor: prior.name, items: [{ name: "Item novo", type: "feat" }] }] };
  assert.throws(() => previewJarvisExecution(JSON.stringify(pkg)), /não é seguro adicionar itens ao personagem existente/);
  assert.equal(mutations, 0);
  assert.equal(registry.actors.length, 1);
  assert.equal(registry.actors[0], prior);
  assert.deepEqual({ flags: prior.flags, item: priorItem, scenes: registry.scenes }, before);
  assert.deepEqual(listJarvisExecutionHistory(), []);
});

test("item additions remain available for an Actor created in the same package", () => {
  setup();
  const pkg = { schemaVersion: EXECUTOR_VERSION, actors: [actorWithoutAssets("Personagem novo")],
    itemAdditions: [{ actor: "Personagem novo", items: [{ name: "Item novo", type: "feat" }] }] };
  const plan = previewJarvisExecution(JSON.stringify(pkg));
  assert.deepEqual(plan.review.itemAdditions, [{ actor: "Personagem novo", items: 1 }]);
});

test("Visage and Metamorph profiles are reviewed, stored through existing APIs and removed with the new Actor", async () => {
  const registry = setup();
  game.modules = new Map([
    ["visage", { active: true, version: "1.0", api: {} }],
    ["metamorph", { active: true, version: "2.0", api: {} }]
  ]);
  const target = { id: "prior-target", name: "Lobo existente", flags: { official: true } };
  registry.actors.push(target);
  const pkg = { schemaVersion: EXECUTOR_VERSION, actors: [actorWithoutAssets("Novo herói")],
    appearanceProfiles: [{ actor: "Novo herói", key: "Sombra", visageId: "skin-1", mode: "overlay", label: "Sombra" }],
    transformationProfiles: [{ actor: "Novo herói", key: "Lobo", targetActor: target.name,
      hpMode: "keep-original" }] };
  const plan = previewJarvisExecution(JSON.stringify(pkg));
  assert.equal(plan.review.counts.appearanceProfiles, 1);
  assert.equal(plan.review.counts.transformationProfiles, 1);
  assert.equal(plan.review.integrations.visage.version, "1.0");
  assert.equal(plan.review.integrations.metamorph.version, "2.0");
  assert.match(plan.review.warnings.join(" "), /sem aplicar skins automaticamente/);
  const calls = [];
  const api = { importer: { async importActor(payload) {
    const actor = { id: "new-actor", name: payload.actor.name, flags: payload.actor.flags,
      items: [], async delete() { registry.actors.splice(registry.actors.indexOf(this), 1); } };
    registry.actors.push(actor);
    return actor;
  } },
  appearance: { async setProfile(actor, key, visageId, options) {
    calls.push(["visage", actor.id, key, visageId, options.mode]);
  } },
  transformation: { async setProfile(actor, key, targetActor, options) {
    calls.push(["metamorph", actor.id, key, targetActor.id, options.hpMode]);
  } } };
  const result = await runJarvisExecution(plan, api);
  assert.equal(result.appearanceProfiles, 1);
  assert.equal(result.transformationProfiles, 1);
  assert.deepEqual(calls, [
    ["visage", "new-actor", "Sombra", "skin-1", "overlay"],
    ["metamorph", "new-actor", "Lobo", "prior-target", "keep-original"]
  ]);
  const rollback = await rollbackJarvisExecution(result.executionId);
  assert.equal(rollback.ok, true);
  assert.deepEqual(registry.actors, [target]);
  assert.deepEqual(target.flags, { official: true });
});

test("profile validation rejects malformed, duplicate, unavailable and existing-Actor writes before import", async () => {
  const registry = setup();
  let imports = 0;
  const prior = { id: "prior", name: "Personagem oficial", items: { contents: [] } };
  registry.actors.push(prior);
  game.modules = new Map([
    ["visage", { active: true, version: "1.0", api: {} }],
    ["metamorph", { active: true, version: "2.0", api: {} }]
  ]);
  const base = { schemaVersion: EXECUTOR_VERSION, actors: [actorWithoutAssets("Novo herói")] };
  assert.throws(() => previewJarvisExecution(JSON.stringify({ ...base,
    appearanceProfiles: [{ actor: prior.name, key: "sombra", visageId: "skin-1" }] })), /personagem criado no mesmo pacote/);
  assert.throws(() => previewJarvisExecution(JSON.stringify({ ...base,
    appearanceProfiles: [{ actor: "Novo herói", key: "sombra", visageId: "skin-1", mode: "inexistente" }] })), /mode/);
  assert.throws(() => previewJarvisExecution(JSON.stringify({ ...base,
    appearanceProfiles: [{ actor: "Novo herói", key: "Sombra", visageId: "skin-1" },
      { actor: "Novo herói", key: "sombra", visageId: "skin-2" }] })), /perfil duplicado/);
  assert.throws(() => previewJarvisExecution(JSON.stringify({ ...base,
    transformationProfiles: [{ actor: "Novo herói", key: "forma", targetActor: "Alvo ausente" }] })), /Actor alvo.*não encontrado/);
  assert.throws(() => previewJarvisExecution(JSON.stringify({ ...base,
    visageProfiles: [{ actor: "Novo herói", key: "sombra", visageId: "skin-1" }] })), /campo de integração.*desconhecido/);
  const valid = { ...base, appearanceProfiles: [{ actor: "Novo herói", key: "sombra", visageId: "skin-1" }] };
  const plan = previewJarvisExecution(JSON.stringify(valid));
  game.modules.get("visage").active = false;
  assert.throws(() => previewJarvisExecution(JSON.stringify(valid)), /Visage precisa estar ativo/);
  await assert.rejects(runJarvisExecution(plan, { importer: { async importActor() { imports += 1; } },
    appearance: { setProfile() { throw new Error("não deve executar"); } } }), /Visage precisa estar ativo/);
  assert.equal(imports, 0);
  assert.deepEqual(registry.actors, [prior]);
  assert.deepEqual(listJarvisExecutionHistory(), []);
});

test("invalid images and missing file are rejected before execution", () => {
  setup();
  const pkg = packageData();
  pkg.assets = [{ id:"portrait", fileName:"portrait.png" }, { id:"sword", fileName:"sword.png" }];
  assert.throws(() => previewJarvisExecution(JSON.stringify(pkg)), /selecione o arquivo/);
  pkg.assets[0].dataBase64="%%";pkg.assets[0].mimeType="image/png";
  assert.throws(() => previewJarvisExecution(JSON.stringify(pkg)), /base64 inválido/);
});

test("executor imports complete Actors and built Scenes, retaining image refs in Items and Activities", async () => {
  const registry = setup(), events = [];
  globalThis.File = class {
    constructor(parts, name, options) { this.parts=parts; this.name=name; this.type=options.type; }
  };
  globalThis.foundry.applications = { apps: { FilePicker: {
    browse: async () => ({}),
    createDirectory: async () => ({}),
    upload: async (_source, directory, file) => {
      events.push(["upload", file.name]);
      return { path: `${directory}/${file.name}` };
    }
  } } };
  globalThis.atob = value => Buffer.from(value, "base64").toString("latin1");
  const api = {
    importer: {
      async importActor(payload) {
        events.push(["actor",payload.actor.name, payload.actor.img, payload.items[0].img, payload.items[0].jarvis.activities[0].img]);
        assert.equal(payload.actor.prototypeToken.texture.src, payload.actor.img);
        const doc = {id:"a-1", name:payload.actor.name, items:{size:1}, async delete(){events.push(["rollback-actor"]);}};
        registry.actors.push(doc); return doc;
      }
    },
    scenes: { async build(blueprint, opts) {
      events.push(["scene", blueprint.scene.name, blueprint.tokens[0].x, blueprint.walls.length, blueprint.lights.length, opts.replaceExisting]);
      const doc={id:"s-1",name:blueprint.scene.name,async delete(){events.push(["rollback-scene"]);}};
      registry.scenes.push(doc);
      return { scene: doc };
    } }
  };
  const plan = previewJarvisExecution(JSON.stringify(packageData()));
  const result = await runJarvisExecution(plan, api);
  assert.equal(result.actors.length, 1);
  assert.equal(result.scenes.length, 1);
  assert.equal(Object.keys(result.images).length, 2);
  assert.equal(events.filter(e=>e[0]==="upload").length,2);
  assert.ok(events.find(e=>e[0]==="actor")[2].startsWith("jarvis-executor-assets/"));
  assert.ok(events.find(e=>e[0]==="actor")[3].startsWith("jarvis-executor-assets/"));
  assert.ok(events.find(e=>e[0]==="actor")[4].startsWith("jarvis-executor-assets/"));
  assert.deepEqual(events.find(e=>e[0]==="scene").slice(2), [4, 1, 1, false]);
});

test("if Scene Builder fails, executor rolls back newly imported Actor", async () => {
  setup();
  const events = [];
  const api = {
    importer: { async importActor(payload) {
      return { id:"a-rollback", name:payload.actor.name, async delete() { events.push("actor deleted"); } };
    } },
    scenes: { async build() { throw new Error("A criação de cena falhou"); } }
  };
  const basicActor = actorPayload();
  basicActor.items = [];
  delete basicActor.actor.img;
  delete basicActor.actor.prototypeToken;
  const plan = previewJarvisExecution(JSON.stringify({ ...packageData({ assets:false }), actors: [basicActor], scenes:[sceneBlueprint()] }));
  await assert.rejects(runJarvisExecution(plan,api),/criação de cena falhou/);
  assert.deepEqual(events,["actor deleted"]);
});

test("pasted JavaScript executes in GM context; players cannot preview or run it", async () => {
  setup();
  const plan=previewJarvisExecution("return jarvis.version + ':' + game.user.id", { mode:"javascript" });
  assert.match(plan.review.warning,/permissões/);
  const result=await runJarvisExecution(plan, { version:"demo" });
  assert.equal(result.output,"demo:gm");
  game.user={ id:"p",isGM:false };
  assert.throws(()=>previewJarvisExecution("return 1",{mode:"javascript"}),/Mestre/);
  await assert.rejects(runJarvisExecution(plan,{version:"demo"}),/Mestre/);
});

test("preview blocks incomplete actors and invalid scene coordinates before any upload", () => {
  setup();
  const incomplete = { schemaVersion: EXECUTOR_VERSION, actors: [{
    schemaVersion: "9.0", actor: { name: "Sem atributos", type: "npc" }, items: []
  }] };
  assert.throws(() => previewJarvisExecution(JSON.stringify(incomplete)), /seis atributos/);
  const invalid = { schemaVersion: EXECUTOR_VERSION, actors: [actorWithoutAssets()], scenes: [sceneBlueprint()] };
  invalid.scenes[0].tokens[0].x = null;
  assert.throws(() => previewJarvisExecution(JSON.stringify(invalid)), /células da grade/);
  invalid.scenes[0].tokens[0].x = 12;
  assert.throws(() => previewJarvisExecution(JSON.stringify(invalid)), /fora da área/);
});

test("attached image contents are checked before any file is uploaded", async () => {
  setup();
  let uploads = 0;
  globalThis.foundry.applications = { apps: { FilePicker: {
    browse: async () => ({ files: [] }), createDirectory: async () => ({}),
    upload: async () => { uploads += 1; return { path: "jarvis-executor-assets/test.png" }; }
  } } };
  const actor = actorPayload();
  actor.items = [];
  const pkg = { schemaVersion: EXECUTOR_VERSION, actors: [actor], assets: [{ id: "portrait", fileName: "portrait.png" }] };
  const file = { name: "portrait.png", type: "image/png", size: 4,
    async arrayBuffer() { return Uint8Array.of(1,2,3,4).buffer; } };
  const plan = previewJarvisExecution(JSON.stringify(pkg), { files: [file] });
  assert.equal(plan.review.images[0].verified, false);
  await assert.rejects(runJarvisExecution(plan, { importer: { importActor: async () => {} } }), /conteúdo inválido/);
  assert.equal(uploads, 0);
  assert.equal(listJarvisExecutionHistory()[0].status, "failed");
});

test("execution plans cannot be changed after review or executed twice", async () => {
  setup();
  const pkg = { schemaVersion: EXECUTOR_VERSION, actors: [actorWithoutAssets()] };
  const tampered = previewJarvisExecution(JSON.stringify(pkg));
  tampered.data.actors[0].actor.name = "Alterado";
  await assert.rejects(runJarvisExecution(tampered, {}), /mudou depois da prévia/);
  const wrongKind = previewJarvisExecution(JSON.stringify(pkg));
  wrongKind.kind = "javascript";
  await assert.rejects(runJarvisExecution(wrongKind, {}), /mudou depois da prévia/);
  const script = previewJarvisExecution("return 3", { mode: "javascript" });
  assert.equal((await runJarvisExecution(script, {})).output, 3);
  await assert.rejects(runJarvisExecution(script, {}), /realize a prévia/);
});

test("structured execution records created IDs and rolls back only its tagged documents", async () => {
  const registry = setup();
  let flags = [];
  game.user.getFlag = () => flags;
  game.user.setFlag = async (_module, _key, value) => { flags = structuredClone(value); };
  const prior = { id: "a-prior", name: "Personagem oficial", flags: {}, async delete() { throw new Error("não tocar"); } };
  registry.actors.push(prior);
  const pkg = { schemaVersion: EXECUTOR_VERSION, actors: [actorWithoutAssets()] };
  const api = { importer: { async importActor(payload) {
    const actor = { id: "a-new", name: payload.actor.name, flags: payload.actor.flags,
      _stats: { modifiedTime: 100 }, items: [], async delete() {
        registry.actors.splice(registry.actors.indexOf(this), 1);
      } };
    registry.actors.push(actor);
    return actor;
  } } };
  const result = await runJarvisExecution(previewJarvisExecution(JSON.stringify(pkg)), api);
  assert.equal(result.actors[0].id, "a-new");
  assert.equal(listJarvisExecutionHistory()[0].status, "success");
  assert.equal(listJarvisExecutionHistory()[0].actors[0].id, "a-new");
  const reverted = await rollbackJarvisExecution(result.executionId);
  assert.equal(reverted.ok, true);
  assert.deepEqual(reverted.removed.actors, ["a-new"]);
  assert.deepEqual(registry.actors, [prior]);
  assert.equal(listJarvisExecutionHistory()[0].status, "rolled_back");
});

test("manual rollback preserves a created document changed after import", async () => {
  const registry = setup();
  const pkg = { schemaVersion: EXECUTOR_VERSION, actors: [actorWithoutAssets()] };
  const api = { importer: { async importActor(payload) {
    const actor = { id: "a-new", name: payload.actor.name, flags: payload.actor.flags,
      _stats: { modifiedTime: 100 }, items: [], async delete() { throw new Error("must not delete"); } };
    registry.actors.push(actor);
    return actor;
  } } };
  const result = await runJarvisExecution(previewJarvisExecution(JSON.stringify(pkg)), api);
  registry.actors[0]._stats.modifiedTime = 101;
  const rollback = await rollbackJarvisExecution(result.executionId);
  assert.equal(rollback.ok, false);
  assert.match(rollback.skipped[0], /foi alterado/);
  assert.equal(registry.actors.length, 1);
});
