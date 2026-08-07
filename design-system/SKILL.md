---
name: design-system
description: |
  Generic design-system / accessible-UI skill, reusable across projects. Covers
  token-based styling, accessible shared primitives, Storybook story conventions
  (default/loading/error/edge) with a11y testing, and visual regression. Project
  conventions (a repo's tokens, component library, localization locales) override
  this generic guidance. Use when touching shared UI, design tokens, Tailwind
  classes, stories, a11y/contrast/keyboard, or visual regression.
---

# Design-system skill (generic)

Visual and accessible-UI guidance for a tokenized, primitive-based interface. It
is intentionally generic: always defer to the project's `AGENTS.md`, its actual
design tokens, and its component library. Use the project's own test commands.

## Non-Negotiables

1. **Tokens only.** No ad-hoc values: no raw hex, px, or arbitrary utility-class
   values in component code. Style exclusively with the project's design tokens.
2. **Primitives first.** Use an existing shared primitive instead of bespoke
   styling on raw elements. New primitives belong in the project's shared UI
   folder with story + a11y coverage.
3. **Accessibility is a contract.** AA contrast at minimum, keyboard-navigable,
   visible focus, correct ARIA — a component is *done* only across every state.
4. **Storybook mirrors the app.** Story behavior (interactions, a11y, states)
   must be identical to the real app; avoid story-only forks of behavior.

## Design tokens

- Live as theme config / CSS variables — the single source of truth. Never
  duplicate token values inside components.
- Prefer **semantic** tokens over literal ones (e.g. `background`/`text`/`accent`
  vs `blue-500` in component code). Follow the project's actual taxonomy (color,
  typography, spacing, radius, shadow, motion).
- Motion must respect `prefers-reduced-motion`. Dark mode, if any, is a token
  swap, not conditional hex values.

## Shared primitives

- Intentional, minimal prop API: expose `variant`/`size`/state props (disabled,
  loading, error) instead of loose className pass-through.
- Forward refs where element identity matters (inputs, focus targets).
- Keep primitives free of business logic; callers supply localized strings.
- States are first-class: disabled, loading (`aria-busy`), focus-visible, error.

## Accessibility bar

- **Contrast:** AA (4.5:1) at minimum for normal text (verify via a11y tests).
- **Keyboard:** full tab order, visible focus, no hover-only interactions, no
  focus traps except intentional modals with Escape.
- **ARIA:** correct roles/labels; `aria-live` for async updates; `aria-busy`
  while loading; localized meaningful alt text (decorative images `alt=""` +
  `aria-hidden`).
- **Motion:** honor `prefers-reduced-motion`; no flashing content.

## Storybook conventions

- Co-locate stories and cover **every state** a component can render (default,
  loading/progress, error, edge/empty, disabled, etc.).
- Story args drive behavior exactly as the app does (same context and
  localization). No story-only forks.
- Document token/styling decisions in a dedicated styling story per surface.

## Visual regression

- Approved screenshots are the baseline; any change must be intentional.
  Unintended diffs block the PR — no blind baseline updates without review.
- Cover core surfaces at the supported viewports.

## Testing

- Component tests: behavior + accessibility assertions (roles, labels, focus),
  not implementation details.
- Storybook tests: every story renders and passes a11y checks.
- Visual tests: baseline → intentional diff → approve.

## Overrides

Token names, component library, locales and exact commands are project-owned.
When a project provides its own `design-system` or UI skill, it takes precedence
over this generic skill.

## Common pitfalls

- Raw hex or arbitrary utility values in feature code.
- Inline/conditional styles duplicating token values.
- Hover-only interactions (break keyboard/touch).
- Hardcoded-language alt text.
- Stories rendering behavior different from the app.
- Blindly accepting visual-regression baseline updates.
