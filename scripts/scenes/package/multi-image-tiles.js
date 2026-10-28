/**
 * One Foundry Scene, up to four independently decoded raster map sectors.
 * The source package uses rect=[x,y,width,height] in the full atlas pixels;
 * calibrated Scene Builder blueprints use x/y/width/height in grid cells.
 * These are background Tiles, not overhead tiles or artificial upscaling.
 */
export const MAX_IMAGE_TILES = 4;
const finite = n => typeof n === "number" && Number.isFinite(n);
const fail = reason => { throw new Error(`Jarvis Mosaico: ${reason}`); };

export function validateImageTiles(scene = {}, { sourcePixels = false } = {}) {
  if (scene.imageTiles === undefined) return [];
  const tiles = scene.imageTiles;
  if (!Array.isArray(tiles) || tiles.length < 1 || tiles.length > MAX_IMAGE_TILES) {
    fail(`imageTiles exige de 1 a ${MAX_IMAGE_TILES} imagens.`);
  }
  if (scene.backgroundSrc || scene.backgroundFallbackSrc) {
    fail("use imageTiles OU backgroundSrc, nunca ambos na mesma Scene.");
  }
  if (scene.visualMode !== true) fail("imageTiles exige scene.visualMode=true.");
  const area = sourcePixels
    ? scene.imagePlacement
    : { width: scene.columns, height: scene.rows };
  if (!area || !finite(area.width) || !finite(area.height)
    || area.width <= 0 || area.height <= 0 || area.width > 32768 || area.height > 32768) {
    fail("dimensões da tela única inválidas ou maiores que 32768 pixels/células.");
  }
  const checked = [];
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const rect = sourcePixels ? tile?.rect : [tile?.x, tile?.y, tile?.width, tile?.height];
    if (typeof tile?.src !== "string" || !tile.src.trim()) fail(`imageTiles[${i}].src é obrigatório.`);
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(finite)
      || rect[0] < 0 || rect[1] < 0 || rect[2] <= 0 || rect[3] <= 0
      || rect[0]+rect[2] > area.width+0.00001 || rect[1]+rect[3] > area.height+0.00001) {
      fail(`imageTiles[${i}] ultrapassa o atlas; confira rect e imagePlacement.`);
    }
    if (sourcePixels) {
      if (!Number.isInteger(tile.pixelWidth) || !Number.isInteger(tile.pixelHeight)
        || tile.pixelWidth < 1 || tile.pixelHeight < 1
        || tile.pixelWidth > 8192 || tile.pixelHeight > 8192) {
        fail(`imageTiles[${i}] precisa de pixelWidth/pixelHeight válidos (até 8192 por eixo).`);
      }
      // Keep one native source pixel per atlas pixel. Never silently upscale HD art.
      if (tile.pixelWidth !== rect[2] || tile.pixelHeight !== rect[3]) {
        fail(`imageTiles[${i}] precisa ter a resolução exata de rect, sem ampliação artificial.`);
      }
    }
    for (let k = 0; k < checked.length; k++) {
      const p = checked[k].rect;
      if (rect[0] < p[0]+p[2]-0.00001 && rect[0]+rect[2] > p[0]+0.00001
        && rect[1] < p[1]+p[3]-0.00001 && rect[1]+rect[3] > p[1]+0.00001) {
        fail(`imageTiles[${i}] se sobrepõe a imageTiles[${k}].`);
      }
    }
    checked.push({ ...tile, rect });
  }
  return checked;
}
