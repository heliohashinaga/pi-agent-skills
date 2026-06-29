---
description: |
  Tier-aware subagent delegation with automatic resource detection — select sequential, semi-parallel, or full-parallel execution based on available system memory, CPU cores, and constraints. Includes health checks, auto-downgrade logic, and CI/CD integration. Pairs with multi-agent-orchestration skill for complete resource-aware workflows.
---

# Skill: Adaptive Orchestration

**Tier-aware subagent delegation** — automatically select sequential, semi-parallel, or full-parallel execution based on system resources.

## When to Use

You're about to delegate work to subagents and need to:
- Avoid OOM crashes on memory-constrained devices
- Auto-detect optimal concurrency for CI/CD runners
- Pre-validate system health before expensive builds
- Balance task dependencies with available resources
- Scale between local notebook (3.7 GB) and cloud (11+ GB)

**Triggers**: `orchestrate tasks`, `delegate workers`, `parallel build`, `memory-aware delegation`, `auto-tier`, `health check before`, `adaptive concurrency`.

## Core Concepts

### Three Tiers

```
TIER 1: SINGLE (Sequential)
├─ Trigger: RAM < 4 GB or CORES < 4
├─ Pattern: T1 → [cleanup] → T2 → [cleanup] → T3
├─ Time: ~16 min
└─ Safe for: Your notebook now (3.7 GB)

TIER 2: SEMI-PARALLEL (2 Workers)
├─ Trigger: 4 GB ≤ RAM < 8 GB and CORES ≥ 2
├─ Pattern: Scout || Worker(T1) → [wait] → T2 → T3
├─ Time: ~12 min
└─ Safe for: Medium machines (4–8 GB)

TIER 3: FULL-PARALLEL (N Workers)
├─ Trigger: RAM ≥ 8 GB and CORES ≥ 4
├─ Pattern: T1 || T2 || T3 (worktrees)
├─ Time: ~7 min
└─ Safe for: CI/CD runners (GitHub Actions 11+ GB)
```

### Health Checks (Pre-Delegation)

Before delegating, auto-validate:
- ✅ Memory: ≥2 GB available
- ✅ Swap: <80% usage
- ✅ Disk: ≥5 GB free
- ✅ Git: Clean working tree
- ⚠️  VS Code: <4 Roslyn processes

If any check fails → skip delegation, show remediation steps.

## Quick Reference

### 1. Detect Your Tier

```bash
./scripts/detect-orchestration-tier.sh
```

Output:
```
ORCHESTRATION_TIER=single
MAX_WORKERS=1
BUILD_FLAGS=--no-parallel
```

### 2. Run Health Check

```bash
./scripts/pre-delegation-check.sh
```

Passes? → Ready to delegate.

### 3. Use in Code

#### Sequential (TIER=single)

```javascript
subagent({ agent: 'worker', task: 'TASK-01...' });
// Wait ↓
subagent({ agent: 'worker', task: 'TASK-02...' });
// Wait ↓
subagent({ agent: 'worker', task: 'TASK-03...' });
```

#### Semi-Parallel (TIER=semi)

```javascript
subagent({
  tasks: [
    { agent: 'scout', task: 'Analyze codebase...' },
    { agent: 'worker', task: 'TASK-01 implementation...' }
  ],
  concurrency: 2
});
// Then sequential dependent tasks
subagent({ agent: 'worker', task: 'TASK-02 + TASK-03...' });
```

#### Full-Parallel (TIER=full)

```javascript
subagent({
  tasks: [
    { agent: 'worker', task: 'TASK-01...' },
    { agent: 'worker', task: 'TASK-02...' },
    { agent: 'worker', task: 'TASK-03...' }
  ],
  concurrency: 3,
  worktree: true
});
```

## Implementation

### Project Setup

Copy these to your project:

```bash
# Detection script
cp ~/.pi/agent/skills/adaptive-orchestration/scripts/detect-orchestration-tier.sh \
   <project>/scripts/

# Health check
cp ~/.pi/agent/skills/adaptive-orchestration/scripts/pre-delegation-check.sh \
   <project>/scripts/

# Config
cp ~/.pi/agent/skills/adaptive-orchestration/orchestration.config.json \
   <project>/
```

### Automated Detection in CI/CD

**.github/workflows/ci.yml**:
```yaml
- name: Detect tier
  run: |
    source ./scripts/detect-orchestration-tier.sh >> $GITHUB_ENV

- name: Delegate tasks
  env:
    ORCHESTRATION_TIER: ${{ env.ORCHESTRATION_TIER }}
    MAX_WORKERS: ${{ env.MAX_WORKERS }}
  run: |
    node scripts/delegate-tasks.js
```

## Decision Rules

### When to Use Each Tier

| Scenario | Tier | Reason |
|----------|------|--------|
| Local notebook (3–4 GB) | Single | Avoid OOM, swap thrashing |
| Medium laptop (4–8 GB) | Semi | Parallel + sequential mix |
| GitHub Actions (11+ GB) | Full | Max parallelism, fast CI |
| After large build (cleanup needed) | Single | Free ~200 MB first |
| VS Code + builds together | Single | Roslyn = +1 GB overhead |
| Production CI/CD | Full | Pre-validated resource pool |

