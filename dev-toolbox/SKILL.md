---
name: dev-toolbox
description: |
  Personal developer-tooling playbook for this machine. Use when auditing
  installed CLI tools, choosing the best command-line utility for a task,
  diagnosing PATH/package-manager issues, comparing Linux vs WSL tooling,
  or deciding whether a workflow belongs in a global skill or a project
  skill. Triggers: "quais tools tenho", "CLI instalado", "PATH",
  "package manager", "ferramenta para automação", "skill global",
  "WSL", "tooling audit", "environment audit", "dev toolbox".
---

# Dev Toolbox

Use this skill for environment/tooling tasks on this machine.

## Goals

1. Discover which CLI tools are actually available in `PATH`
2. Pick the best tool for the task instead of defaulting to generic shell usage
3. Explain fallbacks when a preferred utility is missing
4. Separate reusable personal workflow from project-specific instructions
5. Be explicit about WSL/Linux/Windows path differences when relevant

## Known tool landscape on this machine

These tools are commonly available and are usually the first choices:

- `pi`, `bun`, `bunx`
- `python3`
- `uv`, `uvx`
- `git`
- `rg`, `fd`, `fzf`, `bat`
- `docker`, `kubectl`
- `hledger` (when working in accounting repos)
- `nvim`, `tmux`

Custom/user-level tools are typically concentrated in:

- `~/.bun/bin`
- `~/.local/bin`
- project-local `.pi/skills/`
- global `~/.pi/agent/skills/`

## Preferred tool choices

Choose the most specific tool that matches the job:

- **Find files**: `fd` first, `find` as fallback
- **Search text/code**: `rg` first, `grep` as fallback
- **Summarize or process large command output**: prefer `ctx_execute` / `ctx_batch_execute`
- **Inspect exact file content before editing**: use `read`
- **Structured transforms without `jq`**: use `python3 - <<'PY'`
- **Node/Bun scripting**: prefer `bun` for quick JS/TS utilities when convenient
- **Python tooling installs/runs**: prefer `uv` / `uvx`
- **GitHub/web research**: prefer built-in `web_search`, `code_search`, `fetch_content` when shell CLIs are absent

## Audit workflow

When asked to inspect installed tools or environment setup:

1. Check important commands with `command -v`
2. Record versions with `--version`, `-V`, or `version`
3. Inspect user bin directories:
   - `~/.bun/bin`
   - `~/.local/bin`
   - `~/.cargo/bin`
4. Inspect relevant package-manager inventories when needed:
   - `npm -g ls --depth=0`
   - `uv tool list`
   - `pipx list`
   - `cargo install --list`
5. Group findings by ecosystem, not as one flat list
6. Call out missing-but-common tools and practical substitutes

## Fallback matrix

If a commonly expected tool is missing, use these substitutes:

- Missing `jq` → use Python JSON processing
- Missing `gh` → use `web_search`, `fetch_content`, Git remote URLs, or direct API/curl when appropriate
- Missing `fd` → use `find`
- Missing `rg` → use `grep -R` carefully
- Missing `bat` → use `read` for files or `sed -n` in shell only when file reading is not the primary task
- Missing package-manager CLI → inspect install directories directly

## WSL guidance

This environment may expose both Linux and Windows paths in `PATH`.
When auditing tools:

- Prefer Linux-native executables when both Linux and Windows versions exist
- Mention if a command resolves into `/mnt/c/...` instead of `/usr/...` or `$HOME/...`
- Flag mixed-path setups if they can affect reproducibility or scripting
- Avoid assuming Windows shims behave identically to Linux binaries

## Global skill vs project skill decision rule

Recommend a **global skill** when the workflow is reusable across repositories, for example:

- personal development workflow
- environment/tool audit
- WSL/path troubleshooting
- general git/review habits
- reusable automation conventions

Recommend a **project skill** when the instructions depend on repo-specific facts, for example:

- account structure
- import rules
- build/test commands tied to one codebase
- deployment topology of a single project
- naming/business rules for a specific repository

## Suggested command snippets

### Quick availability check

```bash
for cmd in pi bun python3 uv git rg fd fzf docker kubectl hledger; do
  command -v "$cmd" && "$cmd" --version 2>/dev/null | head -n 1
done
```

### User bin inventory

```bash
for d in "$HOME/.bun/bin" "$HOME/.local/bin" "$HOME/.cargo/bin"; do
  echo "## $d"
  [ -d "$d" ] && find "$d" -maxdepth 1 -type f -perm -111 | sort
  echo
 done
```

### JSON fallback with Python

```bash
python3 - <<'PY'
import json,sys
obj=json.load(sys.stdin)
print(json.dumps(obj, indent=2, ensure_ascii=False))
PY
```

## Response style

When reporting results:

- group tools by category
- include resolved paths for notable commands
- distinguish installed vs merely present in package directories
- call out the most useful tools for the user's actual goal
- give an opinionated recommendation, not just raw inventory
