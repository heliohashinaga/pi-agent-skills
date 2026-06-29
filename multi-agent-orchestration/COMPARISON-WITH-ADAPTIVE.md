# Comparison: Adaptive vs Multi-Agent Orchestration

Quick reference for when to use each skill and how they work together.

---

## Quick Comparison Table

| Question | Adaptive Orchestration | Multi-Agent Orchestration |
|----------|------------------------|--------------------------|
| **"What resources do I have?"** | ✅ Answers this → TIER, MAX_WORKERS | N/A |
| **"How do I structure parallel work?"** | N/A | ✅ Answers this → chains, patterns |
| **"Can I use worktrees?"** | Advises based on TIER | Depends on tier (see ORCHESTRATION-BRIDGE.md) |
| **"How many workers can I use?"** | ✅ Detects MAX_WORKERS | Use MAX_WORKERS from Adaptive |
| **"Should I use async?"** | N/A | ✅ Yes, always (Rule #1) |
| **"What should my acceptance contract be?"** | N/A | ✅ See REFERENCE.md + templates/ |
| **"My chain failed—why?"** | Check TROUBLESHOOTING.md (resource issues) | Check TROUBLESHOOTING.md (logic issues) |
| **"How do I combine them?"** | See ORCHESTRATION-BRIDGE.md | See ORCHESTRATION-BRIDGE.md |

---

## Decision Tree: Which Skill to Read?

```
You need to...

├─ Detect your system tier?
│  └─ READ: adaptive-orchestration/README.md
│     Run: ./scripts/detect-orchestration-tier.sh
│     Output: ORCHESTRATION_TIER, MAX_WORKERS
│
├─ Structure a chain or parallel tasks?
│  └─ READ: multi-agent-orchestration/README.md
│     Then: multi-agent-orchestration/REFERENCE.md
│     Then: Check templates/ for copy-paste
│
├─ Debug resource exhaustion?
│  └─ READ: adaptive-orchestration/TROUBLESHOOTING (pre-delegation check)
│     Or: adaptive-orchestration/SKILL.md (tier strategy)
│
├─ Debug chain logic or acceptance?
│  └─ READ: multi-agent-orchestration/TROUBLESHOOTING.md
│
├─ Combine both for a complete workflow?
│  └─ READ: ORCHESTRATION-BRIDGE.md (in either skill)
│
└─ Copy a preset pattern?
   └─ adaptive-orchestration/EXAMPLES.md (per-tier examples)
      OR multi-agent-orchestration/templates/ (JSON templates)
```

---

## What Each Skill Does

### Adaptive Orchestration

**Goal**: Tell you **what resources you have** and what's safe to do.

**Provides**:
- ✅ System tier detection (single/semi/full)
- ✅ MAX_WORKERS for your machine
- ✅ Health checks (memory, disk, swap)
- ✅ Resource thresholds (RAM, cores, etc.)
- ✅ Auto-downgrade logic (memory pressure response)

**Hands you**:
- `ORCHESTRATION_TIER` env var
- `MAX_WORKERS` → Pass to multi-agent `concurrency`
- `BUILD_FLAGS` → For project build configs
- Tier-specific recommendations (worktrees? integration tests?)

**Examples**: `./scripts/detect-orchestration-tier.sh`

---

### Multi-Agent Orchestration

**Goal**: Tell you **how to structure work safely** and **get it merged**.

**Provides**:
- ✅ 5 non-negotiable rules (async, one writer, explicit acceptance, etc.)
- ✅ Chain patterns (planner → writer → validator)
- ✅ Parallel patterns (independent tasks, read-only fan-out)
- ✅ Decision-rule prompting (avoid escalations)
- ✅ Acceptance contracts (build, tests, review gates)

**Hands you**:
- `README.md` → Quick start + decision tree
- `REFERENCE.md` → Pattern lookup + templates
- `templates/` → Copy-paste contracts and chains
- `TROUBLESHOOTING.md` → Common issues

**Examples**:
```javascript
subagent({
  chain: [
    { agent: 'planner', task: '...' },
    { agent: 'writer', task: '...' }
  ],
  async: true,
  concurrency: process.env.MAX_WORKERS  // ← From Adaptive
});
```

---

## Relationship Diagram

```
┌─────────────────────────────────────────┐
│ Your Machine                            │
│ ┌─────────────────────────────────────┐ │
│ │ RAM: 3.7 GB, Cores: 2               │ │
│ │ Disk: 50 GB free                    │ │
│ └─────────────────────────────────────┘ │
└────────────┬────────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────┐
  │ ADAPTIVE ORCHESTRATION              │ ◄─ Step 1: Detect tier
  │ ./scripts/detect-orchestration-tier │
  │ ↓                                   │
  │ ORCHESTRATION_TIER=single           │
  │ MAX_WORKERS=1                       │
  │ BUILD_FLAGS=--no-parallel           │
  └────────────┬────────────────────────┘
               │ exports env vars
               ▼
  ┌─────────────────────────────────────┐
  │ MULTI-AGENT ORCHESTRATION           │ ◄─ Step 2: Structure work
  │                                     │
  │ chain = [planner, writer, validator]│
  │ concurrency: MAX_WORKERS (=1)       │
  │ worktree: false (TIER=single)       │
  │ async: true (Rule #1)               │
  │ acceptance: { level: "attested" }   │
  │     (no heavy tests, TIER=single)   │
  └────────────┬────────────────────────┘
               │
               ▼
  ┌─────────────────────────────────────┐
  │ Execute                             │ ◄─ Step 3: Run safely
  │ subagent(orchestrationConfig)       │
  └─────────────────────────────────────┘
```

---

## When to Use Each

### Use Adaptive Orchestration When

1. **Starting any delegation** → Run detect script first
2. **System resources unclear** → Run health check
3. **Getting OOM errors** → Check tier, reduce concurrency
4. **Building in CI/CD** → Auto-detect tier, adjust builds
5. **Need to document environment** → TIER and MAX_WORKERS are canonical

### Use Multi-Agent Orchestration When

1. **Building a chain** → Need chain patterns
2. **Delegating parallel tasks** → Need concurrency strategy
3. **Writing worker instructions** → Need decision-rule template
4. **Setting up acceptance gates** → Need contract template
5. **Something failed** → Check TROUBLESHOOTING.md

### Use Both Together When

1. **Complete workflow** → See ORCHESTRATION-BRIDGE.md
2. **Scaling between machines** → Tier changes, patterns stay
3. **Production CI/CD** → Detect tier automatically, apply tier-specific patterns

---

## Common Scenarios

### Scenario 1: "I want to parallelize 3 independent tasks"

1. **Adaptive**: `./scripts/detect-orchestration-tier.sh` → Get MAX_WORKERS (e.g., 2)
2. **Multi-Agent**: Use `parallel-independent-tasks` pattern from REFERENCE.md
3. **Apply**: `concurrency: 2` (not 3, because MAX_WORKERS=2)

### Scenario 2: "I need to review code before merging"

1. **Multi-Agent**: Use `planner → writer → validator` chain pattern
2. **Adaptive**: Check tier → Decide on integration tests in acceptance
3. **Apply**: Validators run fresh-context, so cheap on all tiers

### Scenario 3: "OOM error on my notebook"

1. **Adaptive**: Run pre-delegation check → See RAM usage
2. **Multi-Agent**: Drop concurrency to 1, use `level: "attested"`
3. **Re-run**: Same chain, now safe on notebook

### Scenario 4: "Deploying chain to GitHub Actions"

1. **Adaptive**: CI/CD auto-detects tier (11+ GB) → TIER=full, MAX_WORKERS=4+
2. **Multi-Agent**: Use planner → writer → validator (full parallel)
3. **Build**: Include full test suite (integration + coverage)

---

## Cross-Skill Glossary

| Term | Adaptive | Multi-Agent |
|------|----------|-------------|
| **TIER** | single/semi/full | Informs concurrency, worktrees, acceptance level |
| **MAX_WORKERS** | Auto-detected | Used in `concurrency` config |
| **concurrency** | N/A (static) | Recommended = MAX_WORKERS |
| **worktree** | Advisable if TIER=full | Set `worktree: tier === 'full'` |
| **acceptance** | N/A | Must be explicit; adjust criteria per tier |
| **Build flags** | `--no-parallel` for single | Apply via .NET/npm CLI |

---

## File Navigation

### Adaptive Orchestration
```
adaptive-orchestration/
├── README.md                      ← START: Detect your tier
├── REFERENCE.md                   ← Quick lookup
├── SKILL.md                       ← Full rules + case studies
├── ORCHESTRATION-BRIDGE.md        ← How it pairs with multi-agent
├── EXAMPLES.md                    ← Tier-specific examples
├── scripts/
│   ├── detect-orchestration-tier.sh
│   ├── pre-delegation-check.sh
│   └── validate-orchestration-plan.js  ← NEW: Validate chains
└── orchestration.config.json
```

### Multi-Agent Orchestration
```
multi-agent-orchestration/
├── README.md                      ← START: Quick start + decision tree
├── REFERENCE.md                   ← Pattern lookup + tier constraints
├── SKILL.md                       ← Full rules + case studies
├── ORCHESTRATION-BRIDGE.md        ← How it pairs with adaptive
├── TROUBLESHOOTING.md             ← Common issues by error
├── templates/                     ← NEW: Copy-paste configs
│   ├── acceptance-attested.json
│   ├── acceptance-checked.json
│   ├── acceptance-full.json
│   ├── acceptance-reviewed.json
│   └── chain-planner-writer-validator.json
└── docs/
    └── (future: decision trees, integration examples)
```

---

## Reading Order (For First-Time Users)

1. **Adaptive**: `README.md` (5 min) → Run `detect-orchestration-tier.sh` (1 min)
2. **Multi-Agent**: `README.md` (5 min) → `REFERENCE.md` pattern lookup (5 min)
3. **Integration**: `ORCHESTRATION-BRIDGE.md` (10 min) → Pick preset combination
4. **Templates**: Copy from `templates/` matching your tier + task type
5. **Execute**: `subagent({ chain, concurrency: MAX_WORKERS, async: true })`

---

## Related Resources

- **ORCHESTRATION-BRIDGE.md** (in both skills) — How to use together
- **adaptive-orchestration/EXAMPLES.md** — Bash, JS, GitHub Actions examples
- **multi-agent-orchestration/templates/** — JSON templates (copy-paste ready)
- **multi-agent-orchestration/TROUBLESHOOTING.md** — Error diagnosis by tier
