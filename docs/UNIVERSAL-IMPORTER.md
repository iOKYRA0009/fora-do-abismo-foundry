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


## Fichas TXT e Markdown (1.7.2)

Cole o texto em Importador Universal ou use arquivo .txt/.md. Comece com Nome: (ou Personagem: ou título Markdown # Nome), seguido de Tipo: NPC ou Personagem. Use campos "Campo: valor", com marcadores Markdown opcionais. Cabeçalhos Habilidades, Ações e Atributos são aceitos. O parser é determinístico, não usa IA nem interpreta prosa livre. O resultado é uma ficha V9.1 para revisão e confirmação.

Exemplo fictício:

```text
Nome: Orgulho
Tipo: NPC
PV: 200/250
CA: 22
Atributos: FOR 20, DES 16, CON 22, INT 14, SAB 18, CAR 20

Habilidade: Decreto Celestial
Tipo: Salvaguarda
Custo: ação
Dano: 6d10 radiante
Salvaguarda: Sabedoria CD 19
Sucesso: metade
Usos: 2
Recuperação: descanso longo
Descrição: Um decreto divino.

Habilidade: Golpe
Tipo: Ataque
Custo: reação
Acerto: +8
Dano: 2d8+4 cortante
```

Campos de ficha: Nome/Personagem/Ficha, Tipo, PV (atual/máximo, ou valor único com máximo igual), PV máximo, CA, Atributos (lista ou cada atributo separado), Biografia, Retrato e Token (caminhos explícitos).

Cada Habilidade inicia um bloco; Tipo (Ataque, Salvaguarda, Teste, Dano, Cura, Teleporte, Utilidade) e Custo (ação, ação bônus, reação) são obrigatórios. Campos dependem do tipo: Dano (fórmula e tipo), Acerto (bônus fixo), Atributo, CD, Salvaguarda/Teste (atributo e CD), Sucesso (metade/nenhum/total, obrigatório quando salvaguarda causa dano), Cura (fórmula), Distância (inteiro com m ou ft), Alcance (corpo a corpo/a distância), Classificação (arma/magia/desarmado), Rolagem, Descrição. Usos (inteiro positivo) e Recuperação (descanso curto/longo ou amanhecer) são opcionais. Descrições e biografias de uma linha são escapadas como texto. Não há inferência de classe, equipamento, progressão, sinergias, condições ou efeitos. Campos desconhecidos, duplicados e incompatíveis são recusados; máximo 100 habilidades, 5000 linhas e limite geral de 2 MB. Personagens jogadores podem ter PV máximo e CA recalculados pelo D&D5e.

ZIP/.jarvis e prosa livre continuam fora do escopo. YAML, XML, CSV, JSON e Executor mantêm os fluxos anteriores. Exemplos não são personagens canônicos. Teste real no Foundry ainda necessário.

## Pacotes .jarvis / ZIP (1.7.3)

Um pacote é um ZIP padrão com extensão .jarvis ou .zip, contendo manifest.json na raiz. Compactação armazenada ou DEFLATE. Não é um arquivo executável. Exemplo de estrutura:

```text
manifest.json
personagem.json
habilidades.json
aparencia.json
images/retrato.png
images/token.webp
images/marca.png
```

```json
{
  "schemaVersion": "jarvis-character-1",
  "character": "personagem.json",
  "items": "habilidades.json",
  "appearance": "aparencia.json",
  "assets": [
    {"id":"portrait","path":"images/retrato.png"},
    {"id":"token","path":"images/token.webp"},
    {"id":"watermark","path":"images/marca.png"}
  ]
}
```

personagem.json contém um pacote V9.0 ou V9.1 de um novo personagem (NPC ou character). O Executor exige seis atributos, PV atual/máximo e CA válidos. Use actor.img = "asset://portrait" e actor.prototypeToken.texture.src = "asset://token"; use referências asset://ID também em ícones de Items e Activities. habilidades.json é opcional, contém lista de Items V9 anexada à lista existente. aparencia.json é opcional e contém o objeto sheetAppearance (não o duplique na ficha). Exemplo: {"image":"asset://watermark","opacity":0.10,"size":65,"palette":{"paper":"#f8f6ef","text":"#30323a","title":"#806126","divider":"#b0b4bd"}}. O fundo é aplicado apenas em fichas character suportadas; imagem PNG/JPG/WebP. Pode usar caminho local já existente, sem asset. Os arquivos de imagem são encaminhados em memória, sem base64 no editor.

Central → Personagens → Importador Universal → selecione o arquivo → Detectar formato ou Preparar importação. O pacote é validado pelo Executor antes de encaminhar. No Executor, confira os anexos, clique Validar e visualizar, e confirme a execução. Não sobrescreve personagens existentes; a execução cria um novo Actor. Os arquivos enviados podem permanecer no armazenamento mesmo após reversão. Nenhum backup/download automático. Não há exportador .jarvis nesta fase.

Limites: 56 MiB compactados, 50 MiB descomprimidos, até 80 entradas, JSON individual até 2 MiB, imagens até 8 MiB cada e 48 MiB no total (40 imagens), 100 Items. ZIP64, multidisco, criptografia, caminhos inseguros, links, arquivos não declarados, scripts, flags externas e chaves de automação executável são recusados. Descompressão depende de DecompressionStream deflate-raw; se indisponível use ZIP armazenado. CRC é integridade, não assinatura de confiança. O Executor verifica bytes e tenta decodificar imagens antes de upload. O pacote não é sandbox de módulos externos; use fontes confiáveis. Sinergias, automações, integração de perfis e exportação estão fora desta fase. Teste real do Foundry continua necessário.
