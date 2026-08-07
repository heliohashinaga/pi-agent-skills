---
name: python
description: |
  Python development skill — write, build, test and refactor Python following
  modern 2025 practices: pyproject.toml, uv, ruff, type checking, pytest, async
  asyncio and the src layout. Use when tasks involve .py files, packages,
  venvs, pip/uv/poetry, ruff, pytest, or async Python code.
---

# Python Skill

Focus: modern Python 3.11+/3.13 with pyproject.toml as single source of truth.
Prefer `uv` for tooling; do not introduce legacy `setup.py`/`requirements.txt`
scaffolding unless the project already uses it.

## Toolchain

| Task | Command |
|---|---|
| Init project | `uv init --package` |
| Add dep | `uv add <pkg>` / `uv add --dev <pkg>` |
| Sync env | `uv sync` |
| Run | `uv run <cmd>` |
| Test | `uv run pytest` |
| Lint+format | `uv run ruff check .` / `uv run ruff format .` |
| Type check | `uv run pyright` (or `ty`) |

**Always run through `uv run`** so commands execute inside the managed env.
Group deps with PEP 735 dependency groups (dev, test, lint).

## Project structure

- Use the **src layout**: code under `src/<package>/`, tests under `tests/`.
- Keep modules small and single-purpose; prefer packages over flat scripts.
- All metadata/build/tool config (including ruff, pytest, pyright) in `pyproject.toml`.

## Conventions

- **Naming**: `snake_case` for functions/variables/modules; `CamelCase` for
  classes; `UPPER_SNAKE_CASE` for constants; private helpers prefixed `_`.
- **Typing**: annotate public functions and data (return types). Use `| None`
  instead of `Optional`, `list[...]`/`dict[...]` over `List`/`Dict`.
  Prefer `dataclasses`/`TypedDict`/`pydantic` for data structures.
- **Docstrings** on public modules/classes/functions; keep them short.
- **Async I/O**: prefer `asyncio.TaskGroup` over `asyncio.gather`; use
  `httpx.AsyncClient` for HTTP; never block the loop with sync calls.

## Error handling

- Raise specific exceptions (`ValueError`, `KeyError`, custom exceptions) with
  clear messages; never bare `except:`. Catch narrowly.
- Use `contextlib.suppress` only where ignoring is intentional and documented.
- Return explicit error types / raise on invalid input — don't return `None`
  silently for failure.

## Testing

- Use **pytest**; write tests as functions or classes, with `assert` and
  `pytest.raises`. Use fixtures instead of sharing mutable state.
- Async tests via `pytest.mark.asyncio`.
- Name tests `test_<behavior>`; mirror the package layout under `tests/`.

## Common pitfalls

- Mutable default arguments (`def f(x=[])`) — use `None` + `if x is None`.
- Blocking the event loop with synchronous I/O inside async functions.
- Ignoring type errors or silencing them with broad `# type: ignore`.
- Bare `except:` swallowing bugs; `print` instead of proper logging.

## Worked example

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class Address:
    street: str
    number: int


def normalize(raw: str) -> Address:
    parts = [p.strip() for p in raw.split(",")]
    if len(parts) < 2:
        raise ValueError(f"invalid address: {raw!r}")
    return Address(street=parts[0], number=int(parts[1]))
```
