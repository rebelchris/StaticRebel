/**
 * OpenAI Provider - OpenAI API provider
 * 
 * Supports:
 * - Chat completion
 * - Streaming responses  
 * - Embeddings
 * - Health checks
 */

import BaseProvider from './BaseProvider.js';

export class OpenAIProvider extends BaseProvider {
  constructor(options = {}) {
    super('openai', options);
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
    this.organization = options.organization || process.env.OPENAI_ORG_ID;
    
    if (!this.apiKey) {
      throw new Error('OpenAI provider requires apiKey or OPENAI_API_KEY environment variable');
    }
  }

  /**
   * Get request headers
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'User-Agent': 'StaticRebel/1.0'
    };

    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }

    return headers;
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
      throw new Error(`OpenAI API error: ${data.error.message}`);
    }

    return this.normalizeResponse({
      content: data.choices[0]?.message?.content || '',
      tokensUsed: data.usage?.total_tokens,
      metadata: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        finishReason: data.choices[0]?.finish_reason,
        id: data.id,
        created: data.created
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
   * Text embeddings
   */
  async embeddings(model, texts, options = {}) {
    const url = new URL('/embeddings', this.baseUrl);
    const textArray = Array.isArray(texts) ? texts : [texts];
    
    const body = JSON.stringify({
      model,
      input: textArray,
      encoding_format: options.format || 'float',
      dimensions: options.dimensions
    });

    const response = await this.makeRequest(url.toString(), {
      method: 'POST',
      headers: this.getHeaders(),
      body
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`OpenAI Embeddings error: ${data.error.message}`);
    }

    return data.data?.map(d => d.embedding) || [];
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
        permissions: data.permission,
        provider: this.name
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
}

export default OpenAIProvider;