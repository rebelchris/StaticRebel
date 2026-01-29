# StaticRebel Architecture Documentation

## Overview

StaticRebel is now a **next-level autonomous AI assistant** with a modular architecture designed for:

- **Autonomy** - Works toward goals with minimal supervision
- **Memory** - Remembers context and learns from experience
- **Safety** - Operates within guardrails with user confirmation
- **Extensibility** - Plugin system for custom tools and capabilities

---

## Core Components

### 1. Agent Loop (`lib/agentLoop.js`)

The heart of the system - implements the OODA loop (Observe-Orient-Decide-Act) with reflection and memory.

**Phases:**

1. **OBSERVE** - Gather input, environment state, relevant memories
2. **THINK** - Reason, plan, decide on actions
3. **ACT** - Execute tools/actions
4. **REFLECT** - Evaluate results and learn
5. **STORE** - Update memories with learnings

```javascript
import { AgentLoop } from './lib/agentLoop.js';

const agent = new AgentLoop({
  autonomyLevel: 2,
  maxIterations: 10,
  enableReflection: true,
  enableMemory: true,
});

agent.on('phase:think', ({ thought }) => {
  console.log('Thinking:', thought.reasoning);
});

const result = await agent.start('Create a new file');
```

---

### 2. Tool Registry (`lib/toolRegistry.js`)

Standardized tool interface with safety constraints and dry-run mode.

**Built-in Tools:**

- `file_read` - Read file contents
- `file_write` - Write to files
- `shell` - Execute shell commands (sandboxed)
- `web_fetch` - Fetch from URLs
- `search` - Search files
- `task_planner` - Create execution plans

```javascript
import { ToolRegistry, fileReadTool } from './lib/toolRegistry.js';

const registry = new ToolRegistry();

// Register custom tool
registry.register({
  name: 'my_tool',
  description: 'Does something useful',
  inputSchema: { type: 'object', properties: {} },
  autonomyLevel: 1,
  handler: async (params) => {
    return { success: true };
  },
});

// Execute with dry-run
const result = await registry.execute(
  'file_write',
  {
    path: './test.txt',
    content: 'Hello',
  },
  { dryRun: true },
);
```

---

### 3. Autonomy Manager (`lib/autonomyManager.js`)

Manages 4 levels of autonomy with enforced constraints.

**Levels:**

- **0 - Chat**: Pure Q&A, no actions
- **1 - Assisted**: Suggests actions, asks permission (default)
- **2 - Semi-Autonomous**: Executes safe actions, confirms risky ones
- **3 - Autonomous**: Works toward goals over multiple steps

```javascript
import { AutonomyManager } from './lib/autonomyManager.js';

const autonomy = new AutonomyManager({ level: 2 });

// Check if action can execute
const check = autonomy.canExecute({
  type: 'file_write',
  description: 'Write config file',
});

if (check.requiresConfirmation) {
  console.log('User confirmation needed:', check.warnings);
}
```

---

### 4. Goal Planner (`lib/goalPlanner.js`)

Planning and goal management with step decomposition and replanning.

```javascript
import { GoalPlanner } from './lib/goalPlanner.js';

const planner = new GoalPlanner();

// Create goal
const goal = planner.createGoal({
  description: 'Refactor authentication module',
  type: 'long',
  priority: 8,
  successCriteria: ['All tests pass', 'Code coverage > 80%'],
});

// Activate and execute
planner.activateGoal(goal.id);

const step = planner.getNextStep(goal.planId);
console.log('Next step:', step.description);
```

---

### 5. Reflection Engine (`lib/reflectionEngine.js`)

Self-improvement through reflection and error memory.

```javascript
import { ReflectionEngine } from './lib/reflectionEngine.js';

const reflection = new ReflectionEngine();

// Reflect on action
const result = reflection.reflect(action, outcome, context);
console.log('Lessons:', result.lessons);

// Get recommendations
const recommendations = reflection.getRecommendations({
  actionType: 'file_write',
});
```

---

### 6. Safety Guard (`lib/safetyGuard.js`)

Safety constraints and guardrails.

**Features:**

- Dry-run mode
- Path validation
- Blocked command patterns
- Protected paths
- Confirmation requirements

```javascript
import { SafetyGuard } from './lib/safetyGuard.js';

const safety = new SafetyGuard({ dryRun: true });

const check = await safety.check({
  type: 'shell',
  params: { command: 'ls -la' },
});

if (!check.allowed) {
  console.log('Blocked:', check.errors);
}
```

---

### 7. Plugin Manager (`lib/pluginManager.js`)

Extensible plugin system with hot-reload support.

```javascript
import { PluginManager } from './lib/pluginManager.js';

const plugins = new PluginManager({ hotReload: true });

// Install plugin
await plugins.installPlugin('./my-plugin');

// Use plugin tool
const result = await plugins.executeTool('my-plugin:my_tool', {});
```

**Plugin Structure:**

```
my-plugin/
├── manifest.json
├── index.js
└── README.md
```

---

### 8. Model Abstraction (`lib/modelAbstraction.js`)

Unified interface for multiple AI model providers.

**Supported Providers:**

- Ollama (local)
- OpenAI (remote)
- Groq (remote)
- Custom providers

```javascript
import { ModelManager } from './lib/modelAbstraction.js';

const models = new ModelManager({
  ollamaHost: 'http://localhost:11434',
  openaiApiKey: process.env.OPENAI_API_KEY,
});

// Chat with specific model
const response = await models.chat('ollama/llama3.2', [
  { role: 'user', content: 'Hello!' },
]);

// Stream response
for await (const { token } of models.stream('ollama/llama3.2', messages)) {
  process.stdout.write(token);
}

// Get model for task
const model = models.getModelForTask('coding');
console.log('Using:', model.name);
```

