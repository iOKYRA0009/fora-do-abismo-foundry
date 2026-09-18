const DEFAULT_GRID = Object.freeze({
  size: 100,
  distance: 5,
  units: "ft",
  color: "#4a443f",
  alpha: 0.08,
  thickness: 1
});

function clone(value) {
  return foundry.utils.deepClone(value);
}

function n(value, fallback) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function i(value, fallback) {
  return Math.max(1, Math.round(n(value, fallback)));
}

function wall(a, b, extra = {}) {
  return { a, b, type: "wall", ...extra };
}

function door(a, b, extra = {}) {
  return { a, b, type: "door", state: "closed", ...extra };
}

function secret(a, b, extra = {}) {
  return { a, b, type: "secret", state: "closed", ...extra };
}

function floor(name, x, y, w, h, extra = {}) {
  return { kind: "floor", name, x, y, w, h, ...extra };
}

function zone(name, x, y, w, h, extra = {}) {
  return { kind: "zone", name, x, y, w, h, ...extra };
}

function gm(name, x, y, w, h, extra = {}) {
  return { kind: "gm", name, x, y, w, h, text: name, hidden: true, ...extra };
}

function outerRoom(columns, rows, margin = 2, entryWidth = 4) {
  const left = margin;
  const right = columns - margin;
  const top = margin;
  const bottom = rows - margin;
  const center = Math.round(columns / 2);
  const half = Math.max(1, Math.floor(entryWidth / 2));

  return [
    wall([left, top], [right, top]),
    wall([right, top], [right, bottom]),
    wall([right, bottom], [center + half, bottom]),
    door([center + half, bottom], [center - half, bottom]),
    wall([center - half, bottom], [left, bottom]),
    wall([left, bottom], [left, top])
  ];
}

function sceneBase(config, defaults) {
  const columns = i(config.columns, defaults.columns);
  const rows = i(config.rows, defaults.rows);

  return {
    columns,
    rows,
    scene: {
      columns,
      rows,
      grid: {
        ...clone(DEFAULT_GRID),
        ...(config.grid ?? {})
      },
      tokenVision: config.tokenVision !== false,
      navigation: Boolean(config.navigation)
    }
  };
}

function blankTemplate(config = {}) {
  const base = sceneBase(config, { columns: 30, rows: 22 });
  return {
    scene: base.scene,
    walls: config.enclosed === false ? [] : outerRoom(base.columns, base.rows, 2, 4),
    drawings: [
      floor("Área Jogável", 2, 2, base.columns - 4, base.rows - 4),
      gm("Entrada Principal", Math.round(base.columns / 2) - 2, base.rows - 3.5, 4, 1.5)
    ],
    lights: [],
    tokens: []
  };
}

function bossArenaTemplate(config = {}) {
  const base = sceneBase(config, { columns: 38, rows: 30 });
  const { columns: c, rows: r } = base;
  const cx = Math.round(c / 2);
  const cy = Math.round(r / 2);

  return {
    scene: base.scene,
    walls: [
      ...outerRoom(c, r, 2, 6),
      wall([4, 7], [10, 7]), wall([10, 7], [10, r - 8]),
      wall([c - 10, 7], [c - 4, 7]), wall([c - 10, 7], [c - 10, r - 8])
    ],
    drawings: [
      floor("Arena Principal", 2, 2, c - 4, r - 4),
      zone("Zona do Boss", cx - 5, cy - 4, 10, 8),
      floor("Flanco Oeste", 4, 7, 6, r - 15),
      floor("Flanco Leste", c - 10, 7, 6, r - 15),
      gm("Entrada do Grupo", cx - 3, r - 3.5, 6, 1.5),
      gm("Ponto de Revelação", cx - 3, 3, 6, 2),
      gm("Cobertura Oeste", 5, cy - 3, 4, 6),
      gm("Cobertura Leste", c - 9, cy - 3, 4, 6)
    ],
    lights: [],
    tokens: []
  };
}

