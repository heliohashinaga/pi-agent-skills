# Devloop Extension

Automated devloop for [pi](https://github.com/earendil-works/pi): runs a task,
phase, or range from `tasks.md` through a gate-based pipeline (planner → task-qa
→ code → review → test → security → documentation → integrate) using delegated
pi-subagents, with stacked-PR chaining, a live pipeline widget, and per-run
retrospectives.

## Status

**v0.1.0** — planning-phase refactor. See `specs/refactor/plan.md`.

## Develop

This is a pnpm project (pnpm 10+, `packageManager: pnpm@11.20.0`). It is a
**server-only** pi extension: no build step — pi loads `index.ts` directly and
`bun test` runs the suite.

```bash
pnpm install --frozen-lockfile   # install deps
pnpm typecheck                   # strict TS (domain: lib/contracts, routing, …)
pnpm typecheck:runtime           # strict TS (runtime: index, delegate, retro-agent)
pnpm test                        # 210 unit/integration/wiring tests (bun test)
```

### Package manager

`pnpm-workspace.yaml` is **not a monorepo declaration** — in pnpm 10+ it holds
project configuration. It carries:

- `minimumReleaseAgeExclude: [pi-subagents@0.43.0]` — exempts the hard-pinned
  `pi-subagents` from the supply-chain `minimumReleaseAge` defense.

## Install (local, symlink)

The canonical source is this directory. Install it into the pi extensions
folder via a symlink so edits here are live immediately (no copy step):

```bash
ln -s "$PWD" ~/.pi/agent/extensions/devloop
```

## Structure

```
index.ts                 # entry: registers session_start, renderers, 5 commands
lib/                     # domain + runtime modules (controller, routing, pipeline, …)
lib/__tests__/           # 20 test files (210 tests)
agents/                  # devloop subagent definitions (11 agents)
types/                   # .d.ts shims for pi-coding-agent / pi-subagents surface
specs/                   # feature specs (retrospective, stacked-pr-integrate, refactor)
tsconfig.json            # strict TS — domain (no pi runtime types)
tsconfig.runtime.json    # strict TS — runtime (index/delegate/retro-agent via shims)
```

## Agents

The extension bundles 11 read-only subagents used by the gate pipeline:

| Agent | Purpose |
|---|---|
| `feature-planner` | Scopes and validates a task slice |
| `task-qa` | Validates planner output for ambiguities |
| `worker-simple` | Implements simple slices |
| `worker-complex` | Implements complex slices |
| `reviewer-simple` | Light code review |
| `reviewer-complex` | Full code review |
| `tester-simple` | Light test verification |
| `tester-complex` | Full test verification |
| `security-triage` | Security gate triage |
| `security-reviewer` | Deep security review |
| `integrator` | Final integration and PR creation |
| `retro` | Post-run retrospective analysis |

These agents are **versioned with the extension** (not user-global). The
extension loads them at runtime, ensuring the gate pipeline always uses
compatible agent definitions.

## Commands (registered by the extension)

- `/devloop <Txxx | --phase N | --range Txxx-Txxx>` — run a task/phase/range.
- `/devloop-stop` — cancel the active run.
- `/devloop-cleanup [list | remove <branch> | --retros [keep]]` — worktrees / retros.
- `/devloop-retro [runId] [--agent]` — list/read retrospectives, generate recommendations.
- `/devloop-smoke [agent...]` — smoke-test delegation v2.
