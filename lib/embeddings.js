/**
 * Embeddings Provider - Real semantic embeddings via Ollama
 * 
 * Inspired by OpenClaw's embedding system with fallback support.
 * 
 * Models (in preference order):
 * - nomic-embed-text (768 dims, fast, good quality)
 * - mxbai-embed-large (1024 dims, higher quality)
 * - all-minilm (384 dims, smallest)
 */

import { createHash } from 'crypto';

// Configuration
const DEFAULT_CONFIG = {
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  model: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
  timeout: 30000,
  maxRetries: 3,
  retryDelayMs: 300,
  maxRetryDelayMs: 5000,
};

// Provider state
let config = { ...DEFAULT_CONFIG };
let providerStatus = {
  available: null, // null = unknown, true/false after probe
  lastCheck: 0,
  model: null,
  dimensions: null,
};

// Embedding cache (LRU-ish, keeps last N)
const embeddingCache = new Map();
const MAX_CACHE_SIZE = 500;

/**
 * Configure the embeddings provider
 */
export function configure(options = {}) {
  config = { ...DEFAULT_CONFIG, ...options };
  providerStatus.available = null; // Reset probe status
}

/**
 * Sleep utility
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Retry with exponential backoff + jitter
 */
async function retryAsync(fn, options = {}) {
  const maxRetries = options.maxRetries ?? config.maxRetries;
  const minDelay = options.retryDelayMs ?? config.retryDelayMs;
  const maxDelay = options.maxRetryDelayMs ?? config.maxRetryDelayMs;
  
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      
      if (attempt >= maxRetries) break;
      
      // Don't retry connection refused - Ollama is down
      if (err.code === 'ECONNREFUSED') break;
      
      // Exponential backoff with jitter
      const baseDelay = minDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 0.2; // ±20%
      const delay = Math.min(baseDelay * (1 + jitter), maxDelay);
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Check if Ollama is available and has an embedding model
 */
export async function probeOllama() {
  // Don't probe too frequently
  const now = Date.now();
  if (providerStatus.available !== null && now - providerStatus.lastCheck < 60000) {
    return providerStatus.available;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${config.ollamaUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      providerStatus.available = false;
      providerStatus.lastCheck = now;
      return false;
    }
    
    const data = await response.json();
    const models = data.models || [];
    
    // Check for embedding models in preference order
    const embeddingModels = ['nomic-embed-text', 'mxbai-embed-large', 'all-minilm'];
    const availableModel = embeddingModels.find(m => 
      models.some(installed => installed.name.startsWith(m))
    );
    
    if (availableModel) {
      providerStatus.available = true;
      providerStatus.model = availableModel;
      providerStatus.lastCheck = now;
      
      // Get dimensions by doing a test embedding
      try {
        const testEmbed = await generateOllamaEmbedding('test', availableModel);
        providerStatus.dimensions = testEmbed.length;
      } catch {}
      
      return true;
    }
    
    // No embedding model, try to use configured model anyway
    providerStatus.available = true;
    providerStatus.model = config.model;
    providerStatus.lastCheck = now;
    return true;
    
  } catch (err) {
    providerStatus.available = false;
    providerStatus.lastCheck = now;
    return false;
  }
}

/**
 * Generate embedding via Ollama API
 */
async function generateOllamaEmbedding(text, model = null) {
  const useModel = model || providerStatus.model || config.model;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);
  
  try {
    const response = await fetch(`${config.ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: useModel,
        prompt: text,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error ${response.status}: ${error}`);
    }
    
    const data = await response.json();
    
    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error('Invalid embedding response from Ollama');
    }
    
    return new Float32Array(data.embedding);
    
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Generate a hash-based fallback embedding
 * Used when Ollama is unavailable - not semantic, just for basic matching
 */
function generateFallbackEmbedding(text, dimensions = 384) {
  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  
  const vector = new Float32Array(dimensions);
  const wordFreq = new Map();
  
  // Count word frequencies
  for (const word of words) {
    wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
  }
  
  // Hash words to dimensions
  for (const [word, freq] of wordFreq) {
    const hash = createHash('sha256').update(word).digest();
    const dimIndex = parseInt(hash.toString('hex').slice(0, 4), 16) % dimensions;
    vector[dimIndex] += freq;
    
    // Add some spread for better matching
    const dimIndex2 = parseInt(hash.toString('hex').slice(4, 8), 16) % dimensions;
    vector[dimIndex2] += freq * 0.5;
  }
  
  // L2 normalize
  let magnitude = 0;
  for (let i = 0; i < vector.length; i++) {
    magnitude += vector[i] * vector[i];
  }
  magnitude = Math.sqrt(magnitude);
  
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= magnitude;
    }
  }
  
  return vector;
}

/**
 * Get cache key for text
 */
function getCacheKey(text, model) {
  const hash = createHash('md5').update(text).digest('hex').slice(0, 16);
  return `${model || 'fallback'}:${hash}`;
}

/**
 * Generate embedding for text
 * Tries Ollama first, falls back to hash-based if unavailable
 */
export async function generateEmbedding(text, options = {}) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string');
  }
  
  // Truncate very long text
  const maxLength = options.maxLength || 8000;
  const truncated = text.length > maxLength ? text.slice(0, maxLength) : text;
  
  // Check cache
  const cacheKey = getCacheKey(truncated, providerStatus.model);
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey);
  }
  
  let embedding;
  let usedFallback = false;
  
  // Try Ollama
  const ollamaAvailable = await probeOllama();
  
  if (ollamaAvailable) {
    try {
      embedding = await retryAsync(() => generateOllamaEmbedding(truncated));
    } catch (err) {
      console.warn(`[Embeddings] Ollama failed, using fallback: ${err.message}`);
      usedFallback = true;
    }
  } else {
    usedFallback = true;
  }
  
  // Fallback to hash-based
  if (!embedding) {
    const dims = providerStatus.dimensions || 384;
    embedding = generateFallbackEmbedding(truncated, dims);
  }
  
  // Cache result
  embeddingCache.set(cacheKey, embedding);
  
  // Evict old entries if cache is too large
  if (embeddingCache.size > MAX_CACHE_SIZE) {
    const keysToDelete = Array.from(embeddingCache.keys()).slice(0, 100);
    keysToDelete.forEach(k => embeddingCache.delete(k));
  }
  
  return embedding;
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(texts, options = {}) {
  // Process in parallel with concurrency limit
  const concurrency = options.concurrency || 3;
  const results = new Array(texts.length);
  
  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);
    const embeddings = await Promise.all(
      batch.map(text => generateEmbedding(text, options))
    );
    embeddings.forEach((emb, j) => {
      results[i + j] = emb;
    });
  }
  
  return results;
}

/**
 * Cosine similarity between two vectors
 */
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  
  const vecA = a instanceof Float32Array ? a : new Float32Array(a);
  const vecB = b instanceof Float32Array ? b : new Float32Array(b);
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Get provider status
 */
export function getStatus() {
  return {
    ...providerStatus,
    config: {
      ollamaUrl: config.ollamaUrl,
      model: config.model,
    },
    cacheSize: embeddingCache.size,
  };
}

/**
 * Clear embedding cache
 */
export function clearCache() {
  embeddingCache.clear();
}

export default {
  configure,
  generateEmbedding,
  generateEmbeddings,
  cosineSimilarity,
  probeOllama,
  getStatus,
  clearCache,
};
