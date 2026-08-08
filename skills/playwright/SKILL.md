---
name: playwright
description: >
  Playwright end-to-end, visual and Storybook test conventions for coding
  agents. Use when writing, running or verifying Playwright specs (`.spec.ts`),
  configuring `playwright.config.ts`, or producing E2E/visual/Storybook tests
  for a web app. Covers running against a production build (not dev mode),
  deterministic fake providers, privacy invariants, accessibility, and the
  project test scripts. Project-specific rules in a repo's own AGENTS.md and
  ADRs override this generic guidance.
---

<!-- Multi-agent/serialization note: this file is loaded as a skill by coders
     and by gate reviewers (tester-complex/tester-simple are read-only and run
     the project's existing test scripts; they do not author tests). -->

# Playwright E2E conventions

Follow these when creating or running Playwright tests. In `storybook-ai`, the
authoritative project rules live in `AGENTS.md`; the decisions below are
recorded in `docs/adr/0002-e2e-execution-strategy.md` and
`docs/adr/0001-playwright-agentic-adoption.md`.

## Non-negotiables

- **Tests never call a live AI service.** All AI-vendor calls stay behind the
  server-only provider adapter; E2E uses a **deterministic fake provider** (MSW
  or server-side fake returning fixed, cheap responses — no real image encode).
  Never commit `.env.local` or real credentials.
- **Privacy invariants in E2E:** assert that no **direct identifier** (name,
  exact age, child id) is sent in the HTTP payload or rendered. The browser
  derives `ageBand`; the server only receives `ageBand`/`locale`/`theme`. Block
  non-local network calls as a safety net in the spec.
- **Run against a production build, not dev mode.** `webServer` uses `next start`
  over a prior `pnpm build` (the `pretest:*` hooks build first). Dev mode's
  on-demand cold-compile causes flaky 30s timeouts; prod build is fast and
  deterministic. Build the **exact code under test** per slice — never reuse a
  server built from a different code state (don't share `.next` output across
  branches).
- **Deterministic tests only:** no wall-clock, network, or ordering dependence;
  no sleeps. Leverage Playwright's auto-waiting and web-first assertions.

## Playwright specifics

- Use **web-first assertions** (`toBeVisible`, `toHaveText`, `toHaveCount`,
  `toHaveAttribute`) with retries — never `waitForTimeout`.
- Use **role/label locators** (`getByRole`, `getByLabel`, `getByTestId`), not
  brittle CSS.
- Anonymous browser: no cookies/persistent state; use
  `browser.newContext()` isolation. Clean up `BrowserContext` per test.
- Use `test.describe.configure({ mode: "parallel" })` and project `workers` /
  `--shard` for CI; keep specs few and focused (not bloated journeys).
- Visual regression: `expect(page).toHaveScreenshot()` with approved baselines;
  `maxDiffPixelRatio` tolerates minor anti-aliasing; disable animations
  (`animations: "disabled"`).

## Running the tests (storybook-ai)

From repo root:

```bash
pnpm test:e2e        # build (pretest) + full Playwright suite
pnpm test:visual     # build (pretest) + visual snapshots only (tests/visual)
pnpm storybook:test  # every story (default/loading/error/edge) + a11y checks
```

These wrap the runner via `scripts/run-with-chromium.sh`, which preprends a
shared native-libs dir to `LD_LIBRARY_PATH` (see
`scripts/setup-chromium-deps.sh`). Browser binaries live in Playwright's shared
install path. If a browser fails to launch on a minimal host, run
`pnpm exec playwright install --with-deps chromium` (root) or
`sh scripts/setup-chromium-deps.sh` (user-space) — a tooling concern, not a
product change.

## Test tiers and gate role

- Tiers: **unit** (Vitest), **contract/API** (route+pipeline vs the OpenAPI
  contract, APIs faked), **E2E** (Playwright journeys pt-BR + en), **visual**
  (Playwright `toHaveScreenshot`), plus Storybook stories covering
  default/loading/error/edge + a11y.
- In the devloop pipeline the gates `tester-simple`/`tester-complex` are
  **read-only conformance verifiers** that run the existing suites and issue a
  `MEETS_TASK` verdict. They do **not** write tests, and **do not** auto-repair
  failures. Test authoring belongs to the worker — see
  `docs/adr/0001-playwright-agentic-adoption.md`.

## Agentic features (optional, guarded)

Playwright ships official Test Agents (`planner`, `generator`, `healer`) via
`npx playwright init-agents` and an MCP server (`@playwright/mcp`). Guidance:

- `planner`/`generator` may scaffold test plans/skeletons **for the worker**,
  but generated output must be adapted to repo conventions (design tokens,
  i18n catalogs — no hardcoded strings, a11y, privacy) and reviewed before it
  reaches the gate.
- Keep the **`healer` out of the automatic pipeline**: silent auto-repair
  contradicts the read-only gate and can hide regressions. If ever used, only in
  a separate worktree with explicit review.
- MCP is for interactive/ad-hoc browser debugging, not CI.
