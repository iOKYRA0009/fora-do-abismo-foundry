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

### Atualização Jarvis Tools 1.5.5 — Importer V9.1

O **V9.1 é a versão interna do motor de importação**. Na Central → Personagens, o Mestre pode montar um NPC sem escrever JSON, acrescentar habilidades de ataque, salvaguarda, teste, dano, cura e teletransporte, reutilizar modelos, importar retrato e token separados e conferir cenários como ataque contra CA e salvaguarda contra CD. O JSON V9.0 continua aceito. A atualização de uma ficha existente preserva PV, atributos, recursos e condições e altera somente Activities de Items Jarvis correspondentes, além de adicionar Items novos.

Activities novas têm descrição individual no chat. Para corrigir a Alvorada ou outro Item Jarvis **já importado**, selecione a ficha e clique em **Corrigir chat das habilidades**. A ferramenta apresenta a contagem e altera somente Activities Jarvis que ainda exibiriam a descrição inteira do Item. Veja [notas, exemplos e limites](docs/QUALITY-1.5.5.md). Nenhum módulo adicional é obrigatório.

### Atualização Jarvis Tools 1.5.4 — módulos parceiros

A Central agora reúne dez integrações opcionais para automações, cenas e fichas: socketlib, Tagger, Sequencer, Dynamic Active Effects, Item Piles, Token Magic FX, FXMaster, Polyglot, Universal Battlemap Importer e Tidy 5e Sheets. As funções aparecem em **Central → Sistema → Módulos parceiros** e o diagnóstico mostra quais parceiros estão ativos e prontos. O importador de mapas aceita também `.df2vtt`.

Instale apenas os parceiros que desejar usar por **Add-on Modules** e ative-os em **Manage Modules**; Item Piles também precisa de **Item Piles D&D 5e**. As integrações não copiam código nem recursos desses projetos. A versão 1.5.4 inclui as versões anteriores e mantém suas releases disponíveis. Veja [notas e exemplos](docs/QUALITY-1.5.4.md).

### Atualização Jarvis Tools 1.5.3 — Compêndios em PT-BR

Na **Central → Biblioteca → Compêndios**, a busca aceita nomes em português e inglês, inclusive nomes traduzidos pelo Babele. O Mestre pode acrescentar termos ao glossário de D&D e conferir um **Rascunho PT-BR** antes de importar. Quando o Babele estiver ativo, sua tradução tem prioridade; o glossário é um recurso complementar e só substitui termos literais nas descrições que não receberam tradução.

Items importados pela Central a partir da 1.5.3 guardam a origem e uma base de comparação. **Ver atualizações** mostra mudanças e conflitos; **Aplicar atualizações revisadas** atualiza apenas campos que continuam iguais à importação. Edições locais são preservadas. O Babele continua sendo um módulo separado e opcional. Consulte [as notas da versão](docs/QUALITY-1.5.3.md). Esta atualização inclui as versões 1.4.1, 1.5.0, 1.5.1 e 1.5.2, sem alterar as tags anteriores.

### Atualização Jarvis Tools 1.5.2 — Activities sem aprovação

Em **Add-on Modules**, atualize o Jarvis Tools e confira a versão **1.5.2**. Recarregue o mundo e as páginas dos jogadores. O Jarvis não exige mais aprovação de automações nem apresenta o botão de liberar habilidades. Ao usar uma Activity, o script e os efeitos Jarvis rodam no cliente de quem a acionou, respeitando as permissões normais do Foundry. O uso nativo da Activity não é cancelado por falta de aprovação. Veja [notas da correção](docs/QUALITY-1.5.2.md).

A 1.5.2 inclui as alterações das versões 1.4.1, 1.5.0 e 1.5.1; as tags anteriores permanecem intactas. O registro antigo de aprovações fica no mundo, sem ser consultado pela versão atual.

### Histórico: Jarvis Tools 1.5.1 — autorização em tokens

Esta correção incluía as versões 1.4.1 e 1.5.0. A autorização descrita abaixo foi removida na 1.5.2.

Activities usadas a partir de tokens não vinculados agora herdam a autorização da ficha original quando script e efeitos são idênticos. Ao ligar **Uso pelos jogadores**, o Mestre também autoriza as automações próprias dos tokens já existentes. Se o conteúdo for alterado depois, é preciso religar o controle ou aprovar a Activity novamente. O aviso de bloqueio mostra o motivo da recusa. Veja [notas da correção](docs/QUALITY-1.5.1.md).

### Histórico: Jarvis Tools 1.5.0 — Quality of Life

