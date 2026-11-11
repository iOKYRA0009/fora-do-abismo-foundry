# Jarvis Tools 1.5.4 — dez módulos parceiros

Esta atualização acumula as versões 1.4.1 a 1.5.3. As releases antigas continuam disponíveis. As integrações são opcionais: o Jarvis inicia normalmente sem qualquer parceiro instalado. Não há migração automática de fichas, cenas ou compêndios.

## Instalação

1. Em **Add-on Modules**, atualize **Fora do Abismo — Jarvis Tools** para **1.5.4**.
2. Na mesma tela, instale os módulos parceiros que pretende usar. Para tesouros, instale **Item Piles** e também **Item Piles D&D 5e**. O Foundry poderá pedir dependências adicionais dos parceiros.
3. No mundo, ative os parceiros em **Manage Modules** e recarregue o mundo e as páginas dos jogadores.
4. Abra **Central Jarvis → Sistema → Módulos parceiros → Ver módulos parceiros** para conferir `active` e `apiReady`. O diagnóstico da Central também mostra o estado de cada parceiro.

| Prioridade | Módulo | O que o Jarvis acrescenta | Exemplo rápido |
| --- | --- | --- | --- |
| 1 | socketlib | Aplica pelo Mestre o Active Effect configurado em uma Activity usada pelo jogador contra um alvo que ele não controla. Confere a permissão na origem, a configuração e a cena do alvo. | Um jogador usa uma habilidade Jarvis com `target: "selected"` em um monstro. |
| 2 | Dynamic Active Effects (DAE) | Inspeciona o efeito embutido e abre seu editor a partir da Central. Informa se as mudanças parecem exigir DAE. | Selecione a ficha, informe Item e Activity; clique **Inspecionar Effect**. |
| 3 | Tagger | Marca e encontra objetos de cena com etiquetas `jarvis:`. | Selecione o portal no mapa, digite `portal-norte` e clique **Etiquetar objeto selecionado**. |
| 4 | Sequencer | Reproduz e encerra apresentações visuais e sonoras no token selecionado ou na primeira etiqueta encontrada. | Informe o caminho de um `.webm`, selecione o token e clique **Reproduzir Sequencer**. |
| 5 | Item Piles + Item Piles D&D 5e | Cria uma pilha de tesouro com cópias dos Items de uma ficha, sem removê-los da origem. | Selecione a ficha, informe `Poção de Cura, Adaga` e as coordenadas X/Y; confirme a prévia. |
| 6 | Token Magic FX | Aplica um preset a um token e remove um filtro específico por ID. | Selecione um token, digite o nome do preset e clique **Aplicar ao Token**. |
| 7 | FXMaster | Lista, inicia e encerra presets de clima na cena atual. | Clique **Listar climas**, copie um nome para o campo e clique **Aplicar clima**. |
| 8 | Polyglot | Envia uma pista ao chat com o idioma configurado no Polyglot. | Digite `draconic` e `A porta responde ao sangue`; clique **Enviar mensagem**. |
| 9 | Universal Battlemap Importer | Abre o controle próprio do importador na aba Cenas. O importador nativo do Jarvis também aceita `.df2vtt`. | Clique **Abrir Universal Battlemap Importer** ou importe um `.df2vtt` pelo Jarvis. |
| 10 | Tidy 5e Sheets | Acrescenta **Jarvis: revisar ficha** ao cabeçalho da ficha Tidy, abrindo o relatório de origem dos Items. | Abra uma ficha Tidy e use esse controle no cabeçalho. |

## Como usar sem surpresas

As ferramentas de cena e conteúdo da seção **Módulos parceiros** são ações do Mestre. A Activity do jogador continua usando as permissões normais do Foundry. O socketlib entra apenas quando uma Activity já configurada pelo Mestre precisa aplicar seu efeito embutido em um alvo selecionado que o jogador não controla. O efeito é escolhido pela configuração salva na Activity; o pedido do jogador envia somente os UUIDs da Activity e do token e o índice do efeito.

Para uma Activity desse tipo, o campo `flags.fora-do-abismo-foundry.automation.effects` pode incluir:

```json
[{ "target": "selected", "effectName": "Escudo", "key": "escudo-jarvis" }]
```

Use `target: "selected-all"` para todos os alvos selecionados. Sem socketlib, os efeitos sobre alvos que o jogador não controla geram um erro claro no console; a rolagem e o uso nativo da Activity não dependem da instalação do parceiro. Efeitos sobre o próprio personagem continuam locais.

Os arquivos de efeito Sequencer e os presets visuais precisam existir no mundo ou nos módulos instalados. O Jarvis não distribui animações, filtros, clima ou traduções de terceiros. No Polyglot, use o identificador de idioma configurado no mundo. No Item Piles, as coordenadas X/Y são pixels da cena.

## Verificação feita antes da publicação

A suíte Node cobre as funções anteriores, o catálogo da Central e o acesso seguro do socketlib. A verificação em um mundo Foundry real fica para o Mestre após atualizar.
