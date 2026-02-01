/**
 * LLM Module - Multi-provider LLM support for StaticRebel
 * 
 * This module provides a unified interface for multiple LLM providers
 * with automatic fallback, health monitoring, and usage tracking.
 * 
 * Example usage:
 * ```js
 * import { createLLMManager } from './lib/llm/index.js';
 * 
 * const llm = createLLMManager({
 *   provider: 'ollama',
 *   model: 'llama3.2',
 *   fallback: {
 *     provider: 'groq',
 *     model: 'llama-3.1-70b'
 *   }
 * });
 * 
 * const response = await llm.chat('ollama/llama3.2', [
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * ```
 */

// Core exports
export { LLMManager, createLLMManager } from './LLMManager.js';

// Provider exports
export {
  BaseProvider,
  OllamaProvider,
  OpenAIProvider,
  AnthropicProvider,
  GroqProvider,
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
} from './providers/index.js';

// Utility functions
export {
  estimateTokens,
  parseModelRef,
  validateConfig
} from './utils.js';

/**
 * Quick setup function for common use cases
 */
export function setupLLM(config = {}) {
  // Default configuration for StaticRebel
  const defaultConfig = {
    provider: 'ollama',
    model: 'llama3.2',
    enableFallback: true,
    enableHealthChecks: true,
    fallbackChains: {
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
      ]
    }
  };

  const llmConfig = { ...defaultConfig, ...config };
  return createLLMManager(llmConfig);
}

// Default export
export default {
  LLMManager,
  createLLMManager,
  setupLLM,
  providers,
  DEFAULT_MODELS,
  FALLBACK_CHAINS
};