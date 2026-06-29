#!/usr/bin/env node

/**
 * Validates a Multi-Agent chain against current Adaptive tier.
 * 
 * Usage:
 *   node validate-orchestration-plan.js <chain-config.json>
 *   node validate-orchestration-plan.js                      (auto-detect from env)
 * 
 * What it checks:
 *   - Concurrency <= MAX_WORKERS for this tier
 *   - Acceptance contracts align with tier (no heavy tests on single tier)
 *   - Worktrees only on TIER=full
 *   - All workers instructed to commit
 *   - No multiple writers without worktrees
 * 
 * Exits with:
 *   0 = All checks pass
 *   1 = Critical errors found
 *   2 = Warnings (pass but with caution)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for output
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(msg, color = RESET) {
  console.log(`${color}${msg}${RESET}`);
}

function detectTier() {
  try {
    const script = path.join(__dirname, 'detect-orchestration-tier.sh');
    const output = execSync(`bash "${script}"`, { encoding: 'utf8' });
    const lines = output.split('\n');
    
    const tier = lines.find(l => l.startsWith('ORCHESTRATION_TIER='))?.split('=')[1];
    const maxWorkers = parseInt(
      lines.find(l => l.startsWith('MAX_WORKERS='))?.split('=')[1] || '1'
    );
    
    return { tier, maxWorkers };
  } catch (e) {
    console.error('Failed to detect tier. Make sure detect-orchestration-tier.sh is in scripts/');
    process.exit(1);
  }
}

function readChain(chainPath) {
  try {
    const content = fs.readFileSync(chainPath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Failed to read chain config: ${e.message}`);
    process.exit(1);
  }
}

function flattenChain(chain) {
  // Flatten nested parallel/chain structure into list of tasks
  const tasks = [];
  
  function walk(steps, isParallel = false) {
    if (!Array.isArray(steps)) return;
    
    steps.forEach(step => {
      if (step.parallel) {
        walk(step.parallel, true);
      } else if (step.chain) {
        walk(step.chain, false);
      } else if (step.agent) {
        tasks.push({ ...step, isParallel });
      }
    });
  }
  
  if (Array.isArray(chain)) {
    walk(chain, false);
  } else if (chain.chain) {
    walk(chain.chain, false);
  }
  
  return tasks;
}

function validate(tier, maxWorkers, chain) {
  let errors = [];
  let warnings = [];
  
  const config = chain.chain || chain;
  const concurrency = chain.concurrency || 1;
  const worktree = chain.worktree ?? false;
  const async_ = chain.async ?? false;
  
  // Check 1: Async by default
  if (!async_) {
    warnings.push('⚠️  async: false (foreground) — worktrees will be discarded. Consider async: true');
  }
  
  // Check 2: Concurrency vs tier
  if (concurrency > maxWorkers) {
    errors.push(
      `❌ concurrency=${concurrency} exceeds tier limit (maxWorkers=${maxWorkers}). ` +
      `TIER=${tier} cannot handle this many parallel workers.`
    );
  }
  
  // Check 3: Worktrees on single tier
  if (worktree && tier === 'single') {
    errors.push(
      `❌ worktree: true on TIER=single (< 4GB RAM) — will cause OOM. ` +
      `Either upgrade tier or set worktree: false`
    );
  }
  
  // Check 4: Acceptance levels vs tier
  const tasks = flattenChain(config);
  const integrationTestTasks = tasks.filter(t =>
    t.acceptance?.criteria?.some(c => 
      c.id?.includes('integration') || c.must?.includes('integration')
    )
  );
  
  if (tier === 'single' && integrationTestTasks.length > 0) {
    warnings.push(
      `⚠️  Integration tests in acceptance on TIER=single. ` +
      `${integrationTestTasks.length} task(s) will likely timeout. ` +
      `Drop to unit tests only (use acceptance-checked.json template).`
    );
  }
  
  // Check 5: Missing explicit acceptance
  const tasksWithoutAcceptance = tasks.filter(t => !t.acceptance);
  if (tasksWithoutAcceptance.length > 0) {
    warnings.push(
      `⚠️  ${tasksWithoutAcceptance.length} task(s) missing explicit acceptance. ` +
      `Will use inferred policy (may reject green builds). ` +
      `Always pass explicit acceptance contract.`
    );
  }
  
  // Check 6: Worker commits
  const workers = tasks.filter(t => t.agent === 'worker' && async_);
  const workersWithoutCommitInstruction = workers.filter(t => 
    !t.task?.includes('git commit') && !t.task?.includes('git add')
  );
  
  if (workersWithoutCommitInstruction.length > 0) {
    warnings.push(
      `⚠️  ${workersWithoutCommitInstruction.length} worker(s) may not commit. ` +
      `Instruct them: "Before finishing, run: git add -A && git commit"`
    );
  }
  
  // Check 7: Multiple writers detection (heuristic)
  const writers = tasks.filter(t => 
    (t.agent?.includes('worker') || t.agent?.includes('writer')) && !t.isParallel
  );
  
  if (writers.length > 1 && !worktree) {
    errors.push(
      `❌ Multiple writers (${writers.length}) without worktrees. ` +
      `Either: (a) use worktree: true, or (b) make sequential, or (c) mark non-writers as read-only. ` +
      `See Rule #2: One writer per worktree.`
    );
  }
  
  // Check 8: Tier recommendations
  if (tier === 'semi' && concurrency > 2) {
    errors.push(
      `❌ concurrency=${concurrency} but TIER=semi maxes at 2. Use concurrency: 2 (scout + worker parallel).`
    );
  }
  
  return { errors, warnings };
}

// Main
function main() {
  let chainPath = process.argv[2];
  
  // Auto-detect from env if not provided
  if (!chainPath && process.env.CHAIN_CONFIG) {
    chainPath = process.env.CHAIN_CONFIG;
  }
  
  // Detect tier
  const { tier, maxWorkers } = detectTier();
  log(`\n${BOLD}Orchestration Tier${RESET}: TIER=${tier}, MAX_WORKERS=${maxWorkers}\n`);
  
  // Read chain
  if (!chainPath) {
    log(`${RED}Usage: node validate-orchestration-plan.js <chain-config.json>${RESET}`);
    log(`   or: CHAIN_CONFIG=chain.json node validate-orchestration-plan.js`);
    process.exit(2);
  }
  
  log(`Reading chain from: ${chainPath}`);
  const chain = readChain(chainPath);
  
  // Validate
  const { errors, warnings } = validate(tier, maxWorkers, chain);
  
  // Report
  console.log('');
  if (errors.length === 0 && warnings.length === 0) {
    log(`${GREEN}✅ Chain is fully compatible with TIER=${tier}${RESET}`);
    process.exit(0);
  }
  
  if (errors.length > 0) {
    log(`${RED}❌ ${errors.length} critical error(s):${RESET}`);
    errors.forEach(e => log(`   ${e}`));
  }
  
  if (warnings.length > 0) {
    log(`${YELLOW}⚠️  ${warnings.length} warning(s):${RESET}`);
    warnings.forEach(w => log(`   ${w}`));
  }
  
  console.log('');
  log(`See ORCHESTRATION-BRIDGE.md for tier-specific patterns.`);
  
  // Exit code
  if (errors.length > 0) {
    process.exit(1);
  } else if (warnings.length > 0) {
    process.exit(2);
  }
  
  process.exit(0);
}

main();
