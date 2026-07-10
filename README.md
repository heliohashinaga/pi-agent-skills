# Pi Agent Skills

A collection of production-grade skills for [pi](https://github.com/earendil-works/pi) — a coding agent harness for parallel AI-assisted development.

## 📚 Skills Included

### 1. **Orchestration Advisor**
Detects machine capacity and recommends the best orchestration strategy.

- ✅ Detect current resource status (RAM, CPU cores, swap, disk)
- ✅ Recommend sequential / hybrid / parallel orchestration
- ✅ Skill entrypoint + extension implementation

**Use when**: You need a concise advisor that suggests how aggressively to orchestrate based on current machine resources.

**Links**:
- [`orchestration-advisor/skill/SKILL.md`](orchestration-advisor/skill/SKILL.md) — Skill descriptor
- [`orchestration-advisor/extension/index.ts`](orchestration-advisor/extension/index.ts) — Extension implementation
- [`orchestration-advisor/skill/orchestration.config.json`](orchestration-advisor/skill/orchestration.config.json) — Threshold configuration

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

### 3. **hledger**
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

- **Orchestration Advisor + Multi-Agent Orchestration**: resource-aware orchestration strategy plus workflow orchestration
  - See [`orchestration-advisor/skill/SKILL.md`](orchestration-advisor/skill/SKILL.md)
  - See [`multi-agent-orchestration/ORCHESTRATION-BRIDGE.md`](multi-agent-orchestration/ORCHESTRATION-BRIDGE.md)

- **Orchestration Advisor** pairs with **Multi-Agent Orchestration** when you need a lightweight strategy recommendation plus a safe multi-agent execution pattern:
  - **Advisor**: Detects available resources → recommends a strategy
  - **Multi-Agent**: Structures chains, worktrees, acceptance contracts → how to orchestrate safely

## 🧩 Extension

- [`orchestration-advisor/extension/`](orchestration-advisor/extension/) — core implementation behind the orchestration advisor skill
