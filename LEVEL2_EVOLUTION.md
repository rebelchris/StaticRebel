# Level 2 AI Assistant - Evolution Roadmap

This document describes the Phase 1-3 implementation of the StaticRebel Assistant.

## Phase 1: The "Identity" Layer (Personas & Memory)

### Dynamic Persona Manager (`lib/personaManager.js`)

Features:
- **Multiple Personas**: Charlize, Architect (Meta-Persona), Code Master, Deep Thinker
- **Self-Modifying Prompts**: "Be more concise", "Be more friendly" - persona adjusts automatically
- **Meta-Persona**: "The Architect" can rewrite its own system prompt based on user feedback
- **Evolution History**: Tracks all persona changes over time
- **Pattern Analysis**: Analyzes conversation history for improvement suggestions

Usage:
```
"Be more concise" -> Persona becomes more terse
"Use simpler language" -> Reduces jargon
"Focus on technical" -> Emphasizes coding expertise
```

### Vector Database (`lib/vectorMemory.js`)

Features:
- **Semantic Memory**: Store memories with vector embeddings
- **Cosine Similarity Search**: Find related memories semantically
- **Memory Types**: Preferences, Projects, General
- **Persistent Storage**: JSONL format for durability
- **Statistics**: Track memory usage and age

Usage:
```
"Remember this important info" -> Stores in vector memory
"Search my memories" -> Semantic search across all memories
```

## Phase 2: The "Autonomy" Layer (Background Workers)

### Worker System (`lib/workerManager.js`)

Features:
- **Task Queue**: Priority-based (urgent, high, normal, low)
- **Worker Threads**: Runs tasks in parallel using Node.js worker_threads
- **Subtask Management**: Complex projects with multiple subtasks
- **TODO.md Generation**: Auto-generates project todo files
- **Task Statistics**: Track queue length, completion rates

Usage:
```
"Create a project" -> Creates TODO.md + background tasks
"Run in background" -> Queues async task
"Show worker stats" -> Displays queue status
```

### Project Structure Created
```
~/.static-rebel/
├── workers/          # Worker scripts
├── tasks/            # Task definitions
└── logs/             # Worker logs
```

## Phase 3: The "Skills" Layer (Tool Calling & API Bridge)

### Dynamic API Connector (`lib/apiConnector.js`)

Features:
- **REST API Support**: Auto-generate wrapper classes
- **Authentication**: apikey, bearer, basic, oauth2
- **Endpoint Templates**: Pre-built patterns for common APIs
- **Secure Key Storage**: API keys stored separately
- **Documentation Generation**: Auto-generate API docs

Usage:
```
"Connect to Weather API" -> Creates connector
"Store API key for X" -> Secure storage
"Show my APIs" -> List all connectors
```

### Common Services Pre-configured
- Weather API (OpenWeatherMap)
- News API
- Spotify API

## System Architecture

```
static-rebel/
├── lib/
│   ├── personaManager.js    # Phase 1: Dynamic Personas
│   ├── vectorMemory.js      # Phase 1: Semantic Memory
│   ├── workerManager.js     # Phase 2: Background Tasks
│   ├── apiConnector.js      # Phase 3: API Integration
│   └── level2.js            # Unified exports
├── enhanced.js              # Main entry (updated)
└── package.json             # Updated deps
```

## Natural Language Commands

### Level 2 Specific
```
"Be more concise" -> Adjust persona behavior
"Remember this" -> Store in vector memory
"Create a project" -> Generate TODO.md + tasks
"Connect to API" -> Set up API connector
"Show worker stats" -> Background task status
```

### Existing (Enhanced)
```
"Remind me to stretch every hour" -> Schedule task
"I had a cappuccino, log calories" -> Tracker
"Write a function" -> Coding subagent
"Search for latest AI news" -> Web search
```

## Configuration

Personas stored at: `~/.static-rebel/personas/`
Vector memories at: `~/.static-rebel/vector-memory/`
Tasks at: `~/.static-rebel/tasks/`
API connectors at: `~/.static-rebel/api-connectors/`
API keys at: `~/.static-rebel/api-keys.json`

## Future Enhancements

1. **Real Embeddings**: Integrate Ollama's embedding endpoint for true semantic similarity
2. **Redis Queue**: For distributed task processing
3. **MCP Integration**: Connect to Model Context Protocol servers
4. **Temporal**: For complex workflow orchestration
5. **APScheduler**: For time-based task preparation
