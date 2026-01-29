# StaticRebel Agent Guide

**Version:** 2.0.0  
**Last Updated:** 2026-01-29  
**Purpose:** Living documentation for AI assistant behavior and project understanding

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Module Guidelines](#module-guidelines)
4. [Coding Standards](#coding-standards)
5. [Safety Policies](#safety-policies)
6. [Multi-Agent System](#multi-agent-system)
7. [Common Patterns](#common-patterns)
8. [Testing Requirements](#testing-requirements)

---

## Project Overview

StaticRebel is a next-level autonomous AI assistant powered by local Ollama models. It transforms from a reactive CLI chatbot into a proactive, context-aware development partner.

### Key Capabilities

- **Repository Understanding**: Semantic vector indexing, AST analysis, cross-file relationships
- **Autonomous Execution**: 4 levels of autonomy from chat-only to fully autonomous
- **Multi-Agent Collaboration**: Specialized agents for parsing, planning, execution, verification, and search
- **Memory Systems**: Short-term, long-term, and project-specific memory
- **Safety & Guardrails**: Configurable policies, undo/redo, checkpoints
- **External Knowledge**: StackOverflow, documentation, release notes integration

### Project Structure

```
static-rebel/
├── lib/                    # Core libraries
│   ├── agentLoop.js        # OODA loop implementation
│   ├── agentRegistry.js    # Multi-agent framework
│   ├── repositoryIndexer.js # Semantic code indexing
│   ├── codeAnalyzer.js     # AST parsing and analysis
│   ├── gitOperations.js    # Git integration
│   ├── shellIntegration.js # Shell command execution
│   ├── projectMemory.js    # Cross-session memory
│   ├── knowledgePlugins.js # External knowledge sources
│   ├── testGenerator.js    # Test generation
│   ├── safetyPolicies.js   # Safety configuration
│   └── ...
├── agents/                 # Specialized agents
│   └── specialized/
│       ├── parser.js       # Code parsing agent
│       ├── planner.js      # Task planning agent
│       ├── executor.js     # Command execution agent
│       ├── verifier.js     # Testing and validation agent
│       └── searcher.js     # Knowledge search agent
├── actions/                # Action handlers
├── docs/                   # Documentation
└── tests/                  # Test suite
```

---

## Architecture

### Core Loop (OODA)

The agent follows the OODA loop pattern:

1. **Observe**: Gather input, environment state, relevant memories
2. **Think**: Reason, plan, decide on actions
3. **Act**: Execute tools/actions
4. **Reflect**: Evaluate results and learn
5. **Store**: Update memories with learnings

### Autonomy Levels

| Level | Name | Description |
|-------|------|-------------|
| 0 | Chat | Pure Q&A, no actions |
| 1 | Assisted | Suggests actions, asks permission (default) |
| 2 | Semi-Autonomous | Executes safe actions automatically, confirms risky ones |
| 3 | Autonomous | Works toward goals over multiple steps |

### Memory Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        MEMORY LAYERS                        │
├─────────────────────────────────────────────────────────────┤
│  Session Memory  │  Current conversation and context         │
├─────────────────────────────────────────────────────────────┤
│  Project Memory  │  Goals, sessions, preferences per project │
├─────────────────────────────────────────────────────────────┤
│  Long-term       │  User preferences, patterns, lessons      │
├─────────────────────────────────────────────────────────────┤
│  Vector Memory   │  Semantic embeddings for retrieval        │
└─────────────────────────────────────────────────────────────┘
```

---

## Module Guidelines

### Agent Loop (`lib/agentLoop.js`)

**Purpose**: Core autonomous agent architecture

**When to use**:
- Implementing new agent behaviors
- Adding phases to the OODA loop
- Managing agent state

**Guidelines**:
- Extend the base `AgentLoop` class for custom agents
- Use `registerTool()` to add capabilities
- Emit events for each phase change
- Respect autonomy levels in `canExecute()`

**Example**:
```javascript
const agent = new AgentLoop({
  autonomyLevel: 2,
  maxIterations: 10,
  enableReflection: true,
});

agent.on('phase:think', ({ thought }) => {
  console.log('Thinking:', thought.reasoning);
});
```

### Repository Indexer (`lib/repositoryIndexer.js`)

**Purpose**: Semantic vector index of all files

**When to use**:
- Searching for similar code
- Understanding code relationships
- Finding relevant context

**Guidelines**:
- Initialize with `initRepositoryIndex()` before use
- Use `indexFile()` for incremental updates
- Call `searchSimilar()` for semantic search
- Enable file watching for auto-indexing

**Example**:
```javascript
await initRepositoryIndex();
await indexRepository('./src');
const results = await searchSimilar('authentication middleware', 5);
```

### Code Analyzer (`lib/codeAnalyzer.js`)

**Purpose**: AST-based code understanding

**When to use**:
- Parsing JavaScript/TypeScript
- Extracting symbols
- Building dependency graphs

**Guidelines**:
- Use `parseFile()` for automatic language detection
- Call `extractSymbols()` to get functions, classes, imports
- Use `buildCallGraph()` for relationship mapping

### Git Operations (`lib/gitOperations.js`)

**Purpose**: Comprehensive Git integration

**When to use**:
- Branch management
- Committing changes
- Checking repository status

**Guidelines**:
- Always check `isGitRepository()` first
- Use `generateCommitMessage()` for AI-generated commits
- Create branches for major changes
- Stash changes before risky operations

**Safety**:
- Require confirmation for destructive operations
- Preview changes before committing
- Never force push without explicit confirmation

### Shell Integration (`lib/shellIntegration.js`)

**Purpose**: Safe shell command execution

**When to use**:
- Running system commands
- Executing build scripts
- Managing processes

**Guidelines**:
- Always validate commands with `validateCommand()`
- Use `dryRun` mode for preview
- Respect timeout limits
- Check risk levels before execution

**Safety Levels**:
- Low: Read-only operations
- Medium: File modifications
- High: Destructive operations
- Critical: System-level changes

### Project Memory (`lib/projectMemory.js`)

**Purpose**: Cross-session project persistence

**When to use**:
- Tracking project goals
- Storing user preferences
- Resuming previous sessions

**Guidelines**:
- Create goals with clear success criteria
- End sessions properly to preserve context
- Use `inferCodingStyle()` to learn from existing code

### Knowledge Plugins (`lib/knowledgePlugins.js`)

**Purpose**: External knowledge source integration

**When to use**:
- Searching StackOverflow
- Fetching documentation
- Getting release notes

**Guidelines**:
- Use `search()` for multi-source queries
- Respect cache TTLs
- Filter by credibility for important decisions

### Test Generator (`lib/testGenerator.js`)

**Purpose**: Automatic test generation

**When to use**:
- Creating tests for new features
- Analyzing coverage
- Suggesting edge cases

**Guidelines**:
- Detect framework automatically
- Use AI for edge case suggestions
- Validate generated tests before writing

### Agent Registry (`lib/agentRegistry.js`)

**Purpose**: Multi-agent collaboration framework

**When to use**:
- Coordinating complex tasks
- Distributing work across agents
- Managing agent communication

**Guidelines**:
- Register agents with clear capabilities
- Use `coordinate()` for complex multi-step tasks
- Handle message failures gracefully

### Safety Policies (`lib/safetyPolicies.js`)

**Purpose**: Configurable safety guardrails

**When to use**:
- Checking action permissions
- Managing undo/redo
- Creating checkpoints

**Guidelines**:
- Always check policies before risky operations
- Create checkpoints before major changes
- Log all operations for accountability

---

## Coding Standards

### JavaScript/TypeScript

**Style**:
- Use ES modules (`import`/`export`)
- Prefer `const` and `let` over `var`
- Use async/await for asynchronous code
- Follow JSDoc documentation standards

**Naming**:
- `camelCase` for variables and functions
- `PascalCase` for classes
- `UPPER_SNAKE_CASE` for constants
- Descriptive names over abbreviations

**Error Handling**:
```javascript
// Always handle errors
try {
  const result = await riskyOperation();
} catch (error) {
  console.error('[ModuleName] Operation failed:', error.message);
  // Provide fallback or re-throw
}
```

### Module Structure

```javascript
/**
 * Module Name - Brief description
 *
 * Features:
 * - Feature 1
 * - Feature 2
 *
 * @module moduleName
 */

// Imports
import { something } from './somewhere';

// Constants
const CONSTANTS = {
  VALUE: 42,
};

// Types (JSDoc)
/**
 * @typedef {Object} MyType
 * @property {string} name
 */

// Private functions
function helper() { }

// Public functions
export function publicFunction() { }

// Default export
export default {
  publicFunction,
};
```

---

## Safety Policies

### Default Risk Levels

| Action | Risk Level | Confirmation Required |
|--------|------------|----------------------|
| file_read | Low | No |
| file_write | Medium | Yes |
| file_delete | High | Yes |
| shell | High | Yes |
| git_commit | Medium | Yes |
| git_push | High | Yes |

### Protected Paths

The following paths are protected and require explicit confirmation:
- `/etc/*`
- `/proc/*`
- `/sys/*`
- `/dev/*`
- `~/.ssh/*`
- `~/.gnupg/*`

### Blocked Commands

These commands are always blocked:
- `rm -rf /` or `rm -rf /*`
- `mkfs` variants
- `dd if=/dev/zero`
- Fork bombs (`:(){ :|:& };:`)
- Pipe to shell (`curl ... | sh`)

### Best Practices

1. **Always validate** user input before execution
2. **Use dry-run** mode for previewing changes
3. **Create backups** before file modifications
4. **Stash changes** in git before risky operations
5. **Log all operations** for accountability
6. **Respect autonomy levels** - don't exceed configured permissions

---

## Multi-Agent System

### Agent Types

| Agent | Capabilities | Use Case |
|-------|-------------|----------|
| Parser | parse_code, extract_symbols, analyze_dependencies | Understanding code structure |
| Planner | decompose_tasks, create_plans, sequence_steps | Breaking down complex tasks |
| Executor | execute_shell, read_file, write_file | Performing actions |
| Verifier | run_tests, validate_safety, check_quality | Validating results |
| Searcher | web_search, search_documentation | Finding information |

### Communication Protocol

```javascript
// Send message
agentRegistry.sendMessage(
  fromAgentId,
  toAgentId,
  MESSAGE_TYPES.TASK_ASSIGN,
  { taskId, type, data }
);

// Broadcast
agentRegistry.broadcast(
  fromAgentId,
  MESSAGE_TYPES.STATUS,
  { status: 'ready' }
);
```

### Task Coordination

```javascript
// Coordinate complex task
const result = await agentRegistry.coordinate({
  steps: [
    { capability: 'parse_code', type: 'analyze', data: { file } },
    { capability: 'execution', type: 'modify', data: { changes } },
    { capability: 'verify', type: 'test', data: { tests } },
  ],
});
```

---

## Common Patterns

### Pattern: Safe File Operations

```javascript
import safetyPolicies from './lib/safetyPolicies.js';
import { stashChanges } from './lib/gitOperations.js';

async function safeFileWrite(filePath, content) {
  // Check policy
  const check = safetyPolicies.checkAction('file_write', { path: filePath });
  if (!check.allowed) {
    throw new Error(`Action not allowed: ${check.reason}`);
  }

  // Create checkpoint
  const checkpoint = safetyPolicies.createCheckpoint('before-write', { filePath });

  // Stash git changes
  await stashChanges('pre-write-backup');

  try {
    // Perform operation
    await fs.writeFile(filePath, content);

    // Log operation
    safetyPolicies.logOperation({
      action: 'file_write',
      params: { filePath },
      status: 'success',
    });

  } catch (error) {
    // Restore checkpoint on failure
    safetyPolicies.restoreCheckpoint(checkpoint);
    throw error;
  }
}
```

### Pattern: Context-Aware Response

```javascript
async function generateResponse(userInput) {
  // 1. Search repository for relevant context
  const repoResults = await searchSimilar(userInput, 3);

  // 2. Get project context
  const projectContext = await getProjectContext(process.cwd());

  // 3. Query external knowledge if needed
  const knowledge = await knowledgePlugins.search(userInput, { maxResults: 2 });

  // 4. Generate response with full context
  const prompt = buildPrompt(userInput, {
    repoContext: repoResults,
    projectContext,
    externalKnowledge: knowledge,
  });

  return await chatCompletion(model, prompt);
}
```

### Pattern: Multi-Agent Task

```javascript
async function refactorCode(filePath) {
  // 1. Parse agent analyzes code
  const parseTask = agentRegistry.createTask('parse_file', { filePath }, parserAgent.id);

  // 2. Planner creates refactoring plan
  const planTask = agentRegistry.createTask('create_plan', {
    goal: 'Refactor code',
    context: { filePath },
  }, plannerAgent.id);

  // 3. Executor performs changes
  const execTask = agentRegistry.createTask('execute_changes', {
    plan: planTask.result,
  }, executorAgent.id);

  // 4. Verifier runs tests
  const verifyTask = agentRegistry.createTask('run_tests', {
    projectPath: process.cwd(),
  }, verifierAgent.id);

  // Wait for completion
  return await Promise.all([parseTask, planTask, execTask, verifyTask]);
}
```

---

## Testing Requirements

### Unit Tests

- Test each module independently
- Mock external dependencies
- Cover success and error paths
- Use descriptive test names

### Integration Tests

- Test agent communication
- Verify tool execution
- Test multi-agent coordination
- Validate safety policies

### Test Naming

```javascript
describe('ModuleName', () => {
  describe('functionName', () => {
    it('should succeed with valid input', () => {});
    it('should throw with invalid input', () => {});
    it('should handle edge case X', () => {});
  });
});
```

### Coverage Targets

- Minimum: 70%
- Target: 80%
- Ideal: 90%

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2026-01-29 | Initial next-level implementation |

---

## Contributing

When modifying this guide:
1. Update the version number
2. Add entry to version history
3. Ensure code examples are tested
4. Follow the coding standards documented here

---

*This document is auto-generated and maintained by the StaticRebel system.*
