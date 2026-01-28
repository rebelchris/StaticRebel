// Model Registry - Ollama model management with task mapping
import http from 'http';
import { loadConfig, getConfig } from './configManager.js';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const DEFAULT_TIMEOUT = 120000;

let modelCache = null;
let availableModelsCache = null;
let cacheExpiry = null;
const CACHE_DURATION = 60000; // 1 minute cache

export function getOllamaHost() {
  return OLLAMA_HOST;
}

export function getDefaultModel() {
  return process.env.OLLAMA_MODEL || 'llama3.2';
}

export function getEmbeddingModel() {
  return process.env.EMBEDDING_MODEL || 'nomic-embed-text';
}

export function getVisionModel() {
  return process.env.VISION_MODEL || 'llava';
}

// Load model registry from config
export function loadModelRegistry() {
  if (modelCache && cacheExpiry && Date.now() < cacheExpiry) {
    return modelCache;
  }

  const config = loadConfig();
  modelCache = config.models || {
    providers: { ollama: { models: [] } },
    defaults: {},
    taskMapping: {}
  };

  cacheExpiry = Date.now() + CACHE_DURATION;
  return modelCache;
}

// List all configured models
export function listConfiguredModels() {
  const registry = loadModelRegistry();
  const models = [];

  for (const [provider, data] of Object.entries(registry.providers || {})) {
    for (const model of (data.models || [])) {
      models.push({
        provider,
        id: model.id,
        name: model.name || model.id,
        tags: model.tags || [],
        reasoning: model.reasoning || false,
        contextWindow: model.contextWindow || 200000
      });
    }
  }

  return models;
}

// Check which models are actually available
export async function listAvailableModels() {
  if (availableModelsCache && cacheExpiry && Date.now() < cacheExpiry) {
    return availableModelsCache;
  }

  const models = await new Promise((resolve) => {
    const req = http.request({
      hostname: new URL(OLLAMA_HOST).hostname,
      port: new URL(OLLAMA_HOST).port || 11434,
      path: '/api/tags',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.models || []);
        } catch (e) {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.end();
  });

  availableModelsCache = models;
  cacheExpiry = Date.now() + CACHE_DURATION;
  return models;
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
    embeddings: defaults.embeddings || 'ollama/nomic-embed-text'
  };

  return taskMapping[taskType] || taskMapping.general;
}

// Detect task type from input
export function detectTaskType(input) {
  const registry = loadModelRegistry();
  const mapping = registry.taskMapping || {};

  const lowerInput = input.toLowerCase();

  for (const [taskType, keywords] of Object.entries(mapping)) {
    for (const keyword of (keywords || [])) {
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

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages,
      stream: options.stream || false,
      options: {
        temperature: options.temperature || 0.7,
        num_predict: options.maxTokens || 8192
      }
    });

    const req = http.request({
      hostname: new URL(OLLAMA_HOST).hostname,
      port: new URL(OLLAMA_HOST).port || 11434,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            message: parsed.message?.content || '',
            done: parsed.done || false,
            totalDuration: parsed.total_duration,
            loadDuration: parsed.load_duration
          });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

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
      texts: Array.isArray(texts) ? texts : [texts]
    });

    const req = http.request({
      hostname: new URL(OLLAMA_HOST).hostname,
      port: new URL(OLLAMA_HOST).port || 11434,
      path: '/api/embeddings',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.embedding || parsed.embeddings || []);
        } catch (e) {
          reject(new Error(`Failed to parse embeddings: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Embeddings timeout')); });

    req.write(body);
    req.end();
  });
}

// Check if model is available
export async function isModelAvailable(modelId) {
  const available = await listAvailableModels();
  return available.some(m => m.name === modelId || m.model === modelId);
}

// Clear model cache
export function clearModelCache() {
  modelCache = null;
  availableModelsCache = null;
  cacheExpiry = null;
}
