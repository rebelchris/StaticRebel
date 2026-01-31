/**
 * Rate Limiter for StaticRebel
 *
 * Token bucket rate limiter for Ollama request throttling.
 * Supports per-model rate limits with configurable burst and refill rates.
 *
 * Features:
 * - Token bucket algorithm with configurable burst and refill rate
 * - Per-model rate limits (different limits for different models)
 * - Async acquire() that blocks until a token is available
 * - release() to return tokens
 * - Integration with EventBus for rate-limit events
 * - Configurable via environment variables
 */

import { getLogger } from './logger.js';
import { getEventBus, EventTypes } from './eventBus.js';

const log = getLogger('RateLimiter');

// Rate limiter event types
export const RateLimitEvents = {
  TOKEN_ACQUIRED: 'ratelimit.token.acquired',
  TOKEN_RELEASED: 'ratelimit.token.released',
  TOKEN_WAITING: 'ratelimit.token.waiting',
  BUCKET_REFILLED: 'ratelimit.bucket.refilled',
  LIMIT_EXCEEDED: 'ratelimit.limit.exceeded',
};

// Default configuration from environment variables
const DEFAULT_CONFIG = {
  defaultBurst: parseInt(process.env.RATE_LIMIT_BURST, 10) || 10,
  defaultRefillMs: parseInt(process.env.RATE_LIMIT_REFILL_MS, 10) || 1000,
  defaultRefillAmount: parseInt(process.env.RATE_LIMIT_REFILL_AMOUNT, 10) || 1,
};

/**
 * Token Bucket implementation for a single model
 */
class TokenBucket {
  /**
   * @param {Object} options - Bucket configuration
   * @param {number} options.burst - Maximum tokens (bucket capacity)
   * @param {number} options.refillMs - Milliseconds between refills
   * @param {number} options.refillAmount - Tokens added per refill
   * @param {string} options.model - Model name for this bucket
   */
  constructor(options = {}) {
    this.burst = options.burst || DEFAULT_CONFIG.defaultBurst;
    this.refillMs = options.refillMs || DEFAULT_CONFIG.defaultRefillMs;
    this.refillAmount = options.refillAmount || DEFAULT_CONFIG.defaultRefillAmount;
    this.model = options.model || 'default';

    this.tokens = this.burst;
    this.lastRefill = Date.now();
    this.waitQueue = [];
    this.refillTimer = null;

    // Statistics
    this.stats = {
      totalAcquired: 0,
      totalReleased: 0,
      totalWaited: 0,
      totalWaitTimeMs: 0,
      peakWaitQueueSize: 0,
    };

    this._startRefillTimer();
  }

  /**
   * Start the refill timer
   * @private
   */
  _startRefillTimer() {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
    }

