/**
 * Fallback Manager for StaticRebel
 * 
 * Handles graceful degradation when Ollama or other services are unavailable.
 * Per LEVEL_UP_PLAN.md Part 8.1: Implement graceful degradation when Ollama is unavailable
 * 
 * Features:
 * - Automatic fallback to cached responses
 * - Request queuing for retry when service recovers
 * - Friendly error messages for users
 * - Circuit breaker pattern to prevent cascade failures
 */

import { getLogger } from './logger.js';
import { getCacheManager } from './cacheManager.js';

const log = getLogger('FallbackManager');

// Circuit breaker states
const CircuitState = {
  CLOSED: 'closed',     // Normal operation
  OPEN: 'open',         // Failing, reject requests
  HALF_OPEN: 'half-open', // Testing if service recovered
};

// Default configuration
const DEFAULT_CONFIG = {
  // Circuit breaker settings
  failureThreshold: 3,      // Failures before opening circuit
  resetTimeoutMs: 30000,    // Time before trying again (30s)
  halfOpenRequests: 1,      // Requests to test in half-open state
  
  // Queue settings
  queueEnabled: true,
  maxQueueSize: 50,
  queueTimeoutMs: 300000,   // 5 minutes max wait
  
  // Fallback settings
  useCachedResponses: true,
  cacheThreshold: 0.85,     // Similarity threshold for cache fallback
};

// Friendly error messages for different scenarios
const FRIENDLY_MESSAGES = {
  ollama_unavailable: `I'm having trouble connecting to my brain right now. 🧠

This usually means Ollama isn't running. Try:
• \`ollama serve\` in another terminal
• Check if another process is using port 11434

I'll keep trying in the background!`,

  ollama_overloaded: `I'm a bit overwhelmed at the moment! 😅

There are too many requests queued up. Try again in a minute, or check if there's a long-running task I'm working on.`,

  cached_response: `⚡ Quick answer from memory (Ollama is currently unavailable):

{response}

---
*Note: This is a cached response. I'll be back to full capacity soon!*`,

  queued: `I've noted your request! 📝

Ollama is temporarily unavailable, but I've queued this for when it's back. You'll get a response soon.

Queue position: {position}`,

  no_fallback: `I couldn't complete your request right now. 😔

Ollama is unavailable and I don't have a cached response for this.

**What you can try:**
• Rephrase your question
• Check if Ollama is running (\`ollama serve\`)
• Wait a moment and try again

I'm monitoring the situation and will recover automatically.`,
};

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
  constructor(name, config = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
  }

  /**
   * Check if requests should be allowed
   */
  canRequest() {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      // Check if we should transition to half-open
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.config.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenAttempts = 0;
        log.info('Circuit breaker half-open', { name: this.name });
        return true;
      }
      return false;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      return this.halfOpenAttempts < this.config.halfOpenRequests;
    }

    return false;
  }

  /**
   * Record a successful request
   */
  recordSuccess() {
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      this.failures = 0;
      log.info('Circuit breaker closed (service recovered)', { name: this.name });
    } else if (this.state === CircuitState.CLOSED) {
      this.failures = 0;
    }
  }

  /**
   * Record a failed request
   */
  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      log.warn('Circuit breaker re-opened (still failing)', { name: this.name });
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      log.warn('Circuit breaker opened', { 
        name: this.name, 
        failures: this.failures,
        resetIn: `${this.config.resetTimeoutMs / 1000}s`,
      });
    }
  }

  /**
   * Get current state info
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailureTime 
        ? new Date(this.lastFailureTime).toISOString() 
        : null,
    };
  }
}

/**
 * Request Queue for deferred processing
 */
class RequestQueue {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queue = [];
    this.processing = false;
  }

  /**
   * Add a request to the queue
   */
  enqueue(request) {
    if (this.queue.length >= this.config.maxQueueSize) {
      return { queued: false, reason: 'queue_full' };
    }

    const entry = {
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      request,
      timestamp: Date.now(),
      resolve: null,
      reject: null,
    };

    // Create a promise that will be resolved when the request is processed
    const promise = new Promise((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;

      // Timeout handler
      setTimeout(() => {
        const index = this.queue.findIndex((e) => e.id === entry.id);
        if (index !== -1) {
          this.queue.splice(index, 1);
          reject(new Error('Queue timeout'));
        }
      }, this.config.queueTimeoutMs);
    });

    this.queue.push(entry);
    
    log.info('Request queued', { 
      id: entry.id, 
      position: this.queue.length,
    });

    return { 
      queued: true, 
      id: entry.id, 
      position: this.queue.length,
      promise,
    };
  }

  /**
   * Process queued requests with a handler function
   */
  async processQueue(handler) {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    log.info('Processing queue', { size: this.queue.length });

    while (this.queue.length > 0) {
      const entry = this.queue.shift();
      
      try {
        const result = await handler(entry.request);
        entry.resolve(result);
        log.info('Queued request completed', { id: entry.id });
      } catch (error) {
        entry.reject(error);
        log.error('Queued request failed', { id: entry.id, error: error.message });
      }
    }

    this.processing = false;
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      size: this.queue.length,
      maxSize: this.config.maxQueueSize,
      processing: this.processing,
      oldest: this.queue[0]?.timestamp 
        ? new Date(this.queue[0].timestamp).toISOString()
        : null,
    };
  }

  /**
   * Clear the queue (reject all pending)
   */
  clear(reason = 'Queue cleared') {
    const count = this.queue.length;
    this.queue.forEach((entry) => {
      entry.reject(new Error(reason));
    });
    this.queue = [];
    log.info('Queue cleared', { count, reason });
  }
}

