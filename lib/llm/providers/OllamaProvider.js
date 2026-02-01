/**
 * Ollama Provider - Local AI model provider
 * 
 * Supports:
 * - Chat completion
 * - Streaming responses
 * - Embeddings
 * - Health checks
 */

import BaseProvider from './BaseProvider.js';

export class OllamaProvider extends BaseProvider {
  constructor(options = {}) {
    super('ollama', options);
    this.host = options.host || process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.timeout = options.timeout || 120000; // Longer timeout for local models
  }

  /**
   * Chat completion
   */
  async chat(model, messages, options = {}) {
    const url = new URL('/api/chat', this.host);
    
    const body = JSON.stringify({
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens || 8192,
        top_p: options.topP,
        top_k: options.topK,
      }
    });

    const response = await this.makeRequest(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body
    });

    const data = await response.json();

    return this.normalizeResponse({
      content: data.message?.content || '',
      tokensUsed: data.eval_count,
      duration: data.total_duration ? data.total_duration / 1e6 : undefined,
      metadata: {
        loadDuration: data.load_duration,
        promptEvalCount: data.prompt_eval_count,
        evalCount: data.eval_count,
        done: data.done
      }
    }, model);
  }

  /**
   * Streaming chat
   */
  async *stream(model, messages, options = {}) {
    const url = new URL('/api/chat', this.host);
    
    const body = JSON.stringify({
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens || 8192,
        top_p: options.topP,
        top_k: options.topK,
      }
    });

    const response = await this.makeRequest(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              yield {
                token: data.message.content,
                done: data.done || false,
                model,
                provider: this.name
              };
            }
            if (data.done) {
              return;
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

  /**
   * Text embeddings
   */
  async embeddings(model, texts, options = {}) {
    const url = new URL('/api/embeddings', this.host);
    const textArray = Array.isArray(texts) ? texts : [texts];
    const embeddings = [];

    for (const text of textArray) {
      const body = JSON.stringify({
        model,
        prompt: text
      });

      const response = await this.makeRequest(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body
      });

      const data = await response.json();
      embeddings.push(data.embedding || []);
    }

    return embeddings;
  }

  /**
   * List available models
   */
  async listModels() {
    const url = new URL('/api/tags', this.host);
    
    try {
      const response = await this.makeRequest(url.toString());
      const data = await response.json();
      
      return (data.models || []).map(model => ({
        id: model.name,
        name: model.name,
        size: model.size,
        modified: model.modified_at,
        provider: this.name
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const url = new URL('/api/tags', this.host);
      
      // Use shorter timeout for health check
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(url.toString(), {
          signal: controller.signal
        });

        if (!response.ok) {
          return {
            healthy: false,
            error: `HTTP ${response.status}`,
            provider: this.name,
            host: this.host
          };
        }

        const data = await response.json();
        return {
          healthy: true,
          models: (data.models || []).map(m => m.name),
          modelCount: data.models?.length || 0,
          provider: this.name,
          host: this.host
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      return {
        healthy: false,
        error: error.name === 'AbortError' ? 'Timeout' : error.message,
        provider: this.name,
        host: this.host
      };
    }
  }

  /**
   * Check if model is available
   */
  async hasModel(modelName) {
    const models = await this.listModels();
    return models.some(m => m.id === modelName);
  }

  /**
   * Pull/download a model
   */
  async pullModel(modelName, onProgress) {
    const url = new URL('/api/pull', this.host);
    
    const body = JSON.stringify({
      name: modelName,
      stream: !!onProgress
    });

    const response = await this.makeRequest(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body
    });

    if (!onProgress) {
      const data = await response.json();
      return { success: data.status === 'success' };
    }

    // Stream progress updates
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            onProgress(data);
            if (data.status === 'success') {
              return { success: true };
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { success: false };
  }
}

export default OllamaProvider;