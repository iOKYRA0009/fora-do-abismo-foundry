import { convertUniversalVtt } from "../scenes/importers/universal-vtt.js";
import { suggestRasterWalls } from "../scenes/raster-wall-assist.js";
import { applyLightingPreset, lightFromPreset, listLightingPresets } from "../scenes/lighting-presets.js";

const MODULE_ID = "fora-do-abismo-foundry";
const SVG_NS = "http://www.w3.org/2000/svg";

export async function openMapStudio() {
  if (!game.user?.isGM) throw new Error("Jarvis: apenas o Mestre pode usar o Estúdio de Mapas.");
  const Dialog = foundry.applications.api.DialogV2;
  let imageUrl;
  try {
    const selected = await Dialog.wait({
      window: { title: "Jarvis — Estúdio de Mapas" },
      content: `<div class="jarvis-map-setup">
        <label>Mapa PNG, WEBP ou Universal VTT <input name="file" type="file" accept=".png,.webp,.dd2vtt,.uvtt,.json" required></label>
        <label>Nome da cena <input name="name" type="text" required></label>
        <label>Pixels por quadrado (imagem comum) <input name="grid" type="number" min="50" max="500" value="100"></label>
        <label>Sensibilidade das sugestões <input name="threshold" type="range" min="0.35" max="0.95" step="0.05" value="0.60"></label>
        <p>Imagens comuns geram sugestões alinhadas à grade. Nenhuma parede é criada antes da revisão.</p>
      </div>`,
      buttons: [
        { action: "cancel", label: "Cancelar" },
        { action: "open", label: "Analisar mapa", default: true,
          callback: (_event, _button, dialog) => {
            const root = dialog.element;
            const file = root.querySelector('[name="file"]')?.files?.[0];
            const name = root.querySelector('[name="name"]')?.value?.trim();
            if (!file || !name) throw new Error("Selecione o mapa e informe o nome da cena.");
            return { file, name, gridSize: Number(root.querySelector('[name="grid"]')?.value),
              threshold: Number(root.querySelector('[name="threshold"]')?.value) };
          } }
      ]
    });
    if (!selected || selected === "cancel") return null;
    const prepared = await prepareMap(selected);
    imageUrl = prepared.imageUrl;
    const { payload, warnings } = prepared;
    const state = {
      walls: (payload.walls ?? []).map(wall => ({ ...wall, enabled: true })),
      lights: [...(payload.lights ?? [])], sounds: [...(payload.sounds ?? [])], pending: null
    };
    const choice = await Dialog.wait({
      window: { title: `Jarvis — revisar ${selected.name}`, resizable: true },
      content: htmlElement(`<div class="jarvis-map-review">
        <p><strong>${escapeHtml(selected.name)}</strong> — ${payload.scene.columns} × ${payload.scene.rows} quadrados.</p>
        <p class="jarvis-map-caution">${warnings.map(escapeHtml).join(" ")}</p>
        <div class="jarvis-map-tools">
          <label>Adicionar <select name="mode"><option value="wall">Parede</option><option value="door">Porta</option><option value="secret">Porta secreta</option><option value="light">Luz</option><option value="sound">Som</option></select></label>
          <label>Luz e ambiente <select name="preset">${listLightingPresets().map(preset =>
            `<option value="${preset.key}">${escapeHtml(preset.label)}</option>`).join("")}</select></label>
          <label>Áudio no servidor <input name="sound-path" type="text" placeholder="worlds/meu-mundo/sounds/ambiente.ogg"></label>
          <button type="button" data-jarvis-action="clear-suggestions">Ocultar sugestões</button>
          <button type="button" data-jarvis-action="undo">Desfazer último</button>
        </div>
        <div class="jarvis-map-surface"><svg class="jarvis-map-svg" viewBox="0 0 ${payload.scene.columns} ${payload.scene.rows}" preserveAspectRatio="none" aria-label="Revisão visual de paredes">
          <image class="jarvis-map-image" x="0" y="0" width="${payload.scene.columns}" height="${payload.scene.rows}" preserveAspectRatio="none"></image>
          <g class="jarvis-map-lines"></g><g class="jarvis-map-lights"></g><g class="jarvis-map-sounds"></g><g class="jarvis-map-pending"></g>
        </svg></div>
        <p class="jarvis-map-counts"></p>
        <p>Clique numa linha para incluí-la ou descartá-la. Para parede/porta, clique em dois pontos; para luz ou som, em um ponto. O som precisa de arquivo já hospedado.</p>
      </div>`),
      render: (_event, dialog) => bindReview(dialog, state, payload, imageUrl),
      buttons: [
        { action: "cancel", label: "Cancelar" },
        { action: "create", label: "Revisar criação", default: true,
          callback: (_event, _button, dialog) => {
            const preset = dialog.element.querySelector('[name="preset"]')?.value ?? "neutral";
            const finalPayload = applyLightingPreset({
              ...payload,
              walls: state.walls.filter(wall => wall.enabled).map(({ enabled, confidence, source, ...wall }) => wall),
              lights: state.lights,
              sounds: state.sounds
            }, preset);
            const builder = getBuilder();
            builder.validate(finalPayload);
            return finalPayload;
          } }
      ]
    });
    if (!choice || choice === "cancel") return { created: false };
    const builder = getBuilder();
    const preview = await builder.preview(choice);
    const existing = game.scenes.find(scene => scene.name.toLowerCase() === choice.scene.name.toLowerCase());
    const geometryList = (preview.geometryWarnings ?? []).slice(0, 10);
    const confirm = await Dialog.confirm({
      window: { title: "Jarvis — confirmar cena" },
      content: `<p>${escapeHtml(choice.scene.name)}: ${preview.walls} paredes, ${preview.doors} portas, ${preview.lights} luzes, ${preview.sounds} sons.</p>
        ${existing ? "<p>A cena anterior será preservada como backup Jarvis.</p>" : ""}
        ${geometryList.length ? `<p>${preview.geometryWarnings.length} alertas geométricos:</p><ul>${geometryList.map(message => `<li>${escapeHtml(message)}</li>`).join("")}</ul>` : ""}`
    });
    if (!confirm) return { created: false, preview };
    const result = await builder.build(choice, { replaceExisting: Boolean(existing), view: true });
    return { ...result, created: true, preview, warnings };
  } catch (error) {
    ui.notifications?.error(`Jarvis Estúdio de Mapas: ${error.message}`);
    console.error(`${MODULE_ID} | Estúdio de Mapas falhou`, error);
    throw error;
  } finally {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }
}

