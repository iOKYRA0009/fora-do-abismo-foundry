import { convertUniversalVtt } from "../scenes/importers/universal-vtt.js";

const MODULE_ID = "fora-do-abismo-foundry";

export async function openUniversalVttImporter() {
  if (!game.user?.isGM) throw new Error("Jarvis: apenas o Mestre pode importar mapas.");
  const Dialog = foundry.applications.api.DialogV2;
  try {
    const input = await Dialog.wait({
      window: { title: "Jarvis — importar mapa Universal VTT" },
      content: `
        <div class="jarvis-uvtt-import">
          <label>Arquivo .dd2vtt ou .uvtt <input type="file" name="map" accept=".dd2vtt,.uvtt,.json" required></label>
          <label>Nome da cena <input type="text" name="name" placeholder="Nome do mapa" required></label>
          <label><input type="checkbox" name="objects"> Incluir obstáculos de objetos como paredes</label>
          <p>A próxima tela mostrará as paredes, portas, luzes e alertas antes da criação.</p>
        </div>`,
      buttons: [
        { action: "cancel", label: "Cancelar" },
        {
          action: "preview", label: "Ver prévia", default: true,
          callback: async (_event, _button, dialog) => {
            const file = dialog.element.querySelector('input[name="map"]')?.files?.[0];
            const name = dialog.element.querySelector('input[name="name"]')?.value?.trim();
            const includeObjectWalls = dialog.element.querySelector('input[name="objects"]')?.checked;
            if (!file || !name) throw new Error("Selecione um arquivo e informe o nome da cena.");
            return { source: await file.text(), name, includeObjectWalls };
          }
        }
      ]
    });
    if (!input || input === "cancel") return null;

    const { payload, warnings } = convertUniversalVtt(input.source, {
      name: input.name,
      includeObjectWalls: input.includeObjectWalls,
      imageFileName: `${safeFileName(input.name)}.png`
    });
    const builder = game.modules.get(MODULE_ID)?.api?.scenes?.package;
    if (!builder) throw new Error("Jarvis: Scene Package não inicializado.");
    const preview = await builder.preview(payload);
    const allWarnings = [...warnings, ...(preview.geometryWarnings ?? [])];
    const existing = game.scenes.find(scene => scene.name.toLowerCase() === input.name.toLowerCase());
    const list = allWarnings.length
      ? `<ul>${allWarnings.map(message => `<li>${escapeHtml(message)}</li>`).join("")}</ul>`
      : "<p>Nenhum alerta estrutural.</p>";

    const choice = await Dialog.wait({
      window: { title: "Jarvis — revisar importação" },
      content: `<div class="jarvis-uvtt-preview">
        <p><strong>${escapeHtml(input.name)}</strong> — ${preview.size} quadrados</p>
        <p>${preview.walls} paredes · ${preview.doors} portas · ${preview.lights} luzes</p>
        ${list}
        ${existing ? "<p>A cena atual será preservada como backup Jarvis.</p>" : ""}
      </div>`,
      buttons: [
        { action: "cancel", label: "Cancelar" },
        { action: "build", label: existing ? "Criar e guardar cena anterior" : "Criar cena", default: true }
      ]
    });
    if (choice !== "build") return { preview, warnings: allWarnings, created: false };

    const result = await builder.build(payload, { replaceExisting: Boolean(existing), view: true });
    return { ...result, preview, warnings: allWarnings, created: true };
  } catch (error) {
    ui.notifications?.error(`Jarvis: ${error.message}`);
    console.error(`${MODULE_ID} | Importação Universal VTT falhou`, error);
    throw error;
  }
}

export function registerUniversalVttControl() {
  Hooks.on("getSceneControlButtons", controls => {
    if (!game.user?.isGM) return;
    const control = controls.walls;
    if (!control?.tools) return;
    control.tools.jarvisUvtt = {
      name: "jarvisUvtt",
      title: "Jarvis: importar mapa Universal VTT",
      icon: "fa-solid fa-map",
      order: Object.keys(control.tools).length,
      button: true,
      visible: true,
      onChange: () => { void openUniversalVttImporter().catch(() => {}); }
    };
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function safeFileName(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mapa";
}
