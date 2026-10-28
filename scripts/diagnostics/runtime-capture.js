const MODULE_ID = "fora-do-abismo-foundry";
const CAPTURE_KEY = Symbol.for("fora-do-abismo-foundry.diagnosticCapture");
const MAX_MESSAGE = 1200;
const MAX_STACK = 5000;

function safeText(value, limit) {
  let text;
  try { text = String(value ?? ""); }
  catch { text = "[valor não legível]"; }
  return text
    .replace(/(https?:\/\/[^\s?#)]+)[^\s)]*/gi, "$1")
    .replace(/[A-Z]:\\Users\\[^\\\s]+\\/gi, "<perfil>\\")
    .slice(0, limit);
}

function errorDetails(error) {
  if (error instanceof Error || (error && typeof error === "object")) {
    return {
      message: safeText(error.message ?? error.reason ?? error.name ?? "Erro sem mensagem", MAX_MESSAGE),
      stack: safeText(error.stack ?? "", MAX_STACK)
    };
  }
  return { message: safeText(error, MAX_MESSAGE), stack: "" };
}

/** The first module frame is the likely throw site; later frames are only related modules. */
export function classifyDiagnosticSource({ message = "", stack = "", source = "" } = {}) {
  const lines = `${stack}\n${source}\n${message}`.split(/\r?\n/);
  const relatedModules = [];
  let first = null;
  for (const line of lines) {
    const match = /(?:^|[\\/])modules[\\/]([^\\/?#:\s)]+)(?:[\\/]|$)/i.exec(line);
    if (!match) continue;
    const id = match[1].toLowerCase();
    if (!relatedModules.includes(id)) relatedModules.push(id);
    first ??= id;
  }
  if (first) return {
    owner: first === MODULE_ID ? "jarvis" : "external-module",
    moduleId: first,
    relatedModules,
    possibleConflict: relatedModules.includes(MODULE_ID) && relatedModules.length > 1
  };
  const joined = lines.join("\n");
  if (/\b(?:fora-do-abismo-foundry|Jarvis(?: Tools)?)\b/i.test(joined)) {
    return { owner: "jarvis", moduleId: MODULE_ID, relatedModules: [MODULE_ID], possibleConflict: false };
  }
  const system = /(?:^|[\\/])systems[\\/]([^\\/?#:\s)]+)/i.exec(joined);
  if (system) return { owner: "system", moduleId: system[1].toLowerCase(), relatedModules, possibleConflict: false };
  if (/(?:foundry\.mjs|foundry\.js|foundryvtt|resources[\\/]app)/i.test(joined)) {
    return { owner: "foundry-core", moduleId: null, relatedModules, possibleConflict: false };
  }
  return { owner: "unknown", moduleId: null, relatedModules, possibleConflict: false };
}

/** Session-local recorder. No document writes, network requests or telemetry. */
export function createJarvisRuntimeCapture({ target = globalThis, maxEntries = 200, now = () => new Date().toISOString(),
  captureConsole = true } = {}) {
  const entries = [];
  const limit = Math.max(1, Math.min(1000, Math.trunc(Number(maxEntries) || 200)));
  let active = false;
  let originalConsoleError = null;
  let wrappedConsoleError = null;

  function record(kind, error, { operation = "", source = "" } = {}) {
    if (!active) return null;
    const detail = errorDetails(error);
    const attribution = classifyDiagnosticSource({ ...detail, source });
    const event = {
      time: safeText(now(), 40), kind: safeText(kind, 60), operation: safeText(operation, 120),
      message: detail.message, stack: detail.stack, source: safeText(source, 500), ...attribution
    };
    entries.push(event);
    if (entries.length > limit) entries.splice(0, entries.length - limit);
    return event;
  }

  function onError(event) {
    const source = event?.filename ?? event?.target?.src ?? event?.target?.href ?? "";
    record("javascript", event?.error ?? event?.message ?? "Erro ao carregar recurso", { source });
  }
  function onRejection(event) { record("unhandled-rejection", event?.reason ?? "Promessa rejeitada sem motivo"); }

  function start() {
    if (active) return capture;
    target.addEventListener?.("error", onError, true);
    target.addEventListener?.("unhandledrejection", onRejection);
    if (captureConsole && typeof target.console?.error === "function") {
      originalConsoleError = target.console.error;
      wrappedConsoleError = function (...args) {
        try {
          const error = args.find(arg => arg instanceof Error) ?? args.find(arg => typeof arg === "string") ?? "Erro no console";
          const prefix = args.filter(arg => typeof arg === "string").join(" ");
          record("console-error", error, { operation: prefix });
        } catch { /* Never interfere with the original console. */ }
        return originalConsoleError.apply(this, args);
      };
      target.console.error = wrappedConsoleError;
    }
    active = true;
    return capture;
  }

  function stop() {
    if (!active) return capture;
    target.removeEventListener?.("error", onError, true);
    target.removeEventListener?.("unhandledrejection", onRejection);
    if (wrappedConsoleError && target.console?.error === wrappedConsoleError) target.console.error = originalConsoleError;
    active = false;
    return capture;
  }

  function guard(kind, operation, action) {
    if (typeof action !== "function") throw new TypeError("Ação para diagnóstico deve ser uma função.");
    return function (...args) {
      try {
        const result = action.apply(this, args);
        return result && typeof result.then === "function"
          ? Promise.resolve(result).catch(error => { record(kind, error, { operation }); throw error; })
          : result;
      } catch (error) {
        record(kind, error, { operation });
        throw error;
      }
    };
  }

  const capture = {
    start, stop, guard,
    recordFailure: (kind, error, operation = "") => record(kind, error, { operation }),
    snapshot: () => entries.map(entry => ({ ...entry, relatedModules: [...entry.relatedModules] })),
    clear: () => { entries.length = 0; },
    get active() { return active; }
  };
  return capture;
}

export function installJarvisRuntimeCapture(target = globalThis) {
  if (target[CAPTURE_KEY]) return target[CAPTURE_KEY];
  const capture = createJarvisRuntimeCapture({ target });
  Object.defineProperty(target, CAPTURE_KEY, { value: capture, configurable: true });
  return capture;
}

export function getJarvisRuntimeCapture(target = globalThis) { return target[CAPTURE_KEY] ?? null; }
