# Orchestration Advisor vs Multi-Agent Orchestration

The former `adaptive-orchestration` name is obsolete on this installation.
Use these two components:

| Component | Responsibility |
|---|---|
| `orchestration-advisor` | Detect CPU, memory, swap and recommend strategy/parallelism |
| `multi-agent-orchestration` | Choose workflowScript structure, ownership, acceptance and review gates |

## Combined flow

1. Call `orchestration_advisor_advise`.
2. Decide whether delegation is worth its overhead.
3. For one child, use a direct `{ agent, task }` run.
4. For coordinated work, use `workflowScript`.
5. Apply the advisor's concurrency limit to `runs.all` fan-out.
6. Keep one writer per cwd or isolate every parallel writer with managed
   worktrees.
7. Validate, run fresh review, then integrate deliberately.

Resource tiering never changes authority rules: destructive cleanup and
unapproved product/architecture/security decisions still require escalation.
