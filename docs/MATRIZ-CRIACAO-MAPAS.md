# MATRIZ OFICIAL DE CRIAÇÃO DE MAPAS | FORA DO ABISMO

**Referência operacional para o ChatGPT Jarvis e o Jarvis Tools.** Esta é uma especificação de workflow, não lore. Atualizada em 2026-10-28. O comportamento-base foi aprovado pelo Mestre no **Jarvis 1.2.2**.

**ARQUIVO EDITÁVEL:** [examples/MATRIZ-JARVIS-MAPA-COM-TOKENS.json](../examples/MATRIZ-JARVIS-MAPA-COM-TOKENS.json)

**TESTE AUTOMATIZADO DE COMPATIBILIDADE:** [tests/map-matrix-compatibility.test.js](../tests/map-matrix-compatibility.test.js)

**DOCUMENTAÇÃO TÉCNICA DO EXECUTOR:** [MACRO-EXECUTOR.md](MACRO-EXECUTOR.md)

## Mandamento para futuras criações

Quando o Mestre pedir um mapa (com ou sem NPCs/tokens):

1. Consultar **este documento, o exemplo e o código/documentação atuais**. Se o esquema mudar, adaptar preservando o contrato de comportamento. Não copiar campos antigos cegamente.
2. O ChatGPT prepara a imagem, a geometria, a luz, as fichas/tokens e **um pacote JSON principal**, de preferência com imagens base64 incorporadas. O Mestre não deve precisar instalar cada recurso nem desenhar paredes na aba Cenas.
3. No Jarvis 1.2.2, o pacote raiz é `schemaVersion:"jarvis-executor-1"`, cada cena é `schemaVersion:"1.0"`, e cada Actor novo segue o Importer `"9.0"` dentro de `actors`. **Não trocar esses três níveis.**
4. Definir resolução REAL do fundo, colunas, linhas e grade em coerência. Exemplo: 1600×1280 px = 25×20 células de 64 px. A imagem real deve corresponder às dimensões declaradas.
5. Colocar `scene.imagePlacement:{width,height}` para converter `structures`, `walls`, `lights` e `tokens` de **pixels da imagem** para coordenadas nativas do Foundry. Sem esse campo, o modo legado utiliza células da grade. Nunca misturar unidades.
6. Preferir `structures:[{rect:[x,y,w,h],doors:[{edge,center,width,state}],light:{x,y,bright,dim}}]` para casas, salas e construções: assim o usuário pode **arrastar a estrutura inteira na prévia** sem perder a porta. Construções irregulares usam `outline:[[x,y],...]`; muralhas e outros segmentos soltos usam `walls`.
7. Luzes externas, fogueiras e pontos avulsos ficam em `lights`. Suas posições são pixels. `bright` e `dim` são raios de iluminação em unidades da cena, não pixels.
8. O token indica `actor` pelo **nome exato de um NPC existente** ou de um novo Actor em `actors`, mais posição `x/y` (canto superior esquerdo, pixels), `width/height` (células), `disposition` e visão. Usar `visionPreset:"limited"` para visão restrita nos tokens de novas cenas. O GM ainda vê o mapa inteiro por privilégios.
9. O fundo deve ser legível de cima, coerente com D&D e Fora do Abismo, com geografia/arquitetura lógica, profundidade visual e sem criaturas/tokens pintados no cenário. Não desenhar grade, overlays técnicos ou efeitos de iluminação funcional dentro da arte.
10. Nomear **nova cena** com título único. Não sobrescrever Actors, itens ou mapas oficiais nem importá-los duplicados. Preservar Visage/Metamorph e outras integrações existentes.
11. A etapa decisiva é **Executor → importar JSON → Validar e visualizar → Ajustar mapa antes de criar → arrastar construções/luzes/tokens → Confirmar e executar**. Disponibilizar `Desfazer ajuste` e `Baixar pacote ajustado`.
12. A prévia validada não comprova posição visual correta nem line-of-sight do jogador. Conferir o alinhamento na sobreposição e o resultado no canvas, especialmente portas, paredes e luzes.
13. Se o Mestre exportar `jarvis-mapa-ajustado.json`, esse arquivo contém as **coordenadas finais daquela cena** e deve ser arquivado como referência mais forte do que os números de um pré-ajuste.

### A matriz de referência real

A cena de teste Floresta/Cabana foi importada com sucesso; o Mestre confirmou que **ajustar visualmente na prévia funcionou** em 1.2.2. O arquivo de referência antes dos arrastos é `JARVIS_1_2_2_FLORESTA_PARA_AJUSTAR_NA_PREVIA.json`. Não afirmar que as posições originais do arquivo são as coordenadas finais: o export pós-ajuste não está registrado aqui.

O arquivo de exemplo deste repositório é um **modelo com campos a substituir**, e **não deve ser executado sem alterar o nome da cena, colocar uma imagem real e substituir o Actor fictício**. Para novos personagens, gerar o payload Actor V9 e o token no mesmo pacote. As imagens devem existir em `assets` e serem enviadas junto com o JSON ou incorporadas em `dataBase64` com `mimeType`. Tamanho de imagem: até 8 MB por arquivo e 48 MB por pacote na implementação 1.2.2; verificar limites atuais em versões futuras.

### Identidade visual do projeto

Mapas táticos em visão superior, fantasia sombria com referências D&D/Forgotten Realms/Underdark, sombras e textura legíveis em grade. Evitar cenário incoerente, objetos aleatórios e goblins desenhados dentro do mapa quando devem aparecer como tokens. Estabelecer passagens, fontes de luz, acessos e cobertura sem obrigar decisões dos jogadores.

### Contrato de atualização

Se o Jarvis Tools mudar internamente, a versão futura **deve manter ao menos**: importar uma cena e seus NPCs/tokens a partir de um pacote; calibrar dimensões; visualizar geometria e iluminação **sobre a imagem**; permitir arrastar antes de salvar; confirmar, registrar e recuperar uma execução sem alterar mundos existentes. O teste regressivo deste documento deve ser migrado para o novo esquema antes de declarar a atualização compatível.

**O Mestre cria a ideia. Jarvis constrói o pacote. Jarvis Tools organiza a cena. O Mestre confere a prévia e joga.**
