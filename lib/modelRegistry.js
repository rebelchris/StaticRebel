// Model Registry - Ollama model management with task mapping
import http from 'http';
import { loadConfig, getConfig } from './configManager.js';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const DEFAULT_TIMEOUT = 120000;

/**
 * LRU Cache implementation for efficient caching with size limits
 */
class LRUCache {
  constructor(maxSize = 100, ttlMs = 60000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttlMs;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    // Check if expired
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
    // Delete if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
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
      if (typeof pattern === 'string' && key.includes(pattern)) {
        this.cache.delete(key);
      } else if (pattern instanceof RegExp && pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

// Use LRU cache instead of simple timeout-based cache
let modelCache = new LRUCache(50, 60000);
let availableModelsCache = new LRUCache(10, 60000);
let cacheExpiry = null;
const CACHE_DURATION = 60000; // 1 minute cache (for backward compatibility)

export function getOllamaHost() {
  return OLLAMA_HOST;
}

export function getDefaultModel() {
  const config = loadConfig();
  const defaultModel = config?.models?.defaults?.general;
  return process.env.OLLAMA_MODEL || defaultModel || 'ollama/llama3.2';
}

export function getEmbeddingModel() {
  return process.env.EMBEDDING_MODEL || 'nomic-embed-text';
}

export function getVisionModel() {
  return process.env.VISION_MODEL || 'llava';
}

// Health check result structure
export class OllamaHealthStatus {
  constructor(connected, host, error = null, models = []) {
    this.connected = connected;
    this.host = host;
    this.error = error;
    this.models = models;
  }

  get errorMessage() {
    if (!this.error) return null;
    if (this.error.includes('ECONNREFUSED')) {
      return `Ollama is not running at ${this.host}\n\nTo fix this:\n  1. Make sure Ollama is installed: https://ollama.com\n  2. Start Ollama: ollama serve\n  3. Or set OLLAMA_HOST environment variable`;
    }
    if (this.error.includes('timeout') || this.error.includes('timed out')) {
      return `Connection to Ollama timed out at ${this.host}\n\nTo fix this:\n  1. Check if Ollama is running: ollama list\n  2. Start Ollama if needed: ollama serve\n  3. Verify OLLAMA_HOST is correct`;
    }
    return `Ollama connection error: ${this.error}`;
  }
}

// Check if Ollama is running and accessible
export async function checkOllamaConnection() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: new URL(OLLAMA_HOST).hostname,
        port: new URL(OLLAMA_HOST).port || 11434,
        path: '/api/tags',
        method: 'GET',
        timeout: 5000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(
              new OllamaHealthStatus(
                true,
                OLLAMA_HOST,
                null,
                parsed.models || [],
              ),
            );
          } catch (e) {
            resolve(
              new OllamaHealthStatus(
                false,
                OLLAMA_HOST,
                'Invalid response from Ollama',
              ),
            );
          }
        });
      },
    );

    req.on('error', (err) => {
      resolve(
        new OllamaHealthStatus(false, OLLAMA_HOST, err.code || err.message),
      );
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(new OllamaHealthStatus(false, OLLAMA_HOST, 'Connection timeout'));
    });
    req.end();
  });
}

// Load model registry from config
export function loadModelRegistry() {
  // Check LRU cache first
  const cached = modelCache.get('registry');
  if (cached) {
    return cached;
  }

  const config = loadConfig();
  const registry = config.models || {
    providers: { ollama: { models: [] } },
    defaults: {},
    taskMapping: {},
  };

  // Store in LRU cache
  modelCache.set('registry', registry);
  return registry;
}

// List all configured models
export function listConfiguredModels() {
  const registry = loadModelRegistry();
  const models = [];

  for (const [provider, data] of Object.entries(registry.providers || {})) {
    for (const model of data.models || []) {
      models.push({
        provider,
        id: model.id,
        name: model.name || model.id,
        tags: model.tags || [],
        reasoning: model.reasoning || false,
        contextWindow: model.contextWindow || 200000,
      });
    }
  }

  return models;
}

// Check which models are actually available
export async function listAvailableModels() {
  // Check LRU cache first
  const cached = availableModelsCache.get('models');
  if (cached) {
    return cached;
  }

  const health = await checkOllamaConnection();

  if (!health.connected) {
    // Return a special object with error info instead of empty array
    availableModelsCache.set('error', {
      error: health.error,
      host: health.host,
    });
    return [];
  }

  // Store in LRU cache
  availableModelsCache.set('models', health.models);
  return health.models;
}

// Get best model for a task type
export function getModelForTask(taskType) {
  const registry = loadModelRegistry();
  const defaults = registry.defaults || {};

  const taskMapping = {
    coding: defaults.coding || 'ollama/qwen3-coder:latest',
    analysis: defaults.analysis || 'ollama/deepseek-r1:32b',
    creative: defaults.creative || defaults.general || 'ollama/llama3.2',
    general: defaults.general || 'ollama/llama3.2',
    vision: defaults.vision || 'ollama/llava',
    embeddings: defaults.embeddings || 'ollama/nomic-embed-text',
  };

  return taskMapping[taskType] || taskMapping.general;
}

// Detect task type from input
export function detectTaskType(input) {
  const registry = loadModelRegistry();
  const mapping = registry.taskMapping || {};

  const lowerInput = input.toLowerCase();

  for (const [taskType, keywords] of Object.entries(mapping)) {
    for (const keyword of keywords || []) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        return taskType;
      }
    }
  }

  return 'general';
}

// Parse model reference (e.g., "ollama/llama3.2" -> { provider: 'ollama', id: 'llama3.2' })
export function parseModelRef(modelRef) {
  if (!modelRef || typeof modelRef !== 'string') {
    return null;
  }

  if (modelRef.includes('/')) {
    const [provider, id] = modelRef.split('/');
    return { provider, id };
  }

  return { provider: 'ollama', id: modelRef };
}

// Make chat request to Ollama
export async function chatCompletion(model, messages, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  // Strip provider prefix (e.g., "ollama/llama3.2" -> "llama3.2")
  const modelName = model.includes('/') ? model.split('/')[1] : model;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: modelName,
      messages,
      stream: options.stream || false,
      options: {
        temperature: options.temperature || 0.7,
        num_predict: options.maxTokens || 8192,
      },
    });

    const req = http.request(
      {
        hostname: new URL(OLLAMA_HOST).hostname,
        port: new URL(OLLAMA_HOST).port || 11434,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({
              message: parsed.message?.content || '',
              done: parsed.done || false,
              totalDuration: parsed.total_duration,
              loadDuration: parsed.load_duration,
            });
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(body);
    req.end();
  });
}

// Make embeddings request
export async function createEmbeddings(model, texts) {
  const timeout = DEFAULT_TIMEOUT;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      texts: Array.isArray(texts) ? texts : [texts],
    });

    const req = http.request(
      {
        hostname: new URL(OLLAMA_HOST).hostname,
        port: new URL(OLLAMA_HOST).port || 11434,
        path: '/api/embeddings',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.embedding || parsed.embeddings || []);
          } catch (e) {
            reject(new Error(`Failed to parse embeddings: ${e.message}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Embeddings timeout'));
    });

    req.write(body);
    req.end();
  });
}

// Check if model is available
export async function isModelAvailable(modelId) {
  const available = await listAvailableModels();
  return available.some((m) => m.name === modelId || m.model === modelId);
}

// Clear model cache
export function clearModelCache() {
  modelCache = null;
  availableModelsCache = null;
  cacheExpiry = null;
}