    this.refillTimer = setInterval(() => {
      this._refill();
    }, this.refillMs);
  }

  /**
   * Refill the bucket and process waiting requests
   * @private
   */
  _refill() {
    const previousTokens = this.tokens;
    this.tokens = Math.min(this.burst, this.tokens + this.refillAmount);
    this.lastRefill = Date.now();

    if (this.tokens > previousTokens) {
      const eventBus = getEventBus();
      eventBus.emit(RateLimitEvents.BUCKET_REFILLED, {
        model: this.model,
        tokens: this.tokens,
        added: this.tokens - previousTokens,
      });
    }

    // Process waiting requests
    this._processWaitQueue();
  }

  /**
   * Process the wait queue when tokens become available
   * @private
   */
  _processWaitQueue() {
    while (this.waitQueue.length > 0 && this.tokens >= 1) {
      const { resolve, count, startTime } = this.waitQueue.shift();

      if (this.tokens >= count) {
        this.tokens -= count;
        this.stats.totalAcquired += count;
        this.stats.totalWaitTimeMs += Date.now() - startTime;

        const eventBus = getEventBus();
        eventBus.emit(RateLimitEvents.TOKEN_ACQUIRED, {
          model: this.model,
          count,
          remainingTokens: this.tokens,
          waitTimeMs: Date.now() - startTime,
        });

        resolve(true);
      } else {
        // Not enough tokens, put back in queue
        this.waitQueue.unshift({ resolve, count, startTime });
        break;
      }
    }
  }

  /**
   * Acquire tokens from the bucket
   * @param {number} count - Number of tokens to acquire
   * @returns {Promise<boolean>} - Resolves when tokens are acquired
   */
  async acquire(count = 1) {
    const eventBus = getEventBus();

    // Refill based on elapsed time
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillMs) * this.refillAmount;
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.burst, this.tokens + tokensToAdd);
      this.lastRefill = now - (elapsed % this.refillMs);
    }

    // If tokens available, acquire immediately
    if (this.tokens >= count) {
      this.tokens -= count;
      this.stats.totalAcquired += count;

      eventBus.emit(RateLimitEvents.TOKEN_ACQUIRED, {
        model: this.model,
        count,
        remainingTokens: this.tokens,
        waitTimeMs: 0,
      });

      log.debug('Token acquired immediately', {
        model: this.model,
        count,
        remaining: this.tokens
      });

      return true;
    }

    // Need to wait for tokens
    this.stats.totalWaited++;
    this.waitQueue.push({ resolve: null, count, startTime: Date.now() });
    const queueEntry = this.waitQueue[this.waitQueue.length - 1];

    this.stats.peakWaitQueueSize = Math.max(
      this.stats.peakWaitQueueSize,
      this.waitQueue.length
    );

    eventBus.emit(RateLimitEvents.TOKEN_WAITING, {
      model: this.model,
      count,
      queuePosition: this.waitQueue.length,
      currentTokens: this.tokens,
    });

    log.debug('Waiting for token', {
      model: this.model,
      count,
      queuePosition: this.waitQueue.length
    });

    return new Promise((resolve) => {
      queueEntry.resolve = resolve;
    });
  }

  /**
   * Try to acquire tokens without waiting
   * @param {number} count - Number of tokens to acquire
   * @returns {boolean} - True if tokens were acquired, false otherwise
   */
  tryAcquire(count = 1) {
    // Refill based on elapsed time
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillMs) * this.refillAmount;
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.burst, this.tokens + tokensToAdd);
      this.lastRefill = now - (elapsed % this.refillMs);
    }

    if (this.tokens >= count) {
      this.tokens -= count;
      this.stats.totalAcquired += count;

      const eventBus = getEventBus();
      eventBus.emit(RateLimitEvents.TOKEN_ACQUIRED, {
        model: this.model,
        count,
        remainingTokens: this.tokens,
        waitTimeMs: 0,
      });

      return true;
    }

    const eventBus = getEventBus();
    eventBus.emit(RateLimitEvents.LIMIT_EXCEEDED, {
      model: this.model,
      requested: count,
      available: this.tokens,
    });

    return false;
  }

  /**
   * Release tokens back to the bucket
   * @param {number} count - Number of tokens to release
   */
  release(count = 1) {
    const previousTokens = this.tokens;
    this.tokens = Math.min(this.burst, this.tokens + count);
    this.stats.totalReleased += count;

    const eventBus = getEventBus();
    eventBus.emit(RateLimitEvents.TOKEN_RELEASED, {
      model: this.model,
      count,
      tokens: this.tokens,
    });

    log.debug('Token released', {
      model: this.model,
      count,
      tokens: this.tokens
    });

    // Process any waiting requests
    if (this.tokens > previousTokens) {
      this._processWaitQueue();
    }
  }

  /**
   * Get current bucket statistics
   * @returns {Object} - Bucket statistics
   */
  getStats() {
    return {
      model: this.model,
      tokens: this.tokens,
      burst: this.burst,
      refillMs: this.refillMs,
      refillAmount: this.refillAmount,
      waitQueueSize: this.waitQueue.length,
      ...this.stats,
      avgWaitTimeMs: this.stats.totalWaited > 0
        ? Math.round(this.stats.totalWaitTimeMs / this.stats.totalWaited)
        : 0,
    };
  }

  /**
   * Reset the bucket to full capacity
   */
  reset() {
    this.tokens = this.burst;
    this.lastRefill = Date.now();

    // Resolve all waiting requests
    while (this.waitQueue.length > 0) {
      const { resolve } = this.waitQueue.shift();
      if (resolve) resolve(false);
    }

    log.info('Bucket reset', { model: this.model, tokens: this.tokens });
  }

  /**
   * Stop the refill timer and clean up
   */
  destroy() {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }

    // Reject all waiting requests
    while (this.waitQueue.length > 0) {
      const { resolve } = this.waitQueue.shift();
      if (resolve) resolve(false);
    }
  }
}

/**
 * Main RateLimiter class with per-model support
 */
export class RateLimiter {
  /**
   * @param {Object} options - Rate limiter configuration
   * @param {number} options.defaultBurst - Default bucket capacity
   * @param {number} options.defaultRefillMs - Default refill interval
   * @param {number} options.defaultRefillAmount - Default tokens per refill
   * @param {Object} options.modelLimits - Per-model limit overrides
   */
  constructor(options = {}) {
    this.config = {
      defaultBurst: options.defaultBurst || DEFAULT_CONFIG.defaultBurst,
      defaultRefillMs: options.defaultRefillMs || DEFAULT_CONFIG.defaultRefillMs,
      defaultRefillAmount: options.defaultRefillAmount || DEFAULT_CONFIG.defaultRefillAmount,
      modelLimits: options.modelLimits || {},
    };

    this.buckets = new Map();

    log.info('RateLimiter initialized', {
      defaultBurst: this.config.defaultBurst,
      defaultRefillMs: this.config.defaultRefillMs,
      defaultRefillAmount: this.config.defaultRefillAmount,
    });
  }

