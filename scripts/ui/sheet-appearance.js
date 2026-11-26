// Persistent, per-Actor sheet watermark. No changes to sheet mechanics.
const MODULE_ID = "fora-do-abismo-foundry";
const FLAG = "sheetAppearance";
const HOST = "jarvis-sheet-background-host";
const LAYER = "jarvis-sheet-background-layer";
const PALETTE_CLASS = "jarvis-sheet-palette";
export const DEFAULT_SHEET_PALETTE = Object.freeze({
  paper: "#f8f6ef", text: "#30323a", title: "#806126", divider: "#b0b4bd"
});
const PALETTE_KEYS = Object.keys(DEFAULT_SHEET_PALETTE);
function luminance(hex) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
export function sheetContrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
export function normalizeSheetPalette(value) {
  if (value == null || value.enabled === false) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Paleta inválida.");
  const result = {};
  for (const key of PALETTE_KEYS) {
    const color = value[key] ?? DEFAULT_SHEET_PALETTE[key];
    if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Use cores hexadecimais #RRGGBB.");
    result[key] = color.toLowerCase();
  }
  if (sheetContrast(result.text, result.paper) < 4.5 || sheetContrast(result.title, result.paper) < 4.5)
    throw new Error("Texto e títulos precisam de contraste mínimo 4,5:1 com o papel. Escolha cores mais contrastantes.");
  return result;
}
export function normalizeSheetAppearance(value) {
  if (value == null || value.enabled === false) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Fundo da ficha inválido.");
  const image = typeof value.image === "string" ? value.image.trim() : "";
  // Only local Foundry data paths, never external URLs or CSS fragments.
  if (image && (/[\x00-\x1f\\:"'<>?#]/.test(image) || image.startsWith("/") ||
      image.split("/").some(part => part === ".." || part === ".") ||
      !/\.(png|jpe?g|webp)$/i.test(image))) throw new Error("Use um caminho local PNG, JPG ou WebP para o fundo.");
  const opacity = Number(value.opacity ?? 0.10);
  const size = Number(value.size ?? 65);
  if (!Number.isFinite(opacity) || opacity < 0.02 || opacity > 0.25) throw new Error("Opacidade entre 2% e 25%.");
  if (!Number.isFinite(size) || size < 20 || size > 100) throw new Error("Tamanho entre 20% e 100%.");
  const palette = normalizeSheetPalette(value.palette);
  if (!image && !palette) throw new Error("Escolha uma imagem ou habilite uma paleta.");
  return { enabled: true, image: image || null, opacity, size, palette };
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
  host.classList.remove(PALETTE_CLASS);
  for (const key of PALETTE_KEYS) host.style?.removeProperty("--jarvis-sheet-" + key);
  const theme = getSheetAppearance(actor);
  if (!theme) return;
  host.classList.add(HOST);
  if (theme.palette) {
    host.classList.add(PALETTE_CLASS);
    for (const key of PALETTE_KEYS) host.style.setProperty("--jarvis-sheet-" + key, theme.palette[key]);
  }
  if (!theme.image) return;
  const layer = host.ownerDocument.createElement("div");
  layer.className = LAYER;
  layer.setAttribute("aria-hidden", "true");
  layer.style.backgroundImage = "url(" + JSON.stringify(theme.image) + ")";
  layer.style.opacity = String(theme.opacity);
  layer.style.backgroundSize = theme.size + "% auto";
  host.prepend(layer);
}
export function registerSheetAppearance() {
  Hooks.on("renderApplicationV2", applySheetAppearance);
  Hooks.on("renderActorSheet", applySheetAppearance);
}
