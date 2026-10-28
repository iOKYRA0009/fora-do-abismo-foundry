# Jarvis Tools 1.3.0 — Mosaico de mapas HD (até 4 setores)

Um pacote Executor pode criar **uma Scene com um único grid** e de **1 a 4 imagens**. Cada imagem é importada como um Tile de fundo, enquanto **paredes, portas e luzes** são documentos da mesma Scene. Não há reconhecimento automático de paredes ou simulação da visão do jogador.

## Exemplo — três setores do Grande Banquete

Os arquivos WEBP abaixo são **exemplos de nomes**, não imagens fornecidas. Crie as imagens reais com resolução consistente, sem grid nem personagens pintados.

```json
{
  "schemaVersion": "jarvis-executor-1",
  "name": "Grande Banquete — Mosaico",
  "assets": [
    {"id":"externo","fileName":"grande-banquete-externo.webp"},
    {"id":"sala","fileName":"grande-banquete-sala.webp"},
    {"id":"porao","fileName":"grande-banquete-porao.webp"}
  ],
  "actors": [],
  "scenes": [{
    "schemaVersion": "1.0",
    "scene": {
      "name": "GRANDE BANQUETE — NOVA CENA",
      "columns": 32,
      "rows": 60,
      "grid": {"size":128,"distance":5,"units":"ft"},
      "visualMode": true,
      "visionPreset": "limited",
      "imagePlacement": {"width":4096,"height":7680},
      "imageTiles": [
        {"name":"Exterior","src":"asset://externo","rect":[0,0,4096,2560],"pixelWidth":4096,"pixelHeight":2560},
        {"name":"Interior","src":"asset://sala","rect":[0,2560,4096,2560],"pixelWidth":4096,"pixelHeight":2560},
        {"name":"Porão","src":"asset://porao","rect":[0,5120,4096,2560],"pixelWidth":4096,"pixelHeight":2560}
      ]
    },
    "walls": [{"a":[512,2560],"b":[1024,2560],"type":"door","state":"closed"}],
    "lights": [{"x":2048,"y":3000,"bright":10,"dim":25}],
    "tokens": []
  }],
  "itemAdditions": []
}
```

**Coordenadas da autoria:** `rect`, `walls`, `lights`, `structures` e `sounds` usam **pixels do atlas** (a tela virtual inteira). A origem (0,0) fica no topo esquerdo. O Jarvis converte para o grid. As coordenadas de `scene.imageTiles` são **rect:[x,y,largura,altura]**, e o tamanho real de cada imagem precisa coincidir com pixelWidth e pixelHeight, que precisam ser iguais a largura e altura do respectivo rect. Espaços entre setores podem existir, mas não pode haver sobreposição.

**Prévia:** use `+ Zoom`, `− Zoom` e `Encaixar`; ative `Mover tela` para percorrer o mapa sem mover paredes/luzes. Desative para corrigir a geometria. As linhas amarelas indicam raios geométricos de luz, não simulação de obstáculos ou iluminação real do Foundry. A prévia preserva a posição de rolagem ao ajustar a geometria.

**Segurança:** máximo quatro setores por Scene. Cada imagem deve ter no máximo 8192px por lado e 8MB no arquivo. Somatório de imagens no Executor até 48MB; **limite preventivo de 48 milhões de pixels decodificados por mosaico** (aproximadamente 192MB RGBA antes de cópias de memória/GPU); JSON selecionado até 12MB. Prefira arrastar os WEBPs mais o JSON juntos; não converta imagens grandes em base64 dentro do JSON. O atlas completo deve manter cada eixo até 32768 pixels. O desempenho real também depende da GPU, memória, navegador e da quantidade de paredes/luzes; teste numa Scene nova em mundo de testes.

**Continuidade:** pacotes anteriores com `backgroundSrc` continuam válidos; `backgroundSrc` e `imageTiles` não podem coexistir na mesma Scene. Os setores são um cenário plano **sem teletransporte automático entre andares**. Para representar porão e interior numa mesma Scene, posicione áreas em regiões distintas do grid e gerencie a transição dos tokens em mesa.

**Fluxo:** arrastar JSON + até quatro imagens → Validar e visualizar → conferir alinhamento/portas/luzes com zoom → corrigir com o mouse se necessário → Baixar pacote ajustado (opcional) → Confirmar e executar → testar visão e colisão com uma conta de jogador.

**NPCs:** nenhum é necessário para o mosaico. Podem ser adicionados posteriormente como tokens da cena ou por pacote separado.
