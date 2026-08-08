---
name: nextjs
description: |
  Generic Next.js (App Router) + React 19 skill, reusable across projects. Covers
  RSC vs client components, Route Handlers, Server Actions, the server-only
  boundary, i18n, lazy loading, and a tiered testing approach. Project-specific
  conventions (a repo's own AGENTS.md, a design-system skill, privacy/safety
  rules) override this generic guidance. Use when touching app/, features/, lib/
  or tests in a Next.js repo.
---

# Next.js skill (generic)

Framework-convention guidance for a Next.js (App Router) + React 19 codebase.
It is intentionally generic: always defer to the project's `AGENTS.md` and any
project-level skills (e.g. a `design-system` skill) when they differ.

Follow the `typescript` skill for language-level rules (strict TS, Zod at the
boundary, feature-based structure). Use the project's own verification commands
(`pnpm`/`npm`/`yarn` from its AGENTS.md).

## App Router + React 19 rules

- **Server Components by default.** Add `'use client'` only where interactivity,
  hooks, or browser state is genuinely required. Keep the server/client split
  explicit and small.
- **Validate at the boundary.** Client schemas give fast field errors; the server
  re-validates before any external call. Never trust the client.
- **Route Handlers sparingly.** Prefer direct handler logic / Server Actions over
  many routes. A single documented route (with an OpenAPI contract where that is
  the project's style) keeps the surface small.
- **`server-only` boundary.** Any module that holds secrets, calls external
  providers, or uses Node-only APIs must be server-only and must never be imported
  from client code.
- **Hooks (React 19):** use `useActionState` / `useTransition` / `useOptimistic`
  for forms and pending states; use `use` for async resources. Avoid `useEffect`
  to derive state from props.
- **Session/state:** keep transient user state client-side in memory by default;
  avoid localStorage/indexedDB/cookies unless the product explicitly requires it.
- **`Cache-Control`:** mutation endpoints must respond `no-store`; use the correct
  cache semantics for reads.

## i18n

- Support the locales the project configures (often via `next-intl` or a routing
  library). Keep user-facing strings in catalogs per locale and per feature; no
  hardcoded UI copy.
- A default locale and fallback must be explicit. All UX strings (including
  validation, error, and retry copy) are localized.

## Performance

- Respect declared bundles (e.g. an initial route JS budget); lazy-import heavy
  modules (PDF renderers, charting, editors) only on interaction — never on the
  initial route.
- Server-render by default for SEO/LCP-critical content; keep the client bundle
  lean.
- Where the project has LCP/TTFB budgets, honor them; measure, don't guess.

## Testing tiers

1. **Unit** — pure logic, schemas, validators.
2. **Integration/contract** — routes + pipelines against the OpenAPI contract,
   with external APIs (providers/moderation/DB) faked (MSW or fakes).
3. **E2E** — user journeys with a fake external provider.
4. **Visual** — screenshots regression where the project uses it.

Tests are deterministic: no wall-clock, network, or ordering dependence. Live
external services are never called in tests; use fakes/MSW.

## Overrides

This generic skill never defines business rules or PII/security policies — those
are project-owned (AGENTS.md, project skills). When a project provides its own
`nextjs` skill or related skills, they take precedence over this one.

## Common pitfalls

- Leaking a server-only/secret-bearing module into client code.
- Skipping server re-validation of client input before an external call.
- Missing `Cache-Control: no-store` on mutation routes.
- Hardcoding user-facing copy instead of using the localization catalogs.
- Eagerly importing heavy client dependencies on the initial route.
