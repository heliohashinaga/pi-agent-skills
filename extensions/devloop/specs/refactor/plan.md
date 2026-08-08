# Plan — Refactor da extensão devloop

Status: **draft** (aguardando aprovação do usuário para execução)
Scope: `devloop-extension` (`~/.pi/agent/extensions/devloop`). Refactor de
estrutura/qualidade, **sem mudar comportamento observável** do pipeline de gates,
do contrato de privacidade/segurança, do protocolo de delegation v2, nem do
formato `tasks.md`.

## 1. Problem statement

A extensão devloop amadureceu por acréscimo (specs `retrospective` e
`stacked-pr-integrate` já entregues) e acumulou dívida estrutural. Hoje:

1. **`index.ts` é um god-file de 733 linhas.** O handler `/devloop` sozinho tem
   ~246 linhas aninhadas (linhas 335-581: preflight → config → tasks → plan →
   worktree → observer → closures `captureRetro`/`maybeRecommend`/`finalizeSuccess`/
   `verifyTaskTracking` → ramo task **vs** ramo batch, que duplicam `toDelegator(...)`,
   `runController(...)`, `captureRetro()`, `pipeline.clear()`, `maybeRecommend()`
   e os blocos de notify). Os 5 comandos ficam todos inline (`devloop` 246,
   `cleanup` 68, `retro` 54, `smoke` 30) com try/catch/notify repetido.

2. **Primitivas duplicadas.** `CommandRunner`/`CommandResult` existem idênticos em
   `lib/worktree.ts` **e** `lib/pr.ts`. O boilerplate de `proper-lockfile`
   (`stale`/`update`/`retries` + temp-file-then-rename) está copiado em
   `lib/cancellation.ts` (lease) e `lib/stack.ts` (stack registry).

3. **Controle de fluxo por string.** `lib/controller.ts` decide salvage de timeout
   com `message.includes("timed out")` — frágil, acoplado ao texto de erro da
   delegação. Erros não são tipados.

4. **`controller.ts` mistura 4 preocupações** em 445 linhas: construção de prompts
   (`genericPrompt`/`plannerPrompt`/`integratePrompt` + `gateSpecs` com closures
   de prompt), loop de run, formatação de feedback, e regras de validação do
   integrate. Prompts são strings em TS — difíceis de iterar (o próprio retro
   quer melhorar prompt quality, mas não há separação template × runtime).

5. **Testes com `as any` e grab-bag.** `lib/__tests__/wiring.test.ts` tem 9
   casts `as any` (fake `ExtensionAPI` loosely typed) e mistura 3 coisas
   não-relacionadas: registro de comandos devloop, **cheques de frontmatter de
   agentes** (`~/.pi/agent/agents/*.md`) e **validação de templates do skill
   multi-agent-orchestration**. Descrição do teste também stale: "registers all
   four commands" — hoje são 5 (faltou `devloop-retro`).

6. **Sem controle de versão.** A extensão instalada em
   `~/.pi/agent/extensions/devloop` **não é um repo git** (sem `.git`) e **não
   vive no repo canônico** `~/repos/pi-agent-skills` (que versiona skills/extensões
   como `orchestration-advisor`). Três lockfiles coexistem (`bun.lock`,
   `package-lock.json`, `pnpm-lock.yaml` + `pnpm-workspace.yaml`), `package.json`
   sem `version`. Impossível rastrear diffs do refactor, reverter, ou colaborar.
   Já observado: `orchestration-advisor` instalado divergiu do repo (`.ts` diferentes,
   `package.json`/`node_modules` só na cópia instalada) — copy-paste manual sem sync.

7. **Import de mesmo módulo dividido** (`index.ts:58-59` importa `./lib/retro`
   em duas linhas) e **superfície pública ruidosa** em `cancellation.ts`
   (`compareAndDeleteLease`, `recoverStaleLease`, `readLeaseFile`, `isPidAlive`
   exportados "for callers" mas só usados internamente + testes).

8. **Sinal real de falha.** O retro mais recente (T024, `.pi/devloop-sessions/
   msjgqpnq-u69jmwvm.retro.md`) mostra `worker-complex timed out after 600000ms`
   no gate `code` (129k tok, 44 tool calls), após planner (2 tentativas) e task-qa
   (2 tentativas). O salvage de timeout existe mas não evitou a escalada; não há
   feedback estruturado "fatia grande demais → replanejar".

