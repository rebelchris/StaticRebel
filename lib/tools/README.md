# StaticRebel Tool System

Unified tool system for StaticRebel that provides a single entry point for tool discovery, registration, and execution.

## Overview

The tool system consolidates tools from various sources:
- Built-in tools (file operations, shell commands, web search)
- Migrated legacy tools from `toolRegistry.js`
- Skills converted to tools via `skill-adapter.js`
- **NEW: OpenClaw-style coding tools**

## Architecture

```
lib/tools/
├── index.js           # Main entry point - UnifiedToolSystem
├── registry.js        # Core ToolRegistry with schema validation & rate limiting
├── migrator.js        # Migrates legacy tools + registers coding tools
├── skill-adapter.js   # Converts skills to tools
├── file-tools.js      # NEW: read, write, edit, list tools
├── exec-tool.js       # NEW: Shell command execution
├── project-context.js # NEW: Project structure analysis
├── test.js            # Test suite
└── README.md          # This file
```

## Quick Start

```javascript
import { getToolSystem, initializeToolSystem } from './lib/tools/index.js';

// Initialize (done once at startup)
await initializeToolSystem();

// Execute a tool
const system = getToolSystem();
const result = await system.executeTool('read', { path: 'package.json' });
```

## Coding Tools (OpenClaw-style)

These tools enable AI-assisted coding and project manipulation:

### read
Read contents of a file with optional line offset/limit.

```javascript
await system.executeTool('read', {
  path: 'src/index.js',   // Required: file path
  offset: 10,              // Optional: start line (1-indexed)
  limit: 50                // Optional: max lines to read
});
```

### write
Create or overwrite a file. Creates parent directories if needed.

```javascript
await system.executeTool('write', {
  path: 'src/utils/helper.js',  // Required: file path
  content: '// Helper functions\n...'  // Required: content
});
```

### edit
Precise text replacement. The `oldText` must match exactly.

```javascript
await system.executeTool('edit', {
  path: 'src/config.js',
  oldText: 'const DEBUG = false;',
  newText: 'const DEBUG = true;'
});
```

### list
List directory contents with optional glob pattern.

```javascript
await system.executeTool('list', {
  path: 'src/',           // Optional: directory (default: cwd)
  pattern: '**/*.js'      // Optional: glob pattern
});
```

### exec
Execute shell commands with timeout and safety checks.

```javascript
await system.executeTool('exec', {
  command: 'npm test',    // Required: shell command
  cwd: './packages/core', // Optional: working directory
  timeout: 60000          // Optional: timeout in ms (default: 30000)
});
```

### project_context
Analyze project structure, detect frameworks, find entry points.

```javascript
await system.executeTool('project_context', {
  path: '.'  // Optional: project root (default: cwd)
});

// Returns:
// {
//   type: 'nodejs',
//   language: 'javascript',
//   frameworks: ['react', 'nextjs'],
//   entryPoints: ['src/index.js'],
//   configFiles: ['package.json', 'tsconfig.json', ...],
//   structure: [...],
//   summary: 'nodejs project using react, nextjs (my-app)...'
// }
```

## Security

### Path Validation
All file tools validate paths to prevent access outside the project:
- Paths are resolved relative to project root
- Access to `node_modules`, `.git`, `.env` files is blocked
- Symbolic links that escape the project are rejected

### Command Safety
The exec tool has built-in safety checks:
- Dangerous commands are blocked (rm -rf /, dd, mkfs, etc.)
- Potentially destructive commands generate warnings
- Output is limited to prevent memory exhaustion
- Timeouts prevent runaway processes

## Intent Detection

The chat handler recognizes coding intents through patterns like:
- "create a file", "write to file", "save this as"
- "read the file", "show me", "open"
- "edit file", "modify", "update", "fix"
- "list files", "project structure"
- "run command", "npm install", "git status"

## System Prompt Integration

When in project context, the system prompt is augmented with coding tool instructions telling the AI when to use each tool vs showing inline code.

## Tool Registration

Tools follow this schema:

```javascript
{
  name: 'tool_name',
  description: 'What the tool does',
  schema: {
    requiredParam: 'string',
    optionalParam: 'number?'
  },
  handler: async (params, context) => {
    // Implementation
    return { /* result */ };
  },
  rateLimit: {           // Optional
    requests: 10,
    window: '1m'
  },
  metadata: {            // Optional
    category: 'filesystem',
    safe: true
  }
}
```

## Testing

```bash
node lib/tools/test.js
```

## License

MIT
