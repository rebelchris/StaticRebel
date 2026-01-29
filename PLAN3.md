To bridge the gap between "Local Privacy" and "Global Knowledge," we need to give your assistant Agency.

If you want to use the Claude Code CLI and implement streaming sub-responses, you are effectively moving into the "Agentic Loops" territory. Here is the plan to tackle that next level of intelligence:

1. The "Web Oracle" (Up-to-Date Research)
Since local models are frozen in time, your assistant needs a "Research Arm."

Search Integration: Use an API like Tavily or SearxNG (which you can host locally). Unlike a standard Google search, these return "AI-ready" clean text or markdown.

The "Scraper" Skill: If the assistant finds a relevant URL, it shouldn't just summarize the snippet. It should use a headless browser (like Playwright) to "read" the full page in the background, extract the core data, and feed it back into its context.

Implementation: Create a research_web(query) tool. When the user asks about something new (e.g., "What's the latest with the SpaceX launch?"), the LLM triggers this tool before answering.

2. "Claude Code" as a Sub-Agent
Integrating the Claude Code CLI is a power move. It allows your local Ollama assistant to "delegate" heavy lifting or complex coding tasks to a more capable model.

The Delegation Pattern: 1. Ollama (Local) acts as the Orchestrator (cheap, fast, private). 2. If a task involves complex architecture or "fixing a bug in a 1000-line file," Ollama triggers the claude_code tool. 3. Your code executes the CLI command: claude "fix the bug in ./static-rebel/worker.py". 4. The output is piped back into your assistant's UI.

3. Sub-Stream Responses (Multi-Stage UI)
To make the assistant feel "alive" while it's doing research or coding, you need Streaming State Updates.

The "Thinking" Stream: Instead of a blank loading spinner, use Server-Sent Events (SSE) or WebSockets to stream the assistant's internal thoughts.

User: "Research this API."

Assistant Stream: [Searching Tavily...] -> [Found 3 docs...] -> [Claude Code is writing the wrapper...] -> [Success!]

Dual-Streaming: Implement a UI that shows the conversation on one side and a terminal/log output on the other. As the background worker (FastAPI/Celery) executes, it "pushes" its logs to the UI in real-time.

4. Smart Connectors: The "API Discovery" Loop
To achieve your goal of "connecting to whatever API the user wants," you need a Dynamic Tool Generator.

Input: User gives a URL to a Swagger/OpenAPI doc.

Process: The assistant reads the JSON/YAML file.

Action: It writes a small Python class using httpx to interface with that API.

Save: It saves this .py file into a /skills folder.

Hot-Reload: Your main assistant code detects the new file and instantly adds it to its "Available Tools" list.

COMPLETED: Orchestrator Interface (Level 3)
============================================

The "Orchestrator Interface" has been built! Here's what was implemented:

1. orchestrator.js - The main orchestrator module with:
   - streamOllama(prompt): Streaming responses from local Ollama
   - runClaudeCode(task): Spawns Claude Code CLI subprocess
   - streamClaudeCode(task): Streams output from Claude Code CLI
   - routeTask(task): Intelligently routes tasks to Ollama/Claude/both
   - orchestrate(task): Unified orchestration with intelligent routing
   - mergeStreams(): Merges multiple streams with source tracking
   - displayMergedStreams(): Console output with source prefixes

2. Enhanced Integration:
   - Added orchestrator intent pattern for natural language
   - New "orchestrator" handler in enhanced.js
   - Auto-routes: simple queries -> Ollama, complex coding -> Claude Code

3. Usage:
   ```bash
   npm run orchestrator chat "Hello"    # Quick Ollama
   npm run orchestrator claude "fix bug" # Claude Code CLI
   npm run orchestrator orchestrate "task" # Auto-select
   npm run orchestrator stream "task"   # Dual-stream
   ```

4. Route Detection:
   - "What is JavaScript?" -> ollama (quick answer)
   - "Debug this complex bug" -> claude-code (complex task)
   - "Analyze codebase" -> orchestrate (both in parallel)

Next Steps (from PLAN3.md):
- [x] Web Oracle: Tavily/SearxNG integration for research
- [x] Scraper Skill: Playwright for full-page extraction
- [x] Hot-Reload: Dynamic tool discovery for API connectors

COMPLETED: Web Oracle (Research Arm)
=====================================

The "Web Oracle" has been built! Here's what was implemented:

