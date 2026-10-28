# Jarvis Macro Executor

O Executor é a página inicial da **Central Jarvis para o Mestre**. A navegação também oferece Biblioteca, Personagens, Cenas, Aparências e Sistema. Ferramentas antigas continuam nas seções avançadas dessas áreas. Jogadores começam na Biblioteca e não recebem os controles de execução do Mestre.

Fluxo: **importar → validar → visualizar → confirmar → executar → conferir**. Revise nomes, contadores, posições, imagens, avisos e o código antes de confirmar.

## O que faz

1. Recebe código **JavaScript** colado ou arquivo `.js`/`.txt`. Prévia exibe o código e seus riscos. Somente o Mestre ativo pode confirmar sua execução.
2. Recebe um **pacote estruturado JSON** `jarvis-executor-1`, com NPCs V9, itens e Activities D&D5e, cenas Blueprint V1 (paredes, portas, luzes, sons, tokens), imagens para Actors, itens e Activities, e perfis opcionais Visage/Metamorph.
3. Aceita arrastar **JSON + arquivos de imagem** juntos para a área de importação, ou selecioná-los no campo de arquivos. Imagens podem ser fornecidas também em base64 dentro do JSON.
4. Confere formato e conteúdo das imagens antes de enviá-las. Cria novos documentos sem substituir nomes já existentes. Em falhas posteriores, tenta remover apenas documentos criados nessa execução.
5. Registra um histórico de execuções do Mestre, com IDs para reverter os documentos novos de um pacote JSON. **Uploads de imagens não são desfeitos**, inclusive quando a importação falha.
6. Pode **registrar** perfis Visage/Metamorph em personagens novos do pacote quando os módulos opcionais estão ativos. Registrar um perfil não aplica aparência nem transforma um Token. Para aplicar ou remover uma forma depois, use as ações da Central ou `jarvis.appearance` e `jarvis.transformation` numa macro JS com autorização do Mestre.

### Por que JavaScript, não C++ ou Java?

A API do Foundry VTT funciona no ambiente JavaScript do navegador. Usar JavaScript aqui é integração direta, com acesso às APIs públicas do Foundry e dos módulos ativos. C++/Java exigiriam um serviço externo para tarefas que o JavaScript resolve diretamente. Em conteúdo produzido pelo ChatGPT, prefira **pacotes JSON** para operações declarativas, pois podem ser pré-validados.

### Formato de pacote

```json
{
  "schemaVersion": "jarvis-executor-1",
  "name": "Forja de teste",
  "assets": [
    { "id": "retrato", "fileName": "guarda.webp" },
    { "id": "espada", "fileName": "espada.png" },
    { "id": "mapa", "fileName": "forja.png" }
  ],
  "actors": [
    {
      "schemaVersion": "9.0",
      "actor": {
        "name": "GUARDA TESTE EXECUTOR", "type": "npc",
        "img": "asset://retrato",
        "prototypeToken": {
          "texture": { "src": "asset://retrato" },
          "width": 1, "height": 1, "actorLink": false
        },
        "jarvis": {
          "hp": { "value": 32, "max": 32 },
          "ac": 15,
          "abilities": {
            "str": 14, "dex": 12, "con": 14,
            "int": 10, "wis": 11, "cha": 8
          }
        }
      },
      "items": [
        {
          "name": "Espada da Sentinela",
          "type": "weapon",
          "img": "asset://espada",
          "jarvis": {
            "description": "Uma espada de teste.",
            "activities": [
              {
                "type": "attack", "name": "Golpe da Espada",
                "img": "asset://espada",
                "activation": { "type": "action" },
                "attack": { "type": { "value": "melee", "classification": "weapon" }, "ability": "str" },
                "damage": { "parts": [ "1d8 + @mod" ] }
              }
            ]
          }
        }
      ],
      "effects": []
    }
  ],
  "scenes": [
    {
      "schemaVersion": "1.0",
      "scene": {
        "name": "FORJA TESTE EXECUTOR",
        "columns": 20, "rows": 15,
        "grid": { "size": 100, "distance": 5, "units": "ft" },
        "backgroundSrc": "asset://mapa",
        "visualMode": true
      },
      "walls": [
        { "a": [2,2], "b": [18,2], "type": "wall" },
        { "a": [18,2], "b": [18,13], "type": "wall" },
        { "a": [18,13], "b": [2,13], "type": "wall" },
        { "a": [2,13], "b": [2,2], "type": "wall" }
      ],
      "lights": [ { "x": 10, "y": 8, "dim": 25, "bright": 10 } ],
      "tokens": [ { "actor": "GUARDA TESTE EXECUTOR", "x": 5, "y": 6, "disposition": "hostile" } ]
    }
  ],
  "itemAdditions": []
}
```

