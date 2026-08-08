---
name: typescript
description: |
  TypeScript development skill — write, build, test and refactor TypeScript
  for Node.js / browser apps: strict tsconfig, ESM/NodeNext, feature-based
  modular structure, tsc/tsx, ESLint and Zod validation. Use when tasks involve
  .ts/.tsx files, tsconfig.json, TypeScript type design, Node ESM modules, or
  building/running TS with tsc/tsx.
---

# TypeScript Skill

Focus: current TypeScript (5.x) with **strict mode** and modern ESM. Enable
type safety everywhere; do not write `.js`-style unchecked code.

## Toolchain

| Task | Command |
|---|---|
| Dev run | `npx tsx src/server.ts` (or `ts-node`) |
| Type-check/compile | `npx tsc --noEmit` / `npx tsc` |
| Build | `npx tsc -p tsconfig.json` (out to `dist/`) |
| Test | `npx vitest` or `npx jest` (per project) |
| Lint/format | ESLint + Prettier (`npx eslint .`, `npx prettier --write`) |

Keep TypeScript, ESLint and tsx in `devDependencies`.

## tsconfig essentials

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "noUncheckedIndexedAccess": true
  }
}
```

Use `NodeNext` to keep real ESM semantics; use explicit `.js` extensions on
relative imports in ESM modules.

## Project structure

- Use **feature-based modular** layout: group each feature's files together,
  keep layers thin (routes → controllers → services → repositories).
- Export a public API per module via `index.ts`; keep internals private.
- Keep TypeScript, ESLint and Zod in dev/runtime deps as appropriate.

## Conventions

- **Naming**: `camelCase` functions/variables, `PascalCase` types/classes,
  `SCREAMING_SNAKE_CASE` constants.
- **Type design**: prefer `type` for unions/mapped types and `interface` for
  object contracts; use `satisfies` to keep literals while staying type-safe.
- Use generics and discriminated unions over `any`/assertions. Never use
  `any` to bypass checks; prefer `unknown` + narrowing for external data.
- Annotate external boundaries; let inference work internally.
- **Validation** with **Zod** at application boundaries (controllers/handlers);
  do not trust raw runtime input.

## Error handling

- Return discriminated `Result`/error objects for expected failures; throw for
  exceptional cases. Never swallow errors with empty `catch`.
- Validate external/provider responses before using them (partial-failure
  semantics: one source down should not fail a whole operation where possible).

## Testing

- Use **Vitest** or Jest; describe/it naming, `expect(...).toX()`.
- Keep unit tests pure and fast; isolate I/O with mocks.
- Test-first: write the failing test, then implement.

## Worked example

```ts
import { z } from 'zod'

const AddressSchema = z.object({
  street: z.string().min(1),
  number: z.coerce.number().int().positive(),
})
export type Address = z.infer<typeof AddressSchema>

export function normalize(raw: string): Address {
  const [street, number] = raw.split(',').map((p) => p.trim())
  return AddressSchema.parse({ street, number })
}
```

## Common pitfalls

- `any` / unchecked casts that hide type errors.
- Mixing CJS/ESM (`require` in ESM, or missing `.js` extensions).
- Ignoring `strict`/`noUncheckedIndexedAccess`, leading to `undefined` at
  runtime; trust in external data without Zod.
- Overly long single-purpose files; dumping everything into one controller.
