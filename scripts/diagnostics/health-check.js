import { validateJarvisActorPayload } from "../importer/validators/payload-validator.js";
import { Dnd5eV6Adapter } from "../importer/adapters/dnd5e-adapter.js";
import { suggestRasterWalls } from "../scenes/raster-wall-assist.js";
import { applyLightingPreset } from "../scenes/lighting-presets.js";
import { getJarvisRuntimeCapture } from "./runtime-capture.js";

const MODULE_ID = "fora-do-abismo-foundry";

const ACTOR_SAMPLE = {
  schemaVersion: "9.0",
  actor: {
    name: "Diagnóstico Jarvis (memória)",
    type: "character",
    jarvis: { hp: { value: 8, max: 10 } }
  },
  items: []
};

const SCENE_SAMPLE = {
  schemaVersion: "1.0",
  id: "jarvis-diagnostic-memory",
  scene: { name: "Diagnóstico Jarvis (memória)", columns: 8, rows: 8 },
  walls: [
    { a: [1, 1], b: [2, 1], type: "wall" },
    { a: [2, 1], b: [2, 2], type: "door", state: "closed" }
  ],
  lights: [{ x: 4, y: 4, dim: 15, bright: 5 }],
  sounds: [{ path: "sounds/diagnostic-placeholder.ogg", x: 4, y: 4, radius: 10 }]
};

const UVTT_SAMPLE = {
  format: 0.3,
  resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 8, y: 8 }, pixels_per_grid: 100 },
  line_of_sight: [[{ x: 1, y: 1 }, { x: 2, y: 1 }]],
  portals: [{ bounds: [{ x: 2, y: 1 }, { x: 2, y: 2 }], closed: true }],
  lights: [{ position: { x: 4, y: 4 }, range: 3, intensity: 0.5 }],
  image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/F54AAAAASUVORK5CYII="
};

const API_CONTRACT = [
  "importer.importActor", "importer.importItems", "importer.importFromJson",
  "effects.applyEmbedded", "effects.removeApplied", "appearance.status",
  "transformation.status", "jack.getSoulStatus", "provenance.analyzeActor",
  "rules.analyzeActor", "scenes.validate", "scenes.preview", "scenes.build",
  "scenes.framework.selfTest", "scenes.package.validate", "scenes.package.preview",
  "scenes.package.build", "scenes.package.fromUvtt", "scenes.package.previewUvtt",
  "scenes.package.buildUvtt", "scenes.openStudio", "scenes.suggestRasterWalls", "scenes.lightingPresets",
  "scenes.applyLightingPreset", "scenes.audit", "diagnostics.compareActor"
];

function atPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

export function compareJarvisVersions(left, right) {
  const parse = value => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/i.exec(String(value ?? ""));
    return match ? {
      core: match.slice(1, 4).map(Number),
      stage: match[4] ?? null,
      stageNumber: Number(match[5] ?? 0)
    } : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i += 1) {
    if (a.core[i] !== b.core[i]) return Math.sign(a.core[i] - b.core[i]);
  }
  if (!a.stage && b.stage) return 1;
  if (a.stage && !b.stage) return -1;
  if (a.stage !== b.stage) return null;
  return Math.sign(a.stageNumber - b.stageNumber);
}

