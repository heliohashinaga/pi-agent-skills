# Changelog

All notable changes to the devloop extension are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Extension imported into the `pi-agent-skills` repository as
  `devloop/extension/` (canonical source). Previously it lived only as an
  unversioned copy under `~/.pi/agent/extensions/devloop`.
- `package.json` `version` (`0.1.0`) and `packageManager` (`pnpm@11.20.0`).
- `README.md` (develop/install/structure) and this `CHANGELOG.md`.
- `.gitignore` (`node_modules/`, `*.tsbuildinfo`, non-pnpm lockfiles).
- `specs/refactor/plan.md` — refactor plan (phases 0-5 + optional 6/7).

### Changed
- `pnpm-workspace.yaml`: removed the no-op `allowBuilds` placeholder stub
  (`@google/genai` / `protobufjs` with literal string `"set this to true or
  false"` values); kept the defensive `minimumReleaseAgeExclude:
  [pi-subagents@0.42.1]` (supply-chain exemption for the hard-pinned dep).
- Standardized on **pnpm** as the single package manager (removed `bun.lock`
  and `package-lock.json` from the source tree).

### Notes
- Baseline commit captures the working state as-is before any refactor:
  210 tests passing, `typecheck` + `typecheck:runtime` clean.
- Local install switched to a symlink
  (`~/.pi/agent/extensions/devloop → devloop/extension`) so edits in the repo
  are live without a copy step.
