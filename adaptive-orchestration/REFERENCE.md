# Quick Reference: Adaptive Orchestration

## At a Glance

```
Your RAM?
  < 4 GB   → TIER=single   → Sequential
  4-8 GB   → TIER=semi     → Scout || Worker, then sequential
  ≥ 8 GB   → TIER=full     → Full parallel
```

## One-Liner Workflow

```bash
# 1. Check tier
./scripts/detect-orchestration-tier.sh

# 2. Validate system
./scripts/pre-delegation-check.sh && echo "Ready!"

# 3. Delegate based on $ORCHESTRATION_TIER
```

## Code Patterns

### Sequential (TIER=single)

```javascript
subagent({ agent: 'worker', task: 'TASK-01...' });
// ↓ wait completion
subagent({ agent: 'worker', task: 'TASK-02...' });
// ↓ wait completion
subagent({ agent: 'worker', task: 'TASK-03...' });
```

**Time**: ~16 min | **Memory Peak**: 3.5 GB

### Semi-Parallel (TIER=semi)

```javascript
subagent({
  tasks: [
    { agent: 'scout', task: 'Analyze...' },
    { agent: 'worker', task: 'TASK-01...' }
  ],
  concurrency: 2
});
subagent({ agent: 'worker', task: 'TASK-02 + TASK-03...' });
```

**Time**: ~12 min | **Memory Peak**: 4.0 GB

### Full-Parallel (TIER=full)

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

**Time**: ~7 min | **Memory Peak**: 7.8 GB

## Health Check Results

✅ **All pass** → Delegate now  
⚠️  **Warning** → Proceed with caution  
❌ **Fail** → Fix, then retry

| Check | Pass | Warning | Fail |
|-------|------|---------|------|
| Memory | ≥2GB | — | <2GB |
| Swap | <50% | 50-80% | >80% |
| Disk | ≥5GB | — | <5GB |
| Git | Clean | — | Dirty |
| VS Code | <4 procs | 4-7 procs | >7 procs |

## Config Key Fields

```json
{
  "strategies": {
    "single": {
      "maxWorkers": 1,
      "buildFlags": "--no-parallel",
      "timeoutPerTask": 900000,  // 15 min
      "sleepBetweenTasks": 5000   // 5s cleanup
    }
  }
}
```

## Troubleshooting Map

| Problem | Cause | Fix |
|---------|-------|-----|
| OOM at 95% memory | Parallel on weak machine | Force `TIER=single` |
| Subagent timeout | Insufficient RAM | `dotnet clean` + retry |
| High swap usage | <2GB available | Close VS Code |
| Health check fails | Git dirty | `git add -A && git commit` |

## Environment Variables

```bash
# Set tier manually (overrides auto-detect)
export ORCHESTRATION_TIER=single

# Set max workers (defaults to config)
export MAX_WORKERS=1

# Set build flags
export DOTNET_BUILD_FLAGS="--no-parallel"
```

## Integration Example

```bash
#!/bin/bash
set -e

# Load tier
source <(./scripts/detect-orchestration-tier.sh | grep '^ORCHESTRATION\|^MAX\|^BUILD')

# Validate
./scripts/pre-delegation-check.sh

# Delegate
case "$ORCHESTRATION_TIER" in
  single)
    echo "Sequential mode"
    subagent({ agent: 'worker', task: '...' })
    ;;
  semi)
    echo "Semi-parallel mode"
    subagent({ tasks: [...], concurrency: 2 })
    ;;
  full)
    echo "Full parallel mode"
    subagent({ tasks: [...], concurrency: 4, worktree: true })
    ;;
esac
```

## Key Metrics

| Tier | Concurrency | Time | Memory | Best For |
|------|-------------|------|--------|----------|
| Single | 1 | 16 min | 3.5 GB | Notebook (3–4 GB) |
| Semi | 2 | 12 min | 4.0 GB | Medium (4–8 GB) |
| Full | N-1 | 7 min | 7.8 GB | CI/Cloud (8+ GB) |

## Related

- `/skill:multi-agent-orchestration` — Worktrees, chains, acceptance
- Project docs: `ORCHESTRATION-GUIDE.md` (quickstart + examples)
- Strategy details: `docs/orchestration-strategy.md` (design + rationale)