/** Runs read-only checks. It never creates, updates, or deletes Foundry documents. */
export async function runJarvisDiagnostics(api, {
  gameRef = globalThis.game,
  inspectActors = true,
  actorLimit = 5,
  checkUpdates = true,
  capture = getJarvisRuntimeCapture()
} = {}) {
  const checks = [];
  const add = (id, status, detail) => checks.push({ id, status, detail: String(detail) });
  const run = async (id, operation) => {
    try {
      add(id, "pass", await operation());
    } catch (error) {
      add(id, "fail", error?.message ?? error);
    }
  };

  const module = gameRef?.modules?.get?.(MODULE_ID);
  if (!module?.active || !api) {
    add("module", "fail", "Jarvis Tools não está ativo neste mundo.");
    return summarize(checks, module?.version ?? null, capture);
  }
  add("module", "pass", `Jarvis Tools ${module.version ?? api.version ?? "sem versão"} ativo.`);

  if (checkUpdates && module.manifest && typeof globalThis.fetch === "function") {
    try {
      const response = await fetch(module.manifest, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const latest = (await response.json()).version;
      const comparison = compareJarvisVersions(latest, module.version);
      if (comparison === null) add("updates", "warn", `Versões não comparáveis: instalada ${module.version}, publicada ${latest}.`);
      else if (comparison > 0) add("updates", "warn", `Atualização disponível: instalada ${module.version}, publicada ${latest}.`);
      else if (comparison < 0) add("updates", "warn", `Versão instalada ${module.version} é mais nova que o manifesto publicado ${latest}.`);
      else add("updates", "pass", `Manifesto publicado e instalação coincidem em ${module.version}.`);
    } catch (error) {
      add("updates", "skip", `Não foi possível consultar o manifesto de atualização: ${error?.message ?? error}.`);
    }
  } else {
    add("updates", "skip", "Manifesto remoto indisponível ou consulta desativada.");
  }

  const generation = Number(gameRef?.release?.generation);
  const systemId = gameRef?.system?.id;
  const systemVersion = String(gameRef?.system?.version ?? "");
  const match = /^6\.0\.(\d+)(?:$|[-+])/.exec(systemVersion);
  if (generation !== 14 || systemId !== "dnd5e" || !match) {
    add("runtime", "fail", `Encontrado Foundry V${generation || "?"} / ${systemId ?? "?"} ${systemVersion || "?"}; esperado V14 / dnd5e 6.0.x.`);
  } else {
    add("runtime", Number(match[1]) > 2 ? "warn" : "pass",
      `Foundry V14 / dnd5e ${systemVersion}; manifesto verificado até 6.0.2.`);
  }

  const missing = API_CONTRACT.filter(path => typeof atPath(api, path) !== "function");
  add("api-legacy", missing.length ? "fail" : "pass",
    missing.length ? `Funções ausentes: ${missing.join(", ")}` : `${API_CONTRACT.length} funções antigas e novas disponíveis.`);

  await run("importer-v9", () => {
    validateJarvisActorPayload(ACTOR_SAMPLE);
    let rejected = false;
    try { validateJarvisActorPayload({ ...ACTOR_SAMPLE, actor: { type: "character" } }); }
    catch { rejected = true; }
    if (!rejected) throw new Error("Payload sem nome passou pela validação.");
    const actor = Dnd5eV6Adapter.adaptActor(ACTOR_SAMPLE.actor);
    if (actor.system?.attributes?.hp?.max !== 10) throw new Error("PV semântico não foi convertido.");
    return "Payload válido aceito, inválido recusado e PV convertido; nenhum Actor criado.";
  });

  await run("scene-builder-v1", async () => {
    api.scenes.validate(SCENE_SAMPLE);
    const preview = await api.scenes.preview(SCENE_SAMPLE);
    if (preview.walls !== 2 || preview.doors !== 1 || preview.lights !== 1 || preview.sounds !== 1) {
      throw new Error("Contagem da prévia V1 divergente.");
    }
    return "Prévia: 2 paredes, 1 porta, 1 luz e 1 som.";
  });

  await run("scene-framework-v2", async () => {
    const result = await api.scenes.framework.selfTest({ checkActors: false });
    if (!result.ok) throw new Error(result.failures.map(item => `${item.type}:${item.key}: ${item.error}`).join("; "));
    if (!result.counts.templates || !result.counts.skins || !result.counts.presets) {
      throw new Error("Templates, skins ou presets ausentes.");
    }
    return `${result.counts.templates} templates, ${result.counts.skins} skins e ${result.counts.presets} presets validados.`;
  });

  await run("scene-package-v1", async () => {
    api.scenes.package.validate(SCENE_SAMPLE);
    const preview = await api.scenes.package.preview(SCENE_SAMPLE);
    if (preview.walls !== 2 || preview.doors !== 1 || preview.sounds !== 1) {
      throw new Error("Contagem da prévia Package divergente.");
    }
    return "Pacote validado com paredes, porta, luz e áudio local; nenhum arquivo enviado.";
  });

  await run("universal-vtt", async () => {
    const { payload, preview } = await api.scenes.package.previewUvtt(UVTT_SAMPLE);
    if (payload.walls.length !== 2 || preview.doors !== 1 || preview.lights !== 1) {
      throw new Error("Conversão ou prévia UVTT divergente.");
    }
    return "UVTT 0.3 convertido e pré-visualizado com parede, porta e luz.";
  });

  await run("map-studio", () => {
    const data = new Uint8ClampedArray(200 * 200 * 4);
    for (let y = 0; y < 200; y += 1) for (let x = 0; x < 200; x += 1) {
      const index = (y * 200 + x) * 4;
      const value = Math.abs(x - 100) <= 2 ? 0 : 255;
      data[index] = data[index + 1] = data[index + 2] = value;
      data[index + 3] = 255;
    }
    const result = suggestRasterWalls({ data, width: 200, height: 200 }, 100);
    if (result.walls.length !== 1) throw new Error("Sugestão raster inesperada.");
    const lit = applyLightingPreset({ ...SCENE_SAMPLE }, "cavern");
    api.scenes.package.validate(lit);
    if (lit.scene.environment.darknessLevel !== 0.88) throw new Error("Perfil de iluminação não aplicado.");
    return "Sugestão raster e perfil de ambiente validados em memória; nenhuma Scene alterada.";
  });

  const activeScene = globalThis.canvas?.scene;
  if (activeScene) {
    try {
      const audit = api.scenes.audit(activeScene);
      add("cena-ativa", audit.issues.length ? "warn" : "pass",
        `${audit.counts.walls} paredes, ${audit.counts.lights} luzes, ${audit.counts.sounds} sons; ${audit.issues.length} ponto(s) para revisão. Detalhes em jarvis.scenes.audit().`);
    } catch (error) { add("cena-ativa", "fail", error?.message ?? error); }
  } else add("cena-ativa", "skip", "Nenhuma Scene ativa para auditoria somente leitura.");

  for (const [id, getter] of [
    ["visage", api.appearance?.status],
    ["metamorph", api.transformation?.status]
  ]) {
    try {
      const status = getter?.();
      add(id, status?.apiReady ? "pass" : "skip",
        status?.apiReady ? `Integração ativa (${status.version ?? "versão desconhecida"}).` : "Integração opcional não ativa.");
    } catch (error) {
      add(id, "fail", error?.message ?? error);
    }
  }

  if (inspectActors) {
    const actors = Array.from(gameRef?.actors?.contents ?? []).slice(0, Math.max(0, Math.min(20, Number(actorLimit) || 0)));
    if (!actors.length) add("fichas-leitura", "skip", "Nenhum Actor acessível para análise.");
    else {
      try {
        let rulesReview = 0;
        let unverified = 0;
        for (const actor of actors) {
          const provenance = api.provenance.analyzeActor(actor);
          const rules = api.rules.analyzeActor(actor);
          rulesReview += [...(rules.classes ?? []), ...(rules.subclasses ?? [])]
            .filter(entry => entry.status !== "ready").length;
          unverified += Number(provenance.summary?.unverified ?? 0);
        }
        add("fichas-leitura", rulesReview || unverified ? "warn" : "pass",
          `${actors.length} Actor(s) lido(s); ${rulesReview} item(ns) de regras para revisão e ${unverified} item(ns) sem proveniência confirmada.`);
      } catch (error) {
        add("fichas-leitura", "fail", error?.message ?? error);
      }
    }
  } else add("fichas-leitura", "skip", "Leitura de Actors desativada nesta execução.");

  add("integracao-de-escrita", "skip",
    "Criação/substituição de cenas, restauração de backup, luz no canvas, áudio audível e efeitos em combate exigem mundo de teste; não foram executados.");
  const events = capture?.snapshot?.() ?? [];
  const jarvisFailures = events.filter(event => event.owner === "jarvis").length;
  const externalFailures = events.filter(event => event.owner === "external-module").length;
  if (jarvisFailures) add("erros-em-sessao", "fail",
    `${jarvisFailures} erro(s) atribuídos ao Jarvis; ${externalFailures} a outros módulos. Consulte os eventos no relatório JSON.`);
  else if (events.length) add("erros-em-sessao", "warn",
    `${events.length} erro(s) capturado(s), nenhum atribuído diretamente ao Jarvis; ${externalFailures} a outros módulos. Consulte os eventos no relatório JSON.`);
  else add("erros-em-sessao", "skip",
    "Nenhum erro capturado nesta sessão. Isso não valida ações que não foram executadas.");
  return summarize(checks, module.version ?? api.version ?? null, capture);
}

function summarize(checks, version, capture = null) {
  const counts = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const check of checks) counts[check.status] += 1;
  return {
    version,
    mode: "read-only",
    ok: counts.fail === 0,
    counts,
    checks,
    events: capture?.snapshot?.() ?? []
  };
}