function industrialForgeTemplate(config = {}) {
  const base = sceneBase(config, { columns: 40, rows: 30 });
  const { columns: c, rows: r } = base;
  const cx = Math.round(c / 2);

  return {
    scene: base.scene,
    walls: [
      ...outerRoom(c, r, 2, 4),
      wall([4, 5], [12, 5]), wall([4, 5], [4, 12]), wall([4, 12], [12, 12]),
      wall([12, 5], [12, 8]), door([12, 8], [12, 10]), wall([12, 10], [12, 12]),
      wall([c - 10, r - 12], [c - 3, r - 12]),
      wall([c - 10, r - 12], [c - 10, r - 5]),
      wall([c - 3, r - 12], [c - 3, r - 5]),
      wall([c - 10, r - 5], [c - 6, r - 5]),
      secret([c - 6, r - 5], [c - 4, r - 5]),
      wall([c - 4, r - 5], [c - 3, r - 5])
    ],
    drawings: [
      floor("Piso Industrial", 2, 2, c - 4, r - 4),
      floor("Sala de Controle", 4, 5, 8, 7),
      zone("Zona de Calor / Escória", cx + 1, 8, Math.max(8, Math.round(c * 0.27)), 8),
      zone("Linha de Trabalho", 12, r - 13, Math.max(10, Math.round(c * 0.35)), 7),
      floor("Rota de Manutenção", c - 10, r - 12, 7, 7),
      gm("Entrada do Grupo", cx - 2, r - 3.5, 4, 1.5),
      gm("Saída Principal", cx - 2, 2, 4, 1.5),
      gm("Patrulha / Pressão", Math.round(c * 0.4), Math.round(r * 0.45), 6, 5)
    ],
    lights: [],
    tokens: []
  };
}

function investigationSiteTemplate(config = {}) {
  const base = sceneBase(config, { columns: 36, rows: 28 });
  const { columns: c, rows: r } = base;
  const cx = Math.round(c / 2);

  return {
    scene: base.scene,
    walls: [
      ...outerRoom(c, r, 2, 5),
      wall([4, 8], [12, 8]), wall([4, 8], [4, 17]), wall([4, 17], [12, 17]),
      wall([12, 8], [12, 11]), door([12, 11], [12, 14], { state: "locked" }), wall([12, 14], [12, 17]),
      wall([c - 9, r - 10], [c - 3, r - 10]),
      wall([c - 9, r - 10], [c - 9, r - 4]),
      wall([c - 3, r - 10], [c - 3, r - 4]),
      wall([c - 9, r - 4], [c - 7, r - 4]),
      secret([c - 7, r - 4], [c - 4, r - 4]),
      wall([c - 4, r - 4], [c - 3, r - 4])
    ],
    drawings: [
      floor("Local de Investigação", 2, 2, c - 4, r - 4),
      floor("Sala Restrita", 4, 8, 8, 9),
      zone("Área de Evidências", 14, 7, Math.max(10, c - 21), 12),
      zone("Galeria de Pistas", 13, 3, Math.max(10, c - 19), 3),
      floor("Passagem Técnica", c - 9, r - 10, 6, 6),
      gm("Entrada", cx - 2.5, r - 3.5, 5, 1.5),
      gm("Pista Principal", cx - 5, 3, 10, 2),
      gm("Rota Alternativa", c - 8, r - 8, 4, 4)
    ],
    lights: [],
    tokens: []
  };
}

function socialHubTemplate(config = {}) {
  const base = sceneBase(config, { columns: 30, rows: 24 });
  const { columns: c, rows: r } = base;
  const cx = Math.round(c / 2);

  return {
    scene: base.scene,
    walls: [
      ...outerRoom(c, r, 2, 5),
      wall([4, 4], [11, 4]), wall([4, 4], [4, 10]), wall([4, 10], [11, 10]),
      wall([11, 4], [11, 6]), door([11, 6], [11, 8]), wall([11, 8], [11, 10]),
      wall([c - 10, 4], [c - 4, 4]), wall([c - 10, 4], [c - 10, 10]), wall([c - 4, 4], [c - 4, 10]),
      wall([c - 10, 10], [c - 8, 10]), door([c - 8, 10], [c - 6, 10]), wall([c - 6, 10], [c - 4, 10])
    ],
    drawings: [
      floor("Salão Social", 2, 2, c - 4, r - 4),
      floor("Área Privada", 4, 4, 7, 6),
      floor("Serviço / Bastidores", c - 10, 4, 6, 6),
      zone("Área de Conversa", cx - 6, Math.round(r * 0.4), 12, 8),
      gm("Entrada", cx - 2.5, r - 3.5, 5, 1.5),
      gm("NPC Social A", cx - 5, Math.round(r * 0.45), 4, 3),
      gm("NPC Social B", cx + 1, Math.round(r * 0.45), 4, 3)
    ],
    lights: [],
    tokens: []
  };
}

