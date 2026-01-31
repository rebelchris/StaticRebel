/**
 * Context Compressor for StaticRebel
 *
 * Summarizes long conversation histories to fit within context windows.
 * Preserves recent messages while intelligently compressing older ones.
 *
 * Features:
 * - Token estimation (1 token ≈ 4 characters)
 * - Importance scoring for messages
 * - Configurable compression thresholds
 * - Summary caching to avoid re-processing
 * - EventBus integration for compression events
 */

import { getLogger } from './logger.js';
import { getEventBus, EventTypes } from './eventBus.js';
import { chatCompletion, getModelForTask } from './modelRegistry.js';

const log = getLogger('ContextCompressor');

// Extend EventTypes with compression events
export const CompressionEvents = {
  COMPRESSION_STARTED: 'context.compression.started',
  COMPRESSION_COMPLETED: 'context.compression.completed',
  COMPRESSION_ERROR: 'context.compression.error',
  COMPRESSION_CACHE_HIT: 'context.compression.cache.hit',
};

/**
 * Default configuration for context compression
 */
const DEFAULT_OPTIONS = {
  maxTokens: 8000,
  preserveRecentCount: 5,
  importanceWeights: {
    system: 10,
    user: 5,
    assistant: 3,
  },
  summaryModel: null, // Will use modelRegistry default
  summaryMaxTokens: 500,
  cacheTTL: 300000, // 5 minutes
};

/**
 * LRU Cache for summaries
 */
class SummaryCache {
  constructor(maxSize = 50, ttlMs = 300000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttlMs;
  }

  /**
   * Generate a cache key from messages
   * @param {Array} messages - Messages to hash
   * @returns {string} Cache key
   */
  generateKey(messages) {
    const content = messages.map(m => `${m.role}:${m.content}`).join('|');
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `summary-${hash}`;
  }

  /**
   * Get cached summary
   * @param {string} key - Cache key
   * @returns {string|null} Cached summary or null
   */
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

  /**
   * Store summary in cache
   * @param {string} key - Cache key
   * @param {string} value - Summary to cache
   */
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear all cached summaries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
    };
  }
}

// Global summary cache instance
const summaryCache = new SummaryCache();

/**
 * Estimate token count from text
 * Uses the approximation of 1 token ≈ 4 characters
 *
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total tokens for a list of messages
 * @param {Array} messages - Messages to estimate
 * @returns {number} Total estimated tokens
 */
function estimateMessagesTokens(messages) {
  return messages.reduce((total, msg) => {
    const roleTokens = estimateTokens(msg.role);
    const contentTokens = estimateTokens(msg.content);
    return total + roleTokens + contentTokens + 4; // +4 for message structure overhead
  }, 0);
}

/**
 * Calculate importance score for a message
 * @param {Object} message - Message object with role and content
 * @param {Object} weights - Importance weights by role
 * @returns {number} Importance score
 */
function calculateImportance(message, weights) {
  const baseWeight = weights[message.role] || 1;

  // Boost for messages with questions
  const hasQuestion = message.content?.includes('?') ? 1.5 : 1;

  // Boost for longer, more substantive messages
  const lengthBoost = Math.min(1 + (message.content?.length || 0) / 1000, 2);

  // Boost for messages with code blocks
  const hasCode = message.content?.includes('```') ? 1.3 : 1;

  return baseWeight * hasQuestion * lengthBoost * hasCode;
}

/**
 * Generate a summary of messages using the model registry
 * @param {Array} messages - Messages to summarize
 * @param {Object} options - Summary options
 * @returns {Promise<string>} Generated summary
 */
async function generateSummary(messages, options = {}) {
  const model = options.summaryModel || getModelForTask('general');
  const modelId = model.includes('/') ? model.split('/')[1] : model;

  const summaryPrompt = [
    {
      role: 'system',
      content: 'You are a conversation summarizer. Create a concise summary of the following conversation, preserving key context, decisions, and important information. Keep the summary brief but informative.',
    },
    {
      role: 'user',
      content: `Summarize this conversation:\n\n${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}`,
    },
  ];

  try {
    const result = await chatCompletion(modelId, summaryPrompt, {
      maxTokens: options.summaryMaxTokens || 500,
      temperature: 0.3,
    });

    return result.message || 'Previous conversation context.';
  } catch (error) {
    log.error('Failed to generate summary', { error: error.message });
    // Fallback: create a simple extractive summary
    return createFallbackSummary(messages);
  }
}

/**
 * Create a simple fallback summary when model is unavailable
 * @param {Array} messages - Messages to summarize
 * @returns {string} Fallback summary
 */
function createFallbackSummary(messages) {
  const userMessages = messages.filter(m => m.role === 'user');
  const topics = userMessages
    .slice(0, 3)
    .map(m => m.content.slice(0, 100))
    .join('; ');

  return `Previous conversation covered: ${topics}...`;
}

/**
 * Main context compression function
 *
 * @param {Array} messages - Array of message objects with role and content
 * @param {Object} options - Compression options
 * @param {number} options.maxTokens - Maximum tokens for compressed context
 * @param {number} options.preserveRecentCount - Number of recent messages to preserve
 * @param {Object} options.importanceWeights - Weights for different message roles
 * @param {string} options.summaryModel - Model to use for summarization
 * @param {number} options.summaryMaxTokens - Max tokens for summary
 * @returns {Promise<Object>} Compressed context result
 */
