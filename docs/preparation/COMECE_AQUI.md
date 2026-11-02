# Preparação M00 — etapa 1

Este lote entrega ferramentas offline, não uma atualização obrigatória do Jarvis.
Não instalar no mundo principal. A arte final continua pendente de aprovação.

1. Preserve backup restaurável do mundo e a Scene antiga. Abra um mundo de homologação
   com Jarvis 1.4.0, Foundry 14 e D&D5e 6.x; confirme versões pelo diagnóstico GM.
2. Use cópias dos quatro Actors no mundo de teste. Confira os nomes exatos e protótipos;
   não reimporte fichas vivas pelo Importer V9. Se houver nomes duplicados, resolva antes.
3. O rascunho local `private/v54/entrega-01/M00_RASCUNHO_EXECUTOR.json` contém o mapa
   ORIGINAL embutido, não as artes geradas rejeitadas. É teste de encanamento, não mapa HD final.
4. Central Jarvis → Executor → selecionar JSON → Validar e visualizar → Mostrar grid /
   Inspeção HD. Confira paredes, porta, luzes e tokens; arraste os pontos necessários.
   Baixe o pacote ajustado para registrar posições. Não confirme se houver inconsistências.
5. Apenas em homologação, confirme a criação da Scene nova. Teste porta aberta/fechada,
   visão com login de jogador, circulação, textura dos tokens e linhas de ataque.
   O rascunho tem áreas externas sem geometria completa e não deve ser usado em sessão.
6. Pare na etapa 1. Próximo trabalho: arte final aprovada, geometria recalibrada e
   homologação M00. Etapa 2 somente depois da revisão do Mestre.

Para repetir a preparação local, use `node tools/prepare-m00.mjs CONFIG.json NOVA_PASTA`.
CONFIG contém `actors:[{file,expectedName,confirmedByGM}]`, e opcionalmente `map` (JPG
original real) e `blueprint` (rascunho 1.0). Caminhos relativos partem do CONFIG.
Sem map/blueprint, apenas auditoria. Export/relatórios nunca devem entrar no Git público.

O diagnóstico GM pode ser colado em Macro do tipo Script. Por padrão não lê nenhuma
ficha; `actorIds` é uma lista explícita de IDs do mundo de teste. O relatório fica apenas
no console do navegador do GM. Não instala macros, não muda versões, não libera poderes.