function ritualChamberTemplate(config = {}) {
  const base = sceneBase(config, { columns: 34, rows: 28 });
  const { columns: c, rows: r } = base;
  const cx = Math.round(c / 2);
  const cy = Math.round(r / 2);

  return {
    scene: base.scene,
    walls: [
      ...outerRoom(c, r, 2, 5),
      wall([5, 6], [10, 6]), wall([5, 6], [5, r - 6]), wall([5, r - 6], [10, r - 6]),
      wall([c - 10, 6], [c - 5, 6]), wall([c - 5, 6], [c - 5, r - 6]), wall([c - 10, r - 6], [c - 5, r - 6])
    ],
    drawings: [
      floor("Câmara Ritual", 2, 2, c - 4, r - 4),
      zone("Círculo Ritual", cx - 5, cy - 5, 10, 10),
      floor("Nave Oeste", 5, 6, 5, r - 12),
      floor("Nave Leste", c - 10, 6, 5, r - 12),
      gm("Entrada", cx - 2.5, r - 3.5, 5, 1.5),
      gm("Foco Ritual", cx - 3, cy - 3, 6, 6),
      gm("Ponto de Interrupção", cx - 4, 3, 8, 2)
    ],
    lights: [],
    tokens: []
  };
}

function cavernTemplate(config = {}) {
  const base = sceneBase(config, { columns: 36, rows: 28 });
  const { columns: c, rows: r } = base;
  const cx = Math.round(c / 2);

  const points = [
    [3, 6], [7, 3], [15, 2], [24, 4], [c - 3, 8],
    [c - 2, 16], [c - 6, r - 3], [22, r - 2], [12, r - 4], [4, r - 7], [3, 6]
  ];

  const walls = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    walls.push(wall(points[index], points[index + 1]));
  }

  return {
    scene: base.scene,
    walls,
    drawings: [
      floor("Caverna Principal", 3, 3, c - 6, r - 6),
      zone("Desnível / Formação Natural", Math.round(c * 0.18), Math.round(r * 0.35), 7, 7),
      zone("Formação Central", cx - 4, Math.round(r * 0.35), 8, 8),
      zone("Passagem Estreita", c - 11, Math.round(r * 0.5), 6, 5),
      gm("Entrada da Caverna", 4, r - 8, 4, 3),
      gm("Saída / Continuação", c - 8, 6, 4, 3)
    ],
    lights: [],
    tokens: []
  };
}

export const CORE_SCENE_TEMPLATES = Object.freeze({
  blank: {
    label: "Cena Vazia Estruturada",
    description: "Sala genérica fechada, ideal para partir de um blueprint mínimo.",
    defaults: { columns: 30, rows: 22 },
    generate: blankTemplate
  },
  boss_arena: {
    label: "Arena de Boss",
    description: "Arena central com flancos, cobertura, entrada e ponto de revelação.",
    defaults: { columns: 38, rows: 30 },
    generate: bossArenaTemplate
  },
  industrial_forge: {
    label: "Forja / Complexo Industrial",
    description: "Controle, área de risco, linha de trabalho e rota técnica.",
    defaults: { columns: 40, rows: 30 },
    generate: industrialForgeTemplate
  },
  investigation_site: {
    label: "Local de Investigação",
    description: "Pistas redundantes, sala restrita e rota técnica alternativa.",
    defaults: { columns: 36, rows: 28 },
    generate: investigationSiteTemplate
  },
  social_hub: {
    label: "Hub Social",
    description: "Área central de conversa com espaços privados e bastidores.",
    defaults: { columns: 30, rows: 24 },
    generate: socialHubTemplate
  },
  ritual_chamber: {
    label: "Câmara Ritual",
    description: "Foco central, naves laterais e ponto de interrupção.",
    defaults: { columns: 34, rows: 28 },
    generate: ritualChamberTemplate
  },
  underdark_cavern: {
    label: "Caverna do Underdark",
    description: "Contorno irregular, formações naturais e gargalos de movimento.",
    defaults: { columns: 36, rows: 28 },
    generate: cavernTemplate
  }
});

export function listCoreSceneTemplates() {
  return Object.entries(CORE_SCENE_TEMPLATES).map(([key, value]) => ({
    key,
    label: value.label,
    description: value.description,
    defaults: clone(value.defaults)
  }));
}

export function getCoreSceneTemplate(key) {
  const template = CORE_SCENE_TEMPLATES[String(key ?? "").trim().toLowerCase()];
  if (!template) throw new Error(`Template de Scene desconhecido: '${key}'.`);
  return template;
}
