# StaticRebel – Next-Level Autonomous AI Improvement Plan

## Goal

Turn StaticRebel from a reactive CLI chatbot into a **useful, trustworthy, autonomous assistant** that can:

- remember things
- reason over goals
- use tools
- act safely
- improve over time

---

## 1. Core Architecture Improvements

### 1.1 Explicit Agent Loop

Replace simple prompt → response with an agent loop:

- Observe (user input, environment state)
- Think (reasoning + planning)
- Act (tool usage)
- Reflect (result evaluation)
- Store (memory updates)

**Deliverables**

- `agentLoop.ts`
- Clear separation between reasoning, actions, and memory

---

## 2. Memory System (Non-Negotiable)

### 2.1 Short-Term Memory

- Current conversation window
- Task context
- Active goals

### 2.2 Long-Term Memory

- Store user preferences, recurring patterns, decisions
- Use embeddings + vector store (SQLite + embeddings is enough)
- Retrieval based on relevance, not recency

**Rules**

- Memory writes must be explicit and intentional
- Memory reads must be justified in reasoning step

---

## 3. Tooling & Actions

### 3.1 Tool Interface

Create a standard tool schema:

- name
- description
- input schema
- safety constraints
- dry-run mode

### 3.2 Initial Tool Set

- File read/write
- Shell command (sandboxed)
- Web fetch (read-only)
- Search (docs / local repo)
- Task planner

### 3.3 Tool Selection

- LLM proposes tool usage
- Orchestrator validates
- Executes
- Feeds result back into agent loop

---

## 4. Autonomy Levels

### Level 0 – Chat

- Pure Q&A (current state)

### Level 1 – Assisted

- Suggests actions but asks permission

### Level 2 – Semi-Autonomous

- Executes safe actions automatically
- Confirms risky ones

### Level 3 – Autonomous

- Works toward goals over multiple steps
- Can resume tasks across sessions

**Deliverable**

- `autonomyLevel` config with enforced constraints

---

## 5. Planning & Goals

### 5.1 Goal Objects

- Explicit goals with success criteria
- Time horizon (short / long)
- Priority

### 5.2 Planner

- Break goals into steps
- Re-plan when blocked
- Stop when confidence drops

---

## 6. Reflection & Self-Improvement

### 6.1 Post-Action Reflection

After each action:

- Did this move toward the goal?
- Was the tool choice correct?
- What should change next time?

### 6.2 Error Memory

- Store failures + lessons
- Avoid repeating known mistakes

---

## 7. Safety & Trust

### 7.1 Guardrails

- No silent destructive actions
- Dry-run first for filesystem / shell
- Explicit user confirmation for risky ops

### 7.2 Transparency

- Always show:
  - current goal
  - planned next step
  - reason for actions

---

## 8. UX (Still CLI, But Smarter)

### Improvements

- Show "thinking / planning / acting" phases
- Inline tool results
- Clear status indicators
- Interrupt + resume tasks

---

## 9. Extensibility

### 9.1 Plugin System

- Drop-in tools
- Versioned capabilities
- Declarative permissions

### 9.2 Model Abstraction

- Local models (Ollama)
- Optional remote models
- Per-task model selection

---

## 10. Success Criteria

StaticRebel is "next-level" when it can:

- Remember user preferences across sessions
- Complete multi-step tasks without babysitting
- Explain _why_ it did something
- Stop itself when uncertain
- Improve behavior based on past mistakes

---

## Guiding Principle

> Less magic. More clarity.  
> Autonomy must earn trust.

---

## Implementation Status

| Component         | Status     | File(s)                                       |
| ----------------- | ---------- | --------------------------------------------- |
| Improvement Plan  | ✅ Stored  | `docs/IMPROVEMENT_PLAN.md`                    |
| Agent Loop        | 🔄 Pending | `lib/agentLoop.js`                            |
| Memory System     | 🔄 Pending | `lib/memoryManager.js`, `lib/vectorMemory.js` |
| Tool Interface    | 🔄 Pending | `lib/toolRegistry.js`                         |
| Autonomy Levels   | 🔄 Pending | `lib/autonomyManager.js`                      |
| Goal/Planner      | 🔄 Pending | `lib/goalPlanner.js`                          |
| Reflection System | 🔄 Pending | `lib/reflectionEngine.js`                     |
| Safety Guardrails | 🔄 Pending | `lib/safetyGuard.js`                          |
| UX Enhancements   | 🔄 Pending | `assistant.js`                                |
| Plugin System     | 🔄 Pending | `lib/pluginManager.js`                        |
| Model Abstraction | 🔄 Pending | `lib/modelRegistry.js`                        |

---

## Notes for Future Sessions

This plan is designed to be implemented incrementally. Each component can be developed independently and integrated into the existing StaticRebel architecture. The existing codebase already has:

- `lib/memoryManager.js` - Basic memory management
- `lib/vectorMemory.js` - Vector-based memory (embeddings)
- `lib/modelRegistry.js` - Model management
- `lib/subagentManager.js` - Sub-agent coordination
- `lib/actionRegistry.js` - Action registration

These can be extended or refactored to fit the new architecture.
