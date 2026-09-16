# Jarvis Rules Profile — 2024

A partir da alpha.10, o Jarvis separa duas ideias que antes estavam misturadas:

- **sourceRules**: edição em que o conteúdo oficial foi originalmente publicado;
- **rulesProfile**: edição usada atualmente pelo personagem/campanha.

O perfil padrão de novos Actors importados pelo Jarvis é **2024**.

## Modos de compatibilidade

- `native`: conteúdo nativo daquela edição;
- `native-updated`: conteúdo que possui versão oficial atualizada para o perfil atual;
- `legacy-adapted`: conteúdo oficial de edição anterior usado com a classe 2024 por compatibilidade;
- `migration-required`: classe base ainda está em edição diferente do perfil alvo;
- `review`: conteúdo não reconhecido automaticamente; preservar e revisar.

## Registro inicial da campanha

### The Undead

- origem: regras 2014;
- fonte: Van Richten's Guide to Ravenloft;
- perfil 2024: `legacy-adapted`;
- não deve ser classificado como homebrew apenas por ser usado com Warlock 2024.

### Storm Sorcery

- origem: regras 2014;
- fontes conhecidas: Sword Coast Adventurer's Guide / Xanathar's Guide to Everything;
- perfil 2024: `legacy-adapted`;
- não deve ser classificado como homebrew apenas por ser usado com Sorcerer 2024.

### Eldritch Knight

- possui versão oficial atualizada para 2024;
- perfil 2024: `native-updated`;
- se o Actor ainda estiver usando a versão 2014, o Jarvis deve sinalizar migração da subclasse.

## Segurança de migração

Definir `rulesProfile = 2024` **não reescreve silenciosamente** a classe ou subclasse existente. O motor gera um plano de migração para que a reconstrução seja feita conscientemente.

A API é exposta em:

```js
game.modules.get("fora-do-abismo-foundry").api.rules
```

Funções:

- `analyzeActor(actor)`
- `setActorProfile(actor, "2024")`
- `formatReport(report)`
