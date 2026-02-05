/**
 * Optimized LLM Client
 * Features: streaming, request deduplication, retries, connection pooling, metrics
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

class RequestDeduplicator {
  constructor() {
    this.pending = new Map();
  }

  async dedupe(key, fetcher) {
    if (this.pending.has(key)) {
      return this.pending.get(key);
    }
    const promise = fetcher();
    this.pending.set(key, promise);
    promise.finally(() => this.pending.delete(key));
    return promise;
  }
}

class RetryManager {
  constructor(maxRetries = 2, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  async withRetry(fn) {
    let lastError;
    for (let i = 0; i <= this.maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < this.maxRetries && this.isRetryable(error)) {
          const delay = this.baseDelay * Math.pow(2, i);
          await this.sleep(delay);
        }
      }
    }
    throw lastError;
  }

  isRetryable(error) {
    return error.message?.includes('timeout') || 
           error.message?.includes('ECONNREFUSED') ||
           error.message?.includes('network');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class MetricsCollector {
  constructor() {
    this.stats = {
      requests: 0,
      tokens: 0,
      latency: [],
      errors: 0,
      cacheHits: 0,
      retries: 0
    };
  }

  recordLatency(duration) {
    this.stats.requests++;
    this.stats.latency.push(duration);
    if (this.stats.latency.length > 1000) {
      this.stats.latency = this.stats.latency.slice(-500);
    }
  }

  recordTokens(count) {
    this.stats.tokens += count;
  }

  recordError() {
    this.stats.errors++;
  }

  recordCacheHit() {
    this.stats.cacheHits++;
  }

  recordRetry() {
    this.stats.retries++;
  }

  getStats() {
    const latencies = this.stats.latency;
    const sorted = [...latencies].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;

    return {
      totalRequests: this.stats.requests,
      totalTokens: this.stats.tokens,
      cacheHits: this.stats.cacheHits,
      errors: this.stats.errors,
      retries: this.stats.retries,
      latency: { p50, p95, p99, avg: latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1) }
    };
  }

  reset() {
    this.stats = { requests: 0, tokens: 0, latency: [], errors: 0, cacheHits: 0, retries: 0 };
  }
}

class Cache {
  constructor(ttlMs = 60000, maxSize = 100) {
    this.ttl = ttlMs;
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  clear() {
    this.cache.clear();
  }
}

export class OptimizedLLMClient {
  constructor(options = {}) {
    this.host = options.host || OLLAMA_HOST;
    this.timeout = options.timeout || 120000;
    this.dedupe = new RequestDeduplicator();
    this.retry = new RetryManager(options.maxRetries || 2, options.baseDelay || 500);
    this.metrics = new MetricsCollector();
    this.cache = new Cache(options.cacheTtl || 30000, options.cacheSize || 50);
    this.useCache = options.useCache !== false;
    this.useRetry = options.useRetry !== false;
    
    this.agent = new http.Agent({ 
      keepAlive: true, 
      maxSockets: 10,
      timeout: this.timeout 
    });
  }

  async chatCompletion(model, messages, options = {}) {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey('chat', model, messages, options);

    if (this.useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.metrics.recordCacheHit();
        return cached;
      }
    }

    const result = await this.dedupe.dedupe(cacheKey, () => 
      this.useRetry 
        ? this.retry.withRetry(() => this._chatRequest(model, messages, options))
        : this._chatRequest(model, messages, options)
    );

    this.metrics.recordLatency(Date.now() - startTime);
    if (this.useCache) {
      this.cache.set(cacheKey, result);
    }
    return result;
  }

  async _chatRequest(model, messages, options = {}) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: model.split('/').pop(),
        messages,
        stream: options.stream || false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens || options.num_predict || 2048,
        },
      });

      const url = new URL(this.host);
      const req = (url.protocol === 'https' ? https : http).request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https' ? 443 : 11434),
          path: '/api/chat',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: this.timeout,
          agent: this.agent,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              this.metrics.recordTokens(parsed.message?.content?.length || 0);
              resolve({
                message: parsed.message?.content || '',
                done: parsed.done || false,
                totalDuration: parsed.total_duration,
                loadDuration: parsed.load_duration,
                promptTokens: parsed.prompt_eval_count,
                completionTokens: parsed.eval_count,
              });
            } catch (e) {
              this.metrics.recordError();
              reject(new Error(`Parse failed: ${e.message}`));
            }
          });
        }
      );

      req.on('error', (e) => {
        this.metrics.recordError();
        reject(e);
      });

      req.on('timeout', () => {
        this.metrics.recordError();
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  async streamChat(model, messages, options = {}) {
    const body = JSON.stringify({
      model: model.split('/').pop(),
      messages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens || 2048,
      },
    });

    const url = new URL(this.host);
    const chunks = [];

    return new Promise((resolve, reject) => {
      const req = (url.protocol === 'https' ? https : http).request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https' ? 443 : 11434),
          path: '/api/chat',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: this.timeout,
          agent: this.agent,
        },
        (res) => {
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const full = chunks.join('');
            const lines = full.split('\n').filter(Boolean);
            const outputs = [];
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);
                outputs.push({ content: parsed.message?.content || '', done: parsed.done || false });
              } catch (e) {}
            }
            resolve({ chunks: outputs, fullOutput: outputs.map(o => o.content).join('') });
          });
        }
      );

      req.on('error', (e) => {
        this.metrics.recordError();
        reject(e);
      });

      req.write(body);
      req.end();
    });
  }

  async createEmbeddings(model, texts) {
    const textsArray = Array.isArray(texts) ? texts : [texts];
    const cacheKey = this.getCacheKey('embed', model, textsArray);

    if (this.useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.metrics.recordCacheHit();
        return cached;
      }
    }

    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ model: model.split('/').pop(), texts: textsArray });

      const url = new URL(this.host);
      const req = (url.protocol === 'https' ? https : http).request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https' ? 443 : 11434),
          path: '/api/embeddings',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: this.timeout,
          agent: this.agent,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              const result = parsed.embedding || parsed.embeddings || [];
              if (this.useCache) this.cache.set(cacheKey, result);
              resolve(result);
            } catch (e) {
              this.metrics.recordError();
              reject(new Error(`Embeddings failed: ${e.message}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        this.metrics.recordError();
        req.destroy();
        reject(new Error('Embeddings timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  getCacheKey(type, model, messages, options) {
    const payload = { type, model, messages, options };
    return `${type}:${model}:${JSON.stringify(payload)}`.slice(0, 200);
  }

  getStats() {
    return this.metrics.getStats();
  }

  clearCache() {
    this.cache.clear();
  }

  invalidate(pattern) {
    if (typeof pattern === 'string') {
      for (const key of this.cache.cache.keys()) {
        if (key.includes(pattern)) this.cache.cache.delete(key);
      }
    }
  }
}

let clientInstance = null;

export function getOptimizedClient(options = {}) {
  if (!clientInstance || options.fresh) {
    clientInstance = new OptimizedLLMClient(options);
  }
  return clientInstance;
}

export function createClient(options = {}) {
  return new OptimizedLLMClient(options);
}

export default OptimizedLLMClient;
