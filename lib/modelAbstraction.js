/**
 * Model Abstraction Layer - Unified interface for multiple AI model providers
 *
 * Supports:
 * - Local models (Ollama)
 * - Remote models (OpenAI, Anthropic, etc.)
 * - Per-task model selection
 * - Fallback mechanisms
 * - Streaming responses
 */

import { EventEmitter } from 'events';
import http from 'http';
import https from 'https';
import { URL } from 'url';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * @typedef {Object} ModelProvider
 * @property {string} name - Provider name
 * @property {string} type - 'local' | 'remote'
 * @property {Function} chat - Chat completion function
 * @property {Function} [embeddings] - Embeddings function
 * @property {Function} [stream] - Streaming chat function
 * @property {Function} healthCheck - Health check function
 */

/**
 * @typedef {Object} ModelConfig
 * @property {string} id - Model identifier
 * @property {string} provider - Provider name
 * @property {string} name - Human-readable name
 * @property {number} contextWindow - Context window size
 * @property {boolean} supportsStreaming - Whether streaming is supported
 * @property {boolean} supportsEmbeddings - Whether embeddings are supported
 * @property {string[]} capabilities - Model capabilities
 * @property {Object} options - Default options
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} role - 'system' | 'user' | 'assistant'
 * @property {string} content - Message content
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} ChatOptions
 * @property {number} [temperature] - Sampling temperature
 * @property {number} [maxTokens] - Maximum tokens to generate
 * @property {boolean} [stream] - Whether to stream response
 * @property {Function} [onToken] - Token callback for streaming
 * @property {number} [timeout] - Request timeout
 */

/**
 * @typedef {Object} ChatResponse
 * @property {string} content - Response content
 * @property {string} model - Model used
 * @property {number} [tokensUsed] - Tokens used
 * @property {number} [duration] - Response duration
 * @property {Object} [metadata] - Additional metadata
 */

// ============================================================================
// Ollama Provider
// ============================================================================

export class OllamaProvider {
  constructor(options = {}) {
    this.name = 'ollama';
    this.type = 'local';
    this.host =
      options.host || process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.defaultTimeout = options.timeout || 120000;
  }

