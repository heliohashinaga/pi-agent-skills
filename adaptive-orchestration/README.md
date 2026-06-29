# Adaptive Orchestration Skill

Tier-aware subagent delegation for resource-constrained and high-resource environments.

## Files

```
adaptive-orchestration/
├── README.md                      (this file - quick start)
├── REFERENCE.md                   (quick lookup)
├── SKILL.md                       (full documentation)
├── ORCHESTRATION-BRIDGE.md        (integration with multi-agent)
├── INTEGRATION-EXAMPLES.md        (real workflows & code)
├── EXAMPLES.md                    (bash, JS, GitHub Actions)
├── orchestration.config.json      (strategy config)
└── scripts/
    ├── detect-orchestration-tier.sh   (detect TIER + MAX_WORKERS)
    ├── pre-delegation-check.sh        (health validation)
    └── validate-orchestration-plan.js (validate chain vs tier)
```

## Quick Start

```bash
# 1. Detect your tier
./scripts/detect-orchestration-tier.sh
# Output: ORCHESTRATION_TIER=single, MAX_WORKERS=1

# 2. Validate system
./scripts/pre-delegation-check.sh
# Output: All checks pass

# 3. Validate your chain (new!)
node ./scripts/validate-orchestration-plan.js my-chain.json
# Output: Compatible with TIER=single

# 4. Use in multi-agent chain (see ORCHESTRATION-BRIDGE.md)
subagent({ chain, concurrency: MAX_WORKERS, async: true });
```

## What It Does

- **Auto-detects** optimal tier (SINGLE/SEMI/FULL) based on RAM + cores
- **Validates** system health before expensive operations
- **Provides** tier-specific delegation patterns
- **Prevents** OOM crashes on resource-constrained machines
- **Validates** multi-agent chains against tier constraints (new!)

## For Your Machine Now

```
TIER=single (3.7 GB RAM, 2 cores)
MAX_WORKERS=1
BUILD_FLAGS=--no-parallel
```

## For Your Next Delegation

1. **Run detect script** (1 min) -> Get TIER + MAX_WORKERS
2. **Check health** (1 min) -> pre-delegation-check.sh
3. **Read ORCHESTRATION-BRIDGE.md** (5 min) -> Tier + chain constraints
4. **Build chain** (5 min) -> Use multi-agent patterns
5. **Validate chain** (1 min) -> validate-orchestration-plan.js (new!)
6. **Execute** -> subagent with tier-aware config

## When Things Break

See TROUBLESHOOTING.md in either skill

## Decision: Which Doc to Read?

- **"What tier am I?"** -> README.md (this) + detect script
- **"How do I structure my work?"** -> multi-agent-orchestration/README.md
- **"How do I combine both skills?"** -> ORCHESTRATION-BRIDGE.md
- **"How do I validate my chain?"** -> validate-orchestration-plan.js
- **"Real workflow examples?"** -> INTEGRATION-EXAMPLES.md (new!)
- **"Per-tier code examples?"** -> EXAMPLES.md

## Integration with Multi-Agent Orchestration

See ORCHESTRATION-BRIDGE.md for how to use these skills together:
- Detect your tier (this skill)
- Apply tier constraints to multi-agent chains
- Combined patterns & troubleshooting

## Related Skills

- /skill:multi-agent-orchestration (worktrees, chains, acceptance contracts)
  See: README.md, REFERENCE.md, ORCHESTRATION-BRIDGE.md

## Further Reading

- SKILL.md (full documentation + case studies)
- REFERENCE.md (quick lookup + tier benchmarks)
- ORCHESTRATION-BRIDGE.md (integration guide)
- INTEGRATION-EXAMPLES.md (real workflows: Bash, JS, GitHub Actions)
- EXAMPLES.md (code patterns)
