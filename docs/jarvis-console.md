# Central Jarvis 1.1.0 — guia da candidata

## Abertura e navegação

No Foundry V14 com D&D5e 6.0.x, ative o módulo e clique em **Jarvis — Fora do Abismo** nos controles de Tokens. A mesma janela atende Mestre, Trusted Player e Player. O menu lateral pode ser recolhido; setas, Home e End percorrem as abas. A busca global encontra ferramentas, fichas, Items acessíveis, cenas visíveis, macros autorizadas e índices de compêndios. Os índices só são carregados quando há uma busca; resultados e histórico pessoal têm limites para não congestionar o cliente.

O atalho nativo de abertura continua válido:

```js
game.modules.get("fora-do-abismo-foundry")?.api?.ui?.open()
```

## Áreas da Central

| Área | Ações principais |
| --- | --- |
| Visão geral | Estado do módulo, integrações, personagem ativo, favoritos e ferramentas recentes. |
| Personagens e NPCs | Abrir ficha; criar com prévia nos modos simples ou avançado; importar/comparar JSON V9; revisar proveniência, regras, Jack e progressão. |
| Itens e homebrew | Criar Item, classe, subclasse, magia e habilidade; importar Items V9; configurar Activities, Active Effects, cargas e progressão. |
| Mapas e cenas | Estúdio, UVTT, templates, skins, presets, Scene Package, auditoria e edição de documentos da cena atual. |
| Aparências e formas | Consultar, registrar, aplicar e reverter perfis Visage e Metamorph; importar pacote visual. |
| Compêndios | Buscar nos packs visíveis, abrir e importar documentos conforme permissão. |
| Macros e automações | Biblioteca de comandos gerenciados, atalhos, favoritos, histórico; revisão de scripts de Activities pelo Mestre. |
| Jogadores | Abrir ficha, consultar PV, recursos e Items do personagem, acessar compêndios, macros e aparências permitidas. |
| Diagnóstico | Verificações somente leitura, teste de templates e lista de módulos ativos. |

## Criar personagens e homebrew

No **modo simples**, informe nome, tipo, atributos e, se necessário, PV, CA e história. Para um Item, escolha tipo, destino, descrição e cargas. A prévia mostra a adaptação para os campos nativos D&D5e antes da confirmação. A ficha nativa abre após a criação para concluir escolhas de classe, raça, equipamento e mecânicas que dependem do sistema.

No **modo avançado**, use um objeto JSON com `data` e, opcionalmente, `effects` e `progression`. `data.jarvis` aceita a semântica do Importer V9; `data.system` aceita estrutura nativa D&D5e. Exemplo de classe:

```json
{
  "data": { "jarvis": { "hitDie": "d8", "activities": [] } },
  "effects": [{ "name": "Efeito de exemplo", "changes": [] }],
  "progression": [{ "level": 2, "grants": [] }]
}
```

Progressão Jarvis só é registrada em Items de classe. `Advancement` complexo e preparação de magias ainda exigem revisão na ficha nativa. Para conteúdo oficial, busque o Item no compêndio visível e importe para o personagem selecionado; o fluxo de homebrew fica na mesma Central.

## Editar uma cena existente

Abra a cena e use **Analisar paredes e luz** para uma auditoria somente leitura. Na seção de edição, escolha parede/porta, luz, som ou escuridão/cor da cena. Para alterar ou remover um documento, selecione-o na lista ou informe o ID nativo; **Carregar dados atuais** preenche os campos editáveis. A lista mostra os primeiros 500 documentos, e o ID aceita os restantes. Para adicionar, informe os dados JSON correspondentes; modelos de parede, porta, tocha e ambiente ajudam a começar. Coordenadas são pixels da cena, enquanto raios de luz usam a unidade nativa do Foundry.

Use **Pré-visualizar alteração**. Para salvar, pressione **Salvar na cena** e confirme. Se os campos mudarem desde a prévia, a Central exige outra revisão. O editor valida coordenadas, dimensões e campos permitidos; possíveis aberturas entre pontas de paredes são heurísticas de revisão, não reconhecimento perfeito de mapa.

Cada edição bem-sucedida entra em um Journal privado de histórico. **Ver histórico** mostra o ID da alteração; cole o ID e use **Desfazer alteração**. O desfazer é bloqueado se o mesmo documento mudou depois. Alterações antigas podem sair do histórico, que mantém as 30 mais recentes por cena. A aplicação de um preset de luz geral também entra nesse histórico. Arquivos de imagem e cenas completas não são excluídos por essa ferramenta.

## Macros e Activities

O Mestre pode criar, editar, duplicar, remover e importar descritores JSON de macros. Cada entrada usa um comando registrado (`open-console`, `open-actor`, `open-item`, `open-compendium`, `audit-scene`, `open-map-studio` ou `run-diagnostics`) e parâmetros validados. O Mestre escolhe visibilidade: Mestre, Trusted Player ou todos. Cada usuário pode executar macros visíveis, favoritar e instalar um atalho pessoal, sujeito à permissão nativa do Foundry para criar Macros. O histórico pessoal informa sucesso ou erro. A importação recebe JSON declarativo, até 100 entradas por vez.

O arrastar de arquivos `.txt`/`.js` e o editor nativo do Foundry continuam disponíveis fora dessa biblioteca. A biblioteca gerenciada não executa texto JavaScript livre enviado por jogadores.

Automações Jarvis em Activities precisam de aprovação explícita do Mestre ativo. Na aba Macros, selecione personagem, Item e Activity; **Inspecionar** mostra script e nomes dos Active Effects embutidos. Depois, **Aprovar** grava somente o resumo criptográfico do conteúdo revisado. Qualquer alteração de script ou Effect invalida a aprovação. **Revogar** remove a autorização. Consulte [a política de execução](activity-automation-approval.md): scripts Jarvis rodam apenas no cliente do Mestre ativo ao usar a Activity, mesmo que outro usuário tenha acesso à ficha.

## Permissões e recuperação

O Mestre ativo executa criação global, edição de cena, biblioteca de macros e aprovação de automações. Trusted Players podem alterar perfis de aparência de Actors próprios e importar Items oficiais D&D5e de compêndios para a própria ficha. Players comuns consultam fichas e documentos visíveis, recursos e macros autorizadas. Os serviços verificam permissão novamente ao receber uma ação; ocultar um botão não é a barreira de segurança.

Migrações de manifestos de cenas antigas só ocorrem após prévia e confirmação do Mestre. Backups e relatórios ficam em Journals privados. Uploads de mapas interrompidos são registrados para revisão e não são apagados automaticamente. Consulte o [roteiro de validação](1.1.0-validacao-foundry.md) antes de usar a candidata em sessão.
