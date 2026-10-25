# Diagnóstico Jarvis beta.16

O diagnóstico é **somente leitura**. Ele consulta o manifesto publicado e testa payloads sintéticos em memória. Não cria, altera ou apaga Actors, Scenes, Tokens, arquivos ou configurações do mundo.

## Executar no Foundry

Entre em um mundo com o módulo ativo como Mestre. Em uma Macro do tipo **Script**, execute:

```js
const jarvis = game.modules.get("fora-do-abismo-foundry")?.api;
const report = await jarvis.diagnostics.run();
console.table(report.checks);
console.log(jarvis.diagnostics.format(report));
ui.notifications.info(`Jarvis: ${report.counts.pass} OK, ${report.counts.fail} falhas; detalhes no console.`);
```

Para analisar apenas a API e os dados sintéticos, sem ler Actors do mundo, use `jarvis.diagnostics.run({ inspectActors: false })`. Por padrão, a leitura de fichas é limitada aos primeiros 5 Actors acessíveis; `actorLimit` aceita até 20.

## O que cada verificação significa

| Verificação | O que exercita | Limite |
| --- | --- | --- |
| `module` e `runtime` | Instalação, Foundry V14 e dnd5e 6.0.x | 6.0.6 aparece com aviso até a validação em sessão |
| `updates` | Compara versão instalada com o `module.json` publicado | Pode ser ignorada se rede/CORS impedir a consulta |
| `api-legacy` | Presença das funções públicas antigas e novas | Presença não prova resultado em combate ou no canvas |
| `importer-v9` | Validação de ficha e adaptação de PV em memória | Não cria Actor |
| `scene-builder-v1` | Validação e prévia de paredes, porta, luz e som | Não cria Scene |
| `scene-framework-v2` | Todos os templates, skins e presets das Forjas | Não posiciona Actors nem renderiza mapa |
| `scene-package-v1` | Validação e prévia de pacote com geometria e áudio | Não envia imagem/áudio ao servidor |
| `universal-vtt` | Conversão e prévia de UVTT 0.3 | Não testa um mapa real nem renderização |
| `map-studio` | Sugestão raster e perfil de luz sintéticos | Não testa o editor visual no Foundry |
| `cena-ativa` | Geometria, luzes, sons e Tokens da cena aberta | Não simula visão ou movimento; aparece como `NÃO EXECUTADO` sem cena |
| `visage` e `metamorph` | Estado das integrações opcionais | Inativa aparece como `NÃO EXECUTADO` |
| `fichas-leitura` | Análise de proveniência e edição de regras | Amostra limitada; não corrige ficha |
| `integracao-de-escrita` | Registra os testes de criação/backup/combate pendentes | Sempre `NÃO EXECUTADO` neste diagnóstico |

`OK` indica que a verificação em memória passou. `AVISO` pede atenção, mas não equivale a falha. `FALHA` indica regressão ou incompatibilidade. `NÃO EXECUTADO` deixa explícito o que não foi testado.

## Testes fora do Foundry

Na pasta do repositório, execute `node --test tests/*.test.js`. Essa suíte cobre também opções antigas: Importer V9, slots de recursos, imagens, perfil de regras, proveniência, templates/skins/presets, substituição segura de cenas, áudio e Universal VTT. A workflow de release executa a suíte antes de publicar uma nova versão.

## Teste de integração que ainda precisa de mundo isolado

Em um mundo de teste com dnd5e 6.0.6: importar um arquivo `.dd2vtt` real; conferir visão e portas com Token; acender/apagar luzes; ouvir o áudio na posição correta; substituir uma cena de teste e restaurar o backup; usar uma Activity de teste para verificar efeitos e recursos. Não usar cenas ou fichas oficiais da campanha para esses passos.