## 2. Princípios e non-goals

- **Refactor = estrutura/qualidade, não comportamento.** Nenhuma mudança na
  semântica dos gates, no state machine (`routing.ts`), nos schemas
  (`contracts.ts`), no contrato de privacidade/segurança, no protocolo de
  delegation v2, nem no formato `tasks.md`. Cada fase mantém os 210 testes verdes.
- **Pequeno, incremental, shippable.** Fases independentes; cada uma verde antes
  da próxima. Sem "big-bang rewrite".
- **Decoupling preservado.** Mantém o split `tsconfig.json` (domínio puro, sem
  pi-coding-agent) × `tsconfig.runtime.json` (index/delegate/retro-agent via
  shims `.d.ts`). É um design deliberado e bom; só limpar as arestas.
- **Non-goals explícitos:** (a) não alterar o conjunto/nomes dos 5 comandos;
  (b) não mudar a nomenclatura `.pi/devloop-sessions/` nesta rodada (ver Fase 6,
  opcional); (c) não reescrever os agentes (`~/.pi/agent/agents/*.md`).

## 3. Decisions (propostas)

- **D1 — Versionar no repo canônico `pi-agent-skills`.** Mover a extensão de
  `~/.pi/agent/extensions/devloop` para `~/repos/pi-agent-skills/devloop/extension/`
  (estrutura espelhando `orchestration-advisor/{extension,skill}`; a devloop é
  extensão-pura, sem skill, então só `devloop/extension/`). Substituir a cópia
  instalada por um **symlink**
  `~/.pi/agent/extensions/devloop → ~/repos/pi-agent-skills/devloop/extension`
  → fonte única, fim da divergência. `.gitignore` do repo passa a excluir
  `node_modules/`, `*.tsbuildinfo` e lockfiles não-pnpm. `package.json` ganha
  `version`; cria `CHANGELOG.md` + `README.md`. Commit do estado atual como
  **baseline antes de qualquer refactor** (commit separado, msg
  `:tada: chore(devloop): import extension into pi-agent-skills`).
- **D2 — Um package manager.** Padronizar em **pnpm** (já alinha com o repo
  consumidor storybook-ai). Remover `bun.lock` e `package-lock.json`;
  `test`/`typecheck` continuam funcionando via `pnpm exec bun test` ou scripts
  ajustados. Mantém `pnpm-workspace.yaml` só se fizer sentido (hoje parece
  resquício — avaliar na Fase 0).
- **D3 — Primitivas compartilhadas.** Novo `lib/shell.ts` (`CommandRunner`/
  `CommandResult`, centraliza o que `worktree.ts`/`pr.ts` duplicam) e
  `lib/lock.ts` (helper `withLock(dir, fn)` encapsulando `proper-lockfile` +
  temp-rename). `cancellation.ts` e `stack.ts` passam a usar `lib/lock.ts`.
- **D4 — Decompor `index.ts`.** Extrair cada comando para
  `commands/<name>.ts` (`devloop.ts`, `stop.ts`, `cleanup.ts`, `retro.ts`,
  `smoke.ts`) + um `lib/run.ts` que encapsula a orquestração de um run
  (worktree, observer, closures de fechamento, ramo task/batch unificado).
  `index.ts` vira um registry fino: `session_start` + `registerEntryRenderer` +
  `registerCommand` delegando aos módulos.
- **D5 — Prompts e gates data-driven.** Novo `lib/prompts.ts` (templates puros,
  sem I/O) e `lib/gates.ts` (tabela `gateSpecs` = dados, não closures). O
  `controller.ts` fica só com o loop de run + validação do integrate. A regra
  "cost-controlled tester tier" (`testPlanNeedsComplexTester` + seleção
  light/complex) vira uma função isolada e testável em `lib/gates.ts`.
- **D6 — Erros tipados.** `delegate.ts` lança `DevloopDelegationError` com
  `kind: "timed_out" | "cancelled" | "failed"` (deriva do `status` da resposta,
  não de string matching). `controller.ts` troca `message.includes("timed out")`
  por `error instanceof DevloopDelegationError && error.kind === "timed_out"`.
