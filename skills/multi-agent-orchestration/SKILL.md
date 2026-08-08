---
name: multi-agent-orchestration
description: |
  Safe orchestration patterns for pi-subagents 0.42.1: workflowScript, async runs,
  one writer per cwd/worktree, explicit acceptance, and fresh-context review.
  Use for delegated implementation, staged workflows, or review fan-out.
---

# Multi-Agent Orchestration

This skill targets **pi-subagents 0.42.1**. `workflowScript` is the only public
multi-run surface. Do not use legacy top-level `chain` or `tasks` inputs.

Before delegation, run `orchestration_advisor_advise`. Respect its concurrency
recommendation; low-memory systems should run children sequentially.

## Non-negotiable rules

1. **One writer per cwd.** Parallelize read-only analysis/review. Isolate each
   parallel writer with `worktree: true` and integrate deliberately.
2. **Async by default.** Set top-level `async: true` unless the current turn
   explicitly needs a small foreground result.
3. **Durable writes.** A worktree writer commits before finishing. Preserve its
   handoff/branch until integration.
4. **Explicit scope and validation.** Prompts name goal, evidence, constraints,
   validation, output, and stop rules.
5. **Parent owns decisions.** Children escalate unapproved product, architecture,
   security, or destructive-operation decisions.
6. **Fresh review.** Reviewers inspect the real diff from `context: "fresh"` and
   remain read-only.

## Execution APIs

Use a direct single run only when no sibling/dependency/aggregation exists:

```ts
subagent({
  agent: "reviewer",
  task: "Review the current diff. Do not edit files.",
  context: "fresh",
  async: true,
  mission: false
});
```

Use `workflowScript` for sequence and fan-out:

```ts
subagent({
  async: true,
  context: "fresh",
  workflowScript: `
    const plan = await runs.run("plan", {
      agent: "planner",
      task: "Produce an implementation plan. Do not edit files."
    });
    const implementation = await runs.run("implementation", {
      agent: "worker",
      task: "Implement this approved plan as sole writer in the workflow cwd; commit before finishing:\n" + plan.output,
      acceptance: {
        level: "checked",
        evidence: ["changed-files", "commands-run", "validation-output", "residual-risks"]
      }
    });
    const reviews = await runs.all([
      { key: "correctness", agent: "reviewer", task: "Review correctness:\n" + implementation.output },
      { key: "tests", agent: "reviewer", task: "Review validation quality:\n" + implementation.output }
    ]);
    return reviews.map(({ key, output }) => ({ key, output }));
  `
});
```

`runs.run(key, params)` launches one child and returns its result. `runs.all`
accepts an array of items, each with a stable `key`. Use ordinary JavaScript for
branching/retries. Management remains outside scripts:

```ts
subagent({ action: "status", id: "run-id" });
subagent({ action: "stop", id: "run-id" });
```

## Acceptance

Supported levels are `auto`, `none`, `attested`, `checked`, and `verified`.

- Strings `"attested"` and `"checked"` are valid, but object form is clearer.
- `none` requires `{ level: "none", reason: "..." }`.
- `verified` requires object form with at least one `verify` command.
- Never request `reviewed`; independent review is separate. Use
  `review: { required: true, agent: "reviewer" }` and actually run that reviewer.
- `checked` collects evidence; it does not itself execute commands. Use
  `verified` when runtime command execution is required.

Supported evidence includes `changed-files`, `tests-added`, `commands-run`,
`validation-output`, `residual-risks`, `no-staged-files`, `diff-summary`,
`review-findings`, and `manual-notes`.

## Worktrees

`worktree: true` creates a managed Git worktree. `worktree: false` means the
child uses the supplied/shared cwd and provides **no isolation**. Never run
parallel writers with `worktree: false` in the same cwd. In a sequential
writer→reviewer workflow, keep the sole writer and later validators in the same
workflow cwd so validators inspect the actual final tree; the parent must not
edit that cwd while the async writer runs. Use isolated writer worktrees only
when the parent will explicitly apply/merge the handoff before validation.

## Stop conditions

Stop and ask the user when a required product/architecture/security decision is
unapproved, cleanup could destroy unrecovered work, or reviewers disagree on a
scope-changing fix. Do not loop for optional polish.

See `REFERENCE.md` for recipes and `TROUBLESHOOTING.md` for diagnosis.
