# Agentic SDD (condensed from official reference)

The `/speckit.*` commands drive the Spec-Driven Development process. They run in
order, but only `/speckit.specify` is strictly required before `/speckit.plan`.
`clarify`, `checklist`, and `analyze` are optional quality gates for anything
with meaningful ambiguity.

Pipeline:
```
/speckit.constitution -> /speckit.specify -> /speckit.clarify -> /speckit.plan
-> /speckit.checklist -> /speckit.tasks -> /speckit.analyze -> /speckit.implement
-> /speckit.converge
```

## `/speckit.constitution`
Creates or updates the project constitution — the guiding principles every later
phase is evaluated against — and keeps dependent templates in sync. Run once up
front; update when principles change. Pass principles as arguments.

## `/speckit.specify`
Creates/updates the feature spec from natural language. Focus on what & why, not
the tech stack (that belongs in plan).

## `/speckit.clarify`
Asks up to five targeted questions about underspecified areas, encoding answers
back into `spec.md`. Run as many times as needed before planning; optional focus
area argument. If `/speckit.analyze` later surfaces requirement gaps, come back
here or to `/speckit.specify`.

## `/speckit.plan`
Generates design artifacts from the spec. Implementation detail belongs here —
provide tech stack and constraints as arguments.

## `/speckit.checklist`
Generates a quality checklist — "unit tests for your requirements." Checks the
spec is complete, clear, unambiguous, consistent (e.g. drag-and-drop rules for
every column, behavior for a deleted assigned user). No-arg for broad pass, or
pass a focus area. Gaps → loop back to clarify/specify.

## `/speckit.tasks`
Generates dependency-ordered `tasks.md` from design artifacts. Phases: **Setup**,
**Foundational** (blocking prerequisites), then **one phase per user story** in
priority order, final **Polish** phase for cross-cutting concerns. Tests are
generated within a story's phase when requested (not a separate phase). Tasks are
marked for parallel execution where possible.

## `/speckit.analyze`
**Read-only** cross-artifact consistency & quality analysis across `spec.md`,
`plan.md`, `tasks.md`. Reports conflicts, gaps, ambiguities (e.g. task with no
matching requirement; plan choice contradicting the spec). Never edits files;
can optionally suggest remediations for approval. Run before implementing. If
issues: fix at the source step (specify/clarify for requirements, plan for
design, tasks to regenerate), re-run until clean. Can be run again after
implementation for extra review.

## `/speckit.implement`
Executes tasks in `tasks.md`, running phases in dependency order, respecting
parallel markers. Run once for small features; for large features scope each run
with an argument, verify, then continue.

## `/speckit.converge`
Assesses codebase against spec/plan/tasks to confirm nothing was missed.
**Append-only**: never edits/deletes code; only possible write is adding tasks to
`tasks.md`. Run only after `/speckit.implement` on current `tasks.md`.

Outcomes:
- **Converged** — no gaps; `tasks.md` unchanged. Done → review / open a PR.
- **Tasks appended** — gaps appended under a Convergence section. Run implement
  again, then converge again. Repeat until converged.
