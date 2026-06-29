# ORCHESTRATION-BRIDGE: Adaptive + Multi-Agent Integration

This file shows how **adaptive-orchestration** and **multi-agent-orchestration** work together.

---

## Quick Relationship

```
┌──────────────────────────────────┐
│ Your System                      │
│ RAM: 3.7 GB, Cores: 2            │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│ 1. Adaptive Orchestration (Detect)           │
│    ./scripts/detect-orchestration-tier.sh    │
│    ↓                                         │
│    ORCHESTRATION_TIER=single                 │
│    MAX_WORKERS=1                             │
│    BUILD_FLAGS=--no-parallel                 │
└────────────┬─────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│ 2. Multi-Agent Orchestration (Structure)     │
│    Build your chain/parallel pattern         │
│                                              │
│    Apply tier constraints:                   │
│    - concurrency: $MAX_WORKERS               │
│    - worktree: tier === 'full'               │
│    - acceptance level: light (no heavy tests)│
└────────────┬─────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│ 3. Execute                                   │
│    subagent({ chain, concurrency, async })   │
└──────────────────────────────────────────────┘
```

---

## 3-Step Workflow

### Step 1: Detect Your Tier (Adaptive)

```bash
source ./scripts/detect-orchestration-tier.sh
echo "TIER=$ORCHESTRATION_TIER, MAX_WORKERS=$MAX_WORKERS"
```

Output examples:
- **Notebook** (3.7 GB, 2 cores): `TIER=single, MAX_WORKERS=1`
- **Medium machine** (6 GB, 4 cores): `TIER=semi, MAX_WORKERS=2`
- **CI/CD runner** (11+ GB, 4+ cores): `TIER=full, MAX_WORKERS=4+`

### Step 2: Build Your Chain (Multi-Agent)

```javascript
const chain = [
  {
    agent: 'planner',
    task: 'Design TASK-01 implementation...',
    acceptance: { level: 'attested' }
  },
  {
    agent: 'worker',
    task: 'Implement TASK-01...',
    acceptance: {
      level: 'checked',
      criteria: [{
        id: 'build',
        must: 'Build succeeds',
        evidence: ['commands-run']
      }]
    }
  }
];
```

### Step 3: Apply Tier Constraints

```javascript
const tier = process.env.ORCHESTRATION_TIER;
const maxWorkers = parseInt(process.env.MAX_WORKERS);

const orchestrationConfig = {
  chain,
  async: true,
  concurrency: maxWorkers,
  worktree: tier === 'full'  // Only worktrees on full tier
};

subagent(orchestrationConfig);
```

---

## Preset Combinations

### TIER=single (Notebook, < 4 GB RAM)

**What it means**: Sequential execution, low memory

**For Multi-Agent**:
```javascript
subagent({
  chain: [
    { agent: 'worker', task: '...' },
    { agent: 'worker', task: '...' }
  ],
  async: true,
  concurrency: 1,        // ← Must be 1
  worktree: false        // ← No worktrees (OOM risk)
});
```

**Acceptance contract**:
- Use `level: "attested"` or `"none"` (no heavy tests)
- Avoid integration tests
- Unit tests only (if any)

**What to avoid**:
- ❌ `worktree: true` (will OOM)
- ❌ Heavy test suites in acceptance
- ❌ 3+ concurrent agents

---

### TIER=semi (Medium Machine, 4-8 GB RAM)

**What it means**: 2 parallel agents + cleanup between stages

**For Multi-Agent**:
```javascript
subagent({
  tasks: [
    { agent: 'scout', task: 'Analyze codebase...' },
    { agent: 'worker', task: 'Implement TASK-01...' }
  ],
  async: true,
  concurrency: 2,        // ← At most 2
  worktree: false        // ← Avoid worktrees (can cause memory spikes)
});
```

**Then sequential dependent tasks**:
```javascript
subagent({
  chain: [
    { agent: 'worker', task: 'TASK-02 (uses scout output)...' },
    { agent: 'worker', task: 'TASK-03...' }
  ],
  concurrency: 1,
  async: true
});
```

**Acceptance contract**:
- Use `level: "checked"` with unit tests only
- `evidence: ["commands-run", "test-output"]`
- Skip integration tests

**What to avoid**:
- ❌ `concurrency: 3+` (memory pressure)
- ❌ Integration tests in acceptance
- ❌ Heavy worktrees

---

### TIER=full (CI/CD, 8+ GB RAM, 4+ cores)

**What it means**: Full parallelism with worktrees

**For Multi-Agent**:
```javascript
subagent({
  chain: [
    // Parallel planners
    { parallel: [
      { agent: 'planner1', task: 'Architecture...' },
      { agent: 'planner2', task: 'Test outline...' }
    ] },
    
    // Single writer
    { agent: 'writer', task: 'Implement...' },
    
    // Parallel validators
    { parallel: [
      { agent: 'validator1', task: 'Correctness...' },
      { agent: 'validator2', task: 'Performance...' }
    ] }
  ],
  async: true,
  concurrency: process.env.MAX_WORKERS,  // Can be 4, 6, 8+
  worktree: true   // ← Safe to use worktrees
});
```