---

### 9. Enhanced Assistant (`lib/enhancedAssistant.js`)

Main integration point combining all components.

```javascript
import { createEnhancedAssistant } from './lib/enhancedAssistant.js';

const assistant = createEnhancedAssistant({
  autonomyLevel: 2,
  showPhases: true,
  enableReflection: true,
  dryRun: false,
});

// Event handlers
assistant.on('phase', ({ phase, message }) => {
  console.log(`[${phase}] ${message}`);
});

assistant.on('confirmation:required', ({ action }) => {
  console.log('Confirm:', action.description);
});

// Process message
const result = await assistant.processMessage('Create a new React component');
```

---

## Integration with Existing Code

### Using with Current Assistant

The enhanced components can be integrated gradually:

```javascript
// In assistant.js
import { EnhancedAssistant } from './lib/enhancedAssistant.js';

// Create enhanced instance alongside existing
const enhanced = new EnhancedAssistant({
  autonomyLevel: getConfig('autonomy.level', 1),
});

// Use for complex tasks
if (isComplexTask(input)) {
  return enhanced.processMessage(input);
} else {
  // Use existing simple flow
  return handleSimpleInput(input);
}
```

### Memory Integration

The existing memory managers work with the new system:

```javascript
import { initMemory } from './lib/memoryManager.js';
import { initVectorMemory } from './lib/vectorMemory.js';

// Initialize existing memory
initMemory();
initVectorMemory();

// Use with agent loop
const agent = new AgentLoop({
  memory: {
    retrieveRelevant: async (query, options) => {
      // Use existing vectorMemory
      return await searchMemories(query);
    },
    store: async (entry) => {
      // Use existing memoryManager
      await saveMemory(entry);
    },
  },
});
```

---

## Configuration

### Environment Variables

```bash
# Model Configuration
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2
EMBEDDING_MODEL=nomic-embed-text
VISION_MODEL=llava

# Remote Providers (optional)
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk-...

# Autonomy
STATIC_REBEL_AUTONOMY_LEVEL=1
STATIC_REBEL_DRY_RUN=false
```

### Config File

```json
{
  "autonomy": {
    "level": 2,
    "dryRun": false,
    "blockedTools": [],
    "allowedPaths": ["/home/user/projects"]
  },
  "models": {
    "default": "ollama/llama3.2",
    "taskMapping": {
      "coding": "ollama/qwen3-coder",
      "analysis": "ollama/deepseek-r1"
    }
  },
  "safety": {
    "confirmationRequired": true,
    "maxFileSize": 10485760
  }
}
```

---

## Event System

All components emit events for monitoring and UI updates:

```javascript
// Agent Loop Events
agent.on('phase:observe', () => {});
agent.on('phase:think', ({ thought }) => {});
agent.on('phase:act', () => {});
agent.on('phase:reflect', () => {});
agent.on('action:executing', ({ action }) => {});
agent.on('action:completed', ({ action, result }) => {});
agent.on('action:needs_confirmation', ({ action }) => {});

// Safety Events
safety.on('check:completed', ({ result }) => {});
safety.on('confirmation:required', ({ action, warnings }) => {});

// Goal Events
planner.on('goal:created', ({ goal }) => {});
planner.on('goal:activated', ({ goal }) => {});
planner.on('goal:completed', ({ goal }) => {});
planner.on('step:completed', ({ step, result }) => {});
```

---

## Best Practices

### 1. Start Conservative

Begin with autonomy level 1 (Assisted) and increase as trust is established:

```javascript
const assistant = createEnhancedAssistant({
  autonomyLevel: 1, // Start here
  showPhases: true, // See what it's doing
});
```

### 2. Use Dry-Run Mode

Test actions before executing:

```javascript
const assistant = createEnhancedAssistant({
  dryRun: true, // Preview actions only
});
```

### 3. Review Reflections

Check what the system has learned:

```javascript
const stats = assistant.reflectionEngine.getErrorStats();
console.log('Common errors:', stats.byType);
```

### 4. Set Clear Goals

Define success criteria for complex tasks:

```javascript
const goal = planner.createGoal({
  description: 'Optimize database queries',
  successCriteria: ['Query time < 100ms', 'All existing tests pass'],
});
```

---

## File Structure

```
lib/
├── agentLoop.js          # Core agent loop (Observe-Think-Act-Reflect-Store)
├── toolRegistry.js       # Standardized tool interface
├── autonomyManager.js    # Autonomy level management
├── goalPlanner.js        # Goal planning and execution
├── reflectionEngine.js   # Self-improvement and error memory
├── safetyGuard.js        # Safety constraints and guardrails
├── pluginManager.js      # Plugin system
├── modelAbstraction.js   # Multi-provider model interface
├── enhancedAssistant.js  # Main integration component
├── memoryManager.js      # Existing: Daily/long-term memory
├── vectorMemory.js       # Existing: Vector embeddings
├── modelRegistry.js      # Existing: Ollama management
└── ...                   # Other existing modules

docs/
├── IMPROVEMENT_PLAN.md   # Original improvement plan
└── ARCHITECTURE.md       # This file
```

---

## Next Steps

1. **Testing** - Write tests for new components
2. **Integration** - Gradually integrate with existing assistant.js
3. **UI Updates** - Update dashboard to show phase indicators
4. **Documentation** - Add JSDoc comments to all public APIs
5. **Examples** - Create example plugins and usage patterns

---

## Success Criteria

StaticRebel is "next-level" when:

- ✅ Remembers user preferences across sessions
- ✅ Completes multi-step tasks without babysitting
- ✅ Explains _why_ it did something
- ✅ Stops itself when uncertain
- ✅ Improves behavior based on past mistakes

> Less magic. More clarity.  
> Autonomy must earn trust.