export function formatJarvisDiagnostics(report) {
  const labels = { pass: "OK", warn: "AVISO", fail: "FALHA", skip: "NÃO EXECUTADO" };
  const events = report.events ?? [];
  return [
    `Jarvis ${report.version ?? "?"} — diagnóstico somente leitura`,
    ...report.checks.map(check => `[${labels[check.status]}] ${check.id}: ${check.detail}`),
    ...events.slice(-20).map(event =>
      `[ERRO] ${event.time} ${event.kind} / ${event.owner}${event.moduleId ? ` (${event.moduleId})` : ""}` +
      `${event.operation ? ` / ${event.operation}` : ""}: ${event.message}`),
    ...(events.length > 20 ? [`Mais ${events.length - 20} evento(s) no relatório JSON.`] : []),
    `Resultado: ${report.counts.pass} OK, ${report.counts.warn} aviso(s), ${report.counts.fail} falha(s), ${report.counts.skip} não executado(s).`
  ].join("\n");
}

/** Downloads one local JSON report. It does not upload data or modify Foundry documents. */
export function downloadJarvisDiagnostics(report, {
  documentRef = globalThis.document,
  urlRef = globalThis.URL,
  filename = `jarvis-diagnostico-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
} = {}) {
  if (!documentRef?.createElement || typeof urlRef?.createObjectURL !== "function") {
    throw new Error("Download disponível somente no navegador do Foundry.");
  }
  const url = urlRef.createObjectURL(new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: "application/json" }));
  try {
    const link = documentRef.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    urlRef.revokeObjectURL(url);
  }
  return filename;
}
