/** Conservative, grid-aligned suggestions from a raster map. Never creates documents. */
export function suggestRasterWalls(imageData, gridSize, {
  threshold = 0.58,
  maxWalls = 400
} = {}) {
  const { data, width, height } = imageData ?? {};
  if (!(data instanceof Uint8ClampedArray) || !Number.isInteger(width) || !Number.isInteger(height)
    || data.length !== width * height * 4) throw new Error("Raster: imagem RGBA inválida.");
  if (!Number.isInteger(gridSize) || gridSize < 50) throw new Error("Raster: grade mínima de 50 pixels.");
  const columns = Math.floor(width / gridSize);
  const rows = Math.floor(height / gridSize);
  if (columns < 2 || rows < 2 || columns * rows > 12000) {
    throw new Error("Raster: mapa deve ter entre 2x2 e 12000 quadrados.");
  }
  if (width - columns * gridSize > 2 || height - rows * gridSize > 2) {
    throw new Error("Raster: ajuste os pixels por quadrado até a imagem caber na grade (tolerância de 2 px).");
  }
  if (!Number.isFinite(threshold) || threshold < 0.35 || threshold > 0.95) {
    throw new Error("Raster: sensibilidade fora de 0,35–0,95.");
  }

  const luminance = (x, y) => {
    const i = (Math.min(height - 1, Math.max(0, y)) * width
      + Math.min(width - 1, Math.max(0, x))) * 4;
    if (data[i + 3] < 160) return 1;
    return (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  };
  const offset = Math.max(7, Math.round(gridSize * 0.14));
  const radius = Math.max(2, Math.round(gridSize * 0.025));
  const score = (x, y, vertical) => {
    let center = 1;
    for (let n = -radius; n <= radius; n += 1) {
      center = Math.min(center, vertical ? luminance(x + n, y) : luminance(x, y + n));
    }
    const sideA = vertical ? luminance(x - offset, y) : luminance(x, y - offset);
    const sideB = vertical ? luminance(x + offset, y) : luminance(x, y + offset);
    const contrast = (sideA + sideB) / 2 - center;
    return center < 0.52 && contrast > 0.22 ? 1 : 0;
  };
  const candidates = [];
  const scan = (vertical, line, cell) => {
    const constant = line * gridSize;
    let hits = 0;
    let samples = 0;
    const start = cell * gridSize + Math.max(3, Math.round(gridSize * 0.1));
    const end = (cell + 1) * gridSize - Math.max(3, Math.round(gridSize * 0.1));
    for (let t = start; t <= end; t += 3) {
      hits += score(vertical ? constant : t, vertical ? t : constant, vertical);
      samples += 1;
    }
    if (samples && hits / samples >= threshold) {
      candidates.push({
        a: vertical ? [line, cell] : [cell, line],
        b: vertical ? [line, cell + 1] : [cell + 1, line],
        type: "wall",
        confidence: Math.round(100 * hits / samples) / 100,
        source: "raster-suggestion"
      });
    }
  };
  for (let x = 1; x < columns; x += 1) for (let y = 0; y < rows; y += 1) scan(true, x, y);
  for (let y = 1; y < rows; y += 1) for (let x = 0; x < columns; x += 1) scan(false, y, x);
  candidates.sort((a, b) => b.confidence - a.confidence);
  const limited = candidates.slice(0, maxWalls);
  return {
    columns, rows, walls: mergeSegments(limited),
    warnings: [
      "Paredes de imagem são sugestões alinhadas à grade: revise todas antes de criar a cena.",
      ...(candidates.length > maxWalls ? [`Limite de ${maxWalls} segmentos atingido; parte das sugestões foi descartada.`] : [])
    ]
  };
}

function mergeSegments(segments) {
  const groups = new Map();
  for (const wall of segments) {
    const vertical = wall.a[0] === wall.b[0];
    const axis = vertical ? wall.a[0] : wall.a[1];
    const key = `${vertical ? "v" : "h"}:${axis}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(wall);
  }
  const merged = [];
  for (const group of groups.values()) {
    const vertical = group[0].a[0] === group[0].b[0];
    group.sort((a, b) => (vertical ? a.a[1] - b.a[1] : a.a[0] - b.a[0]));
    let last = null;
    for (const wall of group) {
      if (last && last.b[0] === wall.a[0] && last.b[1] === wall.a[1]
        && (vertical ? last.a[0] === wall.a[0] : last.a[1] === wall.a[1])) {
        last.b = [...wall.b];
        last.confidence = Math.min(last.confidence, wall.confidence);
      } else {
        last = { ...wall, a: [...wall.a], b: [...wall.b] };
        merged.push(last);
      }
    }
  }
  return merged;
}
