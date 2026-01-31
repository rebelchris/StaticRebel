/**
 * CacheManager - Multi-tier caching for StaticRebel
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────┐
 * │  L1: In-Memory Cache (LRU, 100 items, 5 min TTL)   │
 * │  - Recent queries & responses                       │
 * │  - Session context summaries                        │
 * └─────────────────────────────────────────────────────┘
 *                       ▼ miss
 * ┌─────────────────────────────────────────────────────┐
 * │  L2: Semantic Cache (Vector similarity)             │
 * │  - Similar questions → similar answers              │
 * │  - Threshold: 0.92 cosine similarity                │
 * └─────────────────────────────────────────────────────┘
 *                       ▼ miss
 * ┌─────────────────────────────────────────────────────┐
 * │  L3: Ollama LLM (Full generation)                   │
 * └─────────────────────────────────────────────────────┘
 */

import { LRUCache } from 'lru-cache';
import crypto from 'crypto';

// Default configuration
const DEFAULT_CONFIG = {
  l1: {
    maxItems: 100,
    ttlMs: 5 * 60 * 1000, // 5 minutes
  },
  l2: {
    enabled: true,
    similarityThreshold: 0.92,
    maxItems: 500,
  },
  stats: {
    enabled: true,
  },
};

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Simple hash function for cache keys
 */
function hashQuery(query) {
  return crypto.createHash('md5').update(query.toLowerCase().trim()).digest('hex');
}

/**
 * L2 Semantic Cache - stores embeddings and finds similar queries
 */
class SemanticCache {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.92;
    this.maxItems = options.maxItems || 500;
    this.entries = new Map(); // key -> { embedding, response, timestamp }
  }

  /**
   * Store a query with its embedding and response
   */
  set(key, embedding, response) {
    // Evict oldest entries if at capacity
    if (this.entries.size >= this.maxItems) {
      const oldest = [...this.entries.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) {
        this.entries.delete(oldest[0]);
      }
    }

    this.entries.set(key, {
      embedding,
      response,
      timestamp: Date.now(),
    });
  }

  /**
   * Find a similar query above the similarity threshold
   * @param {number[]} embedding - Query embedding vector
   * @returns {Object|null} - { response, similarity } or null
   */
  findSimilar(embedding) {
    if (!embedding || embedding.length === 0) {
      return null;
    }

    let bestMatch = null;
    let bestSimilarity = 0;

    for (const [key, entry] of this.entries) {
      const similarity = cosineSimilarity(embedding, entry.embedding);
      if (similarity >= this.threshold && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = {
          key,
          response: entry.response,
          similarity,
        };
      }
    }

    return bestMatch;
  }

  /**
   * Clear the semantic cache
   */
  clear() {
    this.entries.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.entries.size,
      maxItems: this.maxItems,
      threshold: this.threshold,
    };
  }
}

/**
 * Main CacheManager class
 */
export class CacheManager {
  constructor(options = {}) {
    const config = { ...DEFAULT_CONFIG, ...options };

    // L1: In-memory LRU cache for exact matches
    this.l1Cache = new LRUCache({
      max: config.l1.maxItems,
      ttl: config.l1.ttlMs,
      updateAgeOnGet: true,
    });

    // L2: Semantic similarity cache
    this.semanticCache = config.l2.enabled
      ? new SemanticCache({
          threshold: config.l2.similarityThreshold,
          maxItems: config.l2.maxItems,
        })
      : null;

    // Statistics tracking
    this.stats = config.stats.enabled
      ? {
          l1Hits: 0,
          l2Hits: 0,
          misses: 0,
          totalQueries: 0,
        }
      : null;

    this.config = config;
  }

  /**
   * Generate a cache key from a query
   */
  hash(query) {
    return hashQuery(query);
  }

