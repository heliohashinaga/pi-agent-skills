# Resource-Aware Orchestration

`orchestration-advisor` decides **how much concurrency is safe**. This skill
decides **how work is structured**.

1. Call `orchestration_advisor_advise` before coordinated delegation.
2. Apply `recommended_parallelism` to read-only fan-out.
3. Keep writers sequential unless each writer has `worktree: true`.
4. Reduce test fan-out under memory/swap pressure; do not weaken required final
   validation solely to make orchestration fit.

## Single tier

Use sequential `runs.run` calls in one `workflowScript`. A Git worktree is disk
isolation, not the primary RAM cost; use it when write isolation/recovery is
needed, but only one child should run at a time.

## Semi/full tiers

Parallelize scouts/reviewers with `runs.all`. For intentional parallel writers,
set `worktree: true` on every writer and plan explicit integration.

```ts
subagent({
  async: true,
  workflowScript: `
    const reviews = await runs.all([
      { key: "architecture", agent: "reviewer", task: "Review architecture. Do not edit." },
      { key: "validation", agent: "reviewer", task: "Review validation. Do not edit." }
    ]);
    return reviews.map(({ key, output }) => ({ key, output }));
  `
});
```

Never infer that `worktree: false` creates a temporary checkout: it does not.
