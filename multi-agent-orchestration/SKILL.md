---
name: multi-agent-orchestration
description: |
  Playbook for orchestrating pi-subagents safely: async-default execution,
  single-writer worktrees, explicit acceptance contracts, decision-rule
  prompting, commit-in-worktree persistence, and planner→writer→validator
  chains. Use when delegating parallel work, running a chain of agents,
  fanning out reviewers, or planning the next task slice from a spec/tasks
  file. Pairs with adaptive-orchestration for tier-aware delegation.
  Triggers: "delegar workers", "orquestrar agentes", "paralelo",
  "chain de implementação", "planear próxima task", "fan-out de review",
  "worktree por slice", "subagent em paralelo", "executar plano multi-agent".
---

# Multi-Agent Orchestration: Complete Playbook

**Start here**: [README.md](README.md) (5 min quick start) → [REFERENCE.md](REFERENCE.md) (pattern lookup)

This document is the **authoritative reference** for multi-agent orchestration rules and patterns.
Every rule below exists because a specific execution broke without it. Follow them when you
delegate; deviate only with a stated reason.

## The five non-negotiable rules

1. **Async by default.** Always pass `async: true` unless you have a specific
   reason to block. Foreground runs discard worktrees on completion and
   surface control events too late. Async persists the worktree and
   `events.jsonl`, lets you inspect with `subagent({ action: "status", id })`,
   and lets you merge BEFORE any cleanup.

2. **One writer per worktree.** Parallel fan-out is safe for read-only roles
   (scout, reviewer, context-builder, researcher, planner, validator). For
   writers, either isolate each in its own `worktree: true` AND merge
   deliberately, or keep a single writer on the active worktree with
   reviewers fanning out read-only around it. Never have several writers in
   the same dirty worktree.

3. **Explicit acceptance, never inferred.** When you omit `acceptance`, the
   runtime infers a policy from role/mode/risk — and worker defaults include
   evidence gates (e.g. `tests-added`) that reject green builds on tasks that
   never asked for tests. Always pass an explicit contract enumerating ONLY
   the evidence that matters. Don't list `tests-added` for tasks that don't
   add tests. For trivial tasks you validate by hand, use `level: "attested"`
   or `"none"` instead of `"checked"`.

4. **Bake decision rules into the prompt; don't escalate the predictable.**
   Foreseeable judgment calls (circular-dependency resolution, DTO layer
   placement, naming, mock-vs-real) belong in the task prompt as rules, not
   as `contact_supervisor` escalations. Supervisor round-trips add latency and
   the child often times out before a reply lands. Reserve escalation for
   genuinely unapproved product/scope/architecture decisions.

5. **Subagent must get its work back into the repo.** A parallel run only pays
   off if the work survives to be merged. Two guarantees: (a) use async so the
   worktree persists; (b) instruct the worker to `git add -A && git commit`
   on its own branch before finishing, so even a later worktree removal leaves
   the work recoverable via cherry-pick/merge. If neither holds, implement
   directly — orchestration overhead without durable output is net-negative.

## When subagent orchestration does NOT pay

For tight-coupled slices of ≤4 tasks landing in one commit, the overhead of
spawning + merging can exceed the value. Subagent earns its cost when:
- there are ≥3 tasks with disjoint, independent files, OR
- adversarial fresh-context review adds genuine value (reviewers/validators),
  OR
- a chain has real stage dependencies the async chain machinery handles for
  you.

Otherwise: implement directly, use read-only subagents only for context
gathering or review.

## Acceptance contract template

Always pass something like this (adapt criteria to the real task). Trim
`evidence` to what actually matters.

```json
"acceptance": {
  "level": "checked",
  "criteria": [
    {
      "id": "build",
      "must": "dotnet build succeeds with 0 errors",
      "severity": "required",
      "evidence": ["commands-run", "validation-output"]
    }
  ],
  "verify": [
    { "id": "build", "command": "dotnet build", "timeoutMs": 180000 }
  ]
}
```

Use `level: "reviewed"` ONLY when an independent reviewer gate returns a
result — a worker self-reporting done is NOT a reviewed gate.

## Preferred chain shape: planner → writer → validator (async)

For a feature slice, prefer one async chain over manual waves:

```
chain (async: true):
  1. PARALLEL [read-only] reviewers/planners  — write first-failing tests
     and/or implementation plans; outputMode: "file-only"; acceptance:
     { level: "reviewed" }
  2. writer (SOLE writer on the active worktree) — implement following the
     plans/tests; decision rules baked in; instructed to commit on its
     branch; acceptance: { level: "checked", criteria:[build+tests] }
  3. PARALLEL [read-only] validators (fresh-context) — inspect the diff;
     acceptance: { level: "reviewed" }
  4. parent synthesizes accepted fixes, merges
```

Use `{previous}`, `{outputs.name}`, `as:` to thread results between steps.
`outputMode: "file-only"` for any summary that would bloat context.

## Decision-rule prompting (avoid escalations)

Instead of leaving a judgment call open, state the rule and the fallback:

> "If a circular dependency arises between Core and Providers, place the DTO
> in Core (namespace `YourProject.Core.Registry`) — Core cannot
> depend on Providers. Do not escalate; document the choice in a `<remarks>`
> doc tag and proceed."

Tell the worker the preference architecture, the cache-key format, the mock
shape, the naming convention — whatever is foreseeable. Reserve
`contact_supervisor` for: unapproved product scope, a real ambiguity the
user must resolve, or a blocker the worker cannot unblock with stated rules.

## Pitfalls logged on this machine (case studies)

- **Foreground parallel wave → worktrees discarded.** 3 workers built green
  in isolated worktrees; on foreground completion the worktrees were cleaned
  before merge. Output artifacts held only prose summaries, not code. Fix:
  async + commit-in-worktree instruction.
- **Inferred acceptance → false "failed".** Three green builds reported as
  failed because the inferred worker policy required `tests-added` evidence
  on tasks that never asked for tests. Fix: explicit `acceptance` with only
  the relevant criteria.
- **Supervisor escalation arrived post-facto.** A worker hit a circular-dep
  conflict and escalated; the parent saw the message ~23 min later, after
  the child's internal timeout expired. Fix: bake the dep-direction rule into
  the prompt so escalation never happens.

## Project-level invariants belong in AGENTS.md, not here

Keep this skill generic. Project specifics (which build command, which spec
file is the source of truth, per-slice worktree naming) live in the repo's
`AGENTS.md` as short rules. This skill references "the project's build
command" abstractly; the AGENTS.md supplies the concrete `dotnet build` /
`dotnet test` / etc.

---

## Integration with Adaptive Orchestration

This skill **pairs with** adaptive-orchestration for complete resource-aware delegation:

- **Multi-Agent Orchestration**: How to structure chains, worktrees, acceptance contracts
- **Adaptive Orchestration**: What resources are available, which tier to use

**→ See ORCHESTRATION-BRIDGE.md for combined workflow**

---

## Navigation

- **README.md** — Quick start & decision tree (3 min)
- **REFERENCE.md** — Pattern lookup & tier constraints (5 min)
- **ORCHESTRATION-BRIDGE.md** — Integration with adaptive-orchestration
- **This file** — Complete rules, case studies, decision-rule templates