Os arquivos `guarda.webp`, `espada.png` e `forja.png` devem ser selecionados juntos com o JSON no Executor, ou representados com `mimeType` e `dataBase64` nas entradas `assets`.

`asset://<id>` é trocado pelo **caminho real enviado ao Foundry**, inclusive em ícones de habilidades e itens, tokens e fundos. Anexe todos os arquivos citados junto com o JSON ou use `mimeType` e `dataBase64` para ter um único arquivo. O Executor confere assinatura PNG/JPG/WebP/GIF, tamanho e, quando o navegador permite, decodificação. Não sobrescreve nomes já existentes no armazenamento.

As posições de paredes, luzes, sons e tokens são dadas em **células da grade**. A prévia mostra a conversão para pixels e bloqueia coordenadas ausentes ou fora do mapa. O Scene Builder continua responsável pela criação da cena.

### Perfis Visage e Metamorph no pacote JSON

Adicione `appearanceProfiles` e/ou `transformationProfiles` no **objeto raiz** do pacote, ao lado de `actors` e `scenes`. Exemplo parcial:

```json
{
  "appearanceProfiles": [
    {
      "actor": "GUARDA TESTE EXECUTOR",
      "key": "armadura_sombria",
      "visageId": "id-do-visage-existente",
      "mode": "overlay",
      "label": "Armadura Sombria"
    }
  ],
  "transformationProfiles": [
    {
      "actor": "GUARDA TESTE EXECUTOR",
      "key": "forma_lobo",
      "targetActor": "FORMA LOBO EXISTENTE",
      "hpMode": "keep-original",
      "label": "Forma de Lobo"
    }
  ]
}
```

`actor` deve nomear um personagem **novo criado em `actors` pelo mesmo pacote**; o Executor não modifica fichas existentes para registrar perfis. `targetActor` pode nomear outro personagem novo do pacote ou um Actor já existente no mundo. `visageId` é o identificador de uma aparência preparada no Visage; confira sua existência antes da execução, pois a prévia verifica a API ativa, mas não resolve esse identificador. `key` identifica o perfil na ficha e precisa ser única por personagem em cada lista; `label` é opcional.

`mode` aceita `identity` (padrão) ou `overlay`. `hpMode` aceita `independent`, `keep-original` (padrão), `absolute` ou `percent`. Cada lista aceita até 40 entradas. A prévia mostra os contadores, o personagem, a chave e o alvo de cada perfil. Visage/Metamorph precisam estar ativos e com API disponível para validar e importar seus respectivos perfis. A execução **apenas registra** os perfis nos personagens novos: não aplica skins, não transforma Tokens e não altera o Actor usado como `targetActor`. Na reversão de um pacote, os perfis desaparecem junto com os personagens novos removidos.

## Calibração de mapas e posicionamento automático (1.2.1)

Para novas cenas, o Executor pode receber uma geometria **marcada em pixels da própria imagem**, sem exigir que o Mestre desenhe paredes ou luzes no Foundry. O criador do pacote (por exemplo, o ChatGPT) identifica na arte o contorno de uma construção e a posição das tochas; o Jarvis **calcula a escala e cria a geometria nativa**.

Exemplo dentro de `scenes[0]`, mantendo o esquema `"schemaVersion":"1.0"` da cena e o esquema raiz `"jarvis-executor-1"`:

```json
{
  "schemaVersion": "1.0",
  "scene": {
    "name": "TESTE - Cabana calibrada",
    "columns": 25, "rows": 20,
    "grid": { "size": 64, "distance": 5, "units": "ft" },
    "visualMode": true, "backgroundSrc": "asset://floresta",
    "imagePlacement": { "width": 1600, "height": 1280 },
    "visionPreset": "limited",
    "environment": { "darknessLevel": 0.65 }
  },
  "structures": [{
    "name": "Cabana de madeira",
    "rect": [638, 235, 350, 378],
    "doors": [{ "edge": 3, "center": 0.25, "width": 76 }],
    "light": { "x": 675, "y": 509, "bright": 10, "dim": 20 }
  }],
  "lights": [{ "x": 1073, "y": 911, "bright": 10, "dim": 25 }],
  "tokens": [{ "actor": "Goblin de Teste", "x": 400, "y": 280, "vision": { "enabled": true, "range": 60 } }]
}
```

**Como funciona:** `scene.imagePlacement` determina as dimensões reais da arte. Coordenadas de `walls`, `lights`, `sounds` e `tokens` passam a representar pixels da imagem; o executor converte tudo para células da cena e mostra na prévia sobre a própria imagem. As construções em `structures` podem usar `rect:[x,y,largura,altura]` ou `outline:[[x,y],...]`, além de portas `{edge,center,width}`. A numeração de `edge` começa em zero e acompanha os cantos do contorno, fechando o último no primeiro. `center` é a fração da parede (0 a 1), `width` é a largura da porta em pixels. O Jarvis divide a parede correspondente em dois trechos e uma porta nativa.

