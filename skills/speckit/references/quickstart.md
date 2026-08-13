# Quick Start (condensed from official Spec Kit quickstart)

End-to-end workflow using the running example **Taskify**, a small team
productivity platform. Two common paths exist.

## Shorter path (small features)
1. `/speckit.specify`
2. `/speckit.plan`
3. `/speckit.tasks`
4. `/speckit.implement`
5. `/speckit.converge`

## Full path (production features — adds quality gates)
1. `/speckit.constitution`
2. `/speckit.specify`
3. `/speckit.clarify`
4. `/speckit.plan`
5. `/speckit.checklist`
6. `/speckit.tasks`
7. `/speckit.analyze`
8. `/speckit.implement`
9. `/speckit.converge`

## Install & init

```bash
uv tool install specify-cli
specify init taskify   # or: specify init .   to use the current directory
```

`init` picks the coding agent interactively, or pass `--integration` explicitly
(e.g. `--integration copilot`).

## Steps (with Taskify examples)

**Step 1 — `/speckit.constitution`** — set the ground rules.
```
/speckit.constitution Taskify is a "Security-First" application. All user inputs
must be validated. We use a microservices architecture. Code must be fully documented.
```

**Step 2 — `/speckit.specify`** — describe what to build (what/why, not the stack).
```
/speckit.specify Develop Taskify, a team productivity platform where predefined
users create projects, assign tasks, comment, and move tasks across Kanban
columns (To Do, In Progress, In Review, Done). Five users (one PM, four
engineers), three sample projects, no login for this first phase.
```

**Step 3 — `/speckit.clarify`** — resolve ambiguities before planning.
```
/speckit.clarify Focus on task card behavior — status changes, comment
permissions, and user assignment.
```

**Step 4 — `/speckit.plan`** — choose the tech stack / architecture.
```
/speckit.plan Use .NET Aspire with Postgres. The frontend is Blazor Server with
drag-and-drop boards and real-time updates. Expose REST APIs for projects, tasks,
and notifications.
```

**Step 5 — `/speckit.checklist`** — validate the spec ("unit tests for your
requirements").
```
/speckit.checklist
```

**Step 6 — `/speckit.tasks`** — break the work into a dependency-ordered task list.
```
/speckit.tasks
```

**Step 7 — `/speckit.analyze`** — check consistency across spec/plan/tasks
(read-only). Fix at the source and re-run before implementing.
```
/speckit.analyze
```

**Step 8 — `/speckit.implement`** — execute tasks in dependency order.
```
/speckit.implement
```

**Step 9 — `/speckit.converge`** — verify completeness. If gaps, it appends
tasks to `tasks.md`; run implement + converge until it reports converged.
```
/speckit.converge
```

## Key principles
- Be explicit about what and why.
- Don't focus on the tech stack during specification.
- Iterate and refine before implementation.
- Validate requirements and plans before coding.
- Let the coding agent handle implementation details.

## Notes
- Automation scripts ship as Bash (`.sh`), PowerShell (`.ps1`), and Python
  (`.py`) variants; pass `--script sh|ps|py` to choose explicitly.
- Commands may be `/speckit.*`, `$speckit-*` (Codex, Command Code skills mode),
  or `/skill:speckit-*` (Kimi), depending on the agent.
- Feature tracking: active feature comes from `.specify/feature.json` (or env
  `SPECIFY_FEATURE_DIRECTORY`), not the Git branch.
