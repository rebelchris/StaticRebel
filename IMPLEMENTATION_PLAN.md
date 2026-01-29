# LLM-Driven Action Registry System - Implementation Plan

## Overview
Replace the hardcoded regex intent detection system (150+ patterns, 20 handlers) with an intelligent LLM-driven action registry that dynamically classifies user intent and executes appropriate actions.

**User Choices:**
- ✅ Complete replacement (no fallback regex patterns)
- ✅ LLM classification latency acceptable (100-500ms with caching)
- ✅ Support user-custom actions in `~/.static-rebel/actions/`

## Phase 1: Core Infrastructure (New Files)

### 1.1 Create Intent Classifier (`lib/intentClassifier.js`)

**Purpose:** LLM-based intent classification engine

**Key Functions:**
- `classifyIntent(input, availableActions)` → returns `{ intents: [{ actionName, confidence, parameters }], fallbackToChat, multiIntent }`
- `logClassification(input, result, userFeedback)` → track accuracy over time
- Classification cache with 5-minute TTL (Map-based)

**Implementation Pattern:**
```javascript
// Prompt structure
const prompt = `Analyze this user input and determine which action(s) to execute:

User input: "${input}"

Available actions:
${actionsList}

Respond with ONLY valid JSON:
{
  "intents": [{"actionName": "...", "confidence": 0.0-1.0, "parameters": {}}],
  "fallbackToChat": boolean,
  "multiIntent": boolean
}`;

// Use temperature: 0.3 for consistent classification
const response = await chatCompletion(model, [
  { role: 'system', content: 'You are an intent classifier. Output only valid JSON.' },
  { role: 'user', content: prompt }
], { temperature: 0.3 });

// Extract JSON with fallback (match /\{[\s\S]*\}/)
```

**Confidence Thresholds:**
- `>= 0.8`: Execute immediately
- `0.6-0.79`: Execute with confirmation message
- `< 0.6`: Fallback to regular chat

**Error Handling:**
- LLM call fails → fallback to regular chat
- Invalid JSON → attempt regex extraction, then fallback
- Low confidence → let chat system handle

### 1.2 Create Action Registry (`lib/actionRegistry.js`)

**Purpose:** Dynamic action registration, discovery, and execution

**Key Functions:**
- `initActionRegistry()` → load all actions (built-in + user-custom)
- `registerAction(action)` → add to Map registry
- `executeAction(actionName, input, context)` → run handler with error handling
- `getAllActions()` → return all registered actions
- `getAction(actionName)` → lookup single action
- `getActionStats()` → statistics for debugging

**Storage Pattern:**
- Registry: `Map<string, ActionObject>` for O(1) lookups
- Discovery: Scan `actions/` (codebase) + `~/.static-rebel/actions/` (user)
- Hot-reload: `fs.watch()` with 1000ms debouncing (like dynamicTools.js)

**Action Schema:**
```javascript
{
  name: 'models',                    // Unique identifier
  displayName: 'Model Management',   // Human-readable
  description: '...',                // For LLM classification
  category: 'system',                // Grouping
  version: '1.0.0',

  intentExamples: [                  // Natural language examples
    'what models do I have',
    'list available models'
  ],

  parameters: {                      // Optional schema
    action: { type: 'enum', values: ['list', 'switch'] }
  },

  async handler(input, context, params) {
    // Implementation
    return "response string";
  },

  dependencies: [                    // List of required modules
    'modelRegistry.listAvailableModels'
  ],

  source: 'builtin',                 // builtin | user | skill
  enabled: true,
  createdAt: '2026-01-29'
}
```

**Context Injection Pattern:**
```javascript
function buildActionContext() {
  return {
    modules: {
      // All imported functions from enhanced.js
      listAvailableModels,
      getDefaultModel,
      cronScheduler: { addCronJob, listCronJobs, ... },
      tracker: { TrackerStore, QueryEngine, ... },
      // ... all other dependencies
    },
    user: {},
    conversation: {}
  };
}
```

### 1.3 Modify Enhanced.js Integration

**File:** `/Users/chrisbongers/www/StaticRebel/enhanced.js`

**Changes:**

