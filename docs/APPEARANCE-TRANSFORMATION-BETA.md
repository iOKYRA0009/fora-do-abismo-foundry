# Jarvis V9 — Appearance & Transformation Beta

Versão-alvo: `0.2.0-beta.1`

## Objetivo

Separar duas responsabilidades diferentes:

- **Visage** = aparência não destrutiva: roupas, skins, poses, overlays e estados visuais mantendo a mesma ficha.
- **Metamorph** = transformação mecânica: troca completa de Actor/ficha, boss phases e formas diferentes.

Nenhum dos dois é dependência obrigatória do Jarvis. Se estiverem desativados, o Importer V9, progressão, Active Effects e automações existentes continuam funcionando.

---

## Appearance Bridge — Visage

API:

```js
const jarvis = game.modules.get("fora-do-abismo-foundry").api;
jarvis.appearance.status();
```

### Registrar uma skin lógica no personagem

O Visage continua sendo o lugar onde a skin é criada. O Jarvis apenas guarda uma chave estável que aponta para o ID do Visage.

```js
const thors = game.actors.getName("Thors Thormenta");
await jarvis.appearance.setProfile(
  thors,
  "avatar-tempestade",
  "ID_DO_VISAGE",
  { mode: "identity", label: "Avatar da Tempestade" }
);
```

Para overlay:

```js
await jarvis.appearance.setProfile(
  thors,
  "aura-eletrica",
  "ID_DO_VISAGE",
  { mode: "overlay", label: "Aura Elétrica" }
);
```

### Aplicar ao token

```js
const token = canvas.tokens.controlled[0];
await jarvis.appearance.apply(token, "avatar-tempestade");
```

### Remover uma camada

```js
await jarvis.appearance.remove(token, "aura-eletrica");
```

### Reverter todas as alterações do Visage

```js
await jarvis.appearance.revert(token);
```

### Consultar aparências disponíveis

```js
console.log(await jarvis.appearance.getAvailable(token));
```

### Casos de uso aprovados

- Thors: roupa padrão / Avatar da Tempestade.
- Sonson: sem Sarcófago / Sarcófago equipado / Sarcófago danificado.
- Jack: terno padrão / Forma do Pavor / futuras aparências de Orcus.
- Nicolau: roupa branca / traje élfico / disfarces e recompensas cosméticas.

---

## Transformation Bridge — Metamorph

O modo padrão do Jarvis é `keep-original`, adequado para Apex/Proxy porque as personalidades compartilham os mesmos PV.

### Registrar formas

```js
const base = game.actors.getName("Apex Proxy");
const apex = game.actors.getName("Apex");
const proxy = game.actors.getName("Proxy");

await jarvis.transformation.setProfile(base, "apex", apex, {
  hpMode: "keep-original",
  label: "Apex"
});

await jarvis.transformation.setProfile(base, "proxy", proxy, {
  hpMode: "keep-original",
  label: "Proxy"
});
```

### Transformar

```js
const token = canvas.tokens.controlled[0];
await jarvis.transformation.morph(token, "apex");
```

Depois:

```js
await jarvis.transformation.morph(token, "proxy");
```

### Voltar à forma-base

```js
await jarvis.transformation.revert(token);
```

### Abrir o seletor do próprio Metamorph

```js
await jarvis.transformation.openPicker(token);
```

### HP Modes aceitos

- `keep-original` — padrão do Jarvis para formas da mesma criatura.
- `independent`
- `absolute`
- `percent`

---

## Apex / Proxy

Estrutura recomendada:

```text
Apex/Proxy — Actor Base
├── Proxy — Actor de forma
├── Apex — Actor de forma
└── Dupla Coroa — Actor de forma futura (bloqueado pela campanha)
```

Para o estado atual da campanha, Apex e Proxy usam `keep-original`.

A Dupla Coroa não deve ser registrada até a evolução ser realmente desbloqueada na história.

---

## Regra de arquitetura

**Visage nunca troca mecânicas. Metamorph nunca será usado apenas para trocar roupa.**

Isso evita duplicação de sistemas e mantém o motivo da transformação evidente:

```text
mesma ficha + visual diferente = Visage
ficha/estatísticas/habilidades diferentes = Metamorph
```

---

## Plano de teste antes de merge/release

1. Confirmar que o Jarvis inicializa com Visage e Metamorph desativados.
2. Ativar Visage e confirmar `jarvis.appearance.status()`.
3. Criar uma skin de teste e aplicar/remover/reverter.
4. Ativar Metamorph e confirmar `jarvis.transformation.status()`.
5. Testar dois Actors descartáveis com `keep-original`.
6. Confirmar manutenção de PV ao alternar A → B → A.
7. Testar Apex ↔ Proxy somente depois do teste descartável.
8. Só então conectar Avatar da Tempestade e Sarcófago às habilidades reais.

A beta não altera automaticamente fichas já validadas. A integração é opcional e aditiva.
