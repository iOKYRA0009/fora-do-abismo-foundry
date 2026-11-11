import { requireGm, requirePartner } from "./partner-status.js";

/** UBI does not publish a stable JavaScript API. Open its own Scene Directory control. */
export async function openBattlemapImporter() {
  requireGm();
  requirePartner("dd-import");
  await ui.sidebar?.activateTab?.("scenes");
  await ui.scenes?.render?.(true);
  const root = ui.scenes?.element ?? ui.sidebar?.tabs?.scenes?.element ?? globalThis.document;
  const controls = Array.from(root?.querySelectorAll?.("button") ?? []);
  const button = controls.find(control => /Universal Battlemap Import/i.test(control.textContent ?? ""));
  if (!button) {
    throw new Error("Jarvis: abra a aba Cenas e clique em 'Universal Battlemap Import'. O módulo ainda não exibiu seu botão.");
  }
  button.click();
  return { opened: true };
}