export async function compressContext(messages, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const eventBus = getEventBus();

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return {
      messages: [],
      compressed: false,
      originalTokens: 0,
      compressedTokens: 0,
      summary: null,
    };
  }

  const originalTokens = estimateMessagesTokens(messages);

  // Check if compression is needed
  if (originalTokens <= config.maxTokens) {
    log.debug('No compression needed', { originalTokens, maxTokens: config.maxTokens });
    return {
      messages,
      compressed: false,
      originalTokens,
      compressedTokens: originalTokens,
      summary: null,
    };
  }

  eventBus.emit(CompressionEvents.COMPRESSION_STARTED, {
    messageCount: messages.length,
    originalTokens,
    maxTokens: config.maxTokens,
  });

  try {
    // Separate system messages (always preserve)
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Preserve recent messages
    const recentCount = Math.min(config.preserveRecentCount, nonSystemMessages.length);
    const recentMessages = nonSystemMessages.slice(-recentCount);
    const olderMessages = nonSystemMessages.slice(0, -recentCount);

    if (olderMessages.length === 0) {
      // Nothing to compress beyond recent messages
      return {
        messages,
        compressed: false,
        originalTokens,
        compressedTokens: originalTokens,
        summary: null,
      };
    }

    // Check cache for existing summary
    const cacheKey = summaryCache.generateKey(olderMessages);
    let summary = summaryCache.get(cacheKey);

    if (summary) {
      log.debug('Using cached summary', { cacheKey });
      eventBus.emit(CompressionEvents.COMPRESSION_CACHE_HIT, { cacheKey });
    } else {
      // Score messages by importance
      const scoredMessages = olderMessages.map(msg => ({
        ...msg,
        importance: calculateImportance(msg, config.importanceWeights),
      }));

      // Sort by importance (descending)
      scoredMessages.sort((a, b) => b.importance - a.importance);

      // Generate summary of older messages
      summary = await generateSummary(olderMessages, config);

      // Cache the summary
      summaryCache.set(cacheKey, summary);
    }

    // Create summary message
    const summaryMessage = {
      role: 'system',
      content: `[Previous conversation summary]\n${summary}`,
    };

    // Reconstruct compressed messages
    const compressedMessages = [
      ...systemMessages,
      summaryMessage,
      ...recentMessages,
    ];

    const compressedTokens = estimateMessagesTokens(compressedMessages);

    const result = {
      messages: compressedMessages,
      compressed: true,
      originalTokens,
      compressedTokens,
      summary,
      preservedCount: recentCount,
      summarizedCount: olderMessages.length,
    };

    eventBus.emit(CompressionEvents.COMPRESSION_COMPLETED, {
      originalTokens,
      compressedTokens,
      reduction: Math.round((1 - compressedTokens / originalTokens) * 100),
      summarizedCount: olderMessages.length,
    });

    log.info('Context compressed', {
      originalTokens,
      compressedTokens,
      reduction: `${Math.round((1 - compressedTokens / originalTokens) * 100)}%`,
    });

    return result;
  } catch (error) {
    log.error('Compression failed', { error: error.message });

    eventBus.emit(CompressionEvents.COMPRESSION_ERROR, {
      error: error.message,
      originalTokens,
    });

    // Return original messages on failure
    return {
      messages,
      compressed: false,
      originalTokens,
      compressedTokens: originalTokens,
      summary: null,
      error: error.message,
    };
  }
}

/**
 * Context Compressor class for more control
 */
export class ContextCompressor {
  /**
   * Create a new ContextCompressor instance
   * @param {Object} options - Compressor options
   */
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.cache = new SummaryCache(50, options.cacheTTL || DEFAULT_OPTIONS.cacheTTL);
  }

  /**
   * Compress context with instance options
   * @param {Array} messages - Messages to compress
   * @param {Object} overrides - Option overrides
   * @returns {Promise<Object>} Compression result
   */
  async compress(messages, overrides = {}) {
    return compressContext(messages, { ...this.options, ...overrides });
  }

  /**
   * Estimate tokens for messages
   * @param {Array} messages - Messages to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(messages) {
    return estimateMessagesTokens(messages);
  }

  /**
   * Check if messages need compression
   * @param {Array} messages - Messages to check
   * @returns {boolean} True if compression needed
   */
  needsCompression(messages) {
    return estimateMessagesTokens(messages) > this.options.maxTokens;
  }

  /**
   * Clear the summary cache
   */
  clearCache() {
    this.cache.clear();
    summaryCache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      instanceCache: this.cache.getStats(),
      globalCache: summaryCache.getStats(),
    };
  }

  /**
   * Update compressor options
   * @param {Object} options - New options
   */
  configure(options) {
    this.options = { ...this.options, ...options };
  }
}

// Singleton compressor instance
let globalCompressor = null;

/**
 * Get the global compressor instance
 * @param {Object} options - Compressor options
 * @returns {ContextCompressor} Compressor instance
 */
export function getCompressor(options = {}) {
  if (!globalCompressor) {
    globalCompressor = new ContextCompressor(options);
  }
  return globalCompressor;
}

/**
 * Reset the global compressor (useful for testing)
 */
export function resetCompressor() {
  if (globalCompressor) {
    globalCompressor.clearCache();
  }
  globalCompressor = null;
  summaryCache.clear();
}

export default {
  compressContext,
  estimateTokens,
  getCompressor,
  ContextCompressor,
  CompressionEvents,
};
