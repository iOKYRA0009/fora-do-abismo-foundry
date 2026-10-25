# Jarvis — Estúdio de Mapas beta.17

Alvo: Foundry V14 e dnd5e 6.0.x. O Estúdio usa Scene, Wall, AmbientLight e AmbientSound nativos. Não depende de outro módulo.

## Usar

1. Entre como Mestre em um mundo de teste, ative o Jarvis e abra **Paredes → Jarvis: Estúdio de Mapas**.
2. Escolha um `.png`, `.webp`, `.dd2vtt` ou `.uvtt`. Em imagem comum, informe os pixels por quadrado da grade. A imagem precisa caber na grade com tolerância de 2 px.
3. Revise as linhas sobre o mapa. Azul = parede, laranja = porta, roxo = porta secreta, cinza tracejado = descartada. Clique numa linha para incluí-la ou descartá-la.
4. Para desenhar parede ou porta, selecione o tipo e clique nos dois extremos. Para luz, clique no local desejado. Para som, informe o caminho de áudio já hospedado no servidor e clique no local.
5. Escolha o ambiente, confira a contagem, clique **Revisar criação** e confirme. Se já existir cena com o nome escolhido, a anterior fica como backup Jarvis.

As imagens comuns recebem apenas **sugestões** de paredes retas alinhadas à grade. O método procura traços escuros de alto contraste e não consegue deduzir portas, paredes diagonais, altura, terreno, objetos, nem a intenção do artista. Portas devem ser marcadas pelo Mestre. O arquivo UVTT usa sua geometria declarada, sem detecção raster.

## Auditoria após criação

Em uma Macro Script, como Mestre:

```js
const jarvis = game.modules.get("fora-do-abismo-foundry").api;
console.table(jarvis.scenes.audit().issues);
```

A auditoria lê a cena ativa e aponta paredes de comprimento zero, paredes duplicadas, pontos fora do mapa e ausência de Tokens com visão habilitada. Não altera documentos. O diagnóstico geral `jarvis.diagnostics.run()` agora inclui a auditoria da cena ativa e uma prova sintética do Estúdio.

Para conferir uma ficha importada sem alterar seus valores, a API `jarvis.diagnostics.compareActor(payload, actor)` compara nome, tipo, atributos, PV, perícias e recursos que estiverem explícitos no arquivo V9. Diferenças de PV após jogar e nomes de itens reidratados exigem interpretação do Mestre.

## Teste de integração pendente

O conjunto `node --test tests/*.test.js` verifica a detecção, o ambiente e as regressões. No Foundry ainda é necessário testar com **cena isolada**: imagem PNG/WEBP real, portas com Token, visão, iluminação renderizada, som audível, substituição e backup. Para dnd5e 6.0.6, executar também uma Activity de teste antes de classificar a versão como verificada.
