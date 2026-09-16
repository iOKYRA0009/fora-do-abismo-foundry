const ACCEPTED_EXTENSIONS = new Set(["txt", "js"]);

function isMacroConfig(application) {
  return application?.constructor?.name === "MacroConfig";
}

function getAcceptedFile(dataTransfer) {
  const files = Array.from(dataTransfer?.files ?? []);
  return files.find(file => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    return ACCEPTED_EXTENSIONS.has(extension);
  }) ?? null;
}

function findCommandField(element) {
  return element.querySelector('textarea[name="command"], [name="command"]');
}

function setFieldValue(field, value) {
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function installMacroDrop(application, element) {
  if (!isMacroConfig(application)) return;

  const commandField = findCommandField(element);
  if (!commandField) return;

  const dropZone = commandField.closest(".form-group, .form-fields, .editor, .standard-form") ?? commandField.parentElement ?? element;
  if (dropZone.dataset.jarvisFileDrop === "ready") return;
  dropZone.dataset.jarvisFileDrop = "ready";
  dropZone.classList.add("jarvis-macro-drop-zone");

  const hint = document.createElement("div");
  hint.className = "jarvis-macro-drop-hint";
  hint.innerHTML = '<i class="fa-solid fa-file-arrow-down" inert></i> Arraste um arquivo <strong>.txt</strong> ou <strong>.js</strong> aqui';
  dropZone.append(hint);

  let dragDepth = 0;

  dropZone.addEventListener("dragenter", event => {
    event.preventDefault();
    dragDepth += 1;
    dropZone.classList.add("jarvis-drag-active");
  });

  dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });

  dropZone.addEventListener("dragleave", event => {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropZone.classList.remove("jarvis-drag-active");
  });

  dropZone.addEventListener("drop", async event => {
    event.preventDefault();
    dragDepth = 0;
    dropZone.classList.remove("jarvis-drag-active");

    const file = getAcceptedFile(event.dataTransfer);
    if (!file) {
      ui.notifications?.warn("Jarvis: arraste um arquivo .txt ou .js para preencher a Macro.");
      return;
    }

    try {
      const text = await file.text();
      if (!text.trim()) {
        ui.notifications?.warn(`Jarvis: ${file.name} está vazio.`);
        return;
      }

      setFieldValue(commandField, text);

      const typeField = element.querySelector('[name="type"]');
      if (typeField && typeField.value !== "script") {
        ui.notifications?.warn("Jarvis carregou o arquivo. Defina o tipo da Macro como Script antes de executar.");
      } else {
        ui.notifications?.info(`Jarvis: ${file.name} carregado na Macro.`);
      }
    } catch (error) {
      console.error("fora-do-abismo-foundry | Falha ao ler arquivo de Macro", error);
      ui.notifications?.error(`Jarvis não conseguiu ler ${file.name}.`);
    }
  });
}

export function registerMacroFileDrop() {
  Hooks.on("renderApplicationV2", installMacroDrop);
}
