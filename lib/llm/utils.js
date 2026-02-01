/**
 * LLM Utilities - Helper functions for LLM management
 */

/**
 * Estimate token count for text
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  
  // Rough approximation based on different tokenizers:
  // - GPT models: ~4 chars per token
  // - Claude: ~3.5 chars per token  
  // - Average: ~4 chars per token
  return Math.ceil(text.length / 4);
}

/**
 * Parse model reference (provider/model)
 * @param {string} modelRef - Model reference string
 * @returns {Object} Parsed provider and model
 */
export function parseModelRef(modelRef) {
  if (!modelRef || typeof modelRef !== 'string') {
    throw new Error('Model reference must be a string');
  }

  if (modelRef.includes('/')) {
    const parts = modelRef.split('/');
    if (parts.length !== 2) {
      throw new Error('Model reference must be in format "provider/model"');
    }
    return {
      provider: parts[0],
      model: parts[1]
    };
  }

  throw new Error('Model reference must include provider (format: "provider/model")');
}

/**
 * Validate LLM configuration
 * @param {Object} config - Configuration object
 * @returns {Object} Validation result
 */
export function validateConfig(config) {
  const errors = [];
  const warnings = [];

  // Validate required fields
  if (!config.provider) {
    errors.push('Provider is required');
  }

  if (!config.model) {
    errors.push('Model is required');
  }

  // Validate provider-specific requirements
  if (config.provider === 'openai' && !config.apiKey && !process.env.OPENAI_API_KEY) {
    errors.push('OpenAI provider requires apiKey or OPENAI_API_KEY environment variable');
  }

  if (config.provider === 'anthropic' && !config.apiKey && !process.env.ANTHROPIC_API_KEY) {
    errors.push('Anthropic provider requires apiKey or ANTHROPIC_API_KEY environment variable');
  }

  if (config.provider === 'groq' && !config.apiKey && !process.env.GROQ_API_KEY) {
    errors.push('Groq provider requires apiKey or GROQ_API_KEY environment variable');
  }

  // Validate timeout
  if (config.timeout !== undefined) {
    if (typeof config.timeout !== 'number' || config.timeout <= 0) {
      errors.push('Timeout must be a positive number');
    }
  }

  // Validate thresholds
  if (config.contextWarningThreshold !== undefined) {
    if (typeof config.contextWarningThreshold !== 'number' || 
        config.contextWarningThreshold < 0 || 
        config.contextWarningThreshold > 1) {
      errors.push('Context warning threshold must be between 0 and 1');
    }
  }

  if (config.contextCriticalThreshold !== undefined) {
    if (typeof config.contextCriticalThreshold !== 'number' || 
        config.contextCriticalThreshold < 0 || 
        config.contextCriticalThreshold > 1) {
      errors.push('Context critical threshold must be between 0 and 1');
    }
  }

  // Validate fallback configuration
  if (config.fallback) {
    const fallbackValidation = validateConfig(config.fallback);
    if (fallbackValidation.errors.length > 0) {
      errors.push('Fallback configuration invalid: ' + fallbackValidation.errors.join(', '));
    }
  }

  // Warnings
  if (config.provider === 'ollama' && !config.host && !process.env.OLLAMA_HOST) {
    warnings.push('Ollama host not configured, using default localhost:11434');
  }

  if (config.maxRetries && config.maxRetries > 5) {
    warnings.push('High retry count may cause long delays');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Format model reference for display
 * @param {string} modelRef - Model reference
 * @returns {string} Formatted display name
 */
export function formatModelDisplay(modelRef) {
  try {
    const { provider, model } = parseModelRef(modelRef);
    return `${provider.charAt(0).toUpperCase() + provider.slice(1)} ${model}`;
  } catch {
    return modelRef;
  }
}

/**
 * Check if model supports capability
 * @param {string} modelRef - Model reference
 * @param {string} capability - Capability to check
 * @param {Object} models - Model registry
 * @returns {boolean} Whether model supports capability
 */
export function modelSupportsCapability(modelRef, capability, models = {}) {
  const modelConfig = models[modelRef];
  return modelConfig?.capabilities?.includes(capability) || false;
}

/**
 * Get models that support a capability
 * @param {string} capability - Capability to filter by
 * @param {Object} models - Model registry
 * @returns {Array} Array of model references
 */
export function getModelsForCapability(capability, models = {}) {
  return Object.entries(models)
    .filter(([_, config]) => config.capabilities?.includes(capability))
    .map(([ref]) => ref);
}

/**
 * Calculate cost estimate (if cost data available)
 * @param {number} tokens - Number of tokens
 * @param {string} modelRef - Model reference
 * @param {Object} pricing - Pricing data
 * @returns {number|null} Estimated cost in USD or null
 */
export function estimateCost(tokens, modelRef, pricing = {}) {
  const modelPricing = pricing[modelRef];
  if (!modelPricing || !tokens) return null;
  
  return (tokens / 1000) * modelPricing.per1k;
}

/**
 * Create request ID for tracking
 * @returns {string} Unique request ID
 */
export function createRequestId() {
  return `llm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sanitize sensitive information from logs
 * @param {Object} data - Data to sanitize
 * @returns {Object} Sanitized data
 */
export function sanitizeForLogging(data) {
  const sensitiveKeys = ['apiKey', 'api_key', 'token', 'password', 'secret'];
  const sanitized = { ...data };
  
  for (const key of sensitiveKeys) {
    if (sanitized[key]) {
      sanitized[key] = '***redacted***';
    }
  }
  
  return sanitized;
}

/**
 * Deep merge configuration objects
 * @param {Object} base - Base configuration
 * @param {Object} override - Override configuration
 * @returns {Object} Merged configuration
 */
export function mergeConfig(base, override) {
  const result = { ...base };
  
  for (const key in override) {
    if (override[key] !== null && typeof override[key] === 'object' && !Array.isArray(override[key])) {
      result[key] = mergeConfig(result[key] || {}, override[key]);
    } else {
      result[key] = override[key];
    }
  }
  
  return result;
}

export default {
  estimateTokens,
  parseModelRef,
  validateConfig,
  formatModelDisplay,
  modelSupportsCapability,
  getModelsForCapability,
  estimateCost,
  createRequestId,
  sanitizeForLogging,
  mergeConfig
};