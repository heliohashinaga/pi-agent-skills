# Multi-Agent Orchestration Skill

Safe patterns for orchestrating pi-subagents: async execution, worktrees, acceptance contracts, and chain workflows.

## Files

```
multi-agent-orchestration/
├── README.md                       # This file (quick start)
├── REFERENCE.md                    # Quick lookup (pattern matching)
├── SKILL.md                        # Full playbook (detailed rules & case studies)
├── ORCHESTRATION-BRIDGE.md         # Integration with adaptive-orchestration
├── COMPARISON-WITH-ADAPTIVE.md     # When to use each skill
├── TROUBLESHOOTING.md              # Common issues indexed by error
├── templates/                      # Copy-paste JSON configs
│   ├── acceptance-attested.json
│   ├── acceptance-checked.json
│   ├── acceptance-full.json
│   ├── acceptance-reviewed.json
│   └── chain-planner-writer-validator.json
└── (See adaptive-orchestration/ for validation scripts & integration examples)
```

## Quick Start (3 minutes)

### The 5 Non-Negotiable Rules

1. **Async by default** — Use `async: true` so worktrees persist
2. **One writer per worktree** — Parallel is OK for read-only roles
3. **Explicit acceptance** — Never omit `acceptance` contract
4. **Bake decision rules** — Tell the worker the rules, don't escalate
5. **Commit in worktree** — Worker runs `git add -A && git commit` before finishing

### When to Use Orchestration

✅ Use when:
- ≥3 independent tasks OR
- Need adversarial review (fresh-context reviewers) OR
- Multi-stage dependencies

❌ Skip when:
- ≤4 tasks in one commit
- All in same file
- No review value

### Minimal Example

```javascript
subagent({
  chain: [
    { 
      agent: 'planner', 
      task: 'Plan TASK-01...',
      acceptance: { level: 'attested' }
    },
    { 
      agent: 'worker', 
      task: 'Implement TASK-01...',
      acceptance: { 
        level: 'checked',
        criteria: [{
          id: 'build',
          must: 'dotnet build succeeds',
          evidence: ['commands-run']
        }]
      }
    }
  ],
  async: true,  // ← Rule #1
  worktree: true
});
```

## Decision Tree

```
Need to delegate work?
│
├─ Is it ≤4 tasks in one commit?
│  └─ YES → Implement directly (faster)
│  └─ NO  → Continue...
│
├─ Do you need fresh-context review?
│  └─ YES → Use planner→writer→validator chain
│  └─ NO  → Continue...
│
├─ Are tasks independent?
│  └─ YES → Use parallel tasks
│  └─ NO  → Use sequential chain
│
└─ Apply tier constraints (see ORCHESTRATION-BRIDGE.md)
```

## Common Patterns

### Sequential (Stage Dependencies)

```javascript
subagent({
  chain: [
    { agent: 'a', task: 'Task 1' },
    { agent: 'b', task: 'Task 2 (uses output from Task 1)', 
      task: 'Use {previous}' }
  ],
  async: true
});
```

### Parallel Reviewers → Single Writer → Validators

```javascript
subagent({
  chain: [
    // Stage 1: Parallel reviewers (read-only)
    { parallel: [
      { agent: 'reviewer1', task: 'Review architecture...' },
      { agent: 'reviewer2', task: 'Review patterns...' }
    ]},
    
    // Stage 2: Single writer (sole writer on worktree)
    { agent: 'writer', task: 'Implement following reviews...' },
    
    // Stage 3: Parallel validators (fresh-context, read-only)
    { parallel: [
      { agent: 'validator1', task: 'Check diff correctness...' },
      { agent: 'validator2', task: 'Check perf impact...' }
    ]}
  ],
  async: true,
  worktree: true
});
```

### Tasks with Disjoint Files (No Worktrees)

```javascript
subagent({
  tasks: [
    { agent: 'worker', task: 'Task 1 (src/moduleA)' },
    { agent: 'worker', task: 'Task 2 (src/moduleB)' },
    { agent: 'worker', task: 'Task 3 (tests/)' }
  ],
  concurrency: 3,
  async: true,
  worktree: false  // Each task in its own temp dir, safe to merge
});
```

## Workflow: Your Next Delegation

1. **Read REFERENCE.md** (5 min) for pattern matching
2. **Check tier** via adaptive-orchestration (1 min)
3. **Check ORCHESTRATION-BRIDGE.md** for tier constraints (5 min)
4. **Copy template** from `templates/` (JSON ready to use)
5. **Adjust for your task** (decision rules, evidence, roles)
6. **Validate** via adaptive-orchestration script (1 min)
7. **Delegate** with `async: true`

## When Things Break

→ See **TROUBLESHOOTING.md** (indexed by error type + tier)

## Decision: Which Doc to Read?

| Question | File |
|----------|------|
| How do I structure a chain? | REFERENCE.md |
| What's a good pattern for my scenario? | REFERENCE.md (Pattern Lookup) |
| How do I use this with adaptive-orchestration? | ORCHESTRATION-BRIDGE.md |
| How do tiers affect my chain? | ORCHESTRATION-BRIDGE.md + COMPARISON-WITH-ADAPTIVE.md |
| What acceptance contract should I use? | templates/ (copy-paste) or REFERENCE.md |
| Common mistakes to avoid? | SKILL.md (5 Non-Negotiable Rules) |
| My chain failed—what went wrong? | TROUBLESHOOTING.md |
| Comparing both skills? | COMPARISON-WITH-ADAPTIVE.md |

## Further Reading

- **SKILL.md** — Complete rules, case studies, project invariants
- **REFERENCE.md** — Quick lookup by pattern + tier constraints table
- **ORCHESTRATION-BRIDGE.md** — How to combine with adaptive-orchestration
- **TROUBLESHOOTING.md** — Error diagnosis by tier
- **COMPARISON-WITH-ADAPTIVE.md** — Skill relationships
- **templates/** — Copy-paste acceptance contracts & chain examples
