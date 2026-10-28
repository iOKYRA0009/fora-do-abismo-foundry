/**
 * Pure, bounded edits to a Jarvis Executor map before any Foundry documents
 * are created. Delta values arrive in SCENE pixels from the preview overlay.
 * Calibrated packages store IMAGE pixels; legacy blueprints store grid cells.
 */
const finite = value => typeof value === "number" && Number.isFinite(value);
function invalid(text) { throw new Error(`Jarvis Ajustar Mapa: ${text}`); }

export function moveExecutorMapElement(packageData, {
  sceneIndex, kind, index, deltaX, deltaY, endpoint
} = {}) {
  if (!packageData || !Array.isArray(packageData.scenes) || !Number.isInteger(sceneIndex)
    || sceneIndex < 0 || sceneIndex >= packageData.scenes.length) invalid("cena inválida.");
  if (!Number.isInteger(index) || index < 0 || !finite(deltaX) || !finite(deltaY)) invalid("movimento inválido.");
  if (Math.abs(deltaX) + Math.abs(deltaY) < 0.05) return structuredClone(packageData);

  const pkg = structuredClone(packageData);
  const scene = pkg.scenes[sceneIndex];
  const config = scene.scene ?? {};
  const gridSize = Number(config.grid?.size ?? 100);
  const width = Number(config.columns) * gridSize;
  const height = Number(config.rows) * gridSize;
  if (!(width > 0 && height > 0)) invalid("dimensões da cena inválidas.");
  const placement = config.imagePlacement;
  const bounds = placement ? [placement.width, placement.height] : [Number(config.columns), Number(config.rows)];
  if (bounds.some(value => !finite(value) || value <= 0)) invalid("dimensões da imagem inválidas.");
  const dx = Number((deltaX * bounds[0] / width).toFixed(4));
  const dy = Number((deltaY * bounds[1] / height).toFixed(4));
  const shift = ([x,y]) => [Number((x+dx).toFixed(4)),Number((y+dy).toFixed(4))];
  const valid = ([x,y]) => finite(x) && finite(y) && x >= 0 && y >= 0
    && x <= bounds[0] && y <= bounds[1];
  const requirePoint = point => {
    if (!Array.isArray(point) || point.length !== 2 || !valid(point)) {
      invalid("o elemento ultrapassa os limites do mapa. Reduza o deslocamento.");
    }
    return point;
  };
  const moveXY = target => {
    if (!target || !finite(target.x) || !finite(target.y)) invalid("elemento sem posição válida.");
    const [x,y] = requirePoint(shift([target.x,target.y]));
    target.x=x; target.y=y;
  };
  if (kind === "structure") {
    const structure = scene.structures?.[index];
    if (!structure) invalid("construção não encontrada.");
    if (Array.isArray(structure.rect) && structure.rect.length === 4) {
      const [x,y,w,h] = structure.rect;
      if (![x,y,w,h].every(finite) || w<=0 || h<=0) invalid("contorno da construção inválido.");
      const [nextX,nextY] = requirePoint(shift([x,y]));
      requirePoint([nextX+w,nextY+h]);
      structure.rect[0]=nextX; structure.rect[1]=nextY;
    } else if (Array.isArray(structure.outline) && structure.outline.length >= 3) {
      structure.outline = structure.outline.map(p=>requirePoint(shift(p)));
    } else invalid("construção sem contorno editável.");
    if (structure.light && typeof structure.light === "object"
      && finite(structure.light.x) && finite(structure.light.y)) moveXY(structure.light);
  } else if (kind === "structure-light") {
    const structure = scene.structures?.[index];
    if (!structure?.light) invalid("luz da construção não encontrada.");
    if (structure.light === true || structure.light.position === "center") {
      const corners = structure.rect
        ? [[structure.rect[0],structure.rect[1]],
           [structure.rect[0]+structure.rect[2],structure.rect[1]+structure.rect[3]]]
        : structure.outline;
      if (!Array.isArray(corners) || corners.length < 2) invalid("contorno inválido para luz.");
      const x=corners.reduce((sum,p)=>sum+p[0],0)/corners.length;
      const y=corners.reduce((sum,p)=>sum+p[1],0)/corners.length;
      structure.light={ ...(structure.light===true?{}:structure.light),x,y };
      delete structure.light.position;
    }
    moveXY(structure.light);
  } else if (kind === "light" || kind === "token") {
    const list = kind==="light" ? scene.lights : scene.tokens;
    if (!Array.isArray(list) || !list[index]) invalid(`${kind} não encontrado.`);
    moveXY(list[index]);
    if (kind==="token") {
      const token=list[index];
      const units = placement ? [bounds[0]/Number(config.columns),bounds[1]/Number(config.rows)] : [1,1];
      const w=Number(token.width??1)*units[0],h=Number(token.height??1)*units[1];
      requirePoint([token.x+w, token.y+h]);
    }
  } else if (kind === "wall" || kind === "wall-endpoint") {
    const wall=scene.walls?.[index];
    if (!wall) invalid("parede não encontrada.");
    if (kind==="wall") {wall.a=requirePoint(shift(wall.a));wall.b=requirePoint(shift(wall.b));}
    else if (endpoint === "a" || endpoint === "b") wall[endpoint]=requirePoint(shift(wall[endpoint]));
    else invalid("extremidade de parede inválida.");
  } else invalid("tipo de elemento não suportado.");
  return pkg;
}