**Acceptance contract**:
- Use `level: "checked"` with full test suite
- Include integration tests
- `evidence: ["commands-run", "test-output", "coverage"]`

**What you can do**:
- ✅ Full parallel chains
- ✅ Worktrees for each task
- ✅ Heavy test suites
- ✅ Long timeouts (5-10 min per task)

---

## Migration Path (Tier Upgrade)

If your machine gets better (more RAM, more cores), you can scale up:

```javascript
// 1. Re-run detection
source ./scripts/detect-orchestration-tier.sh

// 2. Update concurrency in your chain
const newMaxWorkers = parseInt(process.env.MAX_WORKERS);
subagent({
  // chain...
  concurrency: newMaxWorkers,  // Now higher
  worktree: process.env.ORCHESTRATION_TIER === 'full'  // Maybe true now
});
```

---

## Decision Tree: Which Tier Am I?

```
How much RAM is available?
│
├─ < 4 GB                → TIER=single
│  Use: Sequential only
│  Workers: 1
│  Worktrees: NO
│
├─ 4–8 GB               → TIER=semi
│  Use: 2 parallel + sequential
│  Workers: 2
│  Worktrees: Light only
│
└─ ≥ 8 GB               → TIER=full
   Use: Full parallel
   Workers: 4+
   Worktrees: YES
```

Check your tier:
```bash
free -h
# Look at "Mem:" line, total column

# Or let detect script check:
./scripts/detect-orchestration-tier.sh
```

---

## Troubleshooting by Tier

### On TIER=single: "Worker timed out at 95% memory"

This shouldn't happen—single tier runs sequential. Check:

```bash
# 1. Verify tier
./scripts/detect-orchestration-tier.sh

# 2. Kill heavy processes
pkill -f "code-server"  # VS Code eating RAM?
pkill -f "Roslyn"       # .NET analyzer?

# 3. Retry
```

### On TIER=semi: "Worker timed out at 95% memory"

Two agents running in parallel hit memory limit. Options:

```bash
# Option A: Reduce concurrency to 1
subagent({
  chain,
  concurrency: 1,  // Force sequential
  async: true
});

# Option B: Drop heavy tests
acceptance: {
  level: 'attested',  // Skip tests
  criteria: []
}
```

### On TIER=full: "Worker timed out at 95% memory"

Too many parallel agents. Options:

```bash
# Option A: Reduce concurrency
concurrency: 2,  // Down from 4

# Option B: Remove worktrees
worktree: false,  // Separate temp dirs, lower memory

# Option C: Drop integration tests
evidence: ["commands-run"],  // Unit tests only
```

---

## Common Patterns by Tier

### TIER=single: Scout Then Implement

```javascript
subagent({
  chain: [
    { agent: 'scout', task: 'Analyze codebase (read-only)' },
    { agent: 'worker', task: 'Implement using scout output {previous}' }
  ],
  concurrency: 1,
  async: true
});
```

**Why this works**: Scout is read-only (no memory spikes), then sequential writer.

---

### TIER=semi: Parallel Scouts, Sequential Workers

```javascript
subagent({
  tasks: [
    { agent: 'scout1', task: 'Check dependencies...' },
    { agent: 'scout2', task: 'Check architecture...' }
  ],
  concurrency: 2,
  async: true
});

// Then:
subagent({
  chain: [
    { agent: 'worker', task: 'Fix issues from scouts...' },
    { agent: 'worker', task: 'Run tests...' }
  ],
  concurrency: 1,
  async: true
});
```

**Why this works**: Scouts are cheap (read-only, ~500 MB each). Sequential workers stay safe.

---

### TIER=full: Planner → Writer → Validator

```javascript
subagent({
  chain: [
    { parallel: [
      { agent: 'planner1', task: '...' },
      { agent: 'planner2', task: '...' }
    ] },
    { agent: 'writer', task: 'Implement using plans...' },
    { parallel: [
      { agent: 'validator1', task: '...' },
      { agent: 'validator2', task: '...' }
    ] }
  ],
  concurrency: 4,  // Or higher
  async: true,
  worktree: true
});
```

**Why this works**: Plenty of RAM + cores. Reviewers are cheap. Writer isolates on worktree. Validators are fresh-context.

---

## Related Skills

- **/skill:adaptive-orchestration** — Detect tier, health checks, scripts
- **/skill:multi-agent-orchestration** — Chain patterns, acceptance contracts, rules

## Further Reading

- **adaptive-orchestration/README.md** — Tier detection deep dive
- **multi-agent-orchestration/README.md** — Multi-agent patterns
- **multi-agent-orchestration/REFERENCE.md** — Pattern lookup table
