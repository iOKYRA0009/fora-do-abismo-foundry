# Jarvis V9 — Scene Builder Framework V2

Versão inicial: `0.2.0-beta.11`

## Objetivo

A beta.11 deixa de tratar cada mapa como código especial. O Scene Builder passa a ter uma camada reutilizável com:

- templates de estrutura;
- skins visuais/técnicas;
- presets de campanha;
- composição de blueprint;
- construção a partir de template;
- troca de skin sem reconstruir toda a cena;
- inspeção/diagnóstico de Scene;
- compatibilidade com o Scene Builder V1.

As Forjas continuam existindo, mas agora são apenas os primeiros presets do Framework.

## API

```js
const jarvis = game.modules.get("fora-do-abismo-foundry").api;
const scenes = jarvis.scenes;
```

### Estado do Framework

```js
console.log(scenes.framework.status());
```

### Templates disponíveis

```js
console.table(scenes.framework.templates());
```

Beta.11 inclui:

- `blank`
- `boss_arena`
- `industrial_forge`
- `investigation_site`
- `social_hub`
- `ritual_chamber`
- `underdark_cavern`

Templates criam apenas a estrutura funcional. Eles não obrigam identidade visual.

### Skins disponíveis

```js
console.table(scenes.framework.skins());
```

Beta.11 inclui:

- `neutral_dark`
- `underdark_stone`
- `dark_forge`
- `eldritch_archive`
- `ancient_elf_ruin`
- `warm_tavern`
- `cosmic_corruption`

Skins controlam defaults técnicos como fundo, grid e iluminação. Um background visual específico pode ser fornecido separadamente.

## Criar mapa novo sem alterar o módulo

Exemplo: arena de boss genérica.

```js
await scenes.framework.buildFromTemplate(
  "boss_arena",
  {
    id: "teste-boss",
    skin: "underdark_stone",
    scene: {
      name: "Teste — Arena do Abismo",
      folder: "Testes Jarvis",
      columns: 40,
      rows: 30
    }
  },
  {
    replaceExisting: true,
    view: true
  }
);
```

Exemplo: local de investigação com NPCs.

```js
await scenes.framework.buildSpec({
  schemaVersion: "2.0",
  id: "arquivo-exemplo",
  template: "investigation_site",
  skin: "ancient_elf_ruin",
  scene: {
    name: "Arquivo Élfico — Exemplo",
    folder: "Testes Jarvis",
    columns: 38,
    rows: 28
  },
  tokens: [
    {
      actor: "Mestre-Arquivista das Forjas",
      x: 20,
      y: 11,
      disposition: "neutral",
      role: "social"
    }
  ]
}, {
  replaceExisting: true
});
```

## Background visual

O Framework não exige background. Quando uma imagem já existe:

```js
await scenes.framework.buildSpec({
  schemaVersion: "2.0",
  template: "boss_arena",
  skin: "dark_forge",
  scene: {
    name: "Arena Visual",
    columns: 42,
    rows: 32
  },
  visual: {
    backgroundSrc: "worlds/meu-mundo/maps/arena.webp"
  }
}, {
  replaceExisting: true
});
```

O Tile usa o comportamento validado no Foundry V14:

- um único background Tile;
- posição no centro do canvas;
- `anchorX: 0.5`;
- `anchorY: 0.5`;
- largura/altura iguais à Scene.

## Trocar skin sem refazer paredes e tokens

```js
await scenes.framework.applySkin(
  "Nome da Scene",
  "cosmic_corruption"
);
```

Também é possível substituir apenas a arte:

```js
await scenes.framework.applySkin(
  "Nome da Scene",
  "ancient_elf_ruin",
  {
    backgroundSrc: "worlds/meu-mundo/maps/ruina.webp"
  }
);
```

## Diagnóstico

```js
console.log(scenes.framework.inspect("Forjas 03 — Forja Regente"));
```

O relatório mostra:

- dimensões;
- grid;
- quantidade de paredes;
- portas;
- luzes;
- tokens;
- drawings;
- tiles;
- background Tiles;
- alinhamento full-canvas.

## Presets

```js
console.table(scenes.framework.presets());
```

As Forjas foram registradas no Framework:

- `forjas-01` → template `industrial_forge`, skin `dark_forge`;
- `forjas-02` → template `investigation_site`, skin `eldritch_archive`;
- `forjas-03` → template `boss_arena`, skin `dark_forge`.

Os blueprints atuais das Forjas continuam preservados para não alterar silenciosamente mapas já aprovados.

## Compatibilidade

A API V1 continua funcionando:

```js
jarvis.scenes.build(...)
jarvis.scenes.buildMany(...)
jarvis.scenes.buildForjasVisual(...)
```

A partir da beta.11, novos cenários devem preferir:

```js
jarvis.scenes.framework.buildFromTemplate(...)
jarvis.scenes.framework.buildSpec(...)
```

## Princípio

Template = estrutura jogável.

Skin = defaults de apresentação.

Preset = cena específica da campanha.

Background = arte substituível.

A estrutura não deve depender da arte, e a arte não deve obrigar a reescrever paredes, portas ou tokens.
