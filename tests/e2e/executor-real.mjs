// Real Foundry test. Run only against the isolated jarvis-executor-audit world.
// This runner never starts/stops Foundry or changes another world.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseE2EOptions, assessFoundryPage } from "../../scripts/diagnostics/e2e-safety.js";

const WORLD = "jarvis-executor-audit";
const MODULE = "fora-do-abismo-foundry";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlHd3wAAAAASUVORK5CYII=";

async function playwright() {
  try { return await import("playwright-core"); }
  catch {
    const directory = process.env.JARVIS_PLAYWRIGHT_MODULE;
    if (!directory) throw new Error("playwright-core indisponível; defina JARVIS_PLAYWRIGHT_MODULE.");
    return import(pathToFileURL(join(resolve(directory), "index.mjs")).href);
  }
}

function edge(option) {
  const found = [option, process.env.JARVIS_BROWSER_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(path => path && existsSync(path));
  if (!found) throw new Error("Edge não encontrado; informe --browser CAMINHO.");
  return found;
}

async function state(page) {
  return page.evaluate(() => ({ pathname: location.pathname,
    worldId: globalThis.game?.world?.id ?? null, ready: globalThis.game?.ready === true, title: document.title }));
}

async function joinWorld(page, options) {
  if (!options.user) return false;
  await page.getByRole("button", { name: /join game session/i }).waitFor({ state: "visible", timeout: 20_000 });
  const select = page.locator('select[name="userid"], select#userid, select#join-username').first();
  if (await select.count() !== 1) return false;
  await select.selectOption({ label: options.user });
  const password = page.locator('input[name="password"], input#password, input#join-password').first();
  if (await password.count()) await password.fill(process.env[options.passwordEnv] ?? "");
  const submit = page.getByRole("button", { name: /join game session/i }).first();
  if (await submit.count() !== 1) return false;
  await submit.click();
  await page.waitForURL(/\/game(?:\/|$)/, { timeout: 20_000 });
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 30_000 });
  return true;
}

