// Persistent, per-Actor sheet watermark. No changes to sheet mechanics.
const MODULE_ID = "fora-do-abismo-foundry";
const FLAG = "sheetAppearance";
const HOST = "jarvis-sheet-background-host";
const LAYER = "jarvis-sheet-background-layer";
export function normalizeSheetAppearance(value) {
  if (value == null || value.enabled === false) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Fundo da ficha inválido.");
  const image = typeof value.image === "string" ? value.image.trim() : "";
  // Only local Foundry data paths, never external URLs or CSS fragments.
  if (!image || /[\x00-\x1f\\:"'<>?#]/.test(image) || image.startsWith("/") ||
      image.split("/").some(part => part === ".." || part === ".") ||
      !/\.(png|jpe?g|webp)$/i.test(image)) throw new Error("Use um caminho local PNG, JPG ou WebP para o fundo.");
  const opacity = Number(value.opacity ?? 0.10);
  const size = Number(value.size ?? 65);
  if (!Number.isFinite(opacity) || opacity < 0.02 || opacity > 0.25) throw new Error("Opacidade entre 2% e 25%.");
  if (!Number.isFinite(size) || size < 20 || size > 100) throw new Error("Tamanho entre 20% e 100%.");
  return { enabled: true, image, opacity, size };
}

export function getSheetAppearance(actor) {
  try { return normalizeSheetAppearance(actor?.getFlag?.(MODULE_ID, FLAG)); }
  catch { return null; }
}
function requireMaster(actor) {
  if (!globalThis.game?.user?.isGM || actor?.documentName !== "Actor" || !actor.id ||
      actor.isToken || actor.pack) throw new Error("Selecione uma ficha do mundo como Mestre.");
}
export async function setSheetAppearance(actor, value) {
  requireMaster(actor);
  const theme = normalizeSheetAppearance(value);
  if (theme) await actor.setFlag(MODULE_ID, FLAG, theme);
  else await actor.unsetFlag(MODULE_ID, FLAG);
  return theme;
}
export function applySheetAppearance(application, element) {
  const actor = application?.actor ?? application?.document;
  if (actor?.documentName !== "Actor" || actor.type !== "character") return;
  const root = element?.querySelector ? element : element?.[0];
  if (!root || !(root.matches?.(".sheet, .actor") ||
      /sheet/i.test(application.constructor?.name ?? ""))) return;
  const host = root.matches?.(".window-content") ? root : root.querySelector(".window-content");
  if (!host) return;
  host.querySelectorAll(":scope > ." + LAYER).forEach(node => node.remove());
  host.classList.remove(HOST);
  const theme = getSheetAppearance(actor);
  if (!theme) return;
  const layer = host.ownerDocument.createElement("div");
  layer.className = LAYER;
  layer.setAttribute("aria-hidden", "true");
  layer.style.backgroundImage = "url(" + JSON.stringify(theme.image) + ")";
  layer.style.opacity = String(theme.opacity);
  layer.style.backgroundSize = theme.size + "% auto";
  host.classList.add(HOST);
  host.prepend(layer);
}
export function registerSheetAppearance() {
  Hooks.on("renderApplicationV2", applySheetAppearance);
  Hooks.on("renderActorSheet", applySheetAppearance);
}
