import { resolveEmbeddedEffect, prepareEmbeddedEffectForActor } from "../automation/embedded-effect-engine.js";
import { analyzeActorProvenance, formatProvenanceReport } from "../provenance/content-provenance.js";
import { requirePartner } from "./partner-status.js";

export async function inspectAdvancedEffect(activity, actor = activity?.item?.actor, options = {}) {
  const effect = resolveEmbeddedEffect(activity, options);
  const changes = effect.system?.changes ?? [];
  const dae = globalThis.game?.modules?.get?.("dae");
  const prepared = actor ? await prepareEmbeddedEffectForActor(effect, activity, actor, options) : null;
  return {
    effect: effect.name,
    effectUuid: effect.uuid,
    daeActive: Boolean(dae?.active),
    daeVersion: dae?.version ?? null,
    changes: structuredClone(changes),
    appliedChanges: prepared?.system?.changes ?? null,
    requiresDae: changes.some(change => /^(macro\.|flags\.dae\.|dae\.)/i.test(change.key ?? ""))
  };
}

export function openAdvancedEffectEditor(activity, options = {}) {
  requirePartner("dae");
  const effect = resolveEmbeddedEffect(activity, options);
  effect.sheet?.render(true);
  return { effectUuid: effect.uuid, name: effect.name };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

export function registerTidyBridge() {
  Hooks.once("tidy5e-sheet.ready", api => {
    if (!game.modules?.get?.("tidy5e-sheet")?.active || !api?.registerActorHeaderControls) return;
    api.registerActorHeaderControls({ controls: [{
      icon: "fas fa-robot",
      label: "Jarvis: revisar ficha",
      ownership: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
      async onClickAction() {
        const actor = this.document;
        const report = formatProvenanceReport(analyzeActorProvenance(actor));
        const Dialog = foundry.applications.api.DialogV2;
        new Dialog({
          window: { title: `Jarvis — ${actor.name}` },
          content: `<pre style="white-space:pre-wrap;max-height:60vh;overflow:auto">${escapeHtml(report)}</pre>`,
          buttons: [{ action: "close", label: "Fechar" }]
        }).render(true);
      }
    }] });
  });
}
