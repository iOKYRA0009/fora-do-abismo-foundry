# Universal Importer 1.7.1 — conversores

Central → Personagens → Importador Universal. Escolha arquivo ou cole conteúdo. Detectar formato valida a conversão em memória; Preparar importação encaminha o resultado para a revisão V9 ou Executor. Não cria, atualiza, baixa arquivos nem executa macros nesta etapa. Use a confirmação do destino. Limite de entrada e saída: 2 MB (texto), estrutura limitada.

## JSON nativo do Foundry
Actor D&D5e character/npc exportado como objeto JSON com name, type, system, items e effects. Converte para V9.0 preservando dados system, Items/Activities e efeitos, IDs de documentos embutidos, retrato e token protótipo. Não restaura ID do Actor original, propriedade/permissões, pasta, flags de Actor/Item/Activity/Effect/token, nem metadados de mundo. Módulos externos, origens UUID, referências cruzadas ao Actor original, imagens ausentes e versões de sistema exigem revisão manual. Não é importação binária idêntica; a adaptação V9 e Smart Compendium ainda podem ajustar os dados. Outros sistemas explicitamente identificados são recusados.

## YAML
Subconjunto declarativo: mapas, sequências e valores simples com dois espaços de indentação por nível. Use JSON válido nas coleções inline. Use aspas para schemaVersion (por exemplo '9.1'), valores ambíguos e strings com caracteres especiais. Suporta comentários em linhas separadas; não suporta âncoras, aliases, tags, merges, diretivas, documentos múltiplos, tabs, blocos multiline ou comentários inline. Não é um parser YAML completo.

Exemplo:
```yaml
schemaVersion: '9.1'
actor:
  name: Orgulho
  type: npc
  jarvis:
    hp:
      value: 250
      max: 250
actions:
  - name: Decreto
    kind: save
    ability: wis
    dc: 19
    damage:
      formula: 6d10
      type: radiant
    onSave: half
```

Pode representar também V9.0, JSON nativo de Actor ou lista de Items.

## XML
Esquema próprio, não XML genérico de outros aplicativos. Raiz única actor. Elementos simples, sem atributos, namespaces, comentários, DTD, CDATA ou entidades externas. Entidades XML básicas são aceitas. Campos de ficha: name, type (npc/character), hp, hpMax, ac, str, dex, con, int, wis, cha, biography, img. Campos ausentes não são inventados (hp sozinho implica max igual a hp). Pode incluir actions/action com name, kind, activation, description, ability, dc, toHit, range, classification, formula, damageType, onSave, healing, healingType, distance, units, roll, conforme V9.1. Formula e damageType precisam estar juntos.

```xml
<actor>
  <name>Ira</name>
  <type>npc</type>
  <hp>100</hp>
  <actions>
    <action>
      <name>Golpe</name>
      <kind>attack</kind>
      <toHit>8</toHit>
      <formula>2d8+4</formula>
      <damageType>slashing</damageType>
    </action>
  </actions>
</actor>
```

## CSV
Cabeçalho obrigatório name,type; demais colunas são os mesmos campos simples de ficha do XML, sem ações. Vírgula ou ponto e vírgula. Aspas duplas para delimitadores/quebras de linha dentro de campos; escape de aspas por duas aspas. Uma linha cria um rascunho V9.1. De 2 a 20 linhas geram um pacote de novos Actors para revisão do Executor. Não atualiza fichas existentes em lote. Colunas desconhecidas, repetidas e valores numéricos inválidos são recusados.

```csv
name,type,hp,ac,str
Orgulho,npc,250,22,20
Ira,npc,200,18,22
```

## Fora do escopo
TXT livre, Markdown descritivo e ZIP/.jarvis são fases posteriores. Não há execução de linguagens externas. Testes automatizados não substituem teste real no Foundry.
