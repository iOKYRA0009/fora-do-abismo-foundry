const BASE_GRID = {
  size: 100,
  distance: 5,
  units: "ft",
  color: "#000000",
  alpha: 0.2,
  thickness: 1
};

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

function light(name, x, y, dim = 30, bright = 10, color = "#d46a2f") {
  return { name, x, y, dim, bright, color, alpha: 0.42, luminosity: 0.3, contrast: 0.15, shadows: 0.4 };
}

const forjas01 = {
  schemaVersion: "1.0",
  id: "forjas-01-fundicao-controle",
  metadata: {
    campaign: "Fora do Abismo",
    arc: "Forjas de Karak'Zul",
    status: "PREPARADO",
    purpose: "Entrada, leitura do espaço, pressão industrial e múltiplas rotas."
  },
  scene: {
    name: "Forjas 01 — Fundição e Controle",
    folder: "Fora do Abismo — Forjas",
    columns: 40,
    rows: 30,
    grid: BASE_GRID,
    backgroundColor: "#090705",
    tokenVision: true,
    navigation: false
  },
  drawings: [
    floor("Piso da Fundição", 2, 3, 36, 24, { fillColor: "#211915" }),
    floor("Sala de Bror", 4, 5, 8, 7, { fillColor: "#2a211b" }),
    zone("Canal de Escória", 21, 8, 11, 8, { fillColor: "#7a2f14", fillAlpha: 0.35 }),
    zone("Linha de Trabalho", 12, 17, 14, 7, { fillColor: "#3c3027", fillAlpha: 0.32 }),
    floor("Corredor de Manutenção", 30, 18, 7, 7, { fillColor: "#181819" }),
    gm("A — Entrada do Grupo", 17.5, 25, 5, 1.5),
    gm("B — Bror / Controle", 4.5, 5.5, 7, 6),
    gm("C — Patrulha do Capataz", 15, 12, 7, 5),
    gm("D — Saída Principal para Arquivos", 17.5, 3, 5, 1.5),
    gm("E — Rota de Manutenção", 34.5, 18, 2, 6)
  ],
  walls: [
    wall([2, 3], [18, 3]), door([18, 3], [21, 3]), wall([21, 3], [38, 3]),
    wall([38, 3], [38, 12]), door([38, 12], [38, 15]), wall([38, 15], [38, 27]),
    wall([38, 27], [22, 27]), door([22, 27], [18, 27]), wall([18, 27], [2, 27]),
    wall([2, 27], [2, 3]),

    wall([4, 5], [12, 5]), wall([4, 5], [4, 12]), wall([4, 12], [12, 12]),
    wall([12, 5], [12, 8]), door([12, 8], [12, 10]), wall([12, 10], [12, 12]),

    wall([30, 18], [37, 18]), wall([30, 18], [30, 25]),
    wall([30, 25], [34, 25]), secret([34, 25], [36, 25]), wall([36, 25], [37, 25]),
    wall([37, 18], [37, 25])
  ],
  lights: [
    light("Forja Oeste", 10, 16, 35, 12, "#e26b2d"),
    light("Escória Central", 26, 12, 40, 14, "#ff5b24"),
    light("Forja Leste", 33, 20, 30, 8, "#b94c2a")
  ],
  tokens: [
    { actor: "Bror, o Feitor", x: 7, y: 8, disposition: "neutral", role: "social" },
    { actor: "Capataz Rúnico", x: 17, y: 14, disposition: "hostile", role: "patrol" },
    { actor: "Cão de Escória", x: 27, y: 12, disposition: "hostile", role: "guard" },
    { actor: "Escravo Vinculado", x: 13, y: 19, disposition: "neutral", role: "worker" },
    { actor: "Escravo Vinculado", x: 18, y: 21, disposition: "neutral", role: "worker" },
    { actor: "Escravo Vinculado", x: 24, y: 19, disposition: "neutral", role: "worker" }
  ]
};

const forjas02 = {
  schemaVersion: "1.0",
  id: "forjas-02-arquivo-correntes",
  metadata: {
    campaign: "Fora do Abismo",
    arc: "Forjas de Karak'Zul",
    status: "PREPARADO",
    purpose: "Investigação, história élfica apagada e encontro com o velho mago."
  },
  scene: {
    name: "Forjas 02 — Arquivo das Correntes",
    folder: "Fora do Abismo — Forjas",
    columns: 38,
    rows: 28,
    grid: BASE_GRID,
    backgroundColor: "#08090b",
    tokenVision: true,
    navigation: false
  },
  drawings: [
    floor("Arquivo Antigo", 2, 2, 34, 24, { fillColor: "#17191c" }),
    floor("Cela de Pesquisa", 4, 8, 8, 9, { fillColor: "#161315" }),
    zone("Mesas e Estantes", 15, 7, 14, 12, { fillColor: "#2a2521", fillAlpha: 0.35 }),
    zone("Galeria de Inscrições", 14, 3, 16, 3, { fillColor: "#26203a", fillAlpha: 0.3 }),
    floor("Passagem Técnica", 29, 18, 6, 6, { fillColor: "#111316" }),
    gm("A — Entrada da Fundição", 16.5, 24, 5, 1.5),
    gm("B — Mestre-Arquivista", 18, 9, 6, 5),
    gm("C — Velho Mago Elfo Escravizado", 5, 10, 6, 5),
    gm("D — Inscrições Élficas", 16, 3, 12, 2),
    gm("E — Estrutura reage à presença de Nicolau", 24, 4, 4, 2),
    gm("F — Saída para a Forja Regente", 16.5, 2, 5, 1.5),
    gm("G — Rota Técnica Alternativa", 31, 20, 3, 3)
  ],
  walls: [
    wall([2, 2], [16, 2]), door([16, 2], [21, 2]), wall([21, 2], [36, 2]),
    wall([36, 2], [36, 26]),
    wall([36, 26], [21, 26]), door([21, 26], [16, 26]), wall([16, 26], [2, 26]),
    wall([2, 26], [2, 2]),

    wall([4, 8], [12, 8]), wall([4, 8], [4, 17]), wall([4, 17], [12, 17]),
    wall([12, 8], [12, 11]), door([12, 11], [12, 14], { state: "locked" }), wall([12, 14], [12, 17]),

    wall([29, 18], [35, 18]), wall([29, 18], [29, 24]), wall([35, 18], [35, 24]),
    wall([29, 24], [31, 24]), secret([31, 24], [34, 24]), wall([34, 24], [35, 24])
  ],
  lights: [
    light("Cristal Arquivo 1", 11, 6, 24, 7, "#7257a8"),
    light("Cristal Arquivo 2", 25, 7, 26, 8, "#7257a8"),
    light("Braseiro Central", 22, 17, 28, 8, "#bb6330")
  ],
  tokens: [
    { actor: "Mestre-Arquivista das Forjas", x: 20, y: 11, disposition: "neutral", role: "social" },
    { actor: "Velho Mago Elfo Escravizado", x: 7, y: 12, disposition: "friendly", role: "prisoner" },
    { actor: "Escravo Vinculado", x: 16, y: 16, disposition: "neutral", role: "worker" },
    { actor: "Escravo Vinculado", x: 27, y: 14, disposition: "neutral", role: "worker" }
  ]
};

