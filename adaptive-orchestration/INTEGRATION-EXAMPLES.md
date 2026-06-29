# Integration Examples: Adaptive + Multi-Agent

Real workflow examples combining both skills.

---

## Example 1: Quick Check Before Delegation (Bash)

**Goal**: Detect tier, validate chain, execute safely.

**File**: `scripts/delegate-with-validation.sh`

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="${SKILL_DIR:-.}"

echo "╔═══════════════════════════════════════════╗"
echo "║ Orchestration Setup                       ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Step 1: Detect tier
echo "📊 Step 1: Detecting orchestration tier..."
eval "$(bash "$SCRIPT_DIR/detect-orchestration-tier.sh" | grep '^ORCHESTRATION\|^MAX_WORKERS\|^BUILD_FLAGS')"

echo "✅ TIER=$ORCHESTRATION_TIER (MAX_WORKERS=$MAX_WORKERS)"
echo ""

# Step 2: Run health check
echo "🏥 Step 2: Running health checks..."
if bash "$SCRIPT_DIR/pre-delegation-check.sh"; then
  echo "✅ System is healthy"
else
  echo "❌ System check failed. Fix issues above and retry."
  exit 1
fi
echo ""

# Step 3: Validate chain config
if [ -n "$CHAIN_CONFIG" ]; then
  echo "🔍 Step 3: Validating chain config..."
  node "$SCRIPT_DIR/validate-orchestration-plan.js" "$CHAIN_CONFIG" || {
    echo "⚠️  Warnings detected. Continuing anyway..."
  }
  echo ""
fi

# Step 4: Display configuration
echo "┌─────────────────────────────────────────┐"
echo "│ Orchestration Configuration              │"
echo "├─────────────────────────────────────────┤"
echo "│ Tier:        $ORCHESTRATION_TIER"
echo "│ Max Workers: $MAX_WORKERS"
echo "│ Build Flags: ${BUILD_FLAGS:-default}"
echo "│ Async:       true"
echo "│ Worktree:    $([ "$ORCHESTRATION_TIER" = "full" ] && echo "yes" || echo "no")"
echo "└─────────────────────────────────────────┘"
echo ""

# Step 5: Export and ready to delegate
export ORCHESTRATION_TIER
export MAX_WORKERS
export DOTNET_BUILD_FLAGS="$BUILD_FLAGS"

echo "🚀 Ready to delegate!"
echo ""
echo "Use in your code:"
echo "  const tier = '$ORCHESTRATION_TIER';"
echo "  const maxWorkers = $MAX_WORKERS;"
echo "  subagent({ chain, concurrency: maxWorkers, async: true, worktree: tier === 'full' });"
echo ""
```

**Usage**:
```bash
# Full validation
CHAIN_CONFIG=my-chain.json bash delegate-with-validation.sh

# Just detect
bash scripts/detect-orchestration-tier.sh

