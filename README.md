# Fora do Abismo — Foundry

Base técnica oficial da campanha **Fora do Abismo** para Foundry VTT.

## Objetivo

Este repositório concentra o código da campanha: Jarvis Importer, macros, automações, Active Effects, utilitários, Scene Builder e, futuramente, compêndios próprios.

A lore completa não deve ser duplicada aqui. O Google Drive continua sendo a fonte documental da campanha; este repositório é a oficina técnica.

## Instalação no Foundry

Instale o módulo por **Manifest URL**:

```text
https://github.com/iOKYRA0009/fora-do-abismo-foundry/releases/latest/download/module.json
```

No Foundry VTT:

1. Abra **Add-on Modules**.
2. Clique em **Install Module**.
3. Cole a URL acima no campo **Manifest URL**.
4. Instale o módulo.
5. Entre no mundo D&D5e e ative **Fora do Abismo — Jarvis Tools** em **Manage Modules**.

O Foundry usa o mesmo Manifest URL para detectar atualizações futuras.

> O pipeline de distribuição é estável; o Jarvis V9 continua em desenvolvimento incremental enquanto validamos fichas e cenas reais da campanha.

## Publicação automática

A workflow `.github/workflows/release.yml` publica automaticamente uma nova versão quando código com um novo número em `module.json` chega à branch `main`.

A release contém:

- `module.json` — manifesto que o Foundry lê;
- `fora-do-abismo-foundry.zip` — pacote instalável;
- uma tag `v<versão>` correspondente à versão do manifesto.

Se a versão já existir, a workflow não sobrescreve silenciosamente aquela release. Para publicar mudanças novas, é obrigatório incrementar `module.json.version`.

## Estado atual

**Milestone 1 — Jarvis Importer V9**

- [x] Manifesto inicial do módulo
- [x] Instalação/atualização via Manifest URL
- [x] Pipeline automático de GitHub Release
- [x] API básica do módulo
- [x] Validação inicial do payload
- [x] Importação genérica de Actor + Embedded Items
- [x] Sistema inicial de imagens e `imgStrategy`
- [x] Activities básicas: attack, save e utility
- [x] Usos, consumo e recuperação por descanso
- [x] Actor semântico: atributos, salvaguardas, perícias, PV, CA e movimento
- [x] Recursos nativos de Actor: primary, secondary e tertiary
- [x] Classe semântica básica: níveis, dado de vida, atributo primário e spellcasting
- [x] Active Effects Jarvis aplicados por Activity
- [x] Scene Builder semântico inicial para Foundry V14
- [x] Presets jogáveis das três Forjas de Karak'Zul
- [x] Backgrounds visuais alinhados e modo Visual/Blueprint para as Forjas
- [x] Scene Framework V2 com templates, skins, presets e diagnóstico reutilizável
- [x] Scene Package Builder V1 para visual, paredes, portas, regiões, NPCs e notas em um único pacote
- [ ] Subclasse e Advancement completos
- [ ] Magias completas e preparação
- [ ] Recursos customizados além dos 3 slots nativos
- [ ] Testes automatizados
- [ ] Interface visual completa de importação dentro do Foundry

## Scene Builder Framework — beta.11

O V9 agora pode construir Scenes funcionais usando um blueprint em quadrados de grid. Ele cria:

- dimensões e grid;
- paredes;
- portas normais, secretas e trancadas;
- luzes;
- desenhos de piso/zona para prototipagem;
- marcações GM ocultas;
- Tokens usando o Prototype Token dos Actors já existentes;
- pasta de Scenes;
- preflight para impedir criação parcial quando Actors obrigatórios não existem.

A beta.11 transforma o Scene Builder em um framework genérico. As Forjas continuam como os primeiros presets reais:

- `forjas-01` — Fundição e Controle;
- `forjas-02` — Arquivo das Correntes;
- `forjas-03` — Forja Regente.

No console ou em uma Macro Script:

```js
const jarvis = game.modules.get("fora-do-abismo-foundry").api;
console.table(jarvis.scenes.framework.templates());
console.table(jarvis.scenes.framework.skins());
console.table(jarvis.scenes.framework.presets());
```

Para criar uma cena nova sem alterar o módulo:

