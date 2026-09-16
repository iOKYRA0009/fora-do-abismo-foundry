# Jarvis Importer V9 — Pipeline de Imagens

## Objetivo

Garantir que Actors e Items importados tenham arte útil e legível, sem exigir que toda imagem seja fornecida manualmente.

O pipeline tem três estratégias:

- `foundry`: usar ícones já disponíveis no Foundry/módulo;
- `generate`: marcar o documento para geração de arte personalizada;
- `custom`: usar um caminho de imagem definido explicitamente.

## Regra de prioridade

1. `custom` com `customPath` válido;
2. imagem gerada e salva localmente quando o estágio assíncrono estiver implementado;
3. `iconKey` registrado;
4. inferência semântica por tags/tipo;
5. fallback genérico.

## Estratégia `foundry`

Exemplo:

```json
{
  "name": "Esquiva Ágil",
  "type": "feat",
  "imgStrategy": {
    "source": "foundry",
    "iconKey": "movement"
  }
}
```

## Estratégia `generate`

Exemplo:

```json
{
  "name": "Espada Divina",
  "type": "feat",
  "imgStrategy": {
    "source": "generate",
    "semanticRole": "offense",
    "tags": ["radiant", "weapon"],
    "promptHints": ["holy sword", "divine slash", "gold-white light"],
    "style": "fora-do-abismo-icon",
    "fallbackIcon": "icons/svg/sword.svg"
  }
}
```

Enquanto a geração automática não estiver implementada, o importer usa o fallback e grava em `flags.fora-do-abismo-foundry.imageGeneration` um descritor com os dados necessários para a etapa futura.

## Estratégia `custom`

```json
{
  "name": "Alvorada",
  "type": "weapon",
  "imgStrategy": {
    "source": "custom",
    "customPath": "worlds/meu-mundo/fora-do-abismo/items/alvorada.webp"
  }
}
```

## Arquitetura futura para geração automática

A geração de imagem não deve ocorrer de forma síncrona dentro do simples `Actor.create()`.

Fluxo recomendado:

1. V9 lê o payload;
2. resolve imediatamente todos os ícones Foundry/custom;
3. documentos `generate` recebem fallback e descritor de geração;
4. um serviço externo gera a imagem;
5. a imagem é enviada ao diretório público do Foundry;
6. o documento é atualizado com o caminho final em `img`;
7. o descritor pode registrar status, hash e origem para evitar geração duplicada.

## Por que não usar somente o nome

O nome é parte do prompt, mas não é a única fonte semântica. "Espada Divina" pode ser arma, ataque, buff ou magia. Tags e `semanticRole` tornam o resultado mais previsível.

## Princípio de segurança

Se a geração falhar, o Item não pode ficar sem imagem e a importação do Actor não deve ser perdida. O fallback visual é parte obrigatória do pipeline.