1. **Add imports (top of file):**
```javascript
import { classifyIntent } from './lib/intentClassifier.js';
import { initActionRegistry, executeAction, getAllActions } from './lib/actionRegistry.js';
```

2. **Initialize in main() (around line 1100):**
```javascript
// After existing init calls
await initActionRegistry();
```

3. **Replace handleNaturalLanguage() (lines 247-290):**
```javascript
async function handleNaturalLanguage(input) {
  // 1. Classify intent using LLM
  const classification = await classifyIntent(input, getAllActions());

  // 2. Check if should fallback to chat
  if (classification.fallbackToChat ||
      classification.intents.length === 0 ||
      classification.intents[0].confidence < 0.6) {
    return null; // Let regular chat handle it
  }

  // 3. Execute action(s)
  const context = buildActionContext();
  const results = [];

  for (const intent of classification.intents) {
    if (intent.confidence >= 0.6) {
      const result = await executeAction(intent.actionName, input, context);
      if (result.success) {
        results.push(result.result);
      } else {
        console.error(`[Action Error] ${intent.actionName}:`, result.error);
        results.push(`Sorry, something went wrong with ${intent.actionName}.`);
      }
    }
  }

  // 4. Return combined results
  return results.length > 0 ? results.join('\n\n---\n\n') : null;
}

function buildActionContext() {
  return {
    modules: {
      // Simple functions
      listAvailableModels,
      getDefaultModel,
      getModelForTask,
      listSkills,
      getSkillsStats,
      getSubagentStats,
      getMemoryStats,
      getSchedulerStatus,
      getHeartbeatStatus,

      // Module groups
      cronScheduler: { listCronJobs, addCronJob, describeCron, getNextRunTime, deleteCronJob, toggleCronJob },
      memoryManager: { readDailyMemory, readLongTermMemory, getRecentDailyMemories, curateMemory },
      personaManager: { getAvailablePersonas, setActivePersona, modifyPersonaFeedback, getSystemPrompt },
      tracker: { TrackerStore, QueryEngine, parseRecordFromText, parseTrackerFromNaturalLanguage },
      vectorMemory: { addMemory, searchMemories, getMemoryStats: getVectorStats, rememberPreference },
      workerManager: { createTask, getAllTasks, generateTodoMd },
      apiConnector: { createConnector, getAllConnectors, storeApiKey },
      orchestrator: { routeTask, streamOllama, runClaudeCode },
      research: { research, webResearch },
      subagents: { createCodingSubagent, createAnalysisSubagent, sendToSubagent }
    }
  };
}
```

4. **Remove old intent detection (lines 73-241):**
- Delete `INTENT_PATTERNS` object (lines 73-220)
- Delete `detectIntent()` function (lines 222-241)
- Keep as comments for reference if needed

## Phase 2: Convert Handlers to Actions

**Directory Structure:**
```
actions/
├── _template.js              # Template for new actions
├── simple/                   # 10-15 line handlers
│   ├── models.js
│   ├── skills.js
│   ├── status.js
│   └── tasks.js
├── medium/                   # 30-60 line handlers
│   ├── schedule.js
│   ├── memory.js
│   ├── persona.js
│   └── memory2.js
├── complex/                  # 50-100+ line handlers
│   ├── coding.js
│   ├── analysis.js
│   ├── track.js
│   ├── orchestrator.js
│   ├── worker.js
│   ├── api.js
│   ├── research.js
│   ├── search.js
│   ├── run.js
│   └── help.js
```

### Conversion Strategy

**Priority Order (Convert All 20 Handlers):**

1. **Simple Actions** (4 handlers)
   - `models.js` - Model management
   - `skills.js` - Skills listing
   - `status.js` - System status
   - `tasks.js` - Task listing

2. **Medium Actions** (4 handlers)
   - `schedule.js` - Cron scheduling
   - `memory.js` - Memory management
   - `persona.js` - Persona system
   - `memory2.js` - Vector memory

3. **Complex Actions** (12 handlers)
   - `coding.js` - Coding subagent
   - `analysis.js` - Analysis subagent
   - `track.js` - Tracking system (nutrition, workout)
   - `orchestrator.js` - Claude Code orchestration
   - `worker.js` - Background workers
   - `api.js` - API connectors
   - `research.js` - Web research
   - `search.js` - Web search
   - `run.js` - Shell commands
   - `help.js` - Help system

