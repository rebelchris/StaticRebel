# Intelligent Router

**The new LLM-first routing system for StaticRebel.**

## What Changed

The old architecture used rigid pattern matching (hundreds of regex patterns) combined with LLM classification into predefined "actions". This led to "dumb" behavior where the assistant couldn't intelligently understand user intent.

The new **Intelligent Router** takes an LLM-first approach:

1. **Single LLM call** analyzes user intent in the context of:
   - Available skills (dynamically discovered)
   - Recent conversation history
   - User's memory/preferences

2. **LLM decides** the best action:
   - `use_skill` - Use an existing skill (with extracted parameters)
   - `create_skill` - Propose creating a new skill for tracking
   - `web_search` - Search the web for current information
   - `chat` - Handle as conversation/question

3. **Smart skill discovery** - Skills are the source of truth, not hardcoded patterns

## Benefits

- **No more "dumb" routing** - LLM understands context and intent naturally
- **Automatic skill discovery** - New skills are immediately available
- **Smart skill creation** - Offers to create skills when user tries to track something new
- **Cleaner architecture** - Single decision point instead of fragmented routing

## Configuration

The intelligent router is **enabled by default**.

To use legacy pattern-based routing:
```bash
USE_INTELLIGENT_ROUTER=false node enhanced.js
```

Or in code:
```javascript
const result = await handleChat(message, { 
  useIntelligentRouter: false 
});
```

## Files Changed

- `lib/intelligentRouter.js` - New intelligent routing system
- `lib/chatHandler.js` - Updated to use intelligent router by default
- `AUTO_CREATE_SKILLS` now defaults to `true`

## How It Works

```
User Input
    │
    ▼
┌─────────────────────────────┐
│   Intelligent Router        │
│                             │
│   1. Gather context         │
│      - Available skills     │
│      - Recent memory        │
│      - Conversation history │
│                             │
│   2. LLM analyzes intent    │
│      "What does user want?" │
│                             │
│   3. Execute decision       │
│      - use_skill            │
│      - create_skill         │
│      - web_search           │
│      - chat                 │
└─────────────────────────────┘
    │
    ▼
Response
```

## Example Decisions

| User Input | Decision | Reason |
|------------|----------|--------|
| "drank 500ml water" | `use_skill` (water) | Matches water tracking skill |
| "did 30 pushups" | `create_skill` | No pushup skill exists yet |
| "what's the weather in Cape Town?" | `web_search` | Needs current data |
| "how are you?" | `chat` | Conversational |
| "show my water stats" | `use_skill` (water, query) | Query existing skill |

## Debugging

Enable debug logging:
```bash
DEBUG_ROUTER=true node enhanced.js
```

This will show the LLM's decision-making process.
