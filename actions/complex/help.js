/**
 * Help Action
 * Shows help information and available capabilities
 */

export default {
  name: 'help',
  displayName: 'Help System',
  description: 'Show help information, available commands, and capabilities',
  category: 'system',
  version: '1.0.0',

  intentExamples: [
    'help',
    'what can you do',
    'what commands',
    'how does this work',
    'how to',
    'show help',
    'capabilities',
    'features',
  ],

  parameters: {
    topic: {
      type: 'string',
      description: 'Specific help topic',
    },
  },

  dependencies: [],

  async handler(input, context, params) {
    return `I'm Charlize, your Level 3 AI assistant! Just talk to me naturally:

**Scheduling**
"Remind me to stretch every hour"
"Schedule a daily summary at 9am"
"Set a reminder for Monday at 3pm"

**Tasks & Delegation**
"Write a function to sort an array"
"Create a React component for a button"
"Analyze the pros and cons of these options"
"Think about whether I should use SQL or NoSQL"

**Tracking**
"I had a cappuccino, log it"
"Log 450 calories for my sandwich"
"How many calories today?"

**Memory**
"What did we talk about today?"
"Show me my memory stats"
"Curate my memories"

**Level 2 Features**
"Be more concise" - Adjust my personality
"Remember this information" - Store in vector memory
"Create a project" - Generate TODO.md with background tasks
"Connect to API" - Set up dynamic API connectors

**Level 3: Web Oracle (Research)**
"Research the latest AI developments"
"Investigate climate change technologies"
"What's new in quantum computing?"
"Research Rust vs C++ performance"

**Level 3: Orchestrator (Claude Code)**
"Debug this complex bug in my codebase"
"Refactor the entire project structure"
"Do a full architecture review"
"Use claude code for a complete rewrite"

**Current Information**
"Search for latest AI news"
"What's new in tech?"
"What's happening today?"

**Quick Info**
"What models do I have?"
"Show me my scheduled tasks"

Just say what you need - I'll figure it out!`;
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
