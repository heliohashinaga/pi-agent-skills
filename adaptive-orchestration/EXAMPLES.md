# Integration Examples

## Example 1: Simple Bash Integration

**File**: `scripts/delegate-with-tier.sh`

```bash
#!/bin/bash
set -e

# Source the skill scripts
SKILL_DIR="/home/helio/.pi/agent/skills/adaptive-orchestration"

# 1. Detect tier
echo "Detecting orchestration tier..."
eval "$("$SKILL_DIR/scripts/detect-orchestration-tier.sh" | grep '^ORCHESTRATION\|^MAX\|^BUILD')"

# 2. Run health check
echo ""
echo "Running health checks..."
"$SKILL_DIR/scripts/pre-delegation-check.sh"

# 3. Show what we're about to do
echo ""
echo "┌─────────────────────────────────────────┐"
echo "│ Orchestration Configuration              │"
echo "├─────────────────────────────────────────┤"
echo "│ Tier:        $ORCHESTRATION_TIER"
echo "│ Max Workers: $MAX_WORKERS"
echo "│ Build Flags: ${BUILD_FLAGS:-default}"
echo "└─────────────────────────────────────────┘"
echo ""

# 4. Export to environment
export ORCHESTRATION_TIER
export MAX_WORKERS
export DOTNET_BUILD_FLAGS="$BUILD_FLAGS"

# 5. Delegate (example)
case "$ORCHESTRATION_TIER" in
  single)
    echo "🔁 Sequential Mode (1 worker)"
    # Run tasks sequentially
    node scripts/delegate-tasks.js --mode sequential
    ;;
  semi)
    echo "⚡ Semi-Parallel Mode (2 workers)"
    node scripts/delegate-tasks.js --mode semi-parallel
    ;;
  full)
    echo "🚀 Full-Parallel Mode ($MAX_WORKERS workers)"
    node scripts/delegate-tasks.js --mode full-parallel
    ;;
esac

echo ""
echo "✅ Delegation complete!"
```

**Usage**:
```bash
chmod +x scripts/delegate-with-tier.sh
./scripts/delegate-with-tier.sh
```

---

## Example 2: JavaScript Integration

**File**: `scripts/delegate-tasks.js`

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SKILL_DIR = '/home/helio/.pi/agent/skills/adaptive-orchestration';

// Load config
const config = JSON.parse(
  fs.readFileSync(path.join(SKILL_DIR, 'orchestration.config.json'), 'utf8')
);

// Read tier from env or auto-detect
let tier = process.env.ORCHESTRATION_TIER;
if (!tier) {
  const output = execSync(`bash "${SKILL_DIR}/scripts/detect-orchestration-tier.sh"`).toString();
  const match = output.match(/ORCHESTRATION_TIER=(\w+)/);
  tier = match ? match[1] : 'single';
}

const strategy = config.strategies[tier];
const maxWorkers = parseInt(process.env.MAX_WORKERS) || strategy.maxWorkers || 1;

console.log(`\n📊 Using ${tier} strategy`);
console.log(`   Name: ${strategy.name}`);
console.log(`   Workers: ${maxWorkers}`);
console.log(`   Timeout: ${strategy.timeoutPerTask}ms\n`);

// Tasks to delegate
const tasks = [
  { id: 'TASK-01', title: 'Audit persistence' },
  { id: 'TASK-02', title: 'Mock configuration' },
  { id: 'TASK-03', title: 'DI wiring' }
];

// Delegate based on tier
if (tier === 'single') {
  delegateSequential(tasks, strategy);
} else if (tier === 'semi') {
  delegateSemiParallel(tasks, strategy);
} else {
  delegateFullParallel(tasks, strategy, maxWorkers);
}

function delegateSequential(tasks, strategy) {
  console.log('🔁 Sequential execution:\n');
  
  tasks.forEach((task, idx) => {
    console.log(`  ${idx + 1}/${tasks.length} Running ${task.id} (${task.title})`);
    
    // Sleep between tasks to let cleanup happen
    if (idx > 0) {
      const sleepMs = strategy.sleepBetweenTasks;
      console.log(`     Waiting ${sleepMs}ms for cleanup...\n`);
    }
    
    // Real delegation would happen here:
    // subagent({ agent: 'worker', task: `Implement ${task.id}...` })
  });
}

function delegateSemiParallel(tasks, strategy) {
  console.log('⚡ Semi-parallel execution (Scout || Worker → Sequential):\n');
  
  // Phase 1: Scout + first worker parallel
  console.log(`  PHASE 1: Scout || ${tasks[0].id} (parallel)`);
  // subagent({ tasks: [...], concurrency: 2 })
  
  // Phase 2: Remaining tasks sequential
  console.log(`  PHASE 2: ${tasks.slice(1).map(t => t.id).join(' → ')} (sequential)\n`);
}

function delegateFullParallel(tasks, strategy, maxWorkers) {
  console.log(`🚀 Full-parallel execution (${maxWorkers} workers, worktrees):\n`);
  
  console.log(`  Running all ${tasks.length} tasks simultaneously:`);
  tasks.forEach(task => console.log(`    • ${task.id}`));
  console.log('');
  
  // Real delegation:
  // subagent({
  //   tasks: [...],
  //   concurrency: maxWorkers,
  //   worktree: true
  // })
}
```

**Usage**:
```bash
chmod +x scripts/delegate-tasks.js
ORCHESTRATION_TIER=single node scripts/delegate-tasks.js
```

---

## Example 3: GitHub Actions CI/CD

**File**: `.github/workflows/ci.yml`

```yaml
name: CI with Adaptive Orchestration

