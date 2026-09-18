# Jarvis V9 — Scene Builder

Versão inicial: `0.2.0-beta.5`

## Objetivo

O Scene Builder transforma um blueprint semântico em uma Scene funcional do Foundry VTT V14.

Ele existe para resolver um problema diferente do Actor Importer: antes da arte final, o Mestre precisa de um mapa que faça sentido para jogar. O blueprint define o espaço em **quadrados de grid**, e o Jarvis converte isso para pixels, paredes, portas, luzes, desenhos de apoio e Tokens reais.

O Scene Builder não substitui um editor artístico. A beta.5 cria deliberadamente um **mapa funcional de prototipagem**. Depois que o layout for aprovado em mesa, uma arte final pode substituir o piso sem refazer paredes e posicionamentos.

## API

```js
const jarvis = game.modules.get("fora-do-abismo-foundry").api;
```

### Listar presets das Forjas

```js
console.table(jarvis.scenes.presets());
```

### Pré-visualizar sem criar

```js
console.log(await jarvis.scenes.previewPreset("forjas-01"));
```

A prévia valida o blueprint e testa se todos os Actors referenciados existem no mundo.

### Criar uma Scene

```js
await jarvis.scenes.buildPreset("forjas-01");
```

### Criar as três Scenes das Forjas de uma vez

```js
await jarvis.scenes.buildForjas();
```

O pacote faz uma checagem completa antes de criar qualquer Scene. Se um Actor obrigatório não for encontrado, **nenhuma Scene é criada**.

### Recriar as Scenes

```js
await jarvis.scenes.buildForjas({ replaceExisting: true });
```

Use isso quando os mapas de protótipo forem alterados e você quiser substituir as versões anteriores.

## Presets incluídos

### Forjas 01 — Fundição e Controle

Foco em entrada, Bror, patrulha, escravos, rota principal e rota de manutenção.

### Forjas 02 — Arquivo das Correntes

Foco em investigação, Mestre-Arquivista, Velho Mago Elfo Escravizado, inscrições e rota técnica alternativa.

### Forjas 03 — Forja Regente

Foco em Rainha — Mãe de Nicolau, Guardião da Forja Regente, Mestre das Correntes, rotas laterais e espaço de clímax.

**Proxy não é criado como Token inicial.** Existe apenas uma marcação GM oculta indicando um ponto possível de manifestação, preservando a entrada narrativa e a agência da mesa.

## Actors esperados

Os presets procuram Actors por nome exato, sem diferenciar maiúsculas/minúsculas:

- Bror, o Feitor
- Mestre-Arquivista das Forjas
- Rainha — Mãe de Nicolau
- Velho Mago Elfo Escravizado
- Cão de Escória
- Capataz Rúnico
- Escravo Vinculado
- Guardião da Forja Regente
- Mestre das Correntes

O Scene Builder usa `Actor#getTokenDocument()` para respeitar o Prototype Token já configurado em cada ficha.

## Blueprint mínimo

```json
{
  "schemaVersion": "1.0",
  "scene": {
    "name": "Mapa de Teste",
    "columns": 30,
    "rows": 20,
    "grid": { "size": 100, "distance": 5, "units": "ft" }
  },
  "walls": [],
  "drawings": [],
  "lights": [],
  "tokens": []
}
```

Coordenadas de paredes, desenhos e Tokens usam **quadrados do grid**. Por exemplo `x: 7, y: 12` significa coluna 7, linha 12; não 700/1200 pixels.

## Segurança

- apenas GM cria Scenes;
- Actor ausente interrompe a criação por padrão;
- Scene com mesmo nome não é substituída sem `replaceExisting: true`;
- criação em lote faz preflight de todos os mapas antes de alterar o mundo;
- marcações `kind: "gm"` são criadas ocultas para os jogadores;
- o blueprint é marcado em `flags.fora-do-abismo-foundry.sceneBuilder` para rastreabilidade.

## Limite atual

A beta.5 não instala uma arte de background automaticamente. Foundry V14 possui Scene Levels e a integração de arte deve ser feita como uma segunda etapa para não misturar prototipagem de layout com pipeline visual.