async function save(report, name) {
  const path = join(tmpdir(), "JarvisE2E", name ?? `executor-real-${Date.now()}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", encoding: "utf8" });
  return path;
}

async function main() {
  const options = parseE2EOptions(process.argv.slice(2));
  if (options.world !== WORLD) throw new Error(`Este runner exige --world ${WORLD}.`);
  const report = { at: new Date().toISOString(), world: WORLD, status: "not-tested", cases: [],
    errors: [], notes: ["Som, papéis de jogador e falha forçada de upload exigem testes separados.",
      "Uploads de imagens permanecem no armazenamento mesmo após reversão dos documentos."] };
  let browser;
  try {
    const { chromium } = await playwright();
    browser = await chromium.launch({ executablePath: edge(options.browserPath), headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.on("pageerror", error => report.errors.push(`JS: ${error.message}`));
    await page.goto(options.baseUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    let current = await state(page);
    let assessment = assessFoundryPage(current, WORLD);
    // Foundry V14 does not expose game.world.id on /join. No module action
    // occurs until the exact world is confirmed after this read-only login.
    if (/\/join(?:\/|$)/.test(current.pathname) && options.user) {
      if (await joinWorld(page, options)) {
        current = await state(page);
        assessment = assessFoundryPage(current, WORLD);
      }
    }
    report.environment = current;
    if (assessment.status !== "ready") {
      report.status = assessment.status;
      report.reason = assessment.reason;
      return;
    }
    const environment = await page.evaluate(id => {
      const module = game.modules.get(id);
      return { generation: game.release?.generation, foundry: game.release?.version,
        system: game.system?.id, systemVersion: game.system?.version,
        moduleActive: module?.active === true, gm: game.user?.isGM === true,
        activeGM: game.users?.activeGM?.id === game.user?.id };
    }, MODULE);
    report.environment = { ...current, ...environment };
    if (environment.generation !== 14 || environment.system !== "dnd5e"
      || environment.systemVersion !== "6.0.6" || !environment.moduleActive
      || !environment.gm || !environment.activeGM) {
      report.status = "refused";
      report.reason = "Foundry V14, D&D5e 6.0.6, Jarvis ativo e Mestre ativo são obrigatórios.";
      return;
    }

    // All writes happen inside this page function, which repeats the guard
    // immediately before preview, execution and rollback.
    const result = await page.evaluate(async ({ world, moduleId, png }) => {
      const cases = [];
      const assertSafe = () => {
        if (location.pathname !== "/game" || game?.world?.id !== world || game?.ready !== true
          || game?.release?.generation !== 14 || game?.system?.id !== "dnd5e"
          || game?.system?.version !== "6.0.6" || !game?.user?.isGM
          || game?.users?.activeGM?.id !== game.user.id || !game?.modules?.get(moduleId)?.active) {
          throw new Error("Proteção E2E: mundo/versão/permissão mudou; nenhuma nova escrita será feita.");
        }
      };
      const check = (id, condition, detail) => cases.push({ id, status: condition ? "pass" : "fail", detail });
      assertSafe();
      const api = game.modules.get(moduleId).api;
      if (!api?.executor?.preview || !api?.executor?.run || !api?.executor?.rollback) {
        throw new Error("API Executor indisponível no módulo instalado.");
      }
      const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? String(Date.now());
      const actorName = `JARVIS E2E ${suffix} NPC`;
      const sceneName = `JARVIS E2E ${suffix} Mapa`;
      const asset = id => `asset://${id}`;
      const assets = ["portrait", "token", "weapon", "ability", "map"].map(id => ({
        id, fileName: `${id}.png`, mimeType: "image/png", dataBase64: png
      }));
      const actor = { schemaVersion: "9.0", actor: { name: actorName, type: "npc",
        img: asset("portrait"), prototypeToken: { texture: { src: asset("token") }, width: 1, height: 1 },
        jarvis: { abilities: { str: 14, dex: 12, con: 14, int: 10, wis: 11, cha: 8 },
          hp: { value: 32, max: 32 }, ac: 15, movement: { walk: 30, units: "ft" },
          skills: { prc: 1, ste: 1 }, saves: ["str"] } },
        items: [
          { name: `Espada ${suffix}`, type: "weapon", img: asset("weapon"), jarvis: {
            activities: [{ type: "attack", name: "Golpe", img: asset("weapon"),
              activation: { type: "action", value: 1 },
              attack: { ability: "str", type: { value: "melee", classification: "weapon" } },
              damage: { parts: ["1d8 + @mod"] } }] } },
          { name: `Vigília ${suffix}`, type: "feat", img: asset("ability"), jarvis: {
            activities: [{ type: "utility", name: "Vigiar", img: asset("ability") }] } },
          { name: `Investida ${suffix}`, type: "feat", img: asset("ability"), jarvis: {
            activities: [{ type: "attack", name: "Investir", img: asset("ability"),
              attack: { ability: "str", type: { value: "melee", classification: "weapon" } },
              damage: { parts: ["1d6 + @mod"] } }] } },
          { name: `Disciplina ${suffix}`, type: "feat", img: asset("ability"), jarvis: {
            activities: [{ type: "utility", name: "Concentrar", img: asset("ability") }] } },
          { name: `Armadura ${suffix}`, type: "equipment", img: asset("weapon") }
        ], effects: [] };
      const scene = { schemaVersion: "1.0", scene: { name: sceneName,
        columns: 12, rows: 10, grid: { size: 100, distance: 5, units: "ft" },
        backgroundSrc: asset("map"), visualMode: true },
        walls: [{ a: [1, 1], b: [8, 1], type: "wall" },
          { a: [8, 1], b: [8, 3], type: "door", state: "closed" }],
        lights: [{ x: 5, y: 4, dim: 20, bright: 10 }],
        tokens: [{ actor: actorName, x: 4, y: 6, width: 1, height: 1 }] };
      const pkg = { schemaVersion: "jarvis-executor-1", name: `Jarvis E2E ${suffix}`,
        assets, actors: [actor], scenes: [scene] };
      const source = JSON.stringify(pkg);
      const plan = api.executor.preview(source, { mode: "package" });
      check("prévia", plan.review?.actors?.length === 1 && plan.review?.scenes?.length === 1
        && plan.review?.images?.length === 5 && plan.review?.scenes?.[0]?.positions?.tokens?.[0]?.x === 400,
      "NPC, mapa, cinco imagens e token em x=400 px.");
      if (cases.at(-1).status !== "pass") return { cases, executionId: null };
      assertSafe();
      const execution = await api.executor.run(plan);
      const createdActor = game.actors.get(execution.actors?.[0]?.id);
      const createdScene = game.scenes.get(execution.scenes?.[0]?.id);
      let rollback = null;
      try {
      const entries = createdActor?.items?.contents ?? [];
      const values = collection => Array.isArray(collection?.contents) ? collection.contents
        : typeof collection?.values === "function" ? Array.from(collection.values())
          : Object.values(collection ?? {});
      const activities = entries.flatMap(item => values(item.system?.activities));
      check("A NPC completo", Boolean(createdActor && createdActor.system?.abilities?.str?.value === 14
        && createdActor.system?.attributes?.hp?.max === 32 && entries.length >= 5
        && activities.length >= 4), "Atributos, PV, equipamento e Activities nativas.");
      const walls = createdScene?.walls?.contents ?? [];
      const token = createdScene?.tokens?.contents?.[0];
      check("B mapa", Boolean(createdScene && walls.length === 2
        && walls.some(wall => wall.door !== 0) && createdScene.lights?.size === 1
        && token?.actorId === createdActor?.id && token?.x === 400 && token?.y === 600),
      "Parede, porta, luz e token vinculados em coordenadas exatas.");
      const images = execution.images ?? {};
      const background = createdScene?.tiles?.contents?.find(tile => tile.getFlag?.(moduleId, "sceneBackground"));
      check("C imagens", Boolean(Object.keys(images).length === 5
        && createdActor?.img === images.portrait
        && createdActor?.prototypeToken?.texture?.src === images.token
        && entries.some(item => item.img === images.weapon)
        && activities.some(activity => activity.img === images.ability || activity.img === images.weapon)
        && background?.texture?.src === images.map),
      "Retrato, token, ícones e mapa apontam para uploads reais.");
      let appearance = null;
      let transformation = null;
      try { appearance = api.appearance?.status?.() ?? null; } catch { /* optional integration */ }
      try { transformation = api.transformation?.status?.() ?? null; } catch { /* optional integration */ }
      cases.push({ id: "D integrações", status: appearance && transformation ? "pass" : "not-tested",
        detail: `Visage: ${appearance?.active ?? "indisponível"}; Metamorph: ${transformation?.active ?? "indisponível"}.` });
      const activity = activities.find(entry => entry.type === "attack" && typeof entry.rollAttack === "function");
      let roll = { status: "not-tested", detail: "API rollAttack não encontrada no D&D5e 6.0.6." };
      if (activity) {
        try {
          const result = await Promise.race([activity.rollAttack({ configure: false, dialog: false }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("tempo excedido")), 5000))]);
          roll = { status: result ? "pass" : "not-tested", detail: result ? "Activity de ataque rolou no Foundry." : "Activity não retornou rolagem." };
        } catch (error) { roll = { status: "not-tested", detail: `Rolagem não confirmada: ${error.message}` }; }
      }
      cases.push({ id: "A rolagem Activity", ...roll });
      const rejected = callback => { try { callback(); return false; } catch { return true; } };
      check("E JSON inválido", rejected(() => api.executor.preview("{invalido", { mode: "package" })), "JSON inválido recusado.");
      const missing = structuredClone(pkg);
      missing.scenes[0].scene.name += " sem imagem";
      missing.actors[0].actor.name += " sem imagem";
      missing.scenes[0].tokens[0].actor = missing.actors[0].actor.name;
      missing.assets = [];
      check("E asset ausente", rejected(() => api.executor.preview(JSON.stringify(missing), { mode: "package" })), "asset:// não declarado recusado.");
      check("E duplicação", rejected(() => api.executor.preview(source, { mode: "package" })), "Nomes já criados recusados.");
      } catch (error) {
        cases.push({ id: "inspeção após importação", status: "fail", detail: error.message });
      } finally {
      // Rollback can delete only documents tagged by this execution; it never
      // removes pre-existing campaign documents or uploaded image files.
        try {
          assertSafe();
          rollback = await api.executor.rollback(execution.executionId);
          check("E reversão", rollback.ok && !game.actors.get(createdActor?.id)
            && !game.scenes.get(createdScene?.id), "Apenas NPC e cena deste teste foram revertidos; imagens permanecem.");
        } catch (error) {
          cases.push({ id: "E reversão", status: "fail", detail: error.message });
        }
      }
      return { cases, executionId: execution.executionId, imagesRemaining: rollback?.imagesRemaining ?? execution.images };
    }, { world: WORLD, moduleId: MODULE, png: PNG });
    report.cases = result.cases;
    report.executionId = result.executionId;
    report.imagesRemaining = result.imagesRemaining;
    report.cases.push({ id: "E permissões de jogador", status: "not-tested",
      detail: "Exige sessão separada com conta de jogador no mundo isolado." });
    report.cases.push({ id: "E falha forçada de upload", status: "not-tested",
      detail: "Não se altera FilePicker do Foundry real para simular falha." });
    report.status = report.cases.some(entry => entry.status === "fail") ? "fail" : "pass";
    report.reason = "Casos reais do Executor concluídos no mundo isolado.";
  } catch (error) {
    report.status = report.status === "refused" ? "refused" : "fail";
    report.reason = error.message;
    report.errors.push(String(error.stack ?? error).slice(0, 3000));
  } finally {
    if (browser) await browser.close();
    const path = await save(report, options.report);
    console.log(`Executor E2E: ${report.status.toUpperCase()} — ${report.reason ?? "sem resultado"}`);
    console.log(`Relatório: ${path}`);
    process.exitCode = report.status === "pass" ? 0 : report.status === "not-tested" ? 2 : 1;
  }
}

await main();