### Auto-Downgrade Logic

If during execution memory hits:
- **90%**: Log warning, continue with current tier
- **95%**: Kill subagent, retry with TIER=single
- **98%**: OOM likely imminent, fail fast

## Troubleshooting

### "Pre-delegation check failed: Only 1 GB available"

```bash
# Clean up build artifacts
dotnet clean
rm -rf ~/.nuget/http-cache

# Kill VS Code Roslyn (if using notebook)
pkill -f "code-server"

# Retry
./scripts/pre-delegation-check.sh
```

### "Subagent timed out at 95% memory"

**Root cause**: Parallel builds on constrained device.

**Fix**:
```bash
# Force single-tier for this run
export ORCHESTRATION_TIER=single
export DOTNET_BUILD_FLAGS=--no-parallel

# Increase timeout in config
# orchestration.config.json → single.timeoutPerTask = 900000 (15 min)
```

### "Swap usage at 80%+ even after cleanup"

Permanent increase (Linux):
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

## Performance Benchmarks

### Example Project

| Tier | Concurrency | Task Time | Peak Memory | Machine |
|------|------------|-----------|-------------|---------|
| Single | 1 | ~16 min | 3.5 GB | Notebook (3.7 GB) |
| Semi | 2 | ~12 min | 4.0 GB | Medium (4–8 GB) |
| Full | 3+ | ~7 min | 7.8 GB | CI (11+ GB) |

### What Changed When Switching to Single

- **Before**: Parallel workers → 95% memory → OOM → timeout
- **After**: Sequential + cleanup → 3.5 GB peak → 100% success rate

## References

- **Config Schema**: `orchestration.config.json` (in this skill)
- **Related Skill**: `/skill:multi-agent-orchestration` (git worktrees + parallel chains)

## Examples

### Example 1: Simple Delegation

```bash
# Detect tier
source $(which detect-orchestration-tier.sh) 2>/dev/null || \
  eval "$(./scripts/detect-orchestration-tier.sh | grep -E '^(ORCHESTRATION|MAX|BUILD)')"

# Check health
./scripts/pre-delegation-check.sh

# Delegate based on tier
if [ "$ORCHESTRATION_TIER" = "single" ]; then
  echo "🔁 Sequential mode (single worker)"
  subagent({ agent: 'worker', task: '...' })
elif [ "$ORCHESTRATION_TIER" = "semi" ]; then
  echo "⚡ Semi-parallel mode (2 workers)"
  # ...
else
  echo "🚀 Full parallel mode ($MAX_WORKERS workers)"
  # ...
fi
```

### Example 2: Robust CI/CD Pipeline

```javascript
// scripts/delegate-tasks.js

const { execSync } = require('child_process');
const fs = require('fs');

// 1. Run health check
try {
  execSync('./scripts/pre-delegation-check.sh', { stdio: 'inherit' });
} catch (e) {
  console.error('❌ System not ready');
  process.exit(1);
}

// 2. Detect tier
const tier = process.env.ORCHESTRATION_TIER || 'single';
const maxWorkers = parseInt(process.env.MAX_WORKERS) || 1;

// 3. Load config
const config = JSON.parse(fs.readFileSync('orchestration.config.json'));
const strategy = config.strategies[tier];

console.log(`Using strategy: ${strategy.name}`);
console.log(`Max workers: ${maxWorkers}`);
console.log(`Build flags: ${strategy.buildFlags || '(default)'}`);

// 4. Delegate based on tier
if (tier === 'single') {
  delegateSequential(strategy);
} else if (tier === 'semi') {
  delegateSemiParallel(strategy, maxWorkers);
} else {
  delegateFullParallel(strategy, maxWorkers);
}
```

## Integration with Multi-Agent Orchestration

This skill **pairs with** `/skill:multi-agent-orchestration`:

- **Multi-Agent Orchestration**: How to structure chains, worktrees, acceptance contracts
- **Adaptive Orchestration**: What resources are available, which tier to use

Example combined workflow:

```javascript
// Step 1: Detect resources
const tier = execSync('./scripts/detect-orchestration-tier.sh').toString();

// Step 2: Load multi-agent chain template
// (from multi-agent-orchestration skill)
const chain = [
  { agent: 'planner', task: 'Plan TASK-01–TASK-03' },
  { agent: 'worker', task: 'TASK-01 (audit persistence)' },
  { agent: 'worker', task: 'TASK-02 (mock config)' },
  { agent: 'worker', task: 'TASK-03 (DI wiring)' }
];

// Step 3: Apply tier-aware concurrency
if (tier === 'single') {
  subagent({ chain, concurrency: 1, worktree: false });
} else if (tier === 'full') {
  subagent({ chain, concurrency: 3, worktree: true });
}
```

## Maintenance

### Update Detection Logic

Edit `scripts/detect-orchestration-tier.sh` if:
- New RAM threshold (currently: 4 GB, 8 GB)
- New tier strategy emerges
- Roslyn memory profile changes

### Update Health Checks

Edit `scripts/pre-delegation-check.sh` if:
- Min available memory changes
- Swap threshold changes
- New constraint discovered

### Update Config

Edit `orchestration.config.json` if:
- Timeout values need adjustment
- New build flags required
- Per-tier settings change

