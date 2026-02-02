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

// Default export
import { LLMManager } from './LLMManager.js';

export default {
  LLMManager,
  createLLMManager,
  setupLLM,
  providers,
  DEFAULT_MODELS,
  FALLBACK_CHAINS
};