# Hybrid Router

**LLM extraction + deterministic execution for reliable skill routing.**

## Evolution

1. **Old approach**: Hundreds of regex patterns - rigid, breaks on edge cases
2. **LLM-first attempt**: Ask LLM to do everything - unreliable with small models
3. **Hybrid approach**: LLM extracts, code executes - best of both worlds ✅

## How It Works

```
User Input: "My lunch was 400kcal today"
    │
    ▼
┌─────────────────────────────┐
│   LLM Extraction            │
│   (Simple prompt)           │
│                             │
│   {                         │
│     "intent": "log",        │
│     "category": "calories", │
│     "value": 400,           │
│     "unit": "kcal",         │
│     "note": "lunch"         │
│   }                         │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│   Code Execution            │
│   (Deterministic)           │
│                             │
│   1. Find skill for         │
│      "calories" category    │
│   2. Create if not exists   │
│   3. Log 400 kcal           │
│   4. Return stats           │
└─────────────────────────────┘
    │
    ▼
Response: "📊 Logged to calories: 400 kcal"
```

## Why This Works

**LLM is good at:**
- Understanding natural language
- Extracting structured data from messy input
- Determining user intent

**LLM is bad at:**
- Following complex multi-step prompts
- Consistent skill matching
- Remembering all the rules

**Code is good at:**
- Fuzzy matching (category → skill)
- Creating skills with proper defaults
- Executing reliably every time

## Dynamic Skills

The router works for **any skill type**:

| Input | Category | Auto-Created Skill |
|-------|----------|-------------------|
| "400kcal lunch" | calories | 🍽️ calories (kcal, goal: 2000) |
| "Slept 7 hours" | sleep | 😴 sleep (hours, goal: 8) |
| "Feeling good" | mood | 😊 mood (score) |
| "5000 steps" | steps | 🚶 steps (steps, goal: 10000) |
| "2 coffees" | coffee | ☕ coffee (cups, goal: 3) |
| "Ran 5km" | running | 🏃 running (km, goal: 5) |

No hardcoding needed - just tell it what you did!

## Files

- `lib/hybridRouter.js` - The hybrid routing system
- `lib/simpleRouter.js` - Fallback deterministic router
- `lib/intelligentRouter.js` - Deprecated LLM-first router

## Configuration

Hybrid router is **enabled by default**.

```bash
# Enable debug logging
DEBUG_ROUTER=true node enhanced.js

# Use legacy pattern matching
USE_INTELLIGENT_ROUTER=false node enhanced.js
```

## The LLM Prompt

Simple and focused:

```
Extract information from this user input. Respond with ONLY valid JSON.

Input: "${input}"

Extract:
- intent: "log" (recording data), "query" (asking about data), or "chat"
- category: what they're tracking (water, calories, steps, sleep, mood, etc.)
- value: the numeric amount (null if none)
- unit: the unit of measurement
- note: any additional context

Examples:
"I drank 500ml of water" → {"intent":"log","category":"water","value":500,"unit":"ml"}
"My lunch was 400kcal" → {"intent":"log","category":"calories","value":400,"unit":"kcal","note":"lunch"}
"How much water today?" → {"intent":"query","category":"water","value":null}
```

No complex rules. No "don't do this". Just examples.
