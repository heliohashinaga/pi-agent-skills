# Multi-Agent Orchestration Reference

## Choose the surface

| Need | Surface |
|---|---|
| One independent child | `subagent({ agent, task, async: true })` |
| Sequence or fan-out | `subagent({ workflowScript, async: true })` |
| One child inside script | `await runs.run(key, params)` |
| Parallel children inside script | `await runs.all([{ key, ... }, ...])` |
| Inspect/stop a run | `subagent({ action: "status" | "stop", id })` |

## Sequential workflow

```ts
subagent({
  async: true,
  workflowScript: `
    const context = await runs.run("context", {
      agent: "scout",
      task: "Inspect the target. Do not edit files."
    });
    return (await runs.run("implementation", {
      agent: "worker",
      task: "Implement from:\n" + context.output,
      acceptance: { level: "checked", evidence: ["changed-files", "commands-run", "validation-output"] }
    })).output;
  `
});
```

## Parallel read-only review

```ts
subagent({
  async: true,
  context: "fresh",
  workflowScript: `
    const reviews = await runs.all([
      { key: "correctness", agent: "reviewer", task: "Review correctness. Do not edit." },
      { key: "tests", agent: "reviewer", task: "Review tests. Do not edit." }
    ]);
    return reviews.map(({ key, output }) => ({ key, output }));
  `
});
```

## Acceptance examples

Attested:

```json
{ "level": "attested", "evidence": ["manual-notes", "residual-risks"] }
```

Checked evidence:

```json
{
  "level": "checked",
  "evidence": ["changed-files", "commands-run", "validation-output", "residual-risks"]
}
```

Runtime verification:

```json
{
  "level": "verified",
  "verify": [{ "id": "tests", "command": "npm test", "timeoutMs": 300000 }]
}
```

Disable only with reason:

```json
{ "level": "none", "reason": "Read-only exploratory lookup; no delivery gate applies." }
```

Independent review is not an acceptance level:

```json
{
  "level": "checked",
  "review": { "required": true, "agent": "reviewer", "focus": "Correctness and regressions" }
}
```

## Safety table

| Situation | Rule |
|---|---|
| Parallel read-only agents | Safe within advisor limit |
| Parallel writers, same cwd | Forbidden |
| Parallel writers, isolated worktrees | Allowed with deliberate integration |
| `worktree: false` | Shared/supplied cwd; no isolation |
| Unapproved product/architecture choice | Escalate to parent/user |
| Destructive cleanup | Require explicit authority and recovery evidence |