- **D7 — Testes tipados e isolados.** `tests/fakes.ts` (ou `lib/__tests__/_fakes.ts`)
  com um `fakeExtensionApi()` tipado contra o shim `ExtensionAPI`, eliminando os
  10 `as any`. `wiring.test.ts` é **fatiado**: mantém só registro de comandos
  devloop; os cheques de frontmatter de agentes e os templates do skill
  multi-agent-orchestration migram para seus próprios arquivos de teste (fora
  da extensão, ou `repo-health.test.ts`).

## 4. Design — fases

Cada fase = um slice coerente, verde-antes-de-seguir.

### Fase 0 — Versionar no `pi-agent-skills` + higiene (baixo risco, desbloqueia o resto)

Princípio: a fonte canônica passa a ser o repo; a cópia instalada vira symlink.
A devloop será a **primeira extensão "com build"** no repo (deps, lockfile,
testes) — estabelece o padrão para extensões reproduzíveis.

1. **Mover para o repo:** copiar `~/.pi/agent/extensions/devloop/{index.ts,lib,
   types,specs,package.json,tsconfig*.json,pnpm-lock.yaml,pnpm-workspace.yaml}`
   para `~/repos/pi-agent-skills/devloop/extension/`. Excluir `node_modules/`
   (545 MiB), `bun.lock`, `package-lock.json`, `*.tsbuildinfo`.
2. **`.gitignore` do repo** (raiz ou `devloop/extension/.gitignore`):
   `node_modules/`, `*.tsbuildinfo`, `bun.lock`, `package-lock.json`.
   Versionar `package.json`, `pnpm-lock.yaml`, `tsconfig.json`,
   `tsconfig.runtime.json`.
3. **`package.json`:** adiciona `version: "0.1.0"`, `packageManager: "pnpm@<versão>"`.
   **Mantém `pnpm-workspace.yaml`** (config do pnpm 10+, não resquício — ver OQ3):
   limpa o stub `allowBuilds` (placeholder strings) e preserva
   `minimumReleaseAgeExclude: [pi-subagents@0.42.1]`. Scripts
   `test`/`typecheck`/`typecheck:runtime` confirmados via pnpm.
4. **Symlink:** remove o dir instalado e cria
   `ln -s ~/repos/pi-agent-skills/devloop/extension ~/.pi/agent/extensions/devloop`.
   Valida que o pi carrega a extensão pelo symlink (rodar `pnpm install` no
   repo → `typecheck`/`test` verdes → `/devloop --dry-run` real contra
   storybook-ai com output idêntico ao pré-migração).
5. **Docs:** `devloop/extension/README.md` (o que é, como desenvolver/testar,
   como o symlink instala) + `devloop/extension/CHANGELOG.md` (Keep a Changelog).
   Atualiza `README.md` do repo raiz para listar a devloop como item 4.
6. **Commit baseline:** `:tada: chore(devloop): import extension into pi-agent-skills`
   (snapshot antes de qualquer refactor). Depois, cada fase do refactor = commit(s)
   próprios sobre este baseline.

- **Não muda código de produção.** Só estrutura/repos/symlink.

### Fase 1 — Primitivas compartilhadas (D3)
- `lib/shell.ts`: move `CommandRunner`/`CommandResult`/`requireSuccess`/
  `commandFailure`/`cleanOutput` de `worktree.ts`+`pr.ts` para um único lugar.
- `lib/lock.ts`: `withLock(targetDir, lockFileName, fn)` encapsulando
  `proper-lockfile.lock({ realpath:false, stale:30_000, update:10_000,
  retries:{...} })`. `cancellation.ts` (`acquireLock`) e `stack.ts`
  (`withStackLock`) passam a reusá-lo. Mantém o temp-file-then-rename como
  helper `atomicWrite(target, content)`.
- Ajusta imports em `worktree.ts`, `pr.ts`, `stack.ts`, `cancellation.ts`.
- Atualiza testes existentes (mocks de `CommandRunner` continuam compatíveis —
  a interface é a mesma, só mudou a origem).

### Fase 2 — Decompor `index.ts` (D4)
- `lib/run.ts`: extrai a orquestração do run para uma função
  `runDevloop({ pi, ctx, options, abortController })` que retorna um
  `RunOutcome`. Encapsula: preflight git, config, tasks, plan, agent-preflight
  (paraleliza o loop de 11 `resolveSubagentLaunchContract` com
  `Promise.all` — hoje é sequencial), worktree, observer, e unifica os ramos
  task/batch num só fluxo (o batch é só um loop sobre `runController`).
