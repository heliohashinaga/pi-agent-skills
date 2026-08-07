---
name: docs
description: |
  Documentation skill — write, update and audit project documentation: README,
  AGENTS.md/CONTRIBUTING, Architecture Decision Records (ADR), API/OpenAPI docs,
  architecture diagrams (C4 as-code), runbooks, and onboarding guides. Use when
  tasks involve documentation files, README/ADR/API-doc/runbook/changelog work,
  or ensuring docs stay in sync with code.
---

# Documentation Skill

Principles first, then per-doc conventions. Docs should be **intent-first**
(record the *why*), stored **in the repo**, kept **current**, and treated as a
first-class deliverable (part of the Definition of Done).

## Principles

- **Intent-first**: document *why*, not *what* — the code already shows what.
  Capture constraints, trade-offs, and rationale.
- **Docs in repo, versioned**: all docs live in the repo and change via PR, so
  they can't drift silently from code.
- **Cut stale**: update/remove docs that no longer match reality; stale docs are
  worse than none. Keep commands verified and current.
- **Owner / DoD**: each doc has an owner and is listed in the Definition of Done
  and PR template for the changes it describes.
- **Don't duplicate the obvious**: skip restating what the code makes self-evident.

## Per-doc conventions

### README.md (repository root)
- Answer in <60 seconds: **What** does it do, **how to install/run**, **how to use**,
  **why it's trustworthy**.
- Order: title + one-line tagline → hero visual → badge row (≤5) → **Quick Start**
  (copy-pasteable install+run) → key features → **usage examples** (realistic,
  tested) → contributing/license/links.
- **Testability**: verify every install/run command on a clean machine; update
  on every major release.

### AGENTS.md / CONTRIBUTING.md
- `AGENTS.md` is a lightweight "README for agents" (aim ~60–100 lines for a
  new, simple repo): project overview; **exact build/test/lint commands**; code
  style (tool-enforced when possible); testing procedure; security boundaries;
  PR/commit validation; links to deeper docs. Preserve justified project-specific
  detail; do not shorten an established instruction file merely to meet a line
  target. In monorepos, use nested files only for deltas.
- Precedence: explicit user prompt > nearest AGENTS.md > root.

### Architecture Decision Records (ADR)
- One decision per ADR, numbered noun-phrase title (`0001-use-postgres`).
- Template: **Status** → **Context** (forces/constraints) → **Decision** (clear
  directive) → **Consequences** (positive + negative trade-offs).
- Store in `doc/adr/`. **Once accepted, immutable** — do not edit; a changed
  decision gets a **new ADR that supersedes** the old one.

### API / OpenAPI docs
- Treat the **OpenAPI spec as a testable contract** (source of truth), auto-
  generated to avoid drift.
- Require `operationId`, `tags`, summaries, and reuse `components` schemas.
- Provide **realistic examples** for request/response including error cases.
- Automate validation: lint with Spectral, check breaking changes (oasdiff),
  contract tests in CI.
- Pair the machine-readable spec with human guides (Getting Started, Auth, workflows).

### Architecture diagrams (C4, as-code)
- Keep one abstraction level per diagram (context ≠ container ≠ component).
- Store diagram source (Mermaid / C4-PlantUML / Structurizr) **in the repo** next
  to code; render in CI to prevent drift.
- Declare elements before relations; group with subgraphs; one level per diagram.

### Incident runbooks (ops)
- Structure: **alert context** (trigger, severity, owner, impact) → immediate
  triage (2-min checklist + dashboard links) → **remediation** (copy-paste
  commands + rollback) → **verification** (measurable success) → **escalation**
  (criteria/time) → post-incident link.
- Checklists over paragraphs; expected output for normal/abnormal; owned by
  teams; linked from alerts; updated after each incident.

## Gitmoji
Use `:memo:` with docs scope — e.g. `:memo: docs(adr): record postgres choice`.

## Common pitfalls
- Documenting the *what* instead of the *why*.
- Repeating what code already shows; duplicating across files.
- Leaving stale/outdated commands or API examples (drift).
- Editing/superseding incorrectly: losing ADR immutability, or editing an ADR
  instead of writing a superseding one.
- Writing an OpenAPI spec without examples/validation so it drifts from code.