# Just validate
node scripts/validate-orchestration-plan.js my-chain.json
```

---

## Example 2: JavaScript Delegation with Tier Adaptation

**Goal**: Auto-adapt chain based on detected tier.

**File**: `scripts/delegate-tasks.js`

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Helper: Detect tier
function detectTier() {
  const script = path.join(__dirname, 'detect-orchestration-tier.sh');
  const output = execSync(`bash "${script}"`, { encoding: 'utf8' });
  
  const tier = output.match(/ORCHESTRATION_TIER=(\w+)/)?.[1];
  const maxWorkers = parseInt(output.match(/MAX_WORKERS=(\d+)/)?.[1] || '1');
  
  return { tier, maxWorkers };
}

// Helper: Build acceptance based on tier
function getAcceptanceForTier(tier, isUnitTestsOnly = true) {
  if (tier === 'single') {
    // No tests on single tier
    return { level: 'attested', criteria: [] };
  }
  
  if (tier === 'semi') {
    // Unit tests only
    return {
      level: 'checked',
      criteria: [
        {
          id: 'unit-tests',
          must: 'Unit tests pass',
          evidence: ['test-output'],
          command: 'npm test -- --testPathIgnorePatterns=integration'
        }
      ]
    };
  }
  
  // Full tier: all tests
  return {
    level: 'checked',
    criteria: [
      {
        id: 'build',
        must: 'Build succeeds',
        evidence: ['commands-run']
      },
      {
        id: 'unit-tests',
        must: 'Unit tests pass',
        evidence: ['test-output'],
        command: 'npm test -- --testPathIgnorePatterns=integration'
      },
      {
        id: 'integration-tests',
        must: 'Integration tests pass',
        evidence: ['test-output'],
        command: 'npm test -- --testPathPattern=integration'
      }
    ]
  };
}

// Helper: Build chain for tier
function getChainForTier(tier, maxWorkers) {
  if (tier === 'single') {
    // Sequential: planner, then worker, then validator
    return {
      chain: [
        {
          agent: 'planner',
          task: 'Plan the implementation with detailed steps.',
          acceptance: { level: 'attested', criteria: [] }
        },
        {
          agent: 'worker',
          task: 'Implement following the plan. Before finishing, commit: git add -A && git commit',
          acceptance: getAcceptanceForTier('single')
        },
        {
          agent: 'validator',
          task: 'Validate the implementation for correctness.',
          acceptance: { level: 'attested', criteria: [] }
        }
      ],
      async: true,
      concurrency: 1,
      worktree: false
    };
  }
  
  if (tier === 'semi') {
    // 2 parallel planners, sequential worker, then validator
    return {
      chain: [
        {
          parallel: [
            {
              agent: 'planner',
              task: 'Plan architecture and design.',
              acceptance: { level: 'attested', criteria: [] }
            },
            {
              agent: 'reviewer',
              task: 'Review the plan for issues.',
              acceptance: { level: 'attested', criteria: [] }
            }
          ]
        },
        {
          agent: 'worker',
          task: 'Implement based on plans. Before finishing, commit: git add -A && git commit',
          acceptance: getAcceptanceForTier('semi')
        },
        {
          agent: 'validator',
          task: 'Final validation.',
          acceptance: { level: 'attested', criteria: [] }
        }
      ],
      async: true,
      concurrency: 2,
      worktree: false
    };
  }
  
  // Full tier: all parallel with worktrees
  return {
    chain: [
      {
        parallel: [
          {
            agent: 'planner',
            task: 'Plan architecture and design.',
            acceptance: { level: 'attested', criteria: [] }
          },
          {
            agent: 'reviewer',
            task: 'Review plan and outline tests.',
            acceptance: { level: 'attested', criteria: [] }
          }
        ]
      },
      {
        agent: 'writer',
        task: 'Implement based on plans. Before finishing, commit: git add -A && git commit',
        acceptance: getAcceptanceForTier('full')
      },
      {
        parallel: [
          {
            agent: 'validator',
            task: 'Validate correctness and performance.',
            acceptance: { level: 'reviewed' }
          },
          {
            agent: 'validator',
            task: 'Validate edge cases and test coverage.',
            acceptance: { level: 'reviewed' }
          }
        ]
      }
    ],
    async: true,
    concurrency: maxWorkers,
    worktree: true
  };
}

// Main
async function main() {
  console.log('🔍 Detecting tier...');
  const { tier, maxWorkers } = detectTier();
  console.log(`✅ TIER=${tier}, MAX_WORKERS=${maxWorkers}\n`);
  
  console.log('🏗️  Building chain for tier...');
  const orchestrationConfig = getChainForTier(tier, maxWorkers);
  
  console.log(`
Configuration for ${tier.toUpperCase()}:
  - Concurrency: ${orchestrationConfig.concurrency}
  - Worktrees: ${orchestrationConfig.worktree}
  - Async: ${orchestrationConfig.async}
  - Stages: ${orchestrationConfig.chain.length}
`);
  
  // In real usage, you'd do:
  // const result = subagent(orchestrationConfig);
  // console.log(`Delegation ID: ${result.id}`);
  
  // For demo, just output the config
  console.log('Config ready:');
  console.log(JSON.stringify(orchestrationConfig, null, 2));
}

main().catch(console.error);
```

**Usage**:
```bash
node scripts/delegate-tasks.js
# Outputs: orchestrationConfig JSON sized for your tier
```

---

## Example 3: GitHub Actions Workflow (CI/CD)

**Goal**: Auto-tier on CI, delegate with tier-specific config.

**File**: `.github/workflows/orchestrate-ci.yml`

