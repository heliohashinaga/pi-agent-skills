# Troubleshooting Multi-Agent Orchestration

Common issues, diagnosis, and fixes indexed by error and tier.

---

## Issue 1: "Worker timed out at 95% memory"

### Symptoms
- Worker process killed with OOM error
- Happens consistently after ~5-10 minutes
- No build output, tests didn't run

### Diagnosis

First, check your tier:
```bash
./scripts/detect-orchestration-tier.sh
```

### Root Causes by Tier

#### TIER=single (< 4 GB RAM)
This should rarely happen on single tier (sequential execution).

**Possible causes**:
- Heavy process running in background (VS Code, browser)
- Task scope too large (e.g., full integration test suite)
- Memory leak in worker implementation

**Fixes**:
```bash
# 1. Kill background processes
pkill -f "code-server"   # VS Code
pkill -f "Roslyn"        # .NET analyzer
pkill -f "node"          # Node processes

# 2. Run pre-delegation check
./scripts/pre-delegation-check.sh

# 3. Check available memory
free -h

# 4. Reduce task scope
# Change acceptance level to "attested" (no tests)
# Or split task into smaller pieces
```

#### TIER=semi (4-8 GB RAM)
Two agents running in parallel hit memory limit.

**Possible causes**:
- `concurrency: 3+` when it should be 2
- Heavy tests in acceptance (integration tests)
- Worker + scout both memory-intensive

**Fixes** (in priority order):
```bash
# 1. Reduce concurrency to 1
subagent({
  chain,
  concurrency: 1,  // Force sequential
  async: true
});

# 2. Drop integration tests
acceptance: {
  level: 'checked',
  criteria: [{
    id: 'unit-tests',
    must: 'Unit tests pass',
    evidence: ['test-output'],
    command: 'npm test -- --testPathIgnorePatterns=integration'
  }]
}

# 3. If still timing out, use "attested" only
acceptance: { level: 'attested', criteria: [] }
```

#### TIER=full (8+ GB RAM)
Too many parallel agents or heavy integration tests.

**Possible causes**:
- `concurrency: 8+` on 4-core machine
- Full integration test suite on unstable infra
- Worktrees × many concurrent tasks = memory spike

**Fixes** (in priority order):
```bash
# 1. Reduce concurrency
concurrency: 4,  // Down from 8

# 2. Remove worktrees
worktree: false,  // Each task in separate temp dir (lower memory)

# 3. Drop integration tests
evidence: ["commands-run"],  // Unit tests only

# 4. Increase timeout
timeoutMs: 900000  // 15 min instead of 5 min
```

---

## Issue 2: "Acceptance contract rejected green build"

### Symptoms
- Build succeeded locally
- All tests passed
- But `acceptance` rejected it as failed
- Error message unclear

### Diagnosis

This happens when **inferred acceptance policy** doesn't match your task.

Check your acceptance contract:
```javascript
// ❌ BAD: Omitted acceptance → Inferred policy
{ agent: 'worker', task: 'Add README docs' }

// ✅ GOOD: Explicit acceptance
{ 
  agent: 'worker', 
  task: 'Add README docs',
  acceptance: { level: 'attested', criteria: [] }  // No tests needed
}
```

### Root Causes

#### Inferred Policy Too Strict
Worker inferred: "Code task needs `tests-added` evidence"
But your task was: "Documentation only, no code"

**Fix**: Always pass explicit `acceptance`:
```javascript
{
  agent: 'worker',
  task: 'Write API documentation',
  acceptance: {
    level: 'attested',
    criteria: []  // No tests, just manual validation
  }
}
```

#### Fresh-Context Validator Saw Different Output
Planner output didn't match writer's implementation

**Fix**: Use `{outputs.name}` and `{previous}` to thread results:
```javascript
{
  agent: 'writer',
  task: 'Implement using plan: {outputs.plan} and reviews: {outputs.review}'
}
```

#### Test Command Doesn't Match Your Project
`npm test` not available in project, or wrong filter

**Fix**: Check your test command:
```bash
# Verify it works
npm test -- --testPathIgnorePatterns=integration

# OR for .NET
dotnet test --filter=Category!=Integration

# Then use in acceptance
criteria: [{
  id: 'unit-tests',
  command: 'npm test -- --testPathIgnorePatterns=integration'
}]
```

---

## Issue 3: "Worktree discarded before merge"

### Symptoms
- Chain ran async
- Worker produced great code
- But worktree is gone when you check status
- Work is lost (or hard to recover)

### Diagnosis

This ONLY happens if you used `async: false`:

```javascript
// ❌ BAD
subagent({ chain, async: false });  // Foreground → worktree discarded after

// ✅ GOOD
subagent({ chain, async: true });  // Async → worktree persists
```

### Root Cause

**Foreground runs cleanup worktrees automatically** to avoid disk leaks. Async runs keep them for manual merge.

### Fix

**Always use `async: true`**:

```javascript
const result = subagent({
  chain,
  async: true  // ← Rule #1 from SKILL.md
});

// Inspect
subagent({ action: 'status', id: result.id });

// When ready, merge manually
// git merge worktree-branch
```

---

## Issue 4: "Supervisor escalation arrived too late"

### Symptoms
- Worker hit a judgment call (e.g., circular dependency)
- Escalated with `contact_supervisor`
- Supervisor reply came after worker timeout
- Task failed anyway

### Diagnosis

