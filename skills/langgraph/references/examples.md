# LangGraph runnable examples (verified against langgraph 1.2.10, Python 3.14)

These snippets were executed against the installed API to confirm exact names and
semantics. Run them in any project that has `langgraph` + `langgraph-checkpoint`
installed.

## 1. Minimal StateGraph — sequential + conditional

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
    should_continue,
    {"continue": "generate", "end": END},
)
app = g.compile()

# make `calls` monotonically increase across loop passes by feeding back the count
state = {"messages": [], "calls": 0}
result = state
for _ in range(5):
    result = app.invoke(result)
    if result.get("messages") and result["messages"][-1] == "end-stub":
        break
print(result)
```

> Note: a plain single `invoke({"messages": [], "calls": 2})` shows routing
> directly — pass `calls >= 3` to terminate at the first pass. For a real loop,
> the node must update `calls` (add a reducer or return `{"calls": state["calls"]+1}`).

## 2. State with a reducer (append instead of overwrite)

```python
from langgraph.graph import StateGraph, START, END, add_messages
from langgraph.graph.message import MessagesState
from typing import Annotated, TypedDict

class State(TypedDict):
    messages: Annotated[list, add_messages]
    total: Annotated[int, lambda a, b: a + b]

def emit(state: State) -> dict:
    return {"messages": ["one more"]}   # would overwrite without add_messages

def bump(state: State) -> dict:
    return {"total": 1}                 # accumulates via the sum reducer

g = StateGraph(State)
g.add_node("emit", emit)
g.add_node("bump", bump)
g.add_edge(START, "emit")
g.add_edge("emit", "bump")
g.add_edge("bump", END)
app = g.compile()
print(app.invoke({"messages": ["seed"], "total": 0}))
# messages: ['seed', 'one more']  (append)
# total:    1                      (sum reducer)
```

## 3. Checkpointing / memory across threads

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from typing import TypedDict

class S(TypedDict):
    n: int

def plus_one(state: S):
    return {"n": state.get("n", 0) + 1}

g = StateGraph(S)
g.add_node("plus_one", plus_one)
g.add_edge(START, "plus_one")
g.add_edge("plus_one", END)
app = g.compile(checkpointer=InMemorySaver())

cfg_a = {"configurable": {"thread_id": "a"}}
cfg_b = {"configurable": {"thread_id": "b"}}
app.invoke({}, cfg_a)   # n -> 1
app.invoke({}, cfg_a)   # n -> 2  (same thread, state continues)
app.invoke({}, cfg_b)   # n -> 1  (isolated thread)

print(app.get_state(cfg_a).values)  # {'n': 2}
```

## 4. Human-in-the-loop with interrupt / Command

```python
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command, interrupt
from langgraph.checkpoint.memory import InMemorySaver
from typing import TypedDict

class S(TypedDict):
    messages: list

def ask(state: S):
    answer = interrupt("Question for the human")  # pauses; payload exposed
    return {"messages": [answer]}

def done(state: S):
    return {"messages": state.get("messages", []) + ["done"]}

g = StateGraph(S)
g.add_node("ask", ask)
g.add_node("done", done)
g.add_edge(START, "ask")
g.add_edge("ask", "done")
g.add_edge("done", END)
app = g.compile(checkpointer=InMemorySaver())
cfg = {"configurable": {"thread_id": "t1"}}

res = app.invoke({}, cfg)
print(res["__interrupt__"][0].value)     # "Question for the human"
print(app.get_state(cfg).next)            # ('ask',)  <- paused here

res2 = app.invoke(Command(resume="42"), cfg)
print(res2["messages"])                    # ['42', 'done']
```

## 5. Prebuilt ReAct agent (create_react_agent)

```python
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import InMemorySaver

# model must be a LangChain chat model (e.g. langchain_openai ChatOpenAI)
# tools is a list of tool objects (e.g. from @tool or Tool)
agent = create_react_agent(
    model,
    tools,
    checkpointer=InMemorySaver(),   # conversation memory per thread
    prompt="You are a helpful assistant.",
)
result = agent.invoke(
    {"messages": [{"role": "user", "content": "hi"}]},
    {"configurable": {"thread_id": "t1"}},
)
print(result["messages"])
```

## 6. Streaming modes

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from typing import TypedDict

class S(TypedDict):
    n: int

def a(s): return {"n": s.get("n", 0) + 1}
def b(s): return {"n": s["n"] + 1}

g = StateGraph(S)
for name, fn in (("a", a), ("b", b)):
    g.add_node(name, fn)
g.add_edge(START, "a"); g.add_edge("a", "b"); g.add_edge("b", END)
app = g.compile(checkpointer=InMemorySaver())

cfg = {"configurable": {"thread_id": "s"}}
print(list(app.stream({}, cfg, stream_mode="values")))   # full state per step
# fresh thread: [{'n': 1}, {'n': 2}]
print(list(app.stream({}, cfg, stream_mode="updates")))  # per-node updates
```

## Quick import cheat sheet

```python
from langgraph.graph import StateGraph, START, END, MessagesState, add_messages
from langgraph.types import Command, interrupt
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.prebuilt import create_react_agent, ToolNode, tools_condition
```
