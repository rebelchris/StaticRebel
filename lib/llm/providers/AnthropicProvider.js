/**
 * Anthropic Provider - Claude API provider
 * 
 * Supports:
 * - Chat completion
 * - Streaming responses
 * - Health checks
 * 
 * Note: Anthropic doesn't provide embeddings API
 */

import BaseProvider from './BaseProvider.js';

export class AnthropicProvider extends BaseProvider {
  constructor(options = {}) {
    super('anthropic', options);
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseUrl = options.baseUrl || 'https://api.anthropic.com';
    this.version = options.version || '2023-06-01';
    
    if (!this.apiKey) {
      throw new Error('Anthropic provider requires apiKey or ANTHROPIC_API_KEY environment variable');
    }
  }

  /**
   * Get request headers
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': this.version,
      'User-Agent': 'StaticRebel/1.0'
    };
  }

  /**
   * Convert messages to Anthropic format
   */
  formatMessages(messages) {
    const systemMessages = messages.filter(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    // Combine system messages into one
    const system = systemMessages.length > 0 
      ? systemMessages.map(m => m.content).join('\n\n')
      : undefined;

    // Convert user/assistant messages
    const formattedMessages = [];
    for (const message of userMessages) {
      formattedMessages.push({
        role: message.role === 'user' ? 'user' : 'assistant',
        content: message.content
      });
    }

    return { system, messages: formattedMessages };
  }

  /**
   * Chat completion
   */
  async chat(model, messages, options = {}) {
    const url = new URL('/v1/messages', this.baseUrl);
    const { system, messages: formattedMessages } = this.formatMessages(messages);
    
    const body = JSON.stringify({
      model,
      messages: formattedMessages,
      system,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP,
      stop_sequences: options.stop,
      stream: false
    });

    const response = await this.makeRequest(url.toString(), {
      method: 'POST',
      headers: this.getHeaders(),
      body
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`Anthropic API error: ${data.error.message}`);
    }

    return this.normalizeResponse({
      content: data.content[0]?.text || '',
      tokensUsed: data.usage?.output_tokens + (data.usage?.input_tokens || 0),
      metadata: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        stopReason: data.stop_reason,
        id: data.id,
        type: data.type,
        role: data.role
      }
    }, model);
  }

  /**
   * Streaming chat
   */
  async *stream(model, messages, options = {}) {
    const url = new URL('/v1/messages', this.baseUrl);
    const { system, messages: formattedMessages } = this.formatMessages(messages);
    
    const body = JSON.stringify({
      model,
      messages: formattedMessages,
      system,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP,
      stop_sequences: options.stop,
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
              
              // Handle different event types
              switch (parsed.type) {
                case 'content_block_delta':
                  if (parsed.delta?.text) {
                    yield {
                      token: parsed.delta.text,
                      done: false,
                      model,
                      provider: this.name
                    };
                  }
                  break;
                  
                case 'message_stop':
                  return;
                  
                case 'error':
                  throw new Error(`Anthropic stream error: ${parsed.error?.message}`);
              }
            } catch (parseError) {
              // Ignore parse errors for partial chunks
              if (parseError.message.includes('Anthropic stream error')) {
                throw parseError;
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Anthropic doesn't provide embeddings API
   */
  async embeddings() {
    throw new Error('Anthropic provider does not support embeddings');
  }

  /**
   * List available models (hardcoded - Anthropic doesn't provide models endpoint)
   */
  async listModels() {
    // Anthropic's available models as of 2024
    return [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        provider: this.name,
        contextWindow: 200000
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        provider: this.name,
        contextWindow: 200000
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        provider: this.name,
        contextWindow: 200000
      },
      {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude 3 Sonnet',
        provider: this.name,
        contextWindow: 200000
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        provider: this.name,
        contextWindow: 200000
      }
    ];
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const url = new URL('/v1/messages', this.baseUrl);
      
      // Simple test message to verify API access
      const testBody = JSON.stringify({
        model: 'claude-3-haiku-20240307',
        messages: [{
          role: 'user',
          content: 'Hi'
        }],
        max_tokens: 1
      });

      // Use shorter timeout for health check
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: this.getHeaders(),
          body: testBody,
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

        const models = await this.listModels();
        return {
          healthy: true,
          models: models.map(m => m.id),
          modelCount: models.length,
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
   * Check if model is available
   */
  async hasModel(modelId) {
    const models = await this.listModels();
    return models.some(m => m.id === modelId);
  }

  /**
   * Get token count estimation
   * Anthropic doesn't provide a tokens API, so this is a rough estimate
   */
  estimateTokens(text) {
    // Rough approximation: ~3.5 chars per token for English
    return Math.ceil(text.length / 3.5);
  }
}

export default AnthropicProvider;