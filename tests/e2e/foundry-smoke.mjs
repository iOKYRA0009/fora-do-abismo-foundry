import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assessFoundryPage, parseE2EOptions } from "../../scripts/diagnostics/e2e-safety.js";
import { classifyDiagnosticSource } from "../../scripts/diagnostics/runtime-capture.js";

const MODULE_ID = "fora-do-abismo-foundry";
const BASE_CASES = ["abertura", "abas", "inicio", "pesquisa", "layout-1366x768", "fechamento"];
const WRITE_CASES = [
  "favoritos", "macros: criar/executar/duplicar/editar/excluir/barra",
  "NPCs/personagens/itens/classes: criar/importar", "Activities/Active Effects/consumo/progressões",
  "mapas/paredes/portas/luzes/sons", "prévia/desfazer/recuperação"
];

async function loadPlaywright() {
  try { return await import("playwright-core"); }
  catch (error) {
    const local = process.env.JARVIS_PLAYWRIGHT_MODULE;
    if (!local) throw new Error(`playwright-core indisponível. Instale a dependência local ou defina JARVIS_PLAYWRIGHT_MODULE. ${error.message}`);
    return import(pathToFileURL(join(resolve(local), "index.mjs")).href);
  }
}

function browserExecutable(option) {
  const options = [option, process.env.JARVIS_BROWSER_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/microsoft-edge", "/usr/bin/chromium"];
  const found = options.find(path => path && existsSync(path));
  if (!found) throw new Error("Navegador Chromium/Edge não encontrado. Informe --browser CAMINHO.");
  return found;
}

function normalizedError(kind, message, source = "", stack = "") {
  const safe = value => String(value ?? "").replace(/(https?:\/\/[^\s?#)]+)[^\s)]*/gi, "$1").slice(0, 5000);
  const entry = { time: new Date().toISOString(), kind, message: safe(message).slice(0, 1200),
    source: safe(source).slice(0, 500), stack: safe(stack) };
  return { ...entry, ...classifyDiagnosticSource(entry) };
}

function initBrowserCapture() {
  const events = [];
  Object.defineProperty(window, "__jarvisE2EEvents", { value: events, configurable: true });
  window.addEventListener("error", event => {
    if (events.length >= 300) events.shift();
    events.push({ kind: "javascript", message: String(event.message ?? "Erro ao carregar recurso").slice(0, 1200),
      source: String(event.filename ?? event.target?.src ?? "").slice(0, 500),
      stack: String(event.error?.stack ?? "").slice(0, 5000) });
  }, true);
  window.addEventListener("unhandledrejection", event => {
    if (events.length >= 300) events.shift();
    events.push({ kind: "unhandled-rejection", message: String(event.reason?.message ?? event.reason ?? "Promessa rejeitada").slice(0, 1200),
      source: "", stack: String(event.reason?.stack ?? "").slice(0, 5000) });
  });
}

async function pageState(page) {
  return page.evaluate(() => ({ pathname: location.pathname,
    worldId: globalThis.game?.world?.id ?? globalThis.game?.world?.data?.id ?? null,
    ready: globalThis.game?.ready === true,
    title: document.title }));
}

async function joinVerifiedWorld(page, options) {
  if (!options.user) return false;
  await page.getByRole("button", { name: /join game session/i }).waitFor({ state: "visible", timeout: 20_000 });
  const select = page.locator('select[name="userid"], select#userid, select#join-username').first();
  if (await select.count() !== 1) throw new Error("Seletor de usuário não encontrado na página de entrada.");
  await select.selectOption({ label: options.user });
  const password = page.locator('input[name="password"], input#password, input#join-password').first();
  if (await password.count()) await password.fill(process.env[options.passwordEnv] ?? "");
  const submit = page.getByRole("button", { name: /join game session/i }).first();
  if (await submit.count() !== 1) throw new Error("Botão de entrada não encontrado.");
  await submit.click();
  await page.waitForURL(/\/game(?:\/|$)/, { timeout: 20_000 });
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 30_000 });
  return true;
}

async function runSmoke(page, report) {
  const result = (id, status, detail) => report.cases.push({ id, status, detail: String(detail ?? "") });
  const check = async (id, operation) => {
    try { result(id, "pass", await operation()); }
    catch (error) {
      report.errors.push(normalizedError("assertion", error.message, "", error.stack));
      result(id, "fail", error.message);
    }
  };

  await check("abertura", async () => {
    await page.evaluate(id => { const api = game.modules.get(id)?.api; if (!api?.ui?.open) throw new Error("API Jarvis indisponível."); api.ui.open(); }, MODULE_ID);
    await page.locator(".jarvis-console").waitFor({ state: "visible", timeout: 10_000 });
    return "Central aberta no Foundry real.";
  });
  if (report.cases.at(-1)?.status !== "pass") {
    for (const id of BASE_CASES.slice(1)) result(id, "not-tested", "A Central não abriu.");
    return;
  }

  await check("abas", async () => {
    const tabs = page.locator(".jarvis-console [data-jarvis-tab]");
    const ids = await tabs.evaluateAll(nodes => nodes.map(node => node.dataset.jarvisTab));
    if (!ids.length) throw new Error("Nenhuma aba encontrada.");
    if (report.environment.role === "gm" && ids.join(",") !== "executor,library,characters,scenes,appearances,system") {
      throw new Error(`Navegação do Mestre incompleta: ${ids.join(", ")}.`);
    }
    for (const id of ids) {
      await page.locator(`.jarvis-console [data-jarvis-tab="${id}"]`).click();
      if (await page.locator(`.jarvis-console [data-jarvis-tab="${id}"]`).getAttribute("aria-selected") !== "true") {
        throw new Error(`A aba ${id} não ficou selecionada.`);
      }
      if (!await page.locator(`.jarvis-console [data-jarvis-panel="${id}"]`).isVisible()) {
        throw new Error(`O painel ${id} não apareceu.`);
      }
    }
    return `${ids.length} abas percorridas: ${ids.join(", ")}.`;
  });

  await check("inicio", async () => {
    const expected = report.environment.role === "gm" ? "executor" : "library";
    await page.locator(`.jarvis-console [data-jarvis-tab="${expected}"]`).click();
    if (!await page.locator(`.jarvis-console [data-jarvis-panel="${expected}"]`).isVisible()) {
      throw new Error(`Página inicial ${expected} ausente.`);
    }
    if (expected === "executor") {
      if (!await page.locator('.jarvis-console [name="executor-source"]').isVisible()) {
        throw new Error("Editor do Executor ausente.");
      }
      if (!await page.locator('.jarvis-console [data-jarvis-executor-preview]').isVisible()) {
        throw new Error("Prévia do Executor ausente.");
      }
    }
    if (!await page.locator(".jarvis-console [data-jarvis-favorites]").count()) {
      throw new Error("Favoritos da Biblioteca ausentes.");
    }
    return `${expected} disponível com favoritos preservados.`;
  });

  await check("pesquisa", async () => {
    const input = page.locator(".jarvis-console [data-jarvis-global-search]");
    await input.fill("mapa");
    await page.locator(".jarvis-console [data-jarvis-search-index]").first().waitFor({ state: "visible", timeout: 5000 });
    const count = await page.locator(".jarvis-console [data-jarvis-search-index]").count();
    await input.fill("");
    return `${count} resultado(s) na busca global.`;
  });

  await check("layout-1366x768", async () => {
    const box = await page.locator(".jarvis-console").boundingBox();
    if (!box || box.x < -1 || box.y < -1 || box.x + box.width > 1367 || box.y + box.height > 769) {
      throw new Error("A Central excedeu a área útil de 1366 × 768.");
    }
    return `Central visível em ${Math.round(box.width)} × ${Math.round(box.height)}.`;
  });

  await check("fechamento", async () => {
    const close = page.locator('button[data-action="close"]:visible').last();
    if (!await close.count()) throw new Error("Botão Fechar não encontrado.");
    await close.click();
    await page.locator(".jarvis-console").waitFor({ state: "detached", timeout: 5000 });
    return "Central fechada pelo botão da interface.";
  });
}

async function saveReport(report, path) {
  const target = resolve(join(tmpdir(), "JarvisE2E", path ?? `jarvis-e2e-${Date.now()}.json`));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return target;
}

async function main() {
  const options = parseE2EOptions(process.argv.slice(2));
  const report = { generatedAt: new Date().toISOString(), targetWorld: options.world,
    mode: "real-foundry-smoke", status: "not-tested", environment: {}, cases: [], errors: [],
    limitations: ["Sem criação ou modificação de documentos; casos de escrita aparecem como NÃO TESTADO.",
      "A captura no módulo começa após o carregamento; o listener do navegador cobre erros da página desde o início da navegação."] };
  let browser = null;
  let page = null;
  let verifiedWorld = false;
  try {
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ executablePath: browserExecutable(options.browserPath), headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    page = await context.newPage();
    await page.addInitScript(initBrowserCapture);
    page.on("pageerror", error => report.errors.push(normalizedError("javascript", error.message, "", error.stack)));
    page.on("console", message => {
      if (message.type() === "error") report.errors.push(normalizedError("console-error", message.text(), message.location().url));
    });
    page.on("requestfailed", request => report.errors.push(normalizedError("request-failed", request.failure()?.errorText, request.url())));
    page.on("response", response => {
      if (response.status() >= 400) report.errors.push(normalizedError("http-error", `HTTP ${response.status()}`, response.url()));
    });
    await page.goto(options.baseUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    let state = await pageState(page);
    let assessment = assessFoundryPage(state, options.world);
    // The join page does not expose game.world.id in Foundry V14. Joining is
    // read-only; every Jarvis action remains gated on the world ID after login.
    if (assessment.status === "not-tested" && /\/join(?:\/|$)/i.test(state.pathname) && options.user) {
      try {
        if (await joinVerifiedWorld(page, options)) {
          state = await pageState(page);
          assessment = assessFoundryPage(state, options.world);
        }
      } catch (error) {
        assessment = { status: "not-tested", reason: `Não foi possível entrar na cópia de auditoria: ${error.message}` };
      }
    }
    report.environment = { path: state.pathname, worldId: state.worldId, pageTitle: state.title };
    report.status = assessment.status;
    report.reason = assessment.reason;
    if (assessment.status === "ready") {
      verifiedWorld = true;
      report.environment = { ...report.environment, ...await page.evaluate(id => {
        const module = game.modules.get(id);
        return { foundry: game.release?.version ?? null, system: game.system?.id,
          systemVersion: game.system?.version, moduleVersion: module?.version,
          moduleActive: module?.active === true, role: game.user?.isGM ? "gm" : game.user?.role };
      }, MODULE_ID) };
      if (!report.environment.moduleActive) throw new Error("Jarvis não está ativo na cópia de auditoria.");
      await page.evaluate(id => { game.modules.get(id)?.api?.diagnostics?.capture?.start?.(); }, MODULE_ID);
      await runSmoke(page, report);
      report.status = report.cases.some(row => row.status === "fail") ? "fail" : "pass";
      report.reason = "Smoke E2E concluído no mundo isolado.";
      for (const id of WRITE_CASES) report.cases.push({ id, status: "not-tested", detail: "Este runner não altera documentos." });
      for (const role of ["gm", "trusted", "player"]) {
        if (role !== report.environment.role) report.cases.push({ id: `permissões:${role}`, status: "not-tested", detail: "Requer sessão separada desse papel no mundo isolado." });
      }
      const runtimeEvents = await page.evaluate(id => game.modules.get(id)?.api?.diagnostics?.capture?.events?.() ?? [], MODULE_ID);
      for (const event of runtimeEvents) report.errors.push({ ...event, origin: "jarvis-runtime-capture" });
      await page.evaluate(id => { game.modules.get(id)?.api?.diagnostics?.capture?.stop?.(); }, MODULE_ID);
    } else {
      for (const id of [...BASE_CASES, ...WRITE_CASES]) report.cases.push({ id, status: "not-tested", detail: assessment.reason });
    }
    const browserEvents = await page.evaluate(() => globalThis.__jarvisE2EEvents ?? []);
    for (const event of browserEvents) report.errors.push({ ...normalizedError(event.kind, event.message, event.source, event.stack), origin: "browser-init-script" });
    const unique = new Set();
    report.errors = report.errors.filter(event => {
      const key = `${event.kind}|${event.message}|${event.source}|${event.owner}`;
      if (unique.has(key)) return false;
      unique.add(key);
      return true;
    }).slice(0, 500);
    if (report.status === "pass" && report.errors.some(event => event.owner === "jarvis")) {
      report.status = "fail";
      report.reason = "Erros atribuídos ao Jarvis ocorreram durante o smoke E2E.";
    }
  } catch (error) {
    report.status = verifiedWorld ? "fail" : "not-tested";
    report.reason = verifiedWorld ? error.message : `Foundry de teste inacessível: ${error.message}`;
    report.errors.push(normalizedError("runner", error.message, "", error.stack));
    if (!verifiedWorld && !report.cases.length) {
      for (const id of [...BASE_CASES, ...WRITE_CASES]) report.cases.push({ id, status: "not-tested", detail: report.reason });
    }
  } finally {
    if (browser) await browser.close();
    const reportPath = await saveReport(report, options.report);
    console.log(`Jarvis E2E: ${report.status.toUpperCase()} — ${report.reason}`);
    console.log(`Relatório: ${reportPath}`);
    console.log(`Casos: ${report.cases.filter(row => row.status === "pass").length} OK, ${report.cases.filter(row => row.status === "fail").length} falha(s), ${report.cases.filter(row => row.status === "not-tested").length} NÃO TESTADO.`);
  }
  process.exitCode = report.status === "pass" ? 0 : report.status === "not-tested" ? 2 : report.status === "refused" ? 3 : 1;
}

await main();
