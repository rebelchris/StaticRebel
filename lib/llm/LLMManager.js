/**
 * LLM Manager - Unified interface for multi-provider LLM support
 * 
 * Features:
 * - Multi-provider support (Ollama, OpenAI, Anthropic, Groq)
 * - Automatic fallback chains
 * - Configuration management
 * - Health monitoring
 * - Usage tracking
 * - Context window management
 */

import { EventEmitter } from 'events';
import {
  createAvailableProviders,
  detectAvailableProviders,
  DEFAULT_MODELS,
  FALLBACK_CHAINS,
  getFallbackChain,
  getRecommendedModel
} from './providers/index.js';

export class LLMManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Default configuration
      provider: config.provider || 'ollama',
      model: config.model || 'llama3.2',
      fallback: config.fallback || null,
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 60000,
      contextWarningThreshold: config.contextWarningThreshold || 0.8,
      contextCriticalThreshold: config.contextCriticalThreshold || 0.9,
      enableFallback: config.enableFallback !== false,
      enableHealthChecks: config.enableHealthChecks !== false,
      ...config
    };

    // Provider instances
    this.providers = new Map();
    this.healthStatus = new Map();
    this.usageStats = {
      totalRequests: 0,
      totalTokens: 0,
      providerUsage: {},
      fallbackCount: 0,
      errors: {}
    };

    // Model registry
    this.models = new Map(Object.entries(DEFAULT_MODELS));
    this.fallbackChains = { ...FALLBACK_CHAINS, ...config.fallbackChains };

    // Initialize providers
    this.initializeProviders();
  }

  /**
   * Initialize available providers
   */
  async initializeProviders() {
    try {
      // Auto-detect providers from environment
      const availableProviders = createAvailableProviders();
      
      for (const [name, provider] of availableProviders) {
        this.providers.set(name, provider);
        this.emit('provider:registered', { name, provider: provider.name });
      }

      // Perform initial health checks if enabled
      if (this.config.enableHealthChecks) {
        await this.checkAllProviderHealth();
      }

      this.emit('initialized', {
        providers: Array.from(this.providers.keys()),
        models: this.getAvailableModels()
      });
    } catch (error) {
      this.emit('error', { type: 'initialization', error });
    }
  }

  /**
   * Get provider instance
   */
  getProvider(name) {
    return this.providers.get(name);
  }

  /**
   * Parse model reference (provider/model)
   */
  parseModelRef(modelRef) {
    if (!modelRef) {
      return {
        provider: this.config.provider,
        model: this.config.model
      };
    }

    if (modelRef.includes('/')) {
      const [provider, model] = modelRef.split('/', 2);
      return { provider, model };
    }

    return {
      provider: this.config.provider,
      model: modelRef
    };
  }

  /**
   * Get model configuration
   */
  getModelConfig(modelRef) {
    return this.models.get(modelRef) || null;
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text) {
    if (!text) return 0;
    // Rough approximation: ~4 chars per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate tokens for messages
   */
  estimateMessagesTokens(messages) {
    return messages.reduce((total, msg) => {
      return total + this.estimateTokens(msg.content) + this.estimateTokens(msg.role);
    }, 0);
  }

  /**
   * Check context window usage
   */
  checkContextWindow(messages, modelRef) {
    const config = this.getModelConfig(modelRef);
    const contextWindow = config?.contextWindow || 8192;
    const estimatedTokens = this.estimateMessagesTokens(messages);
    const usageRatio = estimatedTokens / contextWindow;

    const status = {
      contextWindow,
      estimatedTokens,
      usageRatio,
      status: 'ok'
    };

    if (usageRatio >= this.config.contextCriticalThreshold) {
      status.status = 'critical';
      status.warning = `Context window ${Math.round(usageRatio * 100)}% full - may fail`;
    } else if (usageRatio >= this.config.contextWarningThreshold) {
      status.status = 'warning';
      status.warning = `Context window ${Math.round(usageRatio * 100)}% full`;
    }

    return status;
  }

  /**
   * Chat completion with fallback support
   */
  async chat(modelRef, messages, options = {}) {
    const startTime = Date.now();
    let primaryModelRef = modelRef || this.getPrimaryModel();
    let fallbackChain = [];

    // Determine fallback chain
    if (this.config.enableFallback) {
      if (this.config.fallback) {
        // Use configured fallback
        fallbackChain = [primaryModelRef, this.config.fallback];
      } else {
        // Use task-based fallback chain
        const task = options.task || 'general';
        fallbackChain = this.getFallbackChain(task);
        
        // Ensure primary model is first
        if (!fallbackChain.includes(primaryModelRef)) {
          fallbackChain = [primaryModelRef, ...fallbackChain];
        }
      }
    } else {
      fallbackChain = [primaryModelRef];
    }

    let lastError = null;
    let attempt = 0;

    for (const modelRef of fallbackChain) {
      attempt++;
      const { provider: providerName, model } = this.parseModelRef(modelRef);
      const provider = this.getProvider(providerName);

      if (!provider) {
        lastError = new Error(`Provider not available: ${providerName}`);
        this.emit('fallback:provider_unavailable', { modelRef, attempt });
        continue;
      }

      // Check provider health
      if (this.config.enableHealthChecks) {
        const health = this.healthStatus.get(providerName);
        if (health && !health.healthy) {
          lastError = new Error(`Provider unhealthy: ${providerName}`);
          this.emit('fallback:provider_unhealthy', { modelRef, attempt });
          continue;
        }
      }

      // Check context window
      const contextStatus = this.checkContextWindow(messages, modelRef);
      if (contextStatus.status === 'critical' && attempt < fallbackChain.length) {
        lastError = new Error(`Context window too full: ${contextStatus.warning}`);
        this.emit('fallback:context_overflow', { modelRef, attempt, contextStatus });
        continue;
      }

      try {
        this.emit('chat:attempt', { modelRef, attempt, provider: providerName });

        const response = await provider.chat(model, messages, {
          ...options,
          timeout: options.timeout || this.config.timeout
        });

        // Track usage
        this.trackUsage(providerName, response);

        // Emit success events
        if (attempt > 1) {
          this.emit('fallback:success', {
            originalModel: fallbackChain[0],
            usedModel: modelRef,
            attempt
          });
        }

        this.emit('chat:success', {
          modelRef,
          provider: providerName,
          duration: Date.now() - startTime,
          tokensUsed: response.tokensUsed
        });

        return {
          ...response,
          modelRef,
          fallbackUsed: attempt > 1,
          fallbackAttempt: attempt,
          duration: Date.now() - startTime
        };

      } catch (error) {
        lastError = error;
        this.trackError(providerName, error);
        
        this.emit('chat:error', {
          modelRef,
          provider: providerName,
          attempt,
          error: error.message
        });

        // If this was the last option, give up
        if (attempt >= fallbackChain.length) {
          break;
        }

        // Continue to next fallback
        this.usageStats.fallbackCount++;
      }
    }

    // All fallbacks failed
    this.emit('chat:failed', {
      originalModel: fallbackChain[0],
      attempts: attempt,
      lastError: lastError?.message
    });

    throw lastError || new Error('All fallback providers failed');
  }

  /**
   * Streaming chat with fallback support
   */
  async *stream(modelRef, messages, options = {}) {
    const primaryModelRef = modelRef || this.getPrimaryModel();
    let fallbackChain = this.config.enableFallback 
      ? this.getFallbackChain(options.task || 'general')
      : [primaryModelRef];

    let lastError = null;
    let attempt = 0;

    for (const modelRef of fallbackChain) {
      attempt++;
      const { provider: providerName, model } = this.parseModelRef(modelRef);
      const provider = this.getProvider(providerName);

      if (!provider || !provider.stream) {
        lastError = new Error(`Streaming not available: ${providerName}`);
        continue;
      }

      try {
        this.emit('stream:attempt', { modelRef, attempt, provider: providerName });

        let tokenCount = 0;
        const startTime = Date.now();

        for await (const chunk of provider.stream(model, messages, options)) {
          tokenCount++;
          yield {
            ...chunk,
            modelRef,
            fallbackUsed: attempt > 1
          };
        }

        // Track usage for streaming
        this.trackUsage(providerName, { tokensUsed: tokenCount });

        this.emit('stream:success', {
          modelRef,
          provider: providerName,
          duration: Date.now() - startTime,
          tokensUsed: tokenCount
        });

        return; // Successful stream completed
        
      } catch (error) {
        lastError = error;
        this.trackError(providerName, error);
        
        this.emit('stream:error', {
          modelRef,
          provider: providerName,
          attempt,
          error: error.message
        });
      }
    }

    throw lastError || new Error('All streaming fallback providers failed');
  }

  /**
   * Text embeddings
   */
  async embeddings(modelRef, texts, options = {}) {
    const { provider: providerName, model } = this.parseModelRef(
      modelRef || this.getEmbeddingModel()
    );
    
    const provider = this.getProvider(providerName);
    
    if (!provider) {
      throw new Error(`Provider not available: ${providerName}`);
    }

    if (!provider.embeddings) {
      throw new Error(`Provider does not support embeddings: ${providerName}`);
    }

    try {
      this.emit('embeddings:start', { modelRef, provider: providerName });

      const embeddings = await provider.embeddings(model, texts, options);

      this.emit('embeddings:success', {
        modelRef,
        provider: providerName,
        count: Array.isArray(texts) ? texts.length : 1
      });

      return embeddings;
    } catch (error) {
      this.emit('embeddings:error', { modelRef, provider: providerName, error });
      throw error;
    }
  }

  /**
   * Get primary model reference
   */
  getPrimaryModel() {
    return `${this.config.provider}/${this.config.model}`;
  }

  /**
   * Get embedding model reference
   */
  getEmbeddingModel() {
    const embeddingChain = this.getFallbackChain('embeddings');
    return embeddingChain[0] || 'ollama/nomic-embed-text';
  }

  /**
   * Get fallback chain for task
   */
  getFallbackChain(task) {
    return getFallbackChain(task);
  }

  /**
   * Check health of all providers
   */
  async checkAllProviderHealth() {
    const results = {};
    
    for (const [name, provider] of this.providers) {
      try {
        const health = await provider.healthCheck();
        this.healthStatus.set(name, health);
        results[name] = health;
        
        this.emit('health:checked', { provider: name, health });
      } catch (error) {
        const health = { healthy: false, error: error.message };
        this.healthStatus.set(name, health);
        results[name] = health;
        
        this.emit('health:error', { provider: name, error });
      }
    }
    
    return results;
  }

  /**
   * Get health status
   */
  getHealthStatus(providerName = null) {
    if (providerName) {
      return this.healthStatus.get(providerName);
    }
    return Object.fromEntries(this.healthStatus);
  }

  /**
   * Track usage statistics
   */
  trackUsage(provider, response) {
    this.usageStats.totalRequests++;
    this.usageStats.totalTokens += response.tokensUsed || 0;

    if (!this.usageStats.providerUsage[provider]) {
      this.usageStats.providerUsage[provider] = {
        requests: 0,
        tokens: 0,
        errors: 0
      };
    }

    this.usageStats.providerUsage[provider].requests++;
    this.usageStats.providerUsage[provider].tokens += response.tokensUsed || 0;
  }

  /**
   * Track errors
   */
  trackError(provider, error) {
    if (!this.usageStats.errors[provider]) {
      this.usageStats.errors[provider] = {};
    }

    const errorType = error.constructor.name;
    this.usageStats.errors[provider][errorType] = 
      (this.usageStats.errors[provider][errorType] || 0) + 1;

    if (this.usageStats.providerUsage[provider]) {
      this.usageStats.providerUsage[provider].errors++;
    }
  }

  /**
   * Get usage statistics
   */
  getUsageStats() {
    return {
      ...this.usageStats,
      topProviders: Object.entries(this.usageStats.providerUsage)
        .sort((a, b) => b[1].requests - a[1].requests)
        .slice(0, 5),
      fallbackRate: this.usageStats.totalRequests > 0
        ? this.usageStats.fallbackCount / this.usageStats.totalRequests
        : 0
    };
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return Array.from(this.models.entries()).map(([ref, config]) => ({
      ref,
      ...config,
      available: this.providers.has(config.provider)
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
   * Update configuration
   */
  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    this.emit('config:updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }
}

/**
 * Factory function to create LLMManager with config
 */
export function createLLMManager(config = {}) {
  return new LLMManager(config);
}

export default LLMManager;