```yaml
name: Orchestrated CI

on: [push, pull_request]

jobs:
  detect-tier:
    runs-on: ubuntu-latest
    outputs:
      tier: ${{ steps.detect.outputs.ORCHESTRATION_TIER }}
      max_workers: ${{ steps.detect.outputs.MAX_WORKERS }}
      build_flags: ${{ steps.detect.outputs.BUILD_FLAGS }}
    steps:
      - uses: actions/checkout@v3
      
      - name: Detect orchestration tier
        id: detect
        run: |
          source ./scripts/detect-orchestration-tier.sh
          echo "ORCHESTRATION_TIER=$ORCHESTRATION_TIER" >> $GITHUB_OUTPUT
          echo "MAX_WORKERS=$MAX_WORKERS" >> $GITHUB_OUTPUT
          echo "BUILD_FLAGS=$BUILD_FLAGS" >> $GITHUB_OUTPUT
          
          echo "Detected: TIER=$ORCHESTRATION_TIER (workers=$MAX_WORKERS)"

  delegate:
    needs: detect-tier
    runs-on: ubuntu-latest
    strategy:
      matrix:
        # Can parallelize based on tier
        task: 
          - T001
          - T002
          - T003
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup environment
        run: |
          export ORCHESTRATION_TIER=${{ needs.detect-tier.outputs.tier }}
          export MAX_WORKERS=${{ needs.detect-tier.outputs.max_workers }}
          export DOTNET_BUILD_FLAGS="${{ needs.detect-tier.outputs.build_flags }}"
          
          echo "TIER: $ORCHESTRATION_TIER"
          echo "Workers: $MAX_WORKERS"
          echo "Flags: $DOTNET_BUILD_FLAGS"
      
      - name: Run health checks
        run: ./scripts/pre-delegation-check.sh
      
      - name: Run task
        run: |
          # Task logic here
          dotnet build ${{ needs.detect-tier.outputs.build_flags }}
          dotnet test
```

---

## Example 4: Adaptive Validation + Template Application

**Goal**: Validate chain, then apply tier-specific acceptance template.

**File**: `scripts/apply-tier-acceptance.js`

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Detect tier
const tier = process.env.ORCHESTRATION_TIER || 
  require('child_process').execSync('./scripts/detect-orchestration-tier.sh').toString()
    .match(/ORCHESTRATION_TIER=(\w+)/)?.[1] || 'single';

console.log(`Applying acceptance for TIER=${tier}\n`);

// Load chain template
const chainPath = process.argv[2] || 'chain.json';
let chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));

// Load tier-specific acceptance template
const templatePath = path.join(__dirname, '..', 'templates', `acceptance-${tier === 'full' ? 'full' : tier === 'semi' ? 'checked' : 'attested'}.json`);
let acceptanceTemplate = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

// Apply to all workers in chain
function applyAcceptance(steps) {
  if (!Array.isArray(steps)) return;
  
  steps.forEach(step => {
    if (step.parallel) {
      applyAcceptance(step.parallel);
    } else if (step.chain) {
      applyAcceptance(step.chain);
    } else if (step.agent === 'worker' && !step.acceptance) {
      step.acceptance = acceptanceTemplate;
      console.log(`✅ Applied acceptance to ${step.agent}`);
    }
  });
}

const steps = chain.chain || chain;
applyAcceptance(steps);

// Save result
const outPath = `chain-${tier}.json`;
fs.writeFileSync(outPath, JSON.stringify(chain, null, 2));
console.log(`\n✅ Saved to: ${outPath}`);
```

**Usage**:
```bash
node scripts/apply-tier-acceptance.js chain.json
# Output: chain-single.json (with attested acceptance)
# Or: chain-semi.json, chain-full.json
```

---

## Example 5: Tier-Aware Troubleshooting

**Goal**: When delegation fails, diagnose by tier.

**File**: `scripts/diagnose-failure.sh`

```bash
#!/bin/bash

set -e

SKILL_DIR="${SKILL_DIR:-.}"
RUN_ID="${1:-}"

if [ -z "$RUN_ID" ]; then
  echo "Usage: $0 <run-id>"
  exit 1
fi

echo "📋 Diagnosing failure for run: $RUN_ID"
echo ""

# Get current tier
eval "$(bash "$SKILL_DIR/scripts/detect-orchestration-tier.sh" | grep '^ORCHESTRATION_TIER\|^MAX_WORKERS')"

echo "🔍 Current: TIER=$ORCHESTRATION_TIER, MAX_WORKERS=$MAX_WORKERS"
echo ""

