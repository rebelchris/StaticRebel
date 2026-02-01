/**
 * LLM Providers Index - Central registry for all LLM providers
 * 
 * Exports:
 * - Provider classes
 * - Provider registry
 * - Factory functions
 * - Configuration utilities
 */

import BaseProvider from './BaseProvider.js';
import OllamaProvider from './OllamaProvider.js';
import OpenAIProvider from './OpenAIProvider.js';
import AnthropicProvider from './AnthropicProvider.js';
import GroqProvider from './GroqProvider.js';

// ============================================================================
// Provider Registry
// ============================================================================

export const providers = {
  ollama: OllamaProvider,
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  groq: GroqProvider,
};

// ============================================================================
// Provider Factory
// ============================================================================

/**
 * Create a provider instance by name
 * @param {string} name - Provider name
 * @param {Object} options - Provider options
 * @returns {BaseProvider} Provider instance
 */
export function createProvider(name, options = {}) {
  const ProviderClass = providers[name];
  
  if (!ProviderClass) {
    throw new Error(`Unknown provider: ${name}. Available: ${Object.keys(providers).join(', ')}`);
  }

  return new ProviderClass(options);
}

/**
 * Create multiple providers from configuration
 * @param {Object} config - Provider configurations
 * @returns {Map} Map of provider instances
 */
export function createProviders(config = {}) {
  const instances = new Map();

  for (const [name, options] of Object.entries(config)) {
    if (providers[name]) {
      try {
        const instance = createProvider(name, options);
        instances.set(name, instance);
      } catch (error) {
        console.warn(`Failed to create ${name} provider: ${error.message}`);
      }
    }
  }

  return instances;
}

// ============================================================================
// Auto-detection & Environment Setup
// ============================================================================

/**
 * Detect available providers based on environment variables
 * @returns {Object} Available provider configurations
 */
export function detectAvailableProviders() {
  const available = {};

  // Always include Ollama (local)
  available.ollama = {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434'
  };

  // OpenAI
  if (process.env.OPENAI_API_KEY) {
    available.openai = {
      apiKey: process.env.OPENAI_API_KEY,
      organization: process.env.OPENAI_ORG_ID
    };
  }

  // Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    available.anthropic = {
      apiKey: process.env.ANTHROPIC_API_KEY
    };
  }

  // Groq
  if (process.env.GROQ_API_KEY) {
    available.groq = {
      apiKey: process.env.GROQ_API_KEY
    };
  }

  return available;
}

/**
 * Create providers automatically from environment
 * @returns {Map} Map of available provider instances
 */
export function createAvailableProviders() {
  const config = detectAvailableProviders();
  return createProviders(config);
}

// ============================================================================
// Default Model Configurations
// ============================================================================

export const DEFAULT_MODELS = {
  // Ollama models
  'ollama/llama3.2': {
    provider: 'ollama',
    model: 'llama3.2',
    name: 'Llama 3.2',
    contextWindow: 128000,
    capabilities: ['chat', 'general'],
    cost: 'free'
  },
  'ollama/qwen3-coder': {
    provider: 'ollama', 
    model: 'qwen3-coder:latest',
    name: 'Qwen 3 Coder',
    contextWindow: 128000,
    capabilities: ['chat', 'coding'],
    cost: 'free'
  },
  'ollama/deepseek-r1': {
    provider: 'ollama',
    model: 'deepseek-r1:32b',
    name: 'DeepSeek R1',
    contextWindow: 128000,
    capabilities: ['chat', 'reasoning'],
    cost: 'free'
  },
  'ollama/nomic-embed-text': {
    provider: 'ollama',
    model: 'nomic-embed-text',
    name: 'Nomic Embeddings',
    contextWindow: 2048,
    capabilities: ['embeddings'],
    cost: 'free'
  },

  // OpenAI models
  'openai/gpt-4o': {
    provider: 'openai',
    model: 'gpt-4o',
    name: 'GPT-4o',
    contextWindow: 128000,
    capabilities: ['chat', 'general', 'vision'],
    cost: 'paid'
  },
  'openai/gpt-4-turbo': {
    provider: 'openai',
    model: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    contextWindow: 128000,
    capabilities: ['chat', 'general', 'reasoning'],
    cost: 'paid'
  },
  'openai/gpt-3.5-turbo': {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    contextWindow: 16385,
    capabilities: ['chat', 'general'],
    cost: 'paid'
  },
  'openai/text-embedding-3-small': {
    provider: 'openai',
    model: 'text-embedding-3-small',
    name: 'Text Embedding 3 Small',
    contextWindow: 8191,
    capabilities: ['embeddings'],
    cost: 'paid'
  },

  // Anthropic models
  'anthropic/claude-3-5-sonnet': {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    contextWindow: 200000,
    capabilities: ['chat', 'general', 'reasoning'],
    cost: 'paid'
  },
  'anthropic/claude-3-5-haiku': {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    contextWindow: 200000,
    capabilities: ['chat', 'fast'],
    cost: 'paid'
  },
  'anthropic/claude-3-opus': {
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    contextWindow: 200000,
    capabilities: ['chat', 'reasoning', 'creative'],
    cost: 'paid'
  },

  // Groq models
  'groq/llama-3.1-405b': {
    provider: 'groq',
    model: 'llama-3.1-405b-reasoning',
    name: 'Llama 3.1 405B',
    contextWindow: 131072,
    capabilities: ['chat', 'reasoning'],
    cost: 'paid'
  },
  'groq/llama-3.1-70b': {
    provider: 'groq',
    model: 'llama-3.1-70b-versatile',
    name: 'Llama 3.1 70B',
    contextWindow: 131072,
    capabilities: ['chat', 'general'],
    cost: 'paid'
  },
  'groq/llama-3.1-8b': {
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B',
    contextWindow: 131072,
    capabilities: ['chat', 'fast'],
    cost: 'paid'
  },
};

