# Pi Agent Skills

A collection of production-grade skills, agents, and extensions for [pi](https://github.com/earendil-works/pi) — a coding agent harness for parallel AI-assisted development.

## 📁 Structure

```
pi-agent-skills/
├── skills/          # Reusable capabilities loaded by pi
├── agents/          # Read-only subagent definitions
├── extensions/      # pi extensions (commands, renderers, lifecycle hooks)
└── docs/            # ADR, runbooks, documentation skill
```

| Component | Purpose | Example |
|---|---|---|
| **Skills** | Capabilities loaded into pi sessions | `nextjs`, `python`, `rust` |
| **Agents** | Read-only subagents for delegation | `worker-complex`, `retro` |
| **Extensions** | Commands, renderers, lifecycle hooks | `devloop`, `orchestration-advisor` |

---

## 🎯 Skills

### Orchestration

#### **Multi-Agent Orchestration**
Safe orchestration patterns for pi-subagents: workflowScript, async runs, one writer per cwd/worktree, explicit acceptance, and fresh-context review.

- ✅ Async-default execution patterns
- ✅ Single-writer worktree isolation
- ✅ Explicit acceptance contracts
- ✅ Planner → Writer → Validator chains

**Use when**: Multi-agent workflows with parallel review, dependencies, and durable output merging.

**Links**:
- [`skills/multi-agent-orchestration/SKILL.md`](skills/multi-agent-orchestration/SKILL.md)

---

#### **Orchestration Advisor**
Detects machine capacity and recommends the best orchestration strategy.

- ✅ Detect RAM, CPU, swap, disk
- ✅ Recommend sequential / hybrid / parallel

**Use when**: You need guidance on orchestration aggressiveness.

**Links**:
- [`skills/orchestration-advisor/SKILL.md`](skills/orchestration-advisor/SKILL.md)

---

### Languages & Frameworks

| Skill | Description |
|---|---|
| **dotnet** | .NET/C# — `dotnet build`, xUnit, ASP.NET Core, EF Core, NuGet |
| **java** | Java — Maven/Gradle, JUnit 5, src/main & src/test layout |
| **python** | Python — pyproject.toml, uv, ruff, pytest, asyncio, src layout |
| **rust** | Rust — Cargo, modules, Result/?`, Clippy, rustfmt |
| **typescript** | TypeScript — strict config, ESM, feature-based modules, Zod |
| **vuejs** | Vue 3 — Composition API, Vite, Pinia, Vitest |

**Links**:
- [`skills/dotnet/SKILL.md`](skills/dotnet/SKILL.md)
- [`skills/java/SKILL.md`](skills/java/SKILL.md)
- [`skills/python/SKILL.md`](skills/python/SKILL.md)
- [`skills/rust/SKILL.md`](skills/rust/SKILL.md)
- [`skills/typescript/SKILL.md`](skills/typescript/SKILL.md)
- [`skills/vuejs/SKILL.md`](skills/vuejs/SKILL.md)

---

### UI & Design

#### **Next.js**
Next.js (App Router) + React 19 skill.

- ✅ RSC vs client components
- ✅ Route Handlers, Server Actions
- ✅ Server-only boundary, i18n, lazy loading

**Links**:
- [`skills/nextjs/SKILL.md`](skills/nextjs/SKILL.md)

---

#### **Design System**
Token-based styling, accessible primitives, Storybook conventions.

- ✅ Semantic tokens (no raw colors)
- ✅ AA contrast, keyboard navigation
- ✅ Storybook: default/loading/error/edge + a11y

**Links**:
- [`skills/design-system/SKILL.md`](skills/design-system/SKILL.md)

---

#### **Playwright**
End-to-end, visual and Storybook test conventions for coding agents.

- ✅ Run against production build (not dev mode) — deterministic, no cold-compile flake
- ✅ Privacy invariants, deterministic fake providers (no live AI)
- ✅ Web-first assertions, a11y, visual regression

**Links**:
- [`skills/playwright/SKILL.md`](skills/playwright/SKILL.md)

---

### Cross-Cutting

| Skill | Description |
|---|---|
| **gitmoji** | Gitmoji + Conventional Commits for commit messages |
| **security** | OWASP checklist, secret scanning, SAST, SSRF/authz checks |
| **docs** | README, ADR, runbooks, API documentation |

**Links**:
- [`skills/gitmoji/SKILL.md`](skills/gitmoji/SKILL.md)
- [`skills/security/SKILL.md`](skills/security/SKILL.md)
- [`skills/docs/SKILL.md`](skills/docs/SKILL.md)

---

### Finance

#### **hledger**
hledger accounting commands for personal/small business finances.

- ✅ Balance, register, incomestatement, cashflow, balancesheet

**Links**:
- [`skills/hledger/SKILL.md`](skills/hledger/SKILL.md)

---

## 🤖 Agents

Read-only subagent definitions used by extensions for delegated work.

| Agent | Purpose | Used By |
|---|---|---|
| `feature-planner` | Scopes and validates task slices | devloop |
| `task-qa` | Validates planner output | devloop |
| `worker-simple` | Implements simple slices | devloop |
| `worker-complex` | Implements complex slices | devloop |
| `reviewer-simple` | Light code review | devloop |
| `reviewer-complex` | Full code review | devloop |
| `tester-simple` | Light test verification | devloop |
| `tester-complex` | Full test verification | devloop |
| `security-triage` | Security gate triage | devloop |
| `security-reviewer` | Deep security review | devloop |
| `integrator` | Final integration + PR | devloop |
| `retro` | Post-run retrospective | devloop |

**Links**:
- [`agents/`](agents/) — All agent definitions

---

## 🧩 Extensions

pi extensions that register commands, renderers, and lifecycle hooks.

### Devloop

Automated devloop: runs a task/phase/range through a gate-based pipeline using delegated subagents, with stacked-PR chaining and retrospectives.

- ✅ 5 commands: `/devloop`, `/devloop-stop`, `/devloop-cleanup`, `/devloop-retro`, `/devloop-smoke`
- ✅ Gate pipeline: planner → task-qa → code → review → test → security → documentation → integrate
- ✅ Stacked-PR chaining, live TUI widget, per-run retrospectives
- ✅ 195 tests, TypeScript strict

**Links**:
- [`extensions/devloop/README.md`](extensions/devloop/README.md)

---

### Orchestration Advisor

Detects machine capacity and recommends orchestration strategy.

- ✅ Sequential / hybrid / parallel recommendation
- ✅ Integration with devloop orchestration decisions

**Links**:
- [`extensions/orchestration-advisor/README.md`](extensions/orchestration-advisor/README.md)

---

## 🔗 Integration

### Install Skills

Copy or symlink to pi's skills directory:

```bash
# Install all skills
ln -s $(pwd)/skills/* ~/.pi/agent/skills/

# Install specific skill
ln -s $(pwd)/skills/nextjs ~/.pi/agent/skills/nextjs
```

### Install Extensions

```bash
# Devloop
ln -s $(pwd)/extensions/devloop ~/.pi/agent/extensions/devloop

# Orchestration Advisor
ln -s $(pwd)/extensions/orchestration-advisor ~/.pi/agent/extensions/orchestration-advisor
```

### Install Agents

```bash
# Link agents to pi's agents directory
ln -s $(pwd)/agents/* ~/.pi/agent/agents/
```

---

## 📋 License

MIT