- `commands/devloop.ts`, `commands/stop.ts`, `commands/cleanup.ts`,
  `commands/retro.ts`, `commands/smoke.ts`: cada comando vira
  `export function register(pi, shared)` com seu próprio try/catch/notify.
- `index.ts`: só `session_start` + `registerEntryRenderer`×2 + `registerCommand`×5
  delegando. Deve cair de 733 para <80 linhas.
- Consolida o import de `./lib/retro` (uma linha). Reduz superfície pública de
  `cancellation.ts` (marca `compareAndDeleteLease`/`recoverStaleLease`/
  `readLeaseFile`/`isPidAlive` como internos onde possível; mantém só os
  `_…ForTests` exports necessários).
- Teste: `wiring.test.ts` atualizado para 5 comandos; novo
  `run.test.ts` cobre o fluxo unificado com fake pi + fake delegate (sem rede).

### Fase 3 — Prompts & gates data-driven (D5)
- `lib/prompts.ts`: move `genericPrompt`, `plannerPrompt`, `integratePrompt`
  como funções puras (sem dependência de `session`/`contracts` além de tipos).
- `lib/gates.ts`: `gateSpecs` vira uma tabela de dados
  `Record<GateStage, GateSpec>` onde `GateSpec = { agent; lightAgent?; stage;
  prompt: (ctx) => string }`. Extrai `testPlanNeedsComplexTester` e a seleção
  light/complex-tester para `selectAgent(spec, state, session): string` — pura,
  com testes dedicados (a regra é sutil e hoje está enterrada no loop).
- `controller.ts`: fica com o loop `while`, o salvage de timeout, a validação
  do integrate e a persistência da session. Cai de 445 para ~250 linhas.
- Teste: `gates.test.ts` (seleção de agente/tier); `prompts.test.ts`
  (snapshots curtos dos prompts).

### Fase 4 — Erros tipados (D6)
- `delegate.ts`: define `class DevloopDelegationError extends Error { kind:
  "timed_out" | "cancelled" | "failed" }`. O `reject` do timeout vira
  `kind:"timed_out"`; o `onAbort`/`onExternalAbort` vira `kind:"cancelled"`; os
  demais `kind:"failed"`. Mantém a mensagem humana.
- `controller.ts`: substitui `message.includes("timed out")` por checagem de
  `kind`. O salvage de timeout fica explícito e robusto.
- `retro-agent.ts`: idem (distingue `timed_out` do `failed` no `runRetroAnalysis`).
- Teste: `delegate.test.ts` adiciona casos por `kind`; `controller.test.ts`
  adapta o teste de salvage.

### Fase 5 — Testes: fakes tipados + split do grab-bag (D7)
- `lib/__tests__/_fakes.ts`: `fakeExtensionApi()` tipado contra o shim
  `ExtensionAPI` (sem `as any`), com setters para `exec`/`events`/`ui`. Reusado
  por `wiring.test.ts`, `run.test.ts`, `delegate.test.ts`.
- `wiring.test.ts`: remove os casts; mantém só registro de comandos devloop +
  schema validation + lifecycle Esc/cancel. Atualiza descrição para 5 comandos.
- Move "agent frontmatter checks" → `lib/__tests__/agents.test.ts` (ou, melhor,
  para junto dos agentes em `~/.pi/agent/agents/__tests__/` se esse padrão existir;
  senão fica aqui mas isolado). Move "multi-agent orchestration templates" →
  `lib/__tests__/orchestration-templates.test.ts`. O devloop não é dono desses
  cheques — eles só aterrissaram aqui por conveniência.

### Fase 6 — Persistência consolidada (OPCIONAL, risco médio — só após 1-5 verdes)
- Unificar layout `.pi/`: hoje há `devloop-lease.json`, `devloop-lease.lock`,
  `devloop-stack.json`, `devloop-stack.lock` (na raiz `.pi/`) e
  `devloop-sessions/<taskId>.json`/`<taskId>-plan.json`/`<runId>.retro.json`/
  `<runId>.retro.md`. Avaliar: (a) mover lease/stack para `.pi/devloop/`?;
  (b) ledgers por task também na **raiz do repo** (hoje no worktree, perdido no
  sucesso — já é OQ3 aberto no spec retrospective); (c) um `lib/storage.ts`
  unificando paths. **Risco:** muda on-disk layout; precisa migration + atualizar
  `.gitignore` do repo consumidor. Deferir se não houver pressão real.

