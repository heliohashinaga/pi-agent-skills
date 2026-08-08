---
name: gitmoji
description: |
  Gitmoji + Conventional Commits convention for commit messages and PR titles.
  Use whenever writing, reviewing or integrating commit messages and PR titles:
  format `:emoji: type(scope): subject`. Provides the emoji-to-intent mapping
  (feature, fix, refactor, docs, tests, config/tooling, CI, performance,
  architecture, dependency, DB migration, removal, security, release).
---

# Gitmoji Convention Skill

Use Gitmoji + Conventional Commits for all **commit messages** and **PR titles**.

## Format

```
:<emoji> <type>(<scope>): <subject>
```

- `<type>`: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, `ci`, `style`, `revert`.
- `<scope>`: optional area of the change (module, provider, layer).

Examples:
- `:sparkles: feat(provider): add new provider`
- `:bug: fix(rules): correct score range`
- `:recycle: refactor(core): extract module`
- `:white_check_mark: test(contract): cover edge cases`

## Emoji map

| Intent | Emoji |
|---|---|
| New feature | `:sparkles:` |
| Bug fix | `:bug:` |
| Refactor | `:recycle:` |
| Docs | `:memo:` |
| Tests | `:white_check_mark:` |
| Config/tooling | `:wrench:` |
| CI | `:green_heart:` |
| Performance | `:zap:` |
| Architecture | `:building_construction:` |
| Add dependency | `:heavy_plus_sign:` |
| DB migration | `:card_file_box:` |
| Remove code | `:fire:` |
| Security | `:lock:` |
| Release/version | `:bookmark:` |

## Rules

- **One emoji per commit/PR**, matching the primary intent. Pick the emoji that
  best describes the change; if in doubt, prefer the most specific match.
- Use the same convention for the **PR title** as for the commit subject.
- Apply it to squash/merge commit summaries and release notes too, where the
  project uses them.

## Quick decision

| Change | Emoji + type |
|---|---|
| Adds capability | `:sparkles: feat(...)` |
| Corrects behavior | `:bug: fix(...)` |
| Restructures without behavior change | `:recycle: refactor(...)` |
| Touches docs | `:memo: docs(...)` |
| Adds/updates tests | `:white_check_mark: test(...)` |
| Version bump | `:bookmark:` |
