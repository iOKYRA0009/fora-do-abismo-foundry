# Jarvis V9 — Scene Builder

Versão visual: `0.2.0-beta.10`

## Objetivo

O Scene Builder transforma um blueprint semântico em uma Scene funcional do Foundry VTT V14.

Ele existe para resolver um problema diferente do Actor Importer: antes da arte final, o Mestre precisa de um mapa que faça sentido para jogar. O blueprint define o espaço em **quadrados de grid**, e o Jarvis converte isso para pixels, paredes, portas, luzes, desenhos de apoio e Tokens reais.

A beta.8 usa **WEBP rasterizado no pacote de release** e monta a arte como um **Tile travado cobrindo a Scene inteira**. Isso evita depender do campo de background da Scene e torna o carregamento mais previsível no Foundry V14. As paredes, portas, luzes e Tokens continuam sendo documentos nativos independentes.

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
await jarvis.scenes.buildForjasVisual({ replaceExisting: true });
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


## Modos da beta.7

### Visual — recomendado para mesa

```js
await jarvis.scenes.buildForjasVisual({ replaceExisting: true });
```

Usa os backgrounds de `assets/maps/`, mantém paredes/portas/luzes/tokens e não cria o overlay técnico de Drawings.

### Blueprint — diagnóstico

```js
await jarvis.scenes.buildForjasBlueprint({ replaceExisting: true });
```

Recria as mesmas Scenes com os retângulos e rótulos técnicos. Use apenas quando for necessário conferir geometria ou posição.

### Backgrounds inclusos

- `assets/maps/forjas-01.svg` — Fundição industrial, canal de escória, sala de controle e manutenção.
- `assets/maps/forjas-02.svg` — Arquivo élfico, cela, estantes, inscrições e passagem técnica.
- `assets/maps/forjas-03.svg` — Forja Regente, plataforma da Rainha, galerias laterais, canal de metal vivo e cicatriz geométrica ligada ao ponto de manifestação de Proxy.

Os SVGs têm as mesmas dimensões lógicas dos presets (100 px por quadrado), então o background, grid e paredes permanecem alinhados.


## Beta.8 — pipeline visual blindado

Durante a publicação da release, o GitHub Actions converte automaticamente os SVGs-fonte das Forjas para WEBP usando librsvg + cwebp. A release falha se qualquer um dos três WEBPs não for criado.

No mundo, o Scene Builder cria a arte visual como um `Tile` nativo:

- origem `x: 0 / y: 0`;
- largura e altura iguais ao canvas inteiro;
- textura WEBP do próprio módulo;
- travado;
- não oculto;
- ordenação baixa;
- criado antes de paredes, luzes e Tokens.

Os SVGs continuam no módulo como fonte/fallback técnico, mas o modo Visual prefere WEBP.


## Beta.9 — correção parcial de Tile anchor no Foundry V14

O Foundry V14 passou a posicionar o mesh de Tile diretamente no `(x, y)` do TileDocument e expõe `anchorX`/`anchorY` no TileData. O Scene Builder agora define explicitamente:

```js
anchorX: 0,
anchorY: 0
```

Assim o canto superior esquerdo da arte coincide com `x: 0, y: 0`, fazendo o Tile full-canvas ocupar exatamente a Scene inteira.

A beta.9 também:

- centraliza a visão inicial da Scene;
- deixa o grid mais discreto;
- reduz raios e intensidade das luzes para evitar círculos coloridos dominando a arte.


## Beta.10 — Tile central único validado em mesa

O hotfix testado no mundo real mostrou que o comportamento estável do Foundry V14 é usar um único Tile full-canvas com pivô central:

```js
x: scene.width / 2,
y: scene.height / 2,
width: scene.width,
height: scene.height,
anchorX: 0.5,
anchorY: 0.5
```

A beta.10 incorpora exatamente esse comportamento ao Scene Builder. O fallback duplicado deixou de ser criado como segundo Tile: o Builder usa WEBP quando disponível e SVG apenas quando não existe fonte raster preferencial.

Isso evita:
- duplicação de background;
- deslocamento para fora do canvas;
- validações falsas de desalinhamento;
- arte ocupando apenas um quadrante da Scene.

A visão inicial também usa escala 1 e centro do canvas.
