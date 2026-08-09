---
name: langgraph
description: |
  Develop long-running, stateful agents and workflows with LangGraph: state
  graphs (StateGraph/MessagesState), nodes and edges, conditional routing,
  state with reducers (Annotated, add_messages), checkpointing and memory
  (threads, InMemorySaver, Postgres), human-in-the-loop (interrupt/Command),
  streaming, time travel, and prebuilt agents (create_react_agent, ToolNode).
  Use when writing, debugging or refactoring code that imports `langgraph`,
  builds graphs with StateGraph or create_react_agent, uses interrupt()/Command,
  configures a checkpointer/thread_id, or adds memory and persistence to agents.
---

# LangGraph Skill

Guidance for building long-running, stateful agents and workflows with
**LangGraph**. This skill is version-aware: it targets **LangGraph 1.x** (verified
against `langgraph` 1.2.10, `langgraph-checkpoint` 4.2.0, `langgraph-prebuilt`
1.1.0, `langgraph-cli` 0.4.31, Python 3.14).

LangGraph is a **low-level** framework for orchestrating agents as directed
graphs of **nodes** connected by **edges**, sharing a **state** that is durably
checkpointed at every step. It works standalone (no LangChain required), and most
code depends only on `langgraph`.

> ⚠️ **Version matters a lot.** The API changed substantially between 0.x and 1.x.
> In `langgraph-prebuilt` v1.1.0 the export is **`create_react_agent`** (NOT
> `create_agent` — that name appears only in newer `main`/versions). Always verify
> the exact imports you use by running the real example, don't trust memory.

---

## 1. Core concepts

| Concept | What it is |
|---|---|
| **State** | Shared data structure between nodes (TypedDict / dataclass / Pydantic). Each node receives and returns partial updates. |
| **Node** | A function `def node(state) -> dict` (or `async`). A unit of work. |
| **Edge** | Connection between nodes: `add_edge` (unconditional) or `add_conditional_edges` (routing). |
| **Reducer** | Function that merges a state key when multiple updates arrive. Default behavior is **overwrite**. |
| **Checkpointer** | Persistence of state across invocations, keyed by `thread_id`. Enables memory, HITL and time travel. |
| **Graph / CompiledGraph** | `StateGraph` (definition) → `compile(checkpointer=...)` → `CompiledGraph` (runnable app). |

Three graph archetypes:

1. **Sequential** — a fixed A→B→C path. Pure, deterministic.
2. **Conditional / Routing** — the agent decides the next step (tool loop).
3. **Recursive / Agent** — loops until a condition (the heart of ReAct and agents).

---

## 2. Dependencies

Add to `pyproject.toml` (with `uv`):

```toml
[project]
dependencies = [
  "langgraph>=1.2.10",
  "langgraph-checkpoint>=4.2.0",
  "langgraph-prebuilt>=1.1.0",   # create_react_agent, ToolNode (optional)
  "langgraph-cli[inmem]>=0.4.31",# CLI/Platform (optional)
]
```

```bash
uv add langgraph langgraph-checkpoint
uv add langgraph-prebuilt langgraph-cli
```

---

## 3. Minimal graph (verified against 1.2.10)

```python
from langgraph.graph import StateGraph, START, END
from typing import TypedDict

class State(TypedDict):
    messages: list[str]
    calls: int

def generate(state: State) -> dict:
    return {"messages": [f"tool response #{state['calls']}"]}

def should_continue(state: State) -> str:
    return "end" if state["calls"] >= 3 else "generate"

g = StateGraph(State)
g.add_node("generate", generate)
g.add_edge(START, "generate")
g.add_conditional_edges(
    "generate",
    should_continue,          # router function
    {"continue": "generate",  # map: returned value -> target node
     "end": END},
)
app = g.compile()
print(app.invoke({"messages": [], "calls": 2}))
```

**Rules:**
- `START` and `END` come from `langgraph.graph`.
- Nodes return **partial dicts** — only the keys that change.
- `add_conditional_edges(node, router_fn, paths_map)`: the router receives the
  state and returns a key of `paths_map`, whose values are target node names (or
  `END`). `paths_map` may also be a string field of state used as the router.

---

## 4. State and reducers

By default, when two updates touch the same key, the **last one wins
(overwrite)** — not append. To accumulate, use a reducer via `Annotated`:

```python
from langgraph.graph import StateGraph, START, END, add_messages
from langgraph.graph.message import MessagesState
from typing import Annotated, TypedDict

class State(TypedDict):
    messages: Annotated[list, add_messages]  # append instead of overwrite
    total: Annotated[int, lambda a, b: a + b]
```

`MessagesState` is already a `TypedDict` with
`messages: Annotated[list, add_messages]` — the most common state type for agent
chat. For read-only state updates use `Command` (see §7) rather than mutating in
place.

---

## 5. Memory and checkpointing (threads)

Without a checkpointer, state is discarded at the end of each `invoke`. With
`checkpointer=...`, state persists per `thread_id` and the graph is **durably
executed** (resumes where it left off).

```python
from langgraph.checkpoint.memory import InMemorySaver

app = g.compile(checkpointer=InMemorySaver())

# Each thread_id = one isolated conversation/run
config = {"configurable": {"thread_id": "user-42"}}
ans1 = app.invoke({"messages": []}, config)       # creates the thread
ans2 = app.invoke({"messages": []}, config)       # state continuity
other = app.invoke({"messages": []}, {"configurable": {"thread_id": "other"}})
```

