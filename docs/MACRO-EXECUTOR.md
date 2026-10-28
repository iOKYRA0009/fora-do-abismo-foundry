# Jarvis Macro Executor

O Executor é a página inicial da **Central Jarvis para o Mestre**. A navegação também oferece Biblioteca, Personagens, Cenas, Aparências e Sistema. Ferramentas antigas continuam nas seções avançadas dessas áreas. Jogadores começam na Biblioteca e não recebem os controles de execução do Mestre.

Fluxo: **importar → validar → visualizar → confirmar → executar → conferir**. Revise nomes, contadores, posições, imagens, avisos e o código antes de confirmar.

## O que faz

1. Recebe código **JavaScript** colado ou arquivo `.js`/`.txt`. Prévia exibe o código e seus riscos. Somente o Mestre ativo pode confirmar sua execução.
2. Recebe um **pacote estruturado JSON** `jarvis-executor-1`, com NPCs V9, itens e Activities D&D5e, cenas Blueprint V1 (paredes, portas, luzes, sons, tokens), e imagens para Actors, itens e Activities.
3. Aceita arrastar **JSON + arquivos de imagem** juntos para a área de importação, ou selecioná-los no campo de arquivos. Imagens podem ser fornecidas também em base64 dentro do JSON.
4. Confere formato e conteúdo das imagens antes de enviá-las. Cria novos documentos sem substituir nomes já existentes. Em falhas posteriores, tenta remover apenas documentos criados nessa execução.
5. Registra um histórico de execuções do Mestre, com IDs para reverter os documentos novos de um pacote JSON. **Uploads de imagens não são desfeitos**, inclusive quando a importação falha.
6. Preserva as integrações existentes; para ações específicas do Visage/Metamorph use `jarvis.appearance` e `jarvis.transformation` numa macro JS (mesmas autorizações de uma Macro Script normal).

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