  async chat(model, messages, options = {}) {
    const url = new URL('/api/chat', this.host);
    const timeout = options.timeout || this.defaultTimeout;

    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: options.stream || false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens || 8192,
        },
      });

      const client = url.protocol === 'https:' ? https : http;

      const req = client.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 11434),
          path: url.pathname,
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
                content: parsed.message?.content || '',
                model,
                done: parsed.done || false,
                tokensUsed: parsed.eval_count,
                duration: parsed.total_duration
                  ? parsed.total_duration / 1e6
                  : undefined,
                metadata: {
                  loadDuration: parsed.load_duration,
                  promptEvalCount: parsed.prompt_eval_count,
                  evalCount: parsed.eval_count,
                },
              });
            } catch (e) {
              reject(
                new Error(`Failed to parse Ollama response: ${e.message}`),
              );
            }
          });
        },
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Ollama request timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  async *stream(model, messages, options = {}) {
    const url = new URL('/api/chat', this.host);
    const timeout = options.timeout || this.defaultTimeout;

    const body = JSON.stringify({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens || 8192,
      },
    });

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      throw new Error(`Ollama stream error: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((l) => l.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              yield {
                token: data.message.content,
                done: data.done || false,
              };
            }
          } catch {
            // Ignore parse errors for partial chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async embeddings(model, texts, options = {}) {
    const url = new URL('/api/embeddings', this.host);
    const timeout = options.timeout || this.defaultTimeout;
    const textArray = Array.isArray(texts) ? texts : [texts];

    const embeddings = [];

    for (const text of textArray) {
      const result = await new Promise((resolve, reject) => {
        const body = JSON.stringify({ model, prompt: text });

        const client = url.protocol === 'https:' ? https : http;

        const req = client.request(
          {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 11434),
            path: url.pathname,
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
                resolve(parsed.embedding || []);
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

      embeddings.push(result);
    }

    return embeddings;
  }

  async healthCheck() {
    try {
      const url = new URL('/api/tags', this.host);
      const client = url.protocol === 'https:' ? https : http;

      return new Promise((resolve) => {
        const req = client.request(
          {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 11434),
            path: url.pathname,
            method: 'GET',
            timeout: 5000,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                resolve({
                  healthy: true,
                  models: parsed.models?.map((m) => m.name) || [],
                  host: this.host,
                });
              } catch {
                resolve({ healthy: false, error: 'Invalid response' });
              }
            });
          },
        );

        req.on('error', (err) => {
          resolve({ healthy: false, error: err.message });
        });
        req.on('timeout', () => {
          req.destroy();
          resolve({ healthy: false, error: 'Timeout' });
        });
        req.end();
      });
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

// ============================================================================
// OpenAI-Compatible Provider (for OpenAI, Groq, etc.)
// ============================================================================

export class OpenAICompatibleProvider {
  constructor(options = {}) {
    this.name = options.name || 'openai';
    this.type = 'remote';
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
    this.defaultTimeout = options.timeout || 60000;
  }

  async chat(model, messages, options = {}) {
    const url = new URL('/chat/completions', this.baseUrl);
    const timeout = options.timeout || this.defaultTimeout;

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${error}`);
    }

    const data = await response.json();

    return {
      content: data.choices[0]?.message?.content || '',
      model: data.model,
      tokensUsed: data.usage?.total_tokens,
      duration: undefined,
      metadata: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      },
    };
  }

  async *stream(model, messages, options = {}) {
    const url = new URL('/chat/completions', this.baseUrl);
    const timeout = options.timeout || this.defaultTimeout;

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        stream: true,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      throw new Error(`Stream error: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((l) => l.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                yield { token: content, done: false };
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async embeddings(model, texts, options = {}) {
    const url = new URL('/embeddings', this.baseUrl);
    const timeout = options.timeout || this.defaultTimeout;
    const textArray = Array.isArray(texts) ? texts : [texts];

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: textArray,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      throw new Error(`Embeddings error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data?.map((d) => d.embedding) || [];
  }

  async healthCheck() {
    try {
      const url = new URL('/models', this.baseUrl);

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return { healthy: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      return {
        healthy: true,
        models: data.data?.map((m) => m.id) || [],
        baseUrl: this.baseUrl,
      };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

// ============================================================================
// Model Registry
// ============================================================================

export const DEFAULT_MODELS = {
  // Local models (Ollama)
  'ollama/llama3.2': {
    id: 'llama3.2',
    provider: 'ollama',
    name: 'Llama 3.2',
    contextWindow: 128000,
    capabilities: ['chat', 'general'],
    options: { temperature: 0.7 },
  },
  'ollama/qwen3-coder': {
    id: 'qwen3-coder:latest',
    provider: 'ollama',
    name: 'Qwen 3 Coder',
    contextWindow: 128000,
    capabilities: ['chat', 'coding'],
    options: { temperature: 0.3 },
  },
  'ollama/deepseek-r1': {
    id: 'deepseek-r1:32b',
    provider: 'ollama',
    name: 'DeepSeek R1',
    contextWindow: 128000,
    capabilities: ['chat', 'reasoning', 'analysis'],
    options: { temperature: 0.7 },
  },
  'ollama/nomic-embed-text': {
    id: 'nomic-embed-text',
    provider: 'ollama',
    name: 'Nomic Embed',
    contextWindow: 2048,
    capabilities: ['embeddings'],
    options: {},
  },
  'ollama/llava': {
    id: 'llava',
    provider: 'ollama',
    name: 'LLaVA',
    contextWindow: 4096,
    capabilities: ['chat', 'vision'],
    options: { temperature: 0.7 },
  },

  // Remote models (examples)
  'openai/gpt-4': {
    id: 'gpt-4',
    provider: 'openai',
    name: 'GPT-4',
    contextWindow: 8192,
    capabilities: ['chat', 'general', 'reasoning'],
    options: { temperature: 0.7 },
  },
  'openai/gpt-4-turbo': {
    id: 'gpt-4-turbo-preview',
    provider: 'openai',
    name: 'GPT-4 Turbo',
    contextWindow: 128000,
    capabilities: ['chat', 'general', 'reasoning'],
    options: { temperature: 0.7 },
  },
  'openai/text-embedding-3-small': {
    id: 'text-embedding-3-small',
    provider: 'openai',
    name: 'Text Embedding 3 Small',
    contextWindow: 8191,
    capabilities: ['embeddings'],
    options: {},
  },
};

// Task to model mapping
export const TASK_MODELS = {
  coding: 'ollama/qwen3-coder',
  analysis: 'ollama/deepseek-r1',
  reasoning: 'ollama/deepseek-r1',
  general: 'ollama/llama3.2',
  vision: 'ollama/llava',
  embeddings: 'ollama/nomic-embed-text',
  fast: 'ollama/llama3.2',
};

// ============================================================================
// Model Manager
// ============================================================================

export class ModelManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.providers = new Map();
    this.models = new Map(Object.entries(DEFAULT_MODELS));
    this.taskModels = { ...TASK_MODELS, ...options.taskModels };
    this.defaultModel = options.defaultModel || 'ollama/llama3.2';

    // Initialize default providers
    this.initProviders(options);
  }

  /**
   * Initialize default providers
   */
  initProviders(options) {
    // Ollama provider
    this.registerProvider(
      new OllamaProvider({
        host: options.ollamaHost,
        timeout: options.timeout,
      }),
    );

    // OpenAI provider (if API key available)
    if (options.openaiApiKey || process.env.OPENAI_API_KEY) {
      this.registerProvider(
        new OpenAICompatibleProvider({
          name: 'openai',
          apiKey: options.openaiApiKey || process.env.OPENAI_API_KEY,
          baseUrl: 'https://api.openai.com/v1',
        }),
      );
    }

    // Groq provider (if API key available)
    if (options.groqApiKey || process.env.GROQ_API_KEY) {
      this.registerProvider(
        new OpenAICompatibleProvider({
          name: 'groq',
          apiKey: options.groqApiKey || process.env.GROQ_API_KEY,
          baseUrl: 'https://api.groq.com/openai/v1',
        }),
      );
    }
  }

  /**
   * Register a provider
   */
  registerProvider(provider) {
    this.providers.set(provider.name, provider);
    this.emit('provider:registered', {
      name: provider.name,
      type: provider.type,
    });
  }

  /**
   * Get a provider
   */
  getProvider(name) {
    return this.providers.get(name);
  }

  /**
   * Parse model reference
   */
  parseModelRef(modelRef) {
    if (!modelRef || typeof modelRef !== 'string') {
      return { provider: 'ollama', model: this.defaultModel.split('/')[1] };
    }

    if (modelRef.includes('/')) {
      const [provider, model] = modelRef.split('/');
      return { provider, model };
    }

    return { provider: 'ollama', model: modelRef };
  }

  /**
   * Get model config
   */
  getModel(modelRef) {
    return this.models.get(modelRef) || this.models.get(this.defaultModel);
  }

  /**
   * Get model for task
   */
  getModelForTask(task) {
    const modelRef = this.taskModels[task] || this.defaultModel;
    return this.getModel(modelRef);
  }

  /**
   * Chat completion
   */
  async chat(modelRef, messages, options = {}) {
    const { provider: providerName, model } = this.parseModelRef(modelRef);
    const provider = this.getProvider(providerName);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    this.emit('chat:started', { model: modelRef, provider: providerName });

    const startTime = Date.now();

    try {
      const response = await provider.chat(model, messages, options);

      this.emit('chat:completed', {
        model: modelRef,
        provider: providerName,
        duration: Date.now() - startTime,
      });

      return {
        ...response,
        provider: providerName,
        modelRef,
      };
    } catch (error) {
      this.emit('chat:error', { model: modelRef, error });
      throw error;
    }
  }

  /**
   * Streaming chat
   */
  async *stream(modelRef, messages, options = {}) {
    const { provider: providerName, model } = this.parseModelRef(modelRef);
    const provider = this.getProvider(providerName);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    if (!provider.stream) {
      throw new Error(`Provider ${providerName} does not support streaming`);
    }

    this.emit('stream:started', { model: modelRef, provider: providerName });

    try {
      yield* provider.stream(model, messages, options);
      this.emit('stream:completed', { model: modelRef });
    } catch (error) {
      this.emit('stream:error', { model: modelRef, error });
      throw error;
    }
  }

  /**
   * Create embeddings
   */
  async embeddings(modelRef, texts, options = {}) {
    const { provider: providerName, model } = this.parseModelRef(modelRef);
    const provider = this.getProvider(providerName);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    if (!provider.embeddings) {
      throw new Error(`Provider ${providerName} does not support embeddings`);
    }

    this.emit('embeddings:started', { model: modelRef });

    try {
      const embeddings = await provider.embeddings(model, texts, options);

      this.emit('embeddings:completed', {
        model: modelRef,
        count: Array.isArray(texts) ? texts.length : 1,
      });

      return embeddings;
    } catch (error) {
      this.emit('embeddings:error', { model: modelRef, error });
      throw error;
    }
  }

  /**
   * Health check all providers
   */
  async healthCheck() {
    const results = {};

    for (const [name, provider] of this.providers) {
      results[name] = await provider.healthCheck();
    }

    return results;
  }

  /**
   * List available models
   */
  listModels() {
    return Array.from(this.models.values()).map((m) => ({
      ref: `${m.provider}/${m.id}`,
      ...m,
    }));
  }

  /**
   * List available providers
   */
  listProviders() {
    return Array.from(this.providers.values()).map((p) => ({
      name: p.name,
      type: p.type,
      healthy: null, // Would need to check
    }));
  }

  /**
   * Add custom model
   */
  addModel(modelRef, config) {
    this.models.set(modelRef, config);
    this.emit('model:added', { ref: modelRef, config });
  }

  /**
   * Set task model mapping
   */
  setTaskModel(task, modelRef) {
    this.taskModels[task] = modelRef;
    this.emit('taskmodel:set', { task, model: modelRef });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createModelManager(options = {}) {
  return new ModelManager(options);
}

// ============================================================================
// Default Export
// ============================================================================

export default ModelManager;
