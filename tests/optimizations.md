# Performance Optimization Report - Static Rebel AI Assistant

## Executive Summary

This report identifies performance bottlenecks and optimization opportunities across the codebase. Key areas include inefficient caching, memory leaks, blocking operations, and suboptimal async patterns.

## Critical Optimizations (High Impact)

### 1. Synchronous File Operations in Async Contexts

**Location:** [`lib/memoryManager.js`](lib/memoryManager.js:95-102)

```javascript
// Current - blocking sync operations
export function writeDailyMemory(content, append = true) {
  const file = getTodayMemoryFile();
  try {
    if (append && fs.existsSync(file)) {
      fs.appendFileSync(file, content + '\n'); // BLOCKING
    } else {
      fs.writeFileSync(file, content); // BLOCKING
    }
  } catch (e) {
    console.error('Failed to write memory:', e.message);
  }
}
```

**Impact:** Blocks the event loop, affecting concurrent requests.

**Optimized Version:**

```javascript
import { promises as fsPromises } from 'fs';

export async function writeDailyMemory(content, append = true) {
  const file = getTodayMemoryFile();
  try {
    if (append) {
      await fsPromises.appendFile(file, content + '\n');
    } else {
      await fsPromises.writeFile(file, content);
    }
  } catch (e) {
    console.error('Failed to write memory:', e.message);
  }
}
```

### 2. Memory Leak in Subagent Manager

**Location:** [`lib/subagentManager.js`](lib/subagentManager.js:6-7)

```javascript
// Current - unbounded growth
let activeSubagents = new Map();
let subagentCounter = 0; // Never resets, could overflow
```

**Impact:** Memory grows indefinitely as subagents are created.

**Optimized Version:**

```javascript
const MAX_SUBAGENTS = 100;
const SUBAGENT_TIMEOUT = 30 * 60 * 1000; // 30 minutes

let activeSubagents = new Map();
let subagentCounter = 0;

// Cleanup inactive subagents periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, subagent] of activeSubagents) {
    if (now - subagent.lastActivity > SUBAGENT_TIMEOUT) {
      activeSubagents.delete(id);
    }
  }
}, 60000); // Check every minute

export function getSubagentId() {
  subagentCounter = (subagentCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `subagent-${Date.now()}-${subagentCounter}`;
}
```

### 3. Inefficient Cache Implementation

**Location:** [`lib/modelRegistry.js`](lib/modelRegistry.js:8-11)

```javascript
// Current - simple timeout-based cache
let modelCache = null;
let availableModelsCache = null;
let cacheExpiry = null;
const CACHE_DURATION = 60000; // 1 minute cache
```

**Impact:** Cache invalidation is time-based only, not event-based.

**Optimized Version:**

```javascript
class LRUCache {
  constructor(maxSize = 100, ttl = 60000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      // Delete oldest (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  invalidate(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

const modelCache = new LRUCache(50, 60000);
```

### 4. Vector Similarity Calculation Not Optimized

**Location:** [`lib/vectorMemory.js`](lib/vectorMemory.js:67-81)

```javascript
// Current - unoptimized loop
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

**Optimized Version:**

```javascript
// Pre-compute norms, use typed arrays
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;

  // Use Float32Array for better performance
  const vecA = a instanceof Float32Array ? a : new Float32Array(a);
  const vecB = b instanceof Float32Array ? b : new Float32Array(b);

  let dotProduct = 0;

  // Single loop for dot product if norms are pre-computed
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }

  return dotProduct;
}

// Store pre-computed norms with embeddings
export async function addMemory(content, metadata = {}) {
  const embedding = await generateEmbedding(content);
  const id = createHash('sha256')
    .update(content + Date.now())
    .digest('hex')
    .slice(0, 16);

  // Pre-compute norm
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

  const memoryItem = {
    id,
    content,
    embedding: new Float32Array(embedding), // Use typed array
    norm, // Pre-computed
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
      type: metadata.type || 'general',
    },
  };
  // ...
}
```

## High Impact Optimizations

### 5. WebSocket Broadcasting is O(n)

**Location:** [`dashboard/server.js`](dashboard/server.js:86-100)

```javascript
// Current - broadcasts to all clients
wss.on('connection', (ws) => {
  clients.add(ws);
  // ...
});

// Broadcasting (implied pattern)
clients.forEach((client) => {
  if (client.readyState === WebSocket.OPEN) {
    client.send(message);
  }
});
```

**Optimized Version:**

```javascript
// Use a more efficient data structure
class WebSocketManager {
  constructor() {
    this.clients = new Map();
    this.rooms = new Map();
  }

  add(client, room = 'default') {
    this.clients.set(client.id, { client, room });

    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room).add(client.id);
  }

  broadcast(message, room = 'default') {
    const clientIds = this.rooms.get(room);
    if (!clientIds) return;

    const messageStr = JSON.stringify(message);

    for (const id of clientIds) {
      const { client } = this.clients.get(id);
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr, (err) => {
          if (err) this.remove(id);
        });
      }
    }
  }

  remove(id) {
    const clientData = this.clients.get(id);
    if (clientData) {
      this.rooms.get(clientData.room)?.delete(id);
      this.clients.delete(id);
    }
  }
}
```

### 6. No Connection Pooling for HTTP Requests

**Location:** [`lib/modelRegistry.js`](lib/modelRegistry.js:68-95)

```javascript
// Current - new connection each time
const req = http.request({
  hostname: new URL(OLLAMA_HOST).hostname,
  port: new URL(OLLAMA_HOST).port || 11434,
  // ...
}, (res) => { ... });
```

**Optimized Version:**

```javascript
import { Agent } from 'http';

