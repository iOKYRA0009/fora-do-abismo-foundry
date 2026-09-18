# Jarvis V9 — Appearance & Transformation Beta

Versão-alvo: `0.2.0-beta.3`

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


---

## Appearance Pack Installer — beta.2

A partir da beta.2, o Jarvis pode criar **Local Visages diretamente no armário de qualquer Actor**, incluindo:

- token/skin;
- portrait opcional;
- modo Identity ou Overlay;
- escala e propriedades visuais opcionais;
- efeitos visuais do Sequencer/JB2A;
- áudio;
- macros e TMFX quando descritos no pacote;
- registro automático de uma chave lógica do Jarvis para aplicar/reverter depois.

A imagem continua sendo criada fora do Foundry (por exemplo, pelo agente de arte) e deve existir em um caminho acessível pelo Foundry. Depois disso, o Jarvis instala o pacote inteiro no Visage sem precisar reconstruir a Local Layer manualmente.

### API

```js
const jarvis = game.modules.get("fora-do-abismo-foundry").api;
console.log(jarvis.appearance.packStatus());
```

### Criar um efeito JB2A

```js
const fx = jarvis.appearance.visualEffect("jb2a.static_electricity", {
  label: "Avatar da Tempestade - Ativação",
  scale: 1,
  opacity: 1,
  bindRotation: false,
  bindToSprite: true,
  zOrder: "above",
  loop: false,
  delay: 0
});
```

### Instalar uma skin completa

```js
const thors = game.actors.getName("Thors Thormenta");

const pack = jarvis.appearance.makePack({
  actorName: "Thors Thormenta",
  profiles: [
    {
      key: "avatar-tempestade",
      label: "Avatar da Tempestade",
      mode: "identity",
      tokenPath: "Mapas/Thors%20Avatar%20da%20tempestade%20token.png",
      scale: 1.25,
      effects: [
        jarvis.appearance.visualEffect("jb2a.static_electricity", {
          label: "Avatar da Tempestade - Ativação",
          bindToSprite: true,
          bindRotation: false,
          zOrder: "above",
          loop: false
        })
      ]
    }
  ]
});

await jarvis.appearance.installPack(thors, pack);
```

Depois disso:

```js
const token = canvas.tokens.controlled[0];
await jarvis.appearance.apply(token, "avatar-tempestade");
```

### Importar um export do próprio Visage

O Jarvis também aceita diretamente o JSON exportado pelo Visage:

```js
await jarvis.appearance.importVisageExport(
  game.actors.getName("Thors Thormenta"),
  exportedVisageJson
);
```

O instalador tenta preservar IDs quando fornecidos e, por padrão, substitui uma aparência existente com o mesmo label em vez de criar duplicatas.

### Workflow recomendado para novos personagens

1. O agente consulta ficha/lore e cria a arte conceitual.
2. O agente cria o token Foundry 1:1, top-down, fundo transparente.
3. O token é colocado na pasta de assets do Foundry.
4. O agente produz um Appearance Pack com os efeitos adequados.
5. O macro executa `jarvis.appearance.installPack(...)`.
6. A skin aparece automaticamente no armário Local do Actor.
7. Habilidades futuras podem chamar a chave lógica registrada pelo Jarvis.

Esse fluxo permite reutilizar a mesma infraestrutura para Thors, Sonson, Jack, Nicolau, Drownald e NPCs sem codificar cada personagem diretamente no módulo.

### Limite atual

O Jarvis não chama um gerador de imagens de dentro do Foundry. A geração da arte/token acontece fora do Foundry; o módulo cuida da instalação, organização, VFX e aplicação da aparência.


---

## Active Effect -> Visage (beta.3)

A beta.3 permite vincular uma aparência do Visage a um Active Effect real do Actor.

O fluxo é:

1. a habilidade aplica um Active Effect no personagem;
2. se esse Effect tiver `flags.fora-do-abismo-foundry.appearance.key`, o Jarvis aplica a skin registrada com essa chave;
3. quando o Effect é removido, desativado ou expira, o Jarvis remove apenas essa aparência;
4. outras camadas/overlays do Visage não são revertidas junto.

Exemplo de flag no Active Effect:

```js
await effect.setFlag("fora-do-abismo-foundry", "appearance", {
  key: "avatar-tempestade",
  clearStack: true,
  switchIdentity: true,
  removeOnDelete: true
});
```

Esse mecanismo é genérico e pode ser usado depois para Thors, Sonson, Jack, Nicolau e NPCs, desde que a aparência já tenha sido instalada/registrada no Actor.

### Thors — Avatar da Tempestade

Para o Thors, a integração recomendada é:

- Activity: `Avatar da Tempestade`;
- Active Effect embutido: o Effect mecânico já existente da habilidade;
- chave de aparência: `avatar-tempestade`;
- chave de automação: `thors-avatar-tempestade`.

A beta não inventa duração nem mecânica se a habilidade não possuir Active Effect configurado. Nesse caso, o instalador deve parar e pedir revisão da ficha em vez de criar regras silenciosamente.