1. lib/webOracle.js - Research module with:
   - searchTavily(): Tavily API integration (AI-optimized search)
   - searchSearxNG(): SearxNG self-hosted metasearch
   - searchDuckDuckGo(): Setup instructions (DuckDuckGo/Bing block servers)
   - webResearch(): Unified search with fallback chain
   - streamResearch(): Streaming research with status updates

2. Integration with enhanced.js:
   - New "research" intent pattern for deep research queries
   - handleResearchRequest() for processing research queries
   - Updated help text with Web Oracle examples

3. Usage:
   ```
   "Research the latest AI developments"
   "Investigate climate change technologies"
   "What's new in quantum computing?"
   "Research Rust vs C++ performance"
   ```

4. Configuration Required (in .env):
   ```
   TAVILY_API_KEY=your-key      # Get from https://tavily.com/
   # OR
   SEARXNG_URL=http://localhost:8080  # Self-hosted SearxNG instance
   ```

5. Features:
   - AI-ready structured results with answers
   - Automatic fallback chain (Tavily -> SearxNG -> setup instructions)
   - Source tracking and citation
   - Streaming status updates
   - Clear setup guidance when services unavailable

COMPLETED: Web Scraper (Playwright Skill)
==========================================

The "Scraper" skill enables deep page reading for extracted URLs.

1. lib/scraper.js - Scraper module with:
   - scrapeUrl(url): Full-page extraction using Playwright
   - scrapeWithPlaywright(): Browser-based scraping with full JS execution
   - scrapeWithFetch(): Fallback to simple HTTP fetch
   - parseHtmlSimple(): HTML parsing without external deps
   - getCachedResult(): 24-hour cache for scraped pages
   - clearCache(): Clear scraped content cache
   - scrapeMultiple(): Parallel scraping of multiple URLs

2. Features:
   - Full JavaScript execution with Playwright
   - Structured content extraction (text, headings, links, images)
   - Automatic result caching (24 hours)
   - Fallback to simple fetch when Playwright unavailable
   - Configurable wait selectors for SPA loading
   - Link and image extraction

3. Usage:
   ```javascript
   import { scrapeUrl, getCachedResult } from './lib/scraper.js';

   // Scrape a URL
   const result = await scrapeUrl('https://example.com/article');
   console.log(result.title, result.text.slice(0, 500));

   // Check cache first
   const cached = getCachedResult('https://example.com/article');
   ```

4. Configuration:
   - Requires Playwright: `npm install playwright`
   - Or use fallback fetch mode (limited JS execution)

COMPLETED: Hot-Reload Dynamic Tools
===================================

The "API Discovery Loop" enables automatic tool discovery from API specs.

1. lib/dynamicTools.js - Dynamic tools manager with:
   - initDynamicTools(): Initialize and start file watcher
   - loadAllTools(): Load all tools from ~/.static-rebel/tools/
   - loadTool(): Load JavaScript tool files
   - loadApiSpec(): Load OpenAPI/Swagger specs and generate tools
   - startFileWatcher(): File system watcher for hot-reload
   - getDynamicTools(): List all available tools
   - getTool(): Get a specific tool
   - callTool(): Execute a tool with params
   - registerTool(): Register tool at runtime
   - unregisterTool(): Remove a tool
   - createToolFromUrl(): Fetch and load OpenAPI spec from URL

2. Features:
   - Hot-reload: Changes detected instantly, tools reload automatically
   - OpenAPI/Swagger support: Auto-generate tools from API specs
   - Runtime registration: Add tools programmatically
   - File watcher: fs.watch for instant reload on changes
   - Tool stats: Get count and breakdown by source

3. Directory Structure:
   ```
   ~/.static-rebel/tools/
   ├── weather-api.json     # OpenAPI spec
   ├── custom-tool.js       # Custom JS tool
   └── todo-manager.yaml    # Swagger spec
   ```

4. Usage:
   ```javascript
   import { initDynamicTools, getDynamicTools, callTool } from './lib/dynamicTools.js';

   // Initialize (call once at startup)
   initDynamicTools();

   // List all tools
   const tools = getDynamicTools();
   console.log('Available tools:', tools.map(t => t.name));

   // Call a tool
   const result = await callTool('weather-api', {
     endpoint: '/forecast',
     method: 'GET',
     data: { city: 'San Francisco' }
   });

   // Add tool from OpenAPI URL
   await createToolFromUrl('https://api.example.com/openapi.json');
   ```

5. Creating OpenAPI Tools:
   - Drop .json/.yaml files into ~/.static-rebel/tools/
   - Or use: createToolFromUrl('https://api.example.com/openapi.json')
   - Automatically generates endpoint caller tools