const httpAgent = new Agent({
  keepAlive: true,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 30000,
  freeSocketTimeout: 30000,
});

export async function listAvailableModels() {
  // Reuse agent for connection pooling
  const req = http.request({
    agent: httpAgent,
    hostname: new URL(OLLAMA_HOST).hostname,
    // ...
  });
}
```

### 7. Blocking File Reads in API Routes

**Location:** [`dashboard/api/persona.js`](dashboard/api/persona.js) (and others)

**Pattern:** Dynamic imports on every request

```javascript
async function loadModules() {
  if (personaManager) return;
  const module = await import(personaPath);
  // ...
}
```

**Optimized Version:**

```javascript
// Load once at startup, use dependency injection
let modules = null;

export async function initializeModules() {
  if (modules) return modules;

  const [personaModule, vectorModule, configModule] = await Promise.all([
    import(personaPath),
    import(vectorPath),
    import(configPath),
  ]);

  modules = {
    personaManager: personaModule,
    vectorMemory: vectorModule,
    configManager: configModule,
  };

  return modules;
}

// In route handlers
router.get('/', async (req, res) => {
  const { personaManager } = await initializeModules();
  // ...
});
```

### 8. Inefficient Cron Job Checking

**Location:** [`lib/cronScheduler.js`](lib/cronScheduler.js:29-45)

```javascript
// Current - checks every job every minute
export function cronMatches(cron, date = new Date()) {
  // Complex parsing every check
  return (
    matchesField(cron.minute, now.minute, 0, 59) &&
    matchesField(cron.hour, now.hour, 0, 23) &&
    // ...
  );
}
```

**Optimized Version:**

```javascript
class CronScheduler {
  constructor() {
    this.jobs = new Map();
    this.nextRunTimes = new Map();
  }

  addJob(id, cronExpr, handler) {
    const nextRun = this.calculateNextRun(cronExpr);
    this.jobs.set(id, { cron: cronExpr, handler, nextRun });
    this.nextRunTimes.set(nextRun.getTime(), id);
  }

  tick() {
    const now = Date.now();
    const dueJobs = [];

    // Only check jobs that are actually due
    for (const [time, id] of this.nextRunTimes) {
      if (time <= now) {
        dueJobs.push(id);
        this.nextRunTimes.delete(time);
      }
    }

    for (const id of dueJobs) {
      const job = this.jobs.get(id);
      job.handler();

      // Schedule next run
      const nextRun = this.calculateNextRun(job.cron);
      job.nextRun = nextRun;
      this.nextRunTimes.set(nextRun.getTime(), id);
    }
  }
}
```

## Medium Impact Optimizations

### 9. Redundant File System Checks

**Location:** [`lib/configManager.js`](lib/configManager.js:21-38)

```javascript
// Current - checks file existence every time
export function loadConfig() {
  if (configCache) {
    return configCache;
  }

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      // Redundant check
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      configCache = JSON.parse(data);
      return configCache;
    }
  } catch (e) {
    console.error('Failed to load config:', e.message);
  }
  // ...
}
```

**Optimized Version:**

```javascript
export function loadConfig() {
  if (configCache) {
    return configCache;
  }

  try {
    // Try to read directly, handle ENOENT
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    configCache = JSON.parse(data);
    return configCache;
  } catch (e) {
    if (e.code === 'ENOENT') {
      // File doesn't exist, return default
      return getDefaultConfig();
    }
    console.error('Failed to load config:', e.message);
    return getDefaultConfig();
  }
}
```

### 10. No Streaming for Large Responses

**Location:** [`orchestrator.js`](orchestrator.js:39-95)

**Current:** Buffering entire response before yielding.

**Recommendation:** Use proper streaming with backpressure handling.

### 11. Duplicate Code for Model Calls

**Location:** Multiple files

**Pattern:** Similar HTTP request code in [`modelRegistry.js`](lib/modelRegistry.js), [`model-backend.js`](model-backend.js), [`orchestrator.js`](orchestrator.js)

**Recommendation:** Create a unified HTTP client module.

### 12. Inefficient Memory Search

**Location:** [`lib/vectorMemory.js`](lib/vectorMemory.js:83-100)

**Current:** Linear scan through all memories.

**Recommendation:** Use a vector database like ChromaDB or implement HNSW indexing.

## Low Impact Optimizations

### 13. Unnecessary Object Creation

**Location:** [`lib/cronScheduler.js`](lib/cronScheduler.js:29-36)

```javascript
// Creates new object every check
const now = {
  minute: date.getMinutes(),
  hour: date.getHours(),
  // ...
};
```

### 14. Regex Compilation on Every Call

**Location:** [`enhanced.js`](enhanced.js:73-100)

```javascript
// Compiles regex every time function is called
const INTENT_PATTERNS = {
  schedule: [
    /remind me/i, // Compiled each time
    /schedule/i,
    // ...
  ],
};
```

**Fix:** Define regex patterns at module level.

### 15. No Compression for API Responses

**Location:** [`dashboard/server.js`](dashboard/server.js:72-84)

**Recommendation:**

```javascript
import compression from 'compression';
app.use(compression());
```

## Performance Checklist

- [ ] Replace sync file operations with async
- [ ] Implement proper memory cleanup for subagents
- [ ] Use LRU cache with TTL
- [ ] Pre-compute vector norms
- [ ] Implement connection pooling
- [ ] Load modules once at startup
- [ ] Optimize cron job scheduling
- [ ] Add HTTP compression
- [ ] Implement streaming for large responses
- [ ] Use typed arrays for vectors
- [ ] Add request/response caching
- [ ] Profile memory usage
- [ ] Implement request batching
- [ ] Use WebSocket rooms for efficient broadcasting
- [ ] Add database indexing