on:
  push:
    branches: [main]
  pull_request:

jobs:
  detect-tier:
    runs-on: ubuntu-latest
    outputs:
      tier: ${{ steps.detect.outputs.tier }}
      workers: ${{ steps.detect.outputs.workers }}
    steps:
      - uses: actions/checkout@v3
      
      - name: Detect orchestration tier
        id: detect
        run: |
          # GitHub Actions: 11 GB RAM, 4 cores → TIER=full
          TIER=full
          WORKERS=3
          
          echo "tier=$TIER" >> $GITHUB_OUTPUT
          echo "workers=$WORKERS" >> $GITHUB_OUTPUT
          echo "Detected: $TIER tier with $WORKERS workers"

  build:
    needs: detect-tier
    runs-on: ubuntu-latest
    env:
      ORCHESTRATION_TIER: ${{ needs.detect-tier.outputs.tier }}
      MAX_WORKERS: ${{ needs.detect-tier.outputs.workers }}
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup .NET
        uses: actions/setup-dotnet@v3
        with:
          dotnet-version: '10.0'
      
      - name: Restore
        run: dotnet restore
      
      - name: Build (tier: ${{ env.ORCHESTRATION_TIER }})
        run: |
          if [ "$ORCHESTRATION_TIER" = "full" ]; then
            dotnet build --no-restore --no-parallel
          else
            dotnet build --no-restore --no-parallel
          fi
      
      - name: Delegate tests
        run: |
          # Use adaptive tier
          echo "Running tests with $MAX_WORKERS workers"
          dotnet test tests/YourProject.Tests.Unit
          dotnet test tests/YourProject.Tests.Contract
```

---

## Example 4: Multi-Project Setup

**File**: `Makefile` (for local development)

```makefile
.PHONY: detect health-check build delegate clean

SKILL_DIR := /home/helio/.pi/agent/skills/adaptive-orchestration
TIER ?= $(shell bash $(SKILL_DIR)/scripts/detect-orchestration-tier.sh | grep ORCHESTRATION_TIER | cut -d= -f2)

detect:
	@bash $(SKILL_DIR)/scripts/detect-orchestration-tier.sh
	@echo ""
	@echo "Use: make delegate TIER=$(TIER)"

health-check:
	@bash $(SKILL_DIR)/scripts/pre-delegation-check.sh

build: health-check
	@echo "Building with TIER=$(TIER)"
	dotnet build $(DOTNET_BUILD_FLAGS)

delegate: health-check
	@node scripts/delegate-tasks.js

clean:
	dotnet clean
	rm -rf bin obj
	@echo "Cleaned. Ready for delegation."

# Combined workflow
workflow: clean detect health-check delegate
	@echo "✅ Workflow complete"
```

**Usage**:
```bash
make detect        # Show tier
make health-check  # Validate system
make delegate      # Delegate with auto-tier
make workflow      # Full process (clean → detect → check → delegate)
```

---

## Example 5: Copy to Project

**Setup Script**: `scripts/setup-orchestration.sh`

```bash
#!/bin/bash
set -e

SKILL_DIR="/home/helio/.pi/agent/skills/adaptive-orchestration"

echo "📋 Setting up adaptive orchestration..."

# 1. Create scripts directory
mkdir -p scripts

# 2. Copy detection script
cp "$SKILL_DIR/scripts/detect-orchestration-tier.sh" scripts/
chmod +x scripts/detect-orchestration-tier.sh

# 3. Copy health check
cp "$SKILL_DIR/scripts/pre-delegation-check.sh" scripts/
chmod +x scripts/pre-delegation-check.sh

# 4. Copy config
cp "$SKILL_DIR/orchestration.config.json" ./

# 5. Show status
echo ""
echo "✅ Setup complete!"
echo ""
echo "Quick start:"
echo "  ./scripts/detect-orchestration-tier.sh"
echo "  ./scripts/pre-delegation-check.sh"
echo ""
echo "Next: Copy delegate-tasks.js example to scripts/"
```

**Run once**:
```bash
bash scripts/setup-orchestration.sh
```

---

## Example 6: Docker Multi-Stage Build

**File**: `Dockerfile` (for CI container)

```dockerfile
# Build stage 1: Detect tier and prepare
FROM ubuntu:24.04 AS detect
WORKDIR /app
COPY scripts scripts/
COPY orchestration.config.json .
RUN chmod +x scripts/*.sh
RUN bash scripts/detect-orchestration-tier.sh > /tier.env

# Build stage 2: Actual build
FROM mcr.microsoft.com/dotnet/sdk:10
WORKDIR /app
COPY . .
COPY --from=detect /tier.env .

# Source tier and build
RUN source tier.env && \
    echo "Building with TIER=$ORCHESTRATION_TIER" && \
    dotnet build $BUILD_FLAGS

# Test stage
RUN dotnet test tests/YourProject.Tests.Unit
```

**Build & run**:
```bash
docker build -t my-app .
docker run my-app
```