Em **Add-on Modules**, use **Update All** ou **Update** no Jarvis Tools e confirme que o Foundry mostra **1.5.0**. Se o módulo foi instalado manualmente, instale pelo Manifest URL acima para receber as próximas atualizações. Faça backup do mundo antes de atualizar e recarregue o Foundry depois. A versão 1.5.0 não migra nem substitui fichas existentes automaticamente.

Na Central, a importação V9 agora exige **Revisar importação V9 → Confirmar criação**; a inclusão de Items exige **Revisar Items V9 → Confirmar Items na ficha**. A prévia aponta conflitos, atributos, Activities, efeitos e avisos. O Executor oferece **Histórico e recuperação → Baixar relatório**. Consulte [notas da versão e roteiro de verificação](docs/QUALITY-1.5.0.md).

Esta é uma atualização cumulativa: **inclui integralmente a 1.4.1**, inclusive o controle de habilidades Jarvis dos jogadores. A tag `v1.4.1` permanece disponível. Compatibilidade declarada: Foundry V14 e D&D5e 6.0.0–6.0.6. A suíte automatizada passou em 260 testes Node; a validação no Foundry real será feita no mundo do proprietário após a atualização. Os schemas V9, Executor e Scene Package não mudaram.

## Jarvis 1.2.2 — Macro Executor e ajuste visual antes de criar

Após ativar o módulo, clique em **Jarvis — Fora do Abismo** nos controles de **Tokens**. A Central organiza as funções em seis áreas: **Executor**, **Biblioteca**, **Personagens**, **Cenas**, **Aparências** e **Sistema**. O Mestre começa no Executor e vê as ações de administração. Jogadores começam na Biblioteca e só recebem as ações permitidas para seu papel e para os Actors que controlam. As ferramentas anteriores continuam disponíveis nas seções avançadas.

### Uso de habilidades Jarvis pelos jogadores — histórico da v1.4.1

Na v1.4.1, a Central oferecia um botão de aprovação para habilidades Jarvis dos jogadores. Esse controle foi removido na 1.5.2. O script roda no cliente de quem usa a Activity, com suas próprias permissões do Foundry. Efeitos em Actors que o jogador não controla podem exigir ação do Mestre.

