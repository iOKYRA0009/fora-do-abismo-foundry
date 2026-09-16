const MODULE_ID = "fora-do-abismo-foundry";

const GROUP_LABELS = Object.freeze({
  resource: "RECURSOS",
  passive: "PASSIVAS",
  action: "AÇÕES",
  bonus: "AÇÕES BÔNUS",
  reaction: "REAÇÕES",
  other: "OUTRAS ATIVAS"
});

const GROUP_ORDER = Object.freeze({
  resource: 0,
  passive: 10,
  action: 20,
  bonus: 30,
  reaction: 40,
  other: 50
});

const DEFAULT_ORIGIN_ORDER = Object.freeze({
  resources: 0,
  monk: 10,
  subclass: 20,
  species: 30,
  background: 40,
  talents: 50,
  abyss: 60,
  other: 90
});

const collapsedSections = new Set();

function slugify(value = "section") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "section";
}

function getActor(application) {
  return application?.actor ?? (application?.document?.documentName === "Actor" ? application.document : null);
}

function isCharacterSheet(application) {
  const actor = getActor(application);
  if (!actor || actor.type !== "character" || game.system?.id !== "dnd5e") return false;
  return String(application?.constructor?.name ?? "").includes("CharacterActorSheet");
}

function getOrganization(item) {
  return item.getFlag(MODULE_ID, "organization") ?? {};
}

function inferActivationGroup(item, organization = {}) {
  if (organization.group && GROUP_LABELS[organization.group]) return organization.group;
  if (organization.resource === true) return "resource";

  const activities = Array.from(item.system?.activities ?? []);
  if (!activities.length) return "passive";

  const types = new Set(activities.map(activity => activity.activation?.type).filter(Boolean));
  if (types.size === 1) {
    const [type] = types;
    if (type === "action") return "action";
    if (type === "bonus") return "bonus";
    if (String(type).startsWith("reaction")) return "reaction";
  }

  if ([...types].every(type => String(type).startsWith("reaction"))) return "reaction";
  return "other";
}

function getOrigin(item, organization = {}) {
  const origin = organization.origin ? slugify(organization.origin) : "other";
  const originLabel = String(organization.originLabel ?? organization.label ?? (origin === "other" ? "OUTRAS" : origin.toUpperCase()));
  const originOrder = Number.isFinite(Number(organization.originOrder))
    ? Number(organization.originOrder)
    : (DEFAULT_ORIGIN_ORDER[origin] ?? DEFAULT_ORIGIN_ORDER.other);
  return { origin, originLabel, originOrder };
}

function makeSectionLabel(origin, originLabel, group) {
  if (group === "resource" || origin === "resources") return "RECURSOS";
  return `${originLabel} — ${GROUP_LABELS[group] ?? GROUP_LABELS.other}`;
}

function prepareHybridSections(application, context) {
  if (!isCharacterSheet(application)) return;

  const actor = getActor(application);
  if (actor.getFlag(MODULE_ID, "featuresLayout") !== "hybrid") return;
  if (!Array.isArray(context?.sections) || !context?.itemCategories?.features) return;

  const features = [...(context.itemCategories.features ?? [])];
  if (!features.length) return;

  const baseColumns = context.sections.find(section => Array.isArray(section.columns))?.columns ?? [];
  const sections = new Map();

  for (const item of features) {
    const organization = getOrganization(item);
    const group = inferActivationGroup(item, organization);
    const { origin, originLabel, originOrder } = getOrigin(item, organization);
    const key = `${origin}:${group}`;

    if (!sections.has(key)) {
      sections.set(key, {
        id: `jarvis-${slugify(key)}`,
        label: makeSectionLabel(origin, originLabel, group),
        order: (originOrder * 100) + (GROUP_ORDER[group] ?? GROUP_ORDER.other),
        columns: baseColumns,
        items: [],
        dataset: {
          jarvisHybrid: "true",
          jarvisSection: slugify(key)
        }
      });
    }

    sections.get(key).items.push(item);
  }

  const result = [...sections.values()]
    .filter(section => section.items.length)
    .sort((a, b) => a.order - b.order || String(a.label).localeCompare(String(b.label), game.i18n?.lang ?? "pt-BR"));

  for (const section of result) {
    section.items.sort((a, b) => {
      const aOrg = getOrganization(a);
      const bOrg = getOrganization(b);
      const aOrder = Number.isFinite(Number(aOrg.order)) ? Number(aOrg.order) : Number(a.sort ?? 0);
      const bOrder = Number.isFinite(Number(bOrg.order)) ? Number(bOrg.order) : Number(b.sort ?? 0);
      return aOrder - bOrder || a.name.localeCompare(b.name, game.i18n?.lang ?? "pt-BR");
    });
  }

  context.sections = result;
  if (context.listControls?.grouping) context.listControls.grouping = [];
}

function setCollapsed(section, collapsed) {
  section.classList.toggle("jarvis-section-collapsed", collapsed);
  const button = section.querySelector(":scope > .items-header .jarvis-section-toggle");
  if (!button) return;

  button.setAttribute("aria-expanded", String(!collapsed));
  const icon = button.querySelector("i");
  if (icon) {
    icon.classList.toggle("fa-chevron-down", !collapsed);
    icon.classList.toggle("fa-chevron-right", collapsed);
  }
}

function activateHybridSections(application, element) {
  if (!isCharacterSheet(application)) return;
  const actor = getActor(application);
  if (actor.getFlag(MODULE_ID, "featuresLayout") !== "hybrid") return;

  const sections = element.querySelectorAll('.items-section[data-jarvis-hybrid="true"]');
  for (const section of sections) {
    const header = section.querySelector(":scope > .items-header");
    if (!header || header.querySelector(".jarvis-section-toggle")) continue;

    const sectionId = section.dataset.jarvisSection ?? "section";
    const stateKey = `${actor.uuid}:${sectionId}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "jarvis-section-toggle unbutton always-interactive";
    button.setAttribute("aria-label", "Recolher ou expandir seção");
    button.innerHTML = '<i class="fa-solid fa-chevron-down" inert></i>';

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const collapsed = !section.classList.contains("jarvis-section-collapsed");
      if (collapsed) collapsedSections.add(stateKey);
      else collapsedSections.delete(stateKey);
      setCollapsed(section, collapsed);
    });

    header.append(button);
    setCollapsed(section, collapsedSections.has(stateKey));
  }
}

export function registerHybridFeatureLayout() {
  Hooks.on("preRenderApplication", prepareHybridSections);
  Hooks.on("renderApplicationV2", activateHybridSections);
}
