# Jarvis — cenas, primeira entrega

Alvo de execução: Foundry V14; sistema dnd5e 6.0.x. A instalação do mestre informou Foundry 14.369 e dnd5e 6.0.6. A última versão do dnd5e verificada no manifesto continua 6.0.2 até o teste dentro desse mundo.

## Escopo implementado

- O controle **Paredes** oferece **Jarvis: importar mapa Universal VTT** ao Mestre.
- Aceita arquivos `.dd2vtt`, `.uvtt` e JSON Universal VTT 0.2/0.3 com `resolution`, `line_of_sight`, `portals`, `lights` e imagem embutida.
- Mostra uma prévia com contagens e alertas antes de criar a cena. Obstáculos de objetos são opcionais; portais abertos recebem alerta porque alguns exportadores os usam para janelas.
- Segmentos de comprimento zero e fora do mapa são recusados. Paredes/portas exatamente sobrepostas aparecem como alerta.
- Scene Packages também podem definir `sounds` com caminho de áudio, posição em quadrados, raio nas unidades da cena e volume.
- Ao substituir uma cena, o Jarvis primeiro constrói a nova. A anterior permanece no mundo com nome de backup e fora da navegação.
- O importador de Actors recusa versões fora de Foundry V14 e dnd5e 6.0.x. Em 6.0.6, permite importar com aviso de que o teste dentro do mundo ainda é necessário.

## Uso

1. No Foundry, abra um mundo como Mestre e ative o módulo.
2. No canvas, abra **Paredes** e clique em **Jarvis: importar mapa Universal VTT**.
3. Selecione o arquivo e informe o nome da cena.
4. Confira contagens e alertas. A criação só ocorre após o segundo clique.
5. Abra a cena criada com um Token de teste. Confira visão, portas, movimento e luz. Em mapas com luz embutida na arte, as luzes UVTT começam ocultas.

API opcional: `game.modules.get("fora-do-abismo-foundry").api.scenes.package.fromUvtt(json, options)`, `previewUvtt(json, options)` e `buildUvtt(json, conversionOptions, buildOptions)`.

## Limites desta entrega

- A conversão lê **geometria incluída no arquivo UVTT**. Uma imagem PNG/WEBP sem metadados ainda não produz paredes automaticamente.
- A detecção não interpreta se um portal aberto é janela ou porta aberta; o Mestre revisa esse caso.
- A prévia lista problemas geométricos simples. Ainda não simula todas as linhas de visão, rotas de Tokens ou níveis verticais da V14.
- O painel de importação é mínimo. O editor visual de paredes, iluminação e temas do Foundry fica para a segunda entrega.
- As chamadas de código foram testadas localmente; o comportamento no mundo Foundry 14.369/dnd5e 6.0.6 precisa de teste de integração antes da publicação como verificado.

## Próxima entrega proposta

Editor de revisão das sugestões sobre o canvas; detecção assistida em raster; perfis de iluminação/ambientação; diagnóstico com Token de teste; relatório de equivalência de fichas; automações dnd5e restantes e personalização visual mais ampla.