A versão anterior permanece na [release v1.4.0](https://github.com/iOKYRA0009/fora-do-abismo-foundry/releases/tag/v1.4.0). Para voltar, instale manualmente o manifesto ou o ZIP dessa release e mantenha a atualização automática desativada até corrigir o problema. Faça backup do mundo no Foundry antes de uma restauração, pois trocar o módulo não reverte alterações já feitas nas fichas.

O Executor recebe JavaScript colado ou arquivos `.js`/`.txt`, além de pacotes JSON `jarvis-executor-1` com personagens, itens, habilidades, efeitos, cenas e imagens. Ele mostra uma prévia antes da execução e exige confirmação explícita do Mestre para JavaScript, que roda com as permissões do Mestre e não tem reversão automática. Para pacotes JSON, valida dados, imagens e geometria antes de criar documentos; o histórico permite reverter de forma conservadora documentos novos da execução. Imagens enviadas permanecem no armazenamento após a reversão. Pacotes JSON também registram perfis Visage e Metamorph para personagens criados no mesmo pacote quando os módulos opcionais estão ativos; os perfis não são aplicados automaticamente aos Tokens. Consulte [o guia do Executor](docs/MACRO-EXECUTOR.md).

A atualização 1.2.2 acrescenta movimentação direta das construções, paredes avulsas, luzes e tokens sobre a prévia do mapa, com recalibração do JSON, desfazer e exportação do pacote corrigido. Os ajustes acontecem antes da execução e não alteram mapas existentes.\n\nA atualização 1.2.1 acrescenta calibração por pixels da imagem e geração automática de paredes/portas a partir de contornos informados no pacote, além da prévia sobreposta à própria arte. Um preset opcional configura visão limitada nos novos tokens. O módulo não identifica com certeza construções em qualquer imagem sem anotações geométricas. Veja o guia do Executor para o formato e as limitações.\n\nO Estúdio de Mapas revisa sugestões antes de criar cenas. Na Central, o Mestre também pode analisar e editar paredes, portas, luzes, sons e escuridão de cenas existentes, com prévia e histórico de desfazer compatível. Itens, classes e personagens usam documentos nativos D&D5e com modos simples e avançado. A Biblioteca oferece comandos gerenciados por categoria e execução conforme as permissões. Consulte [o guia da Central](docs/jarvis-console.md).

Macro Script equivalente ao botão:

```js
game.modules.get("fora-do-abismo-foundry")?.api?.ui?.open()
```

> O Importer V9 mantém seu formato e as APIs anteriores. A suíte Node da 1.5.5 passou em 265/265 verificações. No Foundry V14 Build 369 com D&D5e 6.0.6, a validação anterior do Executor em mundo isolado cobriu criação de NPC, rolagem nativa, cena, imagens, rejeições e reversão. A versão 1.5.5 precisa da conferência do Mestre no próprio mundo, especialmente dos cartões de habilidades da Alvorada e das rolagens do V9.1.

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
- [x] Testes automatizados de regressão e diagnóstico somente leitura
- [x] Interface visual unificada de importação e ferramentas dentro do Foundry

**Primeira entrega de cenas (beta.15):** importação Universal VTT com prévia pelo controle Paredes, validação geométrica inicial, sons em Scene Packages e substituição de cenas com backup. Consulte [o fluxo e seus limites](docs/scene-workflow-phase-1.md).

**Diagnóstico beta.16:** `jarvis.diagnostics.run()` confere a versão publicada, compatibilidade, Importer V9, Scene Builder, Scene Framework, Scene Package, Universal VTT, integrações opcionais e uma amostra de fichas sem alterar o mundo. Veja [como executar e interpretar](docs/diagnostics.md).

**Estúdio de Mapas beta.17:** o controle **Paredes → Jarvis: Estúdio de Mapas** aceita PNG, WEBP e Universal VTT; sugere paredes alinhadas à grade em imagens comuns, permite revisar e desenhar paredes/portas, posicionar luz e som, escolher o ambiente e criar a cena com confirmação. A auditoria `jarvis.scenes.audit()` examina a cena ativa sem alterá-la. Veja [o fluxo e seus limites](docs/scene-workflow-phase-2.md).

**Qualidade de ficha:** `jarvis.diagnostics.compareActor(payload, actor)` compara campos explícitos do arquivo V9 com um Actor já importado e lista diferenças sem modificar a ficha.

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
- puzzles, recompensas e notas do Mestre armazenados em um Journal privado associado à Scene;
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

A API principal é `jarvis.scenes.package`: `validate`, `preview`, `build`, `inspect`, `repairRegions` e `runAction`. O objetivo é manter o motor permanente e trocar apenas os dados e a arte de cada mapa.

## Compatibilidade-alvo

- Foundry VTT: **V14**
- Sistema principal: **D&D5e 6.0.x**
- D&D5e mínimo no manifesto: **6.0.0**
- D&D5e verificado: **6.0.2**

O ambiente informado pelo mestre usa **Foundry 14.369 / dnd5e 6.0.6**. A faixa 6.0.x é aceita com aviso, mas 6.0.6 ainda precisa de teste de integração no mundo antes de ser marcada como verificada.

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


### beta.13 — compatibilidade de RegionBehavior no Foundry V14

A beta.13 detecta dinamicamente o tipo real de **Execute Script** registrado em `CONFIG.RegionBehavior.dataModels` e adiciona `repairRegions(scene)` para reparar uma Scene Package existente sem recriar imagem, paredes, luzes ou Tokens.


### beta.14 — Actors opcionais não entram sozinhos

Por padrão, Actors marcados com `optional: true` ficam apenas no manifesto e **não são colocados na Scene**. Para incluí-los explicitamente, use `includeOptionalActors: true` no `preview`/`build`. Isso preserva decisões narrativas como aliados que só acompanham o grupo se a sessão justificar.


## Mosaico de mapas HD — v1.3.0

O Macro Executor agora pode importar até quatro imagens WEBP/PNG/JPG como **setores independentes de fundo em uma Scene com grid único**, com prévia para ajustar paredes, portas e luzes usando zoom e modo de movimentação. Leia [o guia de pacote e limites](docs/MULTI-MAP-ATLAS.md) antes de preparar mapas grandes. Tokens/NPCs podem ser adicionados depois.


## Qualidade de cenas — v1.4.0

Três recursos originais para o Mestre: **Registro de Produção** (export JSON somente leitura e comparação por documento), **Inspetor HD** (grid, foco individual dos setores e alertas de qualidade na prévia do Executor) e **Diretor de Atmosfera** (três estados cinematográficos, com prévia e restauração da escuridão/cor). Não há dependências novas. Consulte [o guia completo](docs/QUALITY-1.4.0.md) e teste numa cópia do mundo antes de usar em sessão.
