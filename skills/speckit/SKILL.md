---
name: speckit
description: |
  Spec Kit — the open-source spec-driven development (SDD) toolkit for AI
  coding agents. Use when running or explaining the `/speckit.*` workflow:
  constitution, specify, clarify, plan, checklist, tasks, analyze, implement,
  converge. Covers installation via the specify-cli (uv), the artifact files
  (constitution.md, spec.md, plan.md, tasks.md), the quality-gate loop between
  specify/plan/tasks and analyze/converge, agent integrations (slash commands
  vs `$speckit-*` skills), and feature tracking via `.specify/feature.json`.
  The name most commonly refers to the GitHub spec-kit toolkit (not Spekit the
  sales-enablement product or PySpecKit the astronomy library).
---

# Spec Kit Skill

Guidance for **Spec-Driven Development (SDD)** with **Spec Kit** — an
open-source toolkit from GitHub that turns natural-language requirements into
executable specs and working implementations, using any AI coding agent.

Spec Kit "flips the script" on traditional development: specifications become
**executable**, directly generating working implementations rather than just
guiding them. It is a **process**, not a technology — it is stack-agnostic and
works across 30+ AI coding agent integrations.

> ⚠️ **Name ambiguity.** "Speckit" collides with unrelated projects: **Spekit**
> (a sales/revenue enablement platform) and **PySpecKit** (an astronomy spectral
> analysis toolkit). In an agent/coding context, "speckit" almost always refers
> to the **GitHub spec-kit** SDD toolkit (https://github.com/github/spec-kit,
> https://speckit.org). Confirm intent before assuming.

---

## 1. Core concept

Spec Kit drives a multi-step, agentic flow. Each step is a slash command that
produces or consumes a **Markdown artifact** in the feature directory:

| Command | Artifact produced | Purpose |
|---|---|---|
| `/speckit.constitution` | `constitution.md` | Governing principles every phase is evaluated against |
| `/speckit.specify` | `spec.md` | What/why — requirements & user stories (no tech stack) |
| `/speckit.clarify` | updates `spec.md` | Resolve ambiguities before planning |
| `/speckit.plan` | `plan.md` | Design + tech stack/architecture/constraints |
| `/speckit.checklist` | quality checklist | "Unit tests for your requirements" — spec completeness |
| `/speckit.tasks` | `tasks.md` | Dependency-ordered, phase-organized task list |
| `/speckit.analyze` | read-only report | Cross-artifact consistency/coverage across the three docs |
| `/speckit.implement` | working code | Executes tasks in dep order, respecting parallel markers |
| `/speckit.converge` | appended tasks | Checks TODO; appends gaps to `tasks.md` |

Two common orderings:

- **Short path** (small features): `specify → plan → tasks → implement → converge`
- **Full path** (production features, adds quality gates):
  `constitution → specify → clarify → plan → checklist → tasks → analyze → implement → converge`

Only `/speckit.specify` is strictly required before `/speckit.plan`. `clarify`,
`checklist`, and `analyze` are quality gates for anything with meaningful
ambiguity.

---

## 2. Installation & setup

Requires **[uv](https://docs.astral.sh/uv/)**, Python 3.11+, and Git. Install
the CLI from PyPI (or pin a release tag from the git repo):

```bash
uv tool install specify-cli                      # latest from PyPI
# or pin a release:  uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v0.12.11
```

Initialize a project (interactive agent pick, or pass `--integration <agent>`):

```bash
specify init my-project --integration copilot
cd my-project
```

Self-management / upgrade commands:

```bash
specify self check           # is a newer release available? (read-only)
specify self upgrade --dry-run
specify self upgrade         # in place, auto-detects uv tool vs pipx
specify self upgrade --tag vX.Y.Z   # pin a specific release
```

`specify integration list` shows all integrations your installed version knows.

> **Skills mode.** For integrations that support it, passing
> `--integration <agent> --integration-options="--skills"` installs **agent
> skills** (e.g. `speckit-specify`) instead of slash-command prompt files.

---

## 3. Invocation forms per agent

The canonical form is `/speckit.*`, but the exact prefix varies by agent:

| Agent | Form |
|---|---|
| Most agents (Copilot, Claude, IDE assistants) | `/speckit.specify` |
| Codex CLI, Command Code (skills mode) | `$speckit-specify` |
| Kimi | `/skill:speckit-specify` |

Substitute whichever form the agent exposes — the steps are identical. When a
repo is set up, look for the command/skill files to confirm the exact name.

---

## 4. The workflow in detail

### `/speckit.constitution`
Create or update the project's governing principles and development guidelines.
Pass them as arguments. Every later phase is evaluated against these principles.
Run once up front and update whenever principles change.

```
/speckit.constitution This project follows a "Library-First" approach. All features
must be implemented as standalone libraries first. We use TDD strictly. We prefer
functional programming.
```

### `/speckit.specify`
Create/update the feature spec from a natural-language description. Focus on the
**what** and **why** — user-facing behavior and goals. **Do not** mention the tech
stack here; that belongs in `/speckit.plan`.

```
/speckit.specify Build an app to organize photos into albums grouped by date,
re-orderable by drag-and-drop on the main page, with a tile preview in each album.
```

### `/speckit.clarify`
Asks up to five targeted questions about underspecified areas and folds answers
back into `spec.md`. Run as many times as needed before planning; optionally
pass a focus area. Prevents designing on top of ambiguity.

```
/speckit.clarify Focus on task card behavior: status changes, comment limits,
who can be assigned.
```

### `/speckit.plan`
Generate design artifacts from the spec. This is where **implementation detail**
belongs — provide tech stack, architecture, and constraints as arguments.

```
/speckit.plan Use .NET Aspire with Postgres. Frontend is Blazor Server with
drag-and-drop boards and real-time updates. Expose REST APIs for projects/tasks.
```

### `/speckit.checklist`
Generate a quality checklist — "unit tests for your requirements". It checks
whether the spec itself is complete, clear, unambiguous, and consistent (e.g.
"Are the drag-and-drop rules defined for every column?"). No args for a broad
pass, or pass a focus area. If it surfaces gaps, loop back to `clarify`/`specify`.

### `/speckit.tasks`
Generate an actionable, dependency-ordered `tasks.md` from the design artifacts.
Tasks are organized into phases: **Setup**, **Foundational** (blocking
prerequisites), then **one phase per user story** in priority order, and a final
**Polish** phase. Tests are generated inside a story's phase when requested (not
a separate phase); parallel-executable tasks are marked.

```
/speckit.tasks
```

### `/speckit.analyze`
**Read-only** cross-artifact consistency/quality analysis across `spec.md`,
`plan.md`, and `tasks.md`. Reports conflicts, gaps, and ambiguities (e.g. a task
with no matching requirement). **Never edits files.** Run before implementing
while artifacts are cheap to change. If it flags issues, fix at the **source**
step (`specify`/`clarify` for requirements, `plan` for design, `tasks` to
regenerate) and re-run until clean. You can also run it after implementation as
a review.

### `/speckit.implement`
Execute tasks in `tasks.md`, running phases in dependency order and honoring
parallel markers.

Small feature — run once:
```
/speckit.implement
```

Large feature — stage runs to avoid overwhelming agent context, verifying each
stage before continuing:
```
/speckit.implement Implement only the Setup and Foundational phases: project
scaffolding and the project/task data model with basic CRUD. Stop before
user-story features.
```

### `/speckit.converge`
Assess the codebase against spec/plan/tasks to confirm nothing was missed.
**Append-only** — never edits or deletes code; its only possible write is adding
tasks to `tasks.md`. Run only after `/speckit.implement` on the current
`tasks.md`. Outcomes:

- **Converged** — no gaps. `tasks.md` left byte-for-byte unchanged.
  `✅ Converged — the implementation satisfies the spec, plan, and tasks.`
  Done; proceed to review / open a PR.
- **Tasks appended** — gaps found, appended under a Convergence section. Re-run
  `/speckit.implement`, then `/speckit.converge` again. Repeat until converged.

---

## 5. Feature state & directory layout

Spec Kit tracks the active feature by the **feature directory recorded in
`.specify/feature.json`** (overridable with the `SPECIFY_FEATURE_DIRECTORY`
environment variable). Commands resolve the feature from that state, **not** the
checked-out Git branch — no Git required.

The opt-in **git** extension adds numbered feature branches (e.g.
`001-feature-name`) for organizing work in VCS, but the active feature is still
whichever directory the state points to; `git checkout` alone does **not**
change the active feature. To point commands at a different feature, update
`.specify/feature.json` or set `SPECIFY_FEATURE_DIRECTORY`.

---

## 6. Customization: extensions, presets, bundles, overrides

Spec Kit is endlessly extensible. Components resolve at runtime by walking a
priority stack top-down (project > user > built-in), first match wins:

| Priority | Component | Location |
|---:|---|---|
| 1 | Project-Local Overrides | `.specify/templates/overrides/` |
| 2 | Presets | `.specify/presets/templates/` |
| 3 | Extensions | `.specify/extensions/templates/` |
| 4 | Spec Kit Core | `.specify/templates/` |

- **Extension** — adds a **new capability**/command/workflow (e.g. Jira
  integration, post-impl code review, health diagnostics).
  `specify extension search` → `specify extension add <name>`
- **Preset** — changes **how** existing workflows produce artifacts (spec
  format, terminology, compliance traceability, security gates, localize to a
  language). `specify preset search` → `specify preset add <name>`
- **Bundle** — packages extensions + presets into a role-based setup (PM,
  analyst, security researcher, developer) installable in one command.
  `specify bundle install <id>`; author with `specify bundle build --path ./x`.

| Goal | Use |
|---|---|
| Add a brand-new command/workflow | Extension |
| Customize the format of specs/plans/tasks | Preset |
| Integrate an external tool/service | Extension |
| Enforce organizational/regulatory standards | Preset |
| Provision a complete role-based setup | Bundle |

---

## 7. Working conventions

- **Be explicit** about what you're building and **why**.
- **Don't focus on the tech stack** during the specification phase.
- **Iterate and refine** specs before implementation — clarify and checklist are
  cheap; rework after coding is not.
- **Validate** requirements and plans before coding begins (analyze is read-only
  and safe to run often).
- **Let the agent handle implementation details** — tasks describe what to do and
  in what order, not every line.
- **Fix issues at the source step**, not downstream: requirements → `/speckit.
  specify`/`clarify`; design → `/speckit.plan`; task structure → `/speckit.
  tasks`; then re-run `/speckit.analyze`.

---

## 8. References & resources

- Official docs: https://github.github.io/spec-kit/
- Quick Start: https://github.github.io/spec-kit/quickstart.html
- Agentic SDD reference (full command semantics): https://github.github.io/spec-kit/reference/agentic-sdd.html
- Integrations guide: https://github.github.io/spec-kit/reference/integrations.html
- CLI reference: https://github.github.io/spec-kit/reference/overview.html
- Repo: https://github.com/github/spec-kit
- Site: https://speckit.org/

See `references/quickstart.md` and `references/agentic-sdd.md` in this skill for
condensed copies of the official guides.