### Fase 7 — Observabilidade/feedback acionável (OPCIONAL — fora do escopo "refactor", mas alinha com o sinal do T024)
- Tornar timeout de code-stage **acionável**: quando o salvage de timeout
  esgota, emitir um evento estruturado no retro (ex. `timeoutWithPartialWork`)
  para o agente `retro` recomendar "replanejar/fatiar" em vez de só "aumentar
  timeout". Hoje o retro só vê `timed_out` no texto. **Não é refactor puro**;
  mantém-se só como candidato, dependendo do appetite.

## 5. File-by-file change map (fases 1-5, as obrigatórias)

| Arquivo | Mudança | Fase |
|---|---|---|
| `lib/shell.ts` (novo) | `CommandRunner`/`CommandResult`/`requireSuccess`/`cleanOutput` compartilhados | 1 |
| `lib/lock.ts` (novo) | `withLock` + `atomicWrite` (dedup de `proper-lockfile`) | 1 |
| `lib/worktree.ts` | importa `CommandRunner` de `lib/shell` | 1 |
| `lib/pr.ts` | importa `CommandRunner` de `lib/shell`; remove duplicata | 1 |
| `lib/stack.ts` | usa `lib/lock` | 1 |
| `lib/cancellation.ts` | usa `lib/lock` + `atomicWrite`; reduz exports públicos | 1, 2 |
| `commands/devloop.ts` (novo) | handler `/devloop` delega a `lib/run.ts` | 2 |
| `commands/stop.ts`/`cleanup.ts`/`retro.ts`/`smoke.ts` (novo) | um comando por arquivo | 2 |
| `lib/run.ts` (novo) | orquestração do run (task/batch unificado, preflight paralelo) | 2 |
| `index.ts` | registry fino; cai de ~480 para <80 linhas | 2 |
| `lib/prompts.ts` (novo) | templates de prompt puros | 3 |
| `lib/gates.ts` (novo) | `gateSpecs` tabela + `selectAgent` + tier rule | 3 |
| `lib/controller.ts` | só loop + salvage + validação integrate; cai de 445 p/ ~250 | 3, 4 |
| `lib/delegate.ts` | `DevloopDelegationError` tipado | 4 |
| `lib/retro-agent.ts` | usa erro tipado | 4 |
| `lib/__tests__/_fakes.ts` (novo) | `fakeExtensionApi()` tipado | 5 |
| `lib/__tests__/wiring.test.ts` | remove `as any`; 5 comandos; só devloop | 5 |
| `lib/__tests__/agents.test.ts` (novo) | cheques de frontmatter (movidos) | 5 |
| `lib/__tests__/orchestration-templates.test.ts` (novo) | validação de templates (movido) | 5 |
| `lib/__tests__/gates.test.ts`/`prompts.test.ts` (novo) | seleção de agente/tier + prompts | 3 |
| `lib/__tests__/run.test.ts` (novo) | fluxo unificado com fakes | 2 |
| `package.json`/`CHANGELOG.md`/`README.md` | versionamento + docs | 0 |

## 6. Testing

- **Invariante de cada fase:** `pnpm typecheck && pnpm typecheck:runtime &&
  pnpm test` verdes (210+ testes), sem novos `any` em código de produção.
- **Fase 1:** testes de `worktree`/`pr`/`stack`/`cancellation` continuam verdes
  (interfaces idênticas). Adiciona `lock.test.ts` (concorrência + stale recovery
  via o helper unificado).
- **Fase 2:** `run.test.ts` cobre task/batch unificado com fake pi + fake
  delegate; `wiring.test.ts` atualizado para 5 comandos e sem os 9 `as any`.
- **Fase 3:** `gates.test.ts` (tier rule: light vs complex, upgrade por
  testPlan E2E/visual) + `prompts.test.ts` (assertiva de conteúdo, não snapshot
  gigante).
- **Fase 4:** `delegate.test.ts` cobre os 3 `kind` de erro; `controller.test.ts`
  adapta salvage de timeout para `kind === "timed_out"`.
