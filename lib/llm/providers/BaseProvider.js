/**
 * Base Provider Interface - Abstract class for LLM providers
 * 
 * All providers must implement:
 * - chat: Chat completion
 * - stream: Streaming chat
 * - healthCheck: Provider health status
 * 
 * Optional methods:
 * - embeddings: Text embeddings
 * - listModels: Available models
 */

export class BaseProvider {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
    this.timeout = options.timeout || 60000;
  }

  /**
   * Chat completion - must be implemented by subclasses
   * @param {string} model - Model identifier
   * @param {Array} messages - Array of {role, content} objects
   * @param {Object} options - Chat options (temperature, maxTokens, etc.)
   * @returns {Promise<Object>} Response object
   */
  async chat(model, messages, options = {}) {
    throw new Error(`chat() method not implemented by ${this.name} provider`);
  }

  /**
   * Streaming chat - must be implemented by subclasses
   * @param {string} model - Model identifier  
   * @param {Array} messages - Array of {role, content} objects
   * @param {Object} options - Chat options
   * @yields {Object} Stream tokens
   */
  async *stream(model, messages, options = {}) {
    throw new Error(`stream() method not implemented by ${this.name} provider`);
  }

  /**
   * Health check - must be implemented by subclasses
   * @returns {Promise<Object>} Health status object
   */
  async healthCheck() {
    throw new Error(`healthCheck() method not implemented by ${this.name} provider`);
  }

  /**
   * Text embeddings - optional
   * @param {string} model - Model identifier
   * @param {string|Array} texts - Text(s) to embed
   * @param {Object} options - Embedding options
   * @returns {Promise<Array>} Array of embeddings
   */
  async embeddings(model, texts, options = {}) {
    throw new Error(`embeddings() method not implemented by ${this.name} provider`);
  }

  /**
   * List available models - optional
   * @returns {Promise<Array>} Array of model objects
   */
  async listModels() {
    return [];
  }

  /**
   * Normalize chat response format
   * @param {Object} response - Raw provider response
   * @param {string} model - Model used
   * @returns {Object} Normalized response
   */
  normalizeResponse(response, model) {
    return {
      content: response.content || '',
      model: model,
      provider: this.name,
      tokensUsed: response.tokensUsed || response.usage?.total_tokens || 0,
      duration: response.duration,
      metadata: response.metadata || {},
      ...response
    };
  }

  /**
   * Validate required options
   * @param {Array} required - Required option keys
   * @throws {Error} If required options are missing
   */
  validateOptions(required) {
    for (const key of required) {
      if (!this.options[key]) {
        throw new Error(`${this.name} provider requires ${key} option`);
      }
    }
  }

  /**
   * Make HTTP request with timeout and error handling
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>} Fetch response
   */
  async makeRequest(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      return response;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export default BaseProvider;