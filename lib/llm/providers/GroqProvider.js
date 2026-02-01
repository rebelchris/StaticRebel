/**
 * Groq Provider - Groq Cloud API provider
 * 
 * Supports:
 * - Chat completion
 * - Streaming responses
 * - Health checks
 * 
 * Uses OpenAI-compatible API format
 */

import BaseProvider from './BaseProvider.js';

export class GroqProvider extends BaseProvider {
  constructor(options = {}) {
    super('groq', options);
    this.apiKey = options.apiKey || process.env.GROQ_API_KEY;
    this.baseUrl = options.baseUrl || 'https://api.groq.com/openai/v1';
    
    if (!this.apiKey) {
      throw new Error('Groq provider requires apiKey or GROQ_API_KEY environment variable');
    }
  }

  /**
   * Get request headers
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'User-Agent': 'StaticRebel/1.0'
    };
  }

  /**
   * Chat completion
   */
  async chat(model, messages, options = {}) {
    const url = new URL('/chat/completions', this.baseUrl);
    
    const body = JSON.stringify({
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stop: options.stop,
      stream: false
    });

    const response = await this.makeRequest(url.toString(), {
      method: 'POST',
      headers: this.getHeaders(),
      body
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`Groq API error: ${data.error.message}`);
    }

    return this.normalizeResponse({
      content: data.choices[0]?.message?.content || '',
      tokensUsed: data.usage?.total_tokens,
      metadata: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        finishReason: data.choices[0]?.finish_reason,
        id: data.id,
        created: data.created,
        systemFingerprint: data.system_fingerprint
      }
    }, model);
  }

  /**
   * Streaming chat
   */
  async *stream(model, messages, options = {}) {
    const url = new URL('/chat/completions', this.baseUrl);
    
    const body = JSON.stringify({
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stop: options.stop,
      stream: true
    });

    const response = await this.makeRequest(url.toString(), {
      method: 'POST',
      headers: this.getHeaders(),
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
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              
              if (content) {
                yield {
                  token: content,
                  done: false,
                  model,
                  provider: this.name,
                  finishReason: parsed.choices[0]?.finish_reason
                };
              }

              if (parsed.choices[0]?.finish_reason) {
                return;
              }
            } catch {
              // Ignore parse errors for partial chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Groq doesn't provide embeddings API
   */
  async embeddings() {
    throw new Error('Groq provider does not support embeddings');
  }

  /**
   * List available models
   */
  async listModels() {
    const url = new URL('/models', this.baseUrl);
    
    try {
      const response = await this.makeRequest(url.toString(), {
        headers: this.getHeaders()
      });

      const data = await response.json();
      
      if (data.error) {
        return [];
      }

      return (data.data || []).map(model => ({
        id: model.id,
        name: model.id,
        created: model.created,
        ownedBy: model.owned_by,
        provider: this.name,
        contextWindow: this.getModelContextWindow(model.id)
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get context window for known Groq models
   */
  getModelContextWindow(modelId) {
    const contextWindows = {
      'llama-3.1-405b-reasoning': 131072,
      'llama-3.1-70b-versatile': 131072,
      'llama-3.1-8b-instant': 131072,
      'llama3-70b-8192': 8192,
      'llama3-8b-8192': 8192,
      'mixtral-8x7b-32768': 32768,
      'gemma-7b-it': 8192,
      'gemma2-9b-it': 8192
    };

    return contextWindows[modelId] || 8192; // Default to 8K
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const url = new URL('/models', this.baseUrl);
      
      // Use shorter timeout for health check
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(url.toString(), {
          headers: this.getHeaders(),
          signal: controller.signal
        });

        if (!response.ok) {
          const error = await response.text();
          return {
            healthy: false,
            error: `HTTP ${response.status}: ${error}`,
            provider: this.name
          };
        }

        const data = await response.json();
        
        if (data.error) {
          return {
            healthy: false,
            error: data.error.message,
            provider: this.name
          };
        }

        return {
          healthy: true,
          models: (data.data || []).map(m => m.id),
          modelCount: data.data?.length || 0,
          provider: this.name,
          apiUrl: this.baseUrl
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      return {
        healthy: false,
        error: error.name === 'AbortError' ? 'Timeout' : error.message,
        provider: this.name
      };
    }
  }

  /**
   * Get model details
   */
  async getModel(modelId) {
    const url = new URL(`/models/${modelId}`, this.baseUrl);
    
    try {
      const response = await this.makeRequest(url.toString(), {
        headers: this.getHeaders()
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      return {
        id: data.id,
        name: data.id,
        created: data.created,
        ownedBy: data.owned_by,
        provider: this.name,
        contextWindow: this.getModelContextWindow(data.id)
      };
    } catch (error) {
      throw new Error(`Failed to get model details: ${error.message}`);
    }
  }

  /**
   * Check if model exists and is accessible
   */
  async hasModel(modelId) {
    try {
      await this.getModel(modelId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get recommended models for different tasks
   */
  getRecommendedModels() {
    return {
      reasoning: 'llama-3.1-405b-reasoning',
      general: 'llama-3.1-70b-versatile',
      fast: 'llama-3.1-8b-instant',
      coding: 'llama-3.1-70b-versatile',
      creative: 'mixtral-8x7b-32768'
    };
  }
}

export default GroqProvider;