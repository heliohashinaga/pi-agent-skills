---
name: playwright
description: >
  Playwright end-to-end, visual and Storybook test conventions for coding
  agents. Use when writing, running or verifying Playwright specs (`.spec.ts`),
  configuring `playwright.config.ts`, or producing E2E/visual tests for any web
  app. Covers running against a production build (not dev mode), deterministic
  fakes (no live AI), privacy, accessibility, parallelism, and the agentic
  Playwright features. A repo's own AGENTS.md / project skill overrides this
  generic guidance.
---

# Playwright E2E conventions

Follow these when creating or running Playwright tests.

## Non-negotiables

- **Never call a live service from tests.** Use deterministic fakes (MSW or a
  server-side fake returning fixed, cheap responses — no real image encode, no
  real AI/network). Never commit `.env.local` or real credentials.
- **Privacy-aware by default:** when the app is anonymous-by-design, assert that
  no **direct identifier** is sent in HTTP payloads or rendered; the server
  should only receive the minimal, derived fields the contract defines. Block
  non-local network calls in specs as a safety net.
- **Run against a production build, not dev mode.** Use `webServer` with
  `next start` / the framework's production server over a prior
  `build` step. Dev mode's on-demand cold-compile causes flaky timeouts; a
  production build is fast and deterministic. Build the **exact code under
  test** — never reuse a server built from a different code state, and never
  share compiled output (`.next`) across branches/worktrees.
- **Deterministic tests only:** no wall-clock, network or ordering dependence;
  no sleeps. Rely on Playwright's auto-waiting and web-first assertions.

## Playwright specifics

- Use **web-first assertions** (`toBeVisible`, `toHaveText`, `toHaveCount`,
  `toHaveAttribute`) with auto-retry — never `waitForTimeout`.
- Use **role/label locators** (`getByRole`, `getByLabel`, `getByTestId`), not
  brittle CSS selectors.
- Anonymous browser: no cookies/persistent state; open a fresh
  `browser.newContext()` per test and close it (clean isolation).
- **Parallelism:** `fullyParallel: true`, project `workers`, and
  `--shard` in CI. Keep specs few and focused — don't bloat journeys.
- **Visual regression:** `expect(page).toHaveScreenshot()` with approved
  baselines, a `maxDiffPixelRatio` tolerance for anti-aliasing, and
  `animations: "disabled"`.

## Running (generic)

```bash
pnpm exec playwright test          # full suite
pnpm exec playwright test tests/   # scoped
pnpm exec playwright test --shard=1/4   # CI sharding
```

If headless Chromium fails to launch on a minimal Linux host (missing native
lib like `libasound.so.2`), run `playwright install --with-deps chromium`
(root) or vendor the missing libs into a shared cache dir and expose it via
`LD_LIBRARY_PATH` — an environment/tooling concern, not a product change.
Browser binaries live in Playwright's shared install path
(`~/.cache/ms-playwright`), reused across clones/worktrees.

## Test tiers and gate role

- Tiers: **unit** (Vitest), **contract/API** (route+pipeline vs the API/OpenAPI
  contract, APIs faked), **E2E** (Playwright journeys), **visual** (Playwright
  `toHaveScreenshot`), plus Storybook stories covering default/loading/error/
  edge + a11y when Storybook is used.
- If your pipeline has read-only test gates, they only run existing suites and
  issue a conformance verdict (`MEETS_TASK`) — they don't author tests and don't
  auto-repair failures. Test authoring belongs to the implementing agent.

## Agentic features (optional, guarded)

Playwright ships official Test Agents (`planner`, `generator`, `healer`) via
`npx playwright init-agents` and an MCP server (`@playwright/mcp`, `playwright
mcp`). Guidance:

- `planner`/`generator` may scaffold test plans/skeletons for the **implementing
  agent**, but output must be adapted to repo conventions (design tokens, i18n
  catalogs — no hardcoded strings, a11y, privacy) and reviewed before it reaches
  a verification gate.
- Keep the **`healer` out of the automatic pipeline**: silent auto-repair
  contradicts a read-only gate and can hide regressions. If used at all, only in
  a separate worktree with explicit review.
- MCP is for interactive/ad-hoc browser debugging, not CI.