async function prepareMap({ file, name, gridSize, threshold }) {
  if (file.size > 30 * 1024 * 1024) throw new Error("Mapa maior que 30 MB; reduza a imagem antes de importar.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (["dd2vtt", "uvtt", "json"].includes(extension)) {
    const { payload, warnings } = convertUniversalVtt(await file.text(), { name });
    return { payload, warnings, imageUrl: imageUrlFromBase64(payload.visual?.backgroundBase64, payload.visual?.mimeType) };
  }
  if (!["png", "webp"].includes(extension)) throw new Error("Use PNG, WEBP, DD2VTT ou UVTT.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 24_000_000) throw new Error("Imagem acima de 24 megapixels; reduza a resolução.");
    const surface = document.createElement("canvas");
    surface.width = bitmap.width;
    surface.height = bitmap.height;
    const ctx = surface.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Navegador não disponibilizou leitura da imagem.");
    ctx.drawImage(bitmap, 0, 0);
    const detected = suggestRasterWalls(ctx.getImageData(0, 0, bitmap.width, bitmap.height), gridSize, { threshold });
    const base64 = (await fileToDataUrl(file)).split(",")[1];
    return {
      payload: {
        schemaVersion: "1.0", id: `raster-${slug(name)}`,
        scene: { name, columns: detected.columns, rows: detected.rows,
          grid: { size: gridSize, distance: 5, units: "ft" } },
        visual: { backgroundBase64: base64, fileName: `${slug(name)}.${extension}`,
          mimeType: extension === "webp" ? "image/webp" : "image/png" },
        walls: detected.walls, lights: [], sounds: [], actors: [], regions: [],
        metadata: { source: "raster-assisted" }
      },
      warnings: detected.warnings,
      imageUrl: URL.createObjectURL(file)
    };
  } finally {
    bitmap.close();
  }
}