- `InMemorySaver` is for **tests** and dev (does not persist across processes).
- For production multi-process use a durable shared checkpointer:
  `langgraph-checkpoint-postgres` (`PostgresSaver`) or
  `langgraph-checkpoint-sqlite`.
- Always pass `thread_id` when you expect conversational continuity.

---

## 6. Streaming

Use `app.stream(state, config, stream_mode=...)` instead of `invoke`:

```python
# stream_mode="values":  full state after each super-step
# stream_mode="updates": only each node's update
# stream_mode="messages": LLM tokens (for typing UI)
for chunk in app.stream(initial, config, stream_mode="values"):
    print(chunk)
```

- `messages` requires a node running an LLM (LangChain/`langchain-openai`).
- `stream` is synchronous; the `async` twin is `astream` — use `astream` in
  servers/APIs.

---

## 7. Human-in-the-loop (interrupt / Command)

Interrupt for approval, input collection, or revision:

```python
from langgraph.types import Command, interrupt

def ask_for_input(state: State) -> dict:
    user_input = interrupt("Question for the human")  # pause and expose to caller
    return {"messages": [user_input]}
```

Verified semantics (v1.x):
- On `interrupt`, `invoke` returns with the **`__interrupt__`** key holding an
  `Interrupt` (payload at `.value`) — the node's update is **not** applied yet.
- The graph is **paused**: `app.get_state(config).next` shows the waiting node.
- To resume, send `Command(resume=value)` — the node restarts, `interrupt()`
  returns the value, and then the update is applied.

```python
res = app.invoke(init, cfg)              # pauses at interrupt
payload = res["__interrupt__"][0].value

# approve / provide input
res2 = app.invoke(Command(resume="42"), cfg)
```

Common patterns:
- **Tool approval**: a node validates and calls `interrupt({"action","payload"})`
  before running something destructive.
- **Time travel**: use `app.get_state(cfg)` to inspect and `app.update_state(cfg,
  values)` to rewrite a step before resuming — useful for correction.

---

## 8. Prebuilt agent (create_react_agent)

For a ReAct agent with tools without hand-writing the loop:

```python
from langgraph.prebuilt import create_react_agent   # <-- 1.1.0 uses this name
from langgraph.checkpoint.memory import InMemorySaver
from langchain_openai import ChatOpenAI

model = ChatOpenAI(model="gpt-4o")
tools = [...]   # list of tools (chat/tool decorator, etc.)

agent = create_react_agent(
    model,
    tools,
    checkpointer=InMemorySaver(),   # conversation memory
    prompt="You are a helpful assistant ...",
)
result = agent.invoke({"messages": [{"role": "user", "content": "hi"}]},
                      {"configurable": {"thread_id": "t1"}})
```

- `create_react_agent` composes the loop: LLM → `ToolNode` → decision → loop
  until done.
- It also exports `ToolNode` and `tools_condition` for building custom agents.
- Requires `langgraph-prebuilt` and a model via LangChain (`langchain-openai`) —
  skip this path if you use the provider's native API.

---

## 9. CLI / Platform (optional)

The `langgraph-cli` package exposes:

```bash
langgraph dev          # run the local API server with hot-reload (reads langgraph.json)
langgraph up           # run the production API locally
langgraph new          # project scaffold
langgraph validate     # validate the config
```

`langgraph.json` configures the graph exposed over HTTP/WebSocket (language,
package, checkpointer, entry graph). Not required if you only use `langgraph` as
a library in your own processes.

---

## 10. Common pitfalls (verified in this repo)

1. **Overwrite is default.** Without a reducer, the second write to a key erases
   the first. Use `Annotated[...]`/`add_messages` to accumulate.
2. **`create_agent` ≠ `create_react_agent`.** Prebuilt 1.1.0 only has
   `create_react_agent`. Confirm against `langgraph.prebuilt`.
3. **`interrupt` does not apply the update immediately.** The paused node only
   delivers its return after `Command(resume=...)` re-runs the node.
4. **`invoke` returns `__interrupt__`** when the graph pauses, not normal data.
   Read `res["__interrupt__"][0].value`.
5. **Forgetting `thread_id`** → every call is a fresh conversation, no memory.
6. **InMemorySaver does not persist across processes.** Use Postgres/Sqlite for
   scale-out.
7. **Nodes must be pure and return updates**, not mutate external state.
8. **State reuse across calls**: two `invoke`s on the same thread accumulate
   state — great for chat, surprising for one-shot workflows without a reset.

---

## 11. Import cheat sheet (v1.x)

```python
from langgraph.graph import StateGraph, START, END, MessagesState, add_messages
from langgraph.types import Command, interrupt
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.prebuilt import create_react_agent, ToolNode, tools_condition
```

Full runnable examples in `references/examples.md`.

---

## Best practices

- Start with the **minimal graph** that solves the case; add checkpointing and
  HITL only when needed.
- Write **per-node tests** (call each node function with a state dict) and
  integration tests with `InMemorySaver` + separate threads.
- Use `stream_mode="updates"` to debug the path traversed.
- Make nodes **async** (`async def`) if the graph runs under asyncio.
- Document the state contract (keys and reducers) alongside the graph.
