# Pi Agent Skills

A collection of production-grade skills for [pi](https://github.com/earendil-works/pi) — a coding agent harness for parallel AI-assisted development.

## 📚 Skills Included

### 1. **Adaptive Orchestration**
Tier-aware subagent delegation with automatic resource detection.

- ✅ Sequential, semi-parallel, or full-parallel execution
- ✅ Auto-detect system resources (RAM, CPU cores, swap)
- ✅ Health checks before delegation
- ✅ CI/CD integration (GitHub Actions, local machines)
- ✅ Auto-downgrade on memory pressure

**Use when**: You need to delegate work to subagents but want to avoid OOM crashes and optimize concurrency based on available resources.

**Links**:
- [`adaptive-orchestration/SKILL.md`](adaptive-orchestration/SKILL.md) — Skill descriptor
- [`adaptive-orchestration/README.md`](adaptive-orchestration/README.md) — Quick start
- [`adaptive-orchestration/REFERENCE.md`](adaptive-orchestration/REFERENCE.md) — Pattern lookup

---

### 2. **Multi-Agent Orchestration**
Playbook for orchestrating pi-subagents safely with worktrees, chains, and acceptance contracts.

- ✅ Async-default execution patterns
- ✅ Single-writer worktree isolation
- ✅ Explicit acceptance contracts
- ✅ Decision-rule prompting (avoid escalations)
- ✅ Planner → Writer → Validator chains

**Use when**: You need structured multi-agent workflows with parallel review, chained dependencies, and durable output merging.

**Links**:
- [`multi-agent-orchestration/SKILL.md`](multi-agent-orchestration/SKILL.md) — Skill descriptor
- [`multi-agent-orchestration/README.md`](multi-agent-orchestration/README.md) — Quick start
- [`multi-agent-orchestration/REFERENCE.md`](multi-agent-orchestration/REFERENCE.md) — Pattern lookup
- [`multi-agent-orchestration/TROUBLESHOOTING.md`](multi-agent-orchestration/TROUBLESHOOTING.md) — Common issues

---

### 3. **Dev Toolbox**
Personal developer-tooling playbook for environment audits and CLI tool selection.

- ✅ Discover installed CLI tools
- ✅ Choose the best tool for the job
- ✅ Explain fallbacks when preferred utilities are missing
- ✅ WSL/Linux/Windows path guidance
- ✅ Separate reusable workflows from project-specific instructions

**Use when**: You need to audit environment setup, pick the right CLI tool, or troubleshoot PATH/package-manager issues.

**Links**:
- [`dev-toolbox/SKILL.md`](dev-toolbox/SKILL.md) — Skill descriptor

---

### 4. **hledger**
hledger accounting commands for managing personal and small business finances.

- ✅ Run reports (balance, register, incomestatement, cashflow, balancesheet)
- ✅ Import CSV bank transactions with reconciliation rules
- ✅ Add/edit journal entries
- ✅ Check and validate ledger integrity
- ✅ Generic account structure with [BANK_NAME], [BROKER_NAME] placeholders
- ✅ Ready-to-use scripts (import, validate, monthly reports)

**Use when**: You need to manage personal or business finances with double-entry accounting, import bank CSV transactions, generate reports, or validate ledger entries.

**Links**:
- [`hledger/SKILL.md`](hledger/SKILL.md) — Skill descriptor & commands
- [`hledger/scripts/`](hledger/scripts/) — Utility scripts (import-csv.sh, validate.sh, monthly-report.sh)

---

## 🔗 Integration

These skills are designed to work together:

- **Adaptive Orchestration + Multi-Agent Orchestration**: Combined resource-aware orchestration
  - See [`adaptive-orchestration/ORCHESTRATION-BRIDGE.md`](adaptive-orchestration/ORCHESTRATION-BRIDGE.md)
  - See [`multi-agent-orchestration/ORCHESTRATION-BRIDGE.md`](multi-agent-orchestration/ORCHESTRATION-BRIDGE.md)

- **Adaptive Orchestration** pairs with **Multi-Agent Orchestration** for complete resource-aware delegation:
  - **Adaptive**: Detects what resources are available → which tier to use
  - **Multi-Agent**: Structures chains, worktrees, acceptance contracts → how to orchestrate safely