/**
 * Main Fallback Manager
 */
export class FallbackManager {
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.circuitBreaker = new CircuitBreaker('ollama', this.config);
    this.requestQueue = new RequestQueue(this.config);
    this.cache = getCacheManager();
    this.recoveryCallbacks = [];
  }

  /**
   * Attempt to execute a request with fallbacks
   * 
   * @param {Object} request - The request object
   * @param {Function} executor - Function to execute the request
   * @param {Object} options - Fallback options
   */
  async execute(request, executor, options = {}) {
    const { 
      query = '', 
      embedding = null,
      allowCache = this.config.useCachedResponses,
      allowQueue = this.config.queueEnabled,
    } = options;

    // Check circuit breaker
    if (!this.circuitBreaker.canRequest()) {
      log.debug('Circuit breaker open, trying fallbacks');
      return this.handleUnavailable(request, { query, embedding, allowCache, allowQueue });
    }

    try {
      // Attempt the request
      const result = await executor(request);
      
      // Success - record and cache
      this.circuitBreaker.recordSuccess();
      
      // Cache the response for future fallback
      if (query && this.config.useCachedResponses) {
        this.cache.set(query, result, embedding);
      }

      // Process any queued requests
      if (this.requestQueue.getStatus().size > 0) {
        this.processQueuedRequests(executor);
      }

      return {
        success: true,
        result,
        source: 'live',
      };
    } catch (error) {
      // Failure - record and try fallbacks
      this.circuitBreaker.recordFailure();
      log.warn('Request failed, trying fallbacks', { error: error.message });
      
      return this.handleUnavailable(request, { 
        query, 
        embedding, 
        allowCache, 
        allowQueue,
        originalError: error,
      });
    }
  }

  /**
   * Handle unavailable service with fallbacks
   */
  async handleUnavailable(request, options = {}) {
    const { query, embedding, allowCache, allowQueue, originalError } = options;

    // Try cache first
    if (allowCache && query) {
      const cached = await this.cache.get(query, embedding);
      if (cached.hit) {
        log.info('Serving cached response', { 
          query: query.slice(0, 50),
          cacheLevel: cached.hit,
        });
        
        return {
          success: true,
          result: cached.response,
          source: 'cache',
          message: FRIENDLY_MESSAGES.cached_response.replace('{response}', 
            typeof cached.response === 'string' 
              ? cached.response 
              : JSON.stringify(cached.response)
          ),
        };
      }
    }

    // Try queueing
    if (allowQueue) {
      const queueResult = this.requestQueue.enqueue(request);
      
      if (queueResult.queued) {
        return {
          success: false,
          queued: true,
          queueId: queueResult.id,
          position: queueResult.position,
          promise: queueResult.promise,
          message: FRIENDLY_MESSAGES.queued
            .replace('{position}', queueResult.position.toString()),
        };
      } else {
        return {
          success: false,
          message: FRIENDLY_MESSAGES.ollama_overloaded,
          error: 'queue_full',
        };
      }
    }

    // No fallback available
    return {
      success: false,
      message: FRIENDLY_MESSAGES.no_fallback,
      error: originalError?.message || 'Service unavailable',
    };
  }

  /**
   * Process queued requests when service recovers
   */
  async processQueuedRequests(executor) {
    setImmediate(() => {
      this.requestQueue.processQueue(executor);
    });
  }

  /**
   * Get friendly error message for a scenario
   */
  getFriendlyMessage(scenario, replacements = {}) {
    let message = FRIENDLY_MESSAGES[scenario] || FRIENDLY_MESSAGES.no_fallback;
    
    for (const [key, value] of Object.entries(replacements)) {
      message = message.replace(`{${key}}`, value);
    }
    
    return message;
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      circuitBreaker: this.circuitBreaker.getState(),
      queue: this.requestQueue.getStatus(),
      config: {
        cacheEnabled: this.config.useCachedResponses,
        queueEnabled: this.config.queueEnabled,
      },
    };
  }

  /**
   * Subscribe to recovery events
   */
  onRecovery(callback) {
    this.recoveryCallbacks.push(callback);
    return () => {
      this.recoveryCallbacks = this.recoveryCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Manually reset the circuit breaker (for testing/admin)
   */
  reset() {
    this.circuitBreaker.state = CircuitState.CLOSED;
    this.circuitBreaker.failures = 0;
    log.info('Fallback manager reset');
  }
}

// Singleton instance
let globalFallbackManager = null;

export function getFallbackManager(options = {}) {
  if (!globalFallbackManager) {
    globalFallbackManager = new FallbackManager(options);
  }
  return globalFallbackManager;
}

export { CircuitState, FRIENDLY_MESSAGES };
export default FallbackManager;
