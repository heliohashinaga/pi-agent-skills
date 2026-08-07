---
name: vuejs
description: |
  Vue.js 3 development skill — build, refactor and test Vue 3 apps with the
  Composition API, <script setup>, Vite, Pinia, Vue Router and Vitest. Use
  when tasks involve .vue SFCs, Vue components, Vite config, Pinia stores,
  Vue Router, or Vue testing with Vitest/@vue/test-utils.
---

# Vue.js 3 Skill

Focus: Vue 3 with **Vite + TypeScript**. Use the Composition API and
`<script setup>` exclusively for components. Do not introduce Options API
for new components.

## Toolchain

| Task | Command |
|---|---|
| Scaffold | `npm create vue@latest` (TS + Router + Pinia + Vitest) |
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Test | `npm run test:unit` (Vitest) |
| Lint | `npm run lint` (ESLint + Prettier) |

Prefer `npm`/`pnpm` per the project's existing lockfile.

## Project structure

- Group by **functional domain** (`api/`, `stores/`, `views/`, `components/`,
  `composables/`) rather than by file type only.
- `views/` = route-level pages; `components/` = reusable pieces;
  `composables/` = reusable reactive logic; `stores/` = Pinia stores.
- Keep components small and single-responsibility; lift shared logic into
  composables.

## Conventions

- **`<script setup>` only**; write logic in the script, template stays declarative.
- **Code order** in script setup: imports → compiler macros
  (`defineProps`, `defineEmits`) → reactive state → computed → functions →
  watchers/lifecycle hooks.
- **Type props/emits** with type-only generics:
  ```vue
  <script setup lang="ts">
  defineProps<{ id: string; active?: boolean }>()
  const emit = defineEmits<{ (e: 'update', id: string): void }>()
  </script>
  ```
- Prefer `ref` for primitives and `reactive` for objects; expose one clear name.
- Keep templates readable — extract complex expressions into computed/functions.

## State (Pinia)

- Use the **setup store syntax**.
- Use `storeToRefs()` when destructuring state/getters to preserve reactivity;
  call actions directly (`store.action()`).

## Routing

- Use **Vue Router 4**; lazy-load route components with dynamic imports
  (`() => import('@/views/FooView.vue')`).
- Use route names and typed params; guard navigation with route guards for
  auth/state requirements.

## Testing

- Use **Vitest** with `@vue/test-utils`.
- Create a fresh wrapper per test; avoid sharing wrappers via `beforeEach`.
- Assert against **public DOM behavior** (rendered text/elements), not internal
  component state.

Example:

```ts
import { mount } from '@vue/test-utils'
import ScoreCard from '@/components/ScoreCard.vue'

it('renders the grade', () => {
  const wrapper = mount(ScoreCard, { props: { grade: 'B+' } })
  expect(wrapper.text()).toContain('B+')
})
```

## Common pitfalls

- Mutating props; missing `key` in `v-for`; mixing Options API with
  Composition API.
- Over-nesting / god components; logic duplication instead of composables.
- Forgetting `storeToRefs` and losing reactivity when destructuring a store.
- Testing internal state instead of user-visible behavior.
