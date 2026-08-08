# Agent-Based Software Development Factory

## Overview

The development factory is split into two workflows:

1. **Specification Workflow** — transforms an idea/request into an approved, testable specification.
2. **Development Workflow** — transforms the approved specification into a validated implementation.

The architecture intentionally keeps the number of agent roles small. `simple`, `standard`, and `complex` are **execution capability levels**, not separate agents.

---

## 1. Specification Workflow

```text
Idea / Request
      ↓
Spec Agent
      ↓
Requirements Reviewer
      ├── REJECT → Spec Agent
      └── APPROVE
            ↓
       Approved Spec
```

### Spec Agent

Uses SpecKit to produce:

- `spec`
- `plan`
- `tasks`
- `acceptance criteria`
- `definition of done`

Primary responsibility:

> Define **what** needs to be built and **why**.

The Spec Agent should not perform detailed codebase-specific technical planning.

### Requirements Reviewer

Validates the specification before development starts.

Checks:

- clarity;
- completeness;
- consistency;
- testability;
- contradictions;
- missing edge cases;
- alignment between tasks and acceptance criteria;
- whether the Definition of Done is coherent.

It does **not** perform implementation planning.

Output:

```text
APPROVED
```

or:

```text
REJECTED
→ feedback to Spec Agent
```

---

# 2. Development Workflow

```text
Approved Spec
      ↓
Orchestrator
      ↓
Technical Planner
      ↓
Technical Assessment
      ↓
Orchestrator
      ↓
Code Worker
      ↓
Code Reviewer
      ↓
Test Engineer
      ↓
Test Runner / Validator
      ↓
Security Reviewer
      ↓
PR / Merge
```

---

## 3. Orchestrator

The Orchestrator is the **workflow decision-maker and router**.

It does not perform all specialized work itself.

Responsibilities:

- decide whether technical planning is necessary;
- consume the Technical Assessment;
- determine task complexity;
- choose execution depth;
- choose model/capability level;
- determine which steps are required;
- determine testing depth;
- determine security review depth;
- control retries and iteration budgets;
- route work to the appropriate agent.

Example:

```yaml
execution:
  code:
    level: complex

  code_review:
    level: standard

  testing:
    level: complex
    e2e: true
    regression: true

  security:
    level: deep
```

The Orchestrator answers:

> **How should the factory execute this work?**

---

# 4. Technical Planner

The Technical Planner performs **technical refinement**.

It receives:

- approved specification;
- acceptance criteria;
- Definition of Done;
- existing plan/tasks;
- codebase and architecture context.

It answers:

> **How should this requirement be implemented in this codebase?**

Responsibilities:

- analyze the existing codebase;
- identify affected files/components/services;
- understand dependencies;
- identify APIs, databases, events and integrations involved;
- define implementation approach;
- identify technical subtasks;
- identify technical risks;
- define test scope;
- assess security surface;
- assess architecture impact;
- determine whether work can be parallelized.

It does not:

- define business requirements;
- change acceptance criteria;
- implement code;
- perform final code review;
- orchestrate the workflow.

### Technical Assessment

Example:

```yaml
technical_assessment:
  complexity: complex

  scope:
    files: 12
    components: 4
    services: 2

  architecture_impact: medium

  technical_risk: high

  change_types:
    - api
    - database
    - async

  test_scope:
    unit: true
    integration: true
    e2e: true
    regression: true

  security_surface:
    authentication: false
    authorization: true
    sensitive_data: true
    external_input: true

  implementation:
    parallelizable: true
    subtasks: 4
```

The Technical Planner provides **signals**. The Orchestrator converts those signals into execution decisions.

---

# 5. Code Worker

There is a single Code Worker role.

It can operate at different capability levels:

```text
simple
standard
complex
```

The level may control:

- model;
- token budget;
- tool access;
- maximum iterations;
- reasoning depth.

Responsibilities:

- implement the technical plan;
- modify the codebase;
- create relevant unit tests alongside implementation;
- run basic local validation where appropriate.

The Code Worker does not own final acceptance validation.

---

# 6. Code Reviewer

There is a single Code Reviewer role.

It validates the implementation against:

- Technical Plan;
- architecture;
- coding standards;
- maintainability;
- correctness;
- potential bugs;
- regressions;
- error handling;
- implementation quality.

It can also have capability levels:

```text
shallow
standard
deep
```

The Code Reviewer reviews the implementation; it does not replace the Tester.

---

# 7. Test Engineer

The Test Engineer is responsible for **designing and implementing automated tests**.

It receives:

- Acceptance Criteria;
- Definition of Done;
- Technical Plan;
- implemented code.

Responsibilities:

- determine required test coverage;
- create new tests;
- update existing tests;
- create automation;
- identify regression scenarios;
- create E2E tests when necessary.

Test types can include:

```text
Unit
Integration
API / System
Browser E2E
Regression
```

These are test strategies, not separate agents.

Example:

```yaml
test_plan:
  unit: true
  integration: true
  api: false
  browser_e2e: true
  regression: true
```

The Code Worker may create unit tests related directly to its implementation. The Test Engineer provides an independent testing perspective and additional coverage.

---

# 8. Test Runner / Validator

