# devloop vs `agent-software-development-factory.md` — Alignment Audit

Audit date: 2026-08-08 · Target: `extensions/devloop` implementation vs the design
doc `docs/agent-software-development-factory.md`.

**Scope note:** the design doc describes the *entire* factory (Specification
Workflow + Development Workflow). The devloop extension implements the
**Development Workflow** as a gate-based pipeline; the Specification Workflow
is out of scope of the extension (input arrives as pre-authored tasks in
`tasks.md`).

## 1. Pipeline implemented

```
planner → task-qa → code → review → test → security → security-deep
        → documentation → integrate → ready (or human-escalation)
```

Routing is a deterministic state machine (`lib/routing.ts`) driven by a gate
table (`lib/gates.ts`) with retry budgets (criteria 2, review 3, test 3,
security 3), worker-tier escalation (`worker-simple` → `worker-complex`), and a
capability rule (E2E/visual ⇒ force `tester-complex`). Agents referenced:
`feature-planner`, `task-qa`, `worker-simple`, `worker-complex`,
`reviewer-simple`, `reviewer-complex`, `tester-simple`, `tester-complex`,
`security-triage`, `security-reviewer`, `integrator` (defined in
`~/.pi/agent/agents/`).

## 2. Role mapping

| Doc role | devloop gate/agent | Alignment |
|---|---|---|
| Spec Agent (SpecKit: spec/plan/tasks/AC/DoD) | — (task input pre-authored) | **Gap** |
| Requirements Reviewer | `task-qa` (CLARIFY_NEEDED → back to planner) | Partial (validates task, not spec) |
| Orchestrator | code: `routing.ts` + `gates.ts` + controller loop (no LLM) | Structural divergence (deterministic decision, not agent) |
| Technical Planner | `feature-planner` (scope, skills, AC, testPlan, docsNeeded) | ✅ close (but is the *first* gate, not downstream of an orchestrator) |
| Code Worker (levels) | `worker-simple` / `worker-complex` | Partial — 2 levels vs doc's 3; separate agents vs role+knobs |
| Code Reviewer (levels) | `reviewer-simple` / `reviewer-complex` | Partial — 2 levels / 2 agents |
| Test Engineer | `tester-simple` / `tester-complex` | Partial — merged with runner |
| Test Runner / Validator | — (tester judges conformance itself) | **Gap** |
| Security Reviewer | `security-triage` + `security-reviewer` (two sequential gates) | **Contradicts doc's "start simple"** |
| Integrator | `integrator` (merge/PR, no auto-merge, `--pr` required) | Divergence (doc says avoid initially); pragmatic |
| Documentation | `documentation` stage via `worker-simple` | Extra beyond doc |

## 3. Principles honored ✅

- **Complexity in configuration:** the `tester` capability rule (E2E/visual ⇒
  complex tier) is exactly "config, not agent".
- **Retry/iteration budgets** as an orchestrator responsibility — implemented
  deterministically.
- **Capability tiers as variants of one role** (e.g. `worker-complex` is still
  the Code Worker role, not a new role).
- **Validation ≠ planning:** `task-qa` does not design implementation;
  `feature-planner` does not validate — doc's Constraints respected.

## 4. Divergences / contradictions ❌

1. **No Specification Workflow.** Doc: `Idea → Spec Agent → Requirements
   Reviewer → Approved Spec`. devloop starts at `tasks.md`; no WHAT/WHY
   elicitation, no spec approval gate.
2. **No orchestrator agent.** Orchestration decisions are hard-coded
   (deterministic router + gate table). Arguably more predictable, but a
   structural deviation from the doc's first-class Orchestrator role.
3. **Security triage + deep as separate agents.** The doc explicitly says to
   avoid separate `security-triage` / `security-deep` agents initially and use
   one Security Reviewer with capability levels. devloop has both, as two
   sequential gates. The most direct contradiction with the doc's letter.
4. **Test Engineer fused with Test Runner.** Doc requires a deterministic
   executor/evidence-gatherer separate from the test designer; devloop has one
   `tester` role that both authors tests and returns the conformance verdict
   (MEETS_TASK / PARTIAL / DOES_NOT_MEET) without separate executed-evidence
   gates.
5. **Integrator present.** Doc lists "Integrator Agent" under start-simple
   avoidances; devloop has `integrator`, though it never auto-merges (safe
   finalizer).
6. **Two capability levels, as separate agents.** Doc: 3 levels
   (`simple|standard|complex`; security `shallow|standard|deep`) expressed as
   one role + config. devloop: 2 levels, realized as distinct agent files.

## 5. Fully absent roles

Spec Agent · Requirements Reviewer as a spec gate · Orchestrator as an agent ·
dedicated Test Runner/Validator.

## 6. Severity

| Finding | Severity | Notes |
|---|---|---|
| No spec workflow | Medium | Needs a `spec`/`requirements` pre-gate or an upstream companion flow |
| Fused Test Engineer/Runner | Medium | Conformance signal is LLM judgment only; no deterministic test-evidence gate |
| Security triage/deep split | Low–Medium | Works, but contradicts the doc's start-simple guidance; acceptable if observability justified it |
| Deterministic orchestrator | Low | Deviation of implementation style, not capability |
| Capability-level realization | Low | Naming (`tester-simple` etc.) collides with doc's "avoid" list but intent (tiers) is honored |

## 7. Options to close the gaps

1. **Spec pre-gate:** add `spec` stage upstream (`spec-agent` writing testable
   AC + DoD) with `task-qa` promoting to Requirements Reviewer semantics.
2. **Test-runner separation:** introduce a deterministic `test-runner` stage
   (execute suite, collect evidence) feeding a lighter conformance verdict in
   the `tester` stage.
3. **Security consolidation** (optional): make `security-deep` a capability
   *escalation* of the triage verdict instead of a fixed second gate.
4. Keep the deterministic orchestrator; document it as an intentional deviation.