**Conversion Pattern for Each Handler:**

1. Copy handler function body from `enhanced.js`
2. Wrap in action schema with metadata
3. Replace direct imports with `context.modules` access
4. Extract `intentExamples` from old regex patterns
5. Test handler works in isolation
6. Delete old handler from `enhanced.js`

**Example Conversion (models.js):**

```javascript
// actions/simple/models.js
export default {
  name: 'models',
  displayName: 'Model Management',
  description: 'List and manage available AI models',
  category: 'system',
  version: '1.0.0',

  intentExamples: [
    'what models do I have',
    'list models',
    'available models',
    'change the model',
    'switch model'
  ],

  async handler(input, context, params) {
    const { listAvailableModels, getDefaultModel } = context.modules;

    const models = await listAvailableModels();
    const current = getDefaultModel();

    if (models.length === 0) {
      return "No models detected. Make sure Ollama is running with: ollama serve";
    }

    return `**Available Ollama Models:**\n\n` +
      models.map(m => {
        const size = m.size ? (m.size / 1024 / 1024 / 1024).toFixed(1) : '?';
        const isCurrent = m.name === current ? ' ← current' : '';
        return `- ${m.name} (${size} GB)${isCurrent}`;
      }).join('\n') +
      `\n\nCurrent default: ${current}\n\nTo switch models, update OLLAMA_MODEL in your .env file.`;
  },

  dependencies: [
    'modelRegistry.listAvailableModels',
    'modelRegistry.getDefaultModel'
  ],

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29'
};
```

### 2.1 After Conversion: Clean Up Enhanced.js

Once all handlers are converted:

1. **Delete handler functions** (lines ~296-1073)
2. **Keep imports** - still needed for context injection
3. **Verify** - enhanced.js should be ~800 lines (down from 1400+)

**Remaining in enhanced.js:**
- Imports (lines 1-46)
- Dashboard server (if any)
- Main initialization
- Chat loop
- `handleNaturalLanguage()` (simplified)
- `buildActionContext()` helper
- Helper functions for tracking (if not moved to actions/)

## Phase 3: Skills Integration

**Goal:** Auto-register skills as actions

**Implementation in `actionRegistry.js`:**

```javascript
export function syncSkillsToActions() {
  const { listSkills } = await import('./skillsManager.js');
  const skills = listSkills();

  for (const skill of skills) {
    if (skill.loaded) {
      registerAction({
        name: `skill:${skill.name}`,
        displayName: skill.description || skill.name,
        description: skill.description,
        category: 'skill',
        intentExamples: skill.triggers.map(t => t.trigger),

        async handler(input, context, params) {
          // Execute skill trigger
          const match = skill.triggers.find(t =>
            input.toLowerCase().includes(t.trigger.toLowerCase())
          );

          if (match) {
            return match.response
              .replace(/{{user}}/g, context.user?.name || 'User')
              .replace(/{{time}}/g, new Date().toLocaleTimeString());
          }

          return `Skill ${skill.name} executed.`;
        },

        source: 'skill',
        enabled: true
      });
    }
  }
}

// Call in initActionRegistry()
export function initActionRegistry() {
  loadBuiltinActions();
  loadUserActions();
  syncSkillsToActions(); // <-- Auto-register skills
  startFileWatcher();
}
```

## Critical Files to Modify

### New Files (Create)
1. `/Users/chrisbongers/www/StaticRebel/lib/intentClassifier.js` - LLM classification engine ✅
2. `/Users/chrisbongers/www/StaticRebel/lib/actionRegistry.js` - Action registry system ✅
3. `/Users/chrisbongers/www/StaticRebel/actions/_template.js` - Template for new actions
4. `/Users/chrisbongers/www/StaticRebel/actions/simple/models.js` - First action (example)
5. `/Users/chrisbongers/www/StaticRebel/actions/simple/skills.js`
6. `/Users/chrisbongers/www/StaticRebel/actions/simple/status.js`
7. `/Users/chrisbongers/www/StaticRebel/actions/simple/tasks.js`
8. ... (continue for all 20 actions)

