/**
 * Quality hints for a multi-raster Scene prepared for the Jarvis Executor.
 * Never modifies imported art or infers walls from pixels.
 */
const finite = n => typeof n === "number" && Number.isFinite(n);
const warning = (category, detail, severity="warning") => ({category,detail,severity});
export function inspectMosaicQuality(blueprint) {
  const result = { mode:"read-only", score:null, issues:[], sectors:[], totals:{area:0,covered:0,pixelDensity:0} };
  const scene = blueprint?.scene ?? {};
  const placement = scene.imagePlacement;
  const sectors = scene.imageTiles ?? [];
  if (!sectors.length) return result;
  if (!placement || !finite(placement.width) || !finite(placement.height)
    || !finite(scene.columns) || !finite(scene.rows) || scene.columns <= 0 || scene.rows <= 0) {
    result.issues.push(warning("geometry","Atlas sem grade ou imagePlacement coerentes.","error"));
    return result;
  }
  const pxPerCellX = placement.width / scene.columns;
  const pxPerCellY = placement.height / scene.rows;
  result.totals.area = placement.width * placement.height;
  let covered = 0, high = Infinity;
  for (const [i, tile] of sectors.entries()) {
    const [x,y,w,h] = Array.isArray(tile.rect)?tile.rect:[NaN,NaN,NaN,NaN];
    if (![x,y,w,h].every(finite) || !(w>0&&h>0)) {
      result.issues.push(warning("sector",`Setor ${i+1}: retângulo inválido.`,"error"));
      continue;
    }
    covered += w*h;
    const densityX = (tile.pixelWidth ?? w) / (w / pxPerCellX);
    const densityY = (tile.pixelHeight ?? h) / (h / pxPerCellY);
    const density = Math.min(densityX,densityY);
    high=Math.min(high,density);
    const axisAligned = [x/pxPerCellX,y/pxPerCellY,w/pxPerCellX,h/pxPerCellY]
      .every(n=>Math.abs(n-Math.round(n))<0.02);
    if (!axisAligned) result.issues.push(warning("grid",`Setor ${i+1} não se alinha às células; conferir em zoom 200%.`));
    if (density<96) result.issues.push(warning("resolution",`Setor ${i+1}: apenas ${Math.round(density)} pixels por célula, abaixo da meta HD.`));
    result.sectors.push({index:i,name:tile.name??`Setor ${i+1}`,rect:[x,y,w,h],pixelsPerCell:Math.round(density)});
  }
  result.totals.covered=covered;
  result.totals.pixelDensity=Number.isFinite(high)?Math.round(high):0;
  if (covered<result.totals.area*0.92) result.issues.push(warning("coverage",
    `Mosaico ocupa ${Math.round(covered/result.totals.area*100)}% do atlas. Confira se os espaços vazios são propositais.`));
  if (!(blueprint.walls?.length || blueprint.structures?.length)) result.issues.push(warning("vision",
    "Sem paredes declaradas para a prévia. Luz e linhas de visão não serão bloqueadas pela arte."));
  if (scene.environment?.darknessLevel>=0.7 && !(blueprint.lights?.length||blueprint.structures?.some(s=>s.light))) {
    result.issues.push(warning("lighting","Cena escura sem luzes declaradas. Confira a jogabilidade."));
  }
  return result;
}