The Test Runner is intentionally separate from the Test Engineer.

```text
Test Engineer
      ↓
creates/updates tests
      ↓
Test Runner
      ↓
executes tests
      ↓
collects evidence
      ↓
validates result
```

Responsibilities:

- build;
- execute unit tests;
- execute integration tests;
- execute API/system tests;
- execute browser E2E tests;
- execute regression suites;
- collect logs;
- collect screenshots/traces where applicable;
- distinguish application failures from infrastructure/test-environment failures;
- produce deterministic test results.

The Test Runner should rely on deterministic tooling as much as possible.

LLM usage should focus on interpretation and diagnosis rather than simply executing test commands.

Example output:

```yaml
result: failed

tests:
  passed: 42
  failed: 1

acceptance_criteria:
  AC1: passed
  AC2: failed

failure:
  test: password_reset_invalid_token
  reason: "API returns 500 instead of 400"
```

---

# 9. Security Reviewer

Use a single Security Reviewer instead of separate Security Triage and Security Deep agents initially.

The Orchestrator determines the review depth from the Technical Assessment.

Possible levels:

```text
shallow
standard
deep
```

The Technical Planner provides security signals such as:

```yaml
security_surface:
  authentication: true
  authorization: true
  sensitive_data: true
  external_input: true

technical_risk: high
```

The Orchestrator can then select:

```yaml
security:
  level: deep
```

For a low-risk change:

```yaml
security:
  level: shallow
```

A separate cheap Security Triage can be introduced later if measurements show that it significantly reduces cost by avoiding expensive deep reviews.

---

# 10. Capability Levels

Do not create separate agents for every complexity level.

Avoid:

```text
code-simple
code-complex
tester-simple
tester-complex
security-triage
security-deep
```

Prefer:

```text
Code Worker
  └── capability: simple | standard | complex

Code Reviewer
  └── capability: shallow | standard | deep

Test Engineer
  └── capability: simple | standard | complex

Security Reviewer
  └── capability: shallow | standard | deep
```

A capability level can determine:

```text
Model
Token Budget
Tool Access
Iteration Limit
Reasoning Depth
Timeout
```

This keeps the architecture stable while allowing the Orchestrator to optimize cost and latency.

---

# 11. Final Architecture

```text
                    ┌──────────────────────┐
                    │  SPECIFICATION FLOW  │
                    └──────────────────────┘

                         Idea / Request
                              │
                              ▼
                        ┌───────────┐
                        │ Spec Agent│
                        └─────┬─────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ Requirements Reviewer│
                   └──────────┬──────────┘
                              │
                         APPROVED SPEC
                              │
══════════════════════════════╪══════════════════════════════
                              │
                              ▼
                     ┌────────────────┐
                     │  Orchestrator  │
                     └───────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │Technical Planner│
                    └───────┬─────────┘
                            │
                    Technical Assessment
                            │
                            ▼
                     ┌────────────────┐
                     │  Orchestrator  │
                     │    Routing     │
                     └───────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
    Code Worker        Code Reviewer       Test Engineer
          │                  │                  │
          └──────────────────┼──────────────────┘
                             ▼
                   Test Runner / Validator
                             │
                             ▼
                    Security Reviewer
                             │
                             ▼
                         PR / Merge
```

---

# 12. Responsibility Matrix

| Role | Primary Responsibility |
|---|---|
| **Spec Agent** | Requirements and SpecKit artifacts |
| **Requirements Reviewer** | Validate requirements and acceptance criteria |
| **Orchestrator** | Routing, execution strategy, model/capability selection |
| **Technical Planner** | Technical refinement and technical assessment |
| **Code Worker** | Implementation and implementation-level unit tests |
| **Code Reviewer** | Code quality and implementation review |
| **Test Engineer** | Test strategy and test implementation |
| **Test Runner / Validator** | Test execution and evidence |
| **Security Reviewer** | Security analysis |

---

# 13. Core Design Principles

### Requirements vs implementation

```text
Spec Agent
    ↓
WHAT / WHY

Technical Planner
    ↓
HOW

Code Worker
    ↓
IMPLEMENT

Tester
    ↓
PROVE

Security Reviewer
    ↓
ASSESS RISK
```

### Decision vs execution

```text
Orchestrator
    ↓
decides

Specialized Agents
    ↓
execute
```

### Complexity belongs in configuration

Do not multiply agents to represent complexity.

```text
Role + Capability Level + Model + Budget
```

should determine execution behavior.

### Start simple

Do not add specialized agents unless observability shows a real need.

In particular, initially avoid separate:

- Technical Refiner;
- Test Planner;
- E2E Agent;
- Regression Agent;
- Security Triage Agent;
- Security Deep Agent;
- Integrator Agent.

The current roles cover these responsibilities without unnecessary fragmentation.

---

# 14. Expected Benefits

This architecture provides:

- clear separation of responsibilities;
- independent requirements validation;
- technical refinement before implementation;
- independent test implementation and execution;
- risk-based security analysis;
- model/cost optimization through capability levels;
- reduced workflow complexity;
- easier migration to a workflow engine such as LangGraph;
- better observability of cost, latency, failures and retries.

The architecture should evolve based on measured bottlenecks rather than adding agents preemptively.
