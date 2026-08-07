---
name: orchestration-advisor
description: |
  Detects machine capacity (cgroup/meminfo, CPU, swap, disk) and recommends an orchestration tier (single/semi/full), strategy (sequential/hybrid/parallel), and worker parallelism. Use before launching multi-agent work to choose sequential vs parallel fanout.
---

# Orchestration Advisor

Use `/orchestration-advisor advise` to inspect the current machine and get a recommended orchestration strategy.

The Pi extension provides the implementation.
