# Quick Reference: Multi-Agent Orchestration

## At a Glance

### The 5 Rules

| # | Rule | What It Means |
|---|------|---------------|
| 1 | **Async by default** | Always `async: true` (keeps worktrees) |
| 2 | **One writer per worktree** | Read-only roles can fan out; writers must isolate |
| 3 | **Explicit acceptance** | Never omit `acceptance` contract |
| 4 | **Bake decision rules** | Tell worker the rules, don't escalate |
| 5 | **Commit in worktree** | Worker must `git commit` before finishing |

### When to Orchestrate (Checklist)

- [ ] **Option A**: ≥3 independent tasks? → YES, use orchestration
- [ ] **Option B**: Need fresh-context review? → YES, use orchestration
- [ ] **Option C**: Real multi-stage dependencies? → YES, use orchestration
- [ ] **All NO?** → ≤4 tasks, same file → Skip orchestration (faster)

### Acceptance Levels

```
level: "none"       → No validation (rare, documented exception only)
level: "attested"   → I verified it manually (good for quick tasks)
level: "checked"    → Run automated checks (build, unit tests, lint)
level: "reviewed"   → Independent reviewer gate returns a result
```

**Rule**: Use `"reviewed"` ONLY for fresh-context validators. A worker self-reporting "done" is NOT a reviewed gate.

---

## Pattern Lookup

### Pattern 1: Sequential Stages

**When**: Task 2 depends on Task 1's output

```javascript
subagent({
  chain: [
    { agent: 'a', task: 'Task 1' },
    { agent: 'b', task: 'Task 2 uses {previous}' }
  ],
  async: true
});
```

---

### Pattern 2: Planner → Writer → Validator

**When**: You want architecture review before coding + correctness review after

```javascript
subagent({
  chain: [
    // 1. Planners (parallel, read-only)
    { parallel: [
      { agent: 'reviewer', task: 'Design proposal...' },
      { agent: 'reviewer', task: 'Test outline...' }
    ] },
    
    // 2. Writer (sole writer)
    { agent: 'writer', 
      task: 'Implement using review feedback: {previous}' 
    },
    
    // 3. Validators (parallel, fresh-context, read-only)
    { parallel: [
      { agent: 'validator', task: 'Check correctness...' },
      { agent: 'validator', task: 'Check performance...' }
    ] }
  ],
  async: true,
  worktree: true
});
```

---

### Pattern 3: Parallel Independent Tasks

**When**: Tasks are in disjoint files, no dependencies

```javascript
subagent({
  tasks: [
    { agent: 'w', task: 'ModuleA (src/a)' },
    { agent: 'w', task: 'ModuleB (src/b)' },
    { agent: 'w', task: 'Tests (tests/)' }
  ],
  concurrency: 3,
  async: true,
  worktree: false  // Safe: separate directories
});
```

---

### Pattern 4: Scout + Worker (Semi-Parallel)

**When**: One agent analyzes, another implements

```javascript
subagent({
  tasks: [
    { agent: 'scout', task: 'Scan codebase for circular deps...' },
    { agent: 'worker', task: 'Fix issues (use scout output)' }
  ],
  concurrency: 2,
  async: true,
  worktree: true  // Scout is read-only; worker is sole writer
});
```

---

## Acceptance Contract Quick-Build

### For Docs-Only Tasks

```json
{
  "level": "attested",
  "criteria": []
}
```

### For Code + Unit Tests

```json
{
  "level": "checked",
  "criteria": [
    {
      "id": "build",
      "must": "Build succeeds",
      "severity": "required",
      "evidence": ["commands-run"]
    },
    {
      "id": "unit-tests",
      "must": "Unit tests pass",
      "evidence": ["test-output"],
      "command": "npm test -- --testPathIgnorePatterns=integration"
    }
  ]
}
```

### For Full Build + All Tests

```json
{
  "level": "checked",
  "criteria": [
    {
      "id": "build",
      "must": "Full build succeeds",
      "evidence": ["commands-run"],
      "command": "dotnet build"
    },
    {
      "id": "unit-tests",
      "must": "Unit tests pass",
      "evidence": ["test-output"],
      "command": "dotnet test --filter=Category!=Integration"
    },
    {
      "id": "integration-tests",
      "must": "Integration tests pass",
      "evidence": ["test-output"],
      "command": "dotnet test --filter=Category=Integration"
    }
  ]
}
```

### For Reviewer Gate

```json
{
  "level": "reviewed",
  "criteria": [
    {
      "id": "code-review",
      "must": "Independent reviewer approves diff",
      "severity": "required"
    }
  ]
}
```

---

## Decision-Rule Prompting Template

Don't leave judgment calls to the worker. Bake rules in:

```javascript
task: `
  Implement the transaction validator.

  DECISION RULES:
  - If conflict between Core and Provider: place DTO in Core
  - DTO namespace: Helio.Core.Registry
  - Mock format: { id, type, status }
  - Cache key format: "txn:{id}:{timestamp}"
  
  Do NOT escalate these choices. Document in <remarks> XML and proceed.
`,
```

---

## Common Mistakes

| Mistake | Result | Fix |
|---------|--------|-----|
| `async: false` | Worktrees discarded before merge | Always use `async: true` |
| Omit `acceptance` | Inferred policy rejects green build | Always pass explicit `acceptance` |
| Multiple writers in worktree | File conflicts, merge chaos | One writer per worktree |
| Escalate predictable choices | Supervisor reply arrives after timeout | Bake decision rules in prompt |
| Worker doesn't commit | Work lost when worktree cleaned | Instruct: `git add -A && git commit` |

---

## Troubleshooting Flowchart

```
Chain failed?
│
├─ Worker timed out?
│  └─ Check: Too many parallel tasks? → Reduce concurrency
│  └─ Check: Heavy tests in acceptance? → Run only unit tests
│  └─ Check: Task scope too large? → Split into smaller tasks
│
├─ Build reported as failed?
│  └─ It was green but rejected? → Check acceptance level
│  └─ Green in worker but failed in validator? → Fresh-context issue
│
├─ Worktree gone before merge?
│  └─ Did you use async: false? → Use async: true
│
├─ Supervisor escalation too late?
│  └─ Check: Did you bake decision rules? → Add to task prompt
│
└─ → See TROUBLESHOOTING.md for full guide
```

---

## Tier Constraints (from Adaptive Orchestration)

**Tie to your system tier** (run `./scripts/detect-orchestration-tier.sh`):

| Tier | Max Concurrency | Worktrees? | Acceptance Level | Max Tests |
|------|-----------------|-----------|------------------|-----------|
| single (< 4GB) | 1 | ❌ NO | `attested` | None |
| semi (4-8GB) | 2 | ⚠️ Light | `attested` + unit | Unit only |
| full (8+ GB) | N | ✅ YES | `checked` | All |

**→ See ORCHESTRATION-BRIDGE.md for full integration**

---

## Related Docs

- **SKILL.md** — Full rules, case studies, architecture
- **README.md** — Getting started (5 min read)
- **ORCHESTRATION-BRIDGE.md** — Combine with adaptive-orchestration
- **TROUBLESHOOTING.md** — Error diagnosis & fixes
