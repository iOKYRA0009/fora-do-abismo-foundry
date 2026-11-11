# Jarvis Tools 1.5.5 — motor interno Importer V9.1

## O que mudou

1. **Compilador de NPC V9.1:** um pacote compacto com `actor` e `actions` vira Items e Activities nativas do D&D5e 6.0. Aceita ataque, salvaguarda, teste, dano, cura, utilidade e teletransporte. O formato 9.0 permanece aceito.
2. **Construtor na Central:** em **Personagens → Montar NPC V9.1 sem escrever JSON**, preencha nome e tipo; PV, CA e atributos ficam nos campos acima. Adicione cada habilidade e revise o pacote. Modelos de habilidade podem ser guardados no navegador e reutilizados. Eles não são enviados para outros usuários automaticamente.
3. **Ensaio mecânico:** o campo opcional `scenarios` confere resultados aritméticos de d20 contra CA ou CD. Divergências bloqueiam a importação antes de criar a ficha.
4. **Retrato e token:** escolha arquivos separados na mesma importação. Se houver apenas retrato, ele também vira imagem do token. O upload cria arquivos novos em Dados do Usuário.
5. **Atualização incremental:** revise e atualize uma ficha selecionada com o mesmo nome e tipo. Items Jarvis correspondentes recebem Activities novas ou revisadas; Items novos são adicionados. PV atual, recursos, atributos, condições e demais Items são preservados. Falhas acionam tentativa de reversão das mudanças em Items.
6. **Progressão nativa:** classes/subclasses podem usar `jarvis.grants` com UUIDs de Items em compêndios. O Jarvis valida as referências antes de importar e cria entradas `ItemGrant` do D&D5e. `system.advancement` nativo também continua aceito. Não misture `grants` com a progressão antiga Jarvis no mesmo Item.
7. **Auditoria após gravar:** na criação de uma ficha, o Jarvis confere se as Activities persistiram com tipo, bônus de ataque, atributo e CD de salvaguarda esperados. Se encontrar divergência, tenta remover o Actor novo.
8. **Privacidade do chat:** cada Activity ganha sua descrição própria. Se várias Activities repetirem a descrição geral do Item, o importador usa somente o nome da habilidade no chat. Em uma ficha já importada, use **Corrigir chat das habilidades** para corrigir Activities Jarvis sem descrição individual ou que repetem a descrição geral.

## Exemplo: NPC com ataque e salvaguarda

Cole em **Personagens → Importar ficha Jarvis V9.1** e clique em **Revisar importação V9.1**:

```json
{
  "schemaVersion": "9.1",
  "actor": {
    "name": "Sentinela do Umbral",
    "type": "npc",
    "jarvis": {
      "abilities": { "str": 16, "dex": 12, "con": 14, "int": 8, "wis": 11, "cha": 9 },
      "hp": { "value": 45, "max": 45 },
      "ac": 16
    }
  },
  "actions": [
    {
      "name": "Machado sombrio",
      "kind": "attack",
      "toHit": 7,
      "damage": { "formula": "1d8+4", "type": "slashing" },
      "description": "A sentinela desfere um golpe com o machado."
    },
    {
      "name": "Pulso da ruína",
      "kind": "save",
      "ability": "dex",
      "dc": 14,
      "damage": { "formula": "2d6", "type": "necrotic" },
      "onSave": "half"
    }
  ],
  "scenarios": [
    { "action": "Machado sombrio", "kind": "attack", "d20": 9, "targetAC": 16, "expected": "hit" },
    { "action": "Pulso da ruína", "kind": "save", "d20": 11, "modifier": 2, "expected": "failure" }
  ]
}
```

O primeiro cenário calcula `9 + 7 = 16` contra CA 16: acerto. O segundo calcula `11 + 2 = 13` contra CD 14: falha. Esses exemplos verificam os números do pacote; as rolagens da mesa continuam sendo feitas pelo D&D5e no Foundry.

## Alvorada e teletransporte de ratos

1. Atualize o módulo e recarregue as páginas dos jogadores.
2. Na Central, selecione **Nicolau** em Personagens.
3. Clique em **Corrigir chat das habilidades** e confirme a quantidade mostrada.
4. Use **Teletransporte de ratos** e confira se o chat apresenta apenas o nome/texto dessa habilidade.

O reparo se aplica a Items anteriormente importados pelo Jarvis. Se Alvorada foi criada manualmente, ou a Activity já contém o texto completo copiado dentro dela, é necessária revisão manual dessa Activity. O botão não reescreve Items de outros módulos.

## Progressão e limites

`jarvis.grants` usa este formato em um Item de classe ou subclasse:

```json
{
  "name": "Classe Exemplo",
  "type": "class",
  "jarvis": {
    "grants": [
      { "level": 3, "uuids": ["Compendium.dnd5e.classfeatures.3sYPftQKnbbVnHrh"] }
    ]
  }
}
```

O UUID acima é ilustrativo. Escolhas de subclasse, efeitos condicionais complexos e encontros não ficam automaticamente corretos só porque a ficha importou; conclua escolhas nativas na ficha e teste essas mecânicas no Foundry. O ensaio de d20 não rola dados reais nem aplica dano ou efeitos a alvos. Para automatizar acertos, aplicação de dano e condições contra outros Actors, é necessário um fluxo de combate compatível configurado no mundo; o Jarvis não obriga a instalar Midi-QOL ou outro módulo. O teletransporte nativo move tokens conforme o sistema, mas efeitos adicionais da habilidade dos ratos precisam ser definidos no pacote.

Um pedido em linguagem natural feito ao Jarvis pode virar o JSON compacto acima. Na Central, basta colar o texto; **não é obrigatório salvar um arquivo**. Envio direto deste chat ao mundo exigiria uma conexão autenticada com o Foundry, que esta atualização não instala.
