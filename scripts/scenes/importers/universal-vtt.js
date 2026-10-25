/** Convert Dungeondraft-style Universal VTT 0.2/0.3 metadata to a Jarvis Scene Package. */
export function convertUniversalVtt(source, {
  name = "Mapa Universal VTT",
  folder = "",
  gridDistance = 5,
  gridUnits = "ft",
  includeObjectWalls = false,
  imageFileName = "mapa-universal-vtt.png"
} = {}) {
  const data = typeof source === "string" ? JSON.parse(source) : source;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Universal VTT: esperado um objeto JSON.");
  }
  if (![0.2, 0.3].includes(Number(data.format))) {
    throw new Error("Universal VTT: apenas formatos 0.2 e 0.3 são suportados.");
  }

  const resolution = data.resolution ?? {};
  const width = Number(resolution.map_size?.x);
  const height = Number(resolution.map_size?.y);
  const gridSize = Number(resolution.pixels_per_grid);
  const distance = Number(gridDistance);
  if (![width, height].every(value => Number.isInteger(value) && value > 0)) {
    throw new Error("Universal VTT: map_size precisa de dimensões inteiras positivas.");
  }
  if (!Number.isInteger(gridSize) || gridSize < 50) {
    throw new Error("Universal VTT: pixels_per_grid precisa ser inteiro >= 50.");
  }
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new Error("Universal VTT: gridDistance precisa ser positivo.");
  }

  const origin = {
    x: finiteNumber(resolution.map_origin?.x ?? 0, "map_origin.x"),
    y: finiteNumber(resolution.map_origin?.y ?? 0, "map_origin.y")
  };
  const warnings = [];
  const point = (value, label) => ({
    x: finiteNumber(value?.x, `${label}.x`) - origin.x,
    y: finiteNumber(value?.y, `${label}.y`) - origin.y
  });
  const walls = [];
  const addPolylines = (paths, label) => {
    if (paths === undefined) return;
    if (!Array.isArray(paths)) throw new Error(`Universal VTT: ${label} deve ser uma lista.`);
    paths.forEach((path, pathIndex) => {
      if (!Array.isArray(path) || path.length < 2) {
        warnings.push(`${label}[${pathIndex}] ignorado: menos de dois pontos.`);
        return;
      }
      for (let i = 1; i < path.length; i += 1) {
        const a = point(path[i - 1], `${label}[${pathIndex}][${i - 1}]`);
        const b = point(path[i], `${label}[${pathIndex}][${i}]`);
        if (a.x === b.x && a.y === b.y) {
          warnings.push(`${label}[${pathIndex}] contém segmento de comprimento zero.`);
          continue;
        }
        walls.push({ a: [a.x, a.y], b: [b.x, b.y], type: "wall" });
      }
    });
  };

  addPolylines(data.line_of_sight, "line_of_sight");
  if (includeObjectWalls) addPolylines(data.objects_line_of_sight, "objects_line_of_sight");
  else if (data.objects_line_of_sight?.length) {
    warnings.push("Obstáculos de objetos não importados; revise móveis e pilares no mapa.");
  }

  if (data.portals !== undefined && !Array.isArray(data.portals)) {
    throw new Error("Universal VTT: portals deve ser uma lista.");
  }
  data.portals?.forEach((portal, index) => {
    if (!Array.isArray(portal.bounds) || portal.bounds.length !== 2) {
      warnings.push(`portals[${index}] ignorado: bounds inválido.`);
      return;
    }
    const a = point(portal.bounds[0], `portals[${index}].bounds[0]`);
    const b = point(portal.bounds[1], `portals[${index}].bounds[1]`);
    if (a.x === b.x && a.y === b.y) {
      warnings.push(`portals[${index}] ignorado: comprimento zero.`);
      return;
    }
    walls.push({
      a: [a.x, a.y], b: [b.x, b.y], type: "door",
      state: portal.closed === false ? "open" : "closed"
    });
    if (portal.closed === false) {
      warnings.push(`portals[${index}] aberto: confira se representa porta aberta ou janela.`);
    }
  });

  if (data.lights !== undefined && !Array.isArray(data.lights)) {
    throw new Error("Universal VTT: lights deve ser uma lista.");
  }
  const lights = (data.lights ?? []).map((light, index) => {
    const position = point(light.position, `lights[${index}].position`);
    const range = finiteNumber(light.range, `lights[${index}].range`);
    if (range < 0) throw new Error(`Universal VTT: lights[${index}].range não pode ser negativo.`);
    const intensity = Math.max(0, Math.min(1, Number(light.intensity ?? 0.5)));
    const dim = range * distance;
    return {
      name: `Luz UVTT ${index + 1}`,
      x: position.x, y: position.y,
      dim, bright: dim * intensity * 0.5,
      color: parseColor(light.color),
      walls: light.shadows !== false,
      hidden: Boolean(data.environment?.baked_lighting)
    };
  });
  if (data.environment?.baked_lighting && lights.length) {
    warnings.push("A arte tem luz embutida; as luzes importadas começam ocultas para evitar duplicação.");
  }

  const imageDataUrl = typeof data.image === "string"
    ? /^data:(image\/(?:png|webp|jpeg));base64,([\s\S]+)$/i.exec(data.image)
    : null;
  if (typeof data.image === "string" && data.image.startsWith("data:") && !imageDataUrl) {
    throw new Error("Universal VTT: imagem embutida deve ser PNG, WEBP ou JPEG em Base64.");
  }
  const imageMimeType = imageDataUrl?.[1]?.toLowerCase() ?? "image/png";
  const image = typeof data.image === "string" ? (imageDataUrl?.[2] ?? data.image) : null;
  const extension = imageMimeType === "image/webp" ? "webp" : imageMimeType === "image/jpeg" ? "jpg" : "png";
  const resolvedFileName = imageFileName === "mapa-universal-vtt.png"
    ? `mapa-universal-vtt.${extension}` : imageFileName;
  if (!image) warnings.push("Imagem não incluída no arquivo; forneça visual.backgroundSrc antes de construir.");

  const payload = {
    schemaVersion: "1.0",
    id: `uvtt-${slug(name)}`,
    scene: {
      name, folder, columns: width, rows: height,
      grid: { size: gridSize, distance, units: gridUnits }
    },
    visual: image ? { backgroundBase64: image, fileName: resolvedFileName, mimeType: imageMimeType } : {},
    walls, lights, actors: [], regions: [],
    metadata: { source: "universal-vtt", sourceFormat: Number(data.format) }
  };

  return { payload, warnings };
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Universal VTT: ${label} precisa ser número finito.`);
  return number;
}

function parseColor(value) {
  const hex = String(value ?? "").replace(/^#/, "");
  if (/^[\da-f]{8}$/i.test(hex)) return `#${hex.slice(2)}`;
  if (/^[\da-f]{6}$/i.test(hex)) return `#${hex}`;
  return "#ffffff";
}

function slug(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mapa";
}