- **Fase 5:** split do grab-bag; cada arquivo de teste tem um único `describe`.
- **Privacidade/segurança:** nenhum teste novo necessário (contrato inalterado),
  mas regressão manual: rodar um `/devloop --dry-run` real contra o repo
  storybook-ai e confirmar output idêntico ao pré-refactor.

## 7. Definição de pronto

- `index.ts` < 80 linhas (de 733); `controller.ts` < 260 linhas (de 445);
  zero `as any` em produção e nos testes devloop.
- Um só package manager (pnpm); extensão versionada em git; `CHANGELOG.md` +
  `README.md` presentes.
- `CommandRunner`/`CommandResult` e o boilerplate de `proper-lockfile` definidos
  uma única vez.
- Erros de delegação tipados; nenhum `message.includes(...)` para controle de
  fluxo.
- 5 comandos registrados e testados; `wiring.test.ts` não mistura cheques de
  agentes/templates alheios.
- Todos os testes verdes; `typecheck` + `typecheck:runtime` limpos; `/devloop
  --dry-run` behavior idêntico ao baseline.

## 8. Open questions (decidir antes de executar)

- **OQ1 — (RESOLVIDA)** Versionar no repo canônico `pi-agent-skills`
  (`github.com/heliohashinaga/pi-agent-skills`), como `devloop/extension/`
  (espelhando `orchestration-advisor/{extension,skill}`; devloop é extensão-pura,
  sem skill). Cópia instalada vira **symlink** → fonte única, fim da divergência
  já observada entre repo e `~/.pi`. Estabelece o padrão de extensão "com build"
  (deps + lockfile + testes) no repo.
- **OQ2 — Package manager.** Padronizar pnpm (alinha com storybook-ai) ou
  manter bun (mais rápido para `bun test`)? Recomendação: **pnpm** para installs
  + lockfile único, `bun test`/`bun` como runner de testes via script. Confirmar.
- **OQ3 — (RESOLVIDA) `pnpm-workspace.yaml` NÃO é resquício.** No pnpm 10+ é o
  arquivo de configuração do projeto (não só monorepo). Este arquivo não tem
  `packages:` → não é workspace; só guarda config. Contém: (a) `allowBuilds` com
  valores **placeholder** (as strings literais `"set this to true or false"`
  em vez de booleanos) para `@google/genai` e `protobufjs` — stub não preenchido,
  no-op; (b) `minimumReleaseAgeExclude: [pi-subagents@0.42.1]` — config real e
  defensiva (exime o hard-pin `pi-subagents@0.42.1` da defesa de supply chain
  `minimumReleaseAge`). **Manter o arquivo e versioná-lo.** Na Fase 0, limpar só o
  stub `allowBuilds`: remover as linhas placeholder (ou converter para `true`/`false`
  se houver build nativo real a aprovar — não é o caso hoje).
- **OQ4 — Fase 6/7.** Incluir persistência consolidada e/ou observabilidade
  acionável nesta rodada, ou deixar só 1-5 (refactor puro) e abrir specs
  separados depois? Recomendação: **só 1-5 agora**; 6/7 viram specs próprios.
- **OQ5 — Onde moram os testes de agentes/templates.** `wiring.test.ts` valida
  frontmatter de `~/.pi/agent/agents/*.md` e templates do skill
  multi-agent-orchestration. Isso é checagem de saúde do **instalação pi**,
  não do devloop. Migrar para `~/.pi/agent/__tests__/` (repo de configuração) ou
  manter na extensão mas isolados? Recomendação: **migrar para fora da extensão**
  (a extensão não é dona dos agentes/skills).

## 9. Rollout (proposto)

1. ⏳ Fase 0 — mover para `pi-agent-skills/devloop/extension/` + symlink +
   `.gitignore` + `package.json` version + README/CHANGELOG + commit baseline
   (sem tocar em código).
2. ⏳ Fase 1 — `lib/shell.ts` + `lib/lock.ts` (dedup).
3. ⏳ Fase 2 — decompor `index.ts` (`commands/*` + `lib/run.ts`).
4. ⏳ Fase 3 — `lib/prompts.ts` + `lib/gates.ts` (data-driven).
5. ⏳ Fase 4 — `DevloopDelegationError` (erros tipados).
6. ⏳ Fase 5 — fakes tipados + split do grab-bag de testes.
7. (opcional) Fase 6/7 — specs separados.
