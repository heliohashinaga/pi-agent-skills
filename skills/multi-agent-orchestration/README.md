# Multi-Agent Orchestration

Current recipes for **pi-subagents 0.42.1**.

## Quick start

1. Run `orchestration_advisor_advise` and respect its parallelism limit.
2. Keep one writer per cwd; use managed worktrees for parallel writers.
3. Use a direct `{ agent, task }` call for one isolated child.
4. Use `workflowScript` with `runs.run(key, params)` and `runs.all(items)` for
   every coordinated sequence/fan-out.
5. Use explicit acceptance and fresh read-only reviewers.

```ts
subagent({
  async: true,
  context: "fresh",
  workflowScript: `
    const scan = await runs.run("scan", {
      agent: "scout",
      task: "Map the target and validation seam. Do not edit files."
    });
    const implementation = await runs.run("implementation", {
      agent: "worker",
      task: "Implement from this context as sole writer in the workflow cwd; commit before finishing:\n" + scan.output,
      acceptance: {
        level: "checked",
        evidence: ["changed-files", "commands-run", "validation-output", "residual-risks"]
      }
    });
    return (await runs.run("review", {
      agent: "reviewer",
      task: "Review the implementation. Do not edit files:\n" + implementation.output
    })).output;
  `
});
```

## Files

- `SKILL.md` — authoritative rules and API contracts
- `REFERENCE.md` — copy-paste patterns
- `ORCHESTRATION-BRIDGE.md` — resource-aware orchestration
- `TROUBLESHOOTING.md` — failure diagnosis
- `COMPARISON-WITH-ADAPTIVE.md` — orchestration-advisor relationship
- `templates/` — JSON-valid acceptance and workflow examples

Legacy top-level `chain`/`tasks` inputs are intentionally absent. `worktree:
false` is not isolation. Sequential reviewers validate the same workflow cwd;
when an isolated writer worktree is used, apply or merge its durable handoff
before launching validators.
