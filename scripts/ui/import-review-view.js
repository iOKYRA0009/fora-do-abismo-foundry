const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

function itemRows(items) {
  return items.map(item => `<li><strong>${escapeHtml(item.name)}</strong> · ${escapeHtml(item.type)}
    <small>${item.activities?.length ?? 0} Activity(s), ${item.effects?.length ?? 0} efeito(s)${item.image ? " · imagem definida" : ""}</small>
    ${item.activities?.length ? `<ul>${item.activities.map(activity => `<li>${escapeHtml(activity.name ?? activity.type ?? "Activity")}
      · ${escapeHtml(activity.type ?? "utility")}</li>`).join("")}</ul>` : ""}</li>`).join("");
}

export function importReviewMarkup(review) {
  if (!review) return '<p class="jarvis-console-hint">Revise o JSON antes de confirmar.</p>';
  const actor = review.actor ?? {};
  const duplicateActors = review.duplicates?.actors ?? [];
  const duplicateItems = Array.isArray(review.duplicates) ? review.duplicates : review.duplicates?.items ?? [];
  const heading = actor.name ? `${actor.name} · ${actor.type ?? "Actor"}` : "Importação V9";
  return `<h4>${escapeHtml(heading)}</h4>
    <p class="${review.canImport ? "jarvis-review-ready" : "jarvis-review-blocked"}" role="status">${review.canImport ? "Pronto para confirmar" : "Importação bloqueada: resolva os conflitos"}</p>
    ${actor.hp || actor.ac || actor.attributes ? `<p>PV: ${escapeHtml(actor.hp?.value ?? "—")}/${escapeHtml(actor.hp?.max ?? "—")}
      · CA: ${escapeHtml(actor.ac ?? "—")} · atributos: ${escapeHtml(Object.keys(actor.attributes ?? {}).length)}</p>` : ""}
    ${actor.image ? `<p>Imagem: ${escapeHtml(typeof actor.image === "string" ? actor.image : actor.image.source ?? "estratégia definida")}</p>` : ""}
    ${actor.tokenImage ? `<p>Token: ${escapeHtml(actor.tokenImage)}</p>` : ""}
    ${actor.portraitPreview || actor.tokenPreview ? `<div class="jarvis-console-row">
      ${actor.portraitPreview ? `<figure><img src="${escapeHtml(actor.portraitPreview)}" alt="Prévia do retrato" width="96" height="96"><figcaption>Retrato</figcaption></figure>` : ""}
      ${actor.tokenPreview ? `<figure><img src="${escapeHtml(actor.tokenPreview)}" alt="Prévia do token" width="96" height="96"><figcaption>Token</figcaption></figure>` : ""}</div>` : ""}
    <details open><summary>Items (${review.items?.length ?? 0})</summary><ul>${itemRows(review.items ?? []) || "<li>Nenhum Item.</li>"}</ul></details>
    ${review.effects?.length ? `<details><summary>Efeitos (${review.effects.length})</summary><ul>${review.effects.map(effect => `<li>${escapeHtml(effect.name ?? "Efeito sem nome")}</li>`).join("")}</ul></details>` : ""}
    ${review.mechanics ? `<details open><summary>Ensaio mecânico · ${review.mechanics.actions} ação(ões), ${review.mechanics.checks.length} cenário(s)</summary><ul>
      ${review.mechanics.checks.map(check => `<li>${escapeHtml(check.action)}: d20 ${escapeHtml(check.d20)} + modificador = ${escapeHtml(check.total)} contra ${escapeHtml(check.target)} → ${escapeHtml(check.outcome)}</li>`).join("") || "<li>Sem cenários informados.</li>"}</ul></details>` : ""}
    ${review.errors?.length ? `<div class="jarvis-review-warnings"><strong>Erros mecânicos</strong><ul>${review.errors.map(message => `<li>${escapeHtml(message)}</li>`).join("")}</ul></div>` : ""}
    ${duplicateActors.length || duplicateItems.length ? `<details open><summary>Duplicatas</summary><ul>
      ${duplicateActors.map(value => `<li>Actor existente: ${escapeHtml(value.name)} (${escapeHtml(value.id)})</li>`).join("")}
      ${duplicateItems.map(value => `<li>Item: ${escapeHtml(value.item)} coincide com ${escapeHtml(value.existing)}</li>`).join("")}</ul></details>` : ""}
    ${review.warnings?.length ? `<div class="jarvis-review-warnings"><strong>Avisos</strong><ul>${review.warnings.map(message => `<li>${escapeHtml(message)}</li>`).join("")}</ul></div>` : ""}
    <p class="jarvis-console-hint">${escapeHtml(review.protection ?? "")}</p>`;
}

export function renderImportReview(root, kind, review) {
  const host = root.querySelector(`[data-jarvis-${kind}-review]`);
  if (host) host.innerHTML = importReviewMarkup(review);
}