`visionPreset:"limited"` habilita visão por token e aplica alcance padrão de 60 pés, salvo quando `token.vision` especifica outro alcance. Isso só afeta **novas cenas** que optem pelo modo calibrado. O Mestre ainda pode enxergar o mapa inteiro por privilégios GM; valide também com um usuário de jogador.

**Limitação importante:** esta função não é inteligência visual genérica que descobre sozinha portas e paredes em qualquer pintura. **Alguém precisa identificar os contornos no pacote**; o Jarvis passa a calcular, conferir e instalar a geometria sem ações manuais no Foundry. A prévia ilustrada ajuda a identificar qualquer erro antes de confirmar. O importador recusa proporções incompatíveis e verifica as dimensões reais do bitmap quando o navegador pode decodificá-lo.

---

## Ajuste visual antes da importação (1.2.2)

A prévia do pacote agora contém **Ajustar mapa antes de criar**. Arraste com o mouse os elementos sobre a imagem:

- **Construção (contorno laranja):** move a estrutura completa, mantendo largura, altura e posição relativa da porta. Uma luz explícita pertencente à estrutura acompanha o movimento.
- **Luz (círculo amarelo):** move somente a fonte de luz. Luzes geradas pelo contorno podem ser reposicionadas independentemente.
- **Token (quadrado verde):** move o token sem alterar seu tamanho.
- **Parede avulsa (linha laranja) e seus extremos:** permite reposicionar segmentos que foram definidos diretamente em `walls`. Construções criadas a partir de `structures` devem ser arrastadas pelo seu contorno, para preservar o fechamento e a porta.

**Fluxo recomendado:** carregue o JSON e as imagens → **Validar e visualizar** → arraste até alinhar → **Confirmar e executar**. Cada movimento gera um novo JSON e uma nova validação. Nada é escrito no mundo durante a edição da prévia.

Use **Desfazer ajuste** para recuperar o movimento anterior (até 20 ações), ou **Baixar pacote ajustado** para salvar o JSON e reutilizá-lo sem precisar repetir os alinhamentos em outra sessão.

A prévia não modifica cenas que já existem. A execução continua criando apenas novos documentos conforme as regras do Executor, com confirmação, histórico e reversão. Ajustar construções inteiras evita recalcular manualmente cada parede. O editor não faz reconhecimento automático de todas as paredes de uma imagem e não substitui o Estúdio de Mapas para edição de cenas existentes.

---

## Segurança e limitações

- **Atenção:** JS executa com as permissões do Mestre, pode alterar o mundo. Prévia exibe o código, mas não consegue prever alterações arbitrárias nem desfazê-las.
- O pacote JSON só admite documentos novos, não substitui Scenes ou Actors existentes. A reversão confere a identidade da execução antes de remover documentos novos. Imagens enviadas permanecem no armazenamento e aparecem no histórico para revisão manual.
- O histórico é vinculado ao Mestre e ao mundo. Não use a reversão para apagar alterações feitas depois por outra pessoa; confira os itens pulados e os avisos que ela apresentar.
- A prévia é **estrutural** e não simula rolagens de ataque nem garante funcionamento em combate do D&D5e 6.0.6. Revise Activities importadas na ficha e teste rolagens num mundo isolado.
- Arquivos de imagem: PNG, JPG, WebP e GIF, limite de 8 MB por imagem, 48 MB no total. Até 20 Actors, 10 Scenes e 40 assets.
- ZIP não é importado automaticamente. Selecione JSON e imagens no mesmo campo de arquivos ou incorpore as imagens no JSON.
- Dependências como Visage e Metamorph devem estar instaladas e ativas para que scripts que as chamam funcionem.
- Não execute pacotes desconhecidos diretamente no mundo principal. **Mundo de teste primeiro**.

## Macro JavaScript (modo Script)

```js
const mod = game.modules.get("fora-do-abismo-foundry")?.api;
if (!mod) throw new Error("Jarvis indisponível");
console.log("Módulo Jarvis", mod.version);
return await mod.diagnostics.run({ checkUpdates: false });
```

No Macro Executor, o parâmetro `jarvis` já referencia `mod`. É possível usar diretamente `jarvis.importer`, `jarvis.scenes`, `jarvis.appearance` e `jarvis.transformation`. O modo JavaScript exige uma confirmação explícita específica porque roda com todas as permissões do Mestre e **não tem reversão automática**. O próprio código deve conferir `jarvis.appearance.status()` e `jarvis.transformation.status()` antes de chamar integrações opcionais.

**Resultado desejado para um teste real:** importar NPC com imagem, armas e Activity e um mapa com paredes, luz e token em uma execução; conferir as fichas e rolar os ataques no Foundry.
