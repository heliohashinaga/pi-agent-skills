---
name: rust
description: |
  Rust development skill — write, build, test and refactor Rust with Cargo,
  modules, the borrow checker, error handling (Result/?), Clippy and rustfmt.
  Use when tasks involve .rs files, `cargo build`/`cargo test`/`cargo clippy`,
  crates/Cargo.toml, or Rust workspaces.
---

# Rust Skill

Focus: current stable Rust + Cargo. Follow `cargo fmt` and `cargo clippy`
output; keep code idiomatic and borrow-safe.

## Toolchain

| Task | Command |
|---|---|
| Format | `cargo fmt` |
| Lint | `cargo clippy --all-targets --all-features -- -D warnings` |
| Build | `cargo build` |
| Test | `cargo test` (includes doc tests) |
| Check | `cargo check` (fast type check) |
| Run | `cargo run` |
| Add dep | `cargo add <crate>` (optionally `--features`) |

Run `cargo clippy` and `cargo fmt --check` before finishing.

## Project structure

- Standard Cargo layout: `src/main.rs` (binary) or `src/lib.rs` (library);
  tests in `src/*.rs` `#[cfg(test)]` or `tests/` integration tests.
- Organize into **modules** with a clear hierarchy; re-export the public API
  with `pub use` at the crate root. Large projects: use Cargo **workspaces**.
- One responsibility per module/crate; keep the public surface minimal.

## Conventions

- **Naming**: `snake_case` for modules/functions/variables; `CamelCase` for
  types; `SCREAMING_SNAKE_CASE` for constants; traits named with nouns/adjectives.
- **Ownership**: be explicit about ownership (owned vs `&T` vs `&mut T`);
  prefer small, owned data in structs; clone only when necessary.
- **Traits**: prefer composition over deep inheritance; implement `From`/`TryFrom`
  for conversions; use `impl Trait`/generics deliberately.
- **`pub` only what must be public** — keep implementation details private.

## Error handling

- Recoverable errors → `Result<T, E>`; **do not** `panic!`/`unwrap`/`expect`
  in library/runtime paths.
- Propagate with the `?` operator.
- **Libraries**: `thiserror` for custom error enums. **Applications/binaries**:
  use `anyhow` for easier context (`anyhow::Result`, `.context()`).
- Model the error at the right layer; avoid `Box<dyn Error>` unless you must.

Example:

```rust
// lib core
#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("invalid value: {0}")]
    Invalid(String),
}

pub fn parse_port(s: &str) -> Result<u16, ParseError> {
    let n = s.parse().map_err(|_| ParseError::Invalid(s.to_string()))?;
    Ok(n)
}
```

## Testing

- `#[test]`/`#[tokio::test]` for async; `cargo test -- --nocapture` to see output.
- Use `assert_eq!`, `assert!`, and `assert_matches!`; proptest for property tests.
- Test public API through `tests/` integration tests; unit-test private logic inline.

## Common pitfalls

- Holding a borrow across an await (async) or a mutable borrow conflict.
- `unwrap`/`expect` on user input or external data.
- Over-generic signatures or needless cloning in hot paths.
- Silent error swallowing — always handle/return `Result`, never ignore.

## Worked example

```rust
pub fn score(address: &str) -> Result<u16, ParseError> {
    let tokens = address.split(',').map(str::trim).collect::<Vec<_>>();
    if tokens.len() < 2 { return Err(ParseError::Invalid(address.into())); }
    Ok((tokens.len() as u16) * 100)
}
```