  /**
   * Get or create a token bucket for a model
   * @param {string} model - Model name
   * @returns {TokenBucket} - The token bucket for the model
   * @private
   */
  _getBucket(model = 'default') {
    if (!this.buckets.has(model)) {
      const modelConfig = this.config.modelLimits[model] || {};

      const bucket = new TokenBucket({
        model,
        burst: modelConfig.burst || this.config.defaultBurst,
        refillMs: modelConfig.refillMs || this.config.defaultRefillMs,
        refillAmount: modelConfig.refillAmount || this.config.defaultRefillAmount,
      });

      this.buckets.set(model, bucket);

      log.debug('Created bucket for model', {
        model,
        burst: bucket.burst,
        refillMs: bucket.refillMs,
      });
    }

    return this.buckets.get(model);
  }

  /**
   * Configure rate limits for a specific model
   * @param {string} model - Model name
   * @param {Object} limits - Rate limit configuration
   * @param {number} limits.burst - Bucket capacity
   * @param {number} limits.refillMs - Refill interval in ms
   * @param {number} limits.refillAmount - Tokens added per refill
   */
  configureModel(model, limits) {
    this.config.modelLimits[model] = limits;

    // If bucket exists, recreate it with new limits
    if (this.buckets.has(model)) {
      const oldBucket = this.buckets.get(model);
      oldBucket.destroy();
      this.buckets.delete(model);
    }

    log.info('Model limits configured', { model, ...limits });
  }

  /**
   * Acquire a token for a model (blocks until available)
   * @param {string} model - Model name
   * @param {number} count - Number of tokens to acquire
   * @returns {Promise<boolean>} - Resolves when tokens are acquired
   */
  async acquire(model = 'default', count = 1) {
    const bucket = this._getBucket(model);
    return bucket.acquire(count);
  }

  /**
   * Try to acquire a token without waiting
   * @param {string} model - Model name
   * @param {number} count - Number of tokens to acquire
   * @returns {boolean} - True if acquired, false otherwise
   */
  tryAcquire(model = 'default', count = 1) {
    const bucket = this._getBucket(model);
    return bucket.tryAcquire(count);
  }

  /**
   * Release a token back to the bucket
   * @param {string} model - Model name
   * @param {number} count - Number of tokens to release
   */
  release(model = 'default', count = 1) {
    const bucket = this._getBucket(model);
    bucket.release(count);
  }

  /**
   * Get statistics for all buckets or a specific model
   * @param {string} [model] - Optional model name
   * @returns {Object} - Statistics
   */
  getStats(model) {
    if (model) {
      if (!this.buckets.has(model)) {
        return null;
      }
      return this.buckets.get(model).getStats();
    }

    const stats = {
      config: {
        defaultBurst: this.config.defaultBurst,
        defaultRefillMs: this.config.defaultRefillMs,
        defaultRefillAmount: this.config.defaultRefillAmount,
      },
      buckets: {},
      totals: {
        totalAcquired: 0,
        totalReleased: 0,
        totalWaited: 0,
        totalWaitTimeMs: 0,
      },
    };

    for (const [bucketModel, bucket] of this.buckets) {
      const bucketStats = bucket.getStats();
      stats.buckets[bucketModel] = bucketStats;
      stats.totals.totalAcquired += bucketStats.totalAcquired;
      stats.totals.totalReleased += bucketStats.totalReleased;
      stats.totals.totalWaited += bucketStats.totalWaited;
      stats.totals.totalWaitTimeMs += bucketStats.totalWaitTimeMs;
    }

    stats.totals.avgWaitTimeMs = stats.totals.totalWaited > 0
      ? Math.round(stats.totals.totalWaitTimeMs / stats.totals.totalWaited)
      : 0;

    return stats;
  }

  /**
   * Reset a specific bucket or all buckets
   * @param {string} [model] - Optional model name
   */
  reset(model) {
    if (model) {
      if (this.buckets.has(model)) {
        this.buckets.get(model).reset();
      }
    } else {
      for (const bucket of this.buckets.values()) {
        bucket.reset();
      }
    }

    log.info('Rate limiter reset', { model: model || 'all' });
  }

  /**
   * Destroy all buckets and clean up
   */
  destroy() {
    for (const bucket of this.buckets.values()) {
      bucket.destroy();
    }
    this.buckets.clear();

    log.info('RateLimiter destroyed');
  }
}

// Singleton instance
let globalRateLimiter = null;

/**
 * Get the global rate limiter instance
 * @param {Object} options - Rate limiter configuration
 * @returns {RateLimiter} - The global rate limiter
 */
export function getRateLimiter(options = {}) {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter(options);
  }
  return globalRateLimiter;
}

/**
 * Reset the global rate limiter (useful for testing)
 */
export function resetRateLimiter() {
  if (globalRateLimiter) {
    globalRateLimiter.destroy();
  }
  globalRateLimiter = null;
}

export default RateLimiter;