### Modified Files
1. `/Users/chrisbongers/www/StaticRebel/enhanced.js`
   - Add imports for intentClassifier and actionRegistry
   - Call initActionRegistry() in main()
   - Replace handleNaturalLanguage() implementation
   - Add buildActionContext() helper
   - Delete INTENT_PATTERNS (lines 73-220)
   - Delete detectIntent() (lines 222-241)
   - Delete all handler functions (lines 296-1073)

## Verification & Testing

### End-to-End Testing

**Test Cases (Representative Samples):**

1. **Simple Actions:**
   ```bash
   # Models
   node enhanced.js chat "what models do I have"
   → Should list all Ollama models with current selection

   # Status
   node enhanced.js chat "system status"
   → Should show heartbeat, scheduler, subagents, memory stats
   ```

2. **Medium Actions:**
   ```bash
   # Schedule
   node enhanced.js chat "remind me to stretch at 3pm"
   → Should create cron job and show confirmation

   # Memory
   node enhanced.js chat "what did we discuss yesterday"
   → Should retrieve daily memories
   ```

3. **Complex Actions:**
   ```bash
   # Tracking
   node enhanced.js chat "I had a cappuccino"
   → Should log to nutrition tracker with calories

   # Coding
   node enhanced.js chat "write a function to check if number is prime"
   → Should spawn coding subagent and return implementation

   # Research
   node enhanced.js chat "research latest AI trends"
   → Should use web oracle for research
   ```

4. **Multi-Intent:**
   ```bash
   node enhanced.js chat "show me my tasks and check the status"
   → Should execute both 'tasks' and 'status' actions
   ```

5. **Fallback to Chat:**
   ```bash
   node enhanced.js chat "what's the weather like"
   → Should fallback to regular chat (no action match)
   ```

### Verification Checklist

- [ ] All 20 handlers converted to action files
- [ ] intentClassifier.js classifies intents with confidence scores
- [ ] actionRegistry.js loads all actions (builtin + user + skills)
- [ ] enhanced.js integrates with new system
- [ ] All existing functionality preserved
- [ ] Multi-intent handling works
- [ ] Fallback to chat works for ambiguous input
- [ ] Skills auto-register as actions
- [ ] User-custom actions load from `~/.static-rebel/actions/`
- [ ] Hot-reload works for action files
- [ ] Classification cache improves performance
- [ ] Error handling graceful for LLM failures
- [ ] No regression in existing features

### Performance Testing

```bash
# Measure classification time
time node enhanced.js chat "what models do I have"
→ Should complete in < 1 second (100-500ms LLM + execution)

# Test cache effectiveness
node enhanced.js chat "what models do I have"  # First call: ~300ms
node enhanced.js chat "what models do I have"  # Cached: ~50ms
```

### Manual Testing

1. Start interactive mode: `node enhanced.js`
2. Test 10 representative queries (simple, medium, complex)
3. Verify responses match old system output
4. Test edge cases (empty input, gibberish, very long input)
5. Test multi-intent: "show tasks and status"
6. Test fallback: "tell me a joke" (should use chat, not action)

## Success Criteria

- ✅ Zero hardcoded regex patterns
- ✅ All 20 handlers converted to actions
- ✅ LLM-driven intent classification working
- ✅ Confidence scoring implemented
- ✅ Multi-intent support
- ✅ User-custom actions supported
- ✅ Skills auto-register as actions
- ✅ Performance acceptable (< 1s per request)
- ✅ All existing functionality preserved
- ✅ No breaking changes for users

## Notes

- **Performance:** Classification adds ~100-500ms latency, but caching reduces this for repeated queries
- **Extensibility:** Users can drop new actions in `~/.static-rebel/actions/` without code changes
- **Maintainability:** enhanced.js reduced from 1400+ lines to ~800 lines
- **Learning:** Classification logs enable future improvements (fine-tuning, pattern analysis)
- **Migration:** Complete replacement (no regex fallback) per user choice

## Progress Tracking

### Completed
- [x] Phase 1.1: Create intentClassifier.js
- [x] Phase 1.2: Create actionRegistry.js
- [ ] Phase 1.3: Modify enhanced.js integration
- [ ] Phase 2: Convert all 20 handlers to actions
- [ ] Phase 3: Skills integration
- [ ] Testing and verification