const forjas03 = {
  schemaVersion: "1.0",
  id: "forjas-03-forja-regente",
  metadata: {
    campaign: "Fora do Abismo",
    arc: "Forjas de Karak'Zul",
    status: "PREPARADO",
    purpose: "Confronto/revelação com a Rainha, espaço para boss e manifestação de Proxy sem trilho obrigatório."
  },
  scene: {
    name: "Forjas 03 — Forja Regente",
    folder: "Fora do Abismo — Forjas",
    columns: 42,
    rows: 32,
    grid: BASE_GRID,
    backgroundColor: "#070607",
    tokenVision: true,
    navigation: false
  },
  drawings: [
    floor("Câmara Regente", 2, 2, 38, 28, { fillColor: "#191516" }),
    zone("Forja Regente", 15, 12, 12, 10, { fillColor: "#632718", fillAlpha: 0.38 }),
    zone("Plataforma da Rainha", 16, 6, 10, 5, { fillColor: "#31223a", fillAlpha: 0.45 }),
    floor("Galeria Oeste", 4, 6, 7, 17, { fillColor: "#15171a" }),
    floor("Galeria Leste", 31, 6, 7, 17, { fillColor: "#15171a" }),
    zone("Canal de Metal Vivo", 12, 24, 18, 3, { fillColor: "#7a301d", fillAlpha: 0.3 }),
    gm("A — Entrada do Grupo", 18, 28, 6, 1.5),
    gm("B — Rainha — Mãe de Nicolau", 18, 7, 6, 3),
    gm("C — Guardião da Forja Regente (inativo até gatilho)", 18, 15, 6, 4),
    gm("D — Mestre das Correntes", 31, 15, 5, 5),
    gm("E — Ponto de manifestação de Proxy", 19, 4, 4, 2),
    gm("F — Saída / rota antiga", 5, 2, 5, 1.5),
    gm("G — Cobertura / rota lateral", 5, 10, 5, 10),
    gm("H — Cobertura / rota lateral", 32, 10, 5, 10)
  ],
  walls: [
    wall([2, 2], [5, 2]), door([5, 2], [10, 2]), wall([10, 2], [40, 2]),
    wall([40, 2], [40, 30]),
    wall([40, 30], [24, 30]), door([24, 30], [18, 30]), wall([18, 30], [2, 30]),
    wall([2, 30], [2, 2]),

    wall([4, 6], [11, 6]), wall([11, 6], [11, 13]),
    wall([11, 16], [11, 23]), wall([11, 23], [4, 23]),
    door([11, 13], [11, 16]),

    wall([31, 6], [38, 6]), wall([31, 6], [31, 13]),
    wall([31, 16], [31, 23]), wall([31, 23], [38, 23]),
    door([31, 13], [31, 16])
  ],
  lights: [
    light("Forja Regente Central", 21, 17, 45, 15, "#e44d26"),
    light("Cristal da Rainha", 21, 8, 28, 9, "#7c5ab0"),
    light("Galeria Oeste", 7, 15, 22, 6, "#8d5e3c"),
    light("Galeria Leste", 35, 15, 22, 6, "#8d5e3c")
  ],
  tokens: [
    { actor: "Rainha — Mãe de Nicolau", x: 20, y: 8, disposition: "neutral", role: "social" },
    { actor: "Guardião da Forja Regente", x: 20, y: 17, disposition: "hostile", role: "boss", hidden: true, width: 2, height: 2 },
    { actor: "Mestre das Correntes", x: 33, y: 17, disposition: "hostile", role: "boss" }
  ]
};

export const FORJAS_SCENE_PRESETS = Object.freeze({
  "forjas-01": forjas01,
  "forjas-02": forjas02,
  "forjas-03": forjas03
});

export function listForjasScenePresets() {
  return Object.entries(FORJAS_SCENE_PRESETS).map(([key, value]) => ({
    key,
    id: value.id,
    name: value.scene.name,
    purpose: value.metadata?.purpose ?? ""
  }));
}

export function getForjasScenePreset(key) {
  const preset = FORJAS_SCENE_PRESETS[String(key ?? "").trim().toLowerCase()];
  if (!preset) throw new Error(`Preset de Scene desconhecido: '${key}'.`);
  return foundry.utils.deepClone(preset);
}
