const PROTECTED_WORLDS = new Set(["fora-do-abismo"]);

export function parseE2EOptions(argv) {
  const options = { world: null, baseUrl: "http://127.0.0.1:30000", report: null,
    browserPath: null, user: null, passwordEnv: "JARVIS_TEST_PASSWORD" };
  const names = new Map([
    ["--world", "world"], ["--base-url", "baseUrl"], ["--report", "report"],
    ["--browser", "browserPath"], ["--user", "user"], ["--password-env", "passwordEnv"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = names.get(argv[index]);
    if (!key) throw new Error(`Opção desconhecida: ${argv[index]}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`Informe o valor de ${argv[index - 1]}.`);
    options[key] = value;
  }
  assertSafeE2ETarget(options);
  if (options.report && !/^[a-z0-9][a-z0-9._-]*\.json$/i.test(options.report)) {
    throw new Error("--report aceita somente um nome de arquivo .json, sem caminho.");
  }
  return options;
}

export function assertSafeE2ETarget({ world, baseUrl }) {
  if (!world || !/^jarvis-[a-z0-9-]*audit$/i.test(world) || PROTECTED_WORLDS.has(world.toLowerCase())) {
    throw new Error("Informe o slug de uma cópia isolada de auditoria, por exemplo --world jarvis-rc3-audit.");
  }
  let url;
  try { url = new URL(baseUrl); }
  catch { throw new Error("Endereço do Foundry inválido."); }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new Error("O teste só aceita a raiz HTTP local do Foundry, sem credenciais ou parâmetros.");
  }
  return true;
}

export function assessFoundryPage({ pathname, worldId, ready }, expectedWorld) {
  if (/\/(?:setup|license)(?:\/|$)/i.test(pathname)) return { status: "not-tested", reason: "Nenhum mundo de teste está ativo." };
  if (!worldId) return { status: "not-tested", reason: "Não foi possível confirmar o slug do mundo ativo; nenhuma ação será executada." };
  if (worldId !== expectedWorld) return { status: "refused", reason: `Mundo ativo ${worldId}; esperado ${expectedWorld}.` };
  if (!/\/(?:game)(?:\/|$)/i.test(pathname) || !ready) {
    return { status: "not-tested", reason: "O mundo de teste está ativo, mas a sessão ainda não entrou no jogo." };
  }
  return { status: "ready", reason: "Mundo de teste confirmado." };
}