function bindReview(dialog, state, payload, imageUrl) {
  const root = dialog.element;
  if (!root || root.dataset.jarvisMapBound) return;
  root.dataset.jarvisMapBound = "true";
  const svg = root.querySelector(".jarvis-map-svg");
  if (imageUrl) svg.querySelector(".jarvis-map-image").setAttribute("href", imageUrl);
  const redraw = () => {
    const lines = svg.querySelector(".jarvis-map-lines");
    const lights = svg.querySelector(".jarvis-map-lights");
    const sounds = svg.querySelector(".jarvis-map-sounds");
    const pending = svg.querySelector(".jarvis-map-pending");
    lines.replaceChildren(); lights.replaceChildren(); sounds.replaceChildren(); pending.replaceChildren();
    state.walls.forEach((wall, index) => {
      const line = svgNode("line", {
        x1: wall.a[0], y1: wall.a[1], x2: wall.b[0], y2: wall.b[1],
        class: `jarvis-map-wall ${wall.type === "door" ? "door" : wall.type === "secret" ? "secret" : ""} ${wall.enabled ? "" : "disabled"}`
      });
      line.addEventListener("click", event => { event.stopPropagation(); wall.enabled = !wall.enabled; redraw(); });
      line.setAttribute("data-index", index);
      lines.append(line);
    });
    for (const light of state.lights) lights.append(svgNode("circle", {
      cx: light.x, cy: light.y, r: 0.22, class: "jarvis-map-light"
    }));
    for (const sound of state.sounds) sounds.append(svgNode("circle", {
      cx: sound.x, cy: sound.y, r: 0.22, class: "jarvis-map-sound"
    }));
    if (state.pending) pending.append(svgNode("circle", {
      cx: state.pending[0], cy: state.pending[1], r: 0.2, class: "jarvis-map-point"
    }));
    root.querySelector(".jarvis-map-counts").textContent =
      `${state.walls.filter(wall => wall.enabled).length} paredes/portas ativas · ${state.lights.length} luzes · ${state.sounds.length} sons`;
  };
  svg.addEventListener("click", event => {
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const x = clamp(Math.round(point.x * 2) / 2, 0, payload.scene.columns);
    const y = clamp(Math.round(point.y * 2) / 2, 0, payload.scene.rows);
    const mode = root.querySelector('[name="mode"]')?.value;
    if (mode === "light") {
      state.lights.push(lightFromPreset(root.querySelector('[name="preset"]')?.value ?? "neutral", x, y));
      state.pending = null;
    } else if (mode === "sound") {
      const path = root.querySelector('[name="sound-path"]')?.value?.trim();
      if (!path) { ui.notifications?.warn("Informe o caminho do áudio no servidor antes de marcar o som."); return; }
      state.sounds.push({ name: "Ambiente Jarvis", x, y, path, radius: 30, volume: 0.5, walls: true });
      state.pending = null;
    } else if (!state.pending) state.pending = [x, y];
    else {
      if (state.pending[0] !== x || state.pending[1] !== y) {
        state.walls.push({ a: state.pending, b: [x, y], type: mode, enabled: true, source: "manual" });
      }
      state.pending = null;
    }
    redraw();
  });
  root.querySelector('[name="mode"]').addEventListener("change", () => { state.pending = null; redraw(); });
  root.querySelector('[data-jarvis-action="clear-suggestions"]').addEventListener("click", () => {
    for (const wall of state.walls) if (wall.source === "raster-suggestion") wall.enabled = false;
    redraw();
  });
  root.querySelector('[data-jarvis-action="undo"]').addEventListener("click", () => {
    if (state.pending) state.pending = null;
    else if (state.lights.length && root.querySelector('[name="mode"]').value === "light") state.lights.pop();
    else if (state.sounds.length && root.querySelector('[name="mode"]').value === "sound") state.sounds.pop();
    else {
      const index = state.walls.findLastIndex(wall => wall.source === "manual");
      if (index >= 0) state.walls.splice(index, 1);
    }
    redraw();
  });
  redraw();
}

function svgNode(name, attributes) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function imageUrlFromBase64(base64, mimeType = "image/png") {
  if (!base64) return null;
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getBuilder() {
  const builder = game.modules.get(MODULE_ID)?.api?.scenes?.package;
  if (!builder) throw new Error("Scene Package não inicializado.");
  return builder;
}

function slug(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mapa";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function htmlElement(markup) {
  const element = document.createElement("div");
  element.innerHTML = markup;
  return element;
}

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

export function registerMapStudioControl() {
  Hooks.on("getSceneControlButtons", controls => {
    if (!game.user?.isGM) return;
    const wallTools = controls.walls?.tools;
    if (!wallTools) return;
    wallTools.jarvisMapStudio = {
      name: "jarvisMapStudio", title: "Jarvis: Estúdio de Mapas", icon: "fa-solid fa-dungeon",
      order: Object.keys(wallTools).length, button: true, visible: true,
      onChange: () => { void openMapStudio().catch(() => {}); }
    };
  });
}
