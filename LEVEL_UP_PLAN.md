# StaticRebel Level-Up Plan

## Completed Improvements (from OpenClaw patterns)

- [x] Cache Manager (PR #5) - Multi-tier LRU + semantic caching
- [x] Async Tracker (PR #6) - Async file operations
- [x] Structured Logger (PR #7) - JSON logging
- [x] Health Monitor (PR #8) - Service health checks
- [x] Graceful Degradation (PR #9) - Circuit breaker pattern
- [x] Event Bus (PR #10) - Pub/sub for modules
- [x] Startup Manager (PR #11) - Model pre-warming

## New Improvements (Round 2)

### 1. Rate Limiter (`lib/rateLimiter.js`)
**Status:** TODO

Prevent overwhelming Ollama with burst requests. Implements token bucket algorithm.

Features:
- Per-model rate limits
- Burst allowance with refill
- Queue management for excess requests
- Backpressure signaling via events

Usage:
```javascript
import { getRateLimiter } from './lib/rateLimiter.js';

const limiter = getRateLimiter();
await limiter.acquire('llama3.2'); // blocks until allowed
// make request
limiter.release('llama3.2');
```

### 2. Context Compressor (`lib/contextCompressor.js`)
**Status:** TODO

Automatically summarize long conversation histories to fit context windows while preserving important information.

Features:
- Configurable compression threshold
- Importance-weighted message selection
- Summary generation for older messages
- Token counting integration

Usage:
```javascript
import { compressContext } from './lib/contextCompressor.js';

const compressed = await compressContext(messages, {
  maxTokens: 4096,
  preserveRecent: 5,
  summaryModel: 'llama3.2'
});
```

### 3. Usage Tracker (`lib/usageTracker.js`)
**Status:** TODO

Track token usage, request counts, and estimated costs across sessions.

Features:
- Per-session and global tracking
- Token counting for prompts and completions
- Cost estimation (configurable rates)
- Usage reports and alerts
- Persistent storage

Usage:
```javascript
import { getUsageTracker } from './lib/usageTracker.js';

const tracker = getUsageTracker();
tracker.recordRequest({
  model: 'llama3.2',
  promptTokens: 150,
  completionTokens: 200,
  sessionId: 'session-123'
});

const report = tracker.getReport({ period: 'day' });
```

---

## Implementation Priority

1. **Rate Limiter** - Critical for stability
2. **Usage Tracker** - Important for monitoring
3. **Context Compressor** - Nice-to-have for long sessions
