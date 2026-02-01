# Unified Tool System

A centralized, schema-validated tool registry for StaticRebel that consolidates tools from multiple sources into a single, coherent system.

## Features

- **Single Registry**: All tools in one place with unified interface
- **Schema Validation**: Automatic parameter validation for all tools
- **Rate Limiting**: Configurable per-tool rate limits to prevent abuse
- **Tool Discovery**: Search and discover tools by name or description
- **Migration Support**: Automatically migrates existing tools from various sources
- **Skill Integration**: Loads skills as executable tools
- **Error Handling**: Comprehensive error handling and logging

## Quick Start

```js
import { getToolSystem, initializeToolSystem, executeTool } from './lib/tools/index.js';

// Initialize the system (loads all tools)
await initializeToolSystem();

// Execute a tool
const result = await executeTool('web_search', {
  query: 'Node.js 22 features',
  limit: 5
});

console.log(result);
```

## Tool Definition Format

```js
const toolDefinition = {
  schema: {
    query: 'string',        // Required string parameter
    limit: 'number?',       // Optional number parameter (note the ?)
    options: 'object?'      // Optional object parameter
  },
  handler: async (params, context) => {
    // Tool implementation
    const { query, limit = 5 } = params;
    
    // Do work here
    return {
      result: 'some result',
      query,
      limit
    };
  },
  description: 'Search for information',
  rateLimit: {
    requests: 10,
    window: '1m'  // 1 minute window
  },
  metadata: {
    category: 'search',
    author: 'system'
  }
};
```

## Schema Types

- `string` - String parameter (required)
- `string?` - Optional string parameter
- `number` - Number parameter (required)
- `number?` - Optional number parameter
- `boolean` - Boolean parameter (required)
- `boolean?` - Optional boolean parameter
- `object` - Object parameter (required)
- `object?` - Optional object parameter
- `array` - Array parameter (required)
- `array?` - Optional array parameter

## Rate Limiting

Rate limits use time windows:

- `1s` - 1 second
- `1m` - 1 minute
- `1h` - 1 hour
- `1d` - 1 day

Example:
```js
rateLimit: {
  requests: 10,    // Max 10 requests
  window: '1m'     // Per minute
}
```

## Built-in Tools

The system includes several built-in tools:

### Core Tools

- **`web_search`** - Search the web (requires API configuration)
- **`log_skill`** - Log skill usage data
- **`file_read`** - Read file contents
- **`file_write`** - Write content to files
- **`shell_command`** - Execute shell commands

### Migrated Tools (from lib/toolRegistry.js)

- **`file_read_legacy`** - Legacy file reader
- **`file_write_legacy`** - Legacy file writer
- **`shell_legacy`** - Legacy shell execution
- **`web_fetch`** - Fetch content from URLs
- **`search_local`** - Search local files
- **`task_planner`** - Create task plans

### Skill Management Tools

- **`skills_list`** - List all available skills
- **`skill_create`** - Create new skills
- **`skill_trigger`** - Execute skill triggers

### Skill Tools (Dynamic)

Skills are automatically loaded as tools with names like:
- **`skill_{skill_name}`** - Execute skill triggers based on input

## Usage Examples

### Basic Tool Execution

```js
import { executeTool } from './lib/tools/index.js';

// Search the web
const searchResult = await executeTool('web_search', {
  query: 'JavaScript async patterns'
});

// Read a file
const fileResult = await executeTool('file_read', {
  path: './package.json'
});

// Log skill data
const logResult = await executeTool('log_skill', {
  skill_id: 'my_skill',
  data: { usage: 'example' }
});
```

### Tool Discovery

```js
import { getToolSystem } from './lib/tools/index.js';

const system = getToolSystem();

// Find tools by query
const searchTools = system.discoverTools('search');
console.log(searchTools); // Returns web_search, search_local, etc.

// Get all tools
const allTools = system.getAvailableTools();

// Filter tools by category
const fileTools = system.getAvailableTools({ category: 'filesystem' });
```

### Custom Tool Registration

```js
import { getToolSystem } from './lib/tools/index.js';

const system = getToolSystem();

system.registerTool('custom_tool', {
  schema: {
    message: 'string',
    urgent: 'boolean?'
  },
  handler: async (params, context) => {
    const { message, urgent = false } = params;
    
    console.log(`${urgent ? '🚨' : '📝'} ${message}`);
    
    return {
      logged: true,
      message,
      urgent,
      timestamp: Date.now()
    };
  },
  description: 'Log a custom message',
  rateLimit: {
    requests: 20,
    window: '1m'
  }
});
```

### Error Handling

```js
const result = await executeTool('some_tool', { param: 'value' });

if (result.success) {
  console.log('Tool executed successfully:', result.result);
} else {
  console.error('Tool execution failed:', result.error);
}
```

## System Statistics

```js
import { getToolSystem } from './lib/tools/index.js';

const system = getToolSystem();
const stats = system.getStats();

console.log(stats);
// Output:
// {
//   totalTools: 15,
//   categories: {
//     search: 3,
//     filesystem: 4,
//     skill: 5,
//     system: 2,
//     network: 1
//   },
//   hasRateLimit: 12,
//   initialized: true
// }
```

## Integration Points

The unified tool system integrates with:

1. **Assistant.js** - Tools can be called from the main assistant
2. **Skills System** - Skills are automatically loaded as tools
3. **Legacy Tool Registry** - Existing tools are migrated
4. **Command Interface** - Tools can be exposed as commands

## Migration Notes

When upgrading from the old system:

1. Old tool calls still work (migrated automatically)
2. New tools use the `executeTool()` function
3. Schema validation is now enforced
4. Rate limiting is applied automatically
5. Skills are available as tools

## Configuration

Set these environment variables for full functionality:

```bash
# For web search
TAVILY_API_KEY=your_tavily_key
# OR
SEARXNG_URL=your_searxng_instance

# Tool system logging
TOOL_LOG_LEVEL=info
TOOL_RATE_LIMIT_ENABLED=true
```

## Architecture

```
lib/tools/
├── index.js          # Main entry point
├── registry.js       # Core registry implementation
├── migrator.js       # Migrates existing tools
├── skill-adapter.js  # Loads skills as tools
└── README.md         # This file
```

The system follows a layered architecture:

1. **Registry Layer** - Core tool registration and execution
2. **Migration Layer** - Handles existing tool compatibility
3. **Skill Adapter Layer** - Bridges skills to tools
4. **API Layer** - Public interface for tool operations