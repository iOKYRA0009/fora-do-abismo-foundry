const MODULE_ID = "fora-do-abismo-foundry";
const VERSION = "3.0.0";
const ACTOR_IDS = ["MxWry5bSpDdH36Z7", "ueUfr5JrOEjLPi2V", "mzoiuTGUwk2zUbHy", "K1VakgpDkbmyE2Cf"];

export async function autoInstallThirdThroneV3() {
  if (!game.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) return { skipped: "not-active-gm" };
  const jack = game.actors?.get?.(ACTOR_IDS[0]);
  if (!jack || ACTOR_IDS.slice(1).some(id => !game.actors?.get?.(id))) return { skipped: "actors-missing" };
  if (jack.getFlag?.(MODULE_ID, "thirdThroneV3")?.version === VERSION) return { skipped: "already-installed" };
  if (!game.modules?.get?.("socketlib")?.active) throw new Error("Ative socketlib para instalar o Terceiro Trono V3 automaticamente.");
  const url = new URL("../../examples/JARVIS_TERCEIRO_TRONO_V3_INSTALAR.js", import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Instalador do Terceiro Trono indisponível (${response.status}).`);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const install = new AsyncFunction("jarvis", "game", "canvas", "ui", await response.text());
  const result = await install(null, game, globalThis.canvas, ui);
  return { installed: true, result };
}