Escalations add ~10-20 minute round-trip latency. Workers have 5-10 minute timeouts by default.

### Root Cause

**Foreseeable judgment calls don't belong in escalations**. They belong in the **task prompt as decision rules**.

### Fix

Bake rules into the task prompt:

```javascript
{
  agent: 'worker',
  task: `
    Implement the registry module.

    DECISION RULES (do not escalate, just follow):
    - If circular dependency between Core and Providers:
      → Place DTO in Core (Core cannot depend on Providers)
      → Namespace: Helio.Core.Registry
      → Document in <remarks> XML tag
    
    - Cache key format: "txn:{id}:{timestamp}"
    - Mock shape: { id: string, status: 'pending'|'done' }
    
    Follow these rules. Do not escalate. Proceed.
  `,
  acceptance: { level: 'checked', criteria: [...] }
}
```

Reserve `contact_supervisor` for:
- **Genuine ambiguity** (user must decide)
- **Unapproved product scope** (not in spec)
- **Real blocker** (worker can't unblock with stated rules)

---

## Issue 5: "Worker didn't commit; work lost"

### Symptoms
- Worker finished successfully
- Code was written
- But `git status` shows dirty tree
- No commits on worker branch

### Diagnosis

Worker forgot to commit. When worktree is cleaned, uncommitted changes are lost.

### Root Cause

**Rule #5: Subagent must commit its work.**

Worker didn't run: `git add -A && git commit`

### Fix

Always instruct the worker to commit:

```javascript
{
  agent: 'worker',
  task: `
    Implement TASK-01...

    IMPORTANT: Before finishing, commit your work:
      git add -A
      git commit -m "TASK-01: [your summary]"
    
    Do not skip this step. Committed work survives worktree cleanup.
  `
}
```

Verify in `git log` after:
```bash
subagent({ action: 'status', id: runId });
# Check for commits in the output
```

---

## Issue 6: "Parallel tasks interfering with each other"

### Symptoms
- 2+ workers writing to same files
- File conflicts, merge chaos
- Tests passing individually but failing together

### Diagnosis

Multiple writers in the same worktree = **Rule #2 violated**.

### Root Cause

**One writer per worktree.** Parallel writers only safe if isolated (separate directories or worktrees).

### Fix

#### Option A: Sequential Writers (Safest)

```javascript
subagent({
  chain: [
    { agent: 'worker1', task: 'Task 1' },
    { agent: 'worker2', task: 'Task 2 (uses output from Task 1: {previous})' }
  ],
  concurrency: 1,
  async: true
});
```

#### Option B: Parallel Writers + Worktrees (One Writer Per)

```javascript
subagent({
  tasks: [
    { agent: 'worker1', task: 'Task 1 (only src/a/)', worktree: true },
    { agent: 'worker2', task: 'Task 2 (only src/b/)', worktree: true }
  ],
  concurrency: 2,
  async: true,
  worktree: true  // Each gets own worktree
});
```

#### Option C: Single Writer + Parallel Read-Onlies

```javascript
subagent({
  chain: [
    { parallel: [
      { agent: 'scout', task: 'Analyze (read-only)' },
      { agent: 'reviewer', task: 'Review (read-only)' }
    ] },
    { agent: 'writer', task: 'Implement (sole writer)' }
  ],
  concurrency: 2,
  async: true,
  worktree: true
});
```

---

## Issue 7: "Chain takes forever; need to abort"

### Symptoms
- Chain running for 30+ minutes
- Seems stuck
- Need to stop and restart

### Diagnosis

Check status:
```bash
subagent({ action: 'status', id: runId });
```

### Common Causes

| Cause | Fix |
|-------|-----|
| Heavy test suite running | Reduce acceptance level to `attested` |
| Infinite loop in task code | Increase timeout, or hard-stop with `action: interrupt` |
| Tier mismatch (full tier on single machine) | Re-run `detect-orchestration-tier.sh`, adjust concurrency |
| Disk full, swap thrashing | Run `pre-delegation-check.sh`, free up space |

### Interrupt the Run

```bash
# Soft interrupt (leaves run paused, can resume)
subagent({ action: 'interrupt', id: runId });

# Check what's happening
subagent({ action: 'status', id: runId, includeProgress: true });

# Resume if OK, or abandon if not
subagent({ action: 'resume', id: runId, message: 'Continue please' });
```

---

## Decision Table: Which Fix?

| Error | Tier | First Try | If Still Fails |
|-------|------|-----------|----------------|
| 95% memory | single | Kill background processes | Split task smaller |
| 95% memory | semi | `concurrency: 1` | `level: 'attested'` |
| 95% memory | full | `concurrency: 4` (not 8) | Remove worktrees |
| Build rejected | any | Add explicit `acceptance` | Check test command |
| Worktree gone | any | Use `async: true` | Recover from git log |
| Escalation late | any | Bake rules in prompt | Skip escalation |
| Work lost | any | Instruct `git commit` | Verify in git log |
| File conflicts | any | Sequential chain | Or use worktrees per writer |
| Chain slow | any | Reduce test scope | Use TIER=full for full suite |

---

## Related Docs

- **SKILL.md** — The 5 rules + case studies
- **REFERENCE.md** — Pattern lookup, decision rules
- **ORCHESTRATION-BRIDGE.md** — Tier-specific guidance
- **adaptive-orchestration** — Resource detection & health checks