// ============================================================================
// Fallback Chains
// ============================================================================

export const FALLBACK_CHAINS = {
  general: [
    'ollama/llama3.2',
    'groq/llama-3.1-70b',
    'openai/gpt-4o',
    'anthropic/claude-3-5-sonnet'
  ],
  
  coding: [
    'ollama/qwen3-coder',
    'groq/llama-3.1-70b',
    'openai/gpt-4-turbo',
    'anthropic/claude-3-5-sonnet'
  ],
  
  reasoning: [
    'ollama/deepseek-r1',
    'groq/llama-3.1-405b',
    'anthropic/claude-3-opus',
    'openai/gpt-4-turbo'
  ],
  
  fast: [
    'ollama/llama3.2',
    'groq/llama-3.1-8b',
    'anthropic/claude-3-5-haiku',
    'openai/gpt-3.5-turbo'
  ],
  
  embeddings: [
    'ollama/nomic-embed-text',
    'openai/text-embedding-3-small'
  ],

  creative: [
    'anthropic/claude-3-opus',
    'openai/gpt-4o',
    'groq/llama-3.1-70b',
    'ollama/llama3.2'
  ]
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get models by capability
 * @param {string} capability - Capability to filter by
 * @returns {Array} Array of model configurations
 */
export function getModelsByCapability(capability) {
  return Object.entries(DEFAULT_MODELS)
    .filter(([_, config]) => config.capabilities.includes(capability))
    .map(([ref, config]) => ({ ref, ...config }));
}

/**
 * Get fallback chain for task/capability
 * @param {string} taskOrCapability - Task or capability name
 * @returns {Array} Array of model references
 */
export function getFallbackChain(taskOrCapability) {
  return FALLBACK_CHAINS[taskOrCapability] || FALLBACK_CHAINS.general;
}

/**
 * Check provider availability
 * @param {string} providerName - Provider name
 * @returns {boolean} Whether provider is available
 */
export function isProviderAvailable(providerName) {
  const available = detectAvailableProviders();
  return available.hasOwnProperty(providerName);
}

/**
 * Get recommended model for task
 * @param {string} task - Task name
 * @param {Array} availableProviders - Available provider names
 * @returns {string|null} Model reference or null
 */
export function getRecommendedModel(task, availableProviders = []) {
  const chain = getFallbackChain(task);
  
  for (const modelRef of chain) {
    const [provider] = modelRef.split('/');
    if (availableProviders.includes(provider)) {
      return modelRef;
    }
  }
  
  return null;
}

// ============================================================================
// Exports
// ============================================================================

export {
  BaseProvider,
  OllamaProvider,
  OpenAIProvider, 
  AnthropicProvider,
  GroqProvider
};

export default {
  providers,
  createProvider,
  createProviders,
  detectAvailableProviders,
  createAvailableProviders,
  DEFAULT_MODELS,
  FALLBACK_CHAINS,
  getModelsByCapability,
  getFallbackChain,
  isProviderAvailable,
  getRecommendedModel
};