# Check run status
echo "Checking run status..."
RESULT=$(node -e "
  // In real usage, you'd fetch run status from subagent API
  console.log('status: failed');
  console.log('reason: timed out at 95% memory');
")

echo "$RESULT"
echo ""

# Recommend fix based on tier
echo "💡 Recommended fixes for TIER=$ORCHESTRATION_TIER:"
echo ""

case "$ORCHESTRATION_TIER" in
  single)
    echo "✓ Single tier runs sequential. If OOM:"
    echo "  1. Kill background processes: pkill -f 'code-server'"
    echo "  2. Drop acceptance level to 'attested' (no tests)"
    echo "  3. Split task into smaller pieces"
    ;;
  semi)
    echo "✓ Semi tier allows 2 parallel. If OOM:"
    echo "  1. Reduce concurrency to 1"
    echo "  2. Drop integration tests (unit tests only)"
    echo "  3. Check: concurrency should be exactly 2"
    ;;
  full)
    echo "✓ Full tier allows N parallel. If OOM:"
    echo "  1. Reduce concurrency (try 4, not 8)"
    echo "  2. Remove worktrees (use temp dirs instead)"
    echo "  3. Drop integration tests"
    ;;
esac

echo ""
echo "📖 See multi-agent-orchestration/TROUBLESHOOTING.md for full guide."
```

**Usage**:
```bash
bash scripts/diagnose-failure.sh <run-id>
# Suggests fixes based on your tier
```

---

## Example 6: Full Integration: Detect → Validate → Execute

**File**: `orchestrate.js` (top-level runner)

```javascript
#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

async function orchestrate() {
  console.log('═══════════════════════════════════════════');
  console.log('  Orchestrated Delegation');
  console.log('═══════════════════════════════════════════');
  console.log('');
  
  // Step 1: Detect tier
  console.log('1️⃣  Detecting tier...');
  const tierOutput = execSync('./scripts/detect-orchestration-tier.sh', { encoding: 'utf8' });
  const tier = tierOutput.match(/ORCHESTRATION_TIER=(\w+)/)?.[1] || 'single';
  const maxWorkers = parseInt(tierOutput.match(/MAX_WORKERS=(\d+)/)?.[1] || '1');
  
  console.log(`   TIER=${tier}, MAX_WORKERS=${maxWorkers}`);
  console.log('');
  
  // Step 2: Health check
  console.log('2️⃣  Running health checks...');
  try {
    execSync('./scripts/pre-delegation-check.sh', { stdio: 'inherit' });
    console.log('   ✅ System healthy');
  } catch (e) {
    console.error('   ❌ System check failed');
    process.exit(1);
  }
  console.log('');
  
  // Step 3: Load and validate chain
  console.log('3️⃣  Loading chain configuration...');
  const chainPath = process.argv[2] || 'chain.json';
  const chain = require(path.resolve(chainPath));
  console.log(`   Loaded: ${chainPath}`);
  console.log('');
  
  console.log('4️⃣  Validating chain for tier...');
  try {
    execSync(`node ./scripts/validate-orchestration-plan.js "${chainPath}"`, { stdio: 'inherit' });
    console.log('   ✅ Chain is valid');
  } catch (e) {
    console.warn('   ⚠️  Validation warnings (continuing anyway)');
  }
  console.log('');
  
  // Step 5: Apply tier constraints
  console.log('5️⃣  Applying tier constraints...');
  const orchestrationConfig = {
    ...chain,
    concurrency: maxWorkers,
    async: true,
    worktree: tier === 'full'
  };
  console.log(`   concurrency=${orchestrationConfig.concurrency}`);
  console.log(`   worktree=${orchestrationConfig.worktree}`);
  console.log('');
  
  // Step 6: Ready to delegate
  console.log('═══════════════════════════════════════════');
  console.log('  Ready to delegate!');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('Config:');
  console.log(JSON.stringify(orchestrationConfig, null, 2));
  console.log('');
  
  // In real usage:
  // const result = await subagent(orchestrationConfig);
  // console.log(`Delegated with ID: ${result.id}`);
}

orchestrate().catch(console.error);
```

**Usage**:
```bash
node orchestrate.js chain.json
# Outputs: Full orchestration ready to go
```

---

## Checklist: Integration Complete

- ✅ Detect tier (`./scripts/detect-orchestration-tier.sh`)
- ✅ Run health checks (`./scripts/pre-delegation-check.sh`)
- ✅ Validate chain (`node ./scripts/validate-orchestration-plan.js`)
- ✅ Apply tier constraints (concurrency, worktrees, acceptance level)
- ✅ Use tier-specific chain pattern (from ORCHESTRATION-BRIDGE.md)
- ✅ Execute with `async: true`
- ✅ Monitor via `subagent({ action: 'status', id })`

---

## Related Resources

- **ORCHESTRATION-BRIDGE.md** — 3-step workflow, preset combinations
- **adaptive-orchestration/README.md** — Tier detection deep dive
- **multi-agent-orchestration/REFERENCE.md** — Pattern lookup
- **multi-agent-orchestration/templates/** — Copy-paste configs
