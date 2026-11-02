# Etapa 1 — resultados de teste

Execução em 02/11/2026, Node local.

| Verificação | Resultado |
|---|---|
| Baseline antes das mudanças: node --test tests/*.test.js | PASSOU, 245/245 |
| Suíte final, mesmo comando | PASSOU, 257/257; 12 novos testes |
| node --test tests/m00-preparation.test.js | PASSOU, 10/10 |
| CLI com exports reais e imagem original | PASSOU, gerou 5 arquivos locais |
| Recusa de sobreposição | PASSOU; detectou sobreposição no primeiro rascunho; posições corrigidas |
| Recusa de sobrescrever saída | PASSOU, teste CLI em diretório temporário |
| Inputs de Actor preservados | PASSOU, teste de imutabilidade e hashes locais |
| Executor com nome de cena já existente | PASSOU, rejeição esperada |
| itemAdditions para PJ existente | PASSOU, rejeição esperada |
| Scene Builder: escala 1x1, textura 1.3 e visão 80ft | PASSOU em documento simulado |
| Macro diagnóstico: permissão GM, sem escrita/chat | PASSOU em contexto isolado |
| Renderização de prévia do mapa original + geometria | PASSOU em navegador local; revisão visual de rascunho |
| Arte premium final em resolução solicitada | NÃO CONCLUÍDA; candidata sem aceite e abaixo de 3000x2400 |
| Importação dentro do Foundry V14 | NÃO EXECUTADO |
| Login jogador, fog, raycasting, colisões e passagem | NÃO EXECUTADO |
| Combate Vharos/escolta contra fichas reais | BLOQUEADO: NPCs/regras não aprovados; fora deste lote técnico |

O rascunho usa o JPG original, com grade/figuras/texto já pintados. Esses elementos
não são Tokens nem paredes funcionais e impedem tratá-lo como arte final.
As laterais vazias preservam a proporção do mapa quadrado no canvas novo 30x24.
O pacote contém 37 segmentos, sendo 1 porta; 6 luzes propostas; 4 tokens existentes.
Não há ficha nova nem habilidade nova. Geometria externa e acesso ao bloco de quartos
permanecem incompletos. Não é cena pronta para sessão.

## Aceite manual pendente

- Guardar export/backup da cena anterior e comparar depois; ela deve permanecer intacta.
- Revisar arte final em 100%/200%, arquitetura, materiais, ausência de figuras e grid pintados.
- Revisar porta principal, saídas reais e bloco de quartos; não inferir escadas/andares ausentes.
- Conferir geometria sobre a arte aprovada e baixar pacote ajustado.
- Conferir protótipos de teste, visão, recorte, escala visual e perfis de transformação.
- Abrir/fechar porta e testar movimento/visão dos dois lados com conta de jogador.
- Testar circulação, móveis, linhas de ataque, retirada e espaço para futuros NPCs.
- Avaliar memória/GPU e carregamento no equipamento usado na mesa.
- Somente após homologação e revisão do Mestre considerar entrega final da etapa 1.
