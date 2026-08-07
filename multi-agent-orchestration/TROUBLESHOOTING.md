# Troubleshooting Multi-Agent Orchestration

## Workflow input rejected

- Coordinated runs must use top-level `workflowScript`.
- Inside it, call `await runs.run("stable-key", params)` or
  `await runs.all([{ key: "lane", ... }])`.
- Do not pass legacy top-level `chain` or `tasks` fields.

## Acceptance rejected

- `none` requires `{ level: "none", reason: "..." }`.
- `verified` requires object form and at least one `verify` command.
- Do not request `reviewed`; configure `review.required` and run an independent
  reviewer.
- Use supported evidence names such as `changed-files`, `commands-run`,
  `validation-output`, `residual-risks`, and `review-findings`.

## Worktree conflicts or lost work

- `worktree: false` is not isolation.
- Keep one writer per cwd.
- A managed-worktree writer should commit before finishing.
- Recover through the reported handoff/branch; never force-delete unknown work.

## Run needs inspection or cancellation

Management calls are made through the parent tool, not `runs.run`:

```ts
subagent({ action: "status", id: "run-id" });
subagent({ action: "stop", id: "run-id" });
```

For live guidance, use `steer`; use `resume` for paused/completed runs according
to the pi-subagents control contract.

## Resource pressure

Run `orchestration_advisor_advise`, reduce parallelism, and prefer sequential
read/review lanes. Do not solve OOM by launching multiple writers without
worktrees or by silently skipping required validation.

## Supervisor latency

Bake predictable engineering decision rules into the task. Escalate only
unapproved product, architecture, security, or destructive-operation choices.