  /**
   * Get a cached response
   * @param {string} query - The query string
   * @param {number[]} [embedding] - Optional embedding for semantic search
   * @returns {Object} - { hit: 'l1'|'l2'|null, response: any, similarity?: number }
   */
  async get(query, embedding = null) {
    if (this.stats) {
      this.stats.totalQueries++;
    }

    const key = this.hash(query);

    // L1: Check exact match in LRU cache
    const l1Hit = this.l1Cache.get(key);
    if (l1Hit !== undefined) {
      if (this.stats) this.stats.l1Hits++;
      return { hit: 'l1', response: l1Hit };
    }

    // L2: Check semantic similarity
    if (this.semanticCache && embedding) {
      const l2Hit = this.semanticCache.findSimilar(embedding);
      if (l2Hit) {
        if (this.stats) this.stats.l2Hits++;
        // Also warm L1 cache with this result
        this.l1Cache.set(key, l2Hit.response);
        return { hit: 'l2', response: l2Hit.response, similarity: l2Hit.similarity };
      }
    }

    // Cache miss
    if (this.stats) this.stats.misses++;
    return { hit: null };
  }

  /**
   * Store a response in the cache
   * @param {string} query - The query string
   * @param {any} response - The response to cache
   * @param {number[]} [embedding] - Optional embedding for semantic cache
   */
  set(query, response, embedding = null) {
    const key = this.hash(query);

    // Store in L1
    this.l1Cache.set(key, response);

    // Store in L2 if embedding provided
    if (this.semanticCache && embedding) {
      this.semanticCache.set(key, embedding, response);
    }
  }

  /**
   * Invalidate a specific query from all cache levels
   */
  invalidate(query) {
    const key = this.hash(query);
    this.l1Cache.delete(key);
    // Note: L2 semantic cache doesn't support single-key deletion
    // as similar queries might still match
  }

  /**
   * Clear all caches
   */
  clear() {
    this.l1Cache.clear();
    if (this.semanticCache) {
      this.semanticCache.clear();
    }
    if (this.stats) {
      this.stats.l1Hits = 0;
      this.stats.l2Hits = 0;
      this.stats.misses = 0;
      this.stats.totalQueries = 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const l1Stats = {
      size: this.l1Cache.size,
      maxItems: this.config.l1.maxItems,
      ttlMs: this.config.l1.ttlMs,
    };

    const l2Stats = this.semanticCache
      ? this.semanticCache.getStats()
      : { enabled: false };

    const hitRate = this.stats && this.stats.totalQueries > 0
      ? ((this.stats.l1Hits + this.stats.l2Hits) / this.stats.totalQueries * 100).toFixed(1)
      : 0;

    return {
      l1: l1Stats,
      l2: l2Stats,
      hits: this.stats ? {
        l1: this.stats.l1Hits,
        l2: this.stats.l2Hits,
        total: this.stats.l1Hits + this.stats.l2Hits,
      } : null,
      misses: this.stats?.misses || 0,
      totalQueries: this.stats?.totalQueries || 0,
      hitRate: `${hitRate}%`,
    };
  }

  /**
   * Warm up the cache with common queries
   * @param {Array<{query: string, response: any, embedding?: number[]}>} entries
   */
  warmUp(entries) {
    for (const entry of entries) {
      this.set(entry.query, entry.response, entry.embedding);
    }
    console.log(`[CacheManager] Warmed up with ${entries.length} entries`);
  }

  /**
   * Get or compute a value, storing the result in cache
   * @param {string} query - The query string
   * @param {Function} computeFn - Async function to compute the value on miss
   * @param {number[]} [embedding] - Optional embedding for semantic cache
   */
  async getOrCompute(query, computeFn, embedding = null) {
    const cached = await this.get(query, embedding);
    if (cached.hit) {
      return cached.response;
    }

    const response = await computeFn();
    this.set(query, response, embedding);
    return response;
  }
}

// Singleton instance for convenience
let globalCacheManager = null;

/**
 * Get the global cache manager instance
 */
export function getCacheManager(options = {}) {
  if (!globalCacheManager) {
    globalCacheManager = new CacheManager(options);
  }
  return globalCacheManager;
}

/**
 * Reset the global cache manager (useful for testing)
 */
export function resetCacheManager() {
  if (globalCacheManager) {
    globalCacheManager.clear();
  }
  globalCacheManager = null;
}

export default CacheManager;
