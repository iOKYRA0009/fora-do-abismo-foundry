# Jarvis 1.0.0 — Central no Foundry

## Abrir

Ative o módulo em um mundo Foundry V14 com D&D5e 6.0.x. O botão **Jarvis — Fora do Abismo** aparece nos controles de **Tokens**. Ele abre a mesma janela para todos os papéis, com as ações permitidas para cada usuário.

O Mestre também pode usar uma Macro Script:

```js
game.modules.get("fora-do-abismo-foundry")?.api?.ui?.open()
```

A aba **Macro** cria essa macro e a coloca no atalho escolhido da barra do Mestre.

## Abas

| Aba | Uso |
| --- | --- |
| Personagens | Abrir fichas, analisar e registrar proveniência/regras, sincronizar Jack, criar Actor e importar/comparar JSON V9. |
| Itens e classes | Criar Item nativo D&D5e, importar Items V9 em ficha existente e abrir a ficha para configurar mecânicas. |
| Mapas | Estúdio PNG/WEBP/UVTT, análise de paredes e iluminação, templates, skins, presets, luz ambiente, Scene Package JSON e manutenção de regiões. |
| Aparências | Registrar, remover e aplicar perfis Visage e Metamorph; importar pacotes JSON de skins. |
| Compêndios | Consultar índice de packs visíveis, abrir documentos e adicionar Items ao mundo ou personagem. |
| Diagnóstico | Executar verificação somente leitura, self-test dos templates e listar módulos ativos. |
| Jogadores | Ver papel, abrir a própria ficha e acessar compêndios. |
| Macro | Instalar ou copiar o comando de abertura da Central. |

Visage e Metamorph são opcionais. A Central indica quando estão inativos; as funções respectivas só executam com a integração ativa.

## Permissões

| Papel Foundry | Acesso |
| --- | --- |
| Mestre | Todas as abas e operações. |
| Trusted Player | Fichas visíveis, consulta de compêndios, importação de Items oficiais D&D5e apenas em Actor próprio e edição de aparência/forma do próprio Actor. |
| Player | Abrir fichas visíveis, consultar compêndios, ver perfis e acessar a aba Jogadores. |

O painel verifica as permissões novamente ao executar cada ação. Ele não permite que um jogador crie Actors, Items globais ou Scenes. A importação de JSON V9 permanece exclusiva do Mestre.

## Fluxos recomendados

1. **Personagem existente:** selecione o Actor, abra a ficha e use origem/regras para revisar o conteúdo. O JSON V9 pode ser comparado com a ficha sem gravar nada.
2. **Classe oficial:** busque no compêndio D&D5e, abra para revisar e adicione ao Actor escolhido. Itens são copiados como documentos nativos D&D5e.
3. **Classe ou item homebrew:** crie na aba Itens e classes. A ficha nativa abre para configurar progressão, Activities, usos e efeitos. O Item recebe proveniência `homebrew`. Para acrescentar Items V9 com semântica Jarvis a uma ficha existente, use o importador JSON da mesma aba.
4. **Mapa novo:** use o Estúdio para revisar sugestões de paredes, portas, luz e som antes da criação. Alternativamente, use template, preset ou Scene Package JSON. A Central confirma toda criação.
5. **Mapa existente:** abra a cena e use **Analisar paredes e luz**; o relatório não altera o mapa. Ações de skin e ambiente pedem confirmação.
6. **Skins:** registre o ID de um visual já existente ou importe um pacote JSON Visage na aba Aparências. A importação mostra a quantidade e pede confirmação antes de substituir nomes iguais.

## Segurança e limites

- Scene Packages novos guardam notas, puzzles e ações do Mestre em um JournalEntry privado; a Scene mantém apenas referência e resumo. Quando o Mestre abre o mundo, o Jarvis migra manifestos legados da Scene para esse armazenamento.
- A auditoria de luz valida dados e alerta sobre escuridão sem fonte ativa. Ela não simula a visão de cada Token nem verifica visualmente se todos os caminhos estão iluminados.
- O importador V9 cobre as semânticas implementadas no motor. Advancement complexo, preparação completa de magias e recursos além dos três slots nativos devem ser configurados na ficha D&D5e e testados no mundo.
- O teste Node valida motores, permissões e regressões. Antes de usar a versão em sessão, confira no Foundry com uma cópia do mundo: criação/importação, papel Player/Trusted/GM, Visage/Metamorph, visão, áudio e combate.