```js
await jarvis.scenes.framework.buildFromTemplate("boss_arena", {
  skin: "underdark_stone",
  scene: { name: "Nova Arena", columns: 40, rows: 30 }
}, { replaceExisting: true });
```

Compatibilidade com as Forjas:

```js
const jarvis = game.modules.get("fora-do-abismo-foundry").api;
console.table(jarvis.scenes.presets());
await jarvis.scenes.buildForjasVisual({ replaceExisting: true });
```

Para recriar depois de alterações:

```js
await jarvis.scenes.buildForjasVisual({ replaceExisting: true });
```

O Scene Builder usa o Foundry nativo; não exige Dungeon Draw, Dungeon Alchemist ou outro módulo de mapa. A beta.11 adiciona templates reutilizáveis, skins, presets registráveis, composição V2 e inspeção de cenas. O comportamento de background Tile full-canvas validado na beta.10 foi mantido.

## Scene Package Builder — beta.12

A beta.12 adiciona uma camada acima do Scene Framework. Um **Scene Package** descreve o mapa completo sem exigir uma nova versão do módulo para cada Scene.

O pacote pode conter:

- imagem de fundo já hospedada ou embutida em Base64 para upload automático;
- dimensões, grid, paredes, portas, passagens secretas e barreiras baixas;
- luzes;
- Actors obrigatórios e opcionais, com posição, tamanho, disposição e estado oculto;
- Scene Regions para perigos, puzzles, gatilhos e áreas narrativas;
- fallback para Drawing oculto caso o Foundry recuse um Region;
- puzzles, recompensas e notas do Mestre armazenados no manifesto da Scene;
- ações manuais reutilizáveis, como revelar ou ocultar um Token;
- inspeção final do pacote criado.

Exemplo mínimo:

```js
const jarvis = game.modules.get("fora-do-abismo-foundry").api;

await jarvis.scenes.package.build({
  schemaVersion: "1.0",
  id: "minha-scene",
  scene: { name: "Minha Scene", columns: 40, rows: 30 },
  visual: { backgroundSrc: "worlds/meu-mundo/assets/mapa.webp" },
  walls: [],
  actors: [],
  regions: []
}, { replaceExisting: true });
```

A API principal é `jarvis.scenes.package`: `validate`, `preview`, `build`, `inspect` e `runAction`. O objetivo é manter o motor permanente e trocar apenas os dados e a arte de cada mapa.

## Compatibilidade-alvo

- Foundry VTT: **V14**
- Sistema principal: **D&D5e 6.0.x**
- D&D5e mínimo no manifesto: **6.0.0**
- D&D5e verificado: **6.0.2**

O D&D5e 6.0.2 é a base de desenvolvimento e teste do Jarvis V9. A camada `jarvis` serve como API estável para evitar que cada atualização do sistema obrigue a reescrever todas as fichas.

## Estrutura

```text
.
├── .github/workflows/release.yml
├── module.json
├── scripts/
│   ├── main.js
│   ├── scenes/
│   │   ├── forjas-presets.js
│   │   ├── scene-blueprint-validator.js
│   │   └── scene-builder.js
│   └── importer/
│       ├── adapters/
│       ├── images/
│       ├── resources/
│       ├── v9/
│       └── validators/
├── schemas/
├── styles/
├── docs/
└── README.md
```

## Princípio do V9

O importer não deve apenas criar uma ficha "bonita". Ele precisa preservar funcionalidade: atributos, rolagens, recursos, consumo, usos, efeitos e descansos devem funcionar dentro do Foundry.

A mesma regra agora vale para Scenes: um mapa não deve apenas ser bonito. Entrada, circulação, paredes, portas, visão, luz, posição de NPCs e rotas precisam funcionar na mesa.

Quando algo ainda não estiver implementado, o Jarvis deve falhar de forma clara em vez de fingir que funcionou.

## Documentação

- `docs/importer-format.md` — formato geral do payload V9
- `docs/image-pipeline.md` — arquitetura de imagens e geração futura
- `docs/dnd5e-adapter.md` — camada semântica e adaptação para D&D5e
- `docs/scene-builder.md` — formato e uso do Scene Builder V1
- `docs/scene-framework-v2.md` — Framework V2, templates, skins e criação genérica
