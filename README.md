# Pi Agent Skills

A collection of production-grade skills for [pi](https://github.com/earendil-works/pi) — a coding agent harness for parallel AI-assisted development.

## 📚 Skills Included

### Orchestration

#### **Orchestration Advisor**
Detects machine capacity and recommends the best orchestration strategy.

- ✅ Detect current resource status (RAM, CPU cores, swap, disk)
- ✅ Recommend sequential / hybrid / parallel orchestration
- ✅ Skill entrypoint + extension implementation

**Use when**: You need a concise advisor that suggests how aggressively to orchestrate based on current machine resources.

**Links**:
- [`orchestration-advisor/skill/SKILL.md`](orchestration-advisor/skill/SKILL.md) — Skill descriptor
- [`orchestration-advisor/extension/index.ts`](orchestration-advisor/extension/index.ts) — Extension implementation
- [`orchestration-advisor/skill/orchestration.config.json`](orchestration-advisor/skill/orchestration.config.json) — Threshold configuration

---

#### **Multi-Agent Orchestration**
Safe orchestration patterns for pi-subagents: workflowScript, async runs, one writer per cwd/worktree, explicit acceptance, and fresh-context review.

- ✅ Async-default execution patterns
- ✅ Single-writer worktree isolation
- ✅ Explicit acceptance contracts
- ✅ Decision-rule prompting (avoid escalations)
- ✅ Planner → Writer → Validator chains

**Use when**: You need structured multi-agent workflows with parallel review, chained dependencies, and durable output merging.

**Links**:
- [`multi-agent-orchestration/SKILL.md`](multi-agent-orchestration/SKILL.md) — Skill descriptor
- [`multi-agent-orchestration/README.md`](multi-agent-orchestration/README.md) — Quick start
- [`multi-agent-orchestration/REFERENCE.md`](multi-agent-orchestration/REFERENCE.md) — Pattern lookup
- [`multi-agent-orchestration/TROUBLESHOOTING.md`](multi-agent-orchestration/TROUBLESHOOTING.md) — Common issues

---

### Languages & Frameworks

#### **dotnet**
.NET / C# development skill — write, build, test and refactor C# code using the dotnet CLI, xUnit/NUnit, ASP.NET Core (Minimal API), EF Core and NuGet.

- ✅ `dotnet build` / `dotnet test` workflows
- ✅ xUnit / NUnit test conventions
- ✅ ASP.NET Core Minimal API & EF Core
- ✅ NuGet package management

**Use when**: Tasks involve C# files (`.cs`, `.csproj`, `.sln`), .NET projects, `dotnet build`/`dotnet test`, NuGet packages, or ASP.NET Core / EF Core code.

**Links**:
- [`dotnet/SKILL.md`](dotnet/SKILL.md) — Skill descriptor

---

#### **java**
Java development skill — write, build, test and refactor Java using Maven or Gradle, the standard src/main & src/test layout, JUnit 5, modern package naming and feature-based structure.

- ✅ Maven & Gradle build workflows
- ✅ JUnit 5 test conventions
- ✅ Standard `src/main` & `src/test` layout
- ✅ Feature-based package structure

**Use when**: Tasks involve `.java` files, `pom.xml` / `build.gradle`, Maven/Gradle builds, JUnit 5, or the JVM toolchain.

**Links**:
- [`java/SKILL.md`](java/SKILL.md) — Skill descriptor

---

#### **python**
Python development skill — write, build, test and refactor Python following modern 2025 practices: pyproject.toml, uv, ruff, type checking, pytest, async asyncio and the src layout.

- ✅ `pyproject.toml` + uv workflow
- ✅ ruff lint/format + type checking
- ✅ pytest, async asyncio, src layout

**Use when**: Tasks involve `.py` files, packages, venvs, pip/uv/poetry, ruff, pytest, or async Python code.

**Links**:
- [`python/SKILL.md`](python/SKILL.md) — Skill descriptor

---

#### **rust**
Rust development skill — write, build, test and refactor Rust with Cargo, modules, the borrow checker, error handling (Result/?), Clippy and rustfmt.

- ✅ Cargo build / test / clippy workflows
- ✅ Modules & borrow checker patterns
- ✅ Result / `?` error handling
- ✅ rustfmt formatting

**Use when**: Tasks involve `.rs` files, `cargo build`/`cargo test`/`cargo clippy`, crates/`Cargo.toml`, or Rust workspaces.

**Links**:
- [`rust/SKILL.md`](rust/SKILL.md) — Skill descriptor

---

#### **typescript**
TypeScript development skill — write, build, test and refactor TypeScript for Node.js / browser apps: strict tsconfig, ESM/NodeNext, feature-based modular structure, tsc/tsx, ESLint and Zod validation.

- ✅ Strict `tsconfig` + ESM / NodeNext
- ✅ Feature-based modular structure
- ✅ tsc / tsx, ESLint, Zod validation

**Use when**: Tasks involve `.ts`/`.tsx` files, `tsconfig.json`, TypeScript type design, Node ESM modules, or building/running TS with tsc/tsx.

**Links**:
- [`typescript/SKILL.md`](typescript/SKILL.md) — Skill descriptor

---

#### **nextjs**
Generic Next.js (App Router) + React 19 skill, reusable across projects. Covers RSC vs client components, Route Handlers, Server Actions, the server-only boundary, i18n, lazy loading, and a tiered testing approach.

- ✅ RSC vs client component boundaries
- ✅ Route Handlers & Server Actions
- ✅ Server-only boundary & i18n
- ✅ Lazy loading + tiered testing

**Use when**: Touching `app/`, `features/`, `lib/` or tests in a Next.js repo. Project-specific conventions override this generic guidance.

**Links**:
- [`nextjs/SKILL.md`](nextjs/SKILL.md) — Skill descriptor

---

#### **vuejs**
Vue.js 3 development skill — build, refactor and test Vue 3 apps with the Composition API, `<script setup>`, Vite, Pinia, Vue Router and Vitest.

- ✅ Composition API + `<script setup>`
- ✅ Vite, Pinia stores, Vue Router
- ✅ Vitest / @vue/test-utils testing

**Use when**: Tasks involve `.vue` SFCs, Vue components, Vite config, Pinia stores, Vue Router, or Vue testing.

**Links**:
- [`vuejs/SKILL.md`](vuejs/SKILL.md) — Skill descriptor

---

### UI & Design

#### **design-system**
Generic design-system / accessible-UI skill, reusable across projects. Covers token-based styling, accessible shared primitives, Storybook story conventions (default/loading/error/edge) with a11y testing, and visual regression.

- ✅ Token-based styling
- ✅ Accessible shared primitives
- ✅ Storybook story conventions (default/loading/error/edge) + a11y testing
- ✅ Visual regression

**Use when**: Touching shared UI, design tokens, Tailwind classes, stories, a11y/contrast/keyboard, or visual regression. Project conventions override this generic guidance.

**Links**:
- [`design-system/SKILL.md`](design-system/SKILL.md) — Skill descriptor

---

### Documentation & Process

#### **docs**
Documentation skill — write, update and audit project documentation: README, AGENTS.md/CONTRIBUTING, Architecture Decision Records (ADR), API/OpenAPI docs, architecture diagrams (C4 as-code), runbooks, and onboarding guides.

- ✅ README, AGENTS.md / CONTRIBUTING
- ✅ Architecture Decision Records (ADR) & API/OpenAPI docs
- ✅ Architecture diagrams (C4 as-code), runbooks, onboarding guides
- ✅ Keep docs in sync with code

**Use when**: Tasks involve documentation files, README/ADR/API-doc/runbook/changelog work, or ensuring docs stay in sync with code.

**Links**:
- [`docs/SKILL.md`](docs/SKILL.md) — Skill descriptor

---

#### **gitmoji**
Gitmoji + Conventional Commits convention for commit messages and PR titles — format `:emoji: type(scope): subject`.

- ✅ Emoji-to-intent mapping (feature, fix, refactor, docs, tests, config, CI, perf, architecture, dependency, DB migration, removal, security, release)
- ✅ Conventional Commits types & scopes
- ✅ PR titles and squash/merge summaries

**Use when**: Writing, reviewing or integrating commit messages and PR titles.

**Links**:
- [`gitmoji/SKILL.md`](gitmoji/SKILL.md) — Skill descriptor

---

#### **security**
Security review skill — run a security pass on code, diffs and infra: OWASP code-review checklist, secret scanning, dependency/SCA audit, SAST, SSRF and authz checks, and gates for AI-generated code.

- ✅ OWASP code-review checklist
- ✅ Secret scanning & dependency/SCA audit
- ✅ SAST, SSRF and authz checks
- ✅ Gates for AI-generated code

**Use when**: Reviewing changes for vulnerabilities, auditing a repo, or enforcing security before merge.

**Links**:
- [`security/SKILL.md`](security/SKILL.md) — Skill descriptor

---

### Devloop Automation

#### **Devloop**
Automated devloop: runs a task/phase/range from `tasks.md` through a gate-based pipeline (planner → task-qa → code → review → test → security → documentation → integrate) via delegated pi-subagents, with stacked-PR chaining, a live pipeline widget, and per-run retrospectives.

- ✅ Gate-based pipeline with cost-controlled worker/reviewer/tester tiering
- ✅ Stacked-PR chaining (each run branches off the previous run's tip)
- ✅ Live TUI pipeline widget + durable per-gate/per-run history cards
- ✅ Per-run retrospective facts (deterministic) + optional read-only recommendations
- ✅ Cross-process mutual exclusion (one active run per machine)

**Use when**: You want pi to drive a task from `tasks.md` through the full
plan → implement → review → test → secure → integrate loop automatically.

**Links**:
- [`devloop/extension/README.md`](devloop/extension/README.md) — develop/install/structure
- [`devloop/extension/index.ts`](devloop/extension/index.ts) — Extension implementation
- [`devloop/extension/specs/refactor/plan.md`](devloop/extension/specs/refactor/plan.md) — refactor plan

---

### Finance

#### **hledger**
hledger accounting commands for managing personal and small business finances.

- ✅ Run reports (balance, register, incomestatement, cashflow, balancesheet)
- ✅ Import CSV bank transactions with reconciliation rules
- ✅ Add/edit journal entries
- ✅ Check and validate ledger integrity
- ✅ Generic account structure with [BANK_NAME], [BROKER_NAME] placeholders
- ✅ Ready-to-use scripts (import, validate, monthly reports)

**Use when**: You need to manage personal or business finances with double-entry accounting, import bank CSV transactions, generate reports, or validate ledger entries.

**Links**:
- [`hledger/SKILL.md`](hledger/SKILL.md) — Skill descriptor & commands
- [`hledger/scripts/`](hledger/scripts/) — Utility scripts (import-csv.sh, validate.sh, monthly-report.sh)

---

## 🔗 Integration

These skills are designed to work together:

- **Orchestration Advisor + Multi-Agent Orchestration**: resource-aware orchestration strategy plus workflow orchestration
  - See [`orchestration-advisor/skill/SKILL.md`](orchestration-advisor/skill/SKILL.md)
  - See [`multi-agent-orchestration/ORCHESTRATION-BRIDGE.md`](multi-agent-orchestration/ORCHESTRATION-BRIDGE.md)

- **Orchestration Advisor** pairs with **Multi-Agent Orchestration** when you need a lightweight strategy recommendation plus a safe multi-agent execution pattern:
  - **Advisor**: Detects available resources → recommends a strategy
  - **Multi-Agent**: Structures chains, worktrees, acceptance contracts → how to orchestrate safely

- **Language skills** (dotnet, java, python, rust, typescript) pair with the **Multi-Agent Orchestration** and **Orchestration Advisor** skills to drive language-specific delegated implementation with safe parallel work.

- **design-system** + **nextjs** / **vuejs** / **typescript** cover the full frontend stack from shared accessible primitives to app-level conventions.

- **docs**, **gitmoji**, and **security** are cross-cutting process skills that apply across every language and orchestration context.

## 🧩 Extension

- [`orchestration-advisor/extension/`](orchestration-advisor/extension/) — core implementation behind the orchestration advisor skill
- [`devloop/extension/`](devloop/extension/) — automated devloop extension (pnpm project; install via symlink — see its `README.